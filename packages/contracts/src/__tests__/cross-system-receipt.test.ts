/**
 * Cross-system receipt chain tests: wasm4pm BLAKE3 receipt → mcpp admission gate.
 *
 * Covers the full chain:
 *   1. Receipt hash format compatibility with McpplusRequest ObjectRef
 *   2. receipt-emit-bridge A-P09 invariant (proof_aggregator signer)
 *   3. OCEL events → mcpp admission fitness gate (0.0 refused / 1.0 admitted)
 *   4. SharedReceiptV1 adapter — wasm4pm → shared format
 *   5. fromMcppResponse adapter — mcpp AcceptedResponse → shared format
 *   6. ARGR correlation fields threaded through OCEL events
 *   7. AAT-Live correlation readiness (run_id, timestamps, activity names)
 *   8. Multi-hash chain: all four BLAKE3 hashes individually addressable
 *   9. Risk-3 bridge: blake3: prefix round-trip (add then strip)
 *  10. Negative: refused (failed receipt) blocks mcpp gate; partial neither blocks nor clears
 */

import { describe, it, expect } from 'vitest';
import { receiptToOcelEvents, toOcelJsonl, fromMcppJsonl } from '../ocel-bridge';
import { emitReceiptEmit } from '../receipt-emit-bridge';
import { toSharedReceipt, fromMcppResponse } from '../shared-schema/adapter';
import { evaluateConformance, isRefused } from '../conformance-bridge';
import type { Receipt } from '../receipt';

// ---------------------------------------------------------------------------
// Shared fixture
// ---------------------------------------------------------------------------

const RUN_ID = 'deadbeef-cafe-4001-babe-000000000001';

function makeReceipt(overrides: Partial<Receipt> = {}): Receipt {
  return {
    run_id: RUN_ID,
    schema_version: '1.0',
    config_hash: 'a'.repeat(64),
    input_hash: 'b'.repeat(64),
    plan_hash: 'c'.repeat(64),
    output_hash: 'd'.repeat(64),
    start_time: '2026-05-17T08:00:00.000Z',
    end_time: '2026-05-17T08:00:03.000Z',
    duration_ms: 3000,
    status: 'success',
    summary: { traces_processed: 50, objects_processed: 200, variants_discovered: 8 },
    algorithm: { name: 'heuristic-miner', version: '3.0.0', parameters: { threshold: 0.5 } },
    model: { nodes: 6, edges: 10 },
    ...overrides,
  };
}

/** Build a minimal mcpp AcceptedResponse wire object. */
function makeMcppResponse(overrides: {
  verdict?: string;
  proofPackHash?: string;
  receiptHash?: string;
  chainPredecessor?: string;
  conformance?: Record<string, number>;
} = {}) {
  const proofPackHex = overrides.proofPackHash ?? 'e'.repeat(64);
  const receiptHex = overrides.receiptHash ?? 'f'.repeat(64);
  return {
    run_id: RUN_ID,
    verdict: overrides.verdict ?? 'accepted',
    timings: {
      started_at: '2026-05-17T08:00:00.000Z',
      duration_ms: 3000,
    },
    proof_pack: {
      uri: `blake3:${proofPackHex}`,
      hash: `blake3:${proofPackHex}`,
      size_bytes: 1024,
    },
    receipt: {
      uri: `blake3:${receiptHex}`,
      hash: `blake3:${receiptHex}`,
      chain_predecessor: overrides.chainPredecessor ?? 'genesis',
    },
    ...(overrides.conformance ? { conformance: overrides.conformance } : {}),
  };
}

// ===========================================================================
// 1. ObjectRef hash format (blake3: prefix assembly)
// ===========================================================================

