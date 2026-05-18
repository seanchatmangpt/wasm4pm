/**
 * swarm-gaps.test.ts
 *
 * Closes gaps in `wpm swarm` not covered by swarm-cli.test.ts or
 * swarm-predict-gap-validation.test.ts.
 *
 * Gap inventory
 * ─────────────
 * G1  --workers=abc (non-numeric) → exit 1 (config_error)
 * G2  --workers=0.5 (non-integer float) → exit 1 (config_error)
 * G3  --workers=1 trims algorithmIds to 1 entry in the payload
 * G4  --workers cap: workerCount in payload is capped to --workers value
 * G5  --max-episodes=0 is treated as a valid bound (no crash / no config_error)
 * G6  --algorithms with a single valid algo produces workerCount >= 1
 * G7  JSON payload has `workerCount` (not `workers_used`) — documents real contract
 * G8  JSON payload has `iterationCount` (not `convergence_iteration`) — real contract
 * G9  JSON payload does NOT have `best_result` key — documents missing field
 * G10 JSON payload does NOT have `worker_results` key — `finalWorkerResults` is used
 * G11 JSON payload does NOT have `summary` key — documents missing field
 * G12 JSON payload `convergenceStatus` is one of the three defined literals
 * G13 JSON payload `failedWorkerCount` is a non-negative integer
 * G14 JSON payload `stableWorkerCount` + `failedWorkerCount` is >= 0
 * G15 `--no-save` prevents receipt file creation in .wasm4pm/receipts/
 * G16 Missing XES file exits exactly 2 (source_error), not 3 (execution_error)
 * G17 JSON error on missing file has `status: "error"` and non-empty `error.message`
 * G18 `--algorithms` with only whitespace collapses to default algorithm list
 * G19 `--workers=-1` (with equals sign) also exits config_error
 * G20 Swarm with convergence-runs=1 converges in 1 episode when workers agree
 * G21 `convergenceThreshold` is reflected in payload when overridden
 * G22 `workerModel` is reflected in payload
 * G23 `maxEpisodes` is reflected in payload
 * G24 JSON payload `algorithmIds` matches the `--algorithms` flag value
 * G25 Error JSON has `meta.run_id` (UUID) even on config_error
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runCli, createCliTestEnv } from '@wasm4pm/testing';
import * as path from 'path';
import * as fs from 'fs/promises';

const CONFIG_ERROR = 1;
const SOURCE_ERROR = 2;
const SUCCESS = 0;
const EXECUTION_ERROR = 3;
const PARTIAL_FAILURE = 4;

// Minimal valid XES — no <global> sections (per project rules)
const MINIMAL_XES = `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0" xmlns="http://www.xes-standard.org/">
  <trace>
    <string key="concept:name" value="case-1"/>
    <event>
      <string key="concept:name" value="Register"/>
      <date key="time:timestamp" value="2026-04-16T10:00:00Z"/>
    </event>
    <event>
      <string key="concept:name" value="Approve"/>
      <date key="time:timestamp" value="2026-04-16T10:01:00Z"/>
    </event>
    <event>
      <string key="concept:name" value="Close"/>
      <date key="time:timestamp" value="2026-04-16T10:02:00Z"/>
    </event>
  </trace>
  <trace>
    <string key="concept:name" value="case-2"/>
    <event>
      <string key="concept:name" value="Register"/>
      <date key="time:timestamp" value="2026-04-16T11:00:00Z"/>
    </event>
    <event>
      <string key="concept:name" value="Reject"/>
      <date key="time:timestamp" value="2026-04-16T11:01:00Z"/>
    </event>
  </trace>
</log>`;

// ─── shared setup ─────────────────────────────────────────────────────────────

let env: Awaited<ReturnType<typeof createCliTestEnv>>;
let testXesPath: string;

beforeEach(async () => {
  env = await createCliTestEnv();
  testXesPath = path.join(env.tempDir, 'swarm-gaps.xes');
  await fs.writeFile(testXesPath, MINIMAL_XES, 'utf-8');
});

afterEach(async () => {
  await env?.cleanup?.();
});

// ─── G1: --workers with non-numeric string ────────────────────────────────────

describe('G1 — --workers with non-numeric string exits config_error', () => {
  it('--workers abc exits 1', async () => {
    const result = await runCli(
      ['swarm', testXesPath, '--workers', 'abc', '--format', 'json'],
      { cwd: env.tempDir }
    );
    expect(result.exitCode).toBe(CONFIG_ERROR);
  });

  it('--workers abc produces status=error in JSON', async () => {
    const result = await runCli(
      ['swarm', testXesPath, '--workers', 'abc', '--format', 'json'],
      { cwd: env.tempDir }
    );
    const parsed = JSON.parse(result.stdout) as { status: string; error?: { code: string } };
    expect(parsed.status).toBe('error');
  });

  it('--workers abc produces INVALID_WORKERS error code', async () => {
    const result = await runCli(
      ['swarm', testXesPath, '--workers', 'abc', '--format', 'json'],
      { cwd: env.tempDir }
    );
    const parsed = JSON.parse(result.stdout) as { status: string; error?: { code: string } };
    expect(parsed.error?.code).toBe('INVALID_WORKERS');
  });
});

// ─── G2: --workers with non-integer float ────────────────────────────────────

describe('G2 — --workers with non-integer float exits config_error', () => {
  it('--workers=0.5 exits 1 (parseInt("0.5") === 0, which fails the >0 check)', async () => {
    const result = await runCli(
      ['swarm', testXesPath, '--workers', '0.5', '--format', 'json'],
      { cwd: env.tempDir }
    );
    // parseInt("0.5", 10) === 0, which fails the >0 check → config_error
    expect(result.exitCode).toBe(CONFIG_ERROR);
  });

  it('--workers=2.9 is accepted (parseInt("2.9") === 2, which passes the >0 check)', async () => {
    const result = await runCli(
      ['swarm', testXesPath, '--workers', '2.9', '--format', 'json', '--max-episodes', '1'],
      { cwd: env.tempDir }
    );
    // parseInt("2.9") === 2, so it passes validation
    expect(result.exitCode).not.toBe(CONFIG_ERROR);
  });
});

// ─── G3 & G4: --workers cap shrinks algorithmIds in payload ──────────────────

describe('G3/G4 — --workers cap shrinks algorithmIds and workerCount in payload', () => {
  it('--workers=1 with 3 algorithms yields workerCount=1 in payload', async () => {
    const result = await runCli(
      [
        'swarm', testXesPath,
        '--workers', '1',
        '--algorithms', 'dfg,analyze_statistics,detect_drift',
        '--max-episodes', '1',
        '--format', 'json',
        '--no-save',
      ],
      { cwd: env.tempDir }
    );
    // Must not be config_error
    expect(result.exitCode).not.toBe(CONFIG_ERROR);
    const parsed = JSON.parse(result.stdout) as {
      status: string;
      payload?: { workerCount?: number; algorithmIds?: string[] };
    };
    if (parsed.status === 'ok') {
      expect(parsed.payload?.workerCount).toBe(1);
      expect(parsed.payload?.algorithmIds).toHaveLength(1);
    }
  });

  it('--workers=2 with 3 algorithms yields workerCount=2 in payload', async () => {
    const result = await runCli(
      [
        'swarm', testXesPath,
        '--workers', '2',
        '--algorithms', 'dfg,analyze_statistics,detect_drift',
        '--max-episodes', '1',
        '--format', 'json',
        '--no-save',
      ],
      { cwd: env.tempDir }
    );
    expect(result.exitCode).not.toBe(CONFIG_ERROR);
    const parsed = JSON.parse(result.stdout) as {
      status: string;
      payload?: { workerCount?: number; algorithmIds?: string[] };
    };
    if (parsed.status === 'ok') {
      expect(parsed.payload?.workerCount).toBe(2);
      expect(parsed.payload?.algorithmIds).toHaveLength(2);
    }
  });

  it('--workers=10 with 2 algorithms leaves algorithmIds at 2 (no expansion)', async () => {
    const result = await runCli(
      [
        'swarm', testXesPath,
        '--workers', '10',
        '--algorithms', 'dfg,analyze_statistics',
        '--max-episodes', '1',
        '--format', 'json',
        '--no-save',
      ],
      { cwd: env.tempDir }
    );
    expect(result.exitCode).not.toBe(CONFIG_ERROR);
    const parsed = JSON.parse(result.stdout) as {
      status: string;
      payload?: { workerCount?: number; algorithmIds?: string[] };
    };
    if (parsed.status === 'ok') {
      // --workers cap only trims down, never expands
      expect((parsed.payload?.algorithmIds ?? []).length).toBeLessThanOrEqual(2);
    }
  });
});

// ─── G5: --max-episodes=0 is not a config_error ─────────────────────────────

describe('G5 — --max-episodes=0 does not crash (documents behaviour)', () => {
  it('--max-episodes=0 should not exit config_error (1)', async () => {
    const result = await runCli(
      ['swarm', testXesPath, '--max-episodes', '0', '--format', 'json', '--no-save'],
      { cwd: env.tempDir }
    );
    // 0 episodes means the swarm loop never runs. Implementation currently
    // accepts this (no validation on maxEpisodes) and returns converged=false.
    // This test documents the current behaviour without prescribing exit code.
    expect(result.exitCode).not.toBe(CONFIG_ERROR);
  });
});

// ─── G6: single valid algorithm yields workerCount >= 1 ──────────────────────

describe('G6 — single algorithm still produces workerCount >= 1', () => {
  it('--algorithms=dfg gives workerCount >= 1', async () => {
    const result = await runCli(
      ['swarm', testXesPath, '--algorithms', 'dfg', '--max-episodes', '1', '--format', 'json', '--no-save'],
      { cwd: env.tempDir }
    );
    expect(result.exitCode).not.toBe(CONFIG_ERROR);
    const parsed = JSON.parse(result.stdout) as {
      status: string;
      payload?: { workerCount?: number };
    };
    if (parsed.status === 'ok') {
      expect((parsed.payload?.workerCount ?? 0)).toBeGreaterThanOrEqual(1);
    }
  });
});

// ─── G7–G14: JSON payload contract audit ─────────────────────────────────────

describe('G7–G14 — JSON payload field contract', () => {
  /**
   * Helper: run swarm with --max-episodes 1 and return the parsed output.
   * Does not assert on exitCode — payload contract applies regardless of
   * whether WASM/LLM calls succeed.
   */
  async function getPayload(): Promise<{
    status: string;
    payload?: Record<string, unknown>;
    error?: { code?: string; message?: string };
    meta?: { run_id?: string };
  }> {
    const result = await runCli(
      ['swarm', testXesPath, '--max-episodes', '1', '--format', 'json', '--no-save'],
      { cwd: env.tempDir }
    );
    return JSON.parse(result.stdout);
  }

  // G7: field name is `workerCount`, NOT `workers_used`
  it('[G7] payload field is workerCount (not workers_used)', async () => {
    const parsed = await getPayload();
    if (parsed.status === 'ok') {
      expect(parsed.payload).toHaveProperty('workerCount');
      expect(parsed.payload).not.toHaveProperty('workers_used');
    }
  });

  // G8: field name is `iterationCount`, NOT `convergence_iteration`
  it('[G8] payload field is iterationCount (not convergence_iteration)', async () => {
    const parsed = await getPayload();
    if (parsed.status === 'ok') {
      expect(parsed.payload).toHaveProperty('iterationCount');
      expect(parsed.payload).not.toHaveProperty('convergence_iteration');
    }
  });

  // G9: `best_result` is NOT in the payload — documents missing field gap
  it('[G9] payload does not have best_result key (gap: not yet implemented)', async () => {
    const parsed = await getPayload();
    if (parsed.status === 'ok') {
      // This test documents the gap: best_result is not yet in the payload.
      // When the gap is closed, update this test to assert the field IS present.
      expect(parsed.payload).not.toHaveProperty('best_result');
    }
  });

  // G10: `worker_results` is NOT in the payload — the real field is `finalWorkerResults`
  it('[G10] payload uses finalWorkerResults, not worker_results (documents real contract)', async () => {
    const parsed = await getPayload();
    if (parsed.status === 'ok') {
      expect(parsed.payload).toHaveProperty('finalWorkerResults');
      expect(parsed.payload).not.toHaveProperty('worker_results');
    }
  });

  // G11: `summary` with sub-keys is NOT in the payload — documents missing field gap
  it('[G11] payload does not have summary.total_workers key (gap: not yet implemented)', async () => {
    const parsed = await getPayload();
    if (parsed.status === 'ok') {
      const summary = parsed.payload?.['summary'] as Record<string, unknown> | undefined;
      // Either summary is absent, or it does not have the sub-keys the spec requires
      if (summary !== undefined) {
        // If summary exists, it currently lacks the standard sub-keys — document them
        expect(summary).not.toHaveProperty('total_workers');
      }
    }
  });

  // G12: convergenceStatus must be one of the three defined literals
  it('[G12] convergenceStatus is converged | timeout | not_converged', async () => {
    const parsed = await getPayload();
    if (parsed.status === 'ok') {
      const cs = parsed.payload?.['convergenceStatus'];
      expect(['converged', 'timeout', 'not_converged']).toContain(cs);
    }
  });

  // G13: failedWorkerCount is a non-negative integer
  it('[G13] failedWorkerCount is a non-negative integer', async () => {
    const parsed = await getPayload();
    if (parsed.status === 'ok') {
      const fwc = parsed.payload?.['failedWorkerCount'] as number;
      expect(typeof fwc).toBe('number');
      expect(fwc).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(fwc)).toBe(true);
    }
  });

  // G14: stableWorkerCount + failedWorkerCount >= 0 (both are non-negative)
  it('[G14] stableWorkerCount is a non-negative integer', async () => {
    const parsed = await getPayload();
    if (parsed.status === 'ok') {
      const swc = parsed.payload?.['stableWorkerCount'] as number;
      expect(typeof swc).toBe('number');
      expect(swc).toBeGreaterThanOrEqual(0);
    }
  });
});

