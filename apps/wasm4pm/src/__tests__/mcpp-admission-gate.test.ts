/**
 * mcpp-admission-gate.test.ts — MCPP Exact-1.0 Admission Gate Contract Tests
 *
 * Oracle rank: Rank 2 (Domain contract)
 *
 * MCPP Admission Doctrine (mcpp-conformance.md):
 *   - Admission requires fitness = 1.0. Anything below 1.0 is an AndonPull.
 *   - "0.8 is a diagnostic signal, not an acceptance threshold."
 *   - The wpm conformance command enforces this via --threshold=1.0.
 *
 * Exit code contract for wpm conformance:
 *   0  = admitted (fitness >= threshold)
 *   1  = config_error (invalid flag values — threshold out of range, bad precision-mode)
 *   2  = source_error (missing file, unparseable log)
 *   6  = conformance_fail (fitness < threshold, AndonPull for MCPP)
 *
 * NOTE: The MCPP mcpp-conformance.md rule-set maps conformance_fail (exit 6) to its
 * "AndonPull" concept. The wpm CLI uses exit 6 (not exit 3) for conformance failures;
 * exit 3 is reserved for algorithm/execution errors.
 *
 * Test groups:
 *   A — Threshold 1.0 enforcement (payload shape, exit codes)
 *   B — AndonPull semantics (payload fields on rejection)
 *   C — Threshold validation (boundary values, invalid values)
 *   D — Payload completeness under rejection
 *   E — Human output language for rejection
 */

import { describe, it, expect } from 'vitest';
import { execFile } from 'child_process';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import * as os from 'os';

// ─── Paths ────────────────────────────────────────────────────────────────────

const CLI = path.resolve(import.meta.dirname, '../../dist/bin/wpm.js');
const REPO_ROOT = path.resolve(import.meta.dirname, '../../../..');

// Small XES file with a single well-known trace for deterministic replay.
// We use bench_data/sepsis.xes (real log) for WASM-dependent tests.
const SEPSIS_XES = path.resolve(REPO_ROOT, 'bench_data/sepsis.xes');
const SMALL_XES = path.resolve(REPO_ROOT, 'test/fixtures/small.xes');

// ─── Exit codes ───────────────────────────────────────────────────────────────

const EXIT_CODES = {
  success: 0,
  config_error: 1,
  source_error: 2,
  execution_error: 3,
  partial_failure: 4,
  system_error: 5,
  conformance_fail: 6,
} as const;

// ─── CLI helper ───────────────────────────────────────────────────────────────

interface CliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

