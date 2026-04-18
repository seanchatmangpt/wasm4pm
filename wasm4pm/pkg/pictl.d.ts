/* tslint:disable */
/* eslint-disable */

/**
 * Generic result for operations
 */
export class OperationResult {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    data(): string | undefined;
    is_success(): boolean;
    message(): string;
}

/**
 * Multi-dimensional RL state with quantized dimensions
 */
export class RlState {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    activity_count_q: number;
    circuit_state: number;
    cycle_phase: number;
    drift_status: number;
    event_rate_q: number;
    health_level: number;
    rework_ratio_q: number;
    spc_alert_level: number;
}

/**
 * Wrapper for EventLog - stores handle in WASM state
 */
export class WasmEventLog {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Get attributes count
     */
    attribute_count(): number;
    /**
     * Get the number of cases in the log
     */
    case_count(): number;
    /**
     * Get the number of events in the log
     */
    event_count(): number;
    /**
     * Get the internal handle (for internal use only)
     */
    handle(): string;
    constructor(handle: string);
    /**
     * Get basic statistics as JSON
     */
    stats(): any;
}

/**
 * Wrapper for OCEL
 */
export class WasmOCEL {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Get the number of events in the OCEL
     */
    event_count(): number;
    /**
     * Get the internal handle (for internal use only)
     */
    handle(): string;
    constructor(handle: string);
    /**
     * Get the number of objects in the OCEL
     */
    object_count(): number;
    /**
     * Get basic statistics as JSON
     */
    stats(): any;
}

export function advanced_algorithms_info(): string;

export function align_etconformance_precision(log_handle: string, petri_net_handle: string, config_json: string): any;

export function alignment_fitness(log_handle: string, petri_net_handle: string, config_json: string): any;

/**
 * Activity Co-occurrence - find activities that happen together
 */
export function analyze_activity_cooccurrence(eventlog_handle: string, activity_key: string): any;

/**
 * Activity Dependency Analysis - identify predecessor/successor relationships
 */
export function analyze_activity_dependencies(eventlog_handle: string, activity_key: string): any;

/**
 * Case Attribute Analysis - correlate case attributes with process behavior
 */
export function analyze_case_attributes(eventlog_handle: string, activity_key: string): any;

/**
 * Analyze case duration from an EventLog
 */
export function analyze_case_duration(eventlog_handle: string): any;

/**
 * Perform dotted chart analysis on an EventLog
 */
export function analyze_dotted_chart(eventlog_handle: string): any;

/**
 * Get event statistics from an EventLog
 */
export function analyze_event_statistics(eventlog_handle: string): any;

/**
 * Discover infrequent behavior patterns (deviations from main process)
 */
export function analyze_infrequent_paths(eventlog_handle: string, activity_key: string, frequency_threshold: number): any;

/**
 * Analyze object-centric performance across all object types.
 *
 * For each object type, builds a performance DFG with per-edge duration
 * statistics derived from event timestamps. The `timestamp_key` parameter
 * is accepted for API consistency but OCEL timestamps are always read from
 * the standard `time` / `timestamp` field of each event (ISO 8601).
 *
 * Returns JSON keyed by object type:
 * ```json
 * {
 *   "Order": {
 *     "nodes": [{"id":"Create Order","label":"Create Order","frequency":50}],
 *     "edges": [{"from":"Create Order","to":"Pay","count":45,
 *                "mean_ms":86400000,"median_ms":82800000,"p95_ms":172800000}],
 *     "start_activities": {"Create Order": 50},
 *     "end_activities":   {"Close": 50}
 *   },
 *   "Item": { ... }
 * }
 * ```
 */
export function analyze_oc_performance(ocel_handle: string, _timestamp_key: string): any;

/**
 * Get object statistics from an OCEL
 */
export function analyze_ocel_statistics(ocel_handle: string): any;

/**
 * Identify where process accelerates/decelerates over time.
 */
export function analyze_process_speedup(eventlog_handle: string, timestamp_key: string, _window_size: number): any;

/**
 * Analyze resource-activity matrix: which resources perform which activities.
 *
 * Returns a JSON object:
 * ```json
 * {
 *   "matrix": {
 *     "Alice": { "Approve": 40, "Review": 5 },
 *     "Bob": { "Process": 50, "Validate": 10 }
 *   },
 *   "specialization_scores": {
 *     "Alice": 0.85,
 *     "Bob": 0.72
 *   }
 * }
 * ```
 */
export function analyze_resource_activity_matrix(log_handle: string, resource_key: string, activity_key: string): any;

/**
 * Analyze resource utilization: total events, time periods, concurrent cases, top activities.
 *
 * Returns a JSON object:
 * ```json
 * {
 *   "resources": {
 *     "Alice": {
 *       "event_count": 45,
 *       "first_event": "2024-01-01T10:00Z",
 *       "last_event": "2024-01-31T17:00Z",
 *       "avg_concurrent_cases": 3.5,
 *       "top_activities": ["Approve", "Review"]
 *     },
 *     "Bob": { ... }
 *   },
 *   "total_resources": 5
 * }
 * ```
 */
export function analyze_resource_utilization(log_handle: string, resource_key: string, timestamp_key: string): any;

/**
 * Start/End Activity Analysis - find entry and exit points
 */
export function analyze_start_end_activities(eventlog_handle: string, activity_key: string): any;

/**
 * Identify temporal bottlenecks by activity duration.
 */
export function analyze_temporal_bottlenecks(eventlog_handle: string, activity_key: string, timestamp_key: string): any;

/**
 * Trace Variants - extract unique process paths and their frequencies
 */
export function analyze_trace_variants(eventlog_handle: string, activity_key: string): any;

/**
 * Measure variant entropy and diversity in event log.
 */
export function analyze_variant_complexity(eventlog_handle: string, activity_key: string): any;

/**
 * Get list of available analysis functions
 */
export function available_analysis_functions(): string;

/**
 * Get list of available discovery algorithms
 */
export function available_discovery_algorithms(): any;

/**
 * Build an n-gram predictor from an event log.
 *
 * `n` controls how many preceding activities are used as context (default 2).
 *
 * Returns a handle to the predictor stored in state.
 *
 * ```javascript
 * const predHandle = pm.build_ngram_predictor(logHandle, 'concept:name', 2);
 * const preds = JSON.parse(pm.predict_next_activity(predHandle,
 *                 JSON.stringify(['Register', 'Check'])));
 * ```
 */
export function build_ngram_predictor(log_handle: string, activity_key: string, n: number): any;

/**
 * Build a remaining-time prediction model from a completed event log.
 *
 * # Parameters
 * - `log_handle` — handle to an `EventLog` in state
 * - `activity_key` — attribute name for activity labels (e.g. `"concept:name"`)
 * - `timestamp_key` — attribute name for event timestamps (e.g. `"time:timestamp"`)
 *
 * # Returns
 * A string handle to the stored model (internally a `JsonString`).
 *
 * ```javascript
 * const model = pm.build_remaining_time_model(logHandle, 'concept:name', 'time:timestamp');
 * ```
 */
export function build_remaining_time_model(log_handle: string, activity_key: string, timestamp_key: string): any;

/**
 * Build a transition probability graph from an event log stored in state.
 *
 * Returns `{ edges: [{from, to, probability, count}], activities: string[] }`.
 *
 * ```javascript
 * const graph = JSON.parse(pm.build_transition_probabilities(logHandle, 'concept:name'));
 * ```
 */
export function build_transition_probabilities(log_handle: string, activity_key: string): any;

/**
 * Calculate trace durations (difference between first and last event timestamps)
 */
export function calculate_trace_durations(eventlog_handle: string, timestamp_key: string): any;

/**
 * Check data quality of an EventLog for common issues
 */
export function check_data_quality(log_handle: string, activity_key: string, timestamp_key: string): any;

/**
 * Check an EventLog against a DECLARE model.
 *
 * `declare_handle` — handle returned by `discover_declare` stored via
 * `store_declare_from_json`, or the raw result stored as a handle.
 *
 * Returns a JSON string:
 * ```json
 * {
 *   "total_traces": 100,
 *   "avg_fitness": 0.92,
 *   "constraints": [
 *     {"template":"Response","activities":["A","B"],
 *      "violations": 8, "fitness": 0.92}
 *   ]
 * }
 * ```
 */
export function check_declare_conformance(log_handle: string, declare_handle: string, activity_key: string): any;

/**
 * Check DecisionGraph structural soundness (connectivity, acyclicity).
 *
 * Validates a DecisionGraph directly without Petri net conversion.
 * Returns JSON: `{ "sound": bool, "connectivity": {...}, "acyclicity": {...},
 *               "has_start_nodes": bool, "has_end_nodes": bool }`
 *
 * If the root node is not a DecisionGraph, returns `{ "sound": false }`.
 */
export function check_dg_soundness(powl_string: string): string;

/**
 * Check data quality of an OCEL
 */
export function check_ocel_data_quality(ocel_handle: string): any;

/**
 * Check soundness of a POWL model (van der Aalst criteria).
 *
 * Returns: `{ "sound": bool, "deadlock_free": bool, "bounded": bool, "liveness": bool }`
 */
export function check_powl_soundness(powl_str: string): string;

/**
 * Check a log against a temporal profile.
 *
 * Every directly-follows step in every trace is measured.  A step is flagged
 * as a deviation when `|duration - mean| > zeta * stdev`.
 *
 * Returns a JSON string:
 * ```json
 * {
 *   "total_traces": 10,
 *   "total_steps": 50,
 *   "deviations": 3,
 *   "fitness": 0.94,
 *   "details": [
 *     {"case_id":"Case1","from":"A","to":"B","duration_ms":9000000,
 *      "mean_ms":3600000,"stdev_ms":600000,"zeta":9.0,"deviation":true}
 *   ]
 * }
 * ```
 */
