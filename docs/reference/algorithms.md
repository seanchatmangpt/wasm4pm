# Algorithm Registry

<!-- Generated from wasm4pm pi ontology — regenerate with: ggen sync -->

All 60 algorithms are registered in the current release.




## Agentic

| ID | Alias | Description | Input | Status |
|----|-------|-------------|-------|--------|
| `agentic_pipeline` | — | Orchestrated multi-step agentic pipeline — chains discovery, conformance, and analytics algorithms in a reasoning loop, selecting next operation based on intermediate results. | XES | CERTIFIED |


## Conformance

| ID | Alias | Description | Input | Status |
|----|-------|-------------|-------|--------|
| `alignments` | `alignment` | Alignment-based conformance checking — synchronously replays each trace on the Petri net, computing optimal alignment cost using A* over the synchronous product automaton. | XES | CERTIFIED |
| `complexity_metrics` | `complexity` | Structural complexity metrics (size, CFC, depth) — computes Control Flow Complexity, model size, connector degree distribution, and depth without replaying the log. | XES | CERTIFIED |
| `etconformance_precision` | `etconformance` | ETConformance precision — measures how much of the model's behaviour is actually observed in the log using escaping-edges token-based precision. | PETRI_NET_HANDLE | CERTIFIED |
| `generalization` | `generalization` | Van der Aalst generalization score — measures how well the model generalises beyond the observed log by penalising infrequently visited transitions. | PETRI_NET_HANDLE | CERTIFIED |


## Discovery

| ID | Alias | Description | Input | Status |
|----|-------|-------------|-------|--------|
| `a_star` | `astar` | A* shortest-path discovery over DFG — finds optimal path through the directly-follows graph using heuristic search, producing a Petri net model. | XES | CERTIFIED |
| `aco` | `ant-colony` | Ant Colony Optimisation discovery — stochastic population-based search inspired by ant foraging, producing Petri net models with good fitness/precision balance. | XES | CERTIFIED |
| `alpha_plus_plus` | `alpha` | Alpha++ miner — extends the original Alpha algorithm to handle length-one and length-two loops, producing a Petri net from the directly-follows footprint matrix. | XES | CERTIFIED |
| `declare` | `declare` | Declarative constraint mining using LTL-based temporal logic — discovers existence, response, and precedence constraints rather than a procedural model. | XES | CERTIFIED |
| `dfg` | `dfg` | Directly-Follows Graph — fastest baseline discovery, counting how often one activity directly follows another. Serves as input to most other discovery algorithms. | XES | CERTIFIED |
| `genetic_algorithm` | `genetic` | Genetic algorithm process model search — evolves a population of candidate Petri nets using fitness, precision, generalization and simplicity as multi-objective fitness functions. | XES | CERTIFIED |
| `heuristic_miner` | `heuristic` | Heuristics Miner — uses dependency measures to filter noise before constructing a causal net. Dependency threshold controls filtering aggressiveness. | XES | CERTIFIED |
| `hierarchical_dfg` | — | Hierarchical DFG — extends the standard DFG with automatic detection and collapsing of recurring sub-process patterns. | XES | CERTIFIED |
| `hill_climbing` | `hill-climbing` | Hill-climbing local search — iteratively improves a candidate model by applying local operators, terminating at a local optimum. | XES | CERTIFIED |
| `ilp` | `ilp` | ILP Miner — solves an integer linear programming problem to find a Petri net fitting the directly-follows relations; produces high-precision sound models. | XES | CERTIFIED |
| `inductive_miner` | `inductive` | Inductive Miner — recursively discovers a sound, block-structured process tree from the event log by detecting cut types (sequence, parallel, choice, loop). | XES | CERTIFIED |
| `log_to_trie` | `prefix-tree` | Prefix-tree (trie) representation — inserts all traces into a trie where each path from root to leaf represents a unique trace variant. | XES | CERTIFIED |
| `optimized_dfg` | `dfg-optimized` | DFG with arc-weight optimisation pass — builds a standard DFG then applies pruning to remove statistically insignificant arcs. | XES | CERTIFIED |
| `process_skeleton` | `skeleton` | Minimal skeleton DFG — retains only the highest-frequency directly-follows arcs to produce a sparse backbone of the process. | XES | CERTIFIED |
| `pso` | `pso` | Particle Swarm Optimisation discovery — maintains a swarm of candidate models whose positions evolve toward the global best according to social and cognitive acceleration. | XES | CERTIFIED |
| `simd_streaming_dfg` | `simd-dfg` | SIMD-accelerated streaming DFG — processes the event log in a single pass using SIMD vector intrinsics for maximum throughput on large logs. | XES | CERTIFIED |
| `simulated_annealing` | `simulated-annealing` | Simulated Annealing stochastic search — probabilistically accepts worse candidate models according to a cooling schedule to escape local optima. | XES | CERTIFIED |
| `smart_engine` | — | Auto-selects the best algorithm for the input characteristics — inspects log size, variant count, and noise level, then dispatches to the most appropriate discovery algorithm. | XES | CERTIFIED |
| `streaming_log` | — | Streaming event log ingestion — processes events in arrival order without materialising the full log in memory; emits running DFG statistics. | XES | CERTIFIED |
| `transition_system` | `transition-system` | Transition system from event log — constructs a finite-state automaton where states are abstractions of trace history and arcs are activity labels. | XES | CERTIFIED |


