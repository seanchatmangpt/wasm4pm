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
| `discover_alpha_plus_plus(handle, activity_key)` | `Result<JsValue, JsValue>` | Alpha++ Petri net |
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

## Serialization Notes

- All `Result<JsValue, JsValue>` returns use `serde_json::to_string()` + `JsValue::from_str()` — NOT `serde_wasm_bindgen` (known bug with `json!()` macro)
- Event log handles are opaque strings returned by `load_*` functions
- All timestamps in nanoseconds unless otherwise specified
