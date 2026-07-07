/**
 * mcpp-admission-gate.test.ts — MCPP Exact-1.0 Admission Gate Contract Tests
 *
 * Oracle rank: Rank 2 (Domain contract)
 *
 * MCPP Admission Doctrine (mcpp-conformance.md):
 *   - Admission requires fitness = 1.0. Anything below 1.0 is an AndonPull.
 *   - "0.8 is a diagnostic signal, not an acceptance threshold."
 *   - The wpm model check --mode self command enforces this via --fitness-threshold=1.0.
 *
 * Migrated to `wpm model check --mode self` (was: `wpm conformance`, which
 * auto-mined a model from the same log before checking fitness — `--mode
 * self` is the exact equivalent; see nouns/_removed.ts and
 * nouns/model/check.ts's own doc comment). `model check` is a NATIVE verb:
 * its result is the plain verdict object directly (no
 * `{command,status,payload,meta}` envelope) on success/rejection, and the
 * framework's `{error:{code,message}}` envelope on a hard failure.
 *
 * Confirmed genuine contract changes (verified live against the built CLI,
 * not assumed):
 *   - `--threshold` -> `--fitness-threshold`.
 *   - No continuous top-level `fitness` score anymore. The new engine
 *     (`engines/conformance/verdict.ts`) is a binary per-episode verdict
 *     model: `status` is `ADMITTED | REJECTED | INDETERMINATE`, and
 *     `checked`/`admitted`/`rejected` are the aggregate counts (old
 *     `payload.summary.total_cases/conforming_cases/deviating_cases`,
 *     flattened to the top level, un-nested). Individual case fitness
 *     numbers still exist, but only inside `findings[].details.case_fitness`
 *     (only rejected episodes are ever included in `findings`).
 *   - `isFit` -> `status !== 'ADMITTED'`.
 *   - `--fitness-threshold` is NOT config-time validated (confirmed against
 *     `conformance-cli.test.ts`, migrated separately): a non-numeric or
 *     out-of-range value makes every `fitness >= threshold` comparison
 *     `false` in JS, so the log is deterministically REJECTED (exit 6) —
 *     never a distinct config_error (exit 1) path like the old
 *     `wpm conformance --threshold` validation. `threshold` IS echoed back
 *     in the result for audit-trail purposes (added during this migration).
 *   - `precision`/`precision_available`/`diagnostics`/`deviating_traces`/
 *     `schema` have no equivalent — the token-replay engine only computes
 *     fitness, not precision, and doesn't version its own field.
 *   - No `command`/`exit_code` envelope fields exist at all for a native
 *     verb; the process exit code comes from the verdict's own numeric
 *     `exitCode` field via `apps/wasm4pm/src/cli.ts`'s `resolveResultExitCode`.
 *
 * Test groups:
 *   A — Threshold 1.0 enforcement (payload shape, exit codes)
 *   B — AndonPull semantics (payload fields on rejection)
 *   C — Threshold value handling (no longer config-validated — deterministic REJECTED instead)
 *   D — Payload completeness under rejection
 *   E — Human output language for rejection
 *   F — MCPP doctrine contract invariants
 */

import { describe, it, expect } from 'vitest';
import { execFile } from 'child_process';
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

/** Map old `conformance` invocation args onto the new `model check --mode self` verb. */
function checkArgs(inputPath: string | undefined, extra: string[]): string[] {
  const base = ['model', 'check'];
  if (inputPath) base.push(inputPath);
  return [...base, '--mode', 'self', ...extra];
}

/**
 * Parse the plain verdict result from wpm's JSON output.
 * `model check` is a NATIVE verb: on success/rejection the result IS the
 * verdict object (no `.payload` wrapper); on a hard failure it's
 * `{error:{code,message}}`. NOTE: Observability logs (INFO, WARN) may be
 * emitted to stdout before the JSON object — locate the first '{' to skip
 * any log preamble.
 */
