# Algorithm Inventory — wasm4pm

**Generated:** 2026-05-30  
**Source of truth:** `packages/kernel/src/registry.ts`, `wasm4pm/src/**/*.rs`  
**Status:** Authoritative count — supersedes any narrative claims in CLAUDE.md or README

---

## Key Finding: Count Mismatch

CLAUDE.md and README claim **38 registered algorithms**. The actual count in `packages/kernel/src/registry.ts` is **60 registered algorithms**. The `docs/algorithms_evaluation/` directory does **not exist** at `docs/algorithms_evaluation/` (only `docs/academic/`, `docs/explanation/`, etc. exist). An archived evaluation directory exists at `docs_quarantine/ARCHIVE/docs/` but contains no per-algorithm `.md` files matching the registry IDs.

Additionally, one registry entry (`bpmn_import`) does not have a `bpmn_import` WASM function — it is served by `read_bpmn()` in `bpmn_import.rs` which is decorated with `#[wasm_bindgen]`. All other 59 registry algorithms map to at least one confirmed WASM export.

---

## Section 1: Algorithms in registry.ts (60 registered)

60 algorithms are registered via `registerWithInferredProfiles()` calls in the constructor of `AlgorithmRegistry`.

| # | id | category | output_type | wasm_function | wasm_exported | source_file |
|---|-----|----------|-------------|---------------|---------------|-------------|
| 1 | `dfg` | Discovery | dfg | `discover_dfg` | YES | `discovery.rs` |
| 2 | `process_skeleton` | Discovery | dfg | `extract_process_skeleton` | YES | `more_discovery.rs` |
| 3 | `alpha_plus_plus` | Discovery | petrinet | `discover_alpha_plus_plus` | YES | `algorithms.rs` |
| 4 | `heuristic_miner` | Discovery | dfg | `discover_heuristic_miner` | YES | `advanced_algorithms.rs` |
| 5 | `inductive_miner` | Discovery | tree | `discover_inductive_miner` | YES | `more_discovery.rs` |
| 6 | `genetic_algorithm` | Discovery | dfg | `discover_genetic_algorithm` | YES | `genetic_discovery.rs` |
| 7 | `pso` | Discovery | dfg | `discover_pso_algorithm` | YES | `genetic_discovery.rs` |
| 8 | `a_star` | Discovery | dfg | `discover_astar` | YES | `fast_discovery.rs` |
| 9 | `hill_climbing` | Discovery | dfg | `discover_hill_climbing` | YES | `fast_discovery.rs` |
| 10 | `aco` | Discovery | dfg | `discover_aco_algorithm` | YES | `genetic_discovery.rs` |
| 11 | `simulated_annealing` | Discovery | dfg | `discover_simulated_annealing` | YES | `more_discovery.rs` |
| 12 | `declare` | Discovery | declare | `discover_declare` | YES | `discovery.rs` |
| 13 | `optimized_dfg` | Discovery | dfg | `discover_optimized_dfg` | YES | `ilp_discovery.rs` |
| 14 | `ilp` | Discovery | petrinet | `discover_ilp_petri_net` | YES | `ilp_discovery.rs` |
| 15 | `simd_streaming_dfg` | Discovery | dfg | `discover_dfg_simd` | YES | `simd_streaming_dfg.rs` |
| 16 | `hierarchical_dfg` | Discovery | dfg | `discover_dfg_hierarchical` | YES | `hierarchical.rs` |
| 17 | `streaming_log` | Streaming | analytics | `create_streaming_log` | YES | `probabilistic/wasm_bindings.rs` |
| 18 | `smart_engine` | Utility | dfg | `smart_engine_run` | YES | `smart_engine.rs` |
| 19 | `ml_classify` | ML | ml_result | `discover_ml_classify` | YES | `ml/classification.rs` |
| 20 | `ml_cluster` | ML | ml_result | `discover_ml_cluster` | YES | `ml/clustering.rs` |
| 21 | `ml_forecast` | ML | ml_result | `discover_ml_forecast` | YES | `ml/forecasting.rs` |
| 22 | `ml_anomaly` | ML | ml_result | `discover_ml_anomaly` | YES | `anomaly.rs` |
| 23 | `ml_regress` | ML | ml_result | `discover_ml_regress` | YES | `ml/regression.rs` |
| 24 | `ml_pca` | ML | ml_result | `discover_ml_pca` | YES | `ml/pca.rs` |
| 25 | `transition_system` | Discovery | dfg | `discover_transition_system_from_handle` | YES | `transition_system.rs` |
| 26 | `log_to_trie` | Discovery | dfg | `discover_prefix_tree` | YES | `log_to_trie.rs` |
| 27 | `causal_graph` | Discovery | dfg | `discover_causal_heuristic` | YES | `causal_graph.rs` |
| 28 | `performance_spectrum` | Analysis | analytics | `discover_performance_spectrum_wasm` | YES | `performance_spectrum.rs` |
| 29 | `batches` | Analysis | analytics | `discover_batches_wasm` | YES | `batches.rs` |
| 30 | `correlation_miner` | Discovery | dfg | `discover_correlation` | YES | `correlation_miner.rs` |
| 31 | `generalization` | Conformance | analytics | `generalization` | YES | `generalization.rs` |
| 32 | `etconformance_precision` | Conformance | analytics | `wasm_compute_precision` | YES | `etconformance_precision.rs` |
| 33 | `alignments` | Conformance | analytics | `compute_optimal_alignments` | YES | `alignments.rs` |
| 34 | `complexity_metrics` | Quality | analytics | `measure_complexity` | YES | `powl_api.rs` |
| 35 | `pnml_import` | Import | petrinet | `from_pnml_wasm` | YES | `pnml_io.rs` |
| 36 | `bpmn_import` | Import | tree | `read_bpmn` | YES (via `read_bpmn`) | `bpmn_import.rs` |
| 37 | `powl_to_process_tree` | Conversion | tree | `powl_to_process_tree` | YES | `powl_api.rs` |
| 38 | `yawl_export` | Export | tree | `powl_to_yawl_string` | YES | `powl/conversion/to_yawl.rs` |
| 39 | `playout` | Simulation | analytics | `play_out_process_tree` | YES | `playout.rs` |
| 40 | `monte_carlo_simulation` | Simulation | dfg | `monte_carlo_simulation` | YES | `montecarlo.rs` |
| 41 | `handover_network` | Social | analytics | `discover_handover_network` | YES | `social_network.rs` |
| 42 | `working_together_network` | Social | analytics | `discover_working_together_network` | YES | `social_network.rs` |
| 43 | `ocel_dfg` | OCEL | dfg | `discover_ocel_dfg` | YES | `discovery.rs` |
| 44 | `ocel_dfg_per_type` | OCEL | dfg | `discover_ocel_dfg_per_type` | YES | `discovery.rs` |
| 45 | `ocel_petri_net` | OCEL | petrinet | `discover_oc_petri_net` | YES | `oc_petri_net.rs` |
| 46 | `ocel_encode` | OCEL | analytics | `encode_ocel_as_text` | YES | `text_encoding.rs` |
| 47 | `ocel_ocla` | OCEL | analytics | `discover_ocla_wasm` | YES | `advanced/mod.rs` |
| 48 | `ocel_oc_declare` | OCEL | declare | `discover_oc_declare_wasm` | YES | `advanced/mod.rs` |
| 49 | `predict_next_activity` | Prediction | analytics | `predict_next_activity` | YES | `prediction.rs` |
| 50 | `predict_remaining_time` | Prediction | analytics | `predict_case_duration` | YES | `prediction_remaining_time.rs` |
| 51 | `predict_outcome` | Prediction | analytics | `score_anomaly` | YES | `prediction_outcome.rs` |
| 52 | `detect_drift` | Analysis | analytics | `detect_drift` | YES | `prediction_drift.rs` |
| 53 | `compute_ewma` | Analysis | analytics | `compute_ewma` | YES | `prediction_drift.rs` |
| 54 | `analyze_variant_complexity` | Analysis | analytics | `analyze_variant_complexity` | YES | `final_analytics.rs` |
| 55 | `compute_activity_transition_matrix` | Analysis | analytics | `compute_activity_transition_matrix` | YES | `final_analytics.rs` |
| 56 | `analyze_process_speedup` | Analysis | analytics | `analyze_process_speedup` | YES | `final_analytics.rs` |
| 57 | `compute_trace_similarity_matrix` | Analysis | analytics | `compute_trace_similarity_matrix` | YES | `final_analytics.rs` |
| 58 | `automl_classify` | AutoML | analytics | `discover_automl_classify` | YES | `ml/automl.rs` |
| 59 | `automl_forecast` | AutoML | analytics | `discover_automl_forecast` | YES | `ml/automl.rs` |
| 60 | `agentic_pipeline` | Agentic | analytics | `run_agentic_pipeline` | YES | `lib.rs` |

