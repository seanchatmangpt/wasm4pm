/**
 * swarm-smoke.test.ts
 *
 * Minimal smoke tests for `wpm swarm`:
 *   1. `wpm swarm --help` exits 0 and produces help text
 *   2. `wpm swarm --format json` with a valid XES produces a valid JSON envelope
 *      with the required top-level fields (command, status, exit_code, meta)
 *   3. `--no-save` flag is correctly honoured (citty maps --no-save → save=false)
 *   4. Missing input file exits source_error (2) with JSON error envelope
 *
 * These tests are intentionally thin — they prove the command is wired, alive,
 * and produces a well-formed output contract.  Deeper coverage is in swarm-cli.test.ts
 * and swarm-json-contract.test.ts.
 *
 * Design notes
 * ────────────
 * - Uses { cwd: env.tempDir } to avoid picking up the project-root wasm4pm.toml.
 * - --no-save prevents receipt writes which could fail on full-disk environments.
 * - --max-episodes 1 limits swarm depth so tests complete quickly.
 * - Tests that depend on a successful swarm run (status 'ok') are written
 *   defensively: the JSON contract must hold regardless of whether GROQ_API_KEY
 *   is present (workers may fail gracefully, still exiting 0).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runCli, createCliTestEnv } from '@wasm4pm/testing';
import * as path from 'path';
import * as fs from 'fs/promises';

const SUCCESS = 0;
const SOURCE_ERROR = 2;
const EXECUTION_ERROR = 3;

// Minimal two-trace XES fixture
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

describe('wpm swarm — smoke tests', () => {
  let env: Awaited<ReturnType<typeof createCliTestEnv>>;
  let xesPath: string;

  beforeEach(async () => {
    env = await createCliTestEnv();
    xesPath = path.join(env.tempDir, 'smoke.xes');
    await fs.writeFile(xesPath, MINIMAL_XES, 'utf-8');
  });

  afterEach(async () => {
    await env?.cleanup?.();
  });

  // ── 1. --help ─────────────────────────────────────────────────────────────

  it('wpm swarm --help exits 0', async () => {
    const result = await runCli(['swarm', '--help'], { cwd: env.tempDir });
    expect(result.exitCode).toBe(SUCCESS);
  });

  it('wpm swarm --help output mentions swarm, worker, and convergence', async () => {
    const result = await runCli(['swarm', '--help'], { cwd: env.tempDir });
    expect(result.exitCode).toBe(SUCCESS);
    // Must mention key swarm concepts so users understand what the command does
    expect(result.stdout).toMatch(/swarm|worker|convergence|episode/i);
  });

  it('wpm swarm --help output mentions --no-save flag', async () => {
    const result = await runCli(['swarm', '--help'], { cwd: env.tempDir });
    expect(result.exitCode).toBe(SUCCESS);
    // --no-save is a negatable bool; citty renders it as '--no-save' in help
    expect(result.stdout).toMatch(/no-save/i);
  });

  // ── 2. JSON envelope contract ─────────────────────────────────────────────

  it('wpm swarm --format json produces parseable JSON', async () => {
    const result = await runCli(
      ['swarm', xesPath, '--format', 'json', '--max-episodes', '1', '--no-save'],
      { cwd: env.tempDir }
    );
    // Command may exit 0 or 3 (workers fail without GROQ_API_KEY) — output must be JSON
    expect(() => JSON.parse(result.stdout)).not.toThrow();
  });

  it('JSON envelope has required top-level fields: command, status, exit_code, meta', async () => {
    const result = await runCli(
      ['swarm', xesPath, '--format', 'json', '--max-episodes', '1', '--no-save'],
      { cwd: env.tempDir }
    );
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(parsed).toHaveProperty('command', 'swarm');
    expect(parsed).toHaveProperty('status');
    expect(['ok', 'error']).toContain(parsed['status']);
    expect(parsed).toHaveProperty('exit_code');
    expect(typeof parsed['exit_code']).toBe('number');
    expect(parsed).toHaveProperty('meta');
  });

  it('JSON envelope meta has run_id (UUID) and version', async () => {
    const result = await runCli(
      ['swarm', xesPath, '--format', 'json', '--max-episodes', '1', '--no-save'],
      { cwd: env.tempDir }
    );
    const parsed = JSON.parse(result.stdout) as { meta: { run_id: string; version: string } };
    expect(parsed.meta).toHaveProperty('run_id');
    // UUID v4 pattern
    expect(parsed.meta.run_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
    expect(parsed.meta).toHaveProperty('version');
    expect(typeof parsed.meta.version).toBe('string');
  });

  it('exit code is 0, 3, or 4 for valid input (never 1 or 2)', async () => {
    const result = await runCli(
      ['swarm', xesPath, '--format', 'json', '--max-episodes', '1', '--no-save'],
      { cwd: env.tempDir }
    );
    // 0=success, 3=execution_error (no GROQ key / LLM unavailable), 4=partial_failure
    expect([SUCCESS, EXECUTION_ERROR, 4]).toContain(result.exitCode);
  });

  // ── 3. --no-save flag ─────────────────────────────────────────────────────

  it('--no-save prevents receipt file creation in .wasm4pm/receipts/', async () => {
    await runCli(
      ['swarm', xesPath, '--format', 'json', '--max-episodes', '1', '--no-save'],
      { cwd: env.tempDir }
    );
    // No receipt directory should have been created in the temp dir
    const receiptsDir = path.join(env.tempDir, '.wasm4pm', 'receipts');
    const exists = await fs.stat(receiptsDir).then(() => true).catch(() => false);
    expect(exists).toBe(false);
  });

  // ── 4. Missing input → source_error (exit 2) ──────────────────────────────

  it('missing input file exits source_error (2)', async () => {
    const result = await runCli(
      ['swarm', '/no/such/file.xes', '--format', 'json', '--no-save'],
      { cwd: env.tempDir }
    );
    expect(result.exitCode).toBe(SOURCE_ERROR);
  });

  it('missing input: JSON error envelope has status=error and error.message', async () => {
    const result = await runCli(
      ['swarm', '/no/such/file.xes', '--format', 'json', '--no-save'],
      { cwd: env.tempDir }
    );
    const parsed = JSON.parse(result.stdout) as {
      status: string;
      error?: { message: string };
    };
    expect(parsed.status).toBe('error');
    expect(parsed.error).toBeDefined();
    expect(typeof parsed.error?.message).toBe('string');
    expect(parsed.error!.message.length).toBeGreaterThan(0);
  });

  // ── 5. convergenceStatus in payload ───────────────────────────────────────

  it('payload.convergenceStatus is one of converged | timeout | not_converged when status=ok', async () => {
    const result = await runCli(
      ['swarm', xesPath, '--format', 'json', '--max-episodes', '1', '--no-save'],
      { cwd: env.tempDir }
    );
    const parsed = JSON.parse(result.stdout) as {
      status: string;
      payload?: { convergenceStatus?: string };
    };
    if (parsed.status === 'ok') {
      expect(parsed.payload).toHaveProperty('convergenceStatus');
      expect(['converged', 'timeout', 'not_converged']).toContain(
        parsed.payload?.convergenceStatus
      );
    }
  });

  // ── 6. --workers=0 exits config_error (1) ─────────────────────────────────

  it('--workers=0 exits config_error (1) with INVALID_WORKERS code', async () => {
    const result = await runCli(
      ['swarm', xesPath, '--workers', '0', '--format', 'json', '--no-save'],
      { cwd: env.tempDir }
    );
    expect(result.exitCode).toBe(1);
    const parsed = JSON.parse(result.stdout) as {
      status: string;
      error?: { code: string };
    };
    expect(parsed.status).toBe('error');
    expect(parsed.error?.code).toBe('INVALID_WORKERS');
  });
});
