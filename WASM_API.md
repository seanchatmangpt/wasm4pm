# WASM API Reference

**All public Rust→JavaScript exports via `wasm-bindgen`. ~392 total exports across 100+ modules.**

## Module Index (Quick Reference)

| Module | Count | Purpose |
|--------|-------|---------|
| **Core Discovery** | 15 | DFG, Alpha++, Heuristic, Inductive, ACO, PSO, Genetic, A*, Hill Climbing, Simulated Annealing, ILP, DECLARE, streaming variants |
| **ML Algorithms** | 6+ | Classification, clustering, forecasting, anomaly detection, regression, PCA |
| **Streaming** | 20+ | Real-time DFG, SIMD acceleration, conformance, log estimation |
| **POWL** | 8+ | Partial-order workflow parsing, simplification, conversion, complexity analysis |
| **Analysis** | 20+ | Conformance, simulation, performance profiles, temporal analysis, social networks |
| **Prolog8** | 3 | Query evaluation, proof verification, capability reporting |
| **Autonomic** | 10+ | RL orchestrator, SPC, circuit breaker, self-healing |
| **AutoMembrane** | 25+ | Motion classification, actor/object/route/ML/time envelopes, benchmarking |
| **Utilities** | N/A | Event log I/O, caching, state management |

**See sections below for detailed function signatures per module.**

---

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

## Social Network (social_network.rs)

| Function | Returns | Description |
|----------|---------|-------------|
| `discover_handover_network(handle, resource_key)` | `Result<JsValue, JsValue>` | Handover-of-work social network; edges weighted by direct handoff count between resource pairs |
| `discover_working_together_network(handle, resource_key)` | `Result<JsValue, JsValue>` | Working-together social network; edges connect resources that handled the same case |

Both return `{ nodes: [{id, label}], edges: [{from, to, weight/co_occurrences}] }`. `resource_key` is typically `"org:resource"` (XES standard).

## Conformance

| Function | Returns | Description |
|----------|---------|-------------|
| `check_token_based_replay(handle, activity_key)` | `Result<JsValue, JsValue>` | Token-based replay fitness |
| `simd_token_replay(handle, activity_key)` | `String` (JSON) | SIMD-accelerated token replay |

## Streaming (streaming_*.rs — 20+ exports)

High-throughput event processing with optional SIMD acceleration (`feature-streaming-full`).

| Function | Returns | Description |
|----------|---------|-------------|
| `start_streaming_dfg(activity_key)` | `Result<String, JsValue>` | Initialize streaming DFG processor |
| `stream_event(handle, event_json)` | `Result<String, JsValue>` | Add event to stream; returns updated DFG state |
| `flush_streaming_dfg(handle)` | `Result<JsValue, JsValue>` | Finalize DFG and return result |
| `estimate_streaming_log_size(num_events, avg_attributes)` | `usize` | Estimate memory footprint |
| `simd_streaming_dfg(handle, batch_json)` | `Result<JsValue, JsValue>` | Batch SIMD DFG acceleration (requires `feature-streaming-full`) |
| `streaming_conformance_check(handle, model_handle)` | `Result<JsValue, JsValue>` | Streaming token-based conformance |
| `streaming_log_window_stats(handle, window_size)` | `Result<JsValue, JsValue>` | Sliding-window statistics |

**Use cases:** Real-time process monitoring, high-volume log ingestion, incremental discovery.

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

## ML Algorithms (feature: ml — 6 exports)

Micro-ML anomaly detection, classification, clustering, regression, forecasting, and dimensionality reduction.

| Function | Returns | Description |
|----------|---------|-------------|
| `ml_classify_traces(handle, activity_key, num_features)` | `Result<JsValue, JsValue>` | Decision tree / Naive Bayes classification |
| `ml_cluster_traces(handle, activity_key, num_clusters)` | `Result<JsValue, JsValue>` | K-means clustering with silhouette scoring |
| `ml_forecast_throughput(handle, activity_key, forecast_steps)` | `Result<JsValue, JsValue>` | Exponential/linear regression forecasting |
| `ml_detect_anomalies(handle, activity_key, sensitivity)` | `Result<JsValue, JsValue>` | EMA-based anomaly scoring (0=normal, 1=anomaly) |
| `ml_regress_remaining_time(handle, activity_key)` | `Result<JsValue, JsValue>` | Linear regression on case duration |
| `ml_pca_reduce(handle, activity_key, num_components)` | `Result<JsValue, JsValue>` | Principal component analysis (variance-explained) |

**Note:** All ML algorithms return empty arrays gracefully if input is empty. No rejection.

## Prediction

