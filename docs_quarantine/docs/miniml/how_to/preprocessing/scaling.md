# Scale Your Features

Normalize numeric features so they contribute equally to model training.

## Problem

Your features have different ranges -- age is 0-100, income is 0-1,000,000, and a boolean flag is 0-1. Distance-based algorithms (KNN, K-Means) will be dominated by the feature with the largest range. Gradient-based models will converge slowly. You need to bring all features to a comparable scale.

## Solution

Choose a scaler based on your data distribution and the algorithm you plan to use.

### Step 1: Understand your data distribution

```typescript
function summarize(data: number[], nFeatures: number): void {
  const nSamples = data.length / nFeatures;
  for (let f = 0; f < nFeatures; f++) {
    const values: number[] = [];
    for (let i = f; i < data.length; i += nFeatures) {
      values.push(data[i]);
    }
    const min = Math.min(...values);
    const max = Math.max(...values);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const sorted = [...values].sort((a, b) => a - b);
    const q1 = sorted[Math.floor(sorted.length * 0.25)];
    const q3 = sorted[Math.floor(sorted.length * 0.75)];

    console.log(
      `Feature ${f}: min=${min.toFixed(1)}, max=${max.toFixed(1)}, ` +
        `mean=${mean.toFixed(1)}, q1=${q1.toFixed(1)}, q3=${q3.toFixed(1)}`
    );
  }
}
```

### Step 2: Choose and apply the right scaler

```typescript
import {
  standardScaler,
  minMaxScaler,
  robustScaler,
} from "@seanchatmangpt/wminml";

const nFeatures = 4;

// Standard Scaler: center to mean=0, scale to std=1
// Best for: KNN, K-Means, Logistic Regression, regularized models
// Returns number[] directly (NOT { scaled })
const XStd = standardScaler(X, nFeatures);

// MinMax Scaler: scale to [0, 1] range
// Best for: Neural networks, image data, when you need bounded values
const XMinMax = minMaxScaler(X, nFeatures);

// Robust Scaler: center to median=0, scale by IQR
// Best for: Data with outliers (uses median and quartiles, not mean)
const XRobust = robustScaler(X, nFeatures);
```

### Step 3: Apply training scaler to test data

Never fit a scaler on test data. Fit on training data, then transform test data.

```typescript
import { standardScaler, trainTestSplit } from "@seanchatmangpt/wminml";

const nFeatures = 4;
const { xTrain, xTest, yTrain, yTest } = trainTestSplit(X, y, 0.8, nFeatures);

// Scale training data
const xTrainS = standardScaler(xTrain, nFeatures);

// Scale test data
const xTestS = standardScaler(xTest, nFeatures);

// Now train on xTrainS and evaluate on xTestS
```

### Choosing the right scaler

| Scaler | Formula | When to Use | Handles Outliers |
|--------|---------|-------------|-----------------|
| Standard | `(x - mean) / std` | Most algorithms, general purpose | No -- outliers shift mean |
| MinMax | `(x - min) / (max - min)` | Neural networks, bounded features | No -- outliers stretch range |
| Robust | `(x - median) / IQR` | Data with extreme outliers | Yes -- uses quartiles |

### Which algorithms need scaling?

| Algorithm | Needs Scaling? | Recommended Scaler |
|-----------|---------------|-------------------|
| KNN | Yes (distance-based) | Standard or MinMax |
| K-Means | Yes (distance-based) | Standard or MinMax |
| Logistic Regression | Yes (gradient descent) | Standard |
| Ridge/Lasso | Yes (penalty-sensitive) | Standard |
| Decision Tree | No (split-based) | Not needed |
| Naive Bayes | No (probability-based) | Not needed |

## Tips

- All scalers return `number[]` directly -- they do NOT return `{ scaled }` objects.
- Standard scaler is the safest default. Use it unless you have a specific reason not to.
- Robust scaler is essential when your data has extreme outliers you cannot remove.
- Decision trees and naive bayes do not need feature scaling.

## See Also

- [Encode Categorical Data](encoding.md) -- converting non-numeric features
- [Handle Missing Values](missing-values.md) -- cleaning data before scaling
- [Train a Classifier](../classification/train-model.md) -- scaling in context of model training
