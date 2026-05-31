# ACADEMIC COVERAGE — wasm4pm

> Academic coverage means the repo can answer:
> 1. What paper says this object should exist?
> 2. Where is that object implemented, executed, refused, reachable, and receipted?

**Gate:** ACADEMIC-COVERAGE-001  
**Status:** partial  
**Last reviewed:** 2026-05-30  
**Algorithm count:** 60  
**Primitive count:** 10

---

## Gate Criteria

ALIVE only when ALL of:
1. Every registered algorithm is classified
2. Every primitive doc has paper grounding or honest non-paper classification
3. Every `direct` citation maps to a named formal object
4. Every formal object maps to implementation files
5. Every implementation has positive and negative proof surfaces
6. Every reachable claim maps to WASM / CLI / registry / docs
7. Every `future` item is explicitly marked `future`

---

## Coverage Summary

### By coverage_kind

| coverage_kind | count |
|---|---|
| direct | 18 |
| derived | 16 |
| engineering | 23 |
| consumer-contract | 3 |
| future | 0 |

> ⚠️ **Note:** counts are from `docs/academic_coverage.toml` (Python tomllib validated, authoritative).
> Earlier rendering agents miscounted — always use the TOML as ground truth.

### By category (algorithms only)

| category | direct | derived | engineering | consumer-contract | total |
|---|---|---|---|---|---|
| discovery | 7 | 9 | 6 | 0 | 22 |
| conformance | 4 | 0 | 0 | 0 | 4 |
| ocel | 4 | 1 | 1 | 0 | 6 |
| powl / wf-net | 1 | 0 | 0 | 3 | 4 |
| ml | 0 | 0 | 9 | 0 | 9 |
| social | 2 | 0 | 0 | 0 | 2 |
| streaming | 0 | 3 | 7 | 0 | 10 |
| prediction | 0 | 3 | 0 | 0 | 3 |
| **total** | **18** | **16** | **23** | **3** | **60** |

---

## Two Questions Per Algorithm

The strongest academic coverage answers both:

- *What paper says this object should exist?* → `formal_object` + `papers[]`
- *Where is it implemented, executed, refused, reachable, receipted?* → `implementation[]` + `reachable_surface[]` + `negative_tests[]`

---

## Coverage by Category

### Discovery Algorithms — Classic

| id | formal_object | coverage_kind | primary paper(s) | reachable as | known_limits |
|---|---|---|---|---|---|
| **dfg** | **Directly-Follows Graph: nodes = activities, edges = directly-follows relations with frequency** | direct | van_der_aalst_process_mining_2016 | WASM, CLI, registry | DFG is not a Petri net — does not guarantee soundness |
| process_skeleton | Minimal DFG skeleton retaining only start/end activities and backbone transitions | derived | van_der_aalst_process_mining_2016 | WASM, CLI, registry | Derived by filtering dfg; no canonical paper defines 'process skeleton' as named primitive |
| **alpha_plus_plus** | **Alpha+++ algorithm: Petri net discovery handling length-1/length-2 loops and parallel short-loop pairs** | direct | van_der_aalst_et_al_alpha_miner_2004, de_medeiros_et_al_alpha_pp_2004 | WASM, CLI, registry | Sensitive to noise; no noise filtering built in |
| **heuristic_miner** | **Heuristic Miner: dependency graph discovery via frequency and dependency ratios** | direct | weijters_van_der_aalst_heuristics_miner_2003 | WASM, CLI, registry | — |
| **inductive_miner** | **Inductive Miner: recursive cut-based process tree discovery (XOR, Sequence, Parallel, Loop cuts)** | direct | leemans_discovering_block_structured_2013 | WASM, CLI, registry | — |
| genetic_algorithm | Genetic process discovery: evolutionary search over DFG candidate space | derived | medeiros_et_al_genetic_process_mining_2004 | WASM, CLI, registry | Returns DFG (not Petri net) — Phase 4 audit correction; hardcoded seed=42, not configurable by caller |
| pso | Particle Swarm Optimisation adapted for DFG discovery | *engineering* | — | WASM, CLI, registry | Returns DFG (not Petri net) — Phase 4 audit correction; no canonical PM paper for PSO applied to process discovery |
| aco | Ant Colony Optimisation adapted for DFG discovery | derived | medeiros_et_al_genetic_process_mining_2004 | WASM, CLI, registry | Returns DFG (not Petri net) — Phase 4 audit correction; two separate ACO implementations (discover_ant_colony and discover_aco_algorithm) |
| simulated_annealing | Simulated Annealing for DFG discovery (probabilistic neighbourhood search) | derived | van_der_aalst_process_mining_2016 | WASM, CLI, registry | Returns DFG (not Petri net) — Phase 4 audit correction |
| a_star | A* heuristic search applied to DFG discovery | derived | adriansyah_aligning_observed_2014 | WASM, CLI, registry | Returns DFG (not Petri net) — Phase 4 audit correction; A* applied to discovery, not alignment |
| hill_climbing | Greedy local search (hill climbing) over DFG candidate space | derived | van_der_aalst_process_mining_2016 | WASM, CLI, registry | Returns DFG (not Petri net) — Phase 4 audit correction |
| **declare** | **Declare: constraint-based (LTL) declarative process model discovery** | direct | pesic_et_al_declare_2007 | WASM, CLI, registry | — |
| optimized_dfg | ILP-optimised DFG: minimal DFG with best token-replay fitness via ILP pruning | *engineering* | — | WASM, CLI, registry | Engineering optimisation of DFG; no separate paper defines 'optimized DFG' as formal primitive |
| **ilp** | **Region-based ILP miner: discovers Petri net places via causal region enumeration and token-replay validation** | direct | van_der_aalst_et_al_ilp_miner_2012 | WASM, CLI, registry | NP-Hard for large logs — bounded by solver timeout |

