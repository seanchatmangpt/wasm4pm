/**
 * doctor.test.ts — bare `wpm doctor` invocation contract.
 *
 * When invoked without a subcommand, `wpm doctor` should print help/usage
 * (subcommand list) and exit cleanly. This guards against citty regressions
 * where the parent verb either crashes, exits non-zero, or prints help to stderr.
 *
 * Oracle rank: Rank 2 (Domain contract — CLI help behavior).
 */

import { describe, it, expect } from 'vitest';
import { runCli } from '@wasm4pm/testing';

describe('wpm doctor — bare invocation', () => {
  it('exits 0 and prints help/usage to stdout', async () => {
    const result = await runCli(['doctor']);
    expect(result?.exitCode).toBe(0);
    // Help output should advertise the verb dispatch surface.
    expect(result?.stdout).toMatch(/USAGE|SUBCOMMANDS|check.*fix.*publish/s);
    expect(result?.stderr).toBe('');
  });
});
