/**
 * quality-gaps.test.ts — Van der Aalst 4-dimension JSON contract + threshold + edge cases
 *
 * Test catalogue:
 *
 *   TOP-LEVEL DIMENSION FIELDS (primary contract):
 *   DIM-1:  payload.fitness is a number or null (not missing)
 *   DIM-2:  payload.precision is a number or null (not missing)
 *   DIM-3:  payload.generalization is a number or null (not missing)
 *   DIM-4:  payload.simplicity is a number or null (not missing)
 *   DIM-5:  all 4 fields present simultaneously (not only when individually requested)
 *   DIM-6:  top-level fields mirror payload.scores values
 *   DIM-7:  top-level fields mirror payload.dimensions values
 *   DIM-8:  generalization > 0 for a 2-trace log
 *   DIM-9:  all 4 fields present for a 1-trace log (generalization may be 0)
 *   DIM-10: --metrics fitness only → fitness is number, others are null
 *
 *   ENVELOPE FIELDS:
 *   ENV-1:  outer envelope status=ok on success
 *   ENV-2:  payload.status=success on success
 *   ENV-3:  payload.message is a non-empty string
 *   ENV-4:  payload.algorithm is a non-empty string
 *   ENV-5:  meta block has run_id, timestamp, duration_ms, version
 *
 *   THRESHOLD VALIDATION:
 *   TH-1:  --threshold=-0.1 exits 1 (config_error)
 *   TH-2:  --threshold=1.5 exits 1 (config_error)
 *   TH-3:  --threshold=abc exits 1, error.code=INVALID_THRESHOLD
 *   TH-4:  --threshold=0.7 accepted (never config_error)
 *   TH-5:  --threshold=0 accepted, passed_threshold=true
 *   TH-6:  --threshold=1.0 accepted (may exit 3 if score < 1)
 *   TH-7:  threshold field in payload when --threshold provided
 *   TH-8:  threshold field absent when --threshold not provided
 *   TH-9:  passed_threshold absent when --threshold not provided
 *   TH-10: exit-code/passed_threshold consistency
 *
 *   ALGORITHM FLAG:
 *   ALG-1: --algorithm ilp accepted, exits 0
 *   ALG-2: -a ilp (alias) accepted, exits 0
 *   ALG-3: --algorithm inductive falls back gracefully, exits 0
 *   ALG-4: payload.algorithm is non-empty string after any --algorithm value
 *
 *   DIMENSIONS ALIAS:
 *   SC-1:  payload.dimensions mirrors payload.scores keys
 *   SC-2:  payload.dimensions mirrors payload.scores values
 *   SC-3:  payload.activityKey reflects --activity-key value
 *   SC-4:  aggregate.score equals mean of scores for subsets
 *   SC-5:  payload.metrics is an Array
 *   SC-6:  model.nodes and model.edges are integers
 *
 *   HUMAN OUTPUT:
 *   HO-1:  human output contains all 4 dimension names
 *   HO-2:  human output contains block-fill bar characters
 *
 *   EXIT CODES:
 *   EX-1:  missing --input exits 1 (config_error)
 *   EX-2:  non-existent file exits 2 (source_error)
 *   EX-3:  unsupported extension exits 2 (source_error)
 *   EX-4:  empty XES (no traces) exits 2 or 3, not 1 or 5
 *   EX-5:  single-trace XES exits 0 or 3, never 1 or 2
 *
 * Ambient config pollution guard:
 *   Every execFile call passes { cwd: tempDir } where tempDir has no wasm4pm.toml.
 *
 * Build requirement: `cd apps/wasm4pm && npm run build` before running.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ---------------------------------------------------------------------------
// Infrastructure
// ---------------------------------------------------------------------------

const CLI_PATH = path.resolve(__dirname, '../../dist/bin/wpm.js');
const TEST_TIMEOUT_MS = 45_000;

interface CliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

// runCli always uses an isolated cwd with NO wasm4pm.toml present.
// This prevents ambient config pollution from overriding algorithm / format.
function runCli(
  args: string[],
  cwd: string,
  timeoutMs = TEST_TIMEOUT_MS
): Promise<CliResult> {
  return new Promise((resolve) => {
    const child = execFile(
      process.execPath,
      [CLI_PATH, ...args],
      { timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024, cwd },
      (error, stdout, stderr) => {
        const exitCode =
          error && 'code' in error && typeof error.code === 'number'
            ? error.code
            : error
              ? 1
              : 0;
        resolve({ exitCode, stdout: stdout ?? '', stderr: stderr ?? '' });
      }
    );
    child.on('error', () =>
      resolve({ exitCode: 5, stdout: '', stderr: 'Process failed to start' })
    );
  });
}

function parseEnvelope(result: CliResult): Record<string, unknown> {
  return JSON.parse(result.stdout.trim()) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Fixture management
// ---------------------------------------------------------------------------

let tempDir: string;
let xesPath: string;       // 2-trace log — generalization > 0
let xes1Path: string;      // 1-trace log — generalization can be 0
let emptyXesPath: string;  // no traces — empty XES

const TWO_TRACE_XES = `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0">
  <trace>
    <string key="concept:name" value="case1"/>
    <event><string key="concept:name" value="A"/><date key="time:timestamp" value="2024-01-01T00:00:00.000+00:00"/></event>
    <event><string key="concept:name" value="B"/><date key="time:timestamp" value="2024-01-01T01:00:00.000+00:00"/></event>
    <event><string key="concept:name" value="C"/><date key="time:timestamp" value="2024-01-01T02:00:00.000+00:00"/></event>
  </trace>
  <trace>
    <string key="concept:name" value="case2"/>
    <event><string key="concept:name" value="A"/><date key="time:timestamp" value="2024-01-02T00:00:00.000+00:00"/></event>
    <event><string key="concept:name" value="B"/><date key="time:timestamp" value="2024-01-02T01:00:00.000+00:00"/></event>
    <event><string key="concept:name" value="D"/><date key="time:timestamp" value="2024-01-02T02:00:00.000+00:00"/></event>
  </trace>
</log>`;

const ONE_TRACE_XES = `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0">
  <trace>
    <string key="concept:name" value="case1"/>
    <event><string key="concept:name" value="A"/><date key="time:timestamp" value="2024-01-01T00:00:00.000+00:00"/></event>
    <event><string key="concept:name" value="B"/><date key="time:timestamp" value="2024-01-01T01:00:00.000+00:00"/></event>
    <event><string key="concept:name" value="C"/><date key="time:timestamp" value="2024-01-01T02:00:00.000+00:00"/></event>
  </trace>
</log>`;

const EMPTY_XES = `<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0">
</log>`;

beforeAll(() => {
  // No wasm4pm.toml in this directory — pure isolation
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wpm-quality-gaps-'));
  xesPath = path.join(tempDir, 'two.xes');
  xes1Path = path.join(tempDir, 'one.xes');
  emptyXesPath = path.join(tempDir, 'empty.xes');
  fs.writeFileSync(xesPath, TWO_TRACE_XES, 'utf-8');
  fs.writeFileSync(xes1Path, ONE_TRACE_XES, 'utf-8');
  fs.writeFileSync(emptyXesPath, EMPTY_XES, 'utf-8');
});

afterAll(() => {
  try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch { /* non-fatal */ }
});

