# Reference: Algorithms

> **Generated from kernel registry.** Re-run `pnpm run docs:algorithms` after registry changes.
> Version: **v26.5.21** · Count: **60** registered algorithms.

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

## Compare vs Run

- **`wpm compare dfg,heuristic,inductive`** — benchmarks a fixed subset of discovery aliases with sparklines
- **`wpm run -a <id>`** — dispatches any registered algorithm below

---

## Core Discovery

| ID | Alias | Output | Speed | Quality | Robust | Scales |
|----|-------|--------|------:|--------:|:------:|:------:|
| `a_star` | `astar` | dfg | 60 | 70 | ✗ | ✗ |
| `aco` | `ant-colony` | dfg | 65 | 75 | ✓ | ✗ |
| `alpha_plus_plus` | `alpha` | petrinet | 20 | 50 | ✗ | ✗ |
| `declare` | `declare` | declare | 35 | 50 | ✓ | ✓ |
| `dfg` | `dfg` | dfg | 5 | 30 | ✓ | ✓ |
| `genetic_algorithm` | `genetic` | dfg | 75 | 80 | ✓ | ✗ |
| `heuristic_miner` | `heuristic` | dfg | 25 | 50 | ✓ | ✓ |
| `hill_climbing` | `hill-climbing` | dfg | 40 | 55 | ✓ | ✓ |
| `ilp` | `ilp` | petrinet | 80 | 90 | ✗ | ✗ |
| `inductive_miner` | `inductive` | tree | 30 | 55 | ✓ | ✓ |
| `optimized_dfg` | `dfg-optimized` | dfg | 70 | 85 | ✗ | ✗ |
| `process_skeleton` | `skeleton` | dfg | 3 | 25 | ✓ | ✓ |
| `pso` | `pso` | dfg | 70 | 75 | ✓ | ✗ |
| `simulated_annealing` | `simulated-annealing` | dfg | 55 | 65 | ✓ | ✗ |

## Streaming & Smart Engine

| ID | Alias | Output | Speed | Quality | Robust | Scales |
|----|-------|--------|------:|--------:|:------:|:------:|
| `hierarchical_dfg` | — | dfg | 5 | 30 | ✓ | ✓ |
| `simd_streaming_dfg` | `simd-dfg` | dfg | 1 | 30 | ✓ | ✓ |
| `smart_engine` | — | dfg | 3 | 45 | ✓ | ✓ |
| `streaming_log` | — | analytics | 10 | 25 | ✓ | ✓ |

## Discovery Analytics

| ID | Alias | Output | Speed | Quality | Robust | Scales |
|----|-------|--------|------:|--------:|:------:|:------:|
| `analyze_process_speedup` | — | analytics | 15 | 60 | ✓ | ✓ |
| `analyze_variant_complexity` | — | analytics | 10 | 40 | ✓ | ✓ |
| `batches` | `batches` | analytics | 50 | 55 | ✗ | ✗ |
| `causal_graph` | `causal-graph` | dfg | 60 | 55 | ✗ | ✓ |
| `compute_activity_transition_matrix` | — | analytics | 20 | 50 | ✓ | ✓ |
| `compute_trace_similarity_matrix` | — | analytics | 50 | 70 | ✓ | ✗ |
| `correlation_miner` | `correlation` | dfg | 45 | 60 | ✗ | ✗ |
| `log_to_trie` | `prefix-tree` | dfg | 75 | 50 | ✓ | ✓ |
| `performance_spectrum` | `perf-spectrum` | analytics | 55 | 60 | ✗ | ✗ |
| `transition_system` | `transition-system` | dfg | 70 | 50 | ✓ | ✓ |

## Conformance & Quality

| ID | Alias | Output | Speed | Quality | Robust | Scales |
|----|-------|--------|------:|--------:|:------:|:------:|
| `alignments` | `alignment` | analytics | 20 | 90 | ✓ | ✗ |
| `complexity_metrics` | `complexity` | analytics | 80 | 60 | ✓ | ✓ |
| `etconformance_precision` | `etconformance` | analytics | 55 | 70 | ✓ | ✓ |
| `generalization` | `generalization` | analytics | 65 | 65 | ✓ | ✓ |

