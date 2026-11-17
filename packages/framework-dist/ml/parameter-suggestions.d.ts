/**
 * parameter-suggestions.ts
 *
 * Data-driven ML parameter suggestion helper.
 * Provides heuristics for common ML hyperparameters based on log characteristics.
 *
 * These functions implement domain knowledge from process mining literature
 * and empirical testing to suggest reasonable parameter values without requiring
 * users to understand the underlying ML algorithms.
 */
import { z } from 'zod';
export declare const LogCharacteristicsDetectionSchema: z.ZodObject<{
    /** Fraction of unique trace variants (0-1). High variance: >0.7 */
    variantRatio: z.ZodNumber;
    /** Is this a high-variance log (>70% unique traces)? */
    isHighVariance: z.ZodBoolean;
    /** Number of distinct activities */
    activityCount: z.ZodNumber;
    /** Is this a high-activity log (>50 distinct activities)? */
    isHighActivity: z.ZodBoolean;
    /** Estimated noise level (0-1). High noise: >0.3 */
    estimatedNoiseLevel: z.ZodNumber;
    /** Is this a noisy log (>30% noise)? */
    isNoisy: z.ZodBoolean;
    /** Average trace length in events */
    averageTraceLengthMs: z.ZodOptional<z.ZodNumber>;
    /** Is the log time-heavy (large average traces)? */
    isTimeTrending: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    variantRatio: number;
    isHighVariance: boolean;
    activityCount: number;
    isHighActivity: boolean;
    estimatedNoiseLevel: number;
    isNoisy: boolean;
    averageTraceLengthMs?: number | undefined;
    isTimeTrending?: boolean | undefined;
}, {
    variantRatio: number;
    isHighVariance: boolean;
    activityCount: number;
    isHighActivity: boolean;
    estimatedNoiseLevel: number;
    isNoisy: boolean;
    averageTraceLengthMs?: number | undefined;
    isTimeTrending?: boolean | undefined;
}>;
/**
 * Log characteristics detection result.
 * Identifies observable patterns in the event log for algorithm/parameter suggestion.
 */
export type LogCharacteristicsDetection = z.infer<typeof LogCharacteristicsDetectionSchema>;
/**
 * Analyze log characteristics to guide algorithm and parameter selection.
 *
 * Detects patterns:
 * - High variance: >70% of traces are unique variants (requires genetic/ACO/PSO)
 * - High activity: >50 distinct activities (requires algorithms optimized for wide logs)
 * - High noise: >30% estimated noise (requires noise-resistant algorithms)
 * - Time-trending: large average trace lengths with temporal patterns
 *
 * @param traceCount Total number of traces
 * @param variantCount Number of unique trace variants
 * @param activityCount Number of distinct activities
 * @param estimatedNoiseLevel (optional) Fraction of events estimated to be noise (0-1)
 * @param averageTraceLengthMs (optional) Average trace duration in milliseconds
 * @returns Detection result with categorization for algorithm/parameter hints
 */
export declare function detectLogCharacteristics(traceCount: number, variantCount: number, activityCount: number, estimatedNoiseLevel?: number, averageTraceLengthMs?: number): LogCharacteristicsDetection;
/**
 * Suggest optimal number of clusters for k-means clustering.
 *
 * Uses the elbow heuristic: k ≈ sqrt(n/2), where n is the number of traces.
 * This formula provides a reasonable starting point for unsupervised clustering
 * without requiring cross-validation in resource-constrained environments.
 *
 * Refined by log characteristics:
 * - High variance logs: increase k by 20% (more patterns to capture)
 * - High-activity logs: cap k at 15 (reduce noise from activity dimensionality)
 * - Noisy logs: reduce k by 10% (fewer tight clusters, more resilience)
 *
 * @param traceCount Number of traces in the event log
 * @param activityCount Number of distinct activities
 * @param characteristics (optional) Detected log characteristics for refinement
 * @returns Suggested k value (minimum 2, maximum 20)
 *
 * @example
 *   suggestClusteringK(100, 15) // Returns ~7
 *   suggestClusteringK(1000, 30, { isHighVariance: true }) // Returns ~9 (7 * 1.2)
 *   suggestClusteringK(1000, 60, { isHighActivity: true }) // Returns ~7 (capped at 15)
 *   suggestClusteringK(1000, 30, { isNoisy: true }) // Returns ~6 (7 * 0.9)
 */
