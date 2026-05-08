# Cox Proportional Hazards

Model the effect of covariates on survival using Cox proportional hazards regression.

## What You'll Learn

- Fitting a Cox proportional hazards model
- Interpreting hazard ratios
- Understanding which features affect survival

## Prerequisites

```typescript
import { init, coxProportionalHazards } from '@seanchatmangpt/wminml';
await init();
```

## Fit a Cox Model

```typescript
// 5 patients, 2 features each (age, treatment)
const features = new Float64Array([
  45, 1,  // patient 0: age 45, treatment=1
  50, 0,  // patient 1: age 50, treatment=0
  60, 1,  // patient 2: age 60, treatment=1
  55, 0,  // patient 3: age 55, treatment=0
  40, 1,  // patient 4: age 40, treatment=1
]);
const nFeatures = 2;
const times = new Float64Array([30, 15, 25, 20, 35]);
const events = new Float64Array([1, 1, 1, 1, 1]);

const result = coxProportionalHazards(features, nFeatures, times, events, 100, 0.01);

console.log(result.coefficients);  // [beta1, beta2]
console.log(result.hazardRatios);  // [exp(beta1), exp(beta2)]
console.log(result.logLikelihood); // log partial likelihood
console.log(result.nFeatures);     // 2
```

## Interpreting Hazard Ratios

The hazard ratio `exp(beta)` is the key output:

| Hazard Ratio | Interpretation |
|-------------|----------------|
| HR = 1.0 | Feature has no effect on hazard |
| HR > 1.0 | Feature increases hazard (worse survival) |
| HR < 1.0 | Feature decreases hazard (better survival) |

```typescript
const hr = result.hazardRatios;

console.log(`Age HR: ${hr[0].toFixed(3)}`);
if (hr[0] > 1.0) {
  console.log('  Each year of age increases hazard by ' +
    `${((hr[0] - 1) * 100).toFixed(1)}%`);
}

console.log(`Treatment HR: ${hr[1].toFixed(3)}`);
if (hr[1] < 1.0) {
  console.log('  Treatment reduces hazard by ' +
    `${((1 - hr[1]) * 100).toFixed(1)}%`);
}
```

## Parameters

| Parameter | Description |
|-----------|-------------|
| `features` | Covariate matrix (row-major: n_samples x n_features) |
| `nFeatures` | Number of covariates per sample |
| `times` | Survival/censoring times |
| `events` | Event indicators (1.0 = event, 0.0 = censored) |
| `maxIter` | Maximum iterations for gradient descent |
| `lr` | Learning rate for optimization |

## Tips

- The Cox model is semi-parametric: it does not assume a specific baseline hazard.
- Features should be standardized (mean 0, std 1) for stable coefficient estimates.
- The number of samples must match across features, times, and events.
- `features.length` must be divisible by `nFeatures`.
- Convergence depends on the learning rate and data scale. Try `lr` between 0.001 and 0.1.
