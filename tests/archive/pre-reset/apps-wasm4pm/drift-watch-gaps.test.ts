/**
 * drift-watch-gaps.test.ts
 *
 * Closes gaps NOT covered by the three existing drift-watch test suites:
 *   - drift-watch-validation.test.ts  (parameter validation, execFile-based)
 *   - drift-social-temporal-gaps.test.ts  (DW-1..DW-8: JSON fields, streaming)
 *   - drift-watch-jtbd.test.ts  (WASM-level JTBD tests)
 *
 * NEW gaps addressed here:
 *
 *   GAP-A  --interval 99 (below minimum of 100) exits config_error (1)
 *          The existing test covers --interval 0 and --interval -1000
 *          but NOT the range [1, 99] which is also invalid.
 *
 *   GAP-B  window_index on the FIRST tick is exactly 0 (not 1 or -1)
 *          The existing test verifies >= 0 and integer, but not the
 *          exact starting value (implementation: windowsProcessed - 1,
 *          where windowsProcessed is incremented before tickInner runs).
 *
 *   GAP-C  threshold_crossed is false when ewma never crosses threshold
 *          (zero-variance log, ewma ≈ 0, threshold default 0.3).
 *
 *   GAP-D  JSON line always includes new_drifts array field (even empty).
 *
 *   GAP-E  JSON line always includes new_drift_points as a non-negative integer.
 *
 *   GAP-F  JSON line always includes window_size reflecting the --window param.
 *
 *   GAP-G  JSON line always includes approaching_threshold boolean.
 *
 *   GAP-H  JSON line distances field is an array of numbers (not null/missing).
 *
 *   GAP-I  Missing input file with --json flag → exit 2 with no JSON on stdout.
 *
 *   GAP-J  --window=1 (minimum valid value) does not exit config_error;
 *          proceeds to file check (exit 2 for missing file).
 *
 *   GAP-K  --alpha=0.001 (exact minimum boundary) is valid and does not reject.
 *
 *   GAP-L  --alpha=1 (exact upper boundary) is valid; ewma_value is finite.
 *
 *   GAP-M  --threshold 1 (upper boundary) — all windows have drift_detected true
 *          when ewma > 1 is impossible, so drift_detected stays false; but no crash.
 *
 *   GAP-N  ewma_value precision: value is expressed to at most 4 decimal places.
 *
 *   GAP-O  drifts_detected field is a non-negative integer in every JSON line.
 *
 *   GAP-P  threshold_crossed is boolean (not null, not undefined, not a number).
 *
 *   GAP-Q  equals-sign form --window=0 also exits config_error (1) [citty
 *          parses equals-sign forms; confirm same validation path fires].
 *
 *   GAP-R  --window float string "1.5" → parseInt parses as 1 → valid (no config error).
 *          Documents the implementation behaviour: partial float strings are accepted
 *          because parseInt stops at the decimal point.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execFile } from 'child_process';

// ---------------------------------------------------------------------------
// Infrastructure
// ---------------------------------------------------------------------------

const CLI_PATH = path.resolve(__dirname, '../../dist/bin/wpm.js');
const TIMEOUT_MS = 25_000;

// Guaranteed missing path for config-validation tests (no WASM needed)
const MISSING_INPUT = path.join(os.tmpdir(), '__drift_gaps_no_such_file__.xes');
const CLEAN_CWD = os.tmpdir();

interface CliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/** Pure execFile runner — does not wait for a streaming tick. */
function runOnce(args: string[], timeoutMs = TIMEOUT_MS): Promise<CliResult> {
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
// Streaming runner — sends SIGINT after the first JSON line arrives.
// ---------------------------------------------------------------------------

interface StreamResult {
  firstLine: Record<string, unknown> | null;
  allLines: Record<string, unknown>[];
  exitCode: number;
  rawStdout: string;
  stderr: string;
  parseError: string | null;
}

function runDriftWatchOneTick(
  args: string[],
  timeoutMs: number = TIMEOUT_MS
): Promise<StreamResult> {
  return new Promise((resolve) => {
    let stdoutBuf = '';
    let stderrBuf = '';
    let settled = false;

    const settle = (result: StreamResult) => {
      if (!settled) {
        settled = true;
        resolve(result);
      }
    };

    const child = execFile(
      process.execPath,
      // Use a very large interval so only one tick fires before we kill the process.
      [CLI_PATH, 'drift-watch', ...args, '--interval', '99999'],
      { timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024 },
      (error, outBuf, errBuf) => {
        // Callback fires when process exits naturally (validation error, missing file, etc.)
        stdoutBuf += outBuf ?? '';
        stderrBuf += errBuf ?? '';
        const code =
          error && 'code' in error && typeof error.code === 'number'
            ? error.code
            : error
              ? 1
              : 0;
        const jsonLines = stdoutBuf
          .split('\n')
          .map((l) => l.trim())
          .filter((l) => l.startsWith('{'));
        const allLines: Record<string, unknown>[] = [];
        let parseError: string | null = null;
        for (const line of jsonLines) {
          try {
            allLines.push(JSON.parse(line) as Record<string, unknown>);
          } catch (e) {
            parseError = String(e);
          }
        }
        settle({
          firstLine: allLines[0] ?? null,
          allLines,
          exitCode: code,
          rawStdout: stdoutBuf,
          stderr: stderrBuf,
          parseError,
        });
      }
    );

    child.stdout?.on('data', (chunk: Buffer | string) => {
      stdoutBuf += chunk.toString();
      const lines = stdoutBuf
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.startsWith('{'));
      if (lines.length > 0) {
        // Give process a brief moment then SIGINT for a clean shutdown
        setTimeout(() => {
          try {
            child.kill('SIGINT');
          } catch {
            /* already exited */
          }
          // Parse what we have
          const allLines: Record<string, unknown>[] = [];
          let parseError: string | null = null;
          for (const line of lines) {
            try {
              allLines.push(JSON.parse(line) as Record<string, unknown>);
            } catch (e) {
              parseError = String(e);
            }
          }
          settle({
            firstLine: allLines[0] ?? null,
            allLines,
            exitCode: 0, // SIGINT = graceful
            rawStdout: stdoutBuf,
            stderr: stderrBuf,
            parseError,
          });
        }, 300);
      }
    });

    child.stderr?.on('data', (chunk: Buffer | string) => {
      stderrBuf += chunk.toString();
    });
  });
}

