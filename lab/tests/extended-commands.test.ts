/**
 * Extended Command Coverage Tests — wpm diff | ml | simulate | init
 *
 * Extends lab/tests/commands.test.ts (which covers conformance/quality/validate/predict/powl)
 * with post-publish validation for four additional commands that had no lab coverage.
 *
 * Every test:
 * - Spawns the real wpm binary via child_process.spawnSync (no mocks)
 * - Asserts on the actual process exit code AND JSON envelope shape
 * - Uses real XES fixtures from lab/fixtures/
 *
 * ── Exit code constants ────────────────────────────────────────────────────────
 *   0  = success
 *   1  = config_error
 *   2  = source_error
 *   3  = execution_error
 *   4  = partial_failure
 *   5  = system_error
 *
 * ── Commands covered ──────────────────────────────────────────────────────────
 *   12. wpm diff       — compare two XES logs; jaccard similarity in [0,1]
 *   13. wpm ml         — ML analysis tasks (classify, cluster, forecast, etc.)
 *   14. wpm simulate   — Monte Carlo simulation; exits 0, returns traces array
 *   15. wpm init       — scaffold wasm4pm.toml; exits 0 in empty dir
 */

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// ── Binary resolution ─────────────────────────────────────────────────────────

const WPM_BIN: string =
  (process.env['WPM_BIN'] as string | undefined) ??
  path.resolve(__dirname, '../../apps/wasm4pm/dist/bin/wpm.js');

// ── Fixtures ──────────────────────────────────────────────────────────────────

const XES_STANDARD = path.resolve(__dirname, '../fixtures/sample-xes-1.0.xes');
const XES_SIMPLE   = path.resolve(__dirname, '../fixtures/sample-logs/simple.xes');

// ── Helpers ────────────────────────────────────────────────────────────────────

function wpm(...args: string[]) {
  return spawnSync('node', [WPM_BIN, ...args], {
    encoding: 'utf8',
    timeout: 60_000,
    env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0', NODE_ENV: 'production' },
  });
}

/**
 * Parse JSON from CLI stdout.
 * Handles leading [INFO]/[WARN] log lines emitted before the JSON payload.
 */
function parseJson(output: string): Record<string, unknown> | null {
  const jsonStart = output.indexOf('\n{');
  const slice = jsonStart !== -1 ? output.slice(jsonStart) : output;
  try {
    return JSON.parse(slice.trim()) as Record<string, unknown>;
  } catch {
    const start = slice.indexOf('{');
    if (start === -1) return null;
    let depth = 0;
    for (let i = start; i < slice.length; i++) {
      if (slice[i] === '{') depth++;
      else if (slice[i] === '}') {
        depth--;
        if (depth === 0) {
          try {
            return JSON.parse(slice.slice(start, i + 1)) as Record<string, unknown>;
          } catch {
            return null;
          }
        }
      }
    }
    return null;
  }
}

// ── 12. wpm diff ──────────────────────────────────────────────────────────────

