/**
 * @wasm4pm/ml
 *
 * Native ML-powered process mining analysis.
 * Classification, clustering, forecasting, anomaly detection, PCA.
 * Zero external ML dependencies — purpose-built for process intelligence.
 */
export { buildFeatureMatrix, encodeLabels } from './bridge.js';
export { classifyTraces, regressRemainingTime } from './classifiers.js';
export { clusterTraces } from './clustering.js';
export { forecastThroughput, forecastSeries, buildThroughputSeries } from './forecasting.js';
export { detectEnhancedAnomalies } from './anomaly.js';
export { reduceFeaturesPCA } from './reduction.js';
export type { FeatureMatrix, LabelEncoding, ClassificationMethod, RegressionMethod, ClassificationResult, RegressionResult, ClusteringMethod, ClusteringResult, ThroughputForecastResult, SeriesForecastResult, EnhancedAnomalyResult, PCAResult, } from './types.js';
//# sourceMappingURL=index.d.ts.map