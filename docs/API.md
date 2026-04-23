# API Reference — wasm4pm v26.4.10

Complete reference for all 153 exported functions in the wasm4pm JavaScript API, organized by category.

---

## Core Initialization

### `init(): Promise<string>`
Initialize the WASM module. Must be called once before using any other functions.

```javascript
await pm.init();
```

---

### `get_version(): string`
Get wasm4pm version string.

```javascript
const version = pm.get_version();
// Returns: "26.4.5"
```

---

## Event Log Loading

### `load_eventlog_from_xes(xesContent: string): string`
Load an event log from XES (XML Event Stream) format.

**Parameters:**
- `xesContent` — XES XML string (XES 1.0 or 2.0)

**Returns:** Log handle (opaque string for memory reference)

**Example:**
```javascript
const logHandle = pm.load_eventlog_from_xes(xesContent);
```

---

### `load_eventlog_from_json(jsonContent: string): string`
Load an event log from JSON format.

**Parameters:**
- `jsonContent` — JSON string with eventlog structure

**Returns:** Log handle

---

### `load_ocel_from_json(jsonContent: string): string`
Load an Object-Centric Event Log (OCEL) from JSON.

**Parameters:**
- `jsonContent` — OCEL JSON string (OCEL 1.0 format)

**Returns:** OCEL handle

---

### `load_ocel_from_xml(xmlContent: string): string`
Load an Object-Centric Event Log (OCEL) from XML.

**Parameters:**
- `xmlContent` — OCEL XML string

**Returns:** OCEL handle

---

### `load_ocel2_from_json(jsonContent: string): string`
Load an OCEL 2.0 format event log from JSON.

**Parameters:**
- `jsonContent` — OCEL 2.0 JSON string

**Returns:** OCEL handle

---

## Discovery Algorithms — Basic

### `discover_dfg(logHandle: string, activityKey: string): object`
Discover a Directly-Follows Graph (DFG) showing which activities follow each other.

**Parameters:**
- `logHandle` — Event log handle
- `activityKey` — Attribute key for activity names (e.g., "concept:name")

**Returns:** DFG object with `nodes` (activity names) and `edges` (from→to→count)

**Performance:** ~0.5ms per 100 events

**Example:**
```javascript
const dfg = pm.discover_dfg(logHandle, 'concept:name');
console.log(`Activities: ${dfg.nodes.length}, Flows: ${dfg.edges.length}`);
```

---

### `discover_dfg_filtered(logHandle: string, activityKey: string, minFrequency: number): object`
Discover DFG with frequency-based edge filtering.

**Parameters:**
- `logHandle` — Event log handle
- `activityKey` — Activity attribute key
- `minFrequency` — Minimum edge frequency (absolute count)

**Returns:** Filtered DFG object

---

### `discover_ocel_dfg(ocelHandle: string): object`
Discover DFG from an Object-Centric Event Log.

**Parameters:**
- `ocelHandle` — OCEL handle

**Returns:** DFG object aggregated across all object types

---

### `discover_ocel_dfg_per_type(ocelHandle: string): object`
Discover per-type DFGs from an OCEL (one DFG per object type).

**Parameters:**
- `ocelHandle` — OCEL handle

**Returns:** JSON object mapping object types to DFG objects

---

### `discover_declare(logHandle: string, activityKey: string): object`
Discover DECLARE constraints (constraint-based declarative model).

**Parameters:**
- `logHandle` — Event log handle
- `activityKey` — Activity attribute key

**Returns:** DECLARE model with constraint types and confidence scores

---

## Discovery Algorithms — Petri Nets

### `discover_alpha_plus_plus(logHandle: string, threshold: number): object`
Discover a Petri net using the Alpha++ algorithm with noise filtering.

**Parameters:**
- `logHandle` — Event log handle
- `threshold` — Noise threshold (0.0–1.0); 0.1 drops infrequent activities

**Returns:** Petri net object with places, transitions, arcs

**Performance:** ~5–10ms per 100 events

**When to use:** Balanced accuracy and speed, some noise tolerance, simple to medium-complexity processes

**Example:**
```javascript
const net = pm.discover_alpha_plus_plus(logHandle, 0.1);
```

---

### `discover_heuristic_miner(logHandle: string, dependencyThreshold: number): object`
Discover a Petri net using Heuristic Miner algorithm.

**Parameters:**
- `logHandle` — Event log handle
- `dependencyThreshold` — Dependency threshold (0.0–1.0)

**Returns:** Petri net object

**Performance:** ~10–20ms per 100 events

**When to use:** Complex processes with loops, high noise tolerance

---

### `discover_inductive_miner(logHandle: string, noiseThreshold: number): object`
Discover a process tree using Inductive Miner (divide-and-conquer).

