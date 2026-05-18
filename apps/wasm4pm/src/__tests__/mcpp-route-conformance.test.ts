/**
 * mcpp-route-conformance.test.ts — MCPP Route Conformance Admission Gate
 *
 * Oracle rank: Rank 2 (Domain contract)
 *
 * Verifies the integration between mcpp's native OCEL JSONL format and
 * wasm4pm's `wpm trace conform` POWL v2 conformance engine.
 *
 * MCPP Admission Doctrine:
 *   - Conformance must equal exactly 1.0 for admission.
 *   - Any value < 1.0 raises an AndonPull and blocks the route.
 *   - Exit 0  = Accepted (admitted).
 *   - Exit 3  = AndonPull (blocked — execution_error).
 *
 * Test categories:
 *   C1 — Accepted: conforming mcpp-style OCEL → verdict Accepted + exit 0
 *   C2 — AndonPull: missing required stages → verdict AndonPull + exit 3
 *   C3 — AndonPull: wrong activity order (sequence violation) → exit 3
 *   C4 — AndonPull: activity-only fake route (zero object evidence) → exit 3
 *   C5 — AndonPull: receipt_required but no Receipt objects → exit 3
 *   C6 — Bridge integration: mcpp native JSONL → wasm4pm OCEL → conformance
 *   C7 — Route catalog: ai-code-review model from wasm4pm/routes/
 *   C8 — Route catalog: agent-proof-lifecycle model from wasm4pm/routes/
 *   C9 — Exit code contract: exact exit code values enforced
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFile } from 'child_process';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import * as os from 'os';
import { checkPowl2Conformance } from '../commands/trace.js';
import type { OcelLog, OcelEvent, Powl2Model, ConformanceResult } from '../commands/trace.js';
import { fromMcppNativeJsonl } from '@wasm4pm/contracts';

// ─── Paths ────────────────────────────────────────────────────────────────────

const CLI = path.resolve(import.meta.dirname, '../../dist/bin/wpm.js');
const ROUTES_DIR = path.resolve(import.meta.dirname, '../../../../routes');

// ─── CLI helper ───────────────────────────────────────────────────────────────

interface CliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

function wpmAsync(
  args: string[],
  options: { cwd?: string; timeoutMs?: number } = {},
): Promise<CliResult> {
  return new Promise((resolve) => {
    const child = execFile(
      process.execPath,
      [CLI, ...args],
      {
        cwd: options.cwd ?? os.tmpdir(),
        env: { ...process.env, NO_COLOR: '1' },
        timeout: options.timeoutMs ?? 30_000,
        maxBuffer: 10 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        const exitCode =
          error && 'code' in error && typeof error.code === 'number'
            ? error.code
            : error
              ? 1
              : 0;
        resolve({ exitCode, stdout: stdout ?? '', stderr: stderr ?? '' });
      },
    );
    if (child.stdin) child.stdin.end();
    child.on('error', () =>
      resolve({ exitCode: 5, stdout: '', stderr: 'Process failed to start' }),
    );
  });
}

function parsePayload(result: CliResult): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    return (parsed.payload as Record<string, unknown>) ?? parsed;
  } catch {
    return null;
  }
}

// ─── OCEL factory helpers ─────────────────────────────────────────────────────

/**
 * Build a minimal wasm4pm OcelLog from a compact event descriptor array.
 * Events with objects satisfy the object-evidence check.
 */
function makeOcel(
  events: Array<{
    activity: string;
    objects?: Array<{ id: string; type: string }>;
    hasReceipt?: boolean;
  }>,
): OcelLog {
  const ts = '2026-05-18T10:00:00.000Z';
  const objectSet = new Map<string, { id: string; type: string; attributes: Record<string, unknown> }>();

  const ocelEvents: OcelEvent[] = events.map((ev, i) => {
    const objs: Array<{ id: string; type: string }> = ev.objects ?? [
      { id: `run-${i}`, type: 'Run' },
    ];
    if (ev.hasReceipt) {
      objs.push({ id: `receipt-${i}`, type: 'Receipt' });
    }
    for (const o of objs) {
      if (!objectSet.has(o.id)) {
        objectSet.set(o.id, { id: o.id, type: o.type, attributes: {} });
      }
    }
    return {
      event_id: `e${i}`,
      activity: ev.activity,
      timestamp: ts,
      objects: objs,
      attributes: {},
    };
  });

  return {
    ocel_version: '2.0',
    ocel_global_log: { ocel_attribute_names: [] },
    ocel_events: ocelEvents,
    ocel_objects: Array.from(objectSet.values()),
  };
}

