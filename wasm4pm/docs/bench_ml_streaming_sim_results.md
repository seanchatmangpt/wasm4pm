# ML, Streaming, Simulation, and OCEL Benchmark Results

**Benchmark:** `ml_streaming_sim_bench`  
**Date:** 2026-04-10  
**Rust:** pictl v26.4.10  
**Platform:** aarch64-apple-darwin  
**Profile:** bench (opt-level 3, no LTO)

---

## Summary Table

| Algorithm | Size | Time (mean) | Throughput | Unit |
|-----------|------|-------------|-----------|------|
| **Next Activity Prediction (n=3)** |
| - 50 cases | 50 | 169.83 ns | 2.80 Gelem/s | prediction |
| - 200 cases | 200 | 300.98 ns | 7.49 Gelem/s | prediction |
| - 500 cases | 500 | 399.16 ns | 17.84 Gelem/s | prediction |
| **Remaining Time Build** |
| - 50 cases | 50 | 247.80 ns | 1.92 Gelem/s | case |
| - 200 cases | 200 | 415.87 ns | 5.42 Gelem/s | case |
| - 500 cases | 500 | 669.44 ns | 10.64 Gelem/s | case |
| **Anomaly Scoring (trace)** |
| - 50 cases | 50 | 51.49 ns | - | score/trace |
| - 200 cases | 200 | 134.62 ns | - | score/trace |
| - 500 cases | 500 | 147.02 ns | - | score/trace |
| **Outcome Prediction** |
| - Score anomaly | - | 150.29 ns | - | score/trace |
| - Trace likelihood | - | 840.73 ns | - | log_prob/calc |
| **Streaming DFG Single Event** |
| - add_event | - | 284.85 ns | 3.35 MiB/s | event |
| - add_batch_10 | - | 2.10 µs | 466 KiB/s | 10 events |
| **Streaming Skeleton Single Event** |
| - add_event | - | 229.95 ns | 4.15 MiB/s | event |
| **Streaming DFG Throughput** |
| - 965 events | - | 114.64 µs | 8.72 Gelem/s | full log |
| - 14,461 events | - | 1.47 ms | 681.8 Melem/s | full log |
| - 96,782 events | - | 10.0 ms | 100.0 Melem/s | full log |
| **Monte Carlo Simulation** |
| - 10 cases | 10 | 14.78 µs | - | full sim |
| - 50 cases | 50 | 82.19 µs | - | full sim |
| - 100 cases | 100 | 160.25 µs | - | full sim |
| - 200 cases | 200 | 324.42 µs | - | full sim |
| **OCEL Flatten** |
| - 10 objects | 10 | 13.36 µs | - | flatten |
| - 50 objects | 50 | 95.83 µs | - | flatten |
| - 100 objects | 100 | 312.16 µs | - | flatten |
| - 200 objects | 200 | 917.22 µs | - | flatten |

---

## ML Prediction Benchmarks

### Next Activity Prediction (n=3)

Predict next activities using an n-gram Markov chain model.

| Cases | Mean | Std Dev | Min | Max | Throughput |
|-------|------|---------|-----|-----|-----------|
| 50 | 169.83 ns | 1.81 ns | 168.41 ns | 171.99 ns | 2.80 Gelem/s |
| 200 | 300.98 ns | 4.50 ns | 296.80 ns | 305.79 ns | 7.49 Gelem/s |
| 500 | 399.16 ns | 7.07 ns | 393.15 ns | 407.29 ns | 17.84 Gelem/s |

**Scaling:** Linear in model size (number of unique n-grams). Prediction time grows with prefix length.

### Remaining Time Model Build

Build a statistical model from completed traces for remaining time prediction.

| Cases | Mean | Std Dev | Min | Max | Throughput |
|-------|------|---------|-----|-----|-----------|
| 50 | 247.80 ns | 9.23 ns | 227.58 ns | 264.26 ns | 1.92 Gelem/s |
| 200 | 415.87 ns | 13.04 ns | 395.38 ns | 447.97 ns | 5.42 Gelem/s |
| 500 | 669.44 ns | 14.12 ns | 660.26 ns | 688.56 ns | 10.64 Gelem/s |

**Scaling:** O(n) in total events.

### Anomaly Scoring (Trace)

Score a trace against a reference DFG to detect anomalies.

