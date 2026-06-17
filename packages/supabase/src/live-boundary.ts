import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { z } from 'zod';
import { hashJsonString } from '@wasm4pm/contracts';
import {
  assertSupabaseResponse,
  createSupabaseReadClient,
  createSupabaseWriteClient,
  pingSupabase,
} from './client.js';
import {
  upsertCommandReceipt,
  recordDeadletter,
  type CommandReceiptRow,
} from './command-receipt-sync.js';
import { SupabaseIntegrationError, type SupabaseIntegrationConfig } from './config.js';
import { ingestTruexEnvelope, parseTruexEnvelope } from './truex-ingest.js';

export const DEFAULT_RUNTIME_RECEIPT_PATH = '.wasm4pm/receipts/supabase_runtime.receipt.json';

export type SupabaseDoctorStatus = 'prepublish_only' | 'configured' | 'live_verified';

// ---------------------------------------------------------------------------
// SupabaseLiveCheckResults
// ---------------------------------------------------------------------------

export const SupabaseLiveCheckResultsSchema = z.object({
  command_receipt_upsert: z.boolean(),
  command_receipt_read: z.boolean(),
  deadletter_write: z.boolean(),
  edge_function_ingest: z.boolean(),
});

export type SupabaseLiveCheckResults = z.infer<typeof SupabaseLiveCheckResultsSchema>;

// ---------------------------------------------------------------------------
// SupabaseRuntimeReceipt
// ---------------------------------------------------------------------------

export const SupabaseRuntimeReceiptSchema = z.object({
  kind: z.literal('supabase_runtime_receipt'),
  status: z.literal('live_verified'),
  boundary: z.literal('supabase'),
  package_version: z.string(),
  git_commit: z.string().optional(),
  supabase_host: z.string(),
  probe_run_id: z.string(),
  checks: SupabaseLiveCheckResultsSchema,
  verified_at: z.string(),
  receipt_hash: z.string(),
});

export type SupabaseRuntimeReceipt = z.infer<typeof SupabaseRuntimeReceiptSchema>;

// ---------------------------------------------------------------------------
// SupabaseLiveVerificationResult
// ---------------------------------------------------------------------------

export const SupabaseLiveVerificationResultSchema = z.object({
  checks: SupabaseLiveCheckResultsSchema,
  probeRunId: z.string(),
  runtimeReceipt: SupabaseRuntimeReceiptSchema,
});

export type SupabaseLiveVerificationResult = z.infer<typeof SupabaseLiveVerificationResultSchema>;

// ---------------------------------------------------------------------------
// SupabaseDoctorReport
// ---------------------------------------------------------------------------

export const SupabaseDoctorReportSchema = z.object({
  status: z.enum(['prepublish_only', 'configured', 'live_verified']),
  reachable: z.boolean(),
  migrationsApplied: z.boolean(),
  serviceRoleConfigured: z.boolean(),
  runtimeReceiptPresent: z.boolean(),
  runtimeReceiptValid: z.boolean(),
  commandReceiptsTable: z.string(),
  truexEnvelopesTable: z.string(),
  runtimeReceiptPath: z.string(),
  message: z.string(),
});

export type SupabaseDoctorReport = z.infer<typeof SupabaseDoctorReportSchema>;

function supabaseHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url.replace(/^https?:\/\//, '').split('/')[0] ?? url;
  }
}

export function computeRuntimeReceiptHash(
  receipt: Omit<SupabaseRuntimeReceipt, 'receipt_hash'>
): string {
  return hashJsonString(JSON.stringify(receipt));
}

export function verifyRuntimeReceipt(receipt: SupabaseRuntimeReceipt): boolean {
  const { receipt_hash, ...rest } = receipt;
  return computeRuntimeReceiptHash(rest) === receipt_hash;
}

