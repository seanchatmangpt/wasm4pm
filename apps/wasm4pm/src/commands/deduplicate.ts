import { defineCommand } from 'citty';
import { getResultDeduplicator } from '@wasm4pm/observability';
import { emitResult, makeResult } from '../output.js';
import { EXIT_CODES } from '../exit-codes.js';
import { withSpan } from './_otel.js';

export default defineCommand({
  meta: {
    name: 'deduplicate',
    description: 'Manage result deduplication across batch runs (scan, clear, report)',
  },
  subCommands: {
    scan: defineCommand({
      meta: {
        name: 'scan',
        description: 'Scan a directory and identify duplicate logs',
      },
      args: {
        dir: {
          type: 'string',
          description: 'Directory to scan for duplicate logs',
          required: true,
        },
      },
      async run(args) {
        const t0 = Date.now();
        const scanDir = (args as Record<string, unknown>).dir as string;

        return await withSpan(
          'deduplicate.scan',
          { directory: scanDir },
          async () => {
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
                total_files_scanned: duplicates.size > 0 ? Array.from(duplicates.values()).reduce((sum, f) => sum + f.length, 0) : 0,
                duplicate_groups: duplicateGroups.length,
                total_duplicates: totalDuplicates,
                groups: duplicateGroups,
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

    report: defineCommand({
      meta: {
        name: 'report',
        description: 'Show deduplication statistics and cached results',
      },
      async run() {
        const t0 = Date.now();
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
                last_hit_timestamp: stats.last_hit,
                last_clear_timestamp: stats.last_clear,
                dedup_database: '.wasm4pm/deduplicate.jsonl',
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
        description: 'Clear all deduplication data (memory and disk)',
      },
      args: {
        memory: {
          type: 'boolean',
          description: 'Clear only in-memory cache (default: clear both)',
        },
      },
      async run(args) {
        const t0 = Date.now();
        const clearMemoryOnly = (args as Record<string, unknown>).memory === true;

        return await withSpan(
          'deduplicate.clear',
          { target: clearMemoryOnly ? 'memory' : 'all' },
          async () => {
            const dedup = getResultDeduplicator();

            const statsBefore = dedup.stats();

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

            emitResult(result, { format: 'json' });
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
      async run() {
        const t0 = Date.now();
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

            emitResult(result, { format: 'json' });
            return EXIT_CODES.success;
          }
        );
      },
    }),
  },
});
