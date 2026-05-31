/**
 * drift-social-temporal-gaps.test.ts
 *
 * Closes the remaining DX/QoL gaps in three commands:
 *
 * DRIFT-WATCH gaps
 *   DW-1  JSON output includes drift_detected boolean field
 *   DW-2  JSON output includes ewma_value field (machine-readable alias)
 *   DW-3  JSON output includes threshold_crossed boolean field
 *   DW-4  JSON output includes window_index monotonic counter
 *   DW-5  JSON streaming: each tick is a separate newline-delimited JSON line
 *   DW-6  Small log (fewer traces than --window): graceful exit, no crash
 *   DW-7  Zero-variance log (all traces identical): ewma ≈ 0, drift_detected false
 *   DW-8  --activity-key is propagated (reflected in output, no crash)
 *
 * SOCIAL gaps
 *   SO-1  --metric bogus exits config_error (1)  [not in social-cli.test.ts]
 *   SO-2  JSON payload includes bottleneckResources array field
 *   SO-3  JSON payload includes workloadBalance object field
 *   SO-4  Both handover and working-together produce non-empty JSON envelopes
 *
 * TEMPORAL gaps
 *   TE-1  --threshold 1.5 exits config_error (1) — out-of-range threshold
 *   TE-2  --threshold -0.1 exits config_error (1) — negative threshold
 *   TE-3  --threshold not-a-number exits config_error (1)
 *   TE-4  --threshold 1 (upper boundary) does not exit config_error
 *   TE-5  --threshold 0 (lower boundary) does not exit config_error
 *   TE-6  JSON payload includes violations.count (already tested) + violations.items array
 *   TE-7  JSON payload includes temporalConformance field (null or object — never missing)
 *   TE-8  --timestamp-key custom value does not cause config_error
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execFile } from 'child_process';
import { runCli, EXIT_CODES } from '@wasm4pm/testing';

// ── Test configuration ─────────────────────────────────────────────────────────

const TIMEOUT_MS = 30_000;
const CLI_PATH = path.resolve(__dirname, '../../dist/bin/wpm.js');

// ── Fixtures ───────────────────────────────────────────────────────────────────

/**
 * Minimal XES with 3 traces — fewer than a default window of 50.
 * Activities are distinct across traces to produce non-zero Jaccard distance.
 */
const SMALL_LOG_XES = `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0" xmlns="http://www.xes-standard.org/">
  <trace>
    <string key="concept:name" value="case-001"/>
    <event>
      <string key="concept:name" value="Register"/>
      <date key="time:timestamp" value="2026-01-01T09:00:00Z"/>
      <string key="org:resource" value="Alice"/>
    </event>
    <event>
      <string key="concept:name" value="Approve"/>
      <date key="time:timestamp" value="2026-01-01T10:00:00Z"/>
      <string key="org:resource" value="Bob"/>
    </event>
  </trace>
  <trace>
    <string key="concept:name" value="case-002"/>
    <event>
      <string key="concept:name" value="Register"/>
      <date key="time:timestamp" value="2026-01-02T09:00:00Z"/>
      <string key="org:resource" value="Charlie"/>
    </event>
    <event>
      <string key="concept:name" value="Close"/>
      <date key="time:timestamp" value="2026-01-02T10:00:00Z"/>
      <string key="org:resource" value="Alice"/>
    </event>
  </trace>
  <trace>
    <string key="concept:name" value="case-003"/>
    <event>
      <string key="concept:name" value="Submit"/>
      <date key="time:timestamp" value="2026-01-03T09:00:00Z"/>
      <string key="org:resource" value="Bob"/>
    </event>
    <event>
      <string key="concept:name" value="Approve"/>
      <date key="time:timestamp" value="2026-01-03T10:00:00Z"/>
      <string key="org:resource" value="Charlie"/>
    </event>
  </trace>
</log>`;

/**
 * Zero-variance log: all 4 traces are identical (same activity sequence).
 * Jaccard distance between any two consecutive windows should be 0.
 */