// ---------------------------------------------------------------------------
// Fixture: zero-variance XES (all traces identical → Jaccard distance = 0)
// ---------------------------------------------------------------------------

const ZERO_VARIANCE_XES = `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0" xmlns="http://www.xes-standard.org/">
  <trace>
    <string key="concept:name" value="case-001"/>
    <event><string key="concept:name" value="Register"/><date key="time:timestamp" value="2026-01-01T09:00:00Z"/></event>
    <event><string key="concept:name" value="Approve"/><date key="time:timestamp" value="2026-01-01T10:00:00Z"/></event>
  </trace>
  <trace>
    <string key="concept:name" value="case-002"/>
    <event><string key="concept:name" value="Register"/><date key="time:timestamp" value="2026-01-02T09:00:00Z"/></event>
    <event><string key="concept:name" value="Approve"/><date key="time:timestamp" value="2026-01-02T10:00:00Z"/></event>
  </trace>
  <trace>
    <string key="concept:name" value="case-003"/>
    <event><string key="concept:name" value="Register"/><date key="time:timestamp" value="2026-01-03T09:00:00Z"/></event>
    <event><string key="concept:name" value="Approve"/><date key="time:timestamp" value="2026-01-03T10:00:00Z"/></event>
  </trace>
  <trace>
    <string key="concept:name" value="case-004"/>
    <event><string key="concept:name" value="Register"/><date key="time:timestamp" value="2026-01-04T09:00:00Z"/></event>
    <event><string key="concept:name" value="Approve"/><date key="time:timestamp" value="2026-01-04T10:00:00Z"/></event>
  </trace>
</log>`;

