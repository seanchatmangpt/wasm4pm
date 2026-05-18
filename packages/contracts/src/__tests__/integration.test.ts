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