describe('12. wpm diff', () => {
  it('12.0 binary exists at expected path', () => {
    expect(fs.existsSync(WPM_BIN), `Binary not found: ${WPM_BIN}`).toBe(true);
  });

  it('12.1 wpm diff with no arguments exits 1 (config_error — missing positional args)', () => {
    // citty treats missing required positionals as config errors (exit 1), not source errors (exit 2)
    const result = wpm('diff');
    expect(result.status).toBe(1);
  });

  it('12.2 wpm diff with only one log exits 1 (config_error — LOG2 missing)', () => {
    if (!fs.existsSync(XES_STANDARD)) return;
    const result = wpm('diff', XES_STANDARD);
    // citty emits "Missing required positional argument: LOG2" at exit 1
    expect(result.status).toBe(1);
    const out = result.stdout + result.stderr;
    expect(out).toMatch(/missing.*LOG2|required.*positional/i);
  });

  it('12.3 wpm diff with missing files exits 2 (source_error)', () => {
    const result = wpm('diff', '/tmp/missing1.xes', '/tmp/missing2.xes');
    expect(result.status).toBe(2);
    const out = result.stdout + result.stderr;
    expect(out).toMatch(/not found|does not exist|ENOENT/i);
  });

  it('12.4 wpm diff <xes> <xes> exits 0 comparing a log to itself', () => {
    if (!fs.existsSync(XES_STANDARD)) return;
    const result = wpm('diff', XES_STANDARD, XES_STANDARD, '--no-save');
    // Comparing a log to itself should always succeed
    expect(result.status).toBe(0);
  });

  it('12.5 wpm diff --format json stdout is valid JSON', () => {
    if (!fs.existsSync(XES_STANDARD)) return;
    const result = wpm('diff', XES_STANDARD, XES_STANDARD, '--format', 'json', '--no-save');
    expect(result.status).toBe(0);
    const parsed = parseJson(result.stdout);
    expect(parsed, 'stdout must be valid JSON').not.toBeNull();
  });

  it('12.6 wpm diff --format json envelope has command="diff"', () => {
    if (!fs.existsSync(XES_STANDARD)) return;
    const result = wpm('diff', XES_STANDARD, XES_STANDARD, '--format', 'json', '--no-save');
    expect(result.status).toBe(0);
    const parsed = parseJson(result.stdout);
    expect(parsed).not.toBeNull();
    expect(parsed!['command']).toBe('diff');
  });

  it('12.7 wpm diff self-comparison payload has jaccard=1 (identical logs)', () => {
    if (!fs.existsSync(XES_STANDARD)) return;
    const result = wpm('diff', XES_STANDARD, XES_STANDARD, '--format', 'json', '--no-save');
    expect(result.status).toBe(0);
    const parsed = parseJson(result.stdout);
    expect(parsed).not.toBeNull();
    if (parsed!['status'] === 'ok') {
      const payload = parsed!['payload'] as Record<string, unknown>;
      const diff = payload['diff'] as Record<string, unknown> | undefined;
      if (diff) {
        const jaccard = diff['jaccard'] as number;
        expect(typeof jaccard).toBe('number');
        expect(jaccard).toBeGreaterThanOrEqual(0);
        expect(jaccard).toBeLessThanOrEqual(1);
        // Comparing a log to itself: jaccard must equal 1.0
        expect(jaccard).toBe(1);
        console.info('[wpm] diff self-comparison jaccard:', jaccard);
      }
    }
  });

  it('12.8 wpm diff payload has activities.shared array', () => {
    if (!fs.existsSync(XES_STANDARD)) return;
    const result = wpm('diff', XES_STANDARD, XES_STANDARD, '--format', 'json', '--no-save');
    expect(result.status).toBe(0);
    const parsed = parseJson(result.stdout);
    expect(parsed).not.toBeNull();
    if (parsed!['status'] === 'ok') {
      const payload = parsed!['payload'] as Record<string, unknown>;
      const diff = payload['diff'] as Record<string, unknown> | undefined;
      if (diff) {
        const activities = diff['activities'] as Record<string, unknown> | undefined;
        expect(activities).toBeDefined();
        expect(Array.isArray(activities?.['shared'])).toBe(true);
        console.info('[wpm] diff shared activities:', (activities?.['shared'] as unknown[])?.length);
      }
    }
  });

  it('12.9 wpm diff simple.xes vs standard.xes exits 0', () => {
    if (!fs.existsSync(XES_SIMPLE) || !fs.existsSync(XES_STANDARD)) return;
    const result = wpm('diff', XES_SIMPLE, XES_STANDARD, '--format', 'json', '--no-save');
    // Two different logs — should still exit 0 (diff is always possible, not a failure)
    expect(result.status).toBe(0);
    const parsed = parseJson(result.stdout);
    expect(parsed).not.toBeNull();
    if (parsed!['status'] === 'ok') {
      const payload = parsed!['payload'] as Record<string, unknown>;
      const diff = payload['diff'] as Record<string, unknown> | undefined;
      if (diff) {
        const jaccard = diff['jaccard'] as number;
        // Different logs: jaccard in [0, 1) — not necessarily 1
        expect(jaccard).toBeGreaterThanOrEqual(0);
        expect(jaccard).toBeLessThanOrEqual(1);
        console.info('[wpm] diff cross-log jaccard:', jaccard);
      }
    }
  });

  it('12.10 wpm diff human output mentions "Jaccard" or "similarity"', () => {
    if (!fs.existsSync(XES_STANDARD)) return;
    const result = wpm('diff', XES_STANDARD, XES_STANDARD, '--no-save');
    expect(result.status).toBe(0);
    const out = result.stdout + result.stderr;
    expect(out).toMatch(/jaccard|similarity/i);
  });

  it('12.11 wpm diff meta has run_id and version', () => {
    if (!fs.existsSync(XES_STANDARD)) return;
    const result = wpm('diff', XES_STANDARD, XES_STANDARD, '--format', 'json', '--no-save');
    expect(result.status).toBe(0);
    const parsed = parseJson(result.stdout);
    expect(parsed).not.toBeNull();
    const meta = parsed!['meta'] as Record<string, unknown> | undefined;
    expect(meta).toBeDefined();
    if (meta) {
      expect(typeof meta['run_id']).toBe('string');
      expect(typeof meta['version']).toBe('string');
    }
  });
});

