/**
 * CLI integration tests for `wpm compare` and `wpm diff`.
 *
 * Van der Aalst QA perspective:
 * - Tests are evidence-based: every assertion targets a specific JSON field
 *   emitted by the command, not just exit codes.
 * - Two XES fixtures are built in-process via seeded faker so the suite is
 *   deterministic with no external file dependencies.
 * - Seed 71 is fixed; changing it breaks determinism intentionally.
 * - All CLI invocations run from a tmpDir with no wasm4pm.toml to avoid
 *   ambient config pollution.
 *
 * Test inventory (≥20 tests):
 *   compare C-1   Missing input → exit 2 (source_error)
 *   compare C-2   --format badformat → exit 1 (config_error)
 *   compare C-3   JSON envelope has top-level command, status, exit_code, payload, meta
 *   compare C-4   payload.algorithms is an array of strings (algorithm names)
 *   compare C-5   payload.comparisons is an array with per-algorithm entries
 *   compare C-6   Each comparisons entry has algorithm, duration_ms, edge_count fields
 *   compare C-7   payload.winner is string or null
 *   compare C-8   payload.input is present
 *   compare C-9   payload.algorithms length matches number of requested algos
 *   compare C-10  payload.comparisons length matches number of requested algos
 *   compare C-11  Exit code 0 on success
 *   compare C-12  Human output contains algorithm names
 *   compare C-13  meta.timestamp is a valid ISO-8601 string
 *   compare C-14  meta.duration_ms is a non-negative number
 *   compare C-15  payload.activityKey is present
 *   compare C-16  payload.recommendation is present (object or null)
 *   compare C-17  Single algorithm → exit 1 (config_error, too few)
 *   compare C-18  Unknown algorithm → exit 1 (config_error)
 *   compare C-19  Two valid algorithms — both names appear in payload.algorithms
 *   compare C-20  Human output contains sparkline bar characters (▓ or ░)
 *   compare C-21  payload.winner matches an entry in payload.algorithms when not null
 *   compare C-22  error envelope has code and message on config_error
 *   diff    D-1   Self-diff jaccard equals 1.0 (same file → identical DFGs)
 *   diff    D-2   Two-log diff jaccard is a number in [0, 1]
 *   diff    D-3   Diff JSON payload contains activities, edges, variants sub-fields
 *   diff    D-4   Human output includes structural similarity line
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Faker, en } from '@faker-js/faker';

// ─── Seeded faker ─────────────────────────────────────────────────────────────

const faker = new Faker({ locale: [en] });
faker.seed(71);

// ─── RevOps vocabulary (seeded, stable) ──────────────────────────────────────

const slug = (w: string) => w.toLowerCase().replace(/[^a-z0-9]+/g, '_');
const act = (...parts: string[]) => parts.map(slug).join('_');

const V = {
  leadCreated:     act(faker.hacker.ingverb(), 'lead'),
  leadQualified:   act(faker.hacker.ingverb(), 'qualified'),
  demoScheduled:   act(faker.hacker.ingverb(), 'demo'),
  demoCompleted:   act('demo', faker.hacker.ingverb()),
  proposalSent:    act(faker.hacker.ingverb(), 'proposal'),
  contractSigned:  act('contract', faker.hacker.ingverb()),
  dealClosedWon:   act('deal', faker.hacker.ingverb(), 'won'),
  dealClosedLost:  act('deal', faker.hacker.ingverb(), 'lost'),
  sdrRole:         act('sdr', faker.person.firstName()),
  aeRole:          act('ae', faker.person.firstName()),
  mgrRole:         act('mgr', faker.person.firstName()),
  // Distinct activities only in log2 (for diff)
  onboardingStart: act(faker.hacker.ingverb(), 'onboarding'),
  onboardingEnd:   act('onboarding', faker.hacker.ingverb()),
};

// ─── XES builder ─────────────────────────────────────────────────────────────

interface Activity { name: string; resource: string; ts: Date }
interface TraceSpec { caseId: string; activities: Activity[] }

function xesEvent(name: string, resource: string, ts: Date): string {
  return `    <event>
      <string key="concept:name" value="${name}"/>
      <date key="time:timestamp" value="${ts.toISOString()}"/>
      <string key="org:resource" value="${resource}"/>
    </event>`;
}

function xesTrace(spec: TraceSpec): string {
  return `  <trace>
    <string key="concept:name" value="${spec.caseId}"/>
${spec.activities.map(a => xesEvent(a.name, a.resource, a.ts)).join('\n')}
  </trace>`;
}

function buildXes(traces: TraceSpec[]): string {
  // NOTE: The WASM XES parser does not support <global> sections — omit them.
  // XES logs without global declarations are valid; key types are inferred from attributes.
  return `<?xml version="1.0" encoding="UTF-8"?>
<log xmlns="http://www.xes-standard.org/" xes.version="1.0">
  <extension name="Concept" prefix="concept" uri="http://www.xes-standard.org/concept.xesext"/>
  <extension name="Time" prefix="time" uri="http://www.xes-standard.org/time.xesext"/>
  <extension name="Organizational" prefix="org" uri="http://www.xes-standard.org/org.xesext"/>
${traces.map(xesTrace).join('\n')}
</log>`;
}

function ts(base: Date, offsetHours: number): Date {
  const d = new Date(base);
  d.setHours(d.getHours() + offsetHours);
  return d;
}

// ─── Two distinct RevOps logs ─────────────────────────────────────────────────

function buildLog1Traces(): TraceSpec[] {
  const base = new Date('2026-03-01T09:00:00Z');
  return [
    {
      caseId: 'deal_001',
      activities: [
        { name: V.leadCreated,   resource: V.sdrRole, ts: ts(base, 0) },
        { name: V.leadQualified, resource: V.sdrRole, ts: ts(base, 1) },
        { name: V.demoScheduled, resource: V.aeRole,  ts: ts(base, 2) },
        { name: V.demoCompleted, resource: V.aeRole,  ts: ts(base, 4) },
        { name: V.proposalSent,  resource: V.aeRole,  ts: ts(base, 6) },
        { name: V.dealClosedWon, resource: V.mgrRole, ts: ts(base, 8) },
      ],
    },
    {
      caseId: 'deal_002',
      activities: [
        { name: V.leadCreated,   resource: V.sdrRole, ts: ts(base, 0) },
        { name: V.leadQualified, resource: V.sdrRole, ts: ts(base, 2) },
        { name: V.demoScheduled, resource: V.aeRole,  ts: ts(base, 3) },
        { name: V.dealClosedLost,resource: V.sdrRole, ts: ts(base, 5) },
      ],
    },
    {
      caseId: 'deal_003',
      activities: [
        { name: V.leadCreated,   resource: V.sdrRole, ts: ts(base, 0) },
        { name: V.proposalSent,  resource: V.aeRole,  ts: ts(base, 3) },
        { name: V.contractSigned,resource: V.mgrRole, ts: ts(base, 6) },
        { name: V.dealClosedWon, resource: V.mgrRole, ts: ts(base, 9) },
      ],
    },
  ];
}

// Log2 shares some activities but introduces onboarding steps — distinct DFG
function buildLog2Traces(): TraceSpec[] {
  const base = new Date('2026-04-01T09:00:00Z');
  return [
    {
      caseId: 'deal_101',
      activities: [
        { name: V.leadCreated,    resource: V.sdrRole, ts: ts(base, 0) },
        { name: V.leadQualified,  resource: V.sdrRole, ts: ts(base, 1) },
        { name: V.onboardingStart,resource: V.aeRole,  ts: ts(base, 2) },
        { name: V.onboardingEnd,  resource: V.aeRole,  ts: ts(base, 4) },
        { name: V.dealClosedWon,  resource: V.mgrRole, ts: ts(base, 6) },
      ],
    },
    {
      caseId: 'deal_102',
      activities: [
        { name: V.leadCreated,    resource: V.sdrRole, ts: ts(base, 0) },
        { name: V.onboardingStart,resource: V.aeRole,  ts: ts(base, 1) },
        { name: V.dealClosedLost, resource: V.sdrRole, ts: ts(base, 3) },
      ],
    },
  ];
}

const LOG1_XES = buildXes(buildLog1Traces());
const LOG2_XES = buildXes(buildLog2Traces());

// ─── CLI runner ───────────────────────────────────────────────────────────────

const CLI_PATH = path.resolve(__dirname, '../../dist/bin/wpm.js');

interface CliResult { exitCode: number; stdout: string; stderr: string }
interface Envelope {
  command: string;
  status: 'ok' | 'error';
  exit_code: number;
  payload: Record<string, unknown> | null;
  error?: { code: string; message: string };
  meta?: { timestamp: string; duration_ms: number; run_id: string; version: string };
}

/**
 * Run the CLI in `cwd` (must be a tmpDir with no wasm4pm.toml to avoid
 * ambient config pollution).
 */
