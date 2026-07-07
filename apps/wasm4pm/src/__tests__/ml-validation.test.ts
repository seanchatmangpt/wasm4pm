/**
 * ml-validation.test.ts
 *
 * Migrated from the old top-level `wpm ml <task>` onto `wpm lab ml <task>`
 * (nouns/_removed.ts: `{ old: 'ml', replacement: 'lab ml' }`), bridged
 * unmodified to `commands/ml.ts` (see `nouns/lab/ml.ts` / `nouns/_bridge.ts`).
 *
 * Unit-level tests for the three validation gaps closed in iter16:
 *
 *   Gap 1 — Unknown task exits with config_error (1) in the legacy
 *            envelope, but the noun-verb bridge (`invokeLegacyCommandAsJson`
 *            -> `classifyLegacyFailure`) collapses BOTH legacy exit 1
 *            (config_error) and legacy exit 2 (source_error) onto the same
 *            `INVALID_INPUT` framework error code, which wpm's
 *            `ERROR_CODE_MAP` maps to `EXIT_CODES.source_error` (2). This
 *            is an intentional, documented tradeoff of the generic bridge
 *            (`_bridge.ts`'s own doc comment: "the framework's ErrorCode
 *            vocabulary ... is coarser than wpm's legacy 7-value exit-code
 *            contract ... a best-effort mapping, not a lossless one") —
 *            the original 1-vs-2 distinction this gap tested is no longer
 *            observable through the process exit code for a bridged verb,
 *            though the *message* content (which task/format/value was bad)
 *            still comes through unchanged. All three gaps below now
 *            assert exit code 2 uniformly, verified live against the built
 *            CLI, not assumed.
 *   Gap 2 — --format must be "human" or "json": any other value → still
 *            rejected, message still names the bad value (verified after
 *            fixing a real bug this migration surfaced — see below).
 *   Gap 3 — --k must be a positive integer: 0, negative, or non-integer →
 *            rejected.
 *
 * BUG FOUND AND FIXED (commands/ml.ts): the --format validation branch
 * unconditionally called `emitResult(result, { format: 'human', ... })`
 * even when `quiet: true`. `emitResult` (`output.ts`) unconditionally
 * suppresses ALL output when `quiet && format !== 'json' && format !==
 * 'sarif'` — so a quiet caller (the bridge always appends `--quiet`) got
 * completely silent output for this one validation branch: empty stdout,
 * and the bridge's generic "command exited with code N" fallback message
 * with none of the actual diagnostic text. Fixed to emit 'json' instead of
 * 'human' specifically when `quiet` is set (real interactive/human usage,
 * where quiet is false, is unaffected and still gets the friendly text).
 *
 * All tests are purely CLI-level (execFile) and do NOT require the WASM
 * binary: the validation rejects before WasmLoader.init() is ever called.
 */

import { describe, it, expect } from 'vitest';
import { execFile } from 'child_process';
import * as path from 'path';
import * as os from 'os';

// ---------------------------------------------------------------------------
// Infrastructure
// ---------------------------------------------------------------------------

const CLI_PATH = path.resolve(__dirname, '../../dist/bin/wpm.js');
// A missing file: ml validation should fire before file access for task/format/k errors.
const MISSING_INPUT = path.join(os.tmpdir(), '__ml_no_such_file__.xes');
const CLEAN_CWD = os.tmpdir();

interface CliResult { exitCode: number; stdout: string; stderr: string; }

