# Reproduce Published Benchmark Results

**Problem:** You want to validate the benchmark numbers published in `docs/BENCHMARKS.md` on your own hardware, or you need to produce a benchmark report for a paper or internal review.

## Overview

The published benchmarks in `docs/BENCHMARKS.md` were measured on specific hardware with specific tool versions. To reproduce them, you need to match the environment as closely as possible and account for hardware differences.

## Step 1: Check the Published Environment

From `docs/BENCHMARKS.md`:

| Property          | Value                                               |
| ----------------- | --------------------------------------------------- |
| **Hardware**      | Apple M3 Max MacBook Pro                            |
| **CPU**           | 16P + 4E cores (12 performance, 4 efficiency)       |
| **Memory**        | 36 GB unified memory                                |
| **OS**            | macOS (Darwin)                                      |
| **Rust**          | stable toolchain, `cargo build --release`           |
| **WASM build**    | `wasm-pack build --target nodejs`                   |
| **RUSTFLAGS**     | `-C target-feature=+simd128`                        |
| **pictl version** | v26.4.9                                             |
| **Iterations**    | Median of 7 runs                                    |
| **Dataset**       | Synthetic event logs (6 activities, 20 events/case) |

## Step 2: Set Up Your Environment

### Install Rust and wasm-pack

```bash
# Install Rust stable
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source $HOME/.cargo/env

# Verify versions
rustc --version    # Should be 1.80+ (stable)
cargo --version

# Install wasm-pack
curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh
wasm-pack --version
```

### Clone and build

```bash
git clone https://github.com/seanchatmangpt/wasm4pm.git
cd wasm4pm/wasm4pm

# Install Node.js dependencies
npm ci

# Build WASM for Node.js (with SIMD)
npm run build:nodejs
```

### Verify the build

```bash
pictl status
```

This should print WASM engine health and system information, confirming the module loaded correctly.

## Step 3: Generate the Synthetic Dataset

The published benchmarks use synthetic event logs with these parameters:

- **6 activities** (Register, Validate, Check_Completeness, Check_Docs, Assess_Risk, Calculate_Fee)
- **20 events per case** (average)
- **Noise factor**: 0.1 (10% random activity deviation)

Generate logs at each size used in the benchmarks:

```bash
# The benchmark runner generates logs internally, but you can create
# standalone XES files for manual testing with pictl run.

# 100 cases
pictl init --algorithm dfg  # Creates pictl.toml
pictl run synthetic_100.xes --algorithm dfg --format json
```

For exact reproduction, the benchmark runner in `benchmarks/wasm_bench_worker.js` generates logs programmatically using a deterministic LCG PRNG (seed `0xdeadbeefcafebabe`). The log generator is in `__tests__/benchmarks/browser.test.ts`.

## Step 4: Run the Exact Benchmark Commands

### Node.js benchmarks (published results)

```bash
cd wasm4pm

# Full benchmark suite (median of 7 iterations)
npm run bench

# Or CI mode (median of 3 iterations, faster)
npm run bench:ci
```

The full suite runs 4 parallel worker groups:

1. **fast_discovery** -- DFG, Declare, Heuristic Miner, Alpha++, Inductive Miner, Hill Climbing, Process Skeleton, Event Statistics
2. **medium_discovery** -- A\*, Simulated Annealing, Ant Colony, Trace Variants, Sequential Patterns, Concept Drift, Trace Clustering
3. **slow_discovery** -- Genetic Algorithm, PSO, ILP Petri Net
4. **analytics** -- Variant Complexity, Activity Transition Matrix, Rework Detection

### Browser benchmarks

```bash
npm run bench:browser    # Full (5 iterations)
npm run bench:browser:ci # CI mode (3 iterations)
```

### Individual algorithm timing via pictl run

For spot-checking a single algorithm:

```bash
pictl run log_10k.xes --algorithm dfg --format json
# Look for "elapsedMs" in the output

pictl run log_10k.xes --algorithm hill-climbing --format json

pictl run log_10k.xes --algorithm heuristic --format json
```

### Side-by-side comparison

```bash
pictl compare dfg heuristic inductive hill-climbing -i log_10k.xes
```

## Step 5: Compare with Published Results

### Batch algorithm reference (10K cases)

| Algorithm           | Published (ms) | Your Result | Delta |
| ------------------- | -------------- | ----------- | ----- |
| Process Skeleton    | ~2.7           |             |       |
| DFG                 | ~3.0           |             |       |
| Optimized DFG       | ~7.8           |             |       |
| Heuristic Miner     | ~14            |             |       |
| Inductive Miner     | ~25            |             |       |
| Genetic Algorithm   | ~24            |             |       |
| ACO                 | ~21            |             |       |
| Simulated Annealing | ~23            |             |       |
| PSO Algorithm       | ~25            |             |       |
| Hill Climbing       | ~135           |             |       |
| Noise-Filtered DFG  | ~135           |             |       |
| A\* Search          | ~77            |             |       |
| ILP Petri Net       | ~87            |             |       |