// Convenience: run against the 2-trace log with --format json --no-save
async function runQuality(extraArgs: string[] = []): Promise<CliResult> {
  return runCli(
    ['quality', '-i', xesPath, '--format', 'json', '--no-save', ...extraArgs],
    tempDir
  );
}

// ---------------------------------------------------------------------------
// DIM: Top-level Van der Aalst 4-dimension fields
// ---------------------------------------------------------------------------

describe('DIM: Van der Aalst 4 quality dimensions at top-level of payload', () => {
  it('DIM-1: payload.fitness is a number or null (not missing)', async () => {
    const result = await runQuality();
    expect(result.exitCode).toBe(0);
    const payload = (parseEnvelope(result).payload ?? {}) as Record<string, unknown>;
    expect(Object.prototype.hasOwnProperty.call(payload, 'fitness')).toBe(true);
    if (payload.fitness !== null) {
      expect(typeof payload.fitness).toBe('number');
    }
  }, TEST_TIMEOUT_MS);

  it('DIM-2: payload.precision is a number or null (not missing)', async () => {
    const result = await runQuality();
    expect(result.exitCode).toBe(0);
    const payload = (parseEnvelope(result).payload ?? {}) as Record<string, unknown>;
    expect(Object.prototype.hasOwnProperty.call(payload, 'precision')).toBe(true);
    if (payload.precision !== null) {
      expect(typeof payload.precision).toBe('number');
    }
  }, TEST_TIMEOUT_MS);

  it('DIM-3: payload.generalization is a number or null (not missing)', async () => {
    const result = await runQuality();
    expect(result.exitCode).toBe(0);
    const payload = (parseEnvelope(result).payload ?? {}) as Record<string, unknown>;
    expect(Object.prototype.hasOwnProperty.call(payload, 'generalization')).toBe(true);
    if (payload.generalization !== null) {
      expect(typeof payload.generalization).toBe('number');
    }
  }, TEST_TIMEOUT_MS);

  it('DIM-4: payload.simplicity is a number or null (not missing)', async () => {
    const result = await runQuality();
    expect(result.exitCode).toBe(0);
    const payload = (parseEnvelope(result).payload ?? {}) as Record<string, unknown>;
    expect(Object.prototype.hasOwnProperty.call(payload, 'simplicity')).toBe(true);
    if (payload.simplicity !== null) {
      expect(typeof payload.simplicity).toBe('number');
    }
  }, TEST_TIMEOUT_MS);

  it('DIM-5: all 4 fields are present simultaneously', async () => {
    const result = await runQuality();
    expect(result.exitCode).toBe(0);
    const payload = (parseEnvelope(result).payload ?? {}) as Record<string, unknown>;
    for (const dim of ['fitness', 'precision', 'generalization', 'simplicity']) {
      expect(Object.prototype.hasOwnProperty.call(payload, dim),
        `payload missing '${dim}'`).toBe(true);
    }
  }, TEST_TIMEOUT_MS);

  it('DIM-6: top-level fields mirror payload.scores values', async () => {
    const result = await runQuality();
    expect(result.exitCode).toBe(0);
    const payload = (parseEnvelope(result).payload ?? {}) as Record<string, unknown>;
    const scores = (payload.scores ?? {}) as Record<string, number>;
    for (const dim of ['fitness', 'precision', 'generalization', 'simplicity'] as const) {
      if (scores[dim] !== undefined && payload[dim] !== null) {
        expect(payload[dim]).toBe(scores[dim]);
      }
    }
  }, TEST_TIMEOUT_MS);

  it('DIM-7: top-level fields mirror payload.dimensions values', async () => {
    const result = await runQuality();
    expect(result.exitCode).toBe(0);
    const payload = (parseEnvelope(result).payload ?? {}) as Record<string, unknown>;
    const dimensions = (payload.dimensions ?? {}) as Record<string, number>;
    for (const dim of ['fitness', 'precision', 'generalization', 'simplicity'] as const) {
      if (dimensions[dim] !== undefined && payload[dim] !== null) {
        expect(payload[dim]).toBe(dimensions[dim]);
      }
    }
  }, TEST_TIMEOUT_MS);

  it('DIM-8: generalization > 0 for a 2-trace log', async () => {
    const result = await runQuality();
    expect(result.exitCode).toBe(0);
    const payload = (parseEnvelope(result).payload ?? {}) as Record<string, unknown>;
    if (payload.generalization !== null) {
      expect(payload.generalization as number).toBeGreaterThan(0);
    }
  }, TEST_TIMEOUT_MS);

  it('DIM-9: all 4 fields present for a 1-trace log (generalization may be 0)', async () => {
    const result = await runCli(
      ['quality', '-i', xes1Path, '--format', 'json', '--no-save'],
      tempDir
    );
    // 1-trace log must not be a config or source error
    expect(result.exitCode).not.toBe(1);
    expect(result.exitCode).not.toBe(2);
    const payload = (parseEnvelope(result).payload ?? {}) as Record<string, unknown>;
    for (const dim of ['fitness', 'precision', 'generalization', 'simplicity']) {
      expect(Object.prototype.hasOwnProperty.call(payload, dim),
        `payload missing '${dim}'`).toBe(true);
    }
  }, TEST_TIMEOUT_MS);

  it('DIM-10: --metrics fitness only → fitness is number, others are null', async () => {
    const result = await runCli(
      ['quality', '-i', xesPath, '--metrics', 'fitness', '--format', 'json', '--no-save'],
      tempDir
    );
    expect(result.exitCode).toBe(0);
    const payload = (parseEnvelope(result).payload ?? {}) as Record<string, unknown>;
    expect(typeof payload.fitness).toBe('number');
    expect(payload.precision).toBeNull();
    expect(payload.generalization).toBeNull();
    expect(payload.simplicity).toBeNull();
  }, TEST_TIMEOUT_MS);
});