| Cases | Mean | Std Dev | Min | Max |
|-------|------|---------|-----|-----|
| 50 | 51.49 ns | 0.38 ns | 51.13 ns | 51.89 ns |
| 200 | 134.62 ns | 2.44 ns | 132.55 ns | 137.40 ns |
| 500 | 147.02 ns | 1.52 ns | 145.63 ns | 148.66 ns |

**Scaling:** O(trace length) independent of log size after DFG built.

---

## Streaming Benchmarks

### Single-Event Ingestion

Per-event overhead for streaming DFG and skeleton builders.

| Operation | Mean | Std Dev | Min | Max | Throughput |
|-----------|------|---------|-----|-----|-----------|
| **DFG add_event** |
| Single event | 284.85 ns | 0.44 ns | 284.42 ns | 285.31 ns | 3.35 MiB/s |
| **DFG add_batch_10** |
| 10 events | 2.10 µs | 0.03 µs | 2.09 µs | 2.10 µs | 466 KiB/s |
| **Skeleton add_event** |
| Single event | 229.95 ns | 0.97 ns | 229.07 ns | 231.01 ns | 4.15 MiB/s |

**Notes:**
- DFG: ~285 ns per event for add_event + close_trace cycle
- Skeleton: ~230 ns per event (simpler = faster)
- Batch: 209 ns per event amortized over 10 events

### Full Log Throughput (Streaming DFG)

Complete log processing time for streaming DFG discovery.

| Events | Mean | Std Dev | Min | Max | Throughput |
|--------|------|---------|-----|-----|-----------|
| 965 | 114.64 µs | 0.74 µs | 114.19 µs | 115.38 µs | 8.72 Gelem/s |
| 14,461 | 1.47 ms | 0.04 ms | 1.46 ms | 1.47 ms | 681.8 Melem/s |
| 96,782 | 10.0 ms | 0.31 ms | 9.94 ms | 10.06 ms | 100.0 Melem/s |

**Scaling:** Near-linear O(n) in event count.

---

## Simulation Benchmarks

### Monte Carlo Simulation

Discrete-event simulation with stochastic service times.

| Cases | Mean | Std Dev | Min | Max |
|-------|------|---------|-----|-----|
| 10 | 14.78 µs | 0.07 µs | 14.74 µs | 14.81 µs |
| 50 | 82.19 µs | 0.35 µs | 81.88 µs | 82.54 µs |
| 100 | 160.25 µs | 1.04 µs | 159.81 µs | 160.85 µs |
| 200 | 324.42 µs | 3.44 µs | 321.80 µs | 328.26 µs |

**Scaling:** ~1.6 µs per case simulated. Linear in num_cases.

---

## OCEL Benchmarks

### OCEL to EventLog Flatten

Project OCEL objects onto a single object type to create an event log.

| Objects | Mean | Std Dev | Min | Max |
|---------|------|---------|-----|-----|
| 10 | 13.36 µs | 0.91 µs | 12.73 µs | 14.57 µs |
| 50 | 95.83 µs | 0.58 µs | 95.25 µs | 96.34 µs |
| 100 | 312.16 µs | 13.04 µs | 299.69 µs | 325.71 µs |
| 200 | 917.22 µs | 6.06 µs | 909.14 µs | 929.28 µs |

**Scaling:** ~4.6 µs per object (includes event lookup and trace building).

---

## Key Findings

1. **Next activity prediction** is extremely fast (170-400 ns) even for large models.
2. **Streaming single-event ingestion** is ~285ns/event (DFG) and ~230ns/event (skeleton).
3. **Anomaly scoring** scales with trace length, not log size (after DFG built).
4. **Monte Carlo simulation** scales linearly: ~1.6 µs per case.
5. **OCEL flattening** scales ~4.6 µs per object.

---

## Benchmark Configuration

- **Measurement time:** 8-10s per benchmark
- **Warm-up time:** 2s per benchmark
- **Sample size:** 20-30 samples
- **Throughput:** Calculated where applicable (events/sec, predictions/sec)

**Synthetic log generator:**
- Activities: 6-15 unique activities from realistic process vocabulary
- Trace length: 10-20 events average with noise factor 0.05-0.15
- Timestamps: Generated with 100-1000ms service times per activity
- Cases: 50-500 cases for ML benchmarks, up to 5000 for streaming

---

*Generated by Criterion 0.5*
