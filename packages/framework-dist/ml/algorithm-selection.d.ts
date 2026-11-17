/**
 * Algorithm Selection via Data Characteristics
 *
 * Heuristic-based algorithm selection (Rank-2 Oracle) based on feature matrix
 * and label characteristics.
 *
 * Tier 3 AUTOML Gap-14: Decision logic for:
 * - classify: knn if n_features < 10 AND n_samples < 1K, else random_forest
 * - cluster: pca_then_kmeans if n_features > 20, else kmeans
 * - forecast: exponential_smoothing if trend_strength > 0.7, else arima
 * - regress: ridge if multicollinearity > 0.9, else lasso
 * - pca: reduce to min(n_samples/3, n_features)
 *
 * Returns recommendation with confidence [0-1] and rationale.
 */
import { z } from 'zod';
export declare const AlgorithmRecommendationSchema: z.ZodObject<{
    /** Selected algorithm */
    algorithm: z.ZodString;
    /** Confidence in this choice [0-1] */
    confidence: z.ZodNumber;
    /** Why this algorithm was selected */
    rationale: z.ZodString;
    /** Alternative algorithms (if applicable) */
    alternatives: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    confidence: number;
    algorithm: string;
    rationale: string;
    alternatives?: string[] | undefined;
}, {
    confidence: number;
    algorithm: string;
    rationale: string;
    alternatives?: string[] | undefined;
}>;
/**
 * Algorithm recommendation result.
 */
export type AlgorithmRecommendation = z.infer<typeof AlgorithmRecommendationSchema>;
export declare const FeatureMatrixCharacteristicsSchema: z.ZodObject<{
    /** Number of samples (rows) */
    n_samples: z.ZodNumber;
    /** Number of features (columns) */
    n_features: z.ZodNumber;
    /** Correlation matrix (upper triangle as 1D array) */
    correlations: z.ZodOptional<z.ZodArray<z.ZodNumber, "many">>;
    /** Trend strength [0-1] for time series */
    trend_strength: z.ZodOptional<z.ZodNumber>;
    /** Max absolute correlation (multicollinearity indicator) */
    max_abs_correlation: z.ZodOptional<z.ZodNumber>;
    /** Variance explained by first component (PCA) */
    pca_variance_explained: z.ZodOptional<z.ZodNumber>;
    /** Sparsity (fraction of zero values) */
    sparsity: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    n_samples: number;
    n_features: number;
    correlations?: number[] | undefined;
    trend_strength?: number | undefined;
    max_abs_correlation?: number | undefined;
    pca_variance_explained?: number | undefined;
    sparsity?: number | undefined;
}, {
    n_samples: number;
    n_features: number;
    correlations?: number[] | undefined;
    trend_strength?: number | undefined;
    max_abs_correlation?: number | undefined;
    pca_variance_explained?: number | undefined;
    sparsity?: number | undefined;
}>;
/**
 * Feature matrix characteristics for algorithm selection.
 */
export type FeatureMatrixCharacteristics = z.infer<typeof FeatureMatrixCharacteristicsSchema>;
/**
 * Compute multicollinearity metric (max absolute correlation between features).
 *
 * @param data - Feature matrix (n_samples x n_features)
 * @returns Max absolute correlation (excluding diagonal)
 */
export declare function computeMulticollinearity(data: number[][]): number;
/**
 * Select algorithm for classification task.
 *
 * Heuristic:
 * - n_features < 10 AND n_samples < 1K: k-NN (simple, fast)
 * - Otherwise: random_forest (robust, generalizes well)
 *
 * @param data - Feature matrix
 * @param labels - Class labels
 * @returns Algorithm recommendation
 */
export declare function selectClassificationAlgorithm(data: number[][], _labels: number[]): AlgorithmRecommendation;
/**
 * Select algorithm for clustering task.
 *
 * Heuristic:
 * - n_features > 20: PCA + k-means (dimensionality reduction first)
 * - Otherwise: k-means directly
 *
 * @param data - Feature matrix
 * @returns Algorithm recommendation
 */
export declare function selectClusteringAlgorithm(data: number[][]): AlgorithmRecommendation;
/**
 * Select algorithm for forecasting task.
 *
 * Heuristic:
 * - trend_strength > 0.7: exponential_smoothing (captures trends well)
 * - Otherwise: arima (more flexible for stationary/non-stationary)
 *
 * @param trend_strength - Trend component strength [0-1]
 * @returns Algorithm recommendation
 */
export declare function selectForecastingAlgorithm(trend_strength?: number): AlgorithmRecommendation;
/**
 * Select algorithm for regression task.
 *
 * Heuristic:
 * - multicollinearity > 0.9: ridge (handles correlated features)
 * - Otherwise: lasso (feature selection + regularization)
 *
 * @param data - Feature matrix
 * @returns Algorithm recommendation
 */
export declare function selectRegressionAlgorithm(data: number[][]): AlgorithmRecommendation;
/**
 * Select target dimensionality for PCA.
 *
 * Heuristic: reduce to min(n_samples/3, n_features), preserving at least 2 dimensions.
 *
 * @param data - Feature matrix
 * @returns Target number of components
 */
export declare function selectPcaDimensionality(data: number[][]): {
    n_components: number;
    rationale: string;
};
/**
 * Master algorithm selection function.
 *
 * Routes to task-specific selector.
 *
 * @param task - ML task ('classify', 'cluster', 'forecast', 'regress', 'pca')
 * @param data - Feature matrix or characteristics
 * @param labels - Labels (for classification)
 * @param trend_strength - Trend strength (for forecasting)
 * @returns Algorithm recommendation
 */
export declare function selectAlgorithm(task: 'classify' | 'cluster' | 'forecast' | 'regress' | 'pca', data: number[][] | FeatureMatrixCharacteristics, labels?: number[], trend_strength?: number): AlgorithmRecommendation;
//# sourceMappingURL=algorithm-selection.d.ts.map