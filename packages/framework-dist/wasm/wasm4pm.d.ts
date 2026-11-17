/* tslint:disable */
/* eslint-disable */
export function main(): void;
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
 * Reset the RL orchestrator to fresh state.
 */
export function rl_orchestrator_reset(): string;
/**
 * Get the currently active RL agent type (0=QLearning, 1=SARSA, 2=DoubleQ, 3=ExpectedSARSA, 4=REINFORCE).
 */
export function rl_orchestrator_active_agent(): number;
/**
 * Get circuit breaker state as JSON.
 */
export function circuit_breaker_get_state(): string;
/**
 * Set circuit breaker state from JSON.
 */
export function circuit_breaker_set_state(json: string): string;
/**
 * Configure the circuit breaker from a JSON config string.
 */
export function circuit_breaker_configure(config_json: string): string;
/**
 * Get current circuit breaker configuration as JSON.
 */
export function circuit_breaker_get_config(): string;
/**
 * Reset the persistent circuit breaker.
 */
export function circuit_breaker_reset(): string;
/**
 * Run the full agentic pipeline for a task: role selection → topology selection →
 * evidence sufficiency → escalation check → prompt binding compilation.
 *
 * Input: JSON-encoded `TaskContext`
 * Output: JSON-encoded `{ bindings: PromptBindingSet, evidence_sufficient: bool,
 *         should_escalate: bool, escalation_target: AgentRole|null,
 *         gaps: string[] }`
 */
export function run_agentic_pipeline(task_json: string): string;
/**
 * Validate a handoff request between two agents.
 *
 * Input: JSON-encoded `HandoffRequest`
 * Output: JSON-encoded `HandoffDecision`
 */
export function validate_agentic_handoff(request_json: string): string;
/**
 * Evaluate counterfactual action options for a task using the RL reward model.
 *
 * Input: JSON-encoded `TaskContext`
 * Output: JSON-encoded `CounterfactualResult` — ranked action options with
 *         estimated rewards from the RL orchestrator.
 */
export function evaluate_agentic_counterfactuals(task_json: string): string;
/**
 * Run a JTBD (Jobs-to-be-Done) test suite against the agentic framework.
 *
 * Accepts a JSON array of `JtbdCase` objects and returns a JSON array of
 * `JtbdResult` objects, each containing per-assertion pass/fail details.
 *
 * Input: JSON-encoded `JtbdCase[]`
 * Output: JSON-encoded `{ passed: number, failed: number, results: JtbdResult[] }`
 */
export function run_agentic_jtbd_suite(cases_json: string): string;
/**
 * Switch the active RL agent by type index.
 */
export function rl_orchestrator_switch_agent(agent_type: number): string;
/**
 * Enable or disable LinUCB-based agent selection.
 */
export function rl_orchestrator_set_linucb(enabled: boolean): string;
/**
 * Get RL orchestrator telemetry as JSON.
 */
export function rl_orchestrator_telemetry(): string;
/**
 * Get RL orchestrator telemetry as a JavaScript object.
 *
 * Returns the 5 critical telemetry fields as a JsValue:
 * - cycle_count: number of autonomic cycles executed
 * - last_health_state: system health level (0=Normal, 1=Warning, 2=Degraded, 3=Critical, 4=Failed)
 * - cumulative_reward: total reward accumulated across all cycles
 * - last_reward: reward from the most recent cycle
 * - last_spc_alert_count: number of SPC special causes in the last cycle
 */
export function rl_orchestrator_get_telemetry(): any;
/**
 * Serialize current RL orchestrator state to JSON for persistence.
 *
 * Returns a JSON string containing telemetry, active agent, and LinUCB state.
 * This can be stored and later restored via `restore_rl_state` to resume
 * RL learning progress across CLI sessions.
 *
 * # Returns
 *
 * * `Ok(String)` - JSON-serialized RL state
 * * `Err(JsValue)` - Serialization error
 */
export function serialize_rl_state(): string;
/**
 * Restore RL orchestrator state from JSON.
 *
 * Deserializes a previously-saved RL state and restores telemetry,
 * active agent, Q-tables from all agents, and LinUCB configuration.
 *
 * # Arguments
 *
 * * `json` - JSON string previously returned by `serialize_rl_state`
 *
 * # Returns
 *
 * * `Ok(String)` - Success message with restored cycle count
 * * `Err(JsValue)` - Invalid JSON or malformed state
 */
export function restore_rl_state(json: string): string;
/**
 * Get SPC history as JSON.
 */
export function get_spc_history(): string;
/**
 * Set SPC history from JSON.
 */
export function set_spc_history(json: string): string;
export function truex_verify_receipt(envelope_json: string): string;
export function evaluate_ocpq(ocel_json: string, query_str: string): string;
/**
 * Initialize the WASM module
 */
export function init(): string;
/**
 * Get the wasm4pm crate version string.
 */
export function get_version(): string;
/**
 * Get WASM module capabilities as a JavaScript object.
 *
 * Returns version and feature flags indicating which algorithms
 * and capabilities are available in this build.
 * Shape: `{version: string, features: {discovery: bool, conformance: bool, ...}}`
 */
export function get_capabilities(): any;
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
 * Clear all caches (parse, columnar, interner).
 */
export function clear_all_caches(): void;
/**
 * Get cache statistics as a JavaScript object.
 *
 * Returns `{parse_hits, parse_misses, columnar_entries, interner_entries}`.
 */
export function get_cache_stats(): any;
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
 * Reset drift detection thresholds to defaults (0.3, 0.7).
 */
export function reset_drift_thresholds(): string;
/**
 * SIMD-accelerated token replay for conformance checking.
 *
 * Discovers a DFG from the log, builds a SimdPetriNet, then replays
 * every trace and returns a JSON string with `overall_fitness`, `precision`,
 * and per-case diagnostics (each trace has a `fitness` field).
 *
 * Approximation cap: at most the first 8 candidate transitions per activity
 * label are tried when firing; labels with >8 same-label transitions are
 * replayed approximately (`"cap_applied": true` reports when that bound a search).
 */
export function simd_token_replay(log_handle: string, activity_key: string): string;
/**
 * AutoProcess: Run the complete 4-layer autonomic control loop.
 *
 * Layers:
 * 1. **Perception** — Build ExecutionContext from event log metrics
 * 2. **Decision** — Evaluate guards + dispatch workflow pattern
 * 3. **Protection** — Circuit breaker + Statistical Process Control (SPC)
 * 4. **Optimization** — Reinforcement learning (Q-Learning) action selection
 *
 * Returns JSON with cycle_result (all 4 layers) and nanosecond timing.
 */
export function autonomic_execute_cycle(log_handle: string, activity_key: string, _config_json: string): string;
/**
 * Discover the Alpha-style footprint matrix from an event log.
 *
 * Returns `{activities: string[], matrix: FootprintRelation[][]}`.
 * **`matrix[i][j]` is indexed by position**, not by activity name.
 * Use `activities.indexOf(name)` to map activity names to matrix indices.
 *
 * `FootprintRelation` values: `"Causal"` (i→j), `"CausalInv"` (j→i),
 * `"Parallel"` (both directions), `"NeverFollows"` (no succession).
 */
export function discover_footprints(eventlog_handle: string, activity_key: string): any;
/**
 * Discover a Petri net using the Alpha++ algorithm.
 *
 * Implements Alpha++ (de Medeiros et al.) extending Alpha Miner with:
 *   - L1L set: activities `a` where `(a,a)` is in directly-follows (length-1 loops)
 *   - L2L set: activity pairs `(a,b)` where both `(a,b)` and `(b,a)` are in DF (length-2 loops)
 *   - Short-loop-aware footprint matrix: reclassifies Parallel relations from length-1/2 loops as Causal
 *   - Place candidates `(A,B)` where A×B ⊆ causal relation (maximal pairs only)
 *
 * # Parameters
 * * `eventlog_handle` — Handle from `load_eventlog_from_xes` / `load_eventlog_from_json`.
 * * `activity_key` — XES attribute for activity names (e.g. `"concept:name"`).
 * * `min_support` — Minimum frequency threshold `[0.0, 1.0]` for directly-follows edges.
 *   `0.0` = no filtering (include all edges). Use `0.0` for small logs to avoid empty models.
 *
 * # Returns
 * `Result<JsValue, JsValue>` — On success:
 * ```json
 * { "handle": "...", "places": 5, "transitions": 4, "arcs": 12 }
 * ```
 * Use the returned `handle` with `export_petri_net_to_json` or conformance functions.
 *
 * # Note
 * Alpha++ handles length-1 and length-2 loops correctly. For heavily noisy logs,
 * prefer `discover_heuristic_miner` which is more tolerant of noise.
 */
export function discover_alpha_plus_plus(eventlog_handle: string, activity_key: string, min_support: number): any;
/**
 * Discover DFG with frequency filtering
 */
export function discover_dfg_filtered(eventlog_handle: string, activity_key: string, min_frequency: number): any;
/**
 * Export DFG to JSON
 */
export function export_dfg_to_json(handle: string): string;
/**
 * Export PetriNet to JSON
 */
export function export_petri_net_to_json(handle: string): string;
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
 *  function for baseline admissibility: DFG-based alignment (greedy).
 */
