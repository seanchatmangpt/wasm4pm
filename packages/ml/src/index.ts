/**
 * @wasm4pm/ml
 *
 * Native ML-powered process mining analysis.
 * Classification, clustering, forecasting, anomaly detection, PCA.
 * Zero external ML dependencies — purpose-built for process intelligence.
 */

// Bridge utilities
export { buildFeatureMatrix, encodeLabels } from './bridge.js';

// Classification & regression
export { classifyTraces, regressRemainingTime } from './classifiers.js';
export type { CrossValidationResult } from './classifiers.js';

// Clustering
export { clusterTraces } from './clustering.js';

// Forecasting
export { forecastThroughput, forecastSeries, buildThroughputSeries } from './forecasting.js';

// Anomaly detection
export { detectEnhancedAnomalies } from './anomaly.js';

// Dimensionality reduction
export { reduceFeaturesPCA } from './reduction.js';

// Feature quality assessment
export { assessFeatureQuality } from './feature-quality.js';
export type { FeatureQualityReport, FeatureQualityIssue } from './feature-quality.js';

// Parameter suggestions
export { suggestParameters, pickBestAlgorithm } from './parameter-suggestions.js';
export type { ParameterSuggestions, AlgorithmSuggestion } from './parameter-suggestions.js';

// Grid search and hyperparameter tuning
export { GridSearch, suggestSearchSpace, evaluateModel, findBestParams } from './hyperparameter-search.js';
export type { SearchSpace, EvaluationMetrics, ParameterEvaluation, GridSearchResult } from './hyperparameter-search.js';

// Types
export type {
  EmptyInputWarning,
  FeatureMatrix,
  LabelEncoding,
  ClassificationMethod,
  RegressionMethod,
  ClassificationResult,
  RegressionResult,
  ClusteringMethod,
  ClusteringResult,
  ThroughputForecastResult,
  SeriesForecastResult,
  EnhancedAnomalyResult,
  PCAResult,
} from './types.js';
