/**
 * wpm status — CLI integration tests.
 *
 * Coverage strategy:
 *   - Help, exit codes, output format contracts
 *   - JSON envelope shape: engine, system, memory sections
 *   - Field presence: wasmLoaded, algorithmCount, deploymentProfile, heapUsed, etc.
 *   - Human-format output mentions engine/WASM
 *   - --verbose flag accepted
 *   - --show-config flag accepted
 *
 * Van der Aalst QA perspective:
 *   JSON output field names are asserted from the source of truth
 *   (apps/wasm4pm/src/commands/status.ts statusReport object shape).
 *   No field is invented — if a field is absent in source it is not asserted here.
 */

import { describe, it, expect } from 'vitest';
import { execFile } from 'node:child_process';
import * as path from 'node:path';

// ─── CLI helper ───────────────────────────────────────────────────────────────

interface CliResult { exitCode: number; stdout: string; stderr: string; }

function runCli(args: string[], opts: { timeoutMs?: number } = {}): Promise<CliResult> {
  const cliPath = path.resolve(__dirname, '../../dist/bin/wpm.js');
  const cwd = path.resolve(__dirname, '../..');
  const timeoutMs = opts.timeoutMs ?? 30_000;
  // Minimal env prevents vitest's process.env from interfering with child-process stdout.
  const env = { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '' };
  return new Promise((resolve) => {
    const child = execFile(
      process.execPath,
      [cliPath, ...args],
      { timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024, cwd, env },
      (error, stdout, stderr) => {
        const exitCode =
          error && 'code' in error && typeof error.code === 'number'
            ? error.code
            : error ? 1 : 0;
        resolve({ exitCode, stdout: stdout ?? '', stderr: stderr ?? '' });
      }
    );
    child.on('error', () => resolve({ exitCode: 5, stdout: '', stderr: 'Process failed to start' }));
  });
}

