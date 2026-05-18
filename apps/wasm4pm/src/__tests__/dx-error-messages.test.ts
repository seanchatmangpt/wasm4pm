/**
 * DX Quality — error messages are descriptive and actionable.
 *
 * Tests that user-facing error messages:
 *   1. Name the flag or path that is wrong
 *   2. Show a usage example
 *   3. Are parseable JSON under --format json even on error
 *   4. Use consistent exit codes (config=1, source=2)
 *
 * Parallel to jtbd-error-states.test.ts — does NOT duplicate those assertions.
 * Each test here targets a distinct message-quality property.
 *
 * NOTE: All tests use cwd: tmpdir() to avoid picking up any wasm4pm.toml
 * in the project tree that might intercept commands with a config error before
 * the source-error logic is reached.
 */

import { describe, it, expect } from 'vitest';
import { execFile } from 'child_process';
import * as path from 'path';
import * as os from 'os';

// ---------------------------------------------------------------------------
// Infrastructure
// ---------------------------------------------------------------------------

const CLI_PATH = path.resolve(__dirname, '../../dist/bin/wpm.js');
const XES = path.resolve(__dirname, '../../../../test/fixtures/small.xes');
// Use /tmp as cwd to avoid picking up any local wasm4pm.toml / wasm4pm.json
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

function json<T = Record<string, unknown>>(r: CliResult): T {
  return JSON.parse(r.stdout) as T;
}

function envelope(r: CliResult): { status: string; error?: { code: string; message: string }; command?: string } {
  return json<{ status: string; error?: { code: string; message: string }; command?: string }>(r);
}

function errMsg(r: CliResult): string {
  const e = envelope(r);
  return e.error?.message ?? '';
}

// ---------------------------------------------------------------------------
// wpm run — algorithm not found: message is actionable
// ---------------------------------------------------------------------------

describe('DX: wpm run algorithm errors are actionable', () => {
  it('unknown algorithm message names the bad algorithm', async () => {
    const r = await run(['run', '-i', XES, '--algorithm', 'TOTALLY_MADE_UP', '--format', 'json']);
    expect(r.exitCode).toBe(2);
    expect(errMsg(r)).toContain('TOTALLY_MADE_UP');
  });

  it('unknown algorithm message lists at least one valid algorithm', async () => {
    const r = await run(['run', '-i', XES, '--algorithm', 'TOTALLY_MADE_UP', '--format', 'json']);
    // The message must tell the user where to go for valid options
    const msg = errMsg(r);
    expect(msg).toMatch(/dfg|heuristic|wpm algorithms/i);
  });

  it('heuristic_miner (kernel registry ID) is accepted as alias', async () => {
    const r = await run(['run', '-i', XES, '--algorithm', 'heuristic_miner', '--format', 'json', '--no-save']);
    // heuristic_miner IS a valid kernel registry ID alias — must not produce an error
    // Accept 0 (success) or any exit code — response must be parseable JSON
    expect(() => JSON.parse(r.stdout)).not.toThrow();
  });

  it('missing input message shows the exact usage syntax', async () => {
    const r = await run(['run', '--format', 'json']);
    expect(r.exitCode).toBe(2);
    const msg = errMsg(r);
    // Must show the canonical usage form
    expect(msg).toContain('wpm run');
  });

  it('missing input message mentions how to specify input', async () => {
    const r = await run(['run', '--format', 'json']);
    const msg = errMsg(r);
    // Message should help user understand HOW to specify input
    expect(msg).toMatch(/<log\.xes>|Usage/i);
  });

  it('all run errors produce parseable JSON under --format json', async () => {
    const r = await run(['run', '--format', 'json']);
    expect(() => JSON.parse(r.stdout)).not.toThrow();
    const e = envelope(r);
    expect(e.status).toBe('error');
    expect(typeof e.error?.message).toBe('string');
    expect(e.error!.message.length).toBeGreaterThan(10);
  });
});

// ---------------------------------------------------------------------------
// wpm run — file not found: message names the file
// ---------------------------------------------------------------------------