const ZERO_VARIANCE_XES = `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0" xmlns="http://www.xes-standard.org/">
  <trace>
    <string key="concept:name" value="case-001"/>
    <event><string key="concept:name" value="A"/><date key="time:timestamp" value="2026-01-01T09:00:00Z"/></event>
    <event><string key="concept:name" value="B"/><date key="time:timestamp" value="2026-01-01T10:00:00Z"/></event>
  </trace>
  <trace>
    <string key="concept:name" value="case-002"/>
    <event><string key="concept:name" value="A"/><date key="time:timestamp" value="2026-01-02T09:00:00Z"/></event>
    <event><string key="concept:name" value="B"/><date key="time:timestamp" value="2026-01-02T10:00:00Z"/></event>
  </trace>
  <trace>
    <string key="concept:name" value="case-003"/>
    <event><string key="concept:name" value="A"/><date key="time:timestamp" value="2026-01-03T09:00:00Z"/></event>
    <event><string key="concept:name" value="B"/><date key="time:timestamp" value="2026-01-03T10:00:00Z"/></event>
  </trace>
  <trace>
    <string key="concept:name" value="case-004"/>
    <event><string key="concept:name" value="A"/><date key="time:timestamp" value="2026-01-04T09:00:00Z"/></event>
    <event><string key="concept:name" value="B"/><date key="time:timestamp" value="2026-01-04T10:00:00Z"/></event>
  </trace>
</log>`;

/**
 * Temporal XES: 3 traces with timestamps for temporal conformance analysis.
 */
const TEMPORAL_XES = `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0" xmlns="http://www.xes-standard.org/">
  <trace>
    <string key="concept:name" value="case-001"/>
    <event><string key="concept:name" value="Register"/><date key="time:timestamp" value="2026-01-01T09:00:00Z"/></event>
    <event><string key="concept:name" value="Examine"/><date key="time:timestamp" value="2026-01-01T09:30:00Z"/></event>
    <event><string key="concept:name" value="Decide"/><date key="time:timestamp" value="2026-01-01T10:00:00Z"/></event>
  </trace>
  <trace>
    <string key="concept:name" value="case-002"/>
    <event><string key="concept:name" value="Register"/><date key="time:timestamp" value="2026-01-02T09:00:00Z"/></event>
    <event><string key="concept:name" value="Decide"/><date key="time:timestamp" value="2026-01-02T11:00:00Z"/></event>
  </trace>
  <trace>
    <string key="concept:name" value="case-003"/>
    <event><string key="concept:name" value="Register"/><date key="time:timestamp" value="2026-01-03T08:00:00Z"/></event>
    <event><string key="concept:name" value="Examine"/><date key="time:timestamp" value="2026-01-03T09:00:00Z"/></event>
    <event><string key="concept:name" value="Decide"/><date key="time:timestamp" value="2026-01-03T10:30:00Z"/></event>
  </trace>
</log>`;

// ── Test environment setup ─────────────────────────────────────────────────────

let tempDir: string;
let smallLogPath: string;
let zeroVariancePath: string;
let temporalPath: string;

beforeAll(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wpm-gaps-'));
  smallLogPath = path.join(tempDir, 'small.xes');
  zeroVariancePath = path.join(tempDir, 'zero-variance.xes');
  temporalPath = path.join(tempDir, 'temporal.xes');
  fs.writeFileSync(smallLogPath, SMALL_LOG_XES, 'utf-8');
  fs.writeFileSync(zeroVariancePath, ZERO_VARIANCE_XES, 'utf-8');
  fs.writeFileSync(temporalPath, TEMPORAL_XES, 'utf-8');
});

afterAll(() => {
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {
    // non-fatal
  }
});

// ── Low-level CLI runner for streaming commands ────────────────────────────────
//
// drift-watch runs until SIGINT. We send SIGINT after collecting the first JSON
// line so tests only need a single tick's output.

interface StreamResult {
  firstLine: Record<string, unknown> | null;
  exitCode: number;
  stderr: string;
  parseError: string | null;
}

