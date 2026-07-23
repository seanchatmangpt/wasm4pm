/**
 * DX Quality — error messages are descriptive and actionable.
 *
 * Tests that user-facing error messages:
 *   1. Name the flag or path that is wrong
 *   2. Show a usage example
 *   3. Are parseable JSON always (the new framework's stdout contract — see
 *      packages/noun-verb/src/output.ts)
 *   4. Use consistent exit codes
 *
 * MIGRATION NOTE (noun-verb rebuild): every invocation below maps an old
 * top-level command to its `nouns/_removed.ts` replacement. Two structural
 * contract changes affect nearly every assertion in this file:
 *
 *  1. Error envelope: a failure is ALWAYS `{ error: { code, message,
 *     action_template? } }` on stdout — never the old flat
 *     `{ command, status, payload, meta }` wrapper, and there is no
 *     `.command` field anymore.
 *  2. Bridged verbs (model compare/predict/simulate, lab ml/temporal) route
 *     through `invokeLegacyCommandAsJson` (`nouns/_bridge.ts`), which
 *     normalizes every legacy failure to one of 9 generic `ErrorCode`
 *     values via `classifyLegacyFailure()` — old app-specific codes
 *     (TOO_FEW_ALGORITHMS, INVALID_TASK, INVALID_THRESHOLD, ...) are gone,
 *     replaced by `INVALID_INPUT`/`EXECUTION_ERROR`/etc. Both legacy
 *     config_error(1) and source_error(2) collapse to `INVALID_INPUT`,
 *     which wpm's `ERROR_CODE_MAP` (`apps/wasm4pm/src/cli.ts`) maps to
 *     `EXIT_CODES.source_error` = 2 — so exit code 1 no longer occurs
 *     through the bridge at all. The message TEXT itself is preserved
 *     unchanged (still names the bad value, still shows usage), since the
 *     bridge just forwards the legacy command's own message string.
 *  3. `model discover`'s own (non-bridged) `readInput()` error for a
 *     missing/empty input path is a plainer message than the old `wpm run`
 *     ("Input file not found or unreadable: <path>") — it no longer echoes
 *     a "Usage: wpm run ..." line. This is a real, if minor, DX regression
 *     from the migration, noted inline rather than silently absorbed.
 *  4. `model check`'s old-conformance-equivalent (`--mode replay`) flag is
 *     named `--fitness-threshold`, not `--threshold`; it DOES validate
 *     range/format up front (fixed after this file was first written —
 *     see `nouns/model/check.ts`'s own comment citing this exact gap).
 */

import { describe, it, expect } from 'vitest';
import { execFile } from 'child_process';
import * as path from 'path';
import * as os from 'os';

const CLI_PATH = path.resolve(__dirname, '../../dist/bin/wpm.js');
const XES = path.resolve(__dirname, '../../../../test/fixtures/small.xes');
const CLEAN_CWD = os.tmpdir();

interface CliResult { exitCode: number; stdout: string; stderr: string; }

function run(args: string[], timeoutMs = 20000): Promise<CliResult> {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [CLI_PATH, ...args],
      { cwd: CLEAN_CWD, timeout: timeoutMs, maxBuffer: 5 * 1024 * 1024 },
      (error, stdout, stderr) => {
        const code = error && 'code' in error && typeof error.code === 'number'
          ? error.code
          : error ? 1 : 0;
        resolve({ exitCode: code, stdout: stdout ?? '', stderr: stderr ?? '' });
      }
    );
  });
}

interface ErrorEnvelope { error?: { code: string; message: string } }

function json<T = Record<string, unknown>>(r: CliResult): T {
  return JSON.parse(r.stdout) as T;
}

function errMsg(r: CliResult): string {
  const e = json<ErrorEnvelope>(r);
  return e.error?.message ?? '';
}

// ---------------------------------------------------------------------------
// model discover (was: wpm run) — algorithm not found: message is actionable
// ---------------------------------------------------------------------------

