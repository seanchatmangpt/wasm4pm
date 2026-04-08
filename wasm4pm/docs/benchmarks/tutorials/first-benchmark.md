# Your First Benchmark

> Run benchmarks, see results, and understand the output format.
> Estimated time: 15 minutes.

## What you will build

By the end of this tutorial you will:

1. Install pictl and verify your environment
2. Run a single-algorithm benchmark against a real event log
3. Run the full benchmark suite across all 21 discovery algorithms
4. Compare two algorithms side by side using `pictl compare`
5. Read and interpret the benchmark output columns (median, p95, iterations)

You do not need to understand process mining theory to follow this tutorial. You only need the tools listed below and a willingness to read some numbers.

---

## Prerequisites

| Tool               | Minimum version | Install command                         |
| ------------------ | --------------- | --------------------------------------- |
| **Node.js**        | 18+             | `nvm install 20` or `brew install node` |
| **pnpm**           | 8+              | `npm install -g pnpm`                   |
| **Rust toolchain** | 1.70+           | `rustup update`                         |
| **wasm-pack**      | 0.12+           | `cargo install wasm-pack`               |

Verify your setup:

```bash
node --version        # v20.x or later
pnpm --version        # 8.x or later
rustc --version       # 1.70 or later
wasm-pack --version   # 0.12 or later
```

If any of these commands fail, install the missing tool before continuing.

---

## Step 1: Install pictl

You have two options. Option A installs the published npm package. Option B builds from source, which is necessary if you are modifying the algorithms.

### Option A: Install from npm (recommended for running benchmarks only)

```bash
npm install -g @pictl/cli
pictl --version
```

You should see `v26.4.x` or later. If the version is older, update with `npm update -g @pictl/cli`.

### Option B: Build from source (required if you are developing algorithms)

```bash
# Clone the repository
git clone https://github.com/seanchatmangpt/wasm4pm.git
cd wasm4pm

# Install TypeScript dependencies
pnpm install

# Build the WASM core
cd wasm4pm
npm run build:nodejs

# Build and link the CLI
cd ../apps/pmctl
npm run build
npm link
```

Verify the CLI works:

```bash
pictl status
```

You should see output confirming the WASM engine is loaded and healthy.

---

## Step 2: Get test data

Benchmarks need an event log in XES format. pictl ships with a synthetic log generator, but real-world data gives you more meaningful results.

### Option A: Use the built-in synthetic generator (fastest)

The benchmark runner (`wasm_bench_runner.js`) generates synthetic XES logs internally using a deterministic LCG random number generator. No external files are needed. You will use this approach when running the full suite in Step 3.

### Option B: Download a real BPI Challenge dataset

For more realistic results, download the BPI 2020 Travel Permits dataset:

1. Visit https://data.4tu.nl/collections/BPI_Challenge_2020/5065541
2. Download `BPI_2020_Travel_Permits_Actual.xes` (approximately 20 MB)
3. Place it in the fixtures directory:

```bash
mkdir -p wasm4pm/tests/fixtures
cp ~/Downloads/BPI_2020_Travel_Permits_Actual.xes wasm4pm/tests/fixtures/
```

The BPI 2020 dataset contains 10,500 traces and 56,437 events across 17 activities. It is a real-world government permit application process with noise, loops, and parallelism -- ideal for benchmarking.

---

## Step 3: Run your first benchmark

There are two ways to run benchmarks: the CLI and the Node.js runner. Both measure the same WASM algorithms. Use the CLI for quick single-algorithm checks and the runner for the full suite.

### Quick benchmark with pictl CLI

Run DFG discovery on a log and time it:

```bash
pictl run -i wasm4pm/tests/fixtures/BPI_2020_Travel_Permits_Actual.xes --algorithm dfg --format json
```

The JSON output includes a `summary` field with timing information. On an Apple M3 Max, DFG discovery on BPI 2020 (10,500 traces, 56K events) completes in approximately **6.5 ms**.

### Full benchmark suite with the Node.js runner

This runs all discovery algorithms across multiple dataset sizes:

```bash
# Build the WASM Node.js target first
cd wasm4pm
npm run build:nodejs

# Run the full benchmark suite
node benchmarks/wasm_bench_runner.js
```

Expected output:

```
wasm4pm WASM Benchmark Runner
Mode: Full
Workers: 4 parallel groups
Starting...

Algorithm                                   Cases      Median ms   p95 ms
----------------------------------------------------------------------------
discover_alpha_plus_plus                     100        0.12        0.15
discover_alpha_plus_plus                     1000       1.34        1.48
discover_alpha_plus_plus                     5000       7.21        7.89
discover_alpha_plus_plus                     10000      14.56       15.22
discover_dfg                                 100        0.02        0.03
discover_dfg                                 1000       0.28        0.31
discover_dfg                                 5000       1.45        1.62
discover_dfg                                 10000      3.02        3.28
discover_heuristic_miner                     100        0.18        0.21
discover_heuristic_miner                     1000       1.82        1.95
discover_heuristic_miner                     5000       7.15        7.89
discover_heuristic_miner                     10000      14.03       14.88
...

Completed 84 measurements in 45.2s
Report written to: results/wasm_bench_2026-04-08T12-00-00.json
CSV written to:    results/wasm_bench_2026-04-08T12-00-00.csv
```

