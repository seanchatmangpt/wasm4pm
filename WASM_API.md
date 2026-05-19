# WASM API Reference

**All public Rust→JavaScript exports via `wasm-bindgen`.**

## Initialization

| Function | Returns | Description |
|----------|---------|-------------|
| `init()` | `Result<String, JsValue>` | Initialize WASM module (call once before other functions) |
| `get_version()` | `String` | Crate version (CalVer) |
| `get_capabilities()` | `String` (JSON) | Feature flags and available algorithms |
| `clear_all_caches()` | void | Clear parse, columnar, and interner caches |
| `get_cache_stats()` | `String` (JSON) | Cache hit/miss/size statistics |

## Event Log I/O

| Function | Returns | Description |
|----------|---------|-------------|
| `load_eventlog_from_json(content)` | `Result<String, JsValue>` | Parse JSON event log, returns handle |
| `load_eventlog_from_xes(content)` | `Result<String, JsValue>` | Parse XES event log, returns handle |
| `load_ocel_from_json(content)` | `Result<String, JsValue>` | Parse OCEL JSON, returns handle |
| `load_ocel_from_xml(content)` | `Result<String, JsValue>` | Parse OCEL XML, returns handle |
| `export_eventlog_to_json(handle)` | `Result<String, JsValue>` | Export event log to JSON |
| `export_ocel_to_json(handle)` | `Result<String, JsValue>` | Export OCEL to JSON |
| `get_ocel_event_count(handle)` | `Result<usize, JsValue>` | Count events in OCEL |
| `get_ocel_object_count(handle)` | `Result<usize, JsValue>` | Count objects in OCEL |

## Discovery Algorithms

### Core (discovery.rs)

| Function | Returns | Algorithm |
|----------|---------|-----------|
| `discover_dfg(handle, activity_key)` | `Result<JsValue, JsValue>` | Directly-Follows Graph |
| `discover_dfg_handle(handle, activity_key)` | `Result<JsValue, JsValue>` | DFG (alternative handle) |
| `discover_ocel_dfg(handle)` | `Result<JsValue, JsValue>` | OCEL DFG |
| `discover_ocel_dfg_per_type(handle)` | `Result<JsValue, JsValue>` | OCEL per-type DFG |
| `discover_declare(handle, activity_key)` | `Result<JsValue, JsValue>` | Declare constraints |
| `available_discovery_algorithms()` | `JsValue` | List all discovery algorithms |

### Alpha / Heuristic (algorithms.rs)

| Function | Returns | Algorithm |
|----------|---------|-----------|
| `discover_alpha_plus_plus(handle, activity_key, min_support)` | `Result<JsValue, JsValue>` | Alpha++ Petri net (min_support: f64 threshold [0,1], 0.0 = no filtering) |
| `discover_dfg_filtered(handle, activity_key, threshold)` | `Result<JsValue, JsValue>` | Filtered DFG |
| `export_dfg_to_json(handle)` | `Result<String, JsValue>` | Export DFG |
| `export_petri_net_to_json(handle)` | `Result<String, JsValue>` | Export Petri net |

### Advanced (advanced_algorithms.rs)

| Function | Returns | Algorithm |
|----------|---------|-----------|
| `discover_heuristic_miner(handle, activity_key, threshold)` | `Result<JsValue, JsValue>` | Heuristic Miner |
| `analyze_infrequent_paths(handle, activity_key, threshold)` | `Result<JsValue, JsValue>` | Infrequent paths |
| `detect_rework(handle, activity_key)` | `Result<JsValue, JsValue>` | Rework detection |
| `detect_bottlenecks(handle, activity_key)` | `Result<JsValue, JsValue>` | Bottleneck detection |
| `compute_model_metrics(handle)` | `Result<JsValue, JsValue>` | Model quality metrics |

### Fast (fast_discovery.rs)

| Function | Returns | Algorithm |
|----------|---------|-----------|
| `discover_astar(handle, activity_key)` | `Result<JsValue, JsValue>` | A* Petri net discovery |
| `discover_hill_climbing(handle, activity_key)` | `Result<JsValue, JsValue>` | Hill climbing Petri net |
| `analyze_trace_variants(handle, activity_key)` | `Result<JsValue, JsValue>` | Trace variant analysis |
| `mine_sequential_patterns(handle, activity_key, min_support)` | `Result<JsValue, JsValue>` | Sequential pattern mining |
| `detect_concept_drift(handle, activity_key, window_size)` | `Result<JsValue, JsValue>` | Concept drift detection |
| `cluster_traces(handle, activity_key, num_clusters)` | `Result<JsValue, JsValue>` | Trace clustering |
| `analyze_start_end_activities(handle, activity_key)` | `Result<JsValue, JsValue>` | Start/end activity analysis |
| `analyze_activity_cooccurrence(handle, activity_key)` | `Result<JsValue, JsValue>` | Activity co-occurrence |

### More Discovery (more_discovery.rs)

| Function | Returns | Algorithm |
|----------|---------|-----------|
| `discover_inductive_miner(handle, activity_key)` | `Result<JsValue, JsValue>` | Inductive Miner process tree |
| `discover_ant_colony(handle, activity_key)` | `Result<JsValue, JsValue>` | ACO Petri net |
| `discover_simulated_annealing(handle, activity_key)` | `Result<JsValue, JsValue>` | Simulated annealing Petri net |
| `extract_process_skeleton(handle, activity_key)` | `Result<JsValue, JsValue>` | Process skeleton |
| `analyze_activity_dependencies(handle, activity_key)` | `Result<JsValue, JsValue>` | Activity dependency analysis |
| `analyze_case_attributes(handle, activity_key)` | `Result<JsValue, JsValue>` | Case attribute analysis |

### Genetic / Metaheuristic (genetic_discovery.rs)