### Discovery Algorithms — Streaming / Engineering

| id | formal_object | coverage_kind | primary paper(s) | reachable as | known_limits |
|---|---|---|---|---|---|
| simd_streaming_dfg | SIMD-vectorised streaming DFG discovery (~500× throughput vs standard DFG) | *engineering* | — | WASM, CLI, registry | ⚠️ **HashMap iteration in streaming state is non-deterministic without explicit sort (see DETERMINISM_AUDIT.md)**; no PM paper grounds SIMD-DFG as formal primitive |
| hierarchical_dfg | Hierarchical chunking DFG for massive logs (divide-and-conquer, bounded memory) | *engineering* | — | WASM, CLI, registry | — |
| streaming_log | Probabilistic streaming event log processor (stateful handle API) | *engineering* | — | WASM, CLI, registry | ⚠️ **No #[wasm_bindgen] exports in src/streaming/ — streaming_log functions are unreachable from JS without wrapper** |
| smart_engine | Adaptive algorithm selection engine with result caching and early termination | *engineering* | — | WASM, CLI, registry | — |

### Discovery Algorithms — Analysis / Utilities

| id | formal_object | coverage_kind | primary paper(s) | reachable as | known_limits |
|---|---|---|---|---|---|
| **transition_system** | **Transition system discovery: sliding-window state machine from event log** | direct | van_der_aalst_process_mining_2016 | WASM, CLI, registry | — |
| log_to_trie | Prefix tree (trie) discovery from log variants | *engineering* | — | WASM, CLI, registry | ⚠️ HashMap-based: trie node order may be non-deterministic without sort (see DETERMINISM_AUDIT.md) |
| causal_graph | Causal dependency graph: alpha or heuristic causal structure over activities | derived | van_der_aalst_et_al_alpha_miner_2004, weijters_van_der_aalst_heuristics_miner_2003 | WASM, CLI, registry | — |
| **performance_spectrum** | **Performance spectrum: duration statistics between activity pairs (sojourn, waiting, service time)** | direct | van_der_aalst_process_mining_2016 | WASM, CLI, registry | — |
| batches | Batch detection: identifies groups of cases processed simultaneously (shared timestamps) | *engineering* | — | WASM, CLI, registry | Batch heuristic based on timestamp proximity; no canonical PM paper defines this as a named formal primitive |
| correlation_miner | Correlation Miner: DFG discovery without case identifiers using timestamp correlation | derived | van_der_aalst_process_mining_2016 | WASM, CLI, registry | — |
| complexity_metrics | Structural complexity metrics for POWL models (size, CFC, structuredness) | derived | van_der_aalst_process_mining_2016 | WASM, CLI, registry | — |
| **powl_to_process_tree** | **POWL-to-process-tree conversion (Algorithm 3, Theorem 1 from separable WF-net paper)** | direct | kourani_park_van_der_aalst_separable_wfnets_2026 | WASM, CLI, registry | — |
| playout | Stochastic Petri net / process tree playout for synthetic event log generation | derived | van_der_aalst_process_mining_2016 | WASM, CLI, registry | ⚠️ **Uses global unseeded fastrand — non-deterministic without seeding fix (see DETERMINISM_AUDIT.md)** |
| monte_carlo_simulation | Monte Carlo simulation: stochastic process replay for probabilistic case analysis | derived | van_der_aalst_process_mining_2016 | WASM, CLI, registry | — |