**Parameters:**
- `logHandle` — Event log handle
- `noiseThreshold` — Noise threshold (0.0–1.0)

**Returns:** Process tree object (hierarchical structure)

**Performance:** ~20–50ms per 100 events

**When to use:** Need hierarchical model, precise fitting, minimal generalization

---

### `discover_genetic_algorithm(logHandle: string, generations: number, populationSize: number): object`
Discover a Petri net using evolutionary genetic algorithm.

**Parameters:**
- `logHandle` — Event log handle
- `generations` — Number of evolutionary generations (typical: 20–100)
- `populationSize` — Population size per generation (typical: 50–200)

**Returns:** Petri net object (best model found)

**Performance:** ~40–200ms per 100 events (depends on parameters)

**When to use:** High-quality models needed, time available, complex processes

---

## Discovery Algorithms — Advanced

### `discover_ant_colony(logHandle: string, iterations: number, evaporationRate: number): object`
Discover using Ant Colony Optimization (ACO) metaheuristic.

**Parameters:**
- `logHandle` — Event log handle
- `iterations` — Number of iterations
- `evaporationRate` — Pheromone evaporation rate (0.0–1.0)

**Returns:** Petri net object

---

### `discover_astar(logHandle: string, heuristicWeight: number): object`
Discover using A* search-based algorithm (informed heuristic search).

**Parameters:**
- `logHandle` — Event log handle
- `heuristicWeight` — Weight for heuristic (0.0–1.0)

**Returns:** Petri net object

---

### `discover_hill_climbing(logHandle: string, maxIterations: number): object`
Discover using Hill Climbing (greedy local optimization).

**Parameters:**
- `logHandle` — Event log handle
- `maxIterations` — Maximum optimization iterations

**Returns:** Petri net object

---

### `discover_pso_algorithm(logHandle: string, swarmSize: number, iterations: number): object`
Discover using Particle Swarm Optimization (PSO).

**Parameters:**
- `logHandle` — Event log handle
- `swarmSize` — Number of particles
- `iterations` — Iteration count

**Returns:** Petri net object

---

### `discover_simulated_annealing(logHandle: string, temperature: number, coolingRate: number): object`
Discover using Simulated Annealing (probabilistic optimization).

**Parameters:**
- `logHandle` — Event log handle
- `temperature` — Initial temperature
- `coolingRate` — Temperature decay rate

**Returns:** Petri net object

---

### `discover_simple_process_tree(logHandle: string): object`
Discover a simplified process tree structure.

**Parameters:**
- `logHandle` — Event log handle

**Returns:** Process tree object

---

### `discover_performance_dfg(logHandle: string, activityKey: string): object`
Discover DFG enriched with performance metrics (duration, throughput).

**Parameters:**
- `logHandle` — Event log handle
- `activityKey` — Activity attribute key

**Returns:** DFG with performance annotations

---

### `discover_optimized_dfg(logHandle: string, activityKey: string, optimizationStrategy: string): object`
Discover DFG with optimization (node/edge pruning).

**Parameters:**
- `logHandle` — Event log handle
- `activityKey` — Activity attribute key
- `optimizationStrategy` — "prune_nodes", "prune_edges", or "balanced"

**Returns:** Optimized DFG object

---

### `discover_temporal_profile(logHandle: string): object`
Discover temporal profile (activity timing distribution and dependencies).

**Parameters:**
- `logHandle` — Event log handle

**Returns:** Temporal profile object with timing statistics per transition

---

### `discover_handover_network(logHandle: string, resourceKey: string): object`
Discover handover network showing resource collaboration.

**Parameters:**
- `logHandle` — Event log handle
- `resourceKey` — Resource/performer attribute key (e.g., "org:resource")

**Returns:** Network graph of resource handovers

---

### `discover_working_together_network(logHandle: string, resourceKey: string): object`
Discover co-working network showing which resources work on same cases.

**Parameters:**
- `logHandle` — Event log handle
- `resourceKey` — Resource attribute key

**Returns:** Co-working network graph

---

### `discover_oc_petri_net(ocelHandle: string): object`
Discover an Object-Centric Petri Net from OCEL.

**Parameters:**
- `ocelHandle` — OCEL handle

**Returns:** Object-Centric Petri Net

---

## Conformance Checking

### `check_token_based_replay(logHandle: string, netHandle: string, activityKey: string): object`
Check conformance between log and model using token-based replay.

**Parameters:**
- `logHandle` — Event log handle
- `netHandle` — Petri net handle
- `activityKey` — Activity attribute key