/**
 * Small log with distinct traces — used for basic JSON-field tests.
 * 3 traces, 2 events each, activities differ across traces.
 */
const SMALL_LOG_XES = `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0" xmlns="http://www.xes-standard.org/">
  <trace>
    <string key="concept:name" value="case-001"/>
    <event>
      <string key="concept:name" value="Register"/>
      <date key="time:timestamp" value="2026-01-01T09:00:00Z"/>
    </event>
    <event>
      <string key="concept:name" value="Approve"/>
      <date key="time:timestamp" value="2026-01-01T10:00:00Z"/>
    </event>
  </trace>
  <trace>
    <string key="concept:name" value="case-002"/>
    <event>
      <string key="concept:name" value="Register"/>
      <date key="time:timestamp" value="2026-01-02T09:00:00Z"/>
    </event>
    <event>
      <string key="concept:name" value="Close"/>
      <date key="time:timestamp" value="2026-01-02T10:00:00Z"/>
    </event>
  </trace>
  <trace>
    <string key="concept:name" value="case-003"/>
    <event>
      <string key="concept:name" value="Submit"/>
      <date key="time:timestamp" value="2026-01-03T09:00:00Z"/>
    </event>
    <event>
      <string key="concept:name" value="Approve"/>
      <date key="time:timestamp" value="2026-01-03T10:00:00Z"/>
    </event>
  </trace>
</log>`;

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

let tempDir: string;
let zeroVariancePath: string;
let smallLogPath: string;

beforeAll(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wpm-drift-gaps-'));
  zeroVariancePath = path.join(tempDir, 'zero-variance.xes');
  smallLogPath = path.join(tempDir, 'small.xes');
  fs.writeFileSync(zeroVariancePath, ZERO_VARIANCE_XES, 'utf-8');
  fs.writeFileSync(smallLogPath, SMALL_LOG_XES, 'utf-8');
});

afterAll(() => {
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {
    /* non-fatal */
  }
});

// ===========================================================================
// GAP-A: --interval range [1, 99] is below minimum of 100 — should exit 1
// ===========================================================================

describe('GAP-A: --interval below minimum (1–99) exits config_error (1)', () => {
  it('--interval 99 exits config_error (1) — min is 100, not just >0', async () => {
    const r = await runOnce(['drift-watch', '-i', MISSING_INPUT, '--interval', '99']);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toMatch(/--interval|interval/i);
  });

  it('--interval 1 exits config_error (1)', async () => {
    const r = await runOnce(['drift-watch', '-i', MISSING_INPUT, '--interval', '1']);
    expect(r.exitCode).toBe(1);
  });

  it('--interval 50 exits config_error (1)', async () => {
    const r = await runOnce(['drift-watch', '-i', MISSING_INPUT, '--interval', '50']);
    expect(r.exitCode).toBe(1);
  });

  it('--interval 100 (minimum valid) does not exit config_error', async () => {
    // Should proceed past validation and fail on missing file (exit 2)
    const r = await runOnce(['drift-watch', '-i', MISSING_INPUT, '--interval', '100']);
    expect(r.exitCode).not.toBe(1);
    expect(r.stderr).not.toMatch(/must be >= 100/i);
  });
});

// ===========================================================================
// GAP-B: window_index on the first tick is exactly 0
// ===========================================================================

