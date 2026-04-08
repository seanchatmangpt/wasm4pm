/**
 * Type definitions for @pictl/ml
 *
 * Result interfaces for all ML operations.
 */

/** Numeric feature matrix ready for micro-ml consumption */
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
export type RegressionMethod = 'linear_regression' | 'polynomial_regression' | 'exponential_regression';

/** Clustering method */
export type ClusteringMethod = 'kmeans' | 'dbscan';

// --- Result interfaces ---

export interface ClassificationResult {
  method: ClassificationMethod;
  predictions: Array<{ caseId: string; predicted: string; confidence: number }>;
  modelInfo: Record<string, unknown>;
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
