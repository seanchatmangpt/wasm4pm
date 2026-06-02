# Algorithm Historical Lineage — ACADEMIC-LINEAGE-001

**Gate:** ACADEMIC-LINEAGE-001
**Date:** 2026-05-30
**Algorithm count:** 60 (source: `packages/kernel/src/registry.ts`)
**TOML is the authoritative machine-readable record.** This document is the human-readable view.

Sources used: lineage documents 10–16, FIRST_CLAIM_AUDIT.md (adversary review A12), IMPLEMENTATION_CROSSWALK.md (A13), 00-ALGORITHM-INVENTORY.md (A11), ACADEMIC_GAPS.md.

First-claim verdicts from adversary review: UPHELD | WEAKENED | UNCERTAIN | OVERTURNED (none overturned).

---

## Summary Statistics

| Metric | Count |
|---|---|
| Total registered algorithms | **60** |
| Fully classified (all fields) | **60** |
| High confidence | **14** |
| Medium confidence | **16** |
| Low confidence | **4** |
| Engineering_only confidence | **26** |
| Direct classification | **17** |
| Derived classification | **14** |
| Engineering_only classification | **24** |
| Consumer_contract classification | **4** |
| Future classification | **0** |
| First-claim: UPHELD | **33** |
| First-claim: WEAKENED | **10** |
| First-claim: UNCERTAIN | **2** |
| First-claim: OVERTURNED | **0** |
| P1 determinism bugs (code defects) | **3** |

---

## Family: Directly-Follows Graph (DFG)

### `dfg`

**Formal object:** Directed weighted graph G=(A,F,W); A=activities, F⊆A×A directly-follows relation, W:F→ℕ frequencies

**Classification:** direct | Confidence: medium

**First peer-reviewed:** Cook & Wolf, ICSE 1995 (adversary correction: 1998 TOSEM is journal extension, not the first)
**Canonical:** Cook & Wolf (1998) ACM TOSEM 7(3); van der Aalst (2016) Process Mining textbook

**Implementation:** `wasm4pm/src/discovery.rs` | WASM export: `discover_dfg`

**First-claim verdict:** WEAKENED — first_peer_reviewed was incorrectly cited as 1998; corrected to ICSE 1995.

---

### `process_skeleton`

**Formal object:** Log skeleton: constraint set over activity pairs {always_before, always_after, equivalence, never_together, activity_count}

**Classification:** direct | Confidence: medium

**First known:** Verbeek & Medeiros de Carvalho (2018) arXiv:1806.08247
**First peer-reviewed:** Verbeek (2021) STTT journal
**Canonical:** Verbeek (2021) STTT 24(4)

**Implementation:** `wasm4pm/src/more_discovery.rs` | WASM export: `extract_process_skeleton`

**First-claim verdict:** UPHELD. arXiv 2018 as first_known; STTT 2021 as first_peer_reviewed. Correct structure.

---

### `optimized_dfg`

**Formal object:** DFG with frequency/significance-threshold edge filtering; minimal-edge sound spanning subgraph

**Classification:** engineering_only | Confidence: engineering_only

**Closest ancestors:** Günther & van der Aalst (2007) BPM/Fuzzy Mining; Chapela-Campa et al. (2022) Information Sciences 610

**Implementation:** `wasm4pm/src/ilp_discovery.rs` | WASM export: `discover_optimized_dfg`

**Note:** DOI inconsistency between lineage docs: 10.1016/j.ins.2022.07.178 vs .07.170 — must be resolved.

---

### `simd_streaming_dfg`

**Formal object:** DFG via SIMD-vectorized streaming per-event processing

**Classification:** engineering_only | Confidence: engineering_only

**Implementation:** `wasm4pm/src/simd_streaming_dfg.rs` | WASM export: `discover_dfg_simd`

**CRITICAL BUG (P1):** HashMap iteration order is non-deterministic across runs. Blocks ACADEMIC-COVERAGE-001 determinism oracle.

---

### `hierarchical_dfg`

**Formal object:** Multi-level DFG with subprocess-collapsed abstract nodes enabling drill-down views

**Classification:** engineering_only | Confidence: engineering_only

**Closest ancestor:** Günther & van der Aalst (2007) BPM/Fuzzy Mining

**Implementation:** `wasm4pm/src/hierarchical.rs` | WASM export: `discover_dfg_hierarchical`

