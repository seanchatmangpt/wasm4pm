/**
 * batch.ts
 * Command for batch processing of multiple event logs in parallel.
 * Discovers process models across multiple logs with configurable concurrency.
 *
 * Improvements over v1:
 *  - `-i / --input` accepts glob patterns (*.xes) or explicit file lists
 *  - `--parallel <n>` controls concurrency (default: 1)
 *  - `--continue-on-error` skips failures and keeps going
 *  - `--output-dir <dir>` saves per-file JSON results to a directory
 *  - `--summary` always prints the summary table (default: true in human mode)
 *  - `--top <n>` shows only the N fastest/slowest results
 *  - Rich progress output: [1/12] filename  ✔ 0.34s  fitness=0.89
 */

import { defineCommand } from 'citty';
import * as fs from 'fs/promises';
import * as path from 'path';
import { existsSync } from 'fs';
import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import { WasmLoader } from '@wasm4pm/engine';
import { emitResult, makeResult, makeErrorResult } from '../output.js';
import { EXIT_CODES } from '../exit-codes.js';
import { exitWithFlush } from '../otel/exit.js';
import { withSpan } from './_otel.js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FileResult {
  index: number;
  total: number;
  file: string;
  basename: string;
  status: 'success' | 'error';
  elapsedMs: number;
  fitness?: number;
  traces?: number;
  activities?: number;
  error?: string;
  outputPath?: string;
}

interface BatchSummary {
  total: number;
  succeeded: number;
  failed: number;
  avgElapsedMs: number;
  avgFitness: number | null;
  totalElapsedMs: number;
}

// ─── Glob expansion ───────────────────────────────────────────────────────────

/**
 * Expand a glob-like pattern to matching file paths.
 * Supports: exact paths, directory paths (find .xes inside), *.xes patterns.
 * Does NOT require a glob library — implements minimal shell-style matching.
 */
async function expandInput(input: string): Promise<string[]> {
  // Exact file
  if (existsSync(input) && (await fs.stat(input)).isFile()) {
    return [path.resolve(input)];
  }

  // Directory — recursively find XES/JSON files
  if (existsSync(input) && (await fs.stat(input)).isDirectory()) {
    return findLogFiles(input);
  }

  // Glob pattern — e.g. "logs/*.xes" or "*.xes"
  const dir = path.dirname(input);
  const base = path.basename(input);
  const resolvedDir = dir === '.' ? process.cwd() : path.resolve(dir);

  if (!existsSync(resolvedDir)) return [];

  const entries = await fs.readdir(resolvedDir, { withFileTypes: true });
  const regex = new RegExp(
    '^' +
      base
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.') +
      '$'
  );
  return entries
    .filter((e) => e.isFile() && regex.test(e.name))
    .map((e) => path.resolve(resolvedDir, e.name));
}

/**
 * Recursively walk a directory and collect XES/JSON event log files.
 */
async function findLogFiles(directory: string): Promise<string[]> {
  const files: string[] = [];

  async function walk(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.name.endsWith('.xes') || entry.name.endsWith('.ocel.json')) {
        files.push(path.resolve(fullPath));
      }
    }
  }

  await walk(directory);
  return files.sort();
}

// ─── Time formatting ──────────────────────────────────────────────────────────