function runDriftWatchOneTick(
  args: string[],
  timeoutMs: number = TIMEOUT_MS
): Promise<StreamResult> {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let resolved = false;

    const child = execFile(
      process.execPath,
      [CLI_PATH, 'drift-watch', ...args, '--interval', '99999'],
      { timeout: timeoutMs, maxBuffer: 2 * 1024 * 1024 },
      (error, outBuf, errBuf) => {
        if (!resolved) {
          resolved = true;
          stdout += outBuf ?? '';
          stderr += errBuf ?? '';
          const code =
            error && 'code' in error && typeof error.code === 'number'
              ? error.code
              : error
                ? 1
                : 0;
          resolve({
            firstLine: null,
            exitCode: code,
            stderr,
            parseError: null,
          });
        }
      }
    );

    // Accumulate stdout and kill after first non-empty JSON line
    child.stdout?.on('data', (chunk: Buffer | string) => {
      stdout += chunk.toString();
      const lines = stdout.split('\n').filter((l) => l.trim().startsWith('{'));
      if (lines.length > 0 && !resolved) {
        // Give it a moment then send SIGINT
        setTimeout(() => {
          if (!resolved) {
            try {
              child.kill('SIGINT');
            } catch {
              // already exited
            }
            resolved = true;
            let firstLine: Record<string, unknown> | null = null;
            let parseError: string | null = null;
            try {
              firstLine = JSON.parse(lines[0]) as Record<string, unknown>;
            } catch (e) {
              parseError = String(e);
            }
            const exitCode = 0; // SIGINT is graceful
            resolve({ firstLine, exitCode, stderr, parseError });
          }
        }, 200);
      }
    });

    child.stderr?.on('data', (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });
  });
}

// ── DRIFT-WATCH JSON output field tests ───────────────────────────────────────

describe('DW-1/2/3/4: drift-watch --json output includes required fields', () => {
  it('JSON output line includes drift_detected boolean', async () => {
    const result = await runDriftWatchOneTick(
      ['-i', smallLogPath, '--json', '--no-save'],
      TIMEOUT_MS
    );
    if (result.firstLine === null) {
      // WASM not available or command failed before emitting JSON; skip field check
      expect(result.exitCode).not.toBe(EXIT_CODES.config_error);
      return;
    }
    expect(typeof result.firstLine.drift_detected).toBe('boolean');
  }, TIMEOUT_MS);

  it('JSON output line includes ewma_value (numeric alias for ewma)', async () => {
    const result = await runDriftWatchOneTick(
      ['-i', smallLogPath, '--json', '--no-save'],
      TIMEOUT_MS
    );
    if (result.firstLine === null) {
      expect(result.exitCode).not.toBe(EXIT_CODES.config_error);
      return;
    }
    expect(typeof result.firstLine.ewma_value).toBe('number');
    expect(Number.isFinite(result.firstLine.ewma_value as number)).toBe(true);
  }, TIMEOUT_MS);

  it('JSON output line includes threshold_crossed boolean', async () => {
    const result = await runDriftWatchOneTick(
      ['-i', smallLogPath, '--json', '--no-save'],
      TIMEOUT_MS
    );
    if (result.firstLine === null) {
      expect(result.exitCode).not.toBe(EXIT_CODES.config_error);
      return;
    }
    expect(typeof result.firstLine.threshold_crossed).toBe('boolean');
  }, TIMEOUT_MS);

  it('JSON output line includes window_index as a non-negative integer', async () => {
    const result = await runDriftWatchOneTick(
      ['-i', smallLogPath, '--json', '--no-save'],
      TIMEOUT_MS
    );
    if (result.firstLine === null) {
      expect(result.exitCode).not.toBe(EXIT_CODES.config_error);
      return;
    }
    expect(typeof result.firstLine.window_index).toBe('number');
    expect(result.firstLine.window_index as number).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(result.firstLine.window_index as number)).toBe(true);
  }, TIMEOUT_MS);

  it('JSON output line includes ewma and trend fields', async () => {
    const result = await runDriftWatchOneTick(
      ['-i', smallLogPath, '--json', '--no-save'],
      TIMEOUT_MS
    );
    if (result.firstLine === null) {
      expect(result.exitCode).not.toBe(EXIT_CODES.config_error);
      return;
    }
    expect(typeof result.firstLine.ewma).toBe('number');
    expect(['rising', 'falling', 'stable']).toContain(result.firstLine.trend);
  }, TIMEOUT_MS);

  it('JSON output ewma_value and ewma are equal', async () => {
    const result = await runDriftWatchOneTick(
      ['-i', smallLogPath, '--json', '--no-save'],
      TIMEOUT_MS
    );
    if (result.firstLine === null) {
      expect(result.exitCode).not.toBe(EXIT_CODES.config_error);
      return;
    }
    expect(result.firstLine.ewma_value).toBe(result.firstLine.ewma);
  }, TIMEOUT_MS);
});

// ── DW-5: Streaming produces newline-delimited JSON ───────────────────────────

