/**
 * doctor-status-gaps.test.ts
 *
 * Four concrete, testable gaps in `wpm doctor` and `wpm status` JSON output.
 *
 * GAP 1 — doctor WARNING-only runs exit 1 (config_error) instead of 0 (success)
 *   Source: doctor.ts line 2061, epistemicHealth = diagnoses.every(c => c.severity === 'INFO')
 *   A WARNING is advisory. Only STOP_THE_LINE should cause a non-zero exit.
 *
 * GAP 2 — status.wasmBinarySize always null
 *   Source: status.ts import.meta.url regex targets dist/bin/ but the module loads as
 *   dist/commands/status.js; the pattern never matches.
 *
 * GAP 3 — doctor "Algorithm registry" check says "14 algorithms registered" while status
 *   reports 38-49 algorithms. The message is misleading because it counts WASM function
 *   exports, not the kernel registry size.
 *
 * GAP 4 — status --verbose flag is declared but adds no extra fields to the JSON payload.
 *   The verbose flag only affects the human-readable renderer, never the machine-readable
 *   payload — so --verbose with --format json is a no-op.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFile } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import { tmpdir } from 'os';

// ─── Helpers ─────────────────────────────────────────────────────────────────

interface CliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

function runCli(args: string[], opts: { cwd?: string; timeoutMs?: number } = {}): Promise<CliResult> {
  const cliPath = path.resolve(__dirname, '../../dist/bin/wpm.js');
  const cwd = opts.cwd ?? path.resolve(__dirname, '../..');
  const timeoutMs = opts.timeoutMs ?? 30_000;
  return new Promise((resolve) => {
    const child = execFile(
      process.execPath,
      [cliPath, ...args],
      { timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024, cwd },
      (error, stdout, stderr) => {
        const exitCode =
          error && 'code' in error && typeof error.code === 'number'
            ? error.code
            : error
              ? 1
              : 0;
        resolve({ exitCode, stdout: stdout ?? '', stderr: stderr ?? '' });
      },
    );
    child.on('error', () => resolve({ exitCode: 5, stdout: '', stderr: 'Process failed to start' }));
  });
}

function parseJsonOutput(raw: string): Record<string, unknown> {
  const start = raw.indexOf('{');
  if (start === -1) throw new Error(`No JSON object in output: ${raw.slice(0, 200)}`);
  return JSON.parse(raw.slice(start)) as Record<string, unknown>;
}

// ─── Test lifecycle ───────────────────────────────────────────────────────────

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(tmpdir(), 'wpm-doctor-status-gaps-'));
});

afterEach(async () => {
  try {
    await fs.rm(tempDir, { recursive: true, force: true });
  } catch {
    // ignore
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GAP 1: doctor WARNING-only runs exit 1 instead of 0
// ─────────────────────────────────────────────────────────────────────────────

describe('GAP 1 — doctor exit code contract', () => {
  it('doctor check exits 0 when no STOP_THE_LINE checks fire', async () => {
    // Run doctor check and inspect the payload to understand what fired
    const r = await runCli(['doctor', 'check', '--format', 'json']);
    const d = parseJsonOutput(r.stdout);
    const payload = d.payload as Record<string, unknown>;
    const checks = payload.checks as Array<{ severity: string; name: string }>;

    const stopTheLine = checks.filter((c) => c.severity === 'STOP_THE_LINE');

    if (stopTheLine.length === 0) {
      // No STOP_THE_LINE check fired — exit must be 0 (success)
      // GAP: currently exits 1 when there are WARNINGs
      expect(r.exitCode).toBe(0);
    } else {
      // STOP_THE_LINE present — exit 1 is correct
      expect(r.exitCode).toBeGreaterThan(0);
    }
  });

  it('doctor check JSON payload healthy field matches actual severity distribution', async () => {
    const r = await runCli(['doctor', 'check', '--format', 'json']);
    const d = parseJsonOutput(r.stdout);
    const payload = d.payload as Record<string, unknown>;
    const checks = payload.checks as Array<{ severity: string }>;
    const healthy = payload.healthy as boolean;

    const hasStopTheLine = checks.some((c) => c.severity === 'STOP_THE_LINE');

    // healthy should be false only when STOP_THE_LINE exists
    // GAP: currently healthy=false when any WARNING exists
    expect(healthy).toBe(!hasStopTheLine);
  });

  it('doctor check summary.fail counts only STOP_THE_LINE checks', async () => {
    const r = await runCli(['doctor', 'check', '--format', 'json']);
    const d = parseJsonOutput(r.stdout);
    const payload = d.payload as Record<string, unknown>;
    const checks = payload.checks as Array<{ severity: string }>;
    const summary = payload.summary as Record<string, number>;

    const actualStopCount = checks.filter((c) => c.severity === 'STOP_THE_LINE').length;
    expect(summary.fail).toBe(actualStopCount);
    expect(summary.critical).toBe(actualStopCount);
  });

  it('doctor env exits 0 when environment has only warnings', async () => {
    // Run from tmpdir (no workspace) — skips workspace-dependent checks
    const r = await runCli(['doctor', 'env', '--format', 'json'], { cwd: tempDir });
    const d = parseJsonOutput(r.stdout);
    const payload = d.payload as Record<string, unknown>;
    const checks = payload.checks as Array<{ severity: string }>;

    const stopTheLine = checks.filter((c) => c.severity === 'STOP_THE_LINE');
    if (stopTheLine.length === 0) {
      // Only warnings/info — should exit 0
      expect(r.exitCode).toBe(0);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GAP 2: status.wasmBinarySize always null
// ─────────────────────────────────────────────────────────────────────────────

describe('GAP 2 — status wasmBinarySize not null when WASM is built', () => {
  it('wasmBinarySize is a positive number when WASM binary is built', async () => {
    const r = await runCli(['status', '--format', 'json']);
    expect(r.exitCode).toBe(0);

    const d = parseJsonOutput(r.stdout);
    const payload = d.payload as Record<string, unknown>;
    const engine = payload.engine as Record<string, unknown>;

    // The WASM binary exists at wasm4pm/pkg/wasm4pm_bg.wasm (2.7 MB)
    // GAP: import.meta.url in commands/status.js resolves to dist/commands/status.js,
    // but the regex strips dist/bin/ — pattern doesn't match, so wasmBinarySize stays null
    expect(engine.wasmBinarySize).not.toBeNull();
    expect(typeof engine.wasmBinarySize).toBe('number');
    const size = engine.wasmBinarySize as number;
    // Browser profile is ~2.7 MB (2,816,987 bytes). Must be > 500 KB.
    expect(size).toBeGreaterThan(500 * 1024);
  });

  it('status JSON payload has engine.state = "ready" when WASM loads', async () => {
    const r = await runCli(['status', '--format', 'json']);
    expect(r.exitCode).toBe(0);

    const d = parseJsonOutput(r.stdout);
    const payload = d.payload as Record<string, unknown>;
    const engine = payload.engine as Record<string, unknown>;
    expect(engine.state).toBe('ready');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GAP 3: doctor "Algorithm registry" message is misleading
// ─────────────────────────────────────────────────────────────────────────────

describe('GAP 3 — doctor Algorithm registry check count matches status algorithmCount', () => {
  it('doctor algorithm registry check is present in JSON output', async () => {
    const r = await runCli(['doctor', 'check', '--format', 'json']);
    const d = parseJsonOutput(r.stdout);
    const payload = d.payload as Record<string, unknown>;
    const checks = payload.checks as Array<{ name: string; message: string; severity: string }>;

    const algoCheck = checks.find((c) => c.name === 'Algorithm registry');
    expect(algoCheck).toBeDefined();
    // The check should pass (INFO severity) when WASM is built
    expect(algoCheck?.severity).toBe('INFO');
  });

  it('doctor algorithm registry count aligns with status algorithmCount', async () => {
    const [doctorResult, statusResult] = await Promise.all([
      runCli(['doctor', 'check', '--format', 'json']),
      runCli(['status', '--format', 'json']),
    ]);

    const dPayload = (parseJsonOutput(doctorResult.stdout).payload as Record<string, unknown>);
    const sPayload = (parseJsonOutput(statusResult.stdout).payload as Record<string, unknown>);

    const checks = dPayload.checks as Array<{ name: string; message: string }>;
    const algoCheck = checks.find((c) => c.name === 'Algorithm registry');
    const statusEngine = sPayload.engine as Record<string, unknown>;
    const statusCount = statusEngine.algorithmCount as number;

    // GAP: doctor says "14 algorithms registered" while status reports 49.
    // The doctor check tests 14 WASM function names from the binary, but the kernel
    // registry has 38+ algorithms. The message must not claim to represent the full count.
    // After fix: doctor message should say "N core WASM exports verified" not "N algorithms registered"
    expect(algoCheck?.message).toBeDefined();

    // The kernel registry algorithm count from status must be >= 36 (documented minimum)
    expect(statusCount).toBeGreaterThanOrEqual(36);

    // The doctor's algorithm registry check should reference fewer than the full registry count
    // (it only checks named WASM exports, not all kernel algorithms)
    const doctorCountMatch = algoCheck?.message.match(/(\d+)/);
    if (doctorCountMatch) {
      const doctorCount = parseInt(doctorCountMatch[1], 10);
      // Doctor checks a subset of WASM function exports (not the full registry)
      // It must not claim to represent the full kernel registry count
      expect(doctorCount).toBeLessThanOrEqual(statusCount);
    }
  });

  it('doctor algorithm registry message distinguishes WASM exports from kernel registry', async () => {
    const r = await runCli(['doctor', 'check', '--format', 'json']);
    const d = parseJsonOutput(r.stdout);
    const payload = d.payload as Record<string, unknown>;
    const checks = payload.checks as Array<{ name: string; message: string }>;

    const algoCheck = checks.find((c) => c.name === 'Algorithm registry');
    // After fix: message should say "WASM exports verified" not "algorithms registered"
    // to prevent confusion with the kernel registry count
    expect(algoCheck?.message).toMatch(/verified|exports|wasm/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GAP 4: status --verbose adds no fields to JSON payload
// ─────────────────────────────────────────────────────────────────────────────

describe('GAP 4 — status --verbose should enrich JSON payload', () => {
  it('status --verbose exits 0', async () => {
    const r = await runCli(['status', '--verbose', '--format', 'json']);
    expect(r.exitCode).toBe(0);
  });

  it('status --verbose payload includes algorithm list when verbose', async () => {
    const r = await runCli(['status', '--verbose', '--format', 'json']);
    expect(r.exitCode).toBe(0);
    const d = parseJsonOutput(r.stdout);
    const payload = d.payload as Record<string, unknown>;
    const engine = payload.engine as Record<string, unknown>;

    // GAP: --verbose with --format json returns identical payload to non-verbose
    // After fix: verbose JSON payload should include algorithm_ids list or expanded breakdown
    // The simplest conformant fix is to add engine.algorithms array with algorithm IDs
    expect(engine.algorithms).toBeDefined();
    expect(Array.isArray(engine.algorithms)).toBe(true);
    const algorithms = engine.algorithms as unknown[];
    expect(algorithms.length).toBeGreaterThanOrEqual(36);
  });

  it('status --verbose payload has algorithmBreakdown section', async () => {
    const r = await runCli(['status', '--verbose', '--format', 'json']);
    expect(r.exitCode).toBe(0);
    const d = parseJsonOutput(r.stdout);
    const payload = d.payload as Record<string, unknown>;
    const engine = payload.engine as Record<string, unknown>;
    const breakdown = engine.algorithmBreakdown as Record<string, number>;

    // algorithmBreakdown should always be present (verbose or not)
    expect(typeof breakdown.discovery).toBe('number');
    expect(typeof breakdown.ml).toBe('number');
    expect(typeof breakdown.analytics).toBe('number');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Existing contract regressions (must stay passing after fixes)
// ─────────────────────────────────────────────────────────────────────────────

describe('status JSON output contracts (regression)', () => {
  it('status exits 0', async () => {
    const r = await runCli(['status', '--format', 'json']);
    expect(r.exitCode).toBe(0);
  });

  it('status payload includes required top-level sections', async () => {
    const r = await runCli(['status', '--format', 'json']);
    const d = parseJsonOutput(r.stdout);
    const payload = d.payload as Record<string, unknown>;
    expect(payload.engine).toBeDefined();
    expect(payload.system).toBeDefined();
    expect(payload.memory).toBeDefined();
    expect(payload.autonomic).toBeDefined();
  });

  it('status engine section has wasm_loaded and algorithm_count as booleans/numbers', async () => {
    const r = await runCli(['status', '--format', 'json']);
    const d = parseJsonOutput(r.stdout);
    const payload = d.payload as Record<string, unknown>;
    const engine = payload.engine as Record<string, unknown>;
    expect(engine.wasmLoaded).toBe(true);
    expect(engine.kernelReady).toBe(true);
    expect(typeof engine.algorithmCount).toBe('number');
  });

  it('status system section has platform and nodeVersion', async () => {
    const r = await runCli(['status', '--format', 'json']);
    const d = parseJsonOutput(r.stdout);
    const payload = d.payload as Record<string, unknown>;
    const system = payload.system as Record<string, unknown>;
    expect(typeof system.platform).toBe('string');
    expect(typeof system.nodeVersion).toBe('string');
    expect((system.nodeVersion as string)).toMatch(/^v\d+/);
  });
});

describe('doctor check JSON output contracts (regression)', () => {
  it('doctor check produces parseable JSON', async () => {
    const r = await runCli(['doctor', 'check', '--format', 'json']);
    expect(() => parseJsonOutput(r.stdout)).not.toThrow();
  });

  it('doctor check payload.checks is an array with name/severity/message per item', async () => {
    const r = await runCli(['doctor', 'check', '--format', 'json']);
    const d = parseJsonOutput(r.stdout);
    const payload = d.payload as Record<string, unknown>;
    const checks = payload.checks as Array<Record<string, unknown>>;
    expect(Array.isArray(checks)).toBe(true);
    expect(checks.length).toBeGreaterThan(0);
    for (const check of checks.slice(0, 5)) {
      expect(typeof check.name).toBe('string');
      expect(typeof check.severity).toBe('string');
      expect(typeof check.message).toBe('string');
      expect(['INFO', 'WARNING', 'STOP_THE_LINE']).toContain(check.severity);
    }
  });

  it('doctor check payload includes summary and healthy fields', async () => {
    const r = await runCli(['doctor', 'check', '--format', 'json']);
    const d = parseJsonOutput(r.stdout);
    const payload = d.payload as Record<string, unknown>;
    expect(typeof payload.healthy).toBe('boolean');
    const summary = payload.summary as Record<string, number>;
    expect(typeof summary.pass).toBe('number');
    expect(typeof summary.warn).toBe('number');
    expect(typeof summary.fail).toBe('number');
  }, 30_000);
});