**Returns:** Object with metrics:
  - `fitness` (0–1): Fraction of events replayed successfully
  - `precision` (0–1): How much model behavior appears in log
  - `simplicity` (0–1): Inverse of model complexity
  - `generalization` (0–1): Balance of precision and simplicity

**Example:**
```javascript
const conf = pm.check_token_based_replay(logHandle, netHandle, 'concept:name');
console.log(`Fitness: ${conf.fitness}, Precision: ${conf.precision}`);
```

---

### `check_declare_conformance(logHandle: string, declareHandle: string, activityKey: string): object`
Check conformance with DECLARE constraint model.

**Parameters:**
- `logHandle` — Event log handle
- `declareHandle` — DECLARE model handle
- `activityKey` — Activity attribute key

**Returns:** Conformance metrics

---

### `check_temporal_conformance(logHandle: string): object`
Check temporal conformance (time-based constraint violations).

**Parameters:**
- `logHandle` — Event log handle

**Returns:** Temporal conformance metrics

---

### `check_ocel_data_quality(ocelHandle: string): object`
Check data quality issues in OCEL.

**Parameters:**
- `ocelHandle` — OCEL handle

**Returns:** Data quality report with issues identified

---

### `check_data_quality(logHandle: string): object`
Check data quality of an EventLog for common issues (missing values, duplicates, etc.).

**Parameters:**
- `logHandle` — Event log handle

**Returns:** Quality report object

---

### `oc_conformance_check(ocelHandle: string, ocNetHandle: string): object`
Check conformance of OCEL against Object-Centric Petri Net.

**Parameters:**
- `ocelHandle` — OCEL handle
- `ocNetHandle` — Object-Centric Petri Net handle

**Returns:** Conformance metrics

---

## Analysis — Trace & Case

### `analyze_trace_variants(logHandle: string): object[]`
Identify distinct trace variants and their frequencies.

**Parameters:**
- `logHandle` — Event log handle

**Returns:** Array of variant objects with `sequence`, `frequency`, `percentage`

**Example:**
```javascript
const variants = pm.analyze_trace_variants(logHandle);
console.log(`Found ${variants.length} variants`);
```

---

### `analyze_variant_complexity(logHandle: string): object`
Analyze complexity and diversity of trace variants.

**Parameters:**
- `logHandle` — Event log handle

**Returns:** Complexity metrics (entropy, diversity, concentration)

---

### `analyze_infrequent_paths(logHandle: string, threshold: number): object`
Identify infrequent behavior patterns (deviations from main process).

**Parameters:**
- `logHandle` — Event log handle
- `threshold` — Frequency threshold (0.0–1.0)

**Returns:** Array of infrequent paths

---

### `analyze_case_duration(logHandle: string): object`
Calculate case duration statistics (time from start to end).

**Parameters:**
- `logHandle` — Event log handle

**Returns:** Duration stats: `{ min, max, mean, median, stddev }`

---

### `analyze_case_attributes(logHandle: string): object`
Analyze attributes at case level.

**Parameters:**
- `logHandle` — Event log handle

**Returns:** Case-level attribute analysis

---

### `calculate_trace_durations(logHandle: string): number[]`
Calculate duration for each trace.

**Parameters:**
- `logHandle` — Event log handle

**Returns:** Array of trace durations in milliseconds

---

## Analysis — Activity & Flow

### `analyze_event_statistics(logHandle: string): object`
Analyze event-level statistics (activity frequencies, timestamps).

**Parameters:**
- `logHandle` — Event log handle

**Returns:** Statistics object with activity frequencies and distributions

**Example:**
```javascript
const stats = pm.analyze_event_statistics(logHandle);
const activities = Object.keys(stats.events);
```

---

### `analyze_activity_cooccurrence(logHandle: string): object`
Analyze which activities happen together in same case.

**Parameters:**
- `logHandle` — Event log handle

**Returns:** Co-occurrence matrix (activity pairs and joint frequencies)

---

### `analyze_activity_dependencies(logHandle: string): object`
Analyze activity dependency relationships.

**Parameters:**
- `logHandle` — Event log handle

**Returns:** Dependency graph with strength scores

---

### `analyze_activity_ordering(logHandle: string): object`
Extract activity ordering patterns.

**Parameters:**
- `logHandle` — Event log handle

**Returns:** Activity ordering relationships and frequencies

---

### `analyze_start_end_activities(logHandle: string): object`
Analyze which activities start and end traces.

**Parameters:**
- `logHandle` — Event log handle

**Returns:** Statistics on start/end activity distributions

---

### `compute_activity_transition_matrix(logHandle: string): object`
Compute activity transition matrix (co-activity flow).

**Parameters:**
- `logHandle` — Event log handle

**Returns:** 2D matrix of activity transitions

---

## Analysis — Performance & Resource