**cli_available**: All 60 algorithms are reachable via the TypeScript kernel's `run(algorithmName, handle, params)` API, which is exposed through the CLI. Direct per-algorithm CLI sub-commands exist for the primary discovery algorithms via `wpm run --algorithm <id>`.

---

## Section 2: Algorithms in docs/algorithms_evaluation/ (0 files found)

The directory `docs/algorithms_evaluation/` does **not exist** in the repository tree. No per-algorithm evaluation `.md` files were found matching that path.

Archived evaluation documents exist under `docs_quarantine/ARCHIVE/docs/` but that directory contains aggregate reports rather than per-algorithm markdown files:

- `COMPREHENSIVE_ALGORITHM_VALIDATION_REPORT.md` — aggregate validation report
- `ALGORITHM_REGRESSION_REPORT.md` — regression report
- `ALGORITHM_VALIDATION_GUIDE.md` — validation methodology guide
- `algorithm_validation_results.json` — machine-readable validation results

**Count of per-algorithm evaluation docs at expected path:** 0

---

## Section 3: Discrepancies Between Registry and Documentation Claims

### 3.1 Count Mismatch: 38 vs 60

CLAUDE.md (lines 10, 88, 201, 343) consistently states "38 registered algorithms." The registry contains **60 registered algorithms**. The discrepancy of 22 algorithms arises from waves of additions made after the "38 algorithm" baseline was documented:

| Wave | Algorithms added |
|------|-----------------|
| Wave 1 (migration) | `transition_system`, `log_to_trie`, `causal_graph`, `performance_spectrum`, `batches`, `correlation_miner`, `generalization`, `etconformance_precision`, `alignments`, `complexity_metrics`, `pnml_import`, `bpmn_import`, `powl_to_process_tree`, `yawl_export`, `playout`, `monte_carlo_simulation` |
| Social network (previously "dead exports") | `handover_network`, `working_together_network` |
| OCEL additions | `ocel_ocla`, `ocel_oc_declare` |
| Wave 2 (Advanced Analytics) | `detect_drift`, `compute_ewma`, `analyze_variant_complexity`, `compute_activity_transition_matrix`, `analyze_process_speedup`, `compute_trace_similarity_matrix` |
| Wave 3 (Agentic & AutoML) | `automl_classify`, `automl_forecast`, `agentic_pipeline` |
| OCEL first wave | `ocel_dfg`, `ocel_dfg_per_type`, `ocel_petri_net`, `ocel_encode` |
| Prediction | `predict_next_activity`, `predict_remaining_time`, `predict_outcome` |
| ML re-addition | `ml_classify`, `ml_forecast`, `ml_regress`, `ml_pca` (re-added after Phase 4 audit removal) |

**Net: CLAUDE.md count (38) was accurate at an older snapshot and has not been updated.**

### 3.2 Registry Algorithms Without Matching Docs