export function check_temporal_conformance(log_handle: string, profile_handle: string, activity_key: string, timestamp_key: string, zeta: number): any;

/**
 * Check conformance using token-based replay.
 *
 * Performs actual token replay on the Petri net:
 * 1. Start with initial marking
 * 2. For each event in trace, find matching visible transition
 * 3. Check if transition is enabled (all input places have sufficient tokens)
 * 4. Fire transition (consume from input, produce to output)
 * 5. After all events, check if final marking matches any final marking
 * 6. Track consumed/produced/missing/remaining tokens
 */
export function check_token_based_replay(eventlog_handle: string, petri_net_handle: string, activity_key: string): any;

/**
 * Clear all caches (parse, columnar, interner).
 */
export function clear_all_caches(): void;

export function clear_all_objects(): void;

/**
 * Process Clustering - group similar traces using bitset-based k-means
 * Time complexity: O(T×K) where T = traces, K = clusters (vs O(T×K×A) for string-based)
 */
export function cluster_traces(eventlog_handle: string, activity_key: string, num_clusters: number): any;

/**
 * Compute activity transition matrix (Markov chain).
 */
export function compute_activity_transition_matrix(eventlog_handle: string, activity_key: string): any;

/**
 * Legacy function for backward compatibility: DFG-based alignment (greedy).
 */
export function compute_alignments(log_handle: string, dfg_handle: string, activity_key: string): any;

/**
 * Compute boundary coverage for a prefix against an event log.
 *
 * Returns `{ coverage: number, matching_traces: number, normal_completions: number }`.
 * Coverage is the fraction of matching completions that are "normal" (within 2 sigma of median length).
 */
export function compute_boundary_coverage(log_handle: string, prefix_json: string, activity_key: string): any;

/**
 * Compute exponential weighted moving average (EWMA) with trend classification.
 * values and classify the overall trend.
 *
 * `values_json` — JSON array of numbers, e.g. `"[1.0, 2.0, 3.5]"`.
 * `alpha` — smoothing factor in (0, 1]; higher = more weight on recent values.
 *
 * Returns a JS object:
 * ```json
 * {
 *   "smoothed": [1.0, 1.3, 1.96],
 *   "trend": "rising",
 *   "last_value": 1.96
 * }
 * ```
 */
export function compute_ewma(values_json: string, alpha: number): any;

/**
 * Compute permutation importance for each activity in a prefix.
 *
 * For each position in the prefix, remove that activity and measure the
 * change in prediction confidence (top-1 probability). Activities whose
 * removal causes the largest drop are most important.
 *
 * ```javascript
 * const result = JSON.parse(pm.compute_feature_importance(model_handle, JSON.stringify(["A","B","C"]), 3));
 * // { baseline: 0.85, importances: [{activity: "B", position: 1, delta: -0.3}, ...] }
 * ```
 */
export function compute_feature_importance(model_handle: string, prefix_json: string, ngram_order: number): any;

/**
 * Get process model complexity metrics
 */
export function compute_model_metrics(eventlog_handle: string, activity_key: string): any;

/**
 * Compute optimal alignments for all traces in a log against a Petri Net using A*.
 *
 * Returns a JSON string:
 * ```json
 * {
 *   "total_traces": 10,
 *   "avg_cost": 0.5,
 *   "alignments": [
 *     {
 *       "case_id": "Case1",
 *       "cost": 0.0,
 *       "sync_moves": 5,
 *       "log_moves": 0,
 *       "model_moves": 0,
 *       "path": ["sync:A", "sync:B", "model:C"]
 *     }
 *   ]
 * }
 * ```
 */
export function compute_optimal_alignments(log_handle: string, petri_net_handle: string, activity_key: string, cost_config_json: string): any;

/**
 * Compute rework metrics for a trace (JSON string array).
 *
 * Returns `{ rework_count, rework_ratio, repeated_pairs }` where:
 * - `rework_count` — number of consecutive repeated activities
 * - `rework_ratio` — rework_count / max(trace.len() - 1, 1)
 * - `repeated_pairs` — list of `"A→A"` strings for each repeated pair
 *
 * ```javascript
 * const rework = JSON.parse(pm.compute_rework_score(
 *     JSON.stringify(["A", "B", "B", "C", "C", "C"])
 * ));
 * // { rework_count: 3, rework_ratio: 0.6, repeated_pairs: ["B→B", "C→C", "C→C"] }
 * ```
 */
export function compute_rework_score(trace_json: string): any;

/**
 * Score the likelihood of a trace according to an n-gram predictor model.
 *
 * Returns `{ log_likelihood: number, normalized: number }`.
 * `log_likelihood` is the raw sum of log-probabilities; `normalized` divides by the number of steps.
 *
 * Unlike `score_trace_likelihood` in the base prediction module (which returns a plain float),
 * this returns a structured object with both raw and normalised values.
 */
export function compute_trace_likelihood(model_handle: string, trace_json: string): any;

/**
 * Compute pairwise trace similarity matrix.
 */
export function compute_trace_similarity_matrix(eventlog_handle: string, activity_key: string): any;

/**
 * Clear all cached entries.
 */
export function conformance_cache_clear(handle: string): any;

/**
 * Look up a cached conformance result.
 *
 * Returns JSON `{ fitness, precision, generalization, trace_count }` on hit,
 * or `null` on miss.
 */
export function conformance_cache_get(handle: string, log_handle: string, model_hash: bigint): any;

/**
 * Hash a DFG model for use as a cache key.
 */
export function conformance_cache_hash_model(dfg_json: string): any;

/**
 * Insert a conformance result into the cache.
 */
export function conformance_cache_insert(handle: string, log_handle: string, model_hash: bigint, fitness: number, precision: number, generalization: number, trace_count: number): any;

/**
 * Create a new conformance cache.
 */
export function conformance_cache_new(): string;

/**
 * Get cache statistics: `{ hits, misses, entries }`.
 */
export function conformance_cache_stats(handle: string): any;

/**
 * Get conformance checking info
 */
export function conformance_info(): string;

/**
 * Create an RlState directly from 8 field values.
 *
 * # Arguments
 *
 * * `health_level` - 0-4 (5 states: Normal, Warning, Degraded, Critical, Failed)
 * * `event_rate_q` - 0-7 (quantized event rate)
 * * `activity_count_q` - 0-7 (quantized activity count)
 * * `spc_alert_level` - 0-3 (SPC alert level)
 * * `drift_status` - 0-2 (drift detection status)
 * * `rework_ratio_q` - 0-7 (quantized rework ratio)
 * * `circuit_state` - 0-2 (circuit breaker state)
 * * `cycle_phase` - 0-3 (autonomic cycle phase)
 *
 * # Returns
 *
 * * `RlState` - WASM-exported state object
 */
export function create_rl_state(health_level: number, event_rate_q: number, activity_count_q: number, spc_alert_level: number, drift_status: number, rework_ratio_q: number, circuit_state: number, cycle_phase: number): RlState;

/**
 * Create a new StreamingLog instance and return its handle.
 *
 * The handle is used to reference the instance in subsequent calls.
 * Call `free_streaming_log` to release the instance.
 */
export function create_streaming_log(): number;

/**
 * JS-accessible functions for state management
 */
export function delete_object(id: string): boolean;

/**
 * Detect bottlenecks - activities with high duration or long waiting times
 */
export function detect_bottlenecks(eventlog_handle: string, activity_key: string, timestamp_key: string, duration_threshold_seconds: bigint): any;

/**
 * Concept Drift Detection - identify where process behavior changes
 */
export function detect_concept_drift(eventlog_handle: string, activity_key: string, window_size: number): any;

/**
 * Detect concept drift over event log using windowed Jaccard distance.
 *
 * Slides a window of `window_size` traces across the log and computes the
 * Jaccard distance between the activity sets of consecutive windows.  A drift
 * point is recorded whenever the distance exceeds 0.3.
 *
 * Returns a JS object:
 * ```json
 * {
 *   "drifts_detected": 2,
 *   "drifts": [
 *     { "position": 10, "distance": 0.45, "type": "concept_drift" }
 *   ],
 *   "window_size": 5,
 *   "method": "jaccard_window"
 * }
 * ```
 */
export function detect_drift(log_handle: string, activity_key: string, window_size: number): any;

/**
 * Detect rework patterns (activities that are repeated in same trace)
 */
export function detect_rework(eventlog_handle: string, activity_key: string): any;

/**
 * Diff two POWL models (structural + behavioral comparison).
 *
 * Returns: `{ "severity": "...", "always_changes": [...], "order_changes": [...], "structure_changes": [...] }`
 */
export function diff_models(model_a_str: string, model_b_str: string): string;

/**
 * Ant Colony Optimization for process model discovery
 * Uses pheromone trails and heuristic information to construct process models
 */
export function discover_aco_algorithm(eventlog_handle: string, activity_key: string, ant_count: number, iterations: number): any;

/**
 * STUB: Frequency-filtered DFG wrapped as Petri net. Alpha++ not implemented.
 * TODO: footprint matrix, causality relation, length-1/2 loop handling
 */
export function discover_alpha_plus_plus(eventlog_handle: string, activity_key: string, min_support: number): any;

/**
 * Ant Colony Optimization - pheromone-based model discovery
 * Layer 6b: Edge-set representation with integer-keyed pheromone map
 */
export function discover_ant_colony(eventlog_handle: string, activity_key: string, num_ants: number, iterations: number): any;

/**
 * A* Search-based process discovery - informed heuristic search
 */
export function discover_astar(eventlog_handle: string, activity_key: string, max_iterations: number): any;

