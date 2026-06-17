# Algorithm Registry — v26.6.9 (60 admitted)

All 60 algorithms are admitted in the release certificate (BLAKE3-bound to git commit).

> **Source of truth:** `artifacts/release/ALGORITHM_BEHAVIOR_MATRIX.v26.6.9.md`
> Every algorithm passed positive, negative (structured refusal), and invariant (determinism) test cases.

---

## Listing Algorithms

```bash
wpm algorithms
wpm algorithms --tier fast          # fast (<30ms), balanced, quality, stream
wpm algorithms --show-ratings        # Van der Aalst quality dimensions
wpm algorithms --format json
```

## Alias Resolution

`wpm run -a <name>` and `wpm compare` accept CLI aliases (e.g. `dfg`, `inductive`, `heuristic`) or full registry IDs (e.g. `heuristic_miner`). Resolution is handled by `resolveAlgorithmId()` in `@wasm4pm/contracts`.

## Default Algorithm

When no `-a` flag is given, `wpm run` uses:

1. `config.algorithm.name` from `wasm4pm.toml` / `wasm4pm.json` in the current directory
2. Else the first algorithm for your execution profile (`balanced` → `alpha_plus_plus`)
3. Else `heuristic_miner`

The repo root ships `wasm4pm.toml` with `algorithm.name = "simd_streaming_dfg"`.

---

## Discovery (20 algorithms)

These algorithms accept XES event logs and exit 0 on well-formed input.

| ID | Alias | Description | Input | Status |
|----|-------|-------------|-------|--------|
| `a_star` | `astar` | A* shortest-path discovery over DFG | XES | admitted |
| `aco` | `ant-colony` | Ant Colony Optimisation process discovery | XES | admitted |
| `alpha_plus_plus` | `alpha` | Alpha++ miner — Petri net from directly-follows graph | XES | admitted |
| `declare` | `declare` | Declarative constraint mining (LTL-based) | XES | admitted |
| `dfg` | `dfg` | Directly-Follows Graph — fastest baseline discovery | XES | admitted |
| `genetic_algorithm` | `genetic` | Genetic algorithm process model search | XES | admitted |
| `heuristic_miner` | `heuristic` | Heuristics Miner with dependency thresholds | XES | admitted |
| `hierarchical_dfg` | — | Hierarchical DFG with sub-process detection | XES | admitted |
| `hill_climbing` | `hill-climbing` | Hill-climbing local search over process space | XES | admitted |
| `ilp` | `ilp` | ILP Miner — integer linear programming Petri net | XES | admitted |
| `inductive_miner` | `inductive` | Inductive Miner — sound process tree discovery | XES | admitted |
| `log_to_trie` | `prefix-tree` | Prefix-tree (trie) representation of traces | XES | admitted |
| `optimized_dfg` | `dfg-optimized` | DFG with arc-weight optimisation pass | XES | admitted |
| `process_skeleton` | `skeleton` | Minimal skeleton DFG for fast overview | XES | admitted |
| `pso` | `pso` | Particle Swarm Optimisation discovery | XES | admitted |
| `simd_streaming_dfg` | `simd-dfg` | SIMD-accelerated streaming DFG (default algorithm) | XES | admitted |
| `simulated_annealing` | `simulated-annealing` | Simulated Annealing stochastic search | XES | admitted |
| `smart_engine` | — | Auto-selects best algorithm for input characteristics | XES | admitted |
| `streaming_log` | — | Streaming event log ingestion and analytics | XES | admitted |
| `transition_system` | `transition-system` | Transition system from event log | XES | admitted |

---

## Discovery Analytics (10 algorithms)

These algorithms accept XES and exit 0; they produce analytics artifacts rather than process models.

| ID | Alias | Description | Input | Status |
|----|-------|-------------|-------|--------|
| `analyze_process_speedup` | — | Measures speedup potential across variants | XES | admitted |
| `analyze_variant_complexity` | — | Complexity metrics per trace variant | XES | admitted |
| `batches` | `batches` | Detects batch-execution patterns in the log | XES | admitted |
| `causal_graph` | `causal-graph` | Causal dependency graph from event ordering | XES | admitted |
| `compute_activity_transition_matrix` | — | Activity-to-activity transition probability matrix | XES | admitted |
| `compute_trace_similarity_matrix` | — | Pairwise trace similarity matrix | XES | admitted |
| `correlation_miner` | `correlation` | Correlation-based dependency miner | XES | admitted |
| `handover_network` | — | Social network: handover-of-work between resources | XES | admitted |
| `performance_spectrum` | `perf-spectrum` | Performance spectrum visualisation data | XES | admitted |
| `working_together_network` | — | Social network: co-worker collaboration frequency | XES | admitted |

