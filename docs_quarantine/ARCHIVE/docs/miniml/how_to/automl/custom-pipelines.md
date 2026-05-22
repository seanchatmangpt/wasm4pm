# Custom AutoML Pipelines

Combine feature selection, algorithm evaluation, and recommendation into a custom AutoML workflow.

## Problem

A single `autoFitClassification` or `autoFitRegression` call works well for standard use cases, but you need more control over the pipeline -- custom evaluation, specific algorithms, or multi-stage workflows.

## Solution

Chain AutoML calls with different configurations to build a tailored pipeline.

### Pipeline 1: Algorithm Recommendation Then Fit

Get a recommendation first, then fit the suggested model.

```typescript
import { recommendAlgorithm, autoFitClassification } from '@seanchatmangpt/wminml';

const X = [
  [0.8, 0.3, 0.9, 0.1, 0.7, 0.4],
  [0.2, 0.7, 0.3, 0.5, 0.1, 0.8],
  [0.5, 0.9, 0.7, 0.2, 0.5, 0.2],
  [0.1, 0.4, 0.2, 0.8, 0.3, 0.6],
  [0.9, 0.1, 0.8, 0.3, 0.9, 0.1],
  [0.4, 0.6, 0.5, 0.7, 0.2, 0.9],
  [0.7, 0.2, 0.6, 0.4, 0.8, 0.3],
  [0.3, 0.8, 0.4, 0.6, 0.4, 0.7],
];
const y = [1, 0, 1, 0, 1, 0, 1, 0];
const nSamples = X.length;
const nFeatures = X[0].length;

// Stage 1: Get algorithm recommendation
const recommendation = recommendAlgorithm(nSamples, nFeatures, 2, false);
console.log(`Recommended algorithm: ${recommendation}`);

// Stage 2: Run AutoML with the full feature set
const result = autoFitClassification(X.flat(), y, nSamples, nFeatures);

console.log(`\nPipeline result:`);
console.log(`  Algorithm: ${result.algorithm}`);
console.log(`  Accuracy:  ${result.accuracy.toFixed(4)}`);
```

### Pipeline 2: Compare Feature Subsets

Run AutoML on different feature subsets to find the best combination.

```typescript
// All features
const allResult = autoFitClassification(X.flat(), y, nSamples, nFeatures);
console.log(`All features (6): ${allResult.algorithm} = ${allResult.accuracy.toFixed(4)}`);

// Drop feature 3 (suspected noise)
const XReduced = X.map(row => [row[0], row[1], row[2], row[4], row[5]]);
const reducedResult = autoFitClassification(
  XReduced.flat(), y, nSamples, XReduced[0].length
);
console.log(`Without feature 3: ${reducedResult.algorithm} = ${reducedResult.accuracy.toFixed(4)}`);

// Compare
if (reducedResult.accuracy >= allResult.accuracy) {
  console.log('Feature 3 is noise -- dropping it improved or maintained accuracy.');
} else {
  console.log('Feature 3 is useful -- keep it.');
}
```

### Pipeline 3: Iterative Refinement

Run AutoML, examine the result, and refine based on what you learn.

```typescript
// Round 1: Quick scan
const quick = autoFitClassification(X.flat(), y, nSamples, nFeatures);
console.log(`Round 1 (quick): ${quick.algorithm} = ${quick.accuracy.toFixed(4)}`);

// Round 2: If accuracy is high enough, predict on new data
if (quick.accuracy > 0.85) {
  const newX = [[0.6, 0.5, 0.7, 0.3, 0.6, 0.5]];
  console.log('High accuracy achieved. Apply model to new data.');
} else {
  console.log('Accuracy below threshold -- consider more data or feature engineering.');
}
```

## Tips

- Use `autoFitClassification` for classification tasks and `autoFitRegression` for regression tasks. There is no generic `autoFit()`.
- Use `recommendAlgorithm()` to get a quick suggestion without the cost of fitting.
- The data passed to `autoFitClassification` / `autoFitRegression` must be flat `number[]` arrays with `nSamples` and `nFeatures` parameters.
- There are no `automlFit()` or `automlPredict()` functions. Use the correct function names.
- For production pipelines, cache the AutoML result and retrain periodically as new data arrives.
