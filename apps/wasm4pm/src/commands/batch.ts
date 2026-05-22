/**
 * batch.ts
 * Command for batch processing of multiple event logs in parallel
 * Discovers process models across multiple logs with configurable concurrency
 */

import { defineCommand } from 'citty';
import * as fs from 'fs/promises';
import * as path from 'path';
import { randomUUID } from 'node:crypto';
import { BatchRunner, type BatchConfig, type BatchResult } from 'wasm4pm';
import { emitResult, makeResult, makeErrorResult, type CommandResult } from '../output.js';
import { EXIT_CODES } from '../exit-codes.js';
import { exitWithFlush } from '../otel/exit.js';
import { withSpan } from './_otel.js';
import { createHash } from 'node:crypto';

/**
 * Payload type for batch command results
 */
interface BatchPayload {
  status: 'completed' | 'failed';
  summary: BatchResult['summary'];
  logCount: number;
  /** Only present in human format — JSON consumers use summary fields directly */
  output?: string;
  /** Structured per-file results for JSON consumers */
  per_file_results?: Array<{ log: string; status: string; elapsed_ms: number; error?: string }>;
  /** Total wall-clock duration in milliseconds */
  total_duration_ms?: number;
  /** Count of successfully processed logs */
  success_count?: number;
  /** Count of failed logs */
  failure_count?: number;
}

/**
 * Discover all XES/JSON event log files in a directory recursively
 */
async function findLogFiles(directory: string): Promise<string[]> {
  const files: string[] = [];

  async function walk(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') {
        continue;
      }
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.name.endsWith('.xes') || entry.name.endsWith('.json')) {
        files.push(fullPath);
      }
    }
  }

  await walk(directory);
  return files;
}

/**
 * Format elapsed time in human-readable format
 */