---

## Family: Alpha/WF-net Discovery

### `alpha_plus_plus`

**Formal object:** Sound WF-net via extended footprint matrix handling short loops, self-loops, implicit places, and duplicate tasks

**Classification:** direct | Confidence: medium

**First peer-reviewed:** Wen, van der Aalst, Wang, Sun (2007) WISE, Springer LNCS 4803
**Canonical:** Wen et al. (2007) WISE

**Implementation:** `wasm4pm/src/algorithms.rs` | WASM export: `discover_alpha_plus_plus`

**Note:** Alpha (TKDE 2004) → Alpha+ (de Medeiros 2004 BETA WP 113) → Alpha++ (Wen 2007). Do not conflate variants.

**First-claim verdict:** UPHELD.

---

### `declare`

**Formal object:** Set of LTL-formula constraint templates representing declarative process model for flexible processes

**Classification:** direct | Confidence: high

**First known:** Pesic & van der Aalst (2006) BPM workshop, LNCS 4103
**First peer-reviewed:** Pesic, Schonenberg & van der Aalst (2007) EDOC
**Canonical:** Pesic PhD thesis (2008, TU/e)

**Implementation:** `wasm4pm/src/discovery.rs` | WASM export: `discover_declare`

**First-claim verdict:** UNCERTAIN — 2006 BPM workshop (LNCS) may be peer-reviewed; if so first_peer_reviewed = 2006.

---

## Family: Heuristic/Dependency Discovery

### `heuristic_miner`

**Formal object:** Causal dependency graph (heuristics net) via statistical dependency measures over directly-follows matrix; noise-tolerant

**Classification:** direct | Confidence: high

**First peer-reviewed:** Weijters & van der Aalst (2003) Integrated Computer-Aided Engineering (ICAE) journal
**Canonical:** Weijters & van der Aalst (2003) ICAE; Weijters & Ribeiro (2011) IEEE CIDM

**Implementation:** `wasm4pm/src/advanced_algorithms.rs` | WASM export: `discover_heuristic_miner`

**First-claim verdict:** WEAKENED — BETA WP 166 (2006) is a technical report, NOT peer-reviewed. The 2003 ICAE journal IS the first_peer_reviewed and first_known.

---

### `causal_graph`

**Formal object:** Causal net (C-net): directed graph where each activity has sets of possible input/output bindings capturing split/join behaviour

**Classification:** derived | Confidence: low

**First peer-reviewed:** van der Aalst, Adriansyah, van Dongen (2011) CONCUR, LNCS 6901
**Canonical:** van der Aalst, Adriansyah, van Dongen (2011) CONCUR

**Implementation:** `wasm4pm/src/causal_graph.rs` | WASM export: `discover_causal_heuristic`

**Note:** wasm4pm naming ('causal graph') differs from canonical term ('causal net').

**First-claim verdict:** UPHELD.

---

### `correlation_miner`

**Formal object:** Process model (DFG) discovered without case identifiers via ILP over Precede/Succeed and Duration matrices from raw event streams

**Classification:** derived | Confidence: medium

**First peer-reviewed:** Pourmirza, Dijkman, Grefen (2015) CoopIS, LNCS 9382
**Canonical:** Pourmirza, Dijkman, Grefen (2017) IJCIS 26(2)

**Implementation:** `wasm4pm/src/correlation_miner.rs` | WASM export: `discover_correlation`

**First-claim verdict:** WEAKENED — CoopIS 2015 IS peer-reviewed and IS the first_peer_reviewed. IJCIS 2017 is the canonical journal extension.

---

## Family: Inductive/Region-Theory Discovery

### `inductive_miner`

**Formal object:** Process tree T with operators {→,×,∧,↺} guaranteed sound via recursive log partitioning using XOR/Sequence/Parallel/Loop cuts

**Classification:** direct | Confidence: high

**First peer-reviewed:** Leemans, Fahland, van der Aalst (2013) ICATPN, LNCS 7927
**Canonical:** Leemans et al. (2013) ICATPN; Leemans et al. (2014) Petri Nets (incomplete variant)

**Implementation:** `wasm4pm/src/more_discovery.rs` | WASM export: `discover_inductive_miner`

**First-claim verdict:** UPHELD. Confirm which variant is implemented: IM vs IMf vs IMc.

