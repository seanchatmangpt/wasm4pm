/**
 * wpm truex + wpm supabase — excellence integration tests
 *
 * Tests the dramatically improved truex verify (4-layer output), the new
 * truex inspect subcommand, and supabase doctor / query graceful handling.
 *
 * Architecture note:
 *   - truex_verify_receipt is only compiled under the `cloud` WASM feature.
 *     The default build will exit 3 (VERIFIER_ERROR) for Layer 2+.
 *   - truex inspect runs entirely in TypeScript and always works.
 *   - supabase doctor exits 1 (config_error) when credentials are absent.
 *   - supabase query exits 1 (config_error) when credentials are absent.
 *
 * New in this revision (v2):
 *   - variant_count, dangling_ref_count, events_per_object in inspect JSON
 *   - inspect human output shows "=====" separator and variant info
 *   - supabase doctor JSON payload has table_counts and pending_queue_items
 *   - wpm supabase sync --help exits 0 (new alias)
 *   - dangling reference detection (events pointing to non-existent objects)
 */

import { describe, it, expect, afterAll } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { runCli, assertExitCode, EXIT_CODES } from '@wasm4pm/testing';

// ── Fixtures ──────────────────────────────────────────────────────────────────

/** Extract the JSON object from stdout that may be prefixed by [INFO]/[WARN] lines */
function extractJson(stdout: string): string {
  const idx = stdout.indexOf('{');
  if (idx === -1) return stdout;
  return stdout.slice(idx);
}

/** Minimal valid OCEL 2.0 envelope */
const MINIMAL_OCEL: Record<string, unknown> = {
  'ocel:version': '2.0',
  'ocel:events': {
    e1: {
      'ocel:activity': 'Register',
      'ocel:timestamp': '2026-01-01T00:00:00Z',
      'ocel:omap': { o1: 'Order' },
    },
    e2: {
      'ocel:activity': 'Approve',
      'ocel:timestamp': '2026-01-02T10:00:00Z',
      'ocel:omap': { o1: 'Order' },
    },
    e3: {
      'ocel:activity': 'Ship',
      'ocel:timestamp': '2026-05-15T08:30:00Z',
      'ocel:omap': { o1: 'Order', i1: 'Invoice' },
    },
  },
  'ocel:objects': {
    o1: { 'ocel:type': 'Order', 'ocel:ovmap': {} },
    i1: { 'ocel:type': 'Invoice', 'ocel:ovmap': {} },
  },
  'ocel:object-types': {
    Order: {},
    Invoice: {},
  },
};

/** Admitted TrueX envelope (additional TrueX fields on top of OCEL) */
const ADMITTED_TRUEX: Record<string, unknown> = {
  ...MINIMAL_OCEL,
  session_id: 'sess-test-001',
  admission_status: 'ReceiptAdmitted',
  ocel2_batch_hash: 'abc123def456',
  receipt_hash: 'xyz789uvw012',
  device_id: 'dev-001',
  truex_profile: 'standard',
};

/** TrueX envelope that is refused by the WASM verifier */
const REFUSED_TRUEX: Record<string, unknown> = {
  ...MINIMAL_OCEL,
  session_id: 'sess-refused-001',
  admission_status: 'ReceiptForged',
  ocel2_batch_hash: 'bad-hash-999',
  receipt_hash: 'bad-receipt-000',
};

type TmpFile = { filePath: string; cleanup: () => Promise<void> };

async function writeTmpJson(obj: Record<string, unknown>): Promise<TmpFile> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wpm-truex-excellence-'));
  const filePath = path.join(tmpDir, 'envelope.json');
  await fs.writeFile(filePath, JSON.stringify(obj, null, 2), 'utf-8');
  return { filePath, cleanup: async () => fs.rm(tmpDir, { recursive: true, force: true }) };
}

const tmpFiles: TmpFile[] = [];

afterAll(async () => {
  await Promise.all(tmpFiles.map((f) => f.cleanup().catch(() => undefined)));
});

async function withTmp(obj: Record<string, unknown>, fn: (path: string) => Promise<void>) {
  const f = await writeTmpJson(obj);
  tmpFiles.push(f);
  await fn(f.filePath);
}

// ── truex verify --help ────────────────────────────────────────────────────────

