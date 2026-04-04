# Browser-Based WASM Performance Benchmarking

Browser performance testing for WASM4PM algorithms using headless Chromium and Vitest.

## Overview

The browser benchmark suite tests WASM4PM in real browser environments, providing insights into:

- **Real-world browser performance** — Actual JavaScript engine optimization patterns
- **Environment differences** — Node.js vs browser WASM execution
- **Web target validation** — Ensures browser-optimized builds perform correctly
- **Scalability analysis** — Algorithm performance across various log sizes
- **Regression detection** — Identify performance drops between versions

## Quick Start

### Run Full Browser Benchmarks

```bash
cd wasm4pm
npm run bench:browser
```

**Time:** 5-10 minutes depending on hardware and iteration count.

### Run CI Mode (Fast)

```bash
npm run bench:browser:ci
```

**Time:** ~3-5 minutes with reduced iterations.

### View Results

After benchmarks complete, open the interactive dashboard:

```bash
open benchmarks/dashboard.html
```

Upload the JSON result files to visualize:
- Performance by algorithm
- Scalability trends
- Detailed results table
- Export capabilities

## Benchmark Coverage

### Algorithms Tested

**Fast Algorithms** (3-50ms per run):
- DFG (Directly-Follows Graph)
- Declare pattern mining
- Heuristic Miner
- Alpha++ algorithm
- Inductive Miner
- Hill Climbing
- Event Statistics
- Trace Variants

**Medium Algorithms** (10-200ms per run):
- A* search
- Simulated Annealing
- Ant Colony Optimization

**Analytics** (1-100ms per run):
- Variant Complexity
- Activity Transition Matrix
- Rework Detection

### Log Sizes Tested

- **100 cases** — Small log, all algorithms
- **500 cases** — Medium log, medium algorithms
- **1000 cases** — Large log, all algorithms
- **5000 cases** — Very large log, fast algorithms only

## Node.js vs Browser Comparison

### Run Both Suites

```bash
# Terminal 1: Node.js benchmarks
npm run bench

# Terminal 2: Browser benchmarks
npm run bench:browser
```

### Compare Results

```bash
node benchmarks/compare.js \
  results/nodejs_bench_*.json \
  results/browser_bench_*.json
```

**Output includes:**
- Side-by-side timing comparison
- Speedup ratios (Node.js speed / Browser speed)
- Performance distribution analysis
- Overall performance impression

**Example output:**
```
Algorithm                Size  Node ms  Browser ms  Speedup  Status
────────────────────────────────────────────────────────────────
discover_dfg            100    2.34      8.30      0.28x    Browser slower
discover_heuristic_miner 5000   31.24     65.30      0.48x    Browser slower
analyze_event_statistics 1000   2.15      8.92      0.24x    Browser slower

Average speedup: 0.42x (Browser is ~2.4x slower)
```

## Output Files

Benchmarks generate results in `results/` directory:

```
results/
├── browser_bench_2024-01-15T10-30-45-123Z.json
├── browser_bench_2024-01-15T10-30-45-123Z.csv
├── nodejs_bench_2024-01-15T10-30-45-123Z.json
└── nodejs_bench_2024-01-15T10-30-45-123Z.csv
```

### JSON Format

```json
{
  "timestamp": "2024-01-15T10:30:45.123Z",
  "environment": "browser",
  "results": [
    {
      "algorithm": "discover_dfg",
      "size": 100,
      "medianMs": 8.34,
      "minMs": 8.15,
      "maxMs": 9.21,
      "p95Ms": 9.18,
      "iterations": 5
    }
  ]
}
```

### CSV Format

```
algorithm,size,median_ms,min_ms,max_ms,p95_ms,iterations
discover_dfg,100,8.340,8.150,9.210,9.180,5
```

## Dashboard Features

The interactive benchmark dashboard (`benchmarks/dashboard.html`) provides:

### Visualization
- **Bar charts** — Compare median times across algorithms
- **Line graphs** — Show scalability trends (time vs log size)
- **Statistics cards** — Average time, fastest, slowest runs

### Analysis
- **Upload results** — Load JSON benchmark files
- **Detailed table** — Sortable results with all metrics
- **Export** — Save results as JSON for archival

### Controls
- Load sample data for quick demo
- Load custom benchmark results
- Compare different benchmark runs
- Export analysis results

## Performance Expectations

Typical browser performance on modern hardware:

| Algorithm | 100 cases | 500 cases | 1000 cases | 5000 cases |
|-----------|-----------|-----------|-----------|-----------|
| DFG | 8-10ms | 35-45ms | 80-100ms | 400-500ms |
| Heuristic Miner | 12-15ms | 60-80ms | 120-180ms | 600-900ms |
| Alpha++ | 6-8ms | 30-40ms | 60-80ms | 300-400ms |
| A* | 20-30ms | 100-150ms | 200-350ms | — |
| Event Stats | 1-2ms | 5-8ms | 10-15ms | 40-60ms |

**Note:** Browser times are typically 2-3x slower than Node.js due to V8's JIT optimization and WebAssembly memory model differences.

## Integration with CI/CD

### GitHub Actions Example

```yaml
name: Benchmarks
on: [push, pull_request]

jobs:
  benchmark:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - uses: actions/setup-node@v3
        with:
          node-version: 18
      
      - name: Install dependencies
        run: |
          cd wasm4pm
          npm install
          npx playwright install --with-deps
      
      - name: Run Node.js benchmarks
        run: cd wasm4pm && npm run bench:ci
      
      - name: Run browser benchmarks
        run: cd wasm4pm && npm run bench:browser:ci
      
      - name: Store results
        uses: actions/upload-artifact@v3
        with:
          name: benchmark-results
          path: wasm4pm/results/
      
      - name: Compare performance
        run: |
          cd wasm4pm
          node benchmarks/compare.js \
            results/nodejs_bench_*.json \
            results/browser_bench_*.json \
            | tee /tmp/comparison.txt
      
      - name: Comment on PR
        if: github.event_name == 'pull_request'
        uses: actions/github-script@v6
        with:
          script: |
            const fs = require('fs');
            const comparison = fs.readFileSync('/tmp/comparison.txt', 'utf-8');
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: `📊 Benchmark Comparison\n\n\`\`\`\n${comparison}\n\`\`\``
            });
```

## Troubleshooting

### Playwright Not Installed

```bash
npx playwright install
npx playwright install --with-deps  # Include system dependencies
```

### WASM Module Not Found

```bash
npm run build:web
```

### Timeout Issues

Increase timeout in `vitest.config.ts`:

```typescript
test: {
  testTimeout: 60000  // 60 seconds
}
```

### Browser Won't Launch

```bash
# Verify Chromium installation
npx playwright install chromium

# Check for system dependency issues
npx playwright install --with-deps
```

## Customization

### Add New Benchmarks

Edit `__tests__/benchmarks/browser.test.ts`:

```typescript
const BENCHMARK_TASKS: BenchmarkTask[] = [
  {
    algorithm: 'discover_dfg',
    sizes: [100, 1000, 5000],
    params: {}
  },
  // Add new algorithm here...
  {
    algorithm: 'your_new_algorithm',
    sizes: [100, 500, 1000],
    params: {}
  }
];
```

### Change Iteration Count

```typescript
const ITERATIONS = globalThis.CI_MODE ? 3 : 5;  // Change from 5 to 10
```

### Adjust Log Generation

Modify `generateXES()` function parameters:

```typescript
function generateXES(
  numCases: number,
  numActivities: number = 12,  // Change number of activities
  avgEvents: number = 15,       // Change average events per case
  noiseFactor: number = 0.1     // Change noise level
): string
```

## Related Documentation

- **[DEPLOYMENT.md](./DEPLOYMENT.md)** — Full deployment guide including benchmarking
- **[BENCHMARK-TIERS-USAGE.md](./BENCHMARK-TIERS-USAGE.md)** — Real data benchmarking
- **[BENCHMARK-RESULTS-INTERPRETATION.md](./BENCHMARK-RESULTS-INTERPRETATION.md)** — Understanding results
- **[wasm4pm/benchmarks/README.md](../wasm4pm/benchmarks/README.md)** — Complete benchmark guide
- **[wasm4pm/benchmarks/QUICKSTART.md](../wasm4pm/benchmarks/QUICKSTART.md)** — Command reference

## Best Practices

### Reliable Results
1. Run multiple times (3+ runs)
2. Close other applications
3. Use consistent hardware
4. Average the results
5. Compare medians (robust to outliers)

### Performance Tracking
1. Create baseline on clean version
2. Run after each major change
3. Archive results with timestamps
4. Track regressions (>10% slower)
5. Celebrate optimizations

### Regression Detection
1. Compare new results vs baseline
2. Identify algorithms with performance drops
3. Investigate root causes
4. Profile with DevTools if needed
5. Implement targeted optimizations

---

**Last Updated:** April 2026  
**Version:** 1.0  
**Status:** Production Ready
