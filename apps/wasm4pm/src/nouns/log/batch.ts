/**
 * wpm log batch — discover a process model for every XES log under a
 * directory, in parallel, through the kernel's `BatchRunner`.
 *
 * Restores the capability of the pre-noun-verb `wpm batch` (see
 * `nouns/_removed.ts`) as a noun/verb, without re-deriving it: the
 * worker pool, per-log WASM handle lifecycle and summary statistics all
 * live in `BatchRunner`; this verb only discovers files, validates
 * arguments, resolves the algorithm through `engines/algorithms.ts`
 * (typed refusal for unknown ids — never a silent default), and shapes the
 * result.
 *
 * Receipts: the noun/verb dispatcher (`cli.ts`) already persists a BLAKE3
 * admission + outcome receipt for every verb invocation, so this verb does
 * not write a second, differently-shaped receipt.
 *
 * Scope: XES event logs only (`BatchRunner` loads via
 * `Kernel.loadEventLog`). Failed or unreadable logs are reported per file
 * and turn the exit code into `partial_failure`; they never abort the run.
 * `BatchRunner` has no per-log timeout, so none is offered here.
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { defineVerb, NounVerbError } from '@wasm4pm/noun-verb';
import { WasmLoader } from '@wasm4pm/engine';
import { BatchRunner, Kernel } from 'wasm4pm';
import type { BatchResult } from 'wasm4pm';
import { resolveAlgorithm, UnknownAlgorithmError } from '../../engines/algorithms.js';
import { EXIT_CODES } from '../../exit-codes.js';

const DEFAULT_ALGORITHM = 'heuristic_miner';

/** Recursively collect `*.xes` files (sorted, dot-dirs and node_modules skipped). */
export async function findXesLogs(directory: string): Promise<string[]> {
  const files: string[] = [];
  async function walk(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(fullPath);
      else if (entry.isFile() && entry.name.endsWith('.xes')) files.push(fullPath);
    }
  }
  await walk(directory);
  return files.sort();
}

export interface LogBatchPayload {
  status: 'completed' | 'failed';
  algorithm: string;
  directory: string;
  logCount: number;
  summary: BatchResult['summary'];
  per_file_results: Array<{
    log: string;
    status: string;
    elapsed_ms: number;
    output_hash?: string;
    error?: string;
  }>;
  success_count: number;
  failure_count: number;
  total_duration_ms: number;
  /** Present only when at least one log failed (fail-closed exit override). */
  exitCode?: number;
}

export const batchVerb = defineVerb({
  noun: 'log',
  verb: 'batch',
  summary:
    'Discover process models for every XES log in a directory, in parallel (was: wpm batch). ' +
    'Ex: wpm log batch ./logs --algorithm dfg --workers 4',
  args: {
    directory: { type: 'positional', description: 'Directory containing XES event logs (searched recursively)', required: true },
    algorithm: {
      type: 'string',
      description: `Discovery algorithm id or alias (default: ${DEFAULT_ALGORITHM}; run "wpm help algorithms")`,
      alias: 'a',
    },
    workers: { type: 'string', description: 'Number of parallel workers (default: CPU count)' },
    'activity-key': { type: 'string', description: 'Event attribute key for activity names (default: concept:name)' },
  } as const,
  handler: async (args): Promise<LogBatchPayload> => {
    const t0 = performance.now();
    const directory = args.directory as string;

    let workers: number | undefined;
    if (args.workers !== undefined) {
      workers = Number(args.workers);
      if (!Number.isInteger(workers) || workers <= 0) {
        throw NounVerbError.invalidInput(
          `--workers must be a positive integer (got: ${String(args.workers)}). Example: --workers 4`
        );
      }
    }

    let descriptor;
    try {
      descriptor = resolveAlgorithm((args.algorithm as string | undefined) ?? DEFAULT_ALGORITHM);
    } catch (e) {
      if (e instanceof UnknownAlgorithmError) throw NounVerbError.invalidInput(e.message);
      throw e;
    }
    if (descriptor.category !== 'event-log') {
      throw NounVerbError.invalidInput(
        `log batch runs event-log algorithms on XES files; '${descriptor.id}' is ${descriptor.category}`
      );
    }

    const stats = await fs.stat(directory).catch(() => null);
    if (!stats || !stats.isDirectory()) {
      throw NounVerbError.invalidInput(`Directory not found: ${directory}`);
    }
    const logFiles = await findXesLogs(directory);
    if (logFiles.length === 0) {
      throw NounVerbError.invalidInput(`No .xes files found in: ${directory}`);
    }

    const loader = WasmLoader.getInstance();
    try {
      await loader.init();
    } catch (e) {
      throw NounVerbError.executionError(
        `WASM initialization failed: ${e instanceof Error ? e.message : String(e)}. Run "wpm system doctor" to diagnose.`
      );
    }
    const kernel = new Kernel(loader.get() as never);
    await kernel.init();

    const runner = new BatchRunner({
      algorithm: descriptor.id,
      kernel,
      workers,
      activityKey: (args['activity-key'] as string | undefined) ?? 'concept:name',
    });
    const result = await runner.run(logFiles);
    const failed = result.summary.failed + result.summary.timedOut;

    return {
      status: result.summary.successful > 0 ? 'completed' : 'failed',
      algorithm: descriptor.id,
      directory,
      logCount: logFiles.length,
      summary: result.summary,
      per_file_results: result.results.map((r) => ({
        log: r.logPath,
        status: r.status,
        elapsed_ms: r.elapsedMs,
        ...(typeof r.result?.hash === 'string' ? { output_hash: r.result.hash } : {}),
        ...(r.error ? { error: r.error } : {}),
      })),
      success_count: result.summary.successful,
      failure_count: failed,
      total_duration_ms: Math.round(performance.now() - t0),
      ...(failed > 0 ? { exitCode: EXIT_CODES.partial_failure } : {}),
    };
  },
});