describe('DX: model discover algorithm errors are actionable (was: wpm run)', () => {
  it('unknown algorithm message names the bad algorithm', async () => {
    const r = await run(['model', 'discover', XES, '--algorithm', 'TOTALLY_MADE_UP']);
    expect(r.exitCode).toBe(2);
    expect(errMsg(r)).toContain('TOTALLY_MADE_UP');
  });

  it('unknown algorithm message points to the algorithm list', async () => {
    const r = await run(['model', 'discover', XES, '--algorithm', 'TOTALLY_MADE_UP']);
    const msg = errMsg(r);
    expect(msg).toMatch(/wpm help algorithms/i);
  });

  it('heuristic_miner (kernel registry ID) is accepted as alias', async () => {
    const r = await run(['model', 'discover', XES, '--algorithm', 'heuristic_miner']);
    // heuristic_miner IS a valid kernel registry ID alias — must not produce an error
    expect(() => JSON.parse(r.stdout)).not.toThrow();
    expect(r.exitCode).toBe(0);
  });

  it('missing input produces a parseable JSON error (no more "Usage:" line — see file header note)', async () => {
    const r = await run(['model', 'discover']);
    expect(r.exitCode).toBe(2);
    const msg = errMsg(r);
    expect(msg).toMatch(/Input file not found or unreadable/i);
  });

  it('all discover errors produce parseable JSON on stdout', async () => {
    const r = await run(['model', 'discover']);
    expect(() => JSON.parse(r.stdout)).not.toThrow();
    const e = json<ErrorEnvelope>(r);
    expect(typeof e.error?.message).toBe('string');
    expect(e.error!.message.length).toBeGreaterThan(10);
    expect(e.error?.code).toBe('INVALID_INPUT');
  });
});

// ---------------------------------------------------------------------------
// model discover — file not found: message names the file
// ---------------------------------------------------------------------------

describe('DX: model discover file-not-found message names the missing file', () => {
  it('missing input file message contains the exact path given', async () => {
    const r = await run(['model', 'discover', '/absolutely/no/such/file.xes']);
    expect(r.exitCode).toBe(2);
    const msg = errMsg(r);
    expect(msg).toContain('/absolutely/no/such/file.xes');
  });

  it('missing input file message names it as not found/unreadable', async () => {
    const r = await run(['model', 'discover', '/no/such/path.xes']);
    const msg = errMsg(r);
    expect(msg).toMatch(/not found|unreadable/i);
  });
});

// ---------------------------------------------------------------------------
// model compare (was: wpm compare) — too-few-algorithms: message shows usage
// ---------------------------------------------------------------------------

