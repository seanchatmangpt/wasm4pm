# Regularization Techniques

Prevent overfitting with Ridge and Lasso regression.

## Problem

Your regression model performs well on training data but poorly on test data. It has learned noise instead of signal -- coefficients are too large and the model is too complex for the amount of data you have. You need to constrain the model without losing predictive power.

## Solution

Add a penalty term to the loss function that shrinks coefficients toward zero. Ridge shrinks all coefficients equally; Lasso drives some to exactly zero (automatic feature selection).

### Step 1: Compare regularized models

```typescript
import {
  ridgeRegression,
  lassoRegression,
  standardScaler,
  trainTestSplit,
} from "@seanchatmangpt/wminml";

const nFeatures = 5;

const { xTrain, xTest, yTrain, yTest } = trainTestSplit(
  X, y, 0.8, nFeatures
);

// Scale first -- regularization is sensitive to feature scales
const xTrainS = standardScaler(xTrain, nFeatures);
const xTestS = standardScaler(xTest, nFeatures);

// Ridge (L2) -- shrinks all coefficients, keeps all features
const ridge = ridgeRegression(xTrainS, yTrain, nFeatures, 1.0);
const ridgePred = ridge.predict(xTestS);

// Lasso (L1) -- drives some coefficients to zero (feature selection)
const lasso = lassoRegression(xTrainS, yTrain, nFeatures, 0.5, 100);
const lassoPred = lasso.predict(xTestS);
```

### Step 2: Choose the right alpha

The `alpha` parameter controls regularization strength. Higher alpha means stronger regularization (more coefficient shrinkage).

```typescript
function findBestAlpha(
  xTrain: number[],
  yTrain: number[],
  xTest: number[],
  yTest: number[],
  nFeatures: number
): void {
  const alphas = [0.001, 0.01, 0.1, 0.5, 1.0, 5.0, 10.0];

  console.log("Alpha   | Ridge R2  | Lasso R2");
  console.log("--------|-----------|----------");

  for (const alpha of alphas) {
    const ridge = ridgeRegression(xTrain, yTrain, nFeatures, alpha);
    const lasso = lassoRegression(xTrain, yTrain, nFeatures, alpha, 100);

    const ridgePred = ridge.predict(xTest);
    const lassoPred = lasso.predict(xTest);

    // Compute R-squared manually
    const ridgeR2 = rSquared(yTest, ridgePred);
    const lassoR2 = rSquared(yTest, lassoPred);

    console.log(
      `${alpha.toFixed(3).padStart(6)} | ${(ridgeR2 * 100).toFixed(1).padStart(7)}% | ${(lassoR2 * 100).toFixed(1).padStart(7)}%`
    );
  }
}

function rSquared(yTrue: number[], yPred: number[]): number {
  const mean = yTrue.reduce((a, b) => a + b, 0) / yTrue.length;
  let ssTot = 0;
  let ssRes = 0;
  for (let i = 0; i < yTrue.length; i++) {
    ssTot += (yTrue[i] - mean) ** 2;
    ssRes += (yTrue[i] - yPred[i]) ** 2;
  }
  return 1 - ssRes / ssTot;
}
```

### Step 3: Use Lasso for feature selection

Lasso drives irrelevant feature coefficients to exactly zero, acting as automatic feature selection.

```typescript
const lasso = lassoRegression(xTrainS, yTrain, nFeatures, 1.0, 200);

// Check which features survived
const coeffs = lasso.coefficients || [];
const featureNames = ["age", "income", "score", "rating", "tenure"];

for (let i = 0; i < nFeatures; i++) {
  const status = Math.abs(coeffs[i]) < 1e-6 ? "REMOVED" : `weight=${coeffs[i].toFixed(3)}`;
  console.log(`  ${featureNames[i]}: ${status}`);
}
```

### When to use each

| Technique | Best When | Effect |
|-----------|-----------|--------|
| Ridge (`alpha > 0`) | Many correlated features, all potentially useful | Shrinks all coefficients, none to zero |
| Lasso (`alpha > 0`) | Many features, only some matter | Drives unimportant coefficients to zero |

## Tips

- Always scale features before regularization. Unscaled features get penalized unfairly.
- Start with `alpha: 1.0` and search from there.
- If all features are important, use Ridge. If you want automatic feature selection, use Lasso.
- There is no `elasticNet()` export. Use Ridge or Lasso separately.

## See Also

- [Predict Continuous Values](predict-values.md) -- regression model basics
- [Non-linear Relationships](nonlinear.md) -- when the relationship is not linear
- [Scale Your Features](../preprocessing/scaling.md) -- required before regularization