---

### `ilp`

**Formal object:** Petri net via ILP language-based region theory finding minimal regions separating observed from unobserved traces

**Classification:** direct | Confidence: medium

**First peer-reviewed:** van der Werf, van Dongen, Hurkens, Serebrenik (2008) ICATPN
**Canonical:** van der Werf et al. (2009) Fundamenta Informaticae 94(3-4)

**Implementation:** `wasm4pm/src/ilp_discovery.rs` | WASM export: `discover_ilp_petri_net`

**First-claim verdict:** WEAKENED — ICATPN 2008 is the first_peer_reviewed; Fundamenta 2009 is the canonical journal extension.

---

### `transition_system`

**Formal object:** Transition system TS=(S,Σ,→,s₀) from event log via sliding-window state abstraction; Petri net synthesized via theory of regions

**Classification:** direct | Confidence: medium

**First known:** van der Aalst et al. (2006) BPM Center Report BPM-06-30
**First peer-reviewed:** van der Aalst et al. (2010) Software and Systems Modeling 9(1)

**Implementation:** `wasm4pm/src/transition_system.rs` | WASM export: `discover_transition_system_from_handle`

**First-claim verdict:** UPHELD.

---

## Family: Metaheuristic Discovery

### `genetic_algorithm`

**Formal object:** DFG evolved via genetic operators over population of candidate models optimizing fitness/precision/generalization/simplicity

**Classification:** derived | Confidence: medium

**First known:** van der Aalst, Medeiros, Weijters (2004) BETA WP 124
**First peer-reviewed:** van der Aalst, Medeiros, Weijters (2005) ICATPN, LNCS 3536
**Canonical:** de Medeiros et al. (2007) DAMI 14(2)

**Implementation:** `wasm4pm/src/genetic_discovery.rs` | WASM export: `discover_genetic_algorithm`

**WARNING:** Two ACO implementations in codebase with different parameter names.

**First-claim verdict:** UPHELD.

---

### `aco`

**Formal object:** DFG via ant colony optimization; artificial ants traverse pheromone-weighted process graph

**Classification:** derived | Confidence: medium

**First peer-reviewed:** Canfora, Di Penta, Esposito, Villani (2013) IEEE SERVICES
**Canonical:** Canfora et al. (2013) IEEE SERVICES

**Implementation:** `wasm4pm/src/genetic_discovery.rs` | WASM export: `discover_aco_algorithm`

**WARNING:** Two ACO implementations with different parameter names (discover_ant_colony vs discover_aco_algorithm).

**First-claim verdict:** UPHELD.

---

### `simulated_annealing`

**Formal object:** DFG via stochastic local search accepting deteriorating moves with decreasing probability (cooling schedule)

**Classification:** derived | Confidence: low

**First known (generic):** Kirkpatrick, Gelatt, Vecchi (1983) Science 220
**First peer-reviewed (PM-specific):** Liu, Lu, Shi (2008) ICYCS/IEEE

**Implementation:** `wasm4pm/src/more_discovery.rs` | WASM export: `discover_simulated_annealing`

**First-claim verdict:** UNCERTAIN — ICYCS 2008 is a minor venue; PM-specific SA claim plausible but not fully verified.

---

### `pso`

**Formal object:** DFG via particle swarm optimization; each particle encodes candidate process model as DFG adjacency

**Classification:** engineering_only | Confidence: engineering_only

**Closest paper:** Maita et al. (2022) IJCIS 15(1); Kennedy & Eberhart (1995) ICNN (generic PSO)

**Implementation:** `wasm4pm/src/genetic_discovery.rs` | WASM export: `discover_pso_algorithm`

---

### `a_star` / `hill_climbing`

**Classification:** engineering_only (both)

**a_star Implementation:** `wasm4pm/src/fast_discovery.rs` | WASM export: `discover_astar`
**hill_climbing Implementation:** `wasm4pm/src/fast_discovery.rs` | WASM export: `discover_hill_climbing`

**Notes:** No standalone PM-specific paper for either as discovery algorithms. A* in PM appears in conformance checking (Adriansyah et al. 2011).

---

## Family: Streaming and Engineering Utilities

### `simd_streaming_dfg` | `streaming_log` | `log_to_trie` | `smart_engine` | `optimized_dfg` | `hierarchical_dfg`