export function compute_alignments(log_handle: string, dfg_handle: string, activity_key: string): any;
export function monte_carlo_simulation(log_handle: string, _powl_handle: string, _root_id: string, config_json: string): any;
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
 * Score how likely a complete trace is according to the n-gram model.
 *
 * Returns log-probability (negative; higher = more likely).
 * Returns 0.0 for empty traces.
 */
export function score_trace_likelihood(predictor_handle: string, activities_json: string): any;
/**
 * Return JSON { hits, misses, evictions, total_bytes } with cache statistics.
 *
 * # Returns
 * ```json
 * {
 *   "hits": 42,
 *   "misses": 8,
 *   "evictions": 2,
 *   "total_bytes": 65536,
 *   "parse_entries": 3,
 *   "columnar_entries": 5,
 *   "interner_entries": 1
 * }
 * ```
 */
export function cache_stats(): any;
/**
 * Return BLAKE3 (FNV-1a) hex hash of XES content string.
 *
 * # Arguments
 * * `xes_content` — XES event log as string
 *
 * # Returns
 * 16-character lowercase hex string
 *
 * # Example
 * ```
 * use wasm4pm::wasm_utils::hash_xes_content;
 * let hash = hash_xes_content("<log></log>");
 * assert_eq!(hash.len(), 16);
 * ```
 */
export function hash_xes_content(xes_content: string): string;
/**
 * Compute Jaccard distance between two JSON-serialized activity sets.
 *
 * # Arguments
 * * `set1_json` — JSON string: `["A", "B", "C"]`
 * * `set2_json` — JSON string: `["B", "C", "D"]`
 *
 * # Returns
 * Distance in [0.0, 1.0]:
 * - `0.0` = identical or both empty
 * - `1.0` = completely disjoint
 *
 * # Example
 * ```
 * use wasm4pm::wasm_utils::jaccard_distance;
 * let dist = jaccard_distance(r#"["A", "B"]"#, r#"["B", "C"]"#).unwrap();
 * assert!((dist - 0.6666666666666667).abs() < 1e-10);
 * ```
 */
export function jaccard_distance(set1_json: string, set2_json: string): number;
/**
 * Compute exponential weighted moving average over a numeric series.
 *
 * # Arguments
 * * `values_json` — JSON string: `[1.0, 2.0, 3.0, ...]`
 * * `alpha` — Smoothing factor in (0.0, 1.0]; clamped if out of range
 *
 * # Returns
 * JSON string: `[1.0, 1.5, 2.25, ...]` (EWMA series)
 *
 * # Example
 * ```
 * use wasm4pm::wasm_utils::ewma_series;
 * let smoothed = ewma_series(r#"[1.0, 2.0, 3.0, 4.0, 5.0]"#, 0.5).unwrap();
 * ```
 *
 * # Theory
 * `s[i] = α · x[i] + (1 - α) · s[i-1]` with `s[0] = x[0]`
 */
export function ewma_series(values_json: string, alpha: number): any;
/**
 * Identify activities with high variance (low frequency consistency).
 *
 * Scans the event log and flags activities where:
 * - Occurrence count per trace varies widely (variance > threshold)
 * - Activity is sparse or bursty
 *
 * # Arguments
 * * `eventlog_handle` — Handle from `load_eventlog_from_xes()`
 * * `activity_key` — Activity attribute name (e.g., "concept:name")
 * * `threshold` — Variance threshold; activities with variance > threshold are returned
 *
 * # Returns
 * ```json
 * {
 *   "high_variance_activities": [
 *     {
 *       "activity": "Inspect",
 *       "variance": 2.45,
 *       "min_per_trace": 0,
 *       "max_per_trace": 5,
 *       "mean_per_trace": 1.2,
 *       "occurrence_count": 48
 *     }
 *   ],
 *   "total_activities": 15
 * }
 * ```
 */
export function identify_high_variance_activities(eventlog_handle: string, activity_key: string, threshold: number): any;
/**
 * WASM export: convert a stored Petri-net handle into a POWL 2.0 model
 * (Section 4 of arXiv:2602.15739v3). Returns a JSON summary
 * `{ is_wf_net, converted, powl, repr, reason }` as a `JsValue` string.
 */
export function wf_net_to_powl(petri_net_handle: string): any;
/**
 * Parse basic XES format - simplified XML parser
 * XES is the standard eXtensible Event Stream format for process logs
 */
export function load_eventlog_from_xes(content: string): string;
/**
 * Parse XES format with parse cache — skips re-parsing if content hash matches.
 */
export function load_eventlog_from_xes_cached(content: string): string;
/**
 * Export EventLog to XES format (generates valid XES XML)
 */
export function export_eventlog_to_xes(eventlog_handle: string): string;
export function xes_format_info(): string;
/**
 * Accept raw bytes, auto-detect gzip (magic bytes 0x1f 0x8b), decompress if
 * needed, then delegate to the string-based `load_eventlog_from_xes` parser.
 *
 * This allows callers to pass either a plain `.xes` file or a `.xes.gz` file
 * without knowing ahead of time which format it is.
 */
export function load_eventlog_from_xes_gz(bytes: Uint8Array): string;
/**
 * WASM entry point: parse BPMN 2.0 XML and return a POWL model string.
 *
 * # Errors
 * Returns a JavaScript `Error` with a descriptive message on failure.
 */
export function read_bpmn(bpmn_xml: string): string;
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
 * Get conformance checking info
 */
export function conformance_info(): string;
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
 * Load a POWL v1 model string and return a JSON object with handle, node_count, repr, version.
 */
export function load_powl_from_string(powl_str: string): any;
/**
 * Load a POWL v2 DSL string and return a JSON object with handle, node_count, repr, version.
 */
export function load_powl_v2_from_string(dsl: string): any;
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
 * Check data quality of an EventLog for common issues
 */
export function check_data_quality(log_handle: string, activity_key: string, timestamp_key: string): any;
/**
 * Check data quality of an OCEL
 */
export function check_ocel_data_quality(ocel_handle: string): any;
/**
 * Infer schema from EventLog by analyzing attribute patterns
 */
export function infer_eventlog_schema(log_handle: string): any;
/**
 * Infer schema from OCEL
 */
export function infer_ocel_schema(ocel_handle: string): any;
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
 * Get information about OC Petri Net discovery
 */
export function oc_petri_net_info(): any;
/**
 * List all unique object types in an OCEL
 */
export function list_ocel_object_types(ocel_handle: string): any;
/**
 * Get statistics about OCEL structure and content
 */
export function get_ocel_type_statistics(ocel_handle: string): any;
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
 * Measure information loss when flattening an OCEL to a case-centric event log.
 *
 * Returns a JSON object with a `flattening_loss` array — one entry per object type —
 * each containing the `FlatteningLossReport` fields plus a derived
 * `duplicate_event_ratio` (event_duplication_count / unique_ocel_events_referenced).
 */
export function measure_ocel_flattening_loss(ocel_handle: string): any;
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
 * Discover a simple process tree from an event log using frequency-based heuristics.
 *
 * Returns a JSON string representing the process tree.
 */
export function discover_simple_process_tree(log_handle: string, activity_key: string): any;
/**
 * Create a new SmartEngine instance and return its handle.
 */
export function smart_engine_create(): string;
/**
 * Create a new SmartEngine instance with custom parameters.
 */
export function smart_engine_create_with_params(cache_capacity: number, convergence_window: number, convergence_threshold: number, max_iterations: number): string;
/**
 * Run an algorithm via the smart engine.  Returns a JSON string result.
 *
 * `traces_json` is a JSON array of arrays of strings:
 * `[["a","b","c"], ["a","b","d"]]`
 */
export function smart_engine_run(handle: string, algorithm: string, traces_json: string): string;
/**
 * Check if the convergence monitor has detected convergence.
 */
export function smart_engine_converged(handle: string): boolean;
/**
 * Get cache statistics as a JSON object: `{"hits":n,"misses":n,"evictions":n}`.
 */
export function smart_engine_cache_stats(handle: string): string;
/**
 * Feed a metric value to the convergence monitor and check if should stop.
 */
export function smart_engine_check_convergence(handle: string, metric: number): boolean;
/**
 * Reset all internal state of a smart engine.
 */
export function smart_engine_reset(handle: string): void;
/**
 * Destroy a smart engine and free its resources.
 */
export function smart_engine_destroy(handle: string): void;
/**
 * Parse XES content and write it as a `.pm4bin` binary byte vector.
 *
 * Uses `concept:name` as the default activity key and `time:timestamp` as the
 * default timestamp key.
 */
export function write_pm4bin(xes_content: string): Uint8Array;
/**
 * Read a `.pm4bin` binary buffer and store the resulting `EventLog` in WASM
 * state. Returns the object handle.
 *
 * Uses `concept:name` as the default activity key and `time:timestamp` as the
 * default timestamp key.
 */
export function read_pm4bin(bytes: Uint8Array): string;
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
export function wasm_compute_simplicity(places: number, transitions: number, arcs: number): number;
/**
 * Frequency-aware Petri net discovery with noise filtering.
 * Filters directly-follows relations to include only edges that occur ≥ 2 times,
 * reducing overfitting to rare behaviors while maintaining high fitness on core process.
 */
export function discover_ilp_petri_net(eventlog_handle: string, activity_key: string): any;
/**
 * Discover optimal DFG using constraint satisfaction
 * Balances fitness and simplicity using weighted optimization
 */
