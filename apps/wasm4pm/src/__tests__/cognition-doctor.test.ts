/**
 * cognition-doctor.test.ts — 5 tests for `wpm cognition doctor`
 *
 * Oracle rank: Rank 2 (Domain contract — exit codes, JSON envelope shape).
 *
 * Tests call `runDoctor()` directly with an injected SpawnFn so no bash
 * process is launched and no module-level patching is required.
 *
 * assertEnvelope pattern verifies:
 *   - command === 'cognition doctor'
 *   - meta.run_id matches UUID v4
 *   - meta.timestamp is within the last 120 seconds
 *   - meta.version matches CalVer pattern
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import { runDoctor } from '../commands/cognition/doctor.js';
import type { SpawnFn } from '../commands/cognition/doctor.js';
import type { OtelSpan } from '@wasm4pm/cognition';

// ── UUID v4 and CalVer regexes ────────────────────────────────────────────────

const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CALVER_RE = /^\d{2}\.(1[0-2]|[1-9])\.([12]\d|3[01]|[1-9])[a-z]?$/;

// ── Envelope assertion ────────────────────────────────────────────────────────

function assertEnvelope(json: unknown): asserts json is {
  status: string;
  command: string;
  meta: { run_id: string; timestamp: string; version: string };
} {
  expect(json).not.toBeNull();
  const obj = json as Record<string, unknown>;

  expect(obj['command']).toBe('cognition doctor');

  const meta = obj['meta'] as Record<string, unknown>;
  expect(meta).toBeDefined();
  expect(UUID_V4_RE.test(meta['run_id'] as string)).toBe(true);
  expect(CALVER_RE.test(meta['version'] as string)).toBe(true);

  const ts = new Date(meta['timestamp'] as string).getTime();
  const now = Date.now();
  expect(ts).toBeGreaterThan(now - 120_000);
  expect(ts).toBeLessThanOrEqual(now + 5_000);
}

// ── Fake spawn factories ──────────────────────────────────────────────────────

/**
 * Returns a SpawnFn that emits the given stdout/stderr and closes with exitCode.
 */
function makeSpawnOk(stdout: string, exitCode: number, stderr = ''): SpawnFn {
  return () => {
    const stdoutEE = new EventEmitter();
    const stderrEE = new EventEmitter();
    const child = new EventEmitter() as ChildProcess;
    (child as unknown as Record<string, unknown>)['stdout'] = stdoutEE;
    (child as unknown as Record<string, unknown>)['stderr'] = stderrEE;

    setImmediate(() => {
      if (stdout) stdoutEE.emit('data', Buffer.from(stdout));
      if (stderr) stderrEE.emit('data', Buffer.from(stderr));
      child.emit('close', exitCode);
    });

    return child;
  };
}

/**
 * Returns a SpawnFn that emits an ENOENT error event (bash unavailable).
 */
function makeSpawnError(message: string): SpawnFn {
  return () => {
    const stdoutEE = new EventEmitter();
    const stderrEE = new EventEmitter();
    const child = new EventEmitter() as ChildProcess;
    (child as unknown as Record<string, unknown>)['stdout'] = stdoutEE;
    (child as unknown as Record<string, unknown>)['stderr'] = stderrEE;

    setImmediate(() => {
      child.emit('error', Object.assign(new Error(message), { code: 'ENOENT' }));
    });

    return child;
  };
}

// ── Report builders ───────────────────────────────────────────────────────────

function allPassReport(): string {
  const checks = Array.from({ length: 11 }, (_, i) => ({
    id: i + 1,
    name: `check ${i + 1}`,
    status: 'ok',
    detail: 'ok',
    duration_ms: 5,
  }));
  return JSON.stringify({
    doctor_version: 1,
    checks,
    summary: { passed: 11, failed: 0, total: 11, duration_ms: 50 },
  });
}

function oneFailReport(): string {
  const checks = Array.from({ length: 11 }, (_, i) => ({
    id: i + 1,
    name: `check ${i + 1}`,
    status: i === 2 ? 'fail' : 'ok',
    detail: i === 2 ? 'something is missing' : 'ok',
    duration_ms: 5,
  }));
  return JSON.stringify({
    doctor_version: 1,
    checks,
    summary: { passed: 10, failed: 1, total: 11, duration_ms: 55 },
  });
}

// ── Test harness ──────────────────────────────────────────────────────────────

/**
 * Runs `runDoctor` with a controlled spawn factory.
 * Captures stdout and intercepts process.exit.
 * Returns { exitCode, output }.
 */