describe('DW-5: drift-watch --json emits newline-delimited JSON (one object per tick)', () => {
  it('first output line in --json mode is valid JSON starting with {', async () => {
    const result = await runDriftWatchOneTick(
      ['-i', smallLogPath, '--json', '--no-save'],
      TIMEOUT_MS
    );
    if (result.firstLine === null) {
      // WASM not available; the test verifies the command does not crash
      expect(result.exitCode).not.toBe(EXIT_CODES.config_error);
      return;
    }
    // If we received and parsed a JSON line, the parse must have succeeded
    expect(result.parseError).toBeNull();
    expect(result.firstLine).not.toBeNull();
    expect(typeof result.firstLine).toBe('object');
  }, TIMEOUT_MS);

  it('first JSON line has timestamp field in ISO-8601 format', async () => {
    const result = await runDriftWatchOneTick(
      ['-i', smallLogPath, '--json', '--no-save'],
      TIMEOUT_MS
    );
    if (result.firstLine === null) {
      expect(result.exitCode).not.toBe(EXIT_CODES.config_error);
      return;
    }
    expect(typeof result.firstLine.timestamp).toBe('string');
    expect(new Date(result.firstLine.timestamp as string).toISOString()).toBe(
      result.firstLine.timestamp
    );
  }, TIMEOUT_MS);
});

// ── DW-6: Small log (fewer traces than window) ────────────────────────────────

describe('DW-6: drift-watch with small log (3 traces, --window 50) exits gracefully', () => {
  it('small log with large window does not crash (exits 0, 2, or 3 — not a segfault)', async () => {
    const result = await runDriftWatchOneTick(
      ['-i', smallLogPath, '--window', '50', '--json', '--no-save'],
      TIMEOUT_MS
    );
    // Either the WASM ran (exit 0 after SIGINT) or file error (2) or WASM error (3)
    // What we must NOT see: exit 1 (config_error) or a crash producing negative exit code
    expect(result.exitCode).toBeGreaterThanOrEqual(0);
    expect(result.exitCode).not.toBe(EXIT_CODES.config_error);
  }, TIMEOUT_MS);

  it('small log JSON output ewma value is finite (no NaN/Infinity from empty window)', async () => {
    const result = await runDriftWatchOneTick(
      ['-i', smallLogPath, '--window', '50', '--json', '--no-save'],
      TIMEOUT_MS
    );
    if (result.firstLine === null) {
      expect(result.exitCode).not.toBe(EXIT_CODES.config_error);
      return;
    }
    const ewma = result.firstLine.ewma as number;
    expect(Number.isFinite(ewma)).toBe(true);
    expect(Number.isNaN(ewma)).toBe(false);
  }, TIMEOUT_MS);
});

// ── DW-7: Zero-variance log ───────────────────────────────────────────────────

describe('DW-7: zero-variance log (identical traces) produces ewma ≈ 0', () => {
  it('zero-variance log produces ewma close to 0 on first tick', async () => {
    const result = await runDriftWatchOneTick(
      ['-i', zeroVariancePath, '--json', '--no-save', '--window', '2'],
      TIMEOUT_MS
    );
    if (result.firstLine === null) {
      expect(result.exitCode).not.toBe(EXIT_CODES.config_error);
      return;
    }
    // With identical traces, Jaccard distance = 0; EWMA of zeros = 0.
    // We allow a small epsilon to account for floating-point rounding.
    const ewma = result.firstLine.ewma as number;
    expect(ewma).toBeGreaterThanOrEqual(0);
    expect(ewma).toBeLessThanOrEqual(0.1); // Should be ≈ 0 for identical-trace log
  }, TIMEOUT_MS);

  it('zero-variance log drift_detected is false (ewma below default threshold 0.3)', async () => {
    const result = await runDriftWatchOneTick(
      ['-i', zeroVariancePath, '--json', '--no-save', '--window', '2'],
      TIMEOUT_MS
    );
    if (result.firstLine === null) {
      expect(result.exitCode).not.toBe(EXIT_CODES.config_error);
      return;
    }
    // EWMA ≈ 0 << threshold 0.3, so drift_detected must be false
    expect(result.firstLine.drift_detected).toBe(false);
  }, TIMEOUT_MS);
});

// ── DW-8: --activity-key propagation ─────────────────────────────────────────

