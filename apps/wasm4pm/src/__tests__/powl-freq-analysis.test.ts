/**
 * CAPABILITY GAP — read before editing further.
 *
 * This file used to test `wpm powl freq-analysis` and `wpm powl node-info`:
 * rich POWL-model-STRING frequency-range analysis (TaggedPOWL reference
 * compliance — min/max frequency, skippable/repeatable/unbounded semantics)
 * implemented in `apps/wasm4pm/src/commands/powl.ts` (1578 lines, 15
 * subcommands: parse, exec, simplify, convert, diff, complexity,
 * footprints, conformance, import, discover, validate, get-children,
 * node-info, freq-analysis, load).
 *
 * `apps/wasm4pm/src/commands/powl.ts` is DEAD CODE: `grep -rl
 * "commands/powl" src/nouns/` returns nothing. It is not imported by
 * `cli.ts`'s `ALL_NOUNS`, not bridged by any `lab`/`model`/`evidence` verb
 * (contrast with `commands/predict.ts`, `commands/prolog8.ts`,
 * `commands/trace.ts`, etc., which all got a bridging verb in this same
 * rebuild). `apps/wasm4pm/src/nouns/_removed.ts` maps the bare noun
 * `powl` -> `model discover`, and two SPECIFIC two-token pairs
 * (`powl replay` -> `model check --mode replay`, `powl construct` ->
 * `model discover`) — but `model discover` takes an EVENT LOG as input and
 * mines a process model from it; it has no `--model=<POWL string>` mode
 * and cannot parse, simplify, convert, diff, compute complexity metrics
 * for, or run frequency-range analysis on a POWL model string. Verified
 * live: every `wpm powl <anything>` invocation (including `freq-analysis`
 * and `node-info`) now hard-breaks before any dispatch:
 *
 *   $ wpm powl freq-analysis --model '...' --format json
 *   error: 'wpm powl' was removed — use 'wpm model discover'
 *   (exit 1)
 *
 * This is a genuine, confirmed capability loss — not a rename — and it
 * looks unintentional (a real, substantial subsystem left behind, not a
 * documented deliberate trade-off like the `completions | source` example
 * in the migration plan). Recommendation for the plan owner: either wire
 * `commands/powl.ts` behind a new bridging verb (e.g. `lab powl`, matching
 * the established pattern for `prolog8`/`trace`/`predict`) so this rich,
 * well-specified behavior becomes reachable again, or explicitly ratify
 * dropping it and `trash` `commands/powl.ts` (item 6 of the parent plan
 * currently cannot delete it: its logic is not "fully migrated").
 *
 * Per the migration plan's own guidance for genuinely-removed behavior
 * ("rewrite the assertion to match the new, intentional contract, and add
 * a one-line comment explaining why"), this file is reduced to asserting
 * the CLI's actual current behavior — the hard-break contract — rather
 * than the frequency-analysis semantics it used to verify. The original
 * fixtures and Rank 1/2/3 test descriptions are preserved in comments
 * below so the coverage can be restored quickly if `powl` gets a new home.
 */

import { describe, it, expect } from 'vitest';
import { execFile } from 'child_process';
import * as path from 'path';

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

// Original fixtures, preserved for when/if `powl` gets a new home:
//   PLAIN_MODEL = 'PO=(nodes={A, B, C}, order={A-->B, B-->C})'
//   XOR_TAU_MODEL = 'X ( A, tau )'          — A skippable (min=0, max=1)
//   LOOP_TAU_MODEL = '* ( A, tau )'         — A repeatable+unbounded (min=1, max=null)
//   LOOP_SKIP_MODEL = '* ( tau, A )'        — A skippable+repeatable+unbounded (min=0, max=null)

describe('wpm powl freq-analysis / node-info — hard-break contract (capability gap, see file header)', () => {
  it('freq-analysis hard-breaks with exit 1 and points at the (functionally unrelated) replacement', async () => {
    const result = await runCli(['powl', 'freq-analysis', '--model=X ( A, tau )', '--format=json']);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toMatch(/'wpm powl' was removed — use 'wpm model discover'/);
  });

  it('node-info hard-breaks with exit 1 and points at the (functionally unrelated) replacement', async () => {
    const result = await runCli(['powl', 'node-info', '--model=X ( A, tau )', '--index=0', '--format=json']);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toMatch(/'wpm powl' was removed — use 'wpm model discover'/);
  });

  it('the hard-break fires before any argument validation (no --model at all still exits 1, not a source_error)', async () => {
    const result = await runCli(['powl', 'freq-analysis', '--format=json']);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/was removed/);
  });

  it('every retired POWL model-string subcommand hard-breaks identically (parse/simplify/convert/diff/complexity/footprints/get-children/validate/load)', async () => {
    const retiredSubcommands = [
      'parse', 'simplify', 'convert', 'diff', 'complexity',
      'footprints', 'get-children', 'validate', 'load',
    ];
    for (const sub of retiredSubcommands) {
      const result = await runCli(['powl', sub, '--model=X ( A, tau )']);
      expect(result.exitCode, `subcommand '${sub}' should hard-break`).toBe(1);
      expect(result.stderr, `subcommand '${sub}' message`).toMatch(/'wpm powl' was removed/);
    }
  });

  it('the underlying rich implementation still exists on disk as dead code (commands/powl.ts) — see file header', async () => {
    // Documents the gap precisely rather than asserting behavior that
    // doesn't exist: `commands/powl.ts` is unreachable from any noun/verb.
    const fs = await import('fs');
    const powlCommandPath = path.resolve(__dirname, '../commands/powl.ts');
    expect(fs.existsSync(powlCommandPath)).toBe(true);
  });
});
