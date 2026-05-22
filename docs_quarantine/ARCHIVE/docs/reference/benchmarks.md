# Performance Benchmarks

All 18 wasm4pm tools are benchmarked against a standard 500-event XES log
compiled to WASM at optimization level 3. Numbers represent median wall-clock time across 100 warm
invocations with the WASM module already loaded. Cold-start (module instantiation) is measured
separately and is not included here.

---

## Methodology

- **Benchmark log:** `bench_data/benchmark_500.xes` — 500 events, 50 cases, 10 unique activities
- **OCEL benchmark:** `bench_data/benchmark_500.json` — 500 events, 5 object types
- **Warm runs:** 100 iterations after 5 ignored warm-up calls
- **Metric:** median wall-clock (ms), not CPU time
- **Environment:** single-core WASM runtime, 256 MB memory limit

SLA budgets apply a tier-specific multiplier to the baseline:

| Tier | Multiplier | Rationale |
|------|-----------|-----------|
| FastTier | × 5 | Interactive; any spike is user-visible |
| MediumTier | × 5 | Batch; some headroom for larger logs |
| SlowTier | × 3 | Offline; tighter because durations are already high |

---

## Baseline Results

| Tool | Tier | Baseline (ms) | SLA Budget (ms) |
|------|------|--------------|----------------|
| Get Capability Registry | FastTier | 0.1 | 0.5 |
| Encode DFG as Text | FastTier | 0.3 | 1.5 |
| Discover DFG | FastTier | 0.5 | 2.5 |
| Encode OCEL as Text | FastTier | 0.8 | 4 |
| Discover Variants | FastTier | 1 | 5 |
| Load OCEL | FastTier | 1.5 | 7.5 |
| Analyze Statistics | FastTier | 2 | 10 |
| Flatten OCEL | MediumTier | 3 | 15 |
| Discover OCEL DFG Per Type | MediumTier | 4.5 | 22.5 |
| Detect Bottlenecks | MediumTier | 5 | 25 |
| Discover Alpha++ | MediumTier | 5 | 25 |
| Detect Concept Drift | MediumTier | 6 | 30 |
| Extract Case Features | MediumTier | 7 | 35 |
| Check Conformance | MediumTier | 8 | 40 |
| Discover ILP Optimization | SlowTier | 20 | 60 |
| Discover Genetic Algorithm | SlowTier | 40 | 120 |
| Discover OC Petri Net | SlowTier | 50 | 150 |
| Compare Algorithms | SlowTier | 75 | 225 |

---

## Tier Summary

**FastTier** tools complete in under 2 ms and are safe to call synchronously in request handlers.

**MediumTier** tools complete in 3–8 ms and are suitable for background tasks triggered per user
action.

**SlowTier** tools complete in 20–75 ms and should be queued or run in dedicated worker pods for
production workloads with large logs.

---

## Regression Gate

The CI benchmark gate (`make bench-gate`) fails the build if any tool exceeds its SLA budget on
the standard benchmark log. See [GitHub Actions](./github-actions.md) for the workflow definition.

## See Also

- [Algorithm Reference](./algorithms.md) — tier and format classification
- [HTTP API Reference](./http-api.md) — endpoint paths
