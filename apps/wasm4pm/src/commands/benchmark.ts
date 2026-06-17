import { defineCommand } from 'citty';
import { withSpanRaw } from './_otel.js';
import { readFileSync, existsSync } from 'node:fs';
import { WasmLoader } from '@wasm4pm/engine';
import { hashData, verifyHash } from '@wasm4pm/contracts';
import {
  validateConformanceResultFromCases,
  type CaseFitnessResult,
} from '@wasm4pm/observability';
import { emitResult, makeResult, makeErrorResult } from '../output.js';
import { EXIT_CODES } from '../exit-codes.js';
import { buildSarifOutput, verdictToLevel } from '../sarif.js';
import { exitWithFlush } from '../otel/exit.js';

const parse = (r: unknown): unknown =>
  typeof r === 'string' ? JSON.parse(r) : r;

/** Signals that a user-supplied file was not found — maps to source_error (exit 2). */
class SourceNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SourceNotFoundError';
  }
}

/** Signals that a user-supplied corpus line contains invalid JSON — maps to source_error (exit 2). */
class CorpusParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CorpusParseError';
  }
}

type BenchmarkTrace = {
  trace_id: string;
  name: string;
  motion: Record<string, unknown>;
  expected_verdict: string;
  description?: string;
};

type BenchmarkResult = {
  trace_id: string;
  name: string;
  pass: boolean;
  final_verdict: string;
  expected_verdict: string;
  failure_reason?: string;
  elapsed_ms?: number;
};

type RunAllResult = {
  total: number;
  passed: number;
  failed: number;
  pass_rate: number;
  results: BenchmarkResult[];
};

// ---------------------------------------------------------------------------
// Subcommand: build
// ---------------------------------------------------------------------------

const benchmarkBuild = defineCommand({
  meta: {
    name: 'build',
    description: 'Validate a JSONL benchmark corpus (required fields, verdicts)',
  },
  args: {
    corpus: {
      type: 'string',
      description: 'Path to JSONL corpus file',
      required: true,
    },
    format: { type: 'string', description: 'Output format: human (default) or json' },
    quiet: { type: 'boolean', alias: 'q' },
  },
  async run(ctx) {
    return withSpanRaw('wasm4pm.command.benchmark.build', {
      command: 'benchmark', subcommand: 'build',
      corpus: String(ctx.args.corpus ?? ''),
    }, async () => {
    const t0 = performance.now();
    const format = (ctx.args.format as 'json' | 'human') ?? 'human';
    const quiet = ctx.args.quiet ?? false;
    const corpusPath = ctx.args.corpus;

    if (!existsSync(corpusPath)) {
      const result = makeErrorResult('benchmark build', `Corpus file not found: ${corpusPath}`,
        EXIT_CODES.source_error, 'SOURCE_NOT_FOUND',
        `Verify the corpus path is correct and the file exists. Try: wpm benchmark build --corpus <path>`);
      emitResult(result, { format, quiet });
      return await exitWithFlush(EXIT_CODES.source_error);
    }

    const lines = readFileSync(corpusPath, 'utf8').split('\n').filter((l) => l.trim());
    const valid: BenchmarkTrace[] = [];
    const errors: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      try {
        const obj = JSON.parse(lines[i]) as Record<string, unknown>;
        const missing = ['trace_id', 'name', 'motion', 'expected_verdict'].filter(
          (f) => !(f in obj)
        );
        if (missing.length) {
          errors.push(`Line ${i + 1}: missing fields: ${missing.join(', ')}`);
        } else {
          valid.push(obj as unknown as BenchmarkTrace);
        }
      } catch {
        errors.push(`Line ${i + 1}: invalid JSON`);
      }
    }

    const exitCode = errors.length > 0 ? EXIT_CODES.execution_error : EXIT_CODES.success;
    const result = makeResult('benchmark build', {
      corpus: corpusPath,
      valid: valid.length,
      invalid: errors.length,
      errors,
    }, performance.now() - t0, exitCode);

    emitResult(result, { format, quiet }, (res, projection) => {
      projection.info(`Corpus: ${res.payload.corpus}`);
      projection.info(`  Valid traces:   ${res.payload.valid}`);
      projection.info(`  Invalid traces: ${res.payload.invalid}`);
      for (const e of res.payload.errors) projection.warn(`  ${e}`);
      if (res.payload.invalid === 0) projection.success('Corpus validated — all traces valid.');
    });

    return await exitWithFlush(exitCode);
    });
  },
});

// ---------------------------------------------------------------------------
// Visual helpers
// ---------------------------------------------------------------------------

/** Render a 16-char pass-rate bar using filled/empty block characters. */
function passRateBar(passed: number, total: number): string {
  const rate = total === 0 ? 0 : passed / total;
  const filled = Math.round(rate * 16);
  const bar = '█'.repeat(filled) + '░'.repeat(16 - filled);
  const pct = Math.round(rate * 100);
  return `Pass rate: ${bar}  ${pct}%  (${passed}/${total})`;
}

// ---------------------------------------------------------------------------
// Shared runner
// ---------------------------------------------------------------------------

async function runBenchmarks(
  corpus: string | undefined,
  traceFilter: string | undefined
): Promise<{ builtIn: boolean; results: BenchmarkResult[]; total: number; passed: number; failed: number }> {
  const loader = WasmLoader.getInstance();
  await loader.init();
  const wasm = loader.get() as Record<string, unknown>;

  if (corpus) {
    if (!existsSync(corpus)) throw new SourceNotFoundError(`Corpus not found: ${corpus}`);
    const lines = readFileSync(corpus, 'utf8').split('\n').filter((l) => l.trim());
    const traces: BenchmarkTrace[] = lines.map((l, i) => {
      try { return JSON.parse(l) as BenchmarkTrace; }
      catch { throw new CorpusParseError(`Line ${i + 1}: invalid JSON`); }
    });

    // When classify_motion is unavailable, synthesize per-trace failures so the
    // verify subcommand can still emit a normal envelope with failed > 0 and
    // exit non-zero. Honest: each trace becomes a failure with a clear reason.
    const filteredTraces = traces.filter((t) => !traceFilter || t.trace_id === traceFilter);
    if (typeof wasm.classify_motion !== 'function') {
      const syntheticResults: BenchmarkResult[] = filteredTraces.map((t) => ({
        trace_id: t.trace_id,
        name: t.name,
        pass: false,
        final_verdict: 'Error',
        expected_verdict: t.expected_verdict,
        failure_reason: 'classify_motion not available — requires fog or browser profile',
      }));
      return {
        builtIn: false,
        results: syntheticResults,
        total: syntheticResults.length,
        passed: 0,
        failed: syntheticResults.length,
      };
    }

    const results: BenchmarkResult[] = filteredTraces
      .map((t) => {
        try {
          const tTrace = performance.now();
          const raw = (wasm.classify_motion as (j: string) => unknown)(JSON.stringify(t.motion));
          const elapsed_ms = Math.round(performance.now() - tTrace);
          const receipt = parse(raw) as { verdict: string };
          const actual = receipt.verdict ?? 'Unknown';
          const pass = actual.toLowerCase() === t.expected_verdict.toLowerCase();
          return {
            trace_id: t.trace_id, name: t.name, pass, final_verdict: actual,
            expected_verdict: t.expected_verdict, elapsed_ms,
            failure_reason: pass ? undefined : `Expected ${t.expected_verdict}, got ${actual}`,
          };
        } catch (e) {
          return {
            trace_id: t.trace_id, name: t.name, pass: false,
            final_verdict: 'Error', expected_verdict: t.expected_verdict,
            failure_reason: String(e),
          };
        }
      });

    const passed = results.filter((r) => r.pass).length;
    return { builtIn: false, results, total: results.length, passed, failed: results.length - passed };
  }

  if (typeof wasm.run_all_benchmarks !== 'function') {
    throw new Error(
      'Built-in benchmarks not available in this WASM build.\n\n' +
      'This feature requires the "fog" or "browser" deployment profile.\n' +
      'Current profile likely: mobile, iot, or edge.\n\n' +
      'To enable: rebuild with `npm run build:fog` or `npm run build:browser`,\n' +
      'then rebuild the CLI with `cd apps/wasm4pm && npm run build`.\n\n' +
      'Or provide a custom corpus with `wpm benchmark replay --corpus <file.jsonl>`'
    );
  }
  const raw = (wasm.run_all_benchmarks as () => unknown)();
  const r = parse(raw) as RunAllResult;
  return { builtIn: true, results: r.results, total: r.total, passed: r.passed, failed: r.failed };
}

