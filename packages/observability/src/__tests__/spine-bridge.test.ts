/**
 * Integration tests for spine-bridge.ts
 *
 * Verifies LIVE-01 spine span emission: exactly 5 events in the correct order,
 * with required fields present on all events and conformance dims on
 * proof.aggregate, and verdict on mcpp.verdict.emit.
 */

import { describe, it, expect } from 'vitest';
import {
  emitSpineRecord,
  emitAatRun,
  emitMcppVerdict,
  emitProofAggregate,
  emitActivityEnabled,
  emitErlangActorSpawn,
  computeSpawnLatencyMs,
  SpineTraceRecord,
} from '../spine-bridge';

// ─────────────────────────────────────────────────────────────────────────────
// Shared fixture
// ─────────────────────────────────────────────────────────────────────────────

const BASE_OPTS = {
  runId: 'test-run-abc-123',
  runType: 'conformance' as const,
  toolName: 'onto_validate',
  routeId: 'route-42',
  discoveryVariant: 'alpha-miner',
  fitness: 0.95,
  precision: 0.87,
  verdict: 'admitted' as const,
};

// ─────────────────────────────────────────────────────────────────────────────
// emitSpineRecord — all 5 LIVE-01 events
// ─────────────────────────────────────────────────────────────────────────────

describe('emitSpineRecord', () => {
  it('returns exactly 5 items', () => {
    const records = emitSpineRecord(BASE_OPTS);
    expect(records).toHaveLength(5);
  });

  it('first event name is aat.run', () => {
    const records = emitSpineRecord(BASE_OPTS);
    expect(records[0].name).toBe('aat.run');
  });

  it('second event name is mcp.tool_call', () => {
    const records = emitSpineRecord(BASE_OPTS);
    expect(records[1].name).toBe('mcp.tool_call');
  });

  it('third event name is powl.route.evaluate', () => {
    const records = emitSpineRecord(BASE_OPTS);
    expect(records[2].name).toBe('powl.route.evaluate');
  });

  it('fourth event name is proof.aggregate', () => {
    const records = emitSpineRecord(BASE_OPTS);
    expect(records[3].name).toBe('proof.aggregate');
  });

  it('fifth event name is mcpp.verdict.emit', () => {
    const records = emitSpineRecord(BASE_OPTS);
    expect(records[4].name).toBe('mcpp.verdict.emit');
  });

  it('all events have run.id in their fields', () => {
    const records = emitSpineRecord(BASE_OPTS);
    for (const rec of records) {
      expect(rec.fields['run.id']).toBe(BASE_OPTS.runId);
    }
  });

  it('proof.aggregate event has mcpp.conformance.fitness in fields', () => {
    const records = emitSpineRecord(BASE_OPTS);
    const proofAgg = records[3];
    expect(proofAgg.fields).toHaveProperty('mcpp.conformance.fitness');
    expect(proofAgg.fields['mcpp.conformance.fitness']).toBe(BASE_OPTS.fitness);
  });

  it('proof.aggregate event has mcpp.conformance.precision in fields', () => {
    const records = emitSpineRecord(BASE_OPTS);
    const proofAgg = records[3];
    expect(proofAgg.fields).toHaveProperty('mcpp.conformance.precision');
    expect(proofAgg.fields['mcpp.conformance.precision']).toBe(BASE_OPTS.precision);
  });

  it('mcpp.verdict.emit has mcpp.verdict: admitted for admitted runs', () => {
    const records = emitSpineRecord({ ...BASE_OPTS, verdict: 'admitted' });
    const verdict = records[4];
    expect(verdict.fields['mcpp.verdict']).toBe('admitted');
  });

  it('mcpp.verdict.emit has mcpp.verdict: refused for refused runs', () => {
    const records = emitSpineRecord({ ...BASE_OPTS, verdict: 'refused' });
    const verdict = records[4];
    expect(verdict.fields['mcpp.verdict']).toBe('refused');
  });

  it('all events have a non-empty ts_ns field', () => {
    const records = emitSpineRecord(BASE_OPTS);
    for (const rec of records) {
      expect(typeof rec.ts_ns).toBe('number');
      expect(rec.ts_ns).toBeGreaterThan(0);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// emitAatRun — single event
// ─────────────────────────────────────────────────────────────────────────────

describe('emitAatRun', () => {
  it('returns single event with name aat.run', () => {
    const rec = emitAatRun({ runId: 'run-001', runType: 'mining' });
    expect(rec.name).toBe('aat.run');
  });

  it('has a non-empty ts_ns field', () => {
    const rec = emitAatRun({ runId: 'run-001', runType: 'mining' });
    expect(typeof rec.ts_ns).toBe('number');
    expect(rec.ts_ns).toBeGreaterThan(0);
  });

  it('has run.id in fields', () => {
    const rec = emitAatRun({ runId: 'run-001', runType: 'mining' });
    expect(rec.fields['run.id']).toBe('run-001');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// emitProofAggregate — single event
// ─────────────────────────────────────────────────────────────────────────────

describe('emitProofAggregate', () => {
  it('returns event with name proof.aggregate', () => {
    const rec = emitProofAggregate({
      runId: 'run-002',
      fitness: 0.9,
      precision: 0.8,
      aggregatedAt: new Date().toISOString(),
    });
    expect(rec.name).toBe('proof.aggregate');
  });

  it('has a non-empty ts_ns field', () => {
    const rec = emitProofAggregate({
      runId: 'run-002',
      fitness: 0.9,
      precision: 0.8,
      aggregatedAt: new Date().toISOString(),
    });
    expect(typeof rec.ts_ns).toBe('number');
    expect(rec.ts_ns).toBeGreaterThan(0);
  });

  it('has run.id in fields', () => {
    const rec = emitProofAggregate({
      runId: 'run-002',
      fitness: 0.9,
      precision: 0.8,
      aggregatedAt: new Date().toISOString(),
    });
    expect(rec.fields['run.id']).toBe('run-002');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// emitActivityEnabled — LIVE-05 partial coverage
// ─────────────────────────────────────────────────────────────────────────────

describe('emitActivityEnabled', () => {
  it("returns event with name 'powl.activity.enabled'", () => {
    const rec = emitActivityEnabled({ runId: 'r1', activityId: 'a1', powlActivityId: 'p1', predecessorsSatisfied: true, objectsValid: true });
    expect(rec.name).toBe('powl.activity.enabled');
  });
  it('event has mcpp.activity.id in fields', () => {
    const rec = emitActivityEnabled({ runId: 'r1', activityId: 'act-A', powlActivityId: 'p1', predecessorsSatisfied: true, objectsValid: true });
    expect(rec.fields['mcpp.activity.id']).toBe('act-A');
  });
  it('predecessors_satisfied is boolean', () => {
    const rec = emitActivityEnabled({ runId: 'r1', activityId: 'a1', powlActivityId: 'p1', predecessorsSatisfied: false, objectsValid: false });
    expect(rec.fields['powl.activity.predecessors_satisfied']).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// emitErlangActorSpawn — LIVE-05 full coverage
// ─────────────────────────────────────────────────────────────────────────────

describe('emitErlangActorSpawn', () => {
  it("returns event with name 'erlang.actor.spawn'", () => {
    const rec = emitErlangActorSpawn({
      runId: 'run-spawn-1',
      activityId: 'act-B',
      powlActivityId: 'powl-B',
      predecessorsSatisfied: true,
      objectsValid: true,
    });
    expect(rec.name).toBe('erlang.actor.spawn');
  });

  it('has all four required LIVE-05 attributes in fields', () => {
    const rec = emitErlangActorSpawn({
      runId: 'run-spawn-2',
      activityId: 'act-C',
      powlActivityId: 'powl-C',
      predecessorsSatisfied: true,
      objectsValid: false,
    });
    expect(rec.fields['mcpp.activity.id']).toBe('act-C');
    expect(rec.fields['powl.activity.id']).toBe('powl-C');
    expect(rec.fields['powl.activity.predecessors_satisfied']).toBe(true);
    expect(rec.fields['powl.activity.objects_valid']).toBe(false);
  });

  it('uses tsNs override when provided', () => {
    const tsNs = Number(1_700_000_000n * 1_000_000_000n);
    const rec = emitErlangActorSpawn({
      runId: 'run-spawn-3',
      activityId: 'act-D',
      powlActivityId: 'powl-D',
      predecessorsSatisfied: false,
      objectsValid: true,
      tsNs,
    });
    expect(rec.ts_ns).toBe(tsNs);
  });

  it('falls back to Date.now-based ts_ns when tsNs is omitted', () => {
    const before = Number(BigInt(Date.now()) * 1_000_000n);
    const rec = emitErlangActorSpawn({
      runId: 'run-spawn-4',
      activityId: 'act-E',
      powlActivityId: 'powl-E',
      predecessorsSatisfied: true,
      objectsValid: true,
    });
    const after = Number(BigInt(Date.now()) * 1_000_000n);
    expect(rec.ts_ns).toBeGreaterThanOrEqual(before);
    expect(rec.ts_ns).toBeLessThanOrEqual(after);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// computeSpawnLatencyMs — LIVE-11 partial coverage
// ─────────────────────────────────────────────────────────────────────────────

describe('computeSpawnLatencyMs', () => {
  const makeRecord = (ts_ns: number | undefined): SpineTraceRecord => ({
    kind: 'event',
    name: 'test.span',
    fields: { 'run.id': 'run-live11', 'service.name': 'wasm4pm.spine' },
    ts_ns: ts_ns as number,
  });

  it('returns null when ts_ns is missing from the spawn record', () => {
    const spawnRec = { ...makeRecord(undefined), ts_ns: undefined as unknown as number };
    const routeRec = makeRecord(1_000_000_000);
    expect(computeSpawnLatencyMs(spawnRec, routeRec)).toBeNull();
  });

  it('returns null when ts_ns is missing from the route record', () => {
    const spawnRec = makeRecord(1_000_000_000);
    const routeRec = { ...makeRecord(undefined), ts_ns: undefined as unknown as number };
    expect(computeSpawnLatencyMs(spawnRec, routeRec)).toBeNull();
  });

  it('returns conforms: true when delta is ≤ 500ms', () => {
    // 200ms apart: 200 * 1_000_000 ns
    const spawnNs = 1_000_000_000_000;
    const routeNs = spawnNs + 200 * 1_000_000;
    const result = computeSpawnLatencyMs(makeRecord(spawnNs), makeRecord(routeNs));
    expect(result).not.toBeNull();
    expect(result!.deltaMs).toBeCloseTo(200);
    expect(result!.conforms).toBe(true);
  });

  it('returns conforms: false when delta is > 500ms', () => {
    // 750ms apart: 750 * 1_000_000 ns
    const spawnNs = 1_000_000_000_000;
    const routeNs = spawnNs + 750 * 1_000_000;
    const result = computeSpawnLatencyMs(makeRecord(spawnNs), makeRecord(routeNs));
    expect(result).not.toBeNull();
    expect(result!.deltaMs).toBeCloseTo(750);
    expect(result!.conforms).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// emitMcppVerdict — LIVE-14 partial coverage
// ─────────────────────────────────────────────────────────────────────────────

describe('emitMcppVerdict (LIVE-14 partial coverage)', () => {
  it('emitMcppVerdict with runtimeMode sets mcpp.runtime.mode field', () => {
    const rec = emitMcppVerdict({
      runId: 'run-live14-a',
      verdict: 'admitted',
      runtimeMode: 'ModeC_Distributed',
      actorRole: 'proof_aggregator',
      canEmitAccepted: false,
    });
    expect(rec.fields['mcpp.runtime.mode']).toBe('ModeC_Distributed');
  });

  it('emitMcppVerdict without runtimeMode omits mcpp.runtime.mode field', () => {
    const rec = emitMcppVerdict({
      runId: 'run-live14-b',
      verdict: 'admitted',
    });
    expect(rec.fields).not.toHaveProperty('mcpp.runtime.mode');
  });

  it('emitMcppVerdict always has mcpp.actor.role and mcpp.actor.can_emit_accepted when provided', () => {
    const rec = emitMcppVerdict({
      runId: 'run-live14-c',
      verdict: 'admitted',
      runtimeMode: 'ModeC_Distributed',
      actorRole: 'proof_aggregator',
      canEmitAccepted: false,
    });
    expect(rec.fields['mcpp.actor.role']).toBe('proof_aggregator');
    expect(rec.fields['mcpp.actor.can_emit_accepted']).toBe(false);
  });
});
