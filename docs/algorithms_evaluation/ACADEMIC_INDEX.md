# Academic Index — Algorithm Evaluations

This index adds academic provenance to the per-algorithm evaluation files in this directory.
The 60 evaluation files verify implementation closure. This file answers whether each implementation
corresponds to the right formal object from the literature.

**Source of truth:** `../academic_coverage.toml`
**Algorithm count:** 60 (matches `packages/kernel/src/registry.ts`, verified 2026-05-30)
**Gate:** ACADEMIC-COVERAGE-001

---

## How to read this table

| Column | Meaning |
|---|---|
| Algorithm | Registry ID (links to evaluation file if it exists) |
| Category | Algorithm family |
| Coverage | direct / derived / engineering / consumer-contract |
| Formal Object | What the algorithm computes (from literature) |
| Primary Paper | Canonical citation key (empty = engineering or not found) |
| Reachable As | WASM / CLI / registry / Rust-only |
| Gap | Known limitation or open question |

### Coverage key

| Symbol | Meaning |
|---|---|
| ✅ direct | Implementation directly realises a named formal object from a paper |
| 🔵 derived | Adapted or extended from a paper's object; not the canonical algorithm |
| ⚙️ engineering | Valid implementation without a process-mining paper origin |
| 🔗 contract | Interchange standard or format (PNML, BPMN, YAWL); no PM paper |
| 🔮 future | Planned but not yet implemented |

---

## Algorithm Academic Classifications

