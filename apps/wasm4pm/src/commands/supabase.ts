import { defineCommand } from 'citty';
import { execSync } from 'node:child_process';
import { resolveConfig } from '@wasm4pm/config';
import {
  flushSyncQueue,
  resolveSupabaseConfig,
  runSupabaseDoctor,
  SupabaseIntegrationError,
  syncCommandReceipts,
  ingestTruexEnvelope,
  parseTruexEnvelope,
  TRUEX_ADMITTED,
} from '@wasm4pm/supabase';
import { EXIT_CODES } from '../exit-codes.js';
import { emitResult, makeErrorResult, makeResult } from '../output.js';
import { exitWithFlush } from '../otel/exit.js';
import { withSpan } from './_otel.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

async function loadSupabaseConfig(configPath?: string) {
  let fileConfig: import('@wasm4pm/supabase').SupabaseIntegrationConfig | undefined;
  try {
    const resolved = await resolveConfig(
      configPath
        ? { cliOverrides: { configPath }, configSearchPaths: [process.cwd()] }
        : {}
    );
    fileConfig = resolved.integrations?.supabase;
  } catch {
    /* Supabase-only commands may run when full wasm4pm.toml is invalid */
  }
  return resolveSupabaseConfig({ fileConfig });
}

function mapSupabaseError(err: unknown): { code: string; message: string; exit: number } {
  if (err instanceof SupabaseIntegrationError) {
    const exit =
      err.code === 'SUPABASE_CREDENTIALS_MISSING' || err.code === 'SUPABASE_SERVICE_ROLE_MISSING'
        ? EXIT_CODES.config_error
        : err.code === 'RECEIPT_REFUSED'
          ? EXIT_CODES.execution_error
          : EXIT_CODES.system_error;
    return { code: err.code, message: err.message, exit };
  }
  return {
    code: 'SUPABASE_ERROR',
    message: err instanceof Error ? err.message : String(err),
    exit: EXIT_CODES.system_error,
  };
}

const syncReceipts = defineCommand({
  meta: {
    name: 'sync-receipts',
    description: 'Upload local .wasm4pm/receipts/ command receipts to Supabase',
  },
  args: {
    config: { type: 'string', description: 'Path to wasm4pm.toml / wasm4pm.json' },
    'dry-run': { type: 'boolean', description: 'List receipts without uploading', default: false },
    format: { type: 'string', description: 'Output format: human or json (default: human)', default: 'human' },
    verbose: { type: 'boolean', alias: 'v', description: 'Show detailed sync progress', default: false },
    quiet: { type: 'boolean', alias: 'q', description: 'Suppress non-error output', default: false },
  },
  async run(ctx) {
    const format = (ctx.args.format as 'human' | 'json') ?? 'human';
    return withSpan('supabase.sync-receipts', {}, async () => {
      try {
        const supabaseConfig = await loadSupabaseConfig(ctx.args.config as string | undefined);
        let gitCommit: string | undefined;
        try {
          gitCommit = execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();
        } catch {
          /* optional */
        }
        const syncResult = await syncCommandReceipts({
          config: supabaseConfig,
          dryRun: Boolean(ctx.args['dry-run']),
          gitCommit,
        });
        const result = makeResult('supabase sync-receipts', syncResult, 0, EXIT_CODES.success);
        emitResult(result, { format, verbose: Boolean(ctx.args.verbose), quiet: Boolean(ctx.args.quiet) });
        return await exitWithFlush(EXIT_CODES.success);
      } catch (err) {
        const mapped = mapSupabaseError(err);
        const result = makeErrorResult(
          'supabase sync-receipts',
          mapped.message,
          mapped.exit,
          mapped.code
        );
        emitResult(result, { format, verbose: Boolean(ctx.args.verbose), quiet: Boolean(ctx.args.quiet) });
        return await exitWithFlush(mapped.exit);
      }
    });
  },
});

