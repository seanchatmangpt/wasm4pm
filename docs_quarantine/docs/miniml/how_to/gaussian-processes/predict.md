# GP Prediction

Make predictions with uncertainty estimates using a fitted Gaussian Process model.

## What You'll Learn

- Predicting mean values from a GP model
- Reading prediction uncertainty (standard deviation)
- Understanding confidence intervals

## Prerequisites

```typescript
import { init, gpFit } from '@seanchatmangpt/wminml';
await init();
```

## Basic Prediction

```typescript
const X = new Float64Array([0.0, 1.0, 2.0, 3.0]);
const y = new Float64Array([0.5, 1.0, 1.5, 2.0]);
const model = gpFit(X, 1, y, 'rbf', [1.0], 0.1);

// Predict at a single new point
const pred = model.predict(new Float64Array([1.5]));

console.log(pred.mean[0]);    // predicted value (~1.25)
console.log(pred.std[0]);     // prediction uncertainty
console.log(pred.lower[0]);   // 95% CI lower bound
console.log(pred.upper[0]);   // 95% CI upper bound
console.log(pred.nTest());     // 1
```

## Batch Prediction

Predict at multiple points at once.

```typescript
const xTest = new Float64Array([0.5, 1.5, 2.5, 3.5, 10.0]);
const pred = model.predict(xTest);

for (let i = 0; i < pred.nTest(); i++) {
  console.log(
    `x=${xTest[i]}: mean=${pred.mean[i].toFixed(3)}, ` +
    `std=${pred.std[i].toFixed(3)}, ` +
    `CI=[${pred.lower[i].toFixed(3)}, ${pred.upper[i].toFixed(3)}]`
  );
}
```

## Uncertainty Increases Away from Training Data

The GP naturally produces wider confidence intervals for inputs far from the training set.

```typescript
const X = new Float64Array([0.0, 1.0]);
const y = new Float64Array([0.0, 1.0]);
const model = gpFit(X, 1, y, 'rbf', [1.0], 1e-6);

const near = model.predict(new Float64Array([0.5]));
const far  = model.predict(new Float64Array([10.0]));

console.log(`Near: std=${near.std[0].toFixed(4)}`);   // small uncertainty
console.log(`Far:  std=${far.std[0].toFixed(4)}`);    // large uncertainty
// far.std[0] > near.std[0] -- uncertainty grows with distance from training data
```

## Interpreting the Results

| Field | Description |
|-------|-------------|
| `mean[i]` | Predicted value at test point i |
| `std[i]` | Standard deviation of the prediction (uncertainty) |
| `lower[i]` | 95% confidence interval lower bound (mean - 1.96 * std) |
| `upper[i]` | 95% confidence interval upper bound (mean + 1.96 * std) |
| `nTest()` | Number of test points |

## Tips

- The 95% CI uses z = 1.96 (normal approximation).
- On training data, uncertainty should be near zero (when noise is small).
- Prediction uncertainty depends on the kernel bandwidth (gamma) and distance to training data.
- Test points must have the same number of features as the training data.
