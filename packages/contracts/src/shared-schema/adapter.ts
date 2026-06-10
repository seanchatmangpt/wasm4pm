/**
 * Shared Receipt Schema V1 — adapter utilities.
 *
 * Resolves three type-drift risks between wasm4pm and mcpp:
 *   Risk 1: Run ID OTel attribute name (run.id vs mcpp.run_id)
 *   Risk 2: Timing asymmetry (start_time+end_time vs started_at+duration_ms)
 *   Risk 3: Hash scheme prefix (bare hex vs blake3: prefix in transport refs)
 */

import { z } from 'zod';
import SCHEMA_JSON from './v1.json' with { type: 'json' };
import type { Receipt } from '../receipt.js';

// ── Schema re-export ─────────────────────────────────────────────────────────

/**
 * The raw JSON Schema object for SharedReceiptV1.
 * Import this for AJV or any other JSON Schema validator.
 */
export const SHARED_RECEIPT_SCHEMA_V1: object = SCHEMA_JSON;

// ── Shared type ──────────────────────────────────────────────────────────────

export const SharedReceiptV1Schema = z.object({
  run_id: z.string(),
  schema_version: z.literal('shared/v1'),
  start_time: z.string(),
  end_time: z.string(),
  duration_ms: z.number().nonnegative(),
  status: z.enum(['success', 'partial', 'failed', 'accepted', 'refused']),
  hash_format: z.literal('blake3-hex-64'),
  hashes: z.object({
    config: z.string(),
    input: z.string(),
    plan: z.string(),
    output: z.string(),
    proof_pack: z.string(),
  }),
  chain_predecessor: z.string().optional(),
  otel_run_id_attribute: z.enum(['run.id', 'mcpp.run_id']),
  conformance: z.object({
    fitness: z.number().optional(),
    precision: z.number().optional(),
    lifecycle: z.number().optional(),
    cardinality: z.number().optional(),
    receipt: z.number().optional(),
  }).optional(),
  source: z.enum(['wasm4pm', 'mcpp']).optional(),
});

/**
 * Canonical shared receipt — a normalised view of either a wasm4pm Receipt
 * or an mcpp AcceptedResponse.  Matches the JSON Schema in v1.json exactly.
 */
export type SharedReceiptV1 = z.infer<typeof SharedReceiptV1Schema>;

// ── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Strip the 'blake3:' prefix from an mcpp transport hash ref.
 * Returns the bare 64-char hex string (Risk 3 mitigation).
 *
 * Throws if the result is not a 64-char hex string, so callers get an early
 * error rather than a silent schema violation downstream.
 */
function stripBlake3Prefix(raw: string): string {
  const hex = raw.startsWith('blake3:') ? raw.slice('blake3:'.length) : raw;
  if (!/^[0-9a-f]{64}$/.test(hex)) {
    throw new Error(
      `SharedReceiptAdapter: expected bare 64-char BLAKE3 hex after stripping prefix, got: ${JSON.stringify(hex)}`
    );
  }
  return hex;
}

/**
 * Derive an ISO-8601 end_time from a started_at string and duration_ms.
 * (Risk 2 mitigation: mcpp does not emit end_time on the wire.)
 */
function deriveEndTime(startedAt: string, durationMs: number): string {
  const start = new Date(startedAt);
  if (isNaN(start.getTime())) {
    throw new Error(
      `SharedReceiptAdapter: cannot parse started_at as a date: ${JSON.stringify(startedAt)}`
    );
  }
  return new Date(start.getTime() + durationMs).toISOString();
}

/**
 * Normalise a chain_predecessor value from mcpp transport.
 * 'genesis' passes through; anything else is treated as a blake3: ref and
 * stripped.  Returns undefined if the input is undefined.
 */
function normaliseChainPredecessor(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  if (raw === 'genesis') return 'genesis';
  return stripBlake3Prefix(raw);
}

// ── Public adapters ──────────────────────────────────────────────────────────

/**
 * Convert a wasm4pm `Receipt` to a `SharedReceiptV1`.
 *
 * Mapping:
 *   - run_id          ← receipt.run_id  (already UUID v4)
 *   - start_time      ← receipt.start_time
 *   - end_time        ← receipt.end_time
 *   - duration_ms     ← receipt.duration_ms
 *   - status          ← receipt.status  ('success' | 'partial' | 'failed')
 *   - hashes.config   ← receipt.config_hash
 *   - hashes.input    ← receipt.input_hash
 *   - hashes.plan     ← receipt.plan_hash
 *   - hashes.output   ← receipt.output_hash
 *   - hashes.proof_pack ← receipt.output_hash  (no separate proof_pack in wasm4pm;
 *                          output_hash is the closest structural equivalent)
 *   - otel_run_id_attribute ← 'run.id'  (wasm4pm OTel convention)
 *   - source          ← 'wasm4pm'
 */