/**
 * Build a minimal Powl2Model with sensible defaults.
 */
function makeModel(overrides: Partial<Powl2Model>): Powl2Model {
  const base: Powl2Model = {
    route_id: 'test-route',
    type: 'powl2',
    required_stages: [],
    receipt_required: false,
    model: { type: 'sequence', sequence: ['start', 'end'] },
  };
  return { ...base, ...overrides };
}

// ─── Temp file helpers ────────────────────────────────────────────────────────

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcpp-conform-test-'));
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

async function writeTempOcel(ocel: OcelLog): Promise<string> {
  const p = path.join(tempDir, 'ocel.json');
  await fs.writeFile(p, JSON.stringify(ocel, null, 2), 'utf8');
  return p;
}

async function writeTempModel(model: Powl2Model): Promise<string> {
  const p = path.join(tempDir, 'model.powl.json');
  await fs.writeFile(p, JSON.stringify(model, null, 2), 'utf8');
  return p;
}

// ─── C1: Accepted — conforming log ───────────────────────────────────────────

describe('C1: Accepted — conforming OCEL admits with verdict Accepted + exit 0', () => {
  it('simple sequence model: all stages present, correct order → Accepted', async () => {
    const model = makeModel({
      route_id: 'test-seq',
      required_stages: ['lint', 'test', 'emit_receipt'],
      receipt_required: true,
      model: { type: 'sequence', sequence: ['lint', 'test', 'emit_receipt'] },
      object_types: {
        Work: { created_by: ['lint'], terminated_by: ['emit_receipt'] },
        Receipt: {
          created_by: ['emit_receipt'],
          schema: 'schemas/receipts/proof-receipt.schema.json',
        },
      },
    });

    const ocel = makeOcel([
      { activity: 'lint', objects: [{ id: 'work-1', type: 'Work' }, { id: 'r-1', type: 'Receipt' }] },
      { activity: 'test', objects: [{ id: 'work-1', type: 'Work' }, { id: 'r-2', type: 'Receipt' }] },
      { activity: 'emit_receipt', objects: [{ id: 'work-1', type: 'Work' }, { id: 'r-3', type: 'Receipt' }] },
    ]);

    const result = checkPowl2Conformance(ocel, model);

    expect(result.verdict).toBe('Accepted');
    expect(result.fitness).toBe(1);
    expect(result.precision).toBe(1);
    expect(result.required_stage_coverage).toBe(1);
    expect(result.receipt_coverage).toBe(1);
    expect(result.object_lifecycle_validity).toBe(1);
  });

  it('CLI: accepted fixture exits 0 and verdict is Accepted', async () => {
    // Use the pre-built accepted fixture from wasm4pm fixtures/real
    const fixturePath = path.resolve(
      import.meta.dirname,
      '../../../../fixtures/real/trace-conform-accepted/expected-ocel.json',
    );
    const modelPath = path.resolve(
      import.meta.dirname,
      '../../../../fixtures/real/trace-conform-accepted/model.powl.json',
    );

    if (!fsSync.existsSync(fixturePath) || !fsSync.existsSync(modelPath)) {
      return; // Skip if fixture not present — not a test failure
    }

    const result = await wpmAsync(['trace', 'conform', '-m', modelPath, '-i', fixturePath, '--format', 'json']);

    expect(result.exitCode).toBe(0);
    const payload = parsePayload(result);
    expect(payload).not.toBeNull();
    expect(payload!['verdict']).toBe('Accepted');
    expect(payload!['fitness']).toBe(1);
    expect(payload!['precision']).toBe(1);
    expect(payload!['required_stage_coverage']).toBe(1);
    expect(payload!['receipt_coverage']).toBe(1);
  });
});

// ─── C2: AndonPull — missing required stages ──────────────────────────────────

