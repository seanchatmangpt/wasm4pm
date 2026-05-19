# Find Anomalies

Detect outliers and anomalous data points using statistical methods and Isolation Forests.

## Problem

You need to identify data points that deviate significantly from the normal pattern -- fraud detection, sensor failures, data quality issues, or rare events.

## Solution

miniml provides two complementary approaches: statistical outlier detection (z-score based) and Isolation Forest (tree-based).

### Statistical Outlier Detection

Best for **univariate data** with an approximately normal distribution. Uses z-scores to flag points that are far from the mean.

```typescript
import { statisticalOutlier } from '@seanchatmangpt/wminml';

// Transaction amounts (most are normal, a few are suspicious)
const amounts = [
  45.00, 52.30, 38.75, 61.20, 44.90, 55.10, 42.30, 48.60, 39.80, 53.40,
  47.20, 50.10, 41.90, 46.70, 54.30, 43.80, 49.50, 44.10, 52.80, 47.60,
  998.50, 1205.00,  // anomalies
];

const result = statisticalOutlier(amounts, 2.0);

console.log(`Outliers found: ${result.outliers.length}`);
console.log(`Outlier indices: [${result.outliers.join(', ')}]`);
console.log(`Outlier values:  [${result.outliers.map(i => amounts[i]).join(', ')}]`);
console.log(`Z-scores:        [${result.outliers.map(i => result.scores[i].toFixed(2)).join(', ')}]`);
```

The `threshold` parameter sets the z-score cutoff. Common values:

| Threshold | Meaning | Use Case |
|-----------|---------|----------|
| 1.5 | Very sensitive | Catch near-outliers, more false positives |
| 2.0 | Moderate | Good default for most applications |
| 2.5 | Conservative | Only flag extreme outliers |
| 3.0 | Very strict | Rare events only, minimal false positives |

### Isolation Forest

Best for **multivariate data** where anomalies depend on combinations of features, not individual values.

```typescript
import { isolationForestTrain } from '@seanchatmangpt/wminml';

// Customer behavior features: [loginFrequency, purchaseAmount, sessionDuration, pageViews]
const X = new Float64Array([
  // Normal customers
  5, 120, 15, 20,
  8, 95, 22, 35,
  3, 80, 10, 12,
  6, 150, 18, 28,
  7, 110, 25, 30,
  4, 90, 12, 18,
  5, 130, 20, 25,
  6, 105, 16, 22,
  // Suspicious: high frequency, low purchase, very long sessions, many pages
  50, 5, 180, 500,
  45, 2, 200, 600,
]);

const nSamples = 10;
const nFeatures = 4;

const model = isolationForestTrain(X, nSamples, nFeatures, 100, 10);
// model.predict(newData) returns anomaly scores
// Low scores = anomalies (isolated quickly by the forest)
```

### Combining Both Methods

For robust detection, run both methods and take the intersection:

```typescript
import { statisticalOutlier, isolationForestTrain } from '@seanchatmangpt/wminml';

// 1. Statistical check on a key feature (e.g., transaction amount)
const amounts = [...];  // your data
const statResult = statisticalOutlier(amounts, 2.0);

// 2. Isolation Forest on the full feature set
const X = new Float64Array([...]);  // flattened feature matrix
const ifModel = isolationForestTrain(X, nSamples, nFeatures, 100, 10);
// const ifPredictions = ifModel.predict(X);

// 3. Flag points that are outliers in both methods
// const confirmedAnomalies = statResult.outliers.filter(i => ifPredictions[i] < threshold);
```

## Tips

- Statistical outlier detection assumes approximate normality. Check your distribution with `describe()` before using it.
- Isolation Forests work better with more trees (`nTrees: 200+`) but cost more to train.
- For streaming data, use sliding windows and re-run detection periodically.
- Always investigate flagged anomalies manually before taking automated action -- false positives are inevitable.
- Set thresholds based on your tolerance for false positives versus missed anomalies.
