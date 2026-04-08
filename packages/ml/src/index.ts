/**
 * @pictl/ml
 *
 * Native ML-powered process mining analysis.
 * Classification, clustering, forecasting, anomaly detection, PCA.
 * Zero external ML dependencies — purpose-built for process intelligence.
 */

// Bridge utilities
export { buildFeatureMatrix, encodeLabels } from './bridge.js';

// Classification & regression
export { classifyTraces, regressRemainingTime } from './classifiers.js';

// Clustering
export { clusterTraces } from './clustering.js';

// Forecasting
export { forecastThroughput, forecastSeries, buildThroughputSeries } from './forecasting.js';

// Anomaly detection
export { detectEnhancedAnomalies } from './anomaly.js';

// Dimensionality reduction
export { reduceFeaturesPCA } from './reduction.js';

// Types
export type {
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
