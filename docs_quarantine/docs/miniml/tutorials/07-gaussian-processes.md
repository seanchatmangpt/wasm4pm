# Gaussian Processes

In this tutorial you will learn how to use Gaussian Process (GP) regression in miniml to make predictions with quantified uncertainty. Unlike point-estimate methods (linear regression, random forests), a GP returns a full predictive distribution -- the mean tells you what to expect, and the standard deviation tells you how confident the model is.

## Prerequisites

- Node.js 18+ and `pnpm install` completed
- Familiarity with basic regression concepts (training data, predictions)
- The [Regression how-to guide](../how_to/regression/predict-values.md) is useful background

## Setup

```typescript
import {
  gpFit,
  gpPredict,
} from '@seanchatmangpt/wminml';
```

---

## Step 1: What Are Gaussian Processes?

A Gaussian Process is a collection of random variables, any finite number of which have a joint Gaussian distribution. In practice, you can think of it as:

- **An infinite-dimensional generalization of the normal distribution** applied to functions
- **A distribution over functions** -- not just over parameters
- **Non-parametric Bayesian regression** -- the complexity grows with the data, not with a fixed set of parameters

The key advantage: every prediction comes with an **uncertainty estimate**. The model is confident where it has seen data and uncertain where it has not.

### When to Use GPs

| Scenario | GP is a Good Fit |
|----------|-----------------|
| Small to medium datasets (< 5000 points) | Yes -- GPs scale as O(n^3) |
| You need uncertainty quantification | Yes -- primary strength |
| Noisy observations | Yes -- noise parameter handles this |
| Expensive data collection (experiments, sensors) | Yes -- uncertainty guides where to sample next |
| Real-time predictions on streaming data | No -- use point-estimate methods instead |

---

## Step 2: Prepare Training Data

GPs work with a matrix of input features `X` and a vector of target values `y`.

```typescript
// Synthetic data: y = sin(x) + noise
const nTrain = 20;
const X = new Float64Array(nTrain);
const y = new Float64Array(nTrain);

for (let i = 0; i < nTrain; i++) {
  const x = (i / (nTrain - 1)) * 2 * Math.PI;  // 0 to 2*pi
  X[i] = x;
  y[i] = Math.sin(x) + (Math.random() - 0.5) * 0.3;  // noisy sine
}

const nSamples = nTrain;
const nFeatures = 1;  // single input variable
```

For multi-dimensional inputs, flatten the feature matrix into a single `Float64Array` with row-major layout:

```typescript
// 2D example: X[i * nFeatures + j] = feature j of sample i
// const X = new Float64Array(nSamples * nFeatures);
```

---

## Step 3: Fit a GP Model

```typescript
const model = gpFit(
  X,            // training inputs (Float64Array)
  y,            // training targets (Float64Array)
  nSamples,     // number of training samples
  nFeatures,    // number of features per sample
  'rbf',        // kernel type: 'rbf', 'polynomial', 'matern'
  [1.0, 0.5],   // kernel parameters: [lengthScale, signalVariance]
  0.1           // observation noise (smaller = less noise tolerance)
);

console.log('GP model trained successfully.');
```

**Kernel choice matters:**

| Kernel | Behavior | Good For |
|--------|----------|----------|
| `rbf` (RBF/Gaussian) | Smooth, infinitely differentiable | Most functions, smooth data |
| `polynomial` | Polynomial trend | Data with polynomial structure |
| `matern` | Less smooth than RBF | Rougher functions, physical processes |

**Parameter tuning:**
- **Length scale** -- controls how quickly correlations decay with distance. Larger values = smoother functions.
- **Signal variance** -- controls the amplitude of variations. Larger values = wider confidence bands.
- **Noise** -- observation noise. Increase if your data is very noisy.

---

## Step 4: Make Predictions with Uncertainty

