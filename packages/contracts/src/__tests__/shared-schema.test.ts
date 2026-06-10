/**
 * SharedReceiptV1 Schema Round-Trip Conformance Tests
 *
 * Validates the adapter layer between wasm4pm (Receipt) and mcpp
 * (AcceptedResponse) via the SharedReceiptV1 canonical format.
 *
 * Covers three type-drift risks:
 *   Risk 1 — OTel run ID attribute name (run.id vs mcpp.run_id)
 *   Risk 2 — Timing asymmetry (start_time+end_time vs started_at+duration_ms)
 *   Risk 3 — Hash scheme prefix (bare hex vs blake3: prefix in transport refs)
 */

import { describe, it, expect } from 'vitest';
import {
  toSharedReceipt,
  fromMcppResponse,
  type SharedReceiptV1,
} from '../shared-schema/adapter.js';
import { ReceiptBuilder } from '../receipt-builder.js';
import type { Receipt } from '../receipt.js';

// ── Fixtures ────────────────────────────────────────────────────────────────

const RUN_ID = '550e8400-e29b-41d4-a716-446655440000';
const HEX_64_A = 'a'.repeat(64);
const HEX_64_C = 'c'.repeat(64);
const HEX_64_D = 'd'.repeat(64);

/** Minimal valid wasm4pm Receipt built via ReceiptBuilder. */
function makeReceipt(): Receipt {
  return new ReceiptBuilder()
    .setRunId(RUN_ID)
    .setConfig({ algorithm: 'alpha-plus-plus', threshold: 0.8 })
    .setInput({ format: 'xes', traces: 42 })
    .setPlan({ steps: [{ type: 'discover' }] })
    .setOutput({ model: 'dfg', nodes: 5 })
    .setTiming('2026-05-16T10:00:00.000Z', '2026-05-16T10:00:05.000Z')
    .setStatus('success')
    .setSummary({ traces_processed: 42, objects_processed: 210, variants_discovered: 7 })
    .setAlgorithm({ name: 'alpha-plus-plus', version: '2.1.0' })
    .setModel({ nodes: 5, edges: 8 })
    .setTraceId('aabbccddeeff00112233445566778899')
    .build();
}

/**
 * Fixture mcpp AcceptedResponse (wire JSON).
 * Uses the nested shape expected by fromMcppResponse.
 */
const mcppResponse = {
  run_id: 'mcpp-run-001',
  verdict: 'admitted',
  timings: {
    started_at: '2026-05-16T10:00:00.000Z',
    duration_ms: 5000,
  },
  proof_pack: {
    uri: 'urn:mcpp:proof-pack:001',
    hash: 'blake3:' + HEX_64_A,
    size_bytes: 2048,
  },
  receipt: {
    uri: 'urn:mcpp:receipt:001',
    hash: 'blake3:' + HEX_64_D,
    chain_predecessor: 'genesis',
  },
  algorithm: { name: 'alpha-plus-plus', version: '2.1.0' },
};

// ── toSharedReceipt tests ────────────────────────────────────────────────────

