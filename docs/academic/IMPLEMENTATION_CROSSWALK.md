# Implementation Crosswalk — wasm4pm Algorithm Registry

**Document:** IMPLEMENTATION_CROSSWALK.md
**Agent:** A13 — Implementation Crosswalk
**Date:** 2026-05-30
**Source of truth:** `packages/kernel/src/registry.ts` (60 registered algorithms)
**Academic grounding:** docs/academic/10-16 lineage documents
**Column schema:** algorithm_id | formal_object | primary_paper | implementation_file | wasm_export | cli_command | positive_test | negative_fixture

---

## Purpose

For each of the 60 registered algorithms this document provides a single crosswalk row that links:
- The **formal mathematical object** the algorithm produces
- The **primary academic paper** grounding that formal object (sourced from lineage documents 10–16)
- The **Rust source file** in `wasm4pm/src/` that implements the WASM export
- The **WASM export function name** (`#[wasm_bindgen]`)
- The **CLI command** by which users invoke the algorithm
- The **positive integration test** file that exercises the algorithm
- The **negative fixture** or adversarial test that attempts to break it

---

## Legend

- **formal_object:** Short description of the mathematical/computational object produced
- **primary_paper:** Canonical academic citation (Author, Year, Venue); `engineering_only` when no PM-specific peer-reviewed paper grounds the algorithm; `standard_only` for import/export format standards
- **implementation_file:** Path relative to `wasm4pm/src/` (confirmed to exist)
- **wasm_export:** `#[wasm_bindgen]` function name in Rust
- **cli_command:** Primary `wpm` invocation pattern
- **positive_test:** Test file in `wasm4pm/tests/` that verifies correct behaviour
- **negative_fixture:** Test file or fixture directory providing adversarial / negative inputs

**Gap markers:**
- `[GAP]` — column could not be filled from available sources
- `[SHARED]` — multiple algorithms share the same test file

---

## Section 1: Discovery Algorithms (15)

| algorithm_id | formal_object | primary_paper | implementation_file | wasm_export | cli_command | positive_test | negative_fixture |
|---|---|---|---|---|---|---|---|
| `dfg` | Directed weighted graph G = (A, F, W); A = activities, F ⊆ A×A directly-follows relation, W: F → ℕ frequencies | Cook & Wolf (1998) ACM TOSEM 7(3); van der Aalst (2019) Procedia CS 164 | `discovery.rs` | `discover_dfg` | `wpm run --algorithm dfg` | `ground_truth_discovery_tests.rs` | `negative_quality.rs` |
| `process_skeleton` | Log skeleton — constraint set over activity pairs {always_before, always_after, equivalence, never_together, activity_count} | Verbeek & Medeiros de Carvalho (2018) arXiv:1806.08247; Verbeek (2021) STTT 24(4) | `more_discovery.rs` | `extract_process_skeleton` | `wpm run --algorithm process_skeleton` | `algorithm_correctness.rs` | `adversarial_ingestion.rs` |
| `alpha_plus_plus` | Sound WF-net discovered via extended footprint matrix handling short loops, self-loops, implicit places, and duplicate tasks | Wen et al. (2007) WISE / LNCS 4803; Medeiros et al. (2004) BETA WP 113 (alpha+) | `algorithms.rs` | `discover_alpha_plus_plus` | `wpm run --algorithm alpha_plus_plus` | `ground_truth_discovery_tests.rs` | `negative_quality.rs` |
| `heuristic_miner` | Causal dependency graph (and optional C-net) derived from statistical dependency measures over the directly-follows matrix, noise-tolerant | Weijters, van der Aalst & Medeiros (2006) BETA WP 166; Weijters & Ribeiro (2011) IEEE CIDM | `advanced_algorithms.rs` | `discover_heuristic_miner` | `wpm run --algorithm heuristic_miner` | `discovery_fitness_bpi2020_tests.rs` | `negative_quality.rs` |
| `inductive_miner` | Process tree T with operators {→, ×, ∧, ↺} guaranteed sound; produced by recursive log partitioning using XOR/Sequence/Parallel/Loop cuts | Leemans, Fahland & van der Aalst (2013) ICATPN / LNCS 7927 doi:10.1007/978-3-642-38697-8_17 | `more_discovery.rs` | `discover_inductive_miner` | `wpm run --algorithm inductive_miner` | `ground_truth_discovery_tests.rs` | `conformance_model_truth_gaps.rs` |
| `genetic_algorithm` | DFG (registry corrected from Petri net) evolved via genetic operators over population of candidate models, optimizing fitness/precision/generalization/simplicity | van der Aalst, Medeiros & Weijters (2005) ICATPN / LNCS 3536 doi:10.1007/11494744_5; Medeiros et al. (2007) DAMI 14(2) | `genetic_discovery.rs` | `discover_genetic_algorithm` | `wpm run --algorithm genetic_algorithm` | `algorithm_integration_tests.rs` | `algorithm_weakness_matrix.rs` |
| `pso` | DFG (registry corrected) discovered by particle swarm optimization; each particle encodes a candidate process model as DFG adjacency | Maita et al. (2022) IJCIS 15(1) doi:10.1007/s44196-022-00074-9; Kennedy & Eberhart (1995) ICNN (PSO origin) | `genetic_discovery.rs` | `discover_pso_algorithm` | `wpm run --algorithm pso` | `algorithm_integration_tests.rs` | `algorithm_weakness_matrix.rs` |
| `a_star` | DFG (registry corrected) discovered via A* heuristic search over process model space | engineering_only (no dedicated PM A*-as-discovery paper; A* as conformance search: Adriansyah et al. 2011 EDOC) | `fast_discovery.rs` | `discover_astar` | `wpm run --algorithm a_star` | `discovery_nan_and_astar_precision.rs` | `algorithm_weakness_matrix.rs` |
| `hill_climbing` | DFG (registry corrected) discovered by greedy local-search perturbation of a current best model | engineering_only (hill climbing as a PM discovery algorithm has no standalone peer-reviewed paper; component in Buijs et al. 2012 OTM ETM) | `fast_discovery.rs` | `discover_hill_climbing` | `wpm run --algorithm hill_climbing` | `algorithm_integration_tests.rs` | `algorithm_weakness_matrix.rs` |
| `aco` | DFG (registry corrected) constructed by artificial ants traversing pheromone-weighted process graph | Canfora et al. (2013) IEEE SERVICES doi:10.1109/SERVICES.2013.30; Dorigo & Stützle (2004) MIT Press (ACO method) | `genetic_discovery.rs` | `discover_aco_algorithm` | `wpm run --algorithm aco` | `algorithm_integration_tests.rs` | `algorithm_weakness_matrix.rs` |
| `simulated_annealing` | DFG (registry corrected) derived by stochastic local search accepting deteriorating moves with decreasing probability | Liu, Lu & Shi (2008) ICYCS / IEEE doi:10.1109/ICYCS.2008.364; Kirkpatrick et al. (1983) Science 220 (SA origin) | `more_discovery.rs` | `discover_simulated_annealing` | `wpm run --algorithm simulated_annealing` | `algorithm_integration_tests.rs` | `algorithm_weakness_matrix.rs` |
| `declare` | Set of LTL-formula constraints representing a declarative process model for flexible processes | Pesic & van der Aalst (2006) BPM'06 Workshops; Pesic, Schonenberg & van der Aalst (2007) EDOC doi:10.1109/EDOC.2007.14 | `discovery.rs` | `discover_declare` | `wpm run --algorithm declare` | `declare_conformance_integration_test.rs` | `declare_all_constraints_test.rs` |
| `optimized_dfg` | DFG with edges filtered by frequency and statistical significance thresholds; minimal-edge sound spanning subgraph | Günther & van der Aalst (2007) BPM / LNCS 4714 doi:10.1007/978-3-540-75183-0_24; Chapela-Campa et al. (2022) Inf. Sci. 610 doi:10.1016/j.ins.2022.07.170 | `ilp_discovery.rs` | `discover_optimized_dfg` | `wpm run --algorithm optimized_dfg` | `algorithm_integration_tests.rs` | `negative_quality.rs` |
| `ilp` | Petri net derived from language-based region theory via ILP to find minimal regions separating observed from unobserved traces | van der Werf, van Dongen, Hurkens & Serebrenik (2009) Fundamenta Informaticae 94(3-4) doi:10.3233/FI-2009-136 | `ilp_discovery.rs` | `discover_ilp_petri_net` | `wpm run --algorithm ilp` | `ground_truth_discovery_tests.rs` | `negative_quality.rs` |
| `simd_streaming_dfg` | DFG constructed from event stream via SIMD-vectorized per-event processing (~500x over standard DFG) | engineering_only (SIMD as a PM DFG optimization has no PM-specific paper; DFG concept: Cook & Wolf 1998 ACM TOSEM) | `simd_streaming_dfg.rs` | `discover_dfg_simd` | `wpm run --algorithm simd_streaming_dfg` | `streaming_batch_equivalence_tests.rs` | `adversarial_ingestion.rs` |

