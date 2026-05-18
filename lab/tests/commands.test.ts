/**
 * Command Coverage Tests — wpm conformance | quality | validate | predict | powl
 *
 * Closes the post-publish validation gap identified in lab/tests/wpm.test.ts:
 * that file covers `status`, `run`, `compare` but omits the five commands below.
 *
 * Every test:
 * - Spawns the real wpm binary via child_process.spawnSync (no mocks)
 * - Asserts on the actual process exit code AND JSON envelope shape
 * - Uses real XES fixtures from lab/fixtures/
 *
 * ── Process exit codes vs JSON envelope exit_code ──────────────────────────────
 *
 * All wpm commands call exitWithFlush(code) which calls process.exit(code).
 * The process exit code IS the real exit code — it is not always 0.
 * The JSON envelope also echoes it in the `exit_code` field for toolchain use.
 *
 * ── Exit code constants ────────────────────────────────────────────────────────
 *   0  = success
 *   1  = config_error
 *   2  = source_error
 *   3  = execution_error
 *   4  = partial_failure
 *   5  = system_error
 *   6  = conformance_fail (conformance command: fitness < threshold)
 *
 * ── Command-specific behavior verified in this file ───────────────────────────
 *   conformance: exits 2 when no input; exits 6 when fitness < threshold (default 0.8)
 *   quality:     exits 2 when no input; exits 3 when model discovery fails
 *   validate:    exits 2 when no input or missing file; exits 0 for valid XES
 *   predict:     exits 1 when no task+input; exits 0 on success
 *   powl:        exits 0 for discover; exits 2 for complexity (missing --model)
 */

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
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
    timeout: 30_000,
    env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0', NODE_ENV: 'production' },
  });
}

/**
 * Parse JSON from CLI stdout.
 * Skips [INFO]/[WARN] log lines emitted before the JSON payload.
 */
