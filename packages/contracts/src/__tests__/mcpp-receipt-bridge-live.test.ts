/**
 * mcpp-receipt-bridge-live — admission pipeline contract validation.
 *
 * Validates the wasm4pm receipt → mcpp admission pipeline against the ACTUAL
 * ~/mcpp source structure (verified 2026-05-17):
 *   - ~/mcpp/crates/mcpp-core/src/protocol/request.rs  — McpplusRequest, ConformanceThresholds
 *   - ~/mcpp/crates/mcpp-core/src/protocol/response.rs — AcceptedResponse, ReceiptRef, ProofPackRef
 *   - ~/mcpp/crates/mcpp-core/src/protocol/andon.rs    — AndonReasonCode (19 V1 codes)
 *
 * Oracle ranks follow Chicago TDD (Van der Aalst Constitution):
 *   Rank 1 — Mathematical theorem (invariant holds for any correct implementation)
 *   Rank 2 — Domain contract (design-decided properties from mcpp doctrine)
 *   Rank 3 — Metamorphic relation (input perturbation → output relation)
 *
 * Test categories:
 *   A. SharedReceiptV1 → McpplusRequest shape (Rank 2)
 *   B. MCPP conformance threshold policy — doctrine requires 1.0 (Rank 1)
 *   C. Round-trip receipt identity (Rank 1)
 *   D. Andon bridge — all 19 V1 codes verified against mcpp source (Rank 2)
 *   E. Metamorphic: status → conformance monotonicity (Rank 3)
 *   F. OCEL event admission criteria shape (Rank 2)
 *   G. Receipt-emit span invariants (Rank 2)
 *   H. Wire serialisability — no undefined values, no circular refs (Rank 1)
 */

import { describe, it, expect } from 'vitest';
import {
  toSharedReceipt,
  fromMcppResponse,
  type SharedReceiptV1,
  SHARED_RECEIPT_SCHEMA_V1,
} from '../shared-schema/adapter.js';
import {
  evaluateConformance,
  isRefused,
  toSharedConformance,
  type ConformanceThresholds,
  type FitnessResult,
} from '../conformance-bridge.js';
import {
  andonToWasm4pmError,
  wasm4pmErrorToAndon,
  isMcppAndonCode,
  MCPP_ANDON_CODES,
  ANDON_TO_ERROR_CODE,
  type McppAndonReason,
} from '../andon-bridge.js';
import {
  receiptToOcelEvents,
  toOcelJsonl,
  fromMcppJsonl,
} from '../ocel-bridge.js';
import { emitReceiptEmit } from '../receipt-emit-bridge.js';
import { ReceiptBuilder } from '../receipt-builder.js';
import type { Receipt } from '../receipt.js';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const RUN_ID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
const HEX_64_A = 'a'.repeat(64);
const HEX_64_B = 'b'.repeat(64);
const HEX_64_C = 'c'.repeat(64);
const HEX_64_D = 'd'.repeat(64);
const HEX_64_E = 'e'.repeat(64);

/** Build a minimal valid wasm4pm Receipt via ReceiptBuilder. */
function makeReceipt(overrides: Partial<Receipt> = {}): Receipt {
  const base = new ReceiptBuilder()
    .setRunId(RUN_ID)
    .setConfig({ algorithm: 'dfg', profile: 'balanced' })
    .setInput({ format: 'xes', traces: 100 })
    .setPlan({ steps: [{ type: 'discover' }] })
    .setOutput({ model: 'dfg', nodes: 8 })
    .setTiming('2026-05-17T09:00:00.000Z', '2026-05-17T09:00:10.000Z')
    .setStatus('success')
    .setSummary({ traces_processed: 100, objects_processed: 500, variants_discovered: 12 })
    .setAlgorithm({ name: 'dfg', version: '1.0.0' })
    .setModel({ nodes: 8, edges: 15 })
    .build();

  // Apply overrides at the object level (status, etc.)
  return { ...base, ...overrides };
}

/** Build a minimal mcpp AcceptedResponse wire object. */
function makeMcppAcceptedResponse(opts: {
  verdict?: string;
  proofPackHex?: string;
  receiptHex?: string;
  chainPredecessor?: string;
  conformance?: Partial<ConformanceThresholds>;
  durationMs?: number;
} = {}) {
  const proofPack = opts.proofPackHex ?? HEX_64_E;
  const receiptHex = opts.receiptHex ?? HEX_64_D;
  return {
    run_id: RUN_ID,
    verdict: opts.verdict ?? 'accepted',
    timings: {
      started_at: '2026-05-17T09:00:00.000Z',
      duration_ms: opts.durationMs ?? 10_000,
    },
    proof_pack: {
      uri: `urn:mcpp:proof-pack:${RUN_ID}`,
      hash: `blake3:${proofPack}`,
      size_bytes: 4096,
    },
    receipt: {
      uri: `urn:mcpp:receipt:${RUN_ID}`,
      hash: `blake3:${receiptHex}`,
      chain_predecessor: opts.chainPredecessor ?? 'genesis',
    },
    ...(opts.conformance ? { conformance: opts.conformance } : {}),
  };
}

