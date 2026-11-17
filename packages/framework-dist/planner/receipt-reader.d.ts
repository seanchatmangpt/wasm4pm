export interface MetaCase {
    algorithm: string;
    qualityTier: number;
    avgDurationMs: number;
    passRate: number;
    sampleCount: number;
}
export declare function readAlgoBehaviorCases(receiptsDir: string, qualityTierMap?: Record<string, number>): MetaCase[];
/**
 * Read runtime CommandReceipt files (written by `wpm run` / `wpm autopilot`)
 * and convert to MetaCase[] grouped by algorithm.
 *
 * Each receipt must have `summary.algorithm` and `summary.duration_ms` to be
 * counted. passRate is derived from receipt `status === 'success'`.
 */
export declare function readRuntimeCases(receiptsDir?: string, qualityTierMap?: Record<string, number>): MetaCase[];
/**
 * Merge static corpus cases with runtime cases. For algorithms present in
 * both, avgDurationMs and passRate are blended weighted by sampleCount —
 * runtime evidence gains influence as receipts accumulate.
 */
export declare function mergeMetaCases(corpus: MetaCase[], runtime: MetaCase[]): MetaCase[];
//# sourceMappingURL=receipt-reader.d.ts.map