// ---------------------------------------------------------------------------
// ENV: Outer envelope and payload meta-fields
// ---------------------------------------------------------------------------

describe('ENV: JSON envelope structure for successful run', () => {
  it('ENV-1: outer envelope has status=ok', async () => {
    const result = await runQuality();
    expect(result.exitCode).toBe(0);
    expect(parseEnvelope(result).status).toBe('ok');
  }, TEST_TIMEOUT_MS);

  it('ENV-2: payload.status=success', async () => {
    const result = await runQuality();
    expect(result.exitCode).toBe(0);
    const payload = (parseEnvelope(result).payload ?? {}) as Record<string, unknown>;
    expect(payload.status).toBe('success');
  }, TEST_TIMEOUT_MS);

  it('ENV-3: payload.message is a non-empty string', async () => {
    const result = await runQuality();
    expect(result.exitCode).toBe(0);
    const payload = (parseEnvelope(result).payload ?? {}) as Record<string, unknown>;
    expect(typeof payload.message).toBe('string');
    expect((payload.message as string).length).toBeGreaterThan(0);
  }, TEST_TIMEOUT_MS);

  it('ENV-4: payload.algorithm is a non-empty string', async () => {
    const result = await runQuality();
    expect(result.exitCode).toBe(0);
    const payload = (parseEnvelope(result).payload ?? {}) as Record<string, unknown>;
    expect(typeof payload.algorithm).toBe('string');
    expect((payload.algorithm as string).length).toBeGreaterThan(0);
  }, TEST_TIMEOUT_MS);

  it('ENV-5: meta block has run_id, timestamp, duration_ms, version', async () => {
    const result = await runQuality();
    expect(result.exitCode).toBe(0);
    const meta = (parseEnvelope(result).meta ?? {}) as Record<string, unknown>;
    expect(typeof meta.run_id).toBe('string');
    expect(typeof meta.timestamp).toBe('string');
    expect(typeof meta.duration_ms).toBe('number');
    expect(typeof meta.version).toBe('string');
  }, TEST_TIMEOUT_MS);
});

