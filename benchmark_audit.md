# wasm4pm Benchmark Audit — v26.5.29

**Date:** 2026-05-19 | **Branch:** `feat/iter16-miniml-prolog8`

> **Policy:** All benchmarks must use real, publicly sourced event logs. No synthetic, mock, or generated data is permitted.

---

## TL;DR

| Category | Count |
|---|---|
| Public algorithm APIs (exported) | 91 process-mining APIs |
| **APIs with zero benchmark coverage** | **32** |
| Bench files using only synthetic/generated data | **28** |
| Bench files with real data but silent synthetic fallback | **4** |
| `sepsis.xes` in `bench_data/` | **14-byte 404 stub** — not real data |
| Real datasets actually present and usable | **4** (BPI 2020 ×3 + bpi2020_travel) |

---

## Part 1: APIs With Zero Benchmark Coverage

These 32 exported functions have **no performance measurement at all** — not even synthetic:

### Resource & Case Analytics (no bench)

| API | Purpose |
|---|---|
| `analyze_case_attributes` | Case-level attribute distribution |
| `analyze_resource_activity_matrix` | Resource × activity frequency matrix |
| `analyze_resource_utilization` | Resource load over time |

### OC/OCEL (no bench)

| API | Purpose |
|---|---|
| `analyze_oc_performance` | Object-centric performance DFG |
| `analyze_ocel_statistics` | OCEL descriptive statistics |
| `check_ocel_data_quality` | OCEL structural quality checks |
| `discover_ocel_dfg` | OC directly-follows graph |
| `discover_ocel_dfg_per_type` | Per-type OC DFG |
| `discover_ocel_powl` | OC POWL discovery |

### Conformance (no bench)

| API | Purpose |
|---|---|
| `compute_alignments` | Alignment-based conformance |
| `compute_optimal_alignments` | Cost-optimal alignments |
| `compute_boundary_coverage` | Prefix-boundary coverage |
| `check_data_quality` | Event log data quality |
| `check_dg_soundness` | DG soundness check |
| `wasm_compute_precision` | Model precision |
| `wasm_compute_simplicity` | Model simplicity |

### ML / Prediction (no bench)

| API | Purpose |
|---|---|
| `build_remaining_time_model` | Remaining case time prediction |
| `build_transition_probabilities` | Transition probability model |
| `compute_feature_importance` | ML feature importance |
| `compute_rework_score` | Rework detection scoring |
| `discover_ml_regress_automl` | AutoML regression |

### Discovery Variants (no bench)

| API | Purpose |
|---|---|
| `discover_dfg_hierarchical_by_events` | Event-grouped hierarchical DFG |
| `discover_footprints` | Alpha footprint matrix |
| `discover_performance_spectrum_wasm` | Performance spectrum |
| `discover_powl_from_log_config` | Configurable POWL discovery |
| `discover_powl_from_partial_orders` | Partial-order POWL |
| `discover_transition_system_from_handle` | Transition system |
| `from_pnml_wasm` | PNML import |
| `to_pnml_wasm` | PNML export |

### Infrastructure (no bench)

| API | Purpose |
|---|---|
| `parallel_discover_dfg` | Parallel DFG (multi-threaded) |
| `smart_engine_check_convergence` | Autonomic convergence check |
| `check_powl_soundness` | POWL soundness verification |

---

## Part 2: Bench Files Using Only Synthetic Data (28 files)

All 28 generate data via `generate_event_log()`, inline `vec![]` literals, `fastrand`, or `setup_mock_log()`:

| File | What it benchmarks | Data source |
|---|---|---|
| `analytics.rs` | All analytics functions | `generate_event_log()` |
| `automl_profiling.rs` | AutoML classify/forecast | `setup_mock_log()` — **explicitly named mock** |
| `autonomy_jtbd_validation.rs` | Autonomic loop | `fastrand::seed(42)` |
| `conformance_bench.rs` | Token replay, DECLARE | Inline `vec!["A","B","C"]` |
| `conformance.rs` | Conformance suite | `generate_event_log()` |
| `constant_latency_loops.rs` | SIMD/DFG loops | Inline constructed log |
| `drift_bench.rs` | Drift detection | `generate_event_log()` |
| `drift_detection_detailed.rs` | Detailed drift | `generate_event_log()` |
| `extended_discovery.rs` | Causal, correlation, perf-DFG | `generate_event_log()` |
| `fast_algorithms.rs` | DFG, Alpha, Heuristic | `generate_event_log()` |
| `medium_algorithms.rs` | Inductive, ILP, ACO, PSO | `generate_event_log()` |
| `slow_algorithms.rs` | Genetic, SimAnnealing | `generate_event_log()` |
| `ml_algorithms.rs` | All ML algorithms | `generate_event_log()` |
| `ml_latency.rs` | ML latency | `generate_event_log()` |
| `ml_streaming_sim_bench.rs` | ML streaming | Simulated event stream |
| `oracle_rank_validation.rs` | DFG edge map, fitness | `generate_event_log()` |
| `powl_discovery.rs` | POWL from log | `generate_event_log()` |
| `powl_macro.rs` | POWL macro | Inline constructed log |
| `prediction_baseline_comparison.rs` | Prediction baseline | `generate_event_log()` |
| `prediction_latency.rs` | Prediction latency | `generate_event_log()` |
| `route_driven_tdd.rs` | Route-driven bench | Inline constructed log |
| `scalability_benchmark.rs` | Scalability scaling | `generate_event_log()` |
| `streaming_algorithms.rs` | Streaming DFG | Inline constructed stream |
| `streaming_vs_batch.rs` | Stream vs batch DFG | `generate_event_log()` |
| `tier1_discovery.rs` | Tier-1 discovery suite | `generate_event_log()` |
| `tier2_metaheuristic.rs` | Metaheuristic suite | `generate_event_log()` |
| `closed_claw/pipeline_b_conformance.rs` | Closed-claw conformance | `generate_event_log()` |
| `closed_claw/pipeline_f_ml.rs` | Closed-claw ML | `generate_event_log()` |

