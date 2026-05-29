import { hashJsonString } from '@wasm4pm/contracts';
import { createSupabaseWriteClient } from './client.js';
import {
  syncCommandReceipts,
  upsertCommandReceipt,
  recordDeadletter,
  type CommandReceiptRow,
} from './command-receipt-sync.js';
import type { SupabaseIntegrationConfig } from './config.js';
import { ingestTruexEnvelope, parseTruexEnvelope, type TruexEnvelope } from './truex-ingest.js';
import { SyncQueue } from './sync-queue.js';

export type {
  SupabaseDoctorStatus,
  SupabaseDoctorReport,
  SupabaseRuntimeReceipt,
  SupabaseLiveVerificationResult,
  SupabaseLiveCheckResults,
} from './live-boundary.js';

export {
  DEFAULT_RUNTIME_RECEIPT_PATH,
  computeRuntimeReceiptHash,
  verifyRuntimeReceipt,
  loadRuntimeReceipt,
  writeRuntimeReceipt,
  deriveDoctorStatus,
  runSupabaseLiveVerification,
  runSupabaseDoctor,
} from './live-boundary.js';

export interface SyncQueueFlushResult {
  processed: number;
  failed: number;
  acked: string[];
}

/** Items that have failed this many times are moved to deadletter and removed from the queue. */
const MAX_FLUSH_ATTEMPTS = 5;

export async function flushSyncQueue(options: {
  config: SupabaseIntegrationConfig;
  queuePath?: string;
}): Promise<SyncQueueFlushResult> {
  const queue = new SyncQueue(options.queuePath);
  const items = queue.flushPending();
  if (items.length === 0) {
    return { processed: 0, failed: 0, acked: [] };
  }
  const client = createSupabaseWriteClient(options.config);
  const result: SyncQueueFlushResult = { processed: 0, failed: 0, acked: [] };

  for (const item of items) {
    // Items that have already hit the attempt cap are dead — skip processing,
    // send to deadletter, and remove from the queue so they cannot loop forever.
    if (item.attempts >= MAX_FLUSH_ATTEMPTS) {
      result.failed += 1;
      result.acked.push(item.id); // ack to remove it from the queue
      const payloadHash = hashJsonString(JSON.stringify(item.payload));
      await recordDeadletter(client, options.config, {
        queue_item_id: item.id,
        kind: item.kind,
        error_code: 'MAX_ATTEMPTS_EXCEEDED',
        error_message: `Item exceeded ${MAX_FLUSH_ATTEMPTS} flush attempts and was abandoned`,
        payload_hash: payloadHash,
      }).catch(() => {
        /* deadletter best-effort */
      });
      continue;
    }

    try {
      if (item.kind === 'command_receipt') {
        const row = item.payload as unknown as CommandReceiptRow;
        await upsertCommandReceipt(client, options.config, row);
      } else if (item.kind === 'truex_envelope') {
        const envelope = parseTruexEnvelope(item.payload);
        await ingestTruexEnvelope({
          config: options.config,
          envelope,
          client,
          preferEdgeFunction: false,
        });
      }
      result.processed += 1;
      result.acked.push(item.id);
    } catch (err) {
      result.failed += 1;
      queue.markAttempt(item.id);
      const payloadHash = hashJsonString(JSON.stringify(item.payload));
      await recordDeadletter(client, options.config, {
        queue_item_id: item.id,
        kind: item.kind,
        error_code: err instanceof Error ? err.name : 'UNKNOWN',
        error_message: err instanceof Error ? err.message : String(err),
        payload_hash: payloadHash,
      }).catch(() => {
        /* deadletter best-effort */
      });
    }
  }

  if (result.acked.length > 0) {
    queue.ack(result.acked);
  }

  return result;
}

export { syncCommandReceipts, ingestTruexEnvelope, parseTruexEnvelope, SyncQueue };
export type { TruexEnvelope, SupabaseIntegrationConfig };