export function discover_optimized_dfg(eventlog_handle: string, activity_key: string, fitness_weight: number, simplicity_weight: number): any;
export function ilp_discovery_info(): string;
/**
 * Convert a DFG to human-readable English text
 * Describes activities, start/end activities, and edge paths with percentages
 */
export function encode_dfg_as_text(dfg_handle: string): string;
/**
 * Convert top process variants to human-readable text
 * Lists the most common execution sequences with case counts and percentages
 */
export function encode_variants_as_text(log_handle: string, activity_key: string, top_n: number): string;
/**
 * Convert event log statistics to human-readable summary text
 */
export function encode_statistics_as_text(log_handle: string): string;
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
 * Convert a Petri Net to human-readable text for LLM consumption
 * Includes places, transitions, arcs, and markings
 */
export function encode_petri_net_as_text(petri_net_handle: string): string;
/**
 * Convert OCEL to a concise text summary for LLM consumption
 * Includes event types, object types, counts, and relationships
 */
export function encode_ocel_as_text(ocel_handle: string): string;
/**
 * Convert an Object-Centric Petri Net (stored as JSON) to text
 * The OC Petri Net is stored as a JsonString containing per-type Petri Net structures
 */
export function encode_oc_petri_net_as_text(oc_petri_net_handle: string): string;
/**
 * Compare two process models (DFGs or Petri Nets) and produce a text diff
 * Highlights differences in structure, edges, and frequencies
 */
export function encode_model_comparison_as_text(model1_handle: string, model2_handle: string): string;
/**
 * Convert OCEL (Object-Centric Event Log) to human-readable summary text
 */
export function encode_ocel_summary_as_text(ocel_handle: string): string;
/**
 * Discover a process model using genuine A* search over DFG edge subsets.
 *
 * State = (canonical ascending subset of DFG edge candidates), g(n) = real
 * accumulated value in pair-coverage units (covered pair occurrences minus a
 * fixed per-edge complexity penalty), h(n) = admissible optimistic bound on
 * remaining improvement (see [`discover_astar_bounded_from_log`]). Searched with
 * a `BinaryHeap` priority queue and deterministic (f, lexicographic-state) order.
 *
 * Returns `{handle, algorithm: "astar", nodes, edges, iterations: usize}`.
 *
 * **IMPORTANT:** The `iterations` field in the result is a node-expansion count,
 * **not a fitness score**. Do not interpret it as model quality.
 *
 * # Parameters
 * * `max_iterations` — Maximum node expansions. Use 500–2000 for real logs.
 *   Higher values allow more thorough search but take longer.
 */
export function discover_astar(eventlog_handle: string, activity_key: string, max_iterations: number): any;
/**
 * Bounded A* discovery (WASM surface). With `beam_width = Some(w)`, the open
 * set is truncated to the `w` best nodes after every expansion, so optimality
 * is lost and the search degenerates to beam search (bounded A*); the result
 * JSON then reports `"algorithm": "beam"`. With `None`, genuine (optimal) A*.
 */
export function discover_astar_bounded(entrylog_handle: string, activity_key: string, max_iterations: any, beam_width?: number | null): any;
/**
 * Hill Climbing - greedy local optimization
 */
export function discover_hill_climbing(eventlog_handle: string, activity_key: string): any;
/**
 * Trace Variants - extract unique process paths and their frequencies
 */
export function analyze_trace_variants(eventlog_handle: string, activity_key: string): any;
/**
 * Sequential Pattern Mining - find frequent activity sequences
 */
export function mine_sequential_patterns(eventlog_handle: string, activity_key: string, min_support: number, pattern_length: number): any;
/**
 * Concept Drift Detection - identify where process behavior changes
 */
export function detect_concept_drift(eventlog_handle: string, activity_key: string, window_size: number): any;
/**
 * Process Clustering - group similar traces using bitset-based k-means
 * Time complexity: O(T×K) where T = traces, K = clusters (vs O(T×K×A) for string-based)
 */
export function cluster_traces(eventlog_handle: string, activity_key: string, num_clusters: number): any;
/**
 * Start/End Activity Analysis - find entry and exit points
 */
export function analyze_start_end_activities(eventlog_handle: string, activity_key: string): any;
/**
 * Activity Co-occurrence - find activities that happen together
 */
export function analyze_activity_cooccurrence(eventlog_handle: string, activity_key: string): any;
export function fast_discovery_info(): string;
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
export function register_model(envelope_json: string): string;
export function get_model(model_id: string): string;
/**
 * Discover a process tree using the Inductive Miner algorithm.
 *
 * Guarantees a **sound** process model (no deadlocks, always-terminates). The output
 * is a recursive process tree rather than a DFG or Petri net.
 *
 * # Parameters
 * * `eventlog_handle` — Handle from `load_eventlog_from_xes` / `load_eventlog_from_json`.
 * * `activity_key` — XES attribute to use as activity label (e.g. `"concept:name"`).
 *
 * # Returns
 * `Result<JsValue, JsValue>` — On success:
 * ```json
 * {
 *   "algorithm": "inductive_miner",
 *   "root": { "node_type": "sequence" | "xor" | "parallel" | "loop" | "leaf", "label": "...", "children": [...] },
 *   "nodes": 7
 * }
 * ```
 *
 * # Note
 * Activities are sorted deterministically before splitting. The tree structure is always
 * deterministic for the same input log. Use this instead of `discover_dfg` when you need
 * soundness guarantees.
 */
export function discover_inductive_miner(eventlog_handle: string, activity_key: string): any;
/**
 * Ant Colony Optimization - pheromone-based model discovery
 * Layer 6b: Edge-set representation with integer-keyed pheromone map
 */
export function discover_ant_colony(eventlog_handle: string, activity_key: string, num_ants: number, iterations: number): any;
/**
 * Simulated Annealing - thermal search for optimal models
 * Layer 6b: Edge-set representation with integer-based edge mutation
 */
export function discover_simulated_annealing(eventlog_handle: string, activity_key: string, temperature: number, cooling_rate: number): any;
/**
 * Process Skeleton - extract minimal model structure
 */
export function extract_process_skeleton(eventlog_handle: string, activity_key: string, min_frequency: number): any;
/**
 * Activity Dependency Analysis - identify predecessor/successor relationships
 */
export function analyze_activity_dependencies(eventlog_handle: string, activity_key: string): any;
/**
 * Case Attribute Analysis - correlate case attributes with process behavior
 */
export function analyze_case_attributes(eventlog_handle: string, activity_key: string): any;
export function more_discovery_info(): string;
export function oc_conformance_check(ocel_handle: string): any;
/**
 * Get information about OC conformance checking.
 */
export function oc_conformance_info(): any;
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
export function oc_performance_analysis(ocel_handle: string): any;
/**
 * Module info for capability registry.
 */
export function oc_performance_info(): any;
/**
 * Execute a POWL model with the proof-carrying bcinr-powl engine.
 *
 * `config_json`: optional `{"max_iters": u8}` (loop redo bound, default 3;
 * 0 = unlimited, guarded by the tick cap).
 */
export function powl_execute(powl_str: string, config_json: string): any;
/**
 * Discover a handover-of-work social network.
 *
 * `resource_key` — event attribute holding the resource/originator
 *   (typically `"org:resource"` in XES).
 */
export function discover_handover_network(log_handle: string, resource_key: string): any;
/**
 * Discover a working-together network.
 */
export function discover_working_together_network(log_handle: string, resource_key: string): any;
/**
 * Compute network centrality metrics (degree, betweenness, closeness).
 *
 * Returns JSON with keys: `degree`, `betweenness`, `closeness`, all as maps
 * from resource ID to centrality score (0-1).
 */
export function compute_network_metrics(log_handle: string, resource_key: string): any;
/**
 * Compute clustering coefficient (local and global).
 */
export function compute_clustering_coefficient(log_handle: string, resource_key: string): any;
/**
 * Detect communities in the network using Louvain algorithm.
 */
export function detect_communities(log_handle: string, resource_key: string): any;
/**
 * Begin a new streaming DFG session.
 */
export function streaming_dfg_begin(): any;
/**
 * Append one event to an in-progress DFG trace.
 */
export function streaming_dfg_add_event(handle: string, case_id: string, activity: string): any;
/**
 * Add a batch of events in one call (chunked ingestion).
 */
export function streaming_dfg_add_batch(handle: string, events_json: string): any;
/**
 * Close a DFG trace and fold into model.
 */
export function streaming_dfg_close_trace(handle: string, case_id: string): any;
/**
 * Finalize Skeleton stream.
 */
export function streaming_skeleton_finalize(handle: string): any;
/**
 * Begin a new streaming Heuristic Miner session.
 */
export function streaming_heuristic_begin(threshold: number): any;
/**
 * Append one event to an in-progress Heuristic trace.
 */
export function streaming_heuristic_add_event(handle: string, case_id: string, activity: string): any;
/**
 * Close a Heuristic trace.
 */
export function streaming_heuristic_close_trace(handle: string, case_id: string): any;
/**
 * Take a non-destructive Heuristic snapshot.
 *
 * Returns a JSON string — callers must `JSON.parse()` the result.
 */
export function streaming_heuristic_snapshot(handle: string): any;
/**
 * Finalize Heuristic stream.
 */
