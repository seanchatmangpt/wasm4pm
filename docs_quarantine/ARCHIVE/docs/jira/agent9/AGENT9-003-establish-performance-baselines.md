# AGENT9-003: Establish Performance Baselines and Regression Detection

**Status:** 🟡 READY  
**Priority:** P0 — Critical (regression prevention)  
**Effort:** 5 hours  
**Complexity:** Low  
**Type:** CI/CD Integration  

## Summary

AGENT6 and AGENT7 created comprehensive benchmarks (100+ scenarios for ML, 50+ for prediction) but regression detection is not wired into CI/CD. Performance improvements from benchmarks cannot be validated; regressions slip undetected.

## Problem Statement

Current state:
- ✅ Benchmarks exist: `wasm4pm/benches/ml_algorithms.rs` (AGENT6), `wasm4pm/benches/prediction_accuracy.rs` (AGENT7)
- ✅ Baseline measurements collected manually
- ❌ No baseline storage (no `ml_baseline.json` or `prediction_baseline.json`)
- ❌ No CI/CD regression check
- ❌ No warning on >20% latency increase
- ❌ No pass/fail gate for merges

Impact:
- ❌ Performance regressions slide into releases undetected
- ❌ Users see silent slowdowns (p50 latency increases, nobody notices)
- ❌ No SLA possible — response times unknown
- ❌ Cannot prioritize optimization work (don't know what's slow)

## Acceptance Criteria

### 1. Baseline Files

Create two baseline files from benchmark results:

**`packages/ml/ml_baseline.json`** (from AGENT6 benchmarks):
```json
{
  "benchmark_date": "2026-05-05",
  "regression_threshold_percent": 20,
  "baselines": {
    "classify_knn_k3": {
      "n=100": { "median_ms": 2.3, "p99_ms": 4.1, "throughput_rows_sec": 43500 },
      "n=1k": { "median_ms": 23.1, "p99_ms": 41.2, "throughput_rows_sec": 43300 },
      "n=10k": { "median_ms": 231, "p99_ms": 412, "throughput_rows_sec": 43300 }
    },
    "cluster_kmeans_k5": { ... },
    "forecast_linear": { ... }
  }
}
```

**`wasm4pm/prediction_baseline.json`** (from AGENT7 benchmarks):
```json
{
  "benchmark_date": "2026-05-05",
  "regression_threshold_percent": 20,
  "baselines": {
    "next_activity_beam5": {
      "accuracy_top1": 0.78,
      "accuracy_top5": 0.92,
      "p50_latency_ms": 0.45,
      "p99_latency_ms": 1.2,
      "throughput_predictions_sec": 2200
    },
    "remaining_time_weibull": { ... },
    "drift_ewma": { ... }
  }
}
```

### 2. CI/CD Regression Check

Add to `.github/workflows/bench-regression.yml`:

```yaml
name: Benchmark Regression Detection

on:
  pull_request:
    paths:
      - 'packages/ml/**'
      - 'wasm4pm/benches/ml_algorithms.rs'
      - 'packages/ml/ml_baseline.json'

jobs:
  bench-ml:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions-rs/toolchain@v1
        with:
          toolchain: stable

      - name: Run ML benchmarks
        run: |
          cd wasm4pm
          cargo bench --bench ml_algorithms -- --output-format bencher | tee output.txt

      - name: Check regressions
        run: |
          node scripts/check-regression.js \
            --baseline packages/ml/ml_baseline.json \
            --current output.txt \
            --threshold 20 \
            --exit-on-regression

      - name: Comment on PR if regressions found
        if: failure()
        uses: actions/github-script@v6
        with:
          script: |
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: '⚠️ Performance regression detected in ML benchmarks. See job logs.'
            })
```

### 3. Regression Script

Create `scripts/check-regression.js`:

```javascript
#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {};
  for (let i = 0; i < args.length; i += 2) {
    opts[args[i].replace('--', '')] = args[i + 1];
  }
  return opts;
}

function checkRegressions(baselineFile, currentFile, threshold) {
  const baseline = JSON.parse(fs.readFileSync(baselineFile, 'utf8'));
  const current = parseCurrentBenchmarks(currentFile);  // Parse criterion/vitest output
  
  let hasRegression = false;
  const report = [];
  
  for (const [algo, metrics] of Object.entries(current)) {
    const base = baseline.baselines[algo];
    if (!base) {
      report.push(`⚠️  ${algo}: New algorithm, no baseline`);
      continue;
    }
    
    const baseMedian = base.n_1k?.median_ms || base.median_ms;
    const currMedian = metrics.median_ms;
    const change = ((currMedian - baseMedian) / baseMedian) * 100;
    
    if (Math.abs(change) > threshold) {
      hasRegression = true;
      report.push(`❌ ${algo}: ${change > 0 ? '+' : ''}${change.toFixed(1)}% regression (baseline ${baseMedian.toFixed(2)}ms → current ${currMedian.toFixed(2)}ms)`);
    } else {
      report.push(`✅ ${algo}: ${change > 0 ? '+' : ''}${change.toFixed(1)}% change (OK)`);
    }
  }
  
  console.log(report.join('\n'));
  return !hasRegression;
}

const opts = parseArgs();
const ok = checkRegressions(opts.baseline, opts.current, parseInt(opts.threshold));
if (!ok && opts['exit-on-regression']) {
  process.exit(1);
}
```

### 4. Local Baseline Update

Add npm script to `wasm4pm/package.json`:

```json
"scripts": {
  "bench:ml": "cargo bench --bench ml_algorithms -- --output-format bencher | tee /tmp/ml_bench.txt",
  "bench:predict": "cargo bench --bench prediction_accuracy -- --output-format bencher | tee /tmp/pred_bench.txt",
  "baseline:update": "node scripts/update-baseline.js"
}
```

### 5. Test Cases

```typescript
// wasm4pm/tests/regression_detection_test.rs
#[test]
fn test_regression_detection_catches_20_percent_slowdown() {
  let baseline = load_baseline("ml_baseline.json");
  let degraded = { ...baseline, median_ms: baseline.median_ms * 1.2 };
  assert!(check_regression(baseline, degraded, 20)); // Catches regression
}

#[test]
fn test_regression_detection_allows_5_percent_variance() {
  let baseline = load_baseline("ml_baseline.json");
  let variance = { ...baseline, median_ms: baseline.median_ms * 1.05 };
  assert!(!check_regression(baseline, variance, 20)); // No false positive
}
```

## Definition of Done

- ✅ `ml_baseline.json` created with 75+ baseline measurements
- ✅ `prediction_baseline.json` created with 50+ baseline measurements
- ✅ CI/CD regression check wired (`.github/workflows/bench-regression.yml`)
- ✅ Regression detection script (`scripts/check-regression.js`)
- ✅ 20% threshold correctly applied
- ✅ Warnings posted to PR comments on regression
- ✅ 5+ regression detection tests
- ✅ Local baseline update workflow documented

## Implementation Plan

### Phase 1: Baselines (2 hours)
1. Run AGENT6 & AGENT7 benchmarks locally
2. Parse criterion/vitest output
3. Create `ml_baseline.json` and `prediction_baseline.json`
4. Commit to repo

### Phase 2: CI/CD Integration (2 hours)
1. Create `.github/workflows/bench-regression.yml`
2. Create `scripts/check-regression.js`
3. Add npm scripts to `wasm4pm/package.json`
4. Test locally with simulated regressions

### Phase 3: Testing & Documentation (1 hour)
1. Write 5 regression detection tests
2. Document how to update baselines
3. Add to CONTRIBUTING.md

## Metrics

- Lines of code: ~400
- Files created: 3 (ml_baseline.json, prediction_baseline.json, check-regression.js)
- Files modified: 2 (Cargo.toml, package.json, workflows)
- Test coverage: 5+ tests
- CI/CD gating: 100% of algorithm changes

## Dependencies

- AGENT6-001: ML benchmarks (must exist)
- AGENT7-001: Prediction benchmarks (must exist)
- GitHub Actions (already in use)

## Blockers

None. Benchmarks already exist; this is pure integration.

## Related Issues

- AGENT6-001: Creates benchmark data
- AGENT7-001: Creates benchmark data
- AGENT9-001: E2E tests may reference baselines