### `analyze_dotted_chart(logHandle: string): object`
Perform dotted chart analysis (event timeline by case).

**Parameters:**
- `logHandle` — Event log handle

**Returns:** Dotted chart coordinates and metadata

---

### `analyze_temporal_bottlenecks(logHandle: string): object`
Identify temporal bottlenecks (time-consuming transitions).

**Parameters:**
- `logHandle` — Event log handle

**Returns:** Bottleneck analysis with affected activities

---

### `analyze_process_speedup(logHandle: string, baselineHandle: string): object`
Analyze process speedup relative to a baseline.

**Parameters:**
- `logHandle` — Current log handle
- `baselineHandle` — Baseline log for comparison

**Returns:** Speedup metrics

---

### `analyze_resource_utilization(logHandle: string, resourceKey: string): object`
Analyze resource utilization and workload.

**Parameters:**
- `logHandle` — Event log handle
- `resourceKey` — Resource attribute key (e.g., "org:resource")

**Returns:** Resource utilization metrics (utilization %, capacity, efficiency)

---

### `analyze_resource_activity_matrix(logHandle: string, resourceKey: string): object`
Build resource-activity matrix showing who does what.

**Parameters:**
- `logHandle` — Event log handle
- `resourceKey` — Resource attribute key

**Returns:** 2D matrix of resource-activity relationships

---

### `identify_resource_bottlenecks(logHandle: string, resourceKey: string): object`
Identify resources that are bottlenecks.

**Parameters:**
- `logHandle` — Event log handle
- `resourceKey` — Resource attribute key

**Returns:** Bottleneck analysis with affected resources

---

## Analysis — Object-Centric

### `analyze_ocel_statistics(ocelHandle: string): object`
Analyze statistics from Object-Centric Event Log.

**Parameters:**
- `ocelHandle` — OCEL handle

**Returns:** OCEL statistics (object types, events, attributes)

---

### `analyze_oc_performance(ocelHandle: string): object`
Analyze performance metrics from OCEL.

**Parameters:**
- `ocelHandle` — OCEL handle

**Returns:** Performance metrics per object type

---

## Analysis — Clustering & Patterns

### `cluster_traces(logHandle: string, k: number): object`
Cluster traces using unsupervised clustering.

**Parameters:**
- `logHandle` — Event log handle
- `k` — Number of clusters

**Returns:** Cluster assignment for each trace

---

### `mine_sequential_patterns(logHandle: string, minSupport: number): object`
Mine frequent sequential activity patterns.

**Parameters:**
- `logHandle` — Event log handle
- `minSupport` — Minimum support threshold (0.0–1.0)

**Returns:** Frequent sequential patterns

---

### `compute_trace_similarity_matrix(logHandle: string): number[][]`
Compute pairwise trace similarity matrix.

**Parameters:**
- `logHandle` — Event log handle

**Returns:** 2D array of similarity scores (0–1)

---

## Analysis — Prediction & Anomaly

### `predict_next_activity(logHandle: string, prefix: string[], activityKey: string): object`
Predict next activity given a trace prefix.

**Parameters:**
- `logHandle` — Event log handle (for training data)
- `prefix` — Array of activity names in trace prefix
- `activityKey` — Activity attribute key

**Returns:** Predictions with probabilities for next activities

---

### `build_ngram_predictor(logHandle: string, ngramSize: number): string`
Build n-gram language model for activity prediction.

**Parameters:**
- `logHandle` — Event log handle
- `ngramSize` — N-gram size (2 = bigram, 3 = trigram, etc.)

**Returns:** Predictor handle

---

### `score_trace_anomaly(logHandle: string, trace: string[]): number`
Score how anomalous a single trace is (0 = normal, 1 = highly anomalous).

**Parameters:**
- `logHandle` — Event log handle (for baseline)
- `trace` — Array of activity names

**Returns:** Anomaly score (0–1)

---

### `score_trace_likelihood(logHandle: string, trace: string[]): number`
Score likelihood of a trace given the log.

**Parameters:**
- `logHandle` — Event log handle
- `trace` — Array of activity names

**Returns:** Likelihood score

---

### `score_log_anomalies(logHandle: string): object[]`
Score anomalies for all traces in log.

**Parameters:**
- `logHandle` — Event log handle

**Returns:** Array of anomaly scores (one per trace), sorted descending

---

### `detect_concept_drift(logHandle: string, windowSize: number): object`
Detect concept drift (process behavior changes over time).

**Parameters:**
- `logHandle` — Event log handle
- `windowSize` — Sliding window size (in traces)

**Returns:** Drift detection results with change points

---

### `detect_bottlenecks(logHandle: string): object`
Detect activity bottlenecks (time-consuming activities).