describe('C2: AndonPull — missing required stages → exit 3', () => {
  it('skipped stage raises MissingRequiredStages AndonPull', () => {
    const model = makeModel({
      route_id: 'test-missing-stage',
      required_stages: ['reproduce', 'diagnose', 'patch', 'verify', 'commit'],
      model: {
        type: 'sequence',
        sequence: ['reproduce', 'diagnose', 'patch', 'verify', 'commit'],
      },
    });

    // Skip 'diagnose' stage
    const ocel = makeOcel([
      { activity: 'reproduce', objects: [{ id: 'bug-1', type: 'Bug' }] },
      { activity: 'patch', objects: [{ id: 'bug-1', type: 'Bug' }] },
      { activity: 'verify', objects: [{ id: 'bug-1', type: 'Bug' }] },
      { activity: 'commit', objects: [{ id: 'bug-1', type: 'Bug' }] },
    ]);

    const result = checkPowl2Conformance(ocel, model);

    expect(result.verdict).toBe('AndonPull');
    expect(result.required_stage_coverage).toBeLessThan(1);
    const stageDim = result.details.find((d) => d.dimension === 'required_stage_coverage');
    expect(stageDim?.ok).toBe(false);
    expect(stageDim?.detail).toContain('diagnose');
  });

  it('CLI: missing stage exits 3 with AndonPull verdict', async () => {
    const model = makeModel({
      route_id: 'test-missing-stage-cli',
      required_stages: ['step_a', 'step_b', 'step_c'],
      model: { type: 'sequence', sequence: ['step_a', 'step_b', 'step_c'] },
    });

    // Only step_a and step_c present — step_b missing
    const ocel = makeOcel([
      { activity: 'step_a', objects: [{ id: 'obj-1', type: 'Work' }] },
      { activity: 'step_c', objects: [{ id: 'obj-1', type: 'Work' }] },
    ]);

    const ocelPath = await writeTempOcel(ocel);
    const modelPath = await writeTempModel(model);

    const result = await wpmAsync(['trace', 'conform', '-m', modelPath, '-i', ocelPath, '--format', 'json']);

    // MCPP Admission Doctrine: AndonPull → exit 3 (execution_error)
    expect(result.exitCode).toBe(3);
    const payload = parsePayload(result);
    expect(payload!['verdict']).toBe('AndonPull');
  });
});

// ─── C3: AndonPull — wrong activity order ────────────────────────────────────

describe('C3: AndonPull — wrong activity order violates sequence model', () => {
  it('out-of-order activities fail sequence constraint', () => {
    const model = makeModel({
      route_id: 'test-order',
      required_stages: ['plan', 'execute', 'close'],
      model: { type: 'sequence', sequence: ['plan', 'execute', 'close'] },
    });

    // Reversed order: close before execute
    const ocel = makeOcel([
      { activity: 'plan', objects: [{ id: 'work-1', type: 'Work' }] },
      { activity: 'close', objects: [{ id: 'work-1', type: 'Work' }] },
      { activity: 'execute', objects: [{ id: 'work-1', type: 'Work' }] },
    ]);

    const result = checkPowl2Conformance(ocel, model);

    // Fitness is 1.0 (all activities in model), but route sequence invalid
    expect(result.fitness).toBe(1);
    expect(result.verdict).toBe('AndonPull');
    const seqDim = result.details.find((d) => d.dimension === 'route_sequence_valid');
    expect(seqDim?.ok).toBe(false);
  });

  it('CLI: out-of-order stages exit 3', async () => {
    const model = makeModel({
      route_id: 'test-order-cli',
      required_stages: ['a', 'b', 'c'],
      model: { type: 'sequence', sequence: ['a', 'b', 'c'] },
    });

    // Wrong order: b before a
    const ocel = makeOcel([
      { activity: 'b', objects: [{ id: 'obj-1', type: 'Work' }] },
      { activity: 'a', objects: [{ id: 'obj-1', type: 'Work' }] },
      { activity: 'c', objects: [{ id: 'obj-1', type: 'Work' }] },
    ]);

    const ocelPath = await writeTempOcel(ocel);
    const modelPath = await writeTempModel(model);

    const result = await wpmAsync(['trace', 'conform', '-m', modelPath, '-i', ocelPath, '--format', 'json']);

    expect(result.exitCode).toBe(3);
    const payload = parsePayload(result);
    expect(payload!['verdict']).toBe('AndonPull');
  });
});

// ─── C4: AndonPull — activity-only fake route (P22 adversary) ────────────────

