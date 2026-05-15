/**
 * trace-conformance.test.ts — §7.1 POWL Conformance Acceptance Tests
 *                              §7.2 Object Evidence Tests
 *
 * Phase 6 — Route-Driven Adversarial Admissibility Testing
 *
 * Oracle rank: Rank 2 (Domain contract — verdicts are determined by declared
 * POWL model constraints, not by implementation heuristics).
 *
 * Tests exercise checkPowl2Conformance() directly without CLI invocation.
 * No WASM dependency — pure TypeScript domain logic.
 */

import { describe, it, expect } from 'vitest';
import { checkPowl2Conformance } from '../commands/trace.js';
import type { OcelLog, OcelEvent } from '../commands/trace.js';
import type { Powl2Model } from '../commands/trace.js';

// ─── Helper factories ─────────────────────────────────────────────────────────

/**
 * Build a minimal OcelLog from a compact event descriptor array.
 * Each descriptor carries an activity name and optional related objects.
 */
function makeOcel(
  events: Array<{ activity: string; objects?: Array<{ id: string; type: string }> }>,
): OcelLog {
  const ts = '2026-05-14T10:00:00.000Z';
  const objectSet = new Map<string, { id: string; type: string; attributes: Record<string, unknown> }>();

  const ocelEvents: OcelEvent[] = events.map((ev, i) => {
    const objs = ev.objects ?? [];
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
 * Build a minimal Powl2Model with sensible defaults for required fields.
 */
function makeModel(overrides: Partial<Powl2Model>): Powl2Model {
  const base: Powl2Model = {
    route_id: 'test-route',
    type: 'powl2',
    model: { type: 'sequence', sequence: [] },
  };
  return { ...base, ...overrides };
}

// ─── §7.1 — POWL Conformance Acceptance Tests ─────────────────────────────────

describe('§7.1 POWL Conformance — Acceptance Tests', () => {

  // ── Test 1: Activity-only fake route ─────────────────────────────────────────
  it('T1: activity-only fake route → AndonPull(ActivityOnlyFakeRoute)', () => {
    // OCEL with events but NO related objects — the hallmark of a fake route
    const ocel = makeOcel([
      { activity: 'validate' },
      { activity: 'approve' },
      { activity: 'complete' },
    ]);

    const model = makeModel({
      route_id: 'fake-route-check',
      required_stages: ['validate', 'approve', 'complete'],
      object_types: {
        Case: { created_by: ['validate'] },
      },
      model: {
        type: 'sequence',
        sequence: ['validate', 'approve', 'complete'],
      },
    });

    const result = checkPowl2Conformance(ocel, model);

    // FALSIFICATION guard: a stub returning Accepted unconditionally would fail this
    expect(result.verdict).toBe('AndonPull');
    expect(result.andon_reason).toBe('ActivityOnlyFakeRoute');

    // ANTI-STUB: the detail dimension must flag the absence of object evidence
    const evDim = result.details.find((d) => d.dimension === 'object_evidence_present');
    expect(evDim).toBeDefined();
    expect(evDim!.ok).toBe(false);
  });

  // ── Test 2: Missing required stage ────────────────────────────────────────────
  it('T2: missing required stage → verdict is NOT Accepted', () => {
    // OCEL has objects (not a fake route) but skips the "approve" stage
    const ocel = makeOcel([
      { activity: 'validate', objects: [{ id: 'case-1', type: 'Case' }] },
      { activity: 'complete', objects: [{ id: 'case-1', type: 'Case' }] },
      // "approve" is absent
    ]);

    const model = makeModel({
      route_id: 'missing-stage-check',
      required_stages: ['validate', 'approve', 'complete'],
      object_types: {
        Case: { created_by: ['validate'] },
      },
      model: {
        type: 'sequence',
        sequence: ['validate', 'approve', 'complete'],
      },
    });

    const result = checkPowl2Conformance(ocel, model);

    // Required: not Accepted — any AndonPull reason is valid
    expect(result.verdict).toBe('AndonPull');
    expect(result.andon_reason).not.toBeUndefined();

    // Stage coverage must reflect the gap
    expect(result.required_stage_coverage).toBeLessThan(1.0);

    // ANTI-STUB: detail for required_stage_coverage must flag missing stage
    const stageDim = result.details.find((d) => d.dimension === 'required_stage_coverage');
    expect(stageDim).toBeDefined();
    expect(stageDim!.ok).toBe(false);
  });

  // ── Test 3: Complete conforming trace → Accepted ──────────────────────────────
  it('T3: complete conforming trace → Accepted', () => {
    // All required stages present, object lifecycle valid, receipt coverage full.
    //
    // Lifecycle rule: Receipt objects must be FIRST seen in "emit_receipt".
    // Therefore emit_receipt must be the first event referencing each Receipt.
    // Subsequent activities may re-reference the same Receipt objects.
    // Case-1 is first seen in "validate" (created_by: ['validate']).
    //
    // Receipt coverage: ALL unique activities must have at least one Receipt object.
    // emit_receipt → receipt-1  (Receipt)
    // validate     → receipt-1  (Receipt, same object, re-referenced — still counts)
    // approve      → receipt-1  (Receipt)
    // complete     → receipt-1  (Receipt)
    // coverage = 4/4 = 1.0
    const ocel = makeOcel([
      { activity: 'emit_receipt', objects: [{ id: 'receipt-1', type: 'Receipt' }] },
      { activity: 'validate',    objects: [{ id: 'case-1', type: 'Case' }, { id: 'receipt-1', type: 'Receipt' }] },
      { activity: 'approve',     objects: [{ id: 'case-1', type: 'Case' }, { id: 'receipt-1', type: 'Receipt' }] },
      { activity: 'complete',    objects: [{ id: 'case-1', type: 'Case' }, { id: 'receipt-1', type: 'Receipt' }] },
    ]);

    const model = makeModel({
      route_id: 'full-conforming-route',
      required_stages: ['emit_receipt', 'validate', 'approve', 'complete'],
      receipt_required: true,
      object_types: {
        // receipt-1 is first touched by emit_receipt → valid
        Receipt: { created_by: ['emit_receipt'] },
        // case-1 is first touched by validate → valid
        Case:    { created_by: ['validate'] },
      },
      model: {
        type: 'sequence',
        sequence: ['emit_receipt', 'validate', 'approve', 'complete'],
      },
    });

    const result = checkPowl2Conformance(ocel, model);

    // FALSIFICATION guard: a stub returning AndonPull always would fail this
    expect(result.verdict).toBe('Accepted');
    expect(result.andon_reason).toBeUndefined();
    expect(result.fitness).toBe(1.0);
    expect(result.required_stage_coverage).toBe(1.0);
    expect(result.receipt_coverage).toBe(1.0);
    expect(result.object_lifecycle_validity).toBe(1.0);
  });

  // ── Test 4: Object lifecycle violation ────────────────────────────────────────
  it('T4: Receipt used before emit_receipt → AndonPull(ObjectLifecycleViolation)', () => {
    // Receipt-1 appears first in "approve", but emit_receipt comes AFTER
    // → first activity touching Receipt is "approve", not "emit_receipt"
    const ocel = makeOcel([
      { activity: 'validate',    objects: [{ id: 'case-1', type: 'Case' }] },
      { activity: 'approve',     objects: [{ id: 'receipt-1', type: 'Receipt' }] },
      { activity: 'emit_receipt', objects: [{ id: 'receipt-1', type: 'Receipt' }] },
      { activity: 'complete',    objects: [{ id: 'case-1', type: 'Case' }] },
    ]);

    const model = makeModel({
      route_id: 'lifecycle-violation-check',
      required_stages: ['validate', 'approve', 'emit_receipt', 'complete'],
      object_types: {
        Receipt: { created_by: ['emit_receipt'] },
        Case:    { created_by: ['validate'] },
      },
      model: {
        type: 'sequence',
        sequence: ['validate', 'approve', 'emit_receipt', 'complete'],
      },
    });

    const result = checkPowl2Conformance(ocel, model);

    expect(result.verdict).toBe('AndonPull');
    expect(result.andon_reason).toBe('ObjectLifecycleViolation');

    // ANTI-STUB: lifecycle detail must explicitly flag the violation
    const lcDim = result.details.find((d) => d.dimension === 'object_lifecycle_validity');
    expect(lcDim).toBeDefined();
    expect(lcDim!.ok).toBe(false);
    expect(lcDim!.detail).toMatch(/violation/i);
  });

  // ── Test 5: Partial order violation ──────────────────────────────────────────
  it('T5: B-then-A in log when model requires B-before-A, but A appears first → AndonPull(PartialOrderViolation)', () => {
    // Verdict priority: fitnessOk, stagesOk, seqOk must ALL pass before poOk is evaluated.
    //
    // Design:
    //   Model nodes = ['A','B'], sequence path = ['A','B'].
    //   Observed log = ['A','B','A']:
    //     - Fitness: all 3 events use admissible activities (A or B) → 3/3 = 1.0  ✓
    //     - Sequence: subsequence search for path ['A','B'] in ['A','B','A']:
    //         'A'→pi=1, 'B'→pi=2 (done) → routeValid=true  ✓
    //     - PO constraint: B must come before A (order=[['B','A']]).
    //         min(B positions)=1, min(A positions)=0.  1 >= 0 → VIOLATION  ✗
    //
    // All three Receipt objects are first referenced in 'A' (created_by=['A']).
    // Lifecycle valid. No required_stages missing.
    const ocel = makeOcel([
      { activity: 'A', objects: [{ id: 'obj-1', type: 'Work' }, { id: 'r-1', type: 'Receipt' }] },
      { activity: 'B', objects: [{ id: 'obj-1', type: 'Work' }, { id: 'r-1', type: 'Receipt' }] },
      { activity: 'A', objects: [{ id: 'obj-1', type: 'Work' }, { id: 'r-1', type: 'Receipt' }] },
    ]);

    const model = makeModel({
      route_id: 'partial-order-violation-check',
      // No required_stages so stagesOk=true trivially (requiredStages=[])
      object_types: {
        Work:    { created_by: ['A'] }, // obj-1 first in 'A' at index 0 → valid
        Receipt: { created_by: ['A'] }, // r-1 first in 'A' at index 0 → valid
      },
      model: {
        type: 'partial_order',
        partial_order: {
          nodes: ['A', 'B'],
          // B must precede A — but A appears first in the log → PO violation
          order: [['B', 'A']],
        },
      },
    });

    const result = checkPowl2Conformance(ocel, model);

    expect(result.verdict).toBe('AndonPull');
    expect(result.andon_reason).toBe('PartialOrderViolation');

    // ANTI-STUB: the partial_order_constraints detail must be present and failed
    const poDim = result.details.find((d) => d.dimension === 'partial_order_constraints');
    expect(poDim).toBeDefined();
    expect(poDim!.ok).toBe(false);
    // Fitness and stages must have passed (only PO failed)
    expect(result.fitness).toBe(1.0);
  });

});

// ─── §7.2 — Object Evidence Tests ─────────────────────────────────────────────

describe('§7.2 Object Evidence Tests', () => {

  // ── Test 6: Receipt coverage below threshold ──────────────────────────────────
  it('T6: low receipt coverage → AndonPull(InsufficientReceiptCoverage)', () => {
    // 3 unique activities, only 1 has a Receipt object → coverage = 1/3 < 1.0
    const ocel = makeOcel([
      { activity: 'start',    objects: [{ id: 'obj-1', type: 'Case' }] },
      { activity: 'process',  objects: [{ id: 'obj-1', type: 'Case' }] },
      { activity: 'finish',   objects: [{ id: 'obj-1', type: 'Case' }, { id: 'r-1', type: 'Receipt' }] },
    ]);

    const model = makeModel({
      route_id: 'receipt-coverage-low',
      receipt_required: true,
      required_stages: ['start', 'process', 'finish'],
      object_types: {
        Case:    { created_by: ['start'] },
        Receipt: { created_by: ['finish'] },
      },
      model: {
        type: 'sequence',
        sequence: ['start', 'process', 'finish'],
      },
    });

    const result = checkPowl2Conformance(ocel, model);

    expect(result.verdict).toBe('AndonPull');
    expect(result.andon_reason).toBe('InsufficientReceiptCoverage');

    // ANTI-STUB: receipt_coverage must reflect the measured fraction
    expect(result.receipt_coverage).toBeGreaterThan(0);
    expect(result.receipt_coverage).toBeLessThan(1.0);

    const rcDim = result.details.find((d) => d.dimension === 'receipt_coverage');
    expect(rcDim).toBeDefined();
    expect(rcDim!.ok).toBe(false);
  });

  // ── Test 7: Full receipt coverage → contributes to Accepted ──────────────────
  it('T7: full receipt coverage + valid lifecycle + required stages → Accepted', () => {
    // Every unique activity (issue, review, close) has at least one Receipt object.
    // Receipt lifecycle: all Receipt objects are first seen in "issue" (created_by).
    const ocel = makeOcel([
      { activity: 'issue',  objects: [{ id: 'case-1', type: 'Case' }, { id: 'r-1', type: 'Receipt' }] },
      { activity: 'review', objects: [{ id: 'case-1', type: 'Case' }, { id: 'r-2', type: 'Receipt' }] },
      { activity: 'close',  objects: [{ id: 'case-1', type: 'Case' }, { id: 'r-3', type: 'Receipt' }] },
    ]);

    const model = makeModel({
      route_id: 'full-receipt-coverage',
      receipt_required: true,
      required_stages: ['issue', 'review', 'close'],
      object_types: {
        Case:    { created_by: ['issue'] },
        Receipt: { created_by: ['issue', 'review', 'close'] },
      },
      model: {
        type: 'sequence',
        sequence: ['issue', 'review', 'close'],
      },
    });

    const result = checkPowl2Conformance(ocel, model);

    // FALSIFICATION guard: a stub returning AndonPull always would fail this
    expect(result.verdict).toBe('Accepted');
    expect(result.receipt_coverage).toBe(1.0);
    expect(result.object_lifecycle_validity).toBe(1.0);
    expect(result.required_stage_coverage).toBe(1.0);
    expect(result.fitness).toBe(1.0);
  });

});

// ─── §7.3 — Receipt Policy + Lifecycle Tests (V2) ─────────────────────────────

import { resolve } from 'node:path';

// projectDir for schema resolution — tests run from apps/wasm4pm; schemas live at <repo>/schemas/
const REPO_DIR = resolve(__dirname, '..', '..', '..', '..');

/**
 * Build an OcelLog where individual objects can carry attributes (needed for schema tests).
 */
function makeOcelWithAttrs(
  events: Array<{ activity: string; objects?: Array<{ id: string; type: string }> }>,
  objectAttrs: Record<string, Record<string, unknown>> = {},
): OcelLog {
  const ts = '2026-05-14T10:00:00.000Z';
  const objectSet = new Map<string, { id: string; type: string; attributes: Record<string, unknown> }>();

  const ocelEvents: OcelEvent[] = events.map((ev, i) => {
    const objs = ev.objects ?? [];
    for (const o of objs) {
      if (!objectSet.has(o.id)) {
        objectSet.set(o.id, { id: o.id, type: o.type, attributes: objectAttrs[o.id] ?? {} });
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

describe('§7.3 Receipt Policy + Lifecycle — V2 Tests', () => {

  // ── Test 8: Receipt schema violation → AndonPull(ReceiptSchemaViolation) ────
  it('T8: Receipt with malformed config_hash → AndonPull(ReceiptSchemaViolation)', () => {
    // proof-receipt schema requires config_hash to match ^[0-9a-f]{64}$
    // We inject an obviously bad value to provoke a schema violation.
    const ocel = makeOcelWithAttrs(
      [
        { activity: 'collect_evidence', objects: [{ id: 'evidence-1', type: 'Evidence' }] },
        { activity: 'verify_evidence',  objects: [{ id: 'evidence-1', type: 'Evidence' }] },
        { activity: 'emit_receipt',     objects: [{ id: 'r-1',        type: 'Receipt'  }] },
      ],
      {
        'r-1': {
          run_id: 'r1',
          config_hash: 'not-hex',    // ← schema violation
          input_hash: 'f'.repeat(64),
          plan_hash:  'f'.repeat(64),
          output_hash:'f'.repeat(64),
          status: 'success',
        },
      },
    );

    const model = makeModel({
      route_id: 't8-receipt-schema',
      receipt_required: true,
      required_stages: ['collect_evidence', 'verify_evidence', 'emit_receipt'],
      object_types: {
        Evidence: { created_by: ['collect_evidence'] },
        Receipt:  { created_by: ['emit_receipt'], schema: 'schemas/receipts/proof-receipt.schema.json' },
      },
      model: {
        type: 'sequence',
        sequence: ['collect_evidence', 'verify_evidence', 'emit_receipt'],
      },
    });

    const result = checkPowl2Conformance(ocel, model, REPO_DIR);

    expect(result.verdict).toBe('AndonPull');
    expect(result.andon_reason).toBe('ReceiptSchemaViolation');

    const rcDim = result.details.find((d) => d.dimension === 'receipt_coverage');
    expect(rcDim).toBeDefined();
    expect(rcDim!.ok).toBe(false);
    // Detail must specifically name the violating field path
    expect(rcDim!.detail).toMatch(/config_hash|schema/i);
  });

  // ── Test 9: Cardinality violation → AndonPull(CardinalityViolation) ─────────
  it('T9: 3 ProofPack objects exceed max_count=1 → AndonPull(CardinalityViolation)', () => {
    // Model declares ProofPack.max_count = 1, but 3 distinct ProofPack instances exist.
    const ocel = makeOcel([
      { activity: 'collect_evidence', objects: [{ id: 'pp-1', type: 'ProofPack' }] },
      { activity: 'collect_evidence', objects: [{ id: 'pp-2', type: 'ProofPack' }] },
      { activity: 'collect_evidence', objects: [{ id: 'pp-3', type: 'ProofPack' }] },
      { activity: 'verify_evidence',  objects: [{ id: 'pp-1', type: 'ProofPack' }] },
      { activity: 'emit_receipt',     objects: [{ id: 'r-1',  type: 'Receipt'   }] },
    ]);

    const model = makeModel({
      route_id: 't9-cardinality',
      receipt_required: true,
      required_stages: ['collect_evidence', 'verify_evidence', 'emit_receipt'],
      object_types: {
        ProofPack: { created_by: ['collect_evidence'], max_count: 1 },
        Receipt:   { created_by: ['emit_receipt'] },
      },
      model: {
        type: 'sequence',
        sequence: ['collect_evidence', 'verify_evidence', 'emit_receipt'],
      },
    });

    const result = checkPowl2Conformance(ocel, model);

    expect(result.verdict).toBe('AndonPull');
    expect(result.andon_reason).toBe('CardinalityViolation');

    const lcDim = result.details.find((d) => d.dimension === 'object_lifecycle_validity');
    expect(lcDim).toBeDefined();
    expect(lcDim!.ok).toBe(false);
    // Detail must specifically name the cardinality breach
    expect(lcDim!.detail).toMatch(/max_count|cardinality/i);
  });

  // ── Test 10: Lifecycle not terminated → AndonPull(LifecycleNotTerminated) ───
  it('T10: ProofPack created but never terminated → AndonPull(LifecycleNotTerminated)', () => {
    // Model declares ProofPack.terminated_by = ['emit_receipt'], but ProofPack
    // is last referenced in 'verify_evidence', not the declared terminate activity.
    const ocel = makeOcel([
      { activity: 'collect_evidence', objects: [{ id: 'pp-1', type: 'ProofPack' }] },
      { activity: 'verify_evidence',  objects: [{ id: 'pp-1', type: 'ProofPack' }] },
      { activity: 'emit_receipt',     objects: [{ id: 'r-1',  type: 'Receipt'   }] },  // pp-1 NOT re-referenced
    ]);

    const model = makeModel({
      route_id: 't10-not-terminated',
      receipt_required: true,
      required_stages: ['collect_evidence', 'verify_evidence', 'emit_receipt'],
      object_types: {
        ProofPack: { created_by: ['collect_evidence'], terminated_by: ['emit_receipt'] },
        Receipt:   { created_by: ['emit_receipt'] },
      },
      model: {
        type: 'sequence',
        sequence: ['collect_evidence', 'verify_evidence', 'emit_receipt'],
      },
    });

    const result = checkPowl2Conformance(ocel, model);

    expect(result.verdict).toBe('AndonPull');
    expect(result.andon_reason).toBe('LifecycleNotTerminated');

    const lcDim = result.details.find((d) => d.dimension === 'object_lifecycle_validity');
    expect(lcDim).toBeDefined();
    expect(lcDim!.ok).toBe(false);
    expect(lcDim!.detail).toMatch(/terminate|verify_evidence/i);
  });

});