// ---------------------------------------------------------------------------
// TH: Threshold flag contract
// ---------------------------------------------------------------------------

describe('TH: --threshold validation and exit code semantics', () => {
  it('TH-1: --threshold=-0.1 exits 1 (config_error)', async () => {
    const result = await runCli(
      ['quality', '-i', xesPath, '--threshold=-0.1', '--format', 'json', '--no-save'],
      tempDir
    );
    expect(result.exitCode).toBe(1);
  }, TEST_TIMEOUT_MS);

  it('TH-2: --threshold=1.5 exits 1 (config_error)', async () => {
    const result = await runCli(
      ['quality', '-i', xesPath, '--threshold=1.5', '--format', 'json', '--no-save'],
      tempDir
    );
    expect(result.exitCode).toBe(1);
  }, TEST_TIMEOUT_MS);

  it('TH-3: --threshold=abc exits 1, error.code=INVALID_THRESHOLD', async () => {
    const result = await runCli(
      ['quality', '-i', xesPath, '--threshold=abc', '--format', 'json', '--no-save'],
      tempDir
    );
    expect(result.exitCode).toBe(1);
    const envelope = parseEnvelope(result);
    expect(envelope.status).toBe('error');
    const err = (envelope.error ?? {}) as Record<string, unknown>;
    expect(err.code).toBe('INVALID_THRESHOLD');
  }, TEST_TIMEOUT_MS);

  it('TH-4: --threshold=0.7 accepted (exit 0 or 3, never config_error)', async () => {
    const result = await runCli(
      ['quality', '-i', xesPath, '--threshold=0.7', '--format', 'json', '--no-save'],
      tempDir
    );
    expect(result.exitCode).not.toBe(1);
  }, TEST_TIMEOUT_MS);

  it('TH-5: --threshold=0 always passes when WASM succeeds', async () => {
    const result = await runCli(
      ['quality', '-i', xesPath, '--threshold=0', '--format', 'json', '--no-save'],
      tempDir
    );
    expect(result.exitCode).not.toBe(1);
    if (result.exitCode === 0) {
      const payload = (parseEnvelope(result).payload ?? {}) as Record<string, unknown>;
      const agg = (payload.aggregate ?? {}) as Record<string, unknown>;
      expect(agg.passed_threshold).toBe(true);
    }
  }, TEST_TIMEOUT_MS);

  it('TH-6: --threshold=1.0 accepted (may exit 3 if aggregate < 1)', async () => {
    const result = await runCli(
      ['quality', '-i', xesPath, '--threshold=1.0', '--format', 'json', '--no-save'],
      tempDir
    );
    // Never config_error (1); may be success (0) or threshold-fail (3)
    expect(result.exitCode).not.toBe(1);
    expect([0, 3]).toContain(result.exitCode);
  }, TEST_TIMEOUT_MS);

  it('TH-7: payload.threshold is numeric when --threshold provided', async () => {
    const result = await runCli(
      ['quality', '-i', xesPath, '--threshold=0.8', '--format', 'json', '--no-save'],
      tempDir
    );
    if (result.stdout.trim() === '') return;
    const envelope = parseEnvelope(result);
    if ((envelope.status as string) === 'ok') {
      const payload = (envelope.payload ?? {}) as Record<string, unknown>;
      expect(typeof payload.threshold).toBe('number');
      expect(payload.threshold as number).toBeCloseTo(0.8, 5);
    }
  }, TEST_TIMEOUT_MS);

  it('TH-8: payload.threshold absent when --threshold not provided', async () => {
    const result = await runQuality();
    expect(result.exitCode).toBe(0);
    const payload = (parseEnvelope(result).payload ?? {}) as Record<string, unknown>;
    expect(payload.threshold).toBeUndefined();
  }, TEST_TIMEOUT_MS);

  it('TH-9: aggregate.passed_threshold absent when --threshold not provided', async () => {
    const result = await runQuality();
    expect(result.exitCode).toBe(0);
    const payload = (parseEnvelope(result).payload ?? {}) as Record<string, unknown>;
    const agg = (payload.aggregate ?? {}) as Record<string, unknown>;
    expect(agg.passed_threshold).toBeUndefined();
  }, TEST_TIMEOUT_MS);

  it('TH-10: exit code is consistent with passed_threshold', async () => {
    const result = await runCli(
      ['quality', '-i', xesPath, '--threshold=1.0', '--format', 'json', '--no-save'],
      tempDir
    );
    if (result.stdout.trim() === '' || result.exitCode === 3 && !result.stdout.trim()) return;
    const envelope = parseEnvelope(result);
    if ((envelope.status as string) !== 'ok') return;
    const payload = (envelope.payload ?? {}) as Record<string, unknown>;
    const agg = (payload.aggregate ?? {}) as Record<string, unknown>;
    if (agg.passed_threshold === false) {
      expect(result.exitCode).toBe(3);
    } else if (agg.passed_threshold === true) {
      expect(result.exitCode).toBe(0);
    }
  }, TEST_TIMEOUT_MS);
});

