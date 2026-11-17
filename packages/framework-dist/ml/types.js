/**
 * Type definitions for @wasm4pm/ml
 *
 * Result interfaces for all ML operations.
 * Native process intelligence ML — no external ML library dependencies.
 */
import { z } from 'zod';
// ---------------------------------------------------------------------------
// EmptyInputWarning
// ---------------------------------------------------------------------------
export const EmptyInputWarningSchema = z.object({
    /** Stable warning code. Use this for programmatic checks. */
    code: z.enum([
        'empty_input',
        'insufficient_samples',
        'short_series',
        'no_valid_features',
        'no_labels',
    ]),
    /** Human-readable explanation. */
    message: z.string(),
    /** Number of items the function received. */
    inputLength: z.number(),
    /** Minimum number of items required to produce a meaningful result. */
    minRequired: z.number(),
});
// ---------------------------------------------------------------------------
// FeatureMatrix
// ---------------------------------------------------------------------------
export const FeatureMatrixSchema = z.object({
    /** Rows = traces/observations, cols = features */
    data: z.array(z.array(z.number())),
    /** Column headers (original feature names + one-hot encoded names) */
    featureNames: z.array(z.string()),
    /** Row identifiers (case IDs or trace indices) */
    caseIds: z.array(z.string()),
    /** Numeric target values (e.g., remaining_time) */
    targets: z.array(z.number()),
    /** Categorical target labels (e.g., outcome activity name) */
    labels: z.array(z.string()),
    /** Set when the input was empty / null / had no valid rows. */
    metadata: z.object({ warning: EmptyInputWarningSchema }).optional(),
});
// --- Result schemas & types ---
export const ClassificationResultSchema = z.object({
    method: z.enum(['knn', 'logistic_regression', 'decision_tree', 'naive_bayes', 'gradient_boosting']),
    predictions: z.array(z.object({ caseId: z.string(), predicted: z.string(), confidence: z.number() })),
    modelInfo: z.record(z.string(), z.unknown()),
    /**
     * Mean cross-validation accuracy over k held-out folds.
     * Present only when crossValidate=true is passed to classifyTraces.
     */
    cv_accuracy: z.number().optional(),
    /** Standard deviation of per-fold accuracy scores. */
    cv_std_dev: z.number().optional(),
    /** Number of CV folds used (default: 3). */
    cv_folds: z.number().optional(),
    /** Per-fold accuracy scores for debugging and audit trails. */
    cv_fold_scores: z.array(z.number()).optional(),
    /** Method selected by the data-driven algorithm selector. */
    suggested_method: z.enum(['knn', 'logistic_regression', 'decision_tree', 'naive_bayes', 'gradient_boosting']).optional(),
    /** Empty-input refusal metadata. */
    metadata: z.object({ warning: EmptyInputWarningSchema }).optional(),
});
export const RegressionResultSchema = z.object({
    method: z.enum(['linear_regression', 'polynomial_regression', 'exponential_regression']),
    slope: z.number().optional(),
    intercept: z.number().optional(),
    rSquared: z.number(),
    rmse: z.number(),
    mae: z.number(),
    predictions: z.array(z.object({ caseId: z.string(), actual: z.number(), predicted: z.number() })),
    degree: z.number().optional(),
    coefficients: z.array(z.number()).optional(),
    growthRate: z.number().optional(),
    amplitude: z.number().optional(),
    doublingTime: z.number().optional(),
});
export const ClusteringResultSchema = z.object({
    method: z.enum(['kmeans', 'dbscan']),
    clusterCount: z.number(),
    noiseCount: z.number(),
    assignments: z.array(z.object({ caseId: z.string(), cluster: z.number() })),
    centroids: z.array(z.array(z.number())).optional(),
    modelInfo: z.record(z.string(), z.unknown()),
    metadata: z.object({ warning: EmptyInputWarningSchema }).optional(),
});
const TrendSchema = z.object({ direction: z.string(), slope: z.number(), strength: z.number() });
const DecompositionSchema = z.object({ trend: z.array(z.number()), seasonal: z.array(z.number()), residual: z.array(z.number()) });
const SeasonalitySchema = z.object({ period: z.number(), strength: z.number() });
export const ThroughputForecastResultSchema = z.object({
    eventCounts: z.array(z.number()),
    windowCount: z.number(),
    trend: TrendSchema,
    forecast: z.array(z.number()).optional(),
    seasonality: SeasonalitySchema.optional(),
    decomposition: DecompositionSchema.optional(),
    windowSizeMs: z.number(),
    exponentialForecast: z.array(z.number()).optional(),
    metadata: z.object({ warning: EmptyInputWarningSchema }).optional(),
});
export const SeriesForecastResultSchema = z.object({
    seriesLength: z.number(),
    trend: TrendSchema,
    forecast: z.array(z.number()).optional(),
    /**
     * R² goodness-of-fit for the linear trend model.
     * Present when series has ≥ 3 observations.
     */
    rSquared: z.number().optional(),
    /**
     * 95% confidence intervals for each forecast period.
     * Present when series has ≥ 3 observations and `forecast` is populated.
     */
    confidenceIntervals: z.array(z.tuple([z.number(), z.number()])).optional(),
    seasonality: SeasonalitySchema.optional(),
    decomposition: DecompositionSchema.optional(),
    exponentialForecast: z.array(z.number()).optional(),
    metadata: z.object({ warning: EmptyInputWarningSchema }).optional(),
});
export const EnhancedAnomalyResultSchema = z.object({
    peakIndices: z.array(z.number()),
    peakValues: z.array(z.number()),
    decomposed: DecompositionSchema.optional(),
    residualPeaks: z.array(z.number()).optional(),
    smoothedSeries: z.array(z.number()),
    originalLength: z.number(),
    metadata: z.object({ warning: EmptyInputWarningSchema }).optional(),
});
export const PCAResultSchema = z.object({
    nComponents: z.number(),
    explainedVariance: z.array(z.number()),
    transformedData: z.array(z.array(z.number())),
    components: z.array(z.array(z.number())),
    originalFeatureCount: z.number(),
    featureNames: z.array(z.string()),
});
//# sourceMappingURL=types.js.map