export async function loadRuntimeReceipt(
  receiptPath = DEFAULT_RUNTIME_RECEIPT_PATH
): Promise<SupabaseRuntimeReceipt | null> {
  try {
    const raw = await fs.readFile(path.resolve(receiptPath), 'utf-8');
    const parsed = JSON.parse(raw) as SupabaseRuntimeReceipt;
    if (parsed.kind !== 'supabase_runtime_receipt') return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function writeRuntimeReceipt(
  receipt: SupabaseRuntimeReceipt,
  receiptPath = DEFAULT_RUNTIME_RECEIPT_PATH
): Promise<string> {
  const full = path.resolve(receiptPath);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, `${JSON.stringify(receipt, null, 2)}\n`, 'utf-8');
  return full;
}

function runtimeReceiptMatchesConfig(
  receipt: SupabaseRuntimeReceipt,
  config: SupabaseIntegrationConfig
): boolean {
  return (
    receipt.status === 'live_verified' &&
    receipt.supabase_host === supabaseHost(config.url) &&
    verifyRuntimeReceipt(receipt)
  );
}

export function deriveDoctorStatus(input: {
  credentialsPresent: boolean;
  reachable: boolean;
  migrationsApplied: boolean;
  serviceRoleConfigured: boolean;
  runtimeReceipt: SupabaseRuntimeReceipt | null;
  config: SupabaseIntegrationConfig;
}): SupabaseDoctorStatus {
  if (
    input.runtimeReceipt &&
    runtimeReceiptMatchesConfig(input.runtimeReceipt, input.config)
  ) {
    return 'live_verified';
  }
  if (
    input.credentialsPresent &&
    input.reachable &&
    input.migrationsApplied &&
    input.serviceRoleConfigured
  ) {
    return 'configured';
  }
  return 'prepublish_only';
}

export async function runSupabaseLiveVerification(options: {
  config: SupabaseIntegrationConfig;
  truexEnvelopePath?: string;
  skipEdgeFunction?: boolean;
  gitCommit?: string;
  packageVersion?: string;
  runtimeReceiptPath?: string;
}): Promise<SupabaseLiveVerificationResult> {
  const writeClient = createSupabaseWriteClient(options.config);
  const probeRunId = `supabase-live-probe-${Date.now()}`;
  const checks: SupabaseLiveCheckResults = {
    command_receipt_upsert: false,
    command_receipt_read: false,
    deadletter_write: false,
    edge_function_ingest: false,
  };

  const probeRow: CommandReceiptRow = {
    run_id: probeRunId,
    command: 'supabase.live_probe',
    input_hash: '0'.repeat(64),
    output_hash: hashJsonString(probeRunId),
    status: 'success',
    payload: {
      probe: true,
      boundary: 'supabase',
      kind: 'supabase_runtime_boundary',
    },
  };

  await upsertCommandReceipt(writeClient, options.config, probeRow);
  checks.command_receipt_upsert = true;

  const readBack = await writeClient
    .from(options.config.tables.commandReceipts)
    .select('run_id, command')
    .eq('run_id', probeRunId)
    .maybeSingle();
  assertSupabaseResponse(readBack, `read probe command receipt ${probeRunId}`);
  checks.command_receipt_read = readBack.data?.run_id === probeRunId;

  const deadletterId = `probe-${probeRunId}`;
  await recordDeadletter(writeClient, options.config, {
    queue_item_id: deadletterId,
    kind: 'live_probe',
    error_code: 'LIVE_PROBE',
    error_message: 'supabase runtime boundary probe (non-failure)',
    payload_hash: hashJsonString(deadletterId),
  });
  const deadletterRead = await writeClient
    .from(options.config.tables.syncQueueDeadletter)
    .select('queue_item_id')
    .eq('queue_item_id', deadletterId)
    .maybeSingle();
  assertSupabaseResponse(deadletterRead, 'read probe deadletter row');
  checks.deadletter_write = deadletterRead.data?.queue_item_id === deadletterId;

  if (!options.skipEdgeFunction) {
    const envelopePath =
      options.truexEnvelopePath ??
      path.resolve(process.cwd(), 'examples/out/truex_ocel2_valid.json');
    let envelopeRaw: string;
    try {
      envelopeRaw = await fs.readFile(envelopePath, 'utf-8');
    } catch {
      throw new Error(
        `TrueX envelope fixture missing at ${envelopePath} — required for Edge Function live probe`
      );
    }
    const envelope = parseTruexEnvelope(JSON.parse(envelopeRaw) as Record<string, unknown>);
    const ingestResult = await ingestTruexEnvelope({
      config: options.config,
      envelope,
      preferEdgeFunction: true,
    });
    checks.edge_function_ingest = ingestResult.via === 'edge_function';

    const envelopeWriteRead = await writeClient
      .from(options.config.tables.truexEnvelopes)
      .select('receipt_hash')
      .eq('receipt_hash', envelope.receipt_hash)
      .maybeSingle();
    assertSupabaseResponse(
      envelopeWriteRead,
      `read ingested truex envelope ${envelope.receipt_hash}`
    );
    checks.edge_function_ingest =
      checks.edge_function_ingest &&
      envelopeWriteRead.data?.receipt_hash === envelope.receipt_hash;
  }

  const verifiedAt = new Date().toISOString();
  const receiptBody: Omit<SupabaseRuntimeReceipt, 'receipt_hash'> = {
    kind: 'supabase_runtime_receipt',
    status: 'live_verified',
    boundary: 'supabase',
    package_version: options.packageVersion ?? '0.0.0',
    git_commit: options.gitCommit,
    supabase_host: supabaseHost(options.config.url),
    probe_run_id: probeRunId,
    checks,
    verified_at: verifiedAt,
  };

  const runtimeReceipt: SupabaseRuntimeReceipt = {
    ...receiptBody,
    receipt_hash: computeRuntimeReceiptHash(receiptBody),
  };

  await writeRuntimeReceipt(runtimeReceipt, options.runtimeReceiptPath);

  return { checks, probeRunId, runtimeReceipt };
}

export async function runSupabaseDoctor(
  config: SupabaseIntegrationConfig,
  options?: {
    runtimeReceiptPath?: string;
    live?: boolean;
    truexEnvelopePath?: string;
    gitCommit?: string;
    packageVersion?: string;
  }
): Promise<SupabaseDoctorReport> {
  const runtimeReceiptPath = options?.runtimeReceiptPath ?? DEFAULT_RUNTIME_RECEIPT_PATH;
  const credentialsPresent = Boolean(config.url && config.anonKey);
  const serviceRoleConfigured = Boolean(config.serviceRoleKey);

  if (options?.live) {
    if (!serviceRoleConfigured) {
      throw new SupabaseIntegrationError(
        'SUPABASE_SERVICE_ROLE_MISSING',
        'Live verification requires WASM4PM_SUPABASE_SERVICE_ROLE_KEY for RLS-compatible writes'
      );
    }
    await runSupabaseLiveVerification({
      config,
      truexEnvelopePath: options.truexEnvelopePath,
      gitCommit: options.gitCommit,
      packageVersion: options.packageVersion,
      runtimeReceiptPath,
    });
  }

  const readClient = createSupabaseReadClient(config);
  const tables = [config.tables.commandReceipts, config.tables.truexEnvelopes];

  let migrationsApplied = true;
  for (const table of tables) {
    const { error } = await readClient.from(table).select('*').limit(0);
    if (error && /relation.*does not exist/i.test(error.message)) {
      migrationsApplied = false;
      break;
    }
  }

  let reachable = false;
  try {
    await pingSupabase(config);
    reachable = true;
  } catch {
    reachable = false;
  }

  const runtimeReceipt = await loadRuntimeReceipt(runtimeReceiptPath);
  const runtimeReceiptValid = runtimeReceipt ? verifyRuntimeReceipt(runtimeReceipt) : false;
  const runtimeReceiptPresent = runtimeReceiptValid;

  const status = deriveDoctorStatus({
    credentialsPresent,
    reachable,
    migrationsApplied,
    serviceRoleConfigured,
    runtimeReceipt,
    config,
  });

  const message =
    status === 'live_verified'
      ? 'Supabase live boundary verified — runtime receipt present and valid'
      : status === 'configured'
        ? 'Supabase configured (reachable, migrations, service role) — run live smoke for live_verified'
        : !credentialsPresent
          ? 'Supabase credentials missing — prepublish_only'
          : !reachable
            ? 'Supabase unreachable — prepublish_only'
            : !migrationsApplied
              ? 'Migrations not applied — prepublish_only (run supabase db push)'
              : !serviceRoleConfigured
                ? 'Service role key missing — prepublish_only (writes require WASM4PM_SUPABASE_SERVICE_ROLE_KEY)'
                : 'Supabase prepublish_only — mock/wiring only until live smoke passes';

  return {
    status,
    reachable,
    migrationsApplied,
    serviceRoleConfigured,
    runtimeReceiptPresent,
    runtimeReceiptValid,
    commandReceiptsTable: config.tables.commandReceipts,
    truexEnvelopesTable: config.tables.truexEnvelopes,
    runtimeReceiptPath,
    message,
  };
}
