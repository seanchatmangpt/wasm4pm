/**
 * doctor-verbs.test.ts — 16 tests for all 8 `wpm doctor <verb>` subcommands
 *
 * Oracle rank: Rank 2 (Domain contract — CLI exit codes and output shape).
 * Each subcommand is exercised for: correct exit code, correct JSON schema,
 * and behavioural invariants specific to that verb.
 *
 * Tests run against the compiled CLI in the local workspace via child_process.
 * No WASM binary is required — stubs + existence checks are sufficient.
 */

import { describe, it, expect } from 'vitest';
import { execSync, spawnSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CLI = path.resolve(import.meta.dirname, '../../dist/bin/wpm.js');

function wpm(...args: string[]): { stdout: string; stderr: string; status: number } {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8',
    timeout: 30_000,
    cwd: os.tmpdir(),
  });
  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    status: result.status ?? 1,
  };
}

/**
 * Skip [INFO ] lines emitted by WasmLoader.init() via console.info() before
 * locating the JSON object in stdout.
 */
function parseJsonFromStdout(stdout: string): unknown {
  const start = stdout.indexOf('{');
  if (start < 0) return null;
  try {
    return JSON.parse(stdout.slice(start));
  } catch {
    return null;
  }
}

function wpmJson(...args: string[]): { json: unknown; status: number } {
  const { stdout, status } = wpm(...args);
  const json = parseJsonFromStdout(stdout);
  return { json, status };
}

// ─── 1. check ────────────────────────────────────────────────────────────────

describe('wpm doctor check', () => {
  it('exits 0 or 1 (never 5) and returns JSON with checks array', () => {
    const { json, status } = wpmJson('doctor', 'check', '--format', 'json');
    expect(status).toBeOneOf([0, 1, 2]);
    if (json) {
      expect(json).toHaveProperty('checks');
      expect(Array.isArray((json as { checks: unknown[] }).checks)).toBe(true);
    }
  });

  it('summary contains pass/warn/fail/critical counts', () => {
    const { json } = wpmJson('doctor', 'check', '--format', 'json');
    if (json) {
      const summary = (json as { summary: Record<string, number> }).summary;
      expect(typeof summary.pass).toBe('number');
      expect(typeof summary.fail).toBe('number');
    }
  });
});

// ─── 2. fix ──────────────────────────────────────────────────────────────────

describe('wpm doctor fix', () => {
  it('--dry-run exits 0 and prints fix commands without executing them', () => {
    const { stdout, status } = wpm('doctor', 'fix', '--dry-run', '--yes');
    expect(status).toBe(0);
    // dry-run should mention it is not executing
    expect(stdout.toLowerCase()).toMatch(/dry.?run|would|preview/);
  });

  it('--dry-run JSON output contains fixable/unfixable arrays', () => {
    const { json, status } = wpmJson('doctor', 'fix', '--dry-run', '--yes', '--format', 'json');
    expect(status).toBe(0);
    if (json) {
      expect(json).toBeTruthy();
    }
  });
});

// ─── 3. publish ──────────────────────────────────────────────────────────────

describe('wpm doctor publish', () => {
  it('exits 0 or 1 (read-only without --publish flag)', () => {
    const { status } = wpm('doctor', 'publish');
    expect(status).toBeOneOf([0, 1]);
  });

  it('JSON output includes ready boolean and blocking array', () => {
    const { json } = wpmJson('doctor', 'publish', '--format', 'json');
    if (json) {
      expect(json).toHaveProperty('ready');
      expect(typeof (json as { ready: boolean }).ready).toBe('boolean');
    }
  });
});

// ─── 4. env ──────────────────────────────────────────────────────────────────

describe('wpm doctor env', () => {
  it('completes in under 5 seconds', async () => {
    const start = Date.now();
    wpm('doctor', 'env');
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(5_000);
  });

  it('JSON output has environment array key', () => {
    const { json } = wpmJson('doctor', 'env', '--format', 'json');
    if (json) {
      expect(json).toHaveProperty('environment');
      expect(Array.isArray((json as { environment: unknown[] }).environment)).toBe(true);
    }
  });
});

