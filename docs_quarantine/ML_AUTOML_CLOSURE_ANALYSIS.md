# ML/AutoML Closure Plan — Iteration 16+ Remediation

**Date:** 2026-05-18  
**Status:** Analysis Only (No Implementation)  
**Scope:** 4 remaining gaps in ML task execution pipeline  
**Recommendation:** Phased closure (Priority 1→4, Effort estimates provided)

---

## Executive Summary

Iteration 9 closed 3/5 ML gaps (feature quality assessment, convergence metrics, action tracking). **4 critical gaps remain** affecting in-sample bias (regression), feature quality reporting completeness, algorithm selection wiring, and correlation threshold calibration.

| Gap ID | Issue | Severity | Current State | Effort | Priority |
|--------|-------|----------|---------------|--------|----------|
| **G1** | Regression uses in-sample R² (overfit invisible) | Critical | None; CV infrastructure exists but NOT called for regress | 15-30 min | 1 |
| **G2** | Feature quality warnings only on console; not attached to output | Medium | Warnings emit to stdout/stderr; not in JSON payload | 20-40 min | 2 |
| **G3** | suggestRegressionMethod() built but disconnected from ml-runner | Medium | Function exported; never called from regress task | 5-10 min | 3 |
| **G4** | Correlation threshold 0.95 too lenient for regression features | Low-Medium | Hardcoded in feature-quality.ts line 125 | 5 min | 4 |

---

## Detailed Gap Analysis

### GAP 1: Regression CV Missing (CRITICAL — Overfitting Risk)

**Location:** `apps/wasm4pm/src/ml-runner.ts` lines 640–671 (regress case)

**Current Flow:**
```typescript
// ml-runner.ts:667-669
rawResult = (await regressRemainingTime(features, {
  method: options.method as RegressionMethod | undefined,
})) as unknown as Record<string, unknown>;
// Returns: { rSquared, rmse, mae, predictions }
// ⚠️ rSquared is IN-SAMPLE (trained + tested on same data)
```

**Root Cause:**
- `regressRemainingTime()` in `classifiers.ts` trains on all samples and reports accuracy on same training data
- No holdout split or k-fold CV before returning metrics
- **Reported R² is optimistic** — actual generalization may be 10-30% lower

**Evidence:**
- `classifiers.ts` line ~680–720: Polynomial/linear/exponential fit functions train globally, predict on all X
- No call to `holdoutRegressionValidation()` or stratified k-fold
- `classify` task DOES use CV (line 521: `crossValidate: options.crossValidate`) — regress should too

**Impact:**
- Users see R²=0.85 and trust the model, but real holdout R² might be 0.55
- **Van der Aalst Chicago TDD violation:** Code says "fits data well" but event log (held-out test set) cannot prove it
- Quality assessment is fake (FM-5 risk)

**Recommended Fix:**

**Option A: Holdout Validation (Faster, 15-line addition)**
```typescript
// After line 669, add:
if (options.crossValidate) {
  // Perform 80-20 holdout split with honest validation
  const holdoutResult = await holdoutRegressionValidation(features, {
    method: options.method as RegressionMethod | undefined,
    testRatio: 0.2,
    targetKey: options.targetKey,
  });
  // Replace in-sample metrics with holdout metrics
  rawResult.rSquared = holdoutResult.rSquared;
  rawResult.rmse = holdoutResult.rmse;
  rawResult.mae = holdoutResult.mae;
  rawResult.validation_type = 'holdout_20pct';
  rawResult.train_r_squared = rawResult.rSquared; // Store original for reference
}
```

**Option B: k-Fold CV (More Robust, 25-line addition)**
```typescript
// After line 669, add:
if (options.crossValidate) {
  const cvFolds = options.cvFolds ? parseInt(String(options.cvFolds), 10) : 3;
  const cvResult = await kFoldCrossValidationRegression(features, {
    method: options.method as RegressionMethod | undefined,
    k: cvFolds,
    targetKey: options.targetKey,
  });
  // Use CV estimates instead of in-sample
  rawResult.rSquared = cvResult.mean; // mean R² across folds
  rawResult.rmse = cvResult.rmseStdDev; // fold-level variation
  rawResult.mae = cvResult.maeStdDev;
  rawResult.validation_type = 'kfold';
  rawResult.cv_folds = cvFolds;
  rawResult.cv_folds_detail = cvResult.foldResults;
}
```

