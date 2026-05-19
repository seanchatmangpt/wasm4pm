# Handle Missing Values

Fill in or remove missing data points before training ML models.

## Problem

Real-world datasets have gaps -- sensor failures, survey non-responses, data pipeline errors. ML models cannot process `null`, `NaN`, or missing values. You need a strategy to handle these gaps without distorting the data distribution.

## Solution

Use imputation to fill missing values with a reasonable estimate, or remove samples with too many missing values.

### Step 1: Detect missing values

```typescript
function detectMissing(
  X: number[],
  nFeatures: number
): void {
  const nSamples = X.length / nFeatures;
  let totalMissing = 0;

  for (let f = 0; f < nFeatures; f++) {
    let missing = 0;
    for (let i = 0; i < nSamples; i++) {
      const val = X[i * nFeatures + f];
      if (val === 0 || isNaN(val)) {
        // Note: 0 is often used as a sentinel for missing in flat arrays.
        // Adjust the condition based on how your data represents missing values.
        missing++;
      }
    }
    totalMissing += missing;
    if (missing > 0) {
      console.log(
        `Feature ${f}: ${missing}/${nSamples} missing (${((missing / nSamples) * 100).toFixed(1)}%)`
      );
    }
  }

  console.log(`\nTotal missing: ${totalMissing}/${nSamples * nFeatures}`);
  console.log(`Missing rate: ${((totalMissing / (nSamples * nFeatures)) * 100).toFixed(1)}%`);
}
```

### Step 2: Impute with different strategies

The `simpleImputer` function fills missing values (represented as 0 in the input) with the specified strategy.

```typescript
import { simpleImputer } from "@seanchatmangpt/wminml";

const nFeatures = 4;

// Strategy: "mean" -- replace missing with the feature mean
// Best for: Normally distributed data without extreme outliers
const XMean = simpleImputer(X, nFeatures, "mean");

// Strategy: "median" -- replace missing with the feature median
// Best for: Skewed data or data with outliers
const XMedian = simpleImputer(X, nFeatures, "median");

// Strategy: "most_frequent" -- replace missing with the most frequent value
// Best for: Categorical data encoded as integers
const XMode = simpleImputer(X, nFeatures, "most_frequent");

// Strategy: "constant" -- replace missing with a fixed value (custom)
// Best for: When missing has meaning (e.g., "not applicable")
const XConstant = simpleImputer(X, nFeatures, "mean", 0);
```

### Step 3: Use different strategies per feature

Different features may need different imputation. Use `simpleImputer` once per feature, or impute the full matrix with a single strategy and override specific features.

```typescript
import { simpleImputer } from "@seanchatmangpt/wminml";

// Apply different strategies to different feature ranges
const XMean = simpleImputer(X, nFeatures, "mean"); // default for all
const XMedian = simpleImputer(X, nFeatures, "median"); // for skewed features
const XMode = simpleImputer(X, nFeatures, "most_frequent"); // for categorical features

// For per-feature control, impute the whole matrix with the most common strategy,
// then manually correct specific features that need a different approach.
```

### Choosing the right strategy

| Strategy | Best For | Caveats |
|----------|---------|---------|
| `mean` | Normal distribution, few missing values | Distorted by outliers |
| `median` | Skewed data, outliers present | Ignores distribution shape |
| `most_frequent` | Categorical data (encoded integers) | Can mask true variability |
| `constant` (with fillValue) | When 0/missing has semantic meaning | Creates artificial spike at that value |

### When to drop samples

If a sample has too many missing values, imputation will produce unreliable data. Drop samples where the missing ratio exceeds a threshold.

```typescript
function dropHighMissing(
  X: number[],
  y: number[],
  nFeatures: number,
  threshold: number
): { X: number[]; y: number[]; nSamples: number } {
  const nOriginal = X.length / nFeatures;
  const keptX: number[] = [];
  const keptY: number[] = [];

  for (let i = 0; i < nOriginal; i++) {
    let missingCount = 0;
    for (let f = 0; f < nFeatures; f++) {
      if (X[i * nFeatures + f] === 0 || isNaN(X[i * nFeatures + f])) {
        missingCount++;
      }
    }
    if (missingCount / nFeatures < threshold) {
      for (let f = 0; f < nFeatures; f++) keptX.push(X[i * nFeatures + f]);
      keptY.push(y[i]);
    }
  }

  return { X: keptX, y: keptY, nSamples: keptY.length };
}

const { X: XClean, y: yClean, nSamples: nClean } = dropHighMissing(X, y, nFeatures, 0.5);
console.log(`Kept ${nClean}/${nOriginal} samples`);
```

## Tips

- Impute on training data only, then apply the same fill values to test data to prevent data leakage.
- If more than 30% of a feature's values are missing, consider dropping the feature entirely.
- If more than 50% of a sample's features are missing, consider dropping the sample.
- Median imputation is the safest default -- it works reasonably well for most distributions.
- Use `simpleImputer()`, not `imputer()` -- the function is called `simpleImputer`.

## See Also

- [Scale Your Features](scaling.md) -- normalize after imputation
- [Encode Categorical Data](encoding.md) -- encode after handling missing values
- [Train a Classifier](../classification/train-model.md) -- training on cleaned data
