# Hyperparameter Tuning

Use miniml's AutoML functions to automatically find the best model and hyperparameters.

## Problem

Model performance depends heavily on hyperparameters (learning rate, regularization strength, tree depth, etc.). Manual tuning is tedious and often suboptimal.

## Solution

`autoFitClassification` and `autoFitRegression` use PSO (Particle Swarm Optimization) internally to search the hyperparameter space. They try multiple algorithms and return the best one.

### Basic Usage (Classification)

```typescript
import { autoFitClassification } from '@seanchatmangpt/wminml';

const X = [
  [1.2, 3.4], [2.1, 5.6], [3.3, 2.1], [4.5, 7.8],
  [5.1, 1.2], [6.7, 4.5], [7.2, 8.9], [8.1, 3.3],
  [0.5, 6.7], [9.0, 2.0],
];
const y = [0, 0, 1, 1, 0, 1, 1, 0, 0, 1];
const nSamples = X.length;
const nFeatures = X[0].length;

const result = autoFitClassification(X.flat(), y, nSamples, nFeatures);

console.log(`Best algorithm: ${result.algorithm}`);
console.log(`Best accuracy:  ${result.accuracy.toFixed(4)}`);
```

### Basic Usage (Regression)

```typescript
import { autoFitRegression } from '@seanchatmangpt/wminml';

const XReg = [
  [1.0], [2.0], [3.0], [4.0], [5.0],
  [6.0], [7.0], [8.0], [9.0], [10.0],
];
const yReg = [2.1, 4.0, 6.2, 7.8, 10.1, 12.3, 13.9, 16.0, 18.2, 20.1];
const nSamplesReg = XReg.length;
const nFeaturesReg = 1;

const regResult = autoFitRegression(XReg.flat(), yReg, nSamplesReg, nFeaturesReg);

console.log(`Best algorithm: ${regResult.algorithm}`);
console.log(`Best accuracy:  ${regResult.accuracy.toFixed(4)}`);
```

### Get Algorithm Recommendation

Use `recommendAlgorithm` to get a suggestion without fitting:

```typescript
import { recommendAlgorithm } from '@seanchatmangpt/wminml';

const recommendation = recommendAlgorithm(
  nSamples,   // number of samples
  nFeatures,  // number of features
  2,          // number of classes (for classification)
  false       // isSparse
);

console.log(`Recommended algorithm: ${recommendation}`);
```

### Comparing Algorithms

AutoML tries multiple algorithms and returns the best one. The `algorithm` field tells you which won:

```typescript
if (result.algorithm.includes('random_forest')) {
  console.log('Ensemble method won -- dataset benefits from bagging');
} else if (result.algorithm.includes('knn')) {
  console.log('KNN won -- dataset is locally structured');
}
```

## Tips

- Use `autoFitClassification` for classification tasks and `autoFitRegression` for regression tasks. There is no generic `autoFit()`.
- There are no `automlFit()` or `automlPredict()` functions. Use the correct function names.
- If accuracy stays low despite tuning, the problem may be in the features, not the hyperparameters. Try feature selection or feature engineering.
- The data passed to `autoFitClassification` / `autoFitRegression` must be flat `number[]` arrays with `nSamples` and `nFeatures` parameters.
