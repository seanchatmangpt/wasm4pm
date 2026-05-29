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
    format: { type: 'string', default: 'human' },
    verbose: { type: 'boolean', alias: 'v', default: false },
    quiet: { type: 'boolean', alias: 'q', default: false },
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
    format: { type: 'string', default: 'human' },
    verbose: { type: 'boolean', alias: 'v', default: false },
    quiet: { type: 'boolean', alias: 'q', default: false },
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
    format: { type: 'string', default: 'human' },
    verbose: { type: 'boolean', alias: 'v', default: false },
    quiet: { type: 'boolean', alias: 'q', default: false },
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
    description: 'Check Supabase connectivity and migration tables',
  },
  args: {
    config: { type: 'string', description: 'Path to wasm4pm.toml / wasm4pm.json' },
    live: {
      type: 'boolean',
      description:
        'Run live write/Edge probes and emit supabase_runtime.receipt.json (requires service role key)',
      default: false,
    },
    format: { type: 'string', default: 'human' },
    verbose: { type: 'boolean', alias: 'v', default: false },
    quiet: { type: 'boolean', alias: 'q', default: false },
  },
  async run(ctx) {
    const format = (ctx.args.format as 'human' | 'json') ?? 'human';
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
        const result = makeResult('supabase doctor', report, 0, exit);
        emitResult(result, { format, verbose: Boolean(ctx.args.verbose), quiet: Boolean(ctx.args.quiet) });
        return await exitWithFlush(exit);
      } catch (err) {
        const mapped = mapSupabaseError(err);
        const result = makeErrorResult('supabase doctor', mapped.message, mapped.exit, mapped.code);
        emitResult(result, { format, verbose: Boolean(ctx.args.verbose), quiet: Boolean(ctx.args.quiet) });
        return await exitWithFlush(mapped.exit);
      }
    });
  },
});

export const supabase = defineCommand({
  meta: {
    name: 'supabase',
    description: 'Sync wasm4pm receipts and TrueX envelopes to Supabase',
  },
  subCommands: {
    'sync-receipts': syncReceipts,
    'sync-queue': syncQueue,
    'ingest-truex': ingestTruex,
    doctor: supabaseDoctor,
  },
});
