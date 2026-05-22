# Reproducible Benchmark Harness Architecture

## 1. Overview
To graduate from theoretical claims to empirical science, the PhD program requires a standardized benchmark harness. This harness ensures that all claims regarding sub-millisecond latencies, branchless efficiency, and cryptographic throughput are reproducible, statistically significant, and visually verifiable.

## 2. Standardized Dataset: The Maximalist Benchmark Suite
All candidates must benchmark their kernels against the **MBS-26 (Maximalist Benchmark Suite 2026)**, which includes:
1.  **MBS-Uniform:** A 10-million event flat log where every trace represents a unique path (Maximum Variant Cardinality).
2.  **MBS-Dense-OCEL:** An OCEL 2.0 log containing 5 interacting object types (Order, Item, Delivery, Payment, Volunteer) forming a maximally connected bipartite graph.
3.  **MBS-Adversarial-24:** A payload stream simultaneously injecting the 24-probe Cartesian product of schema, cardinality, and lifecycle violations.

## 3. Harness Architecture
The harness utilizes Rust's `criterion` framework for statistically rigorous micro-benchmarking, wrapped in a Python orchestrator to simulate the Compute Continuum and generate LaTeX-ready visualizations.

### Example: Branchless vs. Branching Criterion Benchmark
```rust
// bench/branchless_vs_branching.rs
use criterion::{black_box, criterion_group, criterion_main, Criterion};
use wasm4pm_algos::dfg::{branching_dfg, branchless_dfg};
use wasm4pm_utils::log_generator::load_mbs_uniform;

fn bench_dfg(c: &mut Criterion) {
    let log = load_mbs_uniform();
    let mut group = c.benchmark_group("DFG Extraction (MBS-Uniform)");
    
    group.bench_function("Branching (Standard)", |b| {
        b.iter(|| branching_dfg(black_box(&log)))
    });
    
    group.bench_function("Branchless (bcinr)", |b| {
        b.iter(|| branchless_dfg(black_box(&log)))
    });
    
    group.finish();
}

criterion_group!(benches, bench_dfg);
criterion_main!(benches);
```

### 4. Visual Evidence Generation Pipeline
1.  **Execution:** The harness runs the `criterion` benchmarks across native cloud, Wasmtime (WASI), and V8.
2.  **Telemetry Capture:** OTel spans (`RecoveryStarted`, `RecoveryCompleted`) and CPU cycle counts are exported to JSON.
3.  **Visualization Script (`plot_metrics.py`):** Automatically generates violin plots for latency distribution and scatter plots for MTTR, proving that the execution never breaches the 34-nanosecond cycle limit under stress.
4.  **Thesis Integration:** The generated `.png` and `.tex` files are automatically integrated into the candidate's `FULL_THESIS.md` build pipeline.
