# @wasm4pm/ml

Native, dependency-free ML for process mining. Six algorithms hand-tuned for
case-feature workloads: classification, clustering, forecasting, anomaly
detection, regression, PCA. All operations run on `Float64Array` columnar
buffers, use single-pass aggregations, and skip `sqrt` until the output
boundary.

## Algorithms

| Algorithm | Export                    | Methods                                                              | Output                |
|-----------|---------------------------|----------------------------------------------------------------------|-----------------------|
| Classify  | `classifyTraces`          | `knn`, `logistic_regression`, `decision_tree`, `naive_bayes`         | per-case labels + confidence |
| Regress   | `regressRemainingTime`    | `linear_regression`, `polynomial_regression`, `exponential_regression` | slope/intercept, R², RMSE, MAE |
| Cluster   | `clusterTraces`           | `kmeans`, `dbscan`                                                   | per-case cluster ids, centroids |
| Forecast  | `forecastSeries`, `forecastThroughput`, `buildThroughputSeries` | linear trend + autocorrelation seasonality + optional exponential | trend, forecast, decomposition |
| Anomaly   | `detectEnhancedAnomalies` | SMA / EMA smoothing + STL-style decomposition                        | peak indices, residual peaks |
| PCA       | `reduceFeaturesPCA`       | min-max normalisation, Jacobi eigendecomposition                     | transformed data, components, explained variance |

## Known Behaviour

- Empty input returns empty results (`[]`); these functions do **not** throw.
  `regressRemainingTime` and `reduceFeaturesPCA` are the exceptions and throw
  with a descriptive message when there is too little data to fit.
- `regressRemainingTime` is **univariate** — only the first feature column is
  used as the independent variable. Pre-aggregate or PCA-project for multi-feature regression.
- `forecastThroughput` ignores timestamps that aren't numeric; bin width
  defaults to one hour (`3_600_000` ms).
- k-means is deterministic for a fixed input (`k-means++` plus a
  cumulative-weight tie-break), but is **not** seeded — small data
  perturbations may flip cluster ids.

## Usage

### Install

This package is part of the `wasm4pm` monorepo:

```bash
pnpm --filter @wasm4pm/ml install
pnpm --filter @wasm4pm/ml test
```

### Classification

```typescript
import { classifyTraces } from '@wasm4pm/ml';

const features = [
  { case_id: 'c1', trace_length: 10, elapsed_time: 5000, outcome: 'Reject' },
  { case_id: 'c2', trace_length: 3,  elapsed_time: 1000, outcome: 'Approve' },
  // ... 100s of cases ...
];

const result = await classifyTraces(features, { method: 'knn', k: 5 });
// result.predictions: [{ caseId, predicted, confidence }, ...]
// result.modelInfo:    { k, featureCount, traceCount, classCount }
```

### Regression (remaining time)

```typescript
import { regressRemainingTime } from '@wasm4pm/ml';

const result = await regressRemainingTime(features, {
  method: 'linear_regression',
  targetKey: 'remaining_time',
});
// result.slope, result.intercept, result.rSquared, result.rmse, result.mae
```

### Clustering

```typescript
import { clusterTraces } from '@wasm4pm/ml';

const km = await clusterTraces(features, { method: 'kmeans', k: 3 });
// km.assignments[i] = { caseId, cluster }
// km.centroids[c]   = number[] in feature-name order

const db = await clusterTraces(features, { method: 'dbscan', eps: 1.0, minPoints: 3 });
// db.noiseCount, db.clusterCount
```

### Forecasting

```typescript
import { forecastThroughput, forecastSeries, buildThroughputSeries } from '@wasm4pm/ml';

const tp = await forecastThroughput(eventTimestampsMs, {
  windowSizeMs: 3_600_000,    // 1 hour
  forecastPeriods: 24,
  useExponential: true,
});
// tp.trend = { direction: 'up'|'down'|'flat', slope, strength }
// tp.forecast              — linear trend forecast
// tp.exponentialForecast?  — set when exponential R² > 0.5

const fs = await forecastSeries([0.1, 0.2, 0.3, 0.4], { forecastPeriods: 5 });
// Same shape as forecastThroughput but for any pre-binned numeric series.

const { series, windowStarts } = buildThroughputSeries(eventTimestampsMs, 3_600_000);
```

### Anomaly Detection

```typescript
import { detectEnhancedAnomalies } from '@wasm4pm/ml';

const result = await detectEnhancedAnomalies(driftDistances, {
  smoothingWindow: 5,
  smoothingMethod: 'ema',
});
// result.peakIndices       — peaks in the raw series
// result.residualPeaks?    — peaks after STL-style decomposition
// result.decomposed?       — { trend, seasonal, residual }
```

### PCA

```typescript
import { reduceFeaturesPCA } from '@wasm4pm/ml';

const result = await reduceFeaturesPCA(features, { nComponents: 2 });
// result.transformedData[i]    — projected coordinates
// result.components[c]         — i-th eigenvector (length = original feature count)
// result.explainedVariance[c]  — share of total variance, in [0, 1]
```

### Bridge utilities

```typescript
import { buildFeatureMatrix, encodeLabels } from '@wasm4pm/ml';

// Convert wasm4pm extract_case_features() output into a numeric matrix:
const matrix = buildFeatureMatrix(featuresJson, 'remaining_time', 'outcome');
// matrix.data, matrix.featureNames, matrix.caseIds, matrix.targets, matrix.labels

const { encoded, labelMap, reverseMap } = encodeLabels(['A', 'B', 'A']);
// encoded:    [0, 1, 0]
// labelMap:   Map { 'A' => 0, 'B' => 1 }
// reverseMap: Map { 0 => 'A', 1 => 'B' }
```

## CLI

```bash
wpm ml classify -i events.json
wpm ml forecast -i events.json --horizon 10
wpm ml anomaly  -i events.json --threshold 0.8
wpm ml pca      -i events.json --components 2
```

## Testing

```bash
pnpm --filter @wasm4pm/ml test            # vitest run
pnpm --filter @wasm4pm/ml test:watch      # watch mode
pnpm --filter @wasm4pm/ml test:coverage   # v8 coverage with thresholds
```

Vitest is configured to ignore stale `*.test.js` build artefacts under
`src/__tests__/`. Coverage thresholds: lines/statements/functions ≥ 70 %,
branches ≥ 60 %.
