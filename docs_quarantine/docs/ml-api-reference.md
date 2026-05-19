# `@wasm4pm/ml` — API Reference

Public surface of the `@wasm4pm/ml` package. All functions are pure (no I/O, no
hidden state) and deterministic given a fixed input.

```ts
import {
  buildFeatureMatrix, encodeLabels,
  classifyTraces, regressRemainingTime,
  clusterTraces,
  forecastThroughput, forecastSeries, buildThroughputSeries,
  detectEnhancedAnomalies,
  reduceFeaturesPCA,
} from '@wasm4pm/ml';
```

---

## Bridge

### `buildFeatureMatrix(logHandle, options) → Promise<FeatureMatrix>`

Project an event-log handle into a numeric matrix suitable for ML.

| Option         | Type     | Default          | Notes                          |
|----------------|----------|------------------|---------------------------------|
| `activityKey`  | string   | `'concept:name'` | Event attribute for activity   |
| `timestampKey` | string   | `'time:timestamp'` | For duration features         |
| `extraAttrs`   | string[] | `[]`             | Additional event attributes    |

Returns `FeatureMatrix { data, featureNames, caseIds, targets, labels }`.

### `encodeLabels(labels: string[]) → LabelEncoding`

Encode string labels to numeric indices (`{ encoded, labelMap, reverseMap }`).

---

## Classification

### `classifyTraces(matrix, options) → Promise<ClassificationResult>`

| Option            | Type                  | Default        |
|-------------------|-----------------------|----------------|
| `method`          | `ClassificationMethod`| `'naive_bayes'`|
| `holdoutFraction` | number (0–1)          | `0.2`          |
| `k` (knn only)    | number                | `5`            |

Returns `{ method, predictions[], modelInfo }`.

### `regressRemainingTime(matrix, options) → Promise<RegressionResult>`

| Option   | Type                | Default              |
|----------|---------------------|----------------------|
| `method` | `RegressionMethod`  | `'linear_regression'`|
| `degree` | number (poly only)  | `2`                  |

---

## Clustering

### `clusterTraces(matrix, options) → Promise<ClusteringResult>`

| Option          | Type              | Default     | Notes                |
|-----------------|-------------------|-------------|----------------------|
| `method`        | `ClusteringMethod`| `'kmeans'`  |                      |
| `k`             | number            | `4`         | k-means              |
| `eps`           | number            | `0.5`       | dbscan radius        |
| `minPts`        | number            | `5`         | dbscan density       |
| `maxIterations` | number            | `100`       | k-means              |

---

## Forecasting

### `forecastThroughput(logHandle, options) → Promise<ThroughputForecastResult>`

Bucketed event-count forecast with seasonal decomposition.

| Option         | Type   | Default       |
|----------------|--------|----------------|
| `windowSizeMs` | number | `3_600_000`    |
| `horizon`      | number | `10`           |

### `forecastSeries(values, options) → Promise<SeriesForecastResult>`

Generic numeric series forecast.

### `buildThroughputSeries(logHandle, windowSizeMs) → Promise<number[]>`

Helper used by `forecastThroughput`; returned as a stand-alone series.

---

## Anomaly detection

### `detectEnhancedAnomalies(values, options) → Promise<EnhancedAnomalyResult>`

| Option              | Type   | Default | Notes                          |
|---------------------|--------|---------|--------------------------------|
| `smoothingAlpha`    | number | `0.2`   | EMA factor                     |
| `peakThreshold`     | number | `2.0`   | σ above local mean             |
| `decompose`         | bool   | `false` | Trend/seasonal/residual split  |

---

## Dimensionality reduction

### `reduceFeaturesPCA(matrix, options) → Promise<PCAResult>`

| Option        | Type   | Default |
|---------------|--------|---------|
| `nComponents` | number | `2`     |
| `whiten`      | bool   | `false` |

Returns `{ explainedVariance[], transformedData[][], components[][], … }`.

---

## Result types

See [`packages/ml/src/types.ts`](../packages/ml/src/types.ts) for the
authoritative definitions.

## Error handling

All functions reject with an `Error` carrying a stable `code`:

| Code              | Meaning                                  |
|-------------------|------------------------------------------|
| `ML_BAD_INPUT`    | Invalid feature-matrix shape             |
| `ML_EMPTY_INPUT`  | Empty matrix (warning, not always fatal) |
| `ML_CONVERGENCE`  | Iterative method did not converge        |
| `ML_NOT_TRAINED`  | Predict called before train              |

## Determinism

All stochastic methods accept an optional `seed: number`. If omitted, a
build-time-fixed default seed is used so results are reproducible across runs.

## See also

- [`ml-algorithms.md`](./ml-algorithms.md) — User-facing algorithm guide.
- [`ML_GUIDE.md`](./ML_GUIDE.md) — Internal kernel design.
- [`ml-rl-faq.md`](./ml-rl-faq.md) — FAQ / troubleshooting.
