/**
 * Feature extraction for remaining-time prediction.
 *
 * Extracts trace-level features optimized for predicting case duration
 * based on process characteristics and temporal patterns.
 */
import { z } from 'zod';
import type { FeatureMatrix } from './types.js';
export declare const RemainingTimeFeaturesSchema: z.ZodObject<{
    case_id: z.ZodString;
    trace_length: z.ZodNumber;
    elapsed_time: z.ZodNumber;
    activity_frequencies: z.ZodArray<z.ZodNumber, "many">;
    avg_inter_event_time: z.ZodNumber;
    cycle_count: z.ZodNumber;
    /** Target variable (milliseconds) */
    remaining_time: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    trace_length: number;
    case_id: string;
    elapsed_time: number;
    activity_frequencies: number[];
    avg_inter_event_time: number;
    cycle_count: number;
    remaining_time?: number | undefined;
}, {
    trace_length: number;
    case_id: string;
    elapsed_time: number;
    activity_frequencies: number[];
    avg_inter_event_time: number;
    cycle_count: number;
    remaining_time?: number | undefined;
}>;
/**
 * Remaining-time feature definition.
 *
 * Extracts the following features from each trace:
 * - trace_length: Number of activities completed so far
 * - elapsed_time: Time elapsed since case start (milliseconds)
 * - activity_frequencies: Vector of activity occurrence counts
 * - avg_inter_event_time: Mean time between consecutive events (milliseconds)
 * - cycle_count: Number of rework instances (repeated activities)
 */
export type RemainingTimeFeatures = z.infer<typeof RemainingTimeFeaturesSchema>;
/**
 * Extract features optimized for remaining-time prediction.
 *
 * Input: Feature matrix from wasm.extract_case_features() with keys:
 *   - case_id: string
 *   - trace_length: number
 *   - elapsed_time: number (milliseconds)
 *   - activity_counts: Record<activity_name, count>
 *   - rework_count: number
 *   - avg_inter_event_time: number (milliseconds)
 *   - remaining_time?: number (optional, for supervised learning)
 *
 * Output: FeatureMatrix with normalized features optimized for regression.
 *
 * @param featuresJson - Array of feature objects from wasm.extract_case_features()
 * @returns FeatureMatrix ready for regression
 */
export declare function extractRemainingTimeFeatures(featuresJson: Array<Record<string, unknown>>): FeatureMatrix;
/**
 * Normalize remaining-time features to [0,1] range per feature.
 *
 * Handles edge cases:
 * - All-zero feature → stays zero
 * - Single value → stays unchanged
 * - Zero-variance column → stays zero
 *
 * @param featureMatrix - Original feature matrix
 * @returns Normalized matrix with per-feature min-max scaling
 */
export declare function normalizeRemainingTimeFeatures(featureMatrix: FeatureMatrix): FeatureMatrix;
/**
 * Assess feature quality for remaining-time prediction.
 *
 * Returns metrics for each feature:
 * - variance: Numeric variance (0 for constant features)
 * - coverage: Fraction of non-zero values
 * - correlation: Absolute correlation with target (remaining_time)
 *
 * @param featureMatrix - Feature matrix with targets
 * @returns Array of feature quality objects
 */
export declare const FeatureQualityMetricSchema: z.ZodObject<{
    feature: z.ZodString;
    variance: z.ZodNumber;
    coverage: z.ZodNumber;
    correlation: z.ZodNumber;
    /** Based on variance + correlation */
    quality: z.ZodEnum<["high", "medium", "low"]>;
}, "strip", z.ZodTypeAny, {
    feature: string;
    correlation: number;
    variance: number;
    coverage: number;
    quality: "high" | "medium" | "low";
}, {
    feature: string;
    correlation: number;
    variance: number;
    coverage: number;
    quality: "high" | "medium" | "low";
}>;
export type FeatureQualityMetric = z.infer<typeof FeatureQualityMetricSchema>;
export declare function assessRemainingTimeFeatureQuality(featureMatrix: FeatureMatrix): FeatureQualityMetric[];
//# sourceMappingURL=features-remaining-time.d.ts.map