/**
 * Detect batch processing patterns in an event log.
 *
 * Identifies sequential, concurrent, parallel, and disruptive batch patterns
 * based on temporal overlap of activity executions across cases.
 *
 * # Arguments
 *
 * * `eventlog_handle` - Handle to a stored EventLog
 * * `activity_key` - Attribute key for activity names (e.g. "concept:name")
 * * `timestamp_key` - Attribute key for timestamps (e.g. "time:timestamp")
 */
export function discover_batches_wasm(eventlog_handle: string, activity_key: string, timestamp_key: string): any;

/**
 * Discover causal relations using the alpha miner variant.
 *
 * Ports `pm4py.algo.discovery.causal.variants.alpha.apply()`.
 *
 * A relation (A, B) is causal if:
 * - A directly follows B in the log (frequency > 0)
 * - B never directly follows A (either absent or frequency = 0)
 */
export function discover_causal_alpha(eventlog_handle: string, activity_key: string): any;

/**
 * Discover causal relations using the heuristic variant.
 *
 * Ports `pm4py.algo.discovery.causal.variants.heuristic.apply()`.
 *
 * The heuristic variant uses a threshold-based approach:
 * - Relation (A, B) is causal if its frequency is significantly higher
 *   than the reverse frequency (B, A).
 */
export function discover_causal_heuristic(eventlog_handle: string, activity_key: string, threshold: number): any;

/**
 * Discover a DFG from events without case IDs using temporal correlation.
 *
 * # Arguments
 *
 * * `eventlog_handle` - Handle to an EventLog stored in the WASM state.
 * * `activity_key` - Attribute key for activity names (e.g. `"concept:name"`).
 * * `timestamp_key` - Attribute key for timestamps (e.g. `"time:timestamp"`).
 * * `threshold` - Correlation threshold in seconds (default: 86400).
 *
 * # Returns
 *
 * A `CorrelationResult` serialised as a JS object containing edges,
 * start/end activities, and estimated trace count.
 */
export function discover_correlation(eventlog_handle: string, activity_key: string, timestamp_key: string, threshold: number): any;

/**
 * Discover DECLARE constraints from an EventLog
 */
export function discover_declare(eventlog_handle: string, activity_key: string): any;

/**
 * Discover a Directly-Follows Graph (DFG) from an EventLog
 */
export function discover_dfg(eventlog_handle: string, activity_key: string): any;

/**
 * Discover DFG with frequency filtering
 */
export function discover_dfg_filtered(eventlog_handle: string, activity_key: string, min_frequency: number): any;

/**
 * Discover a DFG and store it in WASM state, returning a handle string.
 *
 * Identical to `discover_dfg` but stores the result internally so that
 * handle-based functions (e.g. `score_anomaly`) can reference it.
 */
export function discover_dfg_handle(eventlog_handle: string, activity_key: string): any;

/**
 * Discover a DFG using hierarchical chunking.
 *
 * Splits the event log into `num_chunks` independent partitions, discovers a
 * partial DFG for each, then merges the results.  The output is identical to
 * `discover_dfg` for any `num_chunks >= 1`.
 */
export function discover_dfg_hierarchical(eventlog_handle: string, activity_key: string, num_chunks: number): any;

/**
 * Discover a DFG hierarchically with an event-budget per chunk.
 *
 * Each chunk is limited to at most `max_chunk_events` events.  The number of
 * chunks is determined automatically from the log size.
 */
export function discover_dfg_hierarchical_by_events(eventlog_handle: string, activity_key: string, max_chunk_events: number): any;

/**
 * Discover a DFG using the SIMD-accelerated streaming algorithm.
 *
 * Produces identical results to `discover_dfg` but uses WASM SIMD intrinsics
 * for node-frequency accumulation and loop-unrolled edge counting.
 *
 * # Arguments
 *
 * * `eventlog_handle` - Handle to a stored EventLog object
 * * `activity_key` - Attribute key for activity names (e.g., "concept:name")
 *
 * # Returns
 *
 * JSON `DirectlyFollowsGraph` with nodes, edges, start_activities, end_activities.
 */
export function discover_dfg_simd(eventlog_handle: string, activity_key: string): any;

/**
 * Discover a DFG using SIMD streaming and store it in WASM state.
 *
 * Returns a handle string that can be used with other handle-based functions.
 */
export function discover_dfg_simd_handle(eventlog_handle: string, activity_key: string): any;

/**
 * Genetic Algorithm for process model discovery
 * Evolves a population of edge sets to find models that fit the log well
 */
export function discover_genetic_algorithm(eventlog_handle: string, activity_key: string, population_size: number, generations: number): any;

/**
 * Discover a handover-of-work social network.
 *
 * `resource_key` — event attribute holding the resource/originator
 *   (typically `"org:resource"` in XES).
 *
 * Returns a JSON string:
 * ```json
 * {
 *   "nodes": [{"id":"Alice","label":"Alice","workload":42}],
 *   "edges": [{"from":"Alice","to":"Bob","handovers":12}]
 * }
 * ```
 */
export function discover_handover_network(log_handle: string, resource_key: string): any;

/**
 * Heuristic Miner - discovers process models from real-world logs
 * More lenient than Alpha++ for handling noise and incomplete data
 */
export function discover_heuristic_miner(eventlog_handle: string, activity_key: string, dependency_threshold: number): any;

/**
 * Hill Climbing - greedy local optimization
 */
export function discover_hill_climbing(eventlog_handle: string, activity_key: string): any;

/**
 * STUB: DFG→Petri-net projection. ILP solver not implemented.
 * TODO: ILP requires solving a set-cover problem over causal footprint
 */
export function discover_ilp_petri_net(eventlog_handle: string, activity_key: string): any;

/**
 * Inductive Miner - recursive structure discovery via cuts
 * Implements IM-basic (no noise filtering, all directly-follows preserved)
 * Returns ProcessTree via XOR/Sequence/Parallel/Loop cuts
 */
export function discover_inductive_miner(eventlog_handle: string, activity_key: string): any;

/**
 * Discover Object-Centric Petri Nets from OCEL
 *
 * For each object type in the OCEL:
 * 1. Flatten OCEL to single-type EventLog
 * 2. Discover Petri Net using specified algorithm
 * 3. Tag places with object type
 * 4. Return per-type nets as JSON mapping
 *
 * Returns: JSON { "Order": { places, transitions, ... }, "Item": { ... } }
 */
export function discover_oc_petri_net(ocel_handle: string, algorithm: string): any;

/**
 * Discover a Directly-Follows Graph (DFG) from an OCEL
 */
export function discover_ocel_dfg(ocel_handle: string): any;

/**
 * Discover a Directly-Follows Graph (DFG) per object type from an OCEL
 */
export function discover_ocel_dfg_per_type(ocel_handle: string): any;

/**
 * Discover POWL model from OCEL event log
 *
 * # Arguments
 * * `ocel_json` - OCEL event log as JSON string
 * * `variant` - OCEL variant: "flattening" or "oc_powl"
 *
 * # Returns
 * JSON object with `{ "root": u32, "node_count": usize, "repr": string, "ocel_variant": string }`
 */
export function discover_ocel_powl(ocel_json: string, variant: string): any;

/**
 * Discover optimal DFG using constraint satisfaction
 * Balances fitness and simplicity using weighted optimization
 */
export function discover_optimized_dfg(eventlog_handle: string, activity_key: string, fitness_weight: number, simplicity_weight: number): any;

/**
 * Discover a time-annotated DFG from an EventLog.
 *
 * Returns a JSON string:
 * ```json
 * {
 *   "nodes": [{"id":"Register","label":"Register","frequency":100}],
 *   "edges": [{"from":"Register","to":"Approve","count":80,
 *              "mean_ms":3600000,"median_ms":3500000,"p95_ms":7200000}],
 *   "start_activities": {"Register": 100},
 *   "end_activities":   {"Close": 100}
 * }
 * ```
 * `timestamp_key` defaults to `"time:timestamp"` in most XES logs.
 */
export function discover_performance_dfg(log_handle: string, activity_key: string, timestamp_key: string): any;

/**
 * Discover the performance spectrum for a target activity.
 *
 * Measures time durations between each occurrence of `target_activity`
 * and the immediately following event.  Returns aggregate statistics
 * (min, max, mean, median, count) per `(target, next)` pair.
 *
 * # Arguments
 *
 * * `eventlog_handle` - Handle to a stored EventLog
 * * `activity_key` - Attribute key for activity names (e.g. "concept:name")
 * * `timestamp_key` - Attribute key for timestamps (e.g. "time:timestamp")
 * * `target_activity` - The activity to analyse
 */
export function discover_performance_spectrum_wasm(eventlog_handle: string, activity_key: string, timestamp_key: string, target_activity: string): any;

/**
 * Discover a POWL model from an event log.
 *
 * # Arguments
 * * `log_json` - Event log as JSON string (same format as pm4py)
 * * `variant` - Discovery variant: "decision_graph_cyclic" (default), "decision_graph_cyclic_strict",
 *               "decision_graph_max", "decision_graph_clustering", "dynamic_clustering",
 *               "maximal", or "tree"
 *
 * # Returns
 * JSON object with `{ "root": u32, "node_count": usize, "repr": string }`
 */
export function discover_powl_from_log(log_json: string, variant: string): any;

/**
 * Discover a POWL model from an event log with custom configuration.
 *
 * # Arguments
 * * `log_json` - Event log as JSON string
 * * `activity_key` - Key to use for activity extraction (default: "concept:name")
 * * `variant` - Discovery variant
 * * `min_trace_count` - Minimum number of traces for a cut (default: 1)
 * * `noise_threshold` - Noise threshold for fall-through (default: 0.0)
 *
 * # Returns
 * JSON object with `{ "root": u32, "node_count": usize, "repr": string }`
 */