All classified **engineering_only**. See individual entries above and in TOML.

**CRITICAL BUGS (P1 determinism):**
- `simd_streaming_dfg`: HashMap iteration order non-deterministic
- `log_to_trie`: HashMap iteration over cases non-deterministic
- `playout`: unseeded fastrand — non-deterministic output

---

## Family: ML Process Mining

### `ml_classify`

**Formal object:** Classification of traces by outcome using k-NN, logistic regression, decision tree, or naive Bayes on extracted case-feature vectors

**Classification:** derived | Confidence: medium

**First peer-reviewed:** Song, Günther, van der Aalst (2008) BPM Workshops, LNBIP 17

**Implementation:** `wasm4pm/src/ml/classification.rs` | WASM export: `discover_ml_classify`

**Note:** Re-added after incorrect Phase 4 audit removal. WASM export confirmed.

---

### `ml_cluster`

**Formal object:** Partition of traces into homogeneous subsets using k-means or DBSCAN on activity/transition profile feature vectors

**Classification:** engineering_only | Confidence: engineering_only

**Closest paper:** Song, Günther, van der Aalst (2008) BPM Workshops; MacQueen (1967) k-means origin

**Implementation:** `wasm4pm/src/ml/clustering.rs` | WASM export: `discover_ml_cluster`

---

### `ml_forecast`

**Formal object:** Throughput time-series forecast using linear trend, autocorrelation seasonality, and optional exponential overlay

**Classification:** derived | Confidence: medium

**First peer-reviewed:** van der Aalst, Schonenberg, Song (2011) Information Systems 36(2)

**Implementation:** `wasm4pm/src/ml/forecasting.rs` | WASM export: `discover_ml_forecast`

---

### `ml_anomaly`

**Formal object:** Anomaly score per trace from DFG edge-frequency information-theoretic scoring (log2 edge-frequency; missing-edge cost=10)

**Classification:** engineering_only | Confidence: engineering_only

**Closest paper:** Bezerra, Wainer, van der Aalst (2009) BPMDS; Ko & Comuzzi (2021) Information Sciences 549

**Implementation:** `wasm4pm/src/anomaly.rs` | WASM export: `discover_ml_anomaly`

---

### `ml_regress`

**Formal object:** Prediction of remaining case cycle time using linear, polynomial, or exponential regression on trace prefix features

**Classification:** derived | Confidence: medium

**First peer-reviewed:** van der Aalst, Schonenberg, Song (2011) Information Systems 36(2)

**Implementation:** `wasm4pm/src/ml/regression.rs` | WASM export: `discover_ml_regress`

---

### `ml_pca`

**Formal object:** Dimensionality reduction of trace feature matrix using Principal Component Analysis

**Classification:** engineering_only | Confidence: engineering_only

**Closest paper (generic):** Pearson (1901) Philosophical Magazine; Hotelling (1933)

**Implementation:** `wasm4pm/src/ml/pca.rs` | WASM export: `discover_ml_pca`

---

## Family: Conformance Checking

### `alignments`

**Formal object:** Optimal alignment mapping each observed trace to nearest accepting run of a Petri net; cost function over log/model/synchronous moves; A* over product automaton

**Classification:** direct | Confidence: high

**First peer-reviewed:** Adriansyah, Sidorova, van Dongen (2011) ACSD (June 2011) — adversary correction from EDOC 2011
**Canonical:** Adriansyah PhD thesis (TU/e, 2014) — full formalization with optimizations

**Implementation:** `wasm4pm/src/alignments.rs` | WASM export: `compute_optimal_alignments`

**First-claim verdict:** WEAKENED — CRITICAL CORRECTION: ACSD 2011 (June) predates EDOC 2011 (August-September). first_peer_reviewed must be updated to ACSD 2011.

---

### `etconformance_precision`

**Formal object:** Precision metric via escaping-edge analysis: ratio of model-allowed transitions not observed in log at states reached during replay

**Classification:** direct | Confidence: high

**First peer-reviewed:** Muñoz-Gama & Carmona (2010) BPM, LNCS 6336
**Canonical:** Muñoz-Gama & Carmona (2010) BPM

**Implementation:** `wasm4pm/src/etconformance_precision.rs` | WASM export: `wasm_compute_precision`

**First-claim verdict:** UPHELD.

