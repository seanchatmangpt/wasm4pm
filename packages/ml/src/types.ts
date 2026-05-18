/**
 * Type definitions for @wasm4pm/ml
 *
 * Result interfaces for all ML operations.
 * Native process intelligence ML — no external ML library dependencies.
 */

/** Numeric feature matrix ready for ML consumption */
export interface FeatureMatrix {
  /** Rows = traces/observations, cols = features */
  data: number[][];
  /** Column headers (original feature names + one-hot encoded names) */
  featureNames: string[];
  /** Row identifiers (case IDs or trace indices) */
  caseIds: string[];
  /** Numeric target values (e.g., remaining_time) */
  targets: number[];
  /** Categorical target labels (e.g., outcome activity name) */
  labels: string[];
}

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
export type ClassificationMethod = 'knn' | 'logistic_regression' | 'decision_tree' | 'naive_bayes';

/** Regression method */
export type RegressionMethod =
  | 'linear_regression'
  | 'polynomial_regression'
  | 'exponential_regression';

/** Clustering method */
export type ClusteringMethod = 'kmeans' | 'dbscan';

// --- Result interfaces ---

export interface ClassificationResult {
  method: ClassificationMethod;
  predictions: Array<{ caseId: string; predicted: string; confidence: number }>;
  modelInfo: Record<string, unknown>;
  /**
   * Mean cross-validation accuracy over k held-out folds.
   * Present only when crossValidate=true is passed to classifyTraces.
   * This is the honest accuracy estimate: it is evaluated on data the model
   * never saw during training, so it will be lower than in-sample accuracy
   * for methods prone to overfitting (e.g. kNN with small k, deep trees).
   */
  cv_accuracy?: number;
  /**
   * Standard deviation of per-fold accuracy scores.
   * High std dev signals that the model is sensitive to which data it sees —
   * a sign of overfitting or insufficient training data.
   */
  cv_std_dev?: number;
  /** Number of CV folds used (default: 3). */
  cv_folds?: number;
  /** Per-fold accuracy scores for debugging and audit trails. */
  cv_fold_scores?: number[];
  /**
   * Method selected by the data-driven algorithm selector when the user did
   * not specify --method. Absent when the user explicitly chose a method.
   */
  suggested_method?: ClassificationMethod;
}

export interface RegressionResult {
  method: RegressionMethod;
  slope?: number;
  intercept?: number;
  rSquared: number;
  rmse: number;
  mae: number;
  predictions: Array<{ caseId: string; actual: number; predicted: number }>;
  // polynomial-specific
  degree?: number;
  coefficients?: number[];
  // exponential-specific
  growthRate?: number;
  amplitude?: number;
  doublingTime?: number;
}

export interface ClusteringResult {
  method: ClusteringMethod;
  clusterCount: number;
  noiseCount: number;
  assignments: Array<{ caseId: string; cluster: number }>;
  centroids?: number[][];
  modelInfo: Record<string, unknown>;
}

export interface ThroughputForecastResult {
  eventCounts: number[];
  windowCount: number;
  trend: { direction: string; slope: number; strength: number };
  forecast?: number[];
  seasonality?: { period: number; strength: number };
  decomposition?: { trend: number[]; seasonal: number[]; residual: number[] };
  windowSizeMs: number;
  exponentialForecast?: number[];
}

/** Generic series forecast result (for drift distances, any numeric series) */
export interface SeriesForecastResult {
  seriesLength: number;
  trend: { direction: string; slope: number; strength: number };
  forecast?: number[];
  /**
   * R² goodness-of-fit for the linear trend model (fraction of variance explained).
   * Ranges from -∞ (worse than constant baseline) to 1.0 (perfect fit).
   * Present when series has ≥ 3 observations.
   */
  rSquared?: number;
  /**
   * 95% confidence intervals for each forecast period (parallel to `forecast`).
   * Each entry is [lower, upper] at the 95% level, computed from residual
   * standard error with n-2 degrees of freedom.
   * Present when series has ≥ 3 observations and `forecast` is populated.
   */
  confidenceIntervals?: Array<[number, number]>;
  seasonality?: { period: number; strength: number };
  decomposition?: { trend: number[]; seasonal: number[]; residual: number[] };
  exponentialForecast?: number[];
}

export interface EnhancedAnomalyResult {
  peakIndices: number[];
  peakValues: number[];
  decomposed?: { trend: number[]; seasonal: number[]; residual: number[] };
  residualPeaks?: number[];
  smoothedSeries: number[];
  originalLength: number;
}

export interface PCAResult {
  nComponents: number;
  explainedVariance: number[];
  transformedData: number[][];
  components: number[][];
  originalFeatureCount: number;
  featureNames: string[];
}
