# Understanding Benchmark Results

> How to read benchmark tables, identify anomalies, and assess statistical significance.
> Estimated time: 20 minutes.

## What you will learn

- How to read a benchmark results table and understand every column
- The difference between microseconds, milliseconds, and when each time scale matters
- Why median is preferred over mean, and how to interpret p95
- How to read scaling progressions (100 to 10K to 50K cases) and identify non-linear behavior
- What the streaming vs batch ratio means and when a ratio is concerning
- How to spot anomalies that indicate bugs or measurement noise

## Prerequisites

You should have completed the [Your First Benchmark](first-benchmark.md) tutorial and be comfortable running `node benchmarks/wasm_bench_runner.js`.

---

## Reading a benchmark table

Benchmark results are presented in tables. Each row is one measurement: a specific algorithm run on a specific dataset size. Here is a representative excerpt from a full run on the Apple M3 Max (native Rust `--release`, median of 7 runs):

```
Algorithm                   | 100 cases | 1K cases | 10K cases | 50K cases | Scaling
----------------------------|-----------|----------|-----------|-----------|----------
DFG                         | ~20 us    | ~0.3 ms  | ~3.0 ms   | ~30 ms    | Linear
Process Skeleton            | ~28 us    | ~0.25 ms | ~2.7 ms   | ~31 ms    | Linear
Heuristic Miner             | ~183 us   | ~1.8 ms  | ~14 ms    | ~116 ms   | Linear
Inductive Miner             | ~154 us   | ~2.5 ms  | ~25 ms    | ~175 ms   | Linear
Genetic Algorithm           | ~183 us   | ~2.3 ms  | ~24 ms    | ~179 ms   | Linear
A* Search                   | ~320 us   | ~7.7 ms  | ~77 ms    | ~712 ms   | Linear
ILP Petri Net               | ~350 us   | ~9.0 ms  | ~87 ms    | ~835 ms   | Linear
```

### Column guide

| Column                   | Meaning                             | How to read it                                  |
| ------------------------ | ----------------------------------- | ----------------------------------------------- |
| **Algorithm**            | The discovery or analytics function | Name matches the Rust/WASM export               |
| **100 cases**            | Execution time for a 100-trace log  | Compare across algorithms at same scale         |
| **1K / 10K / 50K cases** | Same, at larger scales              | Watch for scaling changes                       |
| **Scaling**              | Growth rate classification          | Linear = predictable; Superlinear = investigate |

The "cases" columns use two units: **microseconds (us)** and **milliseconds (ms)**. Understanding the difference is critical for making correct performance assessments.

---

## Understanding time scales

### Microseconds (us) -- 1 us = 0.001 ms

At the 100-case level, most algorithms complete in microseconds. A single microsecond is one millionth of a second. For context:

- 1 microsecond = one CPU cycle at 1 GHz
- 100 microseconds = a human eye blink takes ~300,000 microseconds
- 1,000 microseconds (1 ms) = a typical function call overhead

At this scale, measurements are noisy. GC pauses, OS scheduling, and cache effects can dominate. Do not draw conclusions from 100-case timings alone. They are useful only for verifying that the algorithm starts correctly.

### Milliseconds (ms) -- 1 ms = 1,000 us

At 1K cases and above, algorithms shift into millisecond territory. This is the range where measurements become meaningful and reproducible.

| Time range  | Human perception             | Relevance                   |
| ----------- | ---------------------------- | --------------------------- |
| < 1 ms      | Instantaneous                | Below perceptible threshold |
| 1-16 ms     | One animation frame (60 fps) | Interactive UI target       |
| 16-100 ms   | Noticeable delay             | Acceptable for user actions |
| 100-1000 ms | "Loading..."                 | Batch processing, reports   |
| > 1000 ms   | Frustrating wait             | Background jobs only        |

For process mining dashboards, the target is **< 16 ms** per algorithm call (one animation frame). This means DFG (3.0 ms) and Process Skeleton (2.7 ms) at 10K cases are fast enough for real-time interaction. Heuristic Miner (14 ms) is borderline. Inductive Miner (25 ms) would need to run asynchronously.

### When each time scale matters

- **us range**: Only matters for micro-optimization of inner loops. Not relevant for user-facing performance decisions.
- **ms range (< 100)**: This is where algorithm selection matters. A 3 ms algorithm vs a 77 ms algorithm is a 25x difference that users notice.
- **ms range (> 100)**: Requires asynchronous execution or pre-computation. Consider caching results, using streaming algorithms, or reducing dataset size.

---

## Median vs Mean vs p95

The benchmark runner reports both **median** and **p95** (95th percentile). Here is why.

### The problem with mean

Consider five runs of DFG discovery at 10K cases, measured in milliseconds:

```
Runs: [2.8, 3.0, 3.1, 3.2, 14.4]
Mean:  5.3 ms  (inflated by the outlier)
Median: 3.1 ms  (the middle value, ignores the outlier)
```

The 14.4 ms outlier was caused by a JavaScript garbage collection pause. The mean (5.3 ms) suggests DFG takes nearly twice as long as it actually does. The median (3.1 ms) correctly represents the typical execution time.