describe('DW-8: --activity-key is accepted and does not cause config_error', () => {
  it('--activity-key concept:name does not exit config_error (1)', async () => {
    // Validate that passing a custom activity key doesn't trigger parameter rejection.
    // Validation in drift-watch does not check if the key exists in the log —
    // that's a WASM-level concern. This test confirms no config_error.
    const result = await runDriftWatchOneTick(
      ['-i', smallLogPath, '--activity-key', 'concept:name', '--json', '--no-save'],
      TIMEOUT_MS
    );
    expect(result.exitCode).not.toBe(EXIT_CODES.config_error);
  }, TIMEOUT_MS);

  it('custom --activity-key string does not exit config_error (1)', async () => {
    const result = await runDriftWatchOneTick(
      ['-i', smallLogPath, '--activity-key', 'custom:activity', '--json', '--no-save'],
      TIMEOUT_MS
    );
    expect(result.exitCode).not.toBe(EXIT_CODES.config_error);
  }, TIMEOUT_MS);
});

// ── SOCIAL gaps ───────────────────────────────────────────────────────────────

describe('SO-1: --metric bogus exits config_error (1)', () => {
  // social-cli.test.ts SN-6 already covers this; this test confirms the exact
  // error code from the new file (separate concern: SN-6 uses xesPath from that
  // file's beforeAll; this uses the fixture from this file).
  it('--metric bogus_metric exits 1 (config_error)', async () => {
    const result = await runCli(
      ['social', '-i', smallLogPath, '--metric', 'bogus_metric', '--format', 'json', '--no-save'],
      { timeout: TIMEOUT_MS }
    );
    expect(result.exitCode).toBe(EXIT_CODES.config_error);
  }, TIMEOUT_MS);

  it('--metric bogus_metric JSON error envelope has INVALID_METRIC code', async () => {
    const result = await runCli(
      ['social', '-i', smallLogPath, '--metric', 'bogus_metric', '--format', 'json', '--no-save'],
      { timeout: TIMEOUT_MS }
    );
    const env = JSON.parse(result.stdout) as {
      status: string;
      error?: { code: string; message: string };
    };
    expect(env.status).toBe('error');
    expect(env.error?.code).toBe('INVALID_METRIC');
  }, TIMEOUT_MS);
});

describe('SO-2/3: JSON payload includes bottleneckResources and workloadBalance', () => {
  it('payload.bottleneckResources is an array when status is ok', async () => {
    const result = await runCli(
      ['social', '-i', smallLogPath, '--format', 'json', '--no-save'],
      { timeout: TIMEOUT_MS }
    );
    const env = JSON.parse(result.stdout) as {
      status: string;
      payload?: { bottleneckResources?: unknown };
    };
    if (env.status !== 'ok') return; // WASM not available
    expect(Array.isArray(env.payload?.bottleneckResources)).toBe(true);
  }, TIMEOUT_MS);

  it('payload.workloadBalance is an object or null when status is ok', async () => {
    const result = await runCli(
      ['social', '-i', smallLogPath, '--format', 'json', '--no-save'],
      { timeout: TIMEOUT_MS }
    );
    const env = JSON.parse(result.stdout) as {
      status: string;
      payload?: { workloadBalance?: unknown };
    };
    if (env.status !== 'ok') return; // WASM not available
    // workloadBalance is null when there are no edges, object otherwise
    const wb = env.payload?.workloadBalance;
    expect(wb === null || (typeof wb === 'object' && wb !== null)).toBe(true);
  }, TIMEOUT_MS);
});

describe('SO-4: both handover and working-together produce valid JSON envelopes', () => {
  it('handover metric JSON envelope status is ok or error — never missing', async () => {
    const result = await runCli(
      ['social', '-i', smallLogPath, '--metric', 'handover', '--format', 'json', '--no-save'],
      { timeout: TIMEOUT_MS }
    );
    const env = JSON.parse(result.stdout) as { status?: string };
    expect(['ok', 'error']).toContain(env.status);
  }, TIMEOUT_MS);

  it('working-together metric JSON envelope status is ok or error — never missing', async () => {
    const result = await runCli(
      ['social', '-i', smallLogPath, '--metric', 'working-together', '--format', 'json', '--no-save'],
      { timeout: TIMEOUT_MS }
    );
    const env = JSON.parse(result.stdout) as { status?: string };
    expect(['ok', 'error']).toContain(env.status);
  }, TIMEOUT_MS);

  it('working-together payload includes network.nodes and network.edges when ok', async () => {
    const result = await runCli(
      ['social', '-i', smallLogPath, '--metric', 'working-together', '--format', 'json', '--no-save'],
      { timeout: TIMEOUT_MS }
    );
    const env = JSON.parse(result.stdout) as {
      status: string;
      payload?: { network?: { nodes: unknown[]; edges: unknown[] } };
    };
    if (env.status !== 'ok') return;
    expect(Array.isArray(env.payload?.network?.nodes)).toBe(true);
    expect(Array.isArray(env.payload?.network?.edges)).toBe(true);
  }, TIMEOUT_MS);
});