---

### `generalization`

**Formal object:** Generalization quality dimension: probability a process model generalizes beyond the training log

**Classification:** direct | Confidence: medium

**First peer-reviewed:** Buijs, van Dongen, van der Aalst (2012) OTM, LNCS 7565
**Canonical:** Buijs et al. (2012) OTM; van der Aalst (2016) Process Mining

**Implementation:** `wasm4pm/src/generalization.rs` | WASM export: `generalization`

**First-claim verdict:** UPHELD.

---

### `complexity_metrics`

**Formal object:** Structural complexity metrics for POWL/WF-net: Extended Cardoso Metric (ECaM), Extended Cyclomatic Metric (ECyM), Structuredness Metric (SM)

**Classification:** derived | Confidence: medium

**First peer-reviewed:** Lassen & van der Aalst (2009) Information and Software Technology 51(3)

**Implementation:** `wasm4pm/src/powl_api.rs` | WASM export: `measure_complexity`

**First-claim verdict:** UPHELD.

---

## Family: Import/Export/Conversion (Consumer Contracts)

### `pnml_import`

**Classification:** consumer_contract | Confidence: high

**Standard:** ISO/IEC 15909-2:2011 (Petri Net Markup Language)
**Note:** The number ISO/IEC 20481 appearing in some source docs is INCORRECT; the correct standard is 15909-2:2011.

**Implementation:** `wasm4pm/src/pnml_io.rs` | WASM export: `from_pnml_wasm`

---

### `bpmn_import`

**Classification:** consumer_contract | Confidence: high

**Standard:** OMG BPMN 2.0 / ISO/IEC 19510:2013
**Note:** WASM export is `read_bpmn()`, not `bpmn_import()` — naming divergence acknowledged.

**Implementation:** `wasm4pm/src/bpmn_import.rs` | WASM export: `read_bpmn`

---

### `yawl_export`

**Classification:** consumer_contract | Confidence: high

**Standard/Language:** van der Aalst & ter Hofstede (2005) Information Systems 30(4)

**Implementation:** `wasm4pm/src/powl/conversion/to_yawl.rs` | WASM export: `powl_to_yawl_string`

---

### `powl_to_process_tree`

**Classification:** engineering_only | Confidence: engineering_only

**Closest paper:** Kourani & van Zelst (2023) BPM, LNCS 14159 (defines POWL semantics and relationship to process trees)

**Implementation:** `wasm4pm/src/powl_api.rs` | WASM export: `powl_to_process_tree`

---

## Family: Simulation

### `playout`

**Formal object:** Deterministic or stochastic token-game traversal of process model generating synthetic conforming traces

**Classification:** derived | Confidence: medium

**Best available reference:** van der Aalst (2011) Springer Process Mining textbook (Section 7)

**Implementation:** `wasm4pm/src/playout.rs` | WASM export: `play_out_process_tree`

**CRITICAL BUG (P1):** Uses unseeded fastrand — non-deterministic output across runs. Blocks ACADEMIC-COVERAGE-001 determinism oracle.

---

### `monte_carlo_simulation`

**Formal object:** Stochastic simulation generating distributions of process outcomes by repeatedly sampling trace executions from log-parameterized Petri net

**Classification:** derived | Confidence: medium

**First peer-reviewed:** Wynn, Dumas, Fidge, ter Hofstede, van der Aalst (2008) BPM, LNCS 4928 — adversary correction from DKE 2009
**Canonical:** Rozinat, Wynn, van der Aalst, ter Hofstede, Fidge (2009) Data and Knowledge Engineering 68(9)

**Implementation:** `wasm4pm/src/montecarlo.rs` | WASM export: `monte_carlo_simulation`

**First-claim verdict:** WEAKENED — BPM 2008 precedes DKE 2009; first_peer_reviewed = Wynn et al. 2008.

---

## Family: Social Network Mining

### `handover_network`

**Formal object:** Weighted directed resource handover graph: edge (r_i,r_j) when r_i executes immediately before r_j in same case; w=handover frequency

**Classification:** direct | Confidence: high

**First peer-reviewed:** van der Aalst & Song (2004) BPM, LNCS 3080
**Canonical:** van der Aalst, Reijers, Song (2005) CSCW 14(6)

**Implementation:** `wasm4pm/src/social_network.rs` | WASM export: `discover_handover_network`

