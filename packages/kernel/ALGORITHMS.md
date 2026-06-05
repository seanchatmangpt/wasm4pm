# Algorithm Reference

Complete reference for all **60** algorithms in the wasm4pm kernel registry.

**Version:** v26.6.5

> **Auto-generated.** Run `pnpm run docs:algorithms` from the repo root to refresh after registry changes.

## Quick Commands

```bash
wpm algorithms --format json | jq '.payload.algorithms | length'   # expect 60
wpm run log.xes -a dfg
```

---

## Core Discovery

| ID | Alias | Output | Speed | Quality | Robust | Scales |
|----|-------|--------|------:|--------:|:------:|:------:|
| `a_star` | `astar` | dfg | 60 | 70 | ✗ | ✗ |
| `aco` | `ant-colony` | dfg | 65 | 75 | ✓ | ✗ |
| `alpha_plus_plus` | `alpha` | petrinet | 20 | 50 | ✗ | ✗ |
| `declare` | `declare` | declare | 35 | 50 | ✓ | ✓ |
| `dfg` | `dfg` | dfg | 5 | 30 | ✓ | ✓ |
| `genetic_algorithm` | `genetic` | dfg | 75 | 80 | ✓ | ✗ |
| `heuristic_miner` | `heuristic` | dfg | 25 | 50 | ✓ | ✓ |
| `hill_climbing` | `hill-climbing` | dfg | 40 | 55 | ✓ | ✓ |
| `ilp` | `ilp` | petrinet | 80 | 90 | ✗ | ✗ |
| `inductive_miner` | `inductive` | tree | 30 | 55 | ✓ | ✓ |
| `optimized_dfg` | `dfg-optimized` | dfg | 70 | 85 | ✗ | ✗ |
| `process_skeleton` | `skeleton` | dfg | 3 | 25 | ✓ | ✓ |
| `pso` | `pso` | dfg | 70 | 75 | ✓ | ✗ |
| `simulated_annealing` | `simulated-annealing` | dfg | 55 | 65 | ✓ | ✗ |

- **`a_star`** (A* Search): Heuristic search algorithm. Actually returns DFG, not Petri net (Phase 4 audit correction).
- **`aco`** (Ant Colony Optimization (ACO)): Swarm intelligence algorithm. Actually returns DFG, not Petri net (Phase 4 audit correction).
- **`alpha_plus_plus`** (Alpha+++ (Triple Plus)): Advanced Alpha+++ algorithm. Extends the original Alpha algorithm with explicit handling of length-1 loops, length-2 loops, and parallel short-loop pairs. Produces a proper Petri net with source/sink places.
- **`declare`** (Declare (Constraints)): Discovers declarative (constraint-based) process models. Good for flexible processes.
- **`dfg`** (DFG (Directly Follows Graph)): Discovers a directly-follows graph from an event log. Fastest algorithm with minimal memory overhead.
- **`genetic_algorithm`** (Genetic Algorithm): Uses evolutionary computation. Actually returns DFG, not Petri net (Phase 4 audit correction).
- **`heuristic_miner`** (Heuristic Miner): Discovers models from real-world logs with noise. Uses dependency threshold to filter weak dependencies.
- **`hill_climbing`** (Hill Climbing): Greedy local search. Actually returns DFG, not Petri net (Phase 4 audit correction).
- **`ilp`** (Integer Linear Programming (ILP)): Region-based Petri net discovery. Finds causal place candidates (1-to-1, AND-splits, AND-joins) validated by token replay, with greedy minimization. Produces precise Petri nets with explicit parallel-join/split structure.
- **`inductive_miner`** (Inductive Miner): Recursive cut-based process tree discovery (XOR/Sequence/Parallel/Loop cuts). IM-basic: no noise filtering, all directly-follows preserved.
- **`optimized_dfg`** (Optimized DFG (ILP)): ILP-based DFG optimization. Minimal model with best fitness.
- **`process_skeleton`** (Process Skeleton): Discovers a minimal process skeleton with start and end activities. Very fast.
- **`pso`** (Particle Swarm Optimization (PSO)): Swarm-based algorithm. Actually returns DFG, not Petri net (Phase 4 audit correction).
- **`simulated_annealing`** (Simulated Annealing): Probabilistic technique. Actually returns DFG, not Petri net (Phase 4 audit correction).

## Streaming & Smart Engine

| ID | Alias | Output | Speed | Quality | Robust | Scales |
|----|-------|--------|------:|--------:|:------:|:------:|
| `hierarchical_dfg` | — | dfg | 5 | 30 | ✓ | ✓ |
| `simd_streaming_dfg` | `simd-dfg` | dfg | 1 | 30 | ✓ | ✓ |
| `smart_engine` | — | dfg | 3 | 45 | ✓ | ✓ |
| `streaming_log` | — | analytics | 10 | 25 | ✓ | ✓ |

