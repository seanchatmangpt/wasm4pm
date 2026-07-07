/**
 * supabase-sync.test.ts
 *
 * MIGRATED from the retired top-level `wpm supabase` invocation (see
 * `nouns/_removed.ts`: `supabase` -> `lab supabase`). `lab supabase`
 * bridges unchanged to `commands/supabase.ts` via `invokeLegacyCommandAsJson`
 * (`nouns/_bridge.ts`) — the legacy `CommandResult` envelope is returned
 * as-is as the verb's plain JSON result on success.
 *
 * On failure, the bridge normalizes any legacy error into one of the
 * framework's 9 generic `ErrorCode`s (nouns/_bridge.ts classifyLegacyFailure)
 * and does NOT carry over the legacy command's own specific error code
 * (`SUPABASE_CREDENTIALS_MISSING`) — only its message text survives, inside
 * a generic `INVALID_INPUT`/`EXECUTION_ERROR`/`INTERNAL_ERROR` envelope.
 * Verified live: the doctor-with-no-credentials case now reports
 * `error.code: "INVALID_INPUT"`, exit 2 (source_error) — never
 * `SUPABASE_CREDENTIALS_MISSING` or config_error(1). Assertions below
 * check for the credentials issue via the message text instead.
 */
import { describe, expect, it } from 'vitest';
import { runCli, EXIT_CODES } from '@wasm4pm/testing';

const baseEnv = {
  PATH: process.env.PATH || '',
  HOME: process.env.HOME || '',
};

describe('wpm lab supabase CLI', () => {
  it('sync-receipts dry-run exits 0 with env credentials', async () => {
    const r = await runCli(['lab', 'supabase', 'sync-receipts', '--dry-run', '--format', 'json'], {
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

  // The bridge's generic ErrorCode vocabulary loses the legacy
  // SUPABASE_CREDENTIALS_MISSING code entirely (see file header) and its
  // classifyLegacyFailure/ERROR_CODE_MAP chain resolves legacy config_error
  // to source_error(2), not config_error(1) — verified live. Rewritten to
  // assert the real current contract: INVALID_INPUT / exit 2, with the
  // credentials issue still identifiable from the message text.
  it('doctor fails with source_error (exit 2) and INVALID_INPUT (bridge loses the specific SUPABASE_CREDENTIALS_MISSING code) when env unset', async () => {
    const r = await runCli(['lab', 'supabase', 'doctor', '--format', 'json'], {
      env: baseEnv,
    });
    expect(r.exitCode).toBe(EXIT_CODES.source_error);
    const d = JSON.parse(r.stdout) as { error?: { code?: string; message?: string } };
    expect(d.error?.code).toBe('INVALID_INPUT');
    expect(d.error?.message).toMatch(/supabase/i);
    expect(d.error?.message).toMatch(/url|anon key|credentials/i);
    // NOTE(test): add test for SUPABASE_URL set but ANON_KEY missing (partial
    // credential set should also produce the same INVALID_INPUT/credentials
    // message, not a network timeout or a different error).
  });

  // NOTE(test): add test that sync-receipts with real credentials but an
  // unreachable Supabase URL exits with system_error (5) or source_error (2),
  // not success — verifies network error handling path is exercised.
});