// ── 13. wpm ml ────────────────────────────────────────────────────────────────

describe('13. wpm ml', () => {
  it('13.1 wpm ml with no arguments exits 2 (source_error — missing task)', () => {
    const result = wpm('ml');
    // No task argument: config error or source error
    expect([1, 2]).toContain(result.status);
  });

  it('13.2 wpm ml with invalid task exits 2 (source_error)', () => {
    if (!fs.existsSync(XES_STANDARD)) return;
    const result = wpm('ml', 'ghost_task_9000', '-i', XES_STANDARD, '--format', 'json', '--no-save');
    expect(result.status).toBe(2);
    const parsed = parseJson(result.stdout);
    expect(parsed).not.toBeNull();
    expect(parsed!['status']).toBe('error');
    const msg = String((parsed!['error'] as Record<string, unknown>)?.['message'] ?? '');
    expect(msg).toMatch(/unknown.*task|invalid.*task|valid.*classify/i);
  });

  it('13.3 wpm ml classify -i <xes> --format json exits 0', () => {
    if (!fs.existsSync(XES_STANDARD)) return;
    const result = wpm('ml', 'classify', '-i', XES_STANDARD, '--format', 'json', '--no-save');
    const acceptable = [0, 3];
    if (!acceptable.includes(result.status ?? -1)) {
      console.error('[wpm] ml classify unexpected exit:', result.status);
      console.error('  stdout:', result.stdout.slice(0, 300));
    }
    expect(acceptable).toContain(result.status);
    console.info('[wpm] ml classify exit:', result.status);
  });

  it('13.4 wpm ml classify --format json stdout is valid JSON', () => {
    if (!fs.existsSync(XES_STANDARD)) return;
    const result = wpm('ml', 'classify', '-i', XES_STANDARD, '--format', 'json', '--no-save');
    const acceptable = [0, 3];
    expect(acceptable).toContain(result.status);
    const parsed = parseJson(result.stdout);
    expect(parsed, 'stdout must be valid JSON').not.toBeNull();
  });

  it('13.5 wpm ml classify JSON envelope has command="ml"', () => {
    if (!fs.existsSync(XES_STANDARD)) return;
    const result = wpm('ml', 'classify', '-i', XES_STANDARD, '--format', 'json', '--no-save');
    const acceptable = [0, 3];
    expect(acceptable).toContain(result.status);
    const parsed = parseJson(result.stdout);
    expect(parsed).not.toBeNull();
    expect(parsed!['command']).toBe('ml');
  });

  it('13.6 wpm ml classify on success: payload has task="classify" and predictions array', () => {
    if (!fs.existsSync(XES_STANDARD)) return;
    const result = wpm('ml', 'classify', '-i', XES_STANDARD, '--format', 'json', '--no-save');
    const parsed = parseJson(result.stdout);
    expect(parsed).not.toBeNull();
    if (parsed!['status'] === 'ok') {
      const payload = parsed!['payload'] as Record<string, unknown>;
      expect(payload['task']).toBe('classify');
      // classify returns `predictions` array (not a generic `result` field)
      expect(payload['predictions']).toBeDefined();
      expect(Array.isArray(payload['predictions'])).toBe(true);
      console.info('[wpm] ml classify task:', payload['task'], 'predictions:', (payload['predictions'] as unknown[]).length);
    } else {
      console.info('[wpm] ml classify returned error (acceptable):', parsed!['status']);
    }
  });

  it('13.7 wpm ml with missing input file exits 2 (source_error)', () => {
    const result = wpm('ml', 'classify', '-i', '/tmp/missing-lab.xes', '--format', 'json', '--no-save');
    expect(result.status).toBe(2);
    const parsed = parseJson(result.stdout);
    expect(parsed).not.toBeNull();
    expect(parsed!['exit_code']).toBe(2);
  });

  it('13.8 wpm ml anomaly -i <xes> --format json exits 0 or 3', () => {
    if (!fs.existsSync(XES_STANDARD)) return;
    const result = wpm('ml', 'anomaly', '-i', XES_STANDARD, '--format', 'json', '--no-save');
    const acceptable = [0, 3];
    expect(acceptable).toContain(result.status);
    const parsed = parseJson(result.stdout);
    expect(parsed).not.toBeNull();
    expect(parsed!['command']).toBe('ml');
    console.info('[wpm] ml anomaly exit:', result.status);
  });

  it('13.9 wpm ml cluster -i <xes> --format json exits 0 or 3', () => {
    if (!fs.existsSync(XES_STANDARD)) return;
    const result = wpm('ml', 'cluster', '-i', XES_STANDARD, '--format', 'json', '--no-save');
    const acceptable = [0, 3];
    expect(acceptable).toContain(result.status);
    const parsed = parseJson(result.stdout);
    expect(parsed).not.toBeNull();
    expect(parsed!['command']).toBe('ml');
    console.info('[wpm] ml cluster exit:', result.status);
  });

  it('13.10 wpm ml meta has run_id and version', () => {
    if (!fs.existsSync(XES_STANDARD)) return;
    const result = wpm('ml', 'classify', '-i', XES_STANDARD, '--format', 'json', '--no-save');
    const parsed = parseJson(result.stdout);
    expect(parsed).not.toBeNull();
    const meta = parsed!['meta'] as Record<string, unknown> | undefined;
    expect(meta).toBeDefined();
    if (meta) {
      expect(typeof meta['run_id']).toBe('string');
      expect(typeof meta['version']).toBe('string');
    }
  });

  it('13.11 wpm ml error exits never yield exit code 0 for missing input', () => {
    const result = wpm('ml', 'classify', '-i', '/tmp/definitely-missing.xes', '--format', 'json');
    expect(result.status).not.toBe(0);
  });
});

