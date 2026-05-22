import { defineCommand } from 'citty';
import * as fs from 'fs/promises';
import * as path from 'path';
import { emitResult, makeResult, makeErrorResult } from '../output.js';
import { EXIT_CODES } from '../exit-codes.js';
import { loadAlgorithmFeedback, getAlgorithmStats, type FeedbackRecord } from '@wasm4pm/observability';
import { exitWithFlush } from '../otel/exit.js';
import { withSpan } from './_otel.js';

interface FeedbackStatsPayload {
  schema: string;
  algorithm: string;
  count: number;
  meanFitness: number;
  medianFitness: number;
  meanPrecision: number | null;
  bucketStats: Record<string, { count: number; meanFitness: number }>;
}

interface FeedbackClearPayload {
  schema: string;
  status: string;
  algorithms_deleted: string[];
  records_deleted: number;
}

interface FeedbackExportPayload {
  schema: string;
  status: string;
  file: string;
  records_exported: number;
  algorithms_included: string[];
}

/**
 * Feedback utility command — inspect and manage algorithm feedback data
 *
 * Subcommands:
 * - wpm feedback stats [--algorithm <algo>]          Show aggregated stats for algorithm(s)
 * - wpm feedback clear [--algorithm <algo>]          Clear feedback data
 * - wpm feedback export [--algorithm <algo>] [--out <file>]  Export feedback to CSV
 */
export const feedback = defineCommand({
  meta: {
    name: 'feedback',
    description: 'Manage algorithm feedback data and quality metrics. Example: wpm feedback stats --algorithm genetic',
  },
  subCommands: {
    stats: defineCommand({
      meta: {
        name: 'stats',
        description: 'Show aggregated statistics for algorithm feedback',
      },
      args: {
        algorithm: {
          type: 'string',
          description: 'Algorithm ID (e.g., dfg, heuristic_miner). If omitted, shows all',
          alias: 'a',
        },
        format: {
          type: 'string',
          description: 'Output format (human or json)',
          default: 'human',
        },
      },
      async run(ctx) {
        const format = (ctx.args.format as 'json' | 'human') ?? 'human';
        const algorithmFilter = ctx.args.algorithm as string | undefined;

        return withSpan(
          'feedback_stats',
          { algorithm: algorithmFilter || 'all' },
          async () => {
            try {
              const t0 = Date.now();

              // If algorithm filter provided, load stats for that one
              // Otherwise, scan feedback directory for all algorithms
              const feedbackDir = path.resolve(process.cwd(), '.wasm4pm', 'algorithm-feedback');
              let algorithms: string[] = [];

              if (algorithmFilter) {
                algorithms = [algorithmFilter];
              } else {
                // Scan directory for all feedback files
                try {
                  const files = await fs.readdir(feedbackDir);
                  algorithms = files
                    .filter((f) => f.endsWith('_feedback.jsonl'))
                    .map((f) => f.replace('_feedback.jsonl', ''));
                } catch {
                  // Directory doesn't exist yet
                  algorithms = [];
                }
              }

              if (algorithms.length === 0) {
                const payload = {
                  schema: 'chatmangpt.wasm4pm.feedback.stats.v1',
                  status: 'no_data',
                  message: algorithmFilter
                    ? `No feedback data for algorithm: ${algorithmFilter}`
                    : 'No feedback data available. Run discovery/conformance commands first.',
                };
                const result = makeResult('feedback stats', payload, Date.now() - t0, EXIT_CODES.success);
                emitResult(result, { format, verbose: false, quiet: false });
                return await exitWithFlush(EXIT_CODES.success);
              }

              // Load stats for each algorithm
              const allStats: Record<string, FeedbackStatsPayload> = {};
              for (const algo of algorithms) {
                const stats = await getAlgorithmStats(algo);
                allStats[algo] = {
                  schema: 'chatmangpt.wasm4pm.feedback.stats.v1',
                  algorithm: algo,
                  count: stats.count,
                  meanFitness: stats.meanFitness,
                  medianFitness: stats.medianFitness,
                  meanPrecision: stats.meanPrecision,
                  bucketStats: stats.bucketStats,
                };
              }

              const elapsedMs = Date.now() - t0;
              const result = makeResult('feedback stats', allStats, elapsedMs, EXIT_CODES.success);

              emitResult(result, { format, verbose: false, quiet: false }, (res, projection) => {
                printFeedbackStats(res.payload, projection);
              });

              return await exitWithFlush(EXIT_CODES.success);
            } catch (error) {
              const result = makeErrorResult(
                'feedback stats',
                error,
                EXIT_CODES.execution_error,
                'EXECUTION_ERROR'
              );
              emitResult(result, { format, verbose: false, quiet: false });
              return await exitWithFlush(result.exit_code);
            }
          }
        );
      },
    }),

    clear: defineCommand({
      meta: {
        name: 'clear',
        description: 'Clear feedback data for algorithm(s)',
      },
      args: {
        algorithm: {
          type: 'string',
          description: 'Algorithm ID to clear. If omitted, clears all',
          alias: 'a',
        },
        confirm: {
          type: 'boolean',
          description: 'Skip confirmation prompt',
          alias: 'y',
        },
      },
      async run(ctx) {
        const algorithmFilter = ctx.args.algorithm as string | undefined;
        const skipConfirm = Boolean(ctx.args.confirm);

        return withSpan(
          'feedback_clear',
          { algorithm: algorithmFilter || 'all' },
          async () => {
            try {
              const t0 = Date.now();
              const feedbackDir = path.resolve(process.cwd(), '.wasm4pm', 'algorithm-feedback');

              // Determine which files to delete
              let filesToDelete: string[] = [];
              if (algorithmFilter) {
                filesToDelete = [`${algorithmFilter}_feedback.jsonl`];
              } else {
                // Scan directory for all feedback files
                try {
                  const files = await fs.readdir(feedbackDir);
                  filesToDelete = files.filter((f) => f.endsWith('_feedback.jsonl'));
                } catch {
                  // Directory doesn't exist
                  const payload: FeedbackClearPayload = {
                    schema: 'chatmangpt.wasm4pm.feedback.clear.v1',
                    status: 'success',
                    algorithms_deleted: [],
                    records_deleted: 0,
                  };
                  const result = makeResult('feedback clear', payload, Date.now() - t0, EXIT_CODES.success);
                  emitResult(result, { format: 'human', verbose: false, quiet: false });
                  return await exitWithFlush(EXIT_CODES.success);
                }
              }

              if (filesToDelete.length === 0) {
                const payload: FeedbackClearPayload = {
                  schema: 'chatmangpt.wasm4pm.feedback.clear.v1',
                  status: 'success',
                  algorithms_deleted: [],
                  records_deleted: 0,
                };
                const result = makeResult('feedback clear', payload, Date.now() - t0, EXIT_CODES.success);
                emitResult(result, { format: 'human', verbose: false, quiet: false });
                return await exitWithFlush(EXIT_CODES.success);
              }

              // Count records before deletion
              let totalRecords = 0;
              for (const file of filesToDelete) {
                try {
                  const content = await fs.readFile(path.join(feedbackDir, file), 'utf8');
                  totalRecords += content.split('\n').filter((l) => l.trim()).length;
                } catch {
                  // File doesn't exist or can't be read
                }
              }

              // Delete files
              const deletedAlgos: string[] = [];
              for (const file of filesToDelete) {
                try {
                  await fs.unlink(path.join(feedbackDir, file));
                  const algo = file.replace('_feedback.jsonl', '');
                  deletedAlgos.push(algo);
                } catch {
                  // File deletion failed — continue with others
                }
              }

              const payload: FeedbackClearPayload = {
                schema: 'chatmangpt.wasm4pm.feedback.clear.v1',
                status: 'success',
                algorithms_deleted: deletedAlgos,
                records_deleted: totalRecords,
              };

              const result = makeResult('feedback clear', payload, Date.now() - t0, EXIT_CODES.success);
              emitResult(result, { format: 'human', verbose: false, quiet: false }, (res, projection) => {
                if (deletedAlgos.length > 0) {
                  projection.success(`Cleared ${totalRecords} feedback records from ${deletedAlgos.length} algorithm(s)`);
                  projection.log(`Deleted: ${deletedAlgos.join(', ')}`);
                } else {
                  projection.log('No feedback files found to delete');
                }
              });

              return await exitWithFlush(EXIT_CODES.success);
            } catch (error) {
              const result = makeErrorResult(
                'feedback clear',
                error,
                EXIT_CODES.execution_error,
                'EXECUTION_ERROR'
              );
              emitResult(result, { format: 'human', verbose: false, quiet: false });
              return await exitWithFlush(result.exit_code);
            }
          }
        );
      },
    }),

    export: defineCommand({
      meta: {
        name: 'export',
        description: 'Export feedback data to CSV',
      },
      args: {
        algorithm: {
          type: 'string',
          description: 'Algorithm ID. If omitted, exports all',
          alias: 'a',
        },
        out: {
          type: 'string',
          description: 'Output file path (default: ./algorithm-feedback.csv)',
          alias: 'o',
        },
      },
      async run(ctx) {
        const algorithmFilter = ctx.args.algorithm as string | undefined;
        const outputFile = (ctx.args.out as string) || './algorithm-feedback.csv';

        return withSpan(
          'feedback_export',
          { algorithm: algorithmFilter || 'all', output: outputFile },
          async () => {
            try {
              const t0 = Date.now();
              const feedbackDir = path.resolve(process.cwd(), '.wasm4pm', 'algorithm-feedback');

              // Determine which files to export
              let algorithms: string[] = [];
              if (algorithmFilter) {
                algorithms = [algorithmFilter];
              } else {
                try {
                  const files = await fs.readdir(feedbackDir);
                  algorithms = files
                    .filter((f) => f.endsWith('_feedback.jsonl'))
                    .map((f) => f.replace('_feedback.jsonl', ''));
                } catch {
                  // Directory doesn't exist
                  algorithms = [];
                }
              }

              if (algorithms.length === 0) {
                const payload: FeedbackExportPayload = {
                  schema: 'chatmangpt.wasm4pm.feedback.export.v1',
                  status: 'no_data',
                  file: outputFile,
                  records_exported: 0,
                  algorithms_included: [],
                };
                const result = makeResult('feedback export', payload, Date.now() - t0, EXIT_CODES.success);
                emitResult(result, { format: 'human', verbose: false, quiet: false });
                return await exitWithFlush(EXIT_CODES.success);
              }

              // Collect all records
              const allRecords: FeedbackRecord[] = [];
              for (const algo of algorithms) {
                const records = await loadAlgorithmFeedback(algo);
                allRecords.push(...records);
              }

              if (allRecords.length === 0) {
                const payload: FeedbackExportPayload = {
                  schema: 'chatmangpt.wasm4pm.feedback.export.v1',
                  status: 'success',
                  file: outputFile,
                  records_exported: 0,
                  algorithms_included: algorithms,
                };
                const result = makeResult('feedback export', payload, Date.now() - t0, EXIT_CODES.success);
                emitResult(result, { format: 'human', verbose: false, quiet: false });
                return await exitWithFlush(EXIT_CODES.success);
              }

              // Convert to CSV
              const headers = [
                'algorithm',
                'log_size_bucket',
                'timestamp',
                'execution_time_ms',
                'fitness',
                'precision',
                'generalization',
                'simplicity',
              ];
              const rows = allRecords.map((r) => [
                r.algorithm,
                r.log_size_bucket,
                r.timestamp,
                String(r.execution_time_ms),
                String(r.metrics.fitness),
                String(r.metrics.precision),
                String(r.metrics.generalization),
                String(r.metrics.simplicity),
              ]);

              const csv = [
                headers.join(','),
                ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
              ].join('\n');

              // Write to file
              const fullPath = path.resolve(process.cwd(), outputFile);
              await fs.writeFile(fullPath, csv, 'utf8');

              const payload: FeedbackExportPayload = {
                schema: 'chatmangpt.wasm4pm.feedback.export.v1',
                status: 'success',
                file: fullPath,
                records_exported: allRecords.length,
                algorithms_included: algorithms,
              };

              const result = makeResult('feedback export', payload, Date.now() - t0, EXIT_CODES.success);
              emitResult(result, { format: 'human', verbose: false, quiet: false }, (res, projection) => {
                projection.success(`Exported ${allRecords.length} records to ${fullPath}`);
                projection.log(`Algorithms: ${algorithms.join(', ')}`);
              });

              return await exitWithFlush(EXIT_CODES.success);
            } catch (error) {
              const result = makeErrorResult(
                'feedback export',
                error,
                EXIT_CODES.execution_error,
                'EXECUTION_ERROR'
              );
              emitResult(result, { format: 'human', verbose: false, quiet: false });
              return await exitWithFlush(result.exit_code);
            }
          }
        );
      },
    }),
  },
});

import type { ConsoleProjection } from '../output.js';

function printFeedbackStats(payload: Record<string, FeedbackStatsPayload>, projection: ConsoleProjection): void {
  projection.log('');
  projection.success('Algorithm Feedback Statistics');
  projection.log('');

  for (const [algo, stats] of Object.entries(payload)) {
    if (algo === 'schema') continue;

    projection.log(`  ${stats.algorithm}`);
    projection.log(`    Records: ${stats.count}`);
    projection.log(`    Mean fitness: ${stats.meanFitness.toFixed(3)}`);
    projection.log(`    Median fitness: ${stats.medianFitness.toFixed(3)}`);

    if (stats.meanPrecision !== null) {
      projection.log(`    Mean precision: ${stats.meanPrecision.toFixed(3)}`);
    }

    if (Object.keys(stats.bucketStats).length > 0) {
      projection.log('    By log size:');
      for (const [bucket, bucketStat] of Object.entries(stats.bucketStats)) {
        projection.log(`      ${bucket} events: ${bucketStat.count} runs (mean fitness: ${bucketStat.meanFitness.toFixed(3)})`);
      }
    }
    projection.log('');
  }
}
