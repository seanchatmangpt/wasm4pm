import { describe, expect, it, vi } from 'vitest';
import {
  resolveSupabaseConfig,
  SupabaseIntegrationError,
  tryResolveSupabaseConfig,
} from '../config.js';

describe('resolveSupabaseConfig', () => {
  it('throws SUPABASE_CREDENTIALS_MISSING when url/key absent', () => {
    expect(() => resolveSupabaseConfig({ env: {} })).toThrow(SupabaseIntegrationError);
    try {
      resolveSupabaseConfig({ env: {} });
    } catch (err) {
      expect(err).toBeInstanceOf(SupabaseIntegrationError);
      expect((err as SupabaseIntegrationError).code).toBe('SUPABASE_CREDENTIALS_MISSING');
    }
  });

  it('merges WASM4PM_* env vars', () => {
    const config = resolveSupabaseConfig({
      env: {
        WASM4PM_SUPABASE_URL: 'https://example.supabase.co',
        WASM4PM_SUPABASE_ANON_KEY: 'test-anon-key',
      },
    });
    expect(config.url).toBe('https://example.supabase.co');
    expect(config.anonKey).toBe('test-anon-key');
  });

  it('tryResolveSupabaseConfig returns null when missing', () => {
    expect(tryResolveSupabaseConfig({ env: {} })).toBeNull();
  });
});

describe('assertAdmittedEnvelope', () => {
  it('refuses non-admitted envelopes', async () => {
    const { assertAdmittedEnvelope, parseTruexEnvelope } = await import('../truex-ingest.js');
    const envelope = parseTruexEnvelope({
      session_id: 's1',
      admission_status: 'ReceiptForged',
      ocel2_batch_hash: 'a'.repeat(64),
      receipt_hash: 'b'.repeat(64),
    });
    expect(() => assertAdmittedEnvelope(envelope)).toThrow(SupabaseIntegrationError);
  });
});

describe('syncCommandReceipts dry-run', () => {
  it('counts local receipts without client calls', async () => {
    const { syncCommandReceipts } = await import('../command-receipt-sync.js');
    const result = await syncCommandReceipts({
      config: resolveSupabaseConfig({
        env: {
          WASM4PM_SUPABASE_URL: 'https://example.supabase.co',
          WASM4PM_SUPABASE_ANON_KEY: 'anon',
        },
      }),
      dryRun: true,
      receiptsDir: '/nonexistent-receipts-dir',
    });
    expect(result.dryRun).toBe(true);
    expect(result.synced).toBe(0);
  });

  it('requires service role for non-dry-run writes', async () => {
    const { syncCommandReceipts } = await import('../command-receipt-sync.js');
    await expect(
      syncCommandReceipts({
        config: resolveSupabaseConfig({
          env: {
            WASM4PM_SUPABASE_URL: 'https://example.supabase.co',
            WASM4PM_SUPABASE_ANON_KEY: 'anon',
          },
        }),
        dryRun: false,
        receiptsDir: '/nonexistent-receipts-dir',
      })
    ).rejects.toMatchObject({ code: 'SUPABASE_SERVICE_ROLE_MISSING' });
  });
});