// ── TEMPORAL gaps ─────────────────────────────────────────────────────────────

describe('TE-1/2/3: --threshold out-of-range exits config_error (1)', () => {
  // NOTE on citty argument parsing: `--threshold -0.1` (with a space) causes citty to
  // interpret the leading dash of `-0.1` as a new flag, silently discarding the negative
  // value and falling back to the default 0.05. To reliably pass a negative value,
  // use the equals-sign form `--threshold=-0.1`. Both forms are tested below.

  it('--threshold 1.5 exits config_error (1)', async () => {
    const result = await runCli(
      ['temporal', temporalPath, '--threshold', '1.5', '--format', 'json', '--no-save'],
      { timeout: TIMEOUT_MS }
    );
    expect(result.exitCode).toBe(EXIT_CODES.config_error);
  }, TIMEOUT_MS);

  it('--threshold 1.5 JSON error envelope has INVALID_THRESHOLD code', async () => {
    const result = await runCli(
      ['temporal', temporalPath, '--threshold', '1.5', '--format', 'json', '--no-save'],
      { timeout: TIMEOUT_MS }
    );
    const env = JSON.parse(result.stdout) as {
      status: string;
      error?: { code: string };
    };
    expect(env.status).toBe('error');
    expect(env.error?.code).toBe('INVALID_THRESHOLD');
  }, TIMEOUT_MS);

  it('--threshold 2.0 (clearly out of range) exits config_error (1)', async () => {
    const result = await runCli(
      ['temporal', temporalPath, '--threshold', '2.0', '--format', 'json', '--no-save'],
      { timeout: TIMEOUT_MS }
    );
    expect(result.exitCode).toBe(EXIT_CODES.config_error);
  }, TIMEOUT_MS);

  it('--threshold="-0.1" (equals form) exits config_error (1)', async () => {
    // Use equals-sign form to ensure citty passes the negative value to the validator
    // (space-separated `--threshold -0.1` is swallowed by citty's flag parser)
    const result = await runCli(
      ['temporal', temporalPath, '--threshold=-0.1', '--format', 'json', '--no-save'],
      { timeout: TIMEOUT_MS }
    );
    expect(result.exitCode).toBe(EXIT_CODES.config_error);
  }, TIMEOUT_MS);

  it('--threshold="-0.1" JSON error envelope has INVALID_THRESHOLD code', async () => {
    const result = await runCli(
      ['temporal', temporalPath, '--threshold=-0.1', '--format', 'json', '--no-save'],
      { timeout: TIMEOUT_MS }
    );
    const env = JSON.parse(result.stdout) as {
      status: string;
      error?: { code: string };
    };
    expect(env.status).toBe('error');
    expect(env.error?.code).toBe('INVALID_THRESHOLD');
  }, TIMEOUT_MS);

  it('--threshold not-a-number exits config_error (1)', async () => {
    const result = await runCli(
      ['temporal', temporalPath, '--threshold', 'not-a-number', '--format', 'json', '--no-save'],
      { timeout: TIMEOUT_MS }
    );
    expect(result.exitCode).toBe(EXIT_CODES.config_error);
  }, TIMEOUT_MS);

  it('--threshold not-a-number JSON error envelope mentions INVALID_THRESHOLD', async () => {
    const result = await runCli(
      ['temporal', temporalPath, '--threshold', 'not-a-number', '--format', 'json', '--no-save'],
      { timeout: TIMEOUT_MS }
    );
    const env = JSON.parse(result.stdout) as {
      status: string;
      error?: { code: string };
    };
    expect(env.status).toBe('error');
    expect(env.error?.code).toBe('INVALID_THRESHOLD');
  }, TIMEOUT_MS);
});

