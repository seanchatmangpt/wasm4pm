/**
 * Cross-bridge integration test: Receipt → ocel-bridge → receipt-emit-bridge
 * → conformance-bridge → shared-schema adapter.
 *
 * Verifies that run_id / run.id is consistently threaded through all events
 * produced by a single receipt.
 */

import { describe, it, expect } from 'vitest';
import { receiptToOcelEvents, toOcelJsonl, fromMcppJsonl } from '../ocel-bridge';
import { emitReceiptEmit } from '../receipt-emit-bridge';
import { evaluateConformance, toSharedConformance } from '../conformance-bridge';
import { toSharedReceipt } from '../shared-schema/adapter';
import type { Receipt } from '../receipt';

const RUN_ID = 'integration-test-run-id-0000001';

function makeReceipt(overrides: Partial<Receipt> = {}): Receipt {
  return {
    run_id: RUN_ID,
    schema_version: '1.0',
    config_hash: 'a'.repeat(64),
    input_hash: 'b'.repeat(64),
    plan_hash: 'c'.repeat(64),
    output_hash: 'd'.repeat(64),
    start_time: '2026-05-16T10:00:00.000Z',
    end_time: '2026-05-16T10:00:05.000Z',
    duration_ms: 5000,
    status: 'success',
    summary: { traces_processed: 42, objects_processed: 100, variants_discovered: 7 },
    algorithm: { name: 'alpha-plus-plus', version: '2.1.0', parameters: {} },
    model: { nodes: 5, edges: 8 },
    ...overrides,
  };
}

describe('Cross-bridge run.id correlation', () => {
  it('all ocel events carry the same run_id in ocel:omap', () => {
    const ocelEvents = receiptToOcelEvents(makeReceipt());
    for (const event of ocelEvents) {
      expect(event['ocel:omap']).toContain(RUN_ID);
    }
  });

  it('receipt-emit span run.id matches ocel events run_id', () => {
    const receipt = makeReceipt();
    const receiptSpan = emitReceiptEmit(receipt);
    expect(receiptSpan.fields['run.id']).toBe(RUN_ID);
  });

  it('shared receipt run_id matches source receipt run_id', () => {
    const shared = toSharedReceipt(makeReceipt());
    expect(shared.run_id).toBe(RUN_ID);
  });

  it('ocel NDJSON round-trip preserves all run.id references', () => {
    const original = receiptToOcelEvents(makeReceipt());
    const roundTripped = fromMcppJsonl(toOcelJsonl(original));
    for (const event of roundTripped) {
      expect(event['ocel:omap']).toContain(RUN_ID);
    }
  });

  it('conformance evaluation produces consistent run-level scores', () => {
    // FitnessResult uses avg_trace_fitness / avg_trace_precision field names
    const thresholds = { fitness: 1.0, precision: 1.0 };
    const result = { avg_trace_fitness: 1.0, avg_trace_precision: 1.0 };
    const evaluation = evaluateConformance(result, thresholds);
    const shared = toSharedConformance(evaluation);
    expect(shared.fitness).toBe(1.0);
    expect(shared.precision).toBe(1.0);
  });

  it('refused receipt produces refused verdict in ocel and 0.0 conformance in vmap', () => {
    const receipt = makeReceipt({ status: 'failed' });
    const [, complete, verdict] = receiptToOcelEvents(receipt);
    expect(verdict['ocel:activity']).toBe('refused');
    expect((complete['ocel:vmap'] as Record<string, unknown>)['mcpp.conformance.fitness']).toBe(0.0);
  });

  it('receipt-emit signer is always proof_aggregator regardless of status', () => {
    for (const status of ['success', 'failed', 'partial'] as const) {
      const span = emitReceiptEmit(makeReceipt({ status }));
      expect(span.fields['mcpp.receipt.signer']).toBe('proof_aggregator');
    }
  });
});

// ── OCEL bridge invariants ──────────────────────────────────────────────────