**First-claim verdict:** UPHELD.

---

### `working_together_network`

**Formal object:** Weighted symmetric resource co-participation graph: edge (r_i,r_j) when both appear in same case; w=co-participation frequency

**Classification:** direct | Confidence: high

**First peer-reviewed:** van der Aalst & Song (2004) BPM, LNCS 3080 (same paper as handover_network)
**Canonical:** van der Aalst, Reijers, Song (2005) CSCW 14(6)

**Implementation:** `wasm4pm/src/social_network.rs` | WASM export: `discover_working_together_network`

**First-claim verdict:** UPHELD.

---

## Family: Object-Centric (OCEL)

### `ocel_dfg` / `ocel_dfg_per_type`

**Classification:** direct | Confidence: medium

**First peer-reviewed:** Berti & van der Aalst (2022/2023) STTT 25
**Canonical:** Berti & van der Aalst (2022/2023) STTT

**Implementation:** `wasm4pm/src/discovery.rs` | WASM exports: `discover_ocel_dfg`, `discover_ocel_dfg_per_type`

---

### `ocel_petri_net`

**Formal object:** Object-Centric Petri Net N=(P,T,F,M₀,type,variable): typed places, variable arcs capturing concurrency/synchronization between object types

**Classification:** direct | Confidence: high

**First peer-reviewed:** van der Aalst & Berti (2020) Fundamenta Informaticae 175(1-4)
**Canonical:** van der Aalst & Berti (2020) Fundamenta Informaticae

**Implementation:** `wasm4pm/src/oc_petri_net.rs` | WASM export: `discover_oc_petri_net`

**Note:** Journal publication preceded arXiv preprint — confirmed.

---

### `ocel_ocla`

**Classification:** derived | Confidence: low

**GAP:** Specific OCLA paper not identified. Attributed to OC-PM family (Berti & van der Aalst 2022/2023) without standalone paper.

**Implementation:** `wasm4pm/src/advanced/mod.rs` | WASM export: `discover_ocla_wasm`

---

### `ocel_oc_declare`

**Formal object:** OC-DECLARE model: declarative constraint templates specifying ordering, co-occurrence, and absence constraints across multiple object types

**Classification:** direct | Confidence: medium

**First peer-reviewed:** Küsters & van der Aalst (2025) BPM 2025, LNCS 16044

**Implementation:** `wasm4pm/src/advanced/mod.rs` | WASM export: `discover_oc_declare_wasm`

---

### `ocel_encode`

**Classification:** engineering_only | Confidence: engineering_only

**Implementation:** `wasm4pm/src/text_encoding.rs` | WASM export: `encode_ocel_as_text`

---

## Family: Predictive Process Mining

### `predict_next_activity`

**Formal object:** N-gram (Markov chain) model predicting most likely next activity with probabilities from prefix traces

**Classification:** derived | Confidence: medium

**First peer-reviewed (general predictive):** van der Aalst, Schonenberg, Song (2011) Information Systems 36(2)
**First peer-reviewed (LSTM-based):** Evermann, Rehse, Fettke (2016) BPM Workshops, LNBIP — adversary correction from Tax et al. 2017
**Canonical:** Tax, Teinemaa, van Zelst (2017) CAiSE, LNCS 10253

**Implementation:** `wasm4pm/src/prediction.rs` | WASM export: `predict_next_activity`

**First-claim verdict:** WEAKENED — Evermann et al. BPM 2016 workshops preceded Tax et al. CAiSE 2017 for LSTM-based approach.

---

### `predict_remaining_time`

**Classification:** derived | Confidence: medium

**First peer-reviewed:** van der Aalst, Schonenberg, Song (2011) Information Systems 36(2)
**Weibull variant:** Rogge-Solti & Weske (2013) ICSOC, LNCS 8274

**Implementation:** `wasm4pm/src/prediction_remaining_time.rs` | WASM export: `predict_case_duration`

---

### `predict_outcome`

**Classification:** derived | Confidence: medium

**First peer-reviewed:** Leontjeva, Conforti, Di Francescomarino, Ghidini, Maggi (2015) BPM, LNCS 9253
**Canonical benchmark:** Teinemaa, Dumas, Maggi, Di Francescomarino (2019) ACM TKDD 13(2)