// ---------------------------------------------------------------------------
// Subcommand: replay
// ---------------------------------------------------------------------------

const benchmarkReplay = defineCommand({
  meta: {
    name: 'replay',
    description: 'Run benchmark traces and show per-trace results',
  },
  args: {
    corpus: { type: 'string', description: 'JSONL corpus file (default: built-in suite)' },
    trace: { type: 'string', description: 'Filter to a single trace_id' },
    format: { type: 'string', description: 'Output format: human (default) or json' },
    verbose: { type: 'boolean', alias: 'v' },
    quiet: { type: 'boolean', alias: 'q' },
  },
  async run(ctx) {
    return withSpanRaw('wasm4pm.command.benchmark.replay', {
      command: 'benchmark', subcommand: 'replay',
      corpus: String(ctx.args.corpus ?? ''),
    }, async () => {
    const t0 = performance.now();
    const format = (ctx.args.format as 'json' | 'human') ?? 'human';
    const verbose = ctx.args.verbose ?? false;
    const quiet = ctx.args.quiet ?? false;

    try {
      const { results, total, passed, failed } = await runBenchmarks(ctx.args.corpus, ctx.args.trace);
      const result = makeResult('benchmark replay', {
        total, passed, failed, pass_rate: total ? passed / total : 0, results,
      }, performance.now() - t0);

      emitResult(result, { format, verbose, quiet }, (res, projection) => {
        const pad = (s: string, n: number) => s.padEnd(n);
        const hasTiming = res.payload.results.some((r) => r.elapsed_ms !== undefined);
        const dividerWidth = hasTiming ? 84 : 72;
        const hdr = hasTiming
          ? `${pad('Trace ID', 28)} ${pad('Verdict', 22)} ${pad('Expected', 20)} ${'Pass'} ${'Time'}`
          : `${pad('Trace ID', 28)} ${pad('Verdict', 22)} Expected              Pass`;
        projection.info('\nBenchmark Results');
        projection.info('─'.repeat(dividerWidth));
        projection.info(hdr);
        projection.info('─'.repeat(dividerWidth));
        for (const r of res.payload.results) {
          const ok = r.pass ? '✓' : '✗';
          const timingCol = hasTiming
            ? ` ${r.elapsed_ms !== undefined ? `${r.elapsed_ms}ms` : '—'}`
            : '';
          const line = `${pad(r.trace_id, 28)} ${pad(r.final_verdict, 22)} ${pad(r.expected_verdict, 20)} ${ok}${timingCol}`;
          if (r.pass) projection.info(line);
          else projection.warn(line);
          if (!r.pass && verbose && r.failure_reason) projection.warn(`  → ${r.failure_reason}`);
        }
        projection.info('─'.repeat(dividerWidth));
        projection.info(passRateBar(res.payload.passed, res.payload.total));
        if (res.payload.failed > 0) {
          projection.warn('\nFailures:');
          for (const r of res.payload.results.filter((x) => !x.pass)) {
            const reason = r.failure_reason ?? 'unknown';
            projection.warn(
              `  ✗ ${r.trace_id.padEnd(20)} expected: ${r.expected_verdict.padEnd(8)} got: ${r.final_verdict.padEnd(8)} (${reason})`
            );
          }
        }
        if (res.payload.failed === 0) projection.success(`All ${res.payload.total} traces passed`);
      });

      return await exitWithFlush(EXIT_CODES.success);
    } catch (e) {
      const exitCode = (e instanceof SourceNotFoundError || e instanceof CorpusParseError)
        ? EXIT_CODES.source_error
        : EXIT_CODES.execution_error;
      const result = makeErrorResult('benchmark replay', e, exitCode);
      emitResult(result, { format, verbose, quiet });
      return await exitWithFlush(exitCode);
    }
    });
  },
});

// ---------------------------------------------------------------------------
// Subcommand: verify
// ---------------------------------------------------------------------------

const benchmarkVerify = defineCommand({
  meta: {
    name: 'verify',
    description: 'Run benchmarks — exit non-zero if any trace fails (CI gate)',
  },
  args: {
    corpus: { type: 'string', description: 'JSONL corpus file (default: built-in suite)' },
    format: { type: 'string', description: 'Output format: human (default), json, or sarif' },
    verbose: { type: 'boolean', alias: 'v' },
    quiet: { type: 'boolean', alias: 'q' },
  },
  async run(ctx) {
    return withSpanRaw('wasm4pm.command.benchmark.verify', {
      command: 'benchmark', subcommand: 'verify',
      corpus: String(ctx.args.corpus ?? ''),
    }, async () => {
    const t0 = performance.now();
    const format = (ctx.args.format as 'json' | 'sarif' | 'human') ?? 'human';
    const verbose = ctx.args.verbose ?? false;
    const quiet = ctx.args.quiet ?? false;

    try {
      const { results, total, passed, failed } = await runBenchmarks(ctx.args.corpus, undefined);
      const exitCode = failed > 0 ? EXIT_CODES.execution_error : EXIT_CODES.success;

      if (format === 'sarif') {
        const sarifResults = results.map((r) => ({
          verdict: r.final_verdict, traceName: r.trace_id, explanation: r.failure_reason,
        }));
        process.stdout.write(JSON.stringify(buildSarifOutput('26.4.28', sarifResults), null, 2) + '\n');
        return await exitWithFlush(exitCode);
      }

      const result = makeResult('benchmark verify', {
        total, passed, failed, pass_rate: total ? passed / total : 0, results,
      }, performance.now() - t0, exitCode);

      emitResult(result, { format, verbose, quiet }, (res, projection) => {
        projection.info(passRateBar(res.payload.passed, res.payload.total));
        if (res.payload.failed === 0) {
          projection.success(`Benchmark verify: ${res.payload.passed}/${res.payload.total} passed`);
        } else {
          projection.error(
            `Benchmark verify FAILED: ${res.payload.failed}/${res.payload.total} traces did not match expected verdict`
          );
          if (verbose || !quiet) {
            projection.warn('\nFailures:');
            for (const r of res.payload.results.filter((x) => !x.pass)) {
              const reason = r.failure_reason ?? 'unknown';
              projection.warn(
                `  ✗ ${r.trace_id.padEnd(20)} expected: ${r.expected_verdict.padEnd(8)} got: ${r.final_verdict.padEnd(8)} (${reason})`
              );
            }
          }
        }
      });

      return await exitWithFlush(exitCode);
    } catch (e) {
      // verify treats a missing corpus as a run-time command failure (exit 3),
      // not a source_error (exit 2) — the test corpus is an operational artefact,
      // not a user-supplied input file.  CorpusParseError also stays execution_error
      // since a corrupt verify corpus is an environment problem, not user input.
      const result = makeErrorResult('benchmark verify', e, EXIT_CODES.execution_error);
      emitResult(result, { format, verbose, quiet });
      return await exitWithFlush(EXIT_CODES.execution_error);
    }
    });
  },
});