### Discovery Algorithms — Advanced Analytics

| id | formal_object | coverage_kind | primary paper(s) | reachable as | known_limits |
|---|---|---|---|---|---|
| detect_drift | Concept drift detection: activity distribution comparison across sliding windows | derived | van_der_aalst_process_mining_2016 | WASM, CLI, registry | — |
| analyze_variant_complexity | Variant complexity analysis: variant entropy and diversity metrics over event log | derived | van_der_aalst_process_mining_2016 | WASM, CLI, registry | — |
| compute_activity_transition_matrix | Activity transition matrix: empirical Markov chain transition probabilities | derived | van_der_aalst_process_mining_2016 | WASM, CLI, registry | — |
| analyze_process_speedup | Process speedup analysis: temporal acceleration/deceleration via timestamp delta windows | *engineering* | — | WASM, CLI, registry | Engineering performance diagnostic; no canonical PM paper defines process speedup analysis as a named primitive |
| compute_trace_similarity_matrix | Trace similarity matrix: pairwise Levenshtein distance on activity sequences | *engineering* | — | WASM, CLI, registry | Levenshtein on activity sequences is a common technique; no single PM paper defines this as a named primitive |
| predict_next_activity | Next-activity prediction: n-gram (Markov chain) model over activity sequences | derived | van_der_aalst_process_mining_2016 | WASM, CLI, registry | — |
| predict_remaining_time | Remaining time prediction: statistical bucket model with Weibull distribution | *engineering* | — | WASM, CLI, registry | Weibull-based remaining time is an engineering adaptation; van der Aalst 2016 discusses remaining time prediction as concept but does not define this specific model |
| predict_outcome | Outcome prediction: anomaly scoring against DFG model + boundary coverage analysis | *engineering* | — | WASM, CLI, registry | — |

### Conformance Algorithms

| id | formal_object | coverage_kind | primary paper(s) | reachable as | known_limits |
|---|---|---|---|---|---|
| **alignments** | **Optimal trace alignment: A*-based alignment computation minimising move costs** | direct | adriansyah_aligning_observed_2014 | WASM, CLI, registry | NP-Hard for large logs — bounded by configured max_iterations |
| **generalization** | **Generalisation metric: fraction of model behaviour observed in log (avoids overfitting)** | direct | van_der_aalst_process_mining_2016 | WASM, CLI, registry | — |
| **etconformance_precision** | **ETConformance precision: escaping-edge analysis for process model precision measurement** | direct | munoz_gama_carmona_etconformance_2010 | WASM, CLI, registry | — |

### OCEL / Object-Centric

| id | formal_object | coverage_kind | primary paper(s) | reachable as | known_limits |
|---|---|---|---|---|---|
| **ocel_dfg** | **Aggregate OC-DFG: single directly-follows graph across all OCEL object types** | direct | van_der_aalst_object_centric_process_mining_2019 | WASM, CLI, registry | — |
| **ocel_dfg_per_type** | **Per-object-type OC-DFG: map from object_type to DFG (canonical OCEL projection)** | direct | van_der_aalst_object_centric_process_mining_2019 | WASM, CLI, registry | — |
| **ocel_petri_net** | **Object-Centric Petri Net (OC-Petri net) discovery from OCEL** | direct | van_der_aalst_object_centric_process_mining_2019 | WASM, CLI, registry | — |
| ocel_encode | OCEL text encoding: compact human-readable representation for LLM context and diffs | *engineering* | — | WASM, CLI, registry | — |
| **ocel_ocla** | **Object-Centric Language Abstraction (OCLA): per-type language and interaction capture** | direct | van_der_aalst_object_centric_process_mining_2019 | WASM, CLI, registry | OCLA is a family concept from the OCEL literature; no single defining paper for this exact algorithm variant |
| ocel_oc_declare | OC-Declare: temporal constraint discovery across OCEL object types | derived | pesic_et_al_declare_2007, van_der_aalst_object_centric_process_mining_2019 | WASM, CLI, registry | — |

