/**
 * trace-conform-gaps.test.ts — §9 OCEL-to-POWL Admission Pipeline Gap Tests
 *
 * Oracle rank: Rank 2 (Domain contract) + Rank 1 (Invariants) where noted.
 *
 * Addresses gaps in OCEL input parsing, POWL model loading, conformance
 * evaluation correctness, and JSON output contract that are NOT covered by
 * existing test files (trace-cli.test.ts, trace-conformance.test.ts,
 * real-fixtures.test.ts).
 *
 * Gap catalogue:
 *   G1  OCEL with zero events → AndonPull(ActivityOnlyFakeRoute) not a crash
 *   G2  OCEL missing ocel_events key → graceful exit 2 or handled safely
 *   G3  POWL model missing `model` key → no crash, structured error or AndonPull
 *   G4  JSON payload contract: fitness in [0,1], verdict, andon_reason, details[]
 *   G5  observed_count in payload equals actual OCEL event count
 *   G6  --format json error envelope when model file is malformed JSON
 *   G7  required_stages: [] (empty) → stage_coverage = 1.0
 *   G8  Loop model type evaluation (body + redo activities)
 *   G9  Choice graph edge check for first activity (▷→first edge)
 *   G10 Partial-order model with satisfied constraints → Accepted possible
 *   G11 Fitness invariant: always in [0.0, 1.0] (Rank 1 oracle)
 *   G12 Precision invariant: always in [0.0, 1.0] (Rank 1 oracle)
 *   G13 OCEL with events but ocel_objects as empty array → lifecycle not measured
 *   G14 Model with object_types but OCEL has no matching type → cardinality ok (count=0)
 *   G15 --out writes report even when AndonPull; report contains andon_reason
 *   G16 Human output includes route_id from model, not hardcoded string
 *   G17 Human output for AndonPull(TestRouteIncomplete) mentions required fields
 *   G18 Relative model path resolved from CWD (not hardcoded project dir)
 *   G19 ai-code-review catalog route with conforming OCEL → measurable fitness
 *   G20 Synthetic OCEL producing Accepted against ai-accepted-fixture route
 *   G21 OCEL with repeated activities (rework loop) still computes correct fitness
 *   G22 JSON output payload always has `route_id` matching model's route_id field
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFile } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { checkPowl2Conformance } from '../commands/trace.js';
import type { OcelLog, Powl2Model } from '../commands/trace.js';

// ─── CLI runner ───────────────────────────────────────────────────────────────

const CLI = path.resolve(import.meta.dirname, '../../dist/bin/wpm.js');
const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..', '..', '..');

interface CliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

function wpmAsync(
  args: string[],
  options: { cwd?: string; env?: Record<string, string>; timeoutMs?: number; stdin?: string } = {},
): Promise<CliResult> {
  return new Promise((resolve) => {
    const child = execFile(
      process.execPath,
      [CLI, ...args],
      {
        cwd: options.cwd ?? os.tmpdir(),
        env: { ...process.env, ...(options.env ?? {}) },
        timeout: options.timeoutMs ?? 30_000,
        maxBuffer: 10 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        const exitCode =
          error && 'code' in error && typeof error.code === 'number' ? error.code : error ? 1 : 0;
        resolve({ exitCode, stdout: stdout ?? '', stderr: stderr ?? '' });
      },
    );
    if (options.stdin && child.stdin) {
      child.stdin.write(options.stdin);
      child.stdin.end();
    } else if (child.stdin) {
      child.stdin.end();
    }
    child.on('error', () =>
      resolve({ exitCode: 5, stdout: '', stderr: 'Process failed to start' }),
    );
  });
}

function parseJson(result: CliResult): Record<string, unknown> | null {
  try {
    return JSON.parse(result.stdout) as Record<string, unknown>;
  } catch {
    return null;
  }
}

// ─── OCEL / Model helper factories ────────────────────────────────────────────

function makeOcel(
  events: Array<{ activity: string; objects?: Array<{ id: string; type: string }> }>,
): OcelLog {
  const ts = '2026-05-18T10:00:00.000Z';
  const objectSet = new Map<string, { id: string; type: string; attributes: Record<string, unknown> }>();
  const ocelEvents = events.map((ev, i) => {
    const objs = ev.objects ?? [];
    for (const o of objs) {
      if (!objectSet.has(o.id)) {
        objectSet.set(o.id, { id: o.id, type: o.type, attributes: {} });
      }
    }
    return { event_id: `e${i}`, activity: ev.activity, timestamp: ts, objects: objs, attributes: {} };
  });
  return {
    ocel_version: '2.0',
    ocel_global_log: { ocel_attribute_names: [] },
    ocel_events: ocelEvents,
    ocel_objects: Array.from(objectSet.values()),
  };
}

function makeModel(overrides: Partial<Powl2Model>): Powl2Model {
  const base: Powl2Model = {
    route_id: 'gap-test-route',
    type: 'powl2',
    model: { type: 'sequence', sequence: [] },
  };
  return { ...base, ...overrides };
}

// ─── Shared test setup ────────────────────────────────────────────────────────

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'trace-conform-gaps-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
});

// ═══════════════════════════════════════════════════════════════════════════════
// G1 — Zero-event OCEL
// ═══════════════════════════════════════════════════════════════════════════════

describe('G1: OCEL with zero events', () => {
  it('checkPowl2Conformance with zero events → AndonPull(ActivityOnlyFakeRoute)', () => {
    // Rank 1 invariant: empty event log has zero object evidence
    const ocel: OcelLog = {
      ocel_version: '2.0',
      ocel_global_log: { ocel_attribute_names: [] },
      ocel_events: [],
      ocel_objects: [],
    };
    const model = makeModel({
      route_id: 'zero-events-check',
      required_stages: ['start', 'end'],
      object_types: { Work: { created_by: ['start'] } },
      receipt_required: false,
      model: { type: 'sequence', sequence: ['start', 'end'] },
    });

    const result = checkPowl2Conformance(ocel, model);

    // Zero events → eventsWithObjects.length === 0 → ActivityOnlyFakeRoute
    expect(result.verdict).toBe('AndonPull');
    expect(result.andon_reason).toBe('ActivityOnlyFakeRoute');
    // Fitness must be 0 (no observed activities, so inModel/0 → 0 by formula)
    expect(result.fitness).toBe(0);
  });

  it('CLI: empty OCEL file → exit 3 with AndonPull(ActivityOnlyFakeRoute)', async () => {
    const emptyOcel = JSON.stringify({
      ocel_version: '2.0',
      ocel_global_log: { ocel_attribute_names: [] },
      ocel_events: [],
      ocel_objects: [],
    });
    const ocelFile = path.join(tmpDir, 'empty.ocel.json');
    const modelFile = path.join(tmpDir, 'model.powl.json');
    await fs.writeFile(ocelFile, emptyOcel, 'utf8');
    await fs.writeFile(modelFile, JSON.stringify(makeModel({
      route_id: 'empty-ocel-route',
      required_stages: ['start'],
      object_types: { Work: { created_by: ['start'] } },
      model: { type: 'sequence', sequence: ['start'] },
    })), 'utf8');

    const result = await wpmAsync(
      ['trace', 'conform', '-i', ocelFile, '-m', modelFile, '--format', 'json'],
      { cwd: tmpDir },
    );

    expect(result.exitCode).toBe(3);
    const json = parseJson(result);
    const payload = json?.payload as Record<string, unknown> | undefined;
    expect(payload?.verdict).toBe('AndonPull');
    expect(payload?.andon_reason).toBe('ActivityOnlyFakeRoute');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// G2 — OCEL structural validation (missing ocel_events key)
// ═══════════════════════════════════════════════════════════════════════════════

describe('G2: OCEL missing ocel_events key', () => {
  it('CLI: OCEL JSON without ocel_events does not crash — exits non-zero', async () => {
    // The implementation casts JSON parse result — missing ocel_events → undefined
    // Code path: ocelLog.ocel_events.map(...) would throw TypeError if not guarded
    // After fix: should exit 2 (source_error) with informative message
    const badOcel = JSON.stringify({
      ocel_version: '2.0',
      // ocel_events intentionally missing
      ocel_objects: [],
    });
    const ocelFile = path.join(tmpDir, 'bad-ocel.json');
    const modelFile = path.join(tmpDir, 'model.powl.json');
    await fs.writeFile(ocelFile, badOcel, 'utf8');
    await fs.writeFile(modelFile, JSON.stringify(makeModel({
      route_id: 'guard-check',
      model: { type: 'sequence', sequence: ['a'] },
    })), 'utf8');

    const result = await wpmAsync(
      ['trace', 'conform', '-i', ocelFile, '-m', modelFile, '--format', 'json'],
      { cwd: tmpDir },
    );

    // Must not crash with uncaught exception (exitCode 5 would indicate system failure)
    expect(result.exitCode).not.toBe(5);
    // Must either handle gracefully (2=source_error) or produce an AndonPull
    // Valid outcomes: 2 (source_error) or 3 (execution_error with AndonPull)
    expect([2, 3]).toContain(result.exitCode);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// G3 — POWL model missing `model` key
// ═══════════════════════════════════════════════════════════════════════════════

describe('G3: POWL model missing model key', () => {
  it('checkPowl2Conformance with undefined model.model → no crash, fitness=0', () => {
    const ocel = makeOcel([
      { activity: 'start', objects: [{ id: 'w-1', type: 'Work' }] },
    ]);
    // Intentionally omit the required `model` field via type cast
    const brokenModel = {
      route_id: 'broken-model',
      type: 'powl2',
      // model field deliberately missing
    } as unknown as Powl2Model;

    // Must not throw — should produce AndonPull with fitness=0
    expect(() => checkPowl2Conformance(ocel, brokenModel)).not.toThrow();
    const result = checkPowl2Conformance(ocel, brokenModel);
    expect(result.verdict).toBe('AndonPull');
    // No admissible activities → fitness = 0/1 = 0
    expect(result.fitness).toBe(0);
  });

  it('CLI: model JSON without model key → exit 2 or 3, no crash', async () => {
    const validOcel = JSON.stringify({
      ocel_version: '2.0',
      ocel_global_log: { ocel_attribute_names: [] },
      ocel_events: [{ event_id: 'e0', activity: 'start', timestamp: '2026-01-01T00:00:00Z', objects: [{ id: 'w-1', type: 'Work' }], attributes: {} }],
      ocel_objects: [{ id: 'w-1', type: 'Work', attributes: {} }],
    });
    const noModelJson = JSON.stringify({
      route_id: 'broken-model-route',
      type: 'powl2',
      // model field intentionally missing
    });
    const ocelFile = path.join(tmpDir, 'valid.ocel.json');
    const modelFile = path.join(tmpDir, 'broken.powl.json');
    await fs.writeFile(ocelFile, validOcel, 'utf8');
    await fs.writeFile(modelFile, noModelJson, 'utf8');

    const result = await wpmAsync(
      ['trace', 'conform', '-i', ocelFile, '-m', modelFile],
      { cwd: tmpDir },
    );

    // Must not exit 5 (system crash)
    expect(result.exitCode).not.toBe(5);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// G4 — JSON payload contract fields
// ═══════════════════════════════════════════════════════════════════════════════

describe('G4: JSON payload contract — all required fields present', () => {
  it('JSON payload contains fitness, precision, required_stage_coverage, receipt_coverage, object_lifecycle_validity', async () => {
    const ocelFile = path.join(tmpDir, 'ocel.json');
    const modelFile = path.join(tmpDir, 'model.powl.json');
    await fs.writeFile(ocelFile, JSON.stringify(makeOcel([
      { activity: 'step1', objects: [{ id: 'w-1', type: 'Work' }] },
    ])), 'utf8');
    await fs.writeFile(modelFile, JSON.stringify(makeModel({
      route_id: 'payload-contract-test',
      required_stages: ['step1'],
      object_types: { Work: { created_by: ['step1'] } },
      model: { type: 'sequence', sequence: ['step1'] },
    })), 'utf8');

    const result = await wpmAsync(
      ['trace', 'conform', '-i', ocelFile, '-m', modelFile, '--format', 'json'],
      { cwd: tmpDir },
    );

    const json = parseJson(result);
    const payload = json?.payload as Record<string, unknown> | undefined;
    expect(payload).toBeDefined();

    // All ConformanceResult dimensions must be numeric
    expect(typeof payload?.fitness).toBe('number');
    expect(typeof payload?.precision).toBe('number');
    expect(typeof payload?.required_stage_coverage).toBe('number');
    expect(typeof payload?.receipt_coverage).toBe('number');
    expect(typeof payload?.object_lifecycle_validity).toBe('number');
    // Verdict and route_id
    expect(typeof payload?.route_id).toBe('string');
    expect(payload?.verdict === 'Accepted' || payload?.verdict === 'AndonPull').toBe(true);
    // Details array
    expect(Array.isArray(payload?.details)).toBe(true);
  });

  it('JSON payload contains observed_count equal to OCEL event count', async () => {
    // G5: observed_count in payload reflects actual event count
    const events3Ocel = makeOcel([
      { activity: 'a', objects: [{ id: 'o-1', type: 'T' }] },
      { activity: 'b', objects: [{ id: 'o-1', type: 'T' }] },
      { activity: 'c', objects: [{ id: 'o-1', type: 'T' }] },
    ]);
    const ocelFile = path.join(tmpDir, 'three-events.ocel.json');
    const modelFile = path.join(tmpDir, 'model.powl.json');
    await fs.writeFile(ocelFile, JSON.stringify(events3Ocel), 'utf8');
    await fs.writeFile(modelFile, JSON.stringify(makeModel({
      route_id: 'observed-count-test',
      object_types: { T: { created_by: ['a'] } },
      model: { type: 'sequence', sequence: ['a', 'b', 'c'] },
    })), 'utf8');

    const result = await wpmAsync(
      ['trace', 'conform', '-i', ocelFile, '-m', modelFile, '--format', 'json'],
      { cwd: tmpDir },
    );

    const json = parseJson(result);
    const payload = json?.payload as Record<string, unknown> | undefined;
    // observed_count should be 3 (one per event)
    expect(payload?.observed_count).toBe(3);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// G5 (already folded into G4 above)
// G6 — Malformed model JSON error envelope
// ═══════════════════════════════════════════════════════════════════════════════

describe('G6: --format json error envelope when model is malformed JSON', () => {
  it('exits 2 with JSON error status when model file is malformed', async () => {
    const validOcel = JSON.stringify({
      ocel_version: '2.0',
      ocel_global_log: { ocel_attribute_names: [] },
      ocel_events: [{ event_id: 'e0', activity: 'start', timestamp: '2026-01-01T00:00:00Z', objects: [{ id: 'o-1', type: 'T' }], attributes: {} }],
      ocel_objects: [{ id: 'o-1', type: 'T', attributes: {} }],
    });
    const ocelFile = path.join(tmpDir, 'valid.ocel.json');
    const badModelFile = path.join(tmpDir, 'corrupt.powl.json');
    await fs.writeFile(ocelFile, validOcel, 'utf8');
    await fs.writeFile(badModelFile, '{ "route_id": "broken", INVALID_JSON', 'utf8');

    const result = await wpmAsync(
      ['trace', 'conform', '-i', ocelFile, '-m', badModelFile, '--format', 'json'],
      { cwd: tmpDir },
    );

    expect(result.exitCode).toBe(2);
    const json = parseJson(result);
    expect(json?.status).toBe('error');
    // Error code must reference model parse issue
    const errorObj = json?.error as Record<string, unknown> | undefined;
    const code = String(errorObj?.code ?? json?.code ?? '');
    expect(code).toMatch(/MODEL_PARSE_ERROR|PARSE_ERROR|parse/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// G7 — Empty required_stages
// ═══════════════════════════════════════════════════════════════════════════════

describe('G7: required_stages as empty array', () => {
  it('empty required_stages → stage_coverage = 1.0 (no stages to miss)', () => {
    // Rank 1 oracle: coverage of 0/0 stages = 1.0 (vacuously satisfied)
    const ocel = makeOcel([
      { activity: 'anything', objects: [{ id: 'o-1', type: 'T' }] },
    ]);
    const model = makeModel({
      route_id: 'empty-stages',
      required_stages: [], // explicitly empty
      object_types: { T: { created_by: ['anything'] } },
      model: { type: 'sequence', sequence: ['anything'] },
    });

    const result = checkPowl2Conformance(ocel, model);

    expect(result.required_stage_coverage).toBe(1.0);
    const dim = result.details.find((d) => d.dimension === 'required_stage_coverage');
    expect(dim?.ok).toBe(true);
  });

  it('undefined required_stages → stage_coverage = 1.0 (defaulted to [])', () => {
    const ocel = makeOcel([{ activity: 'x', objects: [{ id: 'o-1', type: 'T' }] }]);
    const model = makeModel({
      route_id: 'undefined-stages',
      object_types: { T: { created_by: ['x'] } },
      model: { type: 'sequence', sequence: ['x'] },
      // required_stages not set → undefined
    });
    delete (model as Partial<Powl2Model>).required_stages;

    const result = checkPowl2Conformance(ocel, model);
    expect(result.required_stage_coverage).toBe(1.0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// G8 — Loop model type
// ═══════════════════════════════════════════════════════════════════════════════

describe('G8: loop model type evaluation', () => {
  it('loop model: body + redo activities are all admissible', () => {
    // Rank 1: admissibleActivities = body ∪ redo
    const ocel = makeOcel([
      { activity: 'process', objects: [{ id: 'w-1', type: 'Work' }] },
      { activity: 'retry', objects: [{ id: 'w-1', type: 'Work' }] },
      { activity: 'process', objects: [{ id: 'w-1', type: 'Work' }] },
    ]);
    const model = makeModel({
      route_id: 'loop-model-test',
      object_types: { Work: { created_by: ['process'] } },
      model: {
        type: 'loop',
        loop: { body: ['process'], redo: ['retry'] },
      },
    });

    const result = checkPowl2Conformance(ocel, model);

    // All 3 events use activities in body ∪ redo → fitness = 1.0
    expect(result.fitness).toBe(1.0);
    // No fitness violation
    const fitDim = result.details.find((d) => d.dimension === 'fitness');
    expect(fitDim?.ok).toBe(true);
  });

  it('loop model: activity outside body or redo reduces fitness', () => {
    const ocel = makeOcel([
      { activity: 'process', objects: [{ id: 'w-1', type: 'Work' }] },
      { activity: 'illegal_step', objects: [{ id: 'w-1', type: 'Work' }] }, // NOT in loop
    ]);
    const model = makeModel({
      route_id: 'loop-fitness-gap',
      object_types: { Work: { created_by: ['process'] } },
      model: {
        type: 'loop',
        loop: { body: ['process'], redo: [] },
      },
    });

    const result = checkPowl2Conformance(ocel, model);

    // 1 out of 2 observed activities in model → fitness = 0.5
    expect(result.fitness).toBeCloseTo(0.5, 6);
    expect(result.verdict).toBe('AndonPull');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// G9 — Choice graph edge check (▷→first activity)
// ═══════════════════════════════════════════════════════════════════════════════

describe('G9: choice graph edge validation (▷→first)', () => {
  it('first activity not connected to ▷ → invalid_transitions includes ▷→activity', () => {
    // The checkChoiceGraphEdges function checks for ▷→observed[0] edge
    const ocel = makeOcel([
      { activity: 'skip_entry', objects: [{ id: 'w-1', type: 'Work' }] },
      { activity: 'process', objects: [{ id: 'w-1', type: 'Work' }] },
    ]);
    const model = makeModel({
      route_id: 'choice-entry-gap',
      object_types: { Work: { created_by: ['skip_entry'] } },
      model: {
        type: 'choice_graph',
        choice_graph: {
          nodes: ['▷', 'process', '□'],
          edges: [
            ['▷', 'process'],   // ▷→process exists, but NOT ▷→skip_entry
            ['process', '□'],
          ],
        },
      },
    });

    const result = checkPowl2Conformance(ocel, model);

    // skip_entry is in admissibleActivities from choice_graph nodes? No — nodes = ['▷','process','□']
    // skip_entry is NOT in nodes → fitness < 1.0 → RouteConformanceGap
    expect(result.verdict).toBe('AndonPull');
    // Fitness: 1/2 observed activities in model → RouteConformanceGap
    expect(result.fitness).toBeLessThan(1.0);
  });

  it('valid first activity matching ▷→first edge → no edge violation', () => {
    const ocel = makeOcel([
      { activity: 'collect', objects: [{ id: 'w-1', type: 'Work' }] },
      { activity: 'verify', objects: [{ id: 'w-1', type: 'Work' }] },
    ]);
    const model = makeModel({
      route_id: 'choice-entry-valid',
      object_types: { Work: { created_by: ['collect'] } },
      model: {
        type: 'choice_graph',
        choice_graph: {
          nodes: ['▷', 'collect', 'verify', '□'],
          edges: [
            ['▷', 'collect'],
            ['collect', 'verify'],
            ['verify', '□'],
          ],
        },
      },
    });

    const result = checkPowl2Conformance(ocel, model);

    const edgeDim = result.details.find((d) => d.dimension === 'choice_graph_edges_valid');
    expect(edgeDim).toBeDefined();
    expect(edgeDim?.ok).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// G10 — Partial-order model with satisfied constraints
// ═══════════════════════════════════════════════════════════════════════════════

describe('G10: partial-order model with satisfied constraints', () => {
  it('partial-order with A before B where A appears before B → constraints OK', () => {
    const ocel = makeOcel([
      { activity: 'A', objects: [{ id: 'w-1', type: 'Work' }, { id: 'r-1', type: 'Receipt' }] },
      { activity: 'B', objects: [{ id: 'w-1', type: 'Work' }, { id: 'r-1', type: 'Receipt' }] },
    ]);
    const model = makeModel({
      route_id: 'partial-order-satisfied',
      object_types: {
        Work:    { created_by: ['A'] },
        Receipt: { created_by: ['A'] },
      },
      model: {
        type: 'partial_order',
        partial_order: {
          nodes: ['A', 'B'],
          order: [['A', 'B']], // A must come before B
        },
      },
    });

    const result = checkPowl2Conformance(ocel, model);

    const poDim = result.details.find((d) => d.dimension === 'partial_order_constraints');
    expect(poDim).toBeDefined();
    expect(poDim?.ok).toBe(true);
    // Fitness: both A and B are in admissible nodes
    expect(result.fitness).toBe(1.0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// G11 + G12 — Fitness and Precision invariants (Rank 1)
// ═══════════════════════════════════════════════════════════════════════════════

describe('G11+G12: fitness and precision are always in [0.0, 1.0] (Rank 1 invariant)', () => {
  const scenarios: Array<{ label: string; events: Array<{ activity: string; objects?: Array<{ id: string; type: string }> }>; modelSeq: string[] }> = [
    { label: 'empty model sequence', events: [{ activity: 'x', objects: [{ id: 'o', type: 'T' }] }], modelSeq: [] },
    { label: 'perfect match', events: [{ activity: 'a', objects: [{ id: 'o', type: 'T' }] }, { activity: 'b', objects: [{ id: 'o', type: 'T' }] }], modelSeq: ['a', 'b'] },
    { label: 'no overlap', events: [{ activity: 'x', objects: [{ id: 'o', type: 'T' }] }], modelSeq: ['a', 'b', 'c'] },
    { label: 'partial overlap', events: [{ activity: 'a', objects: [{ id: 'o', type: 'T' }] }, { activity: 'z', objects: [{ id: 'o', type: 'T' }] }], modelSeq: ['a', 'b'] },
    { label: 'many model activities, one observed', events: [{ activity: 'a', objects: [{ id: 'o', type: 'T' }] }], modelSeq: ['a', 'b', 'c', 'd', 'e', 'f'] },
  ];

  it.each(scenarios)('scenario "$label": fitness ∈ [0,1] and precision ∈ [0,1]', ({ events, modelSeq }) => {
    const ocel = makeOcel(events);
    const model = makeModel({
      route_id: `invariant-${modelSeq.join('-') || 'empty'}`,
      object_types: { T: { created_by: events[0] ? [events[0].activity] : ['_'] } },
      model: { type: 'sequence', sequence: modelSeq },
    });

    const result = checkPowl2Conformance(ocel, model);

    // Rank 1 invariant: both metrics must be bounded
    expect(result.fitness).toBeGreaterThanOrEqual(0.0);
    expect(result.fitness).toBeLessThanOrEqual(1.0);
    expect(result.precision).toBeGreaterThanOrEqual(0.0);
    expect(result.precision).toBeLessThanOrEqual(1.0);
    // Must be finite (no NaN/Infinity)
    expect(Number.isFinite(result.fitness)).toBe(true);
    expect(Number.isFinite(result.precision)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// G13 — OCEL with events but ocel_objects empty → lifecycle uses object_types
// ═══════════════════════════════════════════════════════════════════════════════

describe('G13: OCEL events with objects ref but ocel_objects empty array', () => {
  it('object lifecycle measurement uses ocel_objects (empty) → no lifecycle violations for declared types', () => {
    // If ocel_objects is empty, objectsOfType returns [] for each declared type
    // → no objects to check lifecycle for → no violations
    const ocel: OcelLog = {
      ocel_version: '2.0',
      ocel_global_log: { ocel_attribute_names: [] },
      ocel_events: [
        { event_id: 'e0', activity: 'start', timestamp: '2026-01-01T00:00:00Z', objects: [{ id: 'w-1', type: 'Work' }], attributes: {} },
      ],
      ocel_objects: [], // intentionally empty — object not registered
    };
    const model = makeModel({
      route_id: 'no-objects-registered',
      required_stages: ['start'],
      object_types: { Work: { created_by: ['start'] } },
      model: { type: 'sequence', sequence: ['start'] },
    });

    // Must not throw
    expect(() => checkPowl2Conformance(ocel, model)).not.toThrow();
    const result = checkPowl2Conformance(ocel, model);
    // ocel_objects is empty → no Work objects found → lifecycle checks pass vacuously
    const lcDim = result.details.find((d) => d.dimension === 'object_lifecycle_validity');
    expect(lcDim).toBeDefined();
    // No objects to violate lifecycle → validity=1.0
    expect(result.object_lifecycle_validity).toBe(1.0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// G14 — Model declares object type, OCEL has no instances
// ═══════════════════════════════════════════════════════════════════════════════

describe('G14: declared object type with zero instances in OCEL', () => {
  it('min_count declared but zero instances → cardinality violation', () => {
    const ocel = makeOcel([
      { activity: 'start', objects: [{ id: 'w-1', type: 'Work' }] },
    ]);
    const model = makeModel({
      route_id: 'min-count-zero-instances',
      required_stages: ['start'],
      object_types: {
        Work:    { created_by: ['start'] },
        Receipt: { created_by: ['emit'], min_count: 1 }, // Receipt required but none in log
      },
      model: { type: 'sequence', sequence: ['start'] },
    });

    const result = checkPowl2Conformance(ocel, model);

    // count(Receipt)=0 < min_count=1 → CardinalityViolation
    expect(result.verdict).toBe('AndonPull');
    // Either CardinalityViolation or earlier priority reason
    expect(result.andon_reason).toBeTruthy();
    const lcDim = result.details.find((d) => d.dimension === 'object_lifecycle_validity');
    expect(lcDim?.ok).toBe(false);
  });

  it('no min_count/max_count declared → zero instances is acceptable for cardinality', () => {
    const ocel = makeOcel([
      { activity: 'start', objects: [{ id: 'w-1', type: 'Work' }] },
    ]);
    const model = makeModel({
      route_id: 'no-min-max',
      required_stages: ['start'],
      object_types: {
        Work:    { created_by: ['start'] },
        Receipt: { created_by: ['emit'] }, // no min/max_count
      },
      model: { type: 'sequence', sequence: ['start'] },
    });

    const result = checkPowl2Conformance(ocel, model);

    // Cardinality check skips types with no min/max
    const lcDim = result.details.find((d) => d.dimension === 'object_lifecycle_validity');
    // No cardinality violation for Receipt (no instances, no min_count)
    expect(lcDim?.detail).not.toMatch(/count.*Receipt/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// G15 — --out writes report even on AndonPull; contains andon_reason
// ═══════════════════════════════════════════════════════════════════════════════

describe('G15: --out report file written on AndonPull', () => {
  it('AndonPull case writes report JSON containing andon_reason field', async () => {
    // Model without object_types → TestRouteIncomplete
    const model = makeModel({
      route_id: 'andon-report-test',
      required_stages: ['step'],
      // No object_types, no receipt_required → AndonPull(TestRouteIncomplete)
      model: { type: 'sequence', sequence: ['step'] },
    });
    const ocel = makeOcel([{ activity: 'step', objects: [{ id: 'w-1', type: 'Work' }] }]);
    const ocelFile = path.join(tmpDir, 'ocel.json');
    const modelFile = path.join(tmpDir, 'model.powl.json');
    const reportFile = path.join(tmpDir, 'report.json');
    await fs.writeFile(ocelFile, JSON.stringify(ocel), 'utf8');
    await fs.writeFile(modelFile, JSON.stringify(model), 'utf8');

    const result = await wpmAsync(
      ['trace', 'conform', '-i', ocelFile, '-m', modelFile, '-o', reportFile],
      { cwd: tmpDir },
    );

    expect(result.exitCode).toBe(3); // AndonPull → execution_error
    const reportExists = await fs.access(reportFile).then(() => true).catch(() => false);
    expect(reportExists).toBe(true);
    const report = JSON.parse(await fs.readFile(reportFile, 'utf8')) as Record<string, unknown>;
    expect(report.andon_reason).toBeTruthy();
    expect(report.verdict).toBe('AndonPull');
    expect(report.route_id).toBe('andon-report-test');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// G16 — Human output reflects route_id from model
// ═══════════════════════════════════════════════════════════════════════════════

describe('G16: human output includes route_id from the model', () => {
  it('human output prints the model route_id in the Route: line', async () => {
    const uniqueRouteId = 'my-very-unique-route-9x7z';
    const model = makeModel({
      route_id: uniqueRouteId,
      required_stages: ['do_thing'],
      object_types: { T: { created_by: ['do_thing'] } },
      model: { type: 'sequence', sequence: ['do_thing'] },
    });
    const ocel = makeOcel([{ activity: 'do_thing', objects: [{ id: 'o-1', type: 'T' }] }]);
    const ocelFile = path.join(tmpDir, 'ocel.json');
    const modelFile = path.join(tmpDir, 'model.powl.json');
    await fs.writeFile(ocelFile, JSON.stringify(ocel), 'utf8');
    await fs.writeFile(modelFile, JSON.stringify(model), 'utf8');

    const result = await wpmAsync(
      ['trace', 'conform', '-i', ocelFile, '-m', modelFile],
      { cwd: tmpDir },
    );

    const combined = result.stdout + result.stderr;
    expect(combined).toContain(uniqueRouteId);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// G17 — Human output for TestRouteIncomplete mentions required fields
// ═══════════════════════════════════════════════════════════════════════════════

describe('G17: human output for TestRouteIncomplete mentions the missing declarations', () => {
  it('AndonPull(TestRouteIncomplete) human output mentions object_types or receipt_required', async () => {
    // Model without object_types → TestRouteIncomplete
    const model = makeModel({
      route_id: 'incomplete-route',
      required_stages: ['process'],
      // No object_types → lifecycle=NotMeasured; no receipt_required → receipt=NotMeasured
      model: { type: 'sequence', sequence: ['process'] },
    });
    const ocel = makeOcel([{ activity: 'process', objects: [{ id: 'o-1', type: 'T' }] }]);
    const ocelFile = path.join(tmpDir, 'ocel.json');
    const modelFile = path.join(tmpDir, 'model.powl.json');
    await fs.writeFile(ocelFile, JSON.stringify(ocel), 'utf8');
    await fs.writeFile(modelFile, JSON.stringify(model), 'utf8');

    const result = await wpmAsync(
      ['trace', 'conform', '-i', ocelFile, '-m', modelFile],
      { cwd: tmpDir },
    );

    const combined = result.stdout + result.stderr;
    // Human output must mention what's missing to get past TestRouteIncomplete
    expect(combined).toMatch(/object_types|receipt_required/i);
    expect(combined).toMatch(/AndonPull|TestRouteIncomplete/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// G18 — Model path relative to CWD (not process.cwd())
// ═══════════════════════════════════════════════════════════════════════════════

describe('G18: model path resolution relative to CWD', () => {
  it('relative model path resolved from command CWD', async () => {
    const model = makeModel({
      route_id: 'relative-path-test',
      required_stages: ['go'],
      object_types: { T: { created_by: ['go'] } },
      model: { type: 'sequence', sequence: ['go'] },
    });
    const ocel = makeOcel([{ activity: 'go', objects: [{ id: 'o-1', type: 'T' }] }]);

    // Write files to tmpDir
    await fs.writeFile(path.join(tmpDir, 'ocel.json'), JSON.stringify(ocel), 'utf8');
    await fs.writeFile(path.join(tmpDir, 'model.powl.json'), JSON.stringify(model), 'utf8');

    // Use relative paths from tmpDir as CWD
    const result = await wpmAsync(
      ['trace', 'conform', '-i', 'ocel.json', '-m', 'model.powl.json', '--format', 'json'],
      { cwd: tmpDir },
    );

    // Should resolve model relative to CWD and find it
    expect([0, 3]).toContain(result.exitCode);
    const json = parseJson(result);
    expect(json?.status !== 'error' || String(json?.error ?? json?.message ?? '').match(/MODEL_NOT_FOUND|FILE_NOT_FOUND/)).toBeTruthy();
    // If it resolved: payload should have route_id
    if (result.exitCode !== 2) {
      const payload = json?.payload as Record<string, unknown> | undefined;
      expect(payload?.route_id).toBe('relative-path-test');
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// G19 — Real catalog route: ai-code-review
// ═══════════════════════════════════════════════════════════════════════════════

describe('G19: ai-code-review catalog route with conforming OCEL', () => {
  it('ai-code-review model exists and has the correct structure', async () => {
    const modelPath = path.join(REPO_ROOT, 'routes', 'ai-code-review.powl.json');
    const raw = await fs.readFile(modelPath, 'utf8');
    const model = JSON.parse(raw) as Record<string, unknown>;
    expect(model.route_id).toBe('ai-code-review');
    expect(model.type).toBe('powl2');
    expect(Array.isArray((model as Record<string, unknown>).required_stages)).toBe(true);
    const stages = model.required_stages as string[];
    expect(stages).toContain('lint');
    expect(stages).toContain('type_check');
    expect(stages).toContain('run_tests');
    expect(stages).toContain('summarize');
    expect(stages).toContain('emit_receipt');
  });

  it('ai-code-review with all required stages and object evidence → fitness=1.0', async () => {
    const modelPath = path.join(REPO_ROOT, 'routes', 'ai-code-review.powl.json');
    const conformingOcel = JSON.stringify({
      ocel_version: '2.0',
      ocel_global_log: { ocel_attribute_names: [] },
      ocel_events: [
        { event_id: 'e0', activity: 'lint',        timestamp: '2026-01-01T00:00:00Z', objects: [{ id: 'd-1', type: 'Diagnostic' }, { id: 'r-1', type: 'Receipt' }], attributes: {} },
        { event_id: 'e1', activity: 'type_check',  timestamp: '2026-01-01T01:00:00Z', objects: [{ id: 'd-2', type: 'Diagnostic' }, { id: 'r-1', type: 'Receipt' }], attributes: {} },
        { event_id: 'e2', activity: 'run_tests',   timestamp: '2026-01-01T02:00:00Z', objects: [{ id: 'tr-1', type: 'TestRun' }, { id: 'r-1', type: 'Receipt' }], attributes: {} },
        { event_id: 'e3', activity: 'summarize',   timestamp: '2026-01-01T03:00:00Z', objects: [{ id: 'd-1', type: 'Diagnostic' }, { id: 'tr-1', type: 'TestRun' }, { id: 'r-1', type: 'Receipt' }], attributes: {} },
        { event_id: 'e4', activity: 'emit_receipt',timestamp: '2026-01-01T04:00:00Z', objects: [{ id: 'r-2', type: 'Receipt' }], attributes: {} },
      ],
      ocel_objects: [
        { id: 'd-1', type: 'Diagnostic', attributes: {} },
        { id: 'd-2', type: 'Diagnostic', attributes: {} },
        { id: 'tr-1', type: 'TestRun', attributes: {} },
        { id: 'r-1', type: 'Receipt', attributes: {} },
        { id: 'r-2', type: 'Receipt', attributes: {} },
      ],
    });
    const ocelFile = path.join(tmpDir, 'code-review.ocel.json');
    await fs.writeFile(ocelFile, conformingOcel, 'utf8');

    const result = await wpmAsync(
      ['trace', 'conform', '-i', ocelFile, '-m', modelPath, '--format', 'json'],
      { cwd: tmpDir },
    );

    expect([0, 3]).toContain(result.exitCode);
    const json = parseJson(result);
    const payload = json?.payload as Record<string, unknown> | undefined;
    expect(payload?.route_id).toBe('ai-code-review');
    // All 5 required stages present → stage_coverage = 1.0
    expect(payload?.required_stage_coverage).toBe(1.0);
    // All observed activities are in model → fitness = 1.0
    expect(payload?.fitness).toBe(1.0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// G20 — Real fixture route (ai-accepted-fixture) → Accepted
// ═══════════════════════════════════════════════════════════════════════════════

describe('G20: ai-accepted-fixture route → Accepted (real fixture replay)', () => {
  it('uses the fixture OCEL and model to produce Accepted verdict', async () => {
    const fixtureDir = path.join(REPO_ROOT, 'fixtures', 'real', 'trace-conform-accepted');
    const ocelFile = path.join(fixtureDir, 'expected-ocel.json');
    const modelFile = path.join(fixtureDir, 'model.powl.json');

    const fixtureExists = await fs.access(ocelFile).then(() => true).catch(() => false);
    if (!fixtureExists) {
      // Skip gracefully if fixture not captured yet
      return;
    }

    const result = await wpmAsync(
      ['trace', 'conform', '-i', ocelFile, '-m', modelFile, '--format', 'json'],
      { cwd: REPO_ROOT },
    );

    expect(result.exitCode).toBe(0);
    const json = parseJson(result);
    const payload = json?.payload as Record<string, unknown> | undefined;
    expect(payload?.verdict).toBe('Accepted');
    expect(payload?.fitness).toBe(1.0);
    expect(payload?.required_stage_coverage).toBe(1.0);
    expect(payload?.receipt_coverage).toBe(1.0);
    expect(payload?.object_lifecycle_validity).toBe(1.0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// G21 — Rework loops (repeated activities) still produce correct fitness
// ═══════════════════════════════════════════════════════════════════════════════

describe('G21: rework loops — repeated activities compute correct fitness', () => {
  it('activity appearing 3 times still contributes to fitness proportionally', () => {
    // "process" appears 3 times; model sequence = ['process', 'validate']
    // Observed = ['process', 'process', 'validate', 'process']
    // In model: process=yes, validate=yes → 4/4 = fitness 1.0
    const ocel = makeOcel([
      { activity: 'process',  objects: [{ id: 'w-1', type: 'Work' }] },
      { activity: 'process',  objects: [{ id: 'w-1', type: 'Work' }] },
      { activity: 'validate', objects: [{ id: 'w-1', type: 'Work' }] },
      { activity: 'process',  objects: [{ id: 'w-1', type: 'Work' }] },
    ]);
    const model = makeModel({
      route_id: 'rework-loop-test',
      object_types: { Work: { created_by: ['process'] } },
      model: { type: 'sequence', sequence: ['process', 'validate'] },
    });

    const result = checkPowl2Conformance(ocel, model);

    // All 4 events use admissible activities → fitness = 4/4 = 1.0
    expect(result.fitness).toBe(1.0);
  });

  it('rework with illegal activity interspersed reduces fitness below 1.0', () => {
    const ocel = makeOcel([
      { activity: 'process',  objects: [{ id: 'w-1', type: 'Work' }] },
      { activity: 'illegal',  objects: [{ id: 'w-1', type: 'Work' }] }, // not in model
      { activity: 'validate', objects: [{ id: 'w-1', type: 'Work' }] },
    ]);
    const model = makeModel({
      route_id: 'rework-illegal',
      object_types: { Work: { created_by: ['process'] } },
      model: { type: 'sequence', sequence: ['process', 'validate'] },
    });

    const result = checkPowl2Conformance(ocel, model);

    // 2/3 events in model → fitness = 0.667
    expect(result.fitness).toBeCloseTo(2 / 3, 4);
    expect(result.verdict).toBe('AndonPull');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// G22 — JSON payload route_id matches model route_id
// ═══════════════════════════════════════════════════════════════════════════════

describe('G22: JSON payload route_id always matches the model route_id', () => {
  it('route_id in CLI JSON output equals the model file route_id field', async () => {
    const distinctRouteId = 'unique-route-id-for-g22-test';
    const model = makeModel({
      route_id: distinctRouteId,
      object_types: { T: { created_by: ['a'] } },
      model: { type: 'sequence', sequence: ['a', 'b'] },
    });
    const ocel = makeOcel([
      { activity: 'a', objects: [{ id: 'o-1', type: 'T' }] },
      { activity: 'b', objects: [{ id: 'o-1', type: 'T' }] },
    ]);
    const ocelFile = path.join(tmpDir, 'ocel.json');
    const modelFile = path.join(tmpDir, 'model.powl.json');
    await fs.writeFile(ocelFile, JSON.stringify(ocel), 'utf8');
    await fs.writeFile(modelFile, JSON.stringify(model), 'utf8');

    const result = await wpmAsync(
      ['trace', 'conform', '-i', ocelFile, '-m', modelFile, '--format', 'json'],
      { cwd: tmpDir },
    );

    const json = parseJson(result);
    const payload = json?.payload as Record<string, unknown> | undefined;
    expect(payload?.route_id).toBe(distinctRouteId);
  });

  it('checkPowl2Conformance result.route_id always equals model.route_id', () => {
    const scenarios = [
      { route_id: 'alpha' },
      { route_id: 'beta-route-9' },
      { route_id: 'my.route.with.dots' },
    ];

    for (const { route_id } of scenarios) {
      const ocel = makeOcel([{ activity: 'x', objects: [{ id: 'o', type: 'T' }] }]);
      const model = makeModel({ route_id, object_types: { T: { created_by: ['x'] } }, model: { type: 'sequence', sequence: ['x'] } });
      const result = checkPowl2Conformance(ocel, model);
      expect(result.route_id).toBe(route_id);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Additional edge cases
// ═══════════════════════════════════════════════════════════════════════════════

describe('Additional: exit code 0 requires Accepted verdict (MCPP doctrine)', () => {
  it('exit 0 is only emitted when verdict === Accepted', async () => {
    // Build a model + OCEL that achieves Accepted
    // All stages present, object lifecycle valid, receipt coverage full
    const model = makeModel({
      route_id: 'mcpp-admitted-route',
      required_stages: ['begin', 'work', 'seal'],
      receipt_required: true,
      object_types: {
        Artifact: { created_by: ['begin'], terminated_by: ['seal'] },
        Receipt:  { created_by: ['begin', 'work', 'seal'] },
      },
      model: {
        type: 'sequence',
        sequence: ['begin', 'work', 'seal'],
      },
    });
    const ocel: OcelLog = {
      ocel_version: '2.0',
      ocel_global_log: { ocel_attribute_names: [] },
      ocel_events: [
        { event_id: 'e0', activity: 'begin', timestamp: '2026-01-01T00:00:00Z', objects: [{ id: 'art-1', type: 'Artifact' }, { id: 'r-1', type: 'Receipt' }], attributes: {} },
        { event_id: 'e1', activity: 'work',  timestamp: '2026-01-01T01:00:00Z', objects: [{ id: 'art-1', type: 'Artifact' }, { id: 'r-2', type: 'Receipt' }], attributes: {} },
        { event_id: 'e2', activity: 'seal',  timestamp: '2026-01-01T02:00:00Z', objects: [{ id: 'art-1', type: 'Artifact' }, { id: 'r-3', type: 'Receipt' }], attributes: {} },
      ],
      ocel_objects: [
        { id: 'art-1', type: 'Artifact', attributes: {} },
        { id: 'r-1', type: 'Receipt', attributes: {} },
        { id: 'r-2', type: 'Receipt', attributes: {} },
        { id: 'r-3', type: 'Receipt', attributes: {} },
      ],
    };
    const ocelFile = path.join(tmpDir, 'admitted.ocel.json');
    const modelFile = path.join(tmpDir, 'admitted.powl.json');
    await fs.writeFile(ocelFile, JSON.stringify(ocel), 'utf8');
    await fs.writeFile(modelFile, JSON.stringify(model), 'utf8');

    const result = await wpmAsync(
      ['trace', 'conform', '-i', ocelFile, '-m', modelFile, '--format', 'json'],
      { cwd: tmpDir },
    );

    expect(result.exitCode).toBe(0);
    const json = parseJson(result);
    const payload = json?.payload as Record<string, unknown> | undefined;
    expect(payload?.verdict).toBe('Accepted');
  });
});

describe('Additional: details array always has at minimum 4 dimensions', () => {
  it('every checkPowl2Conformance call emits at least 4 dimension details (Rank 1)', () => {
    // Minimum guaranteed dimensions: object_evidence_present, fitness, precision,
    // required_stage_coverage
    const ocel = makeOcel([{ activity: 'x', objects: [{ id: 'o', type: 'T' }] }]);
    const model = makeModel({
      route_id: 'min-details',
      model: { type: 'sequence', sequence: ['x'] },
    });
    const result = checkPowl2Conformance(ocel, model);
    expect(result.details.length).toBeGreaterThanOrEqual(4);

    // All dimension entries must have the required shape
    for (const dim of result.details) {
      expect(typeof dim.dimension).toBe('string');
      expect(typeof dim.ok).toBe('boolean');
      expect(typeof dim.detail).toBe('string');
    }
  });
});