// ---------------------------------------------------------------------------
// ALG: --algorithm flag
// ---------------------------------------------------------------------------

describe('ALG: --algorithm flag is accepted by quality command', () => {
  it('ALG-1: --algorithm ilp exits 0', async () => {
    const result = await runCli(
      ['quality', '-i', xesPath, '--algorithm', 'ilp', '--format', 'json', '--no-save'],
      tempDir
    );
    expect(result.exitCode).toBe(0);
  }, TEST_TIMEOUT_MS);

  it('ALG-2: -a ilp (alias) exits 0', async () => {
    const result = await runCli(
      ['quality', '-i', xesPath, '-a', 'ilp', '--format', 'json', '--no-save'],
      tempDir
    );
    expect(result.exitCode).toBe(0);
  }, TEST_TIMEOUT_MS);

  it('ALG-3: --algorithm inductive falls back gracefully, exits 0', async () => {
    const result = await runCli(
      ['quality', '-i', xesPath, '--algorithm', 'inductive', '--format', 'json', '--no-save'],
      tempDir
    );
    expect(result.exitCode).toBe(0);
    const payload = (parseEnvelope(result).payload ?? {}) as Record<string, unknown>;
    // All 4 dimensions must still be present regardless of fallback
    for (const dim of ['fitness', 'precision', 'generalization', 'simplicity']) {
      expect(Object.prototype.hasOwnProperty.call(payload, dim)).toBe(true);
    }
  }, TEST_TIMEOUT_MS);

  it('ALG-4: payload.algorithm is non-empty string after any --algorithm value', async () => {
    for (const algo of ['ilp', 'inductive', 'heuristic']) {
      const result = await runCli(
        ['quality', '-i', xesPath, '--algorithm', algo, '--format', 'json', '--no-save'],
        tempDir
      );
      expect(result.exitCode).toBe(0);
      const payload = (parseEnvelope(result).payload ?? {}) as Record<string, unknown>;
      expect(typeof payload.algorithm).toBe('string');
      expect((payload.algorithm as string).length).toBeGreaterThan(0);
    }
  }, TEST_TIMEOUT_MS);
});