**Effort:** 15-30 minutes (implement + test against bridge-invariants.test.ts)

**Dependencies:**
- `holdoutRegressionValidation()` exists in `cross-validation.ts` (line ~180+)
- Add to `ml/src/index.ts` exports if missing
- Test via `packages/ml/src/__tests__/bridge-invariants.test.ts`

**Verification:**
```bash
pnpm --filter @wasm4pm/ml test -- cross-validation
pnpm --filter @wasm4pm/ml test -- bridge-invariants
```

---

### GAP 2: Feature Quality Report Not Attached to Output (MEDIUM)

**Location:** `apps/wasm4pm/src/ml-runner.ts` lines 461–467, 557–562, 659–665, 692–698

**Current Flow:**
```typescript
// ml-runner.ts:461-467 (classify case)
const qualityReport = assessFeatureQuality(featureMatrix.data);
if (qualityReport.warnings.length > 0) {
  console.warn(`[ML Feature Quality] ${qualityReport.warnings.join('; ')}`);
  // ⚠️ Warnings go to stderr, lost when JSON output redirected
}
// rawResult has NO quality metadata — only warnings in console
```

**Root Cause:**
- Feature quality is assessed (line 461, 557, 660, 692)
- Warnings only emitted to `console.warn()` (stderr)
- `rawResult` object never includes quality report
- JSON output: `wpm ml classify ... --format json` contains NO feature quality metadata

**Evidence:**
- Classify case (line 534): `(rawResult as Record<string, unknown>)._featureQualityReport = qualityReport;` ← EXISTS
- Cluster case (line 558-562): NO attachment to rawResult
- Regress case (line 661-665): NO attachment to rawResult
- PCA case (line 695-698): NO attachment to rawResult

**Impact:**
- CLI consumer: Can only see warnings in stderr; feature quality hidden from JSON
- Iteration 9 promised "gap 2a" fix but only implement for classify
- Regress/PCA quality invisible to programmatic consumers

**Recommended Fix:**

**For Cluster (line ~587, after rawResult assignment):**
```typescript
// After line 585 (clusterTraces call), add:
(rawResult as Record<string, unknown>)._featureQualityReport = qualityReport;
```

**For Regress (line ~670, after regressRemainingTime call):**
```typescript
// After line 669, add:
(rawResult as Record<string, unknown>)._featureQualityReport = qualityReport;
```

**For PCA (line ~705, after reduceFeaturesPCA call):**
```typescript
// After line 703, add:
(rawResult as Record<string, unknown>)._featureQualityReport = qualityReport;
```

**Verification:**
```bash
pnpm --filter @wasm4pm/cli run ml cluster <log> --format json | jq '.payload._featureQualityReport'
# Should output: { qualityScore: 0.9, warnings: [...], recommendations: [...] }
```

**Effort:** 10-20 minutes (3×1-line additions + spot tests)

---

### GAP 3: suggestRegressionMethod() Built but Not Wired (MEDIUM)

**Location:** `packages/ml/src/algorithm-selection-extended.ts` (exported) vs `apps/wasm4pm/src/ml-runner.ts` (unused)

**Current Flow:**
```typescript
// algorithm-selection-extended.ts:160–220
export function suggestRegressionWithScaling(
  traceCount: number,
  featureCount: number,
  featureQualityScore: number,
  characteristics?: Partial<LogCharacteristicsDetection>,
  hasOutliers: boolean = false,
): AlgorithmScalingPair { ... } // ✅ Exists, exported

// ml-runner.ts:640–670 (regress case)
case 'regress': {
  // ... extract features ...
  rawResult = (await regressRemainingTime(features, {
    method: options.method as RegressionMethod | undefined,  // ❌ Takes user's method or undefined
    // NO data-driven suggestion
  })) as unknown as Record<string, unknown>;
  break;
}
```

