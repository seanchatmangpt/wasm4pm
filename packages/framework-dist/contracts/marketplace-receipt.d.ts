/**
 * Marketplace receipt format for wasm4pm process mining runs.
 *
 * A `MarketplaceReceipt` extends the base `Receipt` with marketplace-specific
 * telemetry fields that answer the practitioner questions:
 *   - Which activity types were observed? (event_types)
 *   - Which object types were involved? (object_types)
 *   - How many orders, listings, and users appeared in the log? (counts)
 *
 * This receipt type is the output of a marketplace OCEL pipeline run:
 *   raw NDJSON → fromMarketplaceJsonl → OcelEvent[] → buildMarketplaceReceipt
 *
 * The domain field is fixed at "marketplace" to enable downstream filtering
 * in mcpp's process miner without ambiguity.
 */
import { z } from 'zod';
import type { Receipt } from './receipt.js';
import type { OcelEvent } from './ocel-bridge.js';
export declare const MarketplaceReceiptSchema: z.ZodObject<{
    domain: z.ZodLiteral<"marketplace">;
    event_types: z.ZodArray<z.ZodString, "many">;
    object_types: z.ZodArray<z.ZodString, "many">;
    order_count: z.ZodNumber;
    listing_count: z.ZodNumber;
    user_count: z.ZodNumber;
    run_id: z.ZodOptional<z.ZodString>;
    trace_id: z.ZodOptional<z.ZodString>;
    schema_version: z.ZodOptional<z.ZodString>;
    config_hash: z.ZodOptional<z.ZodString>;
    input_hash: z.ZodOptional<z.ZodString>;
    plan_hash: z.ZodOptional<z.ZodString>;
    output_hash: z.ZodOptional<z.ZodString>;
    start_time: z.ZodOptional<z.ZodString>;
    end_time: z.ZodOptional<z.ZodString>;
    duration_ms: z.ZodOptional<z.ZodNumber>;
    status: z.ZodOptional<z.ZodEnum<["success", "partial", "failed"]>>;
    error: z.ZodOptional<z.ZodOptional<z.ZodObject<{
        code: z.ZodString;
        message: z.ZodString;
        stack: z.ZodOptional<z.ZodString>;
        context: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    }, "strip", z.ZodTypeAny, {
        code: string;
        message: string;
        context?: Record<string, unknown> | undefined;
        stack?: string | undefined;
    }, {
        code: string;
        message: string;
        context?: Record<string, unknown> | undefined;
        stack?: string | undefined;
    }>>>;
    summary: z.ZodOptional<z.ZodObject<{
        traces_processed: z.ZodNumber;
        objects_processed: z.ZodNumber;
        variants_discovered: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        traces_processed: number;
        objects_processed: number;
        variants_discovered: number;
    }, {
        traces_processed: number;
        objects_processed: number;
        variants_discovered: number;
    }>>;
    algorithm: z.ZodOptional<z.ZodObject<{
        name: z.ZodString;
        version: z.ZodString;
        parameters: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    }, "strip", z.ZodTypeAny, {
        version: string;
        name: string;
        parameters: Record<string, unknown>;
    }, {
        version: string;
        name: string;
        parameters: Record<string, unknown>;
    }>>;
    model: z.ZodOptional<z.ZodObject<{
        nodes: z.ZodNumber;
        edges: z.ZodNumber;
        artifacts: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
    }, "strip", z.ZodTypeAny, {
        nodes: number;
        edges: number;
        artifacts?: Record<string, string> | undefined;
    }, {
        nodes: number;
        edges: number;
        artifacts?: Record<string, string> | undefined;
    }>>;
    profile: z.ZodOptional<z.ZodOptional<z.ZodObject<{
        peak_memory_bytes: z.ZodNumber;
        phase_timings: z.ZodArray<z.ZodObject<{
            phase: z.ZodString;
            duration_ms: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            phase: string;
            duration_ms: number;
        }, {
            phase: string;
            duration_ms: number;
        }>, "many">;
        cpu_time_ms: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        peak_memory_bytes: number;
        phase_timings: {
            phase: string;
            duration_ms: number;
        }[];
        cpu_time_ms?: number | undefined;
    }, {
        peak_memory_bytes: number;
        phase_timings: {
            phase: string;
            duration_ms: number;
        }[];
        cpu_time_ms?: number | undefined;
    }>>>;
    signature: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    signer_pubkey: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    sig_algorithm: z.ZodOptional<z.ZodOptional<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    event_types: string[];
    domain: "marketplace";
    object_types: string[];
    order_count: number;
    listing_count: number;
    user_count: number;
    status?: "success" | "partial" | "failed" | undefined;
    model?: {
        nodes: number;
        edges: number;
        artifacts?: Record<string, string> | undefined;
    } | undefined;
    schema_version?: string | undefined;
    duration_ms?: number | undefined;
    run_id?: string | undefined;
    trace_id?: string | undefined;
    config_hash?: string | undefined;
    input_hash?: string | undefined;
    plan_hash?: string | undefined;
    output_hash?: string | undefined;
    start_time?: string | undefined;
    end_time?: string | undefined;
    error?: {
        code: string;
        message: string;
        context?: Record<string, unknown> | undefined;
        stack?: string | undefined;
    } | undefined;
    summary?: {
        traces_processed: number;
        objects_processed: number;
        variants_discovered: number;
    } | undefined;
    algorithm?: {
        version: string;
        name: string;
        parameters: Record<string, unknown>;
    } | undefined;
    profile?: {
        peak_memory_bytes: number;
        phase_timings: {
            phase: string;
            duration_ms: number;
        }[];
        cpu_time_ms?: number | undefined;
    } | undefined;
    signature?: string | undefined;
    signer_pubkey?: string | undefined;
    sig_algorithm?: string | undefined;
}, {
    event_types: string[];
    domain: "marketplace";
    object_types: string[];
    order_count: number;
    listing_count: number;
    user_count: number;
    status?: "success" | "partial" | "failed" | undefined;
    model?: {
        nodes: number;
        edges: number;
        artifacts?: Record<string, string> | undefined;
    } | undefined;
    schema_version?: string | undefined;
    duration_ms?: number | undefined;
    run_id?: string | undefined;
    trace_id?: string | undefined;
    config_hash?: string | undefined;
    input_hash?: string | undefined;
    plan_hash?: string | undefined;
    output_hash?: string | undefined;
    start_time?: string | undefined;
    end_time?: string | undefined;
    error?: {
        code: string;
        message: string;
        context?: Record<string, unknown> | undefined;
        stack?: string | undefined;
    } | undefined;
    summary?: {
        traces_processed: number;
        objects_processed: number;
        variants_discovered: number;
    } | undefined;
    algorithm?: {
        version: string;
        name: string;
        parameters: Record<string, unknown>;
    } | undefined;
    profile?: {
        peak_memory_bytes: number;
        phase_timings: {
            phase: string;
            duration_ms: number;
        }[];
        cpu_time_ms?: number | undefined;
    } | undefined;
    signature?: string | undefined;
    signer_pubkey?: string | undefined;
    sig_algorithm?: string | undefined;
}>;
/**
 * A wasm4pm execution receipt extended with marketplace domain telemetry.
 *
 * Extends `Receipt` with:
 * - `domain`        — always "marketplace", for receipt-type discrimination
 * - `event_types`   — sorted unique activity labels from `ocel:activity`
 * - `object_types`  — sorted unique object type identifiers derived from
 *                      `ocel:omap` membership patterns in the adapted events
 * - `order_count`   — number of unique order identifiers seen
 * - `listing_count` — number of unique listing identifiers seen
 * - `user_count`    — number of unique user identifiers seen
 *                      (union of seller_id and buyer_id values)
 */