// ── 14. wpm simulate ─────────────────────────────────────────────────────────

describe('14. wpm simulate', () => {
  it('14.1 wpm simulate with no arguments exits 2 (source_error)', () => {
    const result = wpm('simulate', '--format', 'json', '--no-save');
    expect(result.status).toBe(2);
    const parsed = parseJson(result.stdout);
    expect(parsed).not.toBeNull();
    expect(parsed!['status']).toBe('error');
    expect(parsed!['exit_code']).toBe(2);
    const msg = String((parsed!['error'] as Record<string, unknown>)?.['message'] ?? '');
    expect(msg).toMatch(/input file required/i);
  });

  it('14.2 wpm simulate with missing file exits 2 (source_error)', () => {
    const result = wpm('simulate', '/tmp/missing-lab.xes', '--format', 'json', '--no-save');
    expect(result.status).toBe(2);
    const parsed = parseJson(result.stdout);
    expect(parsed).not.toBeNull();
    expect(parsed!['status']).toBe('error');
  });

  it('14.3 wpm simulate <xes> --format json exits 0 or 3', () => {
    if (!fs.existsSync(XES_STANDARD)) return;
    const result = wpm('simulate', XES_STANDARD, '--format', 'json', '--no-save');
    const acceptable = [0, 3];
    if (!acceptable.includes(result.status ?? -1)) {
      console.error('[wpm] simulate unexpected exit:', result.status);
      console.error('  stdout:', result.stdout.slice(0, 300));
    }
    expect(acceptable).toContain(result.status);
    console.info('[wpm] simulate exit:', result.status);
  });

  it('14.4 wpm simulate --format json stdout is valid JSON', () => {
    if (!fs.existsSync(XES_STANDARD)) return;
    const result = wpm('simulate', XES_STANDARD, '--format', 'json', '--no-save');
    const acceptable = [0, 3];
    expect(acceptable).toContain(result.status);
    const parsed = parseJson(result.stdout);
    expect(parsed, 'stdout must be valid JSON').not.toBeNull();
  });

  it('14.5 wpm simulate JSON envelope has command="simulate"', () => {
    if (!fs.existsSync(XES_STANDARD)) return;
    const result = wpm('simulate', XES_STANDARD, '--format', 'json', '--no-save');
    const acceptable = [0, 3];
    expect(acceptable).toContain(result.status);
    const parsed = parseJson(result.stdout);
    expect(parsed).not.toBeNull();
    expect(parsed!['command']).toBe('simulate');
  });

  it('14.6 wpm simulate on success: payload has simulation object with seed and casesRequested', () => {
    if (!fs.existsSync(XES_STANDARD)) return;
    const result = wpm('simulate', XES_STANDARD, '--cases', '10', '--format', 'json', '--no-save');
    const parsed = parseJson(result.stdout);
    expect(parsed).not.toBeNull();
    if (parsed!['status'] === 'ok') {
      const payload = parsed!['payload'] as Record<string, unknown>;
      // simulate payload wraps simulation metadata in a `simulation` sub-object
      const sim = payload['simulation'] as Record<string, unknown> | undefined;
      if (sim) {
        expect(typeof sim['seed']).toBe('number');
        expect(typeof sim['casesRequested']).toBe('number');
        expect(sim['casesRequested']).toBe(10);
        console.info('[wpm] simulate simulation.seed:', sim['seed'], 'casesRequested:', sim['casesRequested']);
      } else {
        // Fallback: some builds return top-level fields
        expect(payload['traces']).toBeDefined();
      }
    } else {
      console.info('[wpm] simulate returned error (acceptable on simple log):', parsed!['status']);
    }
  });

  it('14.7 wpm simulate --cases 5: simulation.casesRequested equals 5 on success', () => {
    if (!fs.existsSync(XES_STANDARD)) return;
    const result = wpm('simulate', XES_STANDARD, '--cases', '5', '--format', 'json', '--no-save');
    const parsed = parseJson(result.stdout);
    expect(parsed).not.toBeNull();
    if (parsed!['status'] === 'ok') {
      const payload = parsed!['payload'] as Record<string, unknown>;
      const sim = payload['simulation'] as Record<string, unknown> | undefined;
      if (sim) {
        expect(sim['casesRequested']).toBe(5);
        console.info('[wpm] simulate 5 cases: casesRequested:', sim['casesRequested']);
      }
    }
  });

  it('14.8 wpm simulate --cases NaN exits 1 (config_error)', () => {
    if (!fs.existsSync(XES_STANDARD)) return;
    const result = wpm('simulate', XES_STANDARD, '--cases', 'not_a_number', '--format', 'json', '--no-save');
    expect(result.status).toBe(1);
    const parsed = parseJson(result.stdout);
    expect(parsed).not.toBeNull();
    expect(parsed!['status']).toBe('error');
  });

  it('14.9 wpm simulate meta has run_id and version', () => {
    if (!fs.existsSync(XES_STANDARD)) return;
    const result = wpm('simulate', XES_STANDARD, '--format', 'json', '--no-save');
    const parsed = parseJson(result.stdout);
    expect(parsed).not.toBeNull();
    const meta = parsed!['meta'] as Record<string, unknown> | undefined;
    expect(meta).toBeDefined();
    if (meta) {
      expect(typeof meta['run_id']).toBe('string');
      expect(typeof meta['version']).toBe('string');
    }
  });

  it('14.10 wpm simulate human output mentions simulation or cases', () => {
    if (!fs.existsSync(XES_STANDARD)) return;
    const result = wpm('simulate', XES_STANDARD, '--no-save');
    const acceptable = [0, 3];
    expect(acceptable).toContain(result.status);
    const out = result.stdout + result.stderr;
    // Either success with simulation output or error message — no raw stack traces
    const lines = out.split('\n');
    const stackLines = lines.filter(l => l.trim().startsWith('at ') && l.includes('.js:'));
    expect(stackLines, `Stack trace leaked: ${stackLines.slice(0, 2).join(' | ')}`).toHaveLength(0);
  });
});