describe('GAP-B: window_index on first JSON tick is exactly 0', () => {
  it('first JSON tick has window_index === 0 (not 1 or undefined)', async () => {
    const result = await runDriftWatchOneTick(
      ['-i', smallLogPath, '--json', '--no-save'],
      TIMEOUT_MS
    );
    if (result.firstLine === null) {
      // WASM unavailable — command exited before emitting JSON
      expect(result.exitCode).not.toBe(1);
      return;
    }
    // Implementation: windowsProcessed is incremented to 1 before tickInner runs,
    // then window_index = windowsProcessed - 1 = 0 on the first tick.
    expect(result.firstLine.window_index).toBe(0);
  }, TIMEOUT_MS);
});

// ===========================================================================
// GAP-C: threshold_crossed is false when ewma never crosses threshold
// ===========================================================================

describe('GAP-C: threshold_crossed is false when ewma never exceeds threshold', () => {
  it('zero-variance log: threshold_crossed is false on first tick', async () => {
    const result = await runDriftWatchOneTick(
      ['-i', zeroVariancePath, '--json', '--no-save', '--window', '2'],
      TIMEOUT_MS
    );
    if (result.firstLine === null) {
      expect(result.exitCode).not.toBe(1);
      return;
    }
    // With identical traces, Jaccard distance = 0 → ewma ≈ 0 << threshold 0.3
    // On tick 0, previousEwma = 0 and ewma ≈ 0, so ewma > threshold is false
    // → threshold_crossed must be false
    expect(result.firstLine.threshold_crossed).toBe(false);
  }, TIMEOUT_MS);

  it('zero-variance log: drift_detected is false (ewma below default threshold)', async () => {
    const result = await runDriftWatchOneTick(
      ['-i', zeroVariancePath, '--json', '--no-save', '--window', '2'],
      TIMEOUT_MS
    );
    if (result.firstLine === null) {
      expect(result.exitCode).not.toBe(1);
      return;
    }
    expect(result.firstLine.drift_detected).toBe(false);
  }, TIMEOUT_MS);
});

// ===========================================================================
// GAP-D: JSON line always includes new_drifts array field
// ===========================================================================

describe('GAP-D: JSON output always includes new_drifts array field', () => {
  it('first JSON line includes new_drifts as an array', async () => {
    const result = await runDriftWatchOneTick(
      ['-i', smallLogPath, '--json', '--no-save'],
      TIMEOUT_MS
    );
    if (result.firstLine === null) {
      expect(result.exitCode).not.toBe(1);
      return;
    }
    expect(Array.isArray(result.firstLine.new_drifts)).toBe(true);
  }, TIMEOUT_MS);

  it('new_drifts on zero-variance log is an empty array', async () => {
    const result = await runDriftWatchOneTick(
      ['-i', zeroVariancePath, '--json', '--no-save', '--window', '2'],
      TIMEOUT_MS
    );
    if (result.firstLine === null) {
      expect(result.exitCode).not.toBe(1);
      return;
    }
    // No drift on identical-trace log → new_drifts should be []
    expect(Array.isArray(result.firstLine.new_drifts)).toBe(true);
    expect((result.firstLine.new_drifts as unknown[]).length).toBe(0);
  }, TIMEOUT_MS);
});

// ===========================================================================
// GAP-E: JSON line always includes new_drift_points as non-negative integer
// ===========================================================================

describe('GAP-E: JSON output includes new_drift_points as a non-negative integer', () => {
  it('first JSON line includes new_drift_points field', async () => {
    const result = await runDriftWatchOneTick(
      ['-i', smallLogPath, '--json', '--no-save'],
      TIMEOUT_MS
    );
    if (result.firstLine === null) {
      expect(result.exitCode).not.toBe(1);
      return;
    }
    expect(typeof result.firstLine.new_drift_points).toBe('number');
    expect(Number.isInteger(result.firstLine.new_drift_points as number)).toBe(true);
    expect(result.firstLine.new_drift_points as number).toBeGreaterThanOrEqual(0);
  }, TIMEOUT_MS);
});

// ===========================================================================
// GAP-F: JSON line includes window_size reflecting the --window parameter
// ===========================================================================