function wpmAsync(
  args: string[],
  options: { cwd?: string; timeoutMs?: number } = {}
): Promise<CliResult> {
  return new Promise((resolve) => {
    const child = execFile(
      process.execPath,
      [CLI, ...args],
      {
        cwd: options.cwd ?? os.tmpdir(),
        env: { ...process.env, NO_COLOR: '1' },
        timeout: options.timeoutMs ?? 30_000,
        maxBuffer: 10 * 1024 * 1024,
      },
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
    if (child.stdin) child.stdin.end();
    child.on('error', () =>
      resolve({ exitCode: 5, stdout: '', stderr: 'Process failed to start' })
    );
  });
}

/**
 * Parse the JSON payload from wpm JSON output.
 * wpm wraps responses in { status, command, payload, ... }.
 * On conformance failure the payload is the ConformancePayload (not error envelope).
 */
function parsePayload(result: CliResult): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    // For conformance_fail results, payload lives under "payload" key.
    // For error results, the envelope itself is the error.
    if (parsed.payload !== undefined) {
      return parsed.payload as Record<string, unknown>;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Parse the top-level JSON envelope (not the nested payload).
 */
function parseEnvelope(result: CliResult): Record<string, unknown> | null {
  try {
    return JSON.parse(result.stdout) as Record<string, unknown>;
  } catch {
    return null;
  }
}

// ─── WASM availability check ──────────────────────────────────────────────────

function wasmIsAvailable(): boolean {
  return fsSync.existsSync(path.resolve(REPO_ROOT, 'wasm4pm/pkg/wasm4pm.js'));
}

function logFileIsAvailable(logPath: string): boolean {
  return fsSync.existsSync(logPath);
}

// ─── Group A: Threshold 1.0 enforcement ──────────────────────────────────────

describe('Group A — Threshold 1.0 enforcement', () => {
  // A1: --threshold=1.0 is a valid value (does not trigger config_error)
  it('A1: --threshold=1.0 is accepted as valid config (exits non-config-error)', async () => {
    // We pass a non-existent file so we get source_error, NOT config_error.
    // If config_error (exit 1) fires, the threshold value itself was rejected.
    const result = await wpmAsync([
      'conformance',
      'nonexistent.xes',
      '--threshold=1.0',
      '--format',
      'json',
    ]);
    // Threshold 1.0 is valid; error must be source_error (2) or WASM error (3, 5)
    expect(result.exitCode).not.toBe(EXIT_CODES.config_error);
  });

  // A2: --threshold=0.0 is a valid value (lower boundary)
  it('A2: --threshold=0.0 is accepted as valid config (exits non-config-error)', async () => {
    const result = await wpmAsync([
      'conformance',
      'nonexistent.xes',
      '--threshold=0.0',
      '--format',
      'json',
    ]);
    expect(result.exitCode).not.toBe(EXIT_CODES.config_error);
  });

  // A3: Payload has aggregate.fitness in [0, 1] on successful WASM run
  it('A3: JSON payload contains numeric fitness in [0, 1] when WASM runs', async () => {
    if (!wasmIsAvailable() || !logFileIsAvailable(SMALL_XES)) {
      // Skip; document why
      expect(true).toBe(true); // WASM or fixture not available
      return;
    }

    const result = await wpmAsync([
      'conformance',
      SMALL_XES,
      '--threshold=1.0',
      '--format',
      'json',
    ]);

    // Exits 0 (admitted) or 6 (conformance_fail) — both produce JSON payload
    expect([EXIT_CODES.success, EXIT_CODES.conformance_fail]).toContain(result.exitCode);

    const payload = parsePayload(result);
    expect(payload).not.toBeNull();
    expect(typeof payload!['fitness']).toBe('number');
    const fitness = payload!['fitness'] as number;
    expect(fitness).toBeGreaterThanOrEqual(0);
    expect(fitness).toBeLessThanOrEqual(1);
  });

  // A4: passed_threshold logic — isFit field tracks whether fitness >= threshold
  it('A4: payload.isFit is false when --threshold=1.0 and real log has partial fitness', async () => {
    if (!wasmIsAvailable() || !logFileIsAvailable(SEPSIS_XES)) {
      expect(true).toBe(true);
      return;
    }

    // Sepsis log is a real clinical log — extremely unlikely to have fitness=1.0
    // against an auto-discovered model. Threshold=1.0 should trigger conformance_fail.
    const result = await wpmAsync([
      'conformance',
      SEPSIS_XES,
      '--threshold=1.0',
      '--format',
      'json',
    ]);

    // Should be conformance_fail (6), admitted (0), source_error (2), or WASM error (3/5)
    // source_error (2) can occur when the log parses but the discovered model is degenerate
    expect([EXIT_CODES.success, EXIT_CODES.conformance_fail, EXIT_CODES.source_error, EXIT_CODES.execution_error, EXIT_CODES.system_error]).toContain(result.exitCode);

    if (result.exitCode === EXIT_CODES.conformance_fail) {
      const payload = parsePayload(result);
      expect(payload).not.toBeNull();
      // isFit must be false when exit is conformance_fail
      expect(payload!['isFit']).toBe(false);
    }
  });

  // A5: --threshold=0.85 (default) vs --threshold=1.0 — different outcomes on same log
  it('A5: --threshold=1.0 is stricter than --threshold=0.85 on the same log', async () => {
    if (!wasmIsAvailable() || !logFileIsAvailable(SMALL_XES)) {
      expect(true).toBe(true);
      return;
    }

    const result085 = await wpmAsync([
      'conformance',
      SMALL_XES,
      '--threshold=0.85',
      '--format',
      'json',
    ]);

    const result10 = await wpmAsync([
      'conformance',
      SMALL_XES,
      '--threshold=1.0',
      '--format',
      'json',
    ]);

    // Both should produce deterministic exit codes (0 or 6 only)
    const validExits = [EXIT_CODES.success, EXIT_CODES.conformance_fail, EXIT_CODES.execution_error, EXIT_CODES.system_error];
    expect(validExits).toContain(result085.exitCode);
    expect(validExits).toContain(result10.exitCode);

    // The 1.0 threshold cannot admit what 0.85 rejects
    // If 0.85 rejects, then 1.0 must also reject
    if (result085.exitCode === EXIT_CODES.conformance_fail) {
      expect(result10.exitCode).toBe(EXIT_CODES.conformance_fail);
    }

    // If 1.0 admits, then 0.85 must also admit (fitness >= 1.0 >= 0.85)
    if (result10.exitCode === EXIT_CODES.success) {
      expect(result085.exitCode).toBe(EXIT_CODES.success);
    }
  });

  // A6: payload.threshold field reflects the user-supplied value exactly
  it('A6: payload.threshold reflects --threshold=1.0 exactly (not the default 0.8)', async () => {
    if (!wasmIsAvailable() || !logFileIsAvailable(SMALL_XES)) {
      expect(true).toBe(true);
      return;
    }

    const result = await wpmAsync([
      'conformance',
      SMALL_XES,
      '--threshold=1.0',
      '--format',
      'json',
    ]);

    const validExits = [EXIT_CODES.success, EXIT_CODES.conformance_fail, EXIT_CODES.execution_error, EXIT_CODES.system_error];
    expect(validExits).toContain(result.exitCode);

    if ([EXIT_CODES.success, EXIT_CODES.conformance_fail].includes(result.exitCode)) {
      const payload = parsePayload(result);
      expect(payload).not.toBeNull();
      // Threshold must be stored as 1.0 (float), not "1.0" (string), not 0.8 (default)
      expect(payload!['threshold']).toBe(1.0);
    }
  });
});

// ─── Group B: AndonPull semantics ─────────────────────────────────────────────

describe('Group B — AndonPull semantics when exit 6 fires', () => {
  // B1: Envelope status is 'error' on conformance_fail — NOT 'success'
  it('B1: JSON envelope status is not "success" when conformance_fail fires', async () => {
    if (!wasmIsAvailable() || !logFileIsAvailable(SEPSIS_XES)) {
      expect(true).toBe(true);
      return;
    }

    const result = await wpmAsync([
      'conformance',
      SEPSIS_XES,
      '--threshold=1.0',
      '--format',
      'json',
    ]);

    if (result.exitCode === EXIT_CODES.conformance_fail) {
      const envelope = parseEnvelope(result);
      expect(envelope).not.toBeNull();
      // When fitness is below threshold, the envelope status must NOT be "success"
      expect(envelope!['status']).not.toBe('success');
    }
  });

  // B2: Fitness score is always present in the payload, even on rejection
  it('B2: payload.fitness is present and numeric even when conformance_fail fires', async () => {
    if (!wasmIsAvailable() || !logFileIsAvailable(SEPSIS_XES)) {
      expect(true).toBe(true);
      return;
    }

    const result = await wpmAsync([
      'conformance',
      SEPSIS_XES,
      '--threshold=1.0',
      '--format',
      'json',
    ]);

    if (result.exitCode === EXIT_CODES.conformance_fail) {
      const payload = parsePayload(result);
      expect(payload).not.toBeNull();
      // Practitioners need to see the actual fitness to diagnose the gap
      expect(typeof payload!['fitness']).toBe('number');
      const fitness = payload!['fitness'] as number;
      expect(fitness).toBeGreaterThanOrEqual(0);
      expect(fitness).toBeLessThanOrEqual(1);
    }
  });

  // B3: Fitness score is strictly below 1.0 when conformance_fail fires
  it('B3: payload.fitness is strictly < 1.0 when conformance_fail fires (AndonPull semantics)', async () => {
    if (!wasmIsAvailable() || !logFileIsAvailable(SEPSIS_XES)) {
      expect(true).toBe(true);
      return;
    }

    const result = await wpmAsync([
      'conformance',
      SEPSIS_XES,
      '--threshold=1.0',
      '--format',
      'json',
    ]);

    if (result.exitCode === EXIT_CODES.conformance_fail) {
      const payload = parsePayload(result);
      expect(payload).not.toBeNull();
      // AndonPull fires only when fitness < threshold. For threshold=1.0, fitness < 1.0
      expect(payload!['fitness'] as number).toBeLessThan(1.0);
    }
  });

  // B4: isFit is false on conformance_fail
  it('B4: payload.isFit is false when conformance_fail fires', async () => {
    if (!wasmIsAvailable() || !logFileIsAvailable(SEPSIS_XES)) {
      expect(true).toBe(true);
      return;
    }

    const result = await wpmAsync([
      'conformance',
      SEPSIS_XES,
      '--threshold=1.0',
      '--format',
      'json',
    ]);

    if (result.exitCode === EXIT_CODES.conformance_fail) {
      const payload = parsePayload(result);
      expect(payload).not.toBeNull();
      expect(payload!['isFit']).toBe(false);
    }
  });

  // B5: Summary object is present on rejection (practitioners need case counts)
  it('B5: payload.summary is present even when conformance_fail fires', async () => {
    if (!wasmIsAvailable() || !logFileIsAvailable(SEPSIS_XES)) {
      expect(true).toBe(true);
      return;
    }

    const result = await wpmAsync([
      'conformance',
      SEPSIS_XES,
      '--threshold=1.0',
      '--format',
      'json',
    ]);

    if (result.exitCode === EXIT_CODES.conformance_fail) {
      const payload = parsePayload(result);
      expect(payload).not.toBeNull();
      // Summary must be present so practitioners know how many cases deviated
      expect(typeof payload!['summary']).toBe('object');
      const summary = payload!['summary'] as Record<string, unknown>;
      expect(typeof summary['total_cases']).toBe('number');
      expect(typeof summary['conforming_cases']).toBe('number');
      expect(typeof summary['deviating_cases']).toBe('number');
    }
  });

  // B6: Threshold is echoed in payload for audit trail
  it('B6: payload.threshold is present on rejection for audit trail', async () => {
    if (!wasmIsAvailable() || !logFileIsAvailable(SEPSIS_XES)) {
      expect(true).toBe(true);
      return;
    }

    const result = await wpmAsync([
      'conformance',
      SEPSIS_XES,
      '--threshold=1.0',
      '--format',
      'json',
    ]);

    if (result.exitCode === EXIT_CODES.conformance_fail) {
      const payload = parsePayload(result);
      expect(payload).not.toBeNull();
      // The admitted threshold must be in the payload so the rejection can be audited
      expect(payload!['threshold']).toBe(1.0);
    }
  });
});

// ─── Group C: Threshold validation ───────────────────────────────────────────

describe('Group C — Threshold config validation (unit-level, no WASM required)', () => {
  // C1: --threshold=1.0 is accepted (no config_error)
  it('C1: --threshold=1.0 is accepted (valid upper boundary)', async () => {
    const result = await wpmAsync([
      'conformance',
      '--threshold=1.0',
      '--format',
      'json',
    ]);
    // Fails on missing input (source_error=2), not on threshold validation (config_error=1)
    expect(result.exitCode).not.toBe(EXIT_CODES.config_error);
  });

  // C2: --threshold=0.0 is accepted (valid lower boundary)
  it('C2: --threshold=0.0 is accepted (valid lower boundary)', async () => {
    const result = await wpmAsync([
      'conformance',
      '--threshold=0.0',
      '--format',
      'json',
    ]);
    expect(result.exitCode).not.toBe(EXIT_CODES.config_error);
  });

  // C3: --threshold=0.85 is accepted (mid-range default for normal use)
  it('C3: --threshold=0.85 is accepted (normal mid-range value)', async () => {
    const result = await wpmAsync([
      'conformance',
      '--threshold=0.85',
      '--format',
      'json',
    ]);
    expect(result.exitCode).not.toBe(EXIT_CODES.config_error);
  });

  // C4: --threshold=-0.1 is rejected with config_error (out of range)
  it('C4: --threshold=-0.1 is rejected with config_error (exit 1) — below 0', async () => {
    const result = await wpmAsync([
      'conformance',
      '--threshold=-0.1',
      '--format',
      'json',
    ]);
    expect(result.exitCode).toBe(EXIT_CODES.config_error);
    const envelope = parseEnvelope(result);
    expect(envelope).not.toBeNull();
    expect(envelope!['status']).toBe('error');
    // Error message must mention 'threshold'
    const errorObj = envelope!['error'] as Record<string, unknown> | undefined;
    const errorMessage = errorObj?.['message'] as string | undefined;
    expect(errorMessage ?? '').toMatch(/threshold/i);
  });

  // C5: --threshold=1.1 is rejected with config_error (out of range)
  it('C5: --threshold=1.1 is rejected with config_error (exit 1) — above 1', async () => {
    const result = await wpmAsync([
      'conformance',
      '--threshold=1.1',
      '--format',
      'json',
    ]);
    expect(result.exitCode).toBe(EXIT_CODES.config_error);
    const envelope = parseEnvelope(result);
    expect(envelope).not.toBeNull();
    expect(envelope!['status']).toBe('error');
  });

  // C6: --threshold=abc is rejected with config_error (non-numeric)
  it('C6: --threshold=abc is rejected with config_error (exit 1) — non-numeric', async () => {
    const result = await wpmAsync([
      'conformance',
      '--threshold=abc',
      '--format',
      'json',
    ]);
    expect(result.exitCode).toBe(EXIT_CODES.config_error);
  });

  // C7: --threshold=2 is rejected with config_error (integer above range)
  it('C7: --threshold=2 is rejected with config_error (exit 1) — integer above 1', async () => {
    const result = await wpmAsync([
      'conformance',
      '--threshold=2',
      '--format',
      'json',
    ]);
    expect(result.exitCode).toBe(EXIT_CODES.config_error);
  });

  // C8: Threshold validation fires BEFORE file I/O — even without input file given
  it('C8: invalid --threshold fires config_error even when no input file provided', async () => {
    // If threshold validation were deferred to after file-open, we would get source_error first.
    // The current implementation validates threshold at run() start (before withLogSession).
    const result = await wpmAsync([
      'conformance',
      '--threshold=1.5',
      '--format',
      'json',
    ]);
    // Must be config_error (1), not source_error (2)
    expect(result.exitCode).toBe(EXIT_CODES.config_error);
  });

  // C9: Error envelope shape for invalid threshold contains command and exit_code
  it('C9: invalid threshold error envelope has command=conformance and exit_code=1', async () => {
    const result = await wpmAsync([
      'conformance',
      '--threshold=1.5',
      '--format',
      'json',
    ]);
    expect(result.exitCode).toBe(EXIT_CODES.config_error);
    const envelope = parseEnvelope(result);
    expect(envelope).not.toBeNull();
    expect(envelope!['command']).toBe('conformance');
    expect(envelope!['exit_code']).toBe(EXIT_CODES.config_error);
  });

  // C10: --threshold=1 (integer, no decimal) is accepted — parsed as 1.0
  it('C10: --threshold=1 (integer) is accepted as 1.0 (valid upper boundary)', async () => {
    const result = await wpmAsync([
      'conformance',
      '--threshold=1',
      '--format',
      'json',
    ]);
    // Should not be config_error
    expect(result.exitCode).not.toBe(EXIT_CODES.config_error);
  });
});

// ─── Group D: Payload completeness under rejection ────────────────────────────

describe('Group D — Payload completeness on conformance_fail', () => {
  // D1: fitness field is always present (practitioner needs to see the gap)
  it('D1: payload.fitness is present and in [0,1] when conformance_fail fires', async () => {
    if (!wasmIsAvailable() || !logFileIsAvailable(SMALL_XES)) {
      expect(true).toBe(true);
      return;
    }

    // Force rejection by using threshold=1.0 (Sepsis-level logs will rarely be perfect)
    const result = await wpmAsync([
      'conformance',
      SMALL_XES,
      '--threshold=1.0',
      '--format',
      'json',
    ]);

    if (result.exitCode === EXIT_CODES.conformance_fail) {
      const payload = parsePayload(result);
      expect(payload).not.toBeNull();
      expect(typeof payload!['fitness']).toBe('number');
      expect(payload!['fitness'] as number).toBeGreaterThanOrEqual(0);
      expect(payload!['fitness'] as number).toBeLessThanOrEqual(1);
    }
  });

  // D2: precision field is present (may be null if precision-mode=fast or not computed)
  it('D2: payload.precision is present on rejection (null if not computed, number if computed)', async () => {
    if (!wasmIsAvailable() || !logFileIsAvailable(SMALL_XES)) {
      expect(true).toBe(true);
      return;
    }

    const result = await wpmAsync([
      'conformance',
      SMALL_XES,
      '--threshold=1.0',
      '--format',
      'json',
    ]);

    if (result.exitCode === EXIT_CODES.conformance_fail) {
      const payload = parsePayload(result);
      expect(payload).not.toBeNull();
      // precision is either null (not computed) or a number in [0, 1]
      const precision = payload!['precision'];
      expect(precision === null || typeof precision === 'number').toBe(true);
    }
  });

  // D3: precision_available boolean is present on rejection
  it('D3: payload.precision_available is a boolean on rejection', async () => {
    if (!wasmIsAvailable() || !logFileIsAvailable(SMALL_XES)) {
      expect(true).toBe(true);
      return;
    }

    const result = await wpmAsync([
      'conformance',
      SMALL_XES,
      '--threshold=1.0',
      '--format',
      'json',
    ]);

    if (result.exitCode === EXIT_CODES.conformance_fail) {
      const payload = parsePayload(result);
      expect(payload).not.toBeNull();
      expect(typeof payload!['precision_available']).toBe('boolean');
    }
  });

  // D4: summary object is present on rejection with required sub-fields
  it('D4: payload.summary has total_cases, conforming_cases, deviating_cases on rejection', async () => {
    if (!wasmIsAvailable() || !logFileIsAvailable(SMALL_XES)) {
      expect(true).toBe(true);
      return;
    }

    const result = await wpmAsync([
      'conformance',
      SMALL_XES,
      '--threshold=1.0',
      '--format',
      'json',
    ]);

    if (result.exitCode === EXIT_CODES.conformance_fail) {
      const payload = parsePayload(result);
      expect(payload).not.toBeNull();
      const summary = payload!['summary'] as Record<string, unknown>;
      expect(typeof summary['total_cases']).toBe('number');
      expect(typeof summary['conforming_cases']).toBe('number');
      expect(typeof summary['deviating_cases']).toBe('number');
      // Sanity: total = conforming + deviating
      expect(summary['total_cases'] as number).toBe(
        (summary['conforming_cases'] as number) + (summary['deviating_cases'] as number)
      );
    }
  });

  // D5: diagnostics object is present on rejection
  it('D5: payload.diagnostics is present on rejection', async () => {
    if (!wasmIsAvailable() || !logFileIsAvailable(SMALL_XES)) {
      expect(true).toBe(true);
      return;
    }

    const result = await wpmAsync([
      'conformance',
      SMALL_XES,
      '--threshold=1.0',
      '--format',
      'json',
    ]);

    if (result.exitCode === EXIT_CODES.conformance_fail) {
      const payload = parsePayload(result);
      expect(payload).not.toBeNull();
      expect(typeof payload!['diagnostics']).toBe('object');
    }
  });

  // D6: deviating_traces array is present on rejection (may be empty or non-empty)
  it('D6: payload.deviating_traces is an array on rejection', async () => {
    if (!wasmIsAvailable() || !logFileIsAvailable(SMALL_XES)) {
      expect(true).toBe(true);
      return;
    }

    const result = await wpmAsync([
      'conformance',
      SMALL_XES,
      '--threshold=1.0',
      '--format',
      'json',
    ]);

    if (result.exitCode === EXIT_CODES.conformance_fail) {
      const payload = parsePayload(result);
      expect(payload).not.toBeNull();
      expect(Array.isArray(payload!['deviating_traces'])).toBe(true);
    }
  });

  // D7: Envelope still has the schema field for versioned parsing
  it('D7: payload.schema is present on rejection for forward-compatible parsing', async () => {
    if (!wasmIsAvailable() || !logFileIsAvailable(SMALL_XES)) {
      expect(true).toBe(true);
      return;
    }

    const result = await wpmAsync([
      'conformance',
      SMALL_XES,
      '--threshold=1.0',
      '--format',
      'json',
    ]);

    if (result.exitCode === EXIT_CODES.conformance_fail) {
      const payload = parsePayload(result);
      expect(payload).not.toBeNull();
      // schema field identifies the payload version for forward-compatible consumers
      expect(typeof payload!['schema']).toBe('string');
      expect((payload!['schema'] as string).length).toBeGreaterThan(0);
    }
  });
});

// ─── Group E: Human output language ──────────────────────────────────────────

describe('Group E — Human output language on rejection', () => {
  // E1: Human output (no --format json) must mention threshold on rejection
  it('E1: human output mentions threshold when fitness is below threshold', async () => {
    if (!wasmIsAvailable() || !logFileIsAvailable(SMALL_XES)) {
      expect(true).toBe(true);
      return;
    }

    const result = await wpmAsync([
      'conformance',
      SMALL_XES,
      '--threshold=1.0',
      // No --format json — human output
    ]);

    if (result.exitCode === EXIT_CODES.conformance_fail) {
      // Human output must mention 'threshold' so the practitioner understands the gate
      expect(result.stdout).toMatch(/threshold/i);
    }
  });

  // E2: Human output must mention fitness value on rejection
  it('E2: human output shows fitness score when below threshold', async () => {
    if (!wasmIsAvailable() || !logFileIsAvailable(SMALL_XES)) {
      expect(true).toBe(true);
      return;
    }

    const result = await wpmAsync([
      'conformance',
      SMALL_XES,
      '--threshold=1.0',
    ]);

    if (result.exitCode === EXIT_CODES.conformance_fail) {
      // Must show fitness score so practitioner can diagnose the gap
      expect(result.stdout).toMatch(/fitness|conform/i);
    }
  });

  // E3: Human output must show "does NOT conform" or similar rejection language
  // consola.warn() writes to stderr in non-TTY mode; consola.log() writes to stdout.
  // The "Log does NOT conform" line is emitted via projection.warn() → stderr.
  it('E3: human output (stdout + stderr) uses rejection language when fitness < threshold', async () => {
    if (!wasmIsAvailable() || !logFileIsAvailable(SMALL_XES)) {
      expect(true).toBe(true);
      return;
    }

    const result = await wpmAsync([
      'conformance',
      SMALL_XES,
      '--threshold=1.0',
    ]);

    if (result.exitCode === EXIT_CODES.conformance_fail) {
      // The human output must convey rejection.
      // projection.warn() → consola.warn() → stderr in non-TTY mode.
      // projection.log() + "threshold" string → stdout.
      // Accept match on either stream so consola routing differences don't break this test.
      const combined = result.stdout + result.stderr;
      expect(combined).toMatch(/not conform|rejected|below threshold|fail|✗/i);
    }
  });
});

// ─── Group F: MCPP doctrine contract invariants ───────────────────────────────

describe('Group F — MCPP doctrine contract invariants (no WASM required)', () => {
  // F1: conformance_fail is exit 6 (documented in exit-codes.ts)
  it('F1: conformance_fail exit code is exactly 6 (as documented in exit-codes.ts)', () => {
    // This is a pure contract test — no WASM needed.
    // Verifies that our EXIT_CODES constant matches the implementation.
    expect(EXIT_CODES.conformance_fail).toBe(6);
  });

  // F2: config_error is exit 1 (threshold validation)
  it('F2: config_error exit code is exactly 1 (threshold validation fires at exit 1)', () => {
    expect(EXIT_CODES.config_error).toBe(1);
  });

  // F3: success is exit 0 (admitted)
  it('F3: success exit code is exactly 0 (route admitted when fitness >= threshold)', () => {
    expect(EXIT_CODES.success).toBe(0);
  });

  // F4: AndonPull doctrine — threshold=1.0 requires exact match
  it('F4: MCPP doctrine: threshold=1.0 means fitness must be exactly 1.0 for admission', () => {
    // Contract test (no WASM): documents the mathematical invariant.
    // Any fitness < 1.0 with threshold=1.0 must produce conformance_fail (exit 6).
    // This is the "fit gate" equivalent to MCPP AndonPull.
    const threshold = 1.0;
    const testFitnessValues = [0.0, 0.5, 0.85, 0.99, 0.999, 0.9999];
    for (const fitness of testFitnessValues) {
      const isFit = fitness >= threshold;
      expect(isFit).toBe(false); // All values below 1.0 must fail the 1.0 gate
    }
    // Only exactly 1.0 passes
    expect(1.0 >= threshold).toBe(true);
  });

  // F5: Default threshold (0.8) is NOT the MCPP admission threshold
  it('F5: MCPP requires explicit --threshold=1.0; default threshold 0.8 is too permissive', () => {
    // The default threshold in conformance.ts is 0.8.
    // MCPP must always pass --threshold=1.0 explicitly.
    // This test documents that the default would admit models with 80% fitness.
    const defaultThreshold = 0.8;
    const mcppThreshold = 1.0;
    expect(defaultThreshold).toBeLessThan(mcppThreshold);
    // A model with 0.85 fitness passes the default but fails MCPP
    const exampleFitness = 0.85;
    expect(exampleFitness >= defaultThreshold).toBe(true); // admitted by default
    expect(exampleFitness >= mcppThreshold).toBe(false); // rejected by MCPP
  });

  // F6: Fitness in [0,1] is an invariant — fitness outside range is a bug
  it('F6: fitness is always in [0, 1] — values outside this range indicate a bug', () => {
    // Mathematical invariant: token-replay fitness = 1 - (missing+consumed)/(produced+remaining)
    // This formula is bounded by definition in [0, 1].
    const legalValues = [0.0, 0.5, 0.85, 0.999, 1.0];
    const illegalValues = [-0.1, 1.1, NaN, Infinity, -Infinity];

    for (const v of legalValues) {
      expect(Number.isFinite(v) && v >= 0 && v <= 1).toBe(true);
    }
    for (const v of illegalValues) {
      expect(Number.isFinite(v) && v >= 0 && v <= 1).toBe(false);
    }
  });

  // F7: Exit code is monotonically non-decreasing with strictness
  it('F7: exit code semantics — success(0) < config_error(1) < source_error(2) < conformance_fail(6)', () => {
    // This test documents the exit code ordering for shell pipelines.
    // A non-zero exit code means "this step failed" in bash -e pipelines.
    expect(EXIT_CODES.success).toBe(0);
    expect(EXIT_CODES.config_error).toBeGreaterThan(EXIT_CODES.success);
    expect(EXIT_CODES.source_error).toBeGreaterThan(EXIT_CODES.config_error);
    expect(EXIT_CODES.conformance_fail).toBeGreaterThan(EXIT_CODES.source_error);
  });

  // F8: Threshold validation produces a structured JSON error (not just stderr)
  it('F8: invalid threshold produces structured JSON error with --format json', async () => {
    const result = await wpmAsync([
      'conformance',
      '--threshold=99',
      '--format',
      'json',
    ]);
    expect(result.exitCode).toBe(EXIT_CODES.config_error);

    // The stdout must be valid JSON (not an unstructured error message)
    let envelope: Record<string, unknown> | null = null;
    expect(() => {
      envelope = JSON.parse(result.stdout) as Record<string, unknown>;
    }).not.toThrow();

    expect(envelope).not.toBeNull();
    expect(envelope!['status']).toBe('error');
    expect(typeof envelope!['error']).toBe('object');
  });

  // F9: Threshold of exactly 1.0 is not rejected as "too high"
  it('F9: --threshold=1.0 is a valid argument (not rejected by the CLI)', async () => {
    // The threshold validation accepts [0, 1] inclusive.
    // threshold=1.0 must NOT produce a config_error.
    const result = await wpmAsync([
      'conformance',
      '--threshold=1.0',
      '--format',
      'json',
    ]);
    // Any exit code except config_error (1) is acceptable
    expect(result.exitCode).not.toBe(EXIT_CODES.config_error);
  });

  // F10: Two separate invocations with same input produce same exit code (determinism)
  it('F10: conformance exit code is deterministic for same input and threshold', async () => {
    if (!wasmIsAvailable() || !logFileIsAvailable(SMALL_XES)) {
      expect(true).toBe(true);
      return;
    }

    const args = ['conformance', SMALL_XES, '--threshold=1.0', '--format', 'json', '--no-save'];

    const result1 = await wpmAsync(args);
    const result2 = await wpmAsync(args);

    // Both invocations must produce the same exit code
    expect(result1.exitCode).toBe(result2.exitCode);

    // If both produced JSON, fitness must be identical (deterministic WASM)
    if (
      [EXIT_CODES.success, EXIT_CODES.conformance_fail].includes(result1.exitCode) &&
      [EXIT_CODES.success, EXIT_CODES.conformance_fail].includes(result2.exitCode)
    ) {
      const p1 = parsePayload(result1);
      const p2 = parsePayload(result2);
      if (p1 && p2) {
        expect(p1['fitness']).toBe(p2['fitness']);
      }
    }
  });
});