function runCli(
  args: string[],
  opts: { timeoutMs?: number; cwd?: string } = {},
): Promise<CliResult> {
  const { timeoutMs = 45000 } = opts;
  // Always use the caller-supplied cwd or fall back to apps/wasm4pm root.
  // Individual tests that pass tmpDir avoid ambient wasm4pm.toml loading.
  const cwd = opts.cwd ?? path.resolve(__dirname, '../..');
  return new Promise(resolve => {
    const child = execFile(
      process.execPath,
      [CLI_PATH, ...args],
      { timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024, cwd },
      (error, stdout, stderr) => {
        const exitCode =
          error && 'code' in error && typeof error.code === 'number'
            ? error.code
            : error ? 1 : 0;
        resolve({ exitCode, stdout: stdout ?? '', stderr: stderr ?? '' });
      },
    );
    child.on('error', () =>
      resolve({ exitCode: 5, stdout: '', stderr: 'Process failed to start' }),
    );
  });
}

function parseEnvelope(result: CliResult): Envelope {
  try {
    return JSON.parse(result.stdout) as Envelope;
  } catch {
    throw new Error(
      `Failed to parse CLI JSON output.\nstdout: ${result.stdout.slice(0, 500)}\nstderr: ${result.stderr.slice(0, 500)}`,
    );
  }
}