## Discovery analytics

| ID | Alias | Description | Input | Status |
|----|-------|-------------|-------|--------|
| `analyze_process_speedup` | — | Measures speedup potential across trace variants — identifies bottleneck activity pairs and quantifies theoretical throughput gain from parallelisation. | XES | CERTIFIED |
| `analyze_variant_complexity` | — | Complexity metrics per trace variant — computes length distribution, unique activity count, loop density, and entropy for each distinct variant in the log. | XES | CERTIFIED |
| `batches` | `batches` | Detects batch-execution patterns — identifies when a resource processes multiple cases simultaneously (sequential, concurrent, simultaneous, or interleaved batches). | XES | CERTIFIED |
| `causal_graph` | `causal-graph` | Causal dependency graph — applies causal inference to distinguish spurious correlations in the DFG from genuine causal dependencies between activities. | XES | CERTIFIED |
| `compute_activity_transition_matrix` | — | Activity-to-activity transition probability matrix — computes the n x n matrix of empirical transition probabilities between all activity pairs. | XES | CERTIFIED |
| `compute_trace_similarity_matrix` | — | Pairwise trace similarity matrix — computes edit-distance or Jaccard similarity for all trace pairs; used as input to clustering and variant analysis. | XES | CERTIFIED |
| `correlation_miner` | `correlation` | Correlation-based dependency miner — discovers dependencies from statistical correlation of activity occurrences without requiring case identifiers. | XES | CERTIFIED |
| `handover_network` | — | Social network: handover-of-work between resources — nodes are resources, arcs represent how frequently one resource hands a case to another. | XES | CERTIFIED |
| `performance_spectrum` | `perf-spectrum` | Performance spectrum — segments all arc traversals in the DFG by time, producing a time-sliced frequency matrix for flow rate visualisation. | XES | CERTIFIED |
| `working_together_network` | — | Social network: co-worker collaboration — arcs represent how frequently two resources work on the same case, regardless of handover direction. | XES | CERTIFIED |


## Import export

| ID | Alias | Description | Input | Status |
|----|-------|-------------|-------|--------|
| `bpmn_import` | `import-bpmn` | Import BPMN 2.0 XML to process tree — parses a BPMN 2.0 XML document and converts flow elements to a block-structured process tree. | BPMN | CERTIFIED |
| `pnml_import` | `import-pnml` | Import PNML to Petri net — parses a PNML XML document and reconstructs the place-transition structure for use as a conformance reference model. | PNML | CERTIFIED |
| `powl_to_process_tree` | `powl-to-tree` | Convert POWL model to process tree — translates a Partially Ordered Workflow Language model to a block-structured process tree. | ANY | CERTIFIED |
| `yawl_export` | `export-yawl` | Export process model to YAWL format — serialises a discovered process model as a YAWL specification for import into YAWL-compatible workflow engines. | PETRI_NET_HANDLE | CERTIFIED |


## Ml analytics