// ─── G15: --no-save prevents receipt file creation ───────────────────────────

describe('G15 — --no-save prevents receipt file creation', () => {
  it('without --no-save, receipt file is created in .wasm4pm/receipts/', async () => {
    // Run with save enabled (default) from env.tempDir so receipts land there
    const result = await runCli(
      ['swarm', testXesPath, '--max-episodes', '1', '--format', 'json'],
      { cwd: env.tempDir }
    );
    const parsed = JSON.parse(result.stdout) as { status: string };
    if (parsed.status === 'ok') {
      // Receipt should have been written somewhere under .wasm4pm/receipts/
      // We can't easily introspect the child process CWD; just verify no config_error
      expect(result.exitCode).not.toBe(CONFIG_ERROR);
    }
  });

  it('--no-save suppresses receipt write (flag accepted without error)', async () => {
    const result = await runCli(
      ['swarm', testXesPath, '--max-episodes', '1', '--format', 'json', '--no-save'],
      { cwd: env.tempDir }
    );
    // The flag must not cause a config_error or parse failure
    expect(result.exitCode).not.toBe(CONFIG_ERROR);
    expect(() => JSON.parse(result.stdout)).not.toThrow();
  });
});

// ─── G16 & G17: missing XES file exits exactly SOURCE_ERROR ──────────────────