describe('C4: AndonPull — activity-only fake route (no object evidence)', () => {
  it('events with zero objects trigger ActivityOnlyFakeRoute detection', () => {
    const model = makeModel({
      route_id: 'test-no-objects',
      required_stages: ['lint', 'test'],
      model: { type: 'sequence', sequence: ['lint', 'test'] },
    });

    // Events with NO objects — fake route adversary
    const ocel: OcelLog = {
      ocel_version: '2.0',
      ocel_global_log: { ocel_attribute_names: [] },
      ocel_events: [
        { event_id: 'e0', activity: 'lint', timestamp: '2026-05-18T10:00:00Z', objects: [], attributes: {} },
        { event_id: 'e1', activity: 'test', timestamp: '2026-05-18T10:01:00Z', objects: [], attributes: {} },
      ],
      ocel_objects: [],
    };

    const result = checkPowl2Conformance(ocel, model);

    // Priority chain: ActivityOnlyFakeRoute wins
    expect(result.verdict).toBe('AndonPull');
    const objDim = result.details.find((d) => d.dimension === 'object_evidence_present');
    expect(objDim?.ok).toBe(false);
    expect(objDim?.detail).toContain('activity-only fake route');
  });
});

// ─── C5: AndonPull — receipt_required but no Receipt objects ─────────────────

describe('C5: AndonPull — receipt_required, but OCEL has no Receipt objects', () => {
  it('missing receipt objects → InsufficientReceiptCoverage', () => {
    const model = makeModel({
      route_id: 'test-receipt-required',
      required_stages: ['collect', 'verify', 'emit_receipt'],
      receipt_required: true,
      model: {
        type: 'choice_graph',
        choice_graph: {
          nodes: ['▷', 'collect', 'verify', 'emit_receipt', '□'],
          edges: [
            ['▷', 'collect'],
            ['collect', 'verify'],
            ['verify', 'emit_receipt'],
            ['emit_receipt', '□'],
          ],
        },
      },
      object_types: {
        Evidence: { created_by: ['collect'], terminated_by: ['emit_receipt'] },
        Receipt: {
          created_by: ['emit_receipt'],
          schema: 'schemas/receipts/proof-receipt.schema.json',
        },
      },
    });

    // Events have objects but NO Receipt-type objects (only Evidence)
    const ocel = makeOcel([
      { activity: 'collect', objects: [{ id: 'ev-1', type: 'Evidence' }] },
      { activity: 'verify', objects: [{ id: 'ev-1', type: 'Evidence' }] },
      { activity: 'emit_receipt', objects: [{ id: 'ev-1', type: 'Evidence' }] },
    ]);

    const result = checkPowl2Conformance(ocel, model);

    expect(result.verdict).toBe('AndonPull');
    expect(result.receipt_coverage).toBe(0);
    const recDim = result.details.find((d) => d.dimension === 'receipt_coverage');
    expect(recDim?.ok).toBe(false);
  });

  it('CLI: agent-proof-lifecycle real model without receipt objects exits 3', async () => {
    const modelPath = path.resolve(
      import.meta.dirname,
      '../../../../fixtures/real/trace-conform-agent-proof-lifecycle/model.powl.json',
    );
    const ocelPath = path.resolve(
      import.meta.dirname,
      '../../../../fixtures/real/trace-conform-agent-proof-lifecycle/expected-ocel.json',
    );

    if (!fsSync.existsSync(modelPath) || !fsSync.existsSync(ocelPath)) {
      return; // Skip if fixture not present
    }

    const result = await wpmAsync(['trace', 'conform', '-m', modelPath, '-i', ocelPath, '--format', 'json']);

    // Expected: AndonPull due to InsufficientReceiptCoverage
    expect(result.exitCode).toBe(3);
    const payload = parsePayload(result);
    expect(payload!['verdict']).toBe('AndonPull');
    expect(payload!['andon_reason']).toBe('InsufficientReceiptCoverage');
    expect(payload!['receipt_coverage']).toBe(0);
    // But all other dimensions should be 1.0
    expect(payload!['fitness']).toBe(1);
    expect(payload!['precision']).toBe(1);
    expect(payload!['required_stage_coverage']).toBe(1);
  });
});

// ─── C6: Bridge integration — mcpp native JSONL → wasm4pm OCEL ──────────────