| ID | Alias | Description | Input | Status |
|----|-------|-------------|-------|--------|
| `automl_classify` | — | AutoML classification — automatically selects and tunes a classifier (decision tree, random forest, gradient boosting) from process feature vectors. | ANY | CERTIFIED |
| `automl_forecast` | — | AutoML time-series forecasting — automatically selects and tunes a forecasting model for process throughput or case duration prediction. | ANY | CERTIFIED |
| `ml_anomaly` | `ml-anomaly` | Anomaly detection — applies isolation forest or one-class SVM to process feature vectors to flag statistically anomalous traces or events. | ANY | CERTIFIED |
| `ml_classify` | `ml-classify` | Supervised classification — trains a classifier on labeled process feature vectors and predicts labels for unseen cases. | ANY | CERTIFIED |
| `ml_cluster` | `ml-cluster` | Unsupervised clustering — applies k-means or DBSCAN to process feature vectors to discover natural groupings of cases or traces. | ANY | CERTIFIED |
| `ml_forecast` | `ml-forecast` | Time-series forecasting — trains a forecasting model on historical process metrics and produces forward projections. | ANY | CERTIFIED |
| `ml_pca` | `ml-pca` | Principal Component Analysis — reduces dimensionality of process feature vectors, revealing principal axes of variation. | ANY | CERTIFIED |
| `ml_regress` | `ml-regress` | Regression — fits a regression model to predict a continuous target (e.g., case duration) from process feature vectors. | ANY | CERTIFIED |


## Object centric

| ID | Alias | Description | Input | Status |
|----|-------|-------------|-------|--------|
| `ocel_dfg` | — | Object-centric DFG across all object types — flattens the OCEL log into a unified DFG weighted by event frequency regardless of type. | OCEL | CERTIFIED |
| `ocel_dfg_per_type` | — | Separate DFG per object type — produces one DFG for each object type in the OCEL log, enabling per-type flow analysis without cross-type interference. | OCEL | CERTIFIED |
| `ocel_encode` | — | Encodes OCEL log to feature matrix — transforms the object-centric log into a numeric feature matrix suitable for downstream ML algorithms. | OCEL | CERTIFIED |
| `ocel_oc_declare` | — | Object-centric Declare constraint discovery — mines LTL-based temporal constraints from the OCEL log, relating events across different object types. | OCEL | CERTIFIED |
| `ocel_ocla` | — | Object-centric log abstraction analytics — computes summary statistics: object interaction counts, event density, and type co-occurrence matrices. | OCEL | CERTIFIED |
| `ocel_petri_net` | — | Per-type flattened Petri nets — applies the Inductive Miner to each object-type-flattened sub-log to produce a sound Petri net per type. | OCEL | CERTIFIED |


## Prediction

| ID | Alias | Description | Input | Status |
|----|-------|-------------|-------|--------|
| `compute_ewma` | — | Exponentially weighted moving average on case metrics — applies EWMA smoothing to process KPI time-series for trend-aware monitoring. | XES | CERTIFIED |
| `detect_drift` | — | Concept drift detection — applies statistical change-point tests (ADWIN, Page-Hinkley) to a sliding window to detect when the underlying process has changed. | XES | CERTIFIED |
| `predict_next_activity` | — | Next-activity prediction from trace prefix — encodes the trace prefix as a feature vector and predicts the most likely next activity. | XES | CERTIFIED |
| `predict_outcome` | — | Case outcome prediction — predicts the final outcome of a running case from its prefix using a trained binary or multi-class classifier. | XES | CERTIFIED |
| `predict_remaining_time` | — | Remaining time prediction from trace prefix — estimates time until case completion using a regression model trained on completed cases. | XES | CERTIFIED |


## Simulation

| ID | Alias | Description | Input | Status |
|----|-------|-------------|-------|--------|
| `monte_carlo_simulation` | `montecarlo` | Monte Carlo simulation from discovered model — samples synthetic traces from empirical transition probability distribution to estimate throughput time distributions. | XES | CERTIFIED |
| `playout` | `playout` | Stochastic playout from Petri net — generates synthetic event logs by firing enabled transitions according to stochastic weights until all tokens reach the final marking. | PETRI_NET_HANDLE | CERTIFIED |