export function discover_powl_from_log_config(log_json: string, activity_key: string, variant: string, min_trace_count: number, noise_threshold: number): any;

/**
 * Discover POWL model from partially ordered event log (lifecycle events)
 *
 * # Arguments
 * * `log_json` - Event log as JSON string with lifecycle:transition attribute
 * * `variant` - Discovery variant (same as discover_powl_from_log)
 *
 * # Returns
 * JSON object with `{ "root": u32, "node_count": usize, "repr": string, "partial_order": true }`
 */
export function discover_powl_from_partial_orders(log_json: string, variant: string): any;

/**
 * WASM export: Discover a prefix tree from an event log.
 *
 * **Arguments:**
 * * `eventlog_handle` - Handle to the stored EventLog object
 * * `activity_key` - Attribute key for activity names (e.g., "concept:name")
 * * `max_path_length` - Optional maximum trace length (0 = no limit)
 *
 * **Returns:** JSON object with:
 * - `variants`: Number of unique trace variants
 * - `max_depth`: Maximum depth of the trie
 * - `tree`: The trie structure with nested nodes
 */
export function discover_prefix_tree(eventlog_handle: string, activity_key: string, max_path_length: number): any;

/**
 * Particle Swarm Optimization for process discovery
 * Uses swarm intelligence to explore the model space
 */
export function discover_pso_algorithm(eventlog_handle: string, activity_key: string, swarm_size: number, iterations: number): any;

/**
 * Discover a simple process tree from an event log using frequency-based
 * heuristics (flower model as a baseline — SEQ of all activities in
 * frequency order, with a top-level XOR for branching).
 *
 * Returns a JSON string representing the process tree.
 */
export function discover_simple_process_tree(log_handle: string, activity_key: string): any;

/**
 * Simulated Annealing - thermal search for optimal models
 * Layer 6b: Edge-set representation with integer-based edge mutation
 */
export function discover_simulated_annealing(eventlog_handle: string, activity_key: string, temperature: number, cooling_rate: number): any;

/**
 * Discover a temporal profile from an event log.
 *
 * Returns a handle to a `TemporalProfile` stored in global state.
 *
 * ```javascript
 * const profHandle = pm.discover_temporal_profile(logHandle, 'concept:name', 'time:timestamp');
 * const result = pm.check_temporal_conformance(logHandle, profHandle,
 *                  'concept:name', 'time:timestamp', 2.0);
 * ```
 */
export function discover_temporal_profile(log_handle: string, activity_key: string, timestamp_key: string): any;

/**
 * WASM export: discover a transition system from an event log handle.
 *
 * # Arguments
 * * `eventlog_handle` - Handle to the stored EventLog object
 * * `activity_key` - Key to extract activity name from event attributes (default: "concept:name")
 * * `window` - Size of the lookback window (default: 2)
 * * `direction` - "forward" (default) or "backward" direction
 *
 * # Returns
 * JSON object with:
 * - `states`: list of {id, name} state objects
 * - `transitions`: list of {from_state, to_state, activity, count} transition objects
 * - `initial_state`: ID of the initial state (or null)
 * - `final_states`: list of final state IDs
 */
export function discover_transition_system_from_handle(eventlog_handle: string, activity_key: string, window: number, direction: string): any;

/**
 * Discover a working-together network.
 *
 * For every pair of resources (A, B) that appear in the same trace,
 * record the co-occurrence count.
 *
 * Returns a JSON string:
 * ```json
 * {
 *   "nodes": [{"id":"Alice","label":"Alice"}],
 *   "edges": [{"from":"Alice","to":"Bob","co_occurrences":7}]
 * }
 * ```
 */
export function discover_working_together_network(log_handle: string, resource_key: string): any;

/**
 * Get discovery module info
 */
export function discovery_info(): any;

/**
 * Convert bottleneck analysis results (as JSON string) to human-readable text
 * Expected JSON format:
 * {
 *   "bottlenecks": [
 *     {"activity": "Approve", "avg_duration_hours": 2.5, "delayed_cases": 85},
 *     {"activity": "Close", "avg_duration_hours": 1.2, "delayed_cases": 20},
 *     {"activity": "Register", "avg_duration_hours": 0.1, "delayed_cases": 0}
 *   ]
 * }
 */
export function encode_bottlenecks_as_text(result_json: string): string;

/**
 * Convert conformance check results (as JSON string) to human-readable text
 * Expected JSON format:
 * {
 *   "conforming_cases": 95,
 *   "non_conforming_cases": 5,
 *   "total_cases": 100,
 *   "average_fitness": 0.98
 * }
 */
export function encode_conformance_as_text(result_json: string): string;

/**
 * Convert a DirectlyFollowsGraph to human-readable English text
 * Describes activities, start/end activities, and edge paths with percentages
 */
export function encode_dfg_as_text(dfg_handle: string): string;

/**
 * Compare two process models (DFGs or Petri Nets) and produce a text diff
 * Highlights differences in structure, edges, and frequencies
 */
export function encode_model_comparison_as_text(model1_handle: string, model2_handle: string): string;

/**
 * Convert an Object-Centric Petri Net (stored as JSON) to text
 * The OC Petri Net is stored as a JsonString containing per-type Petri Net structures
 */
export function encode_oc_petri_net_as_text(oc_petri_net_handle: string): string;

/**
 * Convert OCEL to a concise text summary for LLM consumption
 * Includes event types, object types, counts, and relationships
 */
export function encode_ocel_as_text(ocel_handle: string): string;

/**
 * Convert OCEL (Object-Centric Event Log) to human-readable summary text
 */
export function encode_ocel_summary_as_text(ocel_handle: string): string;

/**
 * Convert a Petri Net to human-readable text for LLM consumption
 * Includes places, transitions, arcs, and markings
 */
export function encode_petri_net_as_text(petri_net_handle: string): string;

/**
 * Convert event log statistics to human-readable summary text
 */
export function encode_statistics_as_text(log_handle: string): string;

/**
 * Convert top process variants to human-readable text
 * Lists the most common execution sequences with case counts and percentages
 */
export function encode_variants_as_text(log_handle: string, activity_key: string, top_n: number): string;

/**
 * Run ensemble discovery: discover DFG from log, compute self-fitness,
 * measure complexity metrics, and return a ranked quality assessment.
 *
 * This is a lightweight ensemble that evaluates the DFG model (which is
 * the universal representation all algorithms converge to) rather than
 * running N separate expensive algorithms.
 *
 * ```javascript
 * const result = JSON.parse(pm.ensemble_discover(handle, 'concept:name'));
 * // { models: [{algorithm: "dfg", fitness: 0.95, ...}], consensus: {...} }
 * ```
 */
export function ensemble_discover(log_handle: string, activity_key: string): any;

/**
 * Estimate queue delay using the M/M/1 queueing model.
 *
 * Returns JSON: `{ wait_time: number, utilization: number, is_stable: boolean }`
 */
export function estimate_queue_delay(arrival_rate: number, service_rate: number): any;

/**
 * Export DFG to JSON
 */
export function export_dfg_to_json(handle: string): string;

/**
 * Export EventLog to JSON string
 */
export function export_eventlog_to_json(handle: string): string;

/**
 * Export EventLog to XES format (generates valid XES XML)
 */
export function export_eventlog_to_xes(eventlog_handle: string): string;

/**
 * Export features as CSV string.
 *
 * Input: JSON array of feature vectors (from extract_case_features or extract_prefix_features)
 * Output: CSV string with headers and one row per feature vector
 */
export function export_features_csv(features_json: string): string;

/**
 * Extract features and export as JSON string.
 *
 * Convenience wrapper that calls extract_case_features internally
 * and returns the result as a JSON string (not JsValue).
 */
export function export_features_json(log_handle: string, activity_key: string, timestamp_key: string, config_json: string): string;

/**
 * Export OCEL 2.0 to JSON string (pretty-printed)
 * Retrieves OCEL from state by handle, serializes to JSON string
 */
export function export_ocel2_to_json(handle: string): string;

/**
 * Export OCEL to JSON string
 */
export function export_ocel_to_json(handle: string): string;

/**
 * Export PetriNet to JSON
 */
export function export_petri_net_to_json(handle: string): string;

/**
 * Extract mandatory activity ordering from event log.
 */
export function extract_activity_ordering(eventlog_handle: string, activity_key: string): any;

/**
 * Extract feature vectors from event log traces for ML training.
 *
 * Config JSON structure:
 * ```json
 * {
 *   "features": ["trace_length", "elapsed_time", "activity_counts", "rework_count"],
 *   "target": "remaining_time"  // or "outcome", "next_activity"
 * }
 * ```
 *
 * Returns: JSON array of feature vectors (one per trace)
 */
export function extract_case_features(log_handle: string, activity_key: string, timestamp_key: string, config_json: string): any;

/**
 * Extract feature vectors for each prefix of each trace.
 *
 * Generates one feature vector per prefix (up to prefix_length).
 * This is useful for "predict next activity" or "predict remaining time" tasks.
 *
 * Returns: JSON array with many more entries (one per prefix).
 */
export function extract_prefix_features(log_handle: string, activity_key: string, timestamp_key: string, prefix_length: number): any;

/**
 * Extract numeric features from a trace prefix (JSON string array).
 *
 * Returns `{ length, last_activity, unique_activities, rework_count, activity_frequency_entropy }`.
 *
 * ```javascript
 * const features = JSON.parse(pm.extract_prefix_features_wasm(
 *     JSON.stringify(["Register", "Check", "Approve"])
 * ));
 * ```
 */
export function extract_prefix_features_wasm(prefix_json: string): any;

/**
 * Process Skeleton - extract minimal model structure
 */
export function extract_process_skeleton(eventlog_handle: string, activity_key: string, min_frequency: number): any;

