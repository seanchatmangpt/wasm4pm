# ML Quality Audit — wasm4pm (2026-05-18)

**Executed:** 2026-05-18
**Target:** 5 ML quality checks across wasm4pm
**Status:** 1/5 integrated, 4 gaps found, hard quality gates NOT enforced

## Executive Summary

This audit evaluated:
1. **Feature quality assessment** — Integrated (soft gate, partial coverage)
2. **Algorithm selection** — Complete but DEAD CODE (never called)
3. **Cross-validation** — NOT IMPLEMENTED
4. **Feature normalization** — BROKEN (1/5 features unscaled)
5. **Quality gate enforcement** — SOFT ONLY (no hard exit codes)

**Result:** Hard quality gates do NOT block admission. Overfitting not detected. Feature distributions unscaled in AutoML.

## Key Findings

### CHECK 1: Feature Quality ✓ INTEGRATED (80%)

**Module:** `packages/ml/src/feature-quality.ts` (175 lines, 7 tests)
- Detects zero-variance features (threshold < 1e-10)
- Detects high correlation (Pearson r > 0.95)
- Detects missing values (>20% rows)
- Returns 0-1 score with actionable recommendations

**Integration:** ml-runner.ts line 129-135 (classify task only)
- Called in `classify` task
- Missing from: cluster, regress, pca, forecast, anomaly
- **SOFT GATE:** console.warn() only, execution continues

**Gap:** No hard exit code; classification gate is soft warning only.

### CHECK 2: Algorithm Selection ✗ DEAD CODE (50%)

**Module:** `packages/ml/src/parameter-suggestions.ts` (191 lines, 13 tests)
- `suggestParameters()` analyzes data characteristics, recommends algorithms
- `pickBestAlgorithm()` selects best method
- Exported from index.ts line 32

**Integration:** ZERO callers in ml-runner.ts or CLI code
- ml-runner.ts lines 74-85 use hardcoded defaults instead:
  - classify → knn (always)
  - cluster → kmeans (always)
  - regress → linear (always)
- Data characteristics ignored; algorithm selection never runs

**Gap:** 191 lines of tested code never used; hardcoded defaults override.

### CHECK 3: Cross-Validation ✗ NOT IMPLEMENTED (0%)

**Scope:** classifiers.ts, clustering.ts, reduction.ts
- No k-fold cross-validation
- No stratified sampling
- No holdout set
- No grid search

**Impact:** Reported accuracy/confidence is optimistic (train/test on same data)
- k-NN trains and evaluates against all points (line 147-213)
- classifiers.test.ts verifies accuracy >= 0.8, but on training set

**Gap:** Zero CV tests; overfitting risk unmeasured.

### CHECK 4: Feature Normalization ✗ MIXED (20%)

**File:** `wasm4pm/src/automl_envelope.rs`, extract_motion_features() (lines 90-195)

Features extracted for AutoML classifier:
1. prefix_length_ratio = trace_len / max_len — **[0,1]** ✓
2. unique_activity_ratio = |unique| / vocab_size — **[0,1]** ✓
3. has_rework = {0 or 1} — **{0,1}** ✓
4. **event_density = trace_len / (duration_ms / 3_600_000 + 1)** — **[0,∞)** ✗
5. variant_frequency = count / n — **[0,1]** ✓

**Problem (line 166):**
```rust
let event_density = trace_len as f64 / (duration_ms / 3_600_000.0 + 1.0);
```

Examples:
- Dense (1000 events, 1 hour): ~0.3
- Sparse (10 events, 1 day): ~0.0001
- Outlier (10K events, 1 hour): ~3+

**Impact:** In Euclidean distance, event_density dominates: (10-0)² = 100 >> (1-0)² = 1
k-means centroid updates weight it 100-1000x more than binary features.

**Gap:** 1/5 features unscaled; zero tests for feature normalization.

### CHECK 5: Quality Gate Enforcement ✗ SOFT ONLY (20%)

**Location:** ml-runner.ts lines 130-135

Current code (soft):
```typescript
if (quality.score < 0.7) {
  console.warn(`[Warning] Feature quality score is ${quality.score}...`);
}
classifyTraces(...);  // continues despite poor quality
```

**Behavior:**
- ✓ console.warn() written to stderr
- ✗ No error code (exit 0, not 1)
- ✗ No receipt rejection
- ✗ No JSON output (only console)

**Coverage:** 1/6 tasks
- classify: ✓ soft gate
- cluster, regress, pca, forecast, anomaly: ✗ no gate

**Gap:** Soft gate in 1/6 tasks; no hard exit code; zero test coverage.

## Metrics Summary

| Check | Implemented | Tested | Hard Gate | Coverage | Status |
|-------|-------------|--------|-----------|----------|--------|
| 1. Quality | ✓ (175L) | ✓ (7) | ✗ soft | 1/6 | 80% |
| 2. Selection | ✓ (191L) | ✓ (13) | — | 0/6 | 50% |
| 3. CV | ✗ (0L) | ✗ (0) | — | 0/6 | 0% |
| 4. Normalize | ⚠ (4/5) | ✗ (0) | — | 1/5 | 20% |
| 5. Gates | ⚠ soft | ✗ (0) | ✗ | 1/6 | 20% |

**Overall:** 1/5 hard gates, 4 gaps, 20 unit tests, 0 integration tests.

## Remediation Roadmap

### Priority 1: Hard Quality Gates (2 hours)
Replace soft warnings with hard exit codes in ml-runner.ts
- 6 tasks × 30 min = 3 hours
- Add 6 integration tests × 10 min = 1 hour

### Priority 2: Feature Normalization (1.5 hours)
Normalize event_density to [0,1] in automl_envelope.rs
- 1 hour implementation
- 0.5 hour tests

### Priority 3: Cross-Validation (4-6 hours)
Implement 3-fold CV in classifiers.ts
- New export: kFoldCrossValidation()
- Update k-NN, decision tree, naive Bayes for CV indices
- Add --cv flag to ml task

### Priority 4: Algorithm Selection (1 hour)
Call pickBestAlgorithm() when method undefined
- 1 line integration in ml-runner.ts
- 3 tests

**Total Effort (Priority 1-2):** 3.5 hours
**Total Effort (all priorities):** 8.5-10 hours

## Files to Modify

**Priority 1 (Hard Gates):**
- apps/wasm4pm/src/ml-runner.ts (6 gates, 30 min each)
- apps/wasm4pm/src/__tests__/ml.test.ts (6 tests)

**Priority 2 (Feature Normalization):**
- wasm4pm/src/automl_envelope.rs (line 166)
- wasm4pm/tests/automl_envelope_tests.rs

**Priority 3 (Cross-Validation):**
- packages/ml/src/classifiers.ts (new kFoldCrossValidation export)
- packages/ml/src/__tests__/cv.test.ts

**Priority 4 (Algorithm Selection):**
- apps/wasm4pm/src/ml-runner.ts (line 76)
- apps/wasm4pm/src/__tests__/ml.test.ts

---

**Report Generated:** 2026-05-18
**Auditor:** Claude Code agent
**Scope:** wasm4pm ML quality (5 checks)
**Status:** Gaps identified, roadmap defined, effort estimated