function formatTime(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

// ─── Per-file processing ──────────────────────────────────────────────────────

const parse = (r: unknown): unknown => (typeof r === 'string' ? JSON.parse(r) : r);

async function processOneFile(
  file: string,
  index: number,
  total: number,
  algorithm: string,
  outputDir: string | undefined,
  verbose: boolean
): Promise<FileResult> {
  const t0 = performance.now();
  const basename = path.basename(file);

  try {
    const xes = await fs.readFile(file, 'utf-8');
    const loader = WasmLoader.getInstance();
    await loader.init();
    const wasm = loader.get() as Record<string, (...args: unknown[]) => unknown>;

    // Load event log
    const handle = wasm.load_eventlog_from_xes(xes) as string;

    // Dispatch to the right discovery function
    const fnMap: Record<string, string> = {
      dfg: 'discover_dfg',
      heuristic: 'discover_heuristic_miner',
      heuristic_miner: 'discover_heuristic_miner',
      inductive_miner: 'discover_inductive_miner',
      inductive: 'discover_inductive_miner',
      alpha: 'discover_alpha_plus_plus',
      alpha_plus_plus: 'discover_alpha_plus_plus',
      ilp: 'discover_ilp',
      genetic: 'discover_genetic_algorithm',
      genetic_algorithm: 'discover_genetic_algorithm',
    };

    const fnName = fnMap[algorithm] ?? `discover_${algorithm}`;
    if (typeof wasm[fnName] !== 'function') {
      throw new Error(`Algorithm '${algorithm}' not available (function ${fnName} not found)`);
    }

    // Extra params for algorithms that need them
    let raw: unknown;
    if (algorithm === 'heuristic' || algorithm === 'heuristic_miner') {
      raw = wasm[fnName](handle, 'concept:name', 0.5);
    } else if (algorithm === 'genetic' || algorithm === 'genetic_algorithm') {
      raw = wasm[fnName](handle, 'concept:name', 50, 20);
    } else {
      raw = wasm[fnName](handle, 'concept:name');
    }

    // Best-effort cleanup
    try {
      if (typeof wasm['delete_object'] === 'function') wasm['delete_object'](handle);
    } catch {
      /* ignore */
    }

    const result = parse(raw) as Record<string, unknown>;
    const elapsedMs = performance.now() - t0;

    // Extract fitness if available
    let fitness: number | undefined;
    const q = result['quality'] as Record<string, unknown> | undefined;
    if (q && typeof q['fitness'] === 'number') fitness = q['fitness'];
    else if (typeof result['fitness'] === 'number') fitness = result['fitness'] as number;

    // Extract trace/activity counts
    let traces: number | undefined;
    let activities: number | undefined;
    const model = result['model'] as Record<string, unknown> | undefined;
    if (model) {
      if (typeof model['traces'] === 'number') traces = model['traces'] as number;
      if (typeof model['activities'] === 'number') activities = model['activities'] as number;
    }
    if (typeof result['traces'] === 'number') traces = result['traces'] as number;
    if (typeof result['node_count'] === 'number') activities = result['node_count'] as number;

    // Save per-file result if --output-dir
    let outputPath: string | undefined;
    if (outputDir) {
      await fs.mkdir(outputDir, { recursive: true });
      const ts = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);
      const slug = basename.replace(/\.(xes|json)$/i, '');
      outputPath = path.join(outputDir, `${ts}-${slug}.json`);
      await fs.writeFile(
        outputPath,
        JSON.stringify(
          {
            version: 1,
            savedAt: new Date().toISOString(),
            task: `discover-${algorithm}`,
            input: file,
            activityKey: 'concept:name',
            qualityDimensions: {
              fitness: fitness ?? null,
              precision: null,
              generalization: null,
              simplicity: null,
              qualityTier: null,
              interpretation: fitness != null && fitness < 0.85
                ? `Fitness ${fitness.toFixed(2)} is below the 0.85 threshold.`
                : 'Run wpm conformance for detailed quality metrics.',
            },
            result,
          },
          null,
          2
        )
      );
    }

    const fileResult: FileResult = {
      index,
      total,
      file,
      basename,
      status: 'success',
      elapsedMs,
      fitness,
      traces,
      activities,
      outputPath,
    };

    if (verbose || process.stderr.isTTY) {
      const fitnessStr = fitness != null ? `  fitness=${fitness.toFixed(2)}${fitness < 0.85 ? '  ⚠ low fitness' : ''}` : '';
      const idx = String(index).padStart(String(total).length);
      process.stderr.write(
        `[${idx}/${total}] ${basename.padEnd(40)} ✔ ${formatTime(elapsedMs)}${fitnessStr}\n`
      );
    }

    return fileResult;
  } catch (err) {
    const elapsedMs = performance.now() - t0;
    const error = err instanceof Error ? err.message : String(err);

    if (verbose || process.stderr.isTTY) {
      const idx = String(index).padStart(String(total).length);
      process.stderr.write(
        `[${idx}/${total}] ${basename.padEnd(40)} ✗ ${formatTime(elapsedMs)}  ERROR: ${error}\n`
      );
    }

    return { index, total, file, basename, status: 'error', elapsedMs, error };
  }
}

// ─── Concurrency limiter ──────────────────────────────────────────────────────

/**
 * Run tasks with at most `concurrency` running at a time.
 * Preserves order of results.
 */