### Streaming algorithm reference (10K cases)

| Algorithm                | Published (ms) | Your Result | Delta |
| ------------------------ | -------------- | ----------- | ----- |
| Streaming DFG            | ~69            |             |       |
| Streaming Noise-Filtered | ~135           |             |       |
| Streaming A\*            | ~155           |             |       |
| Streaming Inductive      | ~135           |             |       |
| Streaming Alpha++        | ~155           |             |       |
| Streaming Hill Climbing  | ~187           |             |       |

## Step 6: Account for Hardware Differences

### Expected variance

On different hardware, expect **+/-10% variance** from published numbers. This comes from:

- **CPU microarchitecture** -- M3 Max vs M2 Pro vs Intel vs AMD have different IPC and memory bandwidth.
- **Memory speed** -- unified memory bandwidth varies by Apple Silicon generation.
- **Thermal throttling** -- laptops throttle under sustained load; desktops do not.
- **Background processes** -- close other applications before benchmarking.

### What is acceptable

| Difference | Interpretation                                                  |
| ---------- | --------------------------------------------------------------- |
| Within 10% | Expected hardware variance                                      |
| 10-25%     | Different CPU generation or throttling                          |
| 25-50%     | Significantly different hardware (e.g., Intel vs Apple Silicon) |
| >50%       | Something is wrong -- check build flags, SIMD, or dataset       |

### Common causes of large discrepancies

1. **SIMD not enabled** -- Without `-C target-feature=+simd128`, algorithms that use SIMD paths fall back to scalar code. Check your build flags:

   ```bash
   # Verify SIMD is enabled in the build
   RUSTFLAGS="-C target-feature=+simd128" wasm-pack build --target nodejs
   ```

2. **Wrong build profile** -- Debug builds are 5-10x slower than release builds. Always use `--release` or the npm scripts which default to release mode.

3. **Different dataset** -- The published results use specific synthetic log parameters (6 activities, 20 events/case). Using the BPI 2020 dataset (10,500 traces, 141K events) will produce different absolute times, though the relative rankings should be similar.

4. **VM or container overhead** -- Running in a Docker container or VM adds 5-15% overhead compared to bare metal.

## Step 7: Validate on Real Data (BPI 2020)

The methodology section of `docs/BENCHMARKS.md` mentions validation on BPI 2020. To reproduce:

1. Download the BPI 2020 dataset from the 4TU Center (https://data.4tu.nl).
2. Run the algorithms:

   ```bash
   pictl run bpi2020.xes --algorithm heuristic --format json
   pictl run bpi2020.xes --algorithm inductive --format json
   pictl run bpi2020.xes --algorithm ilp --format json
   ```

3. Compare the relative rankings with the published results. The absolute times will differ (BPI 2020 has 10,500 traces vs the synthetic 10K), but the ranking order should match.

## Reporting Your Results

When sharing reproduced results, include:

1. **Hardware specs** -- CPU model, cores, memory.
2. **OS and version** -- `uname -a` or `system_profiler SPHardwareDataType` on macOS.
3. **Rust version** -- `rustc --version`.
4. **wasm-pack version** -- `wasm-pack --version`.
5. **Build flags** -- Confirm SIMD was enabled.
6. **pictl version** -- `pictl --version`.
7. **Iterations** -- How many runs, median reported.
8. **Full results table** -- Algorithm, size, median ms, p95 ms.

Example report format:

```
Reproduction of wasm4pm benchmarks
Date: 2026-04-08
Hardware: Apple M2 Pro, 16GB unified memory
OS: macOS 14.4 (Darwin 23.4.0)
Rust: 1.80.0 (stable)
wasm-pack: 0.13.1
pictl: v26.4.9
Build: RUSTFLAGS="-C target-feature=+simd128" wasm-pack build --target nodejs
Iterations: 7 (median reported)

Results (10K cases):
  DFG:              3.2ms  (published: ~3.0ms, delta: +6.7%)
  Heuristic Miner:  15.1ms (published: ~14ms,  delta: +7.9%)
  Hill Climbing:    142ms  (published: ~135ms, delta: +5.2%)
```

## See Also

- [docs/BENCHMARKS.md](../../BENCHMARKS.md) -- the published benchmark results
- [benchmarks/README.md](../../../benchmarks/README.md) -- benchmark suite documentation
- [benchmarks/QUICKSTART.md](../../../benchmarks/QUICKSTART.md) -- command quick reference
- [Compare Two Algorithms](./compare-algorithms.md) -- side-by-side algorithm comparison