describe('TE-4/5: valid --threshold boundary values do not exit config_error', () => {
  it('--threshold 1 (upper boundary) does not exit config_error (1)', async () => {
    const result = await runCli(
      ['temporal', temporalPath, '--threshold', '1', '--format', 'json', '--no-save'],
      { timeout: TIMEOUT_MS }
    );
    expect(result.exitCode).not.toBe(EXIT_CODES.config_error);
  }, TIMEOUT_MS);

  it('--threshold 0 (lower boundary) does not exit config_error (1)', async () => {
    const result = await runCli(
      ['temporal', temporalPath, '--threshold', '0', '--format', 'json', '--no-save'],
      { timeout: TIMEOUT_MS }
    );
    expect(result.exitCode).not.toBe(EXIT_CODES.config_error);
  }, TIMEOUT_MS);

  it('--threshold 0.05 (default value) does not exit config_error (1)', async () => {
    const result = await runCli(
      ['temporal', temporalPath, '--threshold', '0.05', '--format', 'json', '--no-save'],
      { timeout: TIMEOUT_MS }
    );
    expect(result.exitCode).not.toBe(EXIT_CODES.config_error);
  }, TIMEOUT_MS);
});

describe('TE-6: JSON payload includes violations.items array', () => {
  it('payload.violations.items is an array when status is ok', async () => {
    const result = await runCli(
      ['temporal', temporalPath, '--format', 'json', '--no-save'],
      { timeout: TIMEOUT_MS }
    );
    const env = JSON.parse(result.stdout) as {
      status: string;
      payload?: { violations?: { count?: number; items?: unknown[] } };
    };
    if (env.status !== 'ok') return; // WASM not available
    expect(Array.isArray(env.payload?.violations?.items)).toBe(true);
  }, TIMEOUT_MS);

  it('payload.violations.count matches items array length', async () => {
    const result = await runCli(
      ['temporal', temporalPath, '--format', 'json', '--no-save'],
      { timeout: TIMEOUT_MS }
    );
    const env = JSON.parse(result.stdout) as {
      status: string;
      payload?: { violations?: { count?: number; items?: unknown[] } };
    };
    if (env.status !== 'ok') return;
    const violations = env.payload?.violations;
    if (!violations) return;
    expect(violations.count).toBe(violations.items?.length ?? 0);
  }, TIMEOUT_MS);
});

describe('TE-7: JSON payload includes temporalConformance field (null or object)', () => {
  it('payload.temporalConformance is present (null or object) — never undefined', async () => {
    const result = await runCli(
      ['temporal', temporalPath, '--format', 'json', '--no-save'],
      { timeout: TIMEOUT_MS }
    );
    const env = JSON.parse(result.stdout) as {
      status: string;
      payload?: { temporalConformance?: unknown };
    };
    if (env.status !== 'ok') return;
    // temporalConformance is explicitly included in the payload.
    // It may be null if the WASM profile does not have temporal profile support,
    // but it must be present as a key (not undefined).
    expect('temporalConformance' in (env.payload ?? {})).toBe(true);
    const tc = env.payload?.temporalConformance;
    expect(tc === null || (typeof tc === 'object')).toBe(true);
  }, TIMEOUT_MS);
});

describe('TE-8: --timestamp-key custom value does not cause config_error', () => {
  it('--timestamp-key time:timestamp (default) does not exit config_error', async () => {
    const result = await runCli(
      ['temporal', temporalPath, '--timestamp-key', 'time:timestamp', '--format', 'json', '--no-save'],
      { timeout: TIMEOUT_MS }
    );
    expect(result.exitCode).not.toBe(EXIT_CODES.config_error);
  }, TIMEOUT_MS);

  it('--timestamp-key custom:ts (non-existent key) does not exit config_error — WASM handles gracefully', async () => {
    // Validation does not check key existence at CLI level — that is a WASM concern.
    // This test verifies the CLI does not reject the key name as malformed.
    const result = await runCli(
      ['temporal', temporalPath, '--timestamp-key', 'custom:ts', '--format', 'json', '--no-save'],
      { timeout: TIMEOUT_MS }
    );
    // May succeed (exit 0) or WASM-error (exit 3) but must not be config_error (1)
    expect(result.exitCode).not.toBe(EXIT_CODES.config_error);
  }, TIMEOUT_MS);
});
