# AutoML Audit — Iteration 4: Algorithm Ranking & ML Model Evaluation Gaps

**Audit Date:** 2026-05-18  
**Scope:** Algorithm recommendation heuristics, ML parameter tuning profiles, ML model evaluation criteria  
**Previous Work:** LogCharacteristics implementation (Iter 3) provides log profiling. Iter 4 extends to algorithm selection and ML quality assessment.

---

## Executive Summary

Three critical gaps identified in the AutoML layer:

| Gap | Severity | Impact | Type |
|-----|----------|--------|------|
| **Gap 1: No log-characteristic-to-algorithm mapping** | HIGH | Algorithms selected by budget only; log properties ignored | Design |
| **Gap 2: No clustering quality metrics in API** | HIGH | Silhouette scores computed in tests but not exported; users blind to model quality | API |
| **Gap 3: Parameter tuning profiles incomplete for ML** | MEDIUM | Classification methods have no parameter suggestions; ML algorithms use hardcoded defaults | Feature |

---

## Gap 1: Algorithm Ranking Ignores Log Characteristics (RANK 2)

**Location:** `packages/observability/src/algorithm-ranking.ts`

**Issue:**
- `rankAlgorithmsByPerformance()` ranks algorithms by fitness/precision/speed (feedback-loop based)
- `selectAlgorithmByBudget()` in planner selects algorithms by latency/quality budget tiers
- **MISSING:** Neither respects log characteristics from `detectLogCharacteristics()` in `packages/ml/src/parameter-suggestions.ts`

**Current behavior:**
```typescript
// packages/planner/src/policy.ts line 104-176
export function selectAlgorithmByBudget(
  latencyBudget: LatencyClass,
  qualityFloor: QualityTier
): AlgorithmId[] {
  // Returns: ['dfg', 'heuristic_miner'], ['genetic_algorithm', 'aco'], etc.
  // Ignores: variantRatio, isHighVariance, estimatedNoiseLevel, etc.
}
```

**What should happen:**
1. Log characteristics (high-variance, high-activity, noisy) should refine algorithm selection
2. High-variance logs (70%+ unique traces) → genetic/ACO/PSO preferred over alpha++
3. High-activity logs (50+ activities) → prefer algorithms optimized for wide feature spaces
4. Noisy logs → prefer noise-resistant algorithms (heuristic_miner: 75%, inductive_miner: 50%)

**Missing code:**
```typescript
// MISSING: selectAlgorithmByCharacteristics()
// Should map detectLogCharacteristics() → ranked algorithm list
function selectAlgorithmByCharacteristics(
  characteristics: LogCharacteristicsDetection,
  budget: BudgetEnvelope
): AlgorithmId[] {
  // Combine characteristics + budget to refine selection
}
```

**References:**
- `packages/kernel/src/registry.ts` line 24-36 defines `LogCharacteristics` interface (noiseResistance, highVarianceOptimal, etc.)
- Algorithm metadata partially populated (heuristic_miner: `highVarianceOptimal: true`, `noiseResistance: 75`)
- But planner never consults this during selection

---

## Gap 2: Clustering Quality Metrics Not Exported (RANK 1-2)

**Location:** `packages/ml/src/__tests__/clustering.test.ts` (tests compute silhouette; not in API)

**Issue:**
- Silhouette coefficient is computed in tests (`computeMeanSilhouetteScore()`) but **never exported** from `packages/ml/src/`
- Users cannot assess clustering quality without external implementation
- Result: `clusterTraces()` returns `{ assignments, centroids, clusterCount, noiseCount, modelInfo }` but modelInfo is sparse

**Current API:**
```typescript
// packages/ml/src/types.ts
export interface ClusteringResult {
  method: ClusteringMethod;
  clusterCount: number;
  noiseCount: number;
  assignments: Array<{ caseId: string; cluster: number }>;
  centroids?: number[][];
  modelInfo: Record<string, unknown>;  // ← empty or sparse
}
```

**What's needed:**
1. Export `computeSilhouetteScore()` from clustering module
2. Add silhouette and Davies-Bouldin to ClusteringResult.modelInfo
3. Provide interpretation guide (silhouette > 0.5 = good, < 0.2 = poor)
4. Add "cluster coherence" composite metric (inertia-based)

**Missing code:**
```typescript
// MISSING: packages/ml/src/clustering-metrics.ts
export interface ClusteringQuality {
  silhouetteScore: number; // [-1, 1], higher is better
  daviesBouldinIndex: number; // [0, ∞], lower is better
  calinskiHarabaszIndex: number; // [0, ∞], higher is better
  inertia: number; // Sum of squared distances
  interpretation: 'excellent' | 'good' | 'fair' | 'poor';
}

export function evaluateClusteringQuality(
  data: number[][],
  assignments: Int32Array,
  centroids: number[][]
): ClusteringQuality { ... }
```