All 60 registered algorithms lack individual evaluation documents at `docs/algorithms_evaluation/`. The documentation gap is total for the registry expansion beyond the original 38.

### 3.3 WASM Exports Not in Registry (Selected)

The WASM binary exposes 405 exported functions (confirmed by `#[wasm_bindgen]` scan). The following are notable exports that perform algorithm-like operations but are **not registered in the kernel registry**:

| WASM function | File | Notes |
|--------------|------|-------|
| `discover_alpha_ppp_wasm` | `advanced/mod.rs` | Alternate Alpha+++ export; registry uses `discover_alpha_plus_plus` |
| `discover_ant_colony` | `more_discovery.rs` | Older ACO implementation; registry uses `discover_aco_algorithm` (different params) |
| `discover_causal_alpha` | `causal_graph.rs` | Alpha-variant; registry uses `discover_causal_heuristic` |
| `discover_dfg_filtered` | `algorithms.rs` | Filtered DFG variant; not a separate registry entry |
| `discover_dfg_simd_handle` | `simd_streaming_dfg.rs` | Handle-based SIMD variant; companion to `discover_dfg_simd` |
| `discover_footprints` | `algorithms.rs` | Alpha footprints; not separately registered |
| `discover_ml_regress_automl` | `ml/regression.rs` | AutoML regression variant; not separately registered |
| `discover_ocel_dfg_pure` | `discovery.rs` | Pure function variant; companion to `discover_ocel_dfg` |
| `discover_ocel_powl` | `powl_api.rs` | OCEL POWL discovery; not in registry |
| `discover_performance_dfg` | `performance_dfg.rs` | Performance-annotated DFG; not in registry |
| `discover_powl_from_log` | `powl_api.rs` | POWL discovery; distinct from registered algorithms |
| `discover_simple_process_tree` | `process_tree.rs` | Simplified process tree; not in registry |
| `discover_temporal_profile` | `temporal_profile.rs` | Temporal profile; exposed via `wpm temporal`, not registry |

### 3.4 bpmn_import: Name Mismatch

Registry id `bpmn_import` maps to the Rust function `read_bpmn()` (not `bpmn_import()`). The function is `#[wasm_bindgen]` decorated in `bpmn_import.rs` line 507. The mapping is functional but the naming diverges from the convention used by other algorithms.

### 3.5 Registry outputType Corrections Noted in Source

The registry source contains inline audit notes for several algorithms:

- `genetic_algorithm`, `pso`, `a_star`, `hill_climbing`, `aco`, `simulated_annealing` all carry the comment: "Actually returns DFG, not Petri net (Phase 4 audit correction)." Their `outputType` is `'dfg'` in the registry, which is confirmed correct.

### 3.6 ml_classify, ml_forecast, ml_regress, ml_pca Status

A comment in the registry (lines 836–840) states these were "incorrectly removed" in a Phase 4 audit and have been re-added. CLAUDE.md (rule file) states they were removed and "no `#[wasm_bindgen]` exports found." This is **contradicted by the current source**: all four have confirmed `#[wasm_bindgen]` exports in `ml/classification.rs`, `ml/forecasting.rs`, `ml/regression.rs`, and `ml/pca.rs` respectively. The CLAUDE.md rule file is stale on this point.

---

## Summary Statistics

| Metric | Count |
|--------|-------|
| Algorithms registered in `registry.ts` | **60** |
| Algorithms claimed in CLAUDE.md | 38 |
| Discrepancy | +22 undocumented |
| Registry algorithms with confirmed WASM export | 60/60 (100%) |
| Registry algorithms with `bpmn_import` name mismatch | 1 (`bpmn_import` → `read_bpmn`) |
| Total `#[wasm_bindgen]` exports in all `.rs` files | 405 |
| Discovery-category exports (`discover_*`) | 53 |
| Per-algorithm evaluation docs at `docs/algorithms_evaluation/` | **0** (directory does not exist) |
