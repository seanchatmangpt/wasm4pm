# pictl Benchmarking Suite

Comprehensive performance testing for pictl algorithms in both Node.js and browser environments.

## Quick Start

### Node.js Benchmarks (Worker Threads)

```bash
# Full benchmark run (parallel workers)
npm run bench

# Fast CI mode
npm run bench:ci

# Build + benchmark
npm run bench:build
```

### Browser Benchmarks (Headless Chromium)

```bash
# Full browser benchmark suite
npm run bench:browser

# Fast CI mode
npm run bench:browser:ci

# Interactive dashboard
open benchmarks/dashboard.html
```

## Features

### Node.js Benchmarks

✅ **Parallel execution** — 4 worker threads run simultaneously
✅ **All algorithms** — 20+ discovery and analytics algorithms
✅ **Full range** — Tests 100 to 10,000 case logs
✅ **Detailed stats** — Median, min, max, p95 percentile
✅ **Export** — JSON and CSV formats for analysis

### Browser Benchmarks

✅ **Web target** — Browser-optimized WASM binary
✅ **Headless** — Runs in Chromium (no GUI)
✅ **Live tests** — 13+ algorithms across 3 log sizes
✅ **Dashboard** — Interactive visualization UI
✅ **Comparison** — Node.js vs Browser analysis

## File Structure

```
benchmarks/
├── wasm_bench_runner.js          # Node.js coordinator
├── wasm_bench_worker.js          # Node.js worker thread
├── compare.js                    # Node vs Browser comparison
├── dashboard.html                # Interactive UI
├── README.md                     # This file
├── BROWSER_BENCHMARKS.md         # Browser benchmark docs
└── QUICKSTART.md                 # Command reference

__tests__/benchmarks/
├── browser.test.ts               # Vitest browser benchmark suite
```

## Comparison: Node.js vs Browser

Run both benchmarks, then compare:

```bash
npm run bench                      # Generate Node.js results
npm run bench:browser              # Generate Browser results
node benchmarks/compare.js \
  results/nodejs_bench_*.json \
  results/browser_bench_*.json
```

Output shows:

- Side-by-side performance metrics
- Speedup ratios (Node time / Browser time)
- Statistical distribution
- Overall performance assessment

## Dashboard

Interactive web UI for visualizing results:

```bash
open benchmarks/dashboard.html
```

**Features:**

- Load benchmark JSON files
- Bar charts by algorithm
- Line graphs for scalability
- Detailed results table
- Statistics cards
- Export as JSON

## Results Format

All benchmarks produce:

### JSON Format

```json
{
  "timestamp": "2024-01-15T10:30:45.123Z",
  "ciMode": false,
  "results": [
    {
      "algorithm": "discover_dfg",
      "size": 100,
      "medianMs": 2.34,
      "minMs": 2.15,
      "maxMs": 2.89,
      "p95Ms": 2.87,
      "iterations": 7
    }
  ]
}
```

### CSV Format

```
algorithm,size,median_ms,min_ms,max_ms,p95_ms,iterations
discover_dfg,100,2.340,2.150,2.890,2.870,7
```

## Algorithms Tested

### Fast Algorithms

- discover_dfg
- discover_declare
- discover_heuristic_miner
- discover_alpha_plus_plus
- discover_inductive_miner
- discover_hill_climbing (greedy edge pruning)
- discover_noise_filtered_dfg (streaming, frequency-based)
- extract_process_skeleton
- analyze_event_statistics

### Streaming Algorithms

- streaming_dfg
- streaming_alpha_plus_plus
- streaming_declare
- streaming_inductive_miner
- streaming_hill_climbing (trace-storage greedy pruning)
- streaming_noise_filtered_dfg (80/20 production choice)
- streaming_astar

### Medium Algorithms

- discover_astar
- discover_simulated_annealing
- discover_ant_colony
- analyze_trace_variants
- mine_sequential_patterns
- detect_concept_drift
- cluster_traces

### Analytics

- analyze_variant_complexity
- compute_activity_transition_matrix
- detect_rework

## Performance Tips

### Faster Benchmarking

```bash
npm run bench:ci           # Reduces iterations (3 vs 7)
npm run bench:browser:ci   # Browser CI mode
```

### Reliable Results

1. Run multiple times
2. Close other applications
3. Use consistent hardware
4. Average the results
5. Compare medians (robust to outliers)

### Analysis

- Use dashboard for visualization
- Export to CSV for spreadsheet analysis
- Run monthly to track trends
- Compare across environments
- Identify regression candidates

## Customization

### Adjust Node.js Benchmarks

Edit `benchmarks/wasm_bench_runner.js`:

```javascript
const ALGORITHM_GROUPS = [
  {
    name: 'fast_discovery',
    tasks: [
      { algorithm: 'discover_dfg', sizes: [100, 1000, 5000], params: {} },
      // Add/remove tasks...
    ],
  },
];
```