const syncQueue = defineCommand({
  meta: {
    name: 'sync-queue',
    description: 'Flush .wasm4pm/sync-queue.json pending items to Supabase',
  },
  args: {
    config: { type: 'string', description: 'Path to wasm4pm.toml / wasm4pm.json' },
    format: { type: 'string', description: 'Output format: human or json (default: human)', default: 'human' },
    verbose: { type: 'boolean', alias: 'v', description: 'Show detailed flush progress', default: false },
    quiet: { type: 'boolean', alias: 'q', description: 'Suppress non-error output', default: false },
  },
  async run(ctx) {
    const format = (ctx.args.format as 'human' | 'json') ?? 'human';
    return withSpan('supabase.sync-queue', {}, async () => {
      try {
        const supabaseConfig = await loadSupabaseConfig(ctx.args.config as string | undefined);
        const flushResult = await flushSyncQueue({ config: supabaseConfig });
        const result = makeResult('supabase sync-queue', flushResult, 0, EXIT_CODES.success);
        emitResult(result, { format, verbose: Boolean(ctx.args.verbose), quiet: Boolean(ctx.args.quiet) });
        return await exitWithFlush(EXIT_CODES.success);
      } catch (err) {
        const mapped = mapSupabaseError(err);
        const result = makeErrorResult('supabase sync-queue', mapped.message, mapped.exit, mapped.code);
        emitResult(result, { format, verbose: Boolean(ctx.args.verbose), quiet: Boolean(ctx.args.quiet) });
        return await exitWithFlush(mapped.exit);
      }
    });
  },
});

const ingestTruex = defineCommand({
  meta: {
    name: 'ingest-truex',
    description: 'Verify (WASM) then ingest an admitted TrueX envelope into Supabase',
  },
  args: {
    envelope: {
      type: 'positional',
      description: 'Path to TrueX envelope JSON',
      required: true,
    },
    config: { type: 'string', description: 'Path to wasm4pm.toml / wasm4pm.json' },
    format: { type: 'string', description: 'Output format: human or json (default: human)', default: 'human' },
    verbose: { type: 'boolean', alias: 'v', description: 'Show WASM verify details and ingest steps', default: false },
    quiet: { type: 'boolean', alias: 'q', description: 'Suppress non-error output', default: false },
  },
  async run(ctx) {
    const format = (ctx.args.format as 'human' | 'json') ?? 'human';
    const envelopePath = path.resolve(process.cwd(), ctx.args.envelope as string);
    return withSpan('supabase.ingest-truex', { envelopePath }, async () => {
      try {
        const raw = await fs.readFile(envelopePath, 'utf-8');
        const { WasmLoader } = await import('@wasm4pm/engine');
        const loader = WasmLoader.getInstance();
        await loader.init();
        const wasm = loader.get() as Record<string, (payload: string) => string>;
        const verifyJson = wasm.truex_verify_receipt(raw);
        const verified = JSON.parse(verifyJson) as Record<string, unknown>;
        if (verified.status !== TRUEX_ADMITTED) {
          throw new SupabaseIntegrationError(
            'RECEIPT_REFUSED',
            `WASM verification refused: ${String(verified.status)}`
          );
        }
        const envelope = parseTruexEnvelope(JSON.parse(raw) as Record<string, unknown>);
        const supabaseConfig = await loadSupabaseConfig(ctx.args.config as string | undefined);
        const ingestResult = await ingestTruexEnvelope({ config: supabaseConfig, envelope });
        const result = makeResult(
          'supabase ingest-truex',
          { verify: verified, ingest: ingestResult, envelope_path: envelopePath },
          0,
          EXIT_CODES.success
        );
        emitResult(result, { format, verbose: Boolean(ctx.args.verbose), quiet: Boolean(ctx.args.quiet) });
        return await exitWithFlush(EXIT_CODES.success);
      } catch (err) {
        const mapped = mapSupabaseError(err);
        const result = makeErrorResult(
          'supabase ingest-truex',
          mapped.message,
          mapped.exit,
          mapped.code
        );
        emitResult(result, { format, verbose: Boolean(ctx.args.verbose), quiet: Boolean(ctx.args.quiet) });
        return await exitWithFlush(mapped.exit);
      }
    });
  },
});