describe('toSharedReceipt', () => {
  it('maps all required fields from Receipt to SharedReceiptV1', () => {
    const receipt = makeReceipt();
    const shared = toSharedReceipt(receipt);

    expect(shared.run_id).toBe(receipt.run_id);
    expect(shared.schema_version).toBe('shared/v1');
    expect(shared.start_time).toBe(receipt.start_time);
    expect(shared.end_time).toBe(receipt.end_time);
    expect(shared.duration_ms).toBe(receipt.duration_ms);
    expect(shared.status).toBe(receipt.status);
    expect(shared.hash_format).toBe('blake3-hex-64');
    expect(shared.hashes.config).toBe(receipt.config_hash);
    expect(shared.hashes.input).toBe(receipt.input_hash);
    expect(shared.hashes.plan).toBe(receipt.plan_hash);
    expect(shared.hashes.output).toBe(receipt.output_hash);
  });

  it('sets otel_run_id_attribute to "run.id"', () => {
    const shared = toSharedReceipt(makeReceipt());
    expect(shared.otel_run_id_attribute).toBe('run.id');
  });

  it('produces status "success" for a success receipt', () => {
    const shared = toSharedReceipt(makeReceipt());
    expect(shared.status).toBe('success');
  });

  it('sets hash_format sentinel to "blake3-hex-64"', () => {
    const shared = toSharedReceipt(makeReceipt());
    expect(shared.hash_format).toBe('blake3-hex-64');
  });

  it('sets source to "wasm4pm"', () => {
    const shared = toSharedReceipt(makeReceipt());
    expect(shared.source).toBe('wasm4pm');
  });

  it('run_id in SharedReceiptV1 matches source receipt.run_id', () => {
    const receipt = makeReceipt();
    const shared = toSharedReceipt(receipt);
    expect(shared.run_id).toBe(receipt.run_id);
    expect(shared.run_id).toBe(RUN_ID);
  });

  it('proof_pack hash is populated (uses output_hash as structural proxy)', () => {
    const receipt = makeReceipt();
    const shared = toSharedReceipt(receipt);
    // wasm4pm has no separate proof_pack; adapter uses output_hash as proxy
    expect(shared.hashes.proof_pack).toBe(receipt.output_hash);
    expect(shared.hashes.proof_pack).toMatch(/^[0-9a-f]{64}$/);
  });

  it('all hash values are bare 64-char hex (no blake3: prefix)', () => {
    const shared = toSharedReceipt(makeReceipt());
    for (const [key, value] of Object.entries(shared.hashes)) {
      expect(value, `hashes.${key} must be bare 64-char hex`).toMatch(/^[0-9a-f]{64}$/);
      expect(value, `hashes.${key} must not start with 'blake3:'`).not.toMatch(/^blake3:/);
    }
  });
});

// ── fromMcppResponse tests ───────────────────────────────────────────────────

describe('fromMcppResponse', () => {
  it('strips the "blake3:" prefix from hash fields', () => {
    const shared = fromMcppResponse(mcppResponse);
    // proof_pack.hash had prefix → should be bare hex
    expect(shared.hashes.proof_pack).toBe(HEX_64_A);
    expect(shared.hashes.proof_pack).toMatch(/^[0-9a-f]{64}$/);
    // receipt.hash had prefix → output hash should be bare hex
    expect(shared.hashes.output).toBe(HEX_64_D);
    expect(shared.hashes.output).toMatch(/^[0-9a-f]{64}$/);
  });

  it('derives end_time from started_at + duration_ms', () => {
    const shared = fromMcppResponse(mcppResponse);
    const expectedEnd = new Date(
      new Date('2026-05-16T10:00:00.000Z').getTime() + 5000
    ).toISOString();
    expect(shared.end_time).toBe(expectedEnd);
    expect(shared.start_time).toBe('2026-05-16T10:00:00.000Z');
    expect(shared.duration_ms).toBe(5000);
  });

  it('sets expected fields when given an mcpp-style response', () => {
    const shared = fromMcppResponse(mcppResponse);
    expect(shared.run_id).toBe('mcpp-run-001');
    expect(shared.schema_version).toBe('shared/v1');
    expect(shared.status).toBe('admitted');
    expect(shared.hash_format).toBe('blake3-hex-64');
    expect(shared.otel_run_id_attribute).toBe('mcpp.run_id');
    expect(shared.source).toBe('mcpp');
  });

  it('sets otel_run_id_attribute to "mcpp.run_id"', () => {
    const shared = fromMcppResponse(mcppResponse);
    expect(shared.otel_run_id_attribute).toBe('mcpp.run_id');
  });

  it('chain_predecessor "genesis" passes through unchanged', () => {
    const shared = fromMcppResponse(mcppResponse);
    expect(shared.chain_predecessor).toBe('genesis');
  });

  it('strips blake3: prefix from chain_predecessor when it is a hash ref', () => {
    const responseWithHashPredecessor = {
      ...mcppResponse,
      receipt: {
        ...mcppResponse.receipt,
        chain_predecessor: 'blake3:' + HEX_64_C,
      },
    };
    const shared = fromMcppResponse(responseWithHashPredecessor);
    expect(shared.chain_predecessor).toBe(HEX_64_C);
  });

  it('handles missing optional conformance field gracefully (no throw)', () => {
    // mcppResponse has no conformance field — should not throw
    expect(() => fromMcppResponse(mcppResponse)).not.toThrow();
    const shared = fromMcppResponse(mcppResponse);
    expect(shared.conformance).toBeUndefined();
  });

  it('includes conformance scores when present in response', () => {
    const responseWithConformance = {
      ...mcppResponse,
      conformance: {
        fitness: 0.92,
        precision: 0.87,
        lifecycle: 0.95,
        cardinality: 0.88,
        receipt: 1.0,
      },
    };
    const shared = fromMcppResponse(responseWithConformance);
    expect(shared.conformance).toBeDefined();
    expect(shared.conformance?.fitness).toBe(0.92);
    expect(shared.conformance?.precision).toBe(0.87);
    expect(shared.conformance?.lifecycle).toBe(0.95);
    expect(shared.conformance?.cardinality).toBe(0.88);
    expect(shared.conformance?.receipt).toBe(1.0);
  });

  it('handles missing optional fields gracefully with partial conformance (no throw)', () => {
    const responsePartialConformance = {
      ...mcppResponse,
      conformance: { fitness: 0.9 },
    };
    expect(() => fromMcppResponse(responsePartialConformance)).not.toThrow();
    const shared = fromMcppResponse(responsePartialConformance);
    expect(shared.conformance?.fitness).toBe(0.9);
    expect(shared.conformance?.precision).toBeUndefined();
  });
});

