/**
 * 4D Quality Pipeline — Fitness, Precision, Generalization, Simplicity
 *
 * Measure all four quality dimensions for each algorithm result.
 * Direct WASM calls to bypass CLI assumptions.
 */
import { FourDQuality } from './oracle.js';
export interface AlgorithmResult {
    algorithm: string;
    outputType: string;
    model: any;
    modelHandle?: string;
    latencyMs: number;
    quality: FourDQuality;
    crashed: boolean;
    error?: string;
}
/**
 * Compute fitness via token-based replay.
 *
 * Requires:
 * - logHandle: WASM handle from load_eventlog_from_xes
 * - modelHandle: WASM handle from discovery algorithm
 * - activityKey: 'concept:name' (standard)
 *
 * Returns fitness = 1 - (missing + remaining) / (consumed + produced)
 */
export declare function computeFitness(wasm: any, logHandle: string, modelHandle: string, activityKey: string): Promise<{
    fitness: number;
    missing: number;
    consumed: number;
    produced: number;
    remaining: number;
}>;
/**
 * Compute precision via ETConformance (if available).
 *
 * Precision = how much of model behavior is observed in log.
 * Measured by alignment cost or coverage analysis.
 *
 * If not implemented in WASM, return placeholder.
 */
export declare function computePrecision(wasm: any, logHandle: string, modelHandle: string, activityKey: string): Promise<number>;
/**
 * Compute generalization metric (from WASM).
 *
 * Generalization = how well model generalizes to unseen behavior.
 * Usually: 1 - (model_complexity / log_complexity)
 *
 * If not implemented, return placeholder.
 */
export declare function computeGeneralization(wasm: any, logHandle: string, modelHandle: string): Promise<number>;
/**
 * Compute simplicity metric (model element count).
 *
 * Simplicity = inverse of complexity.
 * For DFG: count nodes + edges
 * For Petri net: count places + transitions
 * Lower element count = higher simplicity
 *
 * Normalize to [0, 1] via: simplicity = 1 / (1 + element_count)
 */
export declare function computeSimplicity(model: any): number;
/**
 * Complete 4D quality pipeline for one algorithm result.
 *
 * Calls fitness/precision/generalization/simplicity in sequence.
 * Returns FourDQuality object or error.
 *
 * Fitness computation per output type:
 * - petrinet: Token-based replay fitness (requires modelHandle)
 * - dfg: Weighted edge frequency score (directly from model structure)
 * - other: No fitness (0.0)
 */
export declare function measure4DQuality(wasm: any, algorithmName: string, outputType: string, model: any, modelHandle: string | undefined, logHandle: string, activityKey: string): Promise<{
    quality: FourDQuality;
    error?: string;
}>;
/**
 * Summarize quality across multiple results.
 */
export declare function summarizeQuality(results: AlgorithmResult[]): {
    avgFitness: number;
    avgPrecision: number;
    avgGeneralization: number;
    avgSimplicity: number;
    algorithmsWithFitnessAbove85: number;
    algorithmsWithPrecisionImplemented: number;
};
//# sourceMappingURL=quality-pipeline.d.ts.map