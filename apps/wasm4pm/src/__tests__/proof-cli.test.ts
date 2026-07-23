/**
 * CAPABILITY GAP — read before editing further.
 *
 * This file used to test `wpm proof collect|verify|show|audit|promote` —
 * the "proof pack" Andon gate (run tests, collect BLAKE3-hashed evidence
 * into a pack, independently re-verify it, check producer approval)
 * implemented in `apps/wasm4pm/src/commands/proof.ts`.
 *
 * `apps/wasm4pm/src/commands/proof.ts` is DEAD CODE: `grep -rl
 * "commands/proof" src/nouns/` returns nothing — it is not imported by
 * `cli.ts`'s `ALL_NOUNS` and not bridged by any verb. Per
 * `apps/wasm4pm/src/nouns/_removed.ts`, the bare noun `proof` maps to
 * `evidence report` — but `evidence report` bridges to a COMPLETELY
 * DIFFERENT legacy command, `commands/results.ts` ("view saved discovery/
 * prediction results"), which has no collect/verify/show/audit/promote
 * subcommands and no BLAKE3 proof-pack semantics at all. Verified live:
 *
 *   $ wpm proof collect
 *   error: 'wpm proof' was removed — use 'wpm evidence report'
 *   (exit 1)
 *
 * This is the same class of gap documented in
 * `apps/wasm4pm/src/__tests__/powl-freq-analysis.test.ts` (see that file's
 * header for the fuller pattern write-up): a substantial, well-specified
 * legacy command left completely unbridged, with a `_removed.ts` entry
 * that names an unrelated noun/verb rather than a functional equivalent.
 * Recommendation for the plan owner: wire `commands/proof.ts` behind a new
 * bridging verb (e.g. `lab proof` or `evidence proof`, matching the
 * established pattern for `prolog8`/`trace`/`predict`/`models`), or
 * explicitly ratify dropping the proof-pack gate and `trash`
 * `commands/proof.ts` (the parent plan's item 6 cannot delete it as-is:
 * its logic is not "fully migrated").
 *
 * PRE-EXISTING BUG (unrelated to the noun-verb rebuild, found while
 * migrating this file): every test below called the shared `runCli` test
 * helper (`@wasm4pm/testing`, signature `runCli(args: string[], options?)`)
 * as `runCli('proof', ['collect', ...])` — a STRING as the first argument,
 * not an array. Spreading a string in JS iterates its characters, so the
 * actual child process was invoked as `wpm p r o o f collect ...`, which is
 * nonsense — the assertions never exercised real `proof` behavior even
 * before this migration; they only passed because the exit-code tolerance
 * was `[0,1,2,3,4,5]` (i.e. "any code"). This is fixed below as part of
 * making the file test what it says it tests.
 *
 * Per the migration plan's guidance for genuinely-removed behavior, this
 * file is reduced to asserting the CLI's actual current (hard-break)
 * behavior for every subcommand it used to exercise.
 */

import { describe, it, expect } from 'vitest';
import { runCli, createCliTestEnv } from '@wasm4pm/testing';

describe('wpm proof — hard-break contract (capability gap, see file header)', () => {
  it.each(['collect', 'verify', 'show', 'audit', 'promote'] as const)(
    'proof %s hard-breaks with exit 1 and points at the (functionally unrelated) replacement',
    async (sub) => {
      await createCliTestEnv();
      const result = await runCli(['proof', sub]);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toMatch(/'wpm proof' was removed — use 'wpm evidence report'/);
    }
  );

  it('the hard-break fires before any argument validation (flags are irrelevant)', async () => {
    const result = await runCli(['proof', 'verify', '/nonexistent-pack', '--format', 'json']);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/was removed/);
  });

  it('the underlying rich implementation still exists on disk as dead code (commands/proof.ts) — see file header', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const proofCommandPath = path.resolve(__dirname, '../commands/proof.ts');
    expect(fs.existsSync(proofCommandPath)).toBe(true);
  });
});
