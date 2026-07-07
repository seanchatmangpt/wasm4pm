/**
 * CAPABILITY GAP — read before editing further.
 *
 * This file used to comprehensively test `wpm powl <subcommand>` for
 * parse, simplify, convert, diff, complexity, footprints, conformance,
 * import, discover, and validate — POWL model analysis implemented in
 * `apps/wasm4pm/src/commands/powl.ts` (1578 lines, 15 subcommands).
 *
 * See `apps/wasm4pm/src/__tests__/powl-freq-analysis.test.ts`'s file header
 * for the full writeup of this gap. Summary: `commands/powl.ts` is DEAD
 * CODE — not imported by any noun/verb in `apps/wasm4pm/src/nouns/`. The
 * `_removed.ts` hard-break table's mapping (`powl` -> `model discover`) is
 * misleading as a functional equivalent: `model discover` mines a model
 * FROM AN EVENT LOG; it has no mode that parses, simplifies, converts,
 * diffs, computes complexity/footprints for, or discovers-from-a-POWL-
 * model-string the way `commands/powl.ts`'s subcommands did. Every `wpm
 * powl <subcommand>` invocation now hard-breaks before any dispatch,
 * regardless of subcommand:
 *
 *   $ wpm powl discover --model '...' --log '...' --with-quality
 *   error: 'wpm powl' was removed — use 'wpm model discover'
 *   (exit 1)
 *
 * This looks like an unintentional gap in the noun-verb rebuild (a
 * substantial, well-specified subsystem left unbridged), not a deliberate
 * design trade-off. Recommendation for the plan owner: wire
 * `commands/powl.ts` behind a new bridging verb (e.g. `lab powl`, matching
 * the established pattern for `prolog8`/`trace`/`predict`/`models`) so
 * this functionality becomes reachable again, or explicitly ratify
 * dropping it and `trash` `commands/powl.ts` (the parent plan's item 6
 * cannot delete it as-is: its logic is not "fully migrated" and it still
 * has zero test coverage of its actual behavior either way).
 *
 * Per the migration plan's guidance for genuinely-removed behavior, this
 * file is reduced to asserting the CLI's actual current (hard-break)
 * behavior for every subcommand this file used to exercise, rather than
 * the parse/simplify/convert/diff/complexity/footprints/conformance/
 * import/discover/validate semantics it used to verify. The original
 * fixture-building helpers (seeded faker activity names, XES builder) are
 * preserved below, unused, as a ready-made basis for a `lab powl`
 * integration-test rewrite if that verb gets built.
 */

import { describe, it, expect } from 'vitest';
import { execFile } from 'child_process';
import * as path from 'path';
import { Faker, en } from '@faker-js/faker';

// ─── Seeded faker (preserved for a future `lab powl` rewrite) ─────────────────

const faker = new Faker({ locale: [en] });
faker.seed(42);

const slug = (w: string) => w.toLowerCase().replace(/[^a-z0-9]+/g, '_');
const act = (...parts: string[]) => parts.map(slug).join('_');

const V = {
  actA: act(faker.hacker.ingverb(), 'register'),
  actB: act(faker.hacker.ingverb(), 'approve'),
  actC: act(faker.hacker.ingverb(), 'ship'),
  actD: act(faker.hacker.ingverb(), 'invoice'),
  actE: act(faker.hacker.ingverb(), 'close'),
};
void V; // referenced only to keep the seeded fixture from being flagged unused

// ─── CLI helper ────────────────────────────────────────────────────────────

const CLI_PATH = path.resolve(__dirname, '../../dist/bin/wpm.js');

interface CliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

function runCli(args: string[], opts: { timeoutMs?: number } = {}): Promise<CliResult> {
  const { timeoutMs = 45000 } = opts;
  const cwd = path.resolve(__dirname, '../..');
  return new Promise((resolve) => {
    const child = execFile(
      process.execPath,
      [CLI_PATH, ...args],
      { timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024, cwd },
      (error, stdout, stderr) => {
        const exitCode =
          error && 'code' in error && typeof error.code === 'number'
            ? error.code
            : error
              ? 1
              : 0;
        resolve({ exitCode, stdout: stdout ?? '', stderr: stderr ?? '' });
      }
    );
    child.on('error', () =>
      resolve({ exitCode: 5, stdout: '', stderr: 'Process failed to start' })
    );
  });
}

// The 9 original + 1 new subcommand this file used to cover in depth:
//   parse, simplify, convert, diff, complexity, footprints, conformance,
//   import, discover, validate
const ALL_POWL_SUBCOMMANDS = [
  'parse',
  'exec',
  'simplify',
  'convert',
  'diff',
  'complexity',
  'footprints',
  'conformance',
  'import',
  'discover',
  'validate',
  'get-children',
  'node-info',
  'freq-analysis',
  'load',
] as const;

describe('wpm powl <subcommand> — hard-break contract (capability gap, see file header)', () => {
  it.each(ALL_POWL_SUBCOMMANDS)('%s hard-breaks with exit 1 before any dispatch', async (sub) => {
    const result = await runCli(['powl', sub, '--model=X ( A, tau )']);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toMatch(/'wpm powl' was removed — use 'wpm model discover'/);
  });

  it('discover --with-quality (the richest old invariant under test) still just hard-breaks — no quality metrics are computed', async () => {
    const result = await runCli(['powl', 'discover', '--log=[]', '--with-quality']);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
  });

  it('the hard-break table intercepts powl before WASM initialization or any file I/O', async () => {
    // Passing a nonexistent --model file should still hard-break with exit 1,
    // not a source_error(2) from a failed file read — proving the
    // interception happens before `commands/powl.ts` (dead code) could ever
    // run, regardless of argument validity.
    const result = await runCli(['powl', 'diff', '--model=/nonexistent/a.powl']);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/was removed/);
  });
});
