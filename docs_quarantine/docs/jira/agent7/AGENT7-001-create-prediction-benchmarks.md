# AGENT7-001: Create Prediction Task Benchmarks

**Status:** 🔴 BLOCKER  
**Priority:** P0 — Critical  
**Effort:** 35 hours  
**Complexity:** High  
**Type:** Feature Implementation  

## Summary

Agent 7 promised comprehensive benchmarks for all 6 prediction perspectives but deliverables were not found. Without benchmarks, users cannot judge prediction accuracy or latency, making the feature unreliable for production.

## Problem Statement

Current state:
- ✅ Prediction system implemented (6 perspectives, 27 unit tests)
- ❌ No accuracy benchmarks
- ❌ No latency measurements
- ❌ No real-world validation (BPI2020, etc.)
- ❌ No confidence intervals

Users experience:
- ❌ Cannot determine prediction accuracy (will it help or mislead?)
- ❌ Unknown response times (SLA impossible)
- ❌ No best/worst case scenarios documented
- ❌ Blind predictions (tuning parameters unknown)

## Acceptance Criteria

### 1. Accuracy Benchmarks (All 6 Perspectives)

**Next-Activity Perspective:**
- Top-1, Top-5, Top-10 accuracy
- Beam search quality
- Entropy and confidence metrics
- Expected: 70-85% top-1 accuracy on real logs

**Remaining-Time Perspective:**
- MAE (mean absolute error): expected <500ms
- RMSE, MAPE for error distribution
- Bias analysis (early vs. late estimates)
- Expected: ±500ms MAE on moderate-complexity processes

**Outcome Perspective:**
- Classification accuracy per outcome class
- F1 score, precision, recall
- Confusion matrix
- Expected: 75-90% accuracy on binary outcomes

**Drift Perspective:**
- Detection precision and recall
- Per-anomaly-type sensitivity
- ROC-AUC score
- Expected: 90%+ recall, <5% false positive rate

**Features Perspective:**
- Explained variance ratio
- Feature importance ranking
- Entropy of predictions
- Expected: 70%+ variance explained

**Resource Perspective:**
- Queue time estimation accuracy
- Throughput prediction accuracy
- Intervention ranking quality
- Expected: ±300ms MAE for queue time

### 2. Latency Benchmarks
```typescript
// Per-perspective latency measurements
{
  "next-activity": {
    "p50": 0.45,  // milliseconds
    "p95": 0.68,
    "p99": 1.2,
    "throughput": "2200 predictions/sec"
  },
  ...
}
```

Measure:
- Model building time
- Prefix extraction time
- Inference time
- Serialization time
- Total end-to-end time

### 3. Real-World Validation
Test on realistic event logs:
- **BPI2020 Travel Request**: 10.5K cases, 350K events
- **BPI2020 Domestic Declaration**: 6.5K cases, 600K events
- **Custom Synthetic Process**: Configurable complexity

Metrics per log:
- Accuracy on first 50%, evaluate on last 50%
- Train/test split validation
- Accuracy vs. trace length (how much history needed?)

### 4. Confidence Intervals
Bootstrap confidence (95%):
- Run 1,000 prediction tasks
- Calculate p2.5 and p97.5
- Report as: "Top-1 accuracy: 78% [±3.2%]"

### 5. Tuning Guide
Document how parameters affect accuracy/latency:
- N-gram order (1, 2, 3, 4): latency vs. accuracy
- Beam width (1, 3, 5, 10): throughput vs. quality
- EWMA alpha (0.1, 0.2, 0.3, 0.5): smoothing vs. responsiveness

## Definition of Done

- ✅ Accuracy benchmarks for all 6 perspectives
- ✅ Real-world validation on BPI2020 data
- ✅ Latency profiles (p50/p95/p99)
- ✅ Confidence intervals (95%)
- ✅ Tuning guide with parameter effects
- ✅ Best/worst case scenarios documented
- ✅ Benchmark code compiles and runs (vitest)
- ✅ 30+ test cases per perspective

## Implementation Plan

### Phase 1: Accuracy Benchmarks (14 hours)
1. Create `wasm4pm/benches/prediction_accuracy.rs`
2. Implement accuracy metrics for 6 perspectives
3. Load BPI2020 and synthetic datasets
4. Calculate accuracy, F1, MAE, RMSE, MAPE
5. Generate confidence intervals
6. Write report

### Phase 2: Latency Benchmarks (10 hours)
1. Create `wasm4pm/benches/prediction_latency.rs`
2. Measure per-component latency (model building, inference, serialization)
3. Test across input sizes (10, 100, 1K, 10K events)
4. Calculate throughput (predictions/second)
5. Generate latency profiles

### Phase 3: Tuning Guide (8 hours)
1. Create `docs/prediction-tuning-guide.md`
2. Test parameter variations (n-gram, beam width, alpha)
3. Document trade-offs (latency vs. accuracy)
4. Add decision tree: "Choose parameter based on..."
5. Add real-world examples

### Phase 4: Report (3 hours)
1. Create `docs/prediction-benchmarks.md`
2. Summarize all findings
3. Include tables, graphs (ASCII art), recommendations
4. Document methodology and assumptions

## Metrics

- Lines of code: ~2,200
- Files created: 4 (accuracy.rs, latency.rs, guide.md, benchmarks.md)
- Files modified: 1 (Cargo.toml)
- Benchmark scenarios: 50+
- Test coverage: 30+ tests

## Dependencies

- `criterion` (existing)
- `@wasm4pm/kernel` (prediction system)
- BPI2020 dataset (public, ~100MB)
- No new npm dependencies

## Blockers

None identified.

## Related Issues

- AGENT6-001: ML benchmarks (similar structure)
- AGENT9-003: Performance baselines (this feeds regression detection)
