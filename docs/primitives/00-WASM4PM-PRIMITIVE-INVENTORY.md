# Agent 1 — Primitive Inventory Agent

## Mission
Map what already exists (OCEL, DFG, heuristic, POWL, etc.). Output a primitive map with
existing file/module, current tests, missing tests, paper grounding, downstream use.
No implementation.

## Status
Implemented (inventory complete as of 2026-05-30).

The kernel registry (`packages/kernel/src/registry.ts`) registers **63 algorithm entries**
spanning discovery, conformance, ML analysis, OCEL, prediction, social network, and
streaming categories. Rust source lives in `wasm4pm/src/` (100+ modules). The table below
maps each domain to its canonical files and test coverage.

---

## Paper / Specification Grounding

| Domain | Canonical Reference |
|---|---|
| DFG discovery | van der Aalst, *Process Mining* (2016), Ch. 3 |
| Petri nets / WF-nets | van der Aalst (1997), "Verification of Workflow Nets" |
| POWL | Kourani & van der Aalst, *POWL 2.0* (2024), CEUR-WS |
| OCEL 2.0 | OCEL 2.0 Standard (IEEE, 2023) |
| Conformance | van der Aalst, *Conformance Checking* (2018), Springer |
| Token replay | Rozinat & van der Aalst (2008), *TPI* |
| Alignments | van der Aalst et al. (2012), ACSD |
| ETConformance precision | Munoz-Gama & Carmona (2010), ICATPN |

---

## Implementation Files — Primitive Map

### Discovery (15 kernel-registered)

| Primitive | Source File | WASM Export |
|---|---|---|
| DFG | `wasm4pm/src/discovery.rs` | `discover_dfg` |
| Process skeleton | `wasm4pm/src/discovery.rs` | `discover_process_skeleton` |
| Alpha++ | `wasm4pm/src/advanced/alphappp.rs` | `discover_alpha_plus_plus` |
| Heuristic miner | `wasm4pm/src/discovery.rs` | `discover_heuristic_miner` |
| Inductive miner | `wasm4pm/src/discovery.rs` | `discover_inductive_miner` |
| Genetic algorithm | `wasm4pm/src/genetic_discovery.rs` | `discover_genetic_algorithm` |
| PSO | `wasm4pm/src/more_discovery.rs` | `discover_pso` |
| A* | `wasm4pm/src/more_discovery.rs` | `discover_astar` |
| Hill climbing | `wasm4pm/src/more_discovery.rs` | `discover_hill_climbing` |
| ACO | `wasm4pm/src/genetic_discovery.rs` | `discover_aco_algorithm` |
| Simulated annealing | `wasm4pm/src/more_discovery.rs` | `discover_simulated_annealing` |
| Declare | `wasm4pm/src/discovery.rs` | `discover_declare` |
| Optimized DFG | `wasm4pm/src/discovery.rs` | `discover_optimized_dfg` |
| ILP | `wasm4pm/src/ilp_discovery.rs` | `discover_ilp_petri_net_from_log` |
| SIMD streaming DFG | `wasm4pm/src/simd_streaming_dfg.rs` | `simd_streaming_dfg_*` |

### Conformance (5 kernel-registered)

| Primitive | Source File | WASM Export |
|---|---|---|
| Token replay | `wasm4pm/src/conformance.rs` | `check_token_based_replay` |
| Alignment fitness | `wasm4pm/src/alignment_fitness.rs` | `alignment_fitness` |
| ETConformance precision | `wasm4pm/src/align_etconformance.rs` | `align_etconformance_precision` |
| Declare conformance | `wasm4pm/src/declare_conformance.rs` | `check_declare_conformance` |
| Prefix conformance | `wasm4pm/src/streaming_conformance.rs` | `check_prefix_conformance` |

### OCEL / Object-centric (6 kernel-registered)

