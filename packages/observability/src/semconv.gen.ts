// Code generated from semconv/registry — DO NOT EDIT MANUALLY.
// Source: /Users/sac/wasm4pm/semconv/registry/*.yaml
// Regenerate: weaver registry generate --registry semconv/registry --templates semconv/templates

export const PmAttributes = {
  // pm.discovery group
  DISCOVERY_ALGORITHM: 'pm.discovery.algorithm',
  DISCOVERY_INPUT_FORMAT: 'pm.discovery.input_format',
  DISCOVERY_MODEL_TYPE: 'pm.discovery.model_type',
  DISCOVERY_TRACE_COUNT: 'pm.discovery.trace_count',
  DISCOVERY_EVENT_COUNT: 'pm.discovery.event_count',
  DISCOVERY_ACTIVITY_COUNT: 'pm.discovery.activity_count',
  DISCOVERY_MODEL_FITNESS: 'pm.discovery.model_fitness',
  DISCOVERY_MODEL_PRECISION: 'pm.discovery.model_precision',
  DISCOVERY_EXECUTION_TIME_MS: 'pm.discovery.execution_time_ms',
  DISCOVERY_TIMEOUT_EXCEEDED: 'pm.discovery.timeout_exceeded',

  // pm.conformance group
  CONFORMANCE_FITNESS: 'pm.conformance.fitness',
  CONFORMANCE_PRECISION: 'pm.conformance.precision',
  CONFORMANCE_GENERALIZATION: 'pm.conformance.generalization',
  CONFORMANCE_SIMPLICITY: 'pm.conformance.simplicity',
  CONFORMANCE_DEVIATION_COUNT: 'pm.conformance.deviation_count',
  CONFORMANCE_CONFORMS: 'pm.conformance.conforms',

  // pm.analysis group
  ANALYSIS_ANALYSIS_TYPE: 'pm.analysis.analysis_type',
  ANALYSIS_METRIC_NAME: 'pm.analysis.metric_name',
  ANALYSIS_METRIC_VALUE: 'pm.analysis.metric_value',
  ANALYSIS_THRESHOLD_APPLIED: 'pm.analysis.threshold_applied',
  ANALYSIS_ANOMALY_DETECTED: 'pm.analysis.anomaly_detected',
  ANALYSIS_AFFECTED_COUNT: 'pm.analysis.affected_count',

  // pm.ocel group
  OCEL_OCEL_VERSION: 'pm.ocel.ocel_version',
  OCEL_OBJECT_TYPE_COUNT: 'pm.ocel.object_type_count',
  OCEL_EVENT_TYPE_COUNT: 'pm.ocel.event_type_count',
  OCEL_OBJECT_COUNT: 'pm.ocel.object_count',
  OCEL_PROJECTED_OBJECT_TYPE: 'pm.ocel.projected_object_type',

  // pm.prediction group
  PREDICTION_PREDICTION_TYPE: 'pm.prediction.prediction_type',
  PREDICTION_MODEL_TYPE: 'pm.prediction.model_type',
  PREDICTION_CONTEXT_LENGTH: 'pm.prediction.context_length',
  PREDICTION_PREDICTION_CONFIDENCE: 'pm.prediction.prediction_confidence',
  PREDICTION_TOP_K_CANDIDATES: 'pm.prediction.top_k_candidates',
  PREDICTION_ANOMALY_SCORE: 'pm.prediction.anomaly_score',

  // pm.drift group
  DRIFT_DRIFT_DETECTED: 'pm.drift.drift_detected',
  DRIFT_DRIFT_POINT_COUNT: 'pm.drift.drift_point_count',
  DRIFT_DRIFT_DIRECTION: 'pm.drift.drift_direction',
  DRIFT_WINDOW_SIZE: 'pm.drift.window_size',
  DRIFT_SMOOTHING_ALPHA: 'pm.drift.smoothing_alpha',
  DRIFT_MAX_DISTANCE: 'pm.drift.max_distance',

  // pm.ml group
  ML_ML_TASK: 'pm.ml.ml_task',
  ML_ALGORITHM: 'pm.ml.algorithm',
  ML_FEATURE_COUNT: 'pm.ml.feature_count',
  ML_MODEL_ACCURACY: 'pm.ml.model_accuracy',
  ML_PREDICTION_COUNT: 'pm.ml.prediction_count',
} as const;

export type PmAttributeKey = typeof PmAttributes[keyof typeof PmAttributes];

// Span names
export const PmSpans = {
  DISCOVER_DFG: 'pm.discover.dfg',
  DISCOVER_ALPHA_PLUS_PLUS: 'pm.discover.alpha_plus_plus',
  DISCOVER_ILP_OPTIMIZATION: 'pm.discover.ilp_optimization',
  DISCOVER_GENETIC_ALGORITHM: 'pm.discover.genetic_algorithm',
  DISCOVER_VARIANTS: 'pm.discover.variants',
  CHECK_CONFORMANCE: 'pm.check.conformance',
  ANALYZE_STATISTICS: 'pm.analyze.statistics',
  ANALYZE_BOTTLENECK: 'pm.analyze.bottleneck',
  ANALYZE_DRIFT: 'pm.analyze.drift',
  PREDICT_NEXT_ACTIVITY: 'pm.predict.next_activity',
  PREDICT_CASE_DURATION: 'pm.predict.case_duration',
  SCORE_ANOMALY: 'pm.score.anomaly',
  OCEL_LOAD: 'pm.ocel.load',
  OCEL_PROJECT: 'pm.ocel.project',
  ML_CLASSIFY_TRACES: 'pm.ml.classify_traces',
  ML_CLUSTER_TRACES: 'pm.ml.cluster_traces',
} as const;

export type PmSpanName = typeof PmSpans[keyof typeof PmSpans];

// Metric names
export const PmMetrics = {
  DISCOVERY_EXECUTION_TIME: 'pm.discovery.execution.time',
  CONFORMANCE_FITNESS: 'pm.conformance.fitness',
  DRIFT_DISTANCE: 'pm.drift.distance',
  PREDICTION_CONFIDENCE: 'pm.prediction.confidence',
} as const;

export type PmMetricName = typeof PmMetrics[keyof typeof PmMetrics];