| Algorithm | Category | Coverage | Formal Object | Primary Paper | Reachable As | Gap |
|---|---|---|---|---|---|---|
| `dfg` | discovery | ✅ direct | Directly-Follows Graph: nodes = activities, edges = directly-follows relations with frequency | van_der_aalst_process_mining_2016 | WASM / CLI / registry | DFG is not a Petri net — does not guarantee soundness |
| `process_skeleton` | discovery | 🔵 derived | Minimal DFG skeleton retaining only start/end activities and backbone transitions | van_der_aalst_process_mining_2016 | WASM / CLI / registry | Derived by filtering dfg; no canonical paper defines 'process skeleton' as named primitive |
| `alpha_plus_plus` | discovery | ✅ direct | Alpha+++ algorithm: Petri net discovery handling length-1/length-2 loops and parallel short-loop pairs | van_der_aalst_et_al_alpha_miner_2004 | WASM / CLI / registry | Sensitive to noise; no noise filtering built in |
| `heuristic_miner` | discovery | ✅ direct | Heuristic Miner: dependency graph discovery via frequency and dependency ratios | weijters_van_der_aalst_heuristics_miner_2003 | WASM / CLI / registry | — |
| `inductive_miner` | discovery | ✅ direct | Inductive Miner: recursive cut-based process tree discovery (XOR, Sequence, Parallel, Loop cuts) | leemans_discovering_block_structured_2013 | WASM / CLI / registry | — |
| `genetic_algorithm` | discovery | 🔵 derived | Genetic process discovery: evolutionary search over DFG candidate space | medeiros_et_al_genetic_process_mining_2004 | WASM / CLI / registry | Returns DFG (not Petri net) — Phase 4 audit correction |
| `pso` | discovery | ⚙️ engineering | Particle Swarm Optimisation adapted for DFG discovery | — | WASM / CLI / registry | No canonical PM paper for PSO applied to process discovery; implementation adapts general PSO |
| `aco` | discovery | 🔵 derived | Ant Colony Optimisation adapted for DFG discovery | medeiros_et_al_genetic_process_mining_2004 | WASM / CLI / registry | Returns DFG (not Petri net) — Phase 4 audit correction |
| `simulated_annealing` | discovery | 🔵 derived | Simulated Annealing for DFG discovery (probabilistic neighbourhood search) | van_der_aalst_process_mining_2016 | WASM / CLI / registry | Returns DFG (not Petri net) — Phase 4 audit correction |
| `a_star` | discovery | 🔵 derived | A* heuristic search applied to DFG discovery | adriansyah_aligning_observed_2014 | WASM / CLI / registry | Returns DFG (not Petri net) — Phase 4 audit correction |
| `hill_climbing` | discovery | 🔵 derived | Greedy local search (hill climbing) over DFG candidate space | van_der_aalst_process_mining_2016 | WASM / CLI / registry | Returns DFG (not Petri net) — Phase 4 audit correction |
| `declare` | discovery | ✅ direct | Declare: constraint-based (LTL) declarative process model discovery | pesic_et_al_declare_2007 | WASM / CLI / registry | — |
| `optimized_dfg` | discovery | ⚙️ engineering | ILP-optimised DFG: minimal DFG with best token-replay fitness via ILP pruning | — | WASM / CLI / registry | Engineering optimisation of DFG; no separate paper defines 'optimized DFG' as formal primitive |
| `ilp` | discovery | ✅ direct | Region-based ILP miner: discovers Petri net places via causal region enumeration and token-replay validation | van_der_aalst_et_al_ilp_miner_2012 | WASM / CLI / registry | NP-Hard for large logs — bounded by solver timeout |
| `simd_streaming_dfg` | discovery | ⚙️ engineering | SIMD-vectorised streaming DFG discovery (~500× throughput vs standard DFG) | — | WASM / CLI / registry | HashMap iteration in streaming state is non-deterministic without explicit sort |
| `hierarchical_dfg` | discovery | ⚙️ engineering | Hierarchical chunking DFG for massive logs (divide-and-conquer, bounded memory) | — | WASM / CLI / registry | — |
| `streaming_log` | discovery | ⚙️ engineering | Probabilistic streaming event log processor (stateful handle API) | — | WASM / CLI / registry | No #[wasm_bindgen] exports in src/streaming/ — functions unreachable from JS without wrapper |
| `smart_engine` | discovery | ⚙️ engineering | Adaptive algorithm selection engine with result caching and early termination | — | WASM / CLI / registry | — |
| `alignments` | conformance | ✅ direct | Optimal trace alignment: A*-based alignment computation minimising move costs | adriansyah_aligning_observed_2014 | WASM / CLI / registry | NP-Hard for large logs — bounded by configured max_iterations |
| `generalization` | conformance | ✅ direct | Generalisation metric: fraction of model behaviour observed in log (avoids overfitting) | van_der_aalst_process_mining_2016 | WASM / CLI / registry | — |
| `etconformance_precision` | conformance | ✅ direct | ETConformance precision: escaping-edge analysis for process model precision measurement | munoz_gama_carmona_etconformance_2010 | WASM / CLI / registry | — |
| `transition_system` | discovery | ✅ direct | Transition system discovery: sliding-window state machine from event log | van_der_aalst_process_mining_2016 | WASM / CLI / registry | — |
| `log_to_trie` | discovery | ⚙️ engineering | Prefix tree (trie) discovery from log variants | — | WASM / CLI / registry | HashMap-based: trie node order may be non-deterministic without sort |
| `causal_graph` | discovery | 🔵 derived | Causal dependency graph: alpha or heuristic causal structure over activities | van_der_aalst_et_al_alpha_miner_2004 | WASM / CLI / registry | — |
| `performance_spectrum` | discovery | ✅ direct | Performance spectrum: duration statistics between activity pairs (sojourn, waiting, service time) | van_der_aalst_process_mining_2016 | WASM / CLI / registry | — |
| `batches` | discovery | ⚙️ engineering | Batch detection: identifies groups of cases processed simultaneously (shared timestamps) | — | WASM / CLI / registry | Batch heuristic based on timestamp proximity; no canonical PM paper defines this as a named formal primitive |
| `correlation_miner` | discovery | 🔵 derived | Correlation Miner: DFG discovery without case identifiers using timestamp correlation | van_der_aalst_process_mining_2016 | WASM / CLI / registry | — |
| `complexity_metrics` | discovery | 🔵 derived | Structural complexity metrics for POWL models (size, CFC, structuredness) | van_der_aalst_process_mining_2016 | WASM / CLI / registry | — |
| `pnml_import` | engineering | 🔗 contract | PNML import: ISO/IEC 20481:2019 Petri Net Markup Language XML ingest | — | WASM / CLI / registry | PNML is an interchange standard, not a PM paper primitive |
| `bpmn_import` | engineering | 🔗 contract | BPMN 2.0 import: OMG BPMN 2.0 XML ingest and conversion to POWL | — | WASM / CLI / registry | BPMN 2.0 is an OMG standard, not a PM paper primitive |
| `powl_to_process_tree` | discovery | ✅ direct | POWL-to-process-tree conversion (Algorithm 3, Theorem 1 from separable WF-net paper) | kourani_park_van_der_aalst_separable_wfnets_2026 | WASM / CLI / registry | — |
| `yawl_export` | engineering | 🔗 contract | YAWL v6 XML export from POWL model | — | WASM / CLI / registry | YAWL is an interchange format; export is an engineering primitive |
| `playout` | discovery | 🔵 derived | Stochastic Petri net / process tree playout for synthetic event log generation | van_der_aalst_process_mining_2016 | WASM / CLI / registry | Uses global unseeded fastrand — non-deterministic without seeding fix |
| `monte_carlo_simulation` | discovery | 🔵 derived | Monte Carlo simulation: stochastic process replay for probabilistic case analysis | van_der_aalst_process_mining_2016 | WASM / CLI / registry | — |
| `handover_network` | social | ✅ direct | Handover-of-work social network: weighted graph of sequential resource handoffs | van_der_aalst_et_al_social_network_mining_2005 | WASM / CLI / registry | — |
| `working_together_network` | social | ✅ direct | Working-together social network: co-occurrence graph of resources sharing a case | van_der_aalst_et_al_social_network_mining_2005 | WASM / CLI / registry | — |
| `ml_classify` | ml | ⚙️ engineering | Trace classification: k-NN, logistic regression, decision tree, naive Bayes on trace features | — | WASM / CLI / registry | Standard ML classifiers adapted for PM features; no canonical PM paper defines these as named PM primitives |
| `ml_cluster` | ml | ⚙️ engineering | Trace clustering: k-means and DBSCAN on trace feature vectors | — | WASM / CLI / registry | — |
| `ml_forecast` | ml | ⚙️ engineering | Process throughput forecasting: linear trend, autocorrelation seasonality, exponential overlay | — | WASM / CLI / registry | — |
| `ml_anomaly` | ml | ⚙️ engineering | Anomaly detection: information-theoretic scoring on drift distances with seasonal decomposition | — | WASM / CLI / registry | Scoring uses log2 edge-frequency; missing-edge cost=10 (design-decided constant) |
| `ml_regress` | ml | ⚙️ engineering | Remaining time regression: linear, polynomial, exponential regression on trace features | — | WASM / CLI / registry | — |
| `ml_pca` | ml | ⚙️ engineering | PCA feature reduction: Jacobi eigendecomposition on trace feature matrix | — | WASM / CLI / registry | — |
| `ocel_dfg` | ocel | ✅ direct | Aggregate OC-DFG: single directly-follows graph across all OCEL object types | van_der_aalst_object_centric_process_mining_2019 | WASM / CLI / registry | — |
| `ocel_dfg_per_type` | ocel | ✅ direct | Per-object-type OC-DFG: map from object_type to DFG (canonical OCEL projection) | van_der_aalst_object_centric_process_mining_2019 | WASM / CLI / registry | — |
| `ocel_petri_net` | ocel | ✅ direct | Object-Centric Petri Net (OC-Petri net) discovery from OCEL | van_der_aalst_object_centric_process_mining_2019 | WASM / CLI / registry | — |
| `ocel_encode` | ocel | ⚙️ engineering | OCEL text encoding: compact human-readable representation for LLM context and diffs | — | WASM / CLI / registry | — |
| `ocel_ocla` | ocel | ✅ direct | Object-Centric Language Abstraction (OCLA): per-type language and interaction capture | van_der_aalst_object_centric_process_mining_2019 | WASM / CLI / registry | OCLA is a family concept from OCEL literature; no single defining paper for this exact algorithm variant |
| `ocel_oc_declare` | ocel | 🔵 derived | OC-Declare: temporal constraint discovery across OCEL object types | pesic_et_al_declare_2007 | WASM / CLI / registry | — |
| `predict_next_activity` | discovery | 🔵 derived | Next-activity prediction: n-gram (Markov chain) model over activity sequences | van_der_aalst_process_mining_2016 | WASM / CLI / registry | — |
| `predict_remaining_time` | discovery | ⚙️ engineering | Remaining time prediction: statistical bucket model with Weibull distribution | — | WASM / CLI / registry | Weibull-based remaining time is an engineering adaptation; van der Aalst 2016 discusses concept but not this specific model |
| `predict_outcome` | discovery | ⚙️ engineering | Outcome prediction: anomaly scoring against DFG model + boundary coverage analysis | — | WASM / CLI / registry | — |
| `detect_drift` | discovery | 🔵 derived | Concept drift detection: activity distribution comparison across sliding windows | van_der_aalst_process_mining_2016 | WASM / CLI / registry | — |
| `compute_ewma` | engineering | ⚙️ engineering | EWMA: Exponentially Weighted Moving Average for numeric time series smoothing | — | WASM / CLI / registry | EWMA is a general statistical primitive; not specific to process mining |
| `analyze_variant_complexity` | discovery | 🔵 derived | Variant complexity analysis: variant entropy and diversity metrics over event log | van_der_aalst_process_mining_2016 | WASM / CLI / registry | — |
| `compute_activity_transition_matrix` | discovery | 🔵 derived | Activity transition matrix: empirical Markov chain transition probabilities | van_der_aalst_process_mining_2016 | WASM / CLI / registry | — |
| `analyze_process_speedup` | discovery | ⚙️ engineering | Process speedup analysis: temporal acceleration/deceleration via timestamp delta windows | — | WASM / CLI / registry | Engineering performance diagnostic; no canonical PM paper defines this as a named primitive |
| `compute_trace_similarity_matrix` | discovery | ⚙️ engineering | Trace similarity matrix: pairwise Levenshtein distance on activity sequences | — | WASM / CLI / registry | Levenshtein on activity sequences is a common technique; no single PM paper defines this as a named primitive |
| `automl_classify` | ml | ⚙️ engineering | AutoML classification: auto-optimised RF/XGB model for trace outcome prediction | — | WASM / CLI / registry | AutoML wraps standard ML; no PM paper grounds this as a named primitive |
| `automl_forecast` | ml | ⚙️ engineering | AutoML throughput forecasting: auto-optimised time-series model for process throughput | — | WASM / CLI / registry | — |
| `agentic_pipeline` | engineering | ⚙️ engineering | Agentic process pipeline: perception → decision → protection → Bellman-optimised policy (RL orchestrator) | — | WASM / CLI / registry | Requires feature-cloud build; not available in all deployment profiles |