describe('deriveDoctorStatus', () => {
  it('returns prepublish_only without credentials', async () => {
    const { deriveDoctorStatus } = await import('../live-boundary.js');
    const config = resolveSupabaseConfig({
      env: {
        WASM4PM_SUPABASE_URL: 'https://example.supabase.co',
        WASM4PM_SUPABASE_ANON_KEY: 'anon',
      },
    });
    expect(
      deriveDoctorStatus({
        credentialsPresent: false,
        reachable: false,
        migrationsApplied: false,
        serviceRoleConfigured: false,
        runtimeReceipt: null,
        config,
      })
    ).toBe('prepublish_only');
  });

  it('returns configured when reachable with service role but no runtime receipt', async () => {
    const { deriveDoctorStatus } = await import('../live-boundary.js');
    const config = resolveSupabaseConfig({
      env: {
        WASM4PM_SUPABASE_URL: 'https://example.supabase.co',
        WASM4PM_SUPABASE_ANON_KEY: 'anon',
        WASM4PM_SUPABASE_SERVICE_ROLE_KEY: 'service',
      },
    });
    expect(
      deriveDoctorStatus({
        credentialsPresent: true,
        reachable: true,
        migrationsApplied: true,
        serviceRoleConfigured: true,
        runtimeReceipt: null,
        config,
      })
    ).toBe('configured');
  });

  it('returns live_verified when runtime receipt matches host', async () => {
    const { deriveDoctorStatus, computeRuntimeReceiptHash } = await import('../live-boundary.js');
    const config = resolveSupabaseConfig({
      env: {
        WASM4PM_SUPABASE_URL: 'https://example.supabase.co',
        WASM4PM_SUPABASE_ANON_KEY: 'anon',
        WASM4PM_SUPABASE_SERVICE_ROLE_KEY: 'service',
      },
    });
    const body = {
      kind: 'supabase_runtime_receipt' as const,
      status: 'live_verified' as const,
      boundary: 'supabase' as const,
      package_version: '1.0.0',
      supabase_host: 'example.supabase.co',
      probe_run_id: 'probe-1',
      checks: {
        command_receipt_upsert: true,
        command_receipt_read: true,
        deadletter_write: true,
        edge_function_ingest: true,
      },
      verified_at: '2026-01-01T00:00:00.000Z',
    };
    const runtimeReceipt = {
      ...body,
      receipt_hash: computeRuntimeReceiptHash(body),
    };
    expect(
      deriveDoctorStatus({
        credentialsPresent: true,
        reachable: true,
        migrationsApplied: true,
        serviceRoleConfigured: true,
        runtimeReceipt,
        config,
      })
    ).toBe('live_verified');
  });
});

describe('verifyRuntimeReceipt', () => {
  it('recomputes receipt_hash', async () => {
    const { computeRuntimeReceiptHash, verifyRuntimeReceipt } = await import('../live-boundary.js');
    const body = {
      kind: 'supabase_runtime_receipt' as const,
      status: 'live_verified' as const,
      boundary: 'supabase' as const,
      package_version: '1.0.0',
      supabase_host: '127.0.0.1:54321',
      probe_run_id: 'probe-2',
      checks: {
        command_receipt_upsert: true,
        command_receipt_read: true,
        deadletter_write: true,
        edge_function_ingest: false,
      },
      verified_at: '2026-01-01T00:00:00.000Z',
    };
    const receipt = { ...body, receipt_hash: computeRuntimeReceiptHash(body) };
    expect(verifyRuntimeReceipt(receipt)).toBe(true);
  });
});

describe('ingestTruexEnvelope', () => {
  it('calls edge function for admitted envelope', async () => {
    const { ingestTruexEnvelope } = await import('../truex-ingest.js');
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ receipt_hash: 'abc', inserted: true }),
    });
    const config = resolveSupabaseConfig({
      env: {
        WASM4PM_SUPABASE_URL: 'https://example.supabase.co',
        WASM4PM_SUPABASE_ANON_KEY: 'anon-key',
      },
    });
    const result = await ingestTruexEnvelope({
      config,
      envelope: {
        session_id: 'sess-1',
        admission_status: 'ReceiptAdmitted',
        ocel2_batch_hash: 'a'.repeat(64),
        receipt_hash: 'b'.repeat(64),
      },
      fetchImpl,
    });
    expect(result.via).toBe('edge_function');
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('rejects refused envelope before fetch', async () => {
    const { ingestTruexEnvelope } = await import('../truex-ingest.js');
    const fetchImpl = vi.fn();
    const config = resolveSupabaseConfig({
      env: {
        WASM4PM_SUPABASE_URL: 'https://example.supabase.co',
        WASM4PM_SUPABASE_ANON_KEY: 'anon-key',
      },
    });
    await expect(
      ingestTruexEnvelope({
        config,
        envelope: {
          session_id: 'sess-1',
          admission_status: 'ReceiptForged',
          ocel2_batch_hash: 'a'.repeat(64),
          receipt_hash: 'b'.repeat(64),
        },
        fetchImpl,
      })
    ).rejects.toMatchObject({ code: 'RECEIPT_REFUSED' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('SyncQueue', () => {
  it('enqueue and ack items', async () => {
    const { SyncQueue } = await import('../sync-queue.js');
    const tmp = `.wasm4pm/test-sync-queue-${Date.now()}.json`;
    const queue = new SyncQueue(tmp);
    queue.enqueue({ id: '1', kind: 'command_receipt', payload: { run_id: 'r1' } });
    expect(queue.peek()).toHaveLength(1);
    queue.ack(['1']);
    expect(queue.peek()).toHaveLength(0);
  });
});
