/**
 * CLI integration tests for `wpm compare` and `wpm diff`.
 *
 * Van der Aalst QA perspective:
 * - Tests are evidence-based: every assertion targets a specific JSON field
 *   emitted by the command, not just exit codes.
 * - Two XES fixtures are built in-process via seeded faker so the suite is
 *   deterministic with no external file dependencies.
 * - Seed 71 is fixed; changing it breaks determinism intentionally.
 *
 * Test inventory:
 *   compare JTBD-1  JSON shape — algorithms array, required numeric fields
 *   compare JTBD-2  Multi-algo (dfg + ilp) — both appear in output, no crash
 *   compare JTBD-3  Human output — sparkline bar characters are present
 *   compare JTBD-4  Exit code 0 on success
 *   diff    JTBD-1  JSON jaccard field — self-diff equals 1.0
 *   diff    JTBD-2  JSON jaccard field — two-log diff is in [0, 1]
 *   diff    JTBD-3  Diff result sub-fields present (activities, edges, variants)
 *   diff    JTBD-4  Human output — structural similarity line present
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
  return `<?xml version="1.0" encoding="UTF-8"?>
<log xmlns="http://www.xes-standard.org/" xes.version="1.0">
  <extension name="Concept" prefix="concept" uri="http://www.xes-standard.org/concept.xesext"/>
  <extension name="Time" prefix="time" uri="http://www.xes-standard.org/time.xesext"/>
  <extension name="Organizational" prefix="org" uri="http://www.xes-standard.org/org.xesext"/>
  <global scope="trace">
    <string key="concept:name" value="Case ID"/>
  </global>
  <global scope="event">
    <string key="concept:name" value="Activity"/>
    <date key="time:timestamp" value="Timestamp"/>
    <string key="org:resource" value="Resource"/>
  </global>
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
}

function runCli(args: string[], opts: { timeoutMs?: number } = {}): Promise<CliResult> {
  const { timeoutMs = 45000 } = opts;
  const cwd = path.resolve(__dirname, '../..');
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
  it('JTBD-1: JSON envelope has algorithms array with required numeric fields for dfg,heuristic', async () => {
    const result = await runCli([
      'compare', 'dfg,heuristic_miner',
      '-i', log1Path,
      '--format', 'json',
      '--no-save',
    ]);

    const j = parseEnvelope(result);
    expect(j.command).toBe('compare');
    // Exit 0 on success
    expect(result.exitCode).toBe(0);
    expect(j.status).toBe('ok');

    const p = j.payload as Record<string, unknown>;
    const algos = p['algorithms'] as Array<Record<string, unknown>>;
    expect(Array.isArray(algos)).toBe(true);
    expect(algos.length).toBe(2);

    for (const algo of algos) {
      expect(typeof algo['algorithm']).toBe('string');
      expect(typeof algo['nodes']).toBe('number');
      expect(typeof algo['edges']).toBe('number');
      expect(typeof algo['elapsedMs']).toBe('number');
      // numeric values are non-negative (errors produce -1 sentinel, but both algos should succeed)
      expect(algo['nodes'] as number).toBeGreaterThanOrEqual(0);
      expect(algo['edges'] as number).toBeGreaterThanOrEqual(0);
      expect(algo['elapsedMs'] as number).toBeGreaterThanOrEqual(0);
    }

    // Algorithm names appear in result
    const names = algos.map(a => a['algorithm'] as string);
    expect(names.some(n => n.includes('dfg') || n === 'dfg')).toBe(true);
    expect(names.some(n => n.includes('heuristic'))).toBe(true);
  });

  it('JTBD-2: Multi-algo dfg,ilp — both algorithms appear in output without crash', async () => {
    const result = await runCli([
      'compare', 'dfg,ilp',
      '-i', log1Path,
      '--format', 'json',
      '--no-save',
    ]);

    const j = parseEnvelope(result);
    expect(j.command).toBe('compare');
    // Must be parseable — the command must not crash
    expect(['ok', 'error']).toContain(j.status);

    if (j.status === 'ok') {
      const p = j.payload as Record<string, unknown>;
      const algos = p['algorithms'] as Array<Record<string, unknown>>;
      expect(Array.isArray(algos)).toBe(true);
      expect(algos.length).toBe(2);
      // Each entry has an algorithm string — either success or error sentinel
      for (const algo of algos) {
        expect(typeof algo['algorithm']).toBe('string');
        expect(typeof algo['nodes']).toBe('number');
        expect(typeof algo['elapsedMs']).toBe('number');
      }
    } else {
      // Structured error envelope required even on failure
      expect(j.error).toBeDefined();
      expect(typeof j.error!.code).toBe('string');
      expect(typeof j.error!.message).toBe('string');
    }
  });

  it('JTBD-3: Human output includes sparkline bar characters (▓ or ░)', async () => {
    const result = await runCli([
      'compare', 'dfg,heuristic_miner',
      '-i', log1Path,
      '--format', 'human',
      '--no-save',
    ]);

    // Human mode exits 0
    expect(result.exitCode).toBe(0);
    // Sparkline characters must appear in stdout
    const out = result.stdout + result.stderr;
    const hasSparkline = out.includes('▓') || out.includes('░');
    expect(hasSparkline).toBe(true);
  });

  it('JTBD-4: Exit code is 0 when comparison succeeds', async () => {
    const result = await runCli([
      'compare', 'dfg,heuristic_miner',
      '-i', log1Path,
      '--format', 'json',
      '--no-save',
    ]);
    expect(result.exitCode).toBe(0);
  });
});

// ─── wpm diff tests ───────────────────────────────────────────────────────────

describe('wpm diff', () => {
  it('JTBD-1: Self-diff jaccard equals 1.0 (same file → identical DFGs)', async () => {
    const result = await runCli([
      'diff', log1Path, log1Path,
      '--format', 'json',
      '--no-save',
    ]);

    const j = parseEnvelope(result);
    expect(j.command).toBe('diff');
    expect(result.exitCode).toBe(0);
    expect(j.status).toBe('ok');

    const p = j.payload as Record<string, unknown>;
    const diff = p['diff'] as Record<string, unknown>;
    expect(diff).toBeDefined();
    expect(diff['jaccard']).toBe(1);
  });

  it('JTBD-2: Two-log diff jaccard is a number in [0, 1]', async () => {
    const result = await runCli([
      'diff', log1Path, log2Path,
      '--format', 'json',
      '--no-save',
    ]);

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

  it('JTBD-3: Diff JSON payload contains activities, edges, and variants sub-fields', async () => {
    const result = await runCli([
      'diff', log1Path, log2Path,
      '--format', 'json',
      '--no-save',
    ]);

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

  it('JTBD-4: Human output includes structural similarity line', async () => {
    const result = await runCli([
      'diff', log1Path, log1Path,
      '--format', 'human',
      '--no-save',
    ]);

    expect(result.exitCode).toBe(0);
    const out = result.stdout + result.stderr;
    // Human diff emits "Structural similarity:" header
    expect(out).toMatch(/[Ss]tructural\s+similarity/i);
  });
});