### Why median is preferred

1. **Robust to outliers**: A single GC pause or OS scheduling event cannot inflate the median.
2. **Stable across runs**: The median changes less between benchmark sessions than the mean.
3. **Represents the typical case**: If you run the algorithm 100 times, 50 of those runs will be faster than the median and 50 will be slower.

### When to use p95

The **p95** (95th percentile) answers the question: "In the worst 5% of runs, how long could this take?"

A small gap between median and p95 indicates predictable performance:

```
DFG:              median 3.02 ms, p95 3.28 ms   gap: 0.26 ms  (stable)
Heuristic Miner:  median 14.03 ms, p95 14.88 ms  gap: 0.85 ms  (stable)
```

A large gap indicates high variance:

```
Genetic Algorithm: median 768 ms, p95 816 ms   gap: 48 ms  (some variance)
```

For production SLAs, use p95 as your upper bound. If your SLA requires 20 ms response time, an algorithm with a median of 15 ms but p95 of 25 ms will violate the SLA 5% of the time.

---

## Scaling analysis

Scaling tells you how execution time grows as the dataset gets larger. The benchmark runner tests at four sizes: 100, 1,000, 5,000, and 10,000 cases (some slow algorithms stop at 1,000).

### Linear scaling (what you want)

Linear scaling means doubling the cases doubles the time. You can verify linearity by checking the ratio between sizes:

```
DFG:
  100 cases:   ~20 us
  1K cases:    ~300 us    (ratio: 15x for 10x data -- close to linear)
  10K cases:   ~3.0 ms    (ratio: 10x for 10x data -- linear)
  50K cases:   ~30 ms     (ratio: 10x for 5x data -- linear)
```

The approximate formula is `T(n) = 0.003n ms`, where n is the number of cases. This means at 100K cases you would expect ~300 ms, and at 1M cases ~3 seconds. Predictable.

Most pictl algorithms scale linearly: DFG, Process Skeleton, Heuristic Miner, Inductive Miner, Hill Climbing, Declare, Simulated Annealing, and all analytics functions.

### Superlinear scaling (warning sign)

Superlinear scaling means time grows faster than the data size. This happens with metaheuristic algorithms (Genetic, PSO, ACO) because they maintain internal populations or pheromone matrices that grow with the log:

```
Genetic Algorithm (BPI 2020, real data):
  100 cases:   ~183 us
  1K cases:    ~2.3 ms    (ratio: 12.5x for 10x data)
  10K cases:   ~730 ms    (ratio: 317x for 10x data -- superlinear!)
```

At 10K cases the Genetic Algorithm takes 730 ms on BPI 2020. This is because the population (50 individuals) must evaluate fitness against every case in each generation, and more cases means more expensive fitness evaluations.

### Quadratic scaling (hard limit)

The Trace Similarity Matrix is O(n^2) -- it compares every pair of traces:

```
Trace Similarity:
  100 cases:  ~20 ms
  500 cases:  ~555 ms    (ratio: 27.8x for 5x data -- quadratic)
  1000 cases: ~5000 ms   (impractical for interactive use)
```

The practical limit for O(n^2) algorithms is around 300-500 cases. Beyond that, use approximate methods (k-means clustering on representative traces, or hashing-based similarity).

### Reading the Scaling column

In the benchmark tables, the Scaling column provides a classification:

| Classification | Growth rate     | Practical limit   | Action                       |
| -------------- | --------------- | ----------------- | ---------------------------- |
| ~Linear        | T(n) = a\*n + b | 100K+ cases       | Use freely                   |
| ~Superlinear   | T(n) > a\*n     | 5K-10K cases      | Reduce parameters or dataset |
| O(n^2)         | T(n) = a\*n^2   | 300-500 cases     | Use approximate methods      |
| NP-Hard        | Variable        | Depends on solver | Set timeout, monitor         |

---

## Streaming vs batch ratios

The benchmark suite includes streaming variants of several algorithms. The "vs Batch" column shows how much slower the streaming version is compared to loading the entire log into memory first.

### Reading the ratio table

```
Algorithm               | Batch (ms) | Streaming (ms) | Ratio | Memory Model
------------------------|------------|----------------|-------|-------------
Streaming DFG           | ~3.0       | ~69            | 23x   | O(E)
Streaming Inductive     | ~25        | ~135           | 5.4x  | O(E+TxL)
Streaming Alpha++       | ~4.55      | ~155           | 34x   | O(E+TxL)
Streaming Hill Climbing  | ~135       | ~187           | 1.4x  | O(E+TxL)
```

### What the ratio means

- **Ratio 1.0x-2.0x**: Streaming adds minimal overhead. Hill Climbing at 1.4x means streaming is barely slower than batch. This is the ideal case -- use streaming whenever you can.
- **Ratio 5x-10x**: Streaming has moderate overhead. Inductive Miner at 5.4x is acceptable when you need incremental results or bounded memory.
- **Ratio 20x-40x**: Streaming has significant overhead. DFG at 23x and Alpha++ at 34x mean the streaming version is substantially slower. Use these only when memory constraints force it (e.g., browser tabs with ~100 MB limits).