```typescript
// Create test points across the full range
const nTest = 50;
const xTest = new Float64Array(nTest);
for (let i = 0; i < nTest; i++) {
  xTest[i] = (i / (nTest - 1)) * 2 * Math.PI;
}

const predictions = gpPredict(model, xTest, nFeatures);

// Print a few predictions
console.log('\nPredictions (sample):');
console.log('x\t\tMean\t\tStd\t\t95% CI');
for (let i = 0; i < nTest; i += 5) {
  const { mean, std, ciLower, ciUpper } = {
    mean: predictions.mean[i],
    std: predictions.std[i],
    ciLower: predictions.ciLower[i],
    ciUpper: predictions.ciUpper[i],
  };
  console.log(
    `${xTest[i].toFixed(3)}\t\t` +
    `${mean.toFixed(4)}\t\t` +
    `${std.toFixed(4)}\t\t` +
    `[${ciLower.toFixed(3)}, ${ciUpper.toFixed(3)}]`
  );
}
```

**Output (illustrative):**

```
x               Mean            Std             95% CI
0.000           0.0523          0.3162          [-0.567, 0.672]
0.698           0.6832          0.1847          [0.321, 1.045]
1.396           0.9876          0.1123          [0.767, 1.208]
2.094           0.8234          0.1045          [0.619, 1.028]
2.793           0.3012          0.1789          [-0.050, 0.652]
```

Notice how the standard deviation is **small near training points** and **large in gaps between them**. This is the GP expressing more uncertainty where it has less information.

---

## Step 5: Interpreting Confidence Intervals

The 95% confidence interval (`ciLower` to `ciUpper`) means: if you repeated the data collection many times, 95% of the true function values would fall within this band.

```typescript
// Check how many true values fall within the CI
let withinCI = 0;
for (let i = 0; i < nTest; i++) {
  const trueValue = Math.sin(xTest[i]);
  if (trueValue >= predictions.ciLower[i] && trueValue <= predictions.ciUpper[i]) {
    withinCI++;
  }
}
console.log(`\nTrue values within 95% CI: ${withinCI}/${nTest} (${(withinCI / nTest * 100).toFixed(1)}%)`);
```

You should see approximately 95% coverage. If coverage is much lower, your kernel parameters or noise setting may need adjustment.

### Visualizing Uncertainty

A typical GP visualization shows:
1. **Mean line** -- the model's best prediction
2. **Shaded band** -- the confidence interval (often at 95% or 2 standard deviations)
3. **Training points** -- the actual observed data
4. **True function** -- (when available for validation)

The band width visually communicates uncertainty. Narrow bands = high confidence. Wide bands = the model needs more data in that region.

---

## Step 6: Practical Tips

### Choosing the Noise Parameter

```typescript
// Low noise (0.01): model closely fits training data, wider CIs
const smoothModel = gpFit(X, y, nSamples, nFeatures, 'rbf', [1.0, 0.5], 0.01);

// High noise (1.0): model smooths over data, narrower CIs
const roughModel = gpFit(X, y, nSamples, nFeatures, 'rbf', [1.0, 0.5], 1.0);
```

Start with a noise value around 1-10% of your target variable's range and adjust based on coverage.

### Extrapolation Warning

GPs are notoriously unreliable for extrapolation beyond the training data range. The mean reverts to the training mean and uncertainty explodes. Always check that your test points fall within the training domain.

```typescript
// Dangerous: predicting far outside training range
const xOutOfRange = new Float64Array([10, 15, 20]);
const extrapolation = gpPredict(model, xOutOfRange, nFeatures);
// The mean will be close to 0 (training mean) with huge std values
```

---

## What You Learned

| Concept | How |
|---------|-----|
| Train a GP model | `gpFit(X, y, nSamples, nFeatures, kernel, params, noise)` |
| Make predictions | `gpPredict(model, xTest, nFeatures)` |
| Get uncertainty | Access `.std`, `.ciLower`, `.ciUpper` from predictions |
| Choose a kernel | `rbf` for smooth data, `matern` for rougher data |
| Set noise | Match to your observation quality; check CI coverage |

## Next Steps

- [Fit a GP Model how-to](../how_to/gaussian-processes/fit.md) -- kernel selection and parameter tuning
- [Predict with Uncertainty how-to](../how_to/gaussian-processes/predict.md) -- multi-step prediction workflow
- [GP Regression explanation](../explanation/gaussian-processes/regression.md) -- mathematical foundations
- [GP Regression explanation](../explanation/gaussian-processes/regression.md) -- mathematical foundations and posterior variance
- [Compute Prediction Intervals how-to](../how_to/analytics/prediction-intervals.md) -- bootstrap vs GP intervals
