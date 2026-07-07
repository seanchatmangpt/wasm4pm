/**
 * Integration tests for `wpm powl` subcommands.
 *
 * `wpm powl <anything>` is now intercepted unconditionally by the hard-break
 * table (nouns/_removed.ts): only two-token entries `powl replay` (->
 * `model check --mode replay`) and `powl construct` (-> `model discover`)
 * are listed there; every OTHER `powl <subcommand>` (parse, complexity,
 * diff, conformance, discover) falls through to the one-token catch-all
 * `{ old: 'powl', replacement: 'model discover' }` and is rejected before
 * ever reaching `commands/powl.ts` — regardless of which subcommand was
 * actually requested. `model discover`'s DFG/heuristic-miner-based
 * discovery does not produce the same `root`/`node_count`/`repr`/`variant`
 * POWL-structure fields this suite tests, and `parse`/`complexity`/`diff`/
 * `conformance` (arbitrary two-POWL-model-string utilities) have no
 * noun/verb equivalent at all — this is a genuine, intentional feature
 * retirement from the CLI surface, not a rename.
 *
 * `commands/powl.ts` itself is untouched and still fully functional — it is
 * simply unreachable from the `wpm` binary. Rather than deleting real
 * regression coverage for code that still exists and still runs (real WASM
 * calls included), these tests now invoke it in-process the same way the
 * framework's own bridge does for still-wired legacy commands
 * (`nouns/_bridge.ts`'s `invokeLegacyCommand`), instead of spawning the
 * (now hard-broken for this path) `wpm` binary.
 *
 * Van der Aalst QA perspective (unchanged from the original suite):
 * - Tests target specific JSON fields emitted by the command, not just exit codes.
 * - Fitness and precision must BOTH appear in conformance output — showing one
 *   without the other misleads the practitioner (flower-model trap).
 * - Three invariants are mandatory (van der Aalst fitness quality bar):
 *     1. parse returns node_count > 0 for valid input
 *     2. complexity returns at least one non-zero score for a multi-activity model
 *     3. diff returns a structured object with severity and behaviourally_equivalent
 *
 * Seed 77 is fixed for determinism.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Faker, en } from '@faker-js/faker';
import { powl } from '../commands/powl.js';
import { invokeLegacyCommand } from '../nouns/_bridge.js';

// ─── Seeded faker ─────────────────────────────────────────────────────────────

const faker = new Faker({ locale: [en] });
faker.seed(77);

const slug = (w: string) => w.toLowerCase().replace(/[^a-z0-9]+/g, '_');
const act = (...parts: string[]) => parts.map(slug).join('_');

const V = {
  actA: act(faker.hacker.ingverb(), 'start'),
  actB: act(faker.hacker.ingverb(), 'process'),
  actC: act(faker.hacker.ingverb(), 'approve'),
  actD: act('deal', faker.hacker.ingverb(), 'close'),
  actNew: act(faker.hacker.ingverb(), 'review'),
  sdr: act('sdr', faker.person.firstName()),
  ae: act('ae', faker.person.firstName()),
};

// ─── XES fixture ─────────────────────────────────────────────────────────────

function xesEvent(name: string, resource: string, ts: Date): string {
  return `    <event>
      <string key="concept:name" value="${name}"/>
      <date key="time:timestamp" value="${ts.toISOString()}"/>
      <string key="org:resource" value="${resource}"/>
    </event>`;
}

function xesTrace(caseId: string, activities: Array<{ name: string; resource: string; ts: Date }>): string {
  return `  <trace>
    <string key="concept:name" value="${caseId}"/>
${activities.map((a) => xesEvent(a.name, a.resource, a.ts)).join('\n')}
  </trace>`;
}

function buildXes(): string {
  const base = new Date('2026-01-01T09:00:00Z');
  const t = (h: number) => { const d = new Date(base); d.setHours(d.getHours() + h); return d; };

  // Three variants: ensures the discovered model has non-trivial branching
  const traces = [
    xesTrace('case_001', [
      { name: V.actA, resource: V.sdr, ts: t(0) },
      { name: V.actB, resource: V.ae, ts: t(1) },
      { name: V.actC, resource: V.ae, ts: t(2) },
      { name: V.actD, resource: V.sdr, ts: t(3) },
    ]),
    xesTrace('case_002', [
      { name: V.actA, resource: V.sdr, ts: t(0) },
      { name: V.actC, resource: V.ae, ts: t(1) },
      { name: V.actD, resource: V.sdr, ts: t(2) },
    ]),
    xesTrace('case_003', [
      { name: V.actA, resource: V.sdr, ts: t(0) },
      { name: V.actB, resource: V.ae, ts: t(1) },
      { name: V.actD, resource: V.sdr, ts: t(2) },
    ]),
  ];

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
${traces.join('\n')}
</log>`;
}

// ─── In-process legacy command runner ────────────────────────────────────────

interface CliResult { exitCode: number; stdout: string; stderr: string }
interface Envelope {
  command: string;
  status: 'ok' | 'error';
  exit_code: number;
  payload: Record<string, unknown> | null;
  error?: { code: string; message: string };
}

async function runPowl(args: string[]): Promise<CliResult> {
  const { stdout, stderr, exitCode } = await invokeLegacyCommand(powl, args);
  return { exitCode, stdout, stderr };
}

function parseEnvelope(result: CliResult): Envelope {
  try {
    return JSON.parse(result.stdout) as Envelope;
  } catch {
    throw new Error(
      `Failed to parse command JSON output.\nstdout: ${result.stdout.slice(0, 500)}\nstderr: ${result.stderr.slice(0, 500)}`
    );
  }
}

// ─── Temp dir lifecycle ───────────────────────────────────────────────────────

let tempDir: string;
let logPath: string;

// The model strings are stable POWL repr strings derived from faker vocabulary
const LINEAR_POWL = () =>
  `PO=(nodes={${V.actA}, ${V.actB}, ${V.actC}}, order={${V.actA}-->${V.actB}, ${V.actB}-->${V.actC}})`;

const EXTENDED_POWL = () =>
  `PO=(nodes={${V.actA}, ${V.actB}, ${V.actC}, ${V.actNew}}, order={${V.actA}-->${V.actB}, ${V.actB}-->${V.actC}, ${V.actC}-->${V.actNew}})`;

beforeAll(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wpm-powl-cli-'));
  logPath = path.join(tempDir, 'log.xes');
  fs.writeFileSync(logPath, buildXes(), 'utf-8');
});

afterAll(() => {
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch { /* cleanup best-effort */ }
});

