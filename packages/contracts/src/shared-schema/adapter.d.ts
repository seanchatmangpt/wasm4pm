/**
 * Shared Receipt Schema V1 — adapter utilities.
 *
 * Resolves three type-drift risks between wasm4pm and mcpp:
 *   Risk 1: Run ID OTel attribute name (run.id vs mcpp.run_id)
 *   Risk 2: Timing asymmetry (start_time+end_time vs started_at+duration_ms)
 *   Risk 3: Hash scheme prefix (bare hex vs blake3: prefix in transport refs)
 */
import type { Receipt } from '../receipt.js';
/**
 * The raw JSON Schema object for SharedReceiptV1.
 * Import this for AJV or any other JSON Schema validator.
 */
export declare const SHARED_RECEIPT_SCHEMA_V1: object;
/**
 * Canonical shared receipt — a normalised view of either a wasm4pm Receipt
 * or an mcpp AcceptedResponse.  Matches the JSON Schema in v1.json exactly.
 */
export interface SharedReceiptV1 {
    /** Canonical run identifier (UUID v4). */
    run_id: string;
    /** Fixed schema-version sentinel. */
    schema_version: 'shared/v1';
    /** ISO-8601 execution start. */
    start_time: string;
    /** ISO-8601 execution end (derived for mcpp if absent). */
    end_time: string;
    /** Wall-clock duration in milliseconds. */
    duration_ms: number;
    /**
     * Execution outcome.
     * wasm4pm: 'success' | 'partial' | 'failed'
     * mcpp:    'accepted' | 'refused'
     */
    status: 'success' | 'partial' | 'failed' | 'accepted' | 'refused';
    /** Sentinel declaring all hashes in this document are bare 64-char hex. */
    hash_format: 'blake3-hex-64';
    /** BLAKE3 artifact hashes — bare 64-char lowercase hex, no 'blake3:' prefix. */
    hashes: {
        config: string;
        input: string;
        plan: string;
        output: string;
        proof_pack: string;
    };
    /**
     * Chain linkage.
     * Literal 'genesis' for the first receipt; bare 64-char hex otherwise.
     * (Risk 3: 'blake3:' prefix stripped on ingestion from mcpp transport refs.)
     */
    chain_predecessor?: string;
    /**
     * Risk 1: records which OTel attribute name the origin system used.
     * 'run.id'      — wasm4pm
     * 'mcpp.run_id' — mcpp
     */
    otel_run_id_attribute: 'run.id' | 'mcpp.run_id';
    /** Conformance dimension scores (0.0–1.0). Present only when mcpp supplies them. */
    conformance?: {
        fitness?: number;
        precision?: number;
        lifecycle?: number;
        cardinality?: number;
        receipt?: number;
    };
    /** Which system produced this shared receipt. */
    source?: 'wasm4pm' | 'mcpp';
}
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
export declare function toSharedReceipt(r: Receipt): SharedReceiptV1;
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
 * @param r - Any object shaped like an mcpp AcceptedResponse.  Typed as `any`
 *            to match the task spec; validated fields are accessed defensively.
 */
export declare function fromMcppResponse(r: any): SharedReceiptV1;
//# sourceMappingURL=adapter.d.ts.map