---

## Object-Centric (6 algorithms)

> **Note:** OCEL algorithms require OCEL 2.0 JSON input, not XES. On XES input these algorithms exit 3 (execution error — wrong input format). Pass an OCEL 2.0 `.json` file via `wpm run -a <id> --source <file.json>`.

| ID | Alias | Description | Input | Status |
|----|-------|-------------|-------|--------|
| `ocel_dfg` | — | Object-centric DFG across all object types | OCEL 2.0 JSON | admitted |
| `ocel_dfg_per_type` | — | Separate DFG per object type | OCEL 2.0 JSON | admitted |
| `ocel_encode` | — | Encodes OCEL log to feature matrix | OCEL 2.0 JSON | admitted |
| `ocel_oc_declare` | — | Object-centric Declare constraint discovery | OCEL 2.0 JSON | admitted |
| `ocel_ocla` | — | Object-centric log abstraction analytics | OCEL 2.0 JSON | admitted |
| `ocel_petri_net` | — | Per-type flattened Petri nets (one per object type; cross-type sync not modelled) | OCEL 2.0 JSON | admitted |

---

## ML & Analytics (8 algorithms)

> **Note:** ML algorithms require labeled dataset params via CLI flags (`--values-json`, `--labels`, etc.). On XES-only input these algorithms exit 1 (config error — missing required parameters).

| ID | Alias | Description | Required flags | Status |
|----|-------|-------------|----------------|--------|
| `automl_classify` | — | AutoML classification over process features | `--values-json` | admitted |
| `automl_forecast` | — | AutoML time-series forecasting | `--values-json` | admitted |
| `ml_anomaly` | `ml-anomaly` | Anomaly detection on feature vectors | `--values-json` | admitted |
| `ml_classify` | `ml-classify` | Supervised classification | `--values-json` | admitted |
| `ml_cluster` | `ml-cluster` | Unsupervised clustering | `--values-json` | admitted |
| `ml_forecast` | `ml-forecast` | Time-series forecasting | `--values-json` | admitted |
| `ml_pca` | `ml-pca` | Principal Component Analysis | `--values-json` | admitted |
| `ml_regress` | `ml-regress` | Regression over numeric process features | `--values-json` | admitted |

---

## Conformance (4 algorithms)

> **Note:** `etconformance_precision` and `generalization` require a pre-discovered Petri net handle passed via `--petri-net-handle`. On XES-only input without a handle these algorithms exit 1 (config error — missing required parameter).

| ID | Alias | Description | Input | Status |
|----|-------|-------------|-------|--------|
| `alignments` | `alignment` | Token-replay alignment-based conformance checking | XES | admitted |
| `complexity_metrics` | `complexity` | Structural complexity metrics (size, CFC, depth) | XES | admitted |
| `etconformance_precision` | `etconformance` | ETConformance precision measurement | XES + `--petri-net-handle` | admitted |
| `generalization` | `generalization` | Van der Aalst generalization score | XES + `--petri-net-handle` | admitted |

---

## Simulation (2 algorithms)

> **Note:** `playout` requires a Petri net handle and exits 1 without it. `monte_carlo_simulation` accepts XES and exits 0.

| ID | Alias | Description | Input | Status |
|----|-------|-------------|-------|--------|
| `monte_carlo_simulation` | `montecarlo` | Monte Carlo simulation from discovered model | XES | admitted |
| `playout` | `playout` | Stochastic playout from Petri net | Petri net handle | admitted |

---

## Prediction (5 algorithms)

These algorithms accept XES event logs and exit 0 on well-formed input.

