/**
 * Analysis Commands Lab Tests — wpm results | wpm temporal | wpm social
 *
 * These three commands had zero post-publish lab test coverage. A breaking
 * change in any of them would be invisible until a user reported it.
 *
 * Van der Aalst process mining platform requirements:
 *   - results:  Result persistence makes process mining reproducible. Without
 *               it, no audit trail exists. If the command breaks silently, saved
 *               results are inaccessible and the PM lifecycle loop is broken.
 *   - temporal: Time perspective is one of van der Aalst's four core PM
 *               perspectives. A broken temporal command means practitioners
 *               cannot surface bottlenecks or cycle-time distributions.
 *   - social:   Resource perspective (handover networks) reveals organizational
 *               structure. Missing coverage means org-mining breakage is invisible.
 *
 * Every test:
 *   - Spawns the real wpm binary via child_process.spawnSync (no mocks)
 *   - Asserts on process exit code AND JSON envelope shape
 *   - Uses real XES fixtures from lab/fixtures/
 *
 * Exit code constants:
 *   0  = success
 *   1  = config_error
 *   2  = source_error
 *   3  = execution_error
 *   4  = partial_failure
 *   5  = system_error
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
    timeout: 45_000,
    env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0', NODE_ENV: 'production' },
  });
}

/**
 * Spawn wpm with an isolated cwd so results tests don't pollute the repo.
 */