### Adjust Browser Benchmarks

Edit `__tests__/benchmarks/browser.test.ts`:

```typescript
const BENCHMARK_TASKS: BenchmarkTask[] = [
  { algorithm: 'discover_dfg', sizes: [100, 1000, 5000], params: {} },
  // Add/remove tasks...
];

// Change iteration count
const ITERATIONS = globalThis.CI_MODE ? 3 : 5; // Edit here
```

## Troubleshooting

### "Module not found"

```bash
npm run build:all  # Rebuild WASM
```

### "Playwright not installed"

```bash
npx playwright install
```

### Tests timeout

Increase in `vitest.config.ts`:

```typescript
testTimeout: 60000; // 60 seconds
```

### Browser won't launch

```bash
npx playwright install --with-deps
```

## Integration with CI/CD

### GitHub Actions

```yaml
- name: Run benchmarks
  run: |
    npm run bench:ci
    npm run bench:browser:ci

- name: Store results
  uses: actions/upload-artifact@v3
  with:
    name: benchmark-results
    path: results/

- name: Comment on PR
  uses: actions/github-script@v6
  with:
    script: |
      const fs = require('fs');
      const results = JSON.parse(fs.readFileSync('results/nodejs_bench.json', 'utf8'));
      github.rest.issues.createComment({
        issue_number: context.issue.number,
        owner: context.repo.owner,
        repo: context.repo.repo,
        body: `📊 Benchmark Results\n\n${JSON.stringify(results, null, 2)}`
      });
```

## Best Practices

### Baseline Creation

1. Run benchmarks on clean main branch
2. Save results with descriptive names
3. Use as baseline for comparisons

### Regression Detection

1. Run benchmarks after major changes
2. Compare against baseline
3. Investigate >10% regressions
4. File performance issues

### Optimization Tracking

1. Record optimization attempts
2. Before/after measurements
3. Build performance history
4. Identify effective optimizations

## See Also

- [`BROWSER_BENCHMARKS.md`](./BROWSER_BENCHMARKS.md) — Detailed browser documentation
- [`QUICKSTART.md`](./QUICKSTART.md) — Command reference
- [`../ALGORITHMS.md`](../ALGORITHMS.md) — Algorithm descriptions
- [`../BUILD.md`](../BUILD.md) — Build guide

## Performance Baseline

Typical results on modern hardware (Apple M3 Max MacBook Pro):

### Batch Algorithms (10K cases)

| Algorithm          | Time (ms) | Notes                      |
| ------------------ | --------- | -------------------------- |
| DFG                | ~3        | Ultra-fast baseline        |
| Process Skeleton   | ~2.7      | Ultra-fast                 |
| Hill Climbing      | ~135      | Greedy edge pruning        |
| Noise-Filtered DFG | ~135      | Streaming-only, 80/20 rule |
| Heuristic Miner    | ~14       | Balanced quality/speed     |
| Inductive Miner    | ~25       | Recursive sound models     |
| A\*                | ~77       | Informed search            |
| ILP                | ~87       | Optimal ILP                |

### Streaming Algorithms (10K cases)

| Algorithm                    | Time (ms) | vs Batch    | Notes                         |
| ---------------------------- | --------- | ----------- | ----------------------------- |
| Streaming DFG                | ~69       | 23x slower  | Trace storage overhead        |
| Streaming Alpha++            | ~155      | 34x slower  | Complex cut detection         |
| Streaming Hill Climbing      | ~187      | 1.4x slower | Trace-storage greedy pruning  |
| Streaming Noise-Filtered DFG | ~135      | Same        | O(E) memory, no trace storage |
| Streaming Inductive Miner    | ~135      | 5.4x slower | Cut detection on traces       |
| Streaming A\*                | ~155      | 2x slower   | Heuristic-guided on traces    |

**Streaming tradeoffs:**

- **Noise-Filtered DFG** is the 80/20 choice: same speed as batch HC, bounded memory
- **Hill Climbing** trades 1.4x speed for model minimization guarantees
- **Simple streaming (DFG, Alpha++)** pays 20-35x overhead for stream processing

_(Browser benchmarks typically 40-60% slower than Node.js)_

## Contributing

To add new benchmarks:

1. **Node.js:** Add to `ALGORITHM_GROUPS` in `wasm_bench_runner.js`
2. **Browser:** Add to `BENCHMARK_TASKS` in `__tests__/benchmarks/browser.test.ts`
3. **Update:** Document in this README
4. **Test:** Run both `npm run bench` and `npm run bench:browser`
5. **Commit:** Include baseline results

---

**Last Updated:** April 2026
**Benchmark Suite Version:** 1.0
**Status:** Production Ready
