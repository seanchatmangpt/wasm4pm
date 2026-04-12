# Closed Claw Benchmarking Constitution

A Criterion-based benchmark suite for the `pictl` process mining engine, organized around 6 canonical pipeline classes and 5 pass/fail gates. Every benchmark produces a BLAKE3 receipt proving deterministic execution.

## Quick Start

```bash
# From pictl/ workspace root
cargo bench --bench closed_claw --features cloud

# Single pipeline
cargo bench --bench closed_claw -- "closed_claw/A_discovery"

# Full feature set
cargo bench --bench closed_claw --features cloud,conformance_full,conformance_basic,ocel,streaming_basic,ml,discovery_advanced
```

## Pipeline Classes

| ID | Name | File | Algorithms Benchmarked |
|----|------|------|------------------------|
| A | Discovery Core | `pipeline_a_discovery.rs` | DFG, Alpha++, Heuristic Miner, Inductive Miner, Process Skeleton, Genetic Algorithm, DECLARE |
| B | Conformance Core | `pipeline_b_conformance.rs` | Token Replay (sequential/parallel), SIMD Token Replay, ETConformance Precision, DECLARE Conformance |
| C | Object-Centric Core | `pipeline_c_ocel.rs` | OCEL Construction, Validation, Flattening, Serialization, Pipeline E2E |
| D | Semantic Proof Loop | `pipeline_d_semantic.rs` | PNML Roundtrip, Discovery-to-PNML, Proof Loop E2E |
| E | Manufacturing Truth | `pipeline_e_manufacturing.rs` | Temporal Profile Discovery, Temporal Conformance, Monte Carlo Simulation, Truth Loop E2E |
| F | ML-Augmented Runtime | `pipeline_f_ml.rs` | SIMD Streaming DFG, Streaming DFG Builder, Anomaly Detection, Drift Detection |

## Gates

Every pipeline exercises a subset of the 5 gates:

| Gate | Name | What It Checks |
|------|------|---------------|
| G1 | Determinism | BLAKE3 output hash identical across N runs |
| G2 | Receipt | BLAKE3 hash chain integrity: config -> input -> plan -> output |
| G3 | Truth | Quality metrics meet thresholds (fitness >= 0.95, precision >= 0.80, temporal zeta <= 2.0) |
| G4 | Synchrony | Cross-profile output agreement (e.g., PNML roundtrip semantic equivalence) |
| G5 | Report | All required report sections present (pipeline, algorithm, dataset_size, throughput, hash, etc.) |

### Gate-to-Pipeline Mapping

| | A | B | C | D | E | F |
|---|---|---|---|---|---|---|
| G1 Determinism | X | X | X | X | X | X |
| G2 Receipt | | | X | X | X | |
| G3 Truth | | X | | | X | |
| G4 Synchrony | | | | X | | |
| G5 Report | X | X | X | X | X | X |

## Architecture

```
mod.rs                          -- Criterion entry point, group config
  pipeline_a_discovery.rs       -- 7 discovery algorithms
  pipeline_b_conformance.rs     -- 5 conformance algorithms
  pipeline_c_ocel.rs            -- OCEL lifecycle (build/validate/flatten/serialize)
  pipeline_d_semantic.rs        -- PNML roundtrip + discovery-to-model proof
  pipeline_e_manufacturing.rs   -- Temporal profile + Monte Carlo truth loop
  pipeline_f_ml.rs              -- Streaming DFG + anomaly + drift detection
  gates.rs                      -- G1-G5 gate implementations + ReceiptBundle
  registry.rs                   -- PipelineClass enum, GateRequirements, DatasetEntry
  receipt.rs                    -- ReceiptBuilder (BLAKE3 hash chain builder)
  metrics.rs                    -- Metrics collector
  golden.rs/                    -- Golden file comparison directory
```

### Shared Helpers

All pipelines include `../helpers.rs` via `#[path = "../helpers.rs"] mod helpers;` which provides:

- `generate_event_log(shape: &LogShape) -> EventLog` -- deterministic synthetic log generation
- `LogShape { num_cases, avg_events_per_case, num_activities, noise_factor }` -- shape descriptor
- `make_handle(shape: &LogShape) -> (String, usize)` -- store log and return handle
- `store_log(log: EventLog) -> String` -- store log in global state
- `bench_sizes() -> &[LogShape]` -- standard sizes: 100/1k/10k/50k cases
- `bench_sizes_slow() -> &[LogShape]` -- reduced sizes: 100/500/1k cases
- `ACTIVITY_KEY = "concept:name"` -- standard activity attribute key
- `TIMESTAMP_KEY = "time:timestamp"` -- standard timestamp attribute key

## Determinism

All benchmarks use deterministic LCG RNG (Linear Congruential Generator) with fixed seeds for synthetic data generation. This guarantees:

1. Same input data across all runs
2. Same algorithm execution path
3. Same BLAKE3 output hash
4. Reproducible performance measurements

## Benchmark Sizes

| Tier | Cases | Events (approx) | Use Case |
|------|-------|-----------------|----------|
| Standard | 100, 1k, 10k, 50k | 1.2k - 600k | DFG, Alpha++, Heuristic, Inductive, Skeleton, DECLARE, Token Replay, SIMD Replay, ETConformance, DECLARE Conf |
| Slow | 100, 500, 1k | 1.2k - 12k | Genetic Algorithm, Alpha++ (conformance), PNML roundtrip, Discovery-to-PNML, Temporal Profile, Temporal Conformance, Monte Carlo, Truth Loop E2E |
| OCEL | 50, 200, 1k, 5k orders | 250 - 25k events | OCEL Construction, Validation, Flattening, Serialization, Pipeline E2E |
| Streaming | 1k, 5k, 10k, 50k | 15k - 750k | SIMD Streaming DFG, Streaming DFG Builder, Anomaly Detection, Drift Detection |

## Feature Flags

| Flag | Enables |
|------|---------|
| `cloud` | All feature-gated modules including streaming, ML, conformance |
| `conformance_full` | Full conformance checking suite |
| `conformance_basic` | Basic conformance (token replay) |
| `ocel` | Object-centric event log support |
| `streaming_basic` | Streaming DFG algorithms |
| `ml` | ML analysis (anomaly, drift, classification) |
| `discovery_advanced` | Advanced discovery (genetic, ACO, PSO, ILP) |

## Receipt System

The `ReceiptBuilder` in `receipt.rs` constructs BLAKE3 hash chains:

```rust
use crate::receipt::ReceiptBuilder;

let receipt = ReceiptBuilder::new("dfg", "Discovery Core")
    .config("num_cases=1000")
    .input(&input_hash)
    .plan(&discovery_hash)
    .output(&output_hash)
    .build();

// Verify via gate
let result = crate::gates::check_receipt_gate(&receipt);
assert!(result.passed);
```

## Criterion Configuration

Default group settings (overridable per pipeline):

- **Measurement time:** 10s (E2E pipelines: 15s)
- **Warm-up time:** 2s (E2E pipelines: 3s)
- **Sample size:** 20 (slow pipelines: 10, fast pipelines: 50)
- **Throughput:** Events/second (elements)
