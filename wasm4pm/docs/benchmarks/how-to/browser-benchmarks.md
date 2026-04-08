# Run Browser Benchmarks

**Problem:** You want to test WASM performance in a real browser environment, because your users will run pictl algorithms in the browser and you need to know how they will perform there.

## Why Browser Benchmarks Matter

Browser WASM performance differs from Node.js for several reasons:

- **JIT compilation** -- V8 in Chromium optimizes differently than Node.js V8.
- **Memory model** -- Browsers limit WASM linear memory growth more aggressively.
- **SIMD availability** -- Not all browsers enable WASM SIMD (Chromium does; older Firefox/Safari may not).
- **Typed array overhead** -- Data transfer between JS and WASM uses structured clone in browsers, which can be slower.

Typical result: browsers are **40-60% slower** than Node.js for the same algorithm.

## Prerequisites

```bash
cd wasm4pm

# Ensure Node.js dependencies are installed
npm ci

# Install Playwright browser binaries
npx playwright install chromium
```

For CI or headless environments where system dependencies are missing:

```bash
npx playwright install --with-deps chromium
```

## Step 1: Run the Full Browser Benchmark Suite

```bash
npm run bench:browser
```

This command:

1. Builds the web-target WASM binary (`npm run build:web` with `--target web`).
2. Launches Vitest in browser mode with headless Chromium.
3. Runs 13 algorithms across 3 log sizes (100, 500, and 1000 or 5000 cases).
4. Performs 5 iterations per measurement (median reported).
5. Saves results to `results/browser_bench_<timestamp>.json` and `.csv`.

### Expected output

```
Algorithm                       Cases     Median ms  p95 ms
────────────────────────────────────────────────────────────
analyze_event_statistics        100          0.81     0.83
analyze_event_statistics        1000         2.15     2.24
analyze_event_statistics        5000         8.92     9.31
discover_dfg                    100          0.92     0.97
discover_dfg                    1000         4.21     4.55
discover_dfg                    5000        18.30    19.12
discover_heuristic_miner        100          2.34     2.51
discover_heuristic_miner        1000        12.45    13.10
discover_heuristic_miner        5000        65.30    68.12
discover_astar                  100          5.32     5.51
discover_astar                  500         28.44    29.12
discover_astar                  1000        64.31    66.89
...
```

## Step 2: Run CI Mode (Faster)

For CI pipelines where speed matters more than precision:

```bash
npm run bench:browser:ci
```

This reduces iterations from 5 to 3 and sets the `CI_MODE` environment variable. Results are still reliable enough for regression detection.

## Step 3: Compare Browser vs Node.js Results

Run both suites, then compare:

```bash
# Generate Node.js results
npm run build:nodejs
npm run bench

# Generate Browser results (already done in step 1)
# npm run bench:browser

# Compare
node benchmarks/compare.js results/wasm_bench_*.json results/browser_bench_*.json
```

Example comparison output:

```
Algorithm                       Cases  Node ms    Browser ms  Speedup  Status
──────────────────────────────────────────────────────────────────────────────
analyze_event_statistics        100     0.45         0.81       0.56x   Browser slower
discover_dfg                    1000    3.21         8.30       0.39x   Browser slower
discover_heuristic_miner        5000   31.24        65.30       0.48x   Browser slower
discover_astar                  1000   54.10        64.31       0.84x   Similar
discover_hill_climbing         5000   128.50       175.20       0.73x   Browser slower

STATISTICS
Total comparisons: 42
Average speedup:   0.52x
Speedup range:     0.35x - 0.78x
Browser performance: Browser is consistently slower
```

Key observations:

- **Average speedup is ~0.52x** (browser is about 2x slower).
- **Fast algorithms** (DFG, event statistics) suffer a higher relative penalty because the JS/WASM boundary overhead dominates at low absolute times.
- **Medium algorithms** (A\*, hill climbing) have less relative overhead because the computation time dominates.

## Step 4: Interactive Dashboard

Open the HTML dashboard in a browser:

```bash
open benchmarks/dashboard.html
```

Then:

1. Click **"Load Results"** (or drag-and-drop a JSON file).
2. Select the `browser_bench_*.json` file from `results/`.
3. View bar charts by algorithm and line graphs for scalability.
4. Load both Node.js and browser results for a side-by-side comparison.

The dashboard renders entirely client-side (no server required).

## Step 5: Understanding Browser Build Differences

The browser benchmark uses a different WASM build target than Node.js:

| Property      | Node.js Build          | Browser Build          |
| ------------- | ---------------------- | ---------------------- |
| Target        | `--target nodejs`      | `--target web`         |
| SIMD          | Enabled (`+simd128`)   | Enabled (`+simd128`)   |
| Module format | CommonJS               | ES Module              |
| Memory import | `require('fs')` buffer | `WebAssembly.Memory`   |
| Optimization  | `wasm-opt` (wasm-pack) | `wasm-opt` (wasm-pack) |

The `--target web` build produces a self-contained WASM module that initializes its own memory, which is required for browser environments where Node.js APIs are unavailable.

## Algorithms Tested in Browser Benchmarks

The browser suite tests a subset of the full algorithm list to keep runtime reasonable:

| Category  | Algorithms                                                                     |
| --------- | ------------------------------------------------------------------------------ |
| Fast      | `discover_dfg`, `discover_declare`, `discover_heuristic_miner`,                |
|           | `discover_alpha_plus_plus`, `discover_inductive_miner`,                        |
|           | `discover_hill_climbing`, `analyze_event_statistics`, `analyze_trace_variants` |
| Medium    | `discover_astar`, `discover_simulated_annealing`, `discover_ant_colony`        |
| Analytics | `analyze_variant_complexity`, `compute_activity_transition_matrix`,            |
|           | `detect_rework`                                                                |

### Why some algorithms are excluded

Metaheuristics with large populations (genetic algorithm, PSO) and exact solvers (ILP) are excluded from the browser suite because:

- They require longer runtimes that push against browser tab timeouts.
- Their use case is primarily server-side (batch processing), not client-side.
- You can add them by editing `BENCHMARK_TASKS` in `__tests__/benchmarks/browser.test.ts`.

## Customizing the Browser Benchmark Suite

### Change which algorithms are tested

Edit `__tests__/benchmarks/browser.test.ts`:

```typescript
const BENCHMARK_TASKS: BenchmarkTask[] = [
  { algorithm: 'discover_dfg', sizes: [100, 1000, 5000], params: {} },
  // Add a new algorithm:
  {
    algorithm: 'discover_genetic_algorithm',
    sizes: [100, 500],
    params: { popSize: 10, generations: 5 },
  },
];
```

### Change iteration count

```typescript
const ITERATIONS = (globalThis as Record<string, unknown>).CI_MODE ? 3 : 10; // Was 5
```

### Change log generation parameters

The `generateXES()` function in `browser.test.ts` accepts:

- `numCases` -- number of process instances (default varies by task).
- `numActivities` -- distinct activity names (default: 12).
- `avgEvents` -- average events per case (default: 15).
- `noiseFactor` -- probability of a random activity deviation (default: 0.1).

## Troubleshooting

### "Playwright not installed"

```bash
npx playwright install chromium
```

### "Cannot find module 'pkg/wasm4pm.js'"

The web-target WASM has not been built:

```bash
npm run build:web
```

### Browser tests timeout

Increase the timeout in `vitest.config.ts`:

```typescript
testTimeout: 120000; // 120 seconds
```

### Chromium fails to launch on Linux CI

```bash
npx playwright install --with-deps chromium
sudo apt-get install libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2
```

## See Also

- [Compare Two Algorithms](./compare-algorithms.md) -- algorithm comparison via CLI
- [Set Up CI/CD Benchmark Regression Detection](./cicd-integration.md) -- automating browser benchmarks in CI
- [benchmarks/BROWSER_BENCHMARKS.md](../../../benchmarks/BROWSER_BENCHMARKS.md) -- detailed browser benchmark documentation
- [benchmarks/QUICKSTART.md](../../../benchmarks/QUICKSTART.md) -- command reference
