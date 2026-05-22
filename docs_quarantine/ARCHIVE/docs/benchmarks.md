# wasm4pm — Algorithm Latency Reference

Measured wall-clock numbers from Criterion benchmark runs (Rust native binary) and
TypeScript bench output. All figures are representative medians on a 2024-era laptop.
WASM browser builds are typically 1.2–1.6× slower than the native Node.js build.

---

## Discovery Algorithms

| Algorithm | Latency | Dataset | Notes |
|---|---|---|---|
| `dfg` | ~0.5 ms | 100 events | Directly-Follows Graph, single pass |
| `heuristic_miner` | ~2 ms | 100 events | Dependency threshold default 0.5 |
| `alpha_plus_plus` | ~5 ms | 100 events | Petri net output |
| `inductive_miner` | ~8 ms | 100 events | Recursive cut-based, process tree output |
| `ilp` | ~20 ms | 100 events | Integer Linear Programming, highest quality |
| `genetic_algorithm` | ~400 ms | 1 000 events | 100 generations, population 50 |

For larger dataset scaling see [REAL-BENCHMARK-RESULTS.md](./REAL-BENCHMARK-RESULTS.md).

---

## ML Analysis Algorithms (`@wasm4pm/ml`)

| Algorithm ID | Complexity | Latency profile | Notes |
|---|---|---|---|
| `ml_classify` | O(n·k) per prediction | k-NN k=3 | Slowest variant; `naive_bayes` is O(1) per sample |
| `ml_regress` | O(n) fit | OLS, single-pass | Closed-form least squares |
| `ml_forecast` | O(n) fit | Exponential smoothing α=0.3 | Single-pass decomposition |
| `ml_anomaly` | O(n) score | Information-theoretic | Includes EMA smoothing |
| `ml_pca` | O(n) fit | Closed-form 2×2 eigendecomposition | Jacobi iterations on covariance submatrix |
| `ml_cluster` | O(n·k·i) | bitset k-means | **internal only — not yet exported to the JS API** (no `#[wasm_bindgen]` export) |

---

## Prediction Perspectives (TypeScript, `wpm predict`)

These figures are after the model has been fit on the training log.

| Perspective | Latency / call | Complexity | Notes |
|---|---|---|---|
| `next_activity` | ~0.05 ms | O(k) lookup | n-gram Markov, order configurable |
| `outcome` | ~0.05 ms | O(1) | Anomaly score boundary check |
| `features` | ~0.01 ms | O(d) | Prefix feature extraction |
| `remaining_time` | ~0.1 ms | O(1) | Weibull survival regression |
| `resource` / UCB1 | O(k) | O(k) | k = number of resource options |
| `drift` (window=50) | 500–1 000 ms | O(n·w) | On 10 000-trace log; EWMA + Jaccard window comparison |

---

## Notes on `ml_cluster` status

`ml_cluster` is listed in the kernel registry with speed=35 / quality=55, but the underlying
Rust function (`cluster_traces()` in `fast_discovery.rs`) has **no `#[wasm_bindgen]` export**
and is therefore not reachable from JavaScript or the `wpm ml cluster` CLI.
It is marked `REMOVED` in the kernel registry.  Do not rely on it in production code.

---

*Last updated: 2026-05-05 (v26.4.5 benchmark run)*