// ── Edge case tests ──────────────────────────────────────────────────────────

describe('SharedReceiptV1 edge cases', () => {
  it('toSharedReceipt: duration_ms matches end_time minus start_time', () => {
    const receipt = makeReceipt();
    const shared = toSharedReceipt(receipt);

    // The fixture uses start=10:00:00 and end=10:00:05 (5 000 ms apart).
    const derivedMs =
      new Date(shared.end_time).getTime() - new Date(shared.start_time).getTime();
    expect(shared.duration_ms).toBe(derivedMs);
    expect(shared.duration_ms).toBe(5000);
  });

  it('toSharedReceipt: all hash values have exactly 64 characters', () => {
    const shared = toSharedReceipt(makeReceipt());
    for (const [key, value] of Object.entries(shared.hashes)) {
      expect(value.length, `hashes.${key} must be exactly 64 chars`).toBe(64);
    }
  });

  it('fromMcppResponse: handles missing chain_predecessor gracefully', () => {
    const responseNoPredecessor = {
      ...mcppResponse,
      receipt: {
        uri: mcppResponse.receipt.uri,
        hash: mcppResponse.receipt.hash,
        // chain_predecessor intentionally omitted
      },
    };

    // Must not throw even though chain_predecessor is absent.
    expect(() => fromMcppResponse(responseNoPredecessor)).not.toThrow();
    const shared = fromMcppResponse(responseNoPredecessor);
    // The shared receipt should not have a chain_predecessor key set.
    expect(shared.chain_predecessor).toBeUndefined();
  });

  it('fromMcppResponse: duration_ms is always a positive number', () => {
    const responseShort = {
      ...mcppResponse,
      timings: {
        started_at: '2026-05-17T08:00:00.000Z',
        duration_ms: 1000,
      },
    };
    const shared = fromMcppResponse(responseShort);
    expect(shared.duration_ms).toBe(1000);
    expect(shared.duration_ms).toBeGreaterThan(0);
  });

  it('toSharedReceipt: source is always "wasm4pm" regardless of receipt content', () => {
    // Build a receipt with different run_id and status to confirm the invariant
    // holds regardless of what the input receipt contains.
    const altReceipt: Receipt = new ReceiptBuilder()
      .setRunId('ffffffff-ffff-4fff-bfff-ffffffffffff')
      .setConfig({ algorithm: 'inductive', threshold: 0.5 })
      .setInput({ format: 'csv', traces: 1 })
      .setPlan({ steps: [{ type: 'replay' }] })
      .setOutput({ model: 'bpmn', nodes: 1 })
      .setTiming('2026-01-01T00:00:00.000Z', '2026-01-01T00:00:01.000Z')
      .setStatus('failed')
      .setSummary({ traces_processed: 1, objects_processed: 1, variants_discovered: 1 })
      .setAlgorithm({ name: 'inductive', version: '1.0.0' })
      .setModel({ nodes: 1, edges: 0 })
      .setTraceId('aabbccddeeff00112233445566778899')
      .build();

    const shared = toSharedReceipt(altReceipt);
    expect(shared.source).toBe('wasm4pm');
  });

  it('fromMcppResponse: source is always "mcpp" regardless of response content', () => {
    // Build a response with different run_id and verdict to confirm the invariant.
    const altResponse = {
      ...mcppResponse,
      run_id: 'different-run-999',
      verdict: 'refused',
    };
    const shared = fromMcppResponse(altResponse);
    expect(shared.source).toBe('mcpp');
  });
});

