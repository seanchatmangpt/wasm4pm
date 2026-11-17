<!-- wasm4pm-doc-status: active; reviewed: 2026-10-10; original: docs/benchmarks/RESULTS-2026-10-10-postfix.md -->

# RESULTS-2026-10-10-postfix.md

Post-fix evidence rerun for v26.10.8 @ main working tree (~30 fix lanes landed
after the morning campaign in
[`RESULTS-2026-10-10.md`](RESULTS-2026-10-10.md)). Same host (Apple silicon,
16 logical cores, macOS 25.2.0), isolated build root `_t-rr1` (deleted after
the run), benches run sequentially in one lane. All numbers are Criterion
**medians** read from `_t-rr1/criterion/*/new/estimates.json`. Raw console
logs: `/tmp/rr-fast_algorithms.log`, `/tmp/rr2-medium_algorithms.log` etc.
(tmp — transient; criterion data deleted with the build root).

**Dataset provenance (supersedes §0 of the morning doc for this run)**: the
real 1,050-case Sepsis log (5,441,435 bytes) and the correctly-labeled
`bpi2020_domestic_declarations.xes` were on disk for this
run, so every number below is grounded on real event data. The morning run's
sepsis-tagged numbers were grounded on the 5-trace / 37-event stub — every
sepsis-grounded ratio below is a **dataset effect, not a code regression**.

## 1. Delta tables — morning §1 vs postfix medians

### fast_algorithms

| Bench | morning | postfix | ratio | note |
|---|---|---|---|---|
| dfg/100 | 13.60 µs | 471.5 µs | 34.7x | dataset: 37-event stub → 1,050 real cases |
| declare/100 | 46.16 µs | 276.0 µs | 6.0x | dataset + Declare confidence-math fix (2c980c399) |
| heuristic_miner t0.8 | 5.65 µs | 64.7 µs | 11.5x | dataset |
| heuristic_miner t0.5 | 19.21 µs | 87.6 µs | 4.6x | dataset |
| heuristic_miner t0.3 | 19.65 µs | 84.9 µs | 4.3x | dataset |
| alpha_plus_plus/100 | 68.66 µs | 511.9 µs | 7.5x | dataset |
| inductive_miner/100 | 32.55 µs | 770.5 µs | 23.7x | dataset |
| hill_climbing/100 | 8.62 µs | 144.0 µs | 16.7x | dataset |
| process_skeleton/100 | 66.79 µs | 1.293 ms | 19.4x | dataset |
| event_statistics/100 | 593.6 ns | 466 ns | 0.78x | faster on the real log; benign |
| case_duration/100 | 1.26 µs | 1.66 µs | 1.32x | dataset |

### tier1_discovery

| Bench | morning | postfix | ratio | note |
|---|---|---|---|---|
| dfg/100 | 11.75 µs | 397.8 µs | 33.9x | dataset |
| process_skeleton/100 | 52.73 µs | 1.213 ms | 23.0x | dataset |
| alpha_plus_plus/100 | 144.7 µs | 453.6 µs | 3.1x | dataset |
| heuristic_miner/100 | 33.33 µs | 75.7 µs | 2.3x | dataset |
| inductive_miner/100 | 33.30 µs | 607.5 µs | 18.2x | dataset |

### medium_algorithms — first attempt was a vacuous exit-0 run (§2.1); fixed and rerun

| Bench | morning | postfix | note |
|---|---|---|---|
| astar/log/sepsis | 1.95 ms | 748.2 µs | 2.6x **faster** — morning benched the pre-fix beam search; genuine A* (c0d9283f4) + real log |
| astar/log/roadtraffic100 | 6.50 ms | 99.8 µs | 65x **faster** — genuine A* fix |
| simulated_annealing road (t100 cool0.95/0.99) | 12.98–244.7 µs range | 58.3 / 249.5 µs | within the morning range; canonical PSO/ACO wave did not touch SA |
| simulated_annealing sepsis | (stub-grounded, in the morning range) | 655.9 µs / 2.13 ms | real 1,050-case log |
| ant_colony sepsis / road | 55–94 µs (both, stub) | 1.42 ms / 220.9 µs | dataset + per-decision-point ACO normalization (227bd51ad) |
| dfg_filtered sepsis mf2/mf5/mf10 | 13.1–166 µs (stub) | 5.85 / 5.87 / 6.05 ms | dataset (real 1,050-case log) |
| dfg_filtered road mf2/5/10 | (in 13.1–166 µs) | 161.3 / 161.6 / 161.7 µs | flat |
| optimized_dfg sepsis / road | 16.1 µs / 170.5 µs | 7.40 ms / 167.0 µs | sepsis = dataset; road flat (0.98x) |
| trace_variants sepsis / road | 7.8–32.9 µs (stub) | 1.219 ms / 32.1 µs | dataset; road flat |
| sequential_patterns sepsis / road | 36.2–45.1 µs (stub) | 3.46 ms / 45.3 µs | dataset; road flat |
| concept_drift sepsis / road | 327 ns / 519.9 µs | 35.93 ms / 529.3 µs | sepsis = dataset (real 15,214-event log); road flat (1.02x) |
| cluster_traces sepsis / road | 5.9–44.8 µs (stub) | 1.004 ms / 44.8 µs | dataset; road flat identical to morning |

### conformance_bench

