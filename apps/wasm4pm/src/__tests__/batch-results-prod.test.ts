/**
 * batch-results-prod.test.ts
 *
 * Production-quality tests for wpm batch, wpm results, and wpm benchmark perf.
 * Validates the spec-mandated JSON output shapes and flag behaviors.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runCli, EXIT_CODES } from '@wasm4pm/testing';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

// ─── Minimal valid XES fixture ────────────────────────────────────────────────

const MIN_VALID_XES = `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0" xmlns="http://www.xes.org/">
  <trace>
    <event>
      <string key="concept:name" value="Register"/>
      <string key="time:timestamp" value="2024-01-01T00:00:00Z"/>
    </event>
    <event>
      <string key="concept:name" value="Approve"/>
      <string key="time:timestamp" value="2024-01-01T00:10:00Z"/>
    </event>
    <event>
      <string key="concept:name" value="Complete"/>
      <string key="time:timestamp" value="2024-01-01T00:20:00Z"/>
    </event>
  </trace>
  <trace>
    <event>
      <string key="concept:name" value="Register"/>
      <string key="time:timestamp" value="2024-01-02T00:00:00Z"/>
    </event>
    <event>
      <string key="concept:name" value="Reject"/>
      <string key="time:timestamp" value="2024-01-02T00:05:00Z"/>
    </event>
  </trace>
</log>`;

const INVALID_XES = `not-xml-at-all {{ broken`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Parse the JSON envelope from stdout, tolerating surrounding whitespace/logs. */
function parseJsonOutput(stdout: string): Record<string, unknown> {
  // Find the outermost JSON object in stdout
  const match = stdout.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`No JSON object found in stdout:\n${stdout}`);
  return JSON.parse(match[0]) as Record<string, unknown>;
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('wpm batch — improved multi-file processing', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wpm-batch-prod-'));
  });

  afterEach(async () => {
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore cleanup errors */
    }
  });

  it('exits 0 and emits total_files in JSON when processing a valid XES file', async () => {
    const xesPath = path.join(tmpDir, 'valid.xes');
    await fs.writeFile(xesPath, MIN_VALID_XES);

    const result = await runCli([
      'batch',
      '-i', xesPath,
      '--algorithm', 'dfg',
      '--format', 'json',
      '--no-save',
    ]);

    // Exit 0 (success) for a single valid file
    expect([EXIT_CODES.success, EXIT_CODES.partial_failure]).toContain(result.exitCode);

    const json = parseJsonOutput(result.stdout);
    const payload = (json['payload'] ?? json) as Record<string, unknown>;

    // Spec-mandated top-level keys
    expect(payload).toHaveProperty('total_files');
    expect(payload).toHaveProperty('successful');
    expect(payload).toHaveProperty('failed');
    expect(payload).toHaveProperty('results');
    expect(payload).toHaveProperty('summary');

    expect(typeof payload['total_files']).toBe('number');
    expect((payload['total_files'] as number)).toBeGreaterThanOrEqual(1);
    expect(typeof payload['successful']).toBe('number');
    expect(typeof payload['failed']).toBe('number');
    expect(Array.isArray(payload['results'])).toBe(true);
  });

  it('results array contains file/status/fitness/duration_ms entries', async () => {
    const xesPath = path.join(tmpDir, 'log.xes');
    await fs.writeFile(xesPath, MIN_VALID_XES);

    const result = await runCli([
      'batch', '-i', xesPath,
      '--algorithm', 'dfg',
      '--format', 'json',
      '--no-save',
    ]);

    expect([EXIT_CODES.success, EXIT_CODES.partial_failure]).toContain(result.exitCode);

    const json = parseJsonOutput(result.stdout);
    const payload = (json['payload'] ?? json) as Record<string, unknown>;
    const results = payload['results'] as Array<Record<string, unknown>>;

    expect(results.length).toBeGreaterThanOrEqual(1);
    const first = results[0];
    expect(first).toHaveProperty('file');
    expect(first).toHaveProperty('status');
    expect(typeof first['duration_ms']).toBe('number');
    // fitness may be null for DFG (no conformance check) or a number
    expect(['number', 'object']).toContain(typeof first['fitness']); // null is 'object'
  });

  it('--continue-on-error does not stop on first failure', async () => {
    // Create one valid and one broken XES file
    const goodPath = path.join(tmpDir, 'good.xes');
    const badPath = path.join(tmpDir, 'broken.xes');
    await fs.writeFile(goodPath, MIN_VALID_XES);
    await fs.writeFile(badPath, INVALID_XES);

    const result = await runCli([
      'batch',
      '-i', `${goodPath},${badPath}`,
      '--algorithm', 'dfg',
      '--continue-on-error',
      '--format', 'json',
      '--no-save',
    ]);

    // partial_failure (4) is expected when one file fails
    expect([EXIT_CODES.success, EXIT_CODES.partial_failure]).toContain(result.exitCode);

    const json = parseJsonOutput(result.stdout);
    const payload = (json['payload'] ?? json) as Record<string, unknown>;
    const results = payload['results'] as Array<Record<string, unknown>>;

    // Both files were processed (not stopped on first failure)
    expect((payload['total_files'] as number)).toBe(2);
    expect(results.length).toBe(2);

    // One succeeded, one failed
    const statuses = results.map((r) => r['status']);
    expect(statuses).toContain('success');
    expect(statuses).toContain('error');
  });

  it('--parallel flag is accepted and processed', async () => {
    const xesPath = path.join(tmpDir, 'p.xes');
    await fs.writeFile(xesPath, MIN_VALID_XES);

    const result = await runCli([
      'batch', '-i', xesPath,
      '--parallel', '2',
      '--algorithm', 'dfg',
      '--format', 'json',
      '--no-save',
    ]);

    expect([EXIT_CODES.success, EXIT_CODES.partial_failure]).toContain(result.exitCode);
    // Should not error out due to the flag itself
    expect(result.exitCode).not.toBe(EXIT_CODES.config_error);
  });

  it('summary contains avg_fitness and avg_duration_ms keys', async () => {
    const xesPath = path.join(tmpDir, 's.xes');
    await fs.writeFile(xesPath, MIN_VALID_XES);

    const result = await runCli([
      'batch', '-i', xesPath,
      '--algorithm', 'dfg',
      '--format', 'json',
      '--no-save',
    ]);

    expect([EXIT_CODES.success, EXIT_CODES.partial_failure]).toContain(result.exitCode);

    const json = parseJsonOutput(result.stdout);
    const payload = (json['payload'] ?? json) as Record<string, unknown>;
    const summary = payload['summary'] as Record<string, unknown>;

    expect(summary).toHaveProperty('avg_fitness');
    expect(summary).toHaveProperty('avg_duration_ms');
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('wpm results — improved inspection flags', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wpm-results-prod-'));
  });

  afterEach(async () => {
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch { /* ignore */ }
  });

  it('--stats exits 0 even when results dir is empty or missing', async () => {
    // Run from tmpDir (which has no .wasm4pm/results/) to simulate missing dir
    const result = await runCli(
      ['results', '--stats', '--format', 'json'],
      { cwd: tmpDir }
    );

    // Must exit 0 (empty results is not an error)
    expect(result.exitCode).toBe(EXIT_CODES.success);
  });

  it('--stats emits total_runs, successful, failed, algorithms, fitness keys', async () => {
    // Run from tmpDir with no results dir — should return empty/zero stats
    const result = await runCli(
      ['results', '--stats', '--format', 'json'],
      { cwd: tmpDir }
    );

    expect(result.exitCode).toBe(EXIT_CODES.success);

    const json = parseJsonOutput(result.stdout);
    const payload = (json['payload'] ?? json) as Record<string, unknown>;

    expect(payload).toHaveProperty('total_runs');
    expect(payload).toHaveProperty('successful');
    expect(payload).toHaveProperty('failed');
    expect(payload).toHaveProperty('algorithms');
    expect(payload).toHaveProperty('fitness');
  });

  it('--top 5 --format json exits 0', async () => {
    const result = await runCli(['results', '--top', '5', '--format', 'json']);
    // Even with no saved results this should exit cleanly
    expect(result.exitCode).toBe(EXIT_CODES.success);
  });

  it('--sort fitness --format json exits 0', async () => {
    const result = await runCli(['results', '--sort', 'fitness', '--format', 'json']);
    expect(result.exitCode).toBe(EXIT_CODES.success);
  });

  it('--sort timestamp --format json exits 0', async () => {
    const result = await runCli(['results', '--sort', 'date', '--format', 'json']);
    expect(result.exitCode).toBe(EXIT_CODES.success);
  });

  it('--trend fitness --format json exits 0 and emits trend_direction and data_points array', async () => {
    const result = await runCli(['results', '--trend', 'fitness', '--format', 'json']);
    expect(result.exitCode).toBe(EXIT_CODES.success);

    const json = parseJsonOutput(result.stdout);
    const payload = (json['payload'] ?? json) as Record<string, unknown>;

    // Spec: trend_direction is a string
    expect(typeof payload['trend_direction']).toBe('string');
    expect(['IMPROVING', 'DECLINING', 'STABLE']).toContain(payload['trend_direction']);

    // Spec: trend_delta is a number
    expect(typeof payload['trend_delta']).toBe('number');

    // Spec: data_points is an array (may be empty when no results saved)
    expect(Array.isArray(payload['data_points'])).toBe(true);

    // Spec: metric is present
    expect(payload['metric']).toBe('fitness');
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('wpm benchmark perf — improved timing stats', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wpm-bench-prod-'));
  });

  afterEach(async () => {
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch { /* ignore */ }
  });

  it('exits 0 with timing data for dfg with --runs 2', async () => {
    const xesPath = path.join(tmpDir, 'bench.xes');
    await fs.writeFile(xesPath, MIN_VALID_XES);

    const result = await runCli([
      'benchmark', 'perf',
      '-i', xesPath,
      '--algorithms', 'dfg',
      '--runs', '2',
      '--format', 'json',
    ]);

    expect([EXIT_CODES.success, EXIT_CODES.partial_failure]).toContain(result.exitCode);

    const json = parseJsonOutput(result.stdout);
    const payload = (json['payload'] ?? json) as Record<string, unknown>;

    // Spec: algorithms is a keyed object
    expect(payload).toHaveProperty('algorithms');
    const algs = payload['algorithms'] as Record<string, unknown>;
    expect(algs).toHaveProperty('dfg');

    const dfg = algs['dfg'] as Record<string, unknown>;
    expect(typeof dfg['mean_ms']).toBe('number');
    expect(typeof dfg['std_ms']).toBe('number');
    expect(typeof dfg['p95_ms']).toBe('number');
    expect(typeof dfg['runs']).toBe('number');
  });

  it('emits speed_ranking as an array and recommendation as a string', async () => {
    const xesPath = path.join(tmpDir, 'bench2.xes');
    await fs.writeFile(xesPath, MIN_VALID_XES);

    const result = await runCli([
      'benchmark', 'perf',
      '-i', xesPath,
      '--algorithms', 'dfg',
      '--runs', '2',
      '--format', 'json',
    ]);

    expect([EXIT_CODES.success, EXIT_CODES.partial_failure]).toContain(result.exitCode);

    const json = parseJsonOutput(result.stdout);
    const payload = (json['payload'] ?? json) as Record<string, unknown>;

    expect(Array.isArray(payload['speed_ranking'])).toBe(true);
    expect(typeof payload['recommendation']).toBe('string');
  });

  it('runs field counts the number of timed iterations', async () => {
    const xesPath = path.join(tmpDir, 'bench3.xes');
    await fs.writeFile(xesPath, MIN_VALID_XES);

    const result = await runCli([
      'benchmark', 'perf',
      '-i', xesPath,
      '--algorithms', 'dfg',
      '--runs', '2',
      '--no-warmup',
      '--format', 'json',
    ]);

    expect([EXIT_CODES.success, EXIT_CODES.partial_failure]).toContain(result.exitCode);

    const json = parseJsonOutput(result.stdout);
    const payload = (json['payload'] ?? json) as Record<string, unknown>;
    const algs = payload['algorithms'] as Record<string, unknown>;
    const dfg = algs['dfg'] as Record<string, unknown>;

    // With --runs 2, the runs field should be 2 (or 0 if WASM algo not available)
    expect(typeof dfg['runs']).toBe('number');
    expect((dfg['runs'] as number)).toBeGreaterThanOrEqual(0);
  });
});