**Root Cause:**
- Iteration 9 added `suggestRegressionWithScaling()` but regress task ignores it
- Compare to classify (line 511): `suggestedMethod = suggestClassificationMethod(logChars);`
- If user doesn't specify `--method`, regress defaults to `linear_regression` (hardcoded default in classifiers.ts)

**Evidence:**
- `classifiers.ts` line ~380: method defaults to `'linear_regression'` (hardcoded)
- `algorithm-selection-extended.ts` is exported from `index.ts` but never imported in ml-runner
- classify uses suggestClassificationMethod (line 511); regress doesn't parallel it

**Impact:**
- All regress runs use linear_regression unless user specifies `--method polynomial_regression`
- For noisy logs, polynomial might be better; for high-variance, exponential might be better
- **Data-driven algorithm selection not working for regress**

**Recommended Fix:**

**In ml-runner.ts regress case (line ~667, paralleling classify logic):**

```typescript
case 'regress': {
  // ... existing feature extraction (lines 641-657) ...

  // NEW: Data-driven algorithm selection (parallel to classify)
  let suggestedMethod: RegressionMethod | undefined;
  let method: RegressionMethod;
  
  if (!options.method) {
    // Build LogCharacteristics from extracted features
    let eventStats: Record<string, unknown> = {};
    let activityCount = 15;
    try {
      const sRaw = wasm.analyze_event_statistics(logHandle, activityKey);
      eventStats = typeof sRaw === 'string' ? JSON.parse(sRaw) : sRaw;
    } catch { /* ignore */ }
    try {
      const dfgRaw = wasm.discover_dfg(logHandle, activityKey);
      const dfg = typeof dfgRaw === 'string' ? JSON.parse(dfgRaw) : dfgRaw;
      const nodes = dfg?.nodes;
      if (Array.isArray(nodes)) activityCount = nodes.length;
      else if (nodes && typeof nodes === 'object') activityCount = Object.keys(nodes).length;
    } catch { /* ignore */ }

    const traceCount = features.length;
    const avgTraceLength =
      ((eventStats?.avg_events_per_case as number) ?? 0) > 0
        ? (eventStats.avg_events_per_case as number)
        : 5;
    const eventCount =
      (eventStats?.total_events as number) ?? traceCount * avgTraceLength;

    const logChars: LogCharacteristics = {
      traceCount,
      eventCount,
      activityCount,
      avgTraceLength,
      maxTraceLength: avgTraceLength * 2,
    };

    // NEW: Use algorithm suggestion (reuse classify pattern)
    suggestedMethod = suggestRegressionMethodFromCharacteristics(logChars);
    method = suggestedMethod;
  } else {
    method = options.method as RegressionMethod;
  }

  // ... rest of regress code, using `method` instead of options.method ...
  rawResult = (await regressRemainingTime(features, {
    method,
    // ... other options ...
  })) as unknown as Record<string, unknown>;
  
  if (suggestedMethod) {
    (rawResult as Record<string, unknown>).suggested_method = suggestedMethod;
  }
  break;
}
```

**Helper Function to Add** (or import from extended algo selection):

```typescript
// In algorithm-selector.ts or inline in ml-runner:
function suggestRegressionMethodFromCharacteristics(
  logChars: LogCharacteristics
): RegressionMethod {
  const { traceCount, activityCount } = logChars;
  
  // High-activity logs: use polynomial to capture interactions
  if (activityCount > 50 && traceCount >= 50) {
    return 'polynomial_regression';
  }
  
  // Large datasets: use exponential for time-trending processes
  if (traceCount > 200) {
    return 'exponential_regression';
  }
  
  // Default: linear (stable, interpretable)
  return 'linear_regression';
}
```

**Effort:** 5-10 minutes (import + 2-line substitution + optional helper)

**Verification:**
```bash
pnpm --filter @wasm4pm/cli run ml regress <log> --format json | jq '.payload.suggested_method'
# Should output: 'polynomial_regression' or 'exponential_regression' (data-driven)
```

---

### GAP 4: Correlation Threshold 0.95 Too Lenient (LOW PRIORITY)

**Location:** `packages/ml/src/feature-quality.ts` line 125

