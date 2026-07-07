import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runCli, EXIT_CODES, createCliTestEnv } from '@wasm4pm/testing';

/**
 * Migration note: `wpm config verify` is a retired invocation — see
 * `nouns/_removed.ts`'s two-token entry `{ old: 'config verify',
 * replacement: 'config check' }`. `bin/wpm.ts` intercepts it via
 * `checkRemoved()` BEFORE any dispatch, printing the standard removal
 * error to stderr and exiting 1, for every invocation regardless of flags
 * (verified live: bare, `--format json`, and `--quiet` all produce the
 * identical removal message/exit code — there is no gate-checking logic
 * left to reach). The 4-gate model this file originally tested (schema
 * valid / provenance complete / zero warnings / hash present) does not
 * exist in any form post-migration; `config check`'s single warnings
 * check (covered by `config-check-cli.test.ts`) is the closest surviving
 * equivalent. This file now asserts the intentional hard-break contract
 * itself, per `nouns/_removed.ts`'s doc comment ("Never surfaced in
 * --help or generated docs — this is a migration aid").
 */
describe('wpm config verify — retired, hard-broken to `config check`', () => {
  let env: Awaited<ReturnType<typeof createCliTestEnv>>;

  beforeEach(async () => {
    env = await createCliTestEnv();
  });

  afterEach(() => {
    env?.cleanup?.();
  });

  it('exits 1 with a removal message pointing at `config check`', async () => {
    const result = await runCli(['config', 'verify']);
    expect(result.exitCode).toBe(EXIT_CODES.config_error);
    expect(result.stderr).toMatch(/'wpm config verify' was removed/);
    expect(result.stderr).toMatch(/wpm config check/);
  });

  it('hard-breaks the same way regardless of trailing flags (--format json)', async () => {
    const result = await runCli(['config', 'verify', '--format', 'json']);
    expect(result.exitCode).toBe(EXIT_CODES.config_error);
    expect(result.stderr).toMatch(/'wpm config verify' was removed/);
  });

  it('hard-breaks the same way regardless of trailing flags (--quiet)', async () => {
    const result = await runCli(['config', 'verify', '--quiet']);
    expect(result.exitCode).toBe(EXIT_CODES.config_error);
    expect(result.stderr).toMatch(/'wpm config verify' was removed/);
  });

  it('never prints anything on stdout for the retired invocation (removal message is stderr-only)', async () => {
    const result = await runCli(['config', 'verify']);
    expect(result.stdout).toBe('');
  });

  it('the replacement, `config check`, runs successfully in its place', async () => {
    // Not a duplicate of config-check-cli.test.ts's own coverage — just a
    // smoke check that the documented replacement command actually exists
    // and is reachable, since this file no longer exercises `config
    // verify`'s own (removed) behavior at all.
    const result = await runCli(['config', 'check']);
    expect([EXIT_CODES.success, EXIT_CODES.execution_error]).toContain(result.exitCode);
    expect(() => JSON.parse(result.stdout)).not.toThrow();
  });
});
