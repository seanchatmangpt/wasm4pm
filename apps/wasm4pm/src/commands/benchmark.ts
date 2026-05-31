import { defineCommand } from 'citty';
import { withSpanRaw } from './_otel.js';
import { readFileSync, existsSync } from 'node:fs';
import { WasmLoader } from '@wasm4pm/engine';
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
        EXIT_CODES.source_error, 'SOURCE_NOT_FOUND');
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
        // Legacy flat results array for existing consumers
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
// Main benchmark noun
// ---------------------------------------------------------------------------

export const benchmark = defineCommand({
  meta: {
    name: 'benchmark',
    description: 'Benchmark corpus management and verification. Example: wpm benchmark verify --corpus data/benchmarks.jsonl',
  },
  async run() {
    process.stdout.write(`
  wpm benchmark — Benchmark Corpus Verification & Algorithm Performance

  Subcommands:
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
    build: benchmarkBuild,
    replay: benchmarkReplay,
    verify: benchmarkVerify,
    export: benchmarkExport,
    calibrate: benchmarkCalibrate,
    perf: benchmarkPerf,
  },
});