### POWL / WF-net

| id | formal_object | coverage_kind | primary paper(s) | reachable as | known_limits |
|---|---|---|---|---|---|
| **powl_to_process_tree** | **POWL-to-process-tree conversion (Algorithm 3, Theorem 1 from separable WF-net paper)** | direct | kourani_park_van_der_aalst_separable_wfnets_2026 | WASM, CLI, registry | — |
| (see primitive_02_powl below) | POWL 2.0 with choice graphs | direct | kourani_park_van_der_aalst_choice_graphs_2025, kourani_park_van_der_aalst_separable_wfnets_2026 | WASM, CLI, registry | — |

### Social Network

| id | formal_object | coverage_kind | primary paper(s) | reachable as | known_limits |
|---|---|---|---|---|---|
| **handover_network** | **Handover-of-work social network: weighted graph of sequential resource handoffs** | direct | van_der_aalst_et_al_social_network_mining_2005 | WASM, CLI, registry | — |
| **working_together_network** | **Working-together social network: co-occurrence graph of resources sharing a case** | direct | van_der_aalst_et_al_social_network_mining_2005 | WASM, CLI, registry | — |

### ML / Prediction

All ML algorithms are classified `engineering` — standard ML techniques adapted for process features, not formal PM primitives.

| id | formal_object | coverage_kind | notes |
|---|---|---|---|
| ml_classify | Trace classification: k-NN, logistic regression, decision tree, naive Bayes on trace features | *engineering* | Standard ML classifiers adapted for PM features; no canonical PM paper |
| ml_cluster | Trace clustering: k-means and DBSCAN on trace feature vectors | *engineering* | — |
| ml_forecast | Process throughput forecasting: linear trend, autocorrelation seasonality, exponential overlay | *engineering* | — |
| ml_anomaly | Anomaly detection: information-theoretic scoring on drift distances with seasonal decomposition | *engineering* | Scoring uses log2 edge-frequency; missing-edge cost=10 (design-decided constant) |
| ml_regress | Remaining time regression: linear, polynomial, exponential regression on trace features | *engineering* | — |
| ml_pca | PCA feature reduction: Jacobi eigendecomposition on trace feature matrix | *engineering* | — |
| automl_classify | AutoML classification: auto-optimised RF/XGB model for trace outcome prediction | *engineering* | AutoML wraps standard ML; no PM paper grounds this as a named primitive |
| automl_forecast | AutoML throughput forecasting: auto-optimised time-series model for process throughput | *engineering* | — |

### Engineering Primitives

These are honest engineering primitives. `papers = []` is not a gap — there is no PM paper to cite.

| id | formal_object | notes |
|---|---|---|
| compute_ewma | EWMA: Exponentially Weighted Moving Average for numeric time series smoothing | General statistical primitive; not PM-specific |
| agentic_pipeline | Agentic process pipeline: perception → decision → protection → Bellman-optimised policy (RL orchestrator) | Bellman equation cited for RL update rule; this is a mathematical theorem, not a PM paper. Requires feature-cloud build |

### Consumer Contracts

These are interchange standards, not algorithms. `papers = []` is correct.

| id | formal_object | standard | reachable as |
|---|---|---|---|
| pnml_import | PNML import: ISO/IEC 20481:2019 Petri Net Markup Language XML ingest | ISO/IEC 20481:2019 | WASM, CLI, registry |
| bpmn_import | BPMN 2.0 import: OMG BPMN 2.0 XML ingest and conversion to POWL | OMG BPMN 2.0 | WASM, CLI, registry |
| yawl_export | YAWL v6 XML export from POWL model | YAWL v6 interchange format | WASM, CLI, registry |