- **`hierarchical_dfg`** (Hierarchical DFG): Hierarchical chunking DFG for massive event logs. Scales to 100B+ events via divide-and-conquer with bounded memory.
- **`simd_streaming_dfg`** (SIMD Streaming DFG): SIMD-accelerated streaming directly-follows graph discovery. Approximately 500x faster than standard DFG via vectorized event processing.
- **`smart_engine`** (Smart Engine): Smart execution engine with adaptive algorithm selection, result caching, and early termination. Output type varies based on log characteristics.
- **`streaming_log`** (Streaming Log (Probabilistic)): Probabilistic streaming event log processor. Stateful handle-based API. Use streaming_log_create(), streaming_log_add_trace(), streaming_log_estimate_dfg(), streaming_log_free().

## Discovery Analytics

| ID | Alias | Output | Speed | Quality | Robust | Scales |
|----|-------|--------|------:|--------:|:------:|:------:|
| `analyze_process_speedup` | — | analytics | 15 | 60 | ✓ | ✓ |
| `analyze_variant_complexity` | — | analytics | 10 | 40 | ✓ | ✓ |
| `batches` | `batches` | analytics | 50 | 55 | ✗ | ✗ |
| `causal_graph` | `causal-graph` | dfg | 60 | 55 | ✗ | ✓ |
| `compute_activity_transition_matrix` | — | analytics | 20 | 50 | ✓ | ✓ |
| `compute_trace_similarity_matrix` | — | analytics | 50 | 70 | ✓ | ✗ |
| `correlation_miner` | `correlation` | dfg | 45 | 60 | ✗ | ✗ |
| `log_to_trie` | `prefix-tree` | dfg | 75 | 50 | ✓ | ✓ |
| `performance_spectrum` | `perf-spectrum` | analytics | 55 | 60 | ✗ | ✗ |
| `transition_system` | `transition-system` | dfg | 70 | 50 | ✓ | ✓ |

- **`analyze_process_speedup`** (Process Speedup Analysis): Identify where process accelerates/decelerates over time using timestamp deltas. WASM export: analyze_process_speedup(log_handle, timestamp_key, window_size).
- **`analyze_variant_complexity`** (Variant Complexity Analysis): Measure variant entropy and diversity in the event log. WASM export: analyze_variant_complexity(log_handle, activity_key).
- **`batches`** (Batch Detection): Detect batch patterns where cases share timestamps.
- **`causal_graph`** (Causal Graph Discovery): Discover causal dependencies using alpha or heuristic methods.
- **`compute_activity_transition_matrix`** (Activity Transition Matrix): Compute activity transition matrix (Markov chain) for the process. WASM export: compute_activity_transition_matrix(log_handle, activity_key).
- **`compute_trace_similarity_matrix`** (Trace Similarity Matrix): Compute pairwise trace similarity matrix using Levenshtein distance on activity sequences. WASM export: compute_trace_similarity_matrix(log_handle, activity_key).
- **`correlation_miner`** (Correlation Miner): Discover DFG structure without case identifiers using timestamp correlation.
- **`log_to_trie`** (Prefix Tree Discovery): Build a prefix tree (trie) from log variants.
- **`performance_spectrum`** (Performance Spectrum): Analyze duration statistics between activity pairs.
- **`transition_system`** (Transition System Discovery): Build a state machine from the event log using a sliding window approach.

## Conformance & Quality

| ID | Alias | Output | Speed | Quality | Robust | Scales |
|----|-------|--------|------:|--------:|:------:|:------:|
| `alignments` | `alignment` | analytics | 20 | 90 | ✓ | ✗ |
| `complexity_metrics` | `complexity` | analytics | 80 | 60 | ✓ | ✓ |
| `etconformance_precision` | `etconformance` | analytics | 55 | 70 | ✓ | ✓ |
| `generalization` | `generalization` | analytics | 65 | 65 | ✓ | ✓ |

- **`alignments`** (A* Optimal Alignments): Compute optimal trace-to-model alignments using A* search.
- **`complexity_metrics`** (POWL Complexity Metrics): Measure structural complexity of a POWL model.
- **`etconformance_precision`** (ETConformance Precision): Measure precision via escaping-edge analysis.
- **`generalization`** (Generalization Metric): Measure how general a Petri net model is (avoids overfitting).

## Simulation