export declare function suggestClusteringK(traceCount: number, _activityCount: number, characteristics?: Partial<LogCharacteristicsDetection>): number;
/**
 * Suggest optimal number of PCA components to retain.
 *
 * Returns min(0.95 * featureCount, cap) to balance dimensionality reduction
 * with variance preservation. Retaining 95% of features ensures minimal
 * information loss while still providing reduction benefits.
 *
 * Default cap at 10 components is appropriate for process mining where traces
 * typically have 10-20 key features (duration, activity count, rework ratio, etc.).
 *
 * Refined by log characteristics:
 * - High-activity logs: cap at 15 (more features, allow more PCA components)
 * - High-variance logs: cap at 12 (capture variance complexity)
 * - Noisy logs: cap at 8 (reduce noise amplification)
 *
 * @param featureCount Number of input features extracted from the log
 * @param characteristics (optional) Detected log characteristics for refinement
 * @returns Suggested number of components to keep
 *
 * @example
 *   suggestPCAComponents(8)  // Returns 8 (95% of 8)
 *   suggestPCAComponents(12, { isHighActivity: true }) // Returns 11 (95% of 12, capped at 15)
 *   suggestPCAComponents(100, { isHighVariance: true }) // Returns 12 (95% of 100 = 95, capped at 12)
 *   suggestPCAComponents(5, { isNoisy: true })  // Returns 5 (95% of 5 = 4.75, capped at 8)
 */
export declare function suggestPCAComponents(featureCount: number, characteristics?: Partial<LogCharacteristicsDetection>): number;
/**
 * Suggest anomaly detection threshold based on log size and characteristics.
 *
 * Scales the threshold inversely with log size: larger logs are more forgiving
 * (higher threshold = fewer false positives), smaller logs are more sensitive.
 *
 * Base thresholds by size:
 *   - Small logs (< 1K events): 0.6 (sensitive, catch more anomalies)
 *   - Medium logs (1K-10K): 0.65
 *   - Large logs (10K-100K): 0.7
 *   - Very large logs (> 100K): 0.75 (conservative, reduce noise)
 *
 * Refined by log characteristics:
 * - Noisy logs: lower threshold by 0.05 (increase sensitivity to find true anomalies)
 * - High-variance logs: raise threshold by 0.05 (reduce false positives from natural variance)
 * - High-activity logs: raise threshold by 0.03 (more features = higher baseline noise)
 *
 * Final threshold is clamped to [0.5, 0.85] to stay in practical bounds.
 *
 * @param logSize Total number of events in the log
 * @param characteristics (optional) Detected log characteristics for refinement
 * @returns Suggested anomaly threshold (0-1, higher = fewer anomalies detected)
 *
 * @example
 *   suggestAnomalyThreshold(500)    // Returns 0.6 (sensitive)
 *   suggestAnomalyThreshold(5000, { isNoisy: true })   // Returns 0.6 (0.65 - 0.05)
 *   suggestAnomalyThreshold(50000, { isHighVariance: true })  // Returns 0.75 (0.7 + 0.05)
 *   suggestAnomalyThreshold(200000) // Returns 0.75 (conservative)
 */
export declare function suggestAnomalyThreshold(logSize: number, characteristics?: Partial<LogCharacteristicsDetection>): number;
/**
 * Suggest k-NN parameter k based on sample size and characteristics.
 *
 * Default k=5 is reasonable for general use but can be optimized:
 * - Small logs (<20 samples): k = 3 (reduce overfitting)
 * - Medium logs (20-100): k = 5 (default, balanced)
 * - Large logs (>100): k = sqrt(n) capped at 10 (more neighbors for stability)
 * - Noisy logs: reduce k by 1 (fewer neighbors reduce noise influence)
 *
 * Final k is clamped to [1, n-1] to ensure validity.
 *
 * @param traceCount Number of traces (samples) in the log
 * @param characteristics (optional) Detected log characteristics for refinement
 * @returns Suggested k value for k-NN
 *
 * @example
 *   suggestKnnK(10) // Returns 3 (small log)
 *   suggestKnnK(50) // Returns 5 (medium, default)
 *   suggestKnnK(200) // Returns 10 (large: sqrt(200)≈14, capped at 10)
 *   suggestKnnK(100, { isNoisy: true }) // Returns 4 (5 - 1 for noise)
 */
export declare function suggestKnnK(traceCount: number, characteristics?: Partial<LogCharacteristicsDetection>): number;
/**
 * Suggest max depth for decision trees based on sample size and feature count.
 *
 * Deeper trees risk overfitting; shallower trees risk underfitting.
 * Rule: max_depth = min(log2(n), 0.5 * feature_count), clamped to [2, 10].
 *
 * Refinement:
 * - Noisy logs: reduce by 1 (simpler trees resist noise better)
 * - High-variance logs: increase by 1 (more patterns to capture)
 *
 * @param traceCount Number of traces (samples)
 * @param featureCount Number of features after one-hot encoding
 * @param characteristics (optional) Detected log characteristics for refinement
 * @returns Suggested max depth for decision tree
 *
 * @example
 *   suggestDecisionTreeDepth(100, 10) // Returns 5 (log2(100)≈6.6, capped)
 *   suggestDecisionTreeDepth(1000, 20) // Returns 10 (min(10, 10) = 10)
 *   suggestDecisionTreeDepth(100, 10, { isNoisy: true }) // Returns 4 (5 - 1)
 */
