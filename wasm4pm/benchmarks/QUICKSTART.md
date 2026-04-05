# Benchmark Commands Quick Reference

## Browser Benchmarks

```bash
# Full browser benchmarks
npm run bench:browser

# Fast CI mode (fewer iterations)
npm run bench:browser:ci

# Interactive dashboard
open benchmarks/dashboard.html
```

## Node.js Benchmarks

```bash
# Full Node.js benchmarks (parallel workers)
npm run bench

# CI mode (reduced iterations)
npm run bench:ci

# Build + benchmark
npm run bench:build
```

## Comparison & Analysis

```bash
# Compare Node.js vs Browser results
node benchmarks/compare.js results/nodejs.json results/browser.json

# View results in dashboard
open benchmarks/dashboard.html
# Then upload JSON files using the file picker
```

## Output

All benchmarks produce:

- **JSON** — Full data with all metrics
- **CSV** — Easy import to spreadsheets
- **Console** — Formatted table summary

Results saved to `results/` directory:

```
results/
├── browser_bench_2024-01-15T10-30-45-123Z.json
├── browser_bench_2024-01-15T10-30-45-123Z.csv
├── wasm_bench_2024-01-15T10-30-45-123Z.json
└── wasm_bench_2024-01-15T10-30-45-123Z.csv
```

## Algorithms Tested

| Category      | Algorithms                                                                                          |
| ------------- | --------------------------------------------------------------------------------------------------- |
| **Fast**      | DFG, Declare, Heuristic Miner, Alpha++, Inductive Miner, Hill Climbing, Event Stats, Trace Variants |
| **Medium**    | A\*, Simulated Annealing, Ant Colony                                                                |
| **Analytics** | Variant Complexity, Activity Transition Matrix, Rework Detection                                    |

## Log Sizes

- **100 cases** — Fast algorithms
- **500 cases** — Medium algorithms
- **1000 cases** — All algorithms
- **5000 cases** — Fast algorithms only

## Files

| File                                    | Purpose                       |
| --------------------------------------- | ----------------------------- |
| `__tests__/benchmarks/browser.bench.ts` | Browser benchmark tests       |
| `benchmarks/wasm_bench_runner.js`       | Node.js benchmark coordinator |
| `benchmarks/wasm_bench_worker.js`       | Node.js worker implementation |
| `benchmarks/compare.js`                 | Node vs Browser comparison    |
| `benchmarks/dashboard.html`             | Interactive results viewer    |
| `benchmarks/BROWSER_BENCHMARKS.md`      | Detailed documentation        |

## Customization

Edit `__tests__/benchmarks/browser.bench.ts`:

```typescript
// Add/remove algorithms
const BENCHMARK_TASKS: BenchmarkTask[] = [
  { algorithm: 'discover_dfg', sizes: [100, 1000, 5000], params: {} },
  // ...
];

// Change iterations (currently 5 full, 3 CI)
const ITERATIONS = globalThis.CI_MODE ? 3 : 5;
```

## Tips

- **Fast run:** Use CI mode
- **Reliable results:** Run 3+ times, average results
- **Comparison:** Keep Node.js and Browser JSONs together
- **Analysis:** Load both into dashboard for side-by-side
- **Trends:** Run regularly to track performance over time