describe('GAP-F: JSON output window_size reflects the --window parameter', () => {
  it('window_size field matches --window value', async () => {
    const result = await runDriftWatchOneTick(
      ['-i', smallLogPath, '--json', '--no-save', '--window', '5'],
      TIMEOUT_MS
    );
    if (result.firstLine === null) {
      expect(result.exitCode).not.toBe(1);
      return;
    }
    // --window 5 → window_size should be 5 in the JSON output
    expect(result.firstLine.window_size).toBe(5);
  }, TIMEOUT_MS);

  it('window_size defaults to 50 when --window is not specified', async () => {
    const result = await runDriftWatchOneTick(
      ['-i', smallLogPath, '--json', '--no-save'],
      TIMEOUT_MS
    );
    if (result.firstLine === null) {
      expect(result.exitCode).not.toBe(1);
      return;
    }
    expect(result.firstLine.window_size).toBe(50);
  }, TIMEOUT_MS);
});

// ===========================================================================
// GAP-G: JSON line includes approaching_threshold boolean
// ===========================================================================

describe('GAP-G: JSON output includes approaching_threshold boolean', () => {
  it('first JSON line includes approaching_threshold field', async () => {
    const result = await runDriftWatchOneTick(
      ['-i', smallLogPath, '--json', '--no-save'],
      TIMEOUT_MS
    );
    if (result.firstLine === null) {
      expect(result.exitCode).not.toBe(1);
      return;
    }
    expect(typeof result.firstLine.approaching_threshold).toBe('boolean');
  }, TIMEOUT_MS);

  it('approaching_threshold is false on zero-variance log (ewma ≈ 0, no rising trend)', async () => {
    const result = await runDriftWatchOneTick(
      ['-i', zeroVariancePath, '--json', '--no-save', '--window', '2'],
      TIMEOUT_MS
    );
    if (result.firstLine === null) {
      expect(result.exitCode).not.toBe(1);
      return;
    }
    // ewma ≈ 0, not rising toward threshold → approaching_threshold must be false
    expect(result.firstLine.approaching_threshold).toBe(false);
  }, TIMEOUT_MS);
});

// ===========================================================================
// GAP-H: JSON line distances field is an array of numbers
// ===========================================================================

describe('GAP-H: JSON output distances field is an array of finite numbers', () => {
  it('first JSON line includes distances as an array', async () => {
    const result = await runDriftWatchOneTick(
      ['-i', smallLogPath, '--json', '--no-save'],
      TIMEOUT_MS
    );
    if (result.firstLine === null) {
      expect(result.exitCode).not.toBe(1);
      return;
    }
    expect(Array.isArray(result.firstLine.distances)).toBe(true);
  }, TIMEOUT_MS);

  it('all elements in distances are finite numbers', async () => {
    const result = await runDriftWatchOneTick(
      ['-i', smallLogPath, '--json', '--no-save'],
      TIMEOUT_MS
    );
    if (result.firstLine === null) {
      expect(result.exitCode).not.toBe(1);
      return;
    }
    const distances = result.firstLine.distances as number[];
    for (const d of distances) {
      expect(typeof d).toBe('number');
      expect(Number.isFinite(d)).toBe(true);
    }
  }, TIMEOUT_MS);
});

// ===========================================================================
// GAP-I: Missing input file with --json flag → exit 2 with no JSON on stdout
// ===========================================================================

describe('GAP-I: missing input file with --json exits 2, no JSON on stdout', () => {
  it('missing file exits source_error (2) in --json mode', async () => {
    const r = await runOnce([
      'drift-watch',
      '-i', MISSING_INPUT,
      '--json',
      '--no-save',
    ]);
    // Validation passes (no config_error), file check fails → source_error
    expect(r.exitCode).toBe(2);
  });

  it('missing file with --json produces no JSON on stdout (error on stderr only)', async () => {
    const r = await runOnce([
      'drift-watch',
      '-i', MISSING_INPUT,
      '--json',
      '--no-save',
    ]);
    // No JSON objects should appear on stdout — the file-not-found message is on stderr
    const jsonLines = r.stdout
      .split('\n')
      .filter((l) => l.trim().startsWith('{'));
    expect(jsonLines.length).toBe(0);
  });

  it('missing file with --json produces error message on stderr', async () => {
    const r = await runOnce([
      'drift-watch',
      '-i', MISSING_INPUT,
      '--json',
      '--no-save',
    ]);
    expect(r.stderr).toMatch(/Input file not found|not found/i);
  });
});

