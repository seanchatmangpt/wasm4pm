import { defineCommand } from 'citty';
import { readFileSync, existsSync } from 'node:fs';
import { WasmLoader } from '@wasm4pm/engine';
import { emitResult, makeResult, makeErrorResult } from '../output.js';
import { EXIT_CODES } from '../exit-codes.js';
import { buildSarifOutput, verdictToLevel } from '../sarif.js';

const parse = (r: unknown): unknown =>
  typeof r === 'string' ? JSON.parse(r) : r;

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
    const t0 = performance.now();
    const format = (ctx.args.format as 'json' | 'human') ?? 'human';
    const quiet = ctx.args.quiet ?? false;
    const corpusPath = ctx.args.corpus;

    if (!existsSync(corpusPath)) {
      const result = makeErrorResult('benchmark build', `Corpus file not found: ${corpusPath}`,
        EXIT_CODES.source_error, 'SOURCE_NOT_FOUND');
      emitResult(result, { format, quiet });
      process.exit(EXIT_CODES.source_error);
      return;
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

    process.exit(exitCode);
  },
});

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
    if (!existsSync(corpus)) throw new Error(`Corpus not found: ${corpus}`);
    const lines = readFileSync(corpus, 'utf8').split('\n').filter((l) => l.trim());
    const traces: BenchmarkTrace[] = lines.map((l, i) => {
      try { return JSON.parse(l) as BenchmarkTrace; }
      catch { throw new Error(`Line ${i + 1}: invalid JSON`); }
    });

    if (typeof wasm.classify_motion !== 'function') {
      throw new Error('classify_motion not available — requires fog or browser profile');
    }

    const results: BenchmarkResult[] = traces
      .filter((t) => !traceFilter || t.trace_id === traceFilter)
      .map((t) => {
        try {
          const raw = (wasm.classify_motion as (j: string) => unknown)(JSON.stringify(t.motion));
          const receipt = parse(raw) as { verdict: string };
          const actual = receipt.verdict ?? 'Unknown';
          const pass = actual.toLowerCase() === t.expected_verdict.toLowerCase();
          return {
            trace_id: t.trace_id, name: t.name, pass, final_verdict: actual,
            expected_verdict: t.expected_verdict,
            failure_reason: pass ? undefined : `Expected ${t.expected_verdict}, got ${actual}`,
          };
        } catch (e) {
          return {
            trace_id: t.trace_id, name: t.name, pass: false,
            final_verdict: 'Error', expected_verdict: t.expected_verdict, failure_reason: String(e),
          };
        }
      });

    const passed = results.filter((r) => r.pass).length;
    return { builtIn: false, results, total: results.length, passed, failed: results.length - passed };
  }

  if (typeof wasm.run_all_benchmarks !== 'function') {
    throw new Error('run_all_benchmarks not available — requires fog or browser profile');
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
        projection.info('\nBenchmark Results');
        projection.info('─'.repeat(72));
        projection.info(`${pad('Trace ID', 28)} ${pad('Verdict', 22)} Expected              Pass`);
        projection.info('─'.repeat(72));
        for (const r of res.payload.results) {
          const ok = r.pass ? '✓' : '✗';
          const line = `${pad(r.trace_id, 28)} ${pad(r.final_verdict, 22)} ${pad(r.expected_verdict, 20)} ${ok}`;
          if (r.pass) projection.info(line);
          else projection.warn(line);
          if (!r.pass && verbose && r.failure_reason) projection.warn(`  → ${r.failure_reason}`);
        }
        projection.info('─'.repeat(72));
        const pct = Math.round((passed / (total || 1)) * 100);
        const summary = `${passed}/${total} passed (${pct}%)`;
        if (failed === 0) projection.success(summary);
        else projection.warn(summary);
      });

      process.exit(EXIT_CODES.success);
    } catch (e) {
      const result = makeErrorResult('benchmark replay', e, EXIT_CODES.execution_error);
      emitResult(result, { format, verbose, quiet });
      process.exit(EXIT_CODES.execution_error);
    }
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
        process.exit(exitCode);
        return;
      }

      const result = makeResult('benchmark verify', {
        total, passed, failed, pass_rate: total ? passed / total : 0, results,
      }, performance.now() - t0, exitCode);

      emitResult(result, { format, verbose, quiet }, (res, projection) => {
        if (res.payload.failed === 0) {
          projection.success(`Benchmark verify: ${res.payload.passed}/${res.payload.total} passed`);
        } else {
          projection.error(`Benchmark verify FAILED: ${res.payload.failed}/${res.payload.total} traces did not match expected verdict`);
          if (verbose || !quiet) {
            for (const r of res.payload.results.filter((x) => !x.pass)) {
              projection.warn(`  ✗ ${r.trace_id}: expected ${r.expected_verdict}, got ${r.final_verdict}`);
            }
          }
        }
      });

      process.exit(exitCode);
    } catch (e) {
      const result = makeErrorResult('benchmark verify', e, EXIT_CODES.execution_error);
      emitResult(result, { format, verbose, quiet });
      process.exit(EXIT_CODES.execution_error);
    }
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
        process.exit(EXIT_CODES.config_error);
        return;
      }

      process.exit(EXIT_CODES.success);
    } catch (e) {
      const result = makeErrorResult('benchmark export', e, EXIT_CODES.execution_error);
      emitResult(result, { format: 'human', quiet });
      process.exit(EXIT_CODES.execution_error);
    }
  },
});

// ---------------------------------------------------------------------------
// Main benchmark noun
// ---------------------------------------------------------------------------

export const benchmark = defineCommand({
  meta: {
    name: 'benchmark',
    description: 'Benchmark corpus management and verification',
  },
  async run() {
    process.stdout.write(`
  wpm benchmark — Benchmark Corpus Verification

  Subcommands:
    wpm benchmark build  --corpus <path.jsonl>   Validate JSONL corpus format
    wpm benchmark replay [--corpus <path>]        Run traces, show per-trace results
    wpm benchmark verify [--corpus <path>]        CI gate — exit non-zero on failure
    wpm benchmark export [--corpus <path>] [--format sarif|json|csv]

  Default corpus: built-in 8-trace AutoMembrane security suite.

  Run "wpm benchmark <subcommand> --help" for detailed usage.
`);
    process.exit(EXIT_CODES.success);
  },
  subCommands: {
    build: benchmarkBuild,
    replay: benchmarkReplay,
    verify: benchmarkVerify,
    export: benchmarkExport,
  },
});