export function fast_discovery_info(): string;

/**
 * Filter traces by case ID list.
 */
export function filter_by_case_ids(log_handle: string, case_ids_json: string, case_id_key: string): any;

/**
 * Filter traces by case duration in milliseconds.
 */
export function filter_by_case_performance(log_handle: string, min_ms: bigint, max_ms: bigint, timestamp_key: string): any;

/**
 * Filter traces by event count range.
 * Pass 0 for `min_events` or `usize::MAX` equivalent (999999) for no bound.
 */
export function filter_by_case_size(log_handle: string, min_events: number, max_events: number): any;

/**
 * Filter traces containing specified directly-follows activity pairs.
 * `pairs_json` (JSON array of [from, to] arrays).
 *
 * ```javascript
 * const h2 = pm.filter_by_directly_follows(h,
 *   JSON.stringify([['Register','Approve']]), 'concept:name');
 * ```
 */
export function filter_by_directly_follows(log_handle: string, pairs_json: string, activity_key: string): any;

/**
 * Filter traces that end with one of the specified activities.
 */
export function filter_by_end_activity(log_handle: string, activities_json: string, activity_key: string): any;

/**
 * Filter traces containing an event with specified attribute value.
 */
export function filter_by_event_attribute_value(log_handle: string, attribute_key: string, attribute_value: string): any;

/**
 * Filter traces that start with one of the specified activities.
 *
 * ```javascript
 * const h2 = pm.filter_by_start_activity(h, JSON.stringify(['Register']));
 * ```
 */
export function filter_by_start_activity(log_handle: string, activities_json: string, activity_key: string): any;

/**
 * Filter traces by timestamp range.
 * Timestamps are ISO 8601 strings (e.g., "2023-01-01T00:00:00Z").
 */
export function filter_by_time_range(log_handle: string, min_dt: string, max_dt: string, timestamp_key: string): any;

/**
 * Filter traces by trace attribute value.
 */
export function filter_by_trace_attribute(log_handle: string, attribute_key: string, attribute_value: string): any;

/**
 * Filter traces by top variants covering specified percentage of traces.
 * traces are covered.  E.g. `coverage_pct = 80` keeps the variants that together
 * account for ≥80 % of traces.
 */
export function filter_by_variant_coverage(log_handle: string, coverage_pct: number, activity_key: string): any;

/**
 * Filter traces by top-k most frequent variants.
 */
export function filter_by_variants_top_k(log_handle: string, k: number, activity_key: string): any;

/**
 * Filter EventLog by activity (keep only traces containing the activity)
 */
export function filter_log_by_activity(eventlog_handle: string, activity_key: string, activity_name: string): any;

/**
 * Filter EventLog by trace length range
 */
export function filter_log_by_trace_length(eventlog_handle: string, min_length: number, max_length: number): any;

/**
 * Filter traces containing rework (repeated activities).
 */
export function filter_rework_traces(log_handle: string, activity_key: string): any;

/**
 * Filter traces containing all specified activities.
 */
export function filter_traces_containing_activities(log_handle: string, activities_json: string, activity_key: string): any;

/**
 * Filter traces ending with specified activity sequence.
 */
export function filter_traces_ending_with_sequence(log_handle: string, sequence_json: string, activity_key: string): any;

/**
 * Filter traces excluding any of the specified activities.
 */
export function filter_traces_excluding_activities(log_handle: string, activities_json: string, activity_key: string): any;

/**
 * Filter traces starting with specified activity sequence.
 */
export function filter_traces_starting_with_sequence(log_handle: string, sequence_json: string, activity_key: string): any;

export function final_analytics_info(): string;

/**
 * Flatten an OCEL to an EventLog by projecting onto a single object type
 *
 * For the given object_type:
 * - Each object of that type becomes a case (trace)
 * - Events referencing that object become the events in the trace
 * - Events are sorted by timestamp within each trace
 * - Stores the flattened EventLog in state and returns its handle
 */
export function flatten_ocel_to_eventlog(ocel_handle: string, object_type: string): string;

/**
 * Compute footprints-based conformance (fitness, precision, recall, F1).
 *
 * # Arguments
 * * `powl_str` - POWL model string
 * * `log_json` - JSON event log: `{ "traces": [{ "case_id": "...", "events": [{ "name": "A" }] }] }`
 *
 * # Returns
 * JSON: `{ "fitness": f64, "precision": f64, "recall": f64, "f1": f64 }`
 */
export function footprints_conformance(powl_str: string, log_json: string): string;

/**
 * Free a StreamingLog instance and release its memory.
 */
export function free_streaming_log(handle: number): void;

/**
 * Parse a PNML XML string and store the resulting PetriNet in the handle-based
 * state system.  Returns a handle string on success.
 */
export function from_pnml_wasm(pnml_string: string): any;

/**
 * Compute generalization quality metrics for a Petri net against an event log.
 *
 * # Arguments
 *
 * * `eventlog_handle` - Handle to the stored EventLog object
 * * `petri_net_handle` - Handle to the stored PetriNet object
 * * `activity_key` - Attribute key for activity names (e.g., "concept:name")
 *
 * # Returns
 *
 * JSON object with:
 * - `generalization`: f64 score in [0, 1]
 * - `num_places`: number of places
 * - `num_transitions`: number of transitions
 * - `num_visible_transitions`: number of visible (non-silent) transitions
 * - `num_arcs`: number of arcs
 * - `penalty`: sum of penalties applied
 */
export function generalization(eventlog_handle: string, petri_net_handle: string, activity_key: string): any;

/**
 * Generate recommendations for a given event log.
 *
 * Inspects log characteristics and returns:
 * - Algorithm recommendations (which algorithms suit this log)
 * - Parameter adjustment suggestions
 * - Next steps guidance (conformance, optimization, etc.)
 * - Data preprocessing suggestions
 *
 * Returns: JSON with `algorithm`, `parameters`, `next_steps`, `preprocessing` arrays
 */
export function generate_recommendations(log_handle: string): any;

export function genetic_discovery_info(): string;

/**
 * Get unique activities from EventLog
 */
export function get_activities(eventlog_handle: string, activity_key: string): any;

/**
 * Get activity frequencies
 */
export function get_activity_frequencies(eventlog_handle: string, activity_key: string): any;

/**
 * Get all attribute names used in the log
 */
export function get_attribute_names(eventlog_handle: string): any;

/**
 * Get cache statistics as JSON string.
 */
export function get_cache_stats(): string;

/**
 * Get WASM module capabilities as JSON string.
 *
 * Returns version and feature flags indicating which algorithms
 * and capabilities are available in this build.
 */
export function get_capabilities(): string;

/**
 * Get the complete capability registry of all pictl functions
 */
export function get_capability_registry(): any;

/**
 * Get the children arena indices of a node.
 */
export function get_children(s: string, arena_idx: number): any;

/**
 * Get current drift detection thresholds as JSON string.
 *
 * # Returns
 * JSON string with current threshold values: `{"low":0.3,"high":0.7}`
 *
 * # Example
 * ```javascript
 * const thresholds = JSON.parse(get_drift_thresholds());
 * console.log(thresholds.low, thresholds.high);
 * ```
 */
export function get_drift_thresholds(): string;

/**
 * Get total event count from EventLog
 */
export function get_event_count(eventlog_handle: string): number;

/**
 * Get information about supported formats
 */
export function get_io_info(): string;

/**
 * Get the number of events in an OCEL
 */
export function get_ocel_event_count(ocel_handle: string): number;

/**
 * Get the number of objects in an OCEL
 */
export function get_ocel_object_count(ocel_handle: string): number;

/**
 * Get statistics about OCEL structure and content
 */
export function get_ocel_type_statistics(ocel_handle: string): any;

/**
 * Get trace count from EventLog
 */
export function get_trace_count(eventlog_handle: string): number;

/**
 * Get min and max trace lengths
 */
export function get_trace_length_statistics(eventlog_handle: string): any;

/**
 * Get trace lengths (number of events per trace)
 */
export function get_trace_lengths(eventlog_handle: string): any;

export function get_version(): string;

/**
 * Compute global feature importance across all traces in an event log.
 *
 * Aggregates permutation importance over all prefixes extracted from
 * completed traces. Returns average importance per activity.
 *
 * ```javascript
 * const result = JSON.parse(pm.global_feature_importance(model_handle, log_handle, 'concept:name', 3));
 * // { activities: [{activity: "B", mean_importance: 0.35, count: 50}, ...] }
 * ```
 */
export function global_feature_importance(model_handle: string, log_handle: string, activity_key: string, ngram_order: number): any;

/**
 * Identify resource bottlenecks: waiting times, processing times, queue sizes.
 *
 * Returns a JSON array of bottlenecks:
 * ```json
 * {
 *   "bottlenecks": [
 *     {
 *       "resource": "Alice",
 *       "avg_queue_size": 5.2,
 *       "avg_wait_time_hours": 2.5,
 *       "processing_time_hours": 0.5
 *     },
 *     { "resource": "Bob", ... }
 *   ]
 * }
 * ```
 */
export function identify_resource_bottlenecks(log_handle: string, resource_key: string, timestamp_key: string, activity_key: string): any;

export function ilp_discovery_info(): string;

/**
 * Get the current DFG snapshot as a JSON string.
 */
export function incremental_dfg_snapshot(handle: string): string;

/**
 * Get streaming DFG stats as JSON: `{"total_events":N,"unique_activities":N,"unique_edges":N}`.
 */
export function incremental_dfg_stats(handle: string): string;

/**
 * Infer schema from EventLog by analyzing attribute patterns
 */
export function infer_eventlog_schema(log_handle: string): any;

/**
 * Infer schema from OCEL
 */