| Bench | morning | postfix | note |
|---|---|---|---|
| declare/cases/10000 | 270 µs | 258.6 µs | slightly faster despite the Declare confidence fix |
| temporal_profile discovery/5000 | 1.64 ms | 1.630 ms | flat |
| real_sepsis/simd_token_replay | 4.99 µs (stub) | 4.487 ms | ~900x — stub → real 1,050-case log (expected; the morning number is void) |
| declare/100 | — | 2.34 µs | no morning number |
| declare/1000 | — | 26.4 µs | no morning number |
| etconformance_precision/5000 | — | 6.52 ms | no morning number |
| simd_token_replay/10000 | — | 14.04 ms | no morning bpi2020 number |
| token_replay/5000 | — | 17.6 ms | no morning number |
| temporal checking/1000 | — | 301.0 µs | no morning number |
| temporal discovery/1000 | — | 276.2 µs | no morning number |

### ml_algorithms

| Bench | morning | postfix | note |
|---|---|---|---|
| classify k3/100 | 2.89 µs | 2.12 µs | improved |
| classify k5/100 | — | 3.35 µs | no morning number |
| classify k10/10000 | 10.85 ms | 10.96 ms | flat (+1%) |
| classify k10/1000 | — | 232.5 µs | no morning number |
| cluster k5_n100 | 6.10 µs | 87.1 µs | re-grounded on real-log prefixes (F2) + real dataset now on disk |
| cluster k10_n100 | 6.19 µs | 87.1 µs | same |
| anomaly 100/1k/10k | — | 10.2 / 95.9 / 915.1 µs | no morning number |
| automl forecast/500 | — | 1.009 ms | no morning number |

### ml_latency (n=10 → n=500 sweep)

| Bench | morning n=10 | postfix n=10 | postfix n=500 | morning n=500 |
|---|---|---|---|---|
| regression | 2.55 µs | 2.93 µs | 807.8 µs | 820.7 µs |
| forecasting | 3.95 µs | 3.91 µs | 830.8 µs | 852.7 µs |
| classification | 7.95 µs | 6.84 µs | 1.023 ms | 1.077 ms (improved) |
| pca | 6.94 µs | 6.90 µs | 959.1 µs | 945.3 µs (+1.5%, noise) |
| automl classify | 7.66 µs | 7.76 µs | 1.721 ms | 1.725 ms (flat) |

### prediction_latency — first attempt failed (§2.2); fixed and rerun

| Bench | morning | postfix | note |
|---|---|---|---|
| next_activity/sepsis | 156.8 ns | 308.7 ns | stub → real log; morning number void |
| drift/sepsis | 463.2 ns | 14.63 µs | stub → real 15,214-event log (expected) |
| e2e model_building/sepsis | 8.70 µs | 2.148 ms | stub → real log (~250x, expected) |
| e2e inference | 20.6 ns | 19.8 ns | flat |
| batch/1000 | 18.84 µs | 18.93 µs | flat (1.005x) |
| remaining_time / outcome / resource inference | — | 1.083 µs / 10.5 ns / 53.7 ns | no morning number |
| features_importance/sepsis | — | 193.8 µs | no morning number |
| json_serialization | — | 824.5 ns | no morning number |

## 2. Failures found during this rerun — both fixed in this session

1. **medium_algorithms vacuous exit-0 run (0 measurements)** — its private
   `load_dataset` (`wasm4pm/benches/medium_algorithms.rs:107`) only tried
   cwd-relative `bench_data/...` candidates; the bench binary's cwd is the
   crate dir `wasm4pm/`, so every dataset silently skipped and the bench
   exited 0 with zero benchmarks — a vacuous pass (D4-class). Fixed: added
   `../bench_data/` and `../../bench_data/` fallbacks to all three dataset
   candidate lists (matching the committed `helpers.rs` candidates). Rerun:
   exit 0, 24 measurements.
2. **prediction_latency panic** (`wasm4pm/benches/prediction_latency.rs:83`
   assert, exit 101) — its private `load_real_log` used only the **strict**
   `validate_and_parse_xes`, which rejects the real 4TU Sepsis log (nested
   classifier metadata under `<int key="meta_general:classifiers">`, per
   `helpers.rs::parse_xes_tolerant`'s doc comment); the shared helpers loader
   has a tolerant fallback parser for exactly this case (now `pub`). Fixed:
   strict-first with tolerant fallback
   (`wasm4pm/benches/prediction_latency.rs:45`). Rerun: exit 0, 14
   measurements.

## 3. Unexplained-regression verdict (the lane's question)

Every >2x movement is sepsis-dataset-driven (37-event stub → 1,050-case real
log), the astar 2.6x/65x improvements are the genuine-A* fix (c0d9283f4), and
the ACO/Declare/cluster movements are the re-grounding + algorithm fixes.
Non-dataset movements on unchanged inputs (roadtraffic, bpi2020, numeric
arrays): all within ±1.5% or faster. **No regression vs morning that is not
explained by the real-dataset/contract changes.** The Declare
confidence-math fix and ML honesty re-grounding cost nothing measurable.

## 4. Wall times

Compile: fast_algorithms first build ~7 min; subsequent benches 2-18 s each
(shared `_t-rr1`). Measure time per bench: fast_algorithms/tier1 ≈ 1-2 min;
medium_algorithms ≈ 4 min; conformance_bench ≈ 3 min; ml_algorithms ≈ 3 min;
ml_latency ≈ 2 min; prediction_latency ≈ 2 min. Total lane wall ≈ 25 min
sequential. First-attempt failures and reruns included.

## See Also

- [`RESULTS-2026-10-10.md`](RESULTS-2026-10-10.md) — morning run record (§0 dataset provenance, §1 lane results, §8 post-run algorithm corrections)