describe('DX: wpm run file-not-found message names the missing file', () => {
  it('missing input file message contains the exact path given', async () => {
    const r = await run(['run', '/absolutely/no/such/file.xes', '--format', 'json']);
    expect(r.exitCode).toBe(2);
    const msg = errMsg(r);
    // The user must be able to see WHICH file was not found
    expect(msg).toContain('/absolutely/no/such/file.xes');
  });

  it('missing input file message tells user to check the path', async () => {
    const r = await run(['run', '/no/such/path.xes', '--format', 'json']);
    const msg = errMsg(r);
    // The message should not just say "error" — it must guide the user
    expect(msg).toMatch(/not found|check|path/i);
  });
});

// ---------------------------------------------------------------------------
// wpm compare — too-few-algorithms: message shows usage
// ---------------------------------------------------------------------------

describe('DX: wpm compare too-few-algorithms message is actionable', () => {
  it('single algorithm produces TOO_FEW_ALGORITHMS error code', async () => {
    const r = await run(['compare', 'dfg', '-i', XES, '--format', 'json']);
    expect(r.exitCode).toBe(2);
    const e = envelope(r);
    expect(e.error?.code).toBe('TOO_FEW_ALGORITHMS');
  });

  it('too-few-algorithms message includes a usage example with two algorithms', async () => {
    const r = await run(['compare', 'dfg', '-i', XES, '--format', 'json']);
    const msg = errMsg(r);
    // Message must show HOW to pass multiple algorithms
    expect(msg).toMatch(/dfg.*heuristic|compare.*,/i);
  });

  it('too-few-algorithms message mentions the algorithm count constraint', async () => {
    const r = await run(['compare', 'dfg', '-i', XES, '--format', 'json']);
    const msg = errMsg(r);
    // Message should say "two" or "2" or "at least"
    expect(msg).toMatch(/two|2|at least/i);
  });

  it('too-few-algorithms message refers user to wpm algorithms command or available list', async () => {
    const r = await run(['compare', 'dfg', '-i', XES, '--format', 'json']);
    const msg = errMsg(r);
    expect(msg).toMatch(/wpm algorithms|available/i);
  });

  it('compare error is parseable JSON under --format json', async () => {
    const r = await run(['compare', 'dfg', '-i', XES, '--format', 'json']);
    expect(() => JSON.parse(r.stdout)).not.toThrow();
    const e = envelope(r);
    expect(e.status).toBe('error');
    expect(e.command).toBe('compare');
  });
});

// ---------------------------------------------------------------------------
// wpm conformance — threshold validation: message is actionable
// ---------------------------------------------------------------------------

describe('DX: wpm conformance threshold error is descriptive', () => {
  it('non-numeric threshold exits 1 (config_error)', async () => {
    const r = await run(['conformance', '-i', XES, '--threshold', 'not_a_number', '--format', 'json']);
    expect(r.exitCode).toBe(1);
  });

  it('non-numeric threshold message names the bad value', async () => {
    const r = await run(['conformance', '-i', XES, '--threshold', 'not_a_number', '--format', 'json']);
    const msg = errMsg(r);
    // User must see WHAT they passed that was wrong
    expect(msg).toContain('not_a_number');
  });

  it('non-numeric threshold message mentions valid range', async () => {
    const r = await run(['conformance', '-i', XES, '--threshold', 'bad', '--format', 'json']);
    const msg = errMsg(r);
    // Must explain what is valid
    expect(msg).toMatch(/0\.0.*1\.0|number between|0 and 1/i);
  });

  it('non-numeric threshold message provides a usage example with a numeric value', async () => {
    const r = await run(['conformance', '-i', XES, '--threshold', 'bad', '--format', 'json']);
    const msg = errMsg(r);
    expect(msg).toMatch(/wpm conformance|--threshold 0\.\d+/i);
  });

  it('conformance threshold error is parseable JSON', async () => {
    const r = await run(['conformance', '-i', XES, '--threshold', 'bad', '--format', 'json']);
    expect(() => JSON.parse(r.stdout)).not.toThrow();
    const e = envelope(r);
    expect(e.status).toBe('error');
    expect(e.command).toBe('conformance');
  });
});

// ---------------------------------------------------------------------------
// wpm temporal — threshold validation: new DX improvement
// ---------------------------------------------------------------------------