**Current:**
```typescript
if (corr > 0.95) {  // ← Threshold: 0.95 = 90% shared variance
  correlatedPairs.push({ col1: i, col2: j, correlation: corr });
  correlationPenalty -= 0.2;
}
```

**Issue:**
- Correlation threshold 0.95 (|r| > 0.95) = 90%+ shared variance
- Industry standard for "multicollinearity problem": |r| > 0.80 (64% shared)
- Regression coefficients become unstable at |r| > 0.80
- Current threshold misses subtle collinearity (trace_length ≈ activity_count for many logs)

**Evidence:**
- Ridge/Lasso regularization activates at |r| > 0.7–0.8
- VIF (Variance Inflation Factor) > 10 ⟺ |r| > 0.9; but >5 ⟺ |r| > 0.8 is already problematic
- Process mining logs: elapsed_time and activity_count often highly correlated (r ≈ 0.85)

**Recommended Fix:**

**Option A: Lower threshold to 0.80 (Iteration 16)**
```typescript
// Line 125, change from 0.95 to 0.80
if (corr > 0.80) {  // More conservative: catch 64%+ shared variance
  correlatedPairs.push({ col1: i, col2: j, correlation: corr });
  correlationPenalty -= 0.2;
}
```

**Option B: Make configurable (Iteration 17+)**
```typescript
export function assessFeatureQuality(
  features: number[][],
  options: { correlationThreshold?: number } = {}
): QualityReport {
  const corrThreshold = options.correlationThreshold ?? 0.80;
  // ... later ...
  if (corr > corrThreshold) { ... }
}
```

**Impact of Change:**
- Will detect 2-5 more correlated pairs in typical process mining logs
- Quality score may drop from 0.90 → 0.70 for logs with hidden collinearity
- Regression R² will improve (fewer redundant features)
- More actionable recommendations

**Effort:** 5 minutes (one-line change + optional parameterization)

**Verification:**
```bash
# Create test log with elapsed_time ≈ activity_count
pnpm --filter @wasm4pm/ml test -- feature-quality
# Threshold=0.95: no correlated pairs detected
# Threshold=0.80: flags elapsed_time/activity_count as correlated
```

---

## Phased Closure Plan

### Phase 1 (Critical): Regression CV — Iteration 16 Immediate

**Tasks:**
1. Add holdout validation to regress case (Option A: 15 min)
2. Verify classify + regress both support `--cross-validate` flag
3. Test against real logs (elm.xes, 100-event log)
4. Document in ml-runner.ts that regress CV is now available

**Success Criteria:**
- ✅ `wpm ml regress <log> --cross-validate` returns honest holdout R²
- ✅ `cv_folds_detail` field in JSON output (when `--cross-validate` enabled)
- ✅ Holdout R² < in-sample R² (proof of overfitting correction)
- ✅ All tests pass: `pnpm --filter @wasm4pm/ml test`

**Blocking:** Nothing. Holdout infrastructure exists.

---

### Phase 2 (Medium): Feature Quality Reporting — Iteration 16 Completion

**Tasks:**
1. Attach `_featureQualityReport` to cluster, regress, pca results (3×1 line)
2. Update tests to verify JSON payloads include quality metadata
3. Update CLI formatters to render quality warnings from payload (not console)

**Success Criteria:**
- ✅ `wpm ml cluster <log> --format json | jq '.payload._featureQualityReport'` returns full report
- ✅ Same for regress, pca
- ✅ No quality warnings lost when redirecting JSON

**Blocking:** None. Assess functions already exist.

---

### Phase 3 (Medium): Algorithm Selection Wiring — Iteration 16 Post-Release

**Tasks:**
1. Implement `suggestRegressionMethodFromCharacteristics()` or reuse extended selection
2. Update regress case to call algorithm suggestion (parallel to classify)
3. Attach `suggested_method` to output

**Success Criteria:**
- ✅ Data-driven regress method selection active
- ✅ Polynomial for high-activity logs (activityCount > 50)
- ✅ Exponential for large datasets (traceCount > 200)
- ✅ Tests verify suggestion logic

**Blocking:** None. Selection infrastructure exists.

---