| Function | Returns | Algorithm |
|----------|---------|-----------|
| `discover_genetic_algorithm(handle, activity_key, generations, population)` | `Result<JsValue, JsValue>` | Genetic algorithm Petri net |
| `discover_pso_algorithm(handle, activity_key, iterations, particles)` | `Result<JsValue, JsValue>` | PSO Petri net |
| `discover_aco_algorithm(handle, activity_key, iterations, ants)` | `Result<JsValue, JsValue>` | ACO Petri net |

### ILP (ilp_discovery.rs)

| Function | Returns | Algorithm |
|----------|---------|-----------|
| `wasm_compute_simplicity(places, transitions, arcs)` | `f64` | Simplicity metric |
| `discover_ilp_petri_net(handle, activity_key)` | `Result<JsValue, JsValue>` | ILP Petri net (highest quality) |
| `discover_optimized_dfg(handle, activity_key)` | `Result<JsValue, JsValue>` | Optimized DFG |

## Conformance

| Function | Returns | Description |
|----------|---------|-------------|
| `check_token_based_replay(handle, activity_key)` | `Result<JsValue, JsValue>` | Token-based replay fitness |
| `simd_token_replay(handle, activity_key)` | `String` (JSON) | SIMD-accelerated token replay |

## Analysis

| Function | Returns | Description |
|----------|---------|-------------|
| `analyze_dotted_chart(handle)` | `Result<JsValue, JsValue>` | Dotted chart analysis |
| `analyze_event_statistics(handle)` | `Result<JsValue, JsValue>` | Event statistics |
| `analyze_ocel_statistics(handle)` | `Result<JsValue, JsValue>` | OCEL statistics |
| `analyze_case_duration(handle)` | `Result<JsValue, JsValue>` | Case duration analysis |
| `analyze_variant_complexity(handle, activity_key)` | `Result<JsValue, JsValue>` | Variant complexity |
| `compute_activity_transition_matrix(handle, activity_key)` | `Result<JsValue, JsValue>` | Transition matrix |
| `analyze_process_speedup(handle, activity_key)` | `Result<JsValue, JsValue>` | Process speedup |
| `compute_trace_similarity_matrix(handle, activity_key)` | `Result<JsValue, JsValue>` | Trace similarity |
| `analyze_temporal_bottlenecks(handle, activity_key)` | `Result<JsValue, JsValue>` | Temporal bottlenecks |
| `extract_activity_ordering(handle, activity_key)` | `Result<JsValue, JsValue>` | Activity ordering |

## Prediction

### Next Activity (prediction_next_activity.rs)

Answers **"What activity comes next?"** using n-gram language models trained from event logs.

| Function | Returns | Description |
|----------|---------|-------------|
| `build_ngram_predictor(handle, activity_key, order)` | `Result<String, JsValue>` | Build n-gram model (n=2 recommended for order parameter) |
| `predict_next_activity(model_handle, trace_json, top_k)` | `Result<JsValue, JsValue>` | Next activity prediction with probabilities |
| `score_trace_likelihood(model_handle, trace_json)` | `Result<JsValue, JsValue>` | Trace likelihood scoring (raw float) |

**Example: Next Activity Prediction**

```typescript
const wasm = require('./pkg/wasm4pm.js');

// 1. Build model from event log
const logHandle = wasm.load_eventlog_from_xes(xesContent);
const modelHandle = wasm.build_ngram_predictor(logHandle, 'concept:name', 2);

// 2. Predict next activities for a running trace
const prefix = JSON.stringify(['Register', 'Examine', 'Decide']);
const predictions = JSON.parse(wasm.predict_next_activity(modelHandle, prefix, 5));
// predictions = [
//   { activity: 'Notify', probability: 0.45 },
//   { activity: 'Approve', probability: 0.35 },
//   ...
// ]

// 3. Score a complete trace
const trace = JSON.stringify(['Register', 'Examine', 'Decide', 'Notify', 'Archive']);
const likelihood = JSON.parse(wasm.score_trace_likelihood(modelHandle, trace));
// likelihood = { result: -2.5 } (log-likelihood)
```

**Input/Output Shapes**

- `build_ngram_predictor(handle: string, activity_key: string, order: number)` → `{ handle: string }` (JSON, wrapped in Result)
- `predict_next_activity(model_handle: string, trace_json: string, top_k: usize)` → `[{ activity: string, probability: f64 }, ...]` (JSON, top-k sorted by descending probability)
- `score_trace_likelihood(model_handle: string, trace_json: string)` → `{ result: f64 }` (raw log-likelihood)

---

### Remaining Time (prediction_remaining_time.rs)

Answers **"When will this case complete?"** using Weibull survival models and conditional remaining-time statistics.

| Function | Returns | Description |
|----------|---------|-------------|
| `build_remaining_time_model(handle, activity_key, timestamp_key)` | `Result<String, JsValue>` | Train model from completed traces |
| `predict_case_duration(model_handle, prefix_json)` | `Result<JsValue, JsValue>` | Estimate remaining time for a prefix |
| `predict_hazard_rate(model_handle, elapsed_ms)` | `Result<JsValue, JsValue>` | Instantaneous hazard at elapsed time |

**Theory: Weibull Regression**

The model fits a Weibull distribution `W(k, λ)` to observed case durations:
- **Shape parameter k**: < 1.0 = decreasing hazard (early completion preferred), > 1.0 = increasing hazard (late failure risk)
- **Scale parameter λ**: characteristic time in milliseconds
- **Hazard function**: `h(t) = (k/λ) * (t/λ)^(k-1)` — instantaneous failure rate at time *t*

For each prefix (identified by last activity and prefix length), the model records empirical statistics:
- Mean remaining time (conditional on prefix state)
- Standard deviation of remaining time
- Count of observations in that state

**Example: Remaining Time Prediction**