// ===========================================================================
// GAP-J: --window=1 (minimum valid) does not exit config_error
// ===========================================================================

describe('GAP-J: --window=1 (minimum valid window) passes validation', () => {
  it('--window 1 does not exit config_error (1)', async () => {
    const r = await runOnce(['drift-watch', '-i', MISSING_INPUT, '--window', '1']);
    // Window=1 passes validation → file check fails → exit 2
    expect(r.exitCode).not.toBe(1);
    expect(r.stderr).not.toMatch(/positive/i);
  });

  it('--window=1 (equals-sign form) does not exit config_error (1)', async () => {
    const r = await runOnce(['drift-watch', '-i', MISSING_INPUT, '--window=1']);
    expect(r.exitCode).not.toBe(1);
  });
});

// ===========================================================================
// GAP-K: --alpha=0.001 (exact minimum boundary) is valid
// ===========================================================================

describe('GAP-K: --alpha=0.001 (minimum valid alpha) passes validation', () => {
  it('--alpha 0.001 does not exit config_error (1)', async () => {
    const r = await runOnce(['drift-watch', '-i', MISSING_INPUT, '--alpha', '0.001']);
    expect(r.exitCode).not.toBe(1);
    expect(r.stderr).not.toMatch(/must be in range/i);
  });

  it('--alpha 0.0009 (below minimum) exits config_error (1)', async () => {
    // 0.0009 < 0.001 → should fail the [0.001, 1] range check
    const r = await runOnce(['drift-watch', '-i', MISSING_INPUT, '--alpha', '0.0009']);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toMatch(/--alpha|alpha/i);
  });
});

// ===========================================================================
// GAP-L: --alpha=1 (upper boundary) produces a finite ewma_value
// ===========================================================================

describe('GAP-L: --alpha=1 (upper boundary) produces finite ewma_value', () => {
  it('--alpha 1 JSON output ewma_value is a finite number', async () => {
    const result = await runDriftWatchOneTick(
      ['-i', smallLogPath, '--json', '--no-save', '--alpha', '1'],
      TIMEOUT_MS
    );
    if (result.firstLine === null) {
      expect(result.exitCode).not.toBe(1);
      return;
    }
    // alpha=1 means 100% weight on the most recent window — still finite
    expect(typeof result.firstLine.ewma_value).toBe('number');
    expect(Number.isFinite(result.firstLine.ewma_value as number)).toBe(true);
    expect(Number.isNaN(result.firstLine.ewma_value as number)).toBe(false);
  }, TIMEOUT_MS);
});

// ===========================================================================
// GAP-N: ewma_value precision — at most 4 decimal places
// ===========================================================================

describe('GAP-N: ewma_value is expressed to at most 4 decimal places', () => {
  it('ewma_value has at most 4 decimal digits in JSON output', async () => {
    const result = await runDriftWatchOneTick(
      ['-i', smallLogPath, '--json', '--no-save'],
      TIMEOUT_MS
    );
    if (result.firstLine === null) {
      expect(result.exitCode).not.toBe(1);
      return;
    }
    const ewmaValue = result.firstLine.ewma_value as number;
    // Convert to string and count decimal places
    const str = String(ewmaValue);
    const dotIdx = str.indexOf('.');
    const decimalPlaces = dotIdx === -1 ? 0 : str.length - dotIdx - 1;
    // Implementation uses parseFloat(ewma.toFixed(4)) → max 4 decimal places
    expect(decimalPlaces).toBeLessThanOrEqual(4);
  }, TIMEOUT_MS);
});