---

## Primitive Docs Coverage

One record per `docs/primitives/0N-*.md` document.

| Primitive doc | id | formal_object | coverage_kind | paper(s) | tests |
|---|---|---|---|---|---|
| 00-INVENTORY | primitive_00_inventory | wasm4pm primitive inventory and kernel registry catalogue | *engineering* | — | — |
| 01-OCEL-V2 | primitive_01_ocel_v2 | Object-Centric Event Log v2.0 (OCEL 2.0): objects, events, E2O relations, O2O relations | direct | ghahfarokhi_et_al_ocel_2021, van_der_aalst_object_centric_process_mining_2019 | — |
| 02-POWL | primitive_02_powl | Partial-Order Workflow Language 2.0 with choice graphs (POWL 2.0) | direct | kourani_park_van_der_aalst_choice_graphs_2025, kourani_park_van_der_aalst_separable_wfnets_2026 | — |
| 03-WFNET | primitive_03_wfnet | Workflow net soundness (WF-net, free-choice, state machine, marked graph predicates) | direct | kourani_park_van_der_aalst_separable_wfnets_2026, van_der_aalst_process_mining_2016 | adversarial_powl_tests.rs (+), ggen_invalid_exclusion.json (−) |
| 04-CONFORMANCE | primitive_04_conformance | Token-replay fitness and alignment-based conformance (two-tier: diagnostic ≥0.8, admission =1.0) | direct | van_der_aalst_process_mining_2016, adriansyah_aligning_observed_2014 | conformance_model_truth_gaps.rs (+), ggen_invalid_exclusion.json (−), ggen_invalid_precedence.json (−) |
| 05-PROCESS-WORLD-FOUNDRY | primitive_05_process_world_foundry | Synthetic but lawful process world generation via stochastic Petri net playout | *engineering* | — | — |
| 06-NEGATIVE-CORPUS | primitive_06_negative_corpus | Negative fixture corpus for refusal proof (invalid OCEL, invalid XES, impossible traces) | *engineering* | — | ggen_invalid_exclusion.json (−), ggen_invalid_immediate.json (−), ggen_invalid_precedence.json (−), invalid_monotonicity.json (−), invalid_o2o.json (−) |
| 07-ROUTE-DRIVEN-TDD | primitive_07_route_driven_tdd | POWL 2.0 route-driven test substrate (14 named routes, choice_graph / sequence / partial_order) | *engineering* | — | — |
| 08-BENCHMARK-GATES | primitive_08_benchmark_gates | Deterministic benchmark gates G1-G5 with BLAKE3 receipts and CalVer version locks | *engineering* | — | — |
| 09-OCPQ (partial) | primitive_09_ocpq | Object-Centric Process Querying: E2O, O2O, TBE predicates, CHILD SET constraints (Defs 1-9) | direct | kuesters_van_der_aalst_ocpq_2025 | invalid_monotonicity.json (−), invalid_o2o.json (−) |

---

## Known Limits and Open Gaps

### ⚠️ Non-Determinism Flags (highest priority)

| algorithm | limit |
|---|---|
| `simd_streaming_dfg` | **HashMap iteration in streaming state is non-deterministic without explicit sort** (see DETERMINISM_AUDIT.md) |
| `streaming_log` | **No `#[wasm_bindgen]` exports in `src/streaming/`** — streaming_log functions are unreachable from JS without a wrapper |
| `log_to_trie` | HashMap-based: trie node order may be non-deterministic without sort (see DETERMINISM_AUDIT.md) |
| `playout` | **Uses global unseeded `fastrand`** — non-deterministic without seeding fix (see DETERMINISM_AUDIT.md) |

### Phase 4 Audit Corrections (DFG vs Petri net output)

The following algorithms were corrected in the Phase 4 audit to accurately reflect that they return DFG output, not Petri nets:

| algorithm | correction |
|---|---|
| `genetic_algorithm` | Returns DFG (not Petri net) |
| `pso` | Returns DFG (not Petri net) |
| `aco` | Returns DFG (not Petri net) |
| `simulated_annealing` | Returns DFG (not Petri net) |
| `a_star` | Returns DFG (not Petri net) |
| `hill_climbing` | Returns DFG (not Petri net) |

