# Automatic Feature Selection

Use miniml's genetic algorithm (GA) to automatically identify the most informative features in your dataset before training.

## Problem

You have a dataset with many features, but only some of them contribute to predictive accuracy. Including irrelevant features increases overfitting risk, slows training, and makes models harder to interpret.

## Solution

Use `autoFitClassification` or `autoFitRegression` to run a GA-based search over feature subsets.

```typescript
import { autoFitClassification, trainTestSplit } from '@seanchatmangpt/wminml';

// Dataset: 5 features, but only features 0, 2, and 4 are predictive
const X = [
  [0.8, 0.3, 0.9, 0.1, 0.7],
  [0.2, 0.7, 0.3, 0.5, 0.1],
  [0.5, 0.9, 0.7, 0.2, 0.5],
  [0.1, 0.4, 0.2, 0.8, 0.3],
  [0.9, 0.1, 0.8, 0.3, 0.9],
  [0.4, 0.6, 0.5, 0.7, 0.2],
  [0.7, 0.2, 0.6, 0.4, 0.8],
  [0.3, 0.8, 0.4, 0.6, 0.4],
  [0.6, 0.5, 0.1, 0.9, 0.6],
  [0.0, 0.1, 0.9, 0.0, 0.9],
];
const y = [1, 0, 1, 0, 1, 0, 1, 0, 1, 1];
const nSamples = X.length;
const nFeatures = X[0].length;

// Flatten to 1D arrays for autoFitClassification
const xFlat = X.flat();
const result = autoFitClassification(xFlat, y, nSamples, nFeatures);

console.log(`Algorithm:  ${result.algorithm}`);
console.log(`Accuracy:   ${result.accuracy.toFixed(4)}`);
```

## Interpreting the Feature Mask

The AutoML result includes information about which features were selected. Features that are dropped are those the GA determined to be uninformative or redundant.

To manually inspect feature importance, compare performance with and without specific features:

```typescript
// Baseline: all features
const allFeatures = autoFitClassification(xFlat, y, nSamples, nFeatures);
console.log(`All features:     accuracy = ${allFeatures.accuracy.toFixed(4)}`);

// Manual: drop features 1 and 3 (suspected noise)
const XReduced = X.map(row => [row[0], row[2], row[4]]);
const nFeaturesReduced = 3;
const reducedFlat = XReduced.flat();
const manual = autoFitClassification(reducedFlat, y, nSamples, nFeaturesReduced);
console.log(`Manual [0,2,4]:   accuracy = ${manual.accuracy.toFixed(4)}`);
```

## When to Use Feature Selection

| Situation | Use Feature Selection |
|-----------|----------------------|
| Many features (> 10) with limited samples | Yes -- prevents overfitting |
| Domain knowledge suggests irrelevant features | Yes -- validates intuition |
| Features are highly correlated | Yes -- removes redundancy |
| Very few features (< 5) | Probably not needed |
| All features are known to be important | No -- wastes computation |

## Tips

- Use `autoFitClassification` for classification tasks and `autoFitRegression` for regression tasks. There is no generic `autoFit()`.
- Feature selection adds computational cost. Budget 2-5x more time than a standard fit call.
- If feature selection does not improve accuracy, your original features may already be well-chosen.
- For algorithm recommendations without fitting, use `recommendAlgorithm(nSamples, nFeatures, nClasses, isSparse)`.
