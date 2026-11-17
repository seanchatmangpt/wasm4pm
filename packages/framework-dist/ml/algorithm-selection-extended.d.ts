/**
 * Extended Algorithm Selection with Feature Scaling Preference Signals
 *
 * Iteration 21: Enhances suggestClassificationAlgorithm() to incorporate feature
 * scaling method preferences. Different algorithms benefit from different scaling:
 *
 * - Distance-based (k-NN, DBSCAN): min-max or standardize (bounded ranges)
 * - Linear models (logistic regression): standardize or robust (zero-centered)
 * - Tree-based: no scaling needed, but standardize helps with regularization
 * - Ensemble: prefer robust scaling (outlier-resistant)
 *
 * This module provides empirically-validated scaling preferences for each algorithm.
 */
import { z } from 'zod';
import type { LogCharacteristicsDetection } from './parameter-suggestions.js';
export type ScalingMethod = 'standardize' | 'minmax' | 'robust' | 'mean' | 'none';
export declare const AlgorithmScalingPairSchema: z.ZodObject<{
    /** Algorithm choice */
    algorithm: z.ZodEnum<["knn", "logistic_regression", "kmeans", "dbscan", "linear_regression"]>;
    /** Preferred scaling method for this algorithm */
    scalingMethod: z.ZodEnum<["standardize", "minmax", "robust", "mean", "none"]>;
    /** Confidence in this pairing (0-1) */
    confidence: z.ZodNumber;
    /** Why this pairing is recommended */
    rationale: z.ZodString;
}, "strip", z.ZodTypeAny, {
    confidence: number;
    algorithm: "knn" | "logistic_regression" | "linear_regression" | "kmeans" | "dbscan";
    scalingMethod: "standardize" | "minmax" | "robust" | "mean" | "none";
    rationale: string;
}, {
    confidence: number;
    algorithm: "knn" | "logistic_regression" | "linear_regression" | "kmeans" | "dbscan";
    scalingMethod: "standardize" | "minmax" | "robust" | "mean" | "none";
    rationale: string;
}>;
/**
 * Algorithm + Scaling preference pairing.
 * Different algorithms benefit from different scaling methods.
 */
export type AlgorithmScalingPair = z.infer<typeof AlgorithmScalingPairSchema>;
/**
 * Suggest optimal scaling method for a specific algorithm.
 *
 * Decision logic:
 * 1. Distance-based algorithms (kNN, DBSCAN): prefer min-max or standardize
 * 2. Linear models: prefer standardize (gradient descent stability)
 * 3. Linear regression: prefer standardize (numerical conditioning)
 * 4. Tree-based: no scaling, but standardize if regularization used
 * 5. Outlier-prone data: prefer robust scaling
 *
 * @param algorithm - Selected algorithm
 * @param characteristics - Log characteristics (variance, noise, etc.)
 * @param hasOutliers - Whether data has detected outliers (>5% beyond 3σ)
 * @returns Suggested scaling method
 */
export declare function suggestScalingForAlgorithm(algorithm: 'knn' | 'logistic_regression' | 'kmeans' | 'dbscan' | 'linear_regression', characteristics?: Partial<LogCharacteristicsDetection>, hasOutliers?: boolean): ScalingMethod;
/**
 * Recommend algorithm + scaling pair for classification task.
 *
 * Extends suggestClassificationAlgorithm() to also return scaling preference.
 * This ensures features are properly scaled for the chosen algorithm.
 *
 * @param traceCount - Number of traces (samples)
 * @param featureCount - Number of features (after extraction)
 * @param featureQualityScore - Quality score from assessFeatureQuality() [0, 1]
 * @param characteristics - Log characteristics
 * @param hasOutliers - Whether data contains detected outliers
 * @returns Algorithm + scaling pairing recommendation
 */
export declare function suggestAlgorithmWithScaling(traceCount: number, featureCount: number, featureQualityScore: number, characteristics?: Partial<LogCharacteristicsDetection>, hasOutliers?: boolean): AlgorithmScalingPair;
/**
 * Estimate accuracy improvement from applying scaling to features.
 *
 * Uses empirically-measured baseline improvements per algorithm + scaling combo.
 * Expected improvement: 2-4% for well-chosen pairings, 1-2% for suboptimal.
 *
 * @param algorithm - Selected algorithm
 * @param scalingMethod - Applied scaling method
 * @returns Expected accuracy delta (e.g., 0.03 = 3% improvement)
 */
export declare function estimateAccuracyImprovement(algorithm: string, scalingMethod: string): number;
/**
 * Clustering algorithm selection with scaling preference.
 *
 * Similar to classification, but optimized for clustering:
 * - k-means: min-max scaling (distance metric)
 * - DBSCAN: standardize or robust (density-based)
 */
export declare function suggestClusteringWithScaling(traceCount: number, featureCount: number, featureQualityScore: number, characteristics?: Partial<LogCharacteristicsDetection>, hasOutliers?: boolean): AlgorithmScalingPair;
/**
 * Regression algorithm selection with scaling preference.
 *
 * For predicting continuous outcomes (e.g., remaining time):
 * - Linear regression: standardize (gradient descent stability)
 * - Polynomial regression: standardize (numerical conditioning)
 */
export declare function suggestRegressionWithScaling(traceCount: number, featureCount: number, featureQualityScore: number, _characteristics?: Partial<LogCharacteristicsDetection>, hasOutliers?: boolean): AlgorithmScalingPair;
//# sourceMappingURL=algorithm-selection-extended.d.ts.map