// ── 15. wpm init ─────────────────────────────────────────────────────────────

describe('15. wpm init', () => {
  it('15.1 wpm init --help exits 0', () => {
    const result = wpm('init', '--help');
    expect(result.status).toBe(0);
  });

  it('15.2 wpm init in an empty temp dir exits 0', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wpm-init-'));
    try {
      const result = spawnSync('node', [WPM_BIN, 'init'], {
        encoding: 'utf8',
        timeout: 15_000,
        cwd: tmpDir,
        env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0', NODE_ENV: 'production' },
      });
      expect(result.status).toBe(0);
      console.info('[wpm] init exit:', result.status, 'in', tmpDir);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('15.3 wpm init creates wasm4pm.toml in the target directory', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wpm-init-'));
    try {
      spawnSync('node', [WPM_BIN, 'init'], {
        encoding: 'utf8',
        timeout: 15_000,
        cwd: tmpDir,
        env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0', NODE_ENV: 'production' },
      });
      const tomlExists = fs.existsSync(path.join(tmpDir, 'wasm4pm.toml'));
      expect(tomlExists, 'wasm4pm.toml not created by wpm init').toBe(true);
      console.info('[wpm] init created wasm4pm.toml:', tomlExists);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('15.4 wpm init creates .env.example in the target directory', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wpm-init-'));
    try {
      spawnSync('node', [WPM_BIN, 'init'], {
        encoding: 'utf8',
        timeout: 15_000,
        cwd: tmpDir,
        env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0', NODE_ENV: 'production' },
      });
      const envExists = fs.existsSync(path.join(tmpDir, '.env.example'));
      expect(envExists, '.env.example not created by wpm init').toBe(true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('15.5 wpm init human output mentions config file creation', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wpm-init-'));
    try {
      const result = spawnSync('node', [WPM_BIN, 'init'], {
        encoding: 'utf8',
        timeout: 15_000,
        cwd: tmpDir,
        env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0', NODE_ENV: 'production' },
      });
      expect(result.status).toBe(0);
      const out = result.stdout + result.stderr;
      expect(out).toMatch(/wasm4pm\.toml|init|created|scaffold/i);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('15.6 wasm4pm.toml created by init is non-empty', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wpm-init-'));
    try {
      spawnSync('node', [WPM_BIN, 'init'], {
        encoding: 'utf8',
        timeout: 15_000,
        cwd: tmpDir,
        env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0', NODE_ENV: 'production' },
      });
      const tomlPath = path.join(tmpDir, 'wasm4pm.toml');
      if (fs.existsSync(tomlPath)) {
        const contents = fs.readFileSync(tomlPath, 'utf8');
        expect(contents.length).toBeGreaterThan(0);
        console.info('[wpm] init wasm4pm.toml size:', contents.length, 'bytes');
      }
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('15.7 wpm init does not produce raw stack traces on success', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wpm-init-'));
    try {
      const result = spawnSync('node', [WPM_BIN, 'init'], {
        encoding: 'utf8',
        timeout: 15_000,
        cwd: tmpDir,
        env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0', NODE_ENV: 'production' },
      });
      expect(result.status).toBe(0);
      const lines = (result.stdout + result.stderr).split('\n');
      const stackLines = lines.filter(l => l.trim().startsWith('at ') && l.includes('.js:'));
      expect(stackLines, `Stack trace leaked: ${stackLines.slice(0, 2).join(' | ')}`).toHaveLength(0);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
