import { defineCommand } from 'citty';
import * as fs from 'node:fs';
import { getResultDeduplicator } from '@wasm4pm/observability';
import { emitResult, makeResult, makeErrorResult } from '../output.js';
import { EXIT_CODES } from '../exit-codes.js';
import { withSpan } from './_otel.js';
import { exitWithFlush } from '../otel/exit.js';

/** Shared --format arg definition for all subcommands */
const formatArg = {
  type: 'string' as const,
  description: 'Output format: human (default) or json',
  default: 'human',
};

export default defineCommand({
  meta: {
    name: 'deduplicate',
    description: 'Manage result deduplication across batch runs (scan, clear, report). Example: wpm deduplicate scan data/',
  },
  subCommands: {
    scan: defineCommand({
      meta: {
        name: 'scan',
        description: 'Scan a directory and identify duplicate logs',
      },
      args: {
        dir: {
          type: 'positional',
          description: 'Directory to scan for duplicate logs',
          required: true,
        },
        format: formatArg,
      },
      async run(ctx) {
        const t0 = Date.now();
        const scanDir = ctx.args.dir as string;
        const format = (ctx.args.format as string ?? 'human') as 'human' | 'json';

        return await withSpan(
          'deduplicate.scan',
          { directory: scanDir },
          async () => {
            // Validate the directory exists before attempting scan
            if (!scanDir || !fs.existsSync(scanDir) || !fs.statSync(scanDir).isDirectory()) {
              const errResult = makeErrorResult(
                'deduplicate.scan',
                new Error(`Directory not found: ${scanDir ?? '(none provided)'}`),
                EXIT_CODES.source_error,
                'SOURCE_ERROR'
              );
              emitResult(errResult, { format, quiet: false });
              return await exitWithFlush(errResult.exit_code);
            }

            const dedup = getResultDeduplicator();
            const duplicates = await dedup.scanDirectoryForDuplicates(scanDir);

            let totalDuplicates = 0;
            const duplicateGroups: Array<{
              content_hash: string;
              file_count: number;
              files: string[];
            }> = [];

            for (const [contentHash, files] of duplicates) {
              if (files.length > 1) {
                duplicateGroups.push({
                  content_hash: contentHash,
                  file_count: files.length,
                  files,
                });
                totalDuplicates += files.length;
              }
            }

            const elapsedMs = Date.now() - t0;
            const result = makeResult(
              'deduplicate.scan',
              {
                directory: scanDir,
                total_files_scanned:
                  duplicates.size > 0
                    ? Array.from(duplicates.values()).reduce((sum, f) => sum + f.length, 0)
                    : 0,
                duplicate_groups: duplicateGroups.length,
                total_duplicates: totalDuplicates,
                groups: duplicateGroups,
              },
              elapsedMs,
              EXIT_CODES.success
            );

            emitResult(result, { format, quiet: false });
            return EXIT_CODES.success;
          }
        );
      },
    }),

    report: defineCommand({
      meta: {
        name: 'report',
        description: 'Show deduplication statistics and cached results',
      },
      args: {
        format: formatArg,
      },
      async run(ctx) {
        const t0 = Date.now();
        const format = (ctx.args.format as string ?? 'human') as 'human' | 'json';

        return await withSpan(
          'deduplicate.report',
          {},
          async () => {
            const dedup = getResultDeduplicator();
            const stats = dedup.stats();

            const elapsedMs = Date.now() - t0;
            const result = makeResult(
              'deduplicate.report',
              {
                total_cached_entries: stats.total_entries,
                deduplicated_runs: stats.deduplicated_count,
                estimated_bytes_saved: stats.bytes_saved_estimate,
                last_hit_timestamp: stats.last_hit ?? null,
                last_clear_timestamp: stats.last_clear ?? null,
                dedup_database: '.wasm4pm/deduplicate.jsonl',
              },
              elapsedMs,
              EXIT_CODES.success
            );

            emitResult(result, { format, quiet: false });
            return EXIT_CODES.success;
          }
        );
      },
    }),

    clear: defineCommand({
      meta: {
        name: 'clear',
        description: 'Clear all deduplication data (memory and disk)',
      },
      args: {
        memory: {
          type: 'boolean',
          description: 'Clear only in-memory cache (default: clear both memory and disk)',
        },
        force: {
          type: 'boolean',
          description: 'Skip confirmation prompt and clear immediately',
          default: false,
        },
        format: formatArg,
      },
      async run(ctx) {
        const t0 = Date.now();
        const clearMemoryOnly = ctx.args.memory === true;
        const force = ctx.args.force === true;
        const format = (ctx.args.format as string ?? 'human') as 'human' | 'json';

        return await withSpan(
          'deduplicate.clear',
          { target: clearMemoryOnly ? 'memory' : 'all', force },
          async () => {
            const dedup = getResultDeduplicator();
            const statsBefore = dedup.stats();

            // Guard: destructive all-clear requires --force unless in JSON mode
            // (JSON mode is typically scripted, so treat as implicitly confirmed)
            if (!clearMemoryOnly && !force && format === 'human' && statsBefore.total_entries > 0) {
              const errResult = makeErrorResult(
                'deduplicate.clear',
                new Error(
                  `This will permanently delete ${statsBefore.total_entries} cached dedup entries and the on-disk database. ` +
                    `Re-run with --force to confirm, or use --memory to clear only the in-memory cache.`
                ),
                EXIT_CODES.config_error,
                'CONFIG_ERROR'
              );
              emitResult(errResult, { format, quiet: false });
              return await exitWithFlush(errResult.exit_code);
            }

            if (clearMemoryOnly) {
              dedup.clearMemory();
            } else {
              dedup.clearMemory();
              await dedup.clearDisk();
            }

            const elapsedMs = Date.now() - t0;
            const result = makeResult(
              'deduplicate.clear',
              {
                target: clearMemoryOnly ? 'memory' : 'all',
                entries_cleared: statsBefore.total_entries,
                database_deleted: !clearMemoryOnly,
              },
              elapsedMs,
              EXIT_CODES.success
            );

            emitResult(result, { format, quiet: false });
            return EXIT_CODES.success;
          }
        );
      },
    }),

    load: defineCommand({
      meta: {
        name: 'load',
        description: 'Load persisted deduplication database into memory',
      },
      args: {
        format: formatArg,
      },
      async run(ctx) {
        const t0 = Date.now();
        const format = (ctx.args.format as string ?? 'human') as 'human' | 'json';

        return await withSpan(
          'deduplicate.load',
          {},
          async () => {
            const dedup = getResultDeduplicator();
            await dedup.loadFromDisk();

            const stats = dedup.stats();
            const elapsedMs = Date.now() - t0;

            const result = makeResult(
              'deduplicate.load',
              {
                entries_loaded: stats.total_entries,
                database_path: '.wasm4pm/deduplicate.jsonl',
              },
              elapsedMs,
              EXIT_CODES.success
            );

            emitResult(result, { format, quiet: false });
            return EXIT_CODES.success;
          }
        );
      },
    }),
  },
});