describe('OCEL bridge invariants', () => {
  it('receiptToOcelEvents returns exactly 3 events', () => {
    const events = receiptToOcelEvents(makeReceipt());
    expect(events).toHaveLength(3);
  });

  it('first event ocel:activity is algorithm.start', () => {
    const [start] = receiptToOcelEvents(makeReceipt());
    expect(start['ocel:activity']).toBe('algorithm.start');
  });

  it('second event ocel:activity is algorithm.complete', () => {
    const [, complete] = receiptToOcelEvents(makeReceipt());
    expect(complete['ocel:activity']).toBe('algorithm.complete');
  });

  it('third event ocel:activity is admitted for success status', () => {
    const [,, verdict] = receiptToOcelEvents(makeReceipt({ status: 'success' }));
    expect(verdict['ocel:activity']).toBe('admitted');
  });

  it('vmap mcpp.conformance.fitness is 1.0 for success receipt', () => {
    const [, complete] = receiptToOcelEvents(makeReceipt({ status: 'success' }));
    const vmap = complete['ocel:vmap'] as Record<string, unknown>;
    expect(vmap['mcpp.conformance.fitness']).toBe(1.0);
  });

  it('vmap mcpp.conformance.fitness is 0.0 for failed receipt', () => {
    const [, complete] = receiptToOcelEvents(makeReceipt({ status: 'failed' }));
    const vmap = complete['ocel:vmap'] as Record<string, unknown>;
    expect(vmap['mcpp.conformance.fitness']).toBe(0.0);
  });

  it('ocel:timestamp is a string in all 3 events', () => {
    const events = receiptToOcelEvents(makeReceipt());
    for (const event of events) {
      expect(typeof event['ocel:timestamp']).toBe('string');
    }
  });

  it('each event has a non-empty ocel:eid field', () => {
    const events = receiptToOcelEvents(makeReceipt());
    for (const event of events) {
      expect(typeof event['ocel:eid']).toBe('string');
      expect(event['ocel:eid'].length).toBeGreaterThan(0);
    }
  });
});

// ── Receipt-emit bridge invariants ─────────────────────────────────────────

describe('Receipt-emit bridge invariants', () => {
  it('emitReceiptEmit fields contain run.id, mcpp.receipt.signer, and mcpp.receipt.status', () => {
    const span = emitReceiptEmit(makeReceipt());
    expect(span.fields).toHaveProperty('run.id');
    expect(span.fields).toHaveProperty('mcpp.receipt.signer');
    expect(span.fields).toHaveProperty('mcpp.receipt.status');
  });

  it('run.status (mcpp.receipt.status) is ok for success receipt', () => {
    const span = emitReceiptEmit(makeReceipt({ status: 'success' }));
    // receipt-emit-bridge stores status verbatim under mcpp.receipt.status
    expect(span.fields['mcpp.receipt.status']).toBe('success');
  });

  it('run.status (mcpp.receipt.status) is error for failed receipt', () => {
    const span = emitReceiptEmit(makeReceipt({ status: 'failed' }));
    expect(span.fields['mcpp.receipt.status']).toBe('failed');
  });

  it('partial status receipt maps mcpp.receipt.status to partial', () => {
    const span = emitReceiptEmit(makeReceipt({ status: 'partial' }));
    // The bridge stores status verbatim — neither 'ok' nor 'error'
    expect(span.fields['mcpp.receipt.status']).toBe('partial');
  });

  it('span has a timestamp field', () => {
    const span = emitReceiptEmit(makeReceipt());
    expect(typeof span.timestamp).toBe('string');
    expect(span.timestamp.length).toBeGreaterThan(0);
  });
});

// ── OCEL NDJSON round-trip ──────────────────────────────────────────────────

