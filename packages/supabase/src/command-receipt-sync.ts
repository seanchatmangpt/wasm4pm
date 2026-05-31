import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
  assertSupabaseResponse,
  createSupabaseWriteClient,
  type Wasm4pmSupabaseClient,
} from './client.js';
import { SupabaseIntegrationError, type SupabaseIntegrationConfig } from './config.js';

export interface CommandReceiptRow {
  run_id: string;
  command: string;
  input_hash: string;
  output_hash: string;
  status: string;
  payload: Record<string, unknown>;
  git_commit?: string | null;
  inserted_at?: string;
}

export interface CommandReceiptSyncResult {
  synced: number;
  skipped: number;
  errors: Array<{ run_id: string; message: string }>;
  dryRun: boolean;
}

const HEX64 = /^[0-9a-f]{64}$/;

function validateReceipt(raw: unknown): CommandReceiptRow | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.run_id !== 'string') return null;
  if (typeof o.command !== 'string') return null;
  if (typeof o.input_hash !== 'string' || !HEX64.test(o.input_hash)) return null;
  if (typeof o.output_hash !== 'string' || !HEX64.test(o.output_hash)) return null;
  if (!['success', 'partial', 'failed'].includes(String(o.status))) return null;
  if (typeof o.timestamp !== 'string') return null;
  return {
    run_id: o.run_id,
    command: o.command,
    input_hash: o.input_hash,
    output_hash: o.output_hash,
    status: String(o.status),
    payload: o as Record<string, unknown>,
    git_commit: typeof o.git_commit === 'string' ? o.git_commit : null,
  };
}

export async function listLocalCommandReceipts(
  receiptsDir = '.wasm4pm/receipts'
): Promise<CommandReceiptRow[]> {
  const dir = path.resolve(receiptsDir);
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return [];
  }

  const rows: CommandReceiptRow[] = [];
  for (const name of entries) {
    if (!name.endsWith('.json') || name === 'latest.json') continue;
    const full = path.join(dir, name);
    try {
      const raw = JSON.parse(await fs.readFile(full, 'utf-8')) as unknown;
      const row = validateReceipt(raw);
      if (row) rows.push(row);
    } catch {
      /* skip malformed */
    }
  }
  return rows;
}

export async function upsertCommandReceipt(
  client: Wasm4pmSupabaseClient,
  config: SupabaseIntegrationConfig,
  row: CommandReceiptRow
): Promise<void> {
  const table = config.tables.commandReceipts;
  const result = await client.from(table).upsert(
    {
      run_id: row.run_id,
      command: row.command,
      input_hash: row.input_hash,
      output_hash: row.output_hash,
      status: row.status,
      payload: row.payload,
      git_commit: row.git_commit ?? null,
      inserted_at: new Date().toISOString(),
    },
    { onConflict: 'run_id' }
  );

  assertSupabaseResponse(result, `upsert command receipt ${row.run_id}`);
}

/** Maximum receipts uploaded in a single syncCommandReceipts call.
 * Prevents unbounded memory usage when the receipts directory grows very large. */
const MAX_SYNC_BATCH = 500;

export async function syncCommandReceipts(options: {
  config: SupabaseIntegrationConfig;
  client?: Wasm4pmSupabaseClient;
  receiptsDir?: string;
  dryRun?: boolean;
  gitCommit?: string;
  /** Override the default batch cap (default: 500). Set to Infinity to disable. */
  maxBatch?: number;
}): Promise<CommandReceiptSyncResult> {
  const dryRun = Boolean(options.dryRun);
  const client = dryRun
    ? options.client
    : (options.client ?? createSupabaseWriteClient(options.config));
  const allRows = await listLocalCommandReceipts(options.receiptsDir);
  const cap = options.maxBatch ?? MAX_SYNC_BATCH;
  // Slice to the batch cap so a very large receipts directory cannot exhaust
  // memory or connection-pool resources in a single call.
  const rows = Number.isFinite(cap) ? allRows.slice(0, cap) : allRows;
  const result: CommandReceiptSyncResult = {
    synced: 0,
    skipped: 0,
    errors: [],
    dryRun,
  };

  for (const row of rows) {
    if (options.gitCommit) {
      row.git_commit = options.gitCommit;
    }
    if (dryRun) {
      result.synced += 1;
      continue;
    }
    if (!client) {
      throw new SupabaseIntegrationError(
        'SUPABASE_SERVICE_ROLE_MISSING',
        'syncCommandReceipts write path requires a Supabase client'
      );
    }
    try {
      await upsertCommandReceipt(client, options.config, row);
      result.synced += 1;
    } catch (err) {
      if (err instanceof SupabaseIntegrationError && err.code === 'RECEIPT_DUPLICATE') {
        result.skipped += 1;
        continue;
      }
      result.errors.push({
        run_id: row.run_id,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return result;
}

export async function recordDeadletter(
  client: Wasm4pmSupabaseClient,
  config: SupabaseIntegrationConfig,
  entry: {
    queue_item_id: string;
    kind: string;
    error_code: string;
    error_message: string;
    payload_hash: string;
  }
): Promise<void> {
  const result = await client.from(config.tables.syncQueueDeadletter).insert({
    ...entry,
    recorded_at: new Date().toISOString(),
  });
  assertSupabaseResponse(result, 'record deadletter');
}
