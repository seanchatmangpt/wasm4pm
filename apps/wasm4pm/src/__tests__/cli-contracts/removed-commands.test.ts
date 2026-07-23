/**
 * Hard-break regression: every retired `wpm` v1 invocation from
 * `apps/wasm4pm/src/nouns/_removed.ts` must, when actually invoked through
 * the built CLI, exit 1 and mention its replacement on stderr — BEFORE
 * any WASM/OTEL/dispatch machinery spins up (this table is checked first
 * thing in `bin/wpm.ts`'s bootstrap).
 *
 * The table is imported directly from source (not re-typed by hand), so
 * this test iterates the actual hard-break surface and can never silently
 * drift from it.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'node:fs';
import { REMOVED_COMMANDS } from '../../nouns/_removed.js';
import { runCli, CLI_PATH } from './_helpers.js';

beforeAll(() => {
  expect(fs.existsSync(CLI_PATH), `Built CLI missing at ${CLI_PATH} — run "pnpm --filter @wasm4pm/cli build" first`).toBe(true);
});

describe('hard-break regression — every removed wpm v1 command exits 1 and names its replacement', () => {
  it('the removed-commands table is non-trivial (sanity floor — catches an accidentally emptied table)', () => {
    expect(REMOVED_COMMANDS.length).toBeGreaterThanOrEqual(40);
  });

  it.each(REMOVED_COMMANDS.map((e) => ({ old: e.old, replacement: e.replacement })))(
    "wpm $old — exits 1 and stderr mentions '$replacement'",
    async ({ old, replacement }) => {
      const r = await runCli(old.split(' '), { timeoutMs: 15_000 });
      expect(r.exitCode, `wpm ${old}: expected exit 1, got ${r.exitCode}\nstdout=${r.stdout}\nstderr=${r.stderr}`).toBe(1);
      expect(r.stderr).toContain(replacement);
    }
  );
});