**Test evidence (silhouette in place but hidden):**
- `packages/ml/src/__tests__/clustering.test.ts` lines 100–150 compute silhouette scores
- Test name: "kmeans silhouette score >= 0.5 on well-separated 2-class data"
- But no user-facing API exports this

---

## Gap 3: ML Parameter Tuning Profiles Incomplete (RANK 2)

**Location:** `packages/ml/src/parameter-suggestions.ts` (only covers unsupervised; classifiers unhandled)

**Issue:**
- `suggestClusteringK()`, `suggestPCAComponents()`, `suggestAnomalyThreshold()` exist (good!)
- **MISSING:** Parameter suggestions for:
  - `classifyTraces(method: 'knn' | 'logistic_regression' | 'decision_tree' | 'naive_bayes')`
  - `regressRemainingTime(method: 'linear_regression' | 'polynomial_regression' | 'exponential_regression')`
  - Cross-algorithm selection (when to use kNN vs logistic regression vs tree?)

**Current gaps:**
```typescript
// packages/ml/src/parameter-suggestions.ts
// ✓ suggestClusteringK(traceCount, activityCount, characteristics)
// ✓ suggestPCAComponents(featureCount, characteristics)
// ✓ suggestAnomalyThreshold(logSize, characteristics)
// ✗ suggestClassificationMethod(traceCount, classCount, featureCount, characteristics)
// ✗ suggestRegressionMethod(traceCount, targetDistribution)
// ✗ suggestKnnK(traceCount, featureCount)
```

**What's missing:**

### Classifier selection heuristics
```typescript
// MISSING: selectClassificationMethod()
// High-cardinality classes (>10) → use logistic_regression or tree
// Binary classes → knn with k=3 works well
// Few samples (<100) → naive_bayes (low variance)
// High-variance classes → decision_tree (non-linear)
```

### kNN parameter tuning
```typescript
// MISSING: suggestKnnK()
// k should scale with sqrt(n), capped at 10
// High-variance logs → lower k (3-5) to catch nuance
// Noisy logs → higher k (7-10) for smoothing
```

### Polynomial degree selection
```typescript
// MISSING: suggestPolynomialDegree()
// If R² increases >0.01 from degree 1→2, try degree 2
// But cap at 3 (avoid overfitting on small logs)
// High-variance data → degree 2 (quadratic trends)
```

---

## Implementation Plan (Priority Order)

### Priority 1: Algorithm Ranking Integration (Gap 1)

**File:** Create `packages/planner/src/algorithm-selection-by-characteristics.ts`

```typescript
/**
 * Refine algorithm selection by log characteristics.
 * Combines selectAlgorithmByBudget() + log properties.
 */
export function selectAlgorithmsByCharacteristics(
  characteristics: LogCharacteristicsDetection,
  budget: BudgetEnvelope,
  availableAlgorithms: string[]
): {
  primary: string;      // Best match for characteristics + budget
  alternatives: string[]; // Ranked fallbacks
  reason: string;       // Explanation for selection
} {
  // 1. Start with budget-based selection
  const byBudget = selectAlgorithmByBudget(budget.latencyBudget, budget.qualityFloor);
  
  // 2. Filter by characteristics
  const candidates = byBudget.filter(a => algoIsGoodFor(a, characteristics));
  
  // 3. Rank by suitability score
  const ranked = rankByCharacteristics(candidates, characteristics);
  
  return {
    primary: ranked[0],
    alternatives: ranked.slice(1, 4),
    reason: explainSelection(characteristics, ranked[0])
  };
}

// Helper: Is an algorithm suitable for these characteristics?
function algoIsGoodFor(algoId: string, characteristics: LogCharacteristicsDetection): boolean {
  // High-variance logs: prefer genetic, aco, pso, heuristic_miner (highVarianceOptimal: true)
  if (characteristics.isHighVariance && algoId === 'alpha_plus_plus') return false;
  
  // Noisy logs: prefer heuristic_miner (75%), inductive_miner (50%), avoid alpha++ (false)
  if (characteristics.isNoisy && algoId === 'alpha_plus_plus') return false;
  
  // High-activity logs: avoid dimension-explosion algorithms, prefer DFG
  if (characteristics.isHighActivity && algoId === 'aco') return false;
  
  return true;
}

function rankByCharacteristics(algos: string[], char: LogCharacteristicsDetection): string[] {
  // Score each algorithm against characteristics
  // Return sorted by score (descending)
}
```