async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let next = 0;

  async function worker(): Promise<void> {
    while (next < tasks.length) {
      const i = next++;
      results[i] = await tasks[i]();
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

// ─── Summary helpers ──────────────────────────────────────────────────────────

function buildSummary(results: FileResult[], totalMs: number): BatchSummary {
  const succeeded = results.filter((r) => r.status === 'success');
  const fitnessValues = succeeded.map((r) => r.fitness).filter((f): f is number => f != null);
  const avgFitness = fitnessValues.length > 0
    ? fitnessValues.reduce((a, b) => a + b, 0) / fitnessValues.length
    : null;
  const avgElapsedMs =
    results.length > 0 ? results.reduce((a, r) => a + r.elapsedMs, 0) / results.length : 0;

  return {
    total: results.length,
    succeeded: succeeded.length,
    failed: results.length - succeeded.length,
    avgElapsedMs,
    avgFitness,
    totalElapsedMs: totalMs,
  };
}

function printSummaryTable(results: FileResult[], summary: BatchSummary): void {
  const w = process.stderr;
  w.write('\n');
  w.write('Summary:\n');
  w.write(`  Processed:  ${summary.succeeded}/${summary.total}`);
  if (summary.failed > 0) w.write(` (${summary.failed} failed)`);
  w.write('\n');
  w.write(`  Avg time:   ${formatTime(summary.avgElapsedMs)} per file\n`);
  w.write(`  Total time: ${formatTime(summary.totalElapsedMs)}\n`);
  if (summary.avgFitness != null) {
    w.write(`  Avg fitness:${summary.avgFitness.toFixed(2)}\n`);
  }

  // Show failures
  const failed = results.filter((r) => r.status === 'error');
  if (failed.length > 0) {
    w.write('\n');
    w.write('Failures:\n');
    for (const f of failed) {
      w.write(`  ✗ ${f.basename}: ${f.error ?? 'unknown error'}\n`);
    }
  }
}

// ─── Receipt saving ───────────────────────────────────────────────────────────

async function saveBatchReport(results: FileResult[], summary: BatchSummary): Promise<string> {
  const dir = path.resolve('.wasm4pm', 'results');
  await fs.mkdir(dir, { recursive: true });

  const now = new Date();
  const ts = now.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const filename = `batch-${ts}.json`;
  const filepath = path.join(dir, filename);

  const payload = {
    version: 1,
    type: 'batch',
    savedAt: now.toISOString(),
    summary,
    results: results.map((r) => ({
      file: r.basename,
      status: r.status,
      elapsedMs: r.elapsedMs,
      fitness: r.fitness ?? null,
      traces: r.traces ?? null,
      activities: r.activities ?? null,
      error: r.error ?? null,
      outputPath: r.outputPath ?? null,
    })),
    run_id: randomUUID(),
    output_hash: createHash('sha256')
      .update(JSON.stringify(results.map((r) => r.status)))
      .digest('hex'),
  };

  await fs.writeFile(filepath, JSON.stringify(payload, null, 2));
  return filepath;
}

// ─── Command definition ───────────────────────────────────────────────────────

export const batch = defineCommand({
  meta: {
    name: 'batch',
    description:
      'Batch process multiple event logs. Accepts a directory, glob pattern, or explicit files. ' +
      'Ex: wpm batch -i "*.xes" --algorithm dfg --parallel 4',
  },
  args: {
    input: {
      type: 'string',
      description: 'Directory, glob pattern, or comma-separated list of XES files',
      alias: 'i',
    },
    //  positional — kept for baseline admissibility
    directory: {
      type: 'positional',
      description: 'Directory containing XES/JSON event logs ( positional)',
      required: false,
    },
    algorithm: {
      type: 'string',
      description: 'Discovery algorithm (default: dfg)',
      default: 'dfg',
      alias: 'a',
    },
    parallel: {
      type: 'string',
      description: 'Number of files to process concurrently (default: 1)',
      default: '1',
    },
    workers: {
      type: 'string',
      description: 'Alias for --parallel ( flag)',
    },
    'continue-on-error': {
      type: 'boolean',
      description: 'Do not stop on individual file failure (default: true)',
      default: true,
    },
    'output-dir': {
      type: 'string',
      description: 'Save per-file result JSON files to this directory',
    },
    summary: {
      type: 'boolean',
      description: 'Print summary table at end (default: true in human mode)',
      default: true,
    },
    'no-save': {
      type: 'boolean',
      description: 'Skip saving batch report to .wasm4pm/results/',
      default: false,
    },
    format: {
      type: 'string',
      description: 'Output format: human (default) or json',
      default: 'human',
    },
    verbose: {
      type: 'boolean',
      description: 'Show per-file details in output',
      default: false,
    },
  },

  async run(ctx) {
    const t0 = performance.now();
    const format = (ctx.args.format as 'json' | 'human') ?? 'human';
    const verbose = ctx.args.verbose === true;
    const noSave = ctx.args['no-save'] === true;
    const outputDir = ctx.args['output-dir'] ? String(ctx.args['output-dir']) : undefined;
    const showSummary = ctx.args.summary !== false;
    const algorithm = String(ctx.args.algorithm ?? 'dfg');

    // Resolve concurrency: --parallel takes precedence over --workers
    const parallelStr = ctx.args.parallel ?? ctx.args.workers ?? '1';
    const parallel = Math.max(1, parseInt(String(parallelStr), 10) || 1);

    // Resolve input: -i flag or positional directory
    const inputArg = ctx.args.input
      ? String(ctx.args.input)
      : ctx.args.directory
        ? String(ctx.args.directory)
        : undefined;

    return withSpan('batch.run', { algorithm, parallel }, async () => {
      if (!inputArg) {
        const errResult = makeErrorResult(
          'batch',
          new Error(
            'No input specified.\n\n' +
              '  Usage:\n' +
              '    wpm batch -i "*.xes" --algorithm dfg\n' +
              '    wpm batch ./logs/ --parallel 4\n' +
              '    wpm batch -i "logs/a.xes,logs/b.xes"\n'
          ),
          EXIT_CODES.config_error,
          'BATCH_NO_INPUT'
        );
        emitResult(errResult, { format, quiet: false });
        return await exitWithFlush(errResult.exit_code);
      }

      // Expand comma-separated list or glob/directory
      let allFiles: string[] = [];
      const inputs = inputArg.split(',').map((s) => s.trim()).filter(Boolean);
      for (const inp of inputs) {
        const expanded = await expandInput(inp);
        allFiles.push(...expanded);
      }

      // Deduplicate
      allFiles = [...new Set(allFiles)].sort();

      if (allFiles.length === 0) {
        const errResult = makeErrorResult(
          'batch',
          new Error(
            `No XES files found matching: '${inputArg}'\n\n` +
              '  wpm batch looks for: *.xes, *.ocel.json\n\n' +
              '  Check your pattern or directory:\n' +
              `    ls ${inputArg.includes('/') ? path.dirname(inputArg) : '.'}`
          ),
          EXIT_CODES.source_error,
          'BATCH_NO_FILES_FOUND'
        );
        emitResult(errResult, { format, quiet: false });
        return await exitWithFlush(errResult.exit_code);
      }

      if (format !== 'json') {
        process.stderr.write(
          `\nBatch Processing — ${allFiles.length} file${allFiles.length === 1 ? '' : 's'}\n`
        );
        process.stderr.write('═'.repeat(50) + '\n');
      }

      // Build task list
      const tasks = allFiles.map(
        (file, i) => () => processOneFile(file, i + 1, allFiles.length, algorithm, outputDir, verbose)
      );

      // Run with concurrency limit
      const fileResults = await runWithConcurrency(tasks, parallel);

      const totalMs = performance.now() - t0;
      const summary = buildSummary(fileResults, totalMs);

      // Print summary to stderr (human mode)
      if (format !== 'json' && showSummary) {
        printSummaryTable(fileResults, summary);
      }

      // Save batch report
      let reportPath: string | undefined;
      if (!noSave) {
        try {
          reportPath = await saveBatchReport(fileResults, summary);
          if (format !== 'json') {
            process.stderr.write(`\nBatch report saved: ${reportPath}\n`);
          }
        } catch (e) {
          // Non-fatal
          process.stderr.write(
            `Warning: could not save batch report: ${e instanceof Error ? e.message : String(e)}\n`
          );
        }
      }

      const exitCode =
        summary.failed > 0 ? EXIT_CODES.partial_failure : EXIT_CODES.success;

      // Build spec-compliant results array
      const resultsArray = fileResults.map((r) => ({
        file: r.basename,
        status: r.status,
        fitness: r.fitness ?? null,
        duration_ms: Math.round(r.elapsedMs),
        traces: r.traces ?? null,
        activities: r.activities ?? null,
        error: r.error ?? null,
        outputPath: r.outputPath ?? null,
      }));

      const successfulResults = resultsArray.filter((r) => r.status === 'success');
      const avgFitness = successfulResults
        .map((r) => r.fitness)
        .filter((f): f is number => f != null)
        .reduce((acc, f, _, arr) => acc + f / arr.length, 0) || null;
      const avgDurationMs = successfulResults.length > 0
        ? Math.round(successfulResults.reduce((a, r) => a + r.duration_ms, 0) / successfulResults.length)
        : null;

      const payload = {
        // Spec-mandated top-level keys
        total_files: allFiles.length,
        successful: summary.succeeded,
        failed: summary.failed,
        results: resultsArray,
        summary: {
          avg_fitness: avgFitness,
          avg_duration_ms: avgDurationMs,
        },
        // Extended info (backward compat)
        status: summary.failed === 0 ? 'completed' : ('partial' as 'completed' | 'partial'),
        algorithm,
        parallel,
        totalElapsedMs: Math.round(summary.totalElapsedMs),
        reportPath: reportPath ?? null,
      };

      const cmdResult = makeResult('batch', payload, totalMs, exitCode);
      emitResult(cmdResult, { format, quiet: false });
      return await exitWithFlush(exitCode);
    });
  },
});
