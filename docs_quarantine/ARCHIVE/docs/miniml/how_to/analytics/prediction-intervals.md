# Compute Prediction Intervals

Quantify uncertainty in your predictions using bootstrap confidence intervals and Gaussian Process prediction intervals.

## Problem

A point prediction (e.g., "the price will be $150") is not enough. You need to communicate how confident you are: "the price will be $150, plus or minus $20 with 95% confidence."

## Solution

miniml provides two approaches to prediction intervals: bootstrap (model-agnostic) and Gaussian Process (model-specific).

### Bootstrap Confidence Intervals

Bootstrap works with any model. Resample your data with replacement, retrain, and collect the distribution of predictions.

```typescript
import { mcBootstrap } from '@seanchatmangpt/wminml';

// Example: predict mean house price from a small sample
const housePrices = [320, 350, 280, 410, 390, 310, 360, 340, 300, 370];

const result = mcBootstrap(housePrices, 1000, 42);

console.log('Bootstrap 95% confidence interval for mean house price:');
console.log(`  Estimate:    $${result.estimate.toFixed(0)}`);
console.log(`  Std error:    $${result.stdError.toFixed(2)}`);
console.log(`  95% CI:       [$${result.ciLower.toFixed(0)}, $${result.ciUpper.toFixed(0)}]`);
console.log(`  Bootstrap samples: ${result.nBootstrap}`);
```

**Interpretation:** "We are 95% confident that the true mean house price is between $306 and $366."

### Bootstrap with Model Predictions

For model predictions, bootstrap the residuals:

```typescript
import { mcBootstrap } from '@seanchatmangpt/wminml';

// Simulated model predictions vs actuals
const residuals = [
  -2.1, 1.3, -0.8, 3.2, -1.5,
  0.7, -2.9, 1.1, -0.3, 2.4,
  -1.8, 0.5, -0.6, 1.9, -1.2,
];

const result = mcBootstrap(residuals, 2000, 42);

console.log('Prediction uncertainty (residual bootstrap):');
console.log(`  Mean residual:   ${result.estimate.toFixed(4)}`);
console.log(`  Residual std:    ${result.stdError.toFixed(4)}`);
console.log(`  95% CI residual: [${result.ciLower.toFixed(4)}, ${result.ciUpper.toFixed(4)}]`);

// For a new prediction of 150, the interval is:
const pointPrediction = 150;
const ciWidth = (result.ciUpper - result.ciLower) / 2;
console.log(`\nFor prediction ${pointPrediction}:`);
console.log(`  95% CI: [${(pointPrediction - ciWidth).toFixed(1)}, ${(pointPrediction + ciWidth).toFixed(1)}]`);
```

### Gaussian Process Prediction Intervals

GP models provide prediction intervals directly -- this is their primary advantage over other regression methods.

```typescript
import { gpFit, gpPredict } from '@seanchatmangpt/wminml';

// Training data
const nTrain = 15;
const X = new Float64Array(nTrain);
const y = new Float64Array(nTrain);
for (let i = 0; i < nTrain; i++) {
  X[i] = i * 0.5;
  y[i] = 2.0 * X[i] + Math.sin(X[i]) + (Math.random() - 0.5) * 0.5;
}

// Fit GP
const model = gpFit(X, y, nTrain, 1, 'rbf', [2.0, 1.0], 0.2);

// Predict at new points
const xTest = new Float64Array([0.25, 1.0, 2.5, 4.0, 6.0]);
const pred = gpPredict(model, xTest, 1);

console.log('GP predictions with 95% intervals:');
console.log('x\tMean\tStd\tCI Lower\tCI Upper');
for (let i = 0; i < xTest.length; i++) {
  console.log(
    `${xTest[i].toFixed(2)}\t` +
    `${pred.mean[i].toFixed(3)}\t` +
    `${pred.std[i].toFixed(3)}\t` +
    `${pred.ciLower[i].toFixed(3)}\t\t` +
    `${pred.ciUpper[i].toFixed(3)}`
  );
}
```

**Key observation:** The standard deviation is larger for test points far from training data. This is the GP honestly expressing uncertainty where it has less information.

### Comparing Methods

| Method | Works With | Interval Type | Speed |
|--------|-----------|---------------|-------|
| Bootstrap | Any model | Resampling-based | Moderate (1000+ resamples) |
| Gaussian Process | GP models only | Posterior variance | Slow for large datasets (O(n^3) training) |
| Monte Carlo integration | Any function | Sampling-based | Fast |

## Interpreting Uncertainty

A 95% prediction interval means: if you repeated the experiment many times, approximately 95% of true values would fall within the interval.

- **Narrow interval** -- the model is confident. Either it has plenty of nearby training data, or the underlying relationship is well-determined.
- **Wide interval** -- the model is uncertain. Consider collecting more data in that region or using a more expressive model.
- **Interval width varies** -- this is a feature, not a bug. It tells you where you need more data.

## Tips

- Use at least 1000 bootstrap samples for stable confidence intervals.
- For GP models, always check CI coverage on held-out data. If coverage is below 95%, increase the noise parameter.
- Report both the point estimate and the interval width to stakeholders. The interval communicates risk.
- Bootstrap intervals assume the data distribution is representative. If your training data has gaps, the intervals may be misleading.