| ID | Alias | Output | Speed | Quality | Robust | Scales |
|----|-------|--------|------:|--------:|:------:|:------:|
| `monte_carlo_simulation` | `montecarlo` | dfg | 70 | 60 | ✓ | ✗ |
| `playout` | `playout` | analytics | 60 | 50 | ✓ | ✓ |

- **`monte_carlo_simulation`** (Monte Carlo Simulation): Run Monte Carlo simulation with stochastic replay for probabilistic process analysis.
- **`playout`** (Process Tree Playout): Simulate event log generation from a process tree or DFG.

## Import / Export

| ID | Alias | Output | Speed | Quality | Robust | Scales |
|----|-------|--------|------:|--------:|:------:|:------:|
| `bpmn_import` | `import-bpmn` | tree | 70 | 70 | ✓ | ✓ |
| `pnml_import` | `import-pnml` | petrinet | 75 | 80 | ✓ | ✓ |
| `powl_to_process_tree` | `powl-to-tree` | tree | 75 | 70 | ✓ | ✓ |
| `yawl_export` | `export-yawl` | tree | 75 | 70 | ✓ | ✓ |

- **`bpmn_import`** (BPMN Import): Import a BPMN 2.0 XML model and convert to POWL.
- **`pnml_import`** (PNML Import): Import a Petri net from PNML XML format.
- **`powl_to_process_tree`** (POWL to Process Tree): Convert a POWL model to a process tree representation.
- **`yawl_export`** (YAWL Export): Export a POWL model to YAWL v6 XML format.

## OCEL / Object-Centric

| ID | Alias | Output | Speed | Quality | Robust | Scales |
|----|-------|--------|------:|--------:|:------:|:------:|
| `ocel_dfg` | — | dfg | 5 | 30 | ✓ | ✓ |
| `ocel_dfg_per_type` | — | dfg | 8 | 40 | ✓ | ✓ |
| `ocel_encode` | — | analytics | 5 | 20 | ✓ | ✓ |
| `ocel_oc_declare` | — | declare | 40 | 60 | ✓ | ✗ |
| `ocel_ocla` | — | analytics | 10 | 40 | ✓ | ✓ |
| `ocel_petri_net` | — | petrinet | 35 | 65 | ✓ | ✗ |

- **`ocel_dfg`** (OC-DFG (Aggregate)): Discover an aggregate Object-Centric Directly-Follows Graph (OC-DFG) across all object types. Produces a single DFG where each node is an activity and edges reflect directly-follows relations observed across all object types in the OCEL. WASM export: discover_ocel_dfg(ocel_handle). Requires feature-ocel.
- **`ocel_dfg_per_type`** (OC-DFG Per Object Type): Discover per-object-type Directly-Follows Graphs from an OCEL. Returns a map from object_type to DFG, allowing separate process views for each object type (e.g. Order, Item). This is the canonical OC-DFG projection for object-centric process mining. WASM export: discover_ocel_dfg_per_type(ocel_handle). Requires feature-ocel.
- **`ocel_encode`** (OCEL Text Encoding): Encode an OCEL as a compact human-readable text representation suitable for LLM context, process inspection, and diff display. WASM export: encode_ocel_as_text(ocel_handle). Requires feature-ocel.
- **`ocel_oc_declare`** (OC-Declare): Discover Object-Centric Declare constraints from an OCEL. Identifies temporal constraints that hold across different object types. WASM export: discover_oc_declare_wasm(ocel_handle, noise_threshold). Requires feature-ocel.
- **`ocel_ocla`** (OC-Language Abstraction): Discover Object-Centric Language Abstraction (OCLA) from an OCEL. Captures the language of events per object type and their interactions. WASM export: discover_ocla_wasm(ocel_handle). Requires feature-ocel.
- **`ocel_petri_net`** (OC-Petri Net Discovery): Discover an Object-Centric Petri Net (OC-Petri net) from an OCEL. The OC-Petri net captures concurrency and synchronization between different object types. WASM export: discover_oc_petri_net(ocel_handle, algorithm). Requires feature-ocel.

## Prediction

| ID | Alias | Output | Speed | Quality | Robust | Scales |
|----|-------|--------|------:|--------:|:------:|:------:|
| `compute_ewma` | — | analytics | 5 | 30 | ✓ | ✓ |
| `detect_drift` | — | analytics | 15 | 70 | ✓ | ✓ |
| `predict_next_activity` | — | analytics | 15 | 50 | ✓ | ✓ |
| `predict_outcome` | — | analytics | 25 | 55 | ✓ | ✓ |
| `predict_remaining_time` | — | analytics | 20 | 55 | ✓ | ✓ |