---

## Coverage Summary

Counts by `coverage_kind` across all 60 algorithm records.

> ⚠️ **Authoritative source:** `../academic_coverage.toml` (Python tomllib validated).
> Earlier rendering counts were slightly off; the TOML is ground truth.

| Coverage Kind | Count | Percentage |
|---|---|---|
| ✅ direct | 18 | 30% |
| 🔵 derived | 16 | 27% |
| ⚙️ engineering | 23 | 38% |
| 🔗 contract | 3 | 5% |
| 🔮 future | 0 | 0% |

**Total:** 60 algorithms.

---

## The Engineering Primitives (⚙️)

These 23 algorithms are classified as `engineering` — valid implementations without a PM-paper origin.
This is an honest classification, not a gap. No citations have been forced.

| Algorithm | Category | Rationale |
|---|---|---|
| `pso` | discovery | General PSO adapted for DFG; no canonical PM paper |
| `optimized_dfg` | discovery | Engineering ILP optimisation of DFG; not a named paper primitive |
| `simd_streaming_dfg` | discovery | SIMD throughput engineering; no PM paper grounds SIMD-DFG |
| `hierarchical_dfg` | discovery | Divide-and-conquer chunking; engineering memory management |
| `streaming_log` | discovery | Stateful handle API; engineering infrastructure |
| `smart_engine` | discovery | Adaptive caching + selection; engineering meta-algorithm |
| `log_to_trie` | discovery | Prefix tree utility; no named PM paper primitive |
| `batches` | discovery | Timestamp-proximity heuristic; no canonical PM paper |
| `pnml_import` | engineering | ISO/IEC 20481 interchange standard (→ classified as `consumer-contract`) |
| `bpmn_import` | engineering | OMG BPMN 2.0 standard (→ classified as `consumer-contract`) |
| `yawl_export` | engineering | YAWL interchange format (→ classified as `consumer-contract`) |
| `ml_classify` | ml | Standard ML classifiers applied to PM features |
| `ml_cluster` | ml | k-means / DBSCAN; standard ML adapted for PM |
| `ml_forecast` | ml | Trend + seasonality; engineering forecasting |
| `ml_anomaly` | ml | Information-theoretic scoring; engineering anomaly detection |
| `ml_regress` | ml | Regression on trace features; engineering adaptation |
| `ml_pca` | ml | Jacobi PCA; standard linear algebra, not a PM paper |
| `ocel_encode` | ocel | LLM-context text encoding; engineering utility |
| `predict_remaining_time` | discovery | Weibull-based engineering adaptation |
| `predict_outcome` | discovery | Anomaly-score + boundary; engineering composite |
| `compute_ewma` | engineering | General EWMA; not specific to PM |
| `analyze_process_speedup` | discovery | Temporal delta diagnostic; no PM paper defines this |
| `compute_trace_similarity_matrix` | discovery | Levenshtein pairwise; common technique, no named PM primitive |
| `automl_classify` | ml | AutoML wrapper; engineering meta-algorithm |
| `automl_forecast` | ml | AutoML time-series wrapper; engineering meta-algorithm |
| `agentic_pipeline` | engineering | RL orchestrator + agentic loop; engineering primitive |