// ── Round-trip tests ─────────────────────────────────────────────────────────

describe('SharedReceiptV1 round-trip', () => {
  it('toSharedReceipt output preserves all key fields through JSON serialization', () => {
    const receipt = makeReceipt();
    const shared = toSharedReceipt(receipt);

    // Simulate cross-boundary serialization (e.g., API transport)
    const serialized = JSON.parse(JSON.stringify(shared)) as SharedReceiptV1;

    expect(serialized.run_id).toBe(shared.run_id);
    expect(serialized.schema_version).toBe('shared/v1');
    expect(serialized.hash_format).toBe('blake3-hex-64');
    expect(serialized.otel_run_id_attribute).toBe('run.id');
    expect(serialized.hashes.config).toBe(shared.hashes.config);
    expect(serialized.hashes.input).toBe(shared.hashes.input);
    expect(serialized.hashes.plan).toBe(shared.hashes.plan);
    expect(serialized.hashes.output).toBe(shared.hashes.output);
    expect(serialized.hashes.proof_pack).toBe(shared.hashes.proof_pack);
    expect(serialized.status).toBe('success');
    expect(serialized.source).toBe('wasm4pm');
  });

  it('fromMcppResponse output preserves all key fields through JSON serialization', () => {
    const shared = fromMcppResponse(mcppResponse);

    const serialized = JSON.parse(JSON.stringify(shared)) as SharedReceiptV1;

    expect(serialized.run_id).toBe('mcpp-run-001');
    expect(serialized.schema_version).toBe('shared/v1');
    expect(serialized.hash_format).toBe('blake3-hex-64');
    expect(serialized.otel_run_id_attribute).toBe('mcpp.run_id');
    expect(serialized.hashes.proof_pack).toBe(HEX_64_A);
    expect(serialized.hashes.output).toBe(HEX_64_D);
    expect(serialized.chain_predecessor).toBe('genesis');
    expect(serialized.source).toBe('mcpp');
  });

  it('wasm4pm receipt → SharedReceiptV1 → all required JSON Schema fields present', () => {
    const shared = toSharedReceipt(makeReceipt());

    // These are the "required" fields from v1.json
    const requiredFields: (keyof SharedReceiptV1)[] = [
      'run_id',
      'schema_version',
      'start_time',
      'end_time',
      'duration_ms',
      'status',
      'hashes',
      'hash_format',
      'otel_run_id_attribute',
    ];

    for (const field of requiredFields) {
      expect(shared[field], `SharedReceiptV1 must have field "${field}"`).toBeDefined();
    }
  });

  it('mcpp response → SharedReceiptV1 → all required JSON Schema fields present', () => {
    const shared = fromMcppResponse(mcppResponse);

    const requiredFields: (keyof SharedReceiptV1)[] = [
      'run_id',
      'schema_version',
      'start_time',
      'end_time',
      'duration_ms',
      'status',
      'hashes',
      'hash_format',
      'otel_run_id_attribute',
    ];

    for (const field of requiredFields) {
      expect(shared[field], `SharedReceiptV1 must have field "${field}"`).toBeDefined();
    }
  });
});