export function streaming_heuristic_finalize(handle: string): any;
/**
 * Streaming module info.
 */
export function streaming_info(): string;
/**
 * Flush all currently-open DFG traces.
 */
export function streaming_dfg_flush_open(handle: string): any;
/**
 * Take a non-destructive DFG snapshot.
 *
 * Returns a JSON string (not a JS object) — callers must `JSON.parse()` the result.
 * This uses `serde_json::to_string` + `JsValue::from_str` to avoid the known
 * `serde_wasm_bindgen::to_value` bug that silently returns `{}` on wasm32 for
 * `serde_json::Value` payloads.
 */
export function streaming_dfg_snapshot(handle: string): any;
/**
 * Finalize the stream and return DFG handle.
 */
export function streaming_dfg_finalize(handle: string): any;
/**
 * Report memory/progress statistics.
 *
 * Returns a JSON string — callers must `JSON.parse()` the result.
 */
export function streaming_dfg_stats(handle: string): any;
/**
 * Begin a new streaming Skeleton session.
 */
export function streaming_skeleton_begin(min_frequency: number): any;
/**
 * Append one event to an in-progress Skeleton trace.
 */
export function streaming_skeleton_add_event(handle: string, case_id: string, activity: string): any;
/**
 * Close a Skeleton trace.
 */
export function streaming_skeleton_close_trace(handle: string, case_id: string): any;
/**
 * Take a non-destructive Skeleton snapshot.
 *
 * Returns a JSON string — callers must `JSON.parse()` the result.
 */
export function streaming_skeleton_snapshot(handle: string): any;
/**
 * Measure variant entropy and diversity in event log.
 */
export function analyze_variant_complexity(eventlog_handle: string, activity_key: string): any;
/**
 * Compute activity transition matrix (Markov chain).
 */
export function compute_activity_transition_matrix(eventlog_handle: string, activity_key: string): any;
/**
 * Identify where the process accelerates/decelerates over time.
 *
 * Orders traces by their first timestamp, groups them into consecutive
 * windows of `window_size` traces, computes each window's mean inter-event
 * gap, and fits an OLS trend of mean gap over window index. A negative slope
 * means gaps are shrinking over time (speedup); positive means slowdown.
 */
export function analyze_process_speedup(eventlog_handle: string, timestamp_key: string, window_size: number): any;
/**
 * Compute pairwise trace similarity matrix.
 */
export function compute_trace_similarity_matrix(eventlog_handle: string, activity_key: string): any;
/**
 * Identify temporal bottlenecks by activity duration.
 */
export function analyze_temporal_bottlenecks(eventlog_handle: string, activity_key: string, timestamp_key: string): any;
/**
 * Extract mandatory activity ordering from event log.
 */
export function extract_activity_ordering(eventlog_handle: string, activity_key: string): any;
export function final_analytics_info(): string;
/**
 * Create a new streaming DFG, store it in global state, and return its handle.
 */
export function new_streaming_dfg(): string;
/**
 * Process a single event on the streaming DFG identified by `handle`.
 *
 * `activity_id` is an integer activity identifier.
 */
export function streaming_dfg_process_event(handle: string, activity_id: number): void;
/**
 * End the current trace on the streaming DFG identified by `handle`.
 */
export function streaming_dfg_end_trace(handle: string): void;
/**
 * Get the current DFG snapshot as a JSON string.
 */
export function incremental_dfg_snapshot(handle: string): string;
/**
 * Get streaming DFG stats as JSON: `{"total_events":N,"unique_activities":N,"unique_edges":N}`.
 */
export function incremental_dfg_stats(handle: string): string;
/**
 * Create a new string-based StreamingDFG, store it in global state, return handle.
 */
export function streaming_dfg_string_new(): string;
/**
 * Process a single event by activity name (auto-interns strings).
 */
export function streaming_dfg_string_event(handle: string, activity: string): any;
/**
 * End the current trace.
 */
export function streaming_dfg_string_end_trace(handle: string): any;
/**
 * Get the current DFG snapshot as JSON (with human-readable activity labels).
 */
export function streaming_dfg_string_snapshot(handle: string): string;
export function discover_performance_dfg(log_handle: string, activity_key: string, timestamp_key: string): any;
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
/**
 * Get information about the recommendations module.
 */
export function recommendations_info(): any;
/**
 * Detect concept drift over an event log using a sliding-window Jaccard
 * distance over the per-window activity vocabulary.
 *
 * A drift point is recorded whenever the Jaccard distance between the
 * activity sets of two consecutive windows exceeds
 * [`DEFAULT_DRIFT_THRESHOLD`].
 *
 * # Parameters
 *
 * * `log_handle` — handle of an `EventLog` previously stored via
 *   `load_eventlog_from_xes` / `load_eventlog_from_json`.
 * * `activity_key` — event-attribute key holding the activity name
 *   (commonly `"concept:name"`).
 * * `window_size` — number of traces per window. Must be `>= 1`; a value of
 *   `0` is silently treated as `1`.
 *
 * # Returns
 *
 * A JSON-serialised JS string of the form:
 *
 * ```json
 * {
 *   "drifts_detected": 2,
 *   "drifts": [
 *     { "position": 10, "distance": 0.45, "type": "concept_drift" }
 *   ],
 *   "window_size": 5,
 *   "method": "jaccard_window",
 *   "threshold": <DEFAULT_DRIFT_THRESHOLD, the empirical default>
 * }
 * ```
 *
 * # Errors
 *
 * Returns a `JsValue` error if the handle is missing or refers to a
 * non-`EventLog` object.
 */
export function detect_drift(log_handle: string, activity_key: string, window_size: number): any;
/**
 * WASM export of [`detect_drift_native_with_threshold`]: identical to
 * [`detect_drift`] except the drift cutoff is caller-supplied instead of
 * [`DEFAULT_DRIFT_THRESHOLD`]. Clamped to `[0.0, 1.0]`.
 */
export function detect_drift_with_threshold(log_handle: string, activity_key: string, window_size: number, threshold: number): any;
/**
 * Real, `wasm_bindgen`-exported entry point for [`detect_drift_ks_native`].
 * See that function's docs for the real algorithm (J-measure + two-sample
 * Kolmogorov-Smirnov test, following Bose et al. 2011 Section 3, with the
 * "follows" relation narrowed to a fixed directly-follows bigram rather
 * than the paper's parameterized window-length-l relation) -- distinct
 * from, and additive alongside, [`detect_drift`]'s Jaccard/TV heuristic.
 *
 * # Returns
 *
 * A JSON-serialised JS string, e.g.:
 *
 * ```json
 * {
 *   "drifts_detected": 1,
 *   "drifts": [
 *     { "position": 3, "ks_statistic": 0.72, "critical_value": 0.61, "type": "concept_drift_ks" }
 *   ],
 *   "window_size": 5,
 *   "method": "j_measure_ks_test",
 *   "alpha": 0.05
 * }
 * ```
 *
 * # Errors
 *
 * Returns a `JsValue` error if the handle is missing or refers to a
 * non-`EventLog` object.
 */
export function detect_drift_ks(log_handle: string, activity_key: string, window_size: number, alpha: number): any;
/**
 * Compute an exponentially weighted moving average (EWMA) over a JSON
 * numeric series, plus a coarse trend classification.
 *
 * # Parameters
 *
 * * `values_json` — JSON array of numbers, e.g. `"[1.0, 2.0, 3.5]"`.
 * * `alpha` — smoothing factor; clamped into `(0.0, 1.0]`. Higher values
 *   weight recent samples more heavily.
 *
 * # Returns
 *
 * A JSON-serialised JS string of the form:
 *
 * ```json
 * {
 *   "smoothed": [1.0, 1.3, 1.96],
 *   "trend": "rising",
 *   "last_value": 1.96,
 *   "alpha": <the caller-supplied smoothing factor>
 * }
 * ```
 *
 * On empty input, `smoothed` is `[]`, `trend` is `"stable"`, and
 * `last_value` is `null`.
 *
 * # Errors
 *
 * Returns a `JsValue` error if `values_json` is not a valid JSON array of
 * numbers.
 */
export function compute_ewma(values_json: string, alpha: number): any;
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
export function alignment_fitness(log_handle: string, petri_net_handle: string, config_json: string): any;
/**
 * Create a new conformance cache.
 */
export function conformance_cache_new(): string;
/**
 * Look up a cached conformance result.
 *
 * Returns JSON `{ fitness, precision, generalization, trace_count }` on hit,
 * or `null` on miss.
 */
export function conformance_cache_get(handle: string, log_handle: string, model_hash: bigint): any;
/**
 * Insert a conformance result into the cache.
 */
export function conformance_cache_insert(handle: string, log_handle: string, model_hash: bigint, fitness: number, precision: number, generalization: number, trace_count: number): any;
/**
 * Get cache statistics: `{ hits, misses, entries }`.
 */
export function conformance_cache_stats(handle: string): any;
/**
 * Clear all cached entries.
 */
export function conformance_cache_clear(handle: string): any;
/**
 * Hash a DFG model for use as a cache key.
 */