**Parameters:**
- `logHandle` — Event log handle

**Returns:** Bottleneck analysis with severity scores

---

### `detect_rework(logHandle: string): object`
Detect rework patterns (activities repeated in same trace).

**Parameters:**
- `logHandle` — Event log handle

**Returns:** Rework patterns and affected cases

---

## Feature Extraction

### `extract_activity_ordering(logHandle: string): object`
Extract activity ordering features.

**Parameters:**
- `logHandle` — Event log handle

**Returns:** Ordering features as JSON

---

### `extract_case_features(logHandle: string): string`
Extract features for each case (trace-level).

**Parameters:**
- `logHandle` — Event log handle

**Returns:** JSON array of feature vectors (one per trace)

---

### `extract_prefix_features(logHandle: string): string`
Extract features for each trace prefix (for remaining time prediction).

**Parameters:**
- `logHandle` — Event log handle

**Returns:** JSON array with entries for each prefix length

---

### `extract_process_skeleton(logHandle: string): object`
Extract core process skeleton (main flow without variants).

**Parameters:**
- `logHandle` — Event log handle

**Returns:** Simplified process skeleton

---

## Filters

### `filter_log_by_activity(logHandle: string, activityNames: string[]): string`
Filter log to keep only specified activities.

**Parameters:**
- `logHandle` — Event log handle
- `activityNames` — Array of activity names to keep

**Returns:** Filtered log handle

---

### `filter_log_by_trace_length(logHandle: string, minEvents: number, maxEvents: number): string`
Filter log by trace length.

**Parameters:**
- `logHandle` — Event log handle
- `minEvents` — Minimum events per trace
- `maxEvents` — Maximum events per trace

**Returns:** Filtered log handle

---

### `filter_by_case_size(logHandle: string, minSize: number, maxSize: number): string`
Filter traces by number of events.

**Parameters:**
- `logHandle` — Event log handle
- `minSize` — Minimum trace size
- `maxSize` — Maximum trace size

**Returns:** Filtered log handle

---

### `filter_by_start_activity(logHandle: string, activity: string): string`
Filter to keep only traces starting with specified activity.

**Parameters:**
- `logHandle` — Event log handle
- `activity` — Start activity name

**Returns:** Filtered log handle

---

### `filter_by_end_activity(logHandle: string, activity: string): string`
Filter to keep only traces ending with specified activity.

**Parameters:**
- `logHandle` — Event log handle
- `activity` — End activity name

**Returns:** Filtered log handle

---

### `filter_by_directly_follows(logHandle: string, fromActivity: string, toActivity: string): string`
Filter to keep only traces containing a directly-follows pair.

**Parameters:**
- `logHandle` — Event log handle
- `fromActivity` — Source activity
- `toActivity` — Target activity

**Returns:** Filtered log handle

---

### `filter_by_variant_coverage(logHandle: string, coveragePct: number): string`
Filter to keep variants that cover specified percentage of traces.

**Parameters:**
- `logHandle` — Event log handle
- `coveragePct` — Coverage percentage (e.g., 80 for top 80%)

**Returns:** Filtered log handle

---

## Export

### `export_eventlog_to_json(logHandle: string): string`
Export event log to JSON format.

**Parameters:**
- `logHandle` — Event log handle

**Returns:** JSON string

---

### `export_eventlog_to_xes(logHandle: string): string`
Export event log to XES format.

**Parameters:**
- `logHandle` — Event log handle

**Returns:** XES XML string

---

### `export_dfg_to_json(dfgHandle: string): string`
Export DFG to JSON format.

**Parameters:**
- `dfgHandle` — DFG handle (from discover_dfg)

**Returns:** JSON string

---

### `export_petri_net_to_json(netHandle: string): string`
Export Petri net to JSON format.

**Parameters:**
- `netHandle` — Petri net handle

**Returns:** JSON string

---

### `export_ocel_to_json(ocelHandle: string): string`
Export OCEL to JSON format (OCEL 1.0).

**Parameters:**
- `ocelHandle` — OCEL handle

**Returns:** JSON string

---

### `export_ocel2_to_json(ocelHandle: string): string`
Export OCEL to OCEL 2.0 JSON format.

**Parameters:**
- `ocelHandle` — OCEL handle

**Returns:** JSON string

---

### `export_features_json(handle: string): string`
Export features as JSON.

**Parameters:**
- `handle` — Feature vector handle

**Returns:** JSON string

---

### `export_features_csv(handle: string): string`
Export features as CSV.

**Parameters:**
- `handle` — Feature vector handle

**Returns:** CSV string

---

## Text Encoding

All text encoding functions convert WASM objects to readable text representations suitable for AI/LLM processing.

