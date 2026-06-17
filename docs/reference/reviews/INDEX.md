# Algorithm Reviews Index

This index provides a structured directory of correctness audits, scale limitations, performance optimization recommendations, and code references for the 60 algorithms implemented within the `wasm4pm` monorepo.

Each link below points to a detailed review document that examines input/output contracts, boundary checks, edge cases, error handling, and concrete implementation details across both Rust and TypeScript boundaries.

## Algorithm Directory

| Algorithm ID | Category / Domain | Key Recommendation / Finding |
| :--- | :--- | :--- |
| [`dfg`](dfg.md) | Process Discovery | `discover_dfg_from_log` calls `log.value.to_columnar_owned(activity_key)` which allocates a fresh columnar copy. |
| [`process_skeleton`](process_skeleton.md) | Process Discovery | The filtering logic compiles a set of nodes having active edges. |
| [`alpha_plus_plus`](alpha_plus_plus.md) | Process Discovery (Petri Net mining) | Transition candidate sets from `Vec<String>` to bitsets (`u128` or a dynamic bitset crate) to make similarity, causal precede, and containment checks extremely fast. |
| [`heuristic_miner`](heuristic_miner.md) | Process Discovery | `discover_heuristic_miner_from_log` calls `log.to_columnar_owned(activity_key)` which copies the columnar structure. |
| [`inductive_miner`](inductive_miner.md) | Process Discovery (Process Tree mining) | The cut detection functions (`find_xor_cut`, `find_sequence_cut`, etc.) iterate through all split index positions `1..activities.len()`. |
| [`genetic_algorithm`](genetic_algorithm.md) | Process Discovery (Metaheuristic DFG optimization) | Crossover and mutation operations allocate new `EdgeSet` (HashSets) inside the hot loop. |
| [`pso`](pso.md) | Process Discovery (Metaheuristic DFG optimization) | `blend_edges_seeded` creates fresh `HashSet` instances on every iteration. |
| [`a_star`](a_star.md) | Process Discovery (Informed search for DFG edges) | Every edge candidate generation clones the entire DFG: `new_dfg = current_dfg.clone()`. |
| [`hill_climbing`](hill_climbing.md) | Process Discovery (Greedy local DFG optimization) | Although set allocations are eliminated, the algorithm still calls `evaluate_edges_fitness` (which iterates over the entire log) for every edge deletion trial. |
| [`aco`](aco.md) | Process Discovery (Metaheuristic DFG optimization) | The probability equation: `prob = tau.powf(alpha) * eta.powf(beta)` relies on slow float `powf`. |
| [`simulated_annealing`](simulated_annealing.md) | Process Discovery (Metaheuristic DFG optimization) | Like other metaheuristics, simulated annealing calls `evaluate_edges_fitness` on every iteration. |
| [`declare`](declare.md) | Process Discovery (Declarative constraints discovery) | Refactor `first_positions` and `last_positions` vectors to store `u32` or `usize` and remove the `position < 256` clamp, supporting arbitrarily long trace sequences. |
| [`optimized_dfg`](optimized_dfg.md) | Process Discovery | Identical to `dfg`. |
| [`ilp`](ilp.md) | Process Discovery (Petri Net mining) | Stage 3 loops over all candidate places, and for each candidate, it replays all traces and events. |
| [`simd_streaming_dfg`](simd_streaming_dfg.md) | Process Discovery (Streaming DFG construction) | `simd_available` is determined at compile-time (`true` for `wasm32`, `false` for others). |
| [`hierarchical_dfg`](hierarchical_dfg.md) | Process Discovery | The partition scheme distributes traces round-robin. |
| [`streaming_log`](streaming_log.md) | Process Discovery | The name `streaming_log` suggests a streaming DFG calculation, but this path delegates to a standard batch `discover_dfg` run. |
| [`smart_engine`](smart_engine.md) | Process Discovery (Caching / Fused execution) | Replace the linear scan `.find()` in `heuristic_miner` with a pre-built `FxHashMap<(String, String), f64>` of edge frequencies. |
| [`ml_classify`](ml_classify.md) | Machine Learning (Classification) | The threshold bounds (`SHORT_THRESHOLD=10.0`, `MEDIUM_THRESHOLD=30.0`) are hardcoded constants. |
| [`ml_cluster`](ml_cluster.md) | Machine Learning (Clustering) | The silhouette score is computed after clustering convergence. |
| [`ml_forecast`](ml_forecast.md) | Machine Learning / Forecasting (Exponential Smoothing for Event Logs) | The smoothing parameter `alpha` is hardcoded to `DEFAULT_ALPHA = 0.3` (line 9). |
| [`ml_anomaly`](ml_anomaly.md) | Machine Learning / Anomaly Detection (Directly-Follows Trace Anomaly Scoring) | In `score_trace_anomaly`, it performs linear scans over `dfg.edges` for every trace event transition (lines 57-68). |
| [`ml_regress`](ml_regress.md) | Machine Learning / Regression (Ordinary Least Squares Linear Regression) | The OLS accumulators in `regression_internal` use manual loop unrolling via `chunks_exact(8)` (lines 46-83). |
| [`ml_pca`](ml_pca.md) | Machine Learning / Dimensionality Reduction (Principal Component Analysis on Event Logs) | Closed-form eigenvalue decomposition for 2x2 matrices is $O(1)$ and avoids iterative solvers, which is highly optimal. |
| [`transition_system`](transition_system.md) | Process Mining / Discovery (Transition System State Machine Generation) | In `discover_transition_system`, states are represented as string joins: `let state_name = state_activities.join(", ");` (line 131). |
| [`log_to_trie`](log_to_trie.md) | Process Mining / Transformation (Prefix Tree / Trie Construction) | The custom open-addressing table was implemented to optimize allocations, but it has a severe correctness bug under high variance. |
| [`causal_graph`](causal_graph.md) | Process Mining / Discovery (Causal Graph Discovery via Alpha Miner and Heuristic Miner Variants) | In both `build_causal_alpha` and `build_causal_heuristic`, the frequency map is defined as `FxHashMap<(String, String), usize>` (lines 98, 157). |
| [`performance_spectrum`](performance_spectrum.md) | Process Mining / Discovery (Performance Spectrum / Activity Transition Duration Analysis) | The timestamp matcher should be updated to support both `AttributeValue::Date` and `AttributeValue::String` to match the project's standard timestamp parsing behavior. |
| [`batches`](batches.md) | Process Mining / Discovery (Batch Processing Pattern Detection) | The timestamp parser should support both `AttributeValue::Date` and `AttributeValue::String` to match the project's standard parsing patterns. |
| [`correlation_miner`](correlation_miner.md) | Process Mining / Discovery (Correlation Miner for Event Logs without Case IDs) | The timestamp parser should support both `AttributeValue::Date` and `AttributeValue::String` to match other algorithms. |
| [`generalization`](generalization.md) | Process Mining / Evaluation (Generalization Quality Metric for Petri Nets) | In `replay_trace` (lines 176-227), for every event in the trace. |
| [`etconformance_precision`](etconformance_precision.md) | Process Mining / Evaluation (ETConformance Escaping-Edges Precision Metric) | This implementation does **not** build any lookup indexes. |
| [`alignments`](alignments.md) | Process Mining / Conformance (A* Search Optimal Alignment Conformance Checking) | Formatting the marking vector as a string (`format!("{:?}", marking_vec)`) on every single iteration is slow and causes excessive allocations. |
| [`complexity_metrics`](complexity_metrics.md) | Process Mining / Analysis (POWL Process Model Complexity Metrics) | The metrics collector uses recursive traversal (`visit` function, lines 59-177). |
| [`pnml_import`](pnml_import.md) | Process Mining / Input-Output (PNML XML to PetriNet Parsing) | The state machine in Pass 1 is represented as a nested enum `ParseState` (lines 36-74). |
| [`bpmn_import`](bpmn_import.md) | Process Mining / Input-Output (BPMN 2.0 XML to POWL Conversion) | Inclusive Gateways are simplified to XOR operators (lines 423-434). |
| [`powl_to_process_tree`](powl_to_process_tree.md) | Process Mining / Conversion (POWL to Process Tree Conversion) | Since process trees are strictly acyclic, they cannot represent arbitrary cycles (except via structured `Loop` operators). |
| [`yawl_export`](yawl_export.md) | Process Mining / Input-Output (POWL to YAWL v6 XML Export) | Replace the single-pass $O(N^2)$ loop with a standard Kahn's or DFS-based leveling algorithm to ensure that levels are computed correctly regardless of the order of nodes in the `children` array. |
| [`playout`](playout.md) | Process Mining / Simulation (Process Tree and DFG Playout/Simulation) | Update `PtOperator::Loop` playout to execute `children[1]` (REDO) before each repeated execution of `children[0]` (DO). |
| [`monte_carlo_simulation`](monte_carlo_simulation.md) | Process Mining / Simulation (Monte Carlo Discrete Event Process Performance Simulation) | Rewrite the simulation engine to use a priority queue of events (StartCase, StartActivity, EndActivity) to support concurrent case execution and capture resource contention delays. |
| [`handover_network`](handover_network.md) | Social Network / Organizational Mining | The algorithm collects resource strings into a temporary vector of `Option<String>` for each trace, then loops over them twice: once to count workloads and once to compute transitions. |
| [`working_together_network`](working_together_network.md) | Social Network / Organizational Mining | The combination of sorting and nested loops has `O(N^2)` time complexity where `N` is the number of distinct resources in a single trace. |
| [`ocel_dfg`](ocel_dfg.md) | Object-Centric Process Discovery | The edge map uses borrowed keys from OCEL (`&str` from event types), which is highly optimized. |
| [`ocel_dfg_per_type`](ocel_dfg_per_type.md) | Object-Centric Process Discovery | Inside the per-type loop, it builds `events_by_object` for all objects of that type, then iterates through ALL events in the OCEL: `for (idx, event) in ocel.events.iter().enumerate()`. |
| [`ocel_petri_net`](ocel_petri_net.md) | Object-Centric Process Discovery | Double serialization/deserialization: `discover_alpha_plus_plus` takes a stored log handle, discovers a Petri Net, converts it to `JsValue`, then `discover_oc_petri_net` parses this back into `serde_json::Value` to annotate places, and finally serializes it back to JS. |
| [`ocel_encode`](ocel_encode.md) | Generative Explanations / LLM Abstractions | Text buffer allocation: builds the text string via multiple `format!` macros and string pushes. |
| [`ocel_ocla`](ocel_ocla.md) | Object-Centric Process Conformance | `sorted_indices.sort_by_key(\|&idx\| &ocel.events[idx].timestamp)` performs key-based sorting, which is efficient but could be optimized by avoiding index dereference in the comparator. |
| [`ocel_oc_declare`](ocel_oc_declare.md) | Object-Centric Process Discovery | The binary templates loop is O(T * A^2 * N) where T is object types, A is unique activities, and N is traces of that type. |
| [`predict_next_activity`](predict_next_activity.md) | Predictive Process Monitoring | Uses nested HashMaps (`HashMap<Vec<String>, HashMap<String, usize>>`). |
| [`predict_remaining_time`](predict_remaining_time.md) | Predictive Process Monitoring | Model serialization: serializes the entire `RemainingTimeModel` to JSON string to store in state, and deserializes it on every prediction call. |
| [`predict_outcome`](predict_outcome.md) | Predictive Process Monitoring | Hashing and vector construction: `predict` clones the prefix keys. |
| [`detect_drift`](detect_drift.md) | Process Health Monitoring | Double loops: for each sliding window of size W, it iterates over all events and allocates a `HashSet` of activity strings. |
| [`compute_ewma`](compute_ewma.md) | Process Health Monitoring | Trend classification evaluates only the first and last values: `let range = (last - first).abs();`. |
| [`analyze_variant_complexity`](analyze_variant_complexity.md) | Process Analytics / Complexity Measurement | Builds variant representations by cloning all activity strings for each trace into a `Vec<String>`, which is then hashed. |
| [`compute_activity_transition_matrix`](compute_activity_transition_matrix.md) | Process Analytics / Markov Chains | Multiple string lookups: calls `vocab.get(a1)` and `vocab.get(a2)` on every event transition. |
| [`analyze_process_speedup`](analyze_process_speedup.md) | Process Analytics / Temporal Performance | Unused parameter: `_window_size` is declared but completely ignored. |
| [`compute_trace_similarity_matrix`](compute_trace_similarity_matrix.md) | Process Analytics / Clustering | Pairwise similarity is O(N^2 * L) where N is number of traces and L is average trace length. |
| [`automl_classify`](automl_classify.md) | Automated Machine Learning / Parameter Tuning | Feature extraction is hardcoded to trace length and number of unique activities per trace. |
| [`automl_forecast`](automl_forecast.md) | Automated Machine Learning / Parameter Tuning | The parameter sweep step is fixed at 0.05. |
| [`agentic_pipeline`](agentic_pipeline.md) | Autonomic Agent Coordination | High degree of dependency on JSON serialization between pipeline steps. |