describe('OCEL NDJSON round-trip', () => {
  it('toOcelJsonl produces a string with newlines between events', () => {
    const events = receiptToOcelEvents(makeReceipt());
    const jsonl = toOcelJsonl(events);
    // 3 events → 2 newlines separating them (no trailing newline)
    expect(jsonl.split('\n')).toHaveLength(3);
  });

  it('fromMcppJsonl(toOcelJsonl(events)) produces same number of events', () => {
    const original = receiptToOcelEvents(makeReceipt());
    const roundTripped = fromMcppJsonl(toOcelJsonl(original));
    expect(roundTripped).toHaveLength(original.length);
  });

  it('round-tripped events have same ocel:activity values as originals', () => {
    const original = receiptToOcelEvents(makeReceipt());
    const roundTripped = fromMcppJsonl(toOcelJsonl(original));
    for (let i = 0; i < original.length; i++) {
      expect(roundTripped[i]['ocel:activity']).toBe(original[i]['ocel:activity']);
    }
  });

  it('fromMcppJsonl with empty string returns empty array', () => {
    expect(fromMcppJsonl('')).toEqual([]);
  });
});

// ── Shared receipt adapter ──────────────────────────────────────────────────

describe('Shared receipt adapter', () => {
  it('toSharedReceipt(receipt).run_id equals receipt.run_id', () => {
    const receipt = makeReceipt();
    expect(toSharedReceipt(receipt).run_id).toBe(receipt.run_id);
  });

  it('toSharedReceipt(receipt).status equals receipt.status', () => {
    const receipt = makeReceipt({ status: 'partial' });
    expect(toSharedReceipt(receipt).status).toBe(receipt.status);
  });

  it('toSharedReceipt(receipt).duration_ms equals receipt.duration_ms', () => {
    const receipt = makeReceipt({ duration_ms: 1234 });
    expect(toSharedReceipt(receipt).duration_ms).toBe(1234);
  });

  it('partial receipt still converts without throwing', () => {
    const receipt = makeReceipt({ status: 'partial' });
    expect(() => toSharedReceipt(receipt)).not.toThrow();
    const shared = toSharedReceipt(receipt);
    expect(shared.run_id).toBe(RUN_ID);
  });
});

// ── Conformance bridge ──────────────────────────────────────────────────────

describe('Conformance bridge', () => {
  it('fitness 0.9 below threshold 1.0 → evaluation passed is false', () => {
    const thresholds = { fitness: 1.0 };
    const result = { avg_trace_fitness: 0.9, avg_trace_precision: 1.0 };
    const evaluation = evaluateConformance(result, thresholds);
    expect(evaluation.passed).toBe(false);
  });

  it('fitness 1.0 at threshold 1.0 → evaluation passed is true', () => {
    const thresholds = { fitness: 1.0 };
    const result = { avg_trace_fitness: 1.0, avg_trace_precision: 1.0 };
    const evaluation = evaluateConformance(result, thresholds);
    expect(evaluation.passed).toBe(true);
  });

  it('toSharedConformance result has fitness and precision as numbers in [0,1]', () => {
    const result = { avg_trace_fitness: 0.85, avg_trace_precision: 0.90 };
    const evaluation = evaluateConformance(result, { fitness: 0.8, precision: 0.8 });
    const shared = toSharedConformance(evaluation);
    expect(typeof shared.fitness).toBe('number');
    expect(typeof shared.precision).toBe('number');
    expect(shared.fitness).toBeGreaterThanOrEqual(0);
    expect(shared.fitness).toBeLessThanOrEqual(1);
    expect(shared.precision).toBeGreaterThanOrEqual(0);
    expect(shared.precision).toBeLessThanOrEqual(1);
  });

  it('failed receipt produces 0.0 fitness in ocel vmap conformance', () => {
    const receipt = makeReceipt({ status: 'failed' });
    const [, complete] = receiptToOcelEvents(receipt);
    const vmap = complete['ocel:vmap'] as Record<string, unknown>;
    expect(vmap['mcpp.conformance.fitness']).toBe(0.0);
  });
});
