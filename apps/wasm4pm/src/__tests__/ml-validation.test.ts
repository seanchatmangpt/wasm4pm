/**
 * ml-validation.test.ts
 *
 * Unit-level tests for the three validation gaps closed in iter16:
 *
 *   Gap 1 — Unknown task exits with config_error (1), not source_error (2).
 *            An invalid task name is a CLI usage mistake, not a bad data file.
 *   Gap 2 — --format must be "human" or "json": any other value → config_error (1)
 *   Gap 3 — --k must be a positive integer: 0, negative, or non-integer → config_error (1)
 *
 * All tests are purely CLI-level (execFile) and do NOT require the WASM binary:
 * the validation rejects before WasmLoader.init() is ever called.
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

function parseJson(r: CliResult): Record<string, unknown> {
  return JSON.parse(r.stdout) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Gap 1: Unknown task → config_error (1), not source_error (2)
// ---------------------------------------------------------------------------

describe('wpm ml unknown task → config_error (Gap 1)', () => {
  it('bogus task exits with 1 (config_error)', async () => {
    const r = await run(['ml', 'bogus', '-i', MISSING_INPUT]);
    expect(r.exitCode).toBe(1);
  });

  it('bogus task with --format json exits with 1 and emits valid JSON', async () => {
    const r = await run(['ml', 'bogus', '-i', MISSING_INPUT, '--format', 'json']);
    expect(r.exitCode).toBe(1);
    expect(() => parseJson(r)).not.toThrow();
    const env = parseJson(r);
    expect(env.status).toBe('error');
  });

  it('bogus task message mentions valid tasks', async () => {
    const r = await run(['ml', 'bogus', '-i', MISSING_INPUT, '--format', 'json']);
    const body = r.stdout + r.stderr;
    // Must tell user what the valid tasks are
    expect(body).toMatch(/classify|cluster|forecast|anomaly|regress|pca/i);
  });

  it('bogus task message names the bad task', async () => {
    const r = await run(['ml', 'bogus', '-i', MISSING_INPUT, '--format', 'json']);
    const body = r.stdout + r.stderr;
    expect(body).toContain('bogus');
  });

  it('"wpm ml TOTALLY_UNKNOWN_TASK" exits 1 (config), not 2 (source)', async () => {
    const r = await run(['ml', 'TOTALLY_UNKNOWN_TASK', '-i', MISSING_INPUT]);
    // Explicitly assert NOT 2 — regression guard against the old behavior
    expect(r.exitCode).not.toBe(2);
    expect(r.exitCode).toBe(1);
  });

  it('valid task names do not exit with config_error 1 from task-validation', async () => {
    // 'cluster' is valid — should fail later (file not found → exit 2 or WASM init → 3)
    const r = await run(['ml', 'cluster', '-i', MISSING_INPUT]);
    expect(r.exitCode).not.toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Gap 2: --format validation
// ---------------------------------------------------------------------------

describe('wpm ml --format validation (Gap 2)', () => {
  it('--format xml exits with config_error (1)', async () => {
    const r = await run(['ml', 'cluster', '-i', MISSING_INPUT, '--format', 'xml']);
    expect(r.exitCode).toBe(1);
  });

  it('--format xml message mentions valid formats', async () => {
    const r = await run(['ml', 'cluster', '-i', MISSING_INPUT, '--format', 'xml']);
    const body = r.stdout + r.stderr;
    expect(body).toMatch(/human|json/i);
  });

  it('--format xml message names the bad value', async () => {
    const r = await run(['ml', 'cluster', '-i', MISSING_INPUT, '--format', 'xml']);
    const body = r.stdout + r.stderr;
    expect(body).toContain('xml');
  });

  it('--format csv exits with config_error (1)', async () => {
    const r = await run(['ml', 'cluster', '-i', MISSING_INPUT, '--format', 'csv']);
    expect(r.exitCode).toBe(1);
  });

  it('--format human (valid) does not reject with format validation', async () => {
    const r = await run(['ml', 'cluster', '-i', MISSING_INPUT, '--format', 'human']);
    // Should fail at file-not-found or WASM init, not format validation
    expect(r.exitCode).not.toBe(1);
  });

  it('--format json (valid) does not reject with format validation', async () => {
    const r = await run(['ml', 'cluster', '-i', MISSING_INPUT, '--format', 'json']);
    expect(r.exitCode).not.toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Gap 3: --k validation
// ---------------------------------------------------------------------------

describe('wpm ml --k validation (Gap 3)', () => {
  it('--k 0 exits with config_error (1)', async () => {
    const r = await run(['ml', 'cluster', '-i', MISSING_INPUT, '--k', '0']);
    expect(r.exitCode).toBe(1);
    const body = r.stdout + r.stderr;
    expect(body).toMatch(/--k|positive/i);
  });

  it('--k -1 exits with config_error (1)', async () => {
    const r = await run(['ml', 'cluster', '-i', MISSING_INPUT, '--k', '-1']);
    expect(r.exitCode).toBe(1);
  });

  it('--k abc exits with config_error (1)', async () => {
    const r = await run(['ml', 'cluster', '-i', MISSING_INPUT, '--k', 'abc']);
    expect(r.exitCode).toBe(1);
  });

  it('--k -1 message names the bad value', async () => {
    const r = await run(['ml', 'cluster', '-i', MISSING_INPUT, '--k', '-1', '--format', 'json']);
    expect(r.exitCode).toBe(1);
    const body = r.stdout + r.stderr;
    expect(body).toMatch(/-1|k/i);
  });

  it('--k 3 (valid) does not reject with k-validation message', async () => {
    const r = await run(['ml', 'cluster', '-i', MISSING_INPUT, '--k', '3']);
    // Should fail at file-not-found or WASM init, not k validation
    expect(r.exitCode).not.toBe(1);
  });

  it('--k 1 (minimum valid) does not reject', async () => {
    const r = await run(['ml', 'cluster', '-i', MISSING_INPUT, '--k', '1']);
    expect(r.exitCode).not.toBe(1);
  });

  it('--k validation also fires for classify task', async () => {
    const r = await run(['ml', 'classify', '-i', MISSING_INPUT, '--k', '-5']);
    expect(r.exitCode).toBe(1);
  });
});