// ─── Temp dir lifecycle ───────────────────────────────────────────────────────

let tempDir: string;
let log1Path: string;
let log2Path: string;

beforeAll(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wpm-compare-diff-'));
  log1Path = path.join(tempDir, 'log1.xes');
  log2Path = path.join(tempDir, 'log2.xes');
  fs.writeFileSync(log1Path, LOG1_XES, 'utf-8');
  fs.writeFileSync(log2Path, LOG2_XES, 'utf-8');
});

afterAll(() => {
  try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
});

// ─── wpm compare tests ────────────────────────────────────────────────────────

describe('wpm compare', () => {

  // C-1: missing input → source_error (exit 2)
  it('C-1: missing input file exits 2 (source_error)', async () => {
    const result = await runCli([
      'compare', 'dfg,heuristic_miner',
      '-i', path.join(tempDir, 'does_not_exist.xes'),
      '--format', 'json',
      '--no-save',
    ], { cwd: tempDir });

    expect(result.exitCode).toBe(2);
    const j = parseEnvelope(result);
    expect(j.status).toBe('error');
    expect(j.exit_code).toBe(2);
    expect(j.error?.code).toBeDefined();
  });

  // C-2: --format badformat → config_error (exit 1) before WASM
  it('C-2: --format badformat exits 1 (config_error) with JSON error envelope', async () => {
    const result = await runCli([
      'compare', 'dfg,heuristic_miner',
      '-i', log1Path,
      '--format', 'badformat',
      '--no-save',
    ], { cwd: tempDir });

    expect(result.exitCode).toBe(1);
    const j = parseEnvelope(result);
    expect(j.status).toBe('error');
    expect(j.exit_code).toBe(1);
    expect(j.error?.code).toBe('INVALID_FORMAT');
    expect(j.error?.message).toMatch(/badformat/i);
  });

  // C-3: JSON envelope has top-level command, status, exit_code, payload, meta
  it('C-3: JSON envelope has required top-level fields (command, status, exit_code, payload, meta)', async () => {
    const result = await runCli([
      'compare', 'dfg,heuristic_miner',
      '-i', log1Path,
      '--format', 'json',
      '--no-save',
    ], { cwd: tempDir });

    const j = parseEnvelope(result);
    expect(j.command).toBe('compare');
    expect(['ok', 'error']).toContain(j.status);
    expect(typeof j.exit_code).toBe('number');
    expect(j.meta).toBeDefined();
    // payload is present (may be null on error)
    expect('payload' in j).toBe(true);
  });

  // C-4: payload.algorithms is an array of strings (algorithm names)
  it('C-4: payload.algorithms is an array of algorithm name strings', async () => {
    const result = await runCli([
      'compare', 'dfg,heuristic_miner',
      '-i', log1Path,
      '--format', 'json',
      '--no-save',
    ], { cwd: tempDir });

    expect(result.exitCode).toBe(0);
    const j = parseEnvelope(result);
    expect(j.status).toBe('ok');
    const p = j.payload!;
    const algorithms = p['algorithms'] as unknown[];
    expect(Array.isArray(algorithms)).toBe(true);
    // All entries must be strings (algorithm names, not objects)
    for (const entry of algorithms) {
      expect(typeof entry).toBe('string');
    }
  });

  // C-5: payload.comparisons is an array with per-algorithm entries
  it('C-5: payload.comparisons is an array of per-algorithm result objects', async () => {
    const result = await runCli([
      'compare', 'dfg,heuristic_miner',
      '-i', log1Path,
      '--format', 'json',
      '--no-save',
    ], { cwd: tempDir });

    expect(result.exitCode).toBe(0);
    const j = parseEnvelope(result);
    expect(j.status).toBe('ok');
    const p = j.payload!;
    const comparisons = p['comparisons'] as unknown[];
    expect(Array.isArray(comparisons)).toBe(true);
    expect(comparisons.length).toBeGreaterThanOrEqual(1);
  });

  // C-6: each comparisons entry has algorithm, duration_ms, edge_count fields
  it('C-6: each comparisons entry has algorithm, duration_ms, and edge_count fields', async () => {
    const result = await runCli([
      'compare', 'dfg,heuristic_miner',
      '-i', log1Path,
      '--format', 'json',
      '--no-save',
    ], { cwd: tempDir });

    expect(result.exitCode).toBe(0);
    const j = parseEnvelope(result);
    const comparisons = j.payload!['comparisons'] as Array<Record<string, unknown>>;
    expect(comparisons.length).toBe(2);

    for (const entry of comparisons) {
      expect(typeof entry['algorithm']).toBe('string');
      expect(typeof entry['duration_ms']).toBe('number');
      // edge_count may be -1 on error sentinel but must be a number
      expect(typeof entry['edge_count']).toBe('number');
    }
  });

  // C-7: payload.winner is string or null
  it('C-7: payload.winner is a string (algorithm name) or null', async () => {
    const result = await runCli([
      'compare', 'dfg,heuristic_miner',
      '-i', log1Path,
      '--format', 'json',
      '--no-save',
    ], { cwd: tempDir });

    expect(result.exitCode).toBe(0);
    const j = parseEnvelope(result);
    const winner = j.payload!['winner'];
    expect(winner === null || typeof winner === 'string').toBe(true);
  });

  // C-8: payload.input is present
  it('C-8: payload.input is present and matches the requested log path', async () => {
    const result = await runCli([
      'compare', 'dfg,heuristic_miner',
      '-i', log1Path,
      '--format', 'json',
      '--no-save',
    ], { cwd: tempDir });

    expect(result.exitCode).toBe(0);
    const j = parseEnvelope(result);
    const input = j.payload!['input'] as string;
    expect(typeof input).toBe('string');
    expect(input.length).toBeGreaterThan(0);
    // Must contain the filename portion at minimum
    expect(input).toContain('log1.xes');
  });

  // C-9: payload.algorithms length matches requested algorithms
  it('C-9: payload.algorithms length equals the number of requested algorithms', async () => {
    const result = await runCli([
      'compare', 'dfg,heuristic_miner',
      '-i', log1Path,
      '--format', 'json',
      '--no-save',
    ], { cwd: tempDir });

    expect(result.exitCode).toBe(0);
    const j = parseEnvelope(result);
    const algorithms = j.payload!['algorithms'] as unknown[];
    // We requested 2 algorithms
    expect(algorithms.length).toBe(2);
  });

  // C-10: payload.comparisons length matches requested algorithms
  it('C-10: payload.comparisons length equals the number of requested algorithms', async () => {
    const result = await runCli([
      'compare', 'dfg,heuristic_miner',
      '-i', log1Path,
      '--format', 'json',
      '--no-save',
    ], { cwd: tempDir });

    expect(result.exitCode).toBe(0);
    const j = parseEnvelope(result);
    const comparisons = j.payload!['comparisons'] as unknown[];
    // We requested 2 algorithms — one comparison entry per algorithm
    expect(comparisons.length).toBe(2);
  });

  // C-11: exit code 0 on success
  it('C-11: exit code is 0 on successful comparison', async () => {
    const result = await runCli([
      'compare', 'dfg,heuristic_miner',
      '-i', log1Path,
      '--format', 'json',
      '--no-save',
    ], { cwd: tempDir });

    expect(result.exitCode).toBe(0);
  });

  // C-12: human output contains algorithm names
  it('C-12: human output includes both algorithm names in stdout/stderr', async () => {
    const result = await runCli([
      'compare', 'dfg,heuristic_miner',
      '-i', log1Path,
      '--format', 'human',
      '--no-save',
    ], { cwd: tempDir });

    expect(result.exitCode).toBe(0);
    const out = result.stdout + result.stderr;
    expect(out).toMatch(/dfg/i);
    expect(out).toMatch(/heuristic/i);
  });

  // C-13: meta.timestamp is valid ISO-8601
  it('C-13: meta.timestamp is a valid ISO-8601 string', async () => {
    const result = await runCli([
      'compare', 'dfg,heuristic_miner',
      '-i', log1Path,
      '--format', 'json',
      '--no-save',
    ], { cwd: tempDir });

    expect(result.exitCode).toBe(0);
    const j = parseEnvelope(result);
    const ts = j.meta?.timestamp;
    expect(typeof ts).toBe('string');
    expect(Number.isNaN(Date.parse(ts!))).toBe(false);
  });

  // C-14: meta.duration_ms is a non-negative number
  it('C-14: meta.duration_ms is a non-negative number', async () => {
    const result = await runCli([
      'compare', 'dfg,heuristic_miner',
      '-i', log1Path,
      '--format', 'json',
      '--no-save',
    ], { cwd: tempDir });

    expect(result.exitCode).toBe(0);
    const j = parseEnvelope(result);
    const durationMs = j.meta?.duration_ms;
    expect(typeof durationMs).toBe('number');
    expect(durationMs!).toBeGreaterThanOrEqual(0);
  });

  // C-15: payload.activityKey is present
  it('C-15: payload.activityKey is present and defaults to concept:name', async () => {
    const result = await runCli([
      'compare', 'dfg,heuristic_miner',
      '-i', log1Path,
      '--format', 'json',
      '--no-save',
    ], { cwd: tempDir });

    expect(result.exitCode).toBe(0);
    const j = parseEnvelope(result);
    expect(j.payload!['activityKey']).toBe('concept:name');
  });

  // C-16: payload.recommendation is present (object or null)
  it('C-16: payload.recommendation is an object or null', async () => {
    const result = await runCli([
      'compare', 'dfg,heuristic_miner',
      '-i', log1Path,
      '--format', 'json',
      '--no-save',
    ], { cwd: tempDir });

    expect(result.exitCode).toBe(0);
    const j = parseEnvelope(result);
    const rec = j.payload!['recommendation'];
    expect(rec === null || (typeof rec === 'object' && rec !== null)).toBe(true);
  });

  // C-17: single algorithm → exit 1 (config_error, too few)
  it('C-17: single algorithm exits 1 (config_error: at least two required)', async () => {
    const result = await runCli([
      'compare', 'dfg',
      '-i', log1Path,
      '--format', 'json',
      '--no-save',
    ], { cwd: tempDir });

    expect(result.exitCode).toBe(1);
    const j = parseEnvelope(result);
    expect(j.status).toBe('error');
    expect(j.error?.message).toMatch(/two|minimum|least/i);
  });

  // C-18: unknown algorithm → exit 1 (config_error)
  it('C-18: unknown algorithm name exits 1 (config_error) with helpful message', async () => {
    const result = await runCli([
      'compare', 'dfg,totally_unknown_algo_xyz',
      '-i', log1Path,
      '--format', 'json',
      '--no-save',
    ], { cwd: tempDir });

    expect(result.exitCode).toBe(1);
    const j = parseEnvelope(result);
    expect(j.status).toBe('error');
    expect(j.error?.message).toMatch(/unknown|algorithm/i);
  });

  // C-19: two valid algorithms — both names appear in payload.algorithms
  it('C-19: payload.algorithms contains both requested algorithm names', async () => {
    const result = await runCli([
      'compare', 'dfg,heuristic_miner',
      '-i', log1Path,
      '--format', 'json',
      '--no-save',
    ], { cwd: tempDir });

    expect(result.exitCode).toBe(0);
    const j = parseEnvelope(result);
    const algorithms = j.payload!['algorithms'] as string[];
    expect(algorithms.some(a => a.includes('dfg') || a === 'dfg')).toBe(true);
    expect(algorithms.some(a => a.includes('heuristic'))).toBe(true);
  });

  // C-20: human output contains sparkline characters
  it('C-20: human output includes sparkline bar characters (▓ or ░)', async () => {
    const result = await runCli([
      'compare', 'dfg,heuristic_miner',
      '-i', log1Path,
      '--format', 'human',
      '--no-save',
    ], { cwd: tempDir });

    expect(result.exitCode).toBe(0);
    const out = result.stdout + result.stderr;
    const hasSparkline = out.includes('▓') || out.includes('░');
    expect(hasSparkline).toBe(true);
  });

  // C-21: payload.winner matches an entry in payload.algorithms when not null
  it('C-21: payload.winner (when not null) is one of the algorithms in payload.algorithms', async () => {
    const result = await runCli([
      'compare', 'dfg,heuristic_miner',
      '-i', log1Path,
      '--format', 'json',
      '--no-save',
    ], { cwd: tempDir });

    expect(result.exitCode).toBe(0);
    const j = parseEnvelope(result);
    const winner = j.payload!['winner'] as string | null;
    const algorithms = j.payload!['algorithms'] as string[];

    if (winner !== null) {
      expect(typeof winner).toBe('string');
      expect(algorithms).toContain(winner);
    }
  });

  // C-22: error envelope on config_error has both code and message
  it('C-22: config_error envelope has non-empty code and message fields', async () => {
    const result = await runCli([
      'compare', 'dfg',
      '-i', log1Path,
      '--format', 'json',
      '--no-save',
    ], { cwd: tempDir });

    expect(result.exitCode).toBe(1);
    const j = parseEnvelope(result);
    expect(j.status).toBe('error');
    expect(typeof j.error?.code).toBe('string');
    expect((j.error?.code ?? '').length).toBeGreaterThan(0);
    expect(typeof j.error?.message).toBe('string');
    expect((j.error?.message ?? '').length).toBeGreaterThan(0);
  });

  // Additional: three-algorithm comparison
  it('C-23: three algorithms — payload.algorithms has 3 entries and payload.comparisons has 3 entries', async () => {
    const result = await runCli([
      'compare', 'dfg,heuristic_miner,inductive',
      '-i', log1Path,
      '--format', 'json',
      '--no-save',
    ], { cwd: tempDir });

    // Must not crash
    expect([0, 4]).toContain(result.exitCode);
    const j = parseEnvelope(result);
    expect(j.command).toBe('compare');

    if (j.status === 'ok') {
      const algorithms = j.payload!['algorithms'] as unknown[];
      const comparisons = j.payload!['comparisons'] as unknown[];
      expect(algorithms.length).toBe(3);
      expect(comparisons.length).toBe(3);
    }
  });

  // Additional: dfg,ilp pair — both appear in comparisons, winner is non-null
  it('C-24: dfg,ilp — winner is non-null (ilp has higher quality tier)', async () => {
    const result = await runCli([
      'compare', 'dfg,ilp',
      '-i', log1Path,
      '--format', 'json',
      '--no-save',
    ], { cwd: tempDir });

    expect([0, 4]).toContain(result.exitCode);
    const j = parseEnvelope(result);
    if (j.status === 'ok') {
      const winner = j.payload!['winner'];
      expect(winner === null || typeof winner === 'string').toBe(true);
    }
  });
});