| ID | Alias | Description | Input | Status |
|----|-------|-------------|-------|--------|
| `compute_ewma` | — | Exponentially weighted moving average on case metrics | XES | admitted |
| `detect_drift` | — | Concept drift detection over sliding window | XES | admitted |
| `predict_next_activity` | — | Next-activity prediction from trace prefix | XES | admitted |
| `predict_outcome` | — | Case outcome prediction | XES | admitted |
| `predict_remaining_time` | — | Remaining time prediction from trace prefix | XES | admitted |

---

## Import / Export (4 algorithms)

> **Note:** Import algorithms require their respective model format as input (not XES). They exit 3 on XES input. Export algorithms require a model handle via `--petri-net-handle` or equivalent.

| ID | Alias | Description | Input | Status |
|----|-------|-------------|-------|--------|
| `bpmn_import` | `import-bpmn` | Import BPMN 2.0 XML to process tree | BPMN XML | admitted |
| `pnml_import` | `import-pnml` | Import PNML to Petri net | PNML XML | admitted |
| `powl_to_process_tree` | `powl-to-tree` | Convert POWL model to process tree | POWL JSON | admitted |
| `yawl_export` | `export-yawl` | Export process model to YAWL format | model handle | admitted |

---

## Agentic (1 algorithm)

| ID | Alias | Description | Input | Status |
|----|-------|-------------|-------|--------|
| `agentic_pipeline` | — | Orchestrated multi-step agentic pipeline over event log | XES | admitted |

---

## Evidence

Certificate: `artifacts/release/RELEASE_CERTIFICATE.v26.6.9.json`

All 60 algorithms pass three test case categories:
- **Positive** — valid input produces structured output with non-empty receipt
- **Negative** — invalid/empty input produces structured refusal (no panic, no unhandled error)
- **Invariant** — determinism: same input produces bit-exact output across runs (seeded RNG, sorted HashMap iteration)

BLAKE3 receipt chain is mandatory for every `wpm run` invocation. Exit codes: 0 ok, 1 config, 2 source, 3 execution, 4 partial, 5 system.

---

## Examples

Runnable TypeScript examples for key algorithm domains:

| Example | Domain | Quick run |
|---------|--------|-----------|
| `examples/01-discovery/01-basic-dfg.ts` | Process Discovery | `tsx examples/01-discovery/01-basic-dfg.ts` |
| `examples/02-conformance/01-basic-fitness.ts` | Conformance | `tsx examples/02-conformance/01-basic-fitness.ts` |
| `examples/06-scaling/01-streaming-dfg.ts` | Streaming / SIMD | `tsx examples/06-scaling/01-streaming-dfg.ts` |
| `examples/08-advanced-discovery.ts` | Advanced Discovery | `tsx examples/08-advanced-discovery.ts data/small-example.xes` |
| `examples/10-conformance-and-metrics.ts` | Conformance Metrics | `tsx examples/10-conformance-and-metrics.ts data/small-example.xes` |
| `examples/11-matrix-and-networks.ts` | Social Network / Matrix | `tsx examples/11-matrix-and-networks.ts data/small-example.xes` |
| `examples/14-ocel-process-mining.ts` | OCEL 2.0 | `tsx examples/14-ocel-process-mining.ts` |
| `examples/15-powl-import-export.ts` | POWL | `tsx examples/15-powl-import-export.ts` |
| `examples/ml-classify.ts` | ML: Classification | `tsx examples/ml-classify.ts data/small-example.xes` |
| `examples/ml-cluster.ts` | ML: Clustering | `tsx examples/ml-cluster.ts data/small-example.xes 5` |
| `examples/ml-forecast.ts` | ML: Time-series | `tsx examples/ml-forecast.ts data/small-example.xes` |
| `examples/ml-anomaly.ts` | ML: Anomaly Detection | `tsx examples/ml-anomaly.ts data/small-example.xes 0.5` |
| `examples/ml-regress.ts` | ML: Regression | `tsx examples/ml-regress.ts data/small-example.xes linear` |
| `examples/ml-pca.ts` | ML: PCA | `tsx examples/ml-pca.ts data/small-example.xes 3` |
| `examples/12-ml-automl-predict.ts` | AutoML + Predict | `tsx examples/12-ml-automl-predict.ts data/small-example.xes` |
| `examples/13-streaming-and-agentic.ts` | Streaming + Agentic | `tsx examples/13-streaming-and-agentic.ts data/small-example.xes` |

Full example catalog: [examples/README.md](../../examples/README.md)
