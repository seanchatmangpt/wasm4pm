# Algorithm Reference

wasm4pm provides 18 process mining tools across three performance tiers, plus 6 ML analysis
tasks. Each tier reflects typical execution time for a benchmark log of 500 events. Tier boundaries
are FastTier (< 1 ms), MediumTier (< 10 ms), and SlowTier (< 100 ms).

---

## Fast Tier

Suitable for interactive use and real-time pipelines. Sub-millisecond to 2 ms per 500-event log.

| Tool | Input | Output | OCEL | Duration |
|------|-------|--------|------|----------|
| Get Capability Registry | `none` | `json` | no | 0.1 ms |
| Encode DFG as Text | `handle` | `text` | no | 0.3 ms |
| Discover DFG | `xes` | `json` | no | 0.5 ms |
| Encode OCEL as Text | `handle` | `text` | yes | 0.8 ms |
| Discover Variants | `handle` | `json` | no | 1 ms |
| Load OCEL | `ocel2` | `handle` | yes | 1.5 ms |
| Analyze Statistics | `handle` | `json` | no | 2 ms |

---

## Medium Tier

Suitable for batch processing and on-demand analysis. 3 ms to 8 ms per 500-event log.

| Tool | Input | Output | OCEL | Duration |
|------|-------|--------|------|----------|
| Flatten OCEL | `handle` | `json` | yes | 3 ms |
| Discover OCEL DFG Per Type | `handle` | `json` | yes | 4.5 ms |
| Detect Bottlenecks | `handle` | `json` | no | 5 ms |
| Discover Alpha++ | `xes` | `json` | no | 5 ms |
| Detect Concept Drift | `handle` | `json` | no | 6 ms |
| Extract Case Features | `handle` | `json` | no | 7 ms |
| Check Conformance | `xes` | `json` | no | 8 ms |

---

## Slow Tier

Suitable for offline discovery and comparative studies. 20 ms to 75 ms per 500-event log.

| Tool | Input | Output | OCEL | Duration |
|------|-------|--------|------|----------|
| Discover ILP Optimization | `xes` | `json` | no | 20 ms |
| Discover Genetic Algorithm | `xes` | `json` | no | 40 ms |
| Discover OC Petri Net | `handle` | `json` | yes | 50 ms |
| Compare Algorithms | `xes` | `json` | no | 75 ms |

---

## ML Analysis Tasks

ML tasks run post-discovery via `pmctl ml <task>` or automatically when `[ml]` config is enabled.

| Task | CLI Alias | Description | Key Parameters |
|------|-----------|-------------|----------------|
| ML Classification | `ml classify` | Classify traces by label | `--method knn`, `-k 5` |
| ML Clustering | `ml cluster` | Cluster traces into groups | `--method kmeans`, `-k 3` |
| ML Forecasting | `ml forecast` | Time series prediction | `--forecast-periods 5` |
| ML Anomaly Detection | `ml anomaly` | Detect anomalous traces | `--eps 1.0` |
| ML Regression | `ml regress` | Remaining-time regression | `--method linear_regression` |
| ML PCA | `ml pca` | Feature dimensionality reduction | `--n-components 2` |

ML tasks can also run via `pmctl run` when the config has `[ml] enabled = true`. The `ml` profile
selects all 6 ML algorithms for the planner.

---

## Input Formats

| Format | Description |
|--------|-------------|
| `xes` | IEEE XES event log |
| `ocel2` | OCEL 2.0 object-centric event log (JSON) |
| `handle` | Pre-loaded in-process WASM handle (use `load_ocel` or `discover_dfg` first) |
| `none` | No input required |

## See Also

- [Reference: Config Schema](./config-schema.md) — `[ml]` section for ML configuration
- [HTTP API Reference](./http-api.md) — endpoint paths and request schema
- [Performance Benchmarks](./benchmarks.md) — SLA budgets and methodology