export function conformance_cache_hash_model(dfg_json: string): any;
/**
 * Discover a DFG from events without case IDs using temporal correlation.
 *
 * # Arguments
 *
 * * `eventlog_handle` - Handle to an EventLog stored in the WASM state.
 * * `activity_key` - Attribute key for activity names (e.g. `CONCEPT_NAME_ATTR`).
 * * `timestamp_key` - Attribute key for timestamps (e.g. `TIMESTAMP_ATTR`).
 * * `threshold` - Correlation threshold in seconds (default: 86400).
 *
 * # Returns
 *
 * A `CorrelationResult` serialised as a JS object containing edges,
 * start/end activities, and estimated trace count.
 */
export function discover_correlation(eventlog_handle: string, activity_key: string, timestamp_key: string, threshold: number): any;
/**
 * Discover a process model using a Genetic Algorithm.
 *
 * Evolves a population of edge sets (DFG edge subsets) over multiple generations,
 * selecting for high fitness (coverage of log traces). Uses a fixed random seed (42)
 * for deterministic output.
 *
 * # Parameters
 * * `eventlog_handle` — Handle from `load_eventlog_from_xes` / `load_eventlog_from_json`.
 * * `activity_key` — XES attribute for activity names (e.g. `"concept:name"`).
 * * `population_size` — Number of candidate models per generation (e.g. `50`–`200`).
 * * `generations` — Number of evolution cycles (e.g. `50`–`200`; more = higher quality but slower).
 *
 * # Returns
 * `Result<JsValue, JsValue>` — On success:
 * ```json
 * { "handle": "...", "algorithm": "genetic_algorithm", "nodes": 8, "edges": 12, "final_fitness": 0.87 }
 * ```
 * Returns `Err("no_edges")` if the log has no directly-follows edges (e.g. all single-activity traces).
 *
 * # Note
 * Deterministic: seed 42 is hardcoded. Same log + same parameters → same output.
 * For high-quality models, use `population_size=100, generations=100`.
 * For faster results at lower quality, reduce both to `50`.
 */
export function discover_genetic_algorithm(eventlog_handle: string, activity_key: string, population_size: number, generations: number): any;
/**
 * Discover a process model using Particle Swarm Optimization (PSO).
 *
 * Uses swarm intelligence to explore DFG edge subsets. Underlying function returns
 * `Option<(DFG, f64)>` — returns `Err("no_edges")` to JS when:
 * - `swarm_size < 1`
 * - `iterations == 0`
 * - log has no directly-follows edges (e.g. all single-activity traces)
 *
 * On success returns `{handle, algorithm, nodes, edges, final_fitness}`.
 */
export function discover_pso_algorithm(eventlog_handle: string, activity_key: string, swarm_size: number, iterations: number): any;
/**
 * Discover a process model using Ant Colony Optimization (ACO).
 *
 * Uses pheromone trails and frequency heuristics to construct DFG edge sets.
 * Underlying function returns `Option<(DFG, f64)>` — returns `Err("no_edges")` to JS when:
 * - `ant_count < 1`
 * - `iterations == 0`
 * - log has no directly-follows edges (e.g. all single-activity traces)
 *
 * On success returns `{handle, algorithm, nodes, edges, final_fitness}`.
 * Pheromone is bounded (MMAS-style) to prevent NaN from unbounded deposit accumulation.
 */
export function discover_aco_algorithm(eventlog_handle: string, activity_key: string, ant_count: number, iterations: number): any;
export function genetic_discovery_info(): string;
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
 * Check whether parallel execution is available.
 *
 * Returns `true` on native targets and `false` on WASM (single-threaded).
 */
export function parallel_available(): boolean;
export function petri_net_playout(petri_net_handle: string, config_json: string): any;
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
 * Score a trace for anomaly against a reference DFG model.
 *
 * Returns `{ score, is_anomalous, threshold, raw_cost, missing_edge_ratio,
 * edge_coverage, steps, scale }`. `score = 1 - exp(-raw_cost / scale)`
 * where `raw_cost` is the mean per-step Shannon self-information
 * `-log2(p)` in bits, and absent edges are charged a fixed 10-bit
 * penalty. `missing_edge_ratio` is the additive data-drift signal:
 * callers should monitor it independently of `score`.
 */
export function score_anomaly(model_handle: string, trace_json: string): any;
/**
 * Compute boundary coverage for a prefix against an event log.
 *
 * Returns `{ coverage: number, matching_traces: number, normal_completions: number }`.
 * Coverage is the fraction of matching completions that are "normal" (within 2 sigma of median length).
 */
export function compute_boundary_coverage(log_handle: string, prefix_json: string, activity_key: string): any;
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
 * WASM export: train on the referenced event log and predict the outcome of
 * the given prefix. See [`predict_outcome_from_log`].
 */
export function predict_outcome_wasm(eventlog_handle: string, activity_key: string, prefix_json: string): any;
/**
 * Twin export of [`predict_outcome_wasm`] with honest evaluation: when
 * `evaluate` is true, the model is additionally trained on the first 80% of
 * traces and scored on held-out prefixes (top-1/2/3 accuracy + macro-F1),
 * reported under `"evaluation"`. With `evaluate: false` the output is
 * identical to [`predict_outcome_wasm`]. When the log is too small for
 * honest evaluation (`MIN_EVAL_SAMPLES`), `evaluation` is `null` and
 * `insufficient_data` is true.
 */
export function predict_outcome_evaluated_wasm(eventlog_handle: string, activity_key: string, prefix_json: string, evaluate: boolean): any;
/**
 * Discover a DFG using the streaming algorithm with WASM v128 node-increment
 * support (wasm32+simd128 builds only; all other builds use scalar kernels).
 *
 * Produces identical results to `discover_dfg`.
 *
 * # Arguments
 *
 * * `eventlog_handle` - Handle to a stored EventLog object
 * * `activity_key` - Attribute key for activity names (e.g., "concept:name")
 *
 * # Returns
 *
 * JSON `DFG` with nodes, edges, start_activities, end_activities.
 */
export function discover_dfg_simd(eventlog_handle: string, activity_key: string): any;
/**
 * Discover a DFG using SIMD streaming and store it in WASM state.
 *
 * Returns a handle string that can be used with other handle-based functions.
 */
export function discover_dfg_simd_handle(eventlog_handle: string, activity_key: string): any;
/**
 * Get info about the SIMD streaming DFG implementation.
 */
export function simd_streaming_dfg_info(): any;
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
 * Feed one event to the pipeline.
 */
export function pipeline_add_event(handle: string, case_id: string, activity: string): any;
/**
 * Close a trace in the pipeline.
 */
export function pipeline_close_trace(handle: string, case_id: string): any;
/**
 * Get pipeline statistics.
 */
export function pipeline_stats(handle: string): any;
/**
 * Get combined snapshot from all active algorithms.
 */
export function pipeline_snapshot(handle: string): any;
/**
 * Finalize all open traces and return final models.
 */
export function pipeline_finalize(handle: string): any;
/**
 * Measure trace determinism by running the same algorithm 3 times and comparing hashes.
 *
 * # Purpose
 * Automated determinism verification for CI. Proves that an algorithm is deterministic
 * (same input → same BLAKE3 hash across runs).
 *
 * # Example Output
 * ```json
 * {
 *   "algorithm": "dfg",
 *   "log_size": 1500,
 *   "run_count": 3,
 *   "hashes": ["abc123...", "abc123...", "abc123..."],
 *   "stable": true,
 *   "all_identical": true
 * }
 * ```
 */
export function measure_trace_determinism(handle: string, activity_key: string, algorithm: string): any;
/**
 * Measure algorithm quality baseline (fitness and precision metrics).
 *
 * # Purpose
 * Populate baseline fixture files for regression testing. Captures fitness/precision
 * for use in regression gates.
 *
 * # Example Output
 * ```json
 * {
 *   "algorithm": "genetic",
 *   "log_size": 2000,
 *   "fitness": 0.87,
 *   "precision": 0.92,
 *   "quality_score": 0.895,
 *   "model_size": { "places": 12, "transitions": 18 }
 * }
 * ```
 */
export function measure_algorithm_quality_baseline(handle: string, activity_key: string, algorithm: string): any;
/**
 * Benchmark algorithm performance: run N times and measure latency percentiles.
 *
 * # Purpose
 * Performance regression detection. Captures p50, p95, p99 latency across iterations.
 *
 * # Example Output
 * ```json
 * {
 *   "algorithm": "dfg",
 *   "iterations": 10,
 *   "log_size": 5000,
 *   "p50_ms": 1.2,
 *   "p95_ms": 2.1,
 *   "p99_ms": 3.8,
 *   "mean_ms": 1.5,
 *   "min_ms": 1.1,
 *   "max_ms": 4.2
 * }
 * ```
 */
export function benchmark_algorithm(handle: string, activity_key: string, algorithm: string, iterations: number): any;
/**
 * Validate output format matches algorithm schema.
 *
 * # Purpose
 * Schema conformance validation. Ensures output has required fields (e.g., DFG must have
 * nodes and edges).
 *
 * # Example Output
 * ```json
 * {
 *   "algorithm": "dfg",
 *   "valid": true,
 *   "missing_fields": [],
 *   "extra_fields": [],
 *   "schema_errors": []
 * }
 * ```
 */