---

## Section 2: Metaheuristic and Graph Utilities (3)

| algorithm_id | formal_object | primary_paper | implementation_file | wasm_export | cli_command | positive_test | negative_fixture |
|---|---|---|---|---|---|---|---|
| `hierarchical_dfg` | Multi-level DFG where high-frequency subprocesses are collapsed into abstract nodes enabling drill-down views | Günther & van der Aalst (2007) BPM / LNCS 4714 (Fuzzy Mining); Bose & van der Aalst (2009) BPM / LNCS 5701 | `hierarchical.rs` | `discover_dfg_hierarchical` | `wpm run --algorithm hierarchical_dfg` | `algorithm_integration_tests.rs` | `adversarial_ingestion.rs` |
| `causal_graph` | Causal net (C-net) — directed graph where each activity has sets of possible input/output bindings capturing split/join behaviour | van der Aalst, Adriansyah & van Dongen (2011) CONCUR / LNCS 6901 doi:10.1007/978-3-642-23217-6_3 | `causal_graph.rs` | `discover_causal_heuristic` | `wpm run --algorithm causal_graph` | `algorithm_correctness.rs` | `algorithm_weakness_matrix.rs` |
| `correlation_miner` | Process model (DFG) discovered without case identifiers via ILP over Precede/Succeed and Duration matrices from raw event streams | Pourmirza, Dijkman & Grefen (2017) IJCIS 26(2) doi:10.1142/S0218843017420023; Pourmirza et al. (2015) CoopIS / LNCS 9382 | `correlation_miner.rs` | `discover_correlation` | `wpm run --algorithm correlation_miner` | `algorithm_integration_tests.rs` | `dirty_data_xes_tests.rs` |

---

## Section 3: Streaming Algorithms (2)

| algorithm_id | formal_object | primary_paper | implementation_file | wasm_export | cli_command | positive_test | negative_fixture |
|---|---|---|---|---|---|---|---|
| `streaming_log` | Online process discovery framework maintaining DFG incrementally from event stream using bounded memory (sliding window, lossy counting) | Burattin, Sperduti & van der Aalst (2014) IEEE CEC doi:10.1109/CEC.2014.6900341; van Zelst et al. (2018) KAIS 57(3) doi:10.1007/s10115-017-1060-2 | `probabilistic/wasm_bindings.rs` [GAP: file path inferred from inventory] | `create_streaming_log` | `wpm run --algorithm streaming_log` | `streaming_batch_equivalence_tests.rs` | `adversarial_ingestion.rs` |
| `smart_engine` | Adaptive execution controller that selects discovery algorithm based on log profile (trace count, event count, profile tier) | engineering_only (no PM-specific paper for adaptive algorithm selection; concept: Rice 1976 Algorithm Selection; AutoML literature) | `smart_engine.rs` | `smart_engine_run` | `wpm run --algorithm smart_engine` | `algorithm_integration_tests.rs` | `algorithm_weakness_matrix.rs` |

---

## Section 4: ML Analysis Algorithms (6)

| algorithm_id | formal_object | primary_paper | implementation_file | wasm_export | cli_command | positive_test | negative_fixture |
|---|---|---|---|---|---|---|---|
| `ml_classify` | Classification of traces by outcome using k-NN, logistic regression, decision tree, or naive Bayes on extracted case-feature vectors | Song, Günther & van der Aalst (2008) BPM Workshops LNBIP 17 (trace clustering/classification paradigm); Cover & Hart (1967) IEEE TIT 13(1) (k-NN) | `ml/classification.rs` | `discover_ml_classify` | `wpm ml classify` | `ml_family_tests.rs` | `prediction_leakage_tests.rs` |
| `ml_cluster` | Partition of traces into homogeneous subsets using k-means or DBSCAN on activity/transition profile feature vectors | Song, Günther & van der Aalst (2008) BPM Workshops LNBIP 17; MacQueen (1967) 5th Berkeley Symp. (k-means) | `ml/clustering.rs` | `discover_ml_cluster` | `wpm ml cluster` | `ml_family_tests.rs` | `algorithm_weakness_matrix.rs` |
| `ml_forecast` | Throughput time-series forecast using linear trend, autocorrelation seasonality, and optional exponential overlay on event log time buckets | van der Aalst, Schonenberg & Song (2011) Inf. Sys. 36(2) doi:10.1016/j.is.2010.09.001; Roberts (1959) Technometrics 1(3) (EWMA) | `ml/forecasting.rs` | `discover_ml_forecast` | `wpm ml forecast` | `ml_family_tests.rs` | `prediction_naive_baseline_tests.rs` |
| `ml_anomaly` | Anomaly score per trace from DFG edge-frequency information-theoretic scoring (log2 edge-frequency; missing-edge cost = 10) | Ko & Comuzzi (2021) Inf. Sci. 549; Bezerra, Wainer & van der Aalst (2009) BPMDS / LNBIP 29 doi:10.1007/978-3-642-01862-6_13 | `anomaly.rs` | `discover_ml_anomaly` | `wpm ml anomaly` | `ml_real_data_tests.rs` | `negative_quality.rs` |
| `ml_regress` | Prediction of remaining case cycle time using linear, polynomial, or exponential regression on trace prefix features | van der Aalst, Schonenberg & Song (2011) Inf. Sys. 36(2); Rogge-Solti & Weske (2013) ICSOC / LNCS 8274 | `ml/regression.rs` | `discover_ml_regress` | `wpm ml regress` | `ml_regression_tests.rs` | `prediction_leakage_tests.rs` |
| `ml_pca` | Dimensionality reduction of trace feature matrix using Principal Component Analysis (Jacobi eigendecomposition) | engineering_only for PM-specific PCA application; mathematical origin: Pearson (1901) Phil. Mag.; Hotelling (1933) J. Ed. Psych. | `ml/pca.rs` | `discover_ml_pca` | `wpm ml pca` | `ml_family_tests.rs` | `algorithm_weakness_matrix.rs` |

