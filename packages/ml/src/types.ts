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

/**
 * Sentinel metadata attached to ML results when the input was too small or
 * empty to produce a meaningful answer. Callers should treat any result with
 * a populated `warning` as a no-op: numeric fields will be defaults (0, []),
 * predictions/assignments will be empty, and no model was actually fit.
 *
 * This is a domain-contract refusal in metadata form — existing tests that
 * assert empty arrays still pass, but downstream code can now branch on
 * `metadata?.warning` to surface the situation instead of silently using
 * sentinel results as if they were valid.
 */
export type EmptyInputWarning = z.infer<typeof EmptyInputWarningSchema>;

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

/** Numeric feature matrix ready for ML consumption */
export type FeatureMatrix = z.infer<typeof FeatureMatrixSchema>;

// ---------------------------------------------------------------------------
// LabelEncoding — kept as plain interface: contains Map<K,V> (not JSON-native)
// ---------------------------------------------------------------------------

/** Label encoding result for classifiers */
export interface LabelEncoding {
  /** Numeric labels (0, 1, 2, ...) */
  encoded: number[];
  /** String label → numeric index */
  labelMap: Map<string, number>;
  /** Numeric index → string label */
  reverseMap: Map<number, string>;
}

/** Classification method */
export type ClassificationMethod = 'knn' | 'logistic_regression' | 'decision_tree' | 'naive_bayes' | 'gradient_boosting';

/** Regression method */
export type RegressionMethod =
  | 'linear_regression'
  | 'polynomial_regression'
  | 'exponential_regression';

/** Clustering method */
export type ClusteringMethod = 'kmeans' | 'dbscan';

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

export type ClassificationResult = z.infer<typeof ClassificationResultSchema>;

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

export type RegressionResult = z.infer<typeof RegressionResultSchema>;

export const ClusteringResultSchema = z.object({
  method: z.enum(['kmeans', 'dbscan']),
  clusterCount: z.number(),
  noiseCount: z.number(),
  assignments: z.array(z.object({ caseId: z.string(), cluster: z.number() })),
  centroids: z.array(z.array(z.number())).optional(),
  modelInfo: z.record(z.string(), z.unknown()),
  metadata: z.object({ warning: EmptyInputWarningSchema }).optional(),
});

export type ClusteringResult = z.infer<typeof ClusteringResultSchema>;

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

export type ThroughputForecastResult = z.infer<typeof ThroughputForecastResultSchema>;

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

/** Generic series forecast result (for drift distances, any numeric series) */
export type SeriesForecastResult = z.infer<typeof SeriesForecastResultSchema>;

export const EnhancedAnomalyResultSchema = z.object({
  peakIndices: z.array(z.number()),
  peakValues: z.array(z.number()),
  decomposed: DecompositionSchema.optional(),
  residualPeaks: z.array(z.number()).optional(),
  smoothedSeries: z.array(z.number()),
  originalLength: z.number(),
  metadata: z.object({ warning: EmptyInputWarningSchema }).optional(),
});

export type EnhancedAnomalyResult = z.infer<typeof EnhancedAnomalyResultSchema>;

export const PCAResultSchema = z.object({
  nComponents: z.number(),
  explainedVariance: z.array(z.number()),
  transformedData: z.array(z.array(z.number())),
  components: z.array(z.array(z.number())),
  originalFeatureCount: z.number(),
  featureNames: z.array(z.string()),
});

export type PCAResult = z.infer<typeof PCAResultSchema>;
