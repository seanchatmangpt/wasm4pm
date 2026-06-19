# Benchmark Coverage

> The product is CodeManufactory; RevOps is merely proof that CodeManufactory works.

Phase-3 benchmark completeness audit for `wasm4pm`. Enumerates every Criterion
bench target, its primary metric, whether it is grounded on real event-log data,
and the remaining gaps. Generated/updated by the benchmark completeness critic.

## Registration status

All standalone Criterion benches in `wasm4pm/benches/*.rs` are now registered in
`wasm4pm/Cargo.toml` as `[[bench]]` targets with `harness = false`.

**Newly registered in phase 3** (were present on disk but missing a `[[bench]]`
entry, so `cargo bench --bench <name>` could not target them and CI never built
them): `anti_fake`, `native_api_bench`, `ocel_export`, `parser_bench`,
`route_driven_tdd`, `self_conformance`. All six compile clean under
`cargo bench -p wasm4pm --bench <name> --no-run`.

`benches/helpers.rs` is intentionally **not** registered — it is a shared
module (`#[path = "helpers.rs"] mod helpers;`) included by other benches, not a
standalone target.

`benches/closed_claw/` is registered as a single target (`name = "closed_claw"`,
`path = "benches/closed_claw/mod.rs"`).

## Per-bench inventory

Metric legend: **TP** = uses `criterion::Throughput` (rate reported, comparable
across input sizes); **BB** = uses `black_box` (optimizer cannot elide work);
**latency-only** = wall-clock per-iter time, no rate. Real data = grounds on
`bench_data/` XES/OCEL fixtures or `tests/fixtures/papers/*.json`.

| Bench | Metric | Real data | Notes |
|-------|--------|-----------|-------|
| autonomic_real_data_bench | TP + BB | **yes** | grounded on bench_data event logs |
| native_api_bench | TP | **yes** | real logs; lacks `black_box` (gap) |
| real_data_bench | TP | **yes** | grounded on bench_data XES/OCEL |
| fast_algorithms | TP | synthetic | discovery latency, generated logs |
| medium_algorithms | TP | synthetic | |
| slow_algorithms | TP | synthetic | |
| analytics | TP | synthetic | lacks `black_box` (gap) |
| conformance | TP | synthetic | |
| conformance_bench | TP + BB | synthetic | |
| ml_algorithms | TP + BB | synthetic | |
| ml_latency | BB | synthetic | latency-only, no Throughput |
| ml_streaming_sim_bench | TP | synthetic | |
| streaming_algorithms | TP | synthetic | |
| streaming_vs_batch | TP | synthetic | |
| extended_discovery | TP | synthetic | |
| powl_discovery | TP | synthetic | |
| tier1_discovery | TP | synthetic | |
| tier2_metaheuristic | TP | synthetic | |
| simd_inner_loops | BB | synthetic | micro-kernel, latency-only |
| hot_kernels | BB | synthetic | micro-kernel, latency-only |
| scalability_benchmark | TP | synthetic | size-scaling |
| jtbd_benchmark | TP + BB | synthetic | |
| autonomy_jtbd_validation | latency-only | synthetic | `cloud` feature; no TP/BB (gap) |
| agentic_bench | latency-only | synthetic | `cloud` feature; no TP/BB (gap) |
| autoprocess_latency | BB | synthetic | `cloud` feature; latency-only |
| autoprocess_criterion | TP + BB | synthetic | `cloud` feature |
| automl_profiling | BB | synthetic | latency-only |
| cache_efficiency_bench | BB | synthetic | |
| constant_latency_loops | BB | synthetic | |
| rdtsc_validation | latency-only | synthetic | cycle-counter validation; no TP/BB (gap) |
| drift_bench | TP | synthetic | |
| drift_detection_detailed | TP | synthetic | |
| mttr_recovery | BB | synthetic | latency-only |
| rl_convergence | BB | synthetic | latency-only |
| prediction_accuracy | BB | synthetic | accuracy, latency-only |
| prediction_latency | TP + BB | synthetic | |
| prediction_baseline_comparison | TP | synthetic | |
| oracle_rank_validation | TP | synthetic | |
| ocel_flattening | TP | synthetic | |
| ocel_export | TP | synthetic | lacks `black_box` (gap) |
| parser_bench | TP + BB | synthetic | XES loader; **fixed phase 3** (added TP+BB) |
| anti_fake | TP + BB | synthetic | anti-fraud bench guard |
| route_driven_tdd | BB | synthetic | route-driven; no Throughput |
| self_conformance | TP + BB | synthetic | |
| closed_claw | mixed | synthetic | multi-pipeline harness (`benches/closed_claw/`) |

### Cognition breeds (`crates/wasm4pm-cognition/benches/`)

| Bench | Metric | Real data | Notes |
|-------|--------|-----------|-------|
| breed_latency | latency | **yes** | data-driven from `tests/fixtures/papers/*.json`; one bench per resolvable `BreedId`. Cannot rot — drop a fixture, get a bench. |
| breed_determinism | determinism | **yes** | full `BreedOutput` byte-equality per breed |

Every PARTIAL_ALIVE breed with a paper fixture is auto-benched; a fixture stem
that does not resolve to a `BreedId` is SKIPPED (logged, never panics). This is
the trustworthy path: coverage is evidence-derived, not hand-maintained.

## Remaining gaps (prioritized)

1. **Synthetic-only grounding for most discovery/conformance benches.** Only
   3 wasm4pm benches (`real_data_bench`, `autonomic_real_data_bench`,
   `native_api_bench`) read `bench_data/` logs (sepsis, BPI2017/2020, road
   traffic, OCEL2.0). The discovery/conformance/ML benches use generated logs,
   so reported numbers are not grounded in published-dataset behaviour. Highest
   value follow-up: add a `bench_data`-fed variant to `fast_algorithms`,
   `conformance_bench`, and `extended_discovery`.
2. **`native_api_bench` reports Throughput but no `black_box`** on real-data
   workloads — results may be partially elided. Add `black_box` around inputs.
3. **`analytics` and `ocel_export` lack `black_box`** despite Throughput.
4. **Latency-only benches with neither Throughput nor `black_box`:**
   `autonomy_jtbd_validation`, `agentic_bench`, `rdtsc_validation`. The first
   two are `cloud`-gated; `rdtsc_validation` is a cycle-counter sanity check so
   absence of Throughput is acceptable, but `black_box` should still wrap its
   measured loop body.
5. **No cognition breed is left unbenched** given a paper fixture — but breeds
   without a `tests/fixtures/papers/<id>.json` are silently absent from the
   latency/determinism suites. Audit fixture-vs-`BreedId::ALL` parity to confirm
   all 55 covered breeds have a fixture.

## Validation performed

```
cargo bench -p wasm4pm --bench parser_bench --bench anti_fake \
  --bench native_api_bench --bench ocel_export --bench route_driven_tdd \
  --bench self_conformance --no-run
```
All six newly registered targets built (`Finished bench profile`). No full
benchmark run was executed in this phase.