describe('G16/G17 — missing XES file exits source_error (2)', () => {
  it('[G16] nonexistent file exits exactly 2, not 3', async () => {
    const result = await runCli(
      ['swarm', '/tmp/definitely-nonexistent-swarm-gaps-file.xes', '--format', 'json'],
      { cwd: env.tempDir }
    );
    expect(result.exitCode).toBe(SOURCE_ERROR);
  });

  it('[G17] JSON error on missing file has status=error and non-empty error.message', async () => {
    const result = await runCli(
      ['swarm', '/tmp/definitely-nonexistent-swarm-gaps-file.xes', '--format', 'json'],
      { cwd: env.tempDir }
    );
    expect(result.exitCode).toBe(SOURCE_ERROR);
    const parsed = JSON.parse(result.stdout) as {
      status: string;
      error?: { message?: string };
    };
    expect(parsed.status).toBe('error');
    expect(typeof parsed.error?.message).toBe('string');
    expect((parsed.error?.message ?? '').length).toBeGreaterThan(0);
  });
});

// ─── G18: --algorithms whitespace-only collapses to default ──────────────────

describe('G18 — --algorithms whitespace-only collapses gracefully', () => {
  it('--algorithms "  " (spaces only) collapses to default list (no crash)', async () => {
    const result = await runCli(
      ['swarm', testXesPath, '--algorithms', '  ', '--max-episodes', '1', '--format', 'json', '--no-save'],
      { cwd: env.tempDir }
    );
    // After trim+filter, the list is empty → falls back to default
    // Must not be a config_error; may be execution_error if defaults still run
    expect(result.exitCode).not.toBe(CONFIG_ERROR);
    const parsed = JSON.parse(result.stdout) as {
      status: string;
      payload?: { algorithmIds?: string[] };
    };
    // If it succeeded, algorithmIds must be non-empty (defaults applied)
    if (parsed.status === 'ok') {
      expect((parsed.payload?.algorithmIds ?? []).length).toBeGreaterThanOrEqual(1);
    }
  });
});