**Test:** `packages/planner/src/__tests__/algorithm-selection-by-characteristics.test.ts`  
**Integration:** Modify `packages/planner/src/planner.ts` to call new function before `selectAlgorithmByBudget()`

---

### Priority 2: Clustering Quality Export (Gap 2)

**File:** Create `packages/ml/src/clustering-metrics.ts`

```typescript
export interface ClusteringQuality {
  silhouetteScore: number;        // [-1, 1]
  daviesBouldinIndex: number;     // [0, ∞]
  calinskiHarabaszIndex: number;  // [0, ∞]
  inertia: number;
  interpretation: 'excellent' | 'good' | 'fair' | 'poor';
  quality_grade: 'A' | 'B' | 'C' | 'D';  // Letter grade
}

export function evaluateClustering(
  data: number[][],
  assignments: Int32Array,
  centroids: number[][]
): ClusteringQuality {
  const silhouette = computeSilhouetteScore(data, assignments, centroids);
  const daviesBouldin = computeDaviesBouldinIndex(data, assignments, centroids);
  const calinskiHarabasz = computeCalinskiHarabaszIndex(data, assignments);
  
  // Interpretation: silhouette >= 0.5 = good
  const interpretation = silhouette >= 0.5 ? 'good' : 
                        silhouette >= 0.25 ? 'fair' : 'poor';
  
  return { silhouetteScore: silhouette, daviesBouldinIndex, calinskiHarabaszIndex, 
           inertia, interpretation, quality_grade };
}

// Helper: Compute silhouette coefficient for each point
function computeSilhouetteScore(data: number[][], assignments: Int32Array, centroids: number[][]): number {
  // For each point i:
  //   a(i) = mean distance to other points in same cluster
  //   b(i) = min mean distance to points in other clusters
  //   s(i) = (b(i) - a(i)) / max(a(i), b(i))
  // Return mean s(i) across all points
}
```

**Update ClusteringResult:**
```typescript
export interface ClusteringResult {
  method: ClusteringMethod;
  clusterCount: number;
  noiseCount: number;
  assignments: Array<{ caseId: string; cluster: number }>;
  centroids?: number[][];
  modelInfo: Record<string, unknown>;
  quality?: ClusteringQuality; // ← NEW
}
```

**Modify clustering.ts:**
```typescript
export async function clusterTraces(...): Promise<ClusteringResult> {
  // ... existing logic ...
  
  // Compute quality metrics
  const quality = evaluateClustering(matrix.data, assignments, centroids);
  
  return {
    // ... existing fields ...
    quality,
  };
}
```

**Test:** `packages/ml/src/__tests__/clustering-metrics.test.ts` (30+ tests for silhouette, DB index, CH index)

---

### Priority 3: ML Parameter Tuning (Gap 3)

**File:** Extend `packages/ml/src/parameter-suggestions.ts`

```typescript
/**
 * Suggest classification method based on problem characteristics.
 */
export function suggestClassificationMethod(
  traceCount: number,
  classCount: number,
  featureCount: number,
  characteristics?: Partial<LogCharacteristicsDetection>
): ClassificationMethod {
  // Few samples + few features → naive_bayes (low variance)
  if (traceCount < 100 && featureCount < 10) return 'naive_bayes';
  
  // Many classes → logistic_regression or tree (handles multi-class well)
  if (classCount > 5) return 'logistic_regression';
  
  // High-variance data → decision_tree (non-linear)
  if (characteristics?.isHighVariance) return 'decision_tree';
  
  // Default: knn is robust
  return 'knn';
}

/**
 * Suggest k for k-nearest-neighbors classification.
 */
export function suggestClassificationK(
  traceCount: number,
  classCount: number,
  characteristics?: Partial<LogCharacteristicsDetection>
): number {
  // Rule: k ≈ sqrt(traceCount), but at least 3, at most 10
  let suggested = Math.sqrt(traceCount);
  
  // High-variance → lower k (catch nuance)
  if (characteristics?.isHighVariance) suggested *= 0.8;
  
  // Noisy → higher k (smooth noise)
  if (characteristics?.isNoisy) suggested *= 1.2;
  
  return Math.max(3, Math.min(10, Math.round(suggested)));
}

/**
 * Suggest polynomial degree for regression.
 */
export function suggestPolynomialDegree(
  traceCount: number,
  characteristics?: Partial<LogCharacteristicsDetection>
): number {
  // Small samples → degree 1 (avoid overfitting)
  if (traceCount < 50) return 1;
  
  // High-variance → degree 2 (quadratic trends)
  if (characteristics?.isHighVariance) return 2;
  
  // Default: degree 1 (linear)
  return 1;
}

/**
 * Suggest DBSCAN eps parameter based on log characteristics.
 */
export function suggestDBScanEps(
  data: number[][],
  characteristics?: Partial<LogCharacteristicsDetection>
): number {
  // Compute mean nearest-neighbor distance (standard heuristic)
  const distances = computeNearestNeighborDistances(data);
  const meanDist = distances.reduce((s, d) => s + d, 0) / distances.length;
  
  // Noisy logs: higher eps (merge clusters more aggressively)
  let eps = meanDist;
  if (characteristics?.isNoisy) eps *= 1.3;
  if (characteristics?.isHighVariance) eps *= 0.9;
  
  return eps;
}
```