// ─── parse: node_count invariant ─────────────────────────────────────────────

describe('powl parse — node_count invariant', () => {
  it('parse of a valid linear POWL model returns node_count > 0', async () => {
    const model = LINEAR_POWL();
    const result = await runPowl(['parse', `--model=${model}`, '--format=json', '--no-save']);
    expect(result.exitCode, `unexpected exit ${result.exitCode}: ${result.stderr}`).toBe(0);
    const env = parseEnvelope(result);
    expect(env.status).toBe('ok');
    const payload = env.payload as Record<string, unknown>;
    expect(typeof payload.node_count, 'node_count must be a number').toBe('number');
    expect(payload.node_count as number, 'node_count must be > 0 for 3-activity model').toBeGreaterThan(0);
    expect(typeof payload.root, 'root must be a number').toBe('number');
    expect(typeof payload.repr, 'repr must be a string').toBe('string');
  });

  it('parse node_count matches the number of nodes in a single-activity model', async () => {
    const result = await runPowl(['parse', `--model=${V.actA}`, '--format=json', '--no-save']);
    expect(result.exitCode).toBe(0);
    const payload = parseEnvelope(result).payload as Record<string, unknown>;
    // Single activity is 1 node
    expect(payload.node_count as number).toBeGreaterThanOrEqual(1);
  });
});

// ─── complexity: non-zero score invariant ────────────────────────────────────

