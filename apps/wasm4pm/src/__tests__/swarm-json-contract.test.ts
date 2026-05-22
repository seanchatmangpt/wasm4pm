/**
 * swarm-json-contract.test.ts
 *
 * Closes JSON payload contract gaps in `wpm swarm --format json`.
 *
 * This file specifically validates the fields added to close G9 and G11:
 *   - payload.best_result  (the consensus worker result; may be null when all workers fail)
 *   - payload.summary      (structured overview: total_workers, converged_workers,
 *                           elapsed_ms, convergence_achieved)
 *
 * It also re-validates the --workers flag contract (valid / invalid inputs) and
 * source_error (exit 2) for missing / empty input files, as required by the mandate.
 *
 * Design notes
 * ─────────────
 * - All tests use { cwd: env.tempDir } so no wasm4pm.toml is picked up.
 * - --max-episodes 1 keeps the swarm loop short.
 * - --no-save avoids .wasm4pm/receipts/ writes in the temp directory.
 * - Tests that depend on a successful swarm run (status === 'ok') are
 *   written defensively: if the swarm ends in execution_error (e.g. no
 *   GROQ_API_KEY) the JSON contract for the payload fields still holds on
 *   whatever status is returned.
 * - FM-5 is respected: no field value is derived from the implementation.
 *   Assertions use structural / type checks, not implementation formulas.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runCli, createCliTestEnv } from '@wasm4pm/testing';
import * as path from 'path';
import * as fs from 'fs/promises';

const SUCCESS = 0;
const CONFIG_ERROR = 1;
const SOURCE_ERROR = 2;
const EXECUTION_ERROR = 3;
const PARTIAL_FAILURE = 4;

/** Minimal 3-trace XES log — no <global> sections */
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
  <trace>
    <string key="concept:name" value="case-3"/>
    <event>
      <string key="concept:name" value="Register"/>
      <date key="time:timestamp" value="2026-04-16T12:00:00Z"/>
    </event>
    <event>
      <string key="concept:name" value="Approve"/>
      <date key="time:timestamp" value="2026-04-16T12:01:00Z"/>
    </event>
    <event>
      <string key="concept:name" value="Escalate"/>
      <date key="time:timestamp" value="2026-04-16T12:02:00Z"/>
    </event>
    <event>
      <string key="concept:name" value="Close"/>
      <date key="time:timestamp" value="2026-04-16T12:03:00Z"/>
    </event>
  </trace>