### Other Limits

| algorithm | limit |
|---|---|
| `dfg` | DFG is not a Petri net — does not guarantee soundness |
| `alpha_plus_plus` | Sensitive to noise; no noise filtering built in |
| `ilp` | NP-Hard for large logs — bounded by solver timeout |
| `alignments` | NP-Hard for large logs — bounded by configured max_iterations |
| `genetic_algorithm` | Uses hardcoded seed=42; not configurable by caller |
| `aco` | Two separate ACO implementations exist (`discover_ant_colony` and `discover_aco_algorithm`) |
| `ml_anomaly` | Scoring uses log2 edge-frequency; missing-edge cost=10 (design-decided constant) |
| `agentic_pipeline` | Requires feature-cloud build; not available in all deployment profiles |
| `primitive_09_ocpq` | No `docs/primitives/09-OCPQ-PRIMITIVES.md` exists yet; `crates/ocpq/` not found in this worktree |

---

## Classification Vocabulary

| Class | Meaning |
|---|---|
| `direct` | Paper defines this exact formal object; bold in tables above |
| `derived` | Follows a paper family or adapts a paper's technique; no single canonical paper defines the primitive exactly |
| `engineering` | Valid implementation primitive with no PM paper; *italicised* in tables above; `papers = []` is honest, not a gap |
| `consumer-contract` | Required for interop (standard, not algorithm); `papers = []` is correct |
| `future` | Paper exists, implementation not yet done; explicitly marked; currently 0 items |

---

## Paper Key Index

These are the paper keys used in `academic_coverage.toml`. Full bibliographic entries should be maintained here.

| key | description |
|---|---|
| adriansyah_aligning_observed_2014 | Adriansyah et al., "Aligning Observed and Modelled Behaviour," 2014 |
| de_medeiros_et_al_alpha_pp_2004 | de Medeiros et al., "The Alpha+++ Algorithm," 2004 |
| ghahfarokhi_et_al_ocel_2021 | Ghahfarokhi et al., "OCEL: A Standard for Object-Centric Event Logs," 2021 |
| kourani_park_van_der_aalst_choice_graphs_2025 | Kourani, Park, van der Aalst, "Choice Graphs for POWL 2.0," 2025 |
| kourani_park_van_der_aalst_separable_wfnets_2026 | Kourani, Park, van der Aalst, "Separable WF-nets," 2026 |
| kuesters_van_der_aalst_ocpq_2025 | Küsters, van der Aalst, "Object-Centric Process Querying," 2025 |
| leemans_discovering_block_structured_2013 | Leemans et al., "Discovering Block-Structured Process Models Using Inductive Miner," 2013 |
| medeiros_et_al_genetic_process_mining_2004 | de Medeiros et al., "Genetic Process Mining," 2004 |
| munoz_gama_carmona_etconformance_2010 | Muñoz-Gama & Carmona, "A Fresh Look at Precision in Process Conformance," 2010 |
| pesic_et_al_declare_2007 | Pešić et al., "Declare: Full Support for Loosely-Structured Processes," 2007 |
| van_der_aalst_et_al_alpha_miner_2004 | van der Aalst et al., "Workflow Mining: Discovering Process Models from Event Logs," 2004 |
| van_der_aalst_et_al_ilp_miner_2012 | van der Aalst et al., "Replaying History on Process Models for Conformance Checking and Performance Analysis," 2012 |
| van_der_aalst_et_al_social_network_mining_2005 | van der Aalst et al., "Mining Social Networks: Uncovering Interaction Patterns in Business Processes," 2005 |
| van_der_aalst_object_centric_process_mining_2019 | van der Aalst, "Object-Centric Process Mining: Dealing with Divergence and Convergence in Event Data," 2019 |
| van_der_aalst_process_mining_2016 | van der Aalst, "Process Mining: Data Science in Action," 2nd ed., 2016 |
| weijters_van_der_aalst_heuristics_miner_2003 | Weijters & van der Aalst, "Rediscovering Workflow Models from Event-Based Data Using Little Thumb," 2003 |

---

*Generated from `docs/academic_coverage.toml`. Edit the TOML, not this file.*