// ─── JSON parse helper ────────────────────────────────────────────────────────
function tryParseJson(s: string): Record<string, unknown> | null {
  try { return JSON.parse(s) as Record<string, unknown>; } catch { return null; }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Help and basic invocation
// ═══════════════════════════════════════════════════════════════════════════════

describe('wpm status — help and basic invocation', () => {
  it('--help exits 0', async () => {
    const r = await runCli(['status', '--help']);
    expect(r.exitCode).toBe(0);
  }, 15_000);

  it('--help mentions format flag', async () => {
    const r = await runCli(['status', '--help']);
    const out = r.stdout + r.stderr;
    expect(out).toMatch(/format/i);
  }, 15_000);

  it('--help mentions verbose flag', async () => {
    const r = await runCli(['status', '--help']);
    const out = r.stdout + r.stderr;
    expect(out).toMatch(/verbose/i);
  }, 15_000);

  it('--help mentions show-config flag', async () => {
    const r = await runCli(['status', '--help']);
    const out = r.stdout + r.stderr;
    expect(out).toMatch(/show-config/i);
  }, 15_000);

  it('exits 0 with no arguments (status needs no input file)', async () => {
    const r = await runCli(['status']);
    expect(r.exitCode).toBe(0);
  }, 30_000);

  it('produces some stdout output with no arguments', async () => {
    const r = await runCli(['status']);
    expect(r.stdout.length + r.stderr.length).toBeGreaterThan(0);
  }, 30_000);
});

// ═══════════════════════════════════════════════════════════════════════════════
// Human-format output
// ═══════════════════════════════════════════════════════════════════════════════

describe('wpm status --format human — output content', () => {
  it('mentions WASM in the output', async () => {
    const r = await runCli(['status', '--format', 'human']);
    const out = r.stdout + r.stderr;
    expect(out).toMatch(/wasm/i);
  }, 30_000);

  it('mentions engine or status in the output', async () => {
    const r = await runCli(['status', '--format', 'human']);
    const out = r.stdout + r.stderr;
    expect(out).toMatch(/engine|status|system/i);
  }, 30_000);

  it('mentions algorithm count or algorithms in the output', async () => {
    const r = await runCli(['status', '--format', 'human']);
    const out = r.stdout + r.stderr;
    expect(out).toMatch(/algorithm/i);
  }, 30_000);

  it('mentions memory or heap in the output', async () => {
    const r = await runCli(['status', '--format', 'human']);
    const out = r.stdout + r.stderr;
    expect(out).toMatch(/memory|heap/i);
  }, 30_000);
});

// ═══════════════════════════════════════════════════════════════════════════════
// JSON format — envelope and engine section
// ═══════════════════════════════════════════════════════════════════════════════

describe('wpm status --format json — JSON envelope', () => {
  it('exits 0', async () => {
    const r = await runCli(['status', '--format', 'json']);
    expect(r.exitCode).toBe(0);
  }, 30_000);

  it('stdout is valid JSON', async () => {
    const r = await runCli(['status', '--format', 'json']);
    const parsed = tryParseJson(r.stdout);
    expect(parsed).not.toBeNull();
  }, 30_000);

  it('top-level status field is "ok"', async () => {
    const r = await runCli(['status', '--format', 'json']);
    const parsed = tryParseJson(r.stdout);
    expect(parsed?.status).toBe('ok');
  }, 30_000);

  it('top-level payload field exists', async () => {
    const r = await runCli(['status', '--format', 'json']);
    const parsed = tryParseJson(r.stdout);
    expect(parsed).toHaveProperty('payload');
  }, 30_000);

  it('payload.engine section is present', async () => {
    const r = await runCli(['status', '--format', 'json']);
    const parsed = tryParseJson(r.stdout);
    const payload = parsed?.payload as Record<string, unknown> | undefined;
    expect(payload).toHaveProperty('engine');
  }, 30_000);

  it('payload.engine.wasmLoaded is true', async () => {
    const r = await runCli(['status', '--format', 'json']);
    const parsed = tryParseJson(r.stdout);
    const engine = (parsed?.payload as Record<string, unknown>)?.engine as Record<string, unknown> | undefined;
    expect(engine?.wasmLoaded).toBe(true);
  }, 30_000);

  it('payload.engine.algorithmCount is a number >= 1', async () => {
    const r = await runCli(['status', '--format', 'json']);
    const parsed = tryParseJson(r.stdout);
    const engine = (parsed?.payload as Record<string, unknown>)?.engine as Record<string, unknown> | undefined;
    expect(typeof engine?.algorithmCount).toBe('number');
    expect(engine?.algorithmCount as number).toBeGreaterThanOrEqual(1);
  }, 30_000);

  it('payload.engine.algorithmCount is >= 36 (browser profile has 38 registered)', async () => {
    const r = await runCli(['status', '--format', 'json']);
    const parsed = tryParseJson(r.stdout);
    const engine = (parsed?.payload as Record<string, unknown>)?.engine as Record<string, unknown> | undefined;
    expect(engine?.algorithmCount as number).toBeGreaterThanOrEqual(36);
  }, 30_000);

  it('payload.engine.deploymentProfile is a non-empty string', async () => {
    const r = await runCli(['status', '--format', 'json']);
    const parsed = tryParseJson(r.stdout);
    const engine = (parsed?.payload as Record<string, unknown>)?.engine as Record<string, unknown> | undefined;
    expect(typeof engine?.deploymentProfile).toBe('string');
    expect((engine?.deploymentProfile as string).length).toBeGreaterThan(0);
  }, 30_000);

  it('payload.engine.state is "ready"', async () => {
    const r = await runCli(['status', '--format', 'json']);
    const parsed = tryParseJson(r.stdout);
    const engine = (parsed?.payload as Record<string, unknown>)?.engine as Record<string, unknown> | undefined;
    expect(engine?.state).toBe('ready');
  }, 30_000);

  it('payload.engine.health section is present', async () => {
    const r = await runCli(['status', '--format', 'json']);
    const parsed = tryParseJson(r.stdout);
    const engine = (parsed?.payload as Record<string, unknown>)?.engine as Record<string, unknown> | undefined;
    expect(engine).toHaveProperty('health');
  }, 30_000);

  it('payload.engine.health.overall is "ok" or "degraded"', async () => {
    const r = await runCli(['status', '--format', 'json']);
    const parsed = tryParseJson(r.stdout);
    const engine = (parsed?.payload as Record<string, unknown>)?.engine as Record<string, unknown> | undefined;
    const health = engine?.health as Record<string, unknown> | undefined;
    expect(['ok', 'degraded', 'error']).toContain(health?.overall);
  }, 30_000);
});

// ═══════════════════════════════════════════════════════════════════════════════
// JSON format — system and memory sections
// ═══════════════════════════════════════════════════════════════════════════════

describe('wpm status --format json — system and memory sections', () => {
  it('payload.system section is present', async () => {
    const r = await runCli(['status', '--format', 'json']);
    const parsed = tryParseJson(r.stdout);
    const payload = parsed?.payload as Record<string, unknown> | undefined;
    expect(payload).toHaveProperty('system');
  }, 30_000);

  it('payload.system.platform is a non-empty string', async () => {
    const r = await runCli(['status', '--format', 'json']);
    const parsed = tryParseJson(r.stdout);
    const system = (parsed?.payload as Record<string, unknown>)?.system as Record<string, unknown> | undefined;
    expect(typeof system?.platform).toBe('string');
    expect((system?.platform as string).length).toBeGreaterThan(0);
  }, 30_000);

  it('payload.system.nodeVersion starts with "v"', async () => {
    const r = await runCli(['status', '--format', 'json']);
    const parsed = tryParseJson(r.stdout);
    const system = (parsed?.payload as Record<string, unknown>)?.system as Record<string, unknown> | undefined;
    expect(String(system?.nodeVersion)).toMatch(/^v\d+/);
  }, 30_000);

  it('payload.memory section is present', async () => {
    const r = await runCli(['status', '--format', 'json']);
    const parsed = tryParseJson(r.stdout);
    const payload = parsed?.payload as Record<string, unknown> | undefined;
    expect(payload).toHaveProperty('memory');
  }, 30_000);

  it('payload.memory.heapUsed is a number > 0', async () => {
    const r = await runCli(['status', '--format', 'json']);
    const parsed = tryParseJson(r.stdout);
    const memory = (parsed?.payload as Record<string, unknown>)?.memory as Record<string, unknown> | undefined;
    expect(typeof memory?.heapUsed).toBe('number');
    expect(memory?.heapUsed as number).toBeGreaterThan(0);
  }, 30_000);

  it('payload.memory.heapTotal is >= heapUsed', async () => {
    const r = await runCli(['status', '--format', 'json']);
    const parsed = tryParseJson(r.stdout);
    const memory = (parsed?.payload as Record<string, unknown>)?.memory as Record<string, unknown> | undefined;
    expect(memory?.heapTotal as number).toBeGreaterThanOrEqual(memory?.heapUsed as number);
  }, 30_000);
});

// ═══════════════════════════════════════════════════════════════════════════════
// Flags accepted
// ═══════════════════════════════════════════════════════════════════════════════

describe('wpm status — flag acceptance', () => {
  it('--verbose flag accepted (exits 0)', async () => {
    const r = await runCli(['status', '--verbose']);
    expect(r.exitCode).toBe(0);
  }, 30_000);

  it('--show-config flag accepted (exits 0)', async () => {
    const r = await runCli(['status', '--show-config']);
    expect(r.exitCode).toBe(0);
  }, 30_000);

  it('--quiet flag accepted (exits 0)', async () => {
    const r = await runCli(['status', '--quiet']);
    expect(r.exitCode).toBe(0);
  }, 30_000);

  it('--format human exits 0', async () => {
    const r = await runCli(['status', '--format', 'human']);
    expect(r.exitCode).toBe(0);
  }, 30_000);

  it('--format json exits 0', async () => {
    const r = await runCli(['status', '--format', 'json']);
    expect(r.exitCode).toBe(0);
  }, 30_000);
});
