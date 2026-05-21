# Set Up CI/CD Benchmark Regression Detection

**Problem:** You want to automatically detect performance regressions in your CI/CD pipeline so that a PR which makes an algorithm significantly slower fails the build or triggers a warning.

## Overview

The strategy has four parts:

1. **Run benchmarks in CI** using the same `npm run bench:ci` command used locally.
2. **Store baseline results** as a GitHub Actions artifact.
3. **Compare PR results against the baseline** and flag regressions.
4. **Post a comment on the PR** with the comparison table.

## Step 1: GitHub Actions Workflow

Create `.github/workflows/benchmarks.yml` in the repository root:

```yaml
name: Benchmarks

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

jobs:
  benchmark:
    runs-on: macos-14 # Apple Silicon runner for M-series parity

    steps:
      - uses: actions/checkout@v4

      - name: Install Rust
        uses: dtolnay/rust-toolchain@stable
        with:
          targets: wasm32-unknown-unknown

      - name: Install wasm-pack
        run: curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh

      - name: Install Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install dependencies
        working-directory: wasm4pm
        run: npm ci

      - name: Build WASM (Node.js target)
        working-directory: wasm4pm
        run: npm run build:nodejs

      - name: Run Node.js benchmarks (CI mode)
        working-directory: wasm4pm
        run: npm run bench:ci

      - name: Upload benchmark results
        uses: actions/upload-artifact@v4
        with:
          name: benchmark-results-${{ github.sha }}
          path: wasm4pm/results/*.json
          retention-days: 30

      - name: Download main branch baseline
        if: github.event_name == 'pull_request'
        uses: actions/download-artifact@v4
        continue-on-error: true
        with:
          name: benchmark-baseline
          path: wasm4pm/results/baseline/

      - name: Compare against baseline
        if: github.event_name == 'pull_request'
        working-directory: wasm4pm
        run: |
          node -e "
          const fs = require('fs');
          const path = require('path');

          // Find the current run's results
          const resultsDir = 'results';
          const files = fs.readdirSync(resultsDir).filter(f => f.endsWith('.json'));

          // Load current results
          const current = files.map(f => {
            const data = JSON.parse(fs.readFileSync(path.join(resultsDir, f), 'utf-8'));
            return data.results || data;
          }).flat();

          // Load baseline if it exists
          let baseline = [];
          const baselineDir = 'results/baseline';
          try {
            const baselineFiles = fs.readdirSync(baselineDir).filter(f => f.endsWith('.json'));
            baseline = baselineFiles.map(f => {
              const data = JSON.parse(fs.readFileSync(path.join(baselineDir, f), 'utf-8'));
              return data.results || data;
            }).flat();
          } catch (e) {
            console.log('No baseline found. This is the first run.');
            process.exit(0);
          }

          // Compare
          const THRESHOLD = 0.10; // 10% regression threshold
          const regressions = [];

          const currentMap = new Map();
          for (const r of current) {
            currentMap.set(r.algorithm + ':' + r.size, r.medianMs);
          }

          const baselineMap = new Map();
          for (const r of baseline) {
            baselineMap.set(r.algorithm + ':' + r.size, r.medianMs);
          }

          for (const [key, currentMs] of currentMap) {
            const baselineMs = baselineMap.get(key);
            if (baselineMs !== undefined) {
              const change = (currentMs - baselineMs) / baselineMs;
              if (change > THRESHOLD) {
                regressions.push({
                  algorithm: key.split(':')[0],
                  size: key.split(':')[1],
                  baselineMs: baselineMs.toFixed(2),
                  currentMs: currentMs.toFixed(2),
                  change: (change * 100).toFixed(1) + '%'
                });
              }
            }
          }

          // Write report
          const reportPath = 'results/regression-report.json';
          fs.writeFileSync(reportPath, JSON.stringify({
            threshold: THRESHOLD,
            regressions,
            totalComparisons: currentMap.size
          }, null, 2));

          if (regressions.length > 0) {
            console.log('REGRESSIONS DETECTED:');
            regressions.forEach(r => {
              console.log('  ' + r.algorithm + ' [' + r.size + ' cases]: ' +
                r.baselineMs + 'ms -> ' + r.currentMs + 'ms (+' + r.change + ')');
            });
            process.exit(1);
          } else {
            console.log('No regressions detected. All algorithms within ' + (THRESHOLD * 100) + '% threshold.');
          }
          "

      - name: Post PR comment
        if: github.event_name == 'pull_request' && always()
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const reportPath = 'wasm4pm/results/regression-report.json';

            let body = '## Benchmark Results\n\n';

            try {
              const report = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));

              if (report.regressions.length > 0) {
                body += '**Regressions detected** (threshold: 10%)\n\n';
                body += '| Algorithm | Cases | Baseline (ms) | Current (ms) | Change |\n';
                body += '|-----------|-------|---------------|--------------|--------|\n';
                for (const r of report.regressions) {
                  body += '| ' + r.algorithm + ' | ' + r.size + ' | ' +
                    r.baselineMs + ' | ' + r.currentMs + ' | +' + r.change + ' |\n';
                }
                body += '\nPlease investigate before merging.';
              } else {
                body += 'No performance regressions detected. All algorithms within 10% of baseline.';
              }
            } catch (e) {
              body += 'Benchmark results not available.';
            }

            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: body
            });

      - name: Save baseline (main branch only)
        if: github.ref == 'refs/heads/main' && github.event_name == 'push'
        working-directory: wasm4pm
        run: |
          mkdir -p results/baseline
          cp results/*.json results/baseline/ 2>/dev/null || true

      - name: Upload baseline artifact
        if: github.ref == 'refs/heads/main' && github.event_name == 'push'
        uses: actions/upload-artifact@v4
        with:
          name: benchmark-baseline
          path: wasm4pm/results/baseline/*.json
          retention-days: 90
```

