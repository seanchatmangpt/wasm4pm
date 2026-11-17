/**
 * Unified algorithm selector for all 6 prediction tasks.
 *
 * Provides data-driven algorithm recommendation based on log characteristics.
 * Centralizes decision logic that was previously scattered across predict.ts and ml-runner.ts.
 *
 * Decision tree uses:
 *   - Log size (trace count)
 *   - Entropy (activity diversity)
 *   - Feature variance (for ML-based tasks)
 *   - Activity count (process complexity)
 *
 * Confidence scores (0-1) reflect heuristic certainty:
 *   - 0.9+: Strong recommendation (e.g., large log → weibull for remaining-time)
 *   - 0.7-0.9: Good recommendation (data supports choice, but alternatives viable)
 *   - <0.7: Weak recommendation (uncertain; multiple algorithms reasonable)
 */
import { z } from 'zod';
export declare const LogProfileSchema: z.ZodObject<{
    /** Number of traces in the log */
    traceCount: z.ZodNumber;
    /** Number of unique activities (process complexity indicator) */
    activityCount: z.ZodNumber;
    /** Shannon entropy of activity frequencies (0=deterministic, 1=uniform) */
    entropy: z.ZodNumber;
    /** Average trace length (process breadth indicator) */
    avgTraceLength: z.ZodNumber;
    /** Variance of feature values (0=homogeneous, >1=diverse) */
    featureVariance: z.ZodNumber;
    /** Number of distinct traces (variants) */
    variantCount: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    activityCount: number;
    traceCount: number;
    entropy: number;
    avgTraceLength: number;
    featureVariance: number;
    variantCount: number;
}, {
    activityCount: number;
    traceCount: number;
    entropy: number;
    avgTraceLength: number;
    featureVariance: number;
    variantCount: number;
}>;
/**
 * Log profile characteristics extracted from WASM features.
 */
export type LogProfile = z.infer<typeof LogProfileSchema>;
export declare const AlgorithmRecommendationSchema: z.ZodObject<{
    /** Recommended algorithm name (e.g., 'weibull', 'regress', 'knn', 'ngram') */
    algorithm: z.ZodString;
    /** Confidence score (0-1): higher = stronger recommendation */
    confidence: z.ZodNumber;
    /** Human-readable explanation for the recommendation */
    reason: z.ZodString;
    /** Alternative algorithms (ranked by suitability) */
    alternatives: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    confidence: number;
    reason: string;
    algorithm: string;
    alternatives: string[];
}, {
    confidence: number;
    reason: string;
    algorithm: string;
    alternatives: string[];
}>;
/**
 * Algorithm recommendation result.
 */
export type AlgorithmRecommendation = z.infer<typeof AlgorithmRecommendationSchema>;
/**
 * Extract log profile from WASM feature output.
 *
 * @param features - Output from wasm.extract_case_features()
 * @returns LogProfile with computed characteristics
 */
export declare function extractLogProfile(features: Array<Record<string, unknown>>): LogProfile;
/**
 * Select best algorithm for a given prediction task and log profile.
 *
 * Main entry point: given task name and log characteristics, returns recommended
 * algorithm with confidence score and justification.
 *
 * @param task - Prediction task: 'next-activity', 'remaining-time', 'outcome', 'drift', 'features', 'resource'
 * @param profile - Log profile (extract via extractLogProfile())
 * @returns AlgorithmRecommendation with algorithm name, confidence, reason, and alternatives
 * @throws Error if task is not recognized
 */
export declare function selectBestAlgorithmForTask(task: string, profile: LogProfile): AlgorithmRecommendation;
/**
 * Convenience function: extract profile and select algorithm in one call.
 *
 * @param task - Prediction task name
 * @param features - Raw WASM feature output array
 * @returns AlgorithmRecommendation
 */
export declare function recommendAlgorithm(task: string, features: Array<Record<string, unknown>>): AlgorithmRecommendation;
//# sourceMappingURL=algorithm-selector.d.ts.map