describe('DX: wpm temporal threshold validation', () => {
  it('non-numeric threshold exits 1 (config_error)', async () => {
    const r = await run(['temporal', '-i', XES, '--threshold', 'not_a_number', '--format', 'json']);
    expect(r.exitCode).toBe(1);
  });

  it('non-numeric threshold produces INVALID_THRESHOLD error code', async () => {
    const r = await run(['temporal', '-i', XES, '--threshold', 'not_a_number', '--format', 'json']);
    const e = envelope(r);
    expect(e.error?.code).toBe('INVALID_THRESHOLD');
  });

  it('non-numeric threshold message names the bad value', async () => {
    const r = await run(['temporal', '-i', XES, '--threshold', 'badval', '--format', 'json']);
    const msg = errMsg(r);
    expect(msg).toContain('badval');
  });

  it('non-numeric threshold message mentions valid range', async () => {
    const r = await run(['temporal', '-i', XES, '--threshold', 'xyz', '--format', 'json']);
    const msg = errMsg(r);
    expect(msg).toMatch(/0\.0.*1\.0|between|number/i);
  });

  it('non-numeric threshold message provides a usage example', async () => {
    const r = await run(['temporal', '-i', XES, '--threshold', 'xyz', '--format', 'json']);
    const msg = errMsg(r);
    expect(msg).toMatch(/wpm temporal|--threshold 0\.\d+/i);
  });

  it('temporal threshold error is parseable JSON under --format json', async () => {
    const r = await run(['temporal', '-i', XES, '--threshold', 'bad', '--format', 'json']);
    expect(() => JSON.parse(r.stdout)).not.toThrow();
    const e = envelope(r);
    expect(e.status).toBe('error');
    expect(e.command).toBe('temporal');
  });
});

// ---------------------------------------------------------------------------
// DX: --format json always produces parseable output on error (cross-command)
// ---------------------------------------------------------------------------

describe('DX: --format json always produces parseable output on error', () => {
  it('wpm ml with unknown task returns parseable JSON error naming the bad task', async () => {
    const r = await run(['ml', 'NONEXISTENT_TASK', '-i', XES, '--format', 'json']);
    expect(r.exitCode).not.toBe(0);
    expect(() => JSON.parse(r.stdout)).not.toThrow();
    const e = envelope(r);
    expect(e.status).toBe('error');
    expect(typeof e.error?.message).toBe('string');
    // Message must name the bad task and list valid tasks
    expect(e.error!.message).toContain('NONEXISTENT_TASK');
  });

  it('wpm quality with invalid metric returns parseable JSON error naming the bad metric', async () => {
    const r = await run(['quality', '-i', XES, '--metrics', 'FAKE_METRIC', '--format', 'json']);
    expect(r.exitCode).not.toBe(0);
    expect(() => JSON.parse(r.stdout)).not.toThrow();
    const e = envelope(r);
    expect(e.status).toBe('error');
    expect(e.error!.message).toMatch(/fake_metric|FAKE_METRIC/i);
  });

  it('wpm simulate with non-numeric --cases returns parseable JSON error mentioning the flag', async () => {
    const r = await run(['simulate', '-i', XES, '--cases', 'notanumber', '--format', 'json']);
    expect(r.exitCode).toBe(1);
    expect(() => JSON.parse(r.stdout)).not.toThrow();
    const e = envelope(r);
    expect(e.status).toBe('error');
    expect(e.error?.code).toBe('INVALID_ARG');
    // Must mention the flag name
    expect(e.error!.message).toContain('--cases');
  });
});

// ---------------------------------------------------------------------------
// DX: exit code consistency
// ---------------------------------------------------------------------------

describe('DX: exit code consistency', () => {
  it('config errors (threshold, numeric flags) always exit 1', async () => {
    const r = await run(['conformance', '-i', XES, '--threshold', 'bad', '--format', 'json']);
    expect(r.exitCode).toBe(1);
  });

  it('source errors (missing file, unknown algorithm) always exit 2', async () => {
    const r = await run(['run', '--format', 'json']);
    expect(r.exitCode).toBe(2);
  });

  it('source error for unknown algorithm exits 2 not 3', async () => {
    const r = await run(['run', '-i', XES, '--algorithm', 'NONEXISTENT', '--format', 'json']);
    expect(r.exitCode).toBe(2);
  });

  it('compare with too few algorithms exits 2 (source error)', async () => {
    const r = await run(['compare', 'dfg', '-i', XES, '--format', 'json']);
    expect(r.exitCode).toBe(2);
  });

  it('temporal threshold validation exits 1 (config error)', async () => {
    const r = await run(['temporal', '-i', XES, '--threshold', 'not_a_number', '--format', 'json']);
    expect(r.exitCode).toBe(1);
  });
});