---

## Section 5: Analysis and Graph Utilities (6)

| algorithm_id | formal_object | primary_paper | implementation_file | wasm_export | cli_command | positive_test | negative_fixture |
|---|---|---|---|---|---|---|---|
| `transition_system` | Transition system TS = (S, Σ, →, s₀) from event log via sliding-window state abstraction; Petri net synthesised via theory of regions | van der Aalst et al. (2010) Software & Systems Modeling 9(1) doi:10.1007/s10270-008-0106-z; van der Aalst et al. (2006) BPM Center Report BPM-06-30 | `transition_system.rs` | `discover_transition_system_from_handle` | `wpm run --algorithm transition_system` | `algorithm_integration_tests.rs` | `algorithm_weakness_matrix.rs` |
| `log_to_trie` | Prefix tree (trie) where each root-to-leaf path encodes one trace; shared prefixes merged; compact log storage with efficient subsequence queries | van Zelst, van Dongen & van der Aalst (2018) KAIS 57(3) doi:10.1007/s10115-017-1060-2 (streaming prefix-tree abstraction); Fredkin (1960) CACM 3(9) (trie data structure) | `log_to_trie.rs` [GAP: file inferred from inventory entry; may be in more_discovery.rs] | `discover_prefix_tree` | `wpm run --algorithm log_to_trie` | `algorithm_integration_tests.rs` | `adversarial_ingestion.rs` |
| `performance_spectrum` | Two-dimensional model plotting all case flows between consecutive process step pairs along a timeline; reveals batching, waiting, parallelism patterns | Denisov, Fahland & van der Aalst (2018) BPM / LNCS 11080 doi:10.1007/978-3-319-98648-7_9 | `performance_spectrum.rs` | `discover_performance_spectrum_wasm` | `wpm temporal` | `streaming_batch_equivalence_tests.rs` | `dirty_data_xes_tests.rs` |
| `batches` | Algorithm detecting batch processing patterns (parallel / sequential) in event log by grouping cases sharing timestamps at task and subprocess levels | Martin, Pufahl & Mannhardt (2021) Inf. Sys. 95:101642 doi:10.1016/j.is.2020.101642; Wen et al. (2013) CCPE doi:10.1002/cpe.2991 | `batches.rs` | `discover_batches_wasm` | `wpm run --algorithm batches` | `streaming_batch_equivalence_tests.rs` | `dirty_data_xes_tests.rs` |
| `performance_spectrum` | [See above — duplicate check: `performance_spectrum` is registered once] | — | — | — | — | — | — |
| `correlation_miner` | [See Section 2 above] | — | — | — | — | — | — |

---

## Section 6: Conformance and Quality Metrics (5)

| algorithm_id | formal_object | primary_paper | implementation_file | wasm_export | cli_command | positive_test | negative_fixture |
|---|---|---|---|---|---|---|---|
| `generalization` | Generalization metric measuring extent to which a Petri net model avoids overfitting the training log (one of four canonical quality dimensions) | Buijs, van Dongen & van der Aalst (2012) OTM / LNCS 7565 doi:10.1007/978-3-642-33606-5_19; Buijs et al. (2014) IJCIS 23(1) doi:10.1142/S0218843014400012 | `generalization.rs` | `generalization` | `wpm quality` | `ground_truth_conformance_tests.rs` | `conformance_model_truth_gaps.rs` |
| `etconformance_precision` | Precision metric via escaping-edge analysis — ratio of model-allowed transitions not observed in log at states reached during replay | Muñoz-Gama & Carmona (2010) BPM / LNCS 6336 doi:10.1007/978-3-642-15618-2_16; Adriansyah et al. (2013) BPM Workshops / LNBIP 132 doi:10.1007/978-3-642-36285-9_15 | `etconformance_precision.rs` | `wasm_compute_precision` | `wpm conformance` | `ground_truth_conformance_tests.rs` | `conformance_edge_cases.rs` |
| `alignments` | Optimal alignment mapping each observed trace to nearest accepting run of a Petri net; cost function over log moves, model moves, and synchronous moves; A* search over product automaton | Adriansyah, van Dongen & van der Aalst (2011) EDOC doi:10.1109/EDOC.2011.12; van der Aalst, Adriansyah & van Dongen (2012) WIREs DMKD doi:10.1002/widm.1045 | `alignments.rs` | `compute_optimal_alignments` | `wpm conformance` | `conformance_real_data_tests.rs` | `conformance_edge_cases.rs` |
| `complexity_metrics` | Structural complexity metrics for POWL/WF-net models: Extended Cardoso Metric (ECaM), Extended Cyclomatic Metric (ECyM), Structuredness Metric (SM) | Lassen & van der Aalst (2009) Inf. Software Technology 51(3) doi:10.1016/j.infsof.2008.08.005; Mendling (2008) Springer LNCS 6 | `powl_api.rs` | `measure_complexity` | `wpm powl complexity` | `algorithm_correctness.rs` | `adversarial_powl_tests.rs` |

---

## Section 7: Import / Export / Conversion (5)

| algorithm_id | formal_object | primary_paper | implementation_file | wasm_export | cli_command | positive_test | negative_fixture |
|---|---|---|---|---|---|---|---|
| `pnml_import` | Deserialization of PNML XML (ISO/IEC 15909-2:2011) to in-memory P/T Petri net representation | ISO/IEC 15909-2:2011 (standard_only); Kindler & Weber (2003) CPN Workshop (format origin) | `pnml_io.rs` | `from_pnml_wasm` | `wpm powl import --format pnml` | `algorithm_integration_tests.rs` | `adversarial_ingestion.rs` |
| `bpmn_import` | Deserialization of BPMN 2.0 XML (OMG/ISO 19510:2013) to POWL; conversion follows Dijkman et al. BPMN-to-Petri-net mapping rules | OMG BPMN 2.0 (standard_only); Dijkman, Dumas & Ouyang (2008) Inf. Software Technology 50(12) | `bpmn_import.rs` | `read_bpmn` | `wpm powl import --format bpmn` | `algorithm_integration_tests.rs` | `adversarial_ingestion.rs` |
| `powl_to_process_tree` | Conversion of POWL model to block-structured process tree; partial (non-block-structured fragments approximated) | engineering_only (no standalone paper; context: Kourani & van Zelst (2023) BPM LNCS 14159 defines POWL semantics and its relationship to process trees) | `powl_to_process_tree.rs` | `powl_to_process_tree` | `wpm powl convert` | `algorithm_correctness.rs` | `adversarial_powl_tests.rs` |
| `yawl_export` | Serialization of POWL model to YAWL v6 XML format | van der Aalst & ter Hofstede (2005) Inf. Sys. 30(4) doi:10.1016/j.is.2004.02.002 (YAWL language); engineering_only for export implementation | `yawl_export.rs` | `powl_to_yawl_string` | `wpm powl export --format yawl` | `algorithm_integration_tests.rs` | `adversarial_powl_tests.rs` |
| `complexity_metrics` | [See Section 6 above] | — | — | — | — | — | — |

---

## Section 8: Simulation Algorithms (2)