const supabaseDoctor = defineCommand({
  meta: {
    name: 'doctor',
    description: 'Check Supabase connectivity, credentials, tables, and sync status',
  },
  args: {
    config: { type: 'string', description: 'Path to wasm4pm.toml / wasm4pm.json' },
    live: {
      type: 'boolean',
      description:
        'Run live write/Edge probes and emit supabase_runtime.receipt.json (requires service role key)',
      default: false,
    },
    format: { type: 'string', description: 'Output format: human or json (default: human)', default: 'human' },
    verbose: { type: 'boolean', alias: 'v', description: 'Show detailed check results', default: false },
    quiet: { type: 'boolean', alias: 'q', description: 'Suppress non-error output', default: false },
  },
  async run(ctx) {
    const format = (ctx.args.format as 'human' | 'json') ?? 'human';
    const verbose = Boolean(ctx.args.verbose);
    const quiet = Boolean(ctx.args.quiet);
    return withSpan('supabase.doctor', {}, async () => {
      try {
        const supabaseConfig = await loadSupabaseConfig(ctx.args.config as string | undefined);
        let gitCommit: string | undefined;
        try {
          gitCommit = execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();
        } catch {
          /* optional */
        }
        const report = await runSupabaseDoctor(supabaseConfig, {
          live: Boolean(ctx.args.live),
          gitCommit,
          packageVersion: process.env.npm_package_version,
        });
        const exit =
          report.status === 'live_verified'
            ? EXIT_CODES.success
            : report.status === 'configured'
              ? EXIT_CODES.success
              : EXIT_CODES.system_error;

        // Probe pending sync-queue items for the status display
        let pendingCount = 0;
        try {
          const { SyncQueue, getDefaultSyncQueuePath } = await import('@wasm4pm/supabase');
          const sq = new SyncQueue(getDefaultSyncQueuePath());
          // peek() is read-only — does not remove items from the queue
          const pending = sq.peek();
          pendingCount = pending.length;
        } catch {
          /* sync queue optional */
        }

        // Probe table row counts when reachable (best-effort, read-only)
        const tableCounts: Record<string, number | null> = {
          receipts: null,
          envelopes: null,
        };
        if (report.reachable && report.migrationsApplied) {
          try {
            const { createSupabaseReadClient } = await import('@wasm4pm/supabase');
            const readClient = createSupabaseReadClient(supabaseConfig);
            const [receiptsRes, envelopesRes] = await Promise.all([
              readClient.from(supabaseConfig.tables.commandReceipts).select('*', { count: 'exact', head: true }),
              readClient.from(supabaseConfig.tables.truexEnvelopes).select('*', { count: 'exact', head: true }),
            ]);
            if (!receiptsRes.error) tableCounts.receipts = receiptsRes.count ?? 0;
            if (!envelopesRes.error) tableCounts.envelopes = envelopesRes.count ?? 0;
          } catch {
            /* row counts are best-effort */
          }
        }

        const doctorPayload = {
          ...report,
          table_counts: tableCounts,
          pending_queue_items: pendingCount,
        };

        const result = makeResult('supabase doctor', doctorPayload, 0, exit);
        emitResult(result, { format, verbose, quiet }, (_res, p) => {
          const ok = (v: boolean | undefined) => (v ? '✔' : '✗');
          const statusLabel =
            report.status === 'live_verified'
              ? '✔ live_verified'
              : report.status === 'configured'
                ? '✔ configured'
                : '✗ not configured';

          const supabaseHost = (() => {
            const url = process.env.WASM4PM_SUPABASE_URL ?? '';
            try { return new URL(url).host; } catch { return url || '(not set)'; }
          })();

          p.info('Supabase Integration Health');
          p.log('============================');
          p.log(`Status:         ${statusLabel}`);
          p.log(`Connection:     ${ok(report.reachable)} ${report.reachable ? `Connected (${supabaseHost})` : 'Unreachable'}`);
          p.log(`API Key:        ${ok(report.serviceRoleConfigured)} ${report.serviceRoleConfigured ? 'Valid (service role)' : 'Anon key only (read-only mode)'}`);
          p.log(`Migrations:     ${ok(report.migrationsApplied)} ${report.migrationsApplied ? 'Applied' : 'Not applied'}`);
          p.log('');

          p.log('Tables:');
          const receiptCount = tableCounts.receipts;
          const envelopeCount = tableCounts.envelopes;
          const receiptTable = report.commandReceiptsTable ?? supabaseConfig.tables.commandReceipts;
          const envelopeTable = report.truexEnvelopesTable ?? supabaseConfig.tables.truexEnvelopes;
          p.log(`  ${receiptTable}:`
            + `  ${ok(report.migrationsApplied)} ${report.migrationsApplied ? 'Accessible' : 'Unknown'}`
            + (receiptCount !== null ? ` (${receiptCount} rows)` : ''));
          p.log(`  ${envelopeTable}:`
            + `  ${ok(report.migrationsApplied)} ${report.migrationsApplied ? 'Accessible' : 'Unknown'}`
            + (envelopeCount !== null ? ` (${envelopeCount} rows)` : ''));
          p.log('');

          p.log('Sync status:');
          p.log(`  Runtime receipt: ${ok(report.runtimeReceiptPresent)} ${report.runtimeReceiptPresent ? 'Present' : 'Missing'}`);
          p.log(`  Receipt valid:   ${ok(report.runtimeReceiptValid)} ${report.runtimeReceiptValid ? 'Valid' : 'Not verified'}`);
          if (pendingCount > 0) {
            p.warn(`  Pending items:   ${pendingCount} receipt(s) not yet synced`);
            p.log('');
            p.log('  wpm supabase sync-queue          # flush pending to Supabase');
            p.log('  wpm supabase sync-receipts       # upload local receipts');
          } else {
            p.log(`  Pending items:   0 (queue empty)`);
          }
          p.log('');

          if (verbose) {
            p.log('Next steps:');
            p.log('  wpm supabase sync-receipts --dry-run  # preview sync without uploading');
            p.log('  wpm supabase query receipts --top 5   # browse cloud data');
            p.log('  wpm supabase doctor --live            # run write probes');
            p.log('');
          }

          if (report.status === 'live_verified') {
            p.success('Supabase integration fully verified');
          } else if (report.status === 'configured') {
            p.success('Supabase configured — run with --live to perform write probes');
          } else {
            p.warn('Supabase not configured — set WASM4PM_SUPABASE_URL and WASM4PM_SUPABASE_ANON_KEY');
            p.log('');
            p.log('  wpm supabase sync-receipts --dry-run  # preview sync without uploading');
            p.log('  wpm supabase query receipts           # browse cloud data');
          }
        });

        return await exitWithFlush(exit);
      } catch (err) {
        const mapped = mapSupabaseError(err);
        const result = makeErrorResult('supabase doctor', mapped.message, mapped.exit, mapped.code);
        emitResult(result, { format, verbose, quiet });
        return await exitWithFlush(mapped.exit);
      }
    });
  },
});