export declare function suggestDecisionTreeDepth(traceCount: number, featureCount: number, characteristics?: Partial<LogCharacteristicsDetection>): number;
/**
 * Suggest polynomial degree based on feature count and sample size.
 *
 * Higher degree risks overfitting (curse of dimensionality).
 * Rule: degree = min(3, max(1, 0.1 * feature_count)), adjusted for sample size.
 *
 * Guard: degree <= n - 1 (more parameters than observations = underdetermined).
 *
 * @param featureCount Number of input features
 * @param traceCount Number of samples for regression
 * @returns Suggested polynomial degree (clamped to [1, 3])
 *
 * @example
 *   suggestPolynomialDegree(5, 20) // Returns 1 (0.1*5=0.5, min(3,1)=1)
 *   suggestPolynomialDegree(20, 100) // Returns 2 (0.1*20=2, min(3,2)=2)
 *   suggestPolynomialDegree(50, 100) // Returns 3 (0.1*50=5, capped at 3)
 */
export declare function suggestPolynomialDegree(featureCount: number, traceCount: number): number;
/**
 * Suggest forecast horizon based on the number of windows available.
 *
 * Forecast horizon should not exceed 50% of training window count.
 * Default: ceil(0.2 * windowCount), clamped to [1, ceil(0.5 * windowCount)].
 *
 * @param windowCount Number of drift/forecast windows in the series
 * @returns Suggested forecast periods
 *
 * @example
 *   suggestForecastHorizon(10) // Returns 2 (0.2*10=2)
 *   suggestForecastHorizon(50) // Returns 10 (0.2*50=10)
 *   suggestForecastHorizon(5) // Returns 1 (min is 1)
 */
export declare function suggestForecastHorizon(windowCount: number): number;
/**
 * Adaptive algorithm selection for classification based on log characteristics.
 *
 * Selects between knn and logistic_regression based on:
 * - Feature quality (zero-variance, multicollinearity)
 * - Dataset size (trace count)
 * - Feature variance and complexity
 */
export declare function suggestClassificationAlgorithm(traceCount: number, _featureCount: number, featureQualityScore: number, characteristics?: Partial<LogCharacteristicsDetection>): 'knn' | 'logistic_regression';
export declare const AlgorithmSuggestionSchema: z.ZodObject<{
    name: z.ZodString;
    confidence: z.ZodNumber;
    reason: z.ZodString;
    suggestedParameters: z.ZodRecord<z.ZodString, z.ZodUnknown>;
}, "strip", z.ZodTypeAny, {
    name: string;
    confidence: number;
    reason: string;
    suggestedParameters: Record<string, unknown>;
}, {
    name: string;
    confidence: number;
    reason: string;
    suggestedParameters: Record<string, unknown>;
}>;
export type AlgorithmSuggestion = z.infer<typeof AlgorithmSuggestionSchema>;
export declare const ParameterSuggestionsSchema: z.ZodObject<{
    classification: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        confidence: z.ZodNumber;
        reason: z.ZodString;
        suggestedParameters: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        confidence: number;
        reason: string;
        suggestedParameters: Record<string, unknown>;
    }, {
        name: string;
        confidence: number;
        reason: string;
        suggestedParameters: Record<string, unknown>;
    }>, "many">;
    regression: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        confidence: z.ZodNumber;
        reason: z.ZodString;
        suggestedParameters: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        confidence: number;
        reason: string;
        suggestedParameters: Record<string, unknown>;
    }, {
        name: string;
        confidence: number;
        reason: string;
        suggestedParameters: Record<string, unknown>;
    }>, "many">;
    clustering: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        confidence: z.ZodNumber;
        reason: z.ZodString;
        suggestedParameters: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        confidence: number;
        reason: string;
        suggestedParameters: Record<string, unknown>;
    }, {
        name: string;
        confidence: number;
        reason: string;
        suggestedParameters: Record<string, unknown>;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    classification: {
        name: string;
        confidence: number;
        reason: string;
        suggestedParameters: Record<string, unknown>;
    }[];
    regression: {
        name: string;
        confidence: number;
        reason: string;
        suggestedParameters: Record<string, unknown>;
    }[];
    clustering: {
        name: string;
        confidence: number;
        reason: string;
        suggestedParameters: Record<string, unknown>;
    }[];
}, {
    classification: {
        name: string;
        confidence: number;
        reason: string;
        suggestedParameters: Record<string, unknown>;
    }[];
    regression: {
        name: string;
        confidence: number;
        reason: string;
        suggestedParameters: Record<string, unknown>;
    }[];
    clustering: {
        name: string;
        confidence: number;
        reason: string;
        suggestedParameters: Record<string, unknown>;
    }[];
}>;
export type ParameterSuggestions = z.infer<typeof ParameterSuggestionsSchema>;
/**
 * Suggest algorithms and parameters for all three ML tasks given a FeatureMatrix.
 */
export declare function suggestParameters(data: {
    data: number[][];
    featureNames?: string[];
}): ParameterSuggestions;
/**
 * Pick the single best algorithm name for a given task based on dataset characteristics.
 */
export declare function pickBestAlgorithm(task: 'classification' | 'regression' | 'clustering', data: {
    data: number[][];
    featureNames?: string[];
}): string;
//# sourceMappingURL=parameter-suggestions.d.ts.map