### `encode_dfg_as_text(dfgHandle: string): string`
Encode DFG as human-readable text.

**Parameters:**
- `dfgHandle` — DFG handle

**Returns:** Text representation

---

### `encode_petri_net_as_text(netHandle: string): string`
Encode Petri net as text.

**Parameters:**
- `netHandle` — Petri net handle

**Returns:** Text representation

---

### `encode_variants_as_text(logHandle: string): string`
Encode trace variants as text.

**Parameters:**
- `logHandle` — Event log handle

**Returns:** Text representation of variants

---

### `encode_conformance_as_text(logHandle: string, netHandle: string, activityKey: string): string`
Encode conformance metrics as text.

**Parameters:**
- `logHandle` — Event log handle
- `netHandle` — Petri net handle
- `activityKey` — Activity attribute key

**Returns:** Text representation of conformance

---

### `encode_bottlenecks_as_text(logHandle: string): string`
Encode bottleneck analysis as text.

**Parameters:**
- `logHandle` — Event log handle

**Returns:** Text representation

---

### `encode_statistics_as_text(logHandle: string): string`
Encode event statistics as text.

**Parameters:**
- `logHandle` — Event log handle

**Returns:** Text representation

---

### `encode_ocel_as_text(ocelHandle: string): string`
Encode OCEL summary as text.

**Parameters:**
- `ocelHandle` — OCEL handle

**Returns:** Text representation

---

### `encode_ocel_summary_as_text(ocelHandle: string): string`
Encode brief OCEL summary as text.

**Parameters:**
- `ocelHandle` — OCEL handle

**Returns:** Brief text summary

---

### `encode_oc_petri_net_as_text(netHandle: string): string`
Encode Object-Centric Petri Net as text.

**Parameters:**
- `netHandle` — OC Petri net handle

**Returns:** Text representation

---

### `encode_model_comparison_as_text(net1Handle: string, net2Handle: string): string`
Encode comparison of two models as text.

**Parameters:**
- `net1Handle` — First Petri net handle
- `net2Handle` — Second Petri net handle

**Returns:** Text comparison

---

## Streaming

Streaming functions allow incremental processing without loading full log into memory.

### `streaming_dfg_begin(): string`
Begin a streaming DFG discovery session.

**Returns:** Session handle

**Example:**
```javascript
const handle = pm.streaming_dfg_begin();
pm.streaming_dfg_add_event(handle, 'case-1', 'Register');
const result = JSON.parse(pm.streaming_dfg_finalize(handle));
```

---

### `streaming_dfg_add_event(handle: string, caseId: string, activity: string): void`
Add a single event to streaming DFG.

**Parameters:**
- `handle` — Session handle from streaming_dfg_begin
- `caseId` — Case identifier
- `activity` — Activity name

---

### `streaming_dfg_add_batch(handle: string, jsonBatch: string): void`
Add batch of events to streaming DFG.

**Parameters:**
- `handle` — Session handle
- `jsonBatch` — JSON array of `{ case_id, activity }` objects

---

### `streaming_dfg_close_trace(handle: string, caseId: string): void`
Close a trace (flush its buffer) in streaming session.

**Parameters:**
- `handle` — Session handle
- `caseId` — Case identifier

---

### `streaming_dfg_finalize(handle: string): string`
Finalize streaming session and return DFG.

**Parameters:**
- `handle` — Session handle

**Returns:** JSON string with `dfg_handle` to use as normal DFG

**Memory:** O(open traces), not O(total events)

---

### `streaming_dfg_snapshot(handle: string): string`
Get live DFG snapshot without finalizing session.

**Parameters:**
- `handle` — Session handle

**Returns:** JSON string of current DFG

---

### `streaming_dfg_stats(handle: string): string`
Get streaming session statistics.

**Parameters:**
- `handle` — Session handle

**Returns:** JSON with `event_count`, `trace_count`, `open_traces`, `activities`, `edge_pairs`

---

### `streaming_dfg_flush_open(handle: string): void`
Close all open traces in session.

**Parameters:**
- `handle` — Session handle

---

### `streaming_conformance_begin(): string`
Begin streaming conformance checking.

**Returns:** Session handle

---

### `streaming_conformance_add_event(handle: string, caseId: string, activity: string): void`
Add event to streaming conformance check.

**Parameters:**
- `handle` — Session handle
- `caseId` — Case identifier
- `activity` — Activity name

---

### `streaming_conformance_close_trace(handle: string, caseId: string): void`
Close trace in streaming conformance.

**Parameters:**
- `handle` — Session handle
- `caseId` — Case identifier

---

### `streaming_conformance_finalize(handle: string): string`
Finalize streaming conformance and return results.