// ─── query subcommand ─────────────────────────────────────────────────────────

const supabaseQuery = defineCommand({
  meta: {
    name: 'query',
    description:
      'Browse and query Supabase cloud data — receipts, envelopes, events. ' +
      'Example: wpm supabase query receipts --top 5 --sort fitness',
  },
  args: {
    table: {
      type: 'positional',
      description: 'Table to query: receipts | envelopes | deadletter | or a raw SQL expression',
      required: false,
    },
    top: {
      type: 'string',
      description: 'Limit results to N rows (default: 20)',
      default: '20',
    },
    sort: {
      type: 'string',
      description: 'Column to sort by (descending)',
    },
    filter: {
      type: 'string',
      description: 'Filter expression — column=value',
    },
    config: { type: 'string', description: 'Path to wasm4pm.toml / wasm4pm.json' },
    format: {
      type: 'string',
      description: 'Output format: human, json, or csv (default: human)',
      default: 'human',
    },
    verbose: { type: 'boolean', alias: 'v', description: 'Show query metadata', default: false },
    quiet: { type: 'boolean', alias: 'q', description: 'Suppress non-error output', default: false },
  },
  async run(ctx) {
    const format = (ctx.args.format as 'human' | 'json') ?? 'human';
    const verbose = Boolean(ctx.args.verbose);
    const quiet = Boolean(ctx.args.quiet);
    const tableArg = (ctx.args.table as string | undefined) ?? 'receipts';
    const topN = Math.min(500, Math.max(1, parseInt(String(ctx.args.top ?? '20'), 10) || 20));
    const sortCol = ctx.args.sort as string | undefined;
    const filterExpr = ctx.args.filter as string | undefined;

    return withSpan('supabase.query', { table: tableArg, top: topN }, async () => {
      const t0 = performance.now();
      try {
        const supabaseConfig = await loadSupabaseConfig(ctx.args.config as string | undefined);
        const { createSupabaseReadClient } = await import('@wasm4pm/supabase');
        const client = createSupabaseReadClient(supabaseConfig);

        // Resolve table name from friendly alias
        const tableMap: Record<string, string> = {
          receipts: supabaseConfig.tables.commandReceipts,
          envelopes: supabaseConfig.tables.truexEnvelopes,
          deadletter: supabaseConfig.tables.syncQueueDeadletter,
        };
        const resolvedTable = tableMap[tableArg] ?? tableArg;

        let query = client.from(resolvedTable).select('*').limit(topN);

        if (sortCol) {
          query = query.order(sortCol, { ascending: false });
        }

        if (filterExpr) {
          const eqIdx = filterExpr.indexOf('=');
          if (eqIdx > 0) {
            const col = filterExpr.slice(0, eqIdx).trim();
            const val = filterExpr.slice(eqIdx + 1).trim();
            query = query.eq(col, val);
          }
        }

        const { data, error } = await query;

        if (error) {
          const result = makeErrorResult(
            'supabase query',
            `Query failed: ${error.message}`,
            EXIT_CODES.execution_error,
            'SUPABASE_QUERY_ERROR'
          );
          emitResult(result, { format, verbose, quiet });
          return await exitWithFlush(EXIT_CODES.execution_error);
        }

        const rows = data ?? [];
        const elapsedMs = Math.round(performance.now() - t0);

        const queryPayload = {
          table: resolvedTable,
          alias: tableArg,
          row_count: rows.length,
          limit: topN,
          sort: sortCol ?? null,
          filter: filterExpr ?? null,
          elapsed_ms: elapsedMs,
          rows,
        };

        const queryResult = makeResult('supabase query', queryPayload, elapsedMs, EXIT_CODES.success);
        emitResult(queryResult, { format, verbose, quiet }, (_res, p) => {
          p.info(`Query Results — ${resolvedTable}`);
          p.log(`${'='.repeat(40)}`);
          if (verbose) {
            p.log(`Table:   ${resolvedTable}`);
            if (sortCol) p.log(`Sort:    ${sortCol} DESC`);
            if (filterExpr) p.log(`Filter:  ${filterExpr}`);
            p.log(`Time:    ${elapsedMs}ms`);
            p.log('');
          }

          if (rows.length === 0) {
            p.warn('No rows returned');
            return;
          }

          // Auto-detect display columns (prefer meaningful ones)
          const preferredCols = ['command', 'algorithm', 'status', 'exit_code', 'elapsed_ms', 'run_id', 'created_at'];
          const allCols = Object.keys(rows[0] as object);
          const displayCols = [
            ...preferredCols.filter((c) => allCols.includes(c)),
            ...allCols.filter((c) => !preferredCols.includes(c) && !['payload', 'envelope', 'ocel2'].includes(c)),
          ].slice(0, 6);

          // Header
          const colWidth = 20;
          p.log(displayCols.map((c) => c.slice(0, colWidth).padEnd(colWidth)).join('  '));
          p.log(displayCols.map(() => '-'.repeat(colWidth)).join('  '));

          // Rows
          for (const row of rows) {
            const r = row as Record<string, unknown>;
            p.log(
              displayCols
                .map((c) => {
                  const v = r[c];
                  const s =
                    v === null || v === undefined
                      ? '—'
                      : typeof v === 'object'
                        ? '[object]'
                        : String(v);
                  return s.slice(0, colWidth).padEnd(colWidth);
                })
                .join('  ')
            );
          }

          p.log('');
          p.log(`${rows.length} row(s)${rows.length === topN ? ' (limit reached — use --top to see more)' : ''}`);

          if (!verbose) {
            p.log('');
            p.log('wpm supabase query ' + tableArg + ' --top 50 --sort created_at');
          }
        });

        return await exitWithFlush(EXIT_CODES.success);
      } catch (err) {
        const mapped = mapSupabaseError(err);
        const result = makeErrorResult('supabase query', mapped.message, mapped.exit, mapped.code);
        emitResult(result, { format, verbose, quiet });
        return await exitWithFlush(mapped.exit);
      }
    });
  },
});