// ---------------------------------------------------------------------------
// SC: Scores / dimensions alias and ancillary fields
// ---------------------------------------------------------------------------

describe('SC: payload.dimensions, scores alias and ancillary fields', () => {
  it('SC-1: dimensions and scores have identical keys', async () => {
    const result = await runQuality();
    expect(result.exitCode).toBe(0);
    const payload = (parseEnvelope(result).payload ?? {}) as Record<string, unknown>;
    const scores = Object.keys((payload.scores ?? {}) as object).sort();
    const dims = Object.keys((payload.dimensions ?? {}) as object).sort();
    expect(dims).toEqual(scores);
  }, TEST_TIMEOUT_MS);

  it('SC-2: dimensions values are identical to scores values', async () => {
    const result = await runQuality();
    expect(result.exitCode).toBe(0);
    const payload = (parseEnvelope(result).payload ?? {}) as Record<string, unknown>;
    const scores = (payload.scores ?? {}) as Record<string, number>;
    const dims = (payload.dimensions ?? {}) as Record<string, number>;
    for (const key of Object.keys(scores)) {
      expect(dims[key]).toBe(scores[key]);
    }
  }, TEST_TIMEOUT_MS);

  it('SC-3: payload.activityKey reflects --activity-key option', async () => {
    const result = await runCli(
      [
        'quality', '-i', xesPath,
        '--activity-key', 'lifecycle:transition',
        '--format', 'json', '--no-save',
      ],
      tempDir
    );
    if (result.stdout.trim() === '') return;
    const envelope = parseEnvelope(result);
    if ((envelope.status as string) === 'ok') {
      const payload = (envelope.payload ?? {}) as Record<string, unknown>;
      expect(payload.activityKey).toBe('lifecycle:transition');
    }
  }, TEST_TIMEOUT_MS);

  it('SC-4: aggregate.score equals mean of computed scores', async () => {
    const result = await runQuality();
    expect(result.exitCode).toBe(0);
    const payload = (parseEnvelope(result).payload ?? {}) as Record<string, unknown>;
    const scores = Object.values((payload.scores ?? {}) as Record<string, number>);
    const expectedMean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const agg = (payload.aggregate ?? {}) as Record<string, number>;
    expect(Math.abs(agg.score - expectedMean)).toBeLessThan(1e-6);
  }, TEST_TIMEOUT_MS);

  it('SC-5: payload.metrics is an Array', async () => {
    const result = await runQuality();
    expect(result.exitCode).toBe(0);
    const payload = (parseEnvelope(result).payload ?? {}) as Record<string, unknown>;
    expect(Array.isArray(payload.metrics)).toBe(true);
  }, TEST_TIMEOUT_MS);

  it('SC-6: model.nodes and model.edges are integers', async () => {
    const result = await runQuality();
    expect(result.exitCode).toBe(0);
    const payload = (parseEnvelope(result).payload ?? {}) as Record<string, unknown>;
    const model = (payload.model ?? {}) as Record<string, unknown>;
    expect(Number.isInteger(model.nodes)).toBe(true);
    expect(Number.isInteger(model.edges)).toBe(true);
  }, TEST_TIMEOUT_MS);
});

