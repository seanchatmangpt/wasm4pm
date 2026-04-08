# Benchmark Methodology

How we measure the performance of 21 process mining algorithms compiled to WebAssembly, and why our choices matter for interpreting the results.

---

## The Three Pillars of Our Benchmark Design

Every benchmark we publish rests on three properties: **reproducibility**, **fairness**, and **realism**. If any one of these fails, the numbers become misleading or useless. Our methodology is built to satisfy all three simultaneously, even when they pull in opposite directions.

**Reproducibility** means that another developer on similar hardware can run the same benchmark and get numbers within a small, predictable margin. This is why we pin Rust compiler versions, wasm-pack targets, and Node.js versions. It is also why we avoid system calls that have non-deterministic latency (network requests, filesystem operations beyond initial file reads, random number generation without seeded state).

**Fairness** means that every algorithm is given the same input, the same number of warmup runs, and the same measurement apparatus. We do not give special treatment to algorithms that happen to be faster at startup. We do not pre-filter the event log to favor algorithms that struggle with noise. Every algorithm sees the raw BPI 2020 Travel Permits log, unmodified.

**Realism** means that we benchmark on data that resembles what users actually process. Synthetic logs with perfectly clean traces would make every algorithm look good. Real logs from government permit processes contain noise, variant explosions, and concept drift. If an algorithm is fast on synthetic data but falls apart on BPI 2020, that speed number is misleading.

---

## Why Median of 7 Runs

We report the **median** of 7 runs, not the mean of N runs or a single run. This is a deliberate choice rooted in the properties of real-world measurement.

### The Outlier Problem

Process mining benchmarks run on general-purpose operating systems, not bare metal. The operating system can preempt our process for garbage collection, filesystem sync, or other background tasks. On Apple Silicon, the M3 Max has 16 performance cores and 4 efficiency cores, and the OS scheduler may migrate our WASM thread between them during a benchmark run.

A single outlier run can skew a mean dramatically. If 6 runs complete in 3.0ms and one run takes 15ms because of a GC pause, the mean is 4.7ms -- a 57% overestimate. The median stays at 3.0ms, which accurately represents the algorithm's typical performance.

### Why 7, Not 5 or 10

Seven runs provides enough statistical power to detect the true central tendency while keeping total benchmark time reasonable. With 21 algorithms and 7 runs each, a full benchmark suite completes in under 30 seconds on our reference hardware. Going to 10 or 20 runs would improve confidence marginally but would make iterative development slower.

The choice of 7 also relates to the interquartile range: with 7 sorted observations, the median is the 4th value, and we can compute a rough IQR from the 2nd and 6th values. This gives us a built-in measure of variance without needing formal statistical tests.

### What We Do Not Report

We intentionally avoid reporting minimum times. The minimum represents a best-case scenario that depends on favorable system conditions -- no preemption, warm caches, optimal CPU frequency. It is not reproducible. The minimum tells you what is possible under ideal conditions, not what you should expect in production.

---

## Warmup Runs and JIT Compilation

WebAssembly execution in V8 (Node.js) involves Just-In-Time (JIT) compilation. The first time a WASM function executes, V8 interprets it slowly while profiling. After enough calls, V8 compiles the hot function to optimized machine code. Subsequent calls use this compiled code and run significantly faster.

Our benchmarks include **3 warmup runs** before measurement begins. These warmup runs serve two purposes:

1. **JIT compilation**: V8 compiles the hot paths in our WASM algorithms to native ARM64 code.
2. **Cache warming**: The event log data is read from disk into the filesystem cache, so subsequent runs do not include I/O latency.

Without warmup, our numbers would be 2-5x slower for the first run and misleadingly fast for subsequent runs. By discarding the first 3 runs and measuring the next 7, we report steady-state performance -- the speed users experience after the engine has been running for a while.

### Rust-to-WASM Compilation Effects

The Rust compiler (`wasm-pack` with `wasm-bindgen`) compiles our algorithms to WASM bytecode at build time. This is ahead-of-time compilation and is not the same as V8's JIT. The build-time compilation determines the WASM bytecode structure. The runtime JIT in V8 then compiles that bytecode further to native ARM64 instructions.

This two-stage compilation means that algorithm structure affects performance in two ways: the WASM bytecode quality (determined by `wasm-pack` and Rust optimization level) and the V8 JIT's ability to optimize that bytecode (determined by code patterns like loop structure, branch predictability, and memory access patterns).

---

## Memory Measurement Methodology