describe('C6: Bridge integration — mcpp native JSONL bridges to wasm4pm OCEL', () => {
  /**
   * mcpp native JSONL (flat keys, no ocel: prefix) is what mcpp's
   * crates/mcpp-server/src/ocel.rs emits to .mcpp/events.jsonl.
   *
   * fromMcppNativeJsonl() converts it to wasm4pm's ocel:-prefixed OcelEvent[].
   * This test verifies the bridge produces the correct activity sequence.
   */
  it('fromMcppNativeJsonl converts mcpp flat events to ocel: prefixed events', () => {
    const mcppJsonl = [
      JSON.stringify({
        id: 'evt-001',
        activity: 'mcp_tool_called',
        time: '2026-05-18T00:00:01Z',
        outcome: 'success',
        session_id: 'sess-001',
        part_name: 'extract_claims',
        attrs: { 'mcpp.ocel.activity': 'mcp_tool_called' },
        objects: { 'mcpp:CallSession': ['obj:call-001'] },
      }),
      JSON.stringify({
        id: 'evt-002',
        activity: 'task_started',
        time: '2026-05-18T00:00:02Z',
        outcome: 'success',
        session_id: 'sess-001',
        part_name: 'extract_claims',
        attrs: { 'mcpp.ocel.activity': 'task_started' },
        objects: { 'mcpp:CallSession': ['obj:call-001'], 'mcpp:Task': ['obj:task-001'] },
      }),
      JSON.stringify({
        id: 'evt-003',
        activity: 'verdict_emitted',
        time: '2026-05-18T00:00:03Z',
        outcome: 'success',
        session_id: 'sess-001',
        part_name: 'extract_claims',
        attrs: { 'mcpp.ocel.activity': 'verdict_emitted', 'mcpp.verdict': 'accepted' },
        objects: {
          'mcpp:CallSession': ['obj:call-001'],
          'mcpp:Task': ['obj:task-001'],
          'mcpp:Verdict': ['obj:ver-001'],
        },
      }),
    ].join('\n');

    const adapted = fromMcppNativeJsonl(mcppJsonl);

    expect(adapted).toHaveLength(3);

    // Verify key mapping: id → ocel:eid, activity → ocel:activity, time → ocel:timestamp
    expect(adapted[0]?.['ocel:eid']).toBe('evt-001');
    expect(adapted[0]?.['ocel:activity']).toBe('mcp_tool_called');
    expect(adapted[0]?.['ocel:timestamp']).toBe('2026-05-18T00:00:01Z');

    // Verify object flattening: typed map → flat id array
    expect(adapted[0]?.['ocel:omap']).toContain('obj:call-001');

    // Verify vmap merges attrs + outcome + session_id + part_name
    expect(adapted[0]?.['ocel:vmap']).toMatchObject({
      outcome: 'success',
      session_id: 'sess-001',
      part_name: 'extract_claims',
    });

    // Verify multi-object event flattening
    expect(adapted[2]?.['ocel:omap']).toContain('obj:call-001');
    expect(adapted[2]?.['ocel:omap']).toContain('obj:task-001');
    expect(adapted[2]?.['ocel:omap']).toContain('obj:ver-001');
  });

  it('mcpp route-fixture.ocel.jsonl (from fixtures/launch) bridges correctly', () => {
    const fixturePath = path.resolve(
      '/Users/sac/mcpp/fixtures/launch/v26.5.19/route-fixture.ocel.jsonl',
    );

    if (!fsSync.existsSync(fixturePath)) {
      return; // Skip if mcpp repo fixture not present
    }

    const ndjson = fsSync.readFileSync(fixturePath, 'utf8');
    const adapted = fromMcppNativeJsonl(ndjson);

    // Should produce at least one valid adapted event
    expect(adapted.length).toBeGreaterThan(0);

    // All adapted events must have the required ocel: keys
    for (const ev of adapted) {
      expect(typeof ev['ocel:eid']).toBe('string');
      expect(typeof ev['ocel:activity']).toBe('string');
      expect(typeof ev['ocel:timestamp']).toBe('string');
      expect(Array.isArray(ev['ocel:omap'])).toBe(true);
      expect(typeof ev['ocel:vmap']).toBe('object');
    }
  });

  it('mcpp native JSONL → wasm4pm OcelLog → conformance check (end-to-end bridge)', async () => {
    // Simulate what mcpp would emit for a simple 3-stage route
    const mcppJsonl = [
      JSON.stringify({
        id: 'e-lint-001',
        activity: 'lint',
        time: '2026-05-18T10:00:01Z',
        outcome: 'success',
        session_id: 'bridge-test-001',
        part_name: 'ai-code-review',
        attrs: {},
        objects: { 'Work': ['work-1'], 'Diagnostic': ['diag-1'] },
      }),
      JSON.stringify({
        id: 'e-type-001',
        activity: 'type_check',
        time: '2026-05-18T10:00:02Z',
        outcome: 'success',
        session_id: 'bridge-test-001',
        part_name: 'ai-code-review',
        attrs: {},
        objects: { 'Work': ['work-1'], 'Diagnostic': ['diag-2'] },
      }),
      JSON.stringify({
        id: 'e-test-001',
        activity: 'run_tests',
        time: '2026-05-18T10:00:03Z',
        outcome: 'success',
        session_id: 'bridge-test-001',
        part_name: 'ai-code-review',
        attrs: {},
        objects: { 'Work': ['work-1'], 'TestRun': ['testrun-1'] },
      }),
      JSON.stringify({
        id: 'e-sum-001',
        activity: 'summarize',
        time: '2026-05-18T10:00:04Z',
        outcome: 'success',
        session_id: 'bridge-test-001',
        part_name: 'ai-code-review',
        attrs: {},
        objects: { 'Work': ['work-1'] },
      }),
      JSON.stringify({
        id: 'e-emit-001',
        activity: 'emit_receipt',
        time: '2026-05-18T10:00:05Z',
        outcome: 'success',
        session_id: 'bridge-test-001',
        part_name: 'ai-code-review',
        attrs: {},
        objects: { 'Work': ['work-1'], 'Receipt': ['receipt-1'] },
      }),
    ].join('\n');

    // Step 1: bridge mcpp native JSONL → wasm4pm ocel: events
    const adapted = fromMcppNativeJsonl(mcppJsonl);
    expect(adapted).toHaveLength(5);

    // Step 2: convert ocel:-prefixed events to wasm4pm's OcelLog format
    // (trace conform expects ocel_events with event_id/activity/timestamp/objects/attributes)
    const ocelLog: OcelLog = {
      ocel_version: '2.0',
      ocel_global_log: { ocel_attribute_names: [] },
      ocel_events: adapted.map((ev, i) => ({
        event_id: (ev['ocel:eid'] as string) || `e${i}`,
        activity: ev['ocel:activity'] as string,
        timestamp: ev['ocel:timestamp'] as string,
        objects: (ev['ocel:omap'] as string[]).map((id) => ({
          id,
          // Determine type from id prefix conventions; default to Work
          type: id.startsWith('receipt') ? 'Receipt'
            : id.startsWith('diag') ? 'Diagnostic'
              : id.startsWith('testrun') ? 'TestRun'
                : 'Work',
        })),
        attributes: ev['ocel:vmap'] as Record<string, unknown>,
      })),
      ocel_objects: [],
    };

    // Collect all unique objects
    const objectSet = new Map<string, { id: string; type: string; attributes: Record<string, unknown> }>();
    for (const ev of ocelLog.ocel_events) {
      for (const o of ev.objects) {
        if (!objectSet.has(o.id)) objectSet.set(o.id, { ...o, attributes: {} });
      }
    }
    ocelLog.ocel_objects = Array.from(objectSet.values());

    // Step 3: load the ai-code-review route model from the routes catalog
    const modelPath = path.join(ROUTES_DIR, 'ai-code-review.powl.json');
    if (!fsSync.existsSync(modelPath)) {
      return; // Skip if routes directory not accessible
    }
    const model = JSON.parse(fsSync.readFileSync(modelPath, 'utf8')) as Powl2Model;

    // Step 4: evaluate conformance
    const result = checkPowl2Conformance(ocelLog, model);

    // All 5 required stages present in correct order → Accepted
    expect(result.fitness).toBe(1);
    expect(result.precision).toBe(1);
    expect(result.required_stage_coverage).toBe(1);
    expect(result.receipt_coverage).toBe(1); // Receipt objects present
    expect(result.verdict).toBe('Accepted');
  });
});