---

## Part 3: Bench Files With Real Data But Silent Synthetic Fallback

> [!CAUTION]
> `bench_data/sepsis.xes` is a **14-byte HTTP 404 response body** — not an event log. Every bench that tries to load it silently falls back to 100 synthetic traces. You cannot tell from the Criterion output which data was used.

| File | Intended datasets | Actual state |
|---|---|---|
| `real_data_bench.rs` | sepsis, bpi2020_travel, roadtraffic | sepsis=404→fallback; bpi2020=✅ real; roadtraffic=path unknown |
| `autonomic_real_data_bench.rs` | sepsis, bpi2020_travel, roadtraffic | Same as above |
| `simd_inner_loops.rs` | BPI 2020 fixtures | ✅ Uses real 20–32MB files |
| `prediction_accuracy.rs` | BPI 2020 fixtures | ✅ Uses real 20–32MB files |

---

## Part 4: Real Datasets Currently Available

| Dataset | Path | Size | Verified |
|---|---|---|---|
| BPI 2020 Domestic Declarations | `wasm4pm/tests/fixtures/BPI_2020_DomesticDeclarations.xes` | 20MB | ✅ |
| BPI 2020 International Declarations | `wasm4pm/tests/fixtures/BPI_2020_InternationalDeclarations.xes` | 28MB | ✅ |
| BPI 2020 Permit Log | `wasm4pm/tests/fixtures/BPI_2020_PermitLog.xes` | 32MB | ✅ |
| BPI 2020 Travel Permits | `bench_data/bpi2020_travel.xes` | 20MB | ✅ |
| Running Example | `wasm4pm/tests/fixtures/running-example.xes` | 16KB | ✅ |
| OCEL 2.0 Example | `bench_data/ocel20_example.jsonocel` | 10KB | ✅ |
| **Sepsis Cases** | `bench_data/sepsis.xes` | **14 bytes** | ❌ 404 stub |
| **Road Traffic Fines** | expected in `bench_data/` | missing | ❌ |

---

## Remediation Plan

### Step 1 — Acquire missing real data

Download both from 4TU.ResearchData (open access, CC-BY):

```
# Sepsis Cases (1,050 traces, ICU patient flow, Mannhardt 2016)
https://data.4tu.nl/articles/dataset/Sepsis_Cases_-_Event_Log/12707639

# Road Traffic Fines (150,370 traces, de Leoni & Mannhardt 2015)
https://data.4tu.nl/articles/dataset/Road_Traffic_Fine_Management_Process/12683249
```

Place both in `bench_data/`. Delete `bench_data/sepsis.xes` first (it is corrupt).

### Step 2 — Remove the silent fallback

In both `real_data_bench.rs` and `autonomic_real_data_bench.rs`, replace:

```rust
// CURRENT — silently runs on fake data
.unwrap_or_else(|| {
    eprintln!("WARN: {} not found — using synthetic fallback", label);
    generate_synthetic_fallback()
})
```

```rust
// CORRECT — fails loudly so CI catches it
.unwrap_or_else(|| {
    panic!(
        "Required dataset '{}' not found at any of: {:?}\n\
         Download from https://data.4tu.nl/",
        label, candidates
    )
})
```

### Step 3 — Update synthetic-only bench files (priority order)

**P1 — Core discovery (blocks real performance claims):**
- `tier1_discovery.rs` → use `BPI_2020_DomesticDeclarations.xes`
- `tier2_metaheuristic.rs` → use `BPI_2020_DomesticDeclarations.xes`
- `fast_algorithms.rs`, `medium_algorithms.rs`, `slow_algorithms.rs` → same
- `conformance.rs` / `conformance_bench.rs` → use `BPI_2020_PermitLog.xes`

**P2 — ML algorithms:**
- `ml_algorithms.rs` → use BPI 2020 (timestamps enable proper feature extraction)
- `automl_profiling.rs` → delete `setup_mock_log`, use real data
- `prediction_latency.rs` → use BPI 2020 with real timestamps

**P3 — New bench files for unbenched APIs:**
- Create `ocel_real_data_bench.rs` → use `bench_data/ocel20_example.jsonocel`
- Create `conformance_advanced_bench.rs` → alignments, precision, simplicity on BPI 2020
- Create `resource_analytics_bench.rs` → resource/utilization APIs on BPI 2020

**P4 — Streaming & scalability:**
- `streaming_algorithms.rs` / `streaming_vs_batch.rs` → use Sepsis (streaming scenario)
- `drift_bench.rs` / `drift_detection_detailed.rs` → use Road Traffic Fines (known drift point)