Memory usage in WASM is measured differently from native applications. WASM has a linear memory model: a contiguous block of memory that grows as needed. We measure memory by querying the WASM linear memory size before and after algorithm execution.

This approach captures the peak memory allocated by the algorithm itself, but it does not capture:

- V8's internal overhead (JIT compiled code, garbage collector metadata)
- The event log representation in JavaScript (typed arrays holding trace data passed to WASM)
- Node.js process overhead (event loop, buffer pools)

For our purposes, measuring WASM linear memory is sufficient because it represents the algorithm's memory footprint, which is what users need to reason about when choosing an algorithm for memory-constrained environments.

---

## Statistical Analysis: Percentiles Over Averages

When we report performance distributions across dataset sizes, we use **percentiles** (p50, p95, p99) rather than means and standard deviations. This is because algorithm runtime distributions are typically right-skewed: most runs are fast, but occasional outlier runs are much slower.

A mean and standard deviation assume a roughly normal distribution. Right-skewed distributions violate this assumption, making the mean an unreliable estimator of typical performance. The p50 (median) is robust to skewness and outliers.

For the scaling behavior plots (runtime vs dataset size), we fit a power law: `T(n) = a * n^b`. The exponent `b` tells us the scaling behavior:

- `b < 1`: Sublinear scaling (algorithm benefits from data structure optimizations)
- `b = 1`: Linear scaling (algorithm touches each event once)
- `b > 1`: Superlinear scaling (algorithm has pairwise comparisons or nested loops)
- `b = 2`: Quadratic scaling (algorithm compares every pair of events)

Most of our algorithms target `b <= 1.2`. Algorithms with `b > 1.5` are flagged in our documentation as having scaling concerns for large datasets.

---

## How to Interpret Scaling Behavior

Scaling behavior is not just an academic exercise. It directly determines whether an algorithm is practical for your data size.

Consider the DFG algorithm at ~3.0ms on 10,500 traces (BPI 2020). If you have a log with 100,000 traces (roughly 10x larger), linear scaling predicts ~30ms. But if the algorithm is actually O(n log n), the prediction is ~33ms. The difference is small at this scale.

Now consider a hypothetical algorithm with O(n^1.5) scaling that runs in 5ms on BPI 2020. On 100K traces, it would take ~158ms. On 1M traces, ~5ms \* (100)^1.5 = ~5,000ms. An algorithm that looks only slightly slower on small data becomes dramatically slower on large data.

This is why we publish scaling exponents alongside absolute timings. The exponent tells you whether an algorithm will remain practical as your data grows.

---

## Performance Tier Classification

Rather than ranking 21 algorithms by raw speed (which implies false precision), we classify them into performance tiers. This reflects the reality that small speed differences within a tier are usually not the deciding factor when choosing an algorithm.

| Tier       | Time Range (BPI 2020) | Algorithms                                       | Use Case                                     |
| ---------- | --------------------- | ------------------------------------------------ | -------------------------------------------- |
| Ultra-fast | < 5ms                 | DFG (~3.0ms), Process Skeleton (~2.7ms)          | Quick exploration, real-time dashboards, IoT |
| Fast       | 5-30ms                | Heuristic Miner (~14ms), Inductive Miner (~25ms) | Standard discovery, balanced quality/speed   |
| Medium     | 30-150ms              | A\* (~77ms), ILP (~87ms), Hill Climbing (~135ms) | High-quality models, offline analysis        |
| Heavy      | > 150ms               | Genetic Algorithm, PSO, ACO                      | Maximum quality, patience required           |

The tier boundaries are drawn at points where practical implications change. Below 5ms, the algorithm is fast enough for interactive use in any context. Above 150ms, the user notices a pause and the algorithm is better suited for batch processing.

Within a tier, we recommend choosing based on output quality and model type, not speed. The difference between Heuristic Miner (14ms) and Inductive Miner (25ms) is 11ms -- imperceptible to a human. But Heuristic Miner produces a DFG while Inductive Miner produces a process tree, which are fundamentally different model types.

---

## Algorithm Categories and Measurement Differences

Our 21 algorithms fall into four categories, each with different performance characteristics that affect how we measure them.

### Direct Discovery (3 algorithms)

DFG, Process Skeleton, and Streaming DFG build graphs directly from event frequencies. These are the simplest algorithms and the fastest. Measurement is straightforward: load the log, count frequencies, build the graph. There is no iteration, no search, no optimization loop. Timing variance is very low (typically less than 5% across 7 runs).

### Heuristic Algorithms (2 algorithms)