describe('DX: model compare too-few-algorithms message is actionable (was: wpm compare)', () => {
  it('single algorithm produces INVALID_INPUT (was app-specific TOO_FEW_ALGORITHMS, collapsed by the bridge)', async () => {
    const r = await run(['model', 'compare', 'dfg', '-i', XES]);
    expect(r.exitCode).toBe(2);
    const e = json<ErrorEnvelope>(r);
    expect(e.error?.code).toBe('INVALID_INPUT');
  });

  it('too-few-algorithms message includes a usage example with two algorithms', async () => {
    const r = await run(['model', 'compare', 'dfg', '-i', XES]);
    const msg = errMsg(r);
    expect(msg).toMatch(/dfg.*heuristic|compare.*,/i);
  });

  it('too-few-algorithms message mentions the algorithm count constraint', async () => {
    const r = await run(['model', 'compare', 'dfg', '-i', XES]);
    const msg = errMsg(r);
    expect(msg).toMatch(/two|2|at least/i);
  });

  it('too-few-algorithms message refers user to the algorithms list', async () => {
    const r = await run(['model', 'compare', 'dfg', '-i', XES]);
    const msg = errMsg(r);
    expect(msg).toMatch(/wpm algorithms|available/i);
  });

  it('compare error is parseable JSON with the new error envelope (no more .command field)', async () => {
    const r = await run(['model', 'compare', 'dfg', '-i', XES]);
    expect(() => JSON.parse(r.stdout)).not.toThrow();
    const e = json<ErrorEnvelope>(r);
    expect(e.error).toBeDefined();
    expect(typeof e.error?.message).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// model check --mode replay (was: wpm conformance) — threshold validation
// ---------------------------------------------------------------------------

describe('DX: model check --mode replay flag/argument validation (was: wpm conformance threshold validation)', () => {
  // MIGRATION NOTE: the old `--threshold` flag from `wpm conformance` is
  // named `--fitness-threshold` on `model check` (`nouns/model/check.ts`).
  // `--model` is mandatory for replay/prefix/oracle (checked lazily, inside
  // the mode's own branch) in a way the old `conformance` command did not
  // require. `--fitness-threshold` itself is deliberately NOT format/range
  // validated — per `check.ts`'s own comment, a non-numeric value makes
  // every `fitness >= NaN` comparison false, so the log is deterministically
  // REJECTED (citing "threshold NaN" in the finding) rather than erroring
  // at parse time. This is an intentional simplification from the old
  // `wpm conformance --threshold`, which did validate the range up front.
  it('missing --model is INVALID_INPUT (an unrecognized --threshold flag is simply ignored, not validated)', async () => {
    const r = await run(['model', 'check', XES, '--mode', 'replay', '--threshold', 'not_a_number']);
    expect(r.exitCode).toBe(2);
    const e = json<ErrorEnvelope>(r);
    expect(e.error?.code).toBe('INVALID_INPUT');
    expect(e.error?.message).toMatch(/--model is required/);
  });

  it('a non-numeric --fitness-threshold is NOT rejected as invalid input — it deterministically REJECTs the verdict instead', async () => {
    const modelPath = path.resolve(__dirname, '../../../../fixtures/models/living_diagnostic_clear_v1.pnml');
    const r = await run(['model', 'check', XES, '--mode', 'replay', '--model', modelPath, '--fitness-threshold', 'bad']);
    expect(() => JSON.parse(r.stdout)).not.toThrow();
    const parsed = json<{ status?: string; findings?: Array<{ reason?: string }> }>(r);
    expect(parsed.status).toBe('REJECTED');
    expect(r.exitCode).toBe(6);
    expect(parsed.findings?.[0]?.reason).toMatch(/threshold NaN/);
  });
});

// ---------------------------------------------------------------------------
// lab temporal (was: wpm temporal) — threshold validation
// ---------------------------------------------------------------------------

describe('DX: lab temporal threshold validation (was: wpm temporal)', () => {
  it('non-numeric threshold exits 2 (INVALID_INPUT, via bridge collapse — was config_error=1)', async () => {
    const r = await run(['lab', 'temporal', XES, '--threshold', 'not_a_number']);
    expect(r.exitCode).toBe(2);
  });

  it('non-numeric threshold produces the generic INVALID_INPUT code (was app-specific INVALID_THRESHOLD)', async () => {
    const r = await run(['lab', 'temporal', XES, '--threshold', 'not_a_number']);
    const e = json<ErrorEnvelope>(r);
    expect(e.error?.code).toBe('INVALID_INPUT');
  });

  it('threshold message mentions valid range (message text unchanged by the bridge)', async () => {
    const r = await run(['lab', 'temporal', XES, '--threshold', 'xyz']);
    const msg = errMsg(r);
    expect(msg).toMatch(/0\.0.*1\.0|between|number/i);
  });

  it('threshold message does NOT echo the bad value back (legacy message is static text — pre-existing, not a migration change)', async () => {
    const r = await run(['lab', 'temporal', XES, '--threshold', 'badval']);
    const msg = errMsg(r);
    expect(msg).toBe('Invalid --threshold: must be a number between 0.0 and 1.0.');
  });

  it('temporal threshold error is parseable JSON with the new error envelope', async () => {
    const r = await run(['lab', 'temporal', XES, '--threshold', 'bad']);
    expect(() => JSON.parse(r.stdout)).not.toThrow();
    const e = json<ErrorEnvelope>(r);
    expect(e.error).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// DX: stdout is always parseable JSON on error (cross-command)
// ---------------------------------------------------------------------------

describe('DX: stdout is always parseable JSON on error (cross-command)', () => {
  it('lab ml with unknown task returns parseable JSON error naming the bad task (was: wpm ml)', async () => {
    const r = await run(['lab', 'ml', 'NONEXISTENT_TASK', '-i', XES]);
    expect(r.exitCode).not.toBe(0);
    expect(() => JSON.parse(r.stdout)).not.toThrow();
    const e = json<ErrorEnvelope>(r);
    expect(typeof e.error?.message).toBe('string');
    expect(e.error!.message).toContain('NONEXISTENT_TASK');
  });

  it('log stats has no --metrics validation to test — quality\'s metric-fitness computation was not migrated (documented gap)', async () => {
    // MIGRATION NOTE: `nouns/_removed.ts` maps `quality` -> `log stats`, but
    // `log stats` (`nouns/log/stats.ts`) is a NEW, deliberately minimal
    // implementation ("was: wpm quality, in part") that only reports
    // event/case/activity counts from `analyze_event_statistics` — it has
    // no `--metrics` flag and no fitness/precision/generalization/
    // simplicity computation at all. There is nothing left to validate an
    // "invalid metric" against, so this test now only asserts that
    // `log stats` runs cleanly on a valid log.
    const r = await run(['log', 'stats', XES]);
    expect(r.exitCode).toBe(0);
    const parsed = json<{ stats?: Record<string, unknown> }>(r);
    expect(parsed.stats).toBeDefined();
  });

  it('model simulate with non-numeric --cases returns parseable JSON error mentioning the flag (was: wpm simulate)', async () => {
    const r = await run(['model', 'simulate', XES, '--cases', 'notanumber']);
    expect(r.exitCode).toBe(2);
    expect(() => JSON.parse(r.stdout)).not.toThrow();
    const e = json<ErrorEnvelope>(r);
    expect(e.error?.code).toBe('INVALID_INPUT');
    expect(e.error!.message).toContain('--cases');
  });
});

// ---------------------------------------------------------------------------
// DX: lab ml invalid task error — did-you-mean + usage
// ---------------------------------------------------------------------------

describe('DX: lab ml invalid task message is actionable (was: wpm ml)', () => {
  it('ml invalid task message names the bad task', async () => {
    const r = await run(['lab', 'ml', 'BADTASK', '-i', XES]);
    expect(r.exitCode).toBe(2);
    expect(errMsg(r)).toContain('BADTASK');
  });

  it('ml invalid task message lists all valid tasks', async () => {
    const r = await run(['lab', 'ml', 'BADTASK', '-i', XES]);
    const msg = errMsg(r);
    expect(msg).toMatch(/classify|cluster|forecast|anomaly|regress|pca/i);
  });

  it('ml invalid task message includes a usage example', async () => {
    const r = await run(['lab', 'ml', 'BADTASK', '-i', XES]);
    const msg = errMsg(r);
    expect(msg).toMatch(/wpm ml|Usage/i);
  });

  it('ml typo "clustr" offers did-you-mean "cluster"', async () => {
    const r = await run(['lab', 'ml', 'clustr', '-i', XES]);
    const msg = errMsg(r);
    expect(msg).toMatch(/cluster|Did you mean/i);
  });

  it('ml invalid task error code is the generic INVALID_INPUT (was app-specific INVALID_TASK); no .command field anymore', async () => {
    const r = await run(['lab', 'ml', 'BADTASK', '-i', XES]);
    expect(() => JSON.parse(r.stdout)).not.toThrow();
    const e = json<ErrorEnvelope>(r);
    expect(e.error?.code).toBe('INVALID_INPUT');
  });
});

// ---------------------------------------------------------------------------
// DX: model predict invalid task error — did-you-mean + usage
// ---------------------------------------------------------------------------

describe('DX: model predict invalid task message is actionable (was: wpm predict)', () => {
  it('predict invalid task message names the bad task', async () => {
    const r = await run(['model', 'predict', 'BADTASK', '-i', XES]);
    expect(r.exitCode).toBe(2);
    expect(errMsg(r)).toContain('BADTASK');
  });

  it('predict invalid task message lists all valid tasks', async () => {
    const r = await run(['model', 'predict', 'BADTASK', '-i', XES]);
    const msg = errMsg(r);
    expect(msg).toMatch(/next-activity|remaining-time|outcome|drift|features|resource/i);
  });

  it('predict invalid task message includes a usage example', async () => {
    const r = await run(['model', 'predict', 'BADTASK', '-i', XES]);
    const msg = errMsg(r);
    expect(msg).toMatch(/wpm predict|Usage/i);
  });

  it('predict typo "drfit" offers did-you-mean "drift"', async () => {
    const r = await run(['model', 'predict', 'drfit', '-i', XES]);
    const msg = errMsg(r);
    expect(msg).toMatch(/drift|Did you mean/i);
  });

  it('predict invalid task error code is the generic INVALID_INPUT (was app-specific INVALID_TASK)', async () => {
    const r = await run(['model', 'predict', 'BADTASK', '-i', XES]);
    expect(() => JSON.parse(r.stdout)).not.toThrow();
    const e = json<ErrorEnvelope>(r);
    expect(e.error?.code).toBe('INVALID_INPUT');
  });
});

// ---------------------------------------------------------------------------
// DX: model simulate improved --cases error — names bad value + usage example
// ---------------------------------------------------------------------------

describe('DX: model simulate --cases bad value message names the bad value (was: wpm simulate)', () => {
  it('simulate --cases with letters names the exact bad value', async () => {
    const r = await run(['model', 'simulate', XES, '--cases', 'notanumber']);
    expect(r.exitCode).toBe(2);
    const msg = errMsg(r);
    expect(msg).toContain('notanumber');
  });

  it('simulate --cases with letters provides a corrective example', async () => {
    const r = await run(['model', 'simulate', XES, '--cases', 'notanumber']);
    const msg = errMsg(r);
    expect(msg).toMatch(/wpm simulate|--cases 500|integer/i);
  });

  it('simulate --time with letters names the exact bad value', async () => {
    const r = await run(['model', 'simulate', XES, '--time', 'forever']);
    expect(r.exitCode).toBe(2);
    const msg = errMsg(r);
    expect(msg).toContain('forever');
  });

  it('simulate --time error provides a usage example with milliseconds', async () => {
    const r = await run(['model', 'simulate', XES, '--time', 'forever']);
    const msg = errMsg(r);
    expect(msg).toMatch(/milliseconds|--time 120000|integer/i);
  });

  it('simulate bad numeric flags produce parseable JSON errors with the new error envelope', async () => {
    const r = await run(['model', 'simulate', XES, '--cases', 'abc']);
    expect(() => JSON.parse(r.stdout)).not.toThrow();
    const e = json<ErrorEnvelope>(r);
    expect(e.error?.code).toBe('INVALID_INPUT');
  });
});

// ---------------------------------------------------------------------------
// DX: exit code consistency
// ---------------------------------------------------------------------------

describe('DX: exit code consistency (post-migration: bridged verbs always exit 2 on INVALID_INPUT, never 1)', () => {
  it('bridged config-style errors (temporal threshold) now exit 2, not 1', async () => {
    const r = await run(['lab', 'temporal', XES, '--threshold', 'bad']);
    expect(r.exitCode).toBe(2);
  });

  it('missing input on model discover exits 2', async () => {
    const r = await run(['model', 'discover']);
    expect(r.exitCode).toBe(2);
  });

  it('unknown algorithm on model discover exits 2, not 3', async () => {
    const r = await run(['model', 'discover', XES, '--algorithm', 'NONEXISTENT']);
    expect(r.exitCode).toBe(2);
  });

  it('compare with too few algorithms exits 2', async () => {
    const r = await run(['model', 'compare', 'dfg', '-i', XES]);
    expect(r.exitCode).toBe(2);
  });

  it('temporal threshold validation exits 2 (source_error, via bridge collapse — was config_error=1)', async () => {
    const r = await run(['lab', 'temporal', XES, '--threshold', 'not_a_number']);
    expect(r.exitCode).toBe(2);
  });
});