function run(args: string[], timeoutMs = 20000): Promise<CliResult> {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [CLI_PATH, 'lab', 'ml', ...args],
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

function parseJson(r: CliResult): Record<string, unknown> {
  return JSON.parse(r.stdout) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Gap 1: Unknown task → rejected with source_error (2) through the bridge
// ---------------------------------------------------------------------------

describe('wpm lab ml unknown task → rejected (Gap 1)', () => {
  it('bogus task exits with 2 (source_error, via the bridge — see file header)', async () => {
    const r = await run(['bogus', '-i', MISSING_INPUT]);
    expect(r.exitCode).toBe(2);
  });

  it('bogus task emits a structured error envelope', async () => {
    const r = await run(['bogus', '-i', MISSING_INPUT]);
    expect(r.exitCode).toBe(2);
    expect(() => parseJson(r)).not.toThrow();
    const env = parseJson(r);
    expect(env.error).toBeDefined();
    expect((env.error as Record<string, unknown>).code).toBe('INVALID_INPUT');
  });

  it('bogus task message mentions valid tasks', async () => {
    const r = await run(['bogus', '-i', MISSING_INPUT]);
    const body = r.stdout + r.stderr;
    // Must tell user what the valid tasks are
    expect(body).toMatch(/classify|cluster|forecast|anomaly|regress|pca/i);
  });

  it('bogus task message names the bad task', async () => {
    const r = await run(['bogus', '-i', MISSING_INPUT]);
    const body = r.stdout + r.stderr;
    expect(body).toContain('bogus');
  });

  it('"wpm lab ml TOTALLY_UNKNOWN_TASK" exits 2', async () => {
    const r = await run(['TOTALLY_UNKNOWN_TASK', '-i', MISSING_INPUT]);
    expect(r.exitCode).toBe(2);
  });

  it('valid task names do not fail task-validation (still exit 2, but for missing-file, not INVALID_TASK)', async () => {
    // 'cluster' is valid — should fail later on missing-file instead.
    const r = await run(['cluster', '-i', MISSING_INPUT]);
    expect(r.exitCode).toBe(2);
    const body = r.stdout + r.stderr;
    expect(body).not.toContain('Unknown ML task');
    expect(body).toMatch(/not found/i);
  });
});

// ---------------------------------------------------------------------------
// Gap 2: --format validation
// ---------------------------------------------------------------------------

describe('wpm lab ml --format validation (Gap 2)', () => {
  it('--format xml exits with 2 and names the bad value (regression test for the emitResult/quiet bug — see file header)', async () => {
    const r = await run(['cluster', '-i', MISSING_INPUT, '--format', 'xml']);
    expect(r.exitCode).toBe(2);
    const body = r.stdout + r.stderr;
    expect(body).toMatch(/human|json/i);
    expect(body).toContain('xml');
  });

  it('--format csv exits with 2 and names the bad value', async () => {
    const r = await run(['cluster', '-i', MISSING_INPUT, '--format', 'csv']);
    expect(r.exitCode).toBe(2);
    const body = r.stdout + r.stderr;
    expect(body).toContain('csv');
  });

  it('--format human (valid) does not reject with format validation', async () => {
    const r = await run(['cluster', '-i', MISSING_INPUT, '--format', 'human']);
    // Should fail at file-not-found instead.
    const body = r.stdout + r.stderr;
    expect(body).not.toContain('Invalid --format value');
  });

  it('--format json (valid) does not reject with format validation', async () => {
    const r = await run(['cluster', '-i', MISSING_INPUT, '--format', 'json']);
    const body = r.stdout + r.stderr;
    expect(body).not.toContain('Invalid --format value');
  });
});

// ---------------------------------------------------------------------------
// Gap 3: --k validation
// ---------------------------------------------------------------------------

describe('wpm lab ml --k validation (Gap 3)', () => {
  it('--k 0 exits with 2 and message mentions --k/positive', async () => {
    const r = await run(['cluster', '-i', MISSING_INPUT, '--k', '0']);
    expect(r.exitCode).toBe(2);
    const body = r.stdout + r.stderr;
    expect(body).toMatch(/--k|positive/i);
  });

  it('--k -1 exits with 2', async () => {
    const r = await run(['cluster', '-i', MISSING_INPUT, '--k', '-1']);
    expect(r.exitCode).toBe(2);
  });

  it('--k abc exits with 2 and names the bad value', async () => {
    const r = await run(['cluster', '-i', MISSING_INPUT, '--k', 'abc']);
    expect(r.exitCode).toBe(2);
    const body = r.stdout + r.stderr;
    expect(body).toContain('abc');
  });

  it('--k validation message mentions k', async () => {
    const r = await run(['cluster', '-i', MISSING_INPUT, '--k', '-1', '--format', 'json']);
    expect(r.exitCode).toBe(2);
    const body = r.stdout + r.stderr;
    expect(body).toMatch(/k/i);
  });

  it('--k 3 (valid) does not reject with k-validation message', async () => {
    const r = await run(['cluster', '-i', MISSING_INPUT, '--k', '3']);
    const body = r.stdout + r.stderr;
    expect(body).not.toContain('Invalid --k value');
  });

  it('--k 1 (minimum valid) does not reject', async () => {
    const r = await run(['cluster', '-i', MISSING_INPUT, '--k', '1']);
    const body = r.stdout + r.stderr;
    expect(body).not.toContain('Invalid --k value');
  });

  it('--k validation also fires for classify task', async () => {
    const r = await run(['classify', '-i', MISSING_INPUT, '--k', '-5']);
    expect(r.exitCode).toBe(2);
    const body = r.stdout + r.stderr;
    expect(body).toContain('Invalid --k value');
  });
});