export type MarketplaceReceipt = z.infer<typeof MarketplaceReceiptSchema>;
/**
 * Type guard that checks whether a value is a `MarketplaceReceipt`.
 *
 * Checks structural presence of all marketplace-specific fields.
 *
 * @param value - The value to test
 * @returns true if value satisfies the MarketplaceReceipt structure
 */
export declare function isMarketplaceReceipt(value: unknown): value is MarketplaceReceipt;
/**
 * Constructs a `MarketplaceReceipt` from an array of OCEL events produced by
 * `fromMarketplaceJsonl` and an optional partial base `Receipt`.
 *
 * The marketplace-specific fields are derived entirely from the event batch,
 * not from the base receipt, so they always reflect the actual log content.
 *
 * Object-type membership for count fields:
 * - `order_count`   — unique values in `ocel:vmap.order_id`
 * - `listing_count` — unique values in `ocel:vmap.listing_id`
 * - `user_count`    — union of `ocel:vmap.seller_id`, `ocel:vmap.buyer_id`,
 *                      and `ocel:vmap.user_id`
 *
 * @param events      - OCEL events produced by the marketplace bridge
 * @param baseReceipt - Optional partial Receipt fields to merge (run_id, hashes, etc.)
 * @returns A MarketplaceReceipt combining base fields with computed domain telemetry
 */
export declare function buildMarketplaceReceipt(events: OcelEvent[], baseReceipt?: Partial<Receipt>): MarketplaceReceipt;
//# sourceMappingURL=marketplace-receipt.d.ts.map