export function toSharedReceipt(r: Receipt): SharedReceiptV1 {
  return {
    run_id:                r.run_id,
    schema_version:        'shared/v1',
    start_time:            r.start_time,
    end_time:              r.end_time,
    duration_ms:           r.duration_ms,
    status:                r.status,
    hash_format:           'blake3-hex-64',
    hashes: {
      config:    r.config_hash,
      input:     r.input_hash,
      plan:      r.plan_hash,
      output:    r.output_hash,
      // wasm4pm has no separate proof_pack hash; use output_hash as structural
      // proxy so the required field is always populated.
      proof_pack: r.output_hash,
    },
    otel_run_id_attribute: 'run.id',
    source:                'wasm4pm',
  };
}

/**
 * Shape of the mcpp `AcceptedResponse` wire object expected by `fromMcppResponse`.
 *
 * Declared locally to avoid a cross-repo import.  The actual Rust struct is
 * `mcpp_core::protocol::response::AcceptedResponse`.
 */
interface McppAcceptedResponseLike {
  run_id:      string;
  verdict:     string;
  timings: {
    started_at:  string;
    duration_ms: number;
  };
  proof_pack: {
    uri:        string;
    hash:       string;  // "blake3:<64 hex>"
    size_bytes?: number;
  };
  receipt: {
    uri:               string;
    hash:              string;  // "blake3:<64 hex>"
    signature?:        string;
    chain_predecessor: string;  // "genesis" | "blake3:<64 hex>"
  };
  conformance?: {
    fitness?:     number;
    precision?:   number;
    lifecycle?:   number;
    cardinality?: number;
    receipt?:     number;
  };
  // Any additional fields are tolerated.
  [key: string]: unknown;
}

/**
 * Convert an mcpp `AcceptedResponse` (wire JSON) to a `SharedReceiptV1`.
 *
 * Mapping:
 *   - run_id          ← r.run_id  (already UUID v4 on the wire)
 *   - start_time      ← r.timings.started_at  (Risk 2: field rename)
 *   - end_time        ← derived: started_at + duration_ms  (Risk 2: not on wire)
 *   - duration_ms     ← r.timings.duration_ms
 *   - status          ← r.verdict  ('accepted' | 'refused')
 *   - hashes.proof_pack ← r.proof_pack.hash  (blake3: prefix stripped — Risk 3)
 *   - hashes.config   ← r.proof_pack.hash    (structural proxy; mcpp has no split)
 *   - hashes.input    ← r.proof_pack.hash    (structural proxy)
 *   - hashes.plan     ← r.proof_pack.hash    (structural proxy)
 *   - hashes.output   ← r.receipt.hash       (blake3: prefix stripped — Risk 3)
 *   - chain_predecessor ← r.receipt.chain_predecessor  (blake3: prefix stripped)
 *   - otel_run_id_attribute ← 'mcpp.run_id'  (mcpp OTel convention — Risk 1)
 *   - conformance     ← r.conformance
 *   - source          ← 'mcpp'
 *
 * @param r - Any object shaped like an mcpp AcceptedResponse.  Validated fields
 *            are accessed defensively via the McppAcceptedResponseLike cast.
 */
export function fromMcppResponse(r: unknown): SharedReceiptV1 {
  // Cast through our local interface for structured access.
  const resp = r as McppAcceptedResponseLike;

  const startedAt   = resp.timings.started_at;
  const durationMs  = resp.timings.duration_ms;
  const endTime     = deriveEndTime(startedAt, durationMs);

  // Risk 3: strip 'blake3:' prefix from all transport hashes.
  const proofPackHex       = stripBlake3Prefix(resp.proof_pack.hash);
  const receiptHex         = stripBlake3Prefix(resp.receipt.hash);
  const chainPredecessor   = normaliseChainPredecessor(resp.receipt.chain_predecessor);

  // mcpp splits proof-pack and receipt hashes but not config/input/plan.
  // Use proof_pack hash as a structural proxy for the missing dimensions so
  // the required hashes object is always fully populated.
  const shared: SharedReceiptV1 = {
    run_id:                resp.run_id,
    schema_version:        'shared/v1',
    start_time:            startedAt,
    end_time:              endTime,
    duration_ms:           durationMs,
    status:                resp.verdict as 'accepted' | 'refused',
    hash_format:           'blake3-hex-64',
    hashes: {
      config:    proofPackHex,
      input:     proofPackHex,
      plan:      proofPackHex,
      output:    receiptHex,
      proof_pack: proofPackHex,
    },
    otel_run_id_attribute: 'mcpp.run_id',
    source:                'mcpp',
  };

  if (chainPredecessor !== undefined) {
    shared.chain_predecessor = chainPredecessor;
  }

  if (resp.conformance) {
    shared.conformance = {
      fitness:     resp.conformance.fitness,
      precision:   resp.conformance.precision,
      lifecycle:   resp.conformance.lifecycle,
      cardinality: resp.conformance.cardinality,
      receipt:     resp.conformance.receipt,
    };
  }

  return shared;
}