export function infer_ocel_schema(ocel_handle: string): any;

/**
 * Initialize the WASM module
 */
export function init(): string;

export function init_wasm(): void;

/**
 * List all unique object types in an OCEL
 */
export function list_ocel_object_types(ocel_handle: string): any;

/**
 * Load an EventLog from JSON string
 */
export function load_eventlog_from_json(content: string): string;

/**
 * Parse basic XES format - simplified XML parser
 * XES is the standard eXtensible Event Stream format for process logs
 */
export function load_eventlog_from_xes(content: string): string;

/**
 * Parse XES format with parse cache — skips re-parsing if content hash matches.
 *
 * Uses `crate::cache::hash_xes_content` to fingerprint the raw XES string and
 * `crate::cache::parse_cache_get` / `parse_cache_insert` to avoid redundant
 * XML parsing.  Falls back to the normal parse path on cache miss.
 */
export function load_eventlog_from_xes_cached(content: string): string;

/**
 * Load an OCEL 2.0 from JSON string
 * Parses JSON into OCEL struct, stores in AppState, returns handle
 */
export function load_ocel2_from_json(content: string): string;

/**
 * Load an OCEL from JSON string
 */
export function load_ocel_from_json(content: string): string;

/**
 * Load an OCEL from XML string using roxmltree parser
 * Supports OCEL-XML structure with events, objects, and typed attributes
 */
export function load_ocel_from_xml(content: string): string;

/**
 * Measure complexity metrics for a POWL model.
 *
 * Returns: `{ "cyclomatic": u32, "cfc": f64, "cognitive": f64, "halstead": { ... } }`
 */
export function measure_complexity(s: string): string;

/**
 * Sequential Pattern Mining - find frequent activity sequences
 */
export function mine_sequential_patterns(eventlog_handle: string, activity_key: string, min_support: number, pattern_length: number): any;

export function monte_carlo_simulation(log_handle: string, _powl_handle: string, _root_id: string, config_json: string): any;

export function more_discovery_info(): string;

/**
 * Create a new streaming DFG, store it in global state, and return its handle.
 */
export function new_streaming_dfg(): string;

/**
 * Get detailed JSON info about a node.
 */
export function node_info_json(s: string, arena_idx: number): string;

/**
 * Get the string representation of a specific node in the arena.
 */
export function node_to_string(s: string, arena_idx: number): string;

export function object_count(): number;

/**
 * Check conformance of OCEL against an OC Petri Net.
 *
 * For each object type:
 * 1. Flatten OCEL → EventLog
 * 2. Discover reference Petri Net
 * 3. Token-replay each trace
 * 4. Compute fitness (fraction of perfectly-fitting traces)
 *
 * Returns: JSON `{ "Order": { "fitness": 0.95, … }, "Item": { … }, "overall": { … } }`
 */
export function oc_conformance_check(ocel_handle: string): any;

/**
 * Get information about OC conformance checking.
 */
export function oc_conformance_info(): any;

/**
 * Compute per-object-type aggregate performance metrics from an OCEL.
 *
 * Simpler than `analyze_oc_performance` — returns only min / max / mean /
 * median of all inter-event durations per object type.
 *
 * Returns: JSON `{ "Order": { "min_ms": …, "max_ms": …, … }, "Item": { … } }`
 */
export function oc_performance_analysis(ocel_handle: string): any;

/**
 * Module info for capability registry.
 */
export function oc_performance_info(): any;

/**
 * Get information about OC Petri Net discovery
 */
export function oc_petri_net_info(): any;

/**
 * Check whether parallel execution is available.
 *
 * Returns `true` on native targets and `false` on WASM (single-threaded).
 */
export function parallel_available(): boolean;

/**
 * Discover a DFG using batch-sequential computation. Returns JSON string.
 *
 * Works on all targets (native and WASM) with identical output.
 */
export function parallel_discover_dfg(log_handle: string, activity_key: string): string;

/**
 * Run multiple algorithms in parallel. Returns JSON array of results.
 *
 * `algo_json` should be a JSON array of algorithm name strings, e.g.:
 * `["dfg", "alpha_plus_plus", "heuristic_miner"]`
 */
export function parallel_run_algorithms(log_handle: string, activity_key: string, algo_json: string): string;

/**
 * Parse a POWL model string.
 *
 * # Arguments
 * * `s` - POWL model string, e.g. `"X (A, B)"`, `"PO=(nodes={A, B}, order={A-->B})"`
 *
 * # Returns
 * JSON: `{ "root": u32, "node_count": usize, "repr": "..." }`
 */
export function parse_powl(s: string): any;

export function petri_net_playout(petri_net_handle: string, config_json: string): any;

/**
 * Convert a Petri Net (JSON) to a POWL model.
 *
 * Input JSON format (same as `powl_to_petri_net` output):
 * ```json
 * { "net": { "places": [...], "transitions": [...], "arcs": [...] }, "initial_marking": {...}, "final_marking": {...} }
 * ```
 *
 * Returns: `{ "root": u32, "node_count": usize, "repr": "..." }`
 */
export function petri_net_to_powl(pn_json: string): any;

/**
 * Feed one event to the pipeline.
 */
export function pipeline_add_event(handle: string, case_id: string, activity: string): any;

/**
 * Begin a new streaming pipeline session.
 *
 * `config_json` is a JSON object with boolean fields:
 * - `include_dfg` (default: true)
 * - `include_skeleton` (default: true)
 * - `include_heuristic` (default: true)
 */
export function pipeline_begin(config_json: string): string;

/**
 * Close a trace in the pipeline.
 */
export function pipeline_close_trace(handle: string, case_id: string): any;

/**
 * Finalize all open traces and return final models.
 */
export function pipeline_finalize(handle: string): any;

/**
 * Get combined snapshot from all active algorithms.
 */
export function pipeline_snapshot(handle: string): any;

/**
 * Get pipeline statistics.
 */
export function pipeline_stats(handle: string): any;

/**
 * Play out a DFG (Directly-Follows Graph) and return an event log handle.
 *
 * The DFG is provided as a JSON string with the shape:
 * ```json
 * {
 *   "nodes": [{ "id": "A", "label": "A", "frequency": 10 }],
 *   "edges": [{ "from": "A", "to": "B", "frequency": 8 }],
 *   "start_activities": { "A": 10 },
 *   "end_activities": { "C": 6 }
 * }
 * ```
 *
 * ```javascript
 * const result = JSON.parse(pm.play_out_dfg(dfgJson, JSON.stringify({ num_traces: 50 })));
 * // { handle: "obj_43", trace_count: 50, event_count: 180 }
 * ```
 */
export function play_out_dfg(dfg_json: string, params: any): any;

/**
 * Play out a process tree and return an event log handle.
 *
 * ```javascript
 * const params = { num_traces: 50, include_timestamps: true };
 * const result = JSON.parse(pm.play_out_process_tree(treeJson, 0, JSON.stringify(params)));
 * // { handle: "obj_42", trace_count: 50, event_count: 230 }
 * ```
 */
export function play_out_process_tree(tree_json: string, _root_node_idx: number, params: any): any;

/**
 * Return JSON statistics about a `.pm4bin` file without fully parsing it.
 *
 * Reads only the header (first 128 bytes) and returns:
 * ```json
 * {
 *   "version": 1,
 *   "num_traces": 10,
 *   "num_events": 100,
 *   "vocab_count": 5,
 *   "has_timestamps": true,
 *   "has_attributes": false,
 *   "file_size": 1024
 * }
 * ```
 */
export function pm4bin_info(bytes: Uint8Array): string;

export function powl_extensive_playout(powl_model_str: string, _root_id: string, config_json: string): any;

/**
 * Compute footprints (behavioral profiles) for a POWL model.
 *
 * Returns: `{ "start_activities": [...], "end_activities": [...], "parallel": [...], "sequence": [...] }`
 */
export function powl_footprints(s: string): string;

/**
 * Convert a POWL model to BPMN 2.0 XML.
 */
export function powl_to_bpmn(s: string): string;

/**
 * Convert a POWL model to a Petri Net (JSON).
 */
export function powl_to_petri_net(s: string): string;

/**
 * Convert a POWL model to a Process Tree (JSON).
 */
export function powl_to_process_tree(s: string): string;

/**
 * Convert a POWL model string to its canonical string representation.
 */
export function powl_to_string(s: string): string;

/**
 * Render a POWL model as SVG.
 *
 * # Arguments
 * * `s` - POWL model string, e.g. `"X(A, B)"`, `"PO=(nodes={A, B}, order={A-->B})"`
 *
 * # Returns
 * SVG string with colored operator nodes and activity labels
 */
export function powl_to_svg(s: string): string;

/**
 * Beam-search future paths from a case prefix.
 *
 * `model_handle` — handle returned by `build_ngram_predictor`.
 * `prefix_json`  — JSON array of activity name strings.
 * `beam_width`   — number of beams (candidate paths) to keep at each step.
 * `max_steps`    — maximum number of future activities to predict.
 *
 * Returns a JSON array of paths:
 * ```json
 * [
 *   { "sequence": ["C","D","E"], "probability": 0.42, "length": 3 },
 *   { "sequence": ["C","F"],     "probability": 0.18, "length": 2 }
 * ]
 * ```
 * Paths are sorted descending by probability.
 */
export function predict_beam_paths(model_handle: string, prefix_json: string, beam_width: number, max_steps: number): any;