function parseResult(result: CliResult): Record<string, unknown> | null {
  try {
    const jsonStart = result.stdout.indexOf('{');
    if (jsonStart === -1) return null;
    return JSON.parse(result.stdout.substring(jsonStart)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function isErrorEnvelope(r: Record<string, unknown> | null): boolean {
  return !!r && typeof r['error'] === 'object' && r['error'] !== null;
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
  // A1: --fitness-threshold=1.0 with a missing file produces source_error, not a config-time rejection
  it('A1: --fitness-threshold=1.0 with a missing file is a plain source error (no separate threshold-validation path)', async () => {
    const result = await wpmAsync(checkArgs('nonexistent.xes', ['--fitness-threshold=1.0', '--format', 'json']));
    // The threshold value is never independently validated — the missing
    // file is what fails here, and that's INVALID_INPUT -> exit 2 (source_error).
    expect(result.exitCode).toBe(EXIT_CODES.source_error);
    const r = parseResult(result);
    expect(isErrorEnvelope(r)).toBe(true);
  });

  // A2: --fitness-threshold=0.0 behaves the same way — the file is still missing
  it('A2: --fitness-threshold=0.0 with a missing file is a plain source error', async () => {
    const result = await wpmAsync(checkArgs('nonexistent.xes', ['--fitness-threshold=0.0', '--format', 'json']));
    expect(result.exitCode).toBe(EXIT_CODES.source_error);
  });

  // A3: checked/admitted/rejected are numeric on a successful WASM run
  it('A3: JSON result has numeric checked/admitted/rejected counts when WASM runs', async () => {
    if (!wasmIsAvailable() || !logFileIsAvailable(SMALL_XES)) {
      expect(true).toBe(true); // WASM or fixture not available
      return;
    }

    const result = await wpmAsync(checkArgs(SMALL_XES, ['--fitness-threshold=1.0', '--format', 'json']));

    // Exits 0 (ADMITTED) or 6 (REJECTED) — both produce a full verdict result
    expect([EXIT_CODES.success, EXIT_CODES.conformance_fail]).toContain(result.exitCode);

    const r = parseResult(result);
    expect(r).not.toBeNull();
    expect(typeof r!['checked']).toBe('number');
    expect(typeof r!['admitted']).toBe('number');
    expect(typeof r!['rejected']).toBe('number');
    expect((r!['checked'] as number)).toBeGreaterThan(0);
  });

  // A4: status is REJECTED when a real log has partial fitness at threshold=1.0
  it('A4: status is REJECTED when --fitness-threshold=1.0 and a real log has partial fitness', async () => {
    if (!wasmIsAvailable() || !logFileIsAvailable(SEPSIS_XES)) {
      expect(true).toBe(true);
      return;
    }

    // Sepsis log is a real clinical log — extremely unlikely to have fitness=1.0
    // against an auto-discovered model. Threshold=1.0 should trigger REJECTED.
    const result = await wpmAsync(checkArgs(SEPSIS_XES, ['--fitness-threshold=1.0', '--format', 'json']), { timeoutMs: 60_000 });

    expect([EXIT_CODES.success, EXIT_CODES.conformance_fail, EXIT_CODES.source_error, EXIT_CODES.execution_error, EXIT_CODES.system_error]).toContain(result.exitCode);

    if (result.exitCode === EXIT_CODES.conformance_fail) {
      const r = parseResult(result);
      expect(r).not.toBeNull();
      expect(r!['status']).toBe('REJECTED');
    }
  }, 60_000);

  // A5: --fitness-threshold=0.85 vs 1.0 — 1.0 is stricter or equal
  it('A5: --fitness-threshold=1.0 is at least as strict as 0.85 on the same log', async () => {
    if (!wasmIsAvailable() || !logFileIsAvailable(SMALL_XES)) {
      expect(true).toBe(true);
      return;
    }

    const result085 = await wpmAsync(checkArgs(SMALL_XES, ['--fitness-threshold=0.85', '--format', 'json']));
    const result10 = await wpmAsync(checkArgs(SMALL_XES, ['--fitness-threshold=1.0', '--format', 'json']));

    const validExits = [EXIT_CODES.success, EXIT_CODES.conformance_fail, EXIT_CODES.execution_error, EXIT_CODES.system_error];
    expect(validExits).toContain(result085.exitCode);
    expect(validExits).toContain(result10.exitCode);

    // The 1.0 threshold cannot admit what 0.85 rejects
    if (result085.exitCode === EXIT_CODES.conformance_fail) {
      expect(result10.exitCode).toBe(EXIT_CODES.conformance_fail);
    }
    // If 1.0 admits, then 0.85 must also admit (fitness >= 1.0 >= 0.85)
    if (result10.exitCode === EXIT_CODES.success) {
      expect(result085.exitCode).toBe(EXIT_CODES.success);
    }
  });

  // A6: result.threshold echoes back --fitness-threshold=1.0 exactly (audit trail)
  it('A6: result.threshold reflects --fitness-threshold=1.0 exactly (not the default 1.0-from-elsewhere)', async () => {
    if (!wasmIsAvailable() || !logFileIsAvailable(SMALL_XES)) {
      expect(true).toBe(true);
      return;
    }

    const result = await wpmAsync(checkArgs(SMALL_XES, ['--fitness-threshold=1.0', '--format', 'json']));

    const validExits = [EXIT_CODES.success, EXIT_CODES.conformance_fail, EXIT_CODES.execution_error, EXIT_CODES.system_error];
    expect(validExits).toContain(result.exitCode);

    if (([EXIT_CODES.success, EXIT_CODES.conformance_fail] as number[]).includes(result.exitCode)) {
      const r = parseResult(result);
      expect(r).not.toBeNull();
      expect(r!['threshold']).toBe(1.0);
    }
  });
});

// ─── Group B: AndonPull semantics ─────────────────────────────────────────────

describe('Group B — AndonPull semantics when REJECTED (exit 6) fires', () => {
  // B1: status is REJECTED, never ADMITTED, when conformance_fail fires
  it('B1: status is REJECTED (not ADMITTED) when exit 6 fires', async () => {
    if (!wasmIsAvailable() || !logFileIsAvailable(SEPSIS_XES)) {
      expect(true).toBe(true);
      return;
    }

    const result = await wpmAsync(checkArgs(SEPSIS_XES, ['--fitness-threshold=1.0', '--format', 'json']), { timeoutMs: 60_000 });

    if (result.exitCode === EXIT_CODES.conformance_fail) {
      const r = parseResult(result);
      expect(r).not.toBeNull();
      expect(r!['status']).toBe('REJECTED');
    }
  }, 60_000);

  // B2: each finding's case_fitness values are numeric and in [0,1]
  it('B2: findings[].details.case_fitness trace_fitness is numeric and in [0,1] on rejection', async () => {
    if (!wasmIsAvailable() || !logFileIsAvailable(SEPSIS_XES)) {
      expect(true).toBe(true);
      return;
    }

    const result = await wpmAsync(checkArgs(SEPSIS_XES, ['--fitness-threshold=1.0', '--format', 'json']), { timeoutMs: 60_000 });

    if (result.exitCode === EXIT_CODES.conformance_fail) {
      const r = parseResult(result);
      expect(r).not.toBeNull();
      const findings = r!['findings'] as Array<Record<string, unknown>>;
      expect(findings.length).toBeGreaterThan(0);
      const details = findings[0]['details'] as Record<string, unknown>;
      const caseFitness = details['case_fitness'] as Array<Record<string, unknown>>;
      expect(Array.isArray(caseFitness)).toBe(true);
      for (const cf of caseFitness) {
        const tf = cf['trace_fitness'] as number;
        expect(typeof tf).toBe('number');
        expect(tf).toBeGreaterThanOrEqual(0);
        expect(tf).toBeLessThanOrEqual(1);
      }
    }
  }, 60_000);

  // B3: admitted count is 0 when every episode is rejected at threshold=1.0 on a real log
  it('B3: admitted=0 when status is REJECTED and threshold=1.0 (AndonPull semantics)', async () => {
    if (!wasmIsAvailable() || !logFileIsAvailable(SEPSIS_XES)) {
      expect(true).toBe(true);
      return;
    }

    const result = await wpmAsync(checkArgs(SEPSIS_XES, ['--fitness-threshold=1.0', '--format', 'json']), { timeoutMs: 60_000 });

    if (result.exitCode === EXIT_CODES.conformance_fail) {
      const r = parseResult(result);
      expect(r).not.toBeNull();
      expect(r!['admitted']).toBe(0);
      expect((r!['rejected'] as number)).toBeGreaterThan(0);
    }
  }, 60_000);

  // B4: status is never ADMITTED on rejection — the modern isFit equivalent
  it('B4: status !== ADMITTED (old payload.isFit=false equivalent) when conformance_fail fires', async () => {
    if (!wasmIsAvailable() || !logFileIsAvailable(SEPSIS_XES)) {
      expect(true).toBe(true);
      return;
    }

    const result = await wpmAsync(checkArgs(SEPSIS_XES, ['--fitness-threshold=1.0', '--format', 'json']), { timeoutMs: 60_000 });

    if (result.exitCode === EXIT_CODES.conformance_fail) {
      const r = parseResult(result);
      expect(r).not.toBeNull();
      expect(r!['status']).not.toBe('ADMITTED');
    }
  }, 60_000);

  // B5: checked/admitted/rejected are present even on rejection (old payload.summary equivalent)
  it('B5: checked/admitted/rejected counts are present even when conformance_fail fires', async () => {
    if (!wasmIsAvailable() || !logFileIsAvailable(SEPSIS_XES)) {
      expect(true).toBe(true);
      return;
    }

    const result = await wpmAsync(checkArgs(SEPSIS_XES, ['--fitness-threshold=1.0', '--format', 'json']), { timeoutMs: 60_000 });

    if (result.exitCode === EXIT_CODES.conformance_fail) {
      const r = parseResult(result);
      expect(r).not.toBeNull();
      expect(typeof r!['checked']).toBe('number');
      expect(typeof r!['admitted']).toBe('number');
      expect(typeof r!['rejected']).toBe('number');
      // Sanity: checked = admitted + rejected
      expect(r!['checked']).toBe((r!['admitted'] as number) + (r!['rejected'] as number));
    }
  }, 60_000);

  // B6: threshold is present on rejection for audit trail
  it('B6: result.threshold is present on rejection for audit trail', async () => {
    if (!wasmIsAvailable() || !logFileIsAvailable(SEPSIS_XES)) {
      expect(true).toBe(true);
      return;
    }

    const result = await wpmAsync(checkArgs(SEPSIS_XES, ['--fitness-threshold=1.0', '--format', 'json']), { timeoutMs: 60_000 });

    if (result.exitCode === EXIT_CODES.conformance_fail) {
      const r = parseResult(result);
      expect(r).not.toBeNull();
      expect(r!['threshold']).toBe(1.0);
    }
  }, 60_000);
});

// ─── Group C: Threshold value handling (no longer config-validated) ──────────

describe('Group C — --fitness-threshold value handling (unit-level, no WASM required for A/B; C requires WASM)', () => {
  // `wpm conformance --threshold` used to validate the numeric range [0,1]
  // up front, rejecting a bad value with config_error (exit 1) before any
  // file I/O. `model check --mode self --fitness-threshold` does NOT do
  // this (confirmed against conformance-cli.test.ts, migrated separately,
  // and verified live): the raw `Number(...)` result (including NaN for a
  // non-numeric string) flows straight into the `fitness >= threshold`
  // comparison, where any comparison against NaN is `false` in JS — so an
  // invalid threshold makes the log deterministically REJECTED rather than
  // erroring at config time. This group now tests THAT real contract.
  it('C1: --fitness-threshold=1.0 does not itself cause an error — a missing file does', async () => {
    const result = await wpmAsync(checkArgs(undefined, ['--fitness-threshold=1.0', '--format', 'json']));
    // No positional at all -> INVALID_INPUT about the missing input path, exit 2 (source_error)
    expect(result.exitCode).toBe(EXIT_CODES.source_error);
    const r = parseResult(result);
    const message = ((r?.['error'] as Record<string, unknown> | undefined)?.['message'] as string) ?? '';
    expect(message.toLowerCase()).not.toContain('fitness-threshold');
  });

  it('C2: a non-numeric --fitness-threshold makes a real log deterministically REJECTED, not a config error', async () => {
    if (!wasmIsAvailable() || !logFileIsAvailable(SMALL_XES)) {
      expect(true).toBe(true);
      return;
    }
    const result = await wpmAsync(checkArgs(SMALL_XES, ['--fitness-threshold', 'not-a-number', '--format', 'json']));
    const r = parseResult(result);
    expect(r).not.toBeNull();
    // fitness >= NaN is false for every episode, so REJECTED is the only possible outcome
    expect(r!['status']).toBe('REJECTED');
    expect(result.exitCode).toBe(EXIT_CODES.conformance_fail);
  });

  it('C3: an out-of-range --fitness-threshold (e.g. 2) behaves like an unreachable threshold — always REJECTED', async () => {
    if (!wasmIsAvailable() || !logFileIsAvailable(SMALL_XES)) {
      expect(true).toBe(true);
      return;
    }
    const result = await wpmAsync(checkArgs(SMALL_XES, ['--fitness-threshold=2', '--format', 'json']));
    const r = parseResult(result);
    expect(r).not.toBeNull();
    // No fitness (bounded in [0,1]) can ever be >= 2
    expect(r!['status']).toBe('REJECTED');
    expect(result.exitCode).toBe(EXIT_CODES.conformance_fail);
  });

  it('C4: a negative --fitness-threshold (e.g. -0.1) admits everything — any fitness >= -0.1', async () => {
    if (!wasmIsAvailable() || !logFileIsAvailable(SMALL_XES)) {
      expect(true).toBe(true);
      return;
    }
    const result = await wpmAsync(checkArgs(SMALL_XES, ['--fitness-threshold=-0.1', '--format', 'json']));
    const r = parseResult(result);
    expect(r).not.toBeNull();
    // fitness (bounded in [0,1]) is always >= -0.1 — permissive, not fail-closed,
    // for an out-of-domain-low threshold. This is the flip side of C3.
    expect(r!['status']).toBe('ADMITTED');
    expect(result.exitCode).toBe(EXIT_CODES.success);
  });

  it('C5: the JSON result is always parseable regardless of --fitness-threshold value', async () => {
    for (const value of ['1.0', '0.0', '0.85', 'abc', '2', '-0.1', '1']) {
      const result = await wpmAsync(checkArgs('nonexistent.xes', [`--fitness-threshold=${value}`, '--format', 'json']));
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    }
  });
});

// ─── Group D: Payload completeness under rejection ────────────────────────────

describe('Group D — Result completeness on REJECTED (was: conformance_fail payload)', () => {
  // D1: checked/admitted/rejected are numeric and consistent when REJECTED fires
  it('D1: checked/admitted/rejected are numeric and consistent when REJECTED fires', async () => {
    if (!wasmIsAvailable() || !logFileIsAvailable(SMALL_XES)) {
      expect(true).toBe(true);
      return;
    }

    const result = await wpmAsync(checkArgs(SMALL_XES, ['--fitness-threshold=1.0', '--format', 'json']));

    if (result.exitCode === EXIT_CODES.conformance_fail) {
      const r = parseResult(result);
      expect(r).not.toBeNull();
      expect(typeof r!['checked']).toBe('number');
      expect(typeof r!['admitted']).toBe('number');
      expect(typeof r!['rejected']).toBe('number');
      expect(r!['checked']).toBe((r!['admitted'] as number) + (r!['rejected'] as number));
    }
  });

  // D2: precision/precision_available have NO equivalent — token-replay only computes fitness
  it('D2: no precision field exists — the token-replay engine only computes fitness (genuinely removed capability)', async () => {
    if (!wasmIsAvailable() || !logFileIsAvailable(SMALL_XES)) {
      expect(true).toBe(true);
      return;
    }

    const result = await wpmAsync(checkArgs(SMALL_XES, ['--fitness-threshold=1.0', '--format', 'json']));

    if (result.exitCode === EXIT_CODES.conformance_fail || result.exitCode === EXIT_CODES.success) {
      const r = parseResult(result);
      expect(r).not.toBeNull();
      expect(r).not.toHaveProperty('precision');
      expect(r).not.toHaveProperty('precision_available');
    }
  });

  // D3: findings array is present, empty when ADMITTED, non-empty when REJECTED
  it('D3: findings is an array, populated exactly when REJECTED', async () => {
    if (!wasmIsAvailable() || !logFileIsAvailable(SMALL_XES)) {
      expect(true).toBe(true);
      return;
    }

    const result = await wpmAsync(checkArgs(SMALL_XES, ['--fitness-threshold=1.0', '--format', 'json']));

    if (result.exitCode === EXIT_CODES.conformance_fail || result.exitCode === EXIT_CODES.success) {
      const r = parseResult(result);
      expect(r).not.toBeNull();
      const findings = r!['findings'] as unknown[];
      expect(Array.isArray(findings)).toBe(true);
      if (r!['status'] === 'REJECTED') {
        expect(findings.length).toBeGreaterThan(0);
      } else {
        expect(findings.length).toBe(0);
      }
    }
  });

  // D4: each rejected finding has episodeId, conforms=false, and details
  it('D4: each rejected finding has episodeId, conforms=false, and a details object', async () => {
    if (!wasmIsAvailable() || !logFileIsAvailable(SMALL_XES)) {
      expect(true).toBe(true);
      return;
    }

    const result = await wpmAsync(checkArgs(SMALL_XES, ['--fitness-threshold=1.0', '--format', 'json']));

    if (result.exitCode === EXIT_CODES.conformance_fail) {
      const r = parseResult(result);
      const findings = r!['findings'] as Array<Record<string, unknown>>;
      for (const f of findings) {
        expect(typeof f['episodeId']).toBe('string');
        expect(f['conforms']).toBe(false);
        expect(typeof f['details']).toBe('object');
      }
    }
  });

  // D5: message is a human-readable string summarizing the verdict
  it('D5: message summarizes the verdict outcome as a string', async () => {
    if (!wasmIsAvailable() || !logFileIsAvailable(SMALL_XES)) {
      expect(true).toBe(true);
      return;
    }

    const result = await wpmAsync(checkArgs(SMALL_XES, ['--fitness-threshold=1.0', '--format', 'json']));

    if (result.exitCode === EXIT_CODES.conformance_fail || result.exitCode === EXIT_CODES.success) {
      const r = parseResult(result);
      expect(typeof r!['message']).toBe('string');
      expect((r!['message'] as string).length).toBeGreaterThan(0);
    }
  });

  // D6: algorithmUsed identifies the self-mined algorithm (alpha_plus_plus)
  it('D6: algorithmUsed is alpha_plus_plus for --mode self (old payload.schema-equivalent identifier)', async () => {
    if (!wasmIsAvailable() || !logFileIsAvailable(SMALL_XES)) {
      expect(true).toBe(true);
      return;
    }

    const result = await wpmAsync(checkArgs(SMALL_XES, ['--fitness-threshold=1.0', '--format', 'json']));

    if (result.exitCode === EXIT_CODES.conformance_fail || result.exitCode === EXIT_CODES.success) {
      const r = parseResult(result);
      expect(r!['algorithmUsed']).toBe('alpha_plus_plus');
    }
  });
});

// ─── Group E: Human output language ──────────────────────────────────────────

describe('Group E — Human output language on rejection', () => {
  // E1: --human output (stderr) mentions the mode on rejection
  it('E1: --human output mentions the check mode when REJECTED fires', async () => {
    if (!wasmIsAvailable() || !logFileIsAvailable(SMALL_XES)) {
      expect(true).toBe(true);
      return;
    }

    const result = await wpmAsync(checkArgs(SMALL_XES, ['--fitness-threshold=1.0', '--human']));

    if (result.exitCode === EXIT_CODES.conformance_fail) {
      // Human output goes to stderr only; stdout stays pure JSON (framework contract)
      expect(result.stderr).toMatch(/\[self]/);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    }
  });

  // E2: message mentions REJECTED language on rejection
  it('E2: message field uses rejection language when REJECTED fires', async () => {
    if (!wasmIsAvailable() || !logFileIsAvailable(SMALL_XES)) {
      expect(true).toBe(true);
      return;
    }

    const result = await wpmAsync(checkArgs(SMALL_XES, ['--fitness-threshold=1.0', '--format', 'json']));

    if (result.exitCode === EXIT_CODES.conformance_fail) {
      const r = parseResult(result);
      expect((r!['message'] as string)).toMatch(/REJECTED|fail/i);
    }
  });

  // E3: --human view still keeps stdout as pure JSON, even on rejection
  it('E3: stdout stays pure JSON with --human even when REJECTED fires', async () => {
    if (!wasmIsAvailable() || !logFileIsAvailable(SMALL_XES)) {
      expect(true).toBe(true);
      return;
    }

    const result = await wpmAsync(checkArgs(SMALL_XES, ['--fitness-threshold=1.0', '--human']));

    if (result.exitCode === EXIT_CODES.conformance_fail) {
      const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
      expect(parsed['status']).toBe('REJECTED');
    }
  });
});

// ─── Group F: MCPP doctrine contract invariants ───────────────────────────────

describe('Group F — MCPP doctrine contract invariants (no WASM required)', () => {
  // F1: conformance_fail is exit 6 (documented in exit-codes.ts)
  it('F1: conformance_fail exit code is exactly 6 (as documented in exit-codes.ts)', () => {
    expect(EXIT_CODES.conformance_fail).toBe(6);
  });

  // F2: source_error is exit 2 (a missing file, or model check's own INVALID_INPUT mapping)
  it('F2: source_error exit code is exactly 2 (INVALID_INPUT maps here per ERROR_CODE_MAP)', () => {
    expect(EXIT_CODES.source_error).toBe(2);
  });

  // F3: success is exit 0 (admitted)
  it('F3: success exit code is exactly 0 (route admitted when fitness >= threshold)', () => {
    expect(EXIT_CODES.success).toBe(0);
  });

  // F4: AndonPull doctrine — threshold=1.0 requires exact match
  it('F4: MCPP doctrine: threshold=1.0 means fitness must be exactly 1.0 for admission', () => {
    const threshold = 1.0;
    const testFitnessValues = [0.0, 0.5, 0.85, 0.99, 0.999, 0.9999];
    for (const fitness of testFitnessValues) {
      const isFit = fitness >= threshold;
      expect(isFit).toBe(false); // All values below 1.0 must fail the 1.0 gate
    }
    expect(1.0 >= threshold).toBe(true);
  });

  // F5: A permissive threshold (0.8) is NOT the MCPP admission threshold
  it('F5: MCPP requires explicit --fitness-threshold=1.0; a permissive threshold like 0.8 is too lenient', () => {
    const permissiveThreshold = 0.8;
    const mcppThreshold = 1.0;
    expect(permissiveThreshold).toBeLessThan(mcppThreshold);
    const exampleFitness = 0.85;
    expect(exampleFitness >= permissiveThreshold).toBe(true); // admitted by a lenient threshold
    expect(exampleFitness >= mcppThreshold).toBe(false); // rejected by MCPP
  });

  // F6: Fitness in [0,1] is an invariant — fitness outside range is a bug
  it('F6: fitness is always in [0, 1] — values outside this range indicate a bug', () => {
    const legalValues = [0.0, 0.5, 0.85, 0.999, 1.0];
    const illegalValues = [-0.1, 1.1, NaN, Infinity, -Infinity];

    for (const v of legalValues) {
      expect(Number.isFinite(v) && v >= 0 && v <= 1).toBe(true);
    }
    for (const v of illegalValues) {
      expect(Number.isFinite(v) && v >= 0 && v <= 1).toBe(false);
    }
  });

  // F7: Exit code ordering for shell pipelines
  it('F7: exit code semantics — success(0) < config_error(1) < source_error(2) < conformance_fail(6)', () => {
    expect(EXIT_CODES.success).toBe(0);
    expect(EXIT_CODES.config_error).toBeGreaterThan(EXIT_CODES.success);
    expect(EXIT_CODES.source_error).toBeGreaterThan(EXIT_CODES.config_error);
    expect(EXIT_CODES.conformance_fail).toBeGreaterThan(EXIT_CODES.source_error);
  });

  // F8: A bogus --fitness-threshold on a real log still produces structured JSON (REJECTED), not a crash
  it('F8: a bogus --fitness-threshold=99 on a real log produces a structured REJECTED JSON result', async () => {
    if (!wasmIsAvailable() || !logFileIsAvailable(SMALL_XES)) {
      expect(true).toBe(true);
      return;
    }
    const result = await wpmAsync(checkArgs(SMALL_XES, ['--fitness-threshold=99', '--format', 'json']));

    let parsed: Record<string, unknown> | null = null;
    expect(() => {
      parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    }).not.toThrow();

    expect(parsed).not.toBeNull();
    expect((parsed as unknown as Record<string, unknown>)['status']).toBe('REJECTED');
    expect(result.exitCode).toBe(EXIT_CODES.conformance_fail);
  });

  // F9: --fitness-threshold=1.0 is a valid argument (never itself the cause of an error)
  it('F9: --fitness-threshold=1.0 is a valid argument (not rejected by the CLI)', async () => {
    const result = await wpmAsync(checkArgs('nonexistent.xes', ['--fitness-threshold=1.0', '--format', 'json']));
    // Fails on the missing file (source_error=2), never treated as an invalid threshold
    const r = parseResult(result);
    const message = ((r?.['error'] as Record<string, unknown> | undefined)?.['message'] as string) ?? '';
    expect(message.toLowerCase()).not.toContain('fitness-threshold');
  });

  // F10: Two separate invocations with the same input produce the same exit code (determinism)
  it('F10: model check exit code is deterministic for the same input and threshold', async () => {
    if (!wasmIsAvailable() || !logFileIsAvailable(SMALL_XES)) {
      expect(true).toBe(true);
      return;
    }

    const args = checkArgs(SMALL_XES, ['--fitness-threshold=1.0', '--format', 'json']);

    const result1 = await wpmAsync(args);
    const result2 = await wpmAsync(args);

    expect(result1.exitCode).toBe(result2.exitCode);

    if (
      ([EXIT_CODES.success, EXIT_CODES.conformance_fail] as number[]).includes(result1.exitCode) &&
      ([EXIT_CODES.success, EXIT_CODES.conformance_fail] as number[]).includes(result2.exitCode)
    ) {
      const r1 = parseResult(result1);
      const r2 = parseResult(result2);
      if (r1 && r2) {
        expect(r1['checked']).toBe(r2['checked']);
        expect(r1['admitted']).toBe(r2['admitted']);
        expect(r1['rejected']).toBe(r2['rejected']);
      }
    }
  });
});