## Simulation

| ID | Alias | Output | Speed | Quality | Robust | Scales |
|----|-------|--------|------:|--------:|:------:|:------:|
| `monte_carlo_simulation` | `montecarlo` | dfg | 70 | 60 | ✓ | ✗ |
| `playout` | `playout` | analytics | 60 | 50 | ✓ | ✓ |

## Import / Export

| ID | Alias | Output | Speed | Quality | Robust | Scales |
|----|-------|--------|------:|--------:|:------:|:------:|
| `bpmn_import` | `import-bpmn` | tree | 70 | 70 | ✓ | ✓ |
| `pnml_import` | `import-pnml` | petrinet | 75 | 80 | ✓ | ✓ |
| `powl_to_process_tree` | `powl-to-tree` | tree | 75 | 70 | ✓ | ✓ |
| `yawl_export` | `export-yawl` | tree | 75 | 70 | ✓ | ✓ |

## OCEL / Object-Centric

| ID | Alias | Output | Speed | Quality | Robust | Scales |
|----|-------|--------|------:|--------:|:------:|:------:|
| `ocel_dfg` | — | dfg | 5 | 30 | ✓ | ✓ |
| `ocel_dfg_per_type` | — | dfg | 8 | 40 | ✓ | ✓ |
| `ocel_encode` | — | analytics | 5 | 20 | ✓ | ✓ |
| `ocel_oc_declare` | — | declare | 40 | 60 | ✓ | ✗ |
| `ocel_ocla` | — | analytics | 10 | 40 | ✓ | ✓ |
| `ocel_petri_net` | — | petrinet | 35 | 65 | ✓ | ✗ |

## Prediction

| ID | Alias | Output | Speed | Quality | Robust | Scales |
|----|-------|--------|------:|--------:|:------:|:------:|
| `compute_ewma` | — | analytics | 5 | 30 | ✓ | ✓ |
| `detect_drift` | — | analytics | 15 | 70 | ✓ | ✓ |
| `predict_next_activity` | — | analytics | 15 | 50 | ✓ | ✓ |
| `predict_outcome` | — | analytics | 25 | 55 | ✓ | ✓ |
| `predict_remaining_time` | — | analytics | 20 | 55 | ✓ | ✓ |

## ML Analysis

| ID | Alias | Output | Speed | Quality | Robust | Scales |
|----|-------|--------|------:|--------:|:------:|:------:|
| `automl_classify` | — | analytics | 40 | 90 | ✓ | ✓ |
| `automl_forecast` | — | analytics | 30 | 85 | ✓ | ✓ |
| `ml_anomaly` | `ml-anomaly` | ml_result | 30 | 55 | ✓ | ✓ |
| `ml_classify` | `ml-classify` | ml_result | 30 | 55 | ✓ | ✓ |
| `ml_cluster` | `ml-cluster` | ml_result | 35 | 55 | ✓ | ✓ |
| `ml_forecast` | `ml-forecast` | ml_result | 25 | 50 | ✓ | ✓ |
| `ml_pca` | `ml-pca` | ml_result | 25 | 55 | ✗ | ✗ |
| `ml_regress` | `ml-regress` | ml_result | 25 | 50 | ✓ | ✓ |

## Social Network Analysis

| ID | Alias | Output | Speed | Quality | Robust | Scales |
|----|-------|--------|------:|--------:|:------:|:------:|
| `handover_network` | — | analytics | 40 | 60 | ✓ | ✓ |
| `working_together_network` | — | analytics | 45 | 60 | ✓ | ✓ |

## Agentic

| ID | Alias | Output | Speed | Quality | Robust | Scales |
|----|-------|--------|------:|--------:|:------:|:------:|
| `agentic_pipeline` | — | analytics | 1 | 95 | ✓ | ✓ |