/**
 * Predict remaining time for a running case given its activity prefix.
 *
 * # Parameters
 * - `model_handle` — handle returned by `build_remaining_time_model`
 * - `prefix_json` — JSON array of activity strings, e.g. `'["Register","Check"]'`
 *
 * # Returns
 * JSON string:
 * ```json
 * {
 *   "remaining_ms": 54000.0,
 *   "confidence": 0.82,
 *   "method": "bucket(Check|2)"
 * }
 * ```
 *
 * Lookup strategy (most specific → least):
 * 1. Exact bucket match `(last_activity, prefix_length)`
 * 2. Same `last_activity`, any prefix length (weighted avg of matching buckets)
 * 3. Same `prefix_length`, any activity
 * 4. Global fallback
 */
export function predict_case_duration(model_handle: string, prefix_json: string): any;

/**
 * Estimate the hazard rate at a given elapsed time using the Weibull survival
 * model fitted to historical case durations.
 *
 * # Parameters
 * - `model_handle` — handle returned by `build_remaining_time_model`
 * - `elapsed_ms` — milliseconds elapsed since case start
 *
 * # Returns
 * JSON string:
 * ```json
 * {
 *   "hazard_rate": 0.00012,
 *   "survival_probability": 0.43,
 *   "cumulative_hazard": 0.844,
 *   "median_remaining_ms": 25000.0,
 *   "shape": 1.8,
 *   "scale": 120000.0
 * }
 * ```
 *
 * - `hazard_rate` h(t) = (k/λ)(t/λ)^{k-1} — instantaneous failure rate
 * - `survival_probability` S(t) = exp(-(t/λ)^k) — P(duration > t)
 * - `cumulative_hazard` H(t) = (t/λ)^k
 * - `median_remaining_ms` — estimated time until 50 % completion probability
 */
export function predict_hazard_rate(model_handle: string, elapsed_ms: number): any;

/**
 * Predict the most likely next activities given a prefix sequence.
 *
 * `prefix_json` — JSON array of activity strings (recent history).
 *
 * Returns a JSON string:
 * ```json
 * [
 *   {"activity": "Approve", "probability": 0.75},
 *   {"activity": "Reject",  "probability": 0.25}
 * ]
 * ```
 * Sorted descending by probability.  Returns empty array if the prefix is
 * not in the model.
 */
export function predict_next_activity(predictor_handle: string, prefix_json: string): any;

/**
 * Return the top-k most likely next activities for a given prefix.
 *
 * `model_handle` — handle returned by `build_ngram_predictor`.
 * `prefix_json`  — JSON array of activity name strings, e.g. `["A","B"]`.
 * `k`            — how many candidates to return.
 *
 * Returns a JSON object:
 * ```json
 * {
 *   "activities":    ["C", "D"],
 *   "probabilities": [0.75, 0.25],
 *   "confidence":    0.75,
 *   "entropy":       0.56
 * }
 * ```
 * `confidence` is the probability of the top-1 prediction.
 * `entropy` is the normalised Shannon entropy of the distribution (0 = certain,
 * 1 = uniform).
 */
export function predict_next_k(model_handle: string, prefix_json: string, k: number): any;

/**
 * Convert a Process Tree (JSON) to a POWL model.
 *
 * Input JSON format (same as `powl_to_process_tree` output):
 * ```json
 * {"operator": "Xor", "children": [{"label": "A"}, {"label": "B"}]}
 * ```
 *
 * Returns: `{ "root": u32, "node_count": usize, "repr": "..." }`
 */
export function process_tree_to_powl(tree_json: string): any;

/**
 * Rank interventions using a greedy UCB-like heuristic.
 *
 * - `interventions_json` — JSON array: `[{ "name": "...", "utility": 0.8 }, ...]`
 * - `exploitation_weight` — 0–1: how much to favour highest utility
 *
 * Returns a JSON array of `{ name, score, rank }` sorted by descending score.
 */
export function rank_interventions(interventions_json: string, exploitation_weight: number): any;

/**
 * WASM entry point: parse BPMN 2.0 XML and return a POWL model string.
 *
 * # Errors
 * Returns a JavaScript `Error` with a descriptive message on failure.
 */
export function read_bpmn(bpmn_xml: string): string;

/**
 * Read a `.pm4bin` binary buffer and store the resulting `EventLog` in WASM
 * state. Returns the object handle.
 *
 * Uses `concept:name` as the default activity key and `time:timestamp` as the
 * default timestamp key.
 */
export function read_pm4bin(bytes: Uint8Array): string;

/**
 * Get information about the recommendations module.
 */
export function recommendations_info(): any;

/**
 * Reset drift detection thresholds to defaults (0.3, 0.7).
 */
export function reset_drift_thresholds(): string;

/**
 * Create an RlState from a feature slice and health level.
 *
 * This is the primary constructor used by the RL orchestrator.
 * It quantizes continuous feature values into discrete state dimensions.
 *
 * # Arguments
 *
 * * `features` - Slice of 8 f32 values (normalized to [0,1])
 * * `health_level` - 0-4 (explicit health score, not derived from features)
 * * `rework_ratio` - 0.0-1.0 (fraction of traces with repeated activities)
 *
 * # Returns
 *
 * * `RlState` - Quantized state object
 *
 * # Feature Mapping
 *
 * - `features[0]` → event_rate_q (event count / 10,000)
 * - `features[1]` → unused (trace count / 1,000)
 * - `features[2]` → activity_count_q (unique activities / 100)
 * - `features[3]` → unused (health_level / 4, overridden by param)
 * - `features[4]` → unused (special causes / 10)
 * - `features[5]` → spc_alert_level (special causes / 10)
 * - `features[6]` → drift_status (activity entropy)
 * - `features[7]` → circuit_state (circuit_allowed flag)
 * - `rework_ratio` → rework_ratio_q (0-7 quantized levels)
 */
export function rl_state_from_features(features: Float32Array, health_level: number, rework_ratio: number): RlState;

/**
 * Get the health_level field from an RlState.
 *
 * # Arguments
 *
 * * `state` - Reference to RlState
 *
 * # Returns
 *
 * * `u8` - Health level (0-4)
 */
export function rl_state_health_level(state: RlState): number;

/**
 * Score a trace for anomaly against a reference DFG model.
 *
 * Returns `{ score: number, is_anomalous: boolean, threshold: number }`.
 * Score is normalized 0-1 (>0.7 = anomalous).
 *
 * The raw anomaly cost from the DFG is mapped to [0,1] via `1 - exp(-raw/5)`.
 */
export function score_anomaly(model_handle: string, trace_json: string): any;

/**
 * Score every trace in an event log against a reference DFG.
 *
 * Returns a JSON string:
 * ```json
 * [{"case_id": "Case1", "score": 0.0, "steps": 2},
 *  {"case_id": "Case2", "score": 10.0, "steps": 3}]
 * ```
 * Sorted descending by score (most anomalous first).
 */
export function score_log_anomalies(log_handle: string, dfg_handle: string, activity_key: string): any;

/**
 * Score a single trace (given as a JSON array of activity strings) against a
 * reference DFG.
 *
 * ```javascript
 * const dfgJson   = JSON.stringify(pm.discover_dfg(logHandle, 'concept:name'));
 * const dfgHandle = pm.store_dfg_from_json(dfgJson);
 * const score = pm.score_trace_anomaly(dfgHandle,
 *                 JSON.stringify(['Register','Approve','Close']));
 * console.log(score); // 0.0 = perfectly normal
 * ```
 */
export function score_trace_anomaly(dfg_handle: string, activities_json: string): any;

/**
 * Score how likely a complete trace is according to the n-gram model.
 *
 * Returns log-probability (negative; higher = more likely).
 * Returns 0.0 for empty traces.
 */
export function score_trace_likelihood(predictor_handle: string, activities_json: string): any;

/**
 * Select an intervention using the UCB1 multi-armed bandit algorithm.
 *
 * - `bandit_json` — JSON bandit state with `arms` and `total_pulls`
 * - `exploration_factor` — controls exploration vs exploitation (typically √2 ≈ 1.414)
 *
 * Returns JSON: `{ selected, arm_index, ucb_score, mean_reward, exploration_bonus }`
 */
export function select_intervention(bandit_json: string, exploration_factor: number): any;

/**
 * Set drift detection thresholds for RL state feature quantization.
 *
 * # Arguments
 * * `low` - Low threshold (default: 0.3). Values below this are drift_status=0.
 * * `high` - High threshold (default: 0.7). Values at or above this are drift_status=2.
 *           Values in [low, high) are drift_status=1.
 *
 * # Returns
 * * `Ok(String)` - Success message with new thresholds
 * * `Err(JsValue)` - Error if thresholds are invalid
 *
 * # Example
 * ```javascript
 * // Set custom thresholds: 0.2 and 0.8
 * set_drift_thresholds(0.2, 0.8);
 * ```
 */
export function set_drift_thresholds(low: number, high: number): string;

/**
 * Get info about the SIMD streaming DFG implementation.
 */
export function simd_streaming_dfg_info(): any;

/**
 * SIMD-accelerated token replay for conformance checking.
 *
 * Discovers a DFG from the log, builds a SimdPetriNet, then replays
 * every trace and returns fitness / precision / per-case diagnostics.
 */
export function simd_token_replay(log_handle: string, activity_key: string): string;

/**
 * Simplify a POWL model using FrequentTransition frequency bounds.
 */
export function simplify_frequent_transitions(s: string): any;

/**
 * Simplify a POWL model (XOR/LOOP merging, nested XOR flattening, SPO inlining).
 */
export function simplify_powl(s: string): any;

/**
 * Get cache statistics as a JSON object: `{"hits":n,"misses":n,"evictions":n}`.
 */
export function smart_engine_cache_stats(handle: string): string;

/**
 * Feed a metric value to the convergence monitor and check if should stop.
 */
export function smart_engine_check_convergence(handle: string, metric: number): boolean;

/**
 * Check if the convergence monitor has detected convergence.
 */
export function smart_engine_converged(handle: string): boolean;

/**
 * Create a new SmartEngine instance and return its handle.
 */