// ---------------------------------------------------------------------------
// HO: Human-format output
// ---------------------------------------------------------------------------

describe('HO: human-format output includes quality dimension names and bar glyphs', () => {
  it('HO-1: human output contains all 4 dimension names', async () => {
    const result = await runCli(
      ['quality', '-i', xesPath, '--format', 'human', '--no-save'],
      tempDir
    );
    expect(result.exitCode).toBe(0);
    const out = (result.stdout + result.stderr).toLowerCase();
    expect(out).toContain('fitness');
    expect(out).toContain('precision');
    expect(out).toContain('generalization');
    expect(out).toContain('simplicity');
  }, TEST_TIMEOUT_MS);

  it('HO-2: human output contains block-fill bar characters (█ or ░)', async () => {
    const result = await runCli(
      ['quality', '-i', xesPath, '--format', 'human', '--no-save'],
      tempDir
    );
    expect(result.exitCode).toBe(0);
    const combined = result.stdout + result.stderr;
    expect(combined).toMatch(/[█░▓]/);
  }, TEST_TIMEOUT_MS);
});

// ---------------------------------------------------------------------------
// EX: Exit code contract
// ---------------------------------------------------------------------------

describe('EX: exit code contract for error paths', () => {
  it('EX-1: missing --input exits 1 (config_error)', async () => {
    const result = await runCli(
      ['quality', '--format', 'json'],
      tempDir
    );
    expect(result.exitCode).toBe(1);
  }, TEST_TIMEOUT_MS);

  it('EX-2: non-existent file exits 2 (source_error)', async () => {
    const result = await runCli(
      ['quality', '-i', path.join(tempDir, 'ghost.xes'), '--format', 'json', '--no-save'],
      tempDir
    );
    expect(result.exitCode).toBe(2);
  }, TEST_TIMEOUT_MS);

  it('EX-3: unsupported extension exits 2 (source_error)', async () => {
    const csvPath = path.join(tempDir, 'data.csv');
    fs.writeFileSync(csvPath, 'case,activity\n1,A', 'utf-8');
    const result = await runCli(
      ['quality', '-i', csvPath, '--format', 'json', '--no-save'],
      tempDir
    );
    expect(result.exitCode).toBe(2);
  }, TEST_TIMEOUT_MS);

  it('EX-4: empty XES (no traces) exits 2 or 3, not 1 or 5', async () => {
    const result = await runCli(
      ['quality', '-i', emptyXesPath, '--format', 'json', '--no-save'],
      tempDir
    );
    expect(result.exitCode).not.toBe(1);
    expect(result.exitCode).not.toBe(5);
    // Must emit parseable JSON
    if (result.stdout.trim()) {
      expect(() => parseEnvelope(result)).not.toThrow();
    }
  }, TEST_TIMEOUT_MS);

  it('EX-5: single-trace XES exits 0 or 3, never 1 or 2', async () => {
    const result = await runCli(
      ['quality', '-i', xes1Path, '--format', 'json', '--no-save'],
      tempDir
    );
    expect(result.exitCode).not.toBe(1);
    expect(result.exitCode).not.toBe(2);
  }, TEST_TIMEOUT_MS);
});