| Function | Returns | Description |
|----------|---------|-------------|
| `build_ngram_predictor(handle, activity_key, order)` | `Result<String, JsValue>` | Build n-gram model |
| `predict_next_activity(model_handle, trace_json, top_k)` | `Result<JsValue, JsValue>` | Next activity prediction |
| `score_trace_likelihood(model_handle, trace_json)` | `Result<JsValue, JsValue>` | Trace likelihood scoring |

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

## POWL — Partial-Order Workflows (feature: powl — browser profile only; 8+ exports)

Represents processes with partial-order constraints (concurrency-aware models).

| Function | Returns | Description |
|----------|---------|-------------|
| `parse_powl_model(powl_json)` | `Result<JsValue, JsValue>` | Parse POWL specification into internal model |
| `powl_to_process_tree(powl_handle)` | `Result<JsValue, JsValue>` | Convert to process tree for visualization |
| `simplify_powl_model(powl_handle, threshold)` | `Result<JsValue, JsValue>` | Simplify by merging low-frequency branches |
| `compute_powl_complexity(powl_handle)` | `Result<f64, JsValue>` | Compute model complexity score (0-1) |
| `discover_powl_from_log(handle, activity_key)` | `Result<JsValue, JsValue>` | Mine POWL model directly from event log |
| `check_powl_conformance(powl_handle, log_handle, activity_key)` | `Result<JsValue, JsValue>` | Conformance checking against POWL model |
| `export_powl_to_json(powl_handle)` | `Result<String, JsValue>` | Export POWL to JSON format |
| `powl_footprints(powl_handle)` | `Result<JsValue, JsValue>` | Extract causal footprints |

**Availability:** Gated on `feature-powl`. Only included in `browser` profile (2.7MB). Use `get_capabilities()` to verify at runtime.

## Agentic Pipeline (feature: cloud — fog/browser profiles only)

Four functions for multi-agent task decomposition and evaluation. All gated on `#[cfg(feature = "cloud")]`.

| Function | Returns | Description |
|----------|---------|-------------|
| `run_agentic_pipeline(task_json)` | `Result<String, JsValue>` | Execute a multi-agent task pipeline; returns per-agent outcomes |
| `validate_agentic_handoff(request_json)` | `Result<String, JsValue>` | Validate an agent handoff request against role and capability contracts |
| `evaluate_agentic_counterfactuals(task_json)` | `Result<String, JsValue>` | Evaluate counterfactual task variants for robustness analysis |
| `run_agentic_jtbd_suite(cases_json)` | `Result<String, JsValue>` | Run a Jobs-to-be-Done test suite across multiple agentic task cases |

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
| `get_spc_history()` | `Result<String, JsValue>` | Export SPC ring-buffer history as JSON (cloud feature) |
| `set_spc_history(json)` | `Result<String, JsValue>` | Restore SPC ring-buffer history from JSON (cloud feature) |

## RL State

| Function | Returns | Description |
|----------|---------|-------------|
| `create_rl_state(health, event_rate, activity_count, spc, drift, rework, circuit, cycle)` | `RlState` | Create state manually |
| `rl_state_from_features(features, health, rework)` | `RlState` | Create from feature vector |
| `rl_state_health_level(state)` | `u8` | Get health level (0-4) |

## Circuit Breaker

| Function | Returns | Description |
|----------|---------|-------------|
| `circuit_breaker_get_state()` | `Result<String, JsValue>` | Export circuit breaker state as JSON (cloud feature) |
| `circuit_breaker_set_state(json)` | `Result<String, JsValue>` | Restore circuit breaker state from JSON (cloud feature) |
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

## Prolog8 — Byte-Capped Proof Engine

**Package:** `crates/prolog8/` | **Build:** `cd crates/prolog8 && wasm-pack build --target nodejs --out-dir pkg`

**Engine limits:** arity ≤ 8, body atoms ≤ 8, variables ≤ 8, binding patterns ≤ 256, answers ≤ 128

### Functions

| Function | Returns | Description |
|----------|---------|-------------|
| `prolog8_show()` | `Result<JsValue, JsValue>` | Capability report — engine name, version, byte caps |
| `prolog8_query(input_json)` | `Result<JsValue, JsValue>` | Evaluate a query — returns Allow/Deny/Invalid + BLAKE3 proof |
| `prolog8_replay(input_json)` | `Result<JsValue, JsValue>` | Verify a receipt — detects tampering in proof chain |

### `prolog8_show` Output

```json
{ "engine": "prolog8", "version": "0.1.0",
  "caps": { "arity": 8, "body": 8, "vars": 8, "binding_patterns": 256, "max_answers": 128 } }
```

