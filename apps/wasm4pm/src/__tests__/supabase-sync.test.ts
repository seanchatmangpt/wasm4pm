import { describe, expect, it } from 'vitest';
import { runCli, EXIT_CODES } from '@wasm4pm/testing';

const baseEnv = {
  PATH: process.env.PATH || '',
  HOME: process.env.HOME || '',
};

describe('wpm supabase CLI', () => {
  it('sync-receipts dry-run exits 0 with env credentials', async () => {
    const r = await runCli(['supabase', 'sync-receipts', '--dry-run', '--format', 'json'], {
      env: {
        ...baseEnv,
        WASM4PM_SUPABASE_URL: 'https://example.supabase.co',
        WASM4PM_SUPABASE_ANON_KEY: 'test-anon-key',
      },
    });

    expect(r.exitCode).toBe(EXIT_CODES.success);
    const d = JSON.parse(r.stdout) as Record<string, unknown>;
    expect(d.command).toBe('supabase sync-receipts');
    // FM-5: verify the payload carries the dry-run flag that was passed, not just
    // that it's a truthy value — confirms the CLI correctly parses and echoes the flag.
    expect((d.payload as Record<string, unknown>).dryRun).toBe(true);
    // NOTE(test): add assertion that payload.syncedCount === 0 for dry-run
    // (verifies no actual network I/O occurs in dry-run mode).
  });

  it('doctor fails with config_error (exit 1) and SUPABASE_CREDENTIALS_MISSING when env unset', async () => {
    const r = await runCli(['supabase', 'doctor', '--format', 'json'], {
      env: baseEnv,
    });
    // FM-5: must be config_error (1), not just non-zero — missing credentials is a
    // configuration problem, not a network or execution error.
    expect(r.exitCode).toBe(EXIT_CODES.config_error);
    const d = JSON.parse(r.stdout) as { error?: { code?: string } };
    expect(d.error?.code).toBe('SUPABASE_CREDENTIALS_MISSING');
    // NOTE(test): add test for SUPABASE_URL set but ANON_KEY missing (partial
    // credential set should also produce SUPABASE_CREDENTIALS_MISSING, not a
    // network timeout or a different error code).
  });

  // NOTE(test): add test that sync-receipts with real credentials but an
  // unreachable Supabase URL exits with system_error (5) or source_error (2),
  // not success — verifies network error handling path is exercised.
});
