/**
 * batch.ts
 * Command for batch processing of multiple event logs in parallel
 * Discovers process models across multiple logs with configurable concurrency
 */

import { defineCommand } from 'citty';
import * as fs from 'fs/promises';
import * as path from 'path';
import { BatchRunner, type BatchConfig, type BatchResult } from '@wasm4pm/kernel';
import { emitResult, makeResult, makeErrorResult, type CommandResult } from '../output.js';
import { EXIT_CODES } from '../exit-codes.js';
import { exitWithFlush } from '../otel/exit.js';
import { withSpan } from './_otel.js';

/**
 * Payload type for batch command results
 */
interface BatchPayload {
  status: 'completed' | 'failed';
  summary: BatchResult['summary'];
  logCount: number;
  output: string;
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

        // Format output
        let output = '';
        if (format === 'json' || format === 'jsonl' || format === 'sarif') {
          output = JSON.stringify(result, null, 2);
        } else {
          output = formatBatchSummary(result);
          output += formatLogResults(result, verbose).join('\n');
        }

        const elapsedMs = performance.now() - t0;
        const exitCode =
          result.summary.failed > 0 || result.summary.timedOut > 0
            ? EXIT_CODES.partial_failure
            : EXIT_CODES.success;

        const payload: BatchPayload = {
          status: result.summary.successful > 0 ? 'completed' : 'failed',
          summary: result.summary,
          logCount: logFiles.length,
          output,
        };

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
