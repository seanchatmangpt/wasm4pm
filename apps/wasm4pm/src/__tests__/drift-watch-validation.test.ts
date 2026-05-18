/**
 * drift-watch-validation.test.ts
 *
 * Unit-level tests for the four validation gaps closed in iter16:
 *
 *   Gap 1 — --window must be a positive integer: 0 and negative values → config_error (1)
 *   Gap 2 — --threshold must be in [0, 1]: values outside that range → config_error (1)
 *   Gap 3 — --alpha must be in (0, 1]: zero or negative or >1 → config_error (1)
 *   Gap 4 — --interval must be a positive integer: 0 and negative → config_error (1)
 *
 * All tests are purely CLI-level (execFile) and do NOT require the WASM binary:
 * the validation rejects before WasmLoader.init() is ever called.
 *
 * A nonexistent input file path is passed so the command always exits before
 * doing any IO — the validation layer runs first.
 */

import { describe, it, expect } from 'vitest';
import { execFile } from 'child_process';
import * as path from 'path';
import * as os from 'os';

// ---------------------------------------------------------------------------
// Infrastructure
// ---------------------------------------------------------------------------

const CLI_PATH = path.resolve(__dirname, '../../dist/bin/wpm.js');
const MISSING_INPUT = path.join(os.tmpdir(), '__drift_watch_no_such_file__.xes');
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

// ---------------------------------------------------------------------------
// Gap 1: --window validation
// ---------------------------------------------------------------------------

describe('drift-watch --window validation (Gap 1)', () => {
  it('--window 0 exits with config_error (1)', async () => {
    const r = await run(['drift-watch', '-i', MISSING_INPUT, '--window', '0']);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toMatch(/--window|window/i);
    expect(r.stderr).toMatch(/positive/i);
  });

  it('--window -1 exits with config_error (1)', async () => {
    const r = await run(['drift-watch', '-i', MISSING_INPUT, '--window', '-1']);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toMatch(/--window|window/i);
    expect(r.stderr).toMatch(/positive/i);
  });

  it('--window -100 exits with config_error (1)', async () => {
    const r = await run(['drift-watch', '-i', MISSING_INPUT, '--window', '-100']);
    expect(r.exitCode).toBe(1);
  });

  it('--window abc exits with config_error (1)', async () => {
    const r = await run(['drift-watch', '-i', MISSING_INPUT, '--window', 'abc']);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toMatch(/--window|window/i);
  });

  it('--window 5 (valid) does not reject with config_error 1 before file check', async () => {
    // Valid window — should proceed to file check (exits 2 for missing file)
    const r = await run(['drift-watch', '-i', MISSING_INPUT, '--window', '5']);
    // Either source_error (2) or higher — not config_error (1) from window validation
    expect(r.exitCode).not.toBe(1);
    // Or it may fail at WASM init with exit 3; what matters is not a window-rejection
    expect(r.stderr).not.toMatch(/positive integer/i);
  });
});

// ---------------------------------------------------------------------------
// Gap 2: --threshold validation
// ---------------------------------------------------------------------------

describe('drift-watch --threshold validation (Gap 2)', () => {
  it('--threshold 1.5 exits with config_error (1)', async () => {
    const r = await run(['drift-watch', '-i', MISSING_INPUT, '--threshold', '1.5']);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toMatch(/--threshold|threshold/i);
    expect(r.stderr).toMatch(/\[0.*1\]|\[0, 1\]/i);
  });

  it('--threshold -0.1 exits with config_error (1)', async () => {
    const r = await run(['drift-watch', '-i', MISSING_INPUT, '--threshold', '-0.1']);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toMatch(/--threshold|threshold/i);
  });

  it('--threshold 2 exits with config_error (1)', async () => {
    const r = await run(['drift-watch', '-i', MISSING_INPUT, '--threshold', '2']);
    expect(r.exitCode).toBe(1);
  });

  it('--threshold xyz exits with config_error (1)', async () => {
    const r = await run(['drift-watch', '-i', MISSING_INPUT, '--threshold', 'xyz']);
    expect(r.exitCode).toBe(1);
  });

  it('--threshold 0 (valid boundary) does not reject with window validation message', async () => {
    const r = await run(['drift-watch', '-i', MISSING_INPUT, '--threshold', '0']);
    // threshold=0 is the lower boundary; should pass validation, fail on missing file (2)
    expect(r.exitCode).not.toBe(1);
    expect(r.stderr).not.toMatch(/threshold.*\[0.*1\]/i);
  });

  it('--threshold 1 (valid boundary) does not reject', async () => {
    const r = await run(['drift-watch', '-i', MISSING_INPUT, '--threshold', '1']);
    expect(r.exitCode).not.toBe(1);
    expect(r.stderr).not.toMatch(/threshold.*\[0.*1\]/i);
  });

  it('--threshold 0.5 (mid-range) does not reject', async () => {
    const r = await run(['drift-watch', '-i', MISSING_INPUT, '--threshold', '0.5']);
    expect(r.exitCode).not.toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Gap 3: --alpha validation
// ---------------------------------------------------------------------------

describe('drift-watch --alpha validation (Gap 3)', () => {
  it('--alpha 0 exits with config_error (1) — zero is outside (0,1]', async () => {
    const r = await run(['drift-watch', '-i', MISSING_INPUT, '--alpha', '0']);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toMatch(/--alpha|alpha/i);
    expect(r.stderr).toMatch(/\(0.*1\]|\(0, 1\]/i);
  });

  it('--alpha -0.1 exits with config_error (1)', async () => {
    const r = await run(['drift-watch', '-i', MISSING_INPUT, '--alpha', '-0.1']);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toMatch(/--alpha|alpha/i);
  });

  it('--alpha 1.5 exits with config_error (1)', async () => {
    const r = await run(['drift-watch', '-i', MISSING_INPUT, '--alpha', '1.5']);
    expect(r.exitCode).toBe(1);
  });

  it('--alpha 1 (valid upper boundary) does not reject', async () => {
    const r = await run(['drift-watch', '-i', MISSING_INPUT, '--alpha', '1']);
    expect(r.exitCode).not.toBe(1);
    expect(r.stderr).not.toMatch(/\(0.*1\]/i);
  });

  it('--alpha 0.3 (default value) does not reject', async () => {
    const r = await run(['drift-watch', '-i', MISSING_INPUT, '--alpha', '0.3']);
    expect(r.exitCode).not.toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Gap 4: --interval validation
// ---------------------------------------------------------------------------

describe('drift-watch --interval validation (Gap 4)', () => {
  it('--interval 0 exits with config_error (1)', async () => {
    const r = await run(['drift-watch', '-i', MISSING_INPUT, '--interval', '0']);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toMatch(/--interval|interval/i);
    expect(r.stderr).toMatch(/positive/i);
  });

  it('--interval -1000 exits with config_error (1)', async () => {
    const r = await run(['drift-watch', '-i', MISSING_INPUT, '--interval', '-1000']);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toMatch(/--interval|interval/i);
  });

  it('--interval notanumber exits with config_error (1)', async () => {
    const r = await run(['drift-watch', '-i', MISSING_INPUT, '--interval', 'notanumber']);
    expect(r.exitCode).toBe(1);
  });

  it('--interval 1000 (valid) does not reject with interval validation', async () => {
    const r = await run(['drift-watch', '-i', MISSING_INPUT, '--interval', '1000']);
    expect(r.exitCode).not.toBe(1);
    expect(r.stderr).not.toMatch(/positive integer/i);
  });
});