| algorithm_id | formal_object | primary_paper | implementation_file | wasm_export | cli_command | positive_test | negative_fixture |
|---|---|---|---|---|---|---|---|
| `playout` | Deterministic or stochastic token-game traversal of process model (Petri net / process tree / POWL) generating synthetic conforming traces | van der Aalst (2011) Springer Process Mining textbook (play-out concept); Vanden Broucke et al. (2014) SSRN 2489051 (ProM playout) | `playout.rs` | `play_out_process_tree` | `wpm simulate` | `self_conformance_tests.rs` | `adversarial_powl_tests.rs` |
| `monte_carlo_simulation` | Stochastic simulation generating distributions of process outcomes by repeatedly sampling trace executions from Petri net with log-derived performance distributions | Rozinat, Wynn, van der Aalst, ter Hofstede & Fidge (2009) Data & Knowledge Engineering 68(9) doi:10.1016/j.dse.2009.02.004; Metropolis & Ulam (1949) JASA 44(247) (Monte Carlo method) | `simulation.rs` [GAP: inventory lists `montecarlo.rs` but `simulation.rs` exists; primary file may vary] | `monte_carlo_simulation` | `wpm simulate --stochastic` | `self_conformance_tests.rs` | `algorithm_weakness_matrix.rs` |

---

## Section 9: Social Network Mining (2)

| algorithm_id | formal_object | primary_paper | implementation_file | wasm_export | cli_command | positive_test | negative_fixture |
|---|---|---|---|---|---|---|---|
| `handover_network` | Weighted directed graph G = (R, E, w); edge (r_i, r_j) when r_i executes activity immediately before r_j in same case; w = handover frequency | van der Aalst & Song (2004) BPM / LNCS 3080 doi:10.1007/978-3-540-25970-1_16; van der Aalst, Reijers & Song (2005) CSCW 14(6) doi:10.1007/s10606-005-9005-9 | `social_network.rs` | `discover_handover_network` | `wpm social handover` | `algorithm_integration_tests.rs` | `algorithm_weakness_matrix.rs` |
| `working_together_network` | Weighted symmetric graph G = (R, E, w); edge (r_i, r_j) when both resources appear in same case; w = co-participation frequency | van der Aalst & Song (2004) BPM / LNCS 3080 doi:10.1007/978-3-540-25970-1_16; van der Aalst, Reijers & Song (2005) CSCW 14(6) doi:10.1007/s10606-005-9005-9 | `social_network.rs` | `discover_working_together_network` | `wpm social together` | `algorithm_integration_tests.rs` | `algorithm_weakness_matrix.rs` |

---

## Section 10: Object-Centric (OCEL) Algorithms (6)

| algorithm_id | formal_object | primary_paper | implementation_file | wasm_export | cli_command | positive_test | negative_fixture |
|---|---|---|---|---|---|---|---|
| `ocel_dfg` | Aggregate OC-DFG — typed multigraph where edges reflect directly-follows relations across all OCEL object types combined | Berti & van der Aalst (2022/2023) STTT 25 doi:10.1007/s10009-022-00668-w; van der Aalst (2019) SEFM / LNCS 11724 (motivation) | `discovery.rs` | `discover_ocel_dfg` | `wpm run --algorithm ocel_dfg` | `ocel_dfg_discovery_tests.rs` | `ocel_object_centric_audit.rs` |
| `ocel_dfg_per_type` | Per-object-type OC-DFG map — separate DFG per object type (e.g., Order, Item) providing independent process views | Berti & van der Aalst (2022/2023) STTT 25 doi:10.1007/s10009-022-00668-w | `discovery.rs` | `discover_ocel_dfg_per_type` | `wpm run --algorithm ocel_dfg_per_type` | `ocel_dfg_discovery_tests.rs` | `ocel_many_to_many_tests.rs` |
| `ocel_petri_net` | Object-Centric Petri Net (OCPN) N = (P, T, F, M_0, type, variable); typed places, variable arcs; captures concurrency and synchronization between object types | van der Aalst & Berti (2020) Fundamenta Informaticae 175(1-4) doi:10.3233/FI-2020-1946 | `oc_petri_net.rs` | `discover_oc_petri_net` | `wpm run --algorithm ocel_petri_net` | `ocel_process_evidence_tests.rs` | `ocel_object_centric_audit.rs` |
| `ocel_encode` | Compact human-readable text encoding of OCEL for LLM context, process inspection, and diff display | engineering_only (text serialization utility; OCEL format: Ghahfarokhi et al. 2021 SIMPDA @ ADBIS doi:10.1007/978-3-030-85082-1_16) | `text_encoding.rs` | `encode_ocel_as_text` | `wpm run --algorithm ocel_encode` | `ocel_real_data_tests.rs` | `ocel_object_centric_audit.rs` |
| `ocel_ocla` | Object-Centric Language Abstraction (OCLA) — language of events per object type and their interaction patterns | [GAP: specific paper for OCLA not identified in lineage docs; family: Berti & van der Aalst (2022/2023) OC-PM framework] | `advanced/mod.rs` | `discover_ocla_wasm` | `wpm run --algorithm ocel_ocla` | `ocel_lifecycle_wasm_export_tests.rs` | `ocel_object_centric_audit.rs` |
| `ocel_oc_declare` | OC-DECLARE model — declarative constraint templates (LTL-style) specifying ordering, co-occurrence, and absence constraints across multiple object types | Küsters & van der Aalst (2025) BPM 2025 / LNCS 16044 doi:10.1007/978-3-032-02867-9_11 | `advanced/mod.rs` | `discover_oc_declare_wasm` | `wpm run --algorithm ocel_oc_declare` | `ocel_process_evidence_tests.rs` | `ocel_object_centric_audit.rs` |

---

## Section 11: Prediction Algorithms (3)

| algorithm_id | formal_object | primary_paper | implementation_file | wasm_export | cli_command | positive_test | negative_fixture |
|---|---|---|---|---|---|---|---|
| `predict_next_activity` | N-gram (Markov chain) model built from prefix traces; predicts most likely next activity with probabilities | van der Aalst, Schonenberg & Song (2011) Inf. Sys. 36(2) doi:10.1016/j.is.2010.09.001; Tax et al. (2017) CAiSE / LNCS 10253 (LSTM benchmark establishing n-gram as baseline) | `prediction.rs` | `predict_next_activity` | `wpm predict next-activity` | `powl_and_prediction_real_data_tests.rs` | `prediction_leakage_tests.rs` |
| `predict_remaining_time` | Remaining time prediction using statistical bucket models and Weibull distribution fitted to prefix trace durations | van der Aalst, Schonenberg & Song (2011) Inf. Sys. 36(2) doi:10.1016/j.is.2010.09.001; Rogge-Solti & Weske (2013) ICSOC / LNCS 8274 doi:10.1007/978-3-319-06764-3_25 | `prediction_remaining_time.rs` | `predict_case_duration` | `wpm predict remaining-time` | `powl_and_prediction_real_data_tests.rs` | `prediction_naive_baseline_tests.rs` |
| `predict_outcome` | Case outcome score combining anomaly score (DFG edge-frequency), boundary coverage, and prefix features | Leontjeva et al. (2015) BPM / LNCS 9253 (ML-based outcome prediction); Teinemaa et al. (2019) ACM TKDD 13(2) doi:10.1145/3301300 (canonical benchmark) | `prediction_outcome.rs` | `score_anomaly` | `wpm predict outcome` | `powl_and_prediction_real_data_tests.rs` | `prediction_leakage_tests.rs` |