async function invokeDoctor(
  spawnFn: SpawnFn,
  format: 'human' | 'json' = 'json',
  capturedSpans?: OtelSpan[]
): Promise<{ exitCode: number; output: string }> {
  const chunks: string[] = [];
  const origWrite = process.stdout.write.bind(process.stdout);
  (process.stdout as unknown as Record<string, unknown>)['write'] = (
    chunk: string | Buffer
  ): boolean => {
    chunks.push(typeof chunk === 'string' ? chunk : chunk.toString('utf8'));
    return true;
  };

  let exitCode = -1;
  const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code?: number | string) => {
    exitCode = typeof code === 'number' ? code : 0;
    throw new Error(`process.exit(${code})`);
  });

  try {
    await runDoctor({
      format,
      quiet: false,
      scriptPath: '/fake/cognition-doctor.json.sh',
      spawnFn,
      spanSink: capturedSpans ? (s) => capturedSpans.push(s) : undefined,
    });
  } catch {
    // process.exit throws by design in this harness
  } finally {
    (process.stdout as unknown as Record<string, unknown>)['write'] = origWrite;
    exitSpy.mockRestore();
  }

  return { exitCode, output: chunks.join('') };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('cognition doctor', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Test 1: Happy path ────────────────────────────────────────────────────
  it('happy path: 11 ok checks → exit 0 and valid envelope', async () => {
    const { exitCode, output } = await invokeDoctor(makeSpawnOk(allPassReport(), 0));

    expect(exitCode).toBe(0);

    const parsed = JSON.parse(output);
    assertEnvelope(parsed);
    expect(parsed.status).toBe('success');

    const payload = (parsed as Record<string, unknown>)['payload'] as Record<string, unknown>;
    expect((payload['summary'] as Record<string, number>)['total']).toBe(11);
    expect((payload['checks'] as unknown[]).length).toBe(11);
  });

  // ── Test 2: One fail → exit 3 and DOCTOR_CHECK_FAILED ────────────────────
  it('one check fails → exit 3 and DOCTOR_CHECK_FAILED envelope', async () => {
    const { exitCode, output } = await invokeDoctor(makeSpawnOk(oneFailReport(), 1));

    expect(exitCode).toBe(3);

    const parsed = JSON.parse(output) as Record<string, unknown>;
    assertEnvelope(parsed);
    expect(parsed['status']).toBe('error');
    expect(parsed['error_code']).toBe('DOCTOR_CHECK_FAILED');

    const payload = parsed['payload'] as Record<string, unknown>;
    const summary = payload['summary'] as Record<string, number>;
    expect(summary['failed']).toBe(1);
  });

  // ── Test 3: Spawn ENOENT → exit 5 and DOCTOR_SPAWN_FAILED ────────────────
  it('bash unavailable (spawn error) → exit 5 and DOCTOR_SPAWN_FAILED', async () => {
    const { exitCode, output } = await invokeDoctor(
      makeSpawnError('spawn bash ENOENT')
    );

    expect(exitCode).toBe(5);

    const parsed = JSON.parse(output) as Record<string, unknown>;
    expect(parsed['error_code']).toBe('DOCTOR_SPAWN_FAILED');
  });

  // ── Test 4: Invalid JSON output → exit 3 and DOCTOR_PARSE_FAILED ──────────
  it('malformed JSON from script → exit 3 and DOCTOR_PARSE_FAILED', async () => {
    const { exitCode, output } = await invokeDoctor(
      makeSpawnOk('not valid json at all!!!', 0)
    );

    expect(exitCode).toBe(3);

    const parsed = JSON.parse(output) as Record<string, unknown>;
    expect(parsed['error_code']).toBe('DOCTOR_PARSE_FAILED');
  });

  // ── Test 5: --format json returns canonical envelope with payload.checks ──
  it('--format json output has canonical envelope with payload.checks array of length 11', async () => {
    const { exitCode, output } = await invokeDoctor(makeSpawnOk(allPassReport(), 0), 'json');

    expect(exitCode).toBe(0);

    const parsed = JSON.parse(output) as Record<string, unknown>;
    assertEnvelope(parsed);

    expect(typeof parsed['status']).toBe('string');
    expect(parsed['command']).toBe('cognition doctor');

    const payload = parsed['payload'] as Record<string, unknown>;
    expect(payload).toBeDefined();
    expect(Array.isArray(payload['checks'])).toBe(true);
    expect((payload['checks'] as unknown[]).length).toBe(11);

    const summary = payload['summary'] as Record<string, number>;
    expect(summary['total']).toBe(11);
  });

  // ── Test 6: span emitted on happy path ────────────────────────────────────
  it('emits a "cognition.doctor" span with status OK on happy path', async () => {
    const spans: OtelSpan[] = [];
    const { exitCode } = await invokeDoctor(makeSpawnOk(allPassReport(), 0), 'json', spans);

    expect(exitCode).toBe(0);
    expect(spans).toHaveLength(1);
    expect(spans[0].name).toBe('cognition.doctor');
    expect(spans[0].status.code).toBe('OK');
    expect(spans[0].attributes['service.name']).toBe('wasm4pm');
    expect(spans[0].attributes['cognition.operation']).toBe('doctor');
  });

  // ── Test 7: span emitted with ERROR status on check failure ───────────────
  it('emits a "cognition.doctor" span with status ERROR when checks fail', async () => {
    const spans: OtelSpan[] = [];
    await invokeDoctor(makeSpawnOk(oneFailReport(), 1), 'json', spans);

    expect(spans).toHaveLength(1);
    expect(spans[0].name).toBe('cognition.doctor');
    expect(spans[0].status.code).toBe('ERROR');
  });
});