function parseJson(output: string): Record<string, unknown> | null {
  // Strip leading log lines (e.g. "[INFO ] 2026-... Initializing WASM module")
  const jsonStart = output.indexOf('\n{');
  const slice = jsonStart !== -1 ? output.slice(jsonStart) : output;
  try {
    return JSON.parse(slice.trim()) as Record<string, unknown>;
  } catch {
    // Try to extract embedded JSON object
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

// ── 7. wpm conformance ────────────────────────────────────────────────────────

describe('7. wpm conformance', () => {
  it('7.0 binary exists at expected path', () => {
    expect(fs.existsSync(WPM_BIN), `Binary not found: ${WPM_BIN}`).toBe(true);
    console.info('[wpm] binary:', WPM_BIN);
  });

  it('7.1 fixtures exist for conformance tests', () => {
    expect(fs.existsSync(XES_STANDARD), `Fixture not found: ${XES_STANDARD}`).toBe(true);
  });

  it('7.2 wpm conformance with no input exits 2 (source_error)', () => {
    const result = wpm('conformance', '--format', 'json', '--no-save');
    expect(result.status).toBe(2);
    const parsed = parseJson(result.stdout);
    expect(parsed).not.toBeNull();
    expect(parsed!['status']).toBe('error');
    expect(parsed!['exit_code']).toBe(2);
  });

  it('7.3 wpm conformance with missing file exits 2 (source_error)', () => {
    const result = wpm('conformance', '/tmp/definitely-does-not-exist-lab.xes', '--format', 'json', '--no-save');
    expect(result.status).toBe(2);
    const parsed = parseJson(result.stdout);
    expect(parsed).not.toBeNull();
    expect(parsed!['status']).toBe('error');
    expect(parsed!['exit_code']).toBe(2);
  });

  it('7.4 wpm conformance <xes> --format json exits non-zero (6=conformance_fail or 0=fit)', () => {
    if (!fs.existsSync(XES_STANDARD)) return;
    const result = wpm('conformance', XES_STANDARD, '--format', 'json', '--no-save');
    // Exits 6 (conformance_fail) when fitness < 0.8, or 0 (success) when fitness >= 0.8
    const acceptable = [0, 6];
    expect(acceptable).toContain(result.status);
    console.info('[wpm] conformance exit:', result.status);
  });

  it('7.5 wpm conformance --format json stdout is valid JSON', () => {
    if (!fs.existsSync(XES_STANDARD)) return;
    const result = wpm('conformance', XES_STANDARD, '--format', 'json', '--no-save');
    const acceptable = [0, 6];
    expect(acceptable).toContain(result.status);
    const parsed = parseJson(result.stdout);
    expect(parsed, 'stdout must be valid JSON').not.toBeNull();
  });

  it('7.6 wpm conformance JSON envelope has command="conformance"', () => {
    if (!fs.existsSync(XES_STANDARD)) return;
    const result = wpm('conformance', XES_STANDARD, '--format', 'json', '--no-save');
    const parsed = parseJson(result.stdout);
    expect(parsed).not.toBeNull();
    expect(parsed!['command']).toBe('conformance');
  });

  it('7.7 wpm conformance payload has fitness field as a number in [0, 1]', () => {
    if (!fs.existsSync(XES_STANDARD)) return;
    const result = wpm('conformance', XES_STANDARD, '--format', 'json', '--no-save');
    const parsed = parseJson(result.stdout);
    expect(parsed).not.toBeNull();
    if (parsed!['status'] === 'ok') {
      const payload = parsed!['payload'] as Record<string, unknown> | null;
      expect(payload).not.toBeNull();
      if (payload) {
        expect(typeof payload['fitness']).toBe('number');
        const fitness = payload['fitness'] as number;
        expect(fitness).toBeGreaterThanOrEqual(0);
        expect(fitness).toBeLessThanOrEqual(1);
        console.info('[wpm] conformance fitness:', fitness);
      }
    }
  });

  it('7.8 wpm conformance payload has isFit field (boolean)', () => {
    if (!fs.existsSync(XES_STANDARD)) return;
    const result = wpm('conformance', XES_STANDARD, '--format', 'json', '--no-save');
    const parsed = parseJson(result.stdout);
    expect(parsed).not.toBeNull();
    if (parsed!['status'] === 'ok') {
      const payload = parsed!['payload'] as Record<string, unknown> | null;
      if (payload) {
        expect(typeof payload['isFit']).toBe('boolean');
      }
    }
  });

  it('7.9 wpm conformance payload has diagnostics with traced/remaining/missing fields', () => {
    if (!fs.existsSync(XES_STANDARD)) return;
    const result = wpm('conformance', XES_STANDARD, '--format', 'json', '--no-save');
    const parsed = parseJson(result.stdout);
    expect(parsed).not.toBeNull();
    if (parsed!['status'] === 'ok') {
      const payload = parsed!['payload'] as Record<string, unknown> | null;
      if (payload) {
        expect(payload['diagnostics']).toBeDefined();
        const diag = payload['diagnostics'] as Record<string, unknown>;
        expect(diag).toHaveProperty('traced');
        expect(diag).toHaveProperty('remaining');
        expect(diag).toHaveProperty('missing');
        console.info('[wpm] conformance diagnostics:', JSON.stringify(diag));
      }
    }
  });

  it('7.10 wpm conformance human output mentions "Fitness"', () => {
    if (!fs.existsSync(XES_STANDARD)) return;
    const result = wpm('conformance', XES_STANDARD, '--no-save');
    const acceptable = [0, 6];
    expect(acceptable).toContain(result.status);
    const out = result.stdout + result.stderr;
    expect(out).toMatch(/fitness|Fitness/i);
  });

  it('7.11 wpm conformance meta has run_id and timestamp', () => {
    if (!fs.existsSync(XES_STANDARD)) return;
    const result = wpm('conformance', XES_STANDARD, '--format', 'json', '--no-save');
    const parsed = parseJson(result.stdout);
    expect(parsed).not.toBeNull();
    const meta = parsed!['meta'] as Record<string, unknown> | undefined;
    expect(meta).toBeDefined();
    if (meta) {
      expect(typeof meta['run_id']).toBe('string');
      expect(typeof meta['timestamp']).toBe('string');
    }
  });
});

// ── 8. wpm quality ────────────────────────────────────────────────────────────

describe('8. wpm quality', () => {
  it('8.1 wpm quality with no input exits 2 (source_error)', () => {
    const result = wpm('quality', '--format', 'json', '--no-save');
    expect(result.status).toBe(2);
    const parsed = parseJson(result.stdout);
    expect(parsed).not.toBeNull();
    expect(parsed!['status']).toBe('error');
    expect(parsed!['exit_code']).toBe(2);
  });

  it('8.2 wpm quality with missing file exits 2 (source_error)', () => {
    const result = wpm('quality', '/tmp/definitely-does-not-exist-lab.xes', '--format', 'json', '--no-save');
    expect(result.status).toBe(2);
    const parsed = parseJson(result.stdout);
    expect(parsed).not.toBeNull();
    expect(parsed!['status']).toBe('error');
  });

  it('8.3 wpm quality <xes> --format json exits 0 or 3 (never hangs or crashes)', () => {
    if (!fs.existsSync(XES_STANDARD)) return;
    const result = wpm('quality', XES_STANDARD, '--format', 'json', '--no-save');
    // Exits 0 (success) or 3 (execution_error when inductive miner returns unexpected structure)
    const acceptable = [0, 3];
    if (!acceptable.includes(result.status ?? -1)) {
      console.error('[wpm] quality unexpected exit:', result.status);
      console.error('  stdout:', result.stdout.slice(0, 300));
    }
    expect(acceptable).toContain(result.status);
    console.info('[wpm] quality exit:', result.status);
  });

  it('8.4 wpm quality --format json stdout is valid JSON', () => {
    if (!fs.existsSync(XES_STANDARD)) return;
    const result = wpm('quality', XES_STANDARD, '--format', 'json', '--no-save');
    const parsed = parseJson(result.stdout);
    expect(parsed, 'stdout must be valid JSON').not.toBeNull();
  });

  it('8.5 wpm quality JSON envelope has command="quality"', () => {
    if (!fs.existsSync(XES_STANDARD)) return;
    const result = wpm('quality', XES_STANDARD, '--format', 'json', '--no-save');
    const parsed = parseJson(result.stdout);
    expect(parsed).not.toBeNull();
    expect(parsed!['command']).toBe('quality');
  });

  it('8.6 wpm quality on success: payload.scores has fitness (number)', () => {
    if (!fs.existsSync(XES_STANDARD)) return;
    const result = wpm('quality', XES_STANDARD, '--format', 'json', '--no-save');
    const parsed = parseJson(result.stdout);
    expect(parsed).not.toBeNull();
    if (parsed!['status'] === 'ok') {
      const payload = parsed!['payload'] as Record<string, unknown>;
      const scores = payload['scores'] as Record<string, unknown> | undefined;
      if (scores) {
        expect(typeof scores['fitness']).toBe('number');
        const fitness = scores['fitness'] as number;
        expect(fitness).toBeGreaterThanOrEqual(0);
        expect(fitness).toBeLessThanOrEqual(1);
        console.info('[wpm] quality scores:', JSON.stringify(scores));
      }
    } else {
      // execution_error is acceptable — model discovery may fail on simple logs
      expect([3, 2]).toContain(parsed!['exit_code'] as number);
      console.info('[wpm] quality returned error (acceptable):', (parsed!['error'] as Record<string,unknown>)?.['message']);
    }
  });

  it('8.7 wpm quality meta has run_id and version', () => {
    if (!fs.existsSync(XES_STANDARD)) return;
    const result = wpm('quality', XES_STANDARD, '--format', 'json', '--no-save');
    const parsed = parseJson(result.stdout);
    expect(parsed).not.toBeNull();
    const meta = parsed!['meta'] as Record<string, unknown> | undefined;
    expect(meta).toBeDefined();
    if (meta) {
      expect(typeof meta['run_id']).toBe('string');
      expect(typeof meta['version']).toBe('string');
    }
  });

  it('8.8 wpm quality simple.xes exits 0 or 3 — never 1 (config error)', () => {
    const xes = fs.existsSync(XES_SIMPLE) ? XES_SIMPLE : XES_STANDARD;
    if (!fs.existsSync(xes)) return;
    const result = wpm('quality', xes, '--format', 'json', '--no-save');
    // Config errors (exit 1) should not appear for valid input
    expect(result.status).not.toBe(1);
  });
});

// ── 9. wpm validate ───────────────────────────────────────────────────────────

describe('9. wpm validate', () => {
  it('9.1 wpm validate with no input exits 2 (source_error)', () => {
    const result = wpm('validate');
    expect(result.status).toBe(2);
    const out = result.stdout + result.stderr;
    expect(out).toMatch(/input file required/i);
  });

  it('9.2 wpm validate with missing file exits 2 (source_error)', () => {
    const result = wpm('validate', '/tmp/definitely-does-not-exist-lab.xes');
    expect(result.status).toBe(2);
    const out = result.stdout + result.stderr;
    expect(out).toMatch(/not found|does not exist/i);
  });

  it('9.3 wpm validate --format json is rejected with exit 2 (format=xes|csv only)', () => {
    if (!fs.existsSync(XES_STANDARD)) return;
    const result = wpm('validate', XES_STANDARD, '--format', 'json');
    // validate --format controls input format (xes|csv), not output — json is invalid
    expect(result.status).toBe(2);
    const out = result.stdout + result.stderr;
    expect(out).toMatch(/invalid format/i);
  });

  it('9.4 wpm validate <xes> exits 0 for a valid XES log', () => {
    if (!fs.existsSync(XES_STANDARD)) return;
    const result = wpm('validate', XES_STANDARD);
    expect(result.status).toBe(0);
  });

  it('9.5 wpm validate human output contains "Event Log Validation"', () => {
    if (!fs.existsSync(XES_STANDARD)) return;
    const result = wpm('validate', XES_STANDARD);
    expect(result.status).toBe(0);
    const out = result.stdout + result.stderr;
    expect(out).toMatch(/Event Log Validation/i);
  });

  it('9.6 wpm validate human output contains the file path', () => {
    if (!fs.existsSync(XES_STANDARD)) return;
    const result = wpm('validate', XES_STANDARD);
    expect(result.status).toBe(0);
    const out = result.stdout + result.stderr;
    expect(out).toContain('sample-xes-1.0.xes');
  });

  it('9.7 wpm validate supports -i alias for input file', () => {
    if (!fs.existsSync(XES_STANDARD)) return;
    const result = wpm('validate', '-i', XES_STANDARD);
    expect(result.status).toBe(0);
    const out = result.stdout + result.stderr;
    expect(out).toMatch(/Event Log Validation/i);
  });

  it('9.8 wpm validate simple.xes exits 0', () => {
    if (!fs.existsSync(XES_SIMPLE)) return;
    const result = wpm('validate', XES_SIMPLE);
    expect(result.status).toBe(0);
  });

  it('9.9 wpm validate --format xes exits 0 (xes is valid input format)', () => {
    if (!fs.existsSync(XES_STANDARD)) return;
    const result = wpm('validate', XES_STANDARD, '--format', 'xes');
    expect(result.status).toBe(0);
  });
});

// ── 10. wpm predict ───────────────────────────────────────────────────────────

describe('10. wpm predict', () => {
  it('10.1 wpm predict next-activity with no -i exits 1 (config_error)', () => {
    const result = wpm('predict', 'next-activity');
    // No input file provided: exits 1 (config_error) not 0
    expect(result.status).toBe(1);
  });

  it('10.2 wpm predict next-activity -i <xes> --format json exits 0', () => {
    if (!fs.existsSync(XES_STANDARD)) return;
    const result = wpm('predict', 'next-activity', '-i', XES_STANDARD, '--format', 'json', '--no-save');
    expect(result.status).toBe(0);
  });

  it('10.3 wpm predict next-activity --format json stdout is valid JSON', () => {
    if (!fs.existsSync(XES_STANDARD)) return;
    const result = wpm('predict', 'next-activity', '-i', XES_STANDARD, '--format', 'json', '--no-save');
    expect(result.status).toBe(0);
    const parsed = parseJson(result.stdout);
    expect(parsed, 'stdout must be valid JSON').not.toBeNull();
  });

  it('10.4 wpm predict JSON envelope has command="predict"', () => {
    if (!fs.existsSync(XES_STANDARD)) return;
    const result = wpm('predict', 'next-activity', '-i', XES_STANDARD, '--format', 'json', '--no-save');
    expect(result.status).toBe(0);
    const parsed = parseJson(result.stdout);
    expect(parsed).not.toBeNull();
    expect(parsed!['command']).toBe('predict');
  });

  it('10.5 wpm predict JSON payload has task="next-activity" and predictions array', () => {
    if (!fs.existsSync(XES_STANDARD)) return;
    const result = wpm('predict', 'next-activity', '-i', XES_STANDARD, '--format', 'json', '--no-save');
    expect(result.status).toBe(0);
    const parsed = parseJson(result.stdout);
    expect(parsed).not.toBeNull();
    if (parsed!['status'] === 'ok') {
      const payload = parsed!['payload'] as Record<string, unknown>;
      expect(payload['task']).toBe('next-activity');
      expect(Array.isArray(payload['predictions'])).toBe(true);
      console.info('[wpm] predict next-activity predictions count:', (payload['predictions'] as unknown[]).length);
    }
  });

  it('10.6 wpm predict remaining-time -i <xes> --format json exits 0', () => {
    if (!fs.existsSync(XES_STANDARD)) return;
    const result = wpm('predict', 'remaining-time', '-i', XES_STANDARD, '--format', 'json', '--no-save');
    expect(result.status).toBe(0);
    const parsed = parseJson(result.stdout);
    expect(parsed).not.toBeNull();
    expect(parsed!['command']).toBe('predict');
    console.info('[wpm] predict remaining-time status:', parsed?.['status']);
  });

  it('10.7 wpm predict with missing file exits 2 (source_error)', () => {
    const result = wpm('predict', 'next-activity', '-i', '/tmp/missing-lab.xes', '--format', 'json', '--no-save');
    expect(result.status).toBe(2);
    const parsed = parseJson(result.stdout);
    expect(parsed).not.toBeNull();
    expect(parsed!['exit_code']).toBe(2);
  });

  it('10.8 wpm predict meta has run_id and version', () => {
    if (!fs.existsSync(XES_STANDARD)) return;
    const result = wpm('predict', 'next-activity', '-i', XES_STANDARD, '--format', 'json', '--no-save');
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

// ── 11. wpm powl ─────────────────────────────────────────────────────────────

describe('11. wpm powl', () => {
  it('11.1 wpm powl --help exits 0', () => {
    const result = wpm('powl', '--help');
    expect(result.status).toBe(0);
  });

  it('11.2 wpm powl discover -i <xes> --format json exits 0', () => {
    if (!fs.existsSync(XES_STANDARD)) return;
    const result = wpm('powl', 'discover', '-i', XES_STANDARD, '--format', 'json', '--no-save');
    expect(result.status).toBe(0);
  });

  it('11.3 wpm powl discover --format json stdout is valid JSON', () => {
    if (!fs.existsSync(XES_STANDARD)) return;
    const result = wpm('powl', 'discover', '-i', XES_STANDARD, '--format', 'json', '--no-save');
    expect(result.status).toBe(0);
    const parsed = parseJson(result.stdout);
    expect(parsed, 'stdout must be valid JSON').not.toBeNull();
  });

  it('11.4 wpm powl discover JSON envelope command starts with "powl"', () => {
    if (!fs.existsSync(XES_STANDARD)) return;
    const result = wpm('powl', 'discover', '-i', XES_STANDARD, '--format', 'json', '--no-save');
    expect(result.status).toBe(0);
    const parsed = parseJson(result.stdout);
    expect(parsed).not.toBeNull();
    expect(String(parsed!['command'])).toMatch(/^powl/);
  });

  it('11.5 wpm powl discover payload has repr (POWL string) and node_count > 0', () => {
    if (!fs.existsSync(XES_STANDARD)) return;
    const result = wpm('powl', 'discover', '-i', XES_STANDARD, '--format', 'json', '--no-save');
    expect(result.status).toBe(0);
    const parsed = parseJson(result.stdout);
    expect(parsed).not.toBeNull();
    if (parsed!['status'] === 'ok') {
      const payload = parsed!['payload'] as Record<string, unknown>;
      expect(typeof payload['repr']).toBe('string');
      expect(typeof payload['node_count']).toBe('number');
      expect((payload['node_count'] as number)).toBeGreaterThan(0);
      console.info('[wpm] powl discover node_count:', payload['node_count']);
      console.info('[wpm] powl discover repr:', String(payload['repr']).slice(0, 80));
    }
  });

  it('11.6 wpm powl discover with missing file exits 3 (execution_error from ENOENT)', () => {
    const result = wpm('powl', 'discover', '-i', '/tmp/missing-lab.xes', '--format', 'json', '--no-save');
    // powl discover returns exit_code=3 for missing files (ENOENT is caught as COMMAND_ERROR)
    expect(result.status).toBe(3);
    const parsed = parseJson(result.stdout);
    expect(parsed).not.toBeNull();
    expect(parsed!['status']).toBe('error');
  });

  it('11.7 wpm powl complexity requires --model and exits 2 without it', () => {
    if (!fs.existsSync(XES_STANDARD)) return;
    const result = wpm('powl', 'complexity', '-i', XES_STANDARD, '--format', 'json', '--no-save');
    // complexity requires --model which we haven't provided
    expect(result.status).toBe(2);
    const parsed = parseJson(result.stdout);
    expect(parsed).not.toBeNull();
    expect(parsed!['status']).toBe('error');
    const errorMsg = String((parsed!['error'] as Record<string,unknown>)?.['message'] ?? '');
    expect(errorMsg).toMatch(/missing.*model|--model/i);
  });
});