export function smart_engine_create(): string;

/**
 * Create a new SmartEngine instance with custom parameters.
 */
export function smart_engine_create_with_params(cache_capacity: number, convergence_window: number, convergence_threshold: number, max_iterations: number): string;

/**
 * Destroy a smart engine and free its resources.
 */
export function smart_engine_destroy(handle: string): void;

/**
 * Reset all internal state of a smart engine.
 */
export function smart_engine_reset(handle: string): void;

/**
 * Run an algorithm via the smart engine.  Returns a JSON string result.
 *
 * `traces_json` is a JSON array of arrays of strings:
 * `[["a","b","c"], ["a","b","d"]]`
 */
export function smart_engine_run(handle: string, algorithm: string, traces_json: string): string;

/**
 * Store a DECLARE model from its JSON representation and return a handle.
 *
 * ```javascript
 * const declareJson = JSON.stringify(pm.discover_declare(logHandle, 'concept:name'));
 * const declareHandle = pm.store_declare_from_json(declareJson);
 * const result = pm.check_declare_conformance(logHandle, declareHandle, 'concept:name');
 * ```
 */
export function store_declare_from_json(declare_json: string): any;

/**
 * Store a DFG from its JSON representation and return a handle.
 *
 * Use this to bridge the output of `discover_dfg` (which returns inline JSON)
 * into a stored object that `streaming_conformance_begin` and other
 * handle-based APIs can consume.
 *
 * ```javascript
 * const dfgJson = JSON.stringify(pm.discover_dfg(logHandle, 'concept:name'));
 * const dfgHandle = pm.store_dfg_from_json(dfgJson);
 * const session = pm.streaming_conformance_begin(dfgHandle);
 * ```
 */
export function store_dfg_from_json(dfg_json: string): any;

/**
 * Append one event to an in-progress trace.
 *
 * Returns a JSON string: `{"ok": true, "event_count": N, "open_traces": N}`.
 */
export function streaming_conformance_add_event(handle: string, case_id: string, activity: string): any;

/**
 * Begin a new streaming conformance session against a reference DFG.
 *
 * `dfg_handle` — handle returned by `store_dfg_from_json` or
 * `streaming_dfg_finalize`.
 *
 * Returns an opaque session handle string.
 */
export function streaming_conformance_begin(dfg_handle: string): any;

/**
 * Close a trace: replay it against the reference DFG and return the result.
 *
 * Returns a JSON string with fields: `ok`, `case_id`, `is_conforming`,
 * `fitness`, `deviations`.
 */
export function streaming_conformance_close_trace(handle: string, case_id: string): any;

/**
 * Finalize the streaming conformance session.
 *
 * Flushes any still-open traces, returns a JSON summary string, and frees the
 * session handle.
 */
export function streaming_conformance_finalize(handle: string): any;

/**
 * Memory and progress statistics for an open streaming conformance session.
 *
 * Returns a JSON string with `event_count`, `closed_traces`, `open_traces`,
 * `conforming_traces`, `deviating_traces`, `avg_fitness`.
 */
export function streaming_conformance_stats(handle: string): any;

/**
 * Add a batch of events in one call (chunked ingestion).
 */
export function streaming_dfg_add_batch(handle: string, events_json: string): any;

/**
 * Append one event to an in-progress DFG trace.
 */
export function streaming_dfg_add_event(handle: string, case_id: string, activity: string): any;

/**
 * Begin a new streaming DFG session.
 */
export function streaming_dfg_begin(): any;

/**
 * Close a DFG trace and fold into model.
 */
export function streaming_dfg_close_trace(handle: string, case_id: string): any;

/**
 * End the current trace on the streaming DFG identified by `handle`.
 */
export function streaming_dfg_end_trace(handle: string): void;

/**
 * Finalize the stream and return DFG handle.
 */
export function streaming_dfg_finalize(handle: string): any;

/**
 * Flush all currently-open DFG traces.
 */
export function streaming_dfg_flush_open(handle: string): any;

/**
 * Process a single event on the streaming DFG identified by `handle`.
 *
 * `activity_id` is an integer activity identifier.
 */
export function streaming_dfg_process_event(handle: string, activity_id: number): void;

/**
 * Take a non-destructive DFG snapshot.
 */
export function streaming_dfg_snapshot(handle: string): any;

/**
 * Report memory/progress statistics.
 */
export function streaming_dfg_stats(handle: string): any;

/**
 * End the current trace.
 */
export function streaming_dfg_string_end_trace(handle: string): any;

/**
 * Process a single event by activity name (auto-interns strings).
 */
export function streaming_dfg_string_event(handle: string, activity: string): any;

/**
 * Create a new string-based StreamingDFG, store it in global state, return handle.
 */
export function streaming_dfg_string_new(): string;

/**
 * Get the current DFG snapshot as JSON (with human-readable activity labels).
 */
export function streaming_dfg_string_snapshot(handle: string): string;

/**
 * Append one event to an in-progress Heuristic trace.
 */
export function streaming_heuristic_add_event(handle: string, case_id: string, activity: string): any;

/**
 * Begin a new streaming Heuristic Miner session.
 */
export function streaming_heuristic_begin(threshold: number): any;

/**
 * Close a Heuristic trace.
 */
export function streaming_heuristic_close_trace(handle: string, case_id: string): any;

/**
 * Finalize Heuristic stream.
 */
export function streaming_heuristic_finalize(handle: string): any;

/**
 * Take a non-destructive Heuristic snapshot.
 */
export function streaming_heuristic_snapshot(handle: string): any;

/**
 * Streaming module info.
 */
export function streaming_info(): string;

/**
 * Get the number of unique activities seen.
 */
export function streaming_log_activity_count(handle: number): number;

/**
 * Add a trace (array of activity strings) to the StreamingLog.
 *
 * # Arguments
 *
 * * `handle` - The handle returned by `create_streaming_log`
 * * `activities` - A JavaScript array of activity name strings
 */
export function streaming_log_add_trace(handle: number, activities: any): void;

/**
 * Estimate the number of unique traces seen.
 */
export function streaming_log_estimate_cardinality(handle: number): number;

/**
 * Estimate the DFG from the StreamingLog and return it as a JSON string.
 *
 * Returns a `DirectlyFollowsGraph` serialized as JSON.
 */
export function streaming_log_estimate_dfg(handle: number): any;

/**
 * Get the total event count.
 */
export function streaming_log_event_count(handle: number): number;

/**
 * Get the approximate memory usage in bytes.
 */
export function streaming_log_memory_bytes(handle: number): number;

/**
 * Append one event to an in-progress Skeleton trace.
 */
export function streaming_skeleton_add_event(handle: string, case_id: string, activity: string): any;

/**
 * Begin a new streaming Skeleton session.
 */
export function streaming_skeleton_begin(min_frequency: number): any;

/**
 * Close a Skeleton trace.
 */
export function streaming_skeleton_close_trace(handle: string, case_id: string): any;

/**
 * Finalize Skeleton stream.
 */
export function streaming_skeleton_finalize(handle: string): any;

/**
 * Take a non-destructive Skeleton snapshot.
 */
export function streaming_skeleton_snapshot(handle: string): any;

/**
 * Serialize a stored PetriNet (identified by handle) to PNML XML.
 */
export function to_pnml_wasm(petri_net_handle: string): any;

/**
 * Compute token replay fitness for a POWL model against an event log.
 *
 * # Arguments
 * * `powl_str` - POWL model string
 * * `log_json` - JSON event log: `{ "traces": [{ "case_id": "...", "events": [{ "name": "A" }] }] }`
 *
 * # Returns
 * JSON fitness result.
 */
export function token_replay_fitness(powl_str: string, log_json: string): string;

/**
 * Validate that EventLog has activity attribute
 */
export function validate_has_activities(eventlog_handle: string, activity_key: string): boolean;

/**
 * Validate that EventLog has timestamp attribute
 */
export function validate_has_timestamps(eventlog_handle: string, timestamp_key: string): boolean;

/**
 * Validate OCEL 2.0 structure
 * Checks:
 * - All events reference existing objects (referential integrity)
 * - All timestamps are valid ISO 8601
 * - Object relations: source_id and target_id reference existing objects (if present)
 * Returns a validation report as JSON: { valid: bool, errors: Vec<String> }
 */
export function validate_ocel(handle: string): any;

/**
 * Validate that all StrictPartialOrder nodes have irreflexive, transitive order.
 */
export function validate_partial_orders(s: string): any;

/**
 * Convert a process tree JSON into a simplified flat representation
 * (for JS consumption — the full tree as a JSON string).
 *
 * Input JSON follows the same schema as `node_to_json` output.
 * Validates the structure and returns it back as a pretty-printed JSON string.
 *
 * ```javascript
 * const treeJson = JSON.stringify({
 *   type: "operator", operator: "SEQ",
 *   children: [
 *     { type: "activity", label: "A" },
 *     { type: "activity", label: "B" }
 *   ]
 * });
 * const result = pm.validate_process_tree(treeJson);
 * ```
 */
export function validate_process_tree(tree_json: string): any;

/**
 * Compute ETConformance precision for a stored EventLog and PetriNet.
 *
 * Takes two handles (event log and Petri net), plus an activity key, and
 * returns a JSON `PrecisionResult`.
 */
export function wasm_compute_precision(eventlog_handle: string, petri_net_handle: string, activity_key: string): string;

export function wasm_compute_simplicity(places: number, transitions: number, arcs: number): number;

/**
 * Parse XES content and write it as a `.pm4bin` binary byte vector.
 *
 * Uses `concept:name` as the default activity key and `time:timestamp` as the
 * default timestamp key.
 */
export function write_pm4bin(xes_content: string): Uint8Array;

export function xes_format_info(): string;
