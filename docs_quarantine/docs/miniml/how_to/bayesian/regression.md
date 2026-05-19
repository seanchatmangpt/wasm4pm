# Bayesian Linear Regression

Fit a linear regression with uncertainty estimates using conjugate priors.

## What You'll Learn

- Fitting a Bayesian linear regression model
- Getting uncertainty estimates for coefficients
- Predicting with the fitted model

## Prerequisites

```typescript
import { init, bayesianLinearRegression } from '@seanchatmangpt/wminml';
await init();
```

## Fit a Model

`bayesianLinearRegression` uses a conjugate normal-inverse-gamma prior for closed-form posterior inference.

```typescript
// Data: y = 3x + 2 (with some noise)
const X = new Float64Array([1.0, 2.0, 3.0, 4.0, 5.0]);
const y = new Float64Array([5.0, 8.0, 11.0, 14.0, 17.0]);
const nFeatures = 1;

const model = bayesianLinearRegression(X, nFeatures, y, 0.01, 0.001, 1.0);

console.log(model.coefficients());     // [~3.0]
console.log(model.coefficientStd());   // [~0.0x] -- uncertainty in slope
console.log(model.intercept());        // ~2.0
console.log(model.interceptStd());     // uncertainty in intercept
console.log(model.nFeatures());        // 1
```

## Understanding the Prior Parameters

| Parameter | Description | Effect |
|-----------|-------------|--------|
| `priorPrecision` | Precision of the weight prior (ridge-like) | Higher = stronger regularization, coefficients shrink toward 0 |
| `priorAlpha` | Shape parameter of the inverse-gamma prior on noise variance | Higher = stronger belief in low noise |
| `priorBeta` | Scale parameter of the inverse-gamma prior on noise variance | Higher = prior expects more noise |

```typescript
// Weak prior (let data speak)
const model1 = bayesianLinearRegression(X, 1, y, 0.01, 0.001, 1.0);

// Strong prior (regularize toward zero)
const model2 = bayesianLinearRegression(X, 1, y, 10.0, 0.001, 1.0);
```

## Predict with Uncertainty

```typescript
const prediction = model.predict([6.0]);
console.log(prediction);  // ~20.0 (3*6 + 2)
```

## Multivariate Regression

```typescript
// y = 2*x1 + 3*x2 + 1
const X = new Float64Array([
  1.0, 0.0,
  0.0, 1.0,
  1.0, 1.0,
  2.0, 1.0,
  1.0, 2.0,
]);
const y = new Float64Array([3.0, 4.0, 6.0, 8.0, 9.0]);

const model = bayesianLinearRegression(X, 2, y, 0.01, 1.0, 1.0);

console.log(model.coefficients());   // [~2.0, ~3.0]
console.log(model.intercept());      // ~1.0
console.log(model.coefficientStd()); // uncertainty per coefficient
```

## Tips

- Need at least 2 samples to fit the model.
- Data length must be divisible by `nFeatures`.
- The `coefficientStd` array gives per-coefficient uncertainty estimates.
- Higher `priorPrecision` acts like ridge regularization.
- Unlike ordinary least squares, Bayesian regression naturally quantifies uncertainty.