function formatTime(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

/**
 * Save batch execution receipt to .wasm4pm/receipts/
 */
async function saveBatchReceipt(
  batchResult: BatchResult,
  elapsedMs: number,
  inputFiles: string[],
): Promise<string> {
  const receiptDir = path.resolve('.wasm4pm/receipts');
  await fs.mkdir(receiptDir, { recursive: true });

  const now = new Date();
  const timestamp = now.toISOString();

  // Compute hashes for receipt chain
  const inputHash = createHash('sha256')
    .update(JSON.stringify({ files: inputFiles, count: inputFiles.length }))
    .digest('hex');

  const outputHash = createHash('sha256')
    .update(JSON.stringify(batchResult.summary))
    .digest('hex');

  const receipt = {
    run_id: randomUUID(),
    timestamp,
    duration_ms: elapsedMs,
    input_hash: inputHash,
    output_hash: outputHash,
    status: batchResult.summary.failed > 0 ? 'partial' : 'success',
    batch_summary: batchResult.summary,
    log_count: inputFiles.length,
  };

  const receiptPath = path.join(receiptDir, `batch-${receipt.run_id}.json`);
  await fs.writeFile(receiptPath, JSON.stringify(receipt, null, 2));

  return receiptPath;
}

/**
 * Format summary statistics as human-readable text
 */
function formatBatchSummary(result: BatchResult): string {
  const { summary } = result;
  const lines: string[] = [];
  lines.push('');
  lines.push('BATCH PROCESSING SUMMARY');
  lines.push('═'.repeat(50));
  lines.push(`Total logs:          ${summary.totalLogs}`);
  lines.push(`Successful:          ${summary.successful}`);
  lines.push(`Failed:              ${summary.failed}`);
  lines.push(`Timed out:           ${summary.timedOut}`);
  lines.push(`Success rate:        ${(summary.successRate * 100).toFixed(1)}%`);
  lines.push('');
  lines.push('TIMING STATISTICS');
  lines.push('─'.repeat(50));
  lines.push(`Total time:          ${formatTime(summary.totalElapsedMs)}`);
  lines.push(`Average per log:     ${formatTime(summary.averageElapsedMs)}`);
  lines.push(`Fastest log:         ${formatTime(summary.minElapsedMs)}`);
  lines.push(`Slowest log:         ${formatTime(summary.maxElapsedMs)}`);
  lines.push('');
  return lines.join('\n');
}

/**
 * Format per-log results (optionally with verbosity)
 */
function formatLogResults(results: BatchResult, verbose: boolean): string[] {
  const lines: string[] = [];
  if (verbose) {
    lines.push('PER-LOG RESULTS');
    lines.push('─'.repeat(50));
    for (const logResult of results.results) {
      const status = logResult.status === 'success' ? '✓' : '✗';
      lines.push(`${status} ${path.basename(logResult.logPath)}: ${formatTime(logResult.elapsedMs)}`);
      if (logResult.error) {
        lines.push(`  Error: ${logResult.error}`);
      }
    }
    lines.push('');
  }
  return lines;
}

export const batch = defineCommand({
  meta: {
    name: 'batch',
    description:
      'Batch process multiple event logs in parallel. Discovers process models across all XES/JSON files in a directory. Ex: wpm batch ./logs --algorithm dfg --workers 4',
  },
  args: {
    directory: {
      type: 'positional',
      description: 'Directory containing XES/JSON event logs',
      required: true,
    },
    algorithm: {
      type: 'string',
      description: 'Discovery algorithm to use (default: heuristic)',
      default: 'heuristic',
    },
    workers: {
      type: 'string',
      description: 'Number of parallel workers (default: CPU count)',
    },
    'no-save': {
      type: 'boolean',
      description: 'Skip auto-saving batch results to .wasm4pm/results/',
      default: false,
    },
    timeout: {
      type: 'string',
      description: 'Timeout per log in seconds (default: 300)',
    },
    format: {
      type: 'string',
      description: 'Output format: human, json, jsonl, or sarif',
      default: 'human',
    },
    verbose: {
      type: 'boolean',
      description: 'Show per-log details in output',
      default: false,
    },
  },
  async run(ctx) {
    const t0 = performance.now();

    // Parse and validate arguments
    const directory = String(ctx.args.directory ?? '');
    const algorithm = String(ctx.args.algorithm ?? 'heuristic');
    const workersStr = ctx.args.workers ? String(ctx.args.workers) : undefined;
    const workers = workersStr ? parseInt(workersStr, 10) : undefined;
    const timeoutStr = ctx.args.timeout ? String(ctx.args.timeout) : '300';
    const timeoutSeconds = parseInt(timeoutStr, 10);
    const timeout = timeoutSeconds * 1000;
    const formatStr = String(ctx.args.format ?? 'human');
    const format = formatStr as 'json' | 'sarif' | 'jsonl' | 'human';
    const verbose = ctx.args.verbose === true;
    const noSave = ctx.args['no-save'] === true;

    // Validate --workers: must be a positive integer when provided
    if (workersStr !== undefined) {
      if (isNaN(workers!) || !Number.isInteger(workers) || workers! <= 0) {
        const errResult = makeErrorResult(
          'batch',
          new Error(
            `--workers must be a positive integer (got: ${workersStr}). Example: --workers 4`
          ),
          EXIT_CODES.config_error,
          'CONFIG_ERROR'
        );
        emitResult(errResult, { format, quiet: false });
        return await exitWithFlush(errResult.exit_code);
      }
    }

    const spanAttrs: Record<string, string | number> = { directory, algorithm };
    if (workers !== undefined) {
      spanAttrs.worker_count = workers;
    }

    return withSpan('batch.run', spanAttrs, async () => {
      try {
        // Validate directory exists
        const dirStats = await fs.stat(directory).catch(() => null);
        if (!dirStats || !dirStats.isDirectory()) {
          const errResult = makeErrorResult(
            'batch',
            new Error(`Directory not found: ${directory}`),
            EXIT_CODES.source_error,
            'BATCH_DIRECTORY_NOT_FOUND'
          );
          emitResult(errResult, { format, quiet: false });
          return await exitWithFlush(errResult.exit_code);
        }

        // Find all log files
        const logFiles = await findLogFiles(directory);
        if (logFiles.length === 0) {
          const errResult = makeErrorResult(
            'batch',
            new Error(`No XES/JSON files found in: ${directory}`),
            EXIT_CODES.source_error,
            'BATCH_NO_LOGS_FOUND'
          );
          emitResult(errResult, { format, quiet: false });
          return await exitWithFlush(errResult.exit_code);
        }

        // Run batch processing
        const batchConfig: BatchConfig = {
          algorithm,
          workers,
          timeout,
          activityKey: 'concept:name',
          verbose,
        };

        const runner = new BatchRunner(batchConfig);
        const result = await runner.run(logFiles);

        const elapsedMs = performance.now() - t0;
        const exitCode =
          result.summary.failed > 0 || result.summary.timedOut > 0
            ? EXIT_CODES.partial_failure
            : EXIT_CODES.success;

        // Save receipt for audit trail
        let receiptPath: string | undefined;
        if (!noSave) {
          receiptPath = await saveBatchReceipt(result, elapsedMs, logFiles);
        }

        // Build structured payload — JSON consumers get machine-readable fields,
        // human consumers get a formatted string in the `output` field.
        const perFileResults = result.results?.map((r) => ({
          log: r.logPath,
          status: r.status,
          elapsed_ms: r.elapsedMs,
          ...(r.error ? { error: r.error } : {}),
        })) ?? [];

        const payload: BatchPayload = {
          status: result.summary.successful > 0 ? 'completed' : 'failed',
          summary: result.summary,
          logCount: logFiles.length,
          per_file_results: perFileResults,
          total_duration_ms: Math.round(elapsedMs),
          success_count: result.summary.successful,
          failure_count: result.summary.failed,
        };

        // Human format: embed formatted text in `output` field
        if (format !== 'json' && format !== 'jsonl' && format !== 'sarif') {
          payload.output = formatBatchSummary(result) + formatLogResults(result, verbose).join('\n');
        }

        const successResult = makeResult('batch', payload, elapsedMs, exitCode);

        emitResult(successResult, { format, quiet: false });

        return await exitWithFlush(exitCode);
      } catch (error) {
        const elapsedMs = performance.now() - t0;
        const msg = error instanceof Error ? error.message : String(error);
        const errResult = makeErrorResult(
          'batch',
          new Error(msg),
          EXIT_CODES.execution_error,
          'BATCH_EXECUTION_FAILED'
        );
        emitResult(errResult, { format, quiet: false });
        return await exitWithFlush(errResult.exit_code);
      }
    });
  },
});