Heuristic Miner and its variants compute dependency metrics between activities and filter based on thresholds. These involve a pass over the event log to compute frequencies, followed by a filtering step. The filtering step's cost depends on the noise threshold parameter. We benchmark at default thresholds but also document performance at different threshold values.

### Search-Based Algorithms (5 algorithms)

Hill Climbing, Simulated Annealing, A\*, ACO, and Genetic Algorithm search a solution space for an optimal or near-optimal process model. These are iterative algorithms with stochastic components (random number generation). Measurement variance is higher because the number of iterations varies between runs. We use seeded random number generators to ensure reproducibility: the same seed produces the same search trajectory and the same result.

### Exact Algorithms (2 algorithms)

ILP and Declare use mathematical optimization or declarative constraints to find provably optimal or consistent models. These are deterministic: the same input always produces the same output. Timing variance is low, similar to direct discovery algorithms. However, their absolute runtime is higher because the underlying optimization problem is computationally expensive.

---

## Environment Isolation

To minimize external interference with our benchmarks, we isolate the measurement environment:

### Process Priority

The benchmark process runs at normal priority. We experimented with elevating priority (via `nice` on Unix), but this introduces its own measurement artifacts and is not reproducible across platforms. Normal priority is the fairest baseline because it represents the conditions users experience.

### Filesystem Effects

The event log is read from disk once during initialization and held in memory. Subsequent benchmark runs operate on the in-memory copy. This eliminates filesystem I/O from our timing measurements. The initial load time is measured separately and reported as a "cold start" metric.

### Garbage Collection

V8's garbage collector can pause JavaScript execution during benchmark runs. Short-lived allocations from the benchmark harness (creating result objects, formatting output) can trigger GC pauses. We minimize allocations in the measurement loop and run `--expose-gc` with manual `global.gc()` calls between runs to reduce GC interference.

### Network and System Services

We run benchmarks with network interfaces in a known state (no active downloads, no VPN connections that might trigger periodic health checks). On macOS, we disable Spotlight indexing of the benchmark directory to prevent filesystem events during measurement.

---

## Reporting Format

Our benchmark output follows a consistent format:

```json
{
  "algorithm": "dfg",
  "dataset": "bpi2020",
  "runs": [2.8, 2.9, 3.0, 3.0, 3.1, 3.2, 3.5],
  "median_ms": 3.0,
  "min_ms": 2.8,
  "max_ms": 3.5,
  "p95_ms": 3.4,
  "memory_peak_kb": 128,
  "wasm_memory_pages": 2,
  "warmup_runs": 3,
  "total_runs": 7,
  "hardware": "Apple M3 Max (16P/4E, 36GB)",
  "node_version": "v20.11.0",
  "rust_version": "1.77.0",
  "wasm_pack_version": "0.12.1",
  "timestamp": "2026-04-08T12:00:00Z"
}
```

This full metadata enables reproducibility and comparison across environments. The `runs` array lets you compute your own statistics (mean, standard deviation, confidence intervals) if our median-focused reporting does not meet your needs.

---

## Fairness Considerations

### Input Normalization

Every algorithm receives the same pre-parsed event log structure. We do not allow algorithms to re-parse the raw XES file, which would penalize algorithms that do not implement their own XES parser. The event log is loaded once and passed as a shared data structure.

### Parameter Defaults

We benchmark with default parameters unless otherwise noted. This reflects what users experience when they run `pictl run log.xes --algorithm <name>` without additional flags. Some algorithms have parameters that dramatically affect performance (e.g., noise threshold in Heuristic Miner). We document these sensitivities separately.

### Timeout Policy

Any algorithm run that exceeds 60 seconds is terminated and reported as "timed out." This prevents benchmarks from running indefinitely on algorithms with poor scaling. In practice, no algorithm in our suite times out on BPI 2020 at default parameters.

---

## Reproducing Our Benchmarks

To reproduce our results:

```bash
# Clone the repository
git clone <repo-url> && cd wasm4pm

# Build WASM (pinned Rust version)
cd wasm4pm && npm run build

# Run benchmarks (requires Node.js 20+)
node scripts/benchmark.mjs --dataset bpi2020 --runs 7 --warmup 3

# Results are written to .pictl/results/ with full metadata
pictl results --latest
```

Hardware: Apple M3 Max (16P/4E, 36GB unified memory), macOS Sonoma 14.x, Node.js 20 LTS, Rust 1.77 (stable), wasm-pack 0.12.1.

For meaningful comparisons, use hardware with similar single-thread performance. Absolute times will differ; relative ratios between algorithms should remain consistent.