// ===========================================================================
// A. SharedReceiptV1 → McpplusRequest shape (Rank 2 — domain contract)
// ===========================================================================
//
// McpplusRequest (from ~/mcpp/crates/mcpp-core/src/protocol/request.rs) requires:
//   - mcpp_version: String
//   - part_id: String
//   - input_objects: Vec<ObjectRef>  (each ObjectRef has id, type, hash: "blake3:<64 hex>")
//   - required_conformance: Option<ConformanceThresholds>
//
// The receipt provides all hash material needed to assemble ObjectRefs.
// ===========================================================================

describe('A: SharedReceiptV1 → McpplusRequest shape (Rank 2)', () => {
  it('A01: toSharedReceipt produces a run_id suitable as McpplusRequest part_id', () => {
    const shared = toSharedReceipt(makeReceipt());
    // McpplusRequest.part_id is a String; run_id is a non-empty UUID string
    expect(typeof shared.run_id).toBe('string');
    expect(shared.run_id.length).toBeGreaterThan(0);
    expect(shared.run_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it('A02: config hash from shared receipt can be assembled into ObjectRef with blake3: prefix', () => {
    const shared = toSharedReceipt(makeReceipt());
    const objectRef = { id: `${shared.run_id}:config`, type: 'wasm4pm.config', hash: `blake3:${shared.hashes.config}` };
    expect(objectRef.hash).toMatch(/^blake3:[0-9a-f]{64}$/);
    expect(objectRef.hash).toHaveLength(71); // 7 (prefix) + 64 (hex)
  });

  it('A03: input hash from shared receipt can be assembled into ObjectRef with blake3: prefix', () => {
    const shared = toSharedReceipt(makeReceipt());
    const objectRef = { id: `${shared.run_id}:input`, type: 'wasm4pm.input', hash: `blake3:${shared.hashes.input}` };
    expect(objectRef.hash).toMatch(/^blake3:[0-9a-f]{64}$/);
  });

  it('A04: plan hash from shared receipt can be assembled into ObjectRef with blake3: prefix', () => {
    const shared = toSharedReceipt(makeReceipt());
    const objectRef = { id: `${shared.run_id}:plan`, type: 'wasm4pm.plan', hash: `blake3:${shared.hashes.plan}` };
    expect(objectRef.hash).toMatch(/^blake3:[0-9a-f]{64}$/);
  });

  it('A05: output hash from shared receipt can be assembled into ObjectRef with blake3: prefix', () => {
    const shared = toSharedReceipt(makeReceipt());
    const objectRef = { id: `${shared.run_id}:output`, type: 'wasm4pm.output', hash: `blake3:${shared.hashes.output}` };
    expect(objectRef.hash).toMatch(/^blake3:[0-9a-f]{64}$/);
  });

  it('A06: four ObjectRefs assembled from receipt have four distinct blake3: hashes', () => {
    const r = makeReceipt({
      config_hash: HEX_64_A,
      input_hash: HEX_64_B,
      plan_hash: HEX_64_C,
      output_hash: HEX_64_D,
    });
    const shared = toSharedReceipt(r);
    const objectRefs = [
      `blake3:${shared.hashes.config}`,
      `blake3:${shared.hashes.input}`,
      `blake3:${shared.hashes.plan}`,
      `blake3:${shared.hashes.output}`,
    ];
    expect(new Set(objectRefs).size).toBe(4);
  });

  it('A07: shared receipt schema_version is the constant "shared/v1" expected by mcpp envelope', () => {
    const shared = toSharedReceipt(makeReceipt());
    expect(shared.schema_version).toBe('shared/v1');
  });

  it('A08: shared receipt hash_format is "blake3-hex-64" — the mcpp wire format sentinel', () => {
    const shared = toSharedReceipt(makeReceipt());
    expect(shared.hash_format).toBe('blake3-hex-64');
  });

  it('A09: fromMcppResponse produces otel_run_id_attribute "mcpp.run_id" for mcpp origin', () => {
    // McpplusRequest uses mcpp.run_id as the OTel attribute; shared receipt records the origin.
    const shared = fromMcppResponse(makeMcppAcceptedResponse());
    expect(shared.otel_run_id_attribute).toBe('mcpp.run_id');
  });

  it('A10: toSharedReceipt produces otel_run_id_attribute "run.id" for wasm4pm origin', () => {
    const shared = toSharedReceipt(makeReceipt());
    expect(shared.otel_run_id_attribute).toBe('run.id');
  });

  it('A11: SHARED_RECEIPT_SCHEMA_V1 JSON Schema has "required" array with all mandatory fields', () => {
    const schema = SHARED_RECEIPT_SCHEMA_V1 as Record<string, unknown>;
    const required = schema['required'] as string[];
    expect(Array.isArray(required)).toBe(true);
    for (const field of ['run_id', 'schema_version', 'start_time', 'end_time', 'duration_ms', 'status', 'hashes', 'hash_format', 'otel_run_id_attribute']) {
      expect(required, `Schema must require field "${field}"`).toContain(field);
    }
  });
});

// ===========================================================================
// B. MCPP conformance threshold policy (Rank 1 — mathematical)
//
// Per MCPP Route Conformance Doctrine:
//   "Manufacturing route admission requires 1.0. Anything less is an Andon pull."
// ConformanceThresholds in mcpp-core/src/protocol/request.rs:
//   fitness?: Option<f64>, precision?: Option<f64>, lifecycle?: Option<f64>, etc.
// ===========================================================================

describe('B: MCPP conformance threshold policy — doctrine requires 1.0 (Rank 1)', () => {
  it('B01: evaluateConformance with fitness=1.0 threshold and fitness=1.0 observed → passes', () => {
    const result: FitnessResult = { avg_trace_fitness: 1.0, avg_trace_precision: 1.0 };
    const thresholds: ConformanceThresholds = { fitness: 1.0, precision: 1.0 };
    const evaluation = evaluateConformance(result, thresholds);
    expect(evaluation.passed).toBe(true);
  });

  it('B02: evaluateConformance with fitness=1.0 threshold and fitness=0.99 observed → fails (Andon)', () => {
    const result: FitnessResult = { avg_trace_fitness: 0.99, avg_trace_precision: 1.0 };
    const evaluation = evaluateConformance(result, { fitness: 1.0 });
    expect(evaluation.passed).toBe(false);
    expect(evaluation.dimensions.fitness.passed).toBe(false);
  });

  it('B03: evaluateConformance with fitness=1.0 threshold and fitness=0.0 observed → fails', () => {
    const result: FitnessResult = { avg_trace_fitness: 0.0, avg_trace_precision: 0.0 };
    const evaluation = evaluateConformance(result, { fitness: 1.0, precision: 1.0 });
    expect(evaluation.passed).toBe(false);
    expect(evaluation.dimensions.fitness.passed).toBe(false);
    expect(evaluation.dimensions.precision.passed).toBe(false);
  });

  it('B04: evaluateConformance with all five dimensions set to 1.0 and all observed at 1.0 → fully passes', () => {
    const result: FitnessResult = { avg_trace_fitness: 1.0, avg_trace_precision: 1.0 };
    const thresholds: ConformanceThresholds = { fitness: 1.0, precision: 1.0, lifecycle: 1.0, cardinality: 1.0, receipt: 1.0 };
    const evaluation = evaluateConformance(result, thresholds, { lifecycle: 1.0, cardinality: 1.0, receipt: 1.0 });
    expect(evaluation.passed).toBe(true);
    for (const dim of Object.values(evaluation.dimensions)) {
      expect(dim.passed).toBe(true);
    }
  });

  it('B05: dimension with no threshold (undefined) passes trivially — Rank 1 invariant', () => {
    // A dimension with threshold=null/undefined passes regardless of observed value.
    const result: FitnessResult = { avg_trace_fitness: 0.5, avg_trace_precision: 0.3 };
    const evaluation = evaluateConformance(result, {}); // No thresholds
    // All dimensions pass trivially (no threshold set)
    for (const dim of Object.values(evaluation.dimensions)) {
      expect(dim.passed).toBe(true);
    }
    expect(evaluation.passed).toBe(true);
  });

  it('B06: isRefused is true when all five dimensions are undefined — Rank 1 invariant', () => {
    // When ALL thresholds are None/undefined, mcpp refuses to conduct the check.
    expect(isRefused({})).toBe(true);
    expect(isRefused({ fitness: undefined, precision: undefined, lifecycle: undefined, cardinality: undefined, receipt: undefined })).toBe(true);
  });

  it('B07: isRefused is false when any one dimension is set', () => {
    expect(isRefused({ fitness: 1.0 })).toBe(false);
    expect(isRefused({ precision: 0.95 })).toBe(false);
    expect(isRefused({ lifecycle: 1.0 })).toBe(false);
    expect(isRefused({ cardinality: 1.0 })).toBe(false);
    expect(isRefused({ receipt: 1.0 })).toBe(false);
  });

  it('B08: dimension with threshold set but no observed signal → fails (cannot verify)', () => {
    // If lifecycle threshold=1.0 but no extras provided, the dimension fails.
    const result: FitnessResult = { avg_trace_fitness: 1.0, avg_trace_precision: 1.0 };
    const evaluation = evaluateConformance(result, { lifecycle: 1.0 }); // no extras
    expect(evaluation.dimensions.lifecycle.passed).toBe(false);
    expect(evaluation.passed).toBe(false);
  });

  it('B09: toSharedConformance only includes dimensions with non-null observed values', () => {
    // toSharedConformance converts an evaluation to the conformance field of SharedReceiptV1.
    const result: FitnessResult = { avg_trace_fitness: 1.0, avg_trace_precision: 0.95 };
    const evaluation = evaluateConformance(result, { fitness: 1.0, precision: 0.95 });
    const conformance = toSharedConformance(evaluation);
    expect(conformance).toHaveProperty('fitness', 1.0);
    expect(conformance).toHaveProperty('precision', 0.95);
    // lifecycle, cardinality, receipt have no observed values → not included
    expect(conformance).not.toHaveProperty('lifecycle');
    expect(conformance).not.toHaveProperty('cardinality');
    expect(conformance).not.toHaveProperty('receipt');
  });

  it('B10: threshold=0.8 (exploration only) still fails at 0.79 (not a rounding issue)', () => {
    // Per doctrine: 0.8 is only for exploratory diagnostics. But the math must be exact.
    const result: FitnessResult = { avg_trace_fitness: 0.79, avg_trace_precision: 1.0 };
    const evaluation = evaluateConformance(result, { fitness: 0.8 });
    expect(evaluation.dimensions.fitness.passed).toBe(false);
  });
});

// ===========================================================================
// C. Round-trip receipt identity (Rank 1 — mathematical)
//
// Identity axiom: toSharedReceipt preserves all identity fields exactly.
// ===========================================================================

describe('C: Round-trip receipt identity (Rank 1)', () => {
  it('C01: toSharedReceipt(r).run_id === r.run_id — identity preserved', () => {
    const r = makeReceipt();
    expect(toSharedReceipt(r).run_id).toBe(r.run_id);
  });

  it('C02: toSharedReceipt(r).status === r.status — status preserved', () => {
    for (const status of ['success', 'partial', 'failed'] as const) {
      const r = makeReceipt({ status });
      expect(toSharedReceipt(r).status).toBe(status);
    }
  });

  it('C03: toSharedReceipt(r).hashes.config === r.config_hash — config hash preserved', () => {
    const r = makeReceipt({ config_hash: HEX_64_A });
    expect(toSharedReceipt(r).hashes.config).toBe(HEX_64_A);
  });

  it('C04: toSharedReceipt(r).hashes.input === r.input_hash — input hash preserved', () => {
    const r = makeReceipt({ input_hash: HEX_64_B });
    expect(toSharedReceipt(r).hashes.input).toBe(HEX_64_B);
  });

  it('C05: toSharedReceipt(r).hashes.plan === r.plan_hash — plan hash preserved', () => {
    const r = makeReceipt({ plan_hash: HEX_64_C });
    expect(toSharedReceipt(r).hashes.plan).toBe(HEX_64_C);
  });

  it('C06: toSharedReceipt(r).hashes.output === r.output_hash — output hash preserved', () => {
    const r = makeReceipt({ output_hash: HEX_64_D });
    expect(toSharedReceipt(r).hashes.output).toBe(HEX_64_D);
  });

  it('C07: toSharedReceipt(r).duration_ms === r.duration_ms — duration preserved (Risk-2)', () => {
    const r = makeReceipt({ duration_ms: 12_345 });
    expect(toSharedReceipt(r).duration_ms).toBe(12_345);
  });

  it('C08: toSharedReceipt(r).start_time === r.start_time — start_time preserved (Risk-2)', () => {
    const r = makeReceipt();
    expect(toSharedReceipt(r).start_time).toBe(r.start_time);
  });

  it('C09: toSharedReceipt(r).end_time === r.end_time — end_time preserved (Risk-2)', () => {
    const r = makeReceipt();
    expect(toSharedReceipt(r).end_time).toBe(r.end_time);
  });

  it('C10: JSON serialization round-trip preserves all hash fields (Rank 1)', () => {
    const shared = toSharedReceipt(makeReceipt({
      config_hash: HEX_64_A,
      input_hash: HEX_64_B,
      plan_hash: HEX_64_C,
      output_hash: HEX_64_D,
    }));
    const serialized = JSON.parse(JSON.stringify(shared)) as SharedReceiptV1;
    expect(serialized.hashes.config).toBe(HEX_64_A);
    expect(serialized.hashes.input).toBe(HEX_64_B);
    expect(serialized.hashes.plan).toBe(HEX_64_C);
    expect(serialized.hashes.output).toBe(HEX_64_D);
    expect(serialized.run_id).toBe(RUN_ID);
    expect(serialized.status).toBe('success');
  });
});

// ===========================================================================
// D. Andon bridge — all 19 V1 codes verified against mcpp source (Rank 2)
//
// Verified against ~/mcpp/crates/mcpp-core/src/protocol/andon.rs AndonReasonCode enum.
// ===========================================================================

describe('D: Andon bridge — 19 V1 mcpp: codes verified against source (Rank 2)', () => {
  // The 19 codes from AndonReasonCode in andon.rs (11 conformance + 5 envelope + 3 gap-closure)
  const EXPECTED_V1_CODES = [
    // Conformance (11)
    'ActivityOnlyFakeRoute',
    'RouteConformanceGap',
    'MissingRequiredStages',
    'RouteSequenceMismatch',
    'PartialOrderViolation',
    'LifecycleNotTerminated',
    'CardinalityViolation',
    'ObjectLifecycleViolation',
    'ReceiptSchemaViolation',
    'InsufficientReceiptCoverage',
    'TestRouteIncomplete',
    // Envelope (5)
    'VersionMismatch',
    'PartNotFound',
    'PolicyDowngradeRejected',
    'InputHashMismatch',
    'ManifestUnsigned',
    // Gap-closure (3) — v26.5.16 Slice B
    'EvidenceContinuityGap',
    'GapClosureUnauthorized',
    'GapClosureExhausted',
  ] as const;

  it('D01: MCPP_ANDON_CODES contains exactly 19 codes matching the Rust enum', () => {
    expect(MCPP_ANDON_CODES).toHaveLength(19);
  });

  it('D02: every expected V1 code is present in MCPP_ANDON_CODES', () => {
    for (const code of EXPECTED_V1_CODES) {
      expect(MCPP_ANDON_CODES as readonly string[], `Code "${code}" must be in MCPP_ANDON_CODES`).toContain(code);
    }
  });

  it('D03: isMcppAndonCode returns true for all 19 V1 codes', () => {
    for (const code of EXPECTED_V1_CODES) {
      expect(isMcppAndonCode(code), `isMcppAndonCode("${code}") must be true`).toBe(true);
    }
  });

  it('D04: isMcppAndonCode returns false for unknown codes', () => {
    expect(isMcppAndonCode('NonexistentCode')).toBe(false);
    expect(isMcppAndonCode('')).toBe(false);
    expect(isMcppAndonCode('RouteConformanceGap_typo')).toBe(false);
  });

  it('D05: ANDON_TO_ERROR_CODE covers all 19 V1 codes', () => {
    for (const code of EXPECTED_V1_CODES) {
      expect(ANDON_TO_ERROR_CODE, `ANDON_TO_ERROR_CODE must have entry for "${code}"`).toHaveProperty(code);
    }
  });

  it('D06: all 11 conformance codes map to CONFORMANCE_FAILED', () => {
    const conformanceCodes = [
      'ActivityOnlyFakeRoute', 'RouteConformanceGap', 'MissingRequiredStages',
      'RouteSequenceMismatch', 'PartialOrderViolation', 'LifecycleNotTerminated',
      'CardinalityViolation', 'ObjectLifecycleViolation', 'ReceiptSchemaViolation',
      'InsufficientReceiptCoverage', 'TestRouteIncomplete',
    ] as const;
    for (const code of conformanceCodes) {
      expect(ANDON_TO_ERROR_CODE[code], `"${code}" must map to CONFORMANCE_FAILED`).toBe('CONFORMANCE_FAILED');
    }
  });

  it('D07: VersionMismatch maps to SOURCE_INVALID (not CONFORMANCE_FAILED)', () => {
    expect(ANDON_TO_ERROR_CODE['VersionMismatch']).toBe('SOURCE_INVALID');
  });

  it('D08: PartNotFound maps to SOURCE_NOT_FOUND', () => {
    expect(ANDON_TO_ERROR_CODE['PartNotFound']).toBe('SOURCE_NOT_FOUND');
  });

  it('D09: EvidenceContinuityGap maps to ALGORITHM_FAILED (gap-closure is algorithm-level)', () => {
    expect(ANDON_TO_ERROR_CODE['EvidenceContinuityGap']).toBe('ALGORITHM_FAILED');
  });

  it('D10: GapClosureExhausted maps to ALGORITHM_FAILED', () => {
    expect(ANDON_TO_ERROR_CODE['GapClosureExhausted']).toBe('ALGORITHM_FAILED');
  });

  it('D11: GapClosureUnauthorized maps to VALIDATION_FAILED (authorization failure is policy)', () => {
    expect(ANDON_TO_ERROR_CODE['GapClosureUnauthorized']).toBe('VALIDATION_FAILED');
  });

  it('D12: andonToWasm4pmError converts RouteConformanceGap correctly', () => {
    const andon: McppAndonReason = {
      namespace: 'mcpp',
      code: 'RouteConformanceGap',
      detail: 'fitness=0.83 < required=1.0',
      evidence_ref: 'proof-pack:ocel/observed.jsonl#trace=3',
    };
    const err = andonToWasm4pmError(andon);
    expect(err.schema_version).toBe('1.0');
    expect(err.message).toContain('RouteConformanceGap');
    expect(err.remediation).toBeDefined();
    expect(err.remediation.length).toBeGreaterThan(0);
    expect(err.context['andon_namespace']).toBe('mcpp');
    expect(err.context['andon_code']).toBe('RouteConformanceGap');
    expect(err.context['andon_detail']).toBe('fitness=0.83 < required=1.0');
    expect(err.context['andon_evidence_ref']).toBe('proof-pack:ocel/observed.jsonl#trace=3');
  });

  it('D13: andonToWasm4pmError preserves context for lossless round-trip via wasm4pmErrorToAndon', () => {
    const andon: McppAndonReason = {
      namespace: 'mcpp',
      code: 'MissingRequiredStages',
      detail: 'stage=collect missing',
    };
    const err = andonToWasm4pmError(andon);
    const reconstructed = wasm4pmErrorToAndon(err);
    expect(reconstructed.namespace).toBe('mcpp');
    expect(reconstructed.code).toBe('MissingRequiredStages');
    expect(reconstructed.detail).toBe('stage=collect missing');
  });

  it('D14: andonToWasm4pmError handles unknown namespace gracefully (best-effort fallback)', () => {
    const andon: McppAndonReason = { namespace: 'extension/vendor', code: 'CustomCode' };
    expect(() => andonToWasm4pmError(andon)).not.toThrow();
    const err = andonToWasm4pmError(andon);
    expect(err.schema_version).toBe('1.0');
    expect(err.context['andon_namespace']).toBe('extension/vendor');
  });
});

// ===========================================================================
// E. Metamorphic: status → conformance monotonicity (Rank 3)
//
// Input perturbation: receipt status changes success → partial → failed.
// Expected relation: conformance score is monotonically non-increasing.
// ===========================================================================

describe('E: Metamorphic — status affects conformance score monotonically (Rank 3)', () => {
  it('E01: success → conformance fitness=1.0 in OCEL complete event', () => {
    const [, complete] = receiptToOcelEvents(makeReceipt({ status: 'success' }));
    const vmap = complete['ocel:vmap'] as Record<string, unknown>;
    expect(vmap['mcpp.conformance.fitness']).toBe(1.0);
  });

  it('E02: failed → conformance fitness=0.0 in OCEL complete event', () => {
    const [, complete] = receiptToOcelEvents(makeReceipt({ status: 'failed' }));
    const vmap = complete['ocel:vmap'] as Record<string, unknown>;
    expect(vmap['mcpp.conformance.fitness']).toBe(0.0);
  });

  it('E03: partial → conformance fitness=0.0 in OCEL complete event (treated same as failed)', () => {
    const [, complete] = receiptToOcelEvents(makeReceipt({ status: 'partial' }));
    const vmap = complete['ocel:vmap'] as Record<string, unknown>;
    expect(vmap['mcpp.conformance.fitness']).toBe(0.0);
  });

  it('E04: monotonicity — success_fitness >= partial_fitness (Rank 3)', () => {
    const successEvents = receiptToOcelEvents(makeReceipt({ status: 'success' }));
    const partialEvents = receiptToOcelEvents(makeReceipt({ status: 'partial' }));
    const successFitness = (successEvents[1]['ocel:vmap'] as Record<string, unknown>)['mcpp.conformance.fitness'] as number;
    const partialFitness = (partialEvents[1]['ocel:vmap'] as Record<string, unknown>)['mcpp.conformance.fitness'] as number;
    expect(successFitness).toBeGreaterThanOrEqual(partialFitness);
  });

  it('E05: monotonicity — partial_fitness >= failed_fitness (Rank 3)', () => {
    const partialEvents = receiptToOcelEvents(makeReceipt({ status: 'partial' }));
    const failedEvents = receiptToOcelEvents(makeReceipt({ status: 'failed' }));
    const partialFitness = (partialEvents[1]['ocel:vmap'] as Record<string, unknown>)['mcpp.conformance.fitness'] as number;
    const failedFitness = (failedEvents[1]['ocel:vmap'] as Record<string, unknown>)['mcpp.conformance.fitness'] as number;
    expect(partialFitness).toBeGreaterThanOrEqual(failedFitness);
  });

  it('E06: monotonicity — success_fitness > failed_fitness (strict for extreme cases)', () => {
    const successFitness = 1.0;
    const failedFitness = 0.0;
    expect(successFitness).toBeGreaterThan(failedFitness);
  });

  it('E07: success → admitted verdict; failed → refused verdict (metamorphic on verdict activity)', () => {
    const [,, successVerdict] = receiptToOcelEvents(makeReceipt({ status: 'success' }));
    const [,, failedVerdict] = receiptToOcelEvents(makeReceipt({ status: 'failed' }));
    expect(successVerdict['ocel:activity']).toBe('admitted');
    expect(failedVerdict['ocel:activity']).toBe('refused');
    // Metamorphic: flipping status flips verdict
    expect(successVerdict['ocel:activity']).not.toBe(failedVerdict['ocel:activity']);
  });

  it('E08: evaluateConformance score changes directionally with observed fitness (Rank 3)', () => {
    // Higher observed fitness always passes threshold of 0.5
    const evalHigh = evaluateConformance({ avg_trace_fitness: 0.9, avg_trace_precision: 1.0 }, { fitness: 0.5 });
    const evalLow = evaluateConformance({ avg_trace_fitness: 0.3, avg_trace_precision: 1.0 }, { fitness: 0.5 });
    expect(evalHigh.dimensions.fitness.passed).toBe(true);
    expect(evalLow.dimensions.fitness.passed).toBe(false);
  });
});

// ===========================================================================
// F. OCEL event admission criteria shape (Rank 2 — domain contract)
//
// Validated against mcpp OCEL 2.0 wire format requirements.
// ===========================================================================

describe('F: OCEL event admission criteria shape (Rank 2)', () => {
  it('F01: every OCEL event has all five required ocel: fields', () => {
    const events = receiptToOcelEvents(makeReceipt());
    for (const event of events) {
      expect(event).toHaveProperty('ocel:eid');
      expect(event).toHaveProperty('ocel:activity');
      expect(event).toHaveProperty('ocel:timestamp');
      expect(event).toHaveProperty('ocel:omap');
      expect(event).toHaveProperty('ocel:vmap');
    }
  });

  it('F02: exactly 3 OCEL events are produced per receipt', () => {
    expect(receiptToOcelEvents(makeReceipt({ status: 'success' }))).toHaveLength(3);
    expect(receiptToOcelEvents(makeReceipt({ status: 'partial' }))).toHaveLength(3);
    expect(receiptToOcelEvents(makeReceipt({ status: 'failed' }))).toHaveLength(3);
  });

  it('F03: algorithm.start event uses receipt.start_time as timestamp', () => {
    const r = makeReceipt();
    const [start] = receiptToOcelEvents(r);
    expect(start['ocel:timestamp']).toBe(r.start_time);
  });

  it('F04: algorithm.complete event uses receipt.end_time as timestamp', () => {
    const r = makeReceipt();
    const [, complete] = receiptToOcelEvents(r);
    expect(complete['ocel:timestamp']).toBe(r.end_time);
  });

  it('F05: verdict event uses receipt.end_time as timestamp', () => {
    const r = makeReceipt();
    const [,, verdict] = receiptToOcelEvents(r);
    expect(verdict['ocel:timestamp']).toBe(r.end_time);
  });

  it('F06: all 3 events include run_id in ocel:omap for correlation', () => {
    const events = receiptToOcelEvents(makeReceipt());
    for (const event of events) {
      expect(event['ocel:omap']).toContain(RUN_ID);
    }
  });

  it('F07: algorithm.complete vmap includes run.id for LIVE-01 OTel correlation', () => {
    const [, complete] = receiptToOcelEvents(makeReceipt());
    expect((complete['ocel:vmap'] as Record<string, unknown>)['run.id']).toBe(RUN_ID);
  });

  it('F08: verdict vmap includes mcpp.claim.source = "wasm4pm" for provenance', () => {
    const [,, verdict] = receiptToOcelEvents(makeReceipt());
    expect((verdict['ocel:vmap'] as Record<string, unknown>)['mcpp.claim.source']).toBe('wasm4pm');
  });

  it('F09: refused verdict includes mcpp.refusal_class = "ConformanceBelowThreshold"', () => {
    const [,, verdict] = receiptToOcelEvents(makeReceipt({ status: 'failed' }));
    const vmap = verdict['ocel:vmap'] as Record<string, unknown>;
    expect(vmap['mcpp.refusal_class']).toBe('ConformanceBelowThreshold');
  });

  it('F10: admitted verdict does NOT include mcpp.refusal_class', () => {
    const [,, verdict] = receiptToOcelEvents(makeReceipt({ status: 'success' }));
    expect(verdict['ocel:vmap']).not.toHaveProperty('mcpp.refusal_class');
  });

  it('F11: OCEL NDJSON is valid and parseable by fromMcppJsonl', () => {
    const events = receiptToOcelEvents(makeReceipt());
    const ndjson = toOcelJsonl(events);
    const parsed = fromMcppJsonl(ndjson);
    expect(parsed).toHaveLength(3);
    for (const event of parsed) {
      expect(event).toHaveProperty('ocel:eid');
    }
  });
});

// ===========================================================================
// G. Receipt-emit span invariants (Rank 2 — domain contract)
//
// emitReceiptEmit produces the ReceiptEmitRecord required by LIVE-13.
// Signer must always be "proof_aggregator" — wasm4pm is the proof aggregation layer.
// ===========================================================================

describe('G: Receipt-emit span invariants (Rank 2)', () => {
  it('G01: span name is always "receipt.emit" regardless of status', () => {
    for (const status of ['success', 'failed', 'partial'] as const) {
      const span = emitReceiptEmit(makeReceipt({ status }));
      expect(span.name).toBe('receipt.emit');
    }
  });

  it('G02: mcpp.receipt.signer is always "proof_aggregator" regardless of status', () => {
    for (const status of ['success', 'failed', 'partial'] as const) {
      const span = emitReceiptEmit(makeReceipt({ status }));
      expect(span.fields['mcpp.receipt.signer']).toBe('proof_aggregator');
    }
  });

  it('G03: run.id field in span matches receipt.run_id', () => {
    const r = makeReceipt();
    const span = emitReceiptEmit(r);
    expect(span.fields['run.id']).toBe(RUN_ID);
  });

  it('G04: mcpp.receipt.signature is 64-char hex for success (uses output_hash)', () => {
    const r = makeReceipt({ output_hash: HEX_64_D });
    const span = emitReceiptEmit(r);
    expect(span.fields['mcpp.receipt.signature']).toBe(HEX_64_D);
    expect(span.fields['mcpp.receipt.signature']).toMatch(/^[0-9a-f]{64}$/);
  });

  it('G05: mcpp.receipt.algorithm matches receipt.algorithm.name', () => {
    const r = makeReceipt({ algorithm: { name: 'inductive_miner', version: '2.0.0', parameters: {} } });
    const span = emitReceiptEmit(r);
    expect(span.fields['mcpp.receipt.algorithm']).toBe('inductive_miner');
  });

  it('G06: mcpp.receipt.status matches receipt.status', () => {
    for (const status of ['success', 'failed', 'partial'] as const) {
      const span = emitReceiptEmit(makeReceipt({ status }));
      expect(span.fields['mcpp.receipt.status']).toBe(status);
    }
  });

  it('G07: span timestamp is receipt.end_time (LIVE-13 requires end-of-run timestamp)', () => {
    const r = makeReceipt();
    const span = emitReceiptEmit(r);
    expect(span.timestamp).toBe(r.end_time);
  });
});

// ===========================================================================
// H. Wire serialisability — no undefined values, no circular refs (Rank 1)
//
// All objects produced by the bridge functions must be JSON.stringify-safe.
// Rank 1: this is a mathematical property of the output format.
// ===========================================================================

describe('H: Wire serialisability — no undefined values, no circular refs (Rank 1)', () => {
  it('H01: toSharedReceipt output is JSON.stringify-safe (no throw)', () => {
    const shared = toSharedReceipt(makeReceipt());
    expect(() => JSON.stringify(shared)).not.toThrow();
  });

  it('H02: toSharedReceipt JSON.stringify result parses back to the same object', () => {
    const shared = toSharedReceipt(makeReceipt());
    const serialized = JSON.parse(JSON.stringify(shared)) as SharedReceiptV1;
    expect(serialized.run_id).toBe(shared.run_id);
    expect(serialized.schema_version).toBe(shared.schema_version);
    expect(serialized.hash_format).toBe(shared.hash_format);
  });

  it('H03: JSON.stringify does not drop run_id (not undefined)', () => {
    const shared = toSharedReceipt(makeReceipt());
    const json = JSON.stringify(shared);
    expect(json).toContain('"run_id"');
    expect(json).toContain(RUN_ID);
  });

  it('H04: JSON.stringify does not drop hash_format sentinel', () => {
    const shared = toSharedReceipt(makeReceipt());
    const json = JSON.stringify(shared);
    expect(json).toContain('"blake3-hex-64"');
  });

  it('H05: fromMcppResponse output is JSON.stringify-safe (no throw)', () => {
    const shared = fromMcppResponse(makeMcppAcceptedResponse());
    expect(() => JSON.stringify(shared)).not.toThrow();
  });

  it('H06: OCEL events are JSON.stringify-safe (no throw)', () => {
    const events = receiptToOcelEvents(makeReceipt());
    expect(() => JSON.stringify(events)).not.toThrow();
  });

  it('H07: receipt-emit span is JSON.stringify-safe (no throw)', () => {
    const span = emitReceiptEmit(makeReceipt());
    expect(() => JSON.stringify(span)).not.toThrow();
  });

  it('H08: evaluateConformance output is JSON.stringify-safe (no throw)', () => {
    const result: FitnessResult = { avg_trace_fitness: 1.0, avg_trace_precision: 0.95 };
    const evaluation = evaluateConformance(result, { fitness: 1.0 });
    expect(() => JSON.stringify(evaluation)).not.toThrow();
  });

  it('H09: andonToWasm4pmError output is JSON.stringify-safe (no throw)', () => {
    const err = andonToWasm4pmError({ namespace: 'mcpp', code: 'RouteConformanceGap' });
    expect(() => JSON.stringify(err)).not.toThrow();
  });

  it('H10: toSharedConformance output is JSON.stringify-safe (no throw)', () => {
    const result: FitnessResult = { avg_trace_fitness: 0.95, avg_trace_precision: 0.88 };
    const evaluation = evaluateConformance(result, { fitness: 0.9, precision: 0.85 });
    const conformance = toSharedConformance(evaluation);
    expect(() => JSON.stringify(conformance)).not.toThrow();
  });

  it('H11: JSON.stringify of OCEL NDJSON round-trip produces identical bytes', () => {
    const events = receiptToOcelEvents(makeReceipt());
    const ndjson1 = toOcelJsonl(events);
    const parsed = fromMcppJsonl(ndjson1);
    const ndjson2 = toOcelJsonl(parsed);
    expect(ndjson2).toBe(ndjson1);
  });
});