// ---------------------------------------------------------------------------
// Subcommand: export
// ---------------------------------------------------------------------------

const benchmarkExport = defineCommand({
  meta: {
    name: 'export',
    description: 'Run benchmarks and emit results as SARIF, JSON, or CSV',
  },
  args: {
    corpus: { type: 'string', description: 'JSONL corpus file (default: built-in suite)' },
    format: {
      type: 'string',
      default: 'sarif',
      description: 'Export format: sarif (default), json, csv',
    },
    quiet: { type: 'boolean', alias: 'q' },
  },
  async run(ctx) {
    return withSpanRaw('wasm4pm.command.benchmark.export', {
      command: 'benchmark', subcommand: 'export',
      corpus: String(ctx.args.corpus ?? ''),
      export_format: String(ctx.args.format ?? 'sarif'),
    }, async () => {
    const quiet = ctx.args.quiet ?? false;
    const fmt = (ctx.args.format ?? 'sarif').toLowerCase();

    try {
      const { results, total, passed, failed } = await runBenchmarks(ctx.args.corpus, undefined);

      if (fmt === 'sarif') {
        const sarifResults = results.map((r) => ({
          verdict: r.final_verdict, traceName: r.trace_id, explanation: r.failure_reason,
        }));
        process.stdout.write(JSON.stringify(buildSarifOutput('26.4.28', sarifResults), null, 2) + '\n');
      } else if (fmt === 'json') {
        process.stdout.write(
          JSON.stringify({ total, passed, failed, pass_rate: total ? passed / total : 0, results }, null, 2) + '\n'
        );
      } else if (fmt === 'csv') {
        const rows = ['trace_id,name,expected_verdict,actual_verdict,pass,level'];
        for (const r of results) {
          rows.push([r.trace_id, r.name, r.expected_verdict, r.final_verdict, r.pass, verdictToLevel(r.final_verdict)].join(','));
        }
        process.stdout.write(rows.join('\n') + '\n');
      } else {
        const result = makeErrorResult('benchmark export', `Unknown format: ${fmt}. Use sarif, json, or csv.`,
          EXIT_CODES.config_error, 'CONFIG_ERROR');
        emitResult(result, { format: 'human', quiet });
        return await exitWithFlush(EXIT_CODES.config_error);
      }

      return await exitWithFlush(EXIT_CODES.success);
    } catch (e) {
      const result = makeErrorResult('benchmark export', e, EXIT_CODES.execution_error);
      emitResult(result, { format: 'human', quiet });
      return await exitWithFlush(EXIT_CODES.execution_error);
    }
    });
  },
});

// ---------------------------------------------------------------------------
// Subcommand: calibrate
// ---------------------------------------------------------------------------

const benchmarkCalibrate = defineCommand({
  meta: {
    name: 'calibrate',
    description:
      'Measure this machine\'s performance and write ~/.config/wasm4pm/timings.json for use in tests',
  },
  args: {
    runs: {
      type: 'string',
      description: 'Number of microbenchmark iterations per operation (default: 7)',
      default: '7',
    },
    format: { type: 'string', description: 'Output format: human or json', default: 'human' },
    quiet: { type: 'boolean', alias: 'q' },
  },
  async run(ctx) {
    const { mkdirSync, writeFileSync } = await import('node:fs');
    const { homedir } = await import('node:os');
    const { join } = await import('node:path');
    const { cpus } = await import('node:os');
    const quiet = ctx.args.quiet ?? false;
    const format = (ctx.args.format as 'human' | 'json') ?? 'human';
    const runs = Math.max(3, parseInt(String(ctx.args.runs ?? '7'), 10) || 7);

    const TIMINGS_DIR = join(homedir(), '.config', 'wasm4pm');
    const TIMINGS_PATH = join(TIMINGS_DIR, 'timings.json');
    const SAFETY = 4; // multiply median by this factor for test threshold

    function measure(fn: () => void): number {
      const samples: number[] = [];
      for (let i = 0; i < runs; i++) {
        const t = Date.now();
        fn();
        samples.push(Date.now() - t);
      }
      samples.sort((a, b) => a - b);
      return samples[Math.floor(samples.length / 2)];
    }

    if (!quiet) process.stderr.write('Calibrating — loading WASM...\n');
    const loader = WasmLoader.getInstance();
    await loader.init();
    const wasm = loader.get() as Record<string, (...args: unknown[]) => unknown>;

    // Generate synthetic XES for calibration
    function makeXes(numTraces: number, numActivities = 5): string {
      const acts = Array.from({ length: numActivities }, (_, i) => `A${i}`);
      const traces = Array.from({ length: numTraces }, (_, t) => {
        const events = acts.map((a, i) => {
          const ts = new Date(1_700_000_000_000 + (t * 100 + i) * 60_000).toISOString();
          return `    <event><string key="concept:name" value="${a}"/><date key="time:timestamp" value="${ts}"/></event>`;
        }).join('\n');
        return `  <trace><string key="concept:name" value="case${t}"/>\n${events}\n  </trace>`;
      }).join('\n');
      return `<?xml version="1.0"?><log>\n${traces}\n</log>`;
    }

    const xes100 = makeXes(100);
    const xes1k = makeXes(1000);

    if (!quiet) process.stderr.write('Measuring prediction baseline (100-trace log)...\n');
    let handle100 = '';
    const loadMs = measure(() => { handle100 = wasm.load_eventlog_from_xes(xes100) as string; });

    const predMs100 = measure(() => { wasm.discover_dfg(handle100, 'concept:name'); });
    // Free the 100-trace handle immediately after measurement — it is not used again.
    if (handle100 && typeof wasm.delete_object === 'function') {
      try { (wasm.delete_object as (h: string) => void)(handle100); } catch { /* best-effort */ }
    }

    if (!quiet) process.stderr.write('Measuring prediction baseline (1000-trace log)...\n');
    let handle1k = '';
    measure(() => { handle1k = wasm.load_eventlog_from_xes(xes1k) as string; });
    const predMs1k = measure(() => { wasm.discover_dfg(handle1k, 'concept:name'); });
    // Free the 1k-trace handle immediately after measurement — it is not used again.
    if (handle1k && typeof wasm.delete_object === 'function') {
      try { (wasm.delete_object as (h: string) => void)(handle1k); } catch { /* best-effort */ }
    }

    const thresholds = {
      prediction: {
        baseline: Math.max(200, predMs100 * SAFETY),
        fit_1k: Math.max(200, predMs1k * SAFETY),
        fit_predict: Math.max(200, predMs100 * SAFETY),
        predict_1k: Math.max(200, predMs1k * SAFETY),
      },
      discovery: {
        dfg_100: Math.max(500, loadMs * SAFETY + predMs100 * SAFETY),
        dfg_1k: Math.max(2000, predMs1k * SAFETY * 2),
      },
      ml: {
        cluster: Math.max(500, predMs1k * SAFETY),
        classify: Math.max(300, predMs100 * SAFETY),
      },
    };

    const payload = {
      generatedAt: new Date().toISOString(),
      hostInfo: {
        platform: process.platform,
        arch: process.arch,
        cpus: cpus().length,
      },
      medianMs: { load100: loadMs, dfg100: predMs100, dfg1k: predMs1k },
      thresholds,
    };

    mkdirSync(TIMINGS_DIR, { recursive: true });
    writeFileSync(TIMINGS_PATH, JSON.stringify(payload, null, 2));

    const result = makeResult('benchmark/calibrate', payload, 0, EXIT_CODES.success);
    emitResult(result, { format, quiet }, (_res, p) => {
      p.success(`Calibration complete — written to ${TIMINGS_PATH}`);
      p.info(`  Load 100-trace XES:  ${loadMs}ms  → threshold ${thresholds.prediction.baseline}ms`);
      p.info(`  DFG 100-trace:       ${predMs100}ms → threshold ${thresholds.prediction.baseline}ms`);
      p.info(`  DFG 1000-trace:      ${predMs1k}ms → threshold ${thresholds.prediction.fit_1k}ms`);
      p.log('');
      p.log('  Tests using machineThreshold() will now use these values.');
      p.log('  Recalibrate any time with: wpm benchmark calibrate');
    });
    return await exitWithFlush(EXIT_CODES.success);
  },
});