| Primitive | Source File | WASM Export |
|---|---|---|
| OCEL JSON I/O | `wasm4pm/src/ocel_io.rs` | `load_ocel2_from_json`, `export_ocel2_to_json` |
| OCEL NDJSON stream | `wasm4pm/src/ocel_io.rs` | `load_ocel2_from_ndjson` |
| OCEL flatten | `wasm4pm/src/ocel_flatten.rs` | `flatten_ocel_to_eventlog` |
| OC DFG | `wasm4pm/src/advanced/ocdfg.rs` | `discover_ocel_dfg` |
| OC Petri net | `wasm4pm/src/oc_petri_net.rs` | `discover_ocel_petri_net` |
| OC Declare | `wasm4pm/src/advanced/oc_declare.rs` | `discover_oc_declare` |

### POWL (4 kernel-registered + internal API)

| Primitive | Source File | WASM Export |
|---|---|---|
| Parse / validate | `wasm4pm/src/powl_api.rs` | `parse_powl`, `validate_partial_orders` |
| POWL → Petri net | `wasm4pm/src/powl/conversion/to_petri_net.rs` | `powl_to_petri_net` |
| POWL → Process tree | `wasm4pm/src/powl/conversion/to_process_tree.rs` | `powl_to_process_tree` |
| POWL soundness | `wasm4pm/src/powl/conformance/soundness.rs` | `check_powl_soundness` |
| POWL simplify | `wasm4pm/src/powl/simplify.rs` | `simplify_powl` |

### ML / Social / Prediction (23 kernel-registered)

Modules: `wasm4pm/src/ml/`, `wasm4pm/src/social_network.rs`,
`wasm4pm/src/prediction*.rs`. Full list in `packages/kernel/src/registry.ts`.

---

## Test Suite

| Test File | Domain | Notes |
|---|---|---|
| `wasm4pm/tests/algorithm_determinism_template.rs` | Discovery (all) | Rank-1 determinism |
| `wasm4pm/tests/ground_truth_discovery_tests.rs` | Discovery | Ground-truth oracle |
| `wasm4pm/tests/ocel_real_data_tests.rs` | OCEL | Real `.jsonocel` data |
| `wasm4pm/tests/conformance_real_data_tests.rs` | Conformance | Real XES data |
| `wasm4pm/tests/powl_cross_validation.rs` | POWL | Round-trip fidelity |
| `wasm4pm/tests/parity_tests.rs` | All | Kernel ↔ WASM parity |
| `wasm4pm/tests/feature_gating_tests.rs` | All profiles | Feature-flag coverage |

---

## Verification Criteria

- All 63 registry entries have a matching `#[wasm_bindgen]` export (verified via `wasm_export_registry.rs`).
- Determinism oracle: Rank-1 (mathematical). Same input → bit-exact output for all deterministic algorithms.
- Stochastic algorithms (`genetic`, `pso`, `aco`, `sa`, `a_star`) use `StdRng::seed_from_u64(42)`.
- Feature-gating tests confirm each algorithm compiles only under its declared profile.

---

## Key Data Structures

| Structure | File | Used By |
|---|---|---|
| `EventLog` | `wasm4pm/src/models.rs:255` | All discovery, conformance |
| `PetriNet` | `wasm4pm/src/models.rs:810` | Conformance, PNML, POWL |
| `OCEL` | `wasm4pm/src/models.rs:713` | All OC algorithms |
| `PowlModel` | `wasm4pm/src/powl_models.rs:15` | POWL discovery, conversion |
| `DeclareModel` | `wasm4pm/src/models.rs:902` | Declare conformance |
| `ConformanceResult` | `wasm4pm/src/models.rs:950` | Token replay output |

---

## Downstream Use

Every primitive feeds into the `@wasm4pm/kernel` TypeScript facade, which routes calls
via `run(algorithmName, handle, params)`. The `@wasm4pm/planner` selects algorithms based
on execution profile (fast / balanced / quality / stream). The `@wasm4pm/testing` harness
validates parity and determinism across all registered algorithms.
