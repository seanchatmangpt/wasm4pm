import { defineCommand } from 'citty';
import {
  getDiscoveryCache,
  getModelCache,
} from '@wasm4pm/observability';
import { emitResult, makeResult } from '../output.js';
import { EXIT_CODES } from '../exit-codes.js';
import { withSpan } from './_otel.js';

export default defineCommand({
  meta: {
    name: 'cache',
    description: 'Manage discovery result caching and model caching (stats, clear, models). Example: wpm cache stats',
  },
  subCommands: {
    stats: defineCommand({
      meta: {
        name: 'stats',
        description: 'Display discovery cache statistics',
      },
      async run() {
        const t0 = Date.now();
        return await withSpan(
          'cache.stats',
          {},
          async () => {
            const cache = getDiscoveryCache();
            const stats = cache.stats();
            const hitRate = (cache.hitRate() * 100).toFixed(1);
            const cachedAlgos = cache.getCachedAlgorithms();
            const elapsedMs = Date.now() - t0;

            const result = makeResult(
              'cache.stats',
              {
                hits: stats.hits,
                misses: stats.misses,
                entries: stats.entries,
                bytes_used: stats.bytes_used,
                avg_age_ms: stats.avg_age_ms,
                hit_rate_percent: hitRate,
                cached_algorithms: cachedAlgos,
              },
              elapsedMs,
              EXIT_CODES.success
            );

            emitResult(result, {
              format: 'json',
            });

            return EXIT_CODES.success;
          }
        );
      },
    }),

    clear: defineCommand({
      meta: {
        name: 'clear',
        description: 'Clear all discovery cache entries',
      },
      args: {
        algorithm: {
          type: 'string',
          description: 'Clear only entries for a specific algorithm (optional)',
        },
      },
      async run(args) {
        const t0 = Date.now();
        const algorithm = (args as Record<string, unknown>).algorithm as string | undefined;
        return await withSpan(
          'cache.clear',
          { algorithm: algorithm || 'all' },
          async () => {
            const cache = getDiscoveryCache();

            let cleared = 0;
            let action = '';
            let payload: any = {};

            if (algorithm) {
              cleared = cache.invalidateByAlgorithm(algorithm);
              action = 'invalidated';
              payload = {
                action,
                algorithm,
                entries_removed: cleared,
              };
            } else {
              const statsBefore = cache.stats();
              cache.clear();
              cleared = statsBefore.entries;
              action = 'cleared';
              payload = {
                action,
                entries_removed: cleared,
                status: 'all cache entries cleared',
              };
            }

            const elapsedMs = Date.now() - t0;
            const result = makeResult(
              'cache.clear',
              payload,
              elapsedMs,
              EXIT_CODES.success
            );
            emitResult(result, { format: 'json' });

            return EXIT_CODES.success;
          }
        );
      },
    }),

    purge: defineCommand({
      meta: {
        name: 'purge',
        description: 'Remove expired cache entries',
      },
      async run() {
        const t0 = Date.now();
        return await withSpan(
          'cache.purge',
          {},
          async () => {
            const cache = getDiscoveryCache();
            const removed = cache.purgeExpired();
            const elapsedMs = Date.now() - t0;

            const result = makeResult(
              'cache.purge',
              {
                action: 'purged',
                expired_entries_removed: removed,
                remaining: cache.stats().entries,
              },
              elapsedMs,
              EXIT_CODES.success,
            );

            emitResult(result, { format: 'json' });

            return EXIT_CODES.success;
          }
        );
      },
    }),

    models: defineCommand({
      meta: {
        name: 'models',
        description: 'Manage cached process models (list, stats, clear)',
      },
      subCommands: {
        list: defineCommand({
          meta: {
            name: 'list',
            description: 'List all cached process models',
          },
          args: {
            algorithm: {
              type: 'string',
              description: 'Filter by algorithm name (optional)',
            },
          },
          async run(args) {
            const t0 = Date.now();
            const algorithm = (args as Record<string, unknown>).algorithm as string | undefined;
            return await withSpan(
              'cache.models.list',
              { algorithm: algorithm || 'all' },
              async () => {
                const modelCache = getModelCache();
                const stats = modelCache.modelStats();
                const cachedAlgos = algorithm ? [algorithm] : modelCache.getCachedAlgorithms();
                const elapsedMs = Date.now() - t0;

                const result = makeResult(
                  'cache.models.list',
                  {
                    cached_models: stats.models,
                    filtered_algorithm: algorithm || null,
                    algorithms_with_models: cachedAlgos,
                    hit_rate_percent: (stats.hit_rate * 100).toFixed(1),
                  },
                  elapsedMs,
                  EXIT_CODES.success
                );

                emitResult(result, { format: 'json' });

                return EXIT_CODES.success;
              }
            );
          },
        }),

        stats: defineCommand({
          meta: {
            name: 'stats',
            description: 'Display comprehensive model cache statistics',
          },
          async run() {
            const t0 = Date.now();
            return await withSpan(
              'cache.models.stats',
              {},
              async () => {
                const modelCache = getModelCache();
                const stats = modelCache.modelStats();
                const elapsedMs = Date.now() - t0;

                const result = makeResult(
                  'cache.models.stats',
                  {
                    models: stats.models,
                    total_hits: stats.total_hits,
                    total_misses: stats.total_misses,
                    hit_rate_percent: (stats.hit_rate * 100).toFixed(1),
                    bytes_used: stats.bytes_used,
                    avg_model_age_ms: stats.avg_model_age_ms,
                    time_saved_ms: stats.time_saved_ms,
                    models_by_algorithm: stats.models_by_algorithm,
                  },
                  elapsedMs,
                  EXIT_CODES.success
                );

                emitResult(result, { format: 'json' });

                return EXIT_CODES.success;
              }
            );
          },
        }),

        clear: defineCommand({
          meta: {
            name: 'clear',
            description: 'Clear cached models',
          },
          args: {
            algorithm: {
              type: 'string',
              description: 'Clear only models for a specific algorithm (optional)',
            },
          },
          async run(args) {
            const t0 = Date.now();
            const algorithm = (args as Record<string, unknown>).algorithm as string | undefined;
            return await withSpan(
              'cache.models.clear',
              { algorithm: algorithm || 'all' },
              async () => {
                const modelCache = getModelCache();

                let cleared = 0;
                let action = '';
                let payload: any = {};

                if (algorithm) {
                  cleared = modelCache.invalidateByAlgorithm(algorithm);
                  action = 'invalidated';
                  payload = {
                    action,
                    algorithm,
                    models_removed: cleared,
                  };
                } else {
                  const statsBefore = modelCache.modelStats();
                  modelCache.clear();
                  cleared = statsBefore.models;
                  action = 'cleared';
                  payload = {
                    action,
                    models_removed: cleared,
                    status: 'all cached models cleared',
                  };
                }

                const elapsedMs = Date.now() - t0;
                const result = makeResult(
                  'cache.models.clear',
                  payload,
                  elapsedMs,
                  EXIT_CODES.success
                );
                emitResult(result, { format: 'json' });

                return EXIT_CODES.success;
              }
            );
          },
        }),
      },
    }),
  },
});