**Add to index.ts exports:**
```typescript
export {
  suggestClassificationMethod,
  suggestClassificationK,
  suggestPolynomialDegree,
  suggestDBScanEps,
} from './parameter-suggestions.js';
```

**Test:** `packages/ml/src/__tests__/parameter-suggestions-ml-methods.test.ts`

---

## Current Implementation Status

| Module | Current | Gap | Priority |
|--------|---------|-----|----------|
| LogCharacteristics detection | ✓ Implemented | None | — |
| Algorithm ranking (feedback-loop) | ✓ Implemented | Log-aware selection missing | P1 |
| Clustering quality metrics | ⚠ Test-only (hidden) | Export + API integration | P2 |
| ML parameter suggestions | ⚠ Partial (clustering, PCA, anomaly) | Classification, regression missing | P3 |
| Algorithm selection policy | ✓ Implemented | Characteristics integration missing | P1 |

---

## Test Coverage Plan

| Gap | Tests Needed | Estimate |
|-----|--------------|----------|
| Gap 1 | Algorithm ranking + characteristics integration (20 tests) | 8h |
| Gap 2 | Silhouette, Davies-Bouldin, Calinski-Harabasz metrics (30 tests) | 12h |
| Gap 3 | Classification/regression parameter suggestions (25 tests) | 10h |

---

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Silhouette computation O(n²) slow for large logs | MEDIUM | Compute for subsample (1000 points max) |
| Parameter suggestions hard-coded (no tuning) | MEDIUM | Use feedback loop to refine thresholds |
| Characteristics detection thresholds arbitrary | MEDIUM | Validate against real-world logs (BPI, SAP) |

---

## Validation Checklist

Before marking complete:

- [ ] Algorithm selection respects logCharacteristics (high-variance → genetic/ACO preferred)
- [ ] Clustering quality metrics exported and integrated into ClusteringResult
- [ ] All 6 ML methods have parameter suggestion functions
- [ ] Parameter suggestions tested with 5+ log profile scenarios
- [ ] Silhouette score >= 0.5 on well-separated data (existing test passes)
- [ ] No regression in existing algorithm ranking tests
- [ ] OTEL spans emitted for algorithm selection decisions
- [ ] ml-runner calls new parameter suggestions for all 6 tasks

---

## Files to Create/Modify

**Create:**
1. `packages/planner/src/algorithm-selection-by-characteristics.ts`
2. `packages/ml/src/clustering-metrics.ts`
3. `packages/planner/src/__tests__/algorithm-selection-by-characteristics.test.ts`
4. `packages/ml/src/__tests__/clustering-metrics.test.ts`
5. `packages/ml/src/__tests__/parameter-suggestions-ml-methods.test.ts`

**Modify:**
1. `packages/ml/src/parameter-suggestions.ts` (add classifier/regression functions)
2. `packages/ml/src/index.ts` (export new functions)
3. `packages/ml/src/types.ts` (add ClusteringQuality interface)
4. `packages/ml/src/clustering.ts` (integrate quality metrics)
5. `packages/planner/src/planner.ts` (call algorithm-selection-by-characteristics)
6. `apps/wasm4pm/src/ml-runner.ts` (use new parameter suggestions)

---

## Acceptance Criteria

1. **Gap 1:** High-variance logs select genetic/ACO; noisy logs select heuristic_miner; high-activity logs avoid dimension-explosion algos
2. **Gap 2:** `clusterTraces()` returns silhouetteScore, daviesBouldinIndex in result.quality; grade A/B/C/D assigned
3. **Gap 3:** All 6 ML methods have parameter suggestion functions; suggestions tested on 3+ characteristic profiles

---

## References

- van der Aalst process mining quality dimensions: fitness, precision, generalization, simplicity
- Clustering evaluation: Silhouette ([-1,1]), Davies-Bouldin ([0,∞]), Calinski-Harabasz ([0,∞])
- ML parameter tuning: sqrt(n/2) for k-means, sqrt(n) for kNN, polynomial degree by R² increase
- Algorithm suitability: registry.ts LogCharacteristics (noiseResistance, highVarianceOptimal, reworkDetector)