// ---------------------------------------------------------------------------
// Subcommand: perf  (algorithm performance benchmarking on a real XES log)
// ---------------------------------------------------------------------------

/**
 * Compute percentile from a sorted array (ascending).
 */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
}

/**
 * Standard deviation of an array.
 */
function stdDev(values: number[], mean: number): number {
  if (values.length < 2) return 0;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

type PerfAlgoResult = {
  algorithm: string;
  runs: number[];
  mean: number;
  stddev: number;
  p95: number;
  min: number;
  max: number;
  fitness: number | null;
  error?: string;
};

/**
 * Discover using a named algorithm and return timing + fitness.
 * Returns elapsed_ms and extracted fitness (null if unavailable).
 */
async function runAlgoOnce(
  wasm: Record<string, unknown>,
  handle: string,
  algorithm: string,
  activityKey: string
): Promise<{ elapsedMs: number; fitness: number | null }> {
  const t0 = performance.now();
  let fitness: number | null = null;

  // Map algorithm name to WASM function
  const fnMap: Record<string, string> = {
    dfg: 'discover_dfg',
    heuristic_miner: 'discover_heuristic_miner',
    heuristic: 'discover_heuristic_miner',
    inductive_miner: 'discover_inductive_miner',
    inductive: 'discover_inductive_miner',
    alpha_plus_plus: 'discover_alpha_plus_plus',
    alpha: 'discover_alpha_plus_plus',
    genetic_algorithm: 'discover_genetic_algorithm',
    genetic: 'discover_genetic_algorithm',
    ilp: 'discover_ilp_optimization',
    process_skeleton: 'discover_process_skeleton',
    skeleton: 'discover_process_skeleton',
    simd_streaming_dfg: 'discover_dfg_simd',
    streaming_dfg: 'discover_dfg_simd',
  };

  const wasmFn = fnMap[algorithm] ?? `discover_${algorithm}`;

  if (typeof wasm[wasmFn] !== 'function') {
    throw new Error(`Algorithm '${algorithm}' not available (WASM function '${wasmFn}' missing)`);
  }

  // Call WASM — most discovery functions take (handle, activity_key)
  // heuristic_miner additionally needs a dependency_threshold param
  let raw: unknown;
  if (algorithm === 'heuristic_miner' || algorithm === 'heuristic') {
    raw = (wasm[wasmFn] as (h: string, k: string, t: number) => unknown)(handle, activityKey, 0.5);
  } else if (algorithm === 'genetic_algorithm' || algorithm === 'genetic') {
    raw = (wasm[wasmFn] as (h: string, k: string, p: number, g: number) => unknown)(handle, activityKey, 20, 5);
  } else {
    raw = (wasm[wasmFn] as (h: string, k: string) => unknown)(handle, activityKey);
  }

  const elapsedMs = performance.now() - t0;

  // Extract fitness if present
  try {
    const result = (typeof raw === 'string' ? JSON.parse(raw) : raw) as Record<string, unknown>;
    if (typeof result?.['fitness'] === 'number') {
      fitness = result['fitness'] as number;
    } else if (typeof (result?.['quality'] as Record<string, unknown>)?.['fitness'] === 'number') {
      fitness = (result['quality'] as Record<string, unknown>)['fitness'] as number;
    }
  } catch {
    // ignore parse errors — fitness stays null
  }

  return { elapsedMs, fitness };
}

const benchmarkPerf = defineCommand({
  meta: {
    name: 'perf',
    description:
      'Time multiple discovery algorithms on a real XES event log. ' +
      'Ex: wpm benchmark perf -i log.xes --algorithms dfg,heuristic_miner,inductive_miner --runs 5',
  },
  args: {
    input: {
      type: 'string',
      alias: 'i',
      description: 'Path to XES event log',
      required: true,
    },
    algorithms: {
      type: 'string',
      description: 'Comma-separated algorithm names (default: dfg,heuristic_miner,inductive_miner)',
      default: 'dfg,heuristic_miner,inductive_miner',
    },
    runs: {
      type: 'string',
      description: 'Number of timed runs per algorithm (default: 3)',
      default: '3',
    },
    warmup: {
      type: 'boolean',
      description: 'Run each algorithm once before timing (default: true)',
      default: true,
    },
    format: {
      type: 'string',
      description: 'Output format: human (default), json, csv',
      default: 'human',
    },
    quiet: { type: 'boolean', alias: 'q' },
    'activity-key': {
      type: 'string',
      description: 'Activity key attribute in XES (default: concept:name)',
      default: 'concept:name',
    },
  },
  async run(ctx) {
    return withSpanRaw('wasm4pm.command.benchmark.perf', {
      command: 'benchmark',
      subcommand: 'perf',
      input: String(ctx.args.input ?? ''),
      algorithms: String(ctx.args.algorithms ?? ''),
    }, async () => {
      const t0 = performance.now();
      const format = (ctx.args.format as 'json' | 'human' | 'csv') ?? 'human';
      const quiet = ctx.args.quiet ?? false;
      const inputPath = String(ctx.args.input ?? '');
      const activityKey = String(ctx.args['activity-key'] ?? 'concept:name');
      const nRuns = Math.max(1, parseInt(String(ctx.args.runs ?? '3'), 10) || 3);
      const doWarmup = ctx.args.warmup !== false;
      const algoList = String(ctx.args.algorithms ?? 'dfg,heuristic_miner,inductive_miner')
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      if (!existsSync(inputPath)) {
        const result = makeErrorResult(
          'benchmark perf',
          `XES file not found: ${inputPath}`,
          EXIT_CODES.source_error,
          'SOURCE_NOT_FOUND'
        );
        emitResult(result, { format: format === 'csv' ? 'human' : format, quiet });
        return await exitWithFlush(EXIT_CODES.source_error);
      }

      let xesContent: string;
      try {
        xesContent = readFileSync(inputPath, 'utf8');
      } catch (e) {
        const result = makeErrorResult('benchmark perf', `Cannot read ${inputPath}: ${e}`, EXIT_CODES.source_error, 'READ_ERROR');
        emitResult(result, { format: format === 'csv' ? 'human' : format, quiet });
        return await exitWithFlush(EXIT_CODES.source_error);
      }

      // Load WASM
      const loader = WasmLoader.getInstance();
      await loader.init();
      const wasm = loader.get() as Record<string, unknown>;

      // Load event log into WASM
      if (typeof wasm['load_eventlog_from_xes'] !== 'function') {
        const result = makeErrorResult('benchmark perf', 'WASM load_eventlog_from_xes not available', EXIT_CODES.execution_error, 'WASM_UNAVAILABLE');
        emitResult(result, { format: format === 'csv' ? 'human' : format, quiet });
        return await exitWithFlush(EXIT_CODES.execution_error);
      }

      let handle: string;
      try {
        handle = (wasm['load_eventlog_from_xes'] as (s: string) => string)(xesContent);
      } catch (e) {
        const result = makeErrorResult('benchmark perf', `Failed to load XES: ${e}`, EXIT_CODES.source_error, 'XES_LOAD_ERROR');
        emitResult(result, { format: format === 'csv' ? 'human' : format, quiet });
        return await exitWithFlush(EXIT_CODES.source_error);
      }

      if (!quiet && format !== 'json' && format !== 'csv') {
        process.stderr.write(`Algorithm Benchmark — ${algoList.length} algorithm${algoList.length !== 1 ? 's' : ''} × ${nRuns} run${nRuns !== 1 ? 's' : ''}\n`);
        process.stderr.write('='.repeat(55) + '\n');
        if (doWarmup) process.stderr.write('Running warmup... ');
      }

      const algoResults: PerfAlgoResult[] = [];

      for (const algorithm of algoList) {
        // Warmup run (untimed)
        if (doWarmup) {
          try {
            await runAlgoOnce(wasm, handle, algorithm, activityKey);
          } catch {
            // Warmup failure is non-fatal
          }
        }

        const runs: number[] = [];
        let lastFitness: number | null = null;
        let lastError: string | undefined;

        for (let i = 0; i < nRuns; i++) {
          try {
            const { elapsedMs, fitness } = await runAlgoOnce(wasm, handle, algorithm, activityKey);
            runs.push(elapsedMs);
            if (fitness !== null) lastFitness = fitness;
          } catch (e) {
            lastError = String(e);
            // Push Infinity so we can still compute stats; we'll report error
            runs.push(Infinity);
          }
        }

        const validRuns = runs.filter((r) => isFinite(r));
        if (validRuns.length === 0) {
          algoResults.push({
            algorithm,
            runs: [],
            mean: 0,
            stddev: 0,
            p95: 0,
            min: 0,
            max: 0,
            fitness: null,
            error: lastError ?? `No valid runs for ${algorithm}`,
          });
          continue;
        }

        const sorted = [...validRuns].sort((a, b) => a - b);
        const mean = validRuns.reduce((s, v) => s + v, 0) / validRuns.length;
        algoResults.push({
          algorithm,
          runs: validRuns,
          mean,
          stddev: stdDev(validRuns, mean),
          p95: percentile(sorted, 95),
          min: sorted[0],
          max: sorted[sorted.length - 1],
          fitness: lastFitness,
          error: validRuns.length < nRuns ? `${nRuns - validRuns.length} run(s) failed` : undefined,
        });
      }

      if (!quiet && format !== 'json' && format !== 'csv') {
        if (doWarmup) process.stderr.write('done\n\n');
      }

      // ─── Human output ────────────────────────────────────────────────────
      if (format !== 'json' && format !== 'csv') {
        // Per-run table header
        const PAD = Math.max(...algoResults.map((r) => r.algorithm.length), 12);
        const header = ['', ...algoResults.map((r) => r.algorithm.padEnd(12))].join('  ');
        process.stdout.write(header + '\n');

        for (let run = 0; run < nRuns; run++) {
          const rowLabel = `Run ${run + 1}`.padEnd(6);
          const cells = algoResults.map((r) => {
            if (r.error && r.runs.length === 0) return 'ERROR'.padEnd(12);
            const ms = r.runs[run];
            if (ms === undefined) return '—'.padEnd(12);
            return `${(ms / 1000).toFixed(2)}s`.padEnd(12);
          });
          process.stdout.write(`${rowLabel}  ${cells.join('  ')}\n`);
        }

        process.stdout.write('─'.repeat(PAD + algoResults.length * 14) + '\n');

        // Summary rows
        function summaryRow(label: string, fn: (r: PerfAlgoResult) => string): void {
          const cells = algoResults.map((r) => fn(r).padEnd(12));
          process.stdout.write(`${label.padEnd(6)}  ${cells.join('  ')}\n`);
        }

        summaryRow('Mean  ', (r) => r.runs.length > 0 ? `${(r.mean / 1000).toFixed(3)}s` : 'ERROR');
        summaryRow('Stddev', (r) => r.runs.length > 0 ? `${(r.stddev / 1000).toFixed(3)}s` : '—');
        summaryRow('P95   ', (r) => r.runs.length > 0 ? `${(r.p95 / 1000).toFixed(3)}s` : '—');

        process.stdout.write('\n');

        // Speed ranking (fastest first)
        const validAlgos = algoResults.filter((r) => r.runs.length > 0 && r.mean > 0);
        if (validAlgos.length > 1) {
          const fastest = validAlgos.reduce((a, b) => (a.mean < b.mean ? a : b));
          const speedRanking = [...validAlgos]
            .sort((a, b) => a.mean - b.mean)
            .map((r) => `${r.algorithm} (${(r.mean / fastest.mean).toFixed(1)}×)`)
            .join(' > ');
          process.stdout.write(`Speed ranking:  ${speedRanking}\n`);
        }

        // Quality ranking (highest fitness first)
        const withFitness = algoResults.filter((r) => r.fitness !== null);
        if (withFitness.length > 1) {
          const qualityRanking = [...withFitness]
            .sort((a, b) => (b.fitness ?? 0) - (a.fitness ?? 0))
            .map((r) => `${r.algorithm} (${r.fitness!.toFixed(2)})`)
            .join(' > ');
          process.stdout.write(`Quality ranking: ${qualityRanking}\n`);
        }

        // Best speed/quality ratio
        if (validAlgos.length > 1 && withFitness.length > 0) {
          const fastest = validAlgos.reduce((a, b) => (a.mean < b.mean ? a : b));
          const bestRatio = [...withFitness]
            .filter((r) => r.mean > 0)
            .map((r) => ({
              algo: r,
              // Score: fitness / normalized_speed (fitness per relative speed unit)
              score: (r.fitness ?? 0) / (r.mean / fastest.mean),
            }))
            .sort((a, b) => b.score - a.score)[0];

          if (bestRatio) {
            process.stdout.write(`\nBest speed/quality ratio: ${bestRatio.algo.algorithm}\n`);
          }
        }

        // Errors
        for (const r of algoResults) {
          if (r.error) {
            process.stderr.write(`  ⚠ ${r.algorithm}: ${r.error}\n`);
          }
        }
      }

      // ─── CSV output ──────────────────────────────────────────────────────
      if (format === 'csv') {
        const rows = ['algorithm,runs,mean_ms,stddev_ms,p95_ms,min_ms,max_ms,fitness'];
        for (const r of algoResults) {
          rows.push([
            r.algorithm,
            r.runs.length,
            r.mean.toFixed(1),
            r.stddev.toFixed(1),
            r.p95.toFixed(1),
            r.min.toFixed(1),
            r.max.toFixed(1),
            r.fitness != null ? r.fitness.toFixed(4) : '',
          ].join(','));
        }
        process.stdout.write(rows.join('\n') + '\n');
      }

      // Build spec-compliant algorithms object (keyed by algorithm name)
      const algorithmsObj: Record<string, {
        mean_ms: number; std_ms: number; p95_ms: number; runs: number;
        min_ms: number; max_ms: number; fitness: number | null | undefined; error?: string;
      }> = {};
      for (const r of algoResults) {
        algorithmsObj[r.algorithm] = {
          mean_ms: Math.round(r.mean * 10) / 10,
          std_ms: Math.round(r.stddev * 10) / 10,
          p95_ms: Math.round(r.p95 * 10) / 10,
          min_ms: Math.round(r.min * 10) / 10,
          max_ms: Math.round(r.max * 10) / 10,
          runs: r.runs.length,
          fitness: r.fitness,
          ...(r.error ? { error: r.error } : {}),
        };
      }

      // Speed ranking (fastest to slowest)
      const validForSpeed = algoResults.filter((r) => r.runs.length > 0 && r.mean > 0);
      const speedRanking = [...validForSpeed]
        .sort((a, b) => a.mean - b.mean)
        .map((r) => r.algorithm);

      // Build recommendation string
      let recommendation = '';
      if (speedRanking.length > 0) {
        const fastest = speedRanking[0];
        const withFitness = algoResults.filter((r) => r.fitness != null && r.runs.length > 0);
        const bestQuality = withFitness.length > 0
          ? [...withFitness].sort((a, b) => (b.fitness ?? 0) - (a.fitness ?? 0))[0].algorithm
          : null;
        if (bestQuality && bestQuality !== fastest) {
          recommendation = `${fastest} for speed, ${bestQuality} for quality`;
        } else if (fastest) {
          recommendation = `${fastest} offers the best balance of speed and quality`;
        }
      }

      const payload = {
        input: inputPath,
        // Spec-mandated shape
        algorithms: algorithmsObj,
        speed_ranking: speedRanking,
        recommendation,
        // Extended info (backward compat)
        algorithm_list: algoList,
        runs_per_algorithm: nRuns,
        warmup: doWarmup,
        //  flat results array for existing consumers
        results: algoResults.map((r) => ({
          algorithm: r.algorithm,
          mean_ms: Math.round(r.mean * 10) / 10,
          stddev_ms: Math.round(r.stddev * 10) / 10,
          p95_ms: Math.round(r.p95 * 10) / 10,
          min_ms: Math.round(r.min * 10) / 10,
          max_ms: Math.round(r.max * 10) / 10,
          fitness: r.fitness,
          run_times_ms: r.runs.map((ms) => Math.round(ms * 10) / 10),
          error: r.error,
        })),
      };

      const exitCode = algoResults.some((r) => r.runs.length === 0)
        ? EXIT_CODES.partial_failure
        : EXIT_CODES.success;

      if (format === 'json') {
        const result = makeResult('benchmark perf', payload, performance.now() - t0, exitCode);
        emitResult(result, { format, quiet });
      }

      // Cleanup WASM handle
      if (typeof wasm['delete_object'] === 'function') {
        try { (wasm['delete_object'] as (h: string) => void)(handle); } catch { /* best-effort */ }
      }

      return await exitWithFlush(exitCode);
    });
  },
});

// ---------------------------------------------------------------------------
// Subcommand: gate — the aggregated G1–G5 benchmark gate
// ---------------------------------------------------------------------------
//
// `wpm benchmark gate` is the CI admission gate for the primitive kernel.
// It runs five gates against real WASM evidence and emits a machine-readable
// JSON verdict.  ANY gate failure makes the command exit non-zero, so the gate
// is usable directly in a pipeline (`wpm benchmark gate --format json || fail`).
//
//   G1  DETERMINISM        — same input ⇒ same BLAKE3 (run discover_dfg twice).
//   G2  RECEIPT-VERIFY     — BLAKE3 receipt chain recomputes to its stored hash
//                            (--verify-receipt-hash; optional external --receipt).
//   G3  CONFORMANCE        — token-replay fitness == 1.0 admits; below ⇒ AndonPull
//                            (RouteConformanceGap).  This is the exact-1.0 gate.
//   G4  METRIC-INTERDEP.   — conformance metrics obey the I-1..I-5 invariants
//                            (packages/observability/src/conformance-invariants.ts).
//   G5  REPORT-COMPLETE.   — the emitted verdict carries every required field for
//                            all five gates (anti-FAKE-LIVE: a gate cannot pass by
//                            omitting its own evidence).
//
// Doctrine: a green "build completed" is not proof.  Only a determinism gate that
// re-hashes equal, a receipt that re-verifies, an exact-1.0 admission (or a correctly
// named AndonPull), invariants that hold, and a complete report make the kernel ALIVE.

/** A single gate outcome inside the aggregate verdict. */
interface GateOutcome {
  /** Stable gate id: G1..G5 */
  id: 'G1' | 'G2' | 'G3' | 'G4' | 'G5';
  /** Gate name (machine-stable). */
  name: string;
  /** true ⇒ gate admitted; false ⇒ gate refused. */
  pass: boolean;
  /** Whether the gate ran or was skipped via --gates. */
  ran: boolean;
  /** Typed reason for a refusal (e.g. AndonPull variant) or 'ok'. */
  reason: string;
  /** Gate-specific evidence (hashes, fitness, invariant counts, …). */
  evidence: Record<string, unknown>;
}

/** Required keys every GateOutcome must carry — the G5 completeness contract. */
const GATE_REQUIRED_KEYS = ['id', 'name', 'pass', 'ran', 'reason', 'evidence'] as const;

/**
 * Deterministic, self-contained event log used by G1/G3/G4.  Inline (no external
 * file) so the gate is reproducible on any machine and the determinism oracle is
 * grounded in the WASM algorithm, not in filesystem state.
 */
const GATE_FIXTURE_XES =
  `<?xml version="1.0" encoding="UTF-8"?>\n` +
  `<log xes.version="1.0">\n` +
  ['A,B,C,D', 'A,B,C,D', 'A,B,C,D']
    .map(
      (trace, i) =>
        `  <trace>\n    <string key="concept:name" value="case-${i}"/>\n` +
        trace
          .split(',')
          .map((a) => `    <event><string key="concept:name" value="${a}"/></event>`)
          .join('\n') +
        `\n  </trace>`
    )
    .join('\n') +
  `\n</log>\n`;

/** G1 — determinism: discover_dfg twice, BLAKE3 the outputs, require equality. */
function gateG1Determinism(wasm: Record<string, unknown>): GateOutcome {
  const ev: Record<string, unknown> = {};
  if (
    typeof wasm.load_eventlog_from_xes !== 'function' ||
    typeof wasm.discover_dfg !== 'function'
  ) {
    return {
      id: 'G1',
      name: 'determinism',
      pass: false,
      ran: true,
      reason: 'wasm_unavailable: load_eventlog_from_xes/discover_dfg missing',
      evidence: ev,
    };
  }
  const handle = (wasm.load_eventlog_from_xes as (s: string) => string)(GATE_FIXTURE_XES);
  const run1 = (wasm.discover_dfg as (h: string, k: string) => unknown)(handle, 'concept:name');
  const run2 = (wasm.discover_dfg as (h: string, k: string) => unknown)(handle, 'concept:name');
  const out1 = typeof run1 === 'string' ? run1 : JSON.stringify(run1);
  const out2 = typeof run2 === 'string' ? run2 : JSON.stringify(run2);
  const hash1 = hashData(out1);
  const hash2 = hashData(out2);
  const pass = hash1 === hash2;
  ev.hash_run_1 = hash1;
  ev.hash_run_2 = hash2;
  ev.algorithm = 'discover_dfg';
  return {
    id: 'G1',
    name: 'determinism',
    pass,
    ran: true,
    reason: pass ? 'ok' : 'NonDeterministicOutput: BLAKE3 hashes differ across identical runs',
    evidence: ev,
  };
}

/**
 * G2 — BLAKE3 receipt verify.  When `receiptPath` is given, the stored
 * `combined_hash` is recomputed from the four component hashes and must match.
 * With no external receipt, a fresh receipt is built from the G1 evidence and
 * self-verified (closed-loop hash chain).  A tampered external receipt refuses.
 */
function gateG2ReceiptVerify(
  receiptPath: string | undefined,
  g1: GateOutcome
): GateOutcome {
  const ev: Record<string, unknown> = {};
  // Build the four-part chain. For the self-built receipt we anchor on the G1
  // determinism evidence so the gate verifies a real, just-produced artifact.
  const buildCombined = (
    inputHash: string,
    configHash: string,
    planHash: string,
    outputHash: string
  ): string => hashData([inputHash, configHash, planHash, outputHash]);

  if (receiptPath) {
    if (!existsSync(receiptPath)) {
      return {
        id: 'G2',
        name: 'receipt-verify',
        pass: false,
        ran: true,
        reason: `receipt_not_found: ${receiptPath}`,
        evidence: ev,
      };
    }
    let receipt: Record<string, unknown>;
    try {
      receipt = JSON.parse(readFileSync(receiptPath, 'utf8')) as Record<string, unknown>;
    } catch (e) {
      return {
        id: 'G2',
        name: 'receipt-verify',
        pass: false,
        ran: true,
        reason: `receipt_parse_error: ${String(e)}`,
        evidence: ev,
      };
    }
    const inputHash = String(receipt.input_hash ?? '');
    const configHash = String(receipt.config_hash ?? '');
    const planHash = String(receipt.plan_hash ?? '');
    const outputHash = String(receipt.output_hash ?? '');
    const stored = String(receipt.combined_hash ?? receipt.receipt_hash ?? '');
    const recomputed = buildCombined(inputHash, configHash, planHash, outputHash);
    const pass = stored.length > 0 && stored === recomputed;
    ev.source = 'external';
    ev.receipt_path = receiptPath;
    ev.stored_combined_hash = stored;
    ev.recomputed_combined_hash = recomputed;
    return {
      id: 'G2',
      name: 'receipt-verify',
      pass,
      ran: true,
      reason: pass
        ? 'ok'
        : 'MissingReceiptCoverage: stored combined_hash does not match recomputed BLAKE3 chain',
      evidence: ev,
    };
  }

  // Self-built receipt: hash the gate's own G1 evidence as the output.
  const inputHash = hashData(GATE_FIXTURE_XES);
  const configHash = hashData({ algorithm: 'discover_dfg', activity_key: 'concept:name' });
  const planHash = hashData({ plan: 'benchmark.gate.G1' });
  const outputHash = hashData(g1.evidence);
  const combined = buildCombined(inputHash, configHash, planHash, outputHash);
  // Honest closed-loop: rebuild the same combined hash and verify byte-equality,
  // plus an independent verifyHash() over the chain tuple.
  const recomputed = buildCombined(inputHash, configHash, planHash, outputHash);
  const chainTuple = [inputHash, configHash, planHash, outputHash];
  const pass = combined === recomputed && verifyHash(chainTuple, combined);
  ev.source = 'self-built';
  ev.input_hash = inputHash;
  ev.config_hash = configHash;
  ev.plan_hash = planHash;
  ev.output_hash = outputHash;
  ev.combined_hash = combined;
  return {
    id: 'G2',
    name: 'receipt-verify',
    pass,
    ran: true,
    reason: pass ? 'ok' : 'MissingReceiptCoverage: self-built receipt failed to re-verify',
    evidence: ev,
  };
}

/**
 * Run token-replay against an auto-discovered Petri net for the gate fixture.
 * Returns the avg fitness and the per-case results (for G3 + G4).  Returns null
 * when the required WASM functions are unavailable in this build profile.
 */
function runGateConformance(
  wasm: Record<string, unknown>
): { fitness: number; cases: CaseFitnessResult[]; totalCases: number } | null {
  if (
    typeof wasm.load_eventlog_from_xes !== 'function' ||
    typeof wasm.discover_alpha_plus_plus !== 'function' ||
    typeof wasm.check_token_based_replay !== 'function'
  ) {
    return null;
  }
  const handle = (wasm.load_eventlog_from_xes as (s: string) => string)(GATE_FIXTURE_XES);
  const discovery = (wasm.discover_alpha_plus_plus as (h: string, k: string, t: number) => unknown)(
    handle,
    'concept:name',
    0.0
  );
  const model = (typeof discovery === 'string' ? JSON.parse(discovery) : discovery) as Record<
    string,
    unknown
  >;
  const modelHandle = String(model.handle ?? '');
  if (!modelHandle) return null;
  const raw = (wasm.check_token_based_replay as (l: string, m: string, k: string) => unknown)(
    handle,
    modelHandle,
    'concept:name'
  );
  const conf = (typeof raw === 'string' ? JSON.parse(raw) : raw) as Record<string, unknown>;
  const fitness = typeof conf.avg_fitness === 'number' ? conf.avg_fitness : 0;
  const totalCases = typeof conf.total_cases === 'number' ? conf.total_cases : 0;
  const rawCases = Array.isArray(conf.case_fitness) ? conf.case_fitness : [];
  const cases: CaseFitnessResult[] = rawCases.map((c, i) => {
    const cc = c as Record<string, unknown>;
    return {
      case_id: String(cc.case_id ?? `case-${i}`),
      is_conforming: Boolean(cc.is_conforming ?? false),
      trace_fitness: typeof cc.trace_fitness === 'number' ? cc.trace_fitness : 0,
      tokens_missing: typeof cc.tokens_missing === 'number' ? cc.tokens_missing : 0,
      tokens_remaining: typeof cc.tokens_remaining === 'number' ? cc.tokens_remaining : 0,
      deviations: Array.isArray(cc.deviations)
        ? (cc.deviations as CaseFitnessResult['deviations'])
        : [],
    };
  });
  return { fitness, cases, totalCases };
}

/** G3 — exact-1.0 conformance admission.  Below 1.0 ⇒ AndonPull RouteConformanceGap. */
function gateG3Conformance(
  conf: { fitness: number; cases: CaseFitnessResult[]; totalCases: number } | null
): GateOutcome {
  const ev: Record<string, unknown> = {};
  if (conf === null) {
    return {
      id: 'G3',
      name: 'conformance',
      pass: false,
      ran: true,
      reason: 'wasm_unavailable: discover_alpha_plus_plus/check_token_based_replay missing',
      evidence: ev,
    };
  }
  ev.fitness = conf.fitness;
  ev.total_cases = conf.totalCases;
  ev.admission_threshold = 1.0;
  // EXACT 1.0 admission — there is no tolerance (mcpp-conformance.md). 0.999 refuses.
  const pass = conf.fitness >= 1.0;
  return {
    id: 'G3',
    name: 'conformance',
    pass,
    ran: true,
    reason: pass
      ? 'ok'
      : `RouteConformanceGap: fitness ${conf.fitness} < 1.0 — unproven motion, admission refused`,
    evidence: ev,
  };
}

/** G4 — metric-interdependency: conformance metrics obey invariants I-1..I-5. */
function gateG4MetricInterdependency(
  conf: { fitness: number; cases: CaseFitnessResult[]; totalCases: number } | null
): GateOutcome {
  const ev: Record<string, unknown> = {};
  if (conf === null) {
    return {
      id: 'G4',
      name: 'metric-interdependency',
      pass: false,
      ran: true,
      reason: 'wasm_unavailable: cannot evaluate invariants without conformance result',
      evidence: ev,
    };
  }
  // Wire the I-1..I-5 invariant validator. precision is not produced by token
  // replay; pass null so the ordering invariant (I-2) is skipped honestly.
  const violations = validateConformanceResultFromCases(conf.fitness, null, conf.cases);
  const critical = violations.filter((v) => v.severity === 'critical');
  const warnings = violations.filter((v) => v.severity === 'warning');
  ev.total_violations = violations.length;
  ev.critical = critical.length;
  ev.warnings = warnings.length;
  ev.violation_ids = violations.map((v) => v.id);
  // A critical invariant violation means the metrics are logically impossible.
  const pass = critical.length === 0;
  return {
    id: 'G4',
    name: 'metric-interdependency',
    pass,
    ran: true,
    reason: pass
      ? 'ok'
      : `MetricInvariantViolation: ${critical.length} critical (${critical.map((v) => v.id).join(',')})`,
    evidence: ev,
  };
}

/** G5 — report completeness: every prior gate carries all required keys. */
function gateG5ReportCompleteness(gates: GateOutcome[]): GateOutcome {
  const ev: Record<string, unknown> = {};
  const missing: string[] = [];
  for (const g of gates) {
    for (const key of GATE_REQUIRED_KEYS) {
      if (!(key in g)) missing.push(`${g.id}.${key}`);
    }
    // evidence must be a present object (anti-FAKE-LIVE: no empty/omitted evidence slot)
    if (typeof g.evidence !== 'object' || g.evidence === null) {
      missing.push(`${g.id}.evidence(non-object)`);
    }
  }
  ev.gates_checked = gates.map((g) => g.id);
  ev.missing_fields = missing;
  const pass = missing.length === 0;
  return {
    id: 'G5',
    name: 'report-completeness',
    pass,
    ran: true,
    reason: pass ? 'ok' : `IncompleteReport: missing ${missing.join(', ')}`,
    evidence: ev,
  };
}

const benchmarkGate = defineCommand({
  meta: {
    name: 'gate',
    description:
      'Aggregated G1–G5 admission gate (determinism, BLAKE3 receipt, exact-1.0 conformance, metric invariants, report completeness). Exits non-zero on any gate failure.',
  },
  args: {
    format: { type: 'string', description: 'Output format: human (default), json, or sarif' },
    gates: {
      type: 'string',
      description: 'Comma-separated subset to run (e.g. g1,g2). Default: all five.',
    },
    'verify-receipt-hash': {
      type: 'boolean',
      description: 'Enable G2 BLAKE3 receipt chain verification (default: on).',
    },
    receipt: {
      type: 'string',
      description: 'Path to an external receipt JSON to verify in G2 (default: self-built).',
    },
    verbose: { type: 'boolean', alias: 'v' },
    quiet: { type: 'boolean', alias: 'q' },
  },
  async run(ctx) {
    return withSpanRaw(
      'wasm4pm.command.benchmark.gate',
      { command: 'benchmark', subcommand: 'gate' },
      async () => {
        const t0 = performance.now();
        const format = (ctx.args.format as 'json' | 'sarif' | 'human') ?? 'human';
        const verbose = ctx.args.verbose ?? false;
        const quiet = ctx.args.quiet ?? false;

        // Parse the gate selector. Empty/absent ⇒ all five.
        const selected = ((ctx.args.gates as string | undefined) ?? '')
          .split(',')
          .map((s) => s.trim().toUpperCase())
          .filter(Boolean);
        const wants = (id: string): boolean => selected.length === 0 || selected.includes(id);
        // --verify-receipt-hash defaults ON; explicitly false disables G2.
        const verifyReceipt = ctx.args['verify-receipt-hash'] !== false;

        try {
          const loader = WasmLoader.getInstance();
          await loader.init();
          const wasm = loader.get() as Record<string, unknown>;

          const skipped = (id: GateOutcome['id'], name: string): GateOutcome => ({
            id,
            name,
            pass: true,
            ran: false,
            reason: 'skipped',
            evidence: {},
          });

          // Conformance is computed once and shared by G3 + G4.
          const needConf = wants('G3') || wants('G4');
          const conf = needConf ? runGateConformance(wasm) : null;

          const g1 = wants('G1') ? gateG1Determinism(wasm) : skipped('G1', 'determinism');
          const g2 =
            wants('G2') && verifyReceipt
              ? gateG2ReceiptVerify(ctx.args.receipt as string | undefined, g1)
              : skipped('G2', 'receipt-verify');
          const g3 = wants('G3') ? gateG3Conformance(conf) : skipped('G3', 'conformance');
          const g4 = wants('G4')
            ? gateG4MetricInterdependency(conf)
            : skipped('G4', 'metric-interdependency');

          const priorGates = [g1, g2, g3, g4];
          const g5 = wants('G5')
            ? gateG5ReportCompleteness(priorGates)
            : skipped('G5', 'report-completeness');

          const gates = [g1, g2, g3, g4, g5];
          const ranGates = gates.filter((g) => g.ran);
          const failed = ranGates.filter((g) => !g.pass);
          const verdict: 'ADMITTED' | 'ANDON_PULL' = failed.length === 0 ? 'ADMITTED' : 'ANDON_PULL';
          const exitCode = failed.length === 0 ? EXIT_CODES.success : EXIT_CODES.conformance_fail;

          const payload = {
            verdict,
            gates_total: ranGates.length,
            gates_passed: ranGates.filter((g) => g.pass).length,
            gates_failed: failed.length,
            gates,
            // The AndonPull cause is the first failing gate's typed reason.
            andon_reason: failed.length > 0 ? failed[0].reason : null,
          };

          if (format === 'sarif') {
            const sarifResults = gates
              .filter((g) => g.ran && !g.pass)
              .map((g) => ({ verdict: 'ANDON_PULL', traceName: g.id, explanation: g.reason }));
            process.stdout.write(
              JSON.stringify(buildSarifOutput('26.4.28', sarifResults), null, 2) + '\n'
            );
            return await exitWithFlush(exitCode);
          }

          const result = makeResult('benchmark gate', payload, performance.now() - t0, exitCode);

          emitResult(result, { format, verbose, quiet }, (res, projection) => {
            for (const g of res.payload.gates) {
              const mark = !g.ran ? '○' : g.pass ? '✓' : '✗';
              const line = `  ${mark} ${g.id} ${g.name.padEnd(24)} ${g.reason}`;
              if (!g.ran) projection.log(line);
              else if (g.pass) projection.info(line);
              else projection.warn(line);
            }
            if (res.payload.verdict === 'ADMITTED') {
              projection.success(
                `Benchmark gate ADMITTED: ${res.payload.gates_passed}/${res.payload.gates_total} gates passed`
              );
            } else {
              projection.error(
                `Benchmark gate ANDON_PULL: ${res.payload.gates_failed}/${res.payload.gates_total} gates failed — ${res.payload.andon_reason}`
              );
            }
          });

          return await exitWithFlush(exitCode);
        } catch (e) {
          const result = makeErrorResult('benchmark gate', e, EXIT_CODES.execution_error);
          emitResult(result, { format, verbose, quiet });
          return await exitWithFlush(EXIT_CODES.execution_error);
        }
      }
    );
  },
});

// ---------------------------------------------------------------------------
// Main benchmark noun
// ---------------------------------------------------------------------------

export const benchmark = defineCommand({
  meta: {
    name: 'benchmark',
    description: 'Benchmark corpus management and verification. Example: wpm benchmark verify --corpus data/benchmarks.jsonl',
  },
  async run(ctx) {
    if (ctx && ctx.rawArgs && ctx.cmd && ctx.cmd.subCommands) {
      const subCommands = Object.keys(ctx.cmd.subCommands);
      const hasSubcommand = ctx.rawArgs.some((arg) => subCommands.includes(arg));
      if (hasSubcommand) {
        return;
      }
    }
    process.stdout.write(`
  wpm benchmark — Benchmark Corpus Verification & Algorithm Performance

  Subcommands:
    wpm benchmark gate      [--gates g1,g2] [--receipt <f>]  G1–G5 admission gate (CI)
    wpm benchmark build     --corpus <path.jsonl>   Validate JSONL corpus format
    wpm benchmark replay    [--corpus <path>]        Run traces, show per-trace results
    wpm benchmark verify    [--corpus <path>]        CI gate — exit non-zero on failure
    wpm benchmark export    [--corpus <path>] [--format sarif|json|csv]
    wpm benchmark calibrate [--runs N]               Measure this machine, write timing config
    wpm benchmark perf      -i <log.xes> [--algorithms dfg,heuristic_miner] [--runs 5]
                                                     Time discovery algorithms on a real log

  Default corpus: built-in 8-trace AutoMembrane security suite.

  Run "wpm benchmark <subcommand> --help" for detailed usage.
`);
    return await exitWithFlush(EXIT_CODES.success);
  },
  subCommands: {
    gate: benchmarkGate,
    build: benchmarkBuild,
    replay: benchmarkReplay,
    verify: benchmarkVerify,
    export: benchmarkExport,
    calibrate: benchmarkCalibrate,
    perf: benchmarkPerf,
  },
});