**Parameters:**
- `handle` — Session handle

**Returns:** JSON string with conformance metrics

---

### `streaming_conformance_stats(handle: string): string`
Get streaming conformance session statistics.

**Parameters:**
- `handle` — Session handle

**Returns:** JSON stats

---

## Data Quality & Validation

### `validate_ocel(ocelHandle: string): boolean`
Validate OCEL structure and consistency.

**Parameters:**
- `ocelHandle` — OCEL handle

**Returns:** True if valid, false otherwise

---

### `validate_process_tree(treeHandle: string): boolean`
Validate process tree structure.

**Parameters:**
- `treeHandle` — Process tree handle

**Returns:** True if valid

---

### `validate_has_activities(logHandle: string): boolean`
Check if log has activities defined.

**Parameters:**
- `logHandle` — Event log handle

**Returns:** True if activities present

---

### `validate_has_timestamps(logHandle: string): boolean`
Check if log has timestamps.

**Parameters:**
- `logHandle` — Event log handle

**Returns:** True if timestamps present

---

### `infer_eventlog_schema(logHandle: string): object`
Infer schema from EventLog.

**Parameters:**
- `logHandle` — Event log handle

**Returns:** Inferred schema object

---

### `infer_ocel_schema(ocelHandle: string): object`
Infer schema from OCEL.

**Parameters:**
- `ocelHandle` — OCEL handle

**Returns:** Inferred OCEL schema

---

## Handle Management

### `delete_object(handleId: string): void`
Explicitly free a handle (memory cleanup).

**Parameters:**
- `handleId` — Handle to free

**Example:**
```javascript
pm.delete_object(logHandle);
```

---

### `clear_all_objects(): void`
Free all handles at once. All handles become invalid after this.

---

### `object_count(): number`
Get number of currently active handles.

**Returns:** Count of live handles

---

## Utility Functions

### `get_activities(logHandle: string): string[]`
Get list of unique activity names from log.

**Parameters:**
- `logHandle` — Event log handle

**Returns:** Array of activity names

---

### `get_activity_frequencies(logHandle: string): object`
Get frequency of each activity.

**Parameters:**
- `logHandle` — Event log handle

**Returns:** Object mapping activity name to frequency

---

### `get_attribute_names(logHandle: string): string[]`
Get all attribute keys present in log.

**Parameters:**
- `logHandle` — Event log handle

**Returns:** Array of attribute names (e.g., ["concept:name", "org:resource", "time:timestamp"])

---

### `get_trace_count(logHandle: string): number`
Get number of traces in log.

**Parameters:**
- `logHandle` — Event log handle

**Returns:** Trace count

---

### `get_event_count(logHandle: string): number`
Get total number of events in log.

**Parameters:**
- `logHandle` — Event log handle

**Returns:** Event count

---

### `get_trace_lengths(logHandle: string): number[]`
Get length of each trace.

**Parameters:**
- `logHandle` — Event log handle

**Returns:** Array of trace lengths

---

### `get_trace_length_statistics(logHandle: string): object`
Get statistics on trace lengths.

**Parameters:**
- `logHandle` — Event log handle

**Returns:** Stats: `{ min, max, mean, median, stddev }`

---

### `get_ocel_event_count(ocelHandle: string): number`
Get event count from OCEL.

**Parameters:**
- `ocelHandle` — OCEL handle

**Returns:** Event count

---

### `get_ocel_object_count(ocelHandle: string): number`
Get total object count from OCEL.

**Parameters:**
- `ocelHandle` — OCEL handle

**Returns:** Object count

---

### `get_ocel_type_statistics(ocelHandle: string): object`
Get statistics per object type in OCEL.

**Parameters:**
- `ocelHandle` — OCEL handle

**Returns:** Statistics by object type

---

### `list_ocel_object_types(ocelHandle: string): string[]`
List all object types in OCEL.

**Parameters:**
- `ocelHandle` — OCEL handle

**Returns:** Array of object type names

---

### `flatten_ocel_to_eventlog(ocelHandle: string): string`
Convert OCEL to traditional EventLog format.

**Parameters:**
- `ocelHandle` — OCEL handle

**Returns:** EventLog handle

---

### `compute_model_metrics(netHandle: string): object`
Compute structural metrics of a Petri net.

**Parameters:**
- `netHandle` — Petri net handle

**Returns:** Metrics object (nodes, edges, complexity)

---

### `compute_alignments(logHandle: string, netHandle: string, activityKey: string): object[]`
Compute optimal alignments between traces and model.

**Parameters:**
- `logHandle` — Event log handle
- `netHandle` — Petri net handle
- `activityKey` — Activity attribute key

**Returns:** Array of alignment objects