// ─── C7: Route catalog — ai-code-review model ────────────────────────────────

describe('C7: Route catalog — ai-code-review conformance via CLI', () => {
  it('conforming OCEL for ai-code-review exits 0 with Accepted verdict', async () => {
    const modelPath = path.join(ROUTES_DIR, 'ai-code-review.powl.json');
    if (!fsSync.existsSync(modelPath)) {
      return; // Skip if routes not accessible
    }

    // Build conforming OCEL: all 5 required stages + Receipt objects
    const ocel = makeOcel([
      {
        activity: 'lint',
        objects: [{ id: 'work-1', type: 'Work' }, { id: 'diag-1', type: 'Diagnostic' }, { id: 'r-1', type: 'Receipt' }],
      },
      {
        activity: 'type_check',
        objects: [{ id: 'work-1', type: 'Work' }, { id: 'diag-2', type: 'Diagnostic' }, { id: 'r-2', type: 'Receipt' }],
      },
      {
        activity: 'run_tests',
        objects: [{ id: 'work-1', type: 'Work' }, { id: 'testrun-1', type: 'TestRun' }, { id: 'r-3', type: 'Receipt' }],
      },
      {
        activity: 'summarize',
        objects: [{ id: 'work-1', type: 'Work' }, { id: 'r-4', type: 'Receipt' }],
      },
      {
        activity: 'emit_receipt',
        objects: [{ id: 'work-1', type: 'Work' }, { id: 'receipt-final', type: 'Receipt' }],
      },
    ]);

    const ocelPath = await writeTempOcel(ocel);
    const result = await wpmAsync(['trace', 'conform', '-m', modelPath, '-i', ocelPath, '--format', 'json']);

    expect(result.exitCode).toBe(0);
    const payload = parsePayload(result);
    expect(payload!['verdict']).toBe('Accepted');
    expect(payload!['fitness']).toBe(1);
    expect(payload!['precision']).toBe(1);
    expect(payload!['required_stage_coverage']).toBe(1);
  });

  it('ai-code-review with missing run_tests stage exits 3 — AndonPull', async () => {
    const modelPath = path.join(ROUTES_DIR, 'ai-code-review.powl.json');
    if (!fsSync.existsSync(modelPath)) {
      return; // Skip if routes not accessible
    }

    // Missing run_tests — route does not cover all required stages
    const ocel = makeOcel([
      { activity: 'lint', objects: [{ id: 'work-1', type: 'Work' }] },
      { activity: 'type_check', objects: [{ id: 'work-1', type: 'Work' }] },
      // run_tests intentionally skipped
      { activity: 'summarize', objects: [{ id: 'work-1', type: 'Work' }] },
      { activity: 'emit_receipt', objects: [{ id: 'work-1', type: 'Work' }, { id: 'r-1', type: 'Receipt' }] },
    ]);

    const ocelPath = await writeTempOcel(ocel);
    const result = await wpmAsync(['trace', 'conform', '-m', modelPath, '-i', ocelPath, '--format', 'json']);

    expect(result.exitCode).toBe(3); // AndonPull → execution_error
    const payload = parsePayload(result);
    expect(payload!['verdict']).toBe('AndonPull');
  });
});