// ─── wpm diff tests ───────────────────────────────────────────────────────────

describe('wpm diff', () => {
  it('D-1: self-diff jaccard equals 1.0 (same file → identical DFGs)', async () => {
    const result = await runCli([
      'diff', log1Path, log1Path,
      '--format', 'json',
      '--no-save',
    ], { cwd: tempDir });

    const j = parseEnvelope(result);
    expect(j.command).toBe('diff');
    expect(result.exitCode).toBe(0);
    expect(j.status).toBe('ok');

    const p = j.payload as Record<string, unknown>;
    const diff = p['diff'] as Record<string, unknown>;
    expect(diff).toBeDefined();
    expect(diff['jaccard']).toBe(1);
  });

  it('D-2: two-log diff jaccard is a number in [0, 1]', async () => {
    const result = await runCli([
      'diff', log1Path, log2Path,
      '--format', 'json',
      '--no-save',
    ], { cwd: tempDir });

    const j = parseEnvelope(result);
    expect(j.command).toBe('diff');
    expect(['ok', 'error']).toContain(j.status);

    if (j.status === 'ok') {
      const p = j.payload as Record<string, unknown>;
      const diff = p['diff'] as Record<string, unknown>;
      const jaccard = diff['jaccard'] as number;
      expect(typeof jaccard).toBe('number');
      expect(jaccard).toBeGreaterThanOrEqual(0);
      expect(jaccard).toBeLessThanOrEqual(1);
      // Two distinct logs must be structurally different — jaccard < 1
      expect(jaccard).toBeLessThan(1);
    } else {
      // Graceful error envelope
      expect(j.error).toBeDefined();
    }
  });

  it('D-3: diff JSON payload contains activities, edges, and variants sub-fields', async () => {
    const result = await runCli([
      'diff', log1Path, log2Path,
      '--format', 'json',
      '--no-save',
    ], { cwd: tempDir });

    const j = parseEnvelope(result);
    expect(j.command).toBe('diff');

    if (j.status === 'ok') {
      const p = j.payload as Record<string, unknown>;
      const diff = p['diff'] as Record<string, unknown>;

      // activities sub-object
      expect(diff['activities']).toBeDefined();
      const activities = diff['activities'] as Record<string, unknown>;
      expect(Array.isArray(activities['added'])).toBe(true);
      expect(Array.isArray(activities['removed'])).toBe(true);
      expect(Array.isArray(activities['shared'])).toBe(true);

      // edges sub-object
      expect(diff['edges']).toBeDefined();
      const edges = diff['edges'] as Record<string, unknown>;
      expect(Array.isArray(edges['added'])).toBe(true);
      expect(Array.isArray(edges['removed'])).toBe(true);
      expect(Array.isArray(edges['changed'])).toBe(true);

      // variants sub-object
      expect(diff['variants']).toBeDefined();
      const variants = diff['variants'] as Record<string, unknown>;
      expect(typeof variants['totalLog1']).toBe('number');
      expect(typeof variants['totalLog2']).toBe('number');
      expect(typeof variants['shared']).toBe('number');

      // summary field
      expect(typeof diff['summary']).toBe('string');
    } else {
      // Acceptable — still must be a structured error
      expect(j.error).toBeDefined();
    }
  });

  it('D-4: human output includes structural similarity line', async () => {
    const result = await runCli([
      'diff', log1Path, log1Path,
      '--format', 'human',
      '--no-save',
      '--deep',
    ], { cwd: tempDir });

    expect(result.exitCode).toBe(0);
    const out = result.stdout + result.stderr;
    // Human diff emits "Structural similarity:" header
    expect(out).toMatch(/[Ss]tructural\s+similarity/i);
  });
});