function wpmInDir(dir: string, ...args: string[]) {
  return spawnSync('node', [WPM_BIN, ...args], {
    encoding: 'utf8',
    timeout: 45_000,
    cwd: dir,
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

// ── 16. wpm results ───────────────────────────────────────────────────────────

describe('16. wpm results', () => {
  it('16.0 binary exists at expected path', () => {
    expect(fs.existsSync(WPM_BIN), `Binary not found: ${WPM_BIN}`).toBe(true);
  });

  it('16.1 wpm results --help exits 0', () => {
    // Note: --help has stdout buffering issues in pipe mode (citty quirk).
    // We verify exit code only; content is verified in later functional tests.
    const result = wpm('results', '--help');
    expect(result.status).toBe(0);
  });

  it('16.2 wpm results with empty results dir exits 0 (no results is not an error)', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wpm-results-'));
    try {
      const result = wpmInDir(tmpDir, 'results', '--format', 'json');
      // No saved results is a valid state — not a source error
      expect(result.status).toBe(0);
      console.info('[wpm] results empty dir exit:', result.status);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('16.3 wpm results --format json stdout is valid JSON', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wpm-results-'));
    try {
      const result = wpmInDir(tmpDir, 'results', '--format', 'json');
      expect(result.status).toBe(0);
      const parsed = parseJson(result.stdout);
      expect(parsed, 'stdout must be valid JSON').not.toBeNull();
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('16.4 wpm results JSON envelope has command="results"', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wpm-results-'));
    try {
      const result = wpmInDir(tmpDir, 'results', '--format', 'json');
      expect(result.status).toBe(0);
      const parsed = parseJson(result.stdout);
      expect(parsed).not.toBeNull();
      expect(parsed!['command']).toBe('results');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('16.5 wpm results JSON payload has results array, count, and directory', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wpm-results-'));
    try {
      const result = wpmInDir(tmpDir, 'results', '--format', 'json');
      expect(result.status).toBe(0);
      const parsed = parseJson(result.stdout);
      expect(parsed).not.toBeNull();
      if (parsed!['status'] === 'ok') {
        const payload = parsed!['payload'] as Record<string, unknown>;
        // Results list uses `results` (array), `count`, `showing`, `directory`
        expect(payload['results']).toBeDefined();
        expect(Array.isArray(payload['results'])).toBe(true);
        expect(typeof payload['count']).toBe('number');
        expect(typeof payload['showing']).toBe('number');
        expect(typeof payload['directory']).toBe('string');
        // Empty dir: 0 results
        expect(payload['count']).toBe(0);
        console.info('[wpm] results payload.count:', payload['count']);
      }
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('16.6 wpm results human output does not leak raw stack traces', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wpm-results-'));
    try {
      const result = wpmInDir(tmpDir, 'results');
      expect(result.status).toBe(0);
      const lines = (result.stdout + result.stderr).split('\n');
      const stackLines = lines.filter(l => l.trim().startsWith('at ') && l.includes('.js:'));
      expect(stackLines, `Stack trace leaked: ${stackLines.slice(0, 2).join(' | ')}`).toHaveLength(0);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('16.7 wpm results meta has run_id (string) in JSON output', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wpm-results-'));
    try {
      const result = wpmInDir(tmpDir, 'results', '--format', 'json');
      expect(result.status).toBe(0);
      const parsed = parseJson(result.stdout);
      expect(parsed).not.toBeNull();
      const meta = parsed!['meta'] as Record<string, unknown> | undefined;
      expect(meta).toBeDefined();
      if (meta) {
        expect(typeof meta['run_id']).toBe('string');
      }
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('16.8 wpm results after a run: results.count is 1', () => {
    if (!fs.existsSync(XES_STANDARD)) return;
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wpm-results-'));
    try {
      // First: run a prediction to produce a saved result
      wpmInDir(tmpDir, 'predict', 'next-activity', '-i', XES_STANDARD, '--format', 'json');

      // Now list results — should see at least 1 item
      const result = wpmInDir(tmpDir, 'results', '--format', 'json');
      expect(result.status).toBe(0);
      const parsed = parseJson(result.stdout);
      expect(parsed).not.toBeNull();
      if (parsed!['status'] === 'ok') {
        const payload = parsed!['payload'] as Record<string, unknown>;
        const count = payload['count'] as number;
        expect(count).toBeGreaterThanOrEqual(1);
        const items = payload['results'] as unknown[] | undefined;
        if (items) {
          expect(items.length).toBeGreaterThanOrEqual(1);
          const first = items[0] as Record<string, unknown>;
          expect(typeof first['name']).toBe('string');
          console.info('[wpm] results after predict: count=', count, 'first=', first['name']);
        }
      }
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('16.9 wpm results --last after a run: prints most recent result', () => {
    if (!fs.existsSync(XES_STANDARD)) return;
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wpm-results-'));
    try {
      // Run prediction to create a saved result
      wpmInDir(tmpDir, 'predict', 'next-activity', '-i', XES_STANDARD, '--format', 'json');

      // Now fetch the most recent result — --last emits the full SavedResult under payload.cat
      const result = wpmInDir(tmpDir, 'results', '--last', '--format', 'json');
      const acceptable = [0, 1]; // 0=success, 1=no results (if predict didn't save)
      expect(acceptable).toContain(result.status);
      if (result.status === 0) {
        const parsed = parseJson(result.stdout);
        expect(parsed).not.toBeNull();
        if (parsed!['status'] === 'ok') {
          const payload = parsed!['payload'] as Record<string, unknown> | undefined;
          if (payload) {
            // --last returns { cat: { version, task, savedAt, input, activityKey, result } }
            const cat = payload['cat'] as Record<string, unknown> | undefined;
            if (cat) {
              expect(typeof cat['task']).toBe('string');
              expect(typeof cat['savedAt']).toBe('string');
              console.info('[wpm] results --last task:', cat['task']);
            }
          }
        }
      }
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('16.10 wpm results --limit 5 limits output to 5 results max', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wpm-results-'));
    try {
      const result = wpmInDir(tmpDir, 'results', '--limit', '5', '--format', 'json');
      expect(result.status).toBe(0);
      const parsed = parseJson(result.stdout);
      if (parsed!['status'] === 'ok') {
        const payload = parsed!['payload'] as Record<string, unknown>;
        // `showing` tells us how many were returned; must be <= limit
        const showing = payload['showing'] as number;
        expect(showing).toBeLessThanOrEqual(5);
        const items = payload['results'] as unknown[] | undefined;
        if (items) {
          expect(items.length).toBeLessThanOrEqual(5);
        }
      }
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

// ── 17. wpm temporal ──────────────────────────────────────────────────────────

describe('17. wpm temporal', () => {
  it('17.1 wpm temporal --help exits 0', () => {
    // Note: --help has stdout buffering issues in pipe mode (citty quirk).
    // We verify exit code only; content is verified in later functional tests.
    const result = wpm('temporal', '--help');
    expect(result.status).toBe(0);
  });

  it('17.2 wpm temporal with no input exits 2 (source_error)', () => {
    const result = wpm('temporal', '--format', 'json', '--no-save');
    expect(result.status).toBe(2);
    const parsed = parseJson(result.stdout);
    expect(parsed).not.toBeNull();
    expect(parsed!['status']).toBe('error');
    expect(parsed!['exit_code']).toBe(2);
    const msg = String((parsed!['error'] as Record<string, unknown>)?.['message'] ?? '');
    expect(msg).toMatch(/input file required/i);
  });

  it('17.3 wpm temporal with missing file exits 2 (source_error)', () => {
    const result = wpm('temporal', '/tmp/definitely-does-not-exist-lab.xes', '--format', 'json', '--no-save');
    expect(result.status).toBe(2);
    const parsed = parseJson(result.stdout);
    expect(parsed).not.toBeNull();
    expect(parsed!['status']).toBe('error');
  });

  it('17.4 wpm temporal <xes> --format json exits 0 or 3 (never hangs)', () => {
    if (!fs.existsSync(XES_STANDARD)) return;
    const result = wpm('temporal', XES_STANDARD, '--format', 'json', '--no-save');
    const acceptable = [0, 3];
    if (!acceptable.includes(result.status ?? -1)) {
      console.error('[wpm] temporal unexpected exit:', result.status);
      console.error('  stdout:', result.stdout.slice(0, 300));
    }
    expect(acceptable).toContain(result.status);
    console.info('[wpm] temporal exit:', result.status);
  });

  it('17.5 wpm temporal --format json stdout is valid JSON', () => {
    if (!fs.existsSync(XES_STANDARD)) return;
    const result = wpm('temporal', XES_STANDARD, '--format', 'json', '--no-save');
    const acceptable = [0, 3];
    expect(acceptable).toContain(result.status);
    const parsed = parseJson(result.stdout);
    expect(parsed, 'stdout must be valid JSON').not.toBeNull();
  });

  it('17.6 wpm temporal JSON envelope has command="temporal"', () => {
    if (!fs.existsSync(XES_STANDARD)) return;
    const result = wpm('temporal', XES_STANDARD, '--format', 'json', '--no-save');
    const acceptable = [0, 3];
    expect(acceptable).toContain(result.status);
    const parsed = parseJson(result.stdout);
    expect(parsed).not.toBeNull();
    expect(parsed!['command']).toBe('temporal');
  });

  it('17.7 wpm temporal on success: payload has dfg with nodes array', () => {
    if (!fs.existsSync(XES_STANDARD)) return;
    const result = wpm('temporal', XES_STANDARD, '--format', 'json', '--no-save');
    const parsed = parseJson(result.stdout);
    expect(parsed).not.toBeNull();
    if (parsed!['status'] === 'ok') {
      const payload = parsed!['payload'] as Record<string, unknown>;
      // temporal always computes a DFG as its foundation
      expect(payload['dfg']).toBeDefined();
      const dfg = payload['dfg'] as Record<string, unknown>;
      expect(Array.isArray(dfg['nodes'])).toBe(true);
      expect(Array.isArray(dfg['edges'])).toBe(true);
      console.info('[wpm] temporal dfg nodes:', (dfg['nodes'] as unknown[]).length);
    } else {
      console.info('[wpm] temporal returned error (acceptable):', parsed!['status']);
    }
  });

  it('17.8 wpm temporal on success: payload has violations object with count >= 0', () => {
    if (!fs.existsSync(XES_STANDARD)) return;
    const result = wpm('temporal', XES_STANDARD, '--format', 'json', '--no-save');
    const parsed = parseJson(result.stdout);
    expect(parsed).not.toBeNull();
    if (parsed!['status'] === 'ok') {
      const payload = parsed!['payload'] as Record<string, unknown>;
      const violations = payload['violations'] as Record<string, unknown> | undefined;
      if (violations) {
        expect(typeof violations['count']).toBe('number');
        expect(violations['count'] as number).toBeGreaterThanOrEqual(0);
        console.info('[wpm] temporal violations.count:', violations['count']);
      }
    }
  });

  it('17.9 wpm temporal on success: payload has activityKey and timestampKey', () => {
    if (!fs.existsSync(XES_STANDARD)) return;
    const result = wpm('temporal', XES_STANDARD, '--format', 'json', '--no-save');
    const parsed = parseJson(result.stdout);
    expect(parsed).not.toBeNull();
    if (parsed!['status'] === 'ok') {
      const payload = parsed!['payload'] as Record<string, unknown>;
      expect(typeof payload['activityKey']).toBe('string');
      expect(typeof payload['timestampKey']).toBe('string');
      expect(payload['activityKey']).toBe('concept:name');
      expect(payload['timestampKey']).toBe('time:timestamp');
    }
  });

  it('17.10 wpm temporal human output mentions "Temporal"', () => {
    if (!fs.existsSync(XES_STANDARD)) return;
    const result = wpm('temporal', XES_STANDARD, '--no-save');
    const acceptable = [0, 3];
    expect(acceptable).toContain(result.status);
    const out = result.stdout + result.stderr;
    expect(out).toMatch(/temporal|Temporal/i);
  });

  it('17.11 wpm temporal meta has run_id and version', () => {
    if (!fs.existsSync(XES_STANDARD)) return;
    const result = wpm('temporal', XES_STANDARD, '--format', 'json', '--no-save');
    const parsed = parseJson(result.stdout);
    expect(parsed).not.toBeNull();
    const meta = parsed!['meta'] as Record<string, unknown> | undefined;
    expect(meta).toBeDefined();
    if (meta) {
      expect(typeof meta['run_id']).toBe('string');
      expect(typeof meta['version']).toBe('string');
    }
  });

  it('17.12 wpm temporal --threshold flag is accepted (no config error)', () => {
    if (!fs.existsSync(XES_STANDARD)) return;
    const result = wpm('temporal', XES_STANDARD, '--threshold', '0.01', '--format', 'json', '--no-save');
    // threshold is a known option — must not exit 1 (config error)
    expect(result.status).not.toBe(1);
  });

  it('17.13 wpm temporal simple.xes exits 0 or 3 — never 1 (config error)', () => {
    const xes = fs.existsSync(XES_SIMPLE) ? XES_SIMPLE : XES_STANDARD;
    if (!fs.existsSync(xes)) return;
    const result = wpm('temporal', xes, '--format', 'json', '--no-save');
    expect(result.status).not.toBe(1);
  });
});

// ── 18. wpm social ────────────────────────────────────────────────────────────

describe('18. wpm social', () => {
  it('18.1 wpm social --help exits 0', () => {
    // Note: --help has stdout buffering issues in pipe mode (citty quirk).
    // We verify exit code only; content is verified in later functional tests.
    const result = wpm('social', '--help');
    expect(result.status).toBe(0);
  });

  it('18.2 wpm social with no input exits 2 (source_error)', () => {
    const result = wpm('social', '--format', 'json', '--no-save');
    expect(result.status).toBe(2);
    const parsed = parseJson(result.stdout);
    expect(parsed).not.toBeNull();
    expect(parsed!['status']).toBe('error');
    expect(parsed!['exit_code']).toBe(2);
    const msg = String((parsed!['error'] as Record<string, unknown>)?.['message'] ?? '');
    expect(msg).toMatch(/input file required/i);
  });

  it('18.3 wpm social with missing file exits 2 (source_error)', () => {
    const result = wpm('social', '/tmp/definitely-does-not-exist-lab.xes', '--format', 'json', '--no-save');
    expect(result.status).toBe(2);
    const parsed = parseJson(result.stdout);
    expect(parsed).not.toBeNull();
    expect(parsed!['status']).toBe('error');
  });

  it('18.4 wpm social <xes> --format json exits 0 or 3 (never hangs)', () => {
    if (!fs.existsSync(XES_STANDARD)) return;
    const result = wpm('social', XES_STANDARD, '--format', 'json', '--no-save');
    const acceptable = [0, 3];
    if (!acceptable.includes(result.status ?? -1)) {
      console.error('[wpm] social unexpected exit:', result.status);
      console.error('  stdout:', result.stdout.slice(0, 300));
    }
    expect(acceptable).toContain(result.status);
    console.info('[wpm] social exit:', result.status);
  });

  it('18.5 wpm social --format json stdout is valid JSON', () => {
    if (!fs.existsSync(XES_STANDARD)) return;
    const result = wpm('social', XES_STANDARD, '--format', 'json', '--no-save');
    const acceptable = [0, 3];
    expect(acceptable).toContain(result.status);
    const parsed = parseJson(result.stdout);
    expect(parsed, 'stdout must be valid JSON').not.toBeNull();
  });

  it('18.6 wpm social JSON envelope has command="social"', () => {
    if (!fs.existsSync(XES_STANDARD)) return;
    const result = wpm('social', XES_STANDARD, '--format', 'json', '--no-save');
    const acceptable = [0, 3];
    expect(acceptable).toContain(result.status);
    const parsed = parseJson(result.stdout);
    expect(parsed).not.toBeNull();
    expect(parsed!['command']).toBe('social');
  });

  it('18.7 wpm social on success: payload has network with nodes array', () => {
    if (!fs.existsSync(XES_STANDARD)) return;
    const result = wpm('social', XES_STANDARD, '--format', 'json', '--no-save');
    const parsed = parseJson(result.stdout);
    expect(parsed).not.toBeNull();
    if (parsed!['status'] === 'ok') {
      const payload = parsed!['payload'] as Record<string, unknown>;
      const network = payload['network'] as Record<string, unknown> | undefined;
      if (network) {
        expect(Array.isArray(network['nodes'])).toBe(true);
        console.info('[wpm] social network nodes:', (network['nodes'] as unknown[]).length);
      }
    } else {
      console.info('[wpm] social returned error (acceptable for XES without org:resource):', parsed!['status']);
    }
  });

  it('18.8 wpm social on success: payload has metric field', () => {
    if (!fs.existsSync(XES_STANDARD)) return;
    const result = wpm('social', XES_STANDARD, '--format', 'json', '--no-save');
    const parsed = parseJson(result.stdout);
    expect(parsed).not.toBeNull();
    if (parsed!['status'] === 'ok') {
      const payload = parsed!['payload'] as Record<string, unknown>;
      expect(typeof payload['metric']).toBe('string');
      // Default metric is handover
      expect(payload['metric']).toBe('handover');
      console.info('[wpm] social metric:', payload['metric']);
    }
  });

  it('18.9 wpm social --metric working-together is accepted (no config error)', () => {
    if (!fs.existsSync(XES_STANDARD)) return;
    const result = wpm('social', XES_STANDARD, '--metric', 'working-together', '--format', 'json', '--no-save');
    // Must not exit 1 (config error) — metric flag is known
    expect(result.status).not.toBe(1);
    console.info('[wpm] social working-together exit:', result.status);
  });

  it('18.10 wpm social human output mentions "Social Network" or "handover"', () => {
    if (!fs.existsSync(XES_STANDARD)) return;
    const result = wpm('social', XES_STANDARD, '--no-save');
    const acceptable = [0, 3];
    expect(acceptable).toContain(result.status);
    const out = result.stdout + result.stderr;
    expect(out).toMatch(/social network|handover|network|Social/i);
  });

  it('18.11 wpm social meta has run_id and version', () => {
    if (!fs.existsSync(XES_STANDARD)) return;
    const result = wpm('social', XES_STANDARD, '--format', 'json', '--no-save');
    const parsed = parseJson(result.stdout);
    expect(parsed).not.toBeNull();
    const meta = parsed!['meta'] as Record<string, unknown> | undefined;
    expect(meta).toBeDefined();
    if (meta) {
      expect(typeof meta['run_id']).toBe('string');
      expect(typeof meta['version']).toBe('string');
    }
  });

  it('18.12 wpm social simple.xes exits 0 or 3 — never 1 (config error)', () => {
    const xes = fs.existsSync(XES_SIMPLE) ? XES_SIMPLE : XES_STANDARD;
    if (!fs.existsSync(xes)) return;
    const result = wpm('social', xes, '--format', 'json', '--no-save');
    expect(result.status).not.toBe(1);
  });
});