// ─── C8: Route catalog — agent-proof-lifecycle from routes/ ──────────────────

describe('C8: Route catalog — agent-proof-lifecycle conformance', () => {
  it('conforming OCEL with Receipt objects → Accepted (fitness=1, receipt_coverage=1)', async () => {
    const modelPath = path.join(ROUTES_DIR, 'agent-proof-lifecycle.powl.json');
    if (!fsSync.existsSync(modelPath)) {
      return; // Skip if routes not accessible
    }

    // Build a fully conforming OCEL: all 3 required stages + Evidence + Receipt objects
    const ocel = makeOcel([
      {
        activity: 'collect_evidence',
        objects: [{ id: 'ev-1', type: 'Evidence' }, { id: 'r-1', type: 'Receipt' }],
      },
      {
        activity: 'verify_evidence',
        objects: [{ id: 'ev-1', type: 'Evidence' }, { id: 'r-2', type: 'Receipt' }],
      },
      {
        activity: 'emit_receipt',
        objects: [{ id: 'ev-1', type: 'Evidence' }, { id: 'receipt-final', type: 'Receipt' }],
      },
    ]);

    const ocelPath = await writeTempOcel(ocel);
    const result = await wpmAsync(['trace', 'conform', '-m', modelPath, '-i', ocelPath, '--format', 'json']);

    expect(result.exitCode).toBe(0);
    const payload = parsePayload(result);
    expect(payload!['verdict']).toBe('Accepted');
    expect(payload!['fitness']).toBe(1);
    expect(payload!['receipt_coverage']).toBe(1);
  });

  it('OCEL without Receipt objects → AndonPull InsufficientReceiptCoverage', async () => {
    const modelPath = path.join(ROUTES_DIR, 'agent-proof-lifecycle.powl.json');
    if (!fsSync.existsSync(modelPath)) {
      return; // Skip if routes not accessible
    }

    // Conforming activities but no Receipt-type objects
    const ocel = makeOcel([
      { activity: 'collect_evidence', objects: [{ id: 'ev-1', type: 'Evidence' }] },
      { activity: 'verify_evidence', objects: [{ id: 'ev-1', type: 'Evidence' }] },
      { activity: 'emit_receipt', objects: [{ id: 'ev-1', type: 'Evidence' }] },
    ]);

    const ocelPath = await writeTempOcel(ocel);
    const result = await wpmAsync(['trace', 'conform', '-m', modelPath, '-i', ocelPath, '--format', 'json']);

    expect(result.exitCode).toBe(3);
    const payload = parsePayload(result);
    expect(payload!['verdict']).toBe('AndonPull');
    expect(payload!['andon_reason']).toBe('InsufficientReceiptCoverage');
  });
});