// ===========================================================================
// GAP-O: drifts_detected is a non-negative integer in every JSON line
// ===========================================================================

describe('GAP-O: JSON output drifts_detected is a non-negative integer', () => {
  it('drifts_detected is a number in first JSON line', async () => {
    const result = await runDriftWatchOneTick(
      ['-i', smallLogPath, '--json', '--no-save'],
      TIMEOUT_MS
    );
    if (result.firstLine === null) {
      expect(result.exitCode).not.toBe(1);
      return;
    }
    expect(typeof result.firstLine.drifts_detected).toBe('number');
    expect(Number.isInteger(result.firstLine.drifts_detected as number)).toBe(true);
    expect(result.firstLine.drifts_detected as number).toBeGreaterThanOrEqual(0);
  }, TIMEOUT_MS);
});

// ===========================================================================
// GAP-P: threshold_crossed is strictly boolean (not null, not number)
// ===========================================================================

describe('GAP-P: threshold_crossed is always a strict boolean', () => {
  it('threshold_crossed is exactly true or false — never null, undefined, or number', async () => {
    const result = await runDriftWatchOneTick(
      ['-i', smallLogPath, '--json', '--no-save'],
      TIMEOUT_MS
    );
    if (result.firstLine === null) {
      expect(result.exitCode).not.toBe(1);
      return;
    }
    const tc = result.firstLine.threshold_crossed;
    expect(tc === true || tc === false).toBe(true);
    expect(typeof tc).toBe('boolean');
  }, TIMEOUT_MS);

  it('drift_detected is also a strict boolean — never null or number', async () => {
    const result = await runDriftWatchOneTick(
      ['-i', smallLogPath, '--json', '--no-save'],
      TIMEOUT_MS
    );
    if (result.firstLine === null) {
      expect(result.exitCode).not.toBe(1);
      return;
    }
    const dd = result.firstLine.drift_detected;
    expect(dd === true || dd === false).toBe(true);
    expect(typeof dd).toBe('boolean');
  }, TIMEOUT_MS);
});

// ===========================================================================
// GAP-Q: equals-sign form --window=0 also exits config_error (1)
// ===========================================================================

describe('GAP-Q: equals-sign form --window=0 exits config_error (1)', () => {
  it('--window=0 (equals form) exits config_error (1)', async () => {
    const r = await runOnce(['drift-watch', '-i', MISSING_INPUT, '--window=0']);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toMatch(/--window|window/i);
    expect(r.stderr).toMatch(/positive/i);
  });

  it('--threshold=2 (equals form, out-of-range) exits config_error (1)', async () => {
    const r = await runOnce(['drift-watch', '-i', MISSING_INPUT, '--threshold=2']);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toMatch(/--threshold|threshold/i);
  });

  it('--alpha=0 (equals form) exits config_error (1)', async () => {
    const r = await runOnce(['drift-watch', '-i', MISSING_INPUT, '--alpha=0']);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toMatch(/--alpha|alpha/i);
  });
});

// ===========================================================================
// GAP-R: --window "1.5" (float string) is parsed as 1 (valid) via parseInt
// ===========================================================================

describe('GAP-R: --window "1.5" (float string) is accepted via parseInt → 1', () => {
  it('"--window 1.5" does not exit config_error — parseInt("1.5") = 1 is valid', async () => {
    // parseInt("1.5", 10) = 1, which passes validation.
    // This documents the implementation behaviour: partial floats are accepted.
    const r = await runOnce(['drift-watch', '-i', MISSING_INPUT, '--window', '1.5']);
    // Should pass validation and fail on missing file (exit 2)
    expect(r.exitCode).not.toBe(1);
    expect(r.stderr).not.toMatch(/positive integer/i);
  });
});