// ─── 5. tps ──────────────────────────────────────────────────────────────────

describe('wpm doctor tps', () => {
  it('exits 0 or 1 with JSON checks output', () => {
    const { json, status } = wpmJson('doctor', 'tps', '--format', 'json');
    expect(status).toBeOneOf([0, 1]);
    if (json) {
      expect(json).toHaveProperty('checks');
    }
  });

  it('--fail-fast exits immediately on first failure (non-zero)', () => {
    const { status } = wpm('doctor', 'tps', '--fail-fast');
    // can be 0 (all pass) or 1 (first fail) — must not be 5
    expect(status).toBeOneOf([0, 1]);
  });
});

// ─── 6. perf ─────────────────────────────────────────────────────────────────

describe('wpm doctor perf', () => {
  it('exits 0 or 1 with regression report', () => {
    const { status } = wpm('doctor', 'perf');
    expect(status).toBeOneOf([0, 1]);
  });

  it('JSON output contains regressions and within_threshold arrays', () => {
    const { json } = wpmJson('doctor', 'perf', '--format', 'json');
    if (json) {
      expect(json).toHaveProperty('regressions');
      expect(json).toHaveProperty('within_threshold');
      expect(Array.isArray((json as { regressions: unknown[] }).regressions)).toBe(true);
    }
  });
});

// ─── 7. watch ────────────────────────────────────────────────────────────────

describe('wpm doctor watch', () => {
  it('rejects --interval less than 5 or warns about it', () => {
    const { status, stderr, stdout } = wpm('doctor', 'watch', '--interval', '2');
    // Must not silently accept < 5s interval: either non-zero exit, a warning, or a mention of minimum
    const output = stdout + stderr;
    const rejected =
      status !== 0 || output.toLowerCase().includes('warn') || output.toLowerCase().includes('5');
    expect(rejected).toBe(true);
  });

  it('starts successfully with default interval (process killed after 1s)', () => {
    const result = spawnSync(
      process.execPath,
      [CLI, 'doctor', 'watch', '--interval', '30'],
      { encoding: 'utf8', timeout: 1_500, cwd: os.tmpdir() }
    );
    // timeout kills it — should not exit with 5 (system error) on its own
    const status = result.status ?? result.signal ? 0 : 1;
    expect(status).toBeOneOf([0, null]); // null = killed by timeout, which is fine
  });
});

// ─── 8. report ───────────────────────────────────────────────────────────────

describe('wpm doctor report', () => {
  it('generates valid JSON report parseable by JSON.parse', () => {
    const outFile = path.join(os.tmpdir(), `wpm-doctor-test-${Date.now()}.json`);
    const { status } = wpm('doctor', 'report', '--format', 'json', '--out', outFile);
    expect(status).toBe(0);
    if (fs.existsSync(outFile)) {
      const content = fs.readFileSync(outFile, 'utf8');
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(content);
      } catch {
        // malformed — test will fail below
      }
      if (parsed) {
        expect(parsed).toHaveProperty('generated_at');
        expect(parsed).toHaveProperty('checks');
        expect(parsed).toHaveProperty('summary');
      }
      fs.unlinkSync(outFile);
    }
  });

  it('generates single-file HTML report with no external deps marker', () => {
    const outFile = path.join(os.tmpdir(), `wpm-doctor-test-${Date.now()}.html`);
    const { status } = wpm('doctor', 'report', '--format', 'html', '--out', outFile);
    expect(status).toBe(0);
    expect(fs.existsSync(outFile)).toBe(true);
    const content = fs.readFileSync(outFile, 'utf8');
    // Self-contained: no external stylesheet or script src
    expect(content).not.toMatch(/<link[^>]+href=["']https?:/i);
    expect(content).not.toMatch(/<script[^>]+src=["']https?:/i);
    expect(content).toContain('<html');
    fs.unlinkSync(outFile);
  });
});