> Note: `pnml_import`, `bpmn_import`, and `yawl_export` are counted under `consumer-contract` in the
> coverage summary above. They appear here because they also fall under the broader "no PM paper"
> classification family.

---

## Derived Algorithms — Paper Grounding Caveats (🔵)

These 16 algorithms are grounded in a paper but adapt or extend the formal object rather than
realising it canonically. Auditors should note the adaptation before citing paper coverage.

| Algorithm | Source Paper | Adaptation |
|---|---|---|
| `process_skeleton` | van_der_aalst_process_mining_2016 | DFG filter; 'process skeleton' is not a named paper primitive |
| `genetic_algorithm` | medeiros_et_al_genetic_process_mining_2004 | Returns DFG, not Petri net (Phase 4 correction) |
| `aco` | medeiros_et_al_genetic_process_mining_2004 | Two separate implementations; returns DFG, not Petri net |
| `simulated_annealing` | van_der_aalst_process_mining_2016 | SA applied to DFG; returns DFG, not Petri net |
| `a_star` | adriansyah_aligning_observed_2014 | A* applied to discovery, not alignment (paper's domain) |
| `hill_climbing` | van_der_aalst_process_mining_2016 | Greedy search over DFG; returns DFG, not Petri net |
| `causal_graph` | van_der_aalst_et_al_alpha_miner_2004 | Causal structure derived from alpha or heuristic miner |
| `correlation_miner` | van_der_aalst_process_mining_2016 | No-case-ID variant; concept from book, not a dedicated paper |
| `complexity_metrics` | van_der_aalst_process_mining_2016 | Structural metrics adapted for POWL (not just Petri nets) |
| `playout` | van_der_aalst_process_mining_2016 | Stochastic playout adapted; non-deterministic without seeding |
| `monte_carlo_simulation` | van_der_aalst_process_mining_2016 | MC concept from book; specific implementation is engineering |
| `ocel_oc_declare` | pesic_et_al_declare_2007 | LTL constraints applied across OCEL object types |
| `predict_next_activity` | van_der_aalst_process_mining_2016 | n-gram Markov; concept from book, not dedicated paper |
| `detect_drift` | van_der_aalst_process_mining_2016 | Sliding-window distribution comparison; concept from book |
| `analyze_variant_complexity` | van_der_aalst_process_mining_2016 | Entropy/diversity metrics; concept from book |
| `compute_activity_transition_matrix` | van_der_aalst_process_mining_2016 | Empirical Markov chain; concept from book |

---

## Algorithms Requiring Further Research

No algorithms are currently flagged `confidence = "low"` or `status = "gap"` in the TOML.
All 60 records are `status = "covered"`.

However, the following open questions warrant follow-up investigation:

| Algorithm | Open Question |
|---|---|
| `streaming_log` | Zero `#[wasm_bindgen]` exports in `src/streaming/` — JS-unreachable; confirm whether this registry entry is correct |
| `playout` | Global `fastrand` is non-deterministic; seeding fix tracked in DETERMINISM_AUDIT.md but not yet merged |
| `simd_streaming_dfg` | HashMap iteration non-determinism documented; sort fix tracked in DETERMINISM_AUDIT.md |
| `log_to_trie` | HashMap-based node ordering may produce non-deterministic output; see DETERMINISM_AUDIT.md |
| `aco` | Two separate implementations (`discover_ant_colony` and `discover_aco_algorithm`) with different API signatures and fitness key names — registry should clarify which is canonical |
| `agentic_pipeline` | `feature-cloud` build gate not fully documented; deployment profile constraints unclear |
| `ocel_ocla` | OCLA is a family concept; no single defining paper — if a tighter citation is needed, further literature review required |

---

## Note on eval file citation gap

The individual evaluation files in this directory (`dfg.md`, `inductive_miner.md`, etc.) contain
(when created):

✅ BLAKE3 receipt hashes
✅ Reachability verification (registry / dispatch / CLI / WASM)
✅ Determinism tests
✅ Positive and negative proof surfaces

They do NOT contain:

❌ Paper citations
❌ Formal object names
❌ Academic provenance

This `ACADEMIC_INDEX.md` bridges that gap. It is the canonical record of which paper (if any)
each algorithm corresponds to and what formal object the implementation realises.

---

## Citation Key Reference

Full bibliographic entries are maintained in `docs/ACADEMIC_COVERAGE.md`. The short-form keys
used in this file are:

| Key | Full Reference |
|---|---|
| `van_der_aalst_process_mining_2016` | van der Aalst, W.M.P. (2016). *Process Mining: Data Science in Action* (2nd ed.). Springer. |
| `van_der_aalst_et_al_alpha_miner_2004` | van der Aalst, W.M.P., Weijters, T., Maruster, L. (2004). Workflow mining: Discovering process models from event logs. *IEEE TKDE*, 16(9). |
| `van_der_aalst_object_centric_process_mining_2019` | van der Aalst, W.M.P. (2019). Object-centric process mining: Dealing with divergence and convergence in event data. *SEFM 2019*. |
| `van_der_aalst_et_al_social_network_mining_2005` | van der Aalst, W.M.P., Reijers, H.A., Song, M. (2005). Discovering social networks from event logs. *CSCW*, 14(6). |
| `weijters_van_der_aalst_heuristics_miner_2003` | Weijters, A.J.M.M., van der Aalst, W.M.P. (2003). Rediscovering workflow models from event-based data. *SEAA 2003*. |
| `leemans_discovering_block_structured_2013` | Leemans, S.J.J., Fahland, D., van der Aalst, W.M.P. (2013). Discovering block-structured process models from event logs. *Petri Nets 2013*. |
| `medeiros_et_al_genetic_process_mining_2004` | Medeiros, A.K.A.d., Weijters, A.J.M.M., van der Aalst, W.M.P. (2004). Genetic process mining. *ICATPN 2004*. |
| `pesic_et_al_declare_2007` | Pesic, M., Schonenberg, H., van der Aalst, W.M.P. (2007). Declare: Full support for loosely-structured processes. *EDOC 2007*. |
| `adriansyah_aligning_observed_2014` | Adriansyah, A. (2014). *Aligning Observed and Modeled Behavior*. PhD thesis, TU/e. |
| `munoz_gama_carmona_etconformance_2010` | Munoz-Gama, J., Carmona, J. (2010). A fresh look at precision in process conformance. *BPM 2010*. |
| `van_der_aalst_et_al_ilp_miner_2012` | van der Aalst, W.M.P., Rubin, V., Verbeek, H.M.W., van Dongen, B.F., Kindler, E., Günther, C.W. (2012). Process mining: A two-step approach to balance between underfitting and overfitting. *Software & Systems Modeling*, 9(1). |
| `de_medeiros_et_al_alpha_pp_2004` | de Medeiros, A.K.A., van Dongen, B.F., van der Aalst, W.M.P., Weijters, A.J.M.M. (2004). Process mining: Extending the α-algorithm to mine short loops. *BETA WP 113*. |
| `ghahfarokhi_et_al_ocel_2021` | Ghahfarokhi, A.F., Park, G., Berti, A., van der Aalst, W.M.P. (2021). OCEL: A standard for object-centric event logs. *ER Workshops 2021*. |
| `kourani_park_van_der_aalst_choice_graphs_2025` | Kourani, H., Park, G., van der Aalst, W.M.P. (2025). Choice graphs in POWL 2.0. |
| `kourani_park_van_der_aalst_separable_wfnets_2026` | Kourani, H., Park, G., van der Aalst, W.M.P. (2026). Separable WF-nets and POWL-to-process-tree conversion. |
| `kuesters_van_der_aalst_ocpq_2025` | Küsters, R., van der Aalst, W.M.P. (2025). Object-Centric Process Querying (OCPQ). |

---

*Generated from `../academic_coverage.toml` — gate ACADEMIC-COVERAGE-001 — version v26.5.30*
*Last reviewed: 2026-05-30*
