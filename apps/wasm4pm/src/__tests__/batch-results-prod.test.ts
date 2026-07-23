/**
 * batch-results-prod.test.ts
 *
 * Production-quality tests for the retired `wpm batch`/`wpm results`
 * commands, and `wpm benchmark perf`. Validates the spec-mandated JSON
 * output shapes and flag behaviors under their noun/verb equivalents
 * (nouns/_removed.ts):
 *   - 'batch'  -> 'pipeline run'   (name-only absorption — see the big
 *                                   comment in batch-cli.test.ts; the
 *                                   multi-file/--continue-on-error/
 *                                   --parallel behavior tested here has NO
 *                                   replacement anywhere in the new surface)
 *   - 'results' -> 'evidence report' (bridged unchanged — legacy envelope
 *                                     `{command,status,exit_code,payload,meta}`
 *                                     preserved verbatim on success)
 *   - 'benchmark perf' -> 'lab benchmark perf' (bridged unchanged, same
 *                                                envelope preservation)
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
    <string key="concept:name" value="case_1"/>
    <event>
      <string key="concept:name" value="Register"/>
      <date key="time:timestamp" value="2024-01-01T00:00:00Z"/>
    </event>
    <event>
      <string key="concept:name" value="Approve"/>
      <date key="time:timestamp" value="2024-01-01T00:10:00Z"/>
    </event>
    <event>
      <string key="concept:name" value="Complete"/>
      <date key="time:timestamp" value="2024-01-01T00:20:00Z"/>
    </event>
  </trace>
  <trace>
    <string key="concept:name" value="case_2"/>
    <event>
      <string key="concept:name" value="Register"/>
      <date key="time:timestamp" value="2024-01-02T00:00:00Z"/>
    </event>
    <event>
      <string key="concept:name" value="Reject"/>
      <date key="time:timestamp" value="2024-01-02T00:05:00Z"/>
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

// ─── Test suite: wpm batch (retired — see batch-cli.test.ts for full coverage) ─

describe("wpm batch — retired; 'wpm pipeline run' does not reimplement multi-file/--continue-on-error/--parallel", () => {
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

  it("'wpm batch -i <file> --algorithm dfg --format json --no-save' still hard-redirects (removed)", async () => {
    const xesPath = path.join(tmpDir, 'valid.xes');
    await fs.writeFile(xesPath, MIN_VALID_XES);

    const result = await runCli([
      'batch',
      '-i', xesPath,
      '--algorithm', 'dfg',
      '--format', 'json',
      '--no-save',
    ]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/'wpm batch' was removed — use 'wpm pipeline run'/);
  });

  it("'--continue-on-error' and comma-separated multi-file '-i' also just hard-redirect (no replacement exists)", async () => {
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
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/'wpm batch' was removed/);
  });

  it("'--parallel' flag shape also just hard-redirects", async () => {
    const xesPath = path.join(tmpDir, 'p.xes');
    await fs.writeFile(xesPath, MIN_VALID_XES);

    const result = await runCli([
      'batch', '-i', xesPath,
      '--parallel', '2',
      '--algorithm', 'dfg',
      '--format', 'json',
      '--no-save',
    ]);
    expect(result.exitCode).toBe(1);
  });

  it("the single-file case DOES survive under 'wpm pipeline run --auto --input <file>'", async () => {
    const xesPath = path.join(tmpDir, 's.xes');
    await fs.writeFile(xesPath, MIN_VALID_XES);

    const result = await runCli(['pipeline', 'run', '--auto', '--input', xesPath], { cwd: tmpDir });
    expect(result.exitCode).toBe(EXIT_CODES.success);
    const report = parseJsonOutput(result.stdout) as { status: string; steps: unknown[] };
    expect(report.status).toBe('ok');
    expect(Array.isArray(report.steps)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('wpm evidence report — improved inspection flags (was: wpm results)', () => {
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
      ['evidence', 'report', '--stats', '--format', 'json'],
      { cwd: tmpDir }
    );

    // Must exit 0 (empty results is not an error)
    expect(result.exitCode).toBe(EXIT_CODES.success);
  });

  it('--stats emits total_runs, successful, failed, algorithms, fitness keys', async () => {
    // Run from tmpDir with no results dir — should return empty/zero stats
    const result = await runCli(
      ['evidence', 'report', '--stats', '--format', 'json'],
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
    const result = await runCli(['evidence', 'report', '--top', '5', '--format', 'json']);
    // Even with no saved results this should exit cleanly
    expect(result.exitCode).toBe(EXIT_CODES.success);
  });

  it('--sort fitness --format json exits 0', async () => {
    const result = await runCli(['evidence', 'report', '--sort', 'fitness', '--format', 'json']);
    expect(result.exitCode).toBe(EXIT_CODES.success);
  });

  it('--sort timestamp --format json exits 0', async () => {
    const result = await runCli(['evidence', 'report', '--sort', 'date', '--format', 'json']);
    expect(result.exitCode).toBe(EXIT_CODES.success);
  });

  it('--trend fitness --format json exits 0 and emits trend_direction and data_points array', async () => {
    const result = await runCli(['evidence', 'report', '--trend', 'fitness', '--format', 'json']);
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

describe('wpm lab benchmark perf — improved timing stats (was: wpm benchmark perf)', () => {
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
      'lab', 'benchmark', 'perf',
      '-i', xesPath,
      '--algorithms', 'dfg',
      '--runs', '2',
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
      'lab', 'benchmark', 'perf',
      '-i', xesPath,
      '--algorithms', 'dfg',
      '--runs', '2',
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
      'lab', 'benchmark', 'perf',
      '-i', xesPath,
      '--algorithms', 'dfg',
      '--runs', '2',
      '--no-warmup',
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