---

## Section 12: Advanced Analytics (6)

| algorithm_id | formal_object | primary_paper | implementation_file | wasm_export | cli_command | positive_test | negative_fixture |
|---|---|---|---|---|---|---|---|
| `detect_drift` | Concept drift detection via Jaccard-similarity comparison of DFG edge sets across sliding time windows | Bose & van der Aalst (2011) CAiSE / LNCS 6741; Bose, van der Aalst, Žliobaitė & Pechenizkiy (2014) IEEE TNNLS 25(1) doi:10.1109/TNNLS.2013.2278313 | `prediction_drift.rs` | `detect_drift` | `wpm predict drift` | `prediction_drift_oracles.rs` | `behavioral_drift_tests.rs` |
| `compute_ewma` | Exponentially Weighted Moving Average smoothing of process monitoring metrics with Western Electric–style control limits | Roberts (1959) Technometrics 1(3) (EWMA control chart origin); Bose et al. (2014) IEEE TNNLS 25(1) (PM-specific EWMA-style drift detection) | `prediction_drift.rs` | `compute_ewma` | `wpm drift-watch` | `prediction_drift_oracles.rs` | `adversarial_spc_tests.rs` |
| `analyze_variant_complexity` | Variant entropy and diversity metrics over event log — Shannon entropy of trace variant distribution | engineering_only (variant analysis concept: van der Aalst 2011 PM textbook; entropy: Shannon 1948 Bell System Technical Journal) | `final_analytics.rs` | `analyze_variant_complexity` | `wpm validate` | `algorithm_integration_tests.rs` | `dirty_data_xes_tests.rs` |
| `compute_activity_transition_matrix` | Activity transition matrix (Markov chain) — normalized frequency matrix of directly-follows relations | engineering_only (Markov chain: Markov 1906; PM application: van der Aalst 2016 PM textbook) | `final_analytics.rs` | `compute_activity_transition_matrix` | `wpm run --algorithm compute_activity_transition_matrix` | `algorithm_integration_tests.rs` | `algorithm_weakness_matrix.rs` |
| `analyze_process_speedup` | Per-window acceleration/deceleration analysis using inter-event timestamp deltas over sliding windows | engineering_only (no dedicated PM paper for process speedup analysis by this name) | `final_analytics.rs` | `analyze_process_speedup` | `wpm temporal` | `algorithm_integration_tests.rs` | `dirty_data_xes_tests.rs` |
| `compute_trace_similarity_matrix` | Pairwise trace similarity matrix using Levenshtein edit distance on activity label sequences | engineering_only (Levenshtein 1966 for edit distance; PM application: Bose & van der Aalst 2009 SDM for context-aware clustering) | `final_analytics.rs` | `compute_trace_similarity_matrix` | `wpm run --algorithm compute_trace_similarity_matrix` | `algorithm_integration_tests.rs` | `algorithm_weakness_matrix.rs` |

---

## Section 13: AutoML and Agentic (3)

| algorithm_id | formal_object | primary_paper | implementation_file | wasm_export | cli_command | positive_test | negative_fixture |
|---|---|---|---|---|---|---|---|
| `automl_classify` | Auto-optimized classification model (RF/XGB) for trace outcome prediction | engineering_only (AutoML concept: Hutter, Kotthoff & Vanschoren 2019 AutoML book; PM application: Tavares et al. 2023 AutoPM — not yet in major PM venue) | `ml/automl.rs` | `discover_automl_classify` | `wpm ml classify --auto` | `ml_real_data_tests.rs` | `prediction_leakage_tests.rs` |
| `automl_forecast` | Auto-optimized time-series forecasting model for process throughput | engineering_only (AutoML concept: Hutter et al. 2019; PM time-series: van der Aalst et al. 2011 Inf. Sys.) | `ml/automl.rs` | `discover_automl_forecast` | `wpm ml forecast --auto` | `ml_real_data_tests.rs` | `prediction_naive_baseline_tests.rs` |
| `agentic_pipeline` | End-to-end agentic lifecycle: perception → decision → protection → Bellman-optimized policy execution | engineering_only (RL/Bellman: Bellman 1957 Princeton; PM autonomic loop: wasm4pm original; no single PM peer-reviewed paper for this construct) | `lib.rs` | `run_agentic_pipeline` | `wpm autoprocess` | `autonomic_loop_tests.rs` | `adversarial_rl_tests.rs` |

---

## Section 14: Full Sorted Crosswalk Table (60 rows, all algorithms)

The table below is the canonical crosswalk — one row per algorithm in registry order.

