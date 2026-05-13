# Your First ML Model

Train a classifier in 5 minutes with miniml. No Python, no servers, no setup beyond `npm install`.

## What You'll Learn

- How to prepare a dataset (2D arrays of numbers)
- Splitting data into training and test sets
- Training a KNN classifier and a Decision Tree
- Evaluating models with accuracy and confusion matrix

## Prerequisites

```bash
npm install @seanchatmangpt/wminml
```

That's it. miniml runs entirely in your browser or Node.js -- no external dependencies.

## Step 1: Prepare Your Data

miniml works with `number[][]` (2D arrays). Each row is one sample, each column is one feature.

Let's create a synthetic dataset: two overlapping clusters of points in 2D space.

```typescript
import {
  init, knnClassifier, decisionTree, confusionMatrix,
  classificationReport, trainTestSplit,
} from '@seanchatmangpt/wminml';

await init();

// 20 samples, 2 features each (x, y coordinates)
const data: number[][] = [
  // Cluster 0: centered around (2, 2)
  [1.1, 1.2], [1.5, 1.8], [2.0, 2.1], [1.8, 1.5], [2.3, 2.0],
  [1.4, 1.6], [2.2, 1.9], [1.7, 2.3], [2.5, 2.2], [1.3, 1.4],
  // Cluster 1: centered around (5, 5)
  [4.8, 5.1], [5.3, 4.9], [5.0, 5.5], [4.7, 5.2], [5.6, 5.0],
  [4.9, 4.8], [5.1, 5.4], [5.2, 4.6], [5.5, 5.3], [4.8, 5.0],
];

// Labels: 0 for first cluster, 1 for second cluster
const labels = [
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
];

const nFeatures = 2;
```

## Step 2: Split Into Train/Test

Never evaluate your model on the same data it trained on. Use `trainTestSplit` to create a holdout set.

```typescript
// 80% train, 20% test
const split = await trainTestSplit(
  data.flat(), labels, 0.8, nFeatures
);

console.log(`Training samples: ${split.yTrain.length}`);
console.log(`Test samples:     ${split.yTest.length}`);
```

`trainTestSplit` shuffles the data and returns `{ xTrain, xTest, yTrain, yTest }` as flat arrays. Convert back to 2D for training:

```typescript
function to2D(flat: number[], nFeatures: number): number[][] {
  const rows: number[][] = [];
  for (let i = 0; i < flat.length; i += nFeatures) {
    rows.push(Array.from(flat.slice(i, i + nFeatures)));
  }
  return rows;
}

const trainData = to2D(split.xTrain, nFeatures);
const testData = to2D(split.xTest, nFeatures);
```

## Step 3: Train a KNN Classifier

KNN (K-Nearest Neighbors) classifies a point by looking at its K closest neighbors and taking a vote. Simple, but surprisingly effective.

```typescript
const knnModel = await knnClassifier(trainData, split.yTrain, { k: 3 });

// Predict on test data
const knnPreds = knnModel.predict(testData);

console.log('KNN predictions:', knnPreds);
console.log('Actual labels:   ', split.yTest);
```

The `.predict()` method takes a 2D array of samples and returns an array of predicted labels.

## Step 4: Evaluate the Model

How well did it do? Compute accuracy manually and use the confusion matrix.

```typescript
const correct = knnPreds.filter((p, i) => p === split.yTest[i]).length;
const accuracy = correct / split.yTest.length;
console.log(`KNN Accuracy: ${(accuracy * 100).toFixed(1)}%`);

const cm = await confusionMatrix(split.yTest, knnPreds);
console.log('Confusion Matrix:');
console.log(`  Predicted  0   1`);
console.log(`  Actual 0  ${cm[0][0]}   ${cm[0][1]}`);
console.log(`  Actual 1  ${cm[1][0]}   ${cm[1][1]}`);
```

For a full report with precision, recall, and F1:

```typescript
const report = await classificationReport(split.yTest, knnPreds);
console.log('Classification Report:', report);
```

## Step 5: Try Another Algorithm

One model is never enough. Let's train a Decision Tree and compare.

```typescript
const dtModel = await decisionTree(trainData, split.yTrain, { maxDepth: 5 });

const dtPreds = dtModel.predict(testData);

const dtCorrect = dtPreds.filter((p, i) => p === split.yTest[i]).length;
const dtAccuracy = dtCorrect / split.yTest.length;
console.log(`Decision Tree Accuracy: ${(dtAccuracy * 100).toFixed(1)}%`);
console.log(`KNN Accuracy:          ${(accuracy * 100).toFixed(1)}%`);
```

Which one wins depends on your data. On this clean dataset with well-separated clusters, both should score close to 100%. Real-world data is messier -- that's where algorithm choice matters.

## Summary

1. **Data**: `number[][]` (2D array, rows = samples, columns = features)
2. **Split**: `trainTestSplit()` for train/test separation
3. **Train**: `knnClassifier()` or `decisionTree()` returns a model object
4. **Predict**: `model.predict(data)` for batch inference
5. **Evaluate**: `confusionMatrix()` and `classificationReport()` to measure performance

## Next Steps

- **Tutorial 02**: Let miniml choose the best algorithm for you with [AutoML Quick Start](./02-automl-quickstart.md)
- **How-to**: Explore all classification algorithms in [how_to/classification/](../how_to/classification/)
- **Reference**: Full API details in [packages/miniml/README.md](../../../packages/miniml/README.md)
