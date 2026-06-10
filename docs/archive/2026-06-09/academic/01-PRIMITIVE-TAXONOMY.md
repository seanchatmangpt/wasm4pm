# wasm4pm Algorithm Primitive Taxonomy

**Version:** 1.0  
**Source:** `packages/kernel/src/registry.ts` (canonical algorithm registry)  
**Total registered algorithms:** 62  
**Families:** 16  

This document classifies every algorithm registered in the wasm4pm kernel registry into formal academic
families, describes lineage relationships within each family, and identifies singletons that do not
belong to a clear algorithmic lineage.

---

## Table of Contents

1. [Alpha / Footprint Discovery](#1-alpha--footprint-discovery)
2. [Inductive Mining](#2-inductive-mining)
3. [Heuristic Mining](#3-heuristic-mining)
4. [ILP / Region-Based Discovery](#4-ilp--region-based-discovery)
5. [Genetic / Evolutionary Discovery](#5-genetic--evolutionary-discovery)
6. [A* / Alignment Search](#6-a--alignment-search)
7. [Token Replay Conformance](#7-token-replay-conformance)
8. [ET Conformance / Precision](#8-et-conformance--precision)
9. [Declare / LTL Constraints](#9-declare--ltl-constraints)
10. [Object-Centric Mining (OCEL)](#10-object-centric-mining-ocel)
11. [Standards: Import / Export](#11-standards-import--export)
12. [POWL / Process Trees / WF-Nets](#12-powl--process-trees--wf-nets)
13. [Prediction / Drift / ML](#13-prediction--drift--ml)
14. [Social Network Mining](#14-social-network-mining)
15. [Simulation / Playout](#15-simulation--playout)
16. [Streaming / Engineering](#16-streaming--engineering)

---

## 1. Alpha / Footprint Discovery

**Algorithms:** `alpha_plus_plus`, `causal_graph`

### Lineage

The Alpha family originates with van der Aalst et al. (2004) *"Workflow Mining: Discovering Process
Models from Event Logs"*. The core Alpha miner constructs a Petri net from a footprint matrix of
directly-follows and causality relations derived from event log traces.

```
Alpha miner (van der Aalst 2004)
  └── Alpha+ (van der Aalst 2004)      — handles length-1 loops
        └── Alpha++ (Wen et al. 2007)  — handles length-2 loops and parallel short loops
              └── alpha_plus_plus      — wasm4pm: extends to Alpha+++ with configurable
                                         causal_threshold and min_support
```

`causal_graph` is a hybrid that dispatches to either an alpha-style or heuristic-style causal
dependency computation, selected via the `method` parameter (`'alpha'` | `'heuristic'`).  Its alpha
mode shares the footprint-matrix representation with the Alpha family.

### Formal Characterisation

- **Input:** flat XES event log handle
- **Output:** Petri net (alpha_plus_plus), DFG (causal_graph)
- **Foundation:** Footprint matrix; causality relation `a → b` iff `a >_L b ∧ b ≯_L a`
- **Known limitation:** Alpha family cannot discover non-free-choice constructs or non-local
  dependencies; superseded by ILP and Inductive Mining for complex logs.

---

## 2. Inductive Mining

**Algorithms:** `inductive_miner`

### Lineage

Inductive Mining (Leemans et al. 2013–2019) is a family of algorithms based on recursive log
splitting via process-tree cut operators. Each variant extends the base algorithm with stronger
noise-handling guarantees.

```
Inductive Miner basic / IM  (Leemans et al. 2013)
  └── Inductive Miner Incompleteness / IMi (Leemans et al. 2013)
        └── Inductive Miner infrequent / IMf (Leemans et al. 2014) — noise_threshold parameter
              └── IMd / IMlc (2016–2019) — data-aware and lifecycle variants
                    └── inductive_miner — wasm4pm: IM-basic + IMf noise filtering
                                          (noise_threshold configurable, default 0.2)
```

### Formal Characterisation

- **Input:** flat XES event log handle
- **Output:** process tree (`tree`)
- **Cuts:** XOR (×), Sequence (→), Parallel (∧), Loop (↺)
- **Soundness guarantee:** Every process tree produced by IM is sound (deadlock-free, liveness,
  bounded) by construction, a property not shared by most other discovery families.
- **Complexity:** O(n log n) — polynomial recursive partitioning

---

## 3. Heuristic Mining

**Algorithms:** `heuristic_miner`, `correlation_miner`, `hill_climbing`

### Lineage

The Heuristic Miner (Weijters & van der Aalst 2003; Weijters et al. 2006) extends the basic
DFG with dependency ratios and thresholding to handle noise and infrequent behaviour.

```
Flexible Heuristic Miner / HM (Weijters & van der Aalst 2003)
  └── Heuristics Miner v3 (Weijters et al. 2006) — dependency_threshold parameter
        └── heuristic_miner — wasm4pm: dependency_threshold ∈ [0,1], default 0.5
```

`correlation_miner` (Dambekodi et al.) operates without case identifiers, using timestamp
correlations between events to infer a DFG structure. It shares the "mine without case notion"
philosophy of the Flexible Heuristic Miner's caseless variant.

`hill_climbing` applies a greedy local-search metaheuristic over a DFG neighbourhood; it is in the
heuristic family by virtue of using dependency scores as a fitness landscape for local improvement.

### Formal Characterisation

- **Input:** flat XES event log handle
- **Output:** DFG (heuristic_miner, correlation_miner, hill_climbing)
- **Key parameter:** `dependency_threshold` — controls noise filtering; values ≥ 0.5 are recommended
  for real-world noisy logs; default 0.5 (heuristic_miner), 0.5 (causal_graph heuristic mode)
- **correlation_miner only:** requires no case ID; operates solely on timestamps and activity names

---

## 4. ILP / Region-Based Discovery

**Algorithms:** `ilp`, `optimized_dfg`

### Lineage

Region-based discovery (van der Aalst et al. 2008; Cortadella et al.) treats Petri net place
discovery as a set-covering problem. Integer Linear Programming (ILP) formulates place candidates
as regions of the state space and selects a minimal covering set.

```
Region theory / Language-based Petri net synthesis (Cortadella 1995)
  └── ILP Miner (van der Aalst et al. 2008)
        └── ilp — wasm4pm: causal place candidates (1-to-1, AND-splits, AND-joins)
                  validated by token replay, greedy minimisation; NP-Hard
```

`optimized_dfg` is the ILP family's DFG projection: it applies an ILP solver to remove redundant
edges from a DFG, producing the minimal directly-follows structure with best token-replay fitness.

```
ilp (Petri net, full ILP)
  └── optimized_dfg (DFG projection of ILP-minimised graph)
```

### Formal Characterisation

- **Input:** flat XES event log handle
- **Output:** Petri net (ilp), DFG (optimized_dfg)
- **Complexity:** NP-Hard (both); timeout parameter guards the solver
- **Quality:** Highest precision among all discovery families; not robust to noise
- **Academic guarantee:** ILP-discovered Petri nets are sound when the ILP feasibility conditions hold

---

## 5. Genetic / Evolutionary Discovery

**Algorithms:** `genetic_algorithm`, `pso`, `aco`, `simulated_annealing`

### Lineage

Evolutionary / swarm-intelligence approaches (van der Aalst et al. 2005; Bratosin et al.) encode
process models as chromosomes or particles and evolve a population toward a fitness function
combining fitness, precision, and simplicity.

```
Genetic Process Mining (van der Aalst et al. 2005)
  └── genetic_algorithm — wasm4pm: population-based evolution, population_size + generations params

Bio-inspired swarm variants (parallel lineage):
  └── Particle Swarm Optimisation / PSO (Kennedy & Eberhart 1995 → applied to PM)
        └── pso — wasm4pm: swarm_size + iterations params

  └── Ant Colony Optimisation / ACO (Dorigo 1992 → applied to PM)
        └── aco — wasm4pm: colony_size + iterations params

  └── Simulated Annealing (Kirkpatrick 1983 → applied to PM)
        └── simulated_annealing — wasm4pm: initial_temperature + cooling_rate params
```

All four output DFG (not Petri net — corrected in Phase 4 audit).

### Formal Characterisation

- **Input:** flat XES event log handle
- **Output:** DFG (all four; note: Petri net outputs pending upstream Rust fix)
- **Complexity:** Exponential (all four)
- **Fitness function:** multi-objective — fitness, precision, simplicity tradeoff
- **Stochastic:** all four use seeded RNG (`StdRng::seed_from_u64(42)`) for determinism

---

## 6. A* / Alignment Search

**Algorithms:** `alignments`, `a_star`

### Lineage

Optimal alignment computation (van der Aalst et al. 2012; Adriansyah et al. 2014) defines
conformance as the edit distance between a log trace and the closest model run. A* search finds
the optimal alignment with cost-weighted synchronous, log-only, and model-only moves.

```
A* Optimal Alignment (van der Aalst / Adriansyah 2012–2014)
  └── alignments — wasm4pm: exact conformance via A* search over synchronous product net
                   Cost parameters: sync_cost=0, log_move_cost=1, model_move_cost=1

A*-style heuristic discovery (parallel adaptation):
  └── a_star — wasm4pm: process discovery via A* search over model space
               max_iterations parameter; outputs DFG
```

`alignments` is the canonical conformance-checking primitive; `a_star` adapts the search strategy
to process discovery rather than conformance.

### Formal Characterisation

- **alignments input:** Petri net handle + event log handle
- **a_star input:** flat XES event log handle
- **Output:** analytics (alignment costs, conformance metrics) / DFG
- **Complexity:** NP-Hard (alignments); Exponential (a_star discovery)
- **Quality:** alignments — quality tier 90 (highest conformance accuracy); a_star — 70

---

## 7. Token Replay Conformance

**Algorithms:** `generalization`

### Lineage

Token-based replay (van der Aalst 2011; Rozinat & van der Aalst 2008) simulates each log trace
against a Petri net, counting produced, consumed, missing, and remaining tokens.
`fitness = 1 − (missing + remaining) / (produced + consumed)`.

```
Token Replay Fitness (Rozinat & van der Aalst 2008)
  └── Generalisation metric (van der Aalst 2011) — measures how general a model is
        └── generalization — wasm4pm: takes petri_net_handle, measures overfitting avoidance
```

Note: token replay fitness is also embedded inside `ilp` (for candidate validation) and
`etconformance_precision`. The standalone `generalization` algorithm is the only registry entry
in this family that operates purely as a token-replay-based quality metric.

### Formal Characterisation

- **Input:** Petri net handle
- **Output:** analytics (generalisation score 0–1)
- **Complexity:** O(n²)
- **Relation to fitness:** fitness measures replay coverage; generalisation measures how much of
  the model's behaviour is not covered by the log (model underfit detection)

---

## 8. ET Conformance / Precision

**Algorithms:** `etconformance_precision`

### Lineage

ETConformance (Muñoz-Gama & Carmona 2010) measures precision via escaping edges in the
state-space of the model relative to the log. Unlike token replay, it identifies where the model
allows behaviour not observed in the log.

```
ETConformance / Escaping Edges Precision (Muñoz-Gama & Carmona 2010)
  └── etconformance_precision — wasm4pm: escaping-edge precision measure
                                 Input: petri_net_handle
                                 Complexity: O(n²)
```

### Formal Characterisation

- **Input:** Petri net handle
- **Output:** analytics (precision score 0–1)
- **Interpretation:** precision = 1 − (escaping_edges / total_edges); lower values indicate
  the model allows excessive behaviour beyond what the log shows

---

## 9. Declare / LTL Constraints

**Algorithms:** `declare`, `ocel_oc_declare`

### Lineage

Declare (Pesic & van der Aalst 2006; Maggi et al. 2011) is a declarative process modelling
language based on Linear Temporal Logic (LTL) constraints. It is suited to highly flexible
processes where prescriptive Petri nets over-constrain behaviour.

```
ConDec / Declare (Pesic & van der Aalst 2006)
  └── Declare with data (Maggi et al. 2011) — support thresholds, data conditions
        └── declare — wasm4pm: support_threshold parameter; discovers constraint templates
                       (Existence, Absence, Precedence, Response, etc.)

Object-Centric extension:
  └── OC-Declare — temporal constraints across OCEL object types
        └── ocel_oc_declare — wasm4pm: noise_threshold parameter; requires feature-ocel
```

`ocel_oc_declare` extends classical Declare to the object-centric paradigm, discovering
cross-object-type temporal constraints from OCEL handles.

### Formal Characterisation

- **declare input:** flat XES event log handle
- **ocel_oc_declare input:** OCEL handle (feature-ocel required)
- **Output:** declare constraint model
- **Complexity:** O(n²) (both)
- **LTL basis:** constraints are expressible as LTL formulae over finite traces

---

## 10. Object-Centric Mining (OCEL)

**Algorithms:** `ocel_dfg`, `ocel_dfg_per_type`, `ocel_petri_net`, `ocel_encode`, `ocel_ocla`, `ocel_oc_declare`

> Note: `ocel_oc_declare` is also classified under family 9 (Declare / LTL Constraints). It appears
> in both families by virtue of combining the object-centric input model with Declare output.

### Lineage

Object-Centric Process Mining (van der Aalst 2019; Berti & van der Aalst 2021) generalises
classical process mining by removing the single-case-notion restriction. Events relate to multiple
objects of multiple types simultaneously, captured in OCEL 2.0 format.

```
Object-Centric Process Mining (van der Aalst 2019)
  └── OC-DFG (Berti & van der Aalst 2020) — per-object-type directly-follows graphs
        └── ocel_dfg         — wasm4pm: aggregate OC-DFG across all object types
        └── ocel_dfg_per_type — wasm4pm: canonical per-type OC-DFG projection (map: type → DFG)

  └── OC-Petri Net (van der Aalst & Berti 2020)
        └── ocel_petri_net   — wasm4pm: OC-Petri net discovery; algorithm param selects
                               variant: 'inductive' | 'alpha' | 'heuristic'

  └── OCLA — Object-Centric Language Abstraction
        └── ocel_ocla        — wasm4pm: language abstraction per object type and interactions

  └── Encoding utilities
        └── ocel_encode      — wasm4pm: compact text encoding for LLM / diff display

  └── OC-Declare (cross-object-type constraints)
        └── ocel_oc_declare  — wasm4pm: Declare constraints from OCEL (see family 9)
```

All OCEL algorithms require `feature-ocel` (fog and browser deployment profiles only) and accept
OCEL handles (loaded via `load_ocel_from_json`), not XES handles.

### Formal Characterisation

- **Input:** OCEL handle (all algorithms in this family)
- **Output:** DFG, Petri net, Declare, analytics
- **Deployment constraint:** fog, browser profiles only (`feature-ocel`)
- **OCEL 2.0 reference:** [ocel-standard.org](https://www.oceg.org/ocel)

---

## 11. Standards: Import / Export

**Algorithms:** `pnml_import`, `bpmn_import`, `yawl_export`

### Lineage

These algorithms implement interoperability with process modelling standards. They translate between
the wasm4pm internal representation (POWL / process tree / Petri net) and external formats.

```
PNML (ISO/IEC 15909-2) — Petri Net Markup Language
  └── pnml_import — wasm4pm: parses PNML XML → Petri net handle

BPMN 2.0 (OMG standard)
  └── bpmn_import — wasm4pm: parses BPMN 2.0 XML → POWL (tree output)
                    Converts BPMN flow elements to POWL operators

YAWL v6 (Yet Another Workflow Language — van der Aalst & ter Hofstede 2003)
  └── yawl_export — wasm4pm: serialises POWL model → YAWL v6 XML format
```

### Formal Characterisation

- **pnml_import:** input PNML XML string → output Petri net handle; O(n²)
- **bpmn_import:** input BPMN 2.0 XML string → output POWL tree; O(n²)
- **yawl_export:** input POWL handle → output YAWL v6 XML; O(n)
- **All three** available in balanced, quality, and stream deployment profiles
- **Note:** XES import/export is handled at the engine level (`load_eventlog_from_xes`), not as
  a registry algorithm.

---

## 12. POWL / Process Trees / WF-Nets

**Algorithms:** `powl_to_process_tree`, `complexity_metrics`, `transition_system`, `log_to_trie`

### Lineage

Partially-Ordered Workflow Language (POWL; Kourani & Ghahfarokhi 2023) extends process trees with
partial orders, enabling representation of concurrent, non-sequential behaviour that process trees
cannot express compactly.

```
Process Trees (Leemans 2013 — from Inductive Miner output)
  └── POWL — Partially-Ordered Workflow Language (Kourani & Ghahfarokhi 2023)
        └── powl_to_process_tree — wasm4pm: converts POWL back to process tree; O(n)
        └── complexity_metrics   — wasm4pm: structural complexity of a POWL model
                                    (node count, depth, branching factor); O(n)

WF-nets (Workflow Petri nets — van der Aalst 1998):
  └── transition_system — wasm4pm: state machine / labelled transition system
                           Sliding window approach; O(n²)
                           Related to WF-net state-space analysis

Prefix structures:
  └── log_to_trie — wasm4pm: prefix tree (trie) from log variants; O(n)
                    Used for prefix-based conformance and prediction
```

### Formal Characterisation

- **powl_to_process_tree:** input POWL handle → output process tree; O(n)
- **complexity_metrics:** input POWL handle → output analytics; O(n)
- **transition_system:** input XES handle → output DFG (transition system); O(n²)
- **log_to_trie:** input XES handle → output DFG (prefix tree); O(n)
- **Note:** POWL feature is browser-only (`feature-powl`)

---

## 13. Prediction / Drift / ML

**Algorithms:** `predict_next_activity`, `predict_remaining_time`, `predict_outcome`, `detect_drift`, `compute_ewma`, `ml_classify`, `ml_cluster`, `ml_forecast`, `ml_anomaly`, `ml_regress`, `ml_pca`, `automl_classify`, `automl_forecast`, `analyze_variant_complexity`, `compute_activity_transition_matrix`, `compute_trace_similarity_matrix`, `analyze_process_speedup`

### Lineage

This family spans predictive process monitoring (Maggi et al. 2014; Teinemaa et al. 2019) and
machine learning–based process analysis.

#### Predictive Process Monitoring Sub-family

```
Predictive Process Monitoring (Maggi et al. 2014; Teinemaa et al. 2019)
  └── Next Activity Prediction — n-gram / Markov chain models
        └── predict_next_activity   — wasm4pm: n-gram order 2–5, build_ngram_predictor()

  └── Remaining Time Prediction — survival analysis, Weibull distribution
        └── predict_remaining_time  — wasm4pm: Weibull buckets, build_remaining_time_model()

  └── Outcome Prediction — anomaly scoring against DFG model
        └── predict_outcome         — wasm4pm: score_anomaly() + boundary coverage analysis
```

#### Concept Drift Detection Sub-family

```
Process Drift Detection (Bose et al. 2011; Maaradji et al. 2015)
  └── detect_drift — wasm4pm: sliding-window activity distribution comparison; O(n)
  └── compute_ewma — wasm4pm: Exponentially Weighted Moving Average signal smoothing; O(n)
```

#### ML Analysis Sub-family (@wasm4pm/ml package)

```
Trace Classification
  └── ml_classify     — k-NN, logistic regression, decision tree, naive Bayes; O(n²)
  └── automl_classify — auto-optimised RF/XGB; O(n log n)

Trace Clustering
  └── ml_cluster      — k-means, DBSCAN; O(n²)

Forecasting
  └── ml_forecast     — linear, autocorrelation-seasonal, exponential; O(n)
  └── automl_forecast — auto-optimised time-series model; O(n)

Anomaly Detection
  └── ml_anomaly      — peak finding + seasonal decomposition on drift distances; O(n log n)

Regression
  └── ml_regress      — linear / polynomial / exponential regression on trace features; O(n)

Dimensionality Reduction
  └── ml_pca          — Principal Component Analysis (Jacobi eigendecomposition); O(n³)
```

#### Advanced Analytics Sub-family

```
Structural Analysis
  └── analyze_variant_complexity        — variant entropy and diversity; O(n)
  └── compute_activity_transition_matrix — Markov chain transition matrix; O(n²)
  └── compute_trace_similarity_matrix   — pairwise Levenshtein similarity; O(n²)
  └── analyze_process_speedup           — timestamp-delta acceleration/deceleration; O(n)
```

### Formal Characterisation

- **Input format:** majority take flat XES handles; `ml_*` and `automl_*` use case-feature vectors
  extracted by `extract_case_features()`
- **Output type:** `ml_result` (ml_* family), `analytics` (predict_*, detect_drift, analyze_*)
- **Deployment:** balanced and quality profiles (fog + browser)

---

## 14. Social Network Mining

**Algorithms:** `handover_network`, `working_together_network`

### Lineage

Social Network Mining (van der Aalst et al. 2005) analyses the organisational perspective of
process logs, capturing how resources interact rather than how activities sequence.

```
Social Network Mining (van der Aalst et al. 2005)
  └── Handover-of-Work network — resource pairs on sequential handoffs
        └── handover_network         — wasm4pm: edge weight = direct handover count
                                        WASM export: discover_handover_network(log, resource_key)

  └── Working-Together network — resources co-occurring in same case
        └── working_together_network — wasm4pm: edges = co-case resource pairs
                                        WASM export: discover_working_together_network(log, resource_key)
```

Both algorithms were previously unreachable dead WASM exports; they were promoted to first-class
registry members to cover the van der Aalst organisational perspective.

### Formal Characterisation

- **Input:** flat XES event log handle + `resource_key` parameter (e.g., `org:resource`)
- **Output:** analytics (weighted graph; JSON adjacency list)
- **Complexity:** O(n²)
- **Perspective:** organisational (resource) — one of van der Aalst's four core PM perspectives

---

## 15. Simulation / Playout

**Algorithms:** `playout`, `monte_carlo_simulation`

### Lineage

Simulation and stochastic playout are used to generate synthetic logs from discovered models,
enabling conformance testing, coverage analysis, and what-if scenarios.

```
Process Tree Playout (van der Aalst 2011 — synthetic log generation)
  └── playout                — wasm4pm: DFG/process tree playout; num_traces + max_trace_length

Monte Carlo Simulation (stochastic process simulation)
  └── monte_carlo_simulation — wasm4pm: stochastic replay, inter-arrival times, Poisson process
                               num_cases, inter_arrival_mean_ms, simulation_time_ms, random_seed
```

### Formal Characterisation

- **playout input:** process tree or DFG handle
- **monte_carlo_simulation input:** event log handle (model_handle); optional POWL handle
- **Output:** analytics (generated traces / simulation statistics)
- **Complexity:** O(n²) (both)
- **Determinism:** `monte_carlo_simulation` accepts `random_seed` for reproducibility;
  `playout` uses fastrand (unseeded — known non-determinism issue; see DETERMINISM_AUDIT.md)

---

## 16. Streaming / Engineering

**Algorithms:** `dfg`, `simd_streaming_dfg`, `hierarchical_dfg`, `streaming_log`, `smart_engine`, `process_skeleton`

### Lineage

Engineering-first algorithms optimise for throughput, memory efficiency, and real-time processing
rather than model quality. They form the streaming and systems layer of wasm4pm.

```
Basic DFG (O(n), single-pass):
  └── dfg              — wasm4pm: standard directly-follows graph; speed tier 5
  └── process_skeleton — wasm4pm: minimal start/end skeleton; speed tier 3 (fastest non-SIMD)

SIMD-Accelerated Streaming:
  └── simd_streaming_dfg — wasm4pm: vectorised event processing; ~500x faster than dfg
                            Speed tier 1 (absolute fastest); requires feature-streaming-full

Divide-and-Conquer / Hierarchical:
  └── hierarchical_dfg — wasm4pm: chunked processing for 100B+ event logs; chunk_size param
                          Bounded memory; O(n) complexity

Probabilistic Streaming:
  └── streaming_log    — wasm4pm: stateful handle-based API; probabilistic structures
                          (Count-Min sketch, HyperLogLog); error_rate param
                          create → add_trace → estimate_dfg → free lifecycle

Adaptive Engine:
  └── smart_engine     — wasm4pm: caching + early termination + adaptive algorithm selection
                          Dispatches to optimal algorithm based on log characteristics
```

### Formal Characterisation

- **All:** accept flat XES event log handle (except `streaming_log` which has lifecycle API)
- **Output:** DFG (all); analytics (streaming_log)
- **Complexity:** O(n) (all)
- **Profile coverage:** fast, stream (all); balanced and quality (dfg, hierarchical_dfg, smart_engine)
- **Deployment:** mobile and IoT profiles include all streaming algorithms

---

## Singleton Algorithms (No Clear Single Family)

The following algorithms are classified into the nearest family above but are architectural
singletons — they do not have sibling algorithms in the registry that share the same formal lineage:

| Algorithm ID | Assigned Family | Singleton Reason |
|---|---|---|
| `process_skeleton` | Streaming / Engineering | No "skeleton miner" academic lineage; engineering heuristic |
| `correlation_miner` | Heuristic Mining | Caseless DFG mining; no academic siblings in registry |
| `smart_engine` | Streaming / Engineering | Meta-algorithm (dispatcher); no academic origin |
| `agentic_pipeline` | (none — see note) | End-to-end RL pipeline; not a PM algorithm proper |
| `transition_system` | POWL / WF-Nets | State machine discovery; closest to WF-net analysis |
| `log_to_trie` | POWL / WF-Nets | Prefix tree; purely structural, no discovery lineage |
| `performance_spectrum` | (none — analytics) | Time perspective utility; no discovery family |
| `batches` | (none — analytics) | Batch detection heuristic; organisational variant |
| `generalization` | Token Replay Conformance | Only quality-metric entry in token-replay family |
| `complexity_metrics` | POWL / Process Trees | Structural metric; no discovery purpose |
| `compute_ewma` | Prediction / Drift | Pure signal-processing primitive; no PM lineage |
| `analyze_process_speedup` | Prediction / ML | Temporal analytics; no PM family |
| `compute_activity_transition_matrix` | Prediction / ML | Markov utility; could be own family |
| `compute_trace_similarity_matrix` | Prediction / ML | Edit-distance matrix; no family siblings |
| `analyze_variant_complexity` | Prediction / ML | Entropy metric; analytics utility |
| `ocel_encode` | Object-Centric | Serialisation utility, not a mining algorithm |
| `ocel_ocla` | Object-Centric | OCLA is a nascent family with no other registry member |

> **Note on `agentic_pipeline`:** This algorithm (`run_agentic_pipeline`, requires `feature-cloud`)
> encapsulates a full RL/Bellman policy pipeline (perception → decision → protection → optimisation).
> It is not a process mining algorithm in the van der Aalst sense; it is included in the registry
> for execution profile routing. It is not assigned to any academic family.

---

## Summary Table

| # | Family Name | Algorithm IDs | Count |
|---|---|---|---|
| 1 | Alpha / Footprint Discovery | `alpha_plus_plus`, `causal_graph` | 2 |
| 2 | Inductive Mining | `inductive_miner` | 1 |
| 3 | Heuristic Mining | `heuristic_miner`, `correlation_miner`, `hill_climbing` | 3 |
| 4 | ILP / Region-Based Discovery | `ilp`, `optimized_dfg` | 2 |
| 5 | Genetic / Evolutionary Discovery | `genetic_algorithm`, `pso`, `aco`, `simulated_annealing` | 4 |
| 6 | A* / Alignment Search | `alignments`, `a_star` | 2 |
| 7 | Token Replay Conformance | `generalization` | 1 |
| 8 | ET Conformance / Precision | `etconformance_precision` | 1 |
| 9 | Declare / LTL Constraints | `declare`, `ocel_oc_declare` | 2 |
| 10 | Object-Centric Mining (OCEL) | `ocel_dfg`, `ocel_dfg_per_type`, `ocel_petri_net`, `ocel_encode`, `ocel_ocla`, `ocel_oc_declare` | 6 |
| 11 | Standards: Import / Export | `pnml_import`, `bpmn_import`, `yawl_export` | 3 |
| 12 | POWL / Process Trees / WF-Nets | `powl_to_process_tree`, `complexity_metrics`, `transition_system`, `log_to_trie` | 4 |
| 13 | Prediction / Drift / ML | `predict_next_activity`, `predict_remaining_time`, `predict_outcome`, `detect_drift`, `compute_ewma`, `ml_classify`, `ml_cluster`, `ml_forecast`, `ml_anomaly`, `ml_regress`, `ml_pca`, `automl_classify`, `automl_forecast`, `analyze_variant_complexity`, `compute_activity_transition_matrix`, `compute_trace_similarity_matrix`, `analyze_process_speedup` | 17 |
| 14 | Social Network Mining | `handover_network`, `working_together_network` | 2 |
| 15 | Simulation / Playout | `playout`, `monte_carlo_simulation` | 2 |
| 16 | Streaming / Engineering | `dfg`, `simd_streaming_dfg`, `hierarchical_dfg`, `streaming_log`, `smart_engine`, `process_skeleton` | 6 |

**Total:** 62 registered algorithms across 16 families.

`ocel_oc_declare` appears in both family 9 (Declare) and family 10 (OCEL); it is counted once in
family 10. Singletons without a natural family are placed in their nearest academic neighbour.

---

## Cross-Family Lineage Relationships

The diagram below shows the top-level relationships between families as each builds on or presupposes the other:

```
Event Log (XES / OCEL)
    │
    ├── Discovery Families (1–5, 12, 16)
    │       │
    │       ├── DFG / Petri net / Process tree / POWL outputs
    │       │
    │       └── Conformance Families (6–8) ← consume model + log
    │               │
    │               └── Quality metrics: fitness, precision, generalization
    │
    ├── Constraint Family (9) ── declarative models (Declare / LTL)
    │
    ├── Object-Centric Family (10) ── OCEL input; OC-DFG / OC-Petri / OCLA outputs
    │       │
    │       └── Subsumes Declare (9) for OCEL variant
    │
    ├── Standards Family (11) ── format translation (PNML, BPMN, YAWL)
    │
    ├── Prediction / ML Family (13) ── extract features → predict / detect drift
    │
    ├── Social Network Family (14) ── resource perspective (organisational)
    │
    └── Simulation Family (15) ── model → synthetic log generation
```

---

*Document generated from registry.ts — regenerate whenever algorithms are added, removed, or reclassified.*