export function validate_output_format(output_json: string, algorithm: string): any;
/**
 * Get algorithm metadata (inputs, outputs, time complexity, feature flags).
 *
 * # Purpose
 * Introspection for CLI help and algorithm selection. Returns algorithm characteristics.
 *
 * # Example Output
 * ```json
 * {
 *   "name": "dfg",
 *   "display_name": "Directly-Follows Graph",
 *   "category": "discovery",
 *   "time_complexity": "O(n log n)",
 *   "space_complexity": "O(m)",
 *   "speed_score": 5,
 *   "quality_score": 30,
 *   "supports_ocel": false,
 *   "supports_streaming": false,
 *   "required_inputs": ["log_handle", "activity_key"],
 *   "output_type": "dfg"
 * }
 * ```
 */
export function get_algorithm_metadata(algorithm: string): any;
/**
 * Discover a process model using the Heuristic Miner algorithm.
 *
 * More robust than Alpha++ for noisy, real-world logs. Filters low-frequency
 * directly-follows relations based on a dependency threshold.
 *
 * # Parameters
 * * `eventlog_handle` — Handle from `load_eventlog_from_xes` / `load_eventlog_from_json`.
 * * `activity_key` — XES attribute for activity names (e.g. `"concept:name"`).
 * * `dependency_threshold` — Minimum dependency score `[0.0, 1.0]` for an edge to be included.
 *   Use `0.2`–`0.4` for real-world logs; `0.8` filters out most edges.
 *   **Do not use `0.8` on small logs** — it will produce empty or near-empty models.
 *
 * # Returns
 * `Result<JsValue, JsValue>` — On success, a DFG JSON with `{nodes, edges}`.
 *
 * # Note
 * The function uses a dependency measure rather than raw frequency. An edge `A→B` is
 * kept if `(freq(A,B) - freq(B,A)) / (freq(A,B) + freq(B,A) + 1) >= dependency_threshold`.
 */
export function discover_heuristic_miner(eventlog_handle: string, activity_key: string, dependency_threshold: number): any;
/**
 * Discover infrequent behavior patterns (deviations from main process)
 */
export function analyze_infrequent_paths(eventlog_handle: string, activity_key: string, frequency_threshold: number): any;
/**
 * Detect rework patterns (activities that are repeated in same trace)
 */
export function detect_rework(eventlog_handle: string, activity_key: string): any;
/**
 * Detect bottlenecks - activities with high duration or long waiting times
 */
export function detect_bottlenecks(eventlog_handle: string, activity_key: string, timestamp_key: string, duration_threshold_seconds: bigint): any;
/**
 * Get process model complexity metrics
 */
export function compute_model_metrics(eventlog_handle: string, activity_key: string): any;
export function advanced_algorithms_info(): string;
export function align_etconformance_precision(log_handle: string, petri_net_handle: string, config_json: string): any;
/**
 * Get the complete capability registry of all wasm4pm functions
 */
