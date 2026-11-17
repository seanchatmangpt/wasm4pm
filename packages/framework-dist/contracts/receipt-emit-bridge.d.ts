/**
 * receipt-emit-bridge: emit the receipt.emit span required for LIVE-13.
 *
 * LIVE-13 (ReceiptSignedByLiveAggregator) checks that every admitted run
 * produces a receipt.emit span with:
 *   - mcpp.receipt.signer = "proof_aggregator"
 *   - mcpp.receipt.signature = non-empty BLAKE3 or Ed25519 hash string
 */
import { z } from 'zod';
import type { Receipt } from './receipt.js';
export declare const ReceiptEmitRecordSchema: z.ZodObject<{
    name: z.ZodLiteral<"receipt.emit">;
    timestamp: z.ZodString;
    fields: z.ZodObject<{
        'run.id': z.ZodString;
        'trace.id': z.ZodString;
        'mcpp.receipt.signer': z.ZodLiteral<"proof_aggregator">;
        'mcpp.receipt.signature': z.ZodString;
        'mcpp.receipt.algorithm': z.ZodString;
        'mcpp.receipt.status': z.ZodString;
    }, "strip", z.ZodTypeAny, {
        'run.id': string;
        'trace.id': string;
        'mcpp.receipt.signer': "proof_aggregator";
        'mcpp.receipt.signature': string;
        'mcpp.receipt.algorithm': string;
        'mcpp.receipt.status': string;
    }, {
        'run.id': string;
        'trace.id': string;
        'mcpp.receipt.signer': "proof_aggregator";
        'mcpp.receipt.signature': string;
        'mcpp.receipt.algorithm': string;
        'mcpp.receipt.status': string;
    }>;
}, "strip", z.ZodTypeAny, {
    name: "receipt.emit";
    timestamp: string;
    fields: {
        'run.id': string;
        'trace.id': string;
        'mcpp.receipt.signer': "proof_aggregator";
        'mcpp.receipt.signature': string;
        'mcpp.receipt.algorithm': string;
        'mcpp.receipt.status': string;
    };
}, {
    name: "receipt.emit";
    timestamp: string;
    fields: {
        'run.id': string;
        'trace.id': string;
        'mcpp.receipt.signer': "proof_aggregator";
        'mcpp.receipt.signature': string;
        'mcpp.receipt.algorithm': string;
        'mcpp.receipt.status': string;
    };
}>;
export type ReceiptEmitRecord = z.infer<typeof ReceiptEmitRecordSchema>;
/**
 * Emits the receipt.emit span for LIVE-13 compliance.
 *
 * The signature is derived from the receipt's output_hash (BLAKE3 hex-64).
 * If output_hash is absent, falls back to plan_hash.
 * The signer is hardcoded to "proof_aggregator" — wasm4pm acts as the
 * proof aggregation layer that produces and signs receipts.
 */
export declare function emitReceiptEmit(receipt: Receipt): ReceiptEmitRecord;
//# sourceMappingURL=receipt-emit-bridge.d.ts.map