```typescript
const wasm = require('./pkg/wasm4pm.js');

// 1. Build model from event log with timestamps
const logHandle = wasm.load_eventlog_from_xes(xesContent);
const modelHandle = wasm.build_remaining_time_model(
  logHandle,
  'concept:name',      // activity key
  'time:timestamp'     // timestamp key (ISO 8601 or milliseconds)
);

// 2. Predict remaining time for a running case
const prefix = JSON.stringify(['Register', 'Examine', 'Decide']);
const prediction = JSON.parse(wasm.predict_case_duration(modelHandle, prefix));
// prediction = {
//   remaining_ms: 5400000,                  // 90 minutes
//   lower_bound_ms: 3600000,                // lower quartile
//   upper_bound_ms: 8100000,                // upper quartile
//   std_ms: 1200000,                        // uncertainty
//   matched_prefix_states: 47               // observed traces with this prefix
// }

// 3. Compute hazard rate at elapsed time
const hazardResult = JSON.parse(wasm.predict_hazard_rate(modelHandle, 1800000.0));
// hazardResult = {
//   hazard: 0.00008,                        // instantaneous failure rate
//   survival_prob: 0.92,                    // P(duration > t)
//   interpretation: "Low hazard; case likely to complete"
// }
```

**ML-Based Regression Alternative**

For large event logs (>1000 traces), remaining-time prediction can use linear regression on extracted features instead of Weibull survival models. The CLI supports method selection:

```bash
# Weibull model (default for small logs)
wpm predict remaining-time -i log.xes --prefix "Register,Approve"

# Linear regression on trace features (better for large logs)
wpm predict remaining-time -i log.xes --method regress

# Auto-detection based on log size
wpm predict remaining-time -i log.xes --method auto

# Ensemble (average both methods)
wpm predict remaining-time -i log.xes --method hybrid
```

**Regress Method Features**

When `--method regress` is used, the following trace features are extracted:
- `trace_length`: Number of activities completed
- `elapsed_time`: Duration since case start (milliseconds)
- `activity_frequencies`: One-hot encoded activity occurrence counts
- `avg_inter_event_time`: Mean time between consecutive events (milliseconds)
- `cycle_count`: Number of rework instances (repeated activities)

These features are normalized to [0,1] and used for linear regression to predict remaining case duration.

**Input/Output Shapes**

- `build_remaining_time_model(handle: string, activity_key: string, timestamp_key: string)` → `{ handle: string }` (JSON, wrapped in Result)
- `predict_case_duration(model_handle: string, prefix_json: string)` → `{ remaining_ms: f64, lower_bound_ms: f64, upper_bound_ms: f64, std_ms: f64, matched_prefix_states: usize }`
- `predict_hazard_rate(model_handle: string, elapsed_ms: f64)` → `{ hazard: f64, survival_prob: f64, interpretation: string }`

---

### Outcome (prediction_outcome.rs)

Answers **"Will this case complete normally?"** using anomaly scoring, boundary coverage, and trace likelihood.

| Function | Returns | Description |
|----------|---------|-------------|
| `score_anomaly(model_handle, trace_json)` | `Result<JsValue, JsValue>` | Anomaly score for a trace against DFG model |
| `compute_boundary_coverage(log_handle, prefix_json, activity_key)` | `Result<JsValue, JsValue>` | Coverage of prefix against observed completions |
| `compute_trace_likelihood(model_handle, trace_json)` | `Result<JsValue, JsValue>` | Structured trace likelihood (raw + normalized) |

**Theory: Anomaly Scoring**

Anomaly score measures deviation from a learned DFG model using Shannon self-information:
- **Cost per step**: `-log₂(p)` bits, where `p` is the edge probability in the model
- **Missing edges**: Penalized with a fixed 10-bit cost
- **Normalization**: `score = 1 - exp(-raw_cost / scale)`, where `scale = 5.0` (calibrated threshold)
- **Threshold**: `score > 0.7` → classified as anomalous

**Boundary coverage** measures the fraction of matching trace prefixes that complete "normally" (within 2σ of median completion length).

**Example: Outcome Prediction**

```typescript
const wasm = require('./pkg/wasm4pm.js');

// 1. Build DFG model and get handle
const logHandle = wasm.load_eventlog_from_xes(xesContent);
const dfgHandle = wasm.discover_dfg(logHandle, 'concept:name');

// 2. Score a trace for anomaly
const trace = JSON.stringify(['Register', 'Check', 'Approve', 'Notify', 'Archive']);
const anomaly = JSON.parse(wasm.score_anomaly(dfgHandle, trace));
// anomaly = {
//   score: 0.35,                            // 0.35 < 0.7 → normal
//   is_anomalous: false,
//   threshold: 0.7,
//   raw_cost: 1.2,                          // bits per step
//   missing_edge_ratio: 0.0,                // no missing edges
//   edge_coverage: 1.0,                     // 100% of edges observed in model
//   steps: 4                                // number of transitions
// }

// 3. Measure boundary coverage for a prefix
const prefix = JSON.stringify(['Register', 'Check']);
const coverage = JSON.parse(wasm.compute_boundary_coverage(
  logHandle,
  prefix,
  'concept:name'
));
// coverage = {
//   coverage: 0.85,                         // 85% of matching cases complete normally
//   matching_traces: 120,                   // traces starting with this prefix
//   normal_completions: 102                 // cases with normal length
// }

// 4. Score trace likelihood (n-gram model)
const modelHandle = wasm.build_ngram_predictor(logHandle, 'concept:name', 2);
const likelihood = JSON.parse(wasm.compute_trace_likelihood(modelHandle, trace));
// likelihood = {
//   log_likelihood: -4.5,                   // raw sum of log-probabilities
//   normalized: -1.125                      // per-step average
// }
```

**Input/Output Shapes**

- `score_anomaly(model_handle: string, trace_json: string)` → `{ score: f64, is_anomalous: bool, threshold: f64, raw_cost: f64, missing_edge_ratio: f64, edge_coverage: f64, steps: usize }`
- `compute_boundary_coverage(log_handle: string, prefix_json: string, activity_key: string)` → `{ coverage: f64, matching_traces: usize, normal_completions: usize }`
- `compute_trace_likelihood(model_handle: string, trace_json: string)` → `{ log_likelihood: f64, normalized: f64 }`