export function get_capability_registry(): any;
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
 *      "violations": 8, "fitness": 0.92, "template_supported": true}
 *   ],
 *   "unsupported_templates": []
 * }
 * ```
 *
 * Honesty contract: the checker implements the 9 templates listed in
 * [`SUPPORTED_DECLARE_TEMPLATES`]. Any other template hits a fail-closed arm
 * (counted as violated, `fitness` degraded accordingly) AND is reported via
 * `"template_supported": false` on the constraint plus a deduped, sorted
 * `"unsupported_templates"` list at the top level — so callers can tell
 * "violated" apart from "this checker does not implement that template".
 */
export function check_declare_conformance(log_handle: string, declare_handle: string, activity_key: string): any;
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
export function reduce_petri_net(net_handle: string): any;
/**
 * Reduce a stored PetriNet in-place.
 *
 * Takes a PetriNet handle, applies all reduction rules, and returns
 * a JSON `ReductionResult` with before/after statistics.
 */
export function wasm_reduce_petri_net(net_handle: string): string;
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
 * Estimate queue delay using the M/M/1 queueing model.
 *
 * Returns JSON: `{ wait_time: number, utilization: number, is_stable: boolean }`
 */
export function estimate_queue_delay(arrival_rate: number, service_rate: number): any;
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
 * Select an intervention using the UCB1 multi-armed bandit algorithm.
 *
 * - `bandit_json` — JSON bandit state with `arms` and `total_pulls`
 * - `exploration_factor` — controls exploration vs exploitation (typically √2 ≈ 1.414)
 *
 * Returns JSON: `{ selected, arm_index, ucb_score, mean_reward, exploration_bonus }`
 */
export function select_intervention(bandit_json: string, exploration_factor: number): any;
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
 * Store a DFG from its JSON representation and return a handle.
 */
export function store_dfg_from_json(dfg_json: string): any;
/**
 * Store a Petri Net from its JSON representation and return a handle.
 */
export function store_petri_net_from_json(pn_json: string): any;
/**
 * Begin a new streaming conformance session against a reference Petri Net or Directly-Follows Graph.
 *
 * `model_handle` — handle to a stored PetriNet or DFG.
 *
 * Returns an opaque session handle string.
 */
export function streaming_conformance_begin(model_handle: string): any;
/**
 * Append one event to an in-progress trace.
 *
 * Returns a JSON string: `{"ok": true, "event_count": N, "open_traces": N}`.
 */
export function streaming_conformance_add_event(handle: string, case_id: string, activity: string): any;
/**
 * Close a trace: replay it against the reference DFG and return the result.
 *
 * Returns a JSON string with fields: `ok`, `case_id`, `is_conforming`,
 * `fitness`, `deviations`.
 */
export function streaming_conformance_close_trace(handle: string, case_id: string): any;
/**
 * Memory and progress statistics for an open streaming conformance session.
 *
 * Returns a JSON string with `event_count`, `closed_traces`, `open_traces`,
 * `conforming_traces`, `deviating_traces`, `avg_fitness`.
 */
export function streaming_conformance_stats(handle: string): any;
/**
 * Finalize the streaming conformance session.
 *
 * Flushes any still-open traces, returns a JSON summary string, and frees the
 * session handle.
 */
export function streaming_conformance_finalize(handle: string): any;
/**
 * Check prefix conformance for a given sequence of activities against a model.
 *
 * `model_handle` - handle to a stored PetriNet or DFG.
 * `prefix_json` - a JSON array of activity names.
 *
 * Returns a JSON string conforming to PrefixConformancePayload.
 */
export function check_prefix_conformance(model_handle: string, prefix_json: string): any;
/**
 * Compute ETConformance precision for a stored EventLog and PetriNet.
 *
 * Takes two handles (event log and Petri net), plus an activity key, and
 * returns a JSON `PrecisionResult`.
 */
export function wasm_compute_precision(eventlog_handle: string, petri_net_handle: string, activity_key: string): string;
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
 * WASM export: train a remaining-time model with honest holdout evaluation.
 * Same handle semantics as [`build_remaining_time_model`], but the stored
 * model JSON additionally carries a `holdout` field (absent when the log is
 * too small for honest evaluation).
 */
export function build_remaining_time_model_with_eval(log_handle: string, activity_key: string, timestamp_key: string): any;
/**
 * Build a remaining-time prediction model from a completed event log.
 */
export function build_remaining_time_model(log_handle: string, activity_key: string, timestamp_key: string): any;
/**
 * Predict remaining time for a running case given its activity prefix.
 */
export function predict_case_duration(model_handle: string, prefix_json: string): any;
/**
 * Estimate the hazard rate at a given elapsed time using the Weibull survival
 * model fitted to historical case durations.
 */
export function predict_hazard_rate(model_handle: string, elapsed_ms: number): any;
/**
 * Load an EventLog from JSON string
 */
export function load_eventlog_from_json(content: string): string;
/**
 * Load an OCEL from JSON string
 */
export function load_ocel_from_json(content: string): string;
/**
 * Export EventLog to JSON string
 */
export function export_eventlog_to_json(handle: string): string;
/**
 * Export OCEL to JSON string
 */
export function export_ocel_to_json(handle: string): string;
/**
 * Load an OCEL from XML string using roxmltree parser
 * Supports OCEL-XML structure with events, objects, and typed attributes
 */
export function load_ocel_from_xml(content: string): string;
/**
 * Get the number of events in an OCEL
 */
export function get_ocel_event_count(ocel_handle: string): number;
/**
 * Get the number of objects in an OCEL
 */
export function get_ocel_object_count(ocel_handle: string): number;
/**
 * Get information about supported formats
 */
export function get_io_info(): string;
/**
 * JS-accessible function to delete a stored object by handle.
 */
export function delete_object(id: string): boolean;
/**
 * JS-accessible function to check if a stored object exists by handle.
 */
export function object_exists(id: string): boolean;
/**
 * JS-accessible function to get the current number of stored objects.
 */
export function object_count(): number;
/**
 * JS-accessible function to clear all stored objects.
 */
export function clear_all_objects(): void;
/**
 * Compute causal footprints: for each activity pair (from, to), measure
 * the strength of the causal relationship based on temporal precedence
 * and conditional probability.
 *
 * ```javascript
 * const result = JSON.parse(pm.causal_footprint(handle, 'concept:name'));
 * // { pairs: [{from: "A", to: "B", always_precedes: true, conditional_prob: 0.95, strength: 0.9}] }
 * ```
 *
 * Thin JsValue-boundary wrapper: fetches traces from host state, delegates
 * the actual computation to `causal_footprint_pure`, and serializes the
 * plain-Rust result to JSON for the JS side.
 */
export function causal_footprint(log_handle: string, activity_key: string): any;
/**
 * Granger-like causality test: does activity X help predict activity Y
 * beyond what Y's own history provides?
 *
 * For each pair (x, y), measures whether observing X in the recent past
 * improves prediction of Y beyond the baseline rate of Y.
 *
 * ```javascript
 * const result = JSON.parse(pm.granger_like_test(handle, 'concept:name', 'time:timestamp', 3));
 * // { pairs: [{x: "A", y: "B", score: 0.8, baseline: 0.5, conditioned: 0.9}] }
 * ```
 */
export function granger_like_test(log_handle: string, activity_key: string, _timestamp_key: string, max_lag: number): any;
/**
 * Parse a pm4py `.dfg` text string, store the DFG in state, and return a
 * handle JSON object:
 * `{ handle, activity_count, edge_count, start_count, end_count }`
 *
 * # Errors
 * Returns a `JsValue` error on malformed input or state failures.
 */
export function load_dfg_from_text(content: string): any;
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
export function discover_ml_anomaly(log_handle: string, activity_key: string): any;
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
 * Filter traces that start with one of the specified activities.
 *
 * ```javascript
 * const h2 = pm.filter_by_start_activity(h, JSON.stringify(['Register']));
 * ```
 */
export function filter_by_start_activity(log_handle: string, activities_json: string, activity_key: string): any;
/**
 * Filter traces that end with one of the specified activities.
 */
export function filter_by_end_activity(log_handle: string, activities_json: string, activity_key: string): any;
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
 * Filter traces containing an event with specified attribute value.
 */
export function filter_by_event_attribute_value(log_handle: string, attribute_key: string, attribute_value: string): any;
/**
 * Filter traces by case ID list.
 */
export function filter_by_case_ids(log_handle: string, case_ids_json: string, case_id_key: string): any;
/**
 * Filter traces starting with specified activity sequence.
 */
export function filter_traces_starting_with_sequence(log_handle: string, sequence_json: string, activity_key: string): any;
/**
 * Filter traces ending with specified activity sequence.
 */
export function filter_traces_ending_with_sequence(log_handle: string, sequence_json: string, activity_key: string): any;
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
 * Filter traces containing all specified activities.
 */
export function filter_traces_containing_activities(log_handle: string, activities_json: string, activity_key: string): any;
/**
 * Filter traces excluding any of the specified activities.
 */
export function filter_traces_excluding_activities(log_handle: string, activities_json: string, activity_key: string): any;
/**
 * Filter traces by timestamp range.
 * Timestamps are ISO 8601 strings (e.g., "2023-01-01T00:00:00Z").
 */
export function filter_by_time_range(log_handle: string, min_dt: string, max_dt: string, timestamp_key: string): any;
/**
 * Filter traces by case duration in milliseconds.
 */
export function filter_by_case_performance(log_handle: string, min_ms: bigint, max_ms: bigint, timestamp_key: string): any;
/**
 * Filter traces containing rework (repeated activities).
 */
export function filter_rework_traces(log_handle: string, activity_key: string): any;
/**
 * Filter traces by trace attribute value.
 */
export function filter_by_trace_attribute(log_handle: string, attribute_key: string, attribute_value: string): any;
/**
 * Load an OCEL 2.0 from JSON string
 * Parses JSON into OCEL struct, stores in AppState, returns handle
 */
export function load_ocel2_from_json(content: string): string;
/**
 * Export OCEL 2.0 to JSON string (pretty-printed)
 * Retrieves OCEL from state by handle, serializes to JSON string
 */
export function export_ocel2_to_json(handle: string): string;
/**
 * Validate OCEL 2.0 structure
 * Checks:
 * - All events reference existing objects (referential integrity)
 * - All timestamps are valid ISO 8601
 * - Object relations: source_id and target_id reference existing objects (if present)
 * Returns a validation report as JSON: { valid: bool, errors: Vec<String> }
 */
export function validate_ocel(handle: string): any;
export function query_provenance_traversal(ocel_handle: string, query_json: string): string;
/**
 * Load an OCEL 2.0 from NDJSON string
 */
export function load_ocel2_from_ndjson(ndjson: string): string;
/**
 * Parse and normalize an OCEL-v2 log. Validates JSON structure (events,
 * objects, types, qualified refs) and returns the canonical re-serialized
 * form. Errors (as a `JsValue` string) if the JSON is not a valid OCEL-v2 log.
 */
export function load_ocel_v2(json: string): any;
/**
 * Validate an OCEL-v2 log against the OCEDO/OCPQ invariants and optional
 * object-type cardinality.
 *
 * `cardinality_json` is a JSON object keyed by object-type name, each value a
 * `{ created_by?, terminated_by?, schema?, min_count?, max_count? }` record
 * (the route `object_types` shape). Pass `""` or `"{}"` for no cardinality.
 *
 * Returns a `ValidationReport` `{ valid: bool, errors: [{code, message}] }`.
 */
export function validate_ocel_v2(json: string, cardinality_json: string): any;
/**
 * Flatten (project) an OCEL-v2 log onto a single object type, producing one
 * deterministic case per object of that type. Returns a `FlatLog`
 * `{ object_type, cases: [{ case_id, trace, event_ids }] }`.
 * Errors if `object_type` is not declared in the log.
 */
export function flatten_ocel_v2(json: string, object_type: string): any;
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
 * Parse a PNML XML string and store the resulting PetriNet in the handle-based
 * state system.  Returns a handle string on success.
 */
export function from_pnml_wasm(pnml_string: string): any;
/**
 * Serialize a stored PetriNet (identified by handle) to PNML XML.
 */
export function to_pnml_wasm(petri_net_handle: string): any;
export function wasm_verify_receipt_chain(receipts_dir: string): string;
export function discover_alpha_ppp_wasm(log_handle: string, activity_key: string, absolute_df_clean_thresh: number, causal_threshold: number): any;
export function discover_ocdfg_wasm(ocel_handle: string): any;
export function discover_ocla_wasm(ocel_handle: string): any;
export function discover_oc_declare_wasm(ocel_handle: string, noise_threshold: number): any;
/**
 * Perform dotted chart analysis on an EventLog
 */
export function analyze_dotted_chart(eventlog_handle: string): any;
/**
 * Get event statistics from an EventLog
 */
export function analyze_event_statistics(eventlog_handle: string): any;
/**
 * Get object statistics from an OCEL
 */
export function analyze_ocel_statistics(ocel_handle: string): any;
/**
 * Analyze case duration from an EventLog
 */
export function analyze_case_duration(eventlog_handle: string): any;
/**
 * Get list of available analysis functions
 */
export function available_analysis_functions(): string;
/**
 * Run ensemble discovery: discover DFG from log, compute self-fitness,
 * measure complexity metrics, and return a ranked quality assessment.
 *
 * This is a lightweight ensemble that evaluates the DFG model (which is
 * the universal representation all algorithms converge to) rather than
 * running N separate expensive algorithms.
 *
 * ```javascript
 * const result = JSON.parse(pm.dfg_threshold_sweep(handle, 'concept:name'));
 * // { models: [{algorithm: "dfg", fitness: 0.95, ...}], consensus: {...} }
 * ```
 */
export function dfg_threshold_sweep(log_handle: string, activity_key: string): any;
/**
 * Load an OCEL 2.0 from a flat CSV string.
 *
 * Parses the CSV, builds an OCEL in-memory, stores it in AppState, and returns
 * an opaque handle string for use with other `wasm4pm` OCEL functions.
 *
 * # Errors
 * Returns a JS error value with a JSON `{code, message}` payload on failure.
 */
export function load_ocel_from_csv(csv_string: string): string;
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
 * Validate that all StrictPartialOrder nodes have irreflexive, transitive order.
 */
export function validate_partial_orders(s: string): any;
/**
 * Convert a POWL model string to its canonical string representation.
 */
export function powl_to_string(s: string): string;
/**
 * Simplify a POWL model (XOR/LOOP merging, nested XOR flattening, SPO inlining).
 */
export function simplify_powl(s: string): any;
/**
 * Convert a POWL model to BPMN 2.0 XML.
 */
export function powl_to_bpmn(s: string): string;
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
 * Check soundness of a POWL model (van der Aalst criteria).
 *
 * Returns: `{ "sound": bool, "deadlock_free": bool, "bounded": bool, "liveness": bool }`
 */
export function check_powl_soundness(powl_str: string): string;
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
 * Measure complexity metrics for a POWL model.
 *
 * Returns: `{ "cyclomatic": u32, "cfc": f64, "cognitive": f64, "halstead": { ... } }`
 */
export function measure_complexity(s: string): string;
/**
 * Analyse frequency ranges of all FrequentTransition nodes in a POWL model.
 *
 * Internally runs `simplify_using_frequent_transitions` first, so XOR/LOOP patterns
 * that imply frequency semantics (e.g. `X(A, tau)` → skippable A) are recognised
 * even when the input model has not been explicitly simplified.
 *
 * Mirrors `TaggedPOWL.freq_range()` / `is_skippable()` / `is_repeatable()` / `is_unbounded()`
 * from `vendors/POWL/powl/objects/tagged_powl/base.py`.
 *
 * Returns JSON:
 * ```json
 * {
 *   "total_frequent_transitions": 3,
 *   "skippable_count": 1,
 *   "repeatable_count": 2,
 *   "unbounded_count": 1,
 *   "freq_min_min": 0,
 *   "freq_max_max": null,
 *   "nodes": [
 *     { "activity": "A", "min_freq": 0, "max_freq": 1,
 *       "is_skippable": true, "is_repeatable": false, "is_unbounded": false }
 *   ]
 * }
 * ```
 */
export function powl_freq_analysis(s: string): string;
/**
 * Diff two POWL models (structural + behavioral comparison).
 *
 * Returns: `{ "severity": "...", "always_changes": [...], "order_changes": [...], "structure_changes": [...] }`
 */
export function diff_models(model_a_str: string, model_b_str: string): string;
/**
 * Compute footprints (behavioral profiles) for a POWL model.
 *
 * Returns: `{ "start_activities": [...], "end_activities": [...], "parallel": [...], "sequence": [...] }`
 */
export function powl_footprints(s: string): string;
/**
 * Simplify a POWL model using FrequentTransition frequency bounds.
 */
export function simplify_frequent_transitions(s: string): any;
/**
 * Get the string representation of a specific node in the arena.
 */
export function node_to_string(s: string, arena_idx: number): string;
/**
 * Get the children arena indices of a node.
 */
export function get_children(s: string, arena_idx: number): any;
/**
 * Get detailed JSON info about a node.
 */
export function node_info_json(s: string, arena_idx: number): string;
/**
 * Convert a POWL model to a Petri Net (JSON).
 */
export function powl_to_petri_net(s: string): string;
/**
 * Convert a POWL model to a Process Tree (JSON).
 */
export function powl_to_process_tree(s: string): string;
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
export function wasm_mint_challenge_nonce(): string;
export function wasm_admit_change(candidate_json_str: string, ledger_path: string, policy_path: string, boundary_map_path: string, revocation_path: string): string;
export function wasm_admit_change_inline(candidate_json_str: string, ledger_contents: string, policy_contents: string, boundary_contents: string, revoked_contents: string): string;
/**
 * Discover a Directly-Follows Graph (DFG) from an event log.
 *
 * # Parameters
 * * `eventlog_handle` — Handle string returned by `load_eventlog_from_xes` or `load_eventlog_from_json`.
 * * `activity_key` — XES attribute name to use as activity label (e.g. `"concept:name"`).
 *
 * # Returns
 * `Result<JsValue, JsValue>` — On success, a JS value (parse with `JSON.parse` if it is a
 * string) containing:
 * ```json
 * {
 *   "nodes": [{"id": "...", "label": "...", "frequency": 42}],
 *   "edges": [{"from": "A", "to": "B", "frequency": 17}],
 *   "start_activities": {"A": 10},
 *   "end_activities":   {"C": 5}
 * }
 * ```
 *
 * # Note
 * DFG construction is always successful for any valid event log (empty or otherwise).
 * The function never returns `None` and never panics.
 * For a sound process tree, use `discover_inductive_miner` instead.
 */
export function discover_dfg(eventlog_handle: string, activity_key: string): any;
/**
 * Discover a Directly-Follows Graph (DFG) from an OCEL
 */
export function discover_ocel_dfg(ocel_handle: string): any;
/**
 * Discover a Directly-Follows Graph (DFG) per object type from an OCEL
 */
export function discover_ocel_dfg_per_type(ocel_handle: string): any;
/**
 * Discover DECLARE constraints from an EventLog
 */
export function discover_declare(eventlog_handle: string, activity_key: string): any;
/**
 * Get list of available discovery algorithms
 */
export function available_discovery_algorithms(): any;
/**
 * Get discovery module info
 */
export function discovery_info(): any;
/**
 * WASM export: analyse a stored Petri net handle for soundness (Def 3.5),
 * safeness, free-choice (Def 3.4), state-machine (Def 3.10) and marked-graph
 * (Def 3.11) structure. Returns the JSON summary as a `JsValue` string.
 */
export function check_wf_net_soundness(petri_net_handle: string): any;
/**
 * Get trace count from EventLog
 */
export function get_trace_count(eventlog_handle: string): number;
/**
 * Get total event count from EventLog
 */
export function get_event_count(eventlog_handle: string): number;
/**
 * Get unique activities from EventLog
 */
export function get_activities(eventlog_handle: string, activity_key: string): any;
/**
 * Get all traces from EventLog as a list of activity sequences
 */
export function get_traces(eventlog_handle: string, activity_key: string): any;
/**
 * Get activity frequencies
 */
export function get_activity_frequencies(eventlog_handle: string, activity_key: string): any;
/**
 * Get trace lengths (number of events per trace)
 */
export function get_trace_lengths(eventlog_handle: string): any;
/**
 * Get min and max trace lengths
 */
export function get_trace_length_statistics(eventlog_handle: string): any;
/**
 * Get all attribute names used in the log
 */
export function get_attribute_names(eventlog_handle: string): any;
/**
 * Filter EventLog by activity (keep only traces containing the activity)
 */
export function filter_log_by_activity(eventlog_handle: string, activity_key: string, activity_name: string): any;
/**
 * Filter EventLog by trace length range
 */
export function filter_log_by_trace_length(eventlog_handle: string, min_length: number, max_length: number): any;
/**
 * Calculate trace durations (difference between first and last event timestamps)
 */
export function calculate_trace_durations(eventlog_handle: string, timestamp_key: string): any;
/**
 * Validate that EventLog has timestamp attribute
 */
export function validate_has_timestamps(eventlog_handle: string, timestamp_key: string): boolean;
/**
 * Validate that EventLog has activity attribute
 */
export function validate_has_activities(eventlog_handle: string, activity_key: string): boolean;
/**
 * Create a new StreamingLog instance and return its handle.
 *
 * The handle is used to reference the instance in subsequent calls.
 * Call `free_streaming_log` to release the instance.
 */
export function create_streaming_log(): number;
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
 * Estimate the DFG from the StreamingLog and return it as a JSON string.
 *
 * Returns a `DFG` serialized as JSON.
 */
export function streaming_log_estimate_dfg(handle: number): any;
/**
 * Estimate the number of unique traces seen.
 */
export function streaming_log_estimate_cardinality(handle: number): number;
/**
 * Get the total event count.
 */
export function streaming_log_event_count(handle: number): number;
/**
 * Get the number of unique activities seen.
 */
export function streaming_log_activity_count(handle: number): number;
/**
 * Get the approximate memory usage in bytes.
 */
export function streaming_log_memory_bytes(handle: number): number;
/**
 * Free a StreamingLog instance and release its memory.
 */
export function free_streaming_log(handle: number): void;
export function discover_ml_cluster(eventlog_handle: string, activity_key: string): any;
export function discover_ml_regress(eventlog_handle: string, _activity_key: string): any;
export function discover_ml_regress_automl(eventlog_handle: string, k_folds: number): any;
export function discover_ml_forecast(eventlog_handle: string, _activity_key: string): any;
export function discover_ml_classify(eventlog_handle: string, activity_key: string): any;
export function discover_ml_pca(eventlog_handle: string, activity_key: string): any;
/**
 * Automated smoothing factor selection for Forecasting.
 *
 * Performs a 5-fold cross-validation sweep across alpha [0.05, 0.95].
 * For each fold, EWMA is fit on the training complement (windows outside
 * the test fold), then RMSE is computed on the held-out test fold using
 * the fitted smoothed level as the initial state.
 */
export function discover_automl_forecast(eventlog_handle: string, _activity_key: string): any;
/**
 * Automated hyperparameter tuning for k-NN Classification.
 *
 * Performs a 5-fold cross-validation sweep across K [1, 15].
 */
export function discover_automl_classify(eventlog_handle: string, activity_key: string): any;
export function powl_extensive_playout(powl_model_str: string, _root_id: string, config_json: string): any;
export function powl_to_yawl_string(powl_string: string): string;
/**
 * Generic result for operations
 */
export class OperationResult {
  private constructor();
  free(): void;
  is_success(): boolean;
  data(): string | undefined;
  message(): string;
}
/**
 * Multi-dimensional RL state with quantized dimensions
 */
export class RlState {
  private constructor();
  free(): void;
  health_level: number;
  event_rate_q: number;
  activity_count_q: number;
  spc_alert_level: number;
  drift_status: number;
  rework_ratio_q: number;
  circuit_state: number;
  cycle_phase: number;
}
/**
 * Wrapper for EventLog - stores handle in WASM state
 */
export class WasmEventLog {
  free(): void;
  /**
   * Get the number of cases in the log
   */
  case_count(): number;
  /**
   * Get the number of events in the log
   */
  event_count(): number;
  /**
   * Get attributes count
   */
  attribute_count(): number;
  /**
   * Get basic statistics as JSON
   */
  stats(): any;
  /**
   * Get the internal handle (for internal use only)
   */
  handle(): string;
  constructor(handle: string);
}
/**
 * Wrapper for OCEL
 */
export class WasmOCEL {
  free(): void;
  constructor(handle: string);
  /**
   * Get the number of events in the OCEL
   */
  event_count(): number;
  /**
   * Get the number of objects in the OCEL
   */
  object_count(): number;
  /**
   * Get basic statistics as JSON
   */
  stats(): any;
  /**
   * Get the internal handle (for internal use only)
   */
  handle(): string;
}
