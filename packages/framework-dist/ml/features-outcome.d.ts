/**
 * Feature extraction for outcome prediction (classification).
 *
 * Extracts trace-level features optimized for predicting case outcomes
 * (success vs failure, normal vs anomalous completion, etc.)
 * based on process characteristics and patterns.
 */
import { z } from 'zod';
import type { FeatureMatrix } from './types.js';
export declare const OutcomeFeaturesSchema: z.ZodObject<{
    case_id: z.ZodString;
    trace_length: z.ZodNumber;
    elapsed_time: z.ZodNumber;
    activity_frequencies: z.ZodArray<z.ZodNumber, "many">;
    avg_inter_event_time: z.ZodNumber;
    rework_ratio: z.ZodNumber;
    cycle_count: z.ZodNumber;
    resource_variance: z.ZodNumber;
    unique_activities: z.ZodNumber;
    /** Target label (success, failure, anomalous, normal, etc.) */
    outcome: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    trace_length: number;
    unique_activities: number;
    case_id: string;
    elapsed_time: number;
    activity_frequencies: number[];
    avg_inter_event_time: number;
    rework_ratio: number;
    cycle_count: number;
    resource_variance: number;
    outcome?: string | undefined;
}, {
    trace_length: number;
    unique_activities: number;
    case_id: string;
    elapsed_time: number;
    activity_frequencies: number[];
    avg_inter_event_time: number;
    rework_ratio: number;
    cycle_count: number;
    resource_variance: number;
    outcome?: string | undefined;
}>;
/**
 * Outcome feature definition.
 *
 * Extracts the following features from each trace:
 * - trace_length: Number of activities in the trace
 * - elapsed_time: Total time from start to finish (milliseconds)
 * - activity_frequencies: Vector of activity occurrence counts
 * - avg_inter_event_time: Mean time between consecutive events (milliseconds)
 * - rework_ratio: Fraction of repeated activities (0-1)
 * - cycle_count: Number of rework instances (repeated activity pairs)
 * - resource_variance: Diversity of resources handling the trace (0-1)
 * - unique_activities: Count of distinct activities in trace
 */
export type OutcomeFeatures = z.infer<typeof OutcomeFeaturesSchema>;
/**
 * Extract features optimized for outcome prediction.
 *
 * Input: Feature matrix from wasm.extract_case_features() with keys:
 *   - case_id: string
 *   - trace_length: number
 *   - elapsed_time: number (milliseconds)
 *   - activity_counts: Record<activity_name, count>
 *   - rework_count: number
 *   - avg_inter_event_time: number (milliseconds)
 *   - unique_activities?: number (optional, derived from activity_counts)
 *   - outcome?: string (optional, for supervised learning)
 *
 * Output: FeatureMatrix ready for classification.
 *
 * @param featuresJson - Array of feature objects from wasm.extract_case_features()
 * @returns FeatureMatrix ready for classification
 */
export declare function extractOutcomeFeatures(featuresJson: Array<Record<string, unknown>>): FeatureMatrix;
/**
 * Normalize outcome features to [0,1] range per feature.
 *
 * Handles edge cases:
 * - All-zero feature → stays zero
 * - Single value → stays unchanged
 * - Zero-variance column → stays zero
 *
 * @param featureMatrix - Original feature matrix
 * @returns Normalized matrix with per-feature min-max scaling
 */
export declare function normalizeOutcomeFeatures(featureMatrix: FeatureMatrix): FeatureMatrix;
/**
 * Assess feature quality for outcome prediction.
 *
 * Returns metrics for each feature:
 * - variance: Numeric variance (0 for constant features)
 * - coverage: Fraction of non-zero values
 * - classVariability: How well feature separates outcome classes
 *
 * @param featureMatrix - Feature matrix with labels (outcomes)
 * @returns Array of feature quality objects
 */
export declare const OutcomeFeatureQualityMetricSchema: z.ZodObject<{
    feature: z.ZodString;
    variance: z.ZodNumber;
    coverage: z.ZodNumber;
    classVariability: z.ZodNumber;
    /** Based on variance + class separability */
    quality: z.ZodEnum<["high", "medium", "low"]>;
}, "strip", z.ZodTypeAny, {
    feature: string;
    variance: number;
    coverage: number;
    classVariability: number;
    quality: "high" | "medium" | "low";
}, {
    feature: string;
    variance: number;
    coverage: number;
    classVariability: number;
    quality: "high" | "medium" | "low";
}>;
export type OutcomeFeatureQualityMetric = z.infer<typeof OutcomeFeatureQualityMetricSchema>;
export declare function assessOutcomeFeatureQuality(featureMatrix: FeatureMatrix): OutcomeFeatureQualityMetric[];
//# sourceMappingURL=features-outcome.d.ts.map