### `prolog8_query` Input Schema

```json
{
  "catalog": {
    "catalog_id": 1,
    "predicates": {
      "1": { "pred_id": 1, "label": "parent", "arity": 2,
             "proof_policy": "OnRequest", "materialized": false, "access_orders": [] }
    },
    "term_labels": { "1": "alice", "2": "bob" },
    "predicate_by_label": { "parent": 1 },
    "term_by_label": { "alice": 1, "bob": 2 }
  },
  "facts": [
    { "pred_id": 1, "arity": 2,
      "rows": [ { "pred_id": 1, "arity": 2, "args": [1, 2], "source_id": 0 } ] }
  ],
  "rules": [],
  "query": {
    "atom":         { "pred_id": 1, "arity": 2, "args": [1, 2] },
    "binding_mask": 3,
    "output_mask":  0,
    "proof_mode":   "PositiveOnly",
    "epoch":        0
  }
}
```

**Key fields:**
- `binding_mask` is a **top-level field on the `query` object** (not nested inside `atom`). Bit i set means position i is bound for matching. Defaults to 0 (all unbound = scan all).
- `args` are 1-based TermId values (TermId 0 is sentinel/unbound).
- `proof_mode`: `"PositiveOnly"` (default), `"NegativeOnly"`, `"Both"`, `"Hashed"`. Use `"Both"` to get proof nodes in Deny answers.
- `facts[*]` only requires `pred_id`, `arity`, `rows` — metadata (block_hash, arg_order) is computed automatically.

### `prolog8_query` Output Variants

| Variant | Meaning |
|---------|---------|
| `{ "Answered": [...] }` | One or more Allow decisions with BLAKE3 receipts |
| `{ "TruncatedAnswers": [...] }` | More than 128 answers matched — narrow binding_mask or use epoch pagination |
| `{ "Denied": { ... } }` | Query denied (negative proof) |
| `{ "Invalid": "reason string" }` | Admission rejected — human-readable reason included |

### `prolog8_replay` Input Schema

Same as `prolog8_query` plus a `receipt` field from a prior query response.

### `prolog8_replay` Output Variants

| Output | Meaning |
|--------|---------|
| `"Verified"` | Receipt intact, proof replays correctly |
| `"ReceiptInvalid"` | receipt_hash tampering detected |
| `"Mismatch"` | proof/catalog/rule/fact root tampering |
| `"VersionIncompatible"` | Engine version mismatch |
| `"MissingArtifact"` | Required fact or rule not present |

### Node.js Usage

```javascript
const wasm = require('./crates/prolog8/pkg/prolog8.js');
const parse = r => typeof r === 'string' ? JSON.parse(r) : r;

// Show capabilities
const caps = parse(wasm.prolog8_show());
console.log(caps.caps.arity);  // 8

// Query
const input = JSON.stringify({
  catalog: { catalog_id: 1, predicates: { "1": { pred_id: 1, label: "parent", arity: 2,
             proof_policy: "OnRequest", materialized: false, access_orders: [] }},
             term_labels: { "1": "alice", "2": "bob" },
             predicate_by_label: { parent: 1 }, term_by_label: { alice: 1, bob: 2 }},
  facts: [{ pred_id: 1, arity: 2, rows: [{ pred_id: 1, arity: 2, args: [1, 2], source_id: 0 }] }],
  rules: [],
  query: { atom: { pred_id: 1, arity: 2, args: [1, 2] }, binding_mask: 3, proof_mode: "PositiveOnly", epoch: 0 }
});
const result = parse(wasm.prolog8_query(input));
// result: { Answered: [{ bindings: [...], proof: [...], receipt: { receipt_hash: "...", ... } }] }
```

### CLI Integration

```bash
wpm prolog8 show                       # Report capabilities
wpm prolog8 query  -i <input.json>    # Evaluate a query (Allow / Deny / Invalid)
wpm prolog8 replay -i <input.json>    # Verify a receipt (detect tampering)
```

### Test Coverage

| Suite | Count | Status |
|-------|-------|--------|
| Unit (inline) | 31 | Passing |
| AAT counterfactual (P8-CF-1 to P8-CF-8) | 36 | Passing |
| Integration | 11 | Passing |
| **Total** | **78** | **All passing** |

## Serialization Notes

- All `Result<JsValue, JsValue>` returns use `serde_json::to_string()` + `JsValue::from_str()` — NOT `serde_wasm_bindgen` (known bug with `json!()` macro)
- Event log handles are opaque strings returned by `load_*` functions
- All timestamps in nanoseconds unless otherwise specified
