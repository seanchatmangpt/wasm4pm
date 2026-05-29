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
    expect((d.payload as Record<string, unknown>).dryRun).toBe(true);
  });

  it('doctor fails with SUPABASE_CREDENTIALS_MISSING when env unset', async () => {
    const r = await runCli(['supabase', 'doctor', '--format', 'json'], {
      env: baseEnv,
    });
    expect(r.exitCode).not.toBe(EXIT_CODES.success);
    const d = JSON.parse(r.stdout) as { error?: { code?: string } };
    expect(d.error?.code).toBe('SUPABASE_CREDENTIALS_MISSING');
  });
});