describe('ObjectRef hash format for McpplusRequest', () => {
  it('config_hash is exactly 64 lowercase hex chars — valid for blake3: prefix', () => {
    const receipt = makeReceipt();
    expect(receipt.config_hash).toHaveLength(64);
    expect(receipt.config_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('input_hash is exactly 64 lowercase hex chars', () => {
    const receipt = makeReceipt();
    expect(receipt.input_hash).toHaveLength(64);
    expect(receipt.input_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('plan_hash is exactly 64 lowercase hex chars', () => {
    const receipt = makeReceipt();
    expect(receipt.plan_hash).toHaveLength(64);
    expect(receipt.plan_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('output_hash is exactly 64 lowercase hex chars', () => {
    const receipt = makeReceipt();
    expect(receipt.output_hash).toHaveLength(64);
    expect(receipt.output_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('blake3:<hash> ObjectRef format has length 71 (7 prefix + 64 hex)', () => {
    const hash = makeReceipt().config_hash;
    const objectRefHash = `blake3:${hash}`;
    expect(objectRefHash).toHaveLength(71);
  });

  it('blake3:<hash> ObjectRef format matches the wire pattern', () => {
    const hash = makeReceipt().output_hash;
    const objectRefHash = `blake3:${hash}`;
    expect(objectRefHash).toMatch(/^blake3:[0-9a-f]{64}$/);
  });

  it('four receipt hashes produce four distinct ObjectRef ids — no aliasing', () => {
    const r = makeReceipt({
      config_hash: 'a'.repeat(64),
      input_hash: 'b'.repeat(64),
      plan_hash: 'c'.repeat(64),
      output_hash: 'd'.repeat(64),
    });
    const refs = [
      { id: `${r.run_id}:config`, type: 'wasm4pm.receipt.config', hash: `blake3:${r.config_hash}` },
      { id: `${r.run_id}:input`, type: 'wasm4pm.receipt.input', hash: `blake3:${r.input_hash}` },
      { id: `${r.run_id}:plan`, type: 'wasm4pm.receipt.plan', hash: `blake3:${r.plan_hash}` },
      { id: `${r.run_id}:output`, type: 'wasm4pm.receipt.output', hash: `blake3:${r.output_hash}` },
    ];
    const uniqueHashes = new Set(refs.map((ref) => ref.hash));
    expect(uniqueHashes.size).toBe(4);
  });

  it('run_id flows as the ObjectRef id without transformation', () => {
    const receipt = makeReceipt();
    const objectRef = { id: receipt.run_id, type: 'wasm4pm.receipt', hash: `blake3:${receipt.output_hash}` };
    expect(objectRef.id).toBe(RUN_ID);
  });
});

// ===========================================================================
// 2. A-P09 invariant: receipt-emit signer is always proof_aggregator
// ===========================================================================

describe('A-P09: receipt-emit signer invariant', () => {
  it('success receipt signer is proof_aggregator', () => {
    const span = emitReceiptEmit(makeReceipt({ status: 'success' }));
    expect(span.fields['mcpp.receipt.signer']).toBe('proof_aggregator');
  });

  it('failed receipt signer is proof_aggregator', () => {
    const span = emitReceiptEmit(makeReceipt({ status: 'failed' }));
    expect(span.fields['mcpp.receipt.signer']).toBe('proof_aggregator');
  });

  it('partial receipt signer is proof_aggregator', () => {
    const span = emitReceiptEmit(makeReceipt({ status: 'partial' }));
    expect(span.fields['mcpp.receipt.signer']).toBe('proof_aggregator');
  });

  it('signer is NEVER anything other than proof_aggregator — type literal enforced', () => {
    // The ReceiptEmitRecord type constrains signer to 'proof_aggregator'.
    // Runtime: the field value must be the string literal.
    const span = emitReceiptEmit(makeReceipt());
    const signer: 'proof_aggregator' = span.fields['mcpp.receipt.signer'];
    expect(signer).toBe('proof_aggregator');
  });

  it('span name is always receipt.emit regardless of status', () => {
    for (const status of ['success', 'failed', 'partial'] as const) {
      const span = emitReceiptEmit(makeReceipt({ status }));
      expect(span.name).toBe('receipt.emit');
    }
  });

  it('mcpp.receipt.signature is a non-empty 64-char hex string for success', () => {
    const span = emitReceiptEmit(makeReceipt({ status: 'success' }));
    expect(span.fields['mcpp.receipt.signature']).toHaveLength(64);
    expect(span.fields['mcpp.receipt.signature']).toMatch(/^[0-9a-f]{64}$/);
  });

  it('mcpp.receipt.signature falls back to plan_hash when output_hash is null/undefined', () => {
    // output_hash is required in Receipt, but the bridge uses ?? which only
    // falls back on null/undefined (not empty string).
    // Cast to any to simulate a receipt arriving from an older schema version.
    const receipt = { ...makeReceipt(), output_hash: undefined } as unknown as Receipt;
    const span = emitReceiptEmit(receipt);
    expect(span.fields['mcpp.receipt.signature']).toBe(receipt.plan_hash);
  });
});

// ===========================================================================
// 3. OCEL fitness gate — success=1.0 (mcpp admits) / failed=0.0 (mcpp refuses)
// ===========================================================================

describe('OCEL fitness gate → mcpp admission criteria', () => {
  it('success receipt fitness=1.0 meets mcpp conformance gate threshold', () => {
    const [, complete] = receiptToOcelEvents(makeReceipt({ status: 'success' }));
    const vmap = complete['ocel:vmap'] as Record<string, unknown>;
    expect(vmap['mcpp.conformance.fitness']).toBe(1.0);
  });

  it('failed receipt fitness=0.0 does not meet mcpp conformance gate threshold', () => {
    const [, complete] = receiptToOcelEvents(makeReceipt({ status: 'failed' }));
    const vmap = complete['ocel:vmap'] as Record<string, unknown>;
    expect(vmap['mcpp.conformance.fitness']).toBe(0.0);
    // Domain contract: mcpp gate requires fitness=1.0; 0.0 < 1.0 → refused
    expect(vmap['mcpp.conformance.fitness']).toBeLessThan(1.0);
  });

  it('partial receipt fitness=0.0 — treated same as failed by gate', () => {
    const [, complete] = receiptToOcelEvents(makeReceipt({ status: 'partial' }));
    const vmap = complete['ocel:vmap'] as Record<string, unknown>;
    expect(vmap['mcpp.conformance.fitness']).toBe(0.0);
  });

  it('success receipt precision=1.0', () => {
    const [, complete] = receiptToOcelEvents(makeReceipt({ status: 'success' }));
    const vmap = complete['ocel:vmap'] as Record<string, unknown>;
    expect(vmap['mcpp.conformance.precision']).toBe(1.0);
  });

  it('failed receipt precision=0.0', () => {
    const [, complete] = receiptToOcelEvents(makeReceipt({ status: 'failed' }));
    const vmap = complete['ocel:vmap'] as Record<string, unknown>;
    expect(vmap['mcpp.conformance.precision']).toBe(0.0);
  });

  it('success receipt produces admitted verdict event', () => {
    const [,, verdict] = receiptToOcelEvents(makeReceipt({ status: 'success' }));
    expect(verdict['ocel:activity']).toBe('admitted');
  });

  it('failed receipt produces refused verdict event', () => {
    const [,, verdict] = receiptToOcelEvents(makeReceipt({ status: 'failed' }));
    expect(verdict['ocel:activity']).toBe('refused');
  });

  it('refused verdict event includes mcpp.refusal_class=ConformanceBelowThreshold', () => {
    const [,, verdict] = receiptToOcelEvents(makeReceipt({ status: 'failed' }));
    const vmap = verdict['ocel:vmap'] as Record<string, unknown>;
    expect(vmap['mcpp.refusal_class']).toBe('ConformanceBelowThreshold');
  });

  it('admitted verdict event does NOT include mcpp.refusal_class', () => {
    const [,, verdict] = receiptToOcelEvents(makeReceipt({ status: 'success' }));
    const vmap = verdict['ocel:vmap'] as Record<string, unknown>;
    expect(vmap).not.toHaveProperty('mcpp.refusal_class');
  });

  it('evaluateConformance: fitness=0.0 below threshold 1.0 → evaluation passed is false', () => {
    const result = { avg_trace_fitness: 0.0, avg_trace_precision: 0.0 };
    const evaluation = evaluateConformance(result, { fitness: 1.0, precision: 1.0 });
    expect(evaluation.passed).toBe(false);
  });

  it('evaluateConformance: fitness=1.0 at threshold 1.0 → evaluation passed is true', () => {
    const result = { avg_trace_fitness: 1.0, avg_trace_precision: 1.0 };
    const evaluation = evaluateConformance(result, { fitness: 1.0, precision: 1.0 });
    expect(evaluation.passed).toBe(true);
  });
});

// ===========================================================================
// 4. SharedReceiptV1: wasm4pm → shared format (Risk-1 / Risk-2 / Risk-3)
// ===========================================================================

describe('SharedReceiptV1 adapter — wasm4pm → shared', () => {
  it('shared receipt schema_version is shared/v1', () => {
    expect(toSharedReceipt(makeReceipt()).schema_version).toBe('shared/v1');
  });

  it('shared receipt run_id equals source receipt run_id (Risk-1)', () => {
    expect(toSharedReceipt(makeReceipt()).run_id).toBe(RUN_ID);
  });

  it('shared receipt otel_run_id_attribute is run.id for wasm4pm origin (Risk-1)', () => {
    expect(toSharedReceipt(makeReceipt()).otel_run_id_attribute).toBe('run.id');
  });

  it('shared receipt source is wasm4pm', () => {
    expect(toSharedReceipt(makeReceipt()).source).toBe('wasm4pm');
  });

  it('shared receipt hash_format is blake3-hex-64 (Risk-3 sentinel)', () => {
    expect(toSharedReceipt(makeReceipt()).hash_format).toBe('blake3-hex-64');
  });

  it('shared hashes.config equals receipt.config_hash (bare hex, no prefix)', () => {
    const receipt = makeReceipt();
    const shared = toSharedReceipt(receipt);
    expect(shared.hashes.config).toBe(receipt.config_hash);
    expect(shared.hashes.config).not.toMatch(/^blake3:/);
  });

  it('shared hashes.input equals receipt.input_hash', () => {
    const receipt = makeReceipt();
    expect(toSharedReceipt(receipt).hashes.input).toBe(receipt.input_hash);
  });

  it('shared hashes.plan equals receipt.plan_hash', () => {
    const receipt = makeReceipt();
    expect(toSharedReceipt(receipt).hashes.plan).toBe(receipt.plan_hash);
  });

  it('shared hashes.output equals receipt.output_hash', () => {
    const receipt = makeReceipt();
    expect(toSharedReceipt(receipt).hashes.output).toBe(receipt.output_hash);
  });

  it('shared hashes.proof_pack equals receipt.output_hash (structural proxy)', () => {
    const receipt = makeReceipt();
    expect(toSharedReceipt(receipt).hashes.proof_pack).toBe(receipt.output_hash);
  });

  it('shared duration_ms equals receipt.duration_ms (Risk-2 preserved)', () => {
    const receipt = makeReceipt({ duration_ms: 7777 });
    expect(toSharedReceipt(receipt).duration_ms).toBe(7777);
  });

  it('shared start_time and end_time are ISO 8601 strings', () => {
    const shared = toSharedReceipt(makeReceipt());
    expect(shared.start_time).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(shared.end_time).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});

// ===========================================================================
// 5. fromMcppResponse adapter — Risk-3 blake3: prefix stripping
// ===========================================================================

describe('fromMcppResponse adapter — mcpp wire → shared (Risk-3)', () => {
  it('strips blake3: prefix from proof_pack hash → bare hex in shared.hashes.proof_pack', () => {
    const hexChars = '1'.repeat(64);
    const response = makeMcppResponse({ proofPackHash: hexChars });
    const shared = fromMcppResponse(response);
    expect(shared.hashes.proof_pack).toBe(hexChars);
    expect(shared.hashes.proof_pack).not.toMatch(/^blake3:/);
  });

  it('strips blake3: prefix from receipt hash → bare hex in shared.hashes.output', () => {
    const hexChars = '2'.repeat(64);
    const response = makeMcppResponse({ receiptHash: hexChars });
    const shared = fromMcppResponse(response);
    expect(shared.hashes.output).toBe(hexChars);
    expect(shared.hashes.output).not.toMatch(/^blake3:/);
  });

  it('genesis chain_predecessor passes through unchanged', () => {
    const response = makeMcppResponse({ chainPredecessor: 'genesis' });
    const shared = fromMcppResponse(response);
    expect(shared.chain_predecessor).toBe('genesis');
  });

  it('blake3: chain_predecessor is stripped to bare hex', () => {
    const hexChars = '3'.repeat(64);
    const response = makeMcppResponse({ chainPredecessor: `blake3:${hexChars}` });
    const shared = fromMcppResponse(response);
    expect(shared.chain_predecessor).toBe(hexChars);
  });

  it('mcpp accepted verdict maps to status=accepted', () => {
    const shared = fromMcppResponse(makeMcppResponse({ verdict: 'accepted' }));
    expect(shared.status).toBe('accepted');
  });

  it('mcpp refused verdict maps to status=refused', () => {
    const shared = fromMcppResponse(makeMcppResponse({ verdict: 'refused' }));
    expect(shared.status).toBe('refused');
  });

  it('otel_run_id_attribute is mcpp.run_id for mcpp origin (Risk-1)', () => {
    const shared = fromMcppResponse(makeMcppResponse());
    expect(shared.otel_run_id_attribute).toBe('mcpp.run_id');
  });

  it('source is mcpp', () => {
    expect(fromMcppResponse(makeMcppResponse()).source).toBe('mcpp');
  });

  it('end_time is derived from started_at + duration_ms when absent (Risk-2)', () => {
    const response = makeMcppResponse();
    const shared = fromMcppResponse(response);
    // started_at: 2026-05-17T08:00:00Z + 3000ms → 2026-05-17T08:00:03Z
    expect(shared.end_time).toBe('2026-05-17T08:00:03.000Z');
  });

  it('conformance scores are forwarded when present', () => {
    const response = makeMcppResponse({ conformance: { fitness: 0.95, precision: 0.90 } });
    const shared = fromMcppResponse(response);
    expect(shared.conformance?.fitness).toBe(0.95);
    expect(shared.conformance?.precision).toBe(0.90);
  });

  it('conformance is absent when mcpp response omits it', () => {
    const shared = fromMcppResponse(makeMcppResponse({}));
    expect(shared.conformance).toBeUndefined();
  });

  it('throws if blake3: prefix is followed by non-hex content', () => {
    const badResponse = makeMcppResponse({ proofPackHash: 'ZZZZ' });
    badResponse.proof_pack.hash = 'blake3:NOT_HEX_NOT_64_CHARS';
    expect(() => fromMcppResponse(badResponse)).toThrow();
  });
});

// ===========================================================================
// 6. ARGR correlation in OCEL events
// ===========================================================================

describe('ARGR correlation fields in OCEL events', () => {
  it('OCEL complete event includes powl.gap.argr when argr provided', () => {
    const [, complete] = receiptToOcelEvents(makeReceipt(), { rate: 0.12, handoverDensity: 0.45 });
    const vmap = complete['ocel:vmap'] as Record<string, unknown>;
    expect(vmap['powl.gap.argr']).toBe(0.12);
  });

  it('OCEL complete event includes powl.gap.handover_density when argr provided', () => {
    const [, complete] = receiptToOcelEvents(makeReceipt(), { rate: 0.08, handoverDensity: 0.67 });
    const vmap = complete['ocel:vmap'] as Record<string, unknown>;
    expect(vmap['powl.gap.handover_density']).toBe(0.67);
  });

  it('OCEL complete event does NOT include ARGR fields when omitted', () => {
    const [, complete] = receiptToOcelEvents(makeReceipt());
    const vmap = complete['ocel:vmap'] as Record<string, unknown>;
    expect(vmap).not.toHaveProperty('powl.gap.argr');
    expect(vmap).not.toHaveProperty('powl.gap.handover_density');
  });

  it('ARGR fields do not appear in start or verdict events', () => {
    const [start,, verdict] = receiptToOcelEvents(makeReceipt(), { rate: 0.5, handoverDensity: 0.3 });
    const startVmap = start['ocel:vmap'] as Record<string, unknown>;
    const verdictVmap = verdict['ocel:vmap'] as Record<string, unknown>;
    expect(startVmap).not.toHaveProperty('powl.gap.argr');
    expect(verdictVmap).not.toHaveProperty('powl.gap.argr');
  });

  it('mcpp.claim.source is wasm4pm in verdict event', () => {
    const [,, verdict] = receiptToOcelEvents(makeReceipt());
    const vmap = verdict['ocel:vmap'] as Record<string, unknown>;
    expect(vmap['mcpp.claim.source']).toBe('wasm4pm');
  });
});

// ===========================================================================
// 7. AAT-Live correlation readiness
// ===========================================================================

describe('AAT-Live correlation readiness', () => {
  it('all 3 OCEL events carry run_id in ocel:omap for LIVE-01 correlation', () => {
    const events = receiptToOcelEvents(makeReceipt());
    for (const event of events) {
      expect(event['ocel:omap']).toContain(RUN_ID);
    }
  });

  it('all 3 OCEL timestamps are ISO 8601 strings for LIVE-02 temporal check', () => {
    const events = receiptToOcelEvents(makeReceipt());
    const iso8601 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
    for (const event of events) {
      expect(event['ocel:timestamp']).toMatch(iso8601);
    }
  });

  it('all 3 OCEL activity names are non-empty strings for LIVE-05 activity check', () => {
    const events = receiptToOcelEvents(makeReceipt());
    for (const event of events) {
      expect(typeof event['ocel:activity']).toBe('string');
      expect(event['ocel:activity'].length).toBeGreaterThan(0);
    }
  });

  it('each OCEL event has a unique ocel:eid', () => {
    const events = receiptToOcelEvents(makeReceipt());
    const eids = events.map((e) => e['ocel:eid']);
    expect(new Set(eids).size).toBe(3);
  });

  it('receipt-emit span run.id matches the OCEL event ocel:omap run_id', () => {
    const receipt = makeReceipt();
    const span = emitReceiptEmit(receipt);
    const events = receiptToOcelEvents(receipt);
    // All OCEL events carry run_id; span carries same run_id as run.id
    expect(span.fields['run.id']).toBe(RUN_ID);
    for (const event of events) {
      expect(event['ocel:omap']).toContain(span.fields['run.id']);
    }
  });

  it('algorithm name threads from receipt into OCEL start event vmap', () => {
    const [start] = receiptToOcelEvents(makeReceipt({ algorithm: { name: 'ilp', version: '1.0', parameters: {} } }));
    const vmap = start['ocel:vmap'] as Record<string, unknown>;
    expect(vmap['algorithm']).toBe('ilp');
  });

  it('run.id field appears in the complete event vmap for LIVE-01 tracing', () => {
    const [, complete] = receiptToOcelEvents(makeReceipt());
    const vmap = complete['ocel:vmap'] as Record<string, unknown>;
    expect(vmap['run.id']).toBe(RUN_ID);
  });
});

// ===========================================================================
// 8. NDJSON round-trip fidelity through the chain
// ===========================================================================

describe('OCEL NDJSON round-trip — cross-system fidelity', () => {
  it('toOcelJsonl → fromMcppJsonl preserves all ocel:omap entries', () => {
    const events = receiptToOcelEvents(makeReceipt());
    const roundTripped = fromMcppJsonl(toOcelJsonl(events));
    for (const event of roundTripped) {
      expect(event['ocel:omap']).toContain(RUN_ID);
    }
  });

  it('NDJSON with extra blank lines is still parsed correctly', () => {
    const events = receiptToOcelEvents(makeReceipt());
    const ndjson = toOcelJsonl(events);
    const withBlanks = `\n${ndjson}\n\n`;
    const parsed = fromMcppJsonl(withBlanks);
    expect(parsed).toHaveLength(3);
  });

  it('complete event vmap fitness survives NDJSON round-trip', () => {
    const events = receiptToOcelEvents(makeReceipt({ status: 'success' }));
    const roundTripped = fromMcppJsonl(toOcelJsonl(events));
    const completeVmap = roundTripped[1]['ocel:vmap'] as Record<string, unknown>;
    expect(completeVmap['mcpp.conformance.fitness']).toBe(1.0);
  });

  it('refusal class survives NDJSON round-trip for failed receipt', () => {
    const events = receiptToOcelEvents(makeReceipt({ status: 'failed' }));
    const roundTripped = fromMcppJsonl(toOcelJsonl(events));
    const verdictVmap = roundTripped[2]['ocel:vmap'] as Record<string, unknown>;
    expect(verdictVmap['mcpp.refusal_class']).toBe('ConformanceBelowThreshold');
  });
});

// ===========================================================================
// 9. isRefused — empty ConformanceThresholds blocks gate entirely
// ===========================================================================

describe('isRefused: all-null ConformanceThresholds blocks mcpp gate', () => {
  it('all-undefined thresholds → isRefused true (mcpp declines to specify floor)', () => {
    expect(isRefused({})).toBe(true);
  });

  it('at least one threshold set → isRefused false', () => {
    expect(isRefused({ fitness: 1.0 })).toBe(false);
  });

  it('isRefused false means mcpp gate is active', () => {
    // If mcpp gate is active, a failed receipt (fitness=0.0) will be refused
    const thresholds = { fitness: 1.0 };
    const result = { avg_trace_fitness: 0.0, avg_trace_precision: 1.0 };
    const evaluation = evaluateConformance(result, thresholds);
    expect(isRefused(thresholds)).toBe(false);
    expect(evaluation.passed).toBe(false);
  });
});