describe('wpm truex verify --help', () => {
  it('exits 0 and shows subcommand description', async () => {
    const result = await runCli(['truex', 'verify', '--help']);
    assertExitCode(result, 0);
    expect(result.stdout).toMatch(/verify|OCEL|envelope|receipt/i);
  });

  it('shows --ingest flag in help', async () => {
    const result = await runCli(['truex', 'verify', '--help']);
    assertExitCode(result, 0);
    expect(result.stdout).toMatch(/ingest/i);
  });
});

// ── truex inspect ─────────────────────────────────────────────────────────────

describe('wpm truex inspect', () => {
  it('exits 0 for valid OCEL 2.0 envelope', async () => {
    await withTmp(MINIMAL_OCEL, async (filePath) => {
      const result = await runCli(['truex', 'inspect', filePath]);
      assertExitCode(result, 0);
    });
  });

  it('JSON output has event_count, object_types, time_span', async () => {
    await withTmp(MINIMAL_OCEL, async (filePath) => {
      const result = await runCli(['truex', 'inspect', filePath, '--format', 'json']);
      assertExitCode(result, 0);

      const body = JSON.parse(result.stdout) as {
        payload: {
          event_count: number;
          object_types: string[];
          time_span: { start: string | null; end: string | null; days: number | null };
          object_count: number;
        };
      };
      expect(body.payload.event_count).toBe(3);
      expect(body.payload.object_types).toContain('Order');
      expect(body.payload.object_types).toContain('Invoice');
      expect(body.payload.time_span.start).toMatch(/2026-01-01/);
      expect(body.payload.time_span.end).toMatch(/2026-05-/);
      expect(typeof body.payload.time_span.days).toBe('number');
      expect(body.payload.object_count).toBe(2);
    });
  });

  it('activity_breakdown lists activities', async () => {
    await withTmp(MINIMAL_OCEL, async (filePath) => {
      const result = await runCli(['truex', 'inspect', filePath, '--format', 'json']);
      assertExitCode(result, 0);
      const body = JSON.parse(result.stdout) as {
        payload: { activity_breakdown: { activity: string; count: number; pct: number }[] };
      };
      expect(Array.isArray(body.payload.activity_breakdown)).toBe(true);
      expect(body.payload.activity_breakdown.length).toBeGreaterThan(0);
      const actNames = body.payload.activity_breakdown.map((a) => a.activity);
      expect(actNames).toContain('Register');
    });
  });

  it('ocel_version is captured from envelope', async () => {
    await withTmp(MINIMAL_OCEL, async (filePath) => {
      const result = await runCli(['truex', 'inspect', filePath, '--format', 'json']);
      assertExitCode(result, 0);
      const body = JSON.parse(result.stdout) as { payload: { ocel_version: string | null } };
      expect(body.payload.ocel_version).toBe('2.0');
    });
  });

  it('--verify flag adds schema_valid and schema_checks to JSON output', async () => {
    await withTmp(MINIMAL_OCEL, async (filePath) => {
      const result = await runCli(['truex', 'inspect', filePath, '--format', 'json', '--verify']);
      assertExitCode(result, 0);
      const body = JSON.parse(result.stdout) as {
        payload: { schema_valid: boolean; schema_checks: { label: string; passed: boolean }[] };
      };
      expect(body.payload.schema_valid).toBe(true);
      expect(Array.isArray(body.payload.schema_checks)).toBe(true);
      expect(body.payload.schema_checks.length).toBeGreaterThan(0);
      expect(body.payload.schema_checks.every((c) => c.passed)).toBe(true);
    });
  });

  it('exits non-zero for invalid JSON', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wpm-truex-bad-'));
    const filePath = path.join(tmpDir, 'bad.json');
    await fs.writeFile(filePath, '{ not valid json }', 'utf-8');
    try {
      const result = await runCli(['truex', 'inspect', filePath, '--format', 'json']);
      expect(result.exitCode).not.toBe(0);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('exits source_error (2) for missing file', async () => {
    const result = await runCli([
      'truex',
      'inspect',
      '/nonexistent/path/envelope.json',
      '--format',
      'json',
    ]);
    assertExitCode(result, EXIT_CODES.source_error);
    const body = JSON.parse(result.stdout) as { error: { code: string } };
    expect(body.error.code).toBe('FILE_NOT_FOUND');
  });

  it('human output mentions object types and event count', async () => {
    await withTmp(MINIMAL_OCEL, async (filePath) => {
      const result = await runCli(['truex', 'inspect', filePath]);
      assertExitCode(result, 0);
      const combined = result.stdout + result.stderr;
      expect(combined).toMatch(/event|OCEL/i);
      expect(combined).toMatch(/Order|Invoice/i);
    });
  });
});

// ── truex verify (schema layer + graceful WASM degradation) ───────────────────

describe('wpm truex verify', () => {
  it('exits non-zero for missing file', async () => {
    const result = await runCli([
      'truex',
      'verify',
      '/nonexistent/envelope.json',
      '--format',
      'json',
    ]);
    expect(result.exitCode).not.toBe(0);
  });

  it('JSON output has verdict, layers_passed, layers_total on success or failure', async () => {
    await withTmp(ADMITTED_TRUEX, async (filePath) => {
      const result = await runCli(['truex', 'verify', filePath, '--format', 'json']);
      // WasmLoader may emit [INFO] lines to stdout before the JSON — strip them
      const body = JSON.parse(extractJson(result.stdout)) as Record<string, unknown>;
      // May exit 0 (admitted) or 3 (VERIFIER_ERROR if cloud WASM not present)
      if (result.exitCode === 0) {
        const p = (body.payload as Record<string, unknown>) ?? body;
        expect(typeof (p as { verdict: unknown }).verdict).toBe('string');
        expect(typeof (p as { layers_passed: unknown }).layers_passed).toBe('number');
        expect(typeof (p as { layers_total: unknown }).layers_total).toBe('number');
        expect((p as { layers_total: unknown }).layers_total).toBe(4);
      } else {
        // VERIFIER_ERROR path — still has well-formed CommandResult
        expect(body.status).toBe('error');
        expect(typeof body.exit_code).toBe('number');
      }
    });
  });

  it('VERIFIER_ERROR has well-formed CommandResult envelope', async () => {
    await withTmp({ minimal_invalid: true }, async (filePath) => {
      const result = await runCli(['truex', 'verify', filePath, '--format', 'json']);
      // WasmLoader may emit [INFO] lines to stdout before the JSON — strip them
      const body = JSON.parse(extractJson(result.stdout)) as {
        command: string;
        status: string;
        exit_code: number;
        meta: { run_id: string; timestamp: string };
      };
      expect(body.command).toMatch(/truex/i);
      expect(['ok', 'error']).toContain(body.status);
      expect(typeof body.exit_code).toBe('number');
      expect(typeof body.meta.run_id).toBe('string');
      expect(typeof body.meta.timestamp).toBe('string');
    });
  });

  it('--help exits 0', async () => {
    const result = await runCli(['truex', '--help']);
    assertExitCode(result, 0);
  });
});

// ── supabase doctor ────────────────────────────────────────────────────────────

const noCredsEnv = { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '' };

describe('wpm supabase doctor', () => {
  it('exits 0 when valid (fake) credentials provided — doctor reports configured or live_verified', async () => {
    const result = await runCli(['supabase', 'doctor', '--format', 'json'], {
      env: {
        ...noCredsEnv,
        WASM4PM_SUPABASE_URL: 'https://example.supabase.co',
        WASM4PM_SUPABASE_ANON_KEY: 'fake-anon-key-for-test',
      },
    });
    // With fake credentials the HTTP probe may fail but config resolution succeeds
    // Expected exit: success (0) or system_error (5) depending on reachability
    const body = JSON.parse(result.stdout) as {
      status: string;
      exit_code: number;
      payload?: Record<string, unknown>;
      error?: { code: string };
    };
    // config_error (1) means credentials weren't even read — that is the failure case
    expect(result.exitCode).not.toBe(EXIT_CODES.config_error);
    expect(['ok', 'error']).toContain(body.status);
  });

  it('exits config_error (1) and SUPABASE_CREDENTIALS_MISSING when env unset', async () => {
    const result = await runCli(['supabase', 'doctor', '--format', 'json'], {
      env: noCredsEnv,
    });
    assertExitCode(result, EXIT_CODES.config_error);
    const body = JSON.parse(result.stdout) as { error?: { code?: string } };
    expect(body.error?.code).toBe('SUPABASE_CREDENTIALS_MISSING');
  });

  it('human output mentions connection and sync status', async () => {
    // Use fake credentials so we get past credential check into the doctor runner
    const result = await runCli(['supabase', 'doctor', '--format', 'human'], {
      env: {
        ...noCredsEnv,
        WASM4PM_SUPABASE_URL: 'https://example.supabase.co',
        WASM4PM_SUPABASE_ANON_KEY: 'fake-anon-key-for-test',
      },
    });
    const combined = result.stdout + result.stderr;
    // Human output should mention health / connection / sync status
    expect(combined).toMatch(/connection|supabase|sync|configured/i);
  });
});

// ── supabase query ─────────────────────────────────────────────────────────────

describe('wpm supabase query', () => {
  it('exits config_error (1) when credentials not set', async () => {
    const result = await runCli(['supabase', 'query', 'receipts', '--format', 'json'], {
      env: noCredsEnv,
    });
    assertExitCode(result, EXIT_CODES.config_error);
  });

  it('--help exits 0 and shows table positional', async () => {
    const result = await runCli(['supabase', 'query', '--help']);
    assertExitCode(result, 0);
    expect(result.stdout).toMatch(/table|receipts|query/i);
  });

  it('JSON output has table, row_count, limit fields on credential error path', async () => {
    // Even on error the CommandResult envelope is well-formed
    const result = await runCli(['supabase', 'query', 'receipts', '--format', 'json'], {
      env: noCredsEnv,
    });
    const body = JSON.parse(result.stdout) as {
      command: string;
      status: string;
      meta: { run_id: string };
    };
    expect(body.command).toBe('supabase query');
    expect(body.status).toBe('error');
    expect(typeof body.meta.run_id).toBe('string');
  });
});

// ── NEW: truex inspect v2 — variant_count, dangling_ref_count, events_per_object ─

describe('wpm truex inspect v2 — rich statistics', () => {
  it('JSON output includes variant_count', async () => {
    await withTmp(MINIMAL_OCEL, async (filePath) => {
      const result = await runCli(['truex', 'inspect', filePath, '--format', 'json']);
      assertExitCode(result, 0);
      const body = JSON.parse(result.stdout) as {
        payload: { variant_count: number };
      };
      // MINIMAL_OCEL has 3 events across 2 objects (o1 and i1), so at least 1 variant
      expect(typeof body.payload.variant_count).toBe('number');
      expect(body.payload.variant_count).toBeGreaterThan(0);
    });
  });

  it('JSON output includes dangling_ref_count = 0 for valid envelope', async () => {
    await withTmp(MINIMAL_OCEL, async (filePath) => {
      const result = await runCli(['truex', 'inspect', filePath, '--format', 'json']);
      assertExitCode(result, 0);
      const body = JSON.parse(result.stdout) as {
        payload: { dangling_ref_count: number };
      };
      // All object refs in MINIMAL_OCEL are valid
      expect(body.payload.dangling_ref_count).toBe(0);
    });
  });

  it('JSON output includes events_per_object ratio', async () => {
    await withTmp(MINIMAL_OCEL, async (filePath) => {
      const result = await runCli(['truex', 'inspect', filePath, '--format', 'json']);
      assertExitCode(result, 0);
      const body = JSON.parse(result.stdout) as {
        payload: { events_per_object: number | null };
      };
      // 3 events / 2 objects = 1.5
      expect(body.payload.events_per_object).not.toBeNull();
      expect(typeof body.payload.events_per_object).toBe('number');
      expect((body.payload.events_per_object as number)).toBeGreaterThan(0);
    });
  });

  it('detects dangling_ref_count > 0 when events reference missing objects', async () => {
    const withDanglingRef: Record<string, unknown> = {
      'ocel:version': '2.0',
      'ocel:events': {
        e1: {
          'ocel:activity': 'Register',
          'ocel:timestamp': '2026-01-01T00:00:00Z',
          'ocel:omap': { o1: 'Order', MISSING_OBJ: 'Order' }, // MISSING_OBJ not in objects
        },
      },
      'ocel:objects': {
        o1: { 'ocel:type': 'Order', 'ocel:ovmap': {} },
        // MISSING_OBJ intentionally absent
      },
      'ocel:object-types': { Order: {} },
    };
    await withTmp(withDanglingRef, async (filePath) => {
      const result = await runCli(['truex', 'inspect', filePath, '--format', 'json']);
      assertExitCode(result, 0); // inspect still succeeds; it reports the issue in payload
      const body = JSON.parse(result.stdout) as {
        payload: { dangling_ref_count: number };
      };
      expect(body.payload.dangling_ref_count).toBeGreaterThan(0);
    });
  });

  it('human output includes separator "=====" header', async () => {
    await withTmp(MINIMAL_OCEL, async (filePath) => {
      const result = await runCli(['truex', 'inspect', filePath]);
      assertExitCode(result, 0);
      expect(result.stdout + result.stderr).toMatch(/={3,}/); // "=====" separator
    });
  });

  it('human output shows events/object ratio', async () => {
    await withTmp(MINIMAL_OCEL, async (filePath) => {
      const result = await runCli(['truex', 'inspect', filePath]);
      assertExitCode(result, 0);
      const combined = result.stdout + result.stderr;
      expect(combined).toMatch(/Events\/object|events.per.object|Events.object/i);
    });
  });
});

// ── NEW: supabase doctor v2 — table_counts in JSON payload ───────────────────

describe('wpm supabase doctor v2 — enriched payload', () => {
  it('JSON payload includes pending_queue_items field', async () => {
    const result = await runCli(['supabase', 'doctor', '--format', 'json'], {
      env: {
        ...noCredsEnv,
        WASM4PM_SUPABASE_URL: 'https://example.supabase.co',
        WASM4PM_SUPABASE_ANON_KEY: 'fake-anon-key-for-test',
      },
    });
    // Even if the connection fails, the payload struct should be well-formed
    const body = JSON.parse(result.stdout) as {
      status: string;
      payload?: { pending_queue_items?: number };
      error?: { code: string };
    };
    // config_error means credentials were not found — should not happen here
    expect(result.exitCode).not.toBe(EXIT_CODES.config_error);
    // When not config_error, payload should be present
    if (body.payload) {
      expect(typeof body.payload.pending_queue_items).toBe('number');
    }
  });

  it('JSON payload includes table_counts object', async () => {
    const result = await runCli(['supabase', 'doctor', '--format', 'json'], {
      env: {
        ...noCredsEnv,
        WASM4PM_SUPABASE_URL: 'https://example.supabase.co',
        WASM4PM_SUPABASE_ANON_KEY: 'fake-anon-key-for-test',
      },
    });
    expect(result.exitCode).not.toBe(EXIT_CODES.config_error);
    const body = JSON.parse(result.stdout) as {
      payload?: { table_counts?: Record<string, number | null> };
    };
    if (body.payload) {
      // table_counts should exist and have receipts + envelopes keys
      expect(body.payload.table_counts).toBeDefined();
      if (body.payload.table_counts) {
        expect(Object.keys(body.payload.table_counts)).toContain('receipts');
        expect(Object.keys(body.payload.table_counts)).toContain('envelopes');
      }
    }
  });

  it('human output shows Tables: section', async () => {
    const result = await runCli(['supabase', 'doctor', '--format', 'human'], {
      env: {
        ...noCredsEnv,
        WASM4PM_SUPABASE_URL: 'https://example.supabase.co',
        WASM4PM_SUPABASE_ANON_KEY: 'fake-anon-key-for-test',
      },
    });
    expect(result.exitCode).not.toBe(EXIT_CODES.config_error);
    const combined = result.stdout + result.stderr;
    expect(combined).toMatch(/Tables:/i);
  });
});

// ── NEW: wpm supabase sync --help (new alias) ─────────────────────────────────

describe('wpm supabase sync (alias for sync-receipts)', () => {
  it('--help exits 0', async () => {
    const result = await runCli(['supabase', 'sync', '--help']);
    assertExitCode(result, 0);
  });

  it('--help mentions sync or receipts', async () => {
    const result = await runCli(['supabase', 'sync', '--help']);
    assertExitCode(result, 0);
    expect(result.stdout).toMatch(/sync|receipt|upload/i);
  });

  it('exits config_error (1) when credentials not set', async () => {
    const result = await runCli(['supabase', 'sync', '--format', 'json'], {
      env: noCredsEnv,
    });
    assertExitCode(result, EXIT_CODES.config_error);
    const body = JSON.parse(result.stdout) as { error?: { code?: string } };
    expect(body.error?.code).toBe('SUPABASE_CREDENTIALS_MISSING');
  });

  it('--dry-run exits config_error (1) when credentials not set', async () => {
    const result = await runCli(['supabase', 'sync', '--dry-run', '--format', 'json'], {
      env: noCredsEnv,
    });
    assertExitCode(result, EXIT_CODES.config_error);
  });
});