### When 1.4x matters vs 23x

The ratio matters in two different contexts:

**For bounded-memory environments** (browser tabs, IoT devices, edge servers), even a 23x ratio is acceptable because the alternative is running out of memory. A batch algorithm that needs 700 MB for a 50K-case log cannot run in a 100 MB browser tab. The streaming version at 23x slower but bounded memory is the only option.

**For server environments** with ample memory, a 1.4x ratio is negligible and a 23x ratio may be unacceptable. If you can afford the memory, always prefer batch. Use streaming only when you need incremental updates or have memory constraints.

### Memory model column

- **O(E)**: The algorithm stores only edge counts. Memory grows with the number of unique activity transitions, not with the number of traces. This is bounded and predictable.
- **O(E+TxL)**: The algorithm stores edge counts plus full trace sequences. Memory grows with both the number of unique edges and the total trace length. This is unbounded for infinite streams.

Choose O(E) algorithms when you have long-running streams. Choose O(E+TxL) when you need higher-quality models and can afford the memory.

---

## Identifying anomalies

When reading benchmark results, look for these red flags:

### Anomaly 1: Non-linear scaling in a "linear" algorithm

If DFG suddenly takes 10x longer going from 5K to 10K cases (instead of the expected 2x), something is wrong. Possible causes:

- Memory pressure causing GC thrashing
- Hash table resizing at a specific threshold
- A bug in the log parser that duplicates events at larger sizes

**Action:** Re-run the benchmark. If the anomaly persists, profile with `node --prof` or Rust's `perf` to find the bottleneck.

### Anomaly 2: Median much higher than previous runs

If the DFG median jumps from 3.0 ms to 8.0 ms between runs, with the same dataset and same machine, investigate:

- Was another process consuming CPU? (Check `top` during the benchmark)
- Did the WASM build change? (Verify with `git log`)
- Is the dataset different? (Check file size and hash)

### Anomaly 3: p95 much larger than median

A small p95-median gap (< 10%) is normal. A large gap (> 50%) indicates variance:

```
Normal:   median 3.02 ms, p95 3.28 ms   (8.6% gap)
Warning:  median 3.02 ms, p95 6.50 ms   (115% gap)
```

Large gaps often indicate:

- Garbage collection pauses in Node.js
- OS power management (CPU throttling on battery)
- Contention from other processes

**Action:** Close other applications, run on wall power, increase iterations to get a more stable median.

### Anomaly 4: Algorithm slower than expected category

If an algorithm in the "ultra-fast" category (> 5 ms speed tier) takes more than 50 ms at 10K cases, it is underperforming. Check:

- Are default parameters reasonable? (A Genetic Algorithm with population 500 instead of 50 will be 10x slower)
- Is the log unusually complex? (Logs with 100+ activities are harder than logs with 6 activities)

---

## Real data benchmarks (BPI 2020)

The full benchmark suite has also been run against real BPI 2020 data (10,500 traces, 56,437 events, 17 activities). Key results on Apple M3 Max (Node.js WASM, median of 5 runs):

| Algorithm           | Median (ms) | Events/sec | Category        |
| ------------------- | ----------- | ---------- | --------------- |
| DFG                 | 6.54        | 8,631,271  | Ultra-fast      |
| Process Skeleton    | 10.31       | 5,476,639  | Ultra-fast      |
| Heuristic Miner     | 7.86        | 7,176,475  | Fast            |
| Inductive Miner     | 17.69       | 3,190,386  | Balanced        |
| Simulated Annealing | 21.28       | 2,652,400  | Balanced        |
| ACO                 | 31.51       | 1,791,355  | Metaheuristic   |
| ILP                 | 42.17       | 1,338,390  | Optimal         |
| A\* Search          | 139.72      | 403,929    | Informed search |
| Genetic Algorithm   | 730.26      | 77,283     | Evolutionary    |
| PSO                 | 518.96      | 108,750    | Swarm           |

Note that real data timings are higher than synthetic data timings at the same trace count. This is because BPI 2020 has variable-length traces (2-20 events per case) compared to synthetic logs with uniform lengths. Real-world variance adds parsing and branching overhead.

---

## What you have learned

- **Table columns**: algorithm, dataset sizes, timing, scaling classification
- **Time scales**: us (noise range), ms (decision range), > 100 ms (async range)
- **Median vs p95**: median for typical performance, p95 for worst-case SLA planning
- **Scaling analysis**: linear (predictable), superlinear (parameter reduction needed), quadratic (hard limit)
- **Streaming ratios**: 1.4x is negligible, 23x matters only for memory-constrained environments
- **Anomaly detection**: non-linear jumps, p95-median gaps, category mismatches

## Next steps

- **Creating Custom Benchmark Suites** -- add your own algorithm and benchmark it
- **Benchmark Tiers** -- run against real BPI datasets with the tiered benchmark system
- **BENCHMARKS.md** -- full results tables for all algorithms at all scales
