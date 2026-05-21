# AGENT6-001: Create ML Algorithm Benchmarks

**Status:** 🔴 BLOCKER  
**Priority:** P0 — Critical  
**Effort:** 40 hours  
**Complexity:** High  
**Type:** Feature Implementation  

## Summary

Agent 5 promised comprehensive ML algorithm benchmarks (100+ scenarios, algorithm selection guide, baseline establishment) but deliverables were not found. Without benchmarks, there are no performance baselines and regression detection is impossible.

## Problem Statement

Current state:
- ✅ ML algorithms implemented (6 algorithms, 103 unit tests)
- ❌ No criterion benchmarks
- ❌ No `ml_baseline.json` (performance targets)
- ❌ No regression detection system
- ❌ No algorithm selection guide validated against real data

Users/Engineers experience:
- ❌ No way to choose between 6 algorithms (cost/quality trade-offs unknown)
- ❌ Performance regressions slip undetected into releases
- ❌ No SLA possible (response times unknown)
- ❌ Blind optimization (don't know which algorithm is bottleneck)

## Acceptance Criteria

### 1. Criterion Benchmarks
```rust
// wasm4pm/benches/ml_algorithms.rs
// 100+ scenarios covering:
// - All 6 algorithms (classify, cluster, forecast, anomaly, regress, pca)
// - Input sizes: 100, 1K, 10K, 50K rows
// - Parameterization: k ∈ {3,5,10}, depth ∈ {3,5,10}, alpha ∈ {0.1,0.2,0.3}
// - Edge cases: empty, single-element, degenerate data
```

Statistics reported:
- Median latency (ms)
- p25, p75, p99 percentiles
- Throughput (rows/second)
- Memory usage (peak allocation, count)

### 2. Baseline Measurements
```json
// packages/ml/ml_baseline.json
{
  "classify_knn_k3": {
    "n=100": { "median": 2.3, "p99": 4.1, "throughput": 43.5k },
    "n=1k": { "median": 23.1, "p99": 41.2, "throughput": 43.3k },
    "n=10k": { "median": 231, "p99": 412, "throughput": 43.3k }
  },
  "cluster_kmeans_k5": {
    "n=100": { "median": 3.5, "p99": 6.2, "throughput": 28.6k },
    ...
  },
  ...
}
```

Regression threshold: 20% (warn if algorithm is >20% slower than baseline)

### 3. Algorithm Selection Guide
```markdown
# Algorithm Selection Guide

## By Latency
- <10ms: Naive Bayes, Linear Regression, Linear Anomaly
- <100ms: k-NN (k≤5), Decision Tree, k-Means (k≤10)
- <1s: Polynomial Regression, PCA, DBSCAN
- Unlimited: Ensemble methods

## By Data Size
- 100 rows: All algorithms OK
- 1K rows: Avoid DBSCAN (O(n²))
- 10K rows: Use fast algorithms (Naive Bayes, k-NN, k-Means)
- 100K rows: DFG only (use discovery instead)

## By Quality vs. Speed
- Speed (>10K rows/sec): Naive Bayes (accuracy ~75%)
- Balanced (1K rows/sec): k-NN or Decision Tree (accuracy ~85%)
- Quality (<100 rows/sec): PCA or ensemble (accuracy ~95%)
```

### 4. Regression Detection in CI/CD
```bash
# In CI pipeline
$ cargo bench --bench ml_algorithms -- --baseline ml_baseline
# Output:
# ✅ classify_knn_k3: 2.3ms (baseline 2.3ms, 0% change)
# ✅ classify_dt_depth3: 6.4ms (baseline 6.2ms, +3% change)
# ❌ cluster_kmeans_k5: 5.2ms (baseline 3.5ms, +49% REGRESSION!) ← Warn
```

### 5. Performance Report
```markdown
# ML Algorithm Performance Report

## Summary Table
| Algorithm | n=1K | n=10K | Scaling | Quality |
|-----------|------|-------|---------|---------|
| k-NN (k=5) | 23.1ms | 231ms | O(n) | 85% |
| Decision Tree | 6.4ms | 64ms | O(n log n) | 93% |
| k-Means (k=5) | 3.5ms | 35ms | O(n*k) | 80% |
| ...

## Scaling Analysis
- Linear algorithms: k-NN, k-Means (predictable)
- Log-linear: Decision Tree, PCA (efficient)
- Quadratic: DBSCAN (avoid for large datasets)
```

## Definition of Done

- ✅ 100+ benchmark scenarios implemented and passing
- ✅ 4+ input sizes tested (100, 1K, 10K, 50K)
- ✅ `ml_baseline.json` created with 75+ baseline measurements
- ✅ Algorithm selection guide with decision trees
- ✅ Performance report with scaling analysis
- ✅ Regression detection working in CI/CD (20% threshold)
- ✅ Edge cases documented (degenerate behavior, warnings)
- ✅ 10+ regression tests

## Implementation Plan

### Phase 1: Benchmark Suite (16 hours)
1. Create `wasm4pm/benches/ml_algorithms.rs`
2. Generate synthetic datasets (100, 1K, 10K, 50K rows)
3. Implement 100+ benchmark scenarios
4. Use criterion.rs for statistical rigor
5. Run benchmarks and collect results

### Phase 2: Baseline Establishment (8 hours)
1. Generate baseline measurements from benchmarks
2. Create `packages/ml/ml_baseline.json`
3. Document baseline methodology
4. Set 20% regression threshold
5. Validate baseline with repeated runs

### Phase 3: Algorithm Selection Guide (10 hours)
1. Create `docs/ml-algorithm-selection-guide.md`
2. Add decision trees (by latency, data size, quality)
3. Add use case recommendations
4. Add performance numbers from benchmarks
5. Write 5+ examples

### Phase 4: CI/CD Integration (6 hours)
1. Add regression detection to Makefile/GitHub Actions
2. Warn on >20% latency increase
3. Compare against baseline
4. Write 3 CI/CD tests
5. Document regression procedure

## Metrics

- Lines of code: ~2,500
- Files created: 3 (benchmarks.rs, baseline.json, guide.md)
- Files modified: 2 (Cargo.toml, vitest.config.ts)
- Benchmark scenarios: 100+
- Test coverage: 10+ tests

## Dependencies

- `criterion` (existing)
- `@wasm4pm/ml` (existing)
- No new npm dependencies

## Blockers

None identified.

## Related Issues

- AGENT7-001: Prediction benchmarks (similar structure)
- AGENT9-003: Performance baselines (this feeds regression detection)