## Step 2: Understanding the Threshold

The default threshold is **10% regression**. This means:

- An algorithm that was 3.0ms and is now 3.4ms (+13%) triggers a failure.
- An algorithm that was 135ms and is now 145ms (+7.4%) passes.

Choose your threshold based on algorithm category:

| Category          | Suggested Threshold | Rationale                            |
| ----------------- | ------------------- | ------------------------------------ |
| Ultra-fast (<5ms) | 20%                 | Small absolute variance, noise-prone |
| Fast (5-50ms)     | 15%                 | Moderate stability                   |
| Medium (50-200ms) | 10%                 | Stable enough for tight threshold    |
| Slow (>200ms)     | 10%                 | Larger absolute values, meaningful % |

To customize the threshold, edit the `THRESHOLD` variable in the comparison script (step 3 of the workflow).

## Step 3: Handling CI Variance

CI runners have more noise than local machines due to shared resources. To reduce false positives:

1. **Use CI mode**: `npm run bench:ci` runs 3 iterations instead of 7. More iterations reduce variance but take longer. Adjust in `benchmarks/wasm_bench_worker.js` if needed.

2. **Use a dedicated runner**: Self-hosted macOS runners on Apple Silicon provide more consistent results than shared GitHub-hosted runners.

3. **Require two consecutive failures**: Instead of failing on a single regression, track results across the last N runs and only fail if the regression appears in 2+ consecutive runs.

4. **Exclude known-noisy algorithms**: Some metaheuristics (genetic, PSO, ant colony) have inherent randomness. Either seed the RNG or use a wider threshold for those algorithms.

## Step 4: Browser Benchmarks in CI

Add browser benchmarks alongside Node.js benchmarks:

```yaml
- name: Build WASM (web target)
  working-directory: wasm4pm
  run: npm run build:web

- name: Install Playwright
  working-directory: wasm4pm
  run: npx playwright install --with-deps

- name: Run browser benchmarks (CI mode)
  working-directory: wasm4pm
  run: npm run bench:browser:ci
```

Browser benchmarks are typically 40-60% slower than Node.js, so use separate thresholds for each environment.

## Step 5: Tracking Over Time

To build a performance history graph:

1. Upload results as artifacts with descriptive names (date + commit SHA).
2. Download artifacts from recent runs in a nightly job.
3. Plot median times per algorithm over time using a script or external dashboard (e.g., GitHub Actions metrics, Grafana, or a simple HTML page).

## Common Issues

### "Playwright not installed" in CI

```yaml
- name: Install Playwright browsers
  run: npx playwright install --with-deps chromium
```

### Benchmarks timeout on slow runners

Increase the timeout in `vitest.config.ts`:

```typescript
testTimeout: 120000; // 120 seconds for CI
```

### Baseline artifact not found on first PR

The workflow handles this gracefully with `continue-on-error: true` on the baseline download step. The first PR will establish the baseline; subsequent PRs will compare against it.

## See Also

- [Profile a Slow Algorithm](./profile-slow-algorithm.md) -- investigating a specific regression
- [Run Browser Benchmarks](./browser-benchmarks.md) -- browser-specific CI setup
- [benchmarks/README.md](../../../benchmarks/README.md) -- benchmark suite documentation
