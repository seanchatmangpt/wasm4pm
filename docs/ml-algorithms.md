# ML Algorithms Guide

The `@pictl/ml` package provides six purpose-built machine-learning families
optimized for process mining. All algorithms are zero-dependency, deterministic,
and run in the browser, Node.js, or via the `wpm ml` CLI.

> Background: see [`ML_GUIDE.md`](./ML_GUIDE.md) for the algorithmic principles
> behind each kernel ("Nanosecond ML"). This document is a *user-facing* guide.

---

## At a glance

| ID            | Family            | Typical use case                          | Output            |
|---------------|-------------------|-------------------------------------------|-------------------|
| `ml_classify` | Classification    | Predict trace outcome (SLA met / missed)  | Class + confidence|
| `ml_cluster`  | Clustering        | Discover trace cohorts / variant families | Cluster ids       |
| `ml_forecast` | Time-series       | Forecast throughput / drift distance      | Future values     |
| `ml_anomaly`  | Anomaly detection | Spot rare or impossible behaviour         | Peak indices      |
| `ml_regress`  | Regression        | Predict remaining cycle time              | Numeric prediction|
| `ml_pca`      | Dim. reduction    | Visualize / denoise feature matrices      | Components        |

CLI form: `wpm ml <task> -i <log.xes>` — see `wpm ml --help`.

---

## 1. `ml_classify` — Trace classification

Assigns each trace to a discrete class (e.g. *converted* / *churned*).

**Methods** (`ClassificationMethod`):

| Method                 | Strengths                              | Watch-outs                         |
|------------------------|----------------------------------------|------------------------------------|
| `knn`                  | No training, robust to small data      | O(n²) at predict time              |
| `logistic_regression`  | Calibrated probabilities               | Needs ~hundreds of traces          |
| `decision_tree`        | Interpretable splits                   | Can overfit very small logs        |
| `naive_bayes`          | Cheap, log-sum-exp stable              | Assumes feature independence       |

**Inputs:** `FeatureMatrix` produced by `buildFeatureMatrix(log)`. Labels come
from `featureMatrix.labels`.

**Tuning tips**

- Start with `naive_bayes` to get a baseline within milliseconds.
- For >1000 traces with mixed numeric + categorical features, switch to
  `decision_tree` for an interpretable model.
- `knn` is recommended only when feature dimensionality is small (≤20).

**Example output**

```json
{
  "method": "naive_bayes",
  "predictions": [
    { "caseId": "case_1", "predicted": "approved", "confidence": 0.92 },
    { "caseId": "case_2", "predicted": "rejected", "confidence": 0.71 }
  ],
  "modelInfo": { "classes": ["approved", "rejected"], "trainingTraces": 1000 }
}
```

## 2. `ml_cluster` — Trace clustering

Groups similar traces (variant families, journey patterns).

**Methods**

| Method   | When to use                                   |
|----------|-----------------------------------------------|
| `kmeans` | Known number of cohorts; spherical clusters   |
| `dbscan` | Unknown cluster count; noise/outliers present |

**Tuning tips**

- For `kmeans`, pick `k` from inflection of within-cluster sum-of-squares.
- For `dbscan`, scale features first; tune `eps` to ≈ knee of the *k-distance*
  plot (see `ml-cluster.ts` example).

## 3. `ml_forecast` — Time-series forecasting

Forecasts throughput series or any user-supplied numeric series.

- `forecastThroughput(log, windowSizeMs)` — bucketed event count per window.
- `forecastSeries(values)` — generic numeric series.

Decomposition output (`trend / seasonal / residual`) follows classical STL
shape. The optional `exponentialForecast` field is provided when an exponential
trend better fits the series than a linear one (selected by R²).

## 4. `ml_anomaly` — Anomaly detection

Detects rare values in a series:

- EMA smoothing reduces high-frequency noise.
- Decomposition isolates seasonal patterns; residual peaks indicate anomalies.
- `peakIndices` and `peakValues` mark the suspicious points.

Use cases: spike detection in throughput, drift distance, queue depth.

## 5. `ml_regress` — Numeric prediction

Predicts a numeric outcome (e.g. *remaining time in seconds*).

| Method                    | Best for                              |
|---------------------------|----------------------------------------|
| `linear_regression`       | Roughly linear relationships          |
| `polynomial_regression`   | Curved relationships, low degree (2–3)|
| `exponential_regression`  | Compound growth/decay                 |

**Quality fields** in `RegressionResult`:

- `rSquared` — proportion of variance explained (1.0 = perfect).
- `rmse` — root-mean-square error in target units.
- `mae` — mean absolute error in target units.

## 6. `ml_pca` — Principal Component Analysis

Reduces a high-dimensional feature matrix to a small number of components
(`nComponents`). Useful for:

- 2-D visualisation of trace cohorts (`nComponents = 2`).
- Speeding up downstream classifiers / clusterers.
- Removing collinear features.

`explainedVariance[i]` reports the share of variance captured by component *i*.

---

## Performance characteristics

| Algorithm     | 1k traces       | 10k traces      | Notes                        |
|---------------|-----------------|-----------------|------------------------------|
| `ml_classify` | 5–50 ms         | 50–500 ms       | `knn` is the slowest variant |
| `ml_cluster`  | 5–30 ms         | 50–300 ms       | `dbscan` is O(n²)            |
| `ml_forecast` | 1–5 ms          | 10–30 ms        | Per series, single pass      |
| `ml_anomaly`  | 1–5 ms          | 10–30 ms        | Includes EMA smoothing       |
| `ml_regress`  | 1–10 ms         | 10–80 ms        | Closed-form solver           |
| `ml_pca`      | 5–25 ms         | 50–200 ms       | Jacobi eigen-solver          |

Numbers are wall-clock on a 2024-era laptop, native Node.js build.
WASM browser builds are typically 1.2–1.6× slower.

---

## See also

- [`prediction.md`](./prediction.md) — Predictive process mining tasks.
- [`drift-detection.md`](./drift-detection.md) — EWMA drift signals.
- [`tutorials/ml-quickstart.md`](./tutorials/ml-quickstart.md).