**Classification Method (TypeScript ML)**

For outcome prediction with labeled data, use ML classification via `@wasm4pm/ml`. This requires feature extraction and supervised learning:

```typescript
import {
  extractOutcomeFeatures,
  classifyTraces,
  normalizeOutcomeFeatures,
} from '@wasm4pm/ml';

// 1. Extract outcome features from WASM feature matrix
const configJson = JSON.stringify({
  features: [
    'trace_length',
    'elapsed_time',
    'activity_counts',
    'rework_count',
    'unique_activities',
    'avg_inter_event_time',
  ],
  target: 'outcome',
});

const rawFeatures = wasm.extract_case_features(
  logHandle,
  'concept:name',
  'time:timestamp',
  configJson
);
const featuresArray = JSON.parse(rawFeatures);

// 2. Extract outcome features for classification
const featureMatrix = extractOutcomeFeatures(featuresArray);
const normalized = normalizeOutcomeFeatures(featureMatrix);

// 3. Run classifier (k-NN, logistic regression, decision tree)
const result = await classifyTraces(normalized, {
  method: 'knn',
  k: 5,
});

// result = {
//   predictions: [
//     { predicted_label: 'hired', confidence: 0.85, topK: [...] },
//     { predicted_label: 'rejected', confidence: 0.92, topK: [...] }
//   ],
//   method: 'knn'
// }
```

**Features Extracted for Outcome:**
- `trace_length` — number of activities
- `elapsed_time` — duration from start to finish (ms)
- `avg_inter_event_time` — mean time between consecutive events (ms)
- `rework_ratio` — fraction of repeated activities [0, 1]
- `cycle_count` — number of rework instances
- `resource_variance` — diversity of resources [0, 1]
- `unique_activities` — distinct activity count
- `activity_*` — one-hot encoded activity frequencies

**Hybrid Method**

The `wpm predict outcome` command supports `--method hybrid` to ensemble anomaly scoring with ML classification:

```bash
wpm predict outcome -i log.xes --method hybrid --top-k 5
```

This combines:
1. **Anomaly scoring** (WASM-based, fast)
2. **ML classification** (TypeScript-based, accurate)
3. **Confidence voting** for final predictions

---

### Drift Detection (prediction_drift.rs + ML Integration)

Answers **"Has the process changed?"** using three complementary methods:
- **Jaccard** (WASM-based): Similarity on activity vocabulary
- **Anomaly** (ML-based): Peak detection and residual decomposition on Jaccard distances
- **Hybrid** (both): Consensus scoring for high-confidence drift signals

| Function | Returns | Description |
|----------|---------|-------------|
| `detect_drift(handle, activity_key, window_size)` | `Result<JsValue, JsValue>` | Detect concept drift via Jaccard distance (WASM primitive) |
| `compute_ewma(values_json, alpha)` | `Result<JsValue, JsValue>` | Exponentially weighted moving average |

**Note:** ML-based anomaly integration is available via the TypeScript `@wasm4pm/ml` package. Use `executeMlTask(wasm, 'drift', logHandle, activityKey, { driftMethod: 'anomaly' | 'hybrid' })`.

**Theory: Drift Detection**

Three complementary approaches:

1. **Jaccard Distance** (WASM primitive, fast):
   - Compares activity vocabularies in consecutive trace windows
   - `J_distance = 1 - |A ∩ B| / |A ∪ B|`
   - Range: [0.0, 1.0] where 0.0 = no change, 1.0 = completely different
   - Default threshold: 0.3 (drift signal when distance > threshold)

2. **EWMA Trend Analysis** (WASM primitive, auxiliary):
   - Recursively smooths a numeric series: `s[i+1] = α·x[i+1] + (1−α)·s[i]`
   - Higher α (e.g., 0.3) weights recent values; lower α (e.g., 0.05) smooths long-term trends
   - Trend classification: `rising`, `falling`, or `stable` (within 5% of max range)

3. **ML-Based Anomaly Detection** (TypeScript, refinement over Jaccard):
   - Windowed feature extraction: mean distance, max distance, trend slope, autocorrelation
   - Peak detection via smoothing (SMA/EMA) and seasonal decomposition
   - Residual anomaly scoring: identifies persistent deviations from expected behavior
   - Scoring methods: `equal` (simple average) or `weighted` (prioritizes residuals)

**Example: Drift Detection — Three Methods**

```typescript
const wasm = require('./pkg/wasm4pm.js');
const { executeMlTask } = require('@wasm4pm/ml');

// 1. WASM-based Jaccard drift detection (fast)
const logHandle = wasm.load_eventlog_from_xes(xesContent);
const driftEvents = JSON.parse(wasm.detect_drift(
  logHandle,
  'concept:name',      // activity key
  10                   // window size: compare every 10 consecutive traces
));
// driftEvents = [
//   {
//     window_index: 5,
//     distance: 0.45,
//     is_drift: true,
//     activities_added: ['NewActivity'],
//     activities_removed: ['ObsoleteActivity']
//   },
//   ...
// ]

// 2. ML-based anomaly detection (identifies peak drifts)
const result = await executeMlTask(
  wasm,
  'drift',
  logHandle,
  'concept:name',
  { driftMethod: 'anomaly', driftWindowSize: 10 }
);
// result = {
//   method: 'anomaly',
//   distances: [0.1, 0.2, 0.8, 0.1, ...],  // Jaccard distances from WASM
//   features: [
//     {
//       window_index: 0,
//       mean_distance: 0.15,
//       max_distance: 0.2,
//       std_distance: 0.05,
//       trend_slope: 0.01,
//       autocorr_lag1: 0.3,
//       peak_count: 0,
//       residual_anomaly_score: 0.1,
//       is_anomalous: false
//     },
//     ...
//   ],
//   anomalies: {
//     anomalous_indices: [2, 5, 7],        // Windows with detected anomalies
//     anomaly_scores: [0.8, 0.75, 0.72],
//     threshold: 0.7,
//     count: 3
//   }
// }

// 3. Hybrid method (consensus: both Jaccard + anomaly agree)
const hybridResult = await executeMlTask(
  wasm,
  'drift',
  logHandle,
  'concept:name',
  { driftMethod: 'hybrid', driftWindowSize: 10 }
);
// hybridResult = {
//   method: 'hybrid',
//   distances: [...],
//   drifts_detected: 8,
//   features: [...],
//   anomalies: {...},
//   combined_assessment: {
//     jaccard_consensus: 8,                // WASM detected 8 drifts
//     ml_anomalies: 3,                     // ML detected 3 anomalies
//     agreement_ratio: 0.375               // 3/8 agreement
//   }
// }

// 4. EWMA trend analysis (auxiliary, for smoothing)
const metricValues = JSON.stringify([
  0.8, 0.82, 0.81, 0.79, 0.75, 0.72, 0.68
]);
const ewmaResult = JSON.parse(wasm.compute_ewma(metricValues, 0.3));
// ewmaResult = {
//   smoothed_values: [0.8, 0.81, 0.81, 0.80, 0.77, 0.74, 0.71],
//   trend: "falling",
//   initial_value: 0.8,
//   final_value: 0.71,
//   rate_of_change: -0.09
// }
```

