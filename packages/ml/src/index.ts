/**
 * @wasm4pm/ml
 *
 * Native ML-powered process mining analysis.
 * Classification, clustering, forecasting, anomaly detection, PCA.
 * Zero external ML dependencies — purpose-built for process intelligence.
 */

// Bridge utilities
export { buildFeatureMatrix, encodeLabels, selectTopFeatures, normalizeFeatures } from './bridge.js';

// Classification & regression (includes runCrossValidation for advanced usage)
export { classifyTraces, regressRemainingTime, runCrossValidation } from './classifiers.js';

// Cross-validation framework
export {
  stratifiedKFold,
  holdoutSplit,
  computeAccuracy,
  computeRMSE,
  computeMAE,
  computeRSquared,
  kFoldCrossValidation,
  holdoutValidation,
  holdoutRegressionValidation,
  type KFoldResult,
  type HoldoutResult,
  type RegressionCVResult,
} from './cross-validation.js';

// Clustering
export { clusterTraces } from './clustering.js';

// Forecasting
export { forecastThroughput, forecastSeries, buildThroughputSeries } from './forecasting.js';

// Anomaly detection
export { detectEnhancedAnomalies } from './anomaly.js';

// Dimensionality reduction
export { reduceFeaturesPCA } from './reduction.js';

// Parameter suggestions
export {
  suggestClusteringK,
  suggestPCAComponents,
  suggestAnomalyThreshold,
  suggestKnnK,
  suggestDecisionTreeDepth,
  suggestPolynomialDegree,
  suggestForecastHorizon,
  suggestClassificationAlgorithm,
  detectLogCharacteristics,
  type LogCharacteristicsDetection,
} from './parameter-suggestions.js';

// Feature quality assessment
export { assessFeatureQuality, type QualityReport } from './feature-quality.js';

// Overfitting detection
export {
  analyzeOverfitting,
  hasOverfittingConcerns,
  getOverfittingSeverity,
  type OverfittingIndicator,
  type OverfittingAnalysis,
} from './overfitting-detector.js';

// Preprocessing guards (5 critical checks)
export {
  filterZeroVarianceColumns,
  imputeMissingValues,
  capOutliers,
  scaleFeatures,
  validateSampleFeatureRatio,
  preprocessFeatures,
  type PreprocessingReport,
} from './preprocessing.js';

// Ensemble voting (deterministic tie-breaking, Rank-1 oracle)
export {
  deterministic_ensemble_vote,
  ensemble_vote_with_confidence,
  verify_voting_determinism,
  categorize_vote_distribution,
  type VoteCount,
} from './ensemble-voting.js';

// Feature importance ranking
export {
  rankFeatureImportance,
  computeCorrelationImportance,
  computeMutualInformationImportance,
  computePermutationImportance,
  type FeatureImportance,
  type FeatureImportanceResult,
} from './feature-importance.js';

// Algorithm selection (Tier 3 AUTOML Gap-14)
export {
  selectAlgorithm,
  selectClassificationAlgorithm,
  selectClusteringAlgorithm,
  selectForecastingAlgorithm,
  selectRegressionAlgorithm,
  selectPcaDimensionality,
  computeMulticollinearity,
  type AlgorithmRecommendation,
  type FeatureMatrixCharacteristics,
} from './algorithm-selection.js';

// Hyperparameter search (Tier 3 AUTOML Gap-15/16)
export {
  gridSearch,
  expandGrid,
  getBestParams,
  type ParamGrid,
  type ParamValue,
  type GridSearchResult,
} from './hyperparameter-search.js';

// Bootstrap confidence intervals (Tier 3 AUTOML Gap-17)
export {
  bootstrapCI,
  bootstrapRegressionCI,
  seededRng,
  accuracy,
  mae,
  rmse,
  f1,
  type BootstrapCIResult,
} from './confidence-intervals.js';

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