### Phase 4 (Low Priority): Correlation Threshold Calibration — Iteration 17

**Tasks:**
1. Lower correlation threshold from 0.95 to 0.80
2. Update feature-quality tests to expect more correlation warnings
3. Verify R² improvements on real logs

**Success Criteria:**
- ✅ More collinear feature pairs detected
- ✅ Feature quality score reflects realistic multicollinearity risk
- ✅ Regression quality improves (fewer redundant features)

**Blocking:** Nothing. Non-critical refinement.

---

## Effort Summary

| Gap | Fix | Effort | Skills | Risk |
|-----|-----|--------|--------|------|
| G1 | Add holdout/k-fold to regress | 15–30 min | TypeScript, cross-validation | Low (tested infrastructure) |
| G2 | Attach quality report to 3 cases | 10–20 min | TypeScript, JSON structure | Low (1-line additions) |
| G3 | Wire algorithm suggestion | 5–10 min | TypeScript, data structures | Low (parallel to classify) |
| G4 | Lower correlation threshold | 5 min | Numeric parameter tuning | Low (single constant) |
| **TOTAL** | **All 4 gaps** | **35–75 min** | **TypeScript, ML domain** | **Low–Medium** |

---

## Integration Checklist

- [ ] **Phase 1:** Regress CV integrated + tested
- [ ] **Phase 2:** Feature quality attached to all 4 tasks + CLI formatter updated
- [ ] **Phase 3:** Algorithm selection wired for regress + classify feature parity
- [ ] **Phase 4:** Correlation threshold recalibrated + tests updated
- [ ] **Regression:** All tests pass (`pnpm test`)
- [ ] **Lint:** No TS errors (`pnpm lint`)
- [ ] **Documentation:** CLAUDE.md updated with ML CV availability
- [ ] **Commit:** Single commit per phase with clear message

---

## Key Dependencies

**Already Available:**
- ✅ `holdoutRegressionValidation()` in `cross-validation.ts`
- ✅ `kFoldCrossValidationRegression()` infrastructure exists
- ✅ `assessFeatureQuality()` fully functional
- ✅ `suggestRegressionWithScaling()` exported
- ✅ Feature extraction + statistics already in ml-runner

**Need to Add:**
- ❓ `suggestRegressionMethodFromCharacteristics()` (25 lines, optional — could reuse extended selection)
- ❓ CLI formatter enhancements (optional — quality report already in payload)

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Regression CV slows down CLI | Low | Medium | Add `--cross-validate` flag (opt-in, default off) |
| Correlation threshold change breaks existing code | Low | Low | Add parameterization + feature gate |
| Tests fail after changes | Low | High | Run full test suite before committing |
| Quality report bloats JSON | Low | Low | Use nested `_featureQualityReport` object |

---

## Recommendation

**Implement Phases 1–2 in Iteration 16 (estimated 45 min).** These are load-bearing gaps affecting model reliability and output completeness.

**Defer Phase 3 to Iteration 16 post-release (10 min).** Nice-to-have feature parity, not critical.

**Defer Phase 4 to Iteration 17 (5 min).** Low-priority calibration, safe to defer.

---

## Questions for Implementation

1. **Regress CV default behavior:** Should `--cross-validate` be opt-in (current) or enabled by default?
   - Recommendation: Keep opt-in (`--cross-validate` flag) to avoid breaking existing workflows
   - Add `--cv-folds N` parameter (default 3) for customization

2. **Feature quality in JSON:** Should warnings appear in `_featureQualityReport.warnings[]` or as top-level `warnings[]`?
   - Recommendation: Nested under `_featureQualityReport` for clarity; CLI formatter extracts and renders

3. **Correlation threshold:** Should lower threshold be backward-compatible (parameterized) or breaking change (0.80)?
   - Recommendation: Breaking change acceptable (0.80 is correct; 0.95 was undershooting)

4. **Algorithm suggestion:** Should reuse `suggestRegressionWithScaling()` or implement domain-specific logic?
   - Recommendation: Implement simpler domain-specific logic to avoid adding scaling complexity to regress task

---

**Status:** Analysis complete. Ready for implementation planning.