**Input/Output Shapes**

- `detect_drift(handle: string, activity_key: string, window_size: usize)` → `[{ window_index: usize, distance: f64, is_drift: bool, activities_added: string[], activities_removed: string[] }, ...]`
- `compute_ewma(values_json: string, alpha: f64)` → `{ smoothed_values: f64[], trend: "rising" | "falling" | "stable", initial_value: f64, final_value: f64, rate_of_change: f64 }`

**Thresholds**

- Drift detection: default threshold = 0.3 (configurable via `set_drift_thresholds()`)
- Trend stability: ±5% of max(|first|, |last|) classifies as stable

---

### Features & Rework (prediction_features.rs)

Answers **"What features characterize this case?"** and **"How much rework occurred?"** using prefix feature extraction and rework scoring.

| Function | Returns | Description |
|----------|---------|-------------|
| `extract_prefix_features_wasm(prefix_json)` | `Result<JsValue, JsValue>` | Extract features from a trace prefix |
| `compute_rework_score(trace_json)` | `Result<JsValue, JsValue>` | Measure rework via consecutive activity repeats |
| `build_transition_probabilities(log_handle, activity_key)` | `Result<JsValue, JsValue>` | Transition probability graph |

**Theory: Prefix Features**

For a trace prefix `[A, B, C, D]`:
- **Length**: 4 events
- **Last activity**: 'D'
- **Unique activities**: cardinality of {A, B, C, D}
- **Rework count**: number of consecutive repeats (e.g., if trace = [A, A, B, C], rework_count = 1)
- **Activity frequency entropy**: `-Σ (freq[a] / len) · log₂(freq[a] / len)` — uncertainty in activity distribution

**Rework Scoring**: Measures process inefficiency via repeated consecutive activities.
- `rework_count`: absolute number of repeats
- `rework_ratio = rework_count / (trace.length - 1)` — proportion of steps that repeat
- `repeated_pairs`: list of `"A→A"` transitions for diagnosis

**Example: Feature Extraction**

```typescript
const wasm = require('./pkg/wasm4pm.js');

// 1. Extract prefix features for ML models
const prefix = JSON.stringify(['Register', 'Examine', 'Examine', 'Decide']);
const features = JSON.parse(wasm.extract_prefix_features_wasm(prefix));
// features = {
//   length: 4,
//   last_activity: 'Decide',
//   unique_activities: 3,
//   rework_count: 1,
//   activity_frequency_entropy: 1.4
// }

// 2. Compute rework metrics
const trace = JSON.stringify(['A', 'B', 'B', 'C', 'C', 'C', 'D']);
const rework = JSON.parse(wasm.compute_rework_score(trace));
// rework = {
//   rework_count: 3,                        // 3 consecutive repeats (1 B→B, 2 C→C)
//   rework_ratio: 0.5,                      // 50% of transitions are repeats
//   repeated_pairs: ['B→B', 'C→C', 'C→C']
// }

// 3. Build transition probability graph
const logHandle = wasm.load_eventlog_from_xes(xesContent);
const graph = JSON.parse(wasm.build_transition_probabilities(logHandle, 'concept:name'));
// graph = {
//   edges: [
//     { from: 'Register', to: 'Examine', probability: 0.95, count: 95 },
//     { from: 'Examine', to: 'Decide', probability: 0.88, count: 88 },
//     ...
//   ],
//   activities: ['Register', 'Examine', 'Decide', 'Notify', 'Archive']
// }
```

**Input/Output Shapes**

- `extract_prefix_features_wasm(prefix_json: string)` → `{ length: usize, last_activity: string, unique_activities: usize, rework_count: usize, activity_frequency_entropy: f64 }`
- `compute_rework_score(trace_json: string)` → `{ rework_count: usize, rework_ratio: f64, repeated_pairs: string[] }`
- `build_transition_probabilities(log_handle: string, activity_key: string)` → `{ edges: [{ from: string, to: string, probability: f64, count: usize }, ...], activities: string[] }`

---

### Resource & Intervention (prediction_resource.rs)

Answers **"What action should be taken?"** and **"How long will a resource wait?"** using queueing theory (M/M/1) and multi-armed bandit (UCB1) intervention selection.

| Function | Returns | Description |
|----------|---------|-------------|
| `estimate_queue_delay(arrival_rate, service_rate)` | `Result<JsValue, JsValue>` | M/M/1 queue wait-time estimation |
| `rank_interventions(interventions_json, exploitation_weight)` | `Result<JsValue, JsValue>` | Rank candidate interventions by utility |
| `select_intervention(bandit_json, exploration_factor)` | `Result<JsValue, JsValue>` | UCB1 bandit selection for stateful intervention allocation |