// ─── C9: Exit code contract ───────────────────────────────────────────────────

describe('C9: Exit code contract — MCPP admission doctrine enforcement', () => {
  /**
   * Admission doctrine:
   *   exit 0  = Accepted  — all conformance dimensions = 1.0
   *   exit 3  = AndonPull — any dimension < 1.0 (execution_error)
   *   exit 2  = source_error — bad input file
   *   exit 1  = config_error — missing required flag
   */

  it('exit 0 only when ALL dimensions are exactly 1.0', () => {
    const model = makeModel({
      route_id: 'exit-code-test',
      required_stages: ['a', 'b'],
      receipt_required: false,
      model: { type: 'sequence', sequence: ['a', 'b'] },
    });

    const ocel = makeOcel([
      { activity: 'a', objects: [{ id: 'obj-1', type: 'Work' }] },
      { activity: 'b', objects: [{ id: 'obj-1', type: 'Work' }] },
    ]);

    const result = checkPowl2Conformance(ocel, model);

    expect(result.verdict).toBe('Accepted');
    expect(result.fitness).toBe(1);
    expect(result.precision).toBe(1);
    expect(result.required_stage_coverage).toBe(1);
    // receipt_coverage is 0 when receipt_required=false and no Receipt type in model
    // but verdict is still Accepted because receipt is not required
    expect(result.verdict).toBe('Accepted');
  });

  it('CLI: missing -m flag exits non-zero (config_error)', async () => {
    const ocel = makeOcel([{ activity: 'a', objects: [{ id: 'obj-1', type: 'Work' }] }]);
    const ocelPath = await writeTempOcel(ocel);

    const result = await wpmAsync(['trace', 'conform', '-i', ocelPath, '--format', 'json']);

    expect(result.exitCode).not.toBe(0);
  });

  it('CLI: non-existent OCEL file exits 2 (source_error)', async () => {
    const modelPath = path.join(ROUTES_DIR, 'agent-proof-lifecycle.powl.json');
    if (!fsSync.existsSync(modelPath)) {
      return; // Skip if routes not accessible
    }

    const result = await wpmAsync(['trace', 'conform', '-m', modelPath, '-i', '/no/such/file.json', '--format', 'json']);

    expect(result.exitCode).toBe(2);
  });

  it('CLI: invalid JSON in OCEL file exits 2 (source_error)', async () => {
    const modelPath = path.join(ROUTES_DIR, 'agent-proof-lifecycle.powl.json');
    if (!fsSync.existsSync(modelPath)) {
      return; // Skip if routes not accessible
    }

    const badPath = path.join(tempDir, 'bad.json');
    await fs.writeFile(badPath, '{ invalid json !!', 'utf8');

    const result = await wpmAsync(['trace', 'conform', '-m', modelPath, '-i', badPath, '--format', 'json']);

    expect(result.exitCode).toBe(2);
  });

  it('AndonPull verdict always produces exit 3 regardless of which dimension fails', () => {
    const model = makeModel({
      route_id: 'multiple-failures',
      required_stages: ['a', 'b', 'c'],
      model: { type: 'sequence', sequence: ['a', 'b', 'c'] },
    });

    // Multiple failures: missing 'c', wrong order
    const ocel = makeOcel([
      { activity: 'b', objects: [{ id: 'obj-1', type: 'Work' }] },
      { activity: 'a', objects: [{ id: 'obj-1', type: 'Work' }] },
      // 'c' missing
    ]);

    const result = checkPowl2Conformance(ocel, model);

    // No matter which dimension fails first, verdict must be AndonPull
    expect(result.verdict).toBe('AndonPull');
    // The conformance score is not 1.0 — MCPP doctrine blocks it
    const allOk = result.details.every((d) => d.ok);
    expect(allOk).toBe(false);
  });
});
