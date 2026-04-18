/**
 * Adversarial Algorithm Audit Runner — Master Orchestrator
 *
 * Runs all 41 registered algorithms against benchmark datasets.
 * Direct WASM calls, bypasses CLI layer which has assumptions.
 *
 * Pattern:
 * 1. Load log once: wasm.load_eventlog_from_xes(xesContent) → logHandle
 * 2. For each algorithm:
 *    a. Call WASM function (wasmFn) with standard params
 *    b. Measure latency: performance.now()
 *    c. Parse result, extract model handle (if applicable)
 *    d. Measure fitness via token_based_replay (if petrinet)
 *    e. Measure precision/generalization/simplicity
 *    f. Classify algorithm into tier
 * 3. Generate 4D quality report
 * 4. Output recommendations (which algorithms to keep/fix/remove)
 */
import { AlgorithmResult } from './quality-pipeline.js';
export interface AuditConfig {
    logPath: string;
    activityKey: string;
    outputDir: string;
    verbose: boolean;
    skipMissingAlgorithms: boolean;
}
export declare const DEFAULT_AUDIT_CONFIG: AuditConfig;
/**
 * Run adversarial audit against all 41 algorithms.
 *
 * Returns array of AlgorithmResult with 4D quality metrics and tier classification.
 */
export declare function runAdversarialAudit(wasm: any, config?: AuditConfig): Promise<{
    results: AlgorithmResult[];
    summary: any;
    classifications: any;
    timestamp: string;
}>;
/**
 * Run audit batch across multiple real datasets.
 * Small = quick feedback; Large = real 500K+ event stress test.
 */
export declare function runAdversarialAuditBatch(wasm: any, datasetDir?: string, outputDir?: string): Promise<Map<string, any>>;
//# sourceMappingURL=audit-runner.d.ts.map