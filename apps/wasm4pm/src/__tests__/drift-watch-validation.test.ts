/**
 * drift-watch-validation.test.ts
 *
 * MIGRATION NOTE: the four validation gaps this file originally covered
 * (--window, --threshold, --alpha, --interval range/type checks) all
 * belonged to the old *continuous* `wpm drift-watch` monitor. `model check
 * --mode drift` (the one-shot replacement — see `nouns/model/check.ts` and
 * `nouns/_removed.ts`) has exactly ONE configurable parameter,
 * `--window-size`, and it performs NO CLI-level format/range validation at
 * all: `Number(args['window-size'])` is passed straight to the Rust engine,
 * which internally clamps `window_size.max(1)` rather than rejecting bad
 * input. There is no `--threshold`, `--alpha`, or `--interval` flag on this
 * verb (those configured the streaming EWMA/alert loop, which was not
 * migrated — see drift-watch-streaming.test.ts's own note).
 *
 * So none of the original Gap 1-4 scenarios exist to test anymore. This
 * file now tests the validation surface that DOES exist on
 * `model check --mode drift`: mode-format compatibility (OCEL rejected),
 * unknown --mode rejection, and the documented --window-size clamping
 * behavior (which replaces "reject bad --window" with "silently clamp").
 */

import { describe, it, expect } from 'vitest';
import { execFile } from 'child_process';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

const CLI_PATH = path.resolve(__dirname, '../../dist/bin/wpm.js');
const MISSING_INPUT = path.join(os.tmpdir(), '__drift_watch_no_such_file__.xes');
const FIXTURE_XES = path.resolve(__dirname, '../../../../data/small-example.xes');
const CLEAN_CWD = os.tmpdir();

interface CliResult { exitCode: number; stdout: string; stderr: string; }

function run(args: string[], timeoutMs = 20000): Promise<CliResult> {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [CLI_PATH, ...args],
      { cwd: CLEAN_CWD, timeout: timeoutMs, maxBuffer: 5 * 1024 * 1024 },
      (error, stdout, stderr) => {
        const code =
          error && 'code' in error && typeof error.code === 'number'
            ? error.code
            : error
              ? 1
              : 0;
        resolve({ exitCode: code, stdout: stdout ?? '', stderr: stderr ?? '' });
      }
    );
  });
}

describe('model check --mode drift — missing/invalid input (replaces old Gap 1-4 flag validation)', () => {
  it('missing input file exits 2 (INVALID_INPUT / source_error) regardless of --window-size', async () => {
    const r = await run(['model', 'check', MISSING_INPUT, '--mode', 'drift', '--window-size', '5']);
    expect(r.exitCode).toBe(2);
    const parsed = JSON.parse(r.stdout) as { error?: { code?: string } };
    expect(parsed.error?.code).toBe('INVALID_INPUT');
  });

  it('unknown --mode is rejected before any window-size handling runs', async () => {
    const r = await run(['model', 'check', MISSING_INPUT, '--mode', 'not-a-real-mode']);
    expect(r.exitCode).toBe(2);
    const parsed = JSON.parse(r.stdout) as { error?: { message?: string } };
    expect(parsed.error?.message).toMatch(/Unknown --mode/);
  });
});

describe('model check --mode drift — --window-size is silently clamped, not validated (documented behavior change)', () => {
  it('--window-size 0 does not error: the Rust engine clamps to 1', async () => {
    const r = await run(['model', 'check', FIXTURE_XES, '--mode', 'drift', '--window-size', '0']);
    expect(r.exitCode).toBe(0);
    const parsed = JSON.parse(r.stdout) as { drift: { window_size: number } };
    expect(parsed.drift.window_size).toBe(1);
  });

  it('--window-size 5 (ordinary valid value) passes through unchanged', async () => {
    const r = await run(['model', 'check', FIXTURE_XES, '--mode', 'drift', '--window-size', '5']);
    expect(r.exitCode).toBe(0);
    const parsed = JSON.parse(r.stdout) as { windowSize: number; drift: { window_size: number } };
    expect(parsed.windowSize).toBe(5);
    expect(parsed.drift.window_size).toBe(5);
  });

  it('there is no --threshold, --alpha, or --interval flag on this verb — passing one is simply ignored, not rejected', async () => {
    // Historical: these flags used to configure the continuous EWMA/alert
    // loop and had dedicated range validators (config_error=1 on bad
    // input). None of that logic exists on the one-shot verb; citty
    // silently accepts and ignores flags the verb's `args` schema doesn't
    // declare. This test documents that the old rejection behavior is
    // gone, rather than silently dropping coverage of the flag entirely.
    const r = await run([
      'model', 'check', FIXTURE_XES, '--mode', 'drift',
      '--threshold', '999', '--alpha', '-5', '--interval', '-1',
    ]);
    expect(r.exitCode).toBe(0);
  });
});

describe('fixture availability', () => {
  it('the shared small-example.xes fixture exists', () => {
    expect(fs.existsSync(FIXTURE_XES)).toBe(true);
  });
});
