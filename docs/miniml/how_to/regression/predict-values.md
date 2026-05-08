# Predict Continuous Values

Train regression models to predict numeric outcomes.

## Problem

You need to predict a continuous quantity -- house prices, temperature, revenue, sensor readings. The target variable is a number, not a category. Different regression models capture different relationships between features and the target.

## Solution

Start with linear regression as a baseline. If the relationship is non-linear, try polynomial or exponential models. Compare using R-squared and RMSE.

### Step 1: Prepare the data

```typescript
import { trainTestSplit, standardScaler } from "@seanchatmangpt/wminml";

// X: flat feature array, y: target values
const nFeatures = 3;

const { xTrain, xTest, yTrain, yTest } = trainTestSplit(
  X, y, 0.8, nFeatures
);

const xTrainS = standardScaler(xTrain, nFeatures);
const xTestS = standardScaler(xTest, nFeatures);
```

### Step 2: Train multiple regression models

```typescript
import {
  linearRegression,
  polynomialRegression,
  exponentialRegression,
  powerRegression,
} from "@seanchatmangpt/wminml";

// Linear Regression -- baseline for linear relationships
const lin = linearRegression(XTrain, yTrain);
const linPred = lin.predict(XTest);

// Polynomial Regression -- captures curves in the data
const poly = polynomialRegression(XTrain, yTrain, { degree: 3 });
const polyPred = poly.predict(XTest);

// Exponential Regression -- for growth/decay patterns
const exp = exponentialRegression(XTrain, yTrain);
const expPred = exp.predict(XTest);

// Power Regression -- for scaling relationships (y = a * x^b)
const pow = powerRegression(XTrain, yTrain);
const powPred = pow.predict(XTest);
```

### Step 3: Compare models with metrics

```typescript
function rmse(yTrue: number[], yPred: number[]): number {
  const n = yTrue.length;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += (yTrue[i] - yPred[i]) ** 2;
  }
  return Math.sqrt(sum / n);
}

function mae(yTrue: number[], yPred: number[]): number {
  const n = yTrue.length;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += Math.abs(yTrue[i] - yPred[i]);
  }
  return sum / n;
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

const models = [
  { name: "Linear", preds: linPred },
  { name: "Polynomial (deg 3)", preds: polyPred },
  { name: "Exponential", preds: expPred },
  { name: "Power", preds: powPred },
];

console.log("Model             | R-squared | RMSE   | MAE");
console.log("------------------|-----------|--------|-------");

for (const { name, preds } of models) {
  const r2 = rSquared(yTest, preds);
  const rmseVal = rmse(yTest, preds);
  const maeVal = mae(yTest, preds);
  console.log(
    `${name.padEnd(18)}| ${(r2 * 100).toFixed(1).padStart(7)}% | ${rmseVal.toFixed(2).padStart(6)} | ${maeVal.toFixed(2)}`
  );
}
```

### Step 4: Interpret the results

| Metric | What It Means | Good Value |
|--------|--------------|------------|
| R-squared | Variance explained by the model | Close to 1.0 |
| RMSE | Average prediction error (same units as target) | As low as possible |
| MAE | Median-like error, less sensitive to outliers | As low as possible |

If R-squared is below 0.5, the linear model is a poor fit. Try polynomial or check if important features are missing.

## Tips

- Linear regression works best when the feature-target relationship is approximately linear.
- Polynomial degree > 5 usually overfits. Start with degree 2 or 3.
- There is no `svr()` export. Use ridge or lasso regression for regularized regression.
- Use `trainTestSplit` to evaluate on held-out data and avoid overfitting.

## See Also

- [Regularization Techniques](regularization.md) -- preventing overfitting with L1/L2 penalties
- [Non-linear Relationships](nonlinear.md) -- when linear regression is not enough
- [Scale Your Features](../preprocessing/scaling.md) -- essential for regularized models