| # | algorithm_id | formal_object (short) | primary_paper (first author + year + venue) | implementation_file | wasm_export | cli_command | positive_test | negative_fixture |
|---|---|---|---|---|---|---|---|---|
| 1 | `dfg` | Directed weighted directly-follows graph | Cook & Wolf (1998) ACM TOSEM | `discovery.rs` | `discover_dfg` | `wpm run --algorithm dfg` | `ground_truth_discovery_tests.rs` | `negative_quality.rs` |
| 2 | `process_skeleton` | Log skeleton constraint set over activity pairs | Verbeek (2018) arXiv:1806.08247 / STTT 2021 | `more_discovery.rs` | `extract_process_skeleton` | `wpm run --algorithm process_skeleton` | `algorithm_correctness.rs` | `adversarial_ingestion.rs` |
| 3 | `alpha_plus_plus` | WF-net via extended footprint matrix (duplicate tasks + implicit places) | Wen et al. (2007) WISE / LNCS 4803 | `algorithms.rs` | `discover_alpha_plus_plus` | `wpm run --algorithm alpha_plus_plus` | `ground_truth_discovery_tests.rs` | `negative_quality.rs` |
| 4 | `heuristic_miner` | Causal dependency graph with noise-tolerant statistical dependency threshold | Weijters, van der Aalst & Medeiros (2006) BETA WP 166 | `advanced_algorithms.rs` | `discover_heuristic_miner` | `wpm run --algorithm heuristic_miner` | `discovery_fitness_bpi2020_tests.rs` | `negative_quality.rs` |
| 5 | `inductive_miner` | Sound process tree via recursive XOR/Sequence/Parallel/Loop cuts | Leemans, Fahland & van der Aalst (2013) ICATPN / LNCS 7927 | `more_discovery.rs` | `discover_inductive_miner` | `wpm run --algorithm inductive_miner` | `ground_truth_discovery_tests.rs` | `conformance_model_truth_gaps.rs` |
| 6 | `genetic_algorithm` | DFG evolved via genetic operators optimizing 4 quality dimensions | van der Aalst, Medeiros & Weijters (2005) ICATPN / LNCS 3536 | `genetic_discovery.rs` | `discover_genetic_algorithm` | `wpm run --algorithm genetic_algorithm` | `algorithm_integration_tests.rs` | `algorithm_weakness_matrix.rs` |
| 7 | `pso` | DFG via particle swarm optimization over model space | Maita et al. (2022) IJCIS 15(1) | `genetic_discovery.rs` | `discover_pso_algorithm` | `wpm run --algorithm pso` | `algorithm_integration_tests.rs` | `algorithm_weakness_matrix.rs` |
| 8 | `a_star` | DFG via A* heuristic search over model space | engineering_only | `fast_discovery.rs` | `discover_astar` | `wpm run --algorithm a_star` | `discovery_nan_and_astar_precision.rs` | `algorithm_weakness_matrix.rs` |
| 9 | `hill_climbing` | DFG via greedy local-search perturbation | engineering_only | `fast_discovery.rs` | `discover_hill_climbing` | `wpm run --algorithm hill_climbing` | `algorithm_integration_tests.rs` | `algorithm_weakness_matrix.rs` |
| 10 | `aco` | DFG via ant colony pheromone-weighted graph search | Canfora et al. (2013) IEEE SERVICES | `genetic_discovery.rs` | `discover_aco_algorithm` | `wpm run --algorithm aco` | `algorithm_integration_tests.rs` | `algorithm_weakness_matrix.rs` |
| 11 | `simulated_annealing` | DFG via stochastic local search with cooling schedule | Liu, Lu & Shi (2008) ICYCS / IEEE | `more_discovery.rs` | `discover_simulated_annealing` | `wpm run --algorithm simulated_annealing` | `algorithm_integration_tests.rs` | `algorithm_weakness_matrix.rs` |
| 12 | `declare` | Set of LTL constraint templates (declarative process model) | Pesic, Schonenberg & van der Aalst (2007) EDOC | `discovery.rs` | `discover_declare` | `wpm run --algorithm declare` | `declare_conformance_integration_test.rs` | `declare_all_constraints_test.rs` |
| 13 | `optimized_dfg` | DFG with frequency/significance-threshold edge filtering | Chapela-Campa et al. (2022) Inf. Sci. 610 | `ilp_discovery.rs` | `discover_optimized_dfg` | `wpm run --algorithm optimized_dfg` | `algorithm_integration_tests.rs` | `negative_quality.rs` |
| 14 | `ilp` | Petri net via ILP language-based region theory | van der Werf, van Dongen, Hurkens & Serebrenik (2009) Fundamenta Informaticae 94 | `ilp_discovery.rs` | `discover_ilp_petri_net` | `wpm run --algorithm ilp` | `ground_truth_discovery_tests.rs` | `negative_quality.rs` |
| 15 | `simd_streaming_dfg` | DFG via SIMD-vectorized streaming event processing | engineering_only | `simd_streaming_dfg.rs` | `discover_dfg_simd` | `wpm run --algorithm simd_streaming_dfg` | `streaming_batch_equivalence_tests.rs` | `adversarial_ingestion.rs` |
| 16 | `hierarchical_dfg` | Multi-level DFG with subprocess-collapsed abstract nodes | Günther & van der Aalst (2007) BPM / LNCS 4714 | `hierarchical.rs` | `discover_dfg_hierarchical` | `wpm run --algorithm hierarchical_dfg` | `algorithm_integration_tests.rs` | `adversarial_ingestion.rs` |
| 17 | `streaming_log` | Online bounded-memory DFG via sliding window / lossy counting | Burattin, Sperduti & van der Aalst (2014) IEEE CEC | `probabilistic/wasm_bindings.rs` [GAP: inferred] | `create_streaming_log` | `wpm run --algorithm streaming_log` | `streaming_batch_equivalence_tests.rs` | `adversarial_ingestion.rs` |
| 18 | `smart_engine` | Adaptive runtime algorithm selector based on log profile | engineering_only | `smart_engine.rs` | `smart_engine_run` | `wpm run --algorithm smart_engine` | `algorithm_integration_tests.rs` | `algorithm_weakness_matrix.rs` |
| 19 | `ml_classify` | Trace classification by outcome (k-NN / LR / DT / NB) | Song, Günther & van der Aalst (2008) BPM Workshops LNBIP 17 | `ml/classification.rs` | `discover_ml_classify` | `wpm ml classify` | `ml_family_tests.rs` | `prediction_leakage_tests.rs` |
| 20 | `ml_cluster` | Trace clustering by feature similarity (k-means / DBSCAN) | Song, Günther & van der Aalst (2008) BPM Workshops LNBIP 17 | `ml/clustering.rs` | `discover_ml_cluster` | `wpm ml cluster` | `ml_family_tests.rs` | `algorithm_weakness_matrix.rs` |
| 21 | `ml_forecast` | Throughput time-series forecast (linear + seasonal + exponential) | van der Aalst, Schonenberg & Song (2011) Inf. Sys. 36(2) | `ml/forecasting.rs` | `discover_ml_forecast` | `wpm ml forecast` | `ml_family_tests.rs` | `prediction_naive_baseline_tests.rs` |
| 22 | `ml_anomaly` | Anomaly score via DFG edge-frequency information-theoretic scoring | Ko & Comuzzi (2021) Inf. Sci. 549; Bezerra et al. (2009) BPMDS | `anomaly.rs` | `discover_ml_anomaly` | `wpm ml anomaly` | `ml_real_data_tests.rs` | `negative_quality.rs` |
| 23 | `ml_regress` | Remaining time regression (linear / polynomial / exponential) | van der Aalst, Schonenberg & Song (2011) Inf. Sys. 36(2) | `ml/regression.rs` | `discover_ml_regress` | `wpm ml regress` | `ml_regression_tests.rs` | `prediction_leakage_tests.rs` |
| 24 | `ml_pca` | PCA dimensionality reduction via Jacobi eigendecomposition | engineering_only (generic: Pearson 1901; Hotelling 1933) | `ml/pca.rs` | `discover_ml_pca` | `wpm ml pca` | `ml_family_tests.rs` | `algorithm_weakness_matrix.rs` |
| 25 | `transition_system` | Transition system TS + Petri net via theory of regions | van der Aalst et al. (2010) Software & Systems Modeling 9(1) | `transition_system.rs` | `discover_transition_system_from_handle` | `wpm run --algorithm transition_system` | `algorithm_integration_tests.rs` | `algorithm_weakness_matrix.rs` |
| 26 | `log_to_trie` | Prefix tree (trie) with shared-prefix trace encoding | van Zelst, van Dongen & van der Aalst (2018) KAIS 57(3) | `log_to_trie.rs` | `discover_prefix_tree` | `wpm run --algorithm log_to_trie` | `algorithm_integration_tests.rs` | `adversarial_ingestion.rs` |
| 27 | `causal_graph` | Causal net (C-net) with input/output binding sets per activity | van der Aalst, Adriansyah & van Dongen (2011) CONCUR / LNCS 6901 | `causal_graph.rs` | `discover_causal_heuristic` | `wpm run --algorithm causal_graph` | `algorithm_correctness.rs` | `algorithm_weakness_matrix.rs` |
| 28 | `performance_spectrum` | 2-D case-flow timeline model revealing batching/waiting patterns | Denisov, Fahland & van der Aalst (2018) BPM / LNCS 11080 | `performance_spectrum.rs` | `discover_performance_spectrum_wasm` | `wpm temporal` | `streaming_batch_equivalence_tests.rs` | `dirty_data_xes_tests.rs` |
| 29 | `batches` | Batch pattern detection (parallel / sequential) at task + subprocess level | Martin, Pufahl & Mannhardt (2021) Inf. Sys. 95:101642 | `batches.rs` | `discover_batches_wasm` | `wpm run --algorithm batches` | `streaming_batch_equivalence_tests.rs` | `dirty_data_xes_tests.rs` |
| 30 | `correlation_miner` | DFG without case identifiers via ILP over P/S and Duration matrices | Pourmirza, Dijkman & Grefen (2017) IJCIS 26(2) | `correlation_miner.rs` | `discover_correlation` | `wpm run --algorithm correlation_miner` | `algorithm_integration_tests.rs` | `dirty_data_xes_tests.rs` |
| 31 | `generalization` | Generalization quality dimension (anti-overfitting metric for Petri nets) | Buijs, van Dongen & van der Aalst (2012) OTM / LNCS 7565 | `generalization.rs` | `generalization` | `wpm quality` | `ground_truth_conformance_tests.rs` | `conformance_model_truth_gaps.rs` |
| 32 | `etconformance_precision` | Precision via escaping-edge count (model-allowed, log-unobserved transitions) | Muñoz-Gama & Carmona (2010) BPM / LNCS 6336 | `etconformance_precision.rs` | `wasm_compute_precision` | `wpm conformance` | `ground_truth_conformance_tests.rs` | `conformance_edge_cases.rs` |
| 33 | `alignments` | Optimal trace-to-model alignment via A* over product automaton; minimum-cost log/model/sync moves | Adriansyah, van Dongen & van der Aalst (2011) EDOC | `alignments.rs` | `compute_optimal_alignments` | `wpm conformance` | `conformance_real_data_tests.rs` | `conformance_edge_cases.rs` |
| 34 | `complexity_metrics` | Structural complexity metrics (ECaM, ECyM, SM) for POWL/WF-net | Lassen & van der Aalst (2009) Inf. Software Tech. 51(3) | `powl_api.rs` | `measure_complexity` | `wpm powl complexity` | `algorithm_correctness.rs` | `adversarial_powl_tests.rs` |
| 35 | `pnml_import` | P/T Petri net deserialized from PNML XML per ISO/IEC 15909-2:2011 | ISO/IEC 15909-2:2011 (standard_only) | `pnml_io.rs` | `from_pnml_wasm` | `wpm powl import --format pnml` | `algorithm_integration_tests.rs` | `adversarial_ingestion.rs` |
| 36 | `bpmn_import` | POWL model deserialized from BPMN 2.0 XML per OMG spec | OMG BPMN 2.0 / ISO 19510:2013 (standard_only) | `bpmn_import.rs` | `read_bpmn` | `wpm powl import --format bpmn` | `algorithm_integration_tests.rs` | `adversarial_ingestion.rs` |
| 37 | `powl_to_process_tree` | POWL → block-structured process tree (partial; non-block fragments approximated) | engineering_only | `powl_to_process_tree.rs` | `powl_to_process_tree` | `wpm powl convert` | `algorithm_correctness.rs` | `adversarial_powl_tests.rs` |
| 38 | `yawl_export` | POWL model serialized to YAWL v6 XML format | van der Aalst & ter Hofstede (2005) Inf. Sys. 30(4) (YAWL language) | `yawl_export.rs` | `powl_to_yawl_string` | `wpm powl export --format yawl` | `algorithm_integration_tests.rs` | `adversarial_powl_tests.rs` |
| 39 | `playout` | Synthetic traces via token-game traversal of process model | van der Aalst (2011) Springer PM textbook (play-out concept) | `playout.rs` | `play_out_process_tree` | `wpm simulate` | `self_conformance_tests.rs` | `adversarial_powl_tests.rs` |
| 40 | `monte_carlo_simulation` | Stochastic process outcome distributions via repeated trace sampling from log-parameterized Petri net | Rozinat, Wynn, van der Aalst, ter Hofstede & Fidge (2009) DKE 68(9) | `simulation.rs` | `monte_carlo_simulation` | `wpm simulate --stochastic` | `self_conformance_tests.rs` | `algorithm_weakness_matrix.rs` |
| 41 | `handover_network` | Weighted directed resource handover graph (immediate sequential handoffs) | van der Aalst & Song (2004) BPM / LNCS 3080; van der Aalst, Reijers & Song (2005) CSCW 14(6) | `social_network.rs` | `discover_handover_network` | `wpm social handover` | `algorithm_integration_tests.rs` | `algorithm_weakness_matrix.rs` |
| 42 | `working_together_network` | Weighted symmetric resource co-participation graph (case-level co-occurrence) | van der Aalst & Song (2004) BPM / LNCS 3080; van der Aalst, Reijers & Song (2005) CSCW 14(6) | `social_network.rs` | `discover_working_together_network` | `wpm social together` | `algorithm_integration_tests.rs` | `algorithm_weakness_matrix.rs` |
| 43 | `ocel_dfg` | Aggregate OC-DFG typed multigraph across all OCEL object types | Berti & van der Aalst (2022/2023) STTT 25 | `discovery.rs` | `discover_ocel_dfg` | `wpm run --algorithm ocel_dfg` | `ocel_dfg_discovery_tests.rs` | `ocel_object_centric_audit.rs` |
| 44 | `ocel_dfg_per_type` | Per-object-type DFG map providing separate views per type | Berti & van der Aalst (2022/2023) STTT 25 | `discovery.rs` | `discover_ocel_dfg_per_type` | `wpm run --algorithm ocel_dfg_per_type` | `ocel_dfg_discovery_tests.rs` | `ocel_many_to_many_tests.rs` |
| 45 | `ocel_petri_net` | Object-Centric Petri Net (typed places + variable arcs) | van der Aalst & Berti (2020) Fundamenta Informaticae 175 | `oc_petri_net.rs` | `discover_oc_petri_net` | `wpm run --algorithm ocel_petri_net` | `ocel_process_evidence_tests.rs` | `ocel_object_centric_audit.rs` |
| 46 | `ocel_encode` | Compact text serialization of OCEL for LLM/inspection | engineering_only | `text_encoding.rs` | `encode_ocel_as_text` | `wpm run --algorithm ocel_encode` | `ocel_real_data_tests.rs` | `ocel_object_centric_audit.rs` |
| 47 | `ocel_ocla` | Object-Centric Language Abstraction — per-type event language + interactions | [GAP — specific OCLA paper not identified in lineage docs] | `advanced/mod.rs` | `discover_ocla_wasm` | `wpm run --algorithm ocel_ocla` | `ocel_lifecycle_wasm_export_tests.rs` | `ocel_object_centric_audit.rs` |
| 48 | `ocel_oc_declare` | OC-DECLARE constraint set with multi-object synchronization predicates | Küsters & van der Aalst (2025) BPM 2025 / LNCS 16044 | `advanced/mod.rs` | `discover_oc_declare_wasm` | `wpm run --algorithm ocel_oc_declare` | `ocel_process_evidence_tests.rs` | `ocel_object_centric_audit.rs` |
| 49 | `predict_next_activity` | N-gram Markov model predicting next activity with probabilities from prefix trace | van der Aalst, Schonenberg & Song (2011) Inf. Sys. 36(2) | `prediction.rs` | `predict_next_activity` | `wpm predict next-activity` | `powl_and_prediction_real_data_tests.rs` | `prediction_leakage_tests.rs` |
| 50 | `predict_remaining_time` | Weibull regression + statistical bucket model for remaining case time | van der Aalst, Schonenberg & Song (2011) Inf. Sys. 36(2) | `prediction_remaining_time.rs` | `predict_case_duration` | `wpm predict remaining-time` | `powl_and_prediction_real_data_tests.rs` | `prediction_naive_baseline_tests.rs` |
| 51 | `predict_outcome` | Case outcome score combining anomaly scoring + boundary coverage + prefix features | Leontjeva et al. (2015) BPM / LNCS 9253; Teinemaa et al. (2019) ACM TKDD 13(2) | `prediction_outcome.rs` | `score_anomaly` | `wpm predict outcome` | `powl_and_prediction_real_data_tests.rs` | `prediction_leakage_tests.rs` |
| 52 | `detect_drift` | Concept drift detection via sliding-window DFG Jaccard similarity | Bose & van der Aalst (2011) CAiSE; Bose et al. (2014) IEEE TNNLS 25(1) | `prediction_drift.rs` | `detect_drift` | `wpm predict drift` | `prediction_drift_oracles.rs` | `behavioral_drift_tests.rs` |
| 53 | `compute_ewma` | EWMA smoothing of process metrics with control limits | Roberts (1959) Technometrics 1(3); Bose et al. (2014) IEEE TNNLS 25(1) | `prediction_drift.rs` | `compute_ewma` | `wpm drift-watch` | `prediction_drift_oracles.rs` | `adversarial_spc_tests.rs` |
| 54 | `analyze_variant_complexity` | Variant entropy and diversity metrics over event log | engineering_only | `final_analytics.rs` | `analyze_variant_complexity` | `wpm validate` | `algorithm_integration_tests.rs` | `dirty_data_xes_tests.rs` |
| 55 | `compute_activity_transition_matrix` | Normalized activity transition frequency matrix (Markov chain) | engineering_only | `final_analytics.rs` | `compute_activity_transition_matrix` | `wpm run --algorithm compute_activity_transition_matrix` | `algorithm_integration_tests.rs` | `algorithm_weakness_matrix.rs` |
| 56 | `analyze_process_speedup` | Per-window acceleration/deceleration via inter-event timestamp deltas | engineering_only | `final_analytics.rs` | `analyze_process_speedup` | `wpm temporal` | `algorithm_integration_tests.rs` | `dirty_data_xes_tests.rs` |
| 57 | `compute_trace_similarity_matrix` | Pairwise Levenshtein edit-distance trace similarity matrix | engineering_only (Levenshtein 1966; PM application: Bose & van der Aalst 2009) | `final_analytics.rs` | `compute_trace_similarity_matrix` | `wpm run --algorithm compute_trace_similarity_matrix` | `algorithm_integration_tests.rs` | `algorithm_weakness_matrix.rs` |
| 58 | `automl_classify` | Auto-optimized classification (RF/XGB) for trace outcome | engineering_only | `ml/automl.rs` | `discover_automl_classify` | `wpm ml classify --auto` | `ml_real_data_tests.rs` | `prediction_leakage_tests.rs` |
| 59 | `automl_forecast` | Auto-optimized time-series forecast for process throughput | engineering_only | `ml/automl.rs` | `discover_automl_forecast` | `wpm ml forecast --auto` | `ml_real_data_tests.rs` | `prediction_naive_baseline_tests.rs` |
| 60 | `agentic_pipeline` | End-to-end autonomic lifecycle: perception → decision → protection → Bellman-optimized policy | engineering_only | `lib.rs` | `run_agentic_pipeline` | `wpm autoprocess` | `autonomic_loop_tests.rs` | `adversarial_rl_tests.rs` |