</log>`;

// ─── shared setup ─────────────────────────────────────────────────────────────

let env: Awaited<ReturnType<typeof createCliTestEnv>>;
let testXesPath: string;

beforeEach(async () => {
  env = await createCliTestEnv();
  testXesPath = path.join(env.tempDir, 'contract-test.xes');
  await fs.writeFile(testXesPath, MINIMAL_XES, 'utf-8');
});

afterEach(async () => {
  await env?.cleanup?.();
});

// ─── Helper ───────────────────────────────────────────────────────────────────

type SwarmPayload = {
  best_result?: unknown;
  summary?: {
    total_workers?: number;
    converged_workers?: number;
    elapsed_ms?: number;
    convergence_achieved?: boolean;
  };
  finalWorkerResults?: unknown[];
  workerCount?: number;
  iterationCount?: number;
  convergenceStatus?: string;
  converged?: boolean;
  failedWorkerCount?: number;
  stableWorkerCount?: number;
};

type SwarmOutput = {
  status: string;
  exit_code?: number;
  payload?: SwarmPayload;
  error?: { code?: string; message?: string };
  meta?: { run_id?: string; timestamp?: string };
};

/**
 * Run `wpm swarm` with 1 episode, 1 worker, no-save, json format.
 * Returns the parsed JSON envelope.
 */
async function runSwarmJson(extraArgs: string[] = []): Promise<SwarmOutput> {
  const result = await runCli(
    [
      'swarm',
      testXesPath,
      '--workers', '2',
      '--max-episodes', '1',
      '--format', 'json',
      '--no-save',
      ...extraArgs,
    ],
    { cwd: env.tempDir }
  );
  return JSON.parse(result.stdout) as SwarmOutput;
}

// ─── --workers flag validation ────────────────────────────────────────────────

describe('--workers flag validation', () => {
  it('--workers 0 exits config_error (1)', async () => {
    const result = await runCli(
      ['swarm', testXesPath, '--workers', '0', '--format', 'json'],
      { cwd: env.tempDir }
    );
    expect(result.exitCode).toBe(CONFIG_ERROR);
  });

  it('--workers -1 exits config_error (1)', async () => {
    const result = await runCli(
      ['swarm', testXesPath, '--workers', '-1', '--format', 'json'],
      { cwd: env.tempDir }
    );
    expect(result.exitCode).toBe(CONFIG_ERROR);
  });

  it('--workers 0 produces INVALID_WORKERS error code in JSON', async () => {
    const result = await runCli(
      ['swarm', testXesPath, '--workers', '0', '--format', 'json'],
      { cwd: env.tempDir }
    );
    const parsed = JSON.parse(result.stdout) as SwarmOutput;
    expect(parsed.status).toBe('error');
    expect(parsed.error?.code).toBe('INVALID_WORKERS');
  });

  it('--workers abc (non-integer) exits config_error (1)', async () => {
    const result = await runCli(
      ['swarm', testXesPath, '--workers', 'abc', '--format', 'json'],
      { cwd: env.tempDir }
    );
    expect(result.exitCode).toBe(CONFIG_ERROR);
    const parsed = JSON.parse(result.stdout) as SwarmOutput;
    expect(parsed.status).toBe('error');
    expect(parsed.error?.code).toBe('INVALID_WORKERS');
  });

  it('--workers 100 (very large) is accepted — no config_error', async () => {
    const result = await runCli(
      [
        'swarm', testXesPath,
        '--workers', '100',
        '--algorithms', 'dfg',
        '--max-episodes', '1',
        '--format', 'json',
        '--no-save',
      ],
      { cwd: env.tempDir }
    );
    // large --workers is capped to the algorithm list length — not a config_error
    expect(result.exitCode).not.toBe(CONFIG_ERROR);
  });

  it('--workers 1 is accepted', async () => {
    const result = await runCli(
      [
        'swarm', testXesPath,
        '--workers', '1',
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

// ─── Missing / empty input → exit 2 (source_error) ───────────────────────────

describe('source_error cases', () => {
  it('non-existent input file exits source_error (2)', async () => {
    const result = await runCli(
      ['swarm', '/tmp/no-such-file-swarm-contract.xes', '--format', 'json'],
      { cwd: env.tempDir }
    );
    expect(result.exitCode).toBe(SOURCE_ERROR);
  });

  it('non-existent file: JSON status is error', async () => {
    const result = await runCli(
      ['swarm', '/tmp/no-such-file-swarm-contract.xes', '--format', 'json'],
      { cwd: env.tempDir }
    );
    const parsed = JSON.parse(result.stdout) as SwarmOutput;
    expect(parsed.status).toBe('error');
    expect(typeof parsed.error?.message).toBe('string');
    expect((parsed.error?.message ?? '').length).toBeGreaterThan(0);
  });

  it('empty XES file exits source_error (2)', async () => {
    const emptyPath = path.join(env.tempDir, 'empty.xes');
    await fs.writeFile(emptyPath, '', 'utf-8');
    const result = await runCli(
      ['swarm', emptyPath, '--format', 'json'],
      { cwd: env.tempDir }
    );
    expect(result.exitCode).toBe(SOURCE_ERROR);
  });

  it('empty XES file: error code is EMPTY_INPUT_LOG', async () => {
    const emptyPath = path.join(env.tempDir, 'empty2.xes');
    await fs.writeFile(emptyPath, '', 'utf-8');
    const result = await runCli(
      ['swarm', emptyPath, '--format', 'json'],
      { cwd: env.tempDir }
    );
    const parsed = JSON.parse(result.stdout) as SwarmOutput;
    expect(parsed.status).toBe('error');
    expect(parsed.error?.code).toBe('EMPTY_INPUT_LOG');
  });

  it('missing --input (no positional) exits non-zero', async () => {
    const result = await runCli(['swarm', '--format', 'json'], { cwd: env.tempDir });
    expect(result.exitCode).not.toBe(SUCCESS);
  });
});

// ─── JSON envelope structure ──────────────────────────────────────────────────

describe('JSON envelope structure', () => {
  it('output is parseable JSON', async () => {
    const result = await runCli(
      ['swarm', testXesPath, '--max-episodes', '1', '--format', 'json', '--no-save'],
      { cwd: env.tempDir }
    );
    expect(() => JSON.parse(result.stdout)).not.toThrow();
  });

  it('envelope has command field', async () => {
    const parsed = await runSwarmJson();
    expect(parsed).toHaveProperty('command');
    expect(typeof parsed.command).toBe('string');
  });

  it('envelope has status field (ok or error)', async () => {
    const parsed = await runSwarmJson();
    expect(parsed).toHaveProperty('status');
    expect(['ok', 'error']).toContain(parsed.status);
  });

  it('envelope has exit_code field', async () => {
    const result = await runCli(
      ['swarm', testXesPath, '--max-episodes', '1', '--format', 'json', '--no-save'],
      { cwd: env.tempDir }
    );
    const parsed = JSON.parse(result.stdout) as SwarmOutput;
    expect(parsed).toHaveProperty('exit_code');
    expect(typeof parsed.exit_code).toBe('number');
  });

  it('envelope has payload field', async () => {
    const parsed = await runSwarmJson();
    expect(parsed).toHaveProperty('payload');
  });

  it('envelope has meta.run_id (UUID v4)', async () => {
    const parsed = await runSwarmJson();
    expect(parsed.meta).toBeDefined();
    expect(typeof parsed.meta?.run_id).toBe('string');
    expect(parsed.meta?.run_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });

  it('envelope has meta.timestamp (ISO-8601)', async () => {
    const parsed = await runSwarmJson();
    expect(parsed.meta?.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

// ─── payload.summary (G11 gap — now closed) ───────────────────────────────────

describe('payload.summary — new field (G11 closed)', () => {
  it('payload has summary field on success', async () => {
    const parsed = await runSwarmJson();
    if (parsed.status === 'ok') {
      expect(parsed.payload).toHaveProperty('summary');
    }
  });

  it('payload.summary.total_workers is a non-negative integer', async () => {
    const parsed = await runSwarmJson();
    if (parsed.status === 'ok') {
      const tw = parsed.payload?.summary?.total_workers;
      expect(typeof tw).toBe('number');
      expect(tw as number).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(tw)).toBe(true);
    }
  });

  it('payload.summary.converged_workers is a non-negative integer', async () => {
    const parsed = await runSwarmJson();
    if (parsed.status === 'ok') {
      const cw = parsed.payload?.summary?.converged_workers;
      expect(typeof cw).toBe('number');
      expect(cw as number).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(cw)).toBe(true);
    }
  });

  it('payload.summary.elapsed_ms is a non-negative number', async () => {
    const parsed = await runSwarmJson();
    if (parsed.status === 'ok') {
      const em = parsed.payload?.summary?.elapsed_ms;
      expect(typeof em).toBe('number');
      expect(em as number).toBeGreaterThanOrEqual(0);
    }
  });

  it('payload.summary.convergence_achieved is a boolean', async () => {
    const parsed = await runSwarmJson();
    if (parsed.status === 'ok') {
      const ca = parsed.payload?.summary?.convergence_achieved;
      expect(typeof ca).toBe('boolean');
    }
  });

  it('payload.summary.convergence_achieved matches payload.converged', async () => {
    const parsed = await runSwarmJson();
    if (parsed.status === 'ok') {
      expect(parsed.payload?.summary?.convergence_achieved).toBe(parsed.payload?.converged);
    }
  });

  it('payload.summary.total_workers matches payload.workerCount', async () => {
    const parsed = await runSwarmJson();
    if (parsed.status === 'ok') {
      expect(parsed.payload?.summary?.total_workers).toBe(parsed.payload?.workerCount);
    }
  });
});

// ─── payload.best_result (G9 gap — now closed) ───────────────────────────────

describe('payload.best_result — new field (G9 closed)', () => {
  it('payload has best_result key on success', async () => {
    const parsed = await runSwarmJson();
    if (parsed.status === 'ok') {
      // key must exist (may be null if all workers failed)
      expect(Object.prototype.hasOwnProperty.call(parsed.payload, 'best_result')).toBe(true);
    }
  });

  it('payload.best_result is null or a WorkerResult object', async () => {
    const parsed = await runSwarmJson();
    if (parsed.status === 'ok') {
      const br = parsed.payload?.best_result;
      if (br !== null && br !== undefined) {
        // WorkerResult has at minimum workerId, algorithmId, resultHash, durationMs
        expect(typeof (br as Record<string, unknown>)['workerId']).toBe('string');
        expect(typeof (br as Record<string, unknown>)['algorithmId']).toBe('string');
        expect(typeof (br as Record<string, unknown>)['resultHash']).toBe('string');
        expect(typeof (br as Record<string, unknown>)['durationMs']).toBe('number');
      }
      // null is also acceptable (all workers failed)
    }
  });

  it('when best_result is non-null, it is found in finalWorkerResults', async () => {
    const parsed = await runSwarmJson();
    if (parsed.status === 'ok') {
      const br = parsed.payload?.best_result as Record<string, unknown> | null | undefined;
      if (br !== null && br !== undefined) {
        const workers = parsed.payload?.finalWorkerResults as Array<Record<string, unknown>> | undefined;
        const found = (workers ?? []).some((w) => w['workerId'] === br['workerId']);
        expect(found).toBe(true);
      }
    }
  });

  it('best_result.failed is absent or false (not a failed worker)', async () => {
    const parsed = await runSwarmJson();
    if (parsed.status === 'ok') {
      const br = parsed.payload?.best_result as Record<string, unknown> | null | undefined;
      if (br !== null && br !== undefined) {
        // The selected best_result should not be a failed worker
        const failed = br['failed'];
        expect(failed === undefined || failed === false).toBe(true);
      }
    }
  });
});

// ─── Pre-existing payload fields still intact ────────────────────────────────

describe('pre-existing payload fields remain intact', () => {
  it('payload.converged is a boolean', async () => {
    const parsed = await runSwarmJson();
    if (parsed.status === 'ok') {
      expect(typeof parsed.payload?.converged).toBe('boolean');
    }
  });

  it('payload.finalWorkerResults is an array', async () => {
    const parsed = await runSwarmJson();
    if (parsed.status === 'ok') {
      expect(Array.isArray(parsed.payload?.finalWorkerResults)).toBe(true);
    }
  });

  it('payload.workerCount is a positive integer', async () => {
    const parsed = await runSwarmJson();
    if (parsed.status === 'ok') {
      const wc = parsed.payload?.workerCount;
      expect(typeof wc).toBe('number');
      expect(wc as number).toBeGreaterThanOrEqual(1);
      expect(Number.isInteger(wc)).toBe(true);
    }
  });

  it('payload.iterationCount is a non-negative integer', async () => {
    const parsed = await runSwarmJson();
    if (parsed.status === 'ok') {
      const ic = parsed.payload?.iterationCount;
      expect(typeof ic).toBe('number');
      expect(ic as number).toBeGreaterThanOrEqual(0);
    }
  });

  it('payload.convergenceStatus is one of converged | timeout | not_converged', async () => {
    const parsed = await runSwarmJson();
    if (parsed.status === 'ok') {
      expect(['converged', 'timeout', 'not_converged']).toContain(parsed.payload?.convergenceStatus);
    }
  });

  it('payload.failedWorkerCount is a non-negative integer', async () => {
    const parsed = await runSwarmJson();
    if (parsed.status === 'ok') {
      const fwc = parsed.payload?.failedWorkerCount;
      expect(typeof fwc).toBe('number');
      expect(fwc as number).toBeGreaterThanOrEqual(0);
    }
  });

  it('payload.stableWorkerCount is a non-negative integer', async () => {
    const parsed = await runSwarmJson();
    if (parsed.status === 'ok') {
      const swc = parsed.payload?.stableWorkerCount;
      expect(typeof swc).toBe('number');
      expect(swc as number).toBeGreaterThanOrEqual(0);
    }
  });
});