describe('powl complexity — non-zero score invariant', () => {
  it('complexity returns numeric cyclomatic, cfc, and cognitive scores for a 3-activity model', async () => {
    const model = LINEAR_POWL();
    const result = await runPowl(['complexity', `--model=${model}`, '--format=json', '--no-save']);
    expect(result.exitCode, `unexpected exit: ${result.stderr}`).toBe(0);
    const payload = parseEnvelope(result).payload as Record<string, unknown>;
    expect(typeof payload.cyclomatic).toBe('number');
    expect(typeof payload.cfc).toBe('number');
    expect(typeof payload.cognitive).toBe('number');
    expect(payload.cyclomatic as number).toBeGreaterThanOrEqual(0);
    expect(payload.cfc as number).toBeGreaterThanOrEqual(0);
    expect(payload.cognitive as number).toBeGreaterThanOrEqual(0);
    // At least one metric must be > 0 for a multi-node model
    const anyNonZero =
      (payload.cyclomatic as number) > 0 ||
      (payload.cfc as number) > 0 ||
      (payload.cognitive as number) > 0;
    expect(anyNonZero, 'at least one complexity metric must be > 0').toBe(true);
  });

  it('complexity of a 4-node model is >= complexity of a 3-node model (monotone)', async () => {
    const small = LINEAR_POWL();
    const large = EXTENDED_POWL();
    // Sequential, not Promise.all: `invokeLegacyCommand` traps
    // `process.exit`/stdout globally for the duration of one call — two
    // concurrent in-process invocations race on that shared global state
    // (each call's `finally` can restore the trap out from under the
    // other), which the original two-separate-child-processes version of
    // this test didn't have to worry about.
    const r1 = await runPowl(['complexity', `--model=${small}`, '--format=json', '--no-save']);
    const r2 = await runPowl(['complexity', `--model=${large}`, '--format=json', '--no-save']);
    expect(r1.exitCode).toBe(0);
    expect(r2.exitCode).toBe(0);
    const p1 = parseEnvelope(r1).payload as Record<string, unknown>;
    const p2 = parseEnvelope(r2).payload as Record<string, unknown>;
    // Larger model must not have strictly lower complexity on all dimensions
    const p1Any = (p1.cyclomatic as number) + (p1.cfc as number) + (p1.cognitive as number);
    const p2Any = (p2.cyclomatic as number) + (p2.cfc as number) + (p2.cognitive as number);
    expect(p2Any, 'sum of 4-node complexity scores >= 3-node').toBeGreaterThanOrEqual(p1Any);
  });
});

// ─── diff: structured diff object invariant ──────────────────────────────────

describe('powl diff — structured diff object invariant', () => {
  it('diff returns a payload with severity and behaviourally_equivalent fields', async () => {
    const model = LINEAR_POWL();
    const result = await runPowl(['diff', `--model=${model}`, `--model2=${model}`, '--format=json', '--no-save']);
    expect(result.exitCode, `unexpected exit: ${result.stderr}`).toBe(0);
    const payload = parseEnvelope(result).payload as Record<string, unknown>;
    expect(payload).toHaveProperty('severity');
    expect(typeof payload.severity).toBe('string');
    expect(payload).toHaveProperty('behaviourally_equivalent');
    // Diff of a model with itself must be equivalent
    expect(payload.behaviourally_equivalent).toBe(true);
  });

  it('diff detects a new faker-generated activity added to the model', async () => {
    const original = LINEAR_POWL();
    const extended = EXTENDED_POWL();
    const result = await runPowl(['diff', `--model=${original}`, `--model2=${extended}`, '--format=json', '--no-save']);
    expect(result.exitCode).toBe(0);
    const payload = parseEnvelope(result).payload as Record<string, unknown>;
    expect(payload.behaviourally_equivalent).toBe(false);
    const added = (payload.added_activities as string[]) ?? [];
    expect(added).toContain(V.actNew);
  });

  it('diff result contains all required Van der Aalst structural diff fields', async () => {
    const original = LINEAR_POWL();
    const extended = EXTENDED_POWL();
    const result = await runPowl(['diff', `--model=${original}`, `--model2=${extended}`, '--format=json', '--no-save']);
    expect(result.exitCode).toBe(0);
    const payload = parseEnvelope(result).payload as Record<string, unknown>;
    // All structural diff fields must be present
    expect(payload).toHaveProperty('severity');
    expect(payload).toHaveProperty('behaviourally_equivalent');
    expect(payload).toHaveProperty('added_activities');
    expect(payload).toHaveProperty('removed_activities');
    expect(payload).toHaveProperty('always_changes');
    expect(payload).toHaveProperty('order_changes');
    expect(payload).toHaveProperty('structure_changes');
    expect(Array.isArray(payload.added_activities)).toBe(true);
    expect(Array.isArray(payload.removed_activities)).toBe(true);
  });
});

