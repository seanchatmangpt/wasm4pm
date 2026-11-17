/**
 * Shared Receipt Schema V1 — adapter utilities.
 *
 * Resolves three type-drift risks between wasm4pm and mcpp:
 *   Risk 1: Run ID OTel attribute name (run.id vs mcpp.run_id)
 *   Risk 2: Timing asymmetry (start_time+end_time vs started_at+duration_ms)
 *   Risk 3: Hash scheme prefix (bare hex vs blake3: prefix in transport refs)
 */
import { z } from 'zod';
import type { Receipt } from '../receipt.js';
/**
 * The raw JSON Schema object for SharedReceiptV1.
 * Import this for AJV or any other JSON Schema validator.
 */
export declare const SHARED_RECEIPT_SCHEMA_V1: object;
export declare const SharedReceiptV1Schema: z.ZodObject<{
    run_id: z.ZodString;
    schema_version: z.ZodLiteral<"shared/v1">;
    start_time: z.ZodString;
    end_time: z.ZodString;
    duration_ms: z.ZodNumber;
    status: z.ZodEnum<["success", "partial", "failed", "accepted", "refused"]>;
    hash_format: z.ZodLiteral<"blake3-hex-64">;
    hashes: z.ZodObject<{
        config: z.ZodString;
        input: z.ZodString;
        plan: z.ZodString;
        output: z.ZodString;
        proof_pack: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        plan: string;
        config: string;
        input: string;
        output: string;
        proof_pack: string;
    }, {
        plan: string;
        config: string;
        input: string;
        output: string;
        proof_pack: string;
    }>;
    chain_predecessor: z.ZodOptional<z.ZodString>;
    otel_run_id_attribute: z.ZodEnum<["run.id", "mcpp.run_id"]>;
    conformance: z.ZodOptional<z.ZodObject<{
        fitness: z.ZodOptional<z.ZodNumber>;
        precision: z.ZodOptional<z.ZodNumber>;
        lifecycle: z.ZodOptional<z.ZodNumber>;
        cardinality: z.ZodOptional<z.ZodNumber>;
        receipt: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        fitness?: number | undefined;
        precision?: number | undefined;
        lifecycle?: number | undefined;
        cardinality?: number | undefined;
        receipt?: number | undefined;
    }, {
        fitness?: number | undefined;
        precision?: number | undefined;
        lifecycle?: number | undefined;
        cardinality?: number | undefined;
        receipt?: number | undefined;
    }>>;
    source: z.ZodOptional<z.ZodEnum<["wasm4pm", "mcpp"]>>;
}, "strip", z.ZodTypeAny, {
    status: "success" | "partial" | "failed" | "refused" | "accepted";
    schema_version: "shared/v1";
    duration_ms: number;
    run_id: string;
    start_time: string;
    end_time: string;
    hashes: {
        plan: string;
        config: string;
        input: string;
        output: string;
        proof_pack: string;
    };
    hash_format: "blake3-hex-64";
    otel_run_id_attribute: "run.id" | "mcpp.run_id";
    conformance?: {
        fitness?: number | undefined;
        precision?: number | undefined;
        lifecycle?: number | undefined;
        cardinality?: number | undefined;
        receipt?: number | undefined;
    } | undefined;
    source?: "mcpp" | "wasm4pm" | undefined;
    chain_predecessor?: string | undefined;
}, {
    status: "success" | "partial" | "failed" | "refused" | "accepted";
    schema_version: "shared/v1";
    duration_ms: number;
    run_id: string;
    start_time: string;
    end_time: string;
    hashes: {
        plan: string;
        config: string;
        input: string;
        output: string;
        proof_pack: string;
    };
    hash_format: "blake3-hex-64";
    otel_run_id_attribute: "run.id" | "mcpp.run_id";
    conformance?: {
        fitness?: number | undefined;
        precision?: number | undefined;
        lifecycle?: number | undefined;
        cardinality?: number | undefined;
        receipt?: number | undefined;
    } | undefined;
    source?: "mcpp" | "wasm4pm" | undefined;
    chain_predecessor?: string | undefined;
}>;
/**
 * Canonical shared receipt — a normalised view of either a wasm4pm Receipt
 * or an mcpp AcceptedResponse.  Matches the JSON Schema in v1.json exactly.
 */
export type SharedReceiptV1 = z.infer<typeof SharedReceiptV1Schema>;
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
 * @param r - Any object shaped like an mcpp AcceptedResponse.  Validated fields
 *            are accessed defensively via the McppAcceptedResponseLike cast.
 */
export declare function fromMcppResponse(r: unknown): SharedReceiptV1;
//# sourceMappingURL=adapter.d.ts.map