/**
 * wpm cache — Cache management for discovery results, models, and conformance entries
 *
 * Subcommands:
 *   wpm cache stats          # Show meaningful cache statistics across all layers
 *   wpm cache clear          # Clear all caches
 *   wpm cache clear --type logs|results|conformance  # Clear one layer
 *   wpm cache warm -i log.xes  # Pre-load log into cache
 *   wpm cache purge          # Remove only expired entries
 *   wpm cache models         # Manage model sub-cache
 */

import { defineCommand } from 'citty';
import {
  getDiscoveryCache,
  getModelCache,
  getConformanceCache,
} from '@wasm4pm/observability';
import { emitResult, makeResult } from '../output.js';
import { EXIT_CODES } from '../exit-codes.js';
import { withSpan } from './_otel.js';
import { withLogSession } from '../with-log-session.js';
import * as path from 'node:path';

/** Format bytes as human-readable size. */
function fmtBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/** Format duration in milliseconds as human-readable. */
function fmtAge(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(0)}s`;
  if (ms < 3_600_000) return `${(ms / 60_000).toFixed(0)}m`;
  return `${(ms / 3_600_000).toFixed(1)}h`;
}

export default defineCommand({
  meta: {
    name: 'cache',
    description:
      'Manage algorithm result, model, and conformance caches.\n\n' +
      'EXAMPLES:\n' +
      '  wpm cache stats                    # Show statistics for all cache layers\n' +
      '  wpm cache clear                    # Clear all caches\n' +
      '  wpm cache clear --type results     # Clear only algorithm result cache\n' +
      '  wpm cache clear --type models      # Clear only model cache\n' +
      '  wpm cache clear --type conformance # Clear conformance cache\n' +
      '  wpm cache warm -i log.xes          # Pre-load log into cache\n' +
      '  wpm cache purge                    # Remove expired entries only',
  },
  subCommands: {

    // ── stats ───────────────────────────────────────────────────────────────

    stats: defineCommand({
      meta: {
        name: 'stats',
        description: 'Show comprehensive statistics for all cache layers',
      },
      args: {
        format: { type: 'string', description: 'Output format: human (default) or json' },
      },
      async run(ctx) {
        const format = ((ctx.args as Record<string, unknown>).format as string | undefined) ?? 'human';
        const emitOptions = { format: format as 'human' | 'json' };
        const t0 = Date.now();

        return withSpan('cache.stats', {}, async () => {
          const discoveryCache = getDiscoveryCache();
          const modelCache = getModelCache();
          const conformanceCache = getConformanceCache();

          const discStats = discoveryCache.stats();
          const modelStats = modelCache.modelStats();
          const confStats = conformanceCache.stats();

          const discHitRate = discStats.hits + discStats.misses > 0
            ? (discStats.hits / (discStats.hits + discStats.misses)) * 100
            : 0;
          const modelHitRate = modelStats.hit_rate * 100;

          const payload = {
            algorithm_result_cache: {
              entries: discStats.entries,
              size_bytes: discStats.bytes_used,
              size_human: fmtBytes(discStats.bytes_used),
              hits: discStats.hits,
              misses: discStats.misses,
              hit_rate_percent: discHitRate.toFixed(1),
              avg_age: fmtAge(discStats.avg_age_ms),
              cached_algorithms: discoveryCache.getCachedAlgorithms(),
            },
            model_cache: {
              entries: modelStats.models,
              size_bytes: modelStats.bytes_used,
              size_human: fmtBytes(modelStats.bytes_used),
              hits: modelStats.total_hits,
              misses: modelStats.total_misses,
              hit_rate_percent: modelHitRate.toFixed(1),
              avg_age: fmtAge(modelStats.avg_model_age_ms),
              time_saved_ms: modelStats.time_saved_ms,
              models_by_algorithm: modelStats.models_by_algorithm,
            },
            conformance_cache: {
              entries: confStats.entries,
              size_bytes: confStats.bytes_used,
              size_human: fmtBytes(confStats.bytes_used),
              hits: confStats.hits,
              misses: confStats.misses,
              hit_rate_percent: confStats.hits + confStats.misses > 0
                ? ((confStats.hits / (confStats.hits + confStats.misses)) * 100).toFixed(1)
                : '0.0',
              ttl: '24 hours',
            },
            totals: {
              total_entries: discStats.entries + modelStats.models + confStats.entries,
              total_size_bytes: discStats.bytes_used + modelStats.bytes_used + confStats.bytes_used,
              total_size_human: fmtBytes(discStats.bytes_used + modelStats.bytes_used + confStats.bytes_used),
            },
          };

          const result = makeResult('cache.stats', payload, Date.now() - t0, EXIT_CODES.success);

          emitResult(result, emitOptions, (_res, p) => {
            p.log('');
            p.log('Cache Statistics');
            p.log('=================');

            p.log('');
            p.log('Algorithm result cache:');
            p.log(`  Entries:    ${discStats.entries} results cached`);
            p.log(`  Size:       ${fmtBytes(discStats.bytes_used)}`);
            p.log(`  Hit rate:   ${discHitRate.toFixed(1)}% (${discStats.hits} hits / ${discStats.hits + discStats.misses} total)`);
            if (discStats.avg_age_ms > 0) p.log(`  Avg age:    ${fmtAge(discStats.avg_age_ms)}`);
            const algos = discoveryCache.getCachedAlgorithms();
            if (algos.length > 0) p.log(`  Algorithms: ${algos.join(', ')}`);

            p.log('');
            p.log('Model cache:');
            p.log(`  Entries:    ${modelStats.models} models cached`);
            p.log(`  Size:       ${fmtBytes(modelStats.bytes_used)}`);
            p.log(`  Hit rate:   ${modelHitRate.toFixed(1)}%`);
            if (modelStats.time_saved_ms > 0)
              p.log(`  Time saved: ${fmtAge(modelStats.time_saved_ms)} via cache hits`);

            p.log('');
            p.log('Conformance cache:');
            p.log(`  Entries:    ${confStats.entries} entries`);
            p.log(`  Size:       ${fmtBytes(confStats.bytes_used)}`);
            p.log(`  TTL:        24 hours`);
            p.log(`  Hit rate:   ${payload.conformance_cache.hit_rate_percent}%`);

            const totalSize = discStats.bytes_used + modelStats.bytes_used + confStats.bytes_used;
            if (totalSize > 0) {
              p.log('');
              p.log(`Total cache size: ${fmtBytes(totalSize)}`);
            }

            p.log('');
            p.log('  wpm cache clear          # Clear all caches');
            p.log('  wpm cache clear --type results      # Clear algorithm results');
            p.log('  wpm cache warm -i log.xes           # Pre-warm log cache');
            p.log('');
          });

          return EXIT_CODES.success;
        });
      },
    }),

    // ── clear ───────────────────────────────────────────────────────────────

    clear: defineCommand({
      meta: {
        name: 'clear',
        description: 'Clear cache entries. Use --type to target a specific layer.',
      },
      args: {
        type: {
          type: 'string',
          description: 'Cache layer to clear: results, models, conformance, or all (default: all)',
          default: 'all',
        },
        algorithm: {
          type: 'string',
          description: 'Clear only entries for a specific algorithm (result cache only)',
        },
        all: {
          type: 'boolean',
          description: 'Clear all cache layers (default when no --type given)',
        },
        format: { type: 'string', description: 'Output format: human (default) or json' },
      },
      async run(ctx) {
        const args = ctx.args as Record<string, unknown>;
        const format = (args.format as string | undefined) ?? 'human';
        const cacheType = (args.type as string | undefined) ?? 'all';
        const algorithm = args.algorithm as string | undefined;
        const clearAll = cacheType === 'all' || Boolean(args.all);
        const emitOptions = { format: format as 'human' | 'json' };
        const t0 = Date.now();

        return withSpan('cache.clear', { type: cacheType, algorithm: algorithm ?? 'all' }, async () => {
          const discoveryCache = getDiscoveryCache();
          const modelCache = getModelCache();
          const conformanceCache = getConformanceCache();

          let clearedResults = 0;
          let clearedModels = 0;
          let clearedConformance = 0;

          if (clearAll || cacheType === 'results') {
            if (algorithm) {
              clearedResults = discoveryCache.invalidateByAlgorithm(algorithm);
            } else {
              clearedResults = discoveryCache.stats().entries;
              discoveryCache.clear();
            }
          }
          if (clearAll || cacheType === 'models') {
            clearedModels = modelCache.modelStats().models;
            modelCache.clear();
          }
          if (clearAll || cacheType === 'conformance') {
            clearedConformance = conformanceCache.stats().entries;
            conformanceCache.clear();
          }

          const totalCleared = clearedResults + clearedModels + clearedConformance;
          const payload = {
            cache_type_cleared: cacheType,
            algorithm_filter: algorithm ?? null,
            cleared: {
              results: clearedResults,
              models: clearedModels,
              conformance: clearedConformance,
              total: totalCleared,
            },
          };

          const result = makeResult('cache.clear', payload, Date.now() - t0, EXIT_CODES.success);

          emitResult(result, emitOptions, (_res, p) => {
            p.log('');
            if (totalCleared === 0) {
              p.info('Cache was already empty');
            } else {
              p.success(`Cache cleared: ${totalCleared} entries removed`);
              if (clearAll) {
                p.log(`  Algorithm results: ${clearedResults}`);
                p.log(`  Models:            ${clearedModels}`);
                p.log(`  Conformance:       ${clearedConformance}`);
              } else {
                p.log(`  Cleared layer: ${cacheType} (${totalCleared} entries)`);
              }
            }
            p.log('');
          });

          return EXIT_CODES.success;
        });
      },
    }),

    // ── warm ────────────────────────────────────────────────────────────────

    warm: defineCommand({
      meta: {
        name: 'warm',
        description: 'Pre-load an event log into cache to speed up subsequent operations',
      },
      args: {
        input: { type: 'positional', description: 'Path to event log (.xes)', required: false },
        file: { type: 'string', description: 'Path to event log', alias: 'i' },
        algorithm: {
          type: 'string',
          description: 'Algorithm to pre-warm (default: dfg — fastest load)',
          default: 'dfg',
          alias: 'a',
        },
        format: { type: 'string', description: 'Output format: human (default) or json' },
      },
      async run(ctx) {
        const args = ctx.args as Record<string, unknown>;
        const format = (args.format as string | undefined) ?? 'human';
        const inputPath = (args.input as string | undefined) ?? (args.file as string | undefined);
        const algorithm = (args.algorithm as string | undefined) ?? 'dfg';
        const emitOptions = { format: format as 'human' | 'json' };
        const t0 = Date.now();

        if (!inputPath) {
          const result = {
            command: 'cache.warm',
            status: 'error' as const,
            message: 'No input file provided. Usage: wpm cache warm -i log.xes',
            exit_code: EXIT_CODES.source_error,
            payload: {},
            error: { code: 'INPUT_REQUIRED', message: 'No input file provided' },
            meta: {
              run_id: crypto.randomUUID(),
              timestamp: new Date().toISOString(),
              duration_ms: 0,
              version: '0.0.0',
            },
          };
          emitResult(result as Parameters<typeof emitResult>[0], emitOptions);
          return EXIT_CODES.source_error;
        }

        return withSpan('cache.warm', { algorithm, input: inputPath }, async () => {
          const logFile = path.basename(inputPath);

          await withLogSession(
            { inputPath, activityKey: 'concept:name', commandName: 'cache.warm', emitOptions },
            async (wasm, logHandle) => {
              // Run the chosen algorithm to warm the cache
              const discoveryFn = `discover_${algorithm}` as string;
              let warmed = false;
              try {
                if (typeof wasm[discoveryFn] === 'function') {
                  (wasm[discoveryFn] as (h: string, k: string) => unknown)(logHandle, 'concept:name');
                  warmed = true;
                }
              } catch {
                /* non-fatal — log is at least loaded into WASM memory */
              }

              const elapsedMs = Date.now() - t0;
              const payload = {
                log_file: logFile,
                algorithm,
                warmed,
                elapsed_ms: elapsedMs,
                cache_status: 'log loaded into WASM memory',
              };

              const result = makeResult('cache.warm', payload, elapsedMs, EXIT_CODES.success);

              emitResult(result, emitOptions, (_res, p) => {
                p.log('');
                if (warmed) {
                  p.success(`Cache warmed: ${logFile} (${algorithm}, ${elapsedMs}ms)`);
                  p.log('  Subsequent operations on this log will be faster.');
                } else {
                  p.info(`Log loaded: ${logFile} (${elapsedMs}ms)`);
                  p.log(`  Algorithm '${algorithm}' not available for pre-warming; log is loaded.`);
                }
                p.log('');
              });
            }
          );

          return EXIT_CODES.success;
        });
      },
    }),

    // ── purge ───────────────────────────────────────────────────────────────

    purge: defineCommand({
      meta: {
        name: 'purge',
        description: 'Remove only expired cache entries (non-destructive)',
      },
      args: {
        format: { type: 'string', description: 'Output format: human (default) or json' },
      },
      async run(ctx) {
        const format = ((ctx.args as Record<string, unknown>).format as string | undefined) ?? 'human';
        const emitOptions = { format: format as 'human' | 'json' };
        const t0 = Date.now();

        return withSpan('cache.purge', {}, async () => {
          const discoveryCache = getDiscoveryCache();
          const conformanceCache = getConformanceCache();

          const discPurged = discoveryCache.purgeExpired();
          const confPurged = conformanceCache.purgeExpired();
          const total = discPurged + confPurged;

          const elapsedMs = Date.now() - t0;
          const result = makeResult(
            'cache.purge',
            {
              expired_entries_removed: total,
              results_purged: discPurged,
              conformance_purged: confPurged,
              remaining_results: discoveryCache.stats().entries,
              remaining_conformance: conformanceCache.stats().entries,
            },
            elapsedMs,
            EXIT_CODES.success
          );

          emitResult(result, emitOptions, (_res, p) => {
            p.log('');
            if (total === 0) {
              p.info('No expired entries found');
            } else {
              p.success(`Purged ${total} expired entries`);
              p.log(`  Algorithm results: ${discPurged}`);
              p.log(`  Conformance:       ${confPurged}`);
            }
            p.log('');
          });

          return EXIT_CODES.success;
        });
      },
    }),

    // ── models (sub-cache) ───────────────────────────────────────────────────

    models: defineCommand({
      meta: {
        name: 'models',
        description: 'Manage cached process models (list, stats, clear)',
      },
      subCommands: {
        list: defineCommand({
          meta: { name: 'list', description: 'List all cached process models' },
          args: {
            algorithm: { type: 'string', description: 'Filter by algorithm name (optional)' },
            format: { type: 'string', description: 'Output format: human or json' },
          },
          async run(ctx) {
            const args = ctx.args as Record<string, unknown>;
            const format = (args.format as string | undefined) ?? 'human';
            const algorithm = args.algorithm as string | undefined;
            const emitOptions = { format: format as 'human' | 'json' };
            const t0 = Date.now();

            return withSpan('cache.models.list', { algorithm: algorithm || 'all' }, async () => {
              const modelCache = getModelCache();
              const stats = modelCache.modelStats();
              const cachedAlgos = algorithm ? [algorithm] : modelCache.getCachedAlgorithms();

              const result = makeResult(
                'cache.models.list',
                {
                  cached_models: stats.models,
                  filtered_algorithm: algorithm ?? null,
                  algorithms_with_models: cachedAlgos,
                  hit_rate_percent: (stats.hit_rate * 100).toFixed(1),
                  size_human: fmtBytes(stats.bytes_used),
                },
                Date.now() - t0,
                EXIT_CODES.success
              );

              emitResult(result, emitOptions, (_res, p) => {
                p.log('');
                p.log(`Model cache: ${stats.models} entries, ${fmtBytes(stats.bytes_used)}, ${(stats.hit_rate * 100).toFixed(1)}% hit rate`);
                if (cachedAlgos.length > 0) p.log(`  Algorithms: ${cachedAlgos.join(', ')}`);
                p.log('');
              });

              return EXIT_CODES.success;
            });
          },
        }),

        stats: defineCommand({
          meta: { name: 'stats', description: 'Display comprehensive model cache statistics' },
          async run() {
            const t0 = Date.now();
            return withSpan('cache.models.stats', {}, async () => {
              const modelCache = getModelCache();
              const stats = modelCache.modelStats();

              const result = makeResult(
                'cache.models.stats',
                {
                  models: stats.models,
                  total_hits: stats.total_hits,
                  total_misses: stats.total_misses,
                  hit_rate_percent: (stats.hit_rate * 100).toFixed(1),
                  size_human: fmtBytes(stats.bytes_used),
                  bytes_used: stats.bytes_used,
                  avg_model_age: fmtAge(stats.avg_model_age_ms),
                  time_saved: fmtAge(stats.time_saved_ms),
                  models_by_algorithm: stats.models_by_algorithm,
                },
                Date.now() - t0,
                EXIT_CODES.success
              );

              emitResult(result, { format: 'json' });
              return EXIT_CODES.success;
            });
          },
        }),

        clear: defineCommand({
          meta: { name: 'clear', description: 'Clear cached models' },
          args: {
            algorithm: { type: 'string', description: 'Clear only models for a specific algorithm (optional)' },
          },
          async run(ctx) {
            const args = ctx.args as Record<string, unknown>;
            const algorithm = args.algorithm as string | undefined;
            const t0 = Date.now();

            return withSpan('cache.models.clear', { algorithm: algorithm || 'all' }, async () => {
              const modelCache = getModelCache();
              let cleared = 0;

              if (algorithm) {
                cleared = modelCache.invalidateByAlgorithm(algorithm);
              } else {
                cleared = modelCache.modelStats().models;
                modelCache.clear();
              }

              const result = makeResult(
                'cache.models.clear',
                { algorithm: algorithm ?? null, models_removed: cleared },
                Date.now() - t0,
                EXIT_CODES.success
              );
              emitResult(result, { format: 'json' });
              return EXIT_CODES.success;
            });
          },
        }),
      },
    }),
  },
});