- **`compute_ewma`** (EWMA Smoothing): Compute Exponentially Weighted Moving Average (EWMA) for a series of values. WASM export: compute_ewma(values_json, alpha).
- **`detect_drift`** (Process Drift Detection): Detect concept drift in a process by comparing activity distributions across sliding windows. WASM export: detect_drift(log_handle, activity_key, window_size).
- **`predict_next_activity`** (Next Activity Prediction): Predict the most likely next activity in a process using n-gram (Markov chain) models. Build model with build_ngram_predictor(), predict with predict_next_activity(). Returns activity predictions with probabilities.
- **`predict_outcome`** (Outcome Prediction): Predict case outcome (success/anomaly) using anomaly scoring against DFG model and boundary coverage analysis. Build models with discover_dfg() and build_ngram_predictor(), score with score_anomaly() and compute_boundary_coverage(). Returns anomaly score and coverage metrics.
- **`predict_remaining_time`** (Remaining Time Prediction): Predict remaining time to case completion using statistical bucket models and Weibull distribution. Build model with build_remaining_time_model(), predict with predict_case_duration(). Returns remaining milliseconds with confidence score.

## ML Analysis

| ID | Alias | Output | Speed | Quality | Robust | Scales |
|----|-------|--------|------:|--------:|:------:|:------:|
| `automl_classify` | — | analytics | 40 | 90 | ✓ | ✓ |
| `automl_forecast` | — | analytics | 30 | 85 | ✓ | ✓ |
| `ml_anomaly` | `ml-anomaly` | ml_result | 30 | 55 | ✓ | ✓ |
| `ml_classify` | `ml-classify` | ml_result | 30 | 55 | ✓ | ✓ |
| `ml_cluster` | `ml-cluster` | ml_result | 35 | 55 | ✓ | ✓ |
| `ml_forecast` | `ml-forecast` | ml_result | 25 | 50 | ✓ | ✓ |
| `ml_pca` | `ml-pca` | ml_result | 25 | 55 | ✗ | ✗ |
| `ml_regress` | `ml-regress` | ml_result | 25 | 50 | ✓ | ✓ |

- **`automl_classify`** (AutoML Classification): Auto-optimize classification model (RF/XGB) for trace outcome prediction. WASM export: discover_automl_classify(log_handle, activity_key).
- **`automl_forecast`** (AutoML Throughput Forecast): Auto-optimize time-series forecasting model for process throughput. WASM export: discover_automl_forecast(log_handle, activity_key).
- **`ml_anomaly`** (ML Anomaly Detection): Detect anomalous process windows using peak finding and seasonal decomposition on drift distances.
- **`ml_classify`** (ML Trace Classification): Classify traces by outcome using k-NN, logistic regression, decision tree, or naive Bayes.
- **`ml_cluster`** (ML Trace Clustering): Cluster traces by similarity using k-means or DBSCAN.
- **`ml_forecast`** (ML Throughput Forecasting): Forecast future process throughput using linear trend, autocorrelation seasonality, and optional exponential overlay.
- **`ml_pca`** (ML PCA Feature Reduction): Reduce trace feature dimensionality using Principal Component Analysis (Jacobi eigendecomposition).
- **`ml_regress`** (ML Remaining Time Regression): Predict remaining case cycle time using linear, polynomial, or exponential regression on trace features.

## Social Network Analysis

| ID | Alias | Output | Speed | Quality | Robust | Scales |
|----|-------|--------|------:|--------:|:------:|:------:|
| `handover_network` | — | analytics | 40 | 60 | ✓ | ✓ |
| `working_together_network` | — | analytics | 45 | 60 | ✓ | ✓ |

- **`handover_network`** (Handover-of-Work Network): Mine organisational handover-of-work networks from event logs (van der Aalst social network mining). Produces a weighted graph where edge weight = number of direct handovers between resource pairs. WASM export: discover_handover_network(log_handle, resource_key).
- **`working_together_network`** (Working-Together Network): Mine working-together social networks: edges represent resources that handled the same case. Complements handover-of-work by capturing collaboration rather than sequential handoff. WASM export: discover_working_together_network(log_handle, resource_key).

## Agentic

| ID | Alias | Output | Speed | Quality | Robust | Scales |
|----|-------|--------|------:|--------:|:------:|:------:|
| `agentic_pipeline` | — | analytics | 1 | 95 | ✓ | ✓ |

- **`agentic_pipeline`** (Agentic Process Pipeline): End-to-end agentic lifecycle: perception, decision, protection, and Bellman-optimized policy. WASM export: run_agentic_pipeline(task_json). Requires feature-cloud.
