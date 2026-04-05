/**
 * Receipt determinism test harness.
 *
 * Invariant: given identical input (config + event log), the receipt must be
 * byte-identical (modulo timestamps and run_id). This harness runs the same
 * input N times and compares the stable fields.
 */
export interface DeterminismResult {
    passed: boolean;
    iterations: number;
    stableFields: string[];
    unstableFields: string[];
    hashes: string[];
    details: string;
}
/**
 * Compute a stable hash of a receipt by zeroing out non-deterministic fields.
 */
export declare function stableReceiptHash(receipt: Record<string, unknown>): string;
/**
 * Run a producer function N times and verify deterministic output.
 */
export declare function checkDeterminism(producer: () => Promise<Record<string, unknown>>, iterations?: number): Promise<DeterminismResult>;
/**
 * Compare two receipts for determinism (ignoring unstable fields).
 */
export declare function receiptsMatch(a: Record<string, unknown>, b: Record<string, unknown>): boolean;
//# sourceMappingURL=determinism.d.ts.map