**Theory: M/M/1 Queueing Model**

Estimates steady-state queue delay for a single-server queue with Poisson arrivals and exponential service times:
- **Utilization**: `ρ = λ / μ` (arrival rate / service rate)
- **Stability**: `ρ < 1.0` required; else queue grows without bound
- **Mean wait time**: `W = (1/μ) / (1 - ρ)` — time in queue before service
- **Wait time is stable** only if `ρ < 1.0`

**Theory: UCB1 Bandit Algorithm**

Stateful multi-armed bandit for intervention selection over repeated cycles:
- **Forced exploration**: Always try an untested arm first
- **UCB score**: `mean_reward + c · sqrt(ln(total_pulls) / pull_count)` where `c ≈ √2`
- **Selection**: Greedy argmax over UCB scores (exploitation vs exploration trade-off)

**Example: Resource Allocation**

```typescript
const wasm = require('./pkg/wasm4pm.js');

// 1. Estimate queue delay for a resource pool
const queueResult = JSON.parse(wasm.estimate_queue_delay(
  2.5,                 // arrival rate: 2.5 requests/minute
  3.0                  // service rate: 3.0 requests/minute
));
// queueResult = {
//   wait_time: 60000,                       // 60 seconds expected wait
//   utilization: 0.833,                     // 83.3% utilization
//   is_stable: true                         // queue will not explode
// }

// 2. Rank candidate interventions by utility
const interventions = JSON.stringify([
  { name: "add_worker", utility: 0.8 },
  { name: "optimize_process", utility: 0.6 },
  { name: "escalate_case", utility: 0.4 }
]);
const ranked = JSON.parse(wasm.rank_interventions(
  interventions,
  0.7                  // exploit 70%, explore 30%
));
// ranked = [
//   { name: 'add_worker', score: 0.73, rank: 1 },
//   { name: 'optimize_process', score: 0.52, rank: 2 },
//   { name: 'escalate_case', score: 0.37, rank: 3 }
// ]

// 3. Stateful UCB1 bandit for repeated intervention selection
let banditState = {
  arms: [
    { name: 'add_worker', total_reward: 4.5, pull_count: 5 },
    { name: 'optimize_process', total_reward: 2.0, pull_count: 4 },
    { name: 'escalate_case', total_reward: 0.5, pull_count: 2 }
  ],
  total_pulls: 11
};

const selection = JSON.parse(wasm.select_intervention(
  JSON.stringify(banditState),
  Math.SQRT2                  // exploration factor (≈ 1.414)
));
// selection = {
//   selected: 'add_worker',
//   arm_index: 0,
//   ucb_score: 1.24,                       // mean + exploration bonus
//   mean_reward: 0.9,                      // 4.5 / 5
//   exploration_bonus: 0.34
// }

// 4. Update bandit state and continue learning
banditState.arms[selection.arm_index].total_reward += 1.0;
banditState.arms[selection.arm_index].pull_count += 1;
banditState.total_pulls += 1;
```

**Input/Output Shapes**

- `estimate_queue_delay(arrival_rate: f64, service_rate: f64)` → `{ wait_time: f64, utilization: f64, is_stable: bool }`
- `rank_interventions(interventions_json: string, exploitation_weight: f64)` → `[{ name: string, score: f64, rank: usize }, ...]`
- `select_intervention(bandit_json: string, exploration_factor: f64)` → `{ selected: string, arm_index: usize, ucb_score: f64, mean_reward: f64, exploration_bonus: f64 }`

**BanditState JSON Schema**

```json
{
  "arms": [
    { "name": "intervention_name", "total_reward": 4.5, "pull_count": 5 },
    ...
  ],
  "total_pulls": 11
}
```

## Drift Thresholds

| Function | Returns | Description |
|----------|---------|-------------|
| `set_drift_thresholds(low, high)` | `Result<String, JsValue>` | Set drift thresholds (0.0-1.0) |
| `get_drift_thresholds()` | `String` (JSON) | Get current thresholds |
| `reset_drift_thresholds()` | `String` | Reset to defaults (0.3, 0.7) |

## Autonomic Loop

| Function | Returns | Description |
|----------|---------|-------------|
| `autonomic_execute_cycle(handle, activity_key, ...)` | `Result<String, JsValue>` | Execute one autonomic cycle (observe→select→act→reward→update) |

## RL Orchestrator

| Function | Returns | Description |
|----------|---------|-------------|
| `rl_orchestrator_reset()` | `Result<String, JsValue>` | Reset to fresh state |
| `rl_orchestrator_active_agent()` | `Result<u8, JsValue>` | Get active agent (0-4) |
| `rl_orchestrator_switch_agent(type)` | `Result<String, JsValue>` | Switch agent (0=Q, 1=SARSA, 2=DQ, 3=ESARSA, 4=REINFORCE) |
| `rl_orchestrator_set_linucb(enabled)` | `Result<String, JsValue>` | Enable/disable LinUCB selection |
| `rl_orchestrator_telemetry()` | `Result<String, JsValue>` | Telemetry as JSON string |
| `rl_orchestrator_get_telemetry()` | `Result<JsValue, JsValue>` | Telemetry as JsValue |
| `serialize_rl_state()` | `Result<String, JsValue>` | Serialize state to JSON |
| `restore_rl_state(json)` | `Result<String, JsValue>` | Restore state from JSON |

## RL State

| Function | Returns | Description |
|----------|---------|-------------|
| `create_rl_state(health, event_rate, activity_count, spc, drift, rework, circuit, cycle)` | `RlState` | Create state manually |
| `rl_state_from_features(features, health, rework)` | `RlState` | Create from feature vector |
| `rl_state_health_level(state)` | `u8` | Get health level (0-4) |

## Circuit Breaker

| Function | Returns | Description |
|----------|---------|-------------|
| `circuit_breaker_configure(json)` | `Result<String, JsValue>` | Configure from JSON |
| `circuit_breaker_get_config()` | `Result<String, JsValue>` | Get configuration |
| `circuit_breaker_reset()` | `Result<String, JsValue>` | Reset to defaults |

## AutoMembrane (feature: miniml — fog/browser profiles only)

Pre-execution conformance membrane with five layers: actor → object → route → automl → custody.
Available when compiled with `--features fog` or `--features browser` (or `--features miniml`).

### Verdict Hierarchy (lowest to highest precedence)

`Allow < AllowWithReceipt < Warn < Escalate < RequireEvidence < Quarantine < Deny < StopLine`

Conservative composition: the final verdict is the highest-precedence verdict across all layers.
If any layer issues `StopLine`, the entire membrane halts regardless of other layers.
`Deny` beats `RequireEvidence`, `Escalate`, `Warn`.

### High-Stakes Action Keywords (custody layer)

The custody layer blocks `approve`, `release`, and `transfer` (substring match, case-insensitive)
when `claimed_evidence` is empty. Supply at least one evidence artefact to pass custody.

### RequestMotion JSON Schema

```json
{
  "request_id": "req-001",
  "actor": "user@example.com",
  "role": "analyst",
  "origin_system": "erp-001",
  "target_system": "crm-002",
  "object_ids": ["ORDER-123"],
  "object_types": ["order"],
  "requested_action": "approve",
  "claimed_evidence": ["TOKEN-XYZ"],
  "timestamp_ms": 1714940400000,
  "route_context": "checkout-flow",
  "deployment_profile": null
}
```

Fields `role`, `origin_system`, `target_system`, `route_context`, `deployment_profile`,
and `timestamp_ms` are optional (`null` accepted). `object_ids`, `object_types`, and
`claimed_evidence` default to empty arrays.

### VerdictReceipt JSON Schema

```json
{
  "request_id": "req-001",
  "final_verdict": "require_evidence",
  "decisive_layer": "custody",
  "downstream_admitted": false,
  "explanation": "Verdict: REQUIRE_EVIDENCE\nDecisive layer: custody\n...",
  "model_version": "automembrane-v1",
  "state_snapshot": "a3f1b2c4d5e6f789",
  "timestamp_ms": 1714940400000.0,
  "missing_evidence": ["approval_chain"],
  "layer_verdicts": [
    {
      "layer": "actor",
      "verdict": "allow",
      "confidence": 0.5,
      "reason": "Actor 'alice' is present; deep scoring deferred to envelope agents",
      "evidence_used": ["actor_identity"],
      "missing_evidence": []
    }
  ]
}
```

`downstream_admitted` is `true` only when `final_verdict` is `allow`, `allow_with_receipt`, or `warn`.
`state_snapshot` is a 16-character FNV-1a hex token derived from `request_id` and `timestamp_ms`.

### EnvelopeHandles JSON Schema

Pass to `classify_motion_with_envelopes` to activate trained-envelope scoring per layer.
Any `null` field causes that layer to fall back to the stateless heuristic evaluator.

```json
{
  "actor":  "obj_0",
  "object": "obj_1",
  "route":  "obj_2",
  "automl": "obj_3",
  "time":   "obj_4"
}
```

### Core Classification Functions

| Function | Parameters | Returns | Description |
|---|---|---|---|
| `classify_motion(motion_json)` | `motion_json: string` | `string (VerdictReceipt JSON)` | Classify using stateless heuristic evaluators for all five layers |
| `classify_motion_with_envelopes(motion_json, handles_json)` | `motion_json: string, handles_json: string` | `string (VerdictReceipt JSON)` | Classify using trained envelope handles; falls back to stateless per null handle |
| `get_verdict_explanation(verdict_json)` | `verdict_json: string` | `string` | Return a human-readable breakdown of a VerdictReceipt |
| `build_motion_from_log_trace(log_handle, trace_index, activity_key, actor_key)` | `string, usize, string, string` | `string (RequestMotion JSON)` | Build a RequestMotion from the last event of a stored log trace |

### Actor Envelope Functions

Learns per-actor behavioural profiles (action frequencies, active hours) from a stored event log.
Minimum 3 distinct actors required. Profiles sorted by actor name for determinism.

| Function | Parameters | Returns | Description |
|---|---|---|---|
| `build_actor_envelope(log_handle, activity_key, actor_key, timestamp_key)` | `string, string, string, string` | `string (handle)` | Train actor profiles; returns opaque handle |
| `score_actor_motion(envelope_handle, actor, requested_action, hour_of_day)` | `string, string, string, u8` | `string (ActorScoringResult JSON)` | Score (actor, action, hour) against the envelope; pass `255` to skip hour scoring |
| `get_actor_profiles(envelope_handle)` | `string` | `string (ActorProfile[] JSON)` | Return all trained profiles sorted by actor name |

**ActorScoringResult JSON** includes `verdict`, `confidence`, `anomaly_score`, `action_score`,
`hour_score`, `actor`, `requested_action`, `common_action_rank`, `actor_total_events`.

Verdict thresholds: `anomaly_score > 0.7` → `escalate`; `> 0.4` → `warn`; else `allow`.
Unknown actor (no history in envelope) → `require_evidence` with `missing_evidence: ["actor_history"]`.

### Object Envelope Functions

Learns lawful activity-to-activity transitions per object type.

| Function | Parameters | Returns | Description |
|---|---|---|---|
| `build_object_envelope(log_handle, activity_key)` | `string, string` | `string (handle)` | Learn object transitions; returns opaque handle |
| `score_object_motion(envelope_handle, object_type, current_action, previous_action)` | `string, string, string, string` | `string (ObjectScoringResult JSON)` | Score a proposed transition |
| `get_transition_map(envelope_handle, object_type)` | `string, string` | `string (transitions JSON)` | Return all observed transitions for an object type |

### Route Envelope Functions

Learns dominant trace variants (up to `coverage_threshold` cumulative frequency) and
scores candidate prefixes against those variants.

| Function | Parameters | Returns | Description |
|---|---|---|---|
| `build_route_envelope(log_handle, activity_key, coverage_threshold)` | `string, string, f64` | `string (handle)` | Learn variants; pass `0.0` to use default threshold (0.8). Minimum 5 traces. |
| `score_route_motion(envelope_handle, prefix_json)` | `string, string` | `string (RouteScoreResult JSON)` | Score a prefix array `["A","B","C"]` against known variants |
| `get_route_variants(envelope_handle)` | `string` | `string (RouteVariant[] JSON)` | Return all stored variants sorted by frequency descending |

**RouteScoreResult JSON** includes `verdict`, `confidence`, `match_rate`, `matching_variants`,
`total_variants`, `prefix`, `candidate_continuations`, `reason`.

Verdict thresholds: `match_rate > 0.5` → `allow`; `match_rate == 0` or `<= 0.5` → `warn`.
Empty prefix → `allow` with `match_rate: 1.0` (vacuous truth).

### AutoML Envelope Functions

Trains a micro-ML anomaly model over activity feature vectors.

| Function | Parameters | Returns | Description |
|---|---|---|---|
| `build_automl_envelope(log_handle, activity_key)` | `string, string` | `string (handle)` | Train AutoML model; returns opaque handle |
| `score_motion_automl(envelope_handle, motion_features_json)` | `string, string` | `string (MotionScoringResult JSON)` | Score a motion feature vector |
| `inspect_automl_envelope(envelope_handle)` | `string` | `string (AutomlEnvelopeModel JSON)` | Inspect trained model parameters |

### Time Envelope Functions

Tracks temporal freshness — requests with timestamps outside the configured window are flagged.

| Function | Parameters | Returns | Description |
|---|---|---|---|
| `build_time_envelope(log_handle, timestamp_key, freshness_window_ms)` | `string, string, f64` | `string (handle)` | Learn timestamp distribution; `freshness_window_ms` controls replay-attack detection |
| `score_time_motion(envelope_handle, timestamp_ms)` | `string, f64` | `string (LayerVerdict JSON)` | Score a timestamp for freshness |
| `get_time_envelope_stats(envelope_handle)` | `string` | `string (TimeEnvelope JSON)` | Return timing statistics |

### Drift Management Functions

| Function | Parameters | Returns | Description |
|---|---|---|---|
| `check_envelope_drift(baseline_handle, current_log_handle, activity_key)` | `string, string, string` | `string (DriftRecord JSON)` | Compare current log against a baseline envelope |
| `quarantine_envelope(envelope_handle)` | `string` | `string` | Mark envelope as quarantined; subsequent scoring returns `Quarantine` |
| `get_membrane_health(envelope_handles_json)` | `string` | `string (MembraneHealth JSON)` | Report health across all configured envelopes |

### Benchmark Functions

Eight built-in attack traces covering custody bypass, privilege escalation, temporal replay,
and supply-chain self-approval patterns (Van der Aalst threat taxonomy + ATT&CK T1195, PAIS T1105).

| Function | Parameters | Returns | Description |
|---|---|---|---|
| `run_benchmark_trace(trace_json)` | `string (BenchmarkTrace JSON)` | `string (BenchmarkResult JSON)` | Run a single benchmark trace through the membrane |
| `get_builtin_benchmarks()` | — | `string (BenchmarkTrace[] JSON)` | Return all 8 built-in benchmark trace definitions |
| `run_all_benchmarks()` | — | `string (AllBenchmarksResult JSON)` | Run all 8 traces and return aggregate pass/fail counts |

**AllBenchmarksResult JSON**: `{ total, passed, failed, pass_rate, results[] }`.
All 8 built-in benchmarks pass with the stateless heuristic evaluators.

### End-to-End JavaScript Example

```javascript
const wasm = require('./pkg/wasm4pm.js');
const parse = r => typeof r === 'string' ? JSON.parse(r) : r;

// 1. Load event log
const log_handle = wasm.load_eventlog_from_xes(xesContent);

// 2. Build envelopes (requires >= 3 actors, >= 5 traces)
const actor_handle  = wasm.build_actor_envelope(log_handle, 'concept:name', 'org:resource', 'time:timestamp');
const route_handle  = wasm.build_route_envelope(log_handle, 'concept:name', 0.8);
const automl_handle = wasm.build_automl_envelope(log_handle, 'concept:name');

// 3. Classify a motion using trained envelopes
const motion = JSON.stringify({
  request_id: 'req-001',
  actor: 'alice',
  role: 'analyst',
  object_ids: ['ORDER-123'],
  object_types: ['order'],
  requested_action: 'approve',
  claimed_evidence: [],
  timestamp_ms: Date.now()
});
const handles = JSON.stringify({
  actor: actor_handle,
  route: route_handle,
  automl: automl_handle,
  object: null,
  time: null
});
const receipt = parse(wasm.classify_motion_with_envelopes(motion, handles));

console.log(receipt.final_verdict);       // "require_evidence"
console.log(receipt.downstream_admitted); // false
console.log(receipt.decisive_layer);      // "custody"
console.log(receipt.explanation);         // human-readable breakdown

// 4. Free handles
wasm.delete_object(log_handle);
wasm.delete_object(actor_handle);
wasm.delete_object(route_handle);
wasm.delete_object(automl_handle);
```

### Verification

```bash
cd /Users/sac/wasm4pm
cargo test --test membrane_oracle_tests --features miniml 2>&1 | tail -10
# Expected: 29 passed; 0 failed
```

## Serialization Notes

- All `Result<JsValue, JsValue>` returns use `serde_json::to_string()` + `JsValue::from_str()` — NOT `serde_wasm_bindgen` (known bug with `json!()` macro)
- Event log handles are opaque strings returned by `load_*` functions
- All timestamps in nanoseconds unless otherwise specified