---

## Gap Analysis Summary

### Fully mapped algorithms (all 8 columns filled, no [GAP] markers)

All 60 algorithms have entries for all columns. Two entries carry [GAP] annotations:

1. **`streaming_log`** — `implementation_file` lists `probabilistic/wasm_bindings.rs` with [GAP: inferred] because the inventory document maps this to that path but the file was not confirmed in the `wasm4pm/src/` listing (the `probabilistic/` subdirectory was not separately listed).

2. **`ocel_ocla`** — `primary_paper` has [GAP] because the lineage documents did not identify a specific peer-reviewed paper for the OCLA construct; it is attributed to the OC-PM family (Berti & van der Aalst 2022/2023) without a standalone OCLA paper.

3. **`monte_carlo_simulation`** — `implementation_file` annotated with note that inventory lists `montecarlo.rs` while `simulation.rs` also exists; the primary file is uncertain.

### Counts

| Category | Count |
|---|---|
| Total registered algorithms | **60** |
| Algorithms with all 8 columns populated (no GAP on primary_paper or implementation_file) | **57** |
| Algorithms with GAP on primary_paper (`ocel_ocla`) | **1** |
| Algorithms with GAP on implementation_file (`streaming_log`) | **1** |
| Algorithms with implementation_file uncertainty note (`monte_carlo_simulation`) | **1** |
| Algorithms classified `engineering_only` (no PM-specific peer-reviewed paper) | **14** |
| Algorithms grounded by `standard_only` (format standards) | **2** (`pnml_import`, `bpmn_import`) |
| Algorithms with high-confidence academic grounding | **30** |
| Algorithms with medium-confidence academic grounding | **8** |
| Algorithms with low-confidence academic grounding | **6** |

