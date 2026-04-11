# pictl Browser Benchmarks

Browser-based performance testing for pictl algorithms using Vitest with headless Chromium and Playwright.

## Overview

Browser benchmarks test pictl algorithms in a browser environment (via headless Chromium), providing insights into:

- **Real-world browser performance** — Actual JavaScript engine optimization patterns
- **Environment differences** — Node.js vs browser WASM memory models
- **Scalability analysis** — How algorithms perform with increasing log sizes
- **Algorithm comparison** — Relative performance across 13+ algorithms

## Quick Start

### Run Full Browser Benchmarks

```bash
npm run bench:browser
```

This will:

1. Build the web WASM target (`build:web`)
2. Start Vitest browser runner
3. Execute all 13 algorithms across 3 log sizes
4. Display results in console with median/p95 metrics
5. Run headless Chromium (no GUI)

### Run CI Mode (Faster)

```bash
npm run bench:browser:ci
```

Reduces iterations from 5 to 3, completing 10x faster while maintaining reliable results.

## Test Coverage

The browser benchmarks test **13 algorithms** across **3 log sizes**:

### Fast Algorithms (O(n) to O(n²))

- `discover_dfg` — Directly-Follows Graph
- `discover_declare` — Declare pattern mining
- `discover_heuristic_miner` — Heuristic mining
- `discover_alpha_plus_plus` — Alpha++ algorithm
- `discover_inductive_miner` — Inductive Miner
- `discover_hill_climbing` — Hill Climbing
- `analyze_event_statistics` — Event analysis
- `analyze_trace_variants` — Trace variants

### Medium Algorithms (O(n² log n) to O(n³))

- `discover_astar` — A\* search
- `discover_simulated_annealing` — Simulated annealing
- `discover_ant_colony` — Ant colony optimization

### Analytics

- `analyze_variant_complexity` — Variant complexity
- `compute_activity_transition_matrix` — Transition matrix
- `detect_rework` — Rework detection

### Log Sizes Tested

- **100 cases** — Small log, fast algorithms
- **500 cases** — Medium log, all algorithms
- **1000 cases** — Large log, stressful
- **5000 cases** — Very large log, fast algorithms only

## Output Format

Console output shows a formatted table:

```
Algorithm                       Cases     Median ms  p95 ms
────────────────────────────────────────────────────────────
analyze_event_statistics        100          0.81     0.83
analyze_event_statistics        1000         2.15     2.24
analyze_event_statistics        5000         8.92     9.31
discover_astar                  100          5.32     5.51
discover_astar                  500         28.44    29.12
discover_astar                  1000        64.31    66.89
...
```

## Analysis & Comparison

### Compare Node.js vs Browser

```bash
node benchmarks/compare.js results/nodejs_bench.json results/browser_bench.json
```

Generates a side-by-side comparison showing:

- Performance speedup (Node/Browser ratio)
- Distribution of performance differences
- Overall performance impression

Example output:

```
Algorithm                       Cases  Node ms    Browser ms  Speedup  Status
──────────────────────────────────────────────────────────────────────────────
analyze_event_statistics        100     0.45         0.81       0.56x   Browser slower
discover_dfg                    1000    3.21         8.30       0.39x   Browser slower
discover_heuristic_miner        5000   31.24        65.30       0.48x   Browser slower
...

📊 STATISTICS
Total comparisons: 42
Average speedup:   0.52x
Speedup range:     0.35x - 0.78x
Browser performance: ⚠️  Browser is consistently slower
```

### Interactive Dashboard

Open the benchmark dashboard in a browser:

```bash
open benchmarks/dashboard.html
```

Features:

- **Upload JSON** — Load benchmark results from file
- **Interactive charts** — Bar charts and line graphs
- **Statistics cards** — Summary metrics (avg time, min/max)
- **Detailed table** — All results with sortable columns
- **Export** — Save results as JSON for comparison

## Result Files

Benchmark results are saved as:

```
results/
├── browser_bench_2024-01-15T10-30-45-123Z.json   # Full results
└── browser_bench_2024-01-15T10-30-45-123Z.csv    # CSV export
```

Format:

```json
{
  "timestamp": "2024-01-15T10:30:45.123Z",
  "environment": "browser",
  "results": [
    {
      "algorithm": "discover_dfg",
      "size": 100,
      "medianMs": 2.34,
      "minMs": 2.15,
      "maxMs": 2.89,
      "p95Ms": 2.87,
      "iterations": 5
    }
    ...
  ]
}
```

## Customization

### Adjust Algorithm Configuration

Edit `__tests__/benchmarks/browser.bench.ts`:

```typescript
const BENCHMARK_TASKS: BenchmarkTask[] = [
  {
    algorithm: 'discover_dfg',
    sizes: [100, 1000, 5000], // Add/remove sizes
    params: {},
  },
  // Add new algorithms...
];
```

### Change Iteration Count

Edit line 16 in `browser.bench.ts`:

```typescript
const ITERATIONS = globalThis.CI_MODE ? 3 : 5; // Change from 5 to 10
```

### Adjust Log Generation

Parameters in `generateXES()`:

- `numCases` — Number of process cases
- `numActivities` — Number of distinct activities
- `avgEvents` — Average events per case
- `noiseFactor` — Random activity deviation (0.0 to 1.0)

## Performance Tips

### Faster Benchmarking

- Use CI mode: `npm run bench:browser:ci`
- Reduce iterations in config
- Test fewer algorithms at once
- Use smaller log sizes

### Reliable Results

- Run multiple times and average
- Close other applications to reduce variance
- Use consistent hardware/environment
- Warm up algorithms before timing (already done)

### Analyzing Results

- Compare medians (robust to outliers)
- Check p95 for tail latency
- Plot median vs size for scalability
- Compare across algorithms

## Environment Details

**Browser Runtime:**

- Chromium (headless)
- Playwright 1.40+
- V8 JavaScript engine

**WASM Build Target:**

- `--target web` (browser-optimized)
- SIMD128 enabled (`-C target-feature=+simd128`)
- Optimized binary (wasm-opt)

## Troubleshooting

### "Playwright not installed"

```bash
npx playwright install
```

### "Cannot find module 'pkg/wasm4pm.js'"

```bash
npm run build:web
```

### Tests timeout

Increase timeout in `vitest.config.ts`:

```typescript
testTimeout: 60000; // 60 seconds
```

### Browser not launching

Check Playwright is properly installed:

```bash
npx playwright install --with-deps
```

## Integration with CI/CD

For GitHub Actions, add to your workflow:

```yaml
- name: Run browser benchmarks
  run: npm run bench:browser:ci

- name: Store results
  uses: actions/upload-artifact@v3
  with:
    name: benchmark-results
    path: results/*.json
```

## File Structure

```
benchmarks/
├── browser.bench.ts          # ← Main vitest browser benchmark file
├── wasm_bench_runner.js      # Node.js benchmark runner
├── wasm_bench_worker.js      # Worker thread implementation
├── compare.js                # Node vs Browser comparison tool
├── dashboard.html            # Interactive results dashboard
├── BROWSER_BENCHMARKS.md     # This file
└── QUICKSTART.md             # Quick reference
```

## See Also

- [`QUICKSTART.md`](./QUICKSTART.md) — Quick command reference
- [`../ALGORITHMS.md`](../ALGORITHMS.md) — Algorithm descriptions
- [`../BUILD.md`](../BUILD.md) — Build and publish guide
- Test results: `results/` directory