**Implementation:** `wasm4pm/src/prediction_outcome.rs` | WASM export: `score_anomaly`

---

## Family: Drift Detection and Statistical Monitoring

### `detect_drift`

**Formal object:** Concept drift detection in process event streams via Jaccard-similarity comparison of DFG edge sets across sliding time windows

**Classification:** derived | Confidence: medium

**First peer-reviewed:** Bose & van der Aalst (2011) CAiSE/BPM
**Canonical:** Bose, van der Aalst, Žliobaitė, Pechenizkiy (2014) IEEE TNNLS 25(1)

**Implementation:** `wasm4pm/src/prediction_drift.rs` | WASM export: `detect_drift`

---

### `compute_ewma`

**Classification:** engineering_only | Confidence: engineering_only

**Origin (generic):** Roberts (1959) Technometrics 1(3)

**Implementation:** `wasm4pm/src/prediction_drift.rs` | WASM export: `compute_ewma`

---

## Family: Analytics (Engineering)

`analyze_variant_complexity`, `compute_activity_transition_matrix`, `analyze_process_speedup`, `compute_trace_similarity_matrix` — all **engineering_only**, all implemented in `wasm4pm/src/final_analytics.rs`.

---

## Family: Performance Analysis

### `performance_spectrum`

**Formal object:** 2-D case-flow timeline model plotting all case flows between consecutive process step pairs; reveals batching, waiting, parallelism patterns

**Classification:** direct | Confidence: high

**First peer-reviewed:** Denisov, Fahland, van der Aalst (2018) BPM, LNCS 11080

**Implementation:** `wasm4pm/src/performance_spectrum.rs` | WASM export: `discover_performance_spectrum_wasm`

**First-claim verdict:** UPHELD.

---

### `batches`

**Formal object:** Batch pattern detection (parallel/sequential) identifying simultaneous processing of multiple cases by same resource

**Classification:** derived | Confidence: medium

**First known:** Wen et al. (2013) Concurrency and Computation: Practice and Experience (single-task batch)
**Canonical (subprocess):** Martin, Pufahl, Mannhardt (2021) Information Systems 95:101642

**Implementation:** `wasm4pm/src/batches.rs` | WASM export: `discover_batches_wasm`

**First-claim verdict:** WEAKENED — Wen et al. 2013 IS peer-reviewed (Wiley journal). Clarification needed: single-task vs subprocess-level batch.

---

## Family: AutoML and Agentic (Engineering)

`automl_classify`, `automl_forecast` — **engineering_only**, implemented in `wasm4pm/src/ml/automl.rs`.

`agentic_pipeline` — **engineering_only**, wasm4pm original design, implemented in `wasm4pm/src/lib.rs`. No single PM peer-reviewed paper for this construct. RL/Bellman: Bellman (1957).

---

## P1 Gaps Requiring Code Action

These are defects blocking the determinism oracle (ACADEMIC-COVERAGE-001), not citation research gaps:

1. **`simd_streaming_dfg`** — HashMap iteration order is non-deterministic. Fix: sort keys before iteration.
2. **`log_to_trie`** — HashMap iteration over cases non-deterministic. Fix: sort case IDs before iteration.
3. **`playout`** — Uses unseeded `fastrand`. Fix: expose `random_seed` parameter; use `fastrand::Rng::with_seed(seed)`.

---

## P2 Citation Corrections Required (from adversary audit)

These require updates to lineage documents 10–16, not code changes:

1. **`alignments`**: first_peer_reviewed = Adriansyah, Sidorova, van Dongen (2011) ACSD (June) — not EDOC 2011 (August). CRITICAL.
2. **`heuristic_miner`**: first_peer_reviewed = Weijters & van der Aalst (2003) ICAE journal — not BETA WP 166 (technical report).
3. **`dfg`**: first_peer_reviewed = Cook & Wolf (1995) ICSE — not 1998 TOSEM (journal extension).
4. **`predict_next_activity`** (LSTM): first_peer_reviewed = Evermann et al. BPM 2016 workshops — not Tax et al. CAiSE 2017.
5. **`monte_carlo_simulation`**: first_peer_reviewed = Wynn et al. (2008) BPM — not Rozinat et al. (2009) DKE.

---

*Document generated by Synthesis Agent A15, 2026-05-30. TOML is authoritative.*