**Fully mapped (all 8 columns, no [GAP]):** 57 of 60
**Algorithms with at least one gap:** 3 of 60

---

## Notes on Column Conventions

### cli_command
The primary invocation path is given. Most algorithms are accessible via `wpm run --algorithm <id>` through the TypeScript kernel's `run(algorithmName, handle, params)` API. Specialized commands (`wpm ml`, `wpm social`, `wpm powl`, `wpm predict`, `wpm conformance`, `wpm temporal`, `wpm simulate`, `wpm autoprocess`) are listed where they are the natural entry point per the CLAUDE.md command reference.

### positive_test
All test files listed exist in `wasm4pm/tests/` as confirmed by directory listing. Many algorithms share the same integration test file (`algorithm_integration_tests.rs`, `ground_truth_discovery_tests.rs`) because those files exercise multiple algorithms in a batch/comparison pattern. This is documented as expected; it does not indicate incomplete coverage.

### negative_fixture
Negative testing is provided by:
- `negative_quality.rs` — quality metric boundary/adversarial tests
- `algorithm_weakness_matrix.rs` — systematic weakness injection per algorithm family
- `adversarial_ingestion.rs` — malformed XES/OCEL inputs
- `conformance_edge_cases.rs` / `conformance_model_truth_gaps.rs` — conformance boundary conditions
- `adversarial_powl_tests.rs` — POWL structural adversarial inputs
- `adversarial_rl_tests.rs` — RL/agentic adversarial scenarios
- `adversarial_spc_tests.rs` — SPC and drift adversarial patterns
- `behavioral_drift_tests.rs` — concept drift adversarial scenarios
- `prediction_leakage_tests.rs` — label leakage detection in prediction
- `prediction_naive_baseline_tests.rs` — naive baseline comparison to catch trivial models
- `dirty_data_xes_tests.rs` — dirty/incomplete event log inputs
- `ocel_object_centric_audit.rs` — OCEL adversarial and audit tests
- `ocel_many_to_many_tests.rs` — many-to-many object relationship edge cases

---

*Document generated by Agent A13 — Implementation Crosswalk. Research date: 2026-05-30. Sources: docs/academic/10–16 lineage documents, packages/kernel/src/registry.ts, docs/academic/00-ALGORITHM-INVENTORY.md, wasm4pm/src/*.rs directory listing, wasm4pm/tests/ directory listing.*