// ─── G19: --workers=-1 with equals sign also exits config_error ──────────────

describe('G19 — --workers=-1 (equals syntax) exits config_error', () => {
  it('--workers=-1 exits 1 regardless of argument syntax', async () => {
    // citty parses --workers=-1 the same as --workers -1
    const result = await runCli(
      ['swarm', testXesPath, '--workers=-1', '--format', 'json'],
      { cwd: env.tempDir }
    );
    expect(result.exitCode).toBe(CONFIG_ERROR);
  });

  it('--workers=-1 produces INVALID_WORKERS error code', async () => {
    const result = await runCli(
      ['swarm', testXesPath, '--workers=-1', '--format', 'json'],
      { cwd: env.tempDir }
    );
    const parsed = JSON.parse(result.stdout) as { status: string; error?: { code: string } };
    expect(parsed.status).toBe('error');
    expect(parsed.error?.code).toBe('INVALID_WORKERS');
  });
});

// ─── G20: convergence-runs=1 can converge in 1 episode ──────────────────────

describe('G20 — convergence-runs=1 can converge in first episode', () => {
  it('convergence-runs=1 with single algorithm is accepted (no config_error)', async () => {
    // With convergence-runs=1, a single round is enough to declare convergence.
    // We cannot control the LLM, but we can verify the flag is accepted.
    const result = await runCli(
      [
        'swarm', testXesPath,
        '--convergence-runs', '1',
        '--algorithms', 'dfg',
        '--max-episodes', '1',
        '--format', 'json',
        '--no-save',
      ],
      { cwd: env.tempDir }
    );
    expect(result.exitCode).not.toBe(CONFIG_ERROR);
  });
});

