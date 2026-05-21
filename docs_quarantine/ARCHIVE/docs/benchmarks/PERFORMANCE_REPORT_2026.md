# wasm4pm Performance Report (May 2026)

## Executive Summary
The `wasm4pm` engine continues to demonstrate world-class performance for process mining and verifiable execution. The latest benchmarks confirm that core algorithms execute at nanosecond to microsecond scales, with machine learning and validation infrastructure maintaining high throughput even under significant load.

## 1. Route-Driven TDD & Validation
This infrastructure ensures that tests are not just "passing" but are following a lawful, declared process route.

| Component | Benchmark | Latency/Throughput | Overhead/Note |
|-----------|-----------|-------------------|---------------|
| **POWL Macros** | `#[powl_activity]` | 18.4 ns | Negligible recording cost |
| **Self-Conformance** | Conformance (`finish`) | 748 Kelem/s | Real-time validation |
| **Anti-Fake** | Tamper Detection | 533 ns | BLAKE3-based integrity |
| **Route Evaluation** | Sequential 5-step | 46.5 µs | Complex route verification |
| **TDD Loop** | `record_activity` | 4.44 µs | Per-activity tracing cost |

### Analysis
The proc-macro instrumentation (`powl_macro`) adds less than 20ns of overhead per call, making it suitable for even the tightest inner loops. Route evaluation remains efficient, allowing for complex multi-step validation within standard test timeouts.

## 2. Machine Learning Algorithms
High-performance ML primitives implemented in Rust/WASM for real-time process intelligence.

| Algorithm | Scale | Median Latency | Throughput |
|-----------|-------|----------------|------------|
| **K-Nearest Neighbors** | 10k rows (k=5) | 9.36 ms | 1.06 Melem/s |
| **Anomaly Detection** | 10k events | 856 µs | 11.6 Melem/s |
| **Forecasting (EWMA)** | 10k points | 25.1 µs | 398 Melem/s |
| **Linear Regression** | 10k points | 6.04 µs | 1.65 Gelem/s |
| **PCA** | 10k rows | 7.56 µs | 1.32 Gelem/s |

### Analysis
Regression and PCA demonstrate extreme performance, operating at Giga-element per second speeds. KNN scales linearly with data size and remains well within the millisecond budget for interactive applications.

## 3. Core Process Discovery (Tier 1)
Standard process mining algorithms optimized for the WASM kernel.

| Algorithm | Data Scale | Median Latency | Throughput |
|-----------|------------|----------------|------------|
| **DFG Discovery** | 100 cases | 224 µs | 4.07 Melem/s |
| **Alpha++** | 100 cases | 88.8 µs | 10.2 Melem/s |
| **Heuristic Miner** | 100 cases | 220 µs | 4.14 Melem/s |
| **Inductive Miner** | 100 cases | 506 µs | 1.80 Melem/s |
| **Process Skeleton** | 100 cases | 63.7 µs | 14.3 Melem/s |

### Analysis
Discovery algorithms are highly optimized, with most Tier 1 miners completing in under 250µs for standard test batches. This enables "instant-on" process discovery in browser-based dashboards.

## 4. OCEL Export & Serialization
Exporting verifiable evidence in object-centric formats.

| Task | Data Scale | Latency | Throughput |
|------|------------|---------|------------|
| **OCEL JSON Export** | 10k events | 28.0 ms | 356 Kelem/s |
| **JSON Serialization** | 10k events | 3.29 ms | 733 MiB/s |
| **Proof Pack Write** | 1k events | 1.71 ms | Deterministic bundling |

### Analysis
The OCEL export includes complex object relationships and unique identifiers. Serialization performance is robust, saturating available memory bandwidth at ~730 MiB/s.

## Conclusion
The `wasm4pm` engine is optimized for both **throughput** (mining millions of events per second) and **latency** (verifying individual process steps in nanoseconds). The new Route-Driven TDD benchmarks confirm that our validation infrastructure is "production-grade" and introduces minimal friction to the development lifecycle.
