# ML Algorithms Quickstart

Get started with ML-powered process mining in 5 steps.

**Time to first result:** ~5 minutes | **Difficulty:** Beginner

---

## What are ML algorithms?

ML algorithms in wasm4pm extract patterns from event logs without mining a process model. Instead of "what is the process?", ask:
- **Classify:** Which outcomes do these cases exhibit?
- **Cluster:** What cohorts exist in my process?
- **Forecast:** What's the next event rate?
- **Anomaly:** Which cases behave abnormally?
- **Regress:** How do features predict duration?
- **PCA:** What are the key factors in my log?

All 6 algorithms are **deterministic**, **zero-dependency**, and **sub-second** on realistic logs.

---

## Step 1: Load your event log

```typescript
import { getRegistry } from '@wasm4pm/kernel';
import { readFileSync } from 'node:fs';

const xes = readFileSync('./my-process.xes', 'utf8');
const registry = getRegistry();
const handle = await registry.run('load_eventlog_from_xes', null, { xes });
```

**What you get:** A `handle` (opaque string) pointing to parsed log in WASM memory.

**Gotchas:**
- XES and JSON formats both supported
- Handle is valid for one session only
- Large logs (>100K events) may take 1-2 seconds to parse

---

## Step 2: Build a feature matrix

Feature matrices convert raw event sequences into numeric tables that ML algorithms understand.

```typescript
import { buildFeatureMatrix } from '@wasm4pm/ml';

const matrix = await buildFeatureMatrix(handle, {
  activityKey: 'concept:name',
  timestampKey: 'time:timestamp',
});

console.log(`Traces: ${matrix.data.length}, Features: ${matrix.featureNames.length}`);
```

**What's in the matrix:**

| Field | Content |
|-------|---------|
| `data` | 2D array: traces × features |
| `featureNames` | Column headers (activity names, time gaps, etc.) |
| `caseIds` | Row identifiers (trace IDs) |
| `targets` | Numeric (e.g., durations) |
| `labels` | Categorical (e.g., outcome activity) |

**Example output:**
```
Traces: 1250, Features: 23
Features: concept:name_Approve, concept:name_Reject, duration_seconds, ...
```

---

## Step 3: Choose an algorithm

| Algorithm | Best for | Speed | Output |
|-----------|----------|-------|--------|
| **Classify** | Outcome prediction | Very fast | `{caseId, predicted, confidence}` |
| **Cluster** | Cohort discovery | Very fast | `{caseId, cluster}` |
| **Forecast** | Event rate trends | Very fast | Trend + seasonal pattern |
| **Anomaly** | Outlier detection | Very fast | Anomaly scores + peaks |
| **Regress** | Duration estimation | Very fast | `{actual, predicted, R²}` |
| **PCA** | Dimensionality reduction | Fast | Reduced feature space |

**Decision tree:**
- Predicting labels? → **Classify**
- Finding groups? → **Cluster**
- Predicting numbers? → **Regress**
- Looking for outliers? → **Anomaly**
- Too many features? → **PCA**
- Predicting capacity? → **Forecast**

---

## Step 4: Run the algorithm

### Classification Example

```typescript
import { classifyTraces } from '@wasm4pm/ml';

const result = await classifyTraces(matrix, {
  method: 'naive_bayes',  // fastest; also: 'knn', 'decision_tree', 'logistic_regression'
  holdoutFraction: 0.2,   // 20% test set
});

console.log(`Predictions: ${result.predictions.length}`);
for (const p of result.predictions.slice(0, 5)) {
  console.log(`  ${p.caseId} → ${p.predicted} (${(p.confidence * 100).toFixed(1)}%)`);
}
```

### Clustering Example

```typescript
import { clusterTraces } from '@wasm4pm/ml';

const result = await clusterTraces(matrix, {
  method: 'kmeans',
  k: 5,  // number of clusters
});

console.log(`Cluster distribution:`, result.assignments
  .reduce((acc, a) => {
    acc[a.cluster] = (acc[a.cluster] ?? 0) + 1;
    return acc;
  }, {} as Record<number, number>));
```

### Regression Example

```typescript
import { regressRemainingTime } from '@wasm4pm/ml';

const result = await regressRemainingTime(matrix, {
  method: 'linear_regression',
});

console.log(`R² = ${result.rSquared.toFixed(3)}`);
console.log(`MAE = ${result.mae.toFixed(1)} seconds`);
for (const p of result.predictions.slice(0, 5)) {
  console.log(`  ${p.caseId}: actual=${p.actual}s, predicted=${p.predicted.toFixed(0)}s`);
}
```

---

## Step 5: Interpret results

**Classification:**
- `confidence > 0.8` → Trust this prediction
- `confidence 0.5-0.8` → Uncertain; check second-ranked label
- `confidence < 0.5` → Model has no clear preference; investigate further

**Clustering:**
- `clusterCount == k` → All clusters present
- `clusterCount < k` → Some clusters merged (possible data skew)
- `noiseCount > 10%` → Algorithm found significant outliers

**Regression:**
- `R² > 0.7` → Strong model (duration is predictable)
- `R² 0.3-0.7` → Moderate predictability
- `R² < 0.3` → Weak signal; check for confounding variables
- `MAE > 20% of mean duration` → High prediction error

**Anomaly:**
- `peakIndices` → Which windows showed anomalies
- `residualPeaks` → Anomalies in trend-adjusted data (more sensitive)
- Top-3 peaks = investigate first

---

## Common patterns

### Pattern 1: Iterate on features

If your model has low R² or accuracy, rebuild the matrix with different keys:

```typescript
// Try resource-aware features
const matrix2 = await buildFeatureMatrix(handle, {
  activityKey: 'concept:name',
  timestampKey: 'time:timestamp',
  resourceKey: 'org:resource',
});
```

### Pattern 2: Test multiple algorithms

```typescript
const methods = ['naive_bayes', 'decision_tree', 'logistic_regression'];
const results = await Promise.all(
  methods.map(method =>
    classifyTraces(matrix, { method, holdoutFraction: 0.2 })
  )
);
results.forEach((r, i) => {
  const accuracy = r.predictions.filter((p, idx) =>
    p.predicted === matrix.labels[idx]
  ).length / r.predictions.length;
  console.log(`${methods[i]}: ${(accuracy * 100).toFixed(1)}%`);
});
```

### Pattern 3: Extract feature importance

After classification, inspect `modelInfo` to see feature weights:

```typescript
const result = await classifyTraces(matrix, {
  method: 'decision_tree',
  holdoutFraction: 0.2,
});
console.log('Feature importance:', result.modelInfo.importances);
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `empty array passed` | Rebuild matrix; ensure log has data |
| `NaN in results` | Check for division by zero; handle empty clusters |
| `Low accuracy (<50%)` | Features don't predict label; try PCA first |
| `All predictions identical` | Algorithm degenerated; switch methods |
| `Out of memory` | Reduce log size or feature count |

---

## Next steps

- **Deep dive:** [`ml-complete.md`](../ml-complete.md)
- **API reference:** [`@wasm4pm/ml.md`](../api/@wasm4pm/ml.md)
- **Examples:** [`/examples/ml-*.ts`](../../examples/)
- **Tutorials:** [`tutorial-ml-selection.md`](../tutorials/tutorial-ml-selection.md)

---

**Still have questions?** See [`ml-faq.md`](../faq/ml-faq.md).