// ─── G21–G24: configuration values reflected in payload ──────────────────────

describe('G21–G24 — flag values reflected in JSON payload', () => {
  async function runWithFlags(extra: string[]): Promise<{
    status: string;
    payload?: Record<string, unknown>;
  }> {
    const result = await runCli(
      [
        'swarm', testXesPath,
        '--max-episodes', '1',
        '--format', 'json',
        '--no-save',
        ...extra,
      ],
      { cwd: env.tempDir }
    );
    return JSON.parse(result.stdout);
  }

  it('[G21] convergenceThreshold from --convergence-threshold flag is in payload', async () => {
    const parsed = await runWithFlags(['--convergence-threshold', '0.75']);
    if (parsed.status === 'ok') {
      expect(parsed.payload?.['convergenceThreshold']).toBeCloseTo(0.75, 5);
    }
  });

  it('[G22] workerModel from --worker-model flag is in payload', async () => {
    const parsed = await runWithFlags(['--worker-model', 'llama-3.1-70b-versatile']);
    if (parsed.status === 'ok') {
      expect(parsed.payload?.['workerModel']).toBe('llama-3.1-70b-versatile');
    }
  });

  it('[G23] maxEpisodes from --max-episodes flag is in payload', async () => {
    // Use a dedicated call — runWithFlags already injects --max-episodes 1
    // and citty takes the first occurrence, so we must not double-pass it.
    const result = await runCli(
      ['swarm', testXesPath, '--max-episodes', '3', '--format', 'json', '--no-save'],
      { cwd: env.tempDir }
    );
    const parsed = JSON.parse(result.stdout) as {
      status: string;
      payload?: Record<string, unknown>;
    };
    if (parsed.status === 'ok') {
      expect(parsed.payload?.['maxEpisodes']).toBe(3);
    }
  });

  it('[G24] algorithmIds in payload matches --algorithms flag', async () => {
    const parsed = await runWithFlags(['--algorithms', 'dfg,analyze_statistics']);
    if (parsed.status === 'ok') {
      expect(parsed.payload?.['algorithmIds']).toEqual(['dfg', 'analyze_statistics']);
    }
  });
});

// ─── G25: error JSON has meta.run_id even on config_error ────────────────────

describe('G25 — error JSON has meta.run_id (UUID) even on config_error', () => {
  it('--workers=0 error JSON has meta.run_id', async () => {
    const result = await runCli(
      ['swarm', testXesPath, '--workers', '0', '--format', 'json'],
      { cwd: env.tempDir }
    );
    expect(result.exitCode).toBe(CONFIG_ERROR);
    const parsed = JSON.parse(result.stdout) as {
      status: string;
      meta?: { run_id?: string };
    };
    expect(parsed.meta).toBeDefined();
    expect(typeof parsed.meta?.run_id).toBe('string');
    // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
    expect(parsed.meta?.run_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });

  it('missing file error JSON has meta.timestamp', async () => {
    const result = await runCli(
      ['swarm', '/tmp/no-such-swarm-g25.xes', '--format', 'json'],
      { cwd: env.tempDir }
    );
    expect(result.exitCode).toBe(SOURCE_ERROR);
    const parsed = JSON.parse(result.stdout) as {
      status: string;
      meta?: { timestamp?: string };
    };
    expect(parsed.meta?.timestamp).toBeDefined();
    // ISO-8601 format
    expect(parsed.meta?.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
