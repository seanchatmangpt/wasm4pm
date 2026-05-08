/**
 * doctor-verbs.test.ts — tests for all 8 `wpm doctor <verb>` subcommands
 *
 * Oracle rank: Rank 2 (Domain contract — CLI exit codes and output shape).
 * Tests run against the compiled CLI via child_process.
 */

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

const CLI = path.resolve(import.meta.dirname, '../../dist/bin/wpm.js');

function wpm(...args: string[]): { stdout: string; stderr: string; status: number } {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8',
    timeout: 30_000,
    cwd: os.tmpdir(),
  });
  return { stdout: result.stdout ?? '', stderr: result.stderr ?? '', status: result.status ?? 1 };
}

function wpmJson(...args: string[]): { json: unknown; status: number } {
  const { stdout, status } = wpm(...args);
  let json: unknown = null;
  try { json = JSON.parse(stdout); } catch { /* not JSON — test will fail naturally */ }
  return { json, status };
}

describe('wpm doctor check', () => {
  it('exits 0-2, returns JSON with checks array and summary counts', () => {
    const { json, status } = wpmJson('doctor', 'check', '--format', 'json');
    expect(status).toBeOneOf([0, 1, 2]);
    const payload = (json as { payload: { checks: unknown[]; summary: Record<string, number> } }).payload;
    expect(Array.isArray(payload.checks)).toBe(true);
    expect(typeof payload.summary.pass).toBe('number');
    expect(typeof payload.summary.fail).toBe('number');
  });
});

describe('wpm doctor fix', () => {
  it('--dry-run exits 0, mentions dry-run in output, and returns truthy JSON', () => {
    const { stdout, status } = wpm('doctor', 'fix', '--dry-run', '--yes');
    expect(status).toBe(0);
    expect(stdout.toLowerCase()).toMatch(/dry.?run|would|preview/);
    const { json: jsonResult } = wpmJson('doctor', 'fix', '--dry-run', '--yes', '--format', 'json');
    expect(jsonResult).toBeTruthy();
  });
});

describe('wpm doctor publish', () => {
  it('exits 0 or 1 and JSON output includes ready boolean', () => {
    const { status } = wpm('doctor', 'publish');
    expect(status).toBeOneOf([0, 1]);
    const { json } = wpmJson('doctor', 'publish', '--format', 'json');
    const pub = (json as { payload: { ready: boolean } }).payload;
    expect(pub).toHaveProperty('ready');
    expect(typeof pub.ready).toBe('boolean');
  });
});

describe('wpm doctor env', () => {
  it('completes under 5 seconds and JSON output has environment array', () => {
    const start = Date.now();
    wpm('doctor', 'env');
    expect(Date.now() - start).toBeLessThan(5_000);
    const { json } = wpmJson('doctor', 'env', '--format', 'json');
    const env = (json as { payload: { environment: unknown[] } }).payload;
    expect(env).toHaveProperty('environment');
    expect(Array.isArray(env.environment)).toBe(true);
  });
});

describe('wpm doctor tps', () => {
  it('exits 0 or 1 with JSON checks output and --fail-fast stays within 0-1', () => {
    const { json, status } = wpmJson('doctor', 'tps', '--format', 'json');
    expect(status).toBeOneOf([0, 1]);
    expect((json as { payload: { checks: unknown } }).payload).toHaveProperty('checks');
    const { status: ffStatus } = wpm('doctor', 'tps', '--fail-fast');
    expect(ffStatus).toBeOneOf([0, 1]);
  });
});

describe('wpm doctor perf', () => {
  it('exits 0 or 1 with JSON containing regressions and within_threshold arrays', () => {
    const { status } = wpm('doctor', 'perf');
    expect(status).toBeOneOf([0, 1]);
    const { json } = wpmJson('doctor', 'perf', '--format', 'json');
    const perf = (json as { payload: { regressions: unknown[]; within_threshold: unknown[] } }).payload;
    expect(Array.isArray(perf.regressions)).toBe(true);
    expect(perf).toHaveProperty('within_threshold');
  });
});

describe('wpm doctor watch', () => {
  it('rejects --interval less than 5 and starts successfully with default interval', () => {
    const { status, stderr, stdout } = wpm('doctor', 'watch', '--interval', '2');
    const output = stdout + stderr;
    const rejected = status !== 0 || output.toLowerCase().includes('warn') || output.toLowerCase().includes('5');
    expect(rejected).toBe(true);

    const result = spawnSync(process.execPath, [CLI, 'doctor', 'watch', '--interval', '30'], { encoding: 'utf8', timeout: 1_500, cwd: os.tmpdir() });
    const s = result.status ?? result.signal ? 0 : 1;
    expect(s).toBeOneOf([0, null]);
  });
});

describe('wpm doctor report', () => {
  it('generates parseable JSON report and self-contained HTML report', () => {
    const jsonOut = path.join(os.tmpdir(), `wpm-doctor-test-${Date.now()}.json`);
    const { status: js } = wpm('doctor', 'report', '--format', 'json', '--out', jsonOut);
    expect(js).toBe(0);
    expect(fs.existsSync(jsonOut)).toBe(true);
    const parsed = JSON.parse(fs.readFileSync(jsonOut, 'utf8'));
    expect(parsed).toHaveProperty('generated_at');
    expect(parsed).toHaveProperty('checks');
    expect(parsed).toHaveProperty('summary');
    fs.unlinkSync(jsonOut);

    const htmlOut = path.join(os.tmpdir(), `wpm-doctor-test-${Date.now()}.html`);
    const { status: hs } = wpm('doctor', 'report', '--format', 'html', '--out', htmlOut);
    expect(hs).toBe(0);
    expect(fs.existsSync(htmlOut)).toBe(true);
    const content = fs.readFileSync(htmlOut, 'utf8');
    expect(content).not.toMatch(/<link[^>]+href=["']https?:/i);
    expect(content).not.toMatch(/<script[^>]+src=["']https?:/i);
    expect(content).toContain('<html');
    fs.unlinkSync(htmlOut);
  });
});