---

### `compute_optimal_alignments(logHandle: string, netHandle: string, activityKey: string): object[]`
Compute provably optimal alignments.

**Parameters:**
- `logHandle` — Event log handle
- `netHandle` — Petri net handle
- `activityKey` — Activity attribute key

**Returns:** Array of optimal alignment objects

---

## Metadata Functions

These functions return structured metadata about available algorithms and capabilities.

### `available_discovery_algorithms(): object`
List all compiled discovery algorithms.

**Returns:** JSON object with algorithm names and metadata

**Example:**
```javascript
const algos = JSON.parse(pm.available_discovery_algorithms());
console.log(algos); // ["dfg", "alpha++", "heuristic_miner", ...]
```

---

### `available_analysis_functions(): string`
List all analysis functions.

**Returns:** JSON string with function names

---

### `discovery_info(): object`
Get discovery module status and info.

**Returns:** Module info object

---

### `conformance_info(): string`
Get conformance module info.

**Returns:** Module info JSON

---

### `oc_conformance_info(): string`
Get Object-Centric conformance module info.

**Returns:** Module info JSON

---

### `oc_performance_info(): string`
Get Object-Centric performance analysis info.

**Returns:** Module info JSON

---

### `oc_petri_net_info(): string`
Get Object-Centric Petri Net info.

**Returns:** Module info JSON

---

### `fast_discovery_info(): string`
Get fast discovery algorithms info (A*, Hill Climbing).

**Returns:** Module info JSON

---

### `genetic_discovery_info(): string`
Get genetic algorithm info.

**Returns:** Module info JSON

---

### `ilp_discovery_info(): string`
Get ILP discovery info.

**Returns:** Module info JSON

---

### `more_discovery_info(): string`
Get more discovery algorithms info (ACO, PSO, Simulated Annealing).

**Returns:** Module info JSON

---

### `advanced_algorithms_info(): string`
Get advanced algorithms info.

**Returns:** Module info JSON

---

### `final_analytics_info(): string`
Get final analytics module info.

**Returns:** Module info JSON

---

### `streaming_info(): string`
Get streaming module info.

**Returns:** Module info JSON

---

### `xes_format_info(): string`
Get XES format parser info.

**Returns:** Module info JSON

---

### `get_io_info(): string`
Get I/O module info.

**Returns:** Module info JSON

---

## Recommendations & Registry

### `get_capability_registry(): object`
Get complete registry of all wasm4pm functions and capabilities.

**Returns:** Structured capability registry

---

### `generate_recommendations(logHandle: string, analysisType: string): object`
Generate AI recommendations based on log analysis.

**Parameters:**
- `logHandle` — Event log handle
- `analysisType` — "discovery", "conformance", "optimization", "general"

**Returns:** Recommendations object

---

### `recommendations_info(): string`
Get recommendations module info.

**Returns:** Module info JSON

---

## DECLARE & Specialized Models

### `store_declare_from_json(jsonContent: string): string`
Load DECLARE model from JSON.

**Parameters:**
- `jsonContent` — DECLARE model JSON

**Returns:** DECLARE handle

---

### `check_declare_conformance(logHandle: string, declareHandle: string, activityKey: string): object`
(See Conformance Checking section for full details)

---

---

## Performance Summary

| Algorithm | Time per 100 events | Use Case |
|-----------|-------------------|----------|
| DFG | 0.5ms | Quick overview |
| Alpha++ | 5–10ms | Balanced accuracy/speed |
| Heuristic Miner | 10–20ms | Complex loops |
| Inductive Miner | 20–50ms | Precise hierarchy |
| Genetic Algorithm | 40–200ms | Best quality |
| ILP Optimization | 20–100ms | Optimal solution |

For 10,000 event logs, multiply times by ~100.

---

## Error Handling

All functions return `Result<T, JsValue>` and throw JavaScript errors on failure:

```javascript
try {
  const logHandle = pm.load_eventlog_from_xes(maybeInvalidXes);
  const net = pm.discover_alpha_plus_plus(logHandle, 0.1);
} catch (err) {
  console.error('Mining failed:', err.message);
  // Common errors:
  // "Object not found" — stale/invalid handle
  // "Failed to parse input data" — malformed XES/JSON
  // "Memory allocation failed" — WASM heap exhausted
}
```

---

## See Also

- **[ALGORITHMS.md](ALGORITHMS.md)** — Detailed algorithm descriptions and selection guide
- **[HOW-TO.md](HOW-TO.md)** — Task-oriented recipes and examples
- **[QUICKSTART.md](QUICKSTART.md)** — 5-minute getting started guide
- **[TUTORIAL.md](TUTORIAL.md)** — Real-world examples and workflows