The runner saves two files:

- **JSON** (`results/wasm_bench_*.json`) -- machine-readable, includes all statistics
- **CSV** (`results/wasm_bench_*.csv`) -- easy to import into spreadsheets or analysis tools

### CI mode (faster, fewer iterations)

Use the `--ci` flag for reduced iteration counts, suitable for continuous integration:

```bash
node benchmarks/wasm_bench_runner.js --ci
```

CI mode runs 3 iterations instead of 7, cutting total time roughly in half.

---

## Step 4: Read the output

The benchmark table has four columns. Understanding each one is important for interpreting results correctly.

### Column: Algorithm

The WASM function name. These correspond to the Rust functions exported through wasm-pack. Common mappings:

| Benchmark name               | Algorithm         | Description                       |
| ---------------------------- | ----------------- | --------------------------------- |
| `discover_dfg`               | DFG               | Directly-Follows Graph (baseline) |
| `discover_heuristic_miner`   | Heuristic Miner   | Noise-tolerant discovery          |
| `discover_inductive_miner`   | Inductive Miner   | Block-structured process trees    |
| `extract_process_skeleton`   | Process Skeleton  | Minimal start/end abstraction     |
| `discover_astar`             | A\* Search        | Heuristic-guided search           |
| `discover_genetic_algorithm` | Genetic Algorithm | Evolutionary optimization         |
| `discover_pso_algorithm`     | PSO               | Particle Swarm Optimization       |
| `discover_ilp_petri_net`     | ILP               | Integer Linear Programming        |

### Column: Cases

The number of synthetic traces (process instances) in the test log. More cases means more data to process. The benchmark runner tests at 100, 1,000, 5,000, and 10,000 cases.

### Column: Median ms

The median execution time across all iterations. **Median is used instead of mean because it is robust to outliers.** A single GC pause or OS scheduling event can inflate the mean, but the median ignores it.

For example, if five runs produce `[2.8, 3.0, 3.1, 3.2, 14.4]` milliseconds, the median is **3.1 ms** (the middle value), while the mean would be 5.3 ms (skewed by the outlier).

### Column: p95 ms

The 95th percentile execution time. This represents the worst-case performance you can expect in 95% of runs. It is useful for understanding tail latency.

A small gap between median and p95 indicates stable, predictable performance. A large gap suggests the algorithm is sensitive to GC pressure, OS scheduling, or data-dependent variance.

### Example interpretation

```
discover_dfg                                 10000      3.02        3.28
discover_heuristic_miner                     10000      14.03       14.88
discover_genetic_algorithm                   1000       768.0       816.3
```

- **DFG** at 10K cases: median 3.02 ms, p95 3.28 ms. The 0.26 ms gap means DFG is extremely stable.
- **Heuristic Miner** at 10K cases: median 14.03 ms, p95 14.88 ms. Stable with low overhead.
- **Genetic Algorithm** at 1K cases: median 768 ms, p95 816 ms. Larger gap (48 ms) indicates more variance, which is expected for evolutionary algorithms.

---

## Step 5: Compare algorithms

pictl provides a built-in comparison command that runs multiple algorithms against the same log and presents results side by side:

```bash
pictl compare dfg heuristic_miner inductive_miner -i wasm4pm/tests/fixtures/BPI_2020_Travel_Permits_Actual.xes
```

Expected output (abbreviated):

```
Algorithm Comparison (BPI 2020, 10500 traces, 56437 events)

Algorithm              Time (ms)    Output     Speed Tier
-----------------------------------------------------------
DFG                    6.54         dfg        5 (ultra-fast)
Heuristic Miner        7.86         dfg        25 (balanced)
Inductive Miner        17.69        tree       30 (balanced)
```

The `pictl compare` command is useful when you need to:

- Choose between algorithms for a production use case
- Validate that an algorithm change did not regress performance
- Show stakeholders the trade-off between speed and model quality

You can also use `pictl explain <algorithm>` to get an academic description of what each algorithm does and when to use it:

```bash
pictl explain dfg
pictl explain heuristic_miner
```

---

## What you have learned

- **Benchmark lifecycle**: build WASM, run the runner, read the JSON/CSV output
- **Output format**: the table columns (algorithm, cases, median ms, p95 ms) and what each measures
- **Median vs mean**: why the benchmark runner reports median (robustness to outliers) and includes p95 for tail latency
- **Algorithm comparison**: how to use `pictl compare` to evaluate algorithms against the same log
- **Real vs synthetic data**: BPI 2020 provides realistic results; synthetic data is faster for iteration

## Next steps

- **Understanding Benchmark Results** -- learn how to read scaling tables, identify anomalies, and assess statistical significance
- **Creating Custom Benchmark Suites** -- add your own algorithm to the benchmark runner
- **Benchmark Tiers** -- run the tiered real-data benchmarks against BPI Challenge datasets (see `docs/BENCHMARK-TIERS-USAGE.md`)