// ─── sync alias ──────────────────────────────────────────────────────────────
// `wpm supabase sync` is a short alias for `wpm supabase sync-receipts`

const syncAlias = defineCommand({
  meta: {
    name: 'sync',
    description: 'Alias for sync-receipts — upload local .wasm4pm/receipts/ to Supabase',
  },
  args: {
    config: { type: 'string', description: 'Path to wasm4pm.toml / wasm4pm.json' },
    'dry-run': { type: 'boolean', description: 'List receipts without uploading', default: false },
    format: { type: 'string', description: 'Output format: human or json (default: human)', default: 'human' },
    verbose: { type: 'boolean', alias: 'v', description: 'Show detailed sync progress', default: false },
    quiet: { type: 'boolean', alias: 'q', description: 'Suppress non-error output', default: false },
  },
  async run(ctx) {
    const format = (ctx.args.format as 'human' | 'json') ?? 'human';
    return withSpan('supabase.sync', {}, async () => {
      try {
        const supabaseConfig = await loadSupabaseConfig(ctx.args.config as string | undefined);
        let gitCommit: string | undefined;
        try {
          gitCommit = execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();
        } catch {
          /* optional */
        }
        const syncResult = await syncCommandReceipts({
          config: supabaseConfig,
          dryRun: Boolean(ctx.args['dry-run']),
          gitCommit,
        });
        const result = makeResult('supabase sync', syncResult, 0, EXIT_CODES.success);
        emitResult(result, { format, verbose: Boolean(ctx.args.verbose), quiet: Boolean(ctx.args.quiet) });
        return await exitWithFlush(EXIT_CODES.success);
      } catch (err) {
        const mapped = mapSupabaseError(err);
        const result = makeErrorResult('supabase sync', mapped.message, mapped.exit, mapped.code);
        emitResult(result, { format, verbose: Boolean(ctx.args.verbose), quiet: Boolean(ctx.args.quiet) });
        return await exitWithFlush(mapped.exit);
      }
    });
  },
});

export const supabase = defineCommand({
  meta: {
    name: 'supabase',
    description:
      'Sync wasm4pm command receipts and admitted TrueX envelopes to a Supabase Postgres database. ' +
      'Subcommands: sync (alias: sync-receipts), sync-queue, ingest-truex, doctor, query. ' +
      'Requires WASM4PM_SUPABASE_URL and WASM4PM_SUPABASE_ANON_KEY env vars (or wasm4pm.toml). ' +
      'Examples: wpm supabase sync  |  wpm supabase doctor  |  wpm supabase query receipts --top 10',
  },
  subCommands: {
    sync: syncAlias,
    'sync-receipts': syncReceipts,
    'sync-queue': syncQueue,
    'ingest-truex': ingestTruex,
    doctor: supabaseDoctor,
    query: supabaseQuery,
  },
});