// ─── conformance: fitness AND precision together ──────────────────────────────

describe('powl conformance — fitness and precision must both be present', () => {
  it('conformance payload contains percentage AND avg_trace_precision (not just fitness)', async () => {
    const model = LINEAR_POWL();
    const result = await runPowl(['conformance', `--model=${model}`, `--log=${logPath}`, '--format=json', '--no-save']);
    // Exit 0 means the check ran successfully
    expect(result.exitCode, `unexpected exit: ${result.stderr}`).toBe(0);
    const payload = parseEnvelope(result).payload as Record<string, unknown>;
    // Van der Aalst: both dimensions must be visible
    expect(payload).toHaveProperty('percentage');
    expect(payload).toHaveProperty('avg_trace_precision');
    expect(typeof payload.percentage).toBe('number');
    expect(typeof payload.avg_trace_precision).toBe('number');
    expect(payload.percentage as number).toBeGreaterThanOrEqual(0);
    expect(payload.avg_trace_precision as number).toBeGreaterThanOrEqual(0);
  });

  it('conformance total_traces matches the number of cases in the XES fixture (3)', async () => {
    const model = LINEAR_POWL();
    const result = await runPowl(['conformance', `--model=${model}`, `--log=${logPath}`, '--format=json', '--no-save']);
    expect(result.exitCode).toBe(0);
    const payload = parseEnvelope(result).payload as Record<string, unknown>;
    expect(payload.total_traces).toBe(3);
  });

  it('conformance with malformed XES path exits with source_error (exit 2), not crash', async () => {
    const model = LINEAR_POWL();
    const result = await runPowl([
      'conformance',
      `--model=${model}`,
      '--log=/nonexistent/path/fake.xes',
      '--format=json',
      '--no-save',
    ]);
    // source_error = exit 2
    expect(result.exitCode).toBe(2);
  });
});

// ─── discover: basic wiring check ────────────────────────────────────────────

describe('powl discover — WASM wiring', () => {
  it('discover from XES log returns root, node_count, and repr fields', async () => {
    const result = await runPowl(['discover', `--input=${logPath}`, '--format=json', '--no-save']);
    expect(result.exitCode, `unexpected exit: ${result.stderr}`).toBe(0);
    const payload = parseEnvelope(result).payload as Record<string, unknown>;
    expect(typeof payload.root).toBe('number');
    expect(typeof payload.node_count).toBe('number');
    expect(payload.node_count as number).toBeGreaterThan(0);
    expect(typeof payload.repr).toBe('string');
    expect((payload.repr as string).length).toBeGreaterThan(0);
  });

  it('discover variant field appears in the result', async () => {
    const result = await runPowl([
      'discover',
      `--input=${logPath}`,
      '--variant=decision_graph_cyclic',
      '--format=json',
      '--no-save',
    ]);
    expect(result.exitCode).toBe(0);
    const payload = parseEnvelope(result).payload as Record<string, unknown>;
    expect(payload.variant).toBe('decision_graph_cyclic');
  });
});

// ─── CLI surface: confirm the hard-break table intercepts wpm powl ──────────

describe('wpm powl (top-level CLI) — retired, hard-broken (regression guard)', () => {
  it('"wpm powl <subcommand>" is intercepted by the removed-commands table for every subcommand', async () => {
    const { execFile } = await import('child_process');
    const CLI_PATH = path.resolve(__dirname, '../../dist/bin/wpm.js');
    const run = (args: string[]) =>
      new Promise<{ exitCode: number; stderr: string }>((resolve) => {
        execFile(process.execPath, [CLI_PATH, ...args], { timeout: 15000 }, (error, _stdout, stderr) => {
          const exitCode = error && 'code' in error && typeof error.code === 'number' ? error.code : error ? 1 : 0;
          resolve({ exitCode, stderr: stderr ?? '' });
        });
      });

    for (const sub of ['parse', 'complexity', 'diff', 'conformance', 'discover']) {
      const r = await run(['powl', sub, '--model=x']);
      expect(r.exitCode, `wpm powl ${sub} should be hard-broken`).toBe(1);
      expect(r.stderr).toMatch(/removed.*use 'wpm model discover'/i);
    }
  });
});
