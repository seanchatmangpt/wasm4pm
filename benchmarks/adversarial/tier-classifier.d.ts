/**
 * Tier Classifier — Algorithm Classification Post-Audit
 *
 * After running the audit, classify each algorithm into tiers:
 * - Tier 0: Production-ready (correct output, fitness ≥ 0.85, latency < 5s at 500K)
 * - Tier 1: Experimental (correct output, slow or low precision)
 * - Tier 2: Wrong (crashes, wrong output type, low fitness)
 * - Tier 3: Lie (no WASM export, stub implementation, wrong name mapping)
 */
import { AlgorithmResult } from './quality-pipeline.js';
export type AlgorithmTier = 0 | 1 | 2 | 3;
export interface TierClassification {
    algorithm: string;
    tier: AlgorithmTier;
    reasons: string[];
    recommendation: string;
}
export interface TierSummary {
    tier0: string[];
    tier1: string[];
    tier2: string[];
    tier3: string[];
    totalAlgorithms: number;
    productionReady: number;
}
/**
 * Classify algorithm into tier based on audit results.
 *
 * Tier 0: Production
 *   - Output type matches registry claim (no "lies")
 *   - WASM export exists (no NOT_EXPORTED)
 *   - Fitness ≥ 0.85 (valid process model)
 *   - Latency < 5s at 500K events
 *   - No crashes
 *
 * Tier 1: Experimental
 *   - Correct output type and export
 *   - But slow (latency 5–30s at 500K)
 *   - Or low precision/generalization
 *
 * Tier 2: Wrong
 *   - Crashes during execution
 *   - Wrong output type (DFG when registry says petrinet)
 *   - Fitness < 0.85 for declared fitness-capable algorithms
 *   - Name mapping broken (wasmFn mismatch)
 *
 * Tier 3: Lie
 *   - No WASM export (wasmFn = 'NOT_EXPORTED')
 *   - Stub implementation (e.g., inductive_miner just calls discover_dfg)
 *   - No WASM function found at all
 */
export declare function classifyAlgorithm(result: AlgorithmResult, registryMetadata: {
    id: string;
    wasmFn: string;
    outputType: string;
    fitnessCapable: boolean;
    expectedLatencyBudgetMs: number;
    description: string;
}): TierClassification;
/**
 * Classify all results.
 */
export declare function classifyAll(results: AlgorithmResult[], registryMetadata: Map<string, any>): TierClassification[];
/**
 * Summarize tiers.
 */
export declare function summarizeTiers(classifications: TierClassification[]): TierSummary;
/**
 * Print tier summary (human-readable report).
 */
export declare function printTierSummary(summary: TierSummary): string;
//# sourceMappingURL=tier-classifier.d.ts.map