# Train a Classifier

Choose and train the right classification model for your dataset.

## Problem

You have labeled data with known categories and need a model that predicts the class of new, unseen samples. Different classifiers excel under different conditions -- some handle non-linear boundaries, some are fast to train, and some resist overfitting.

## Solution

Start with a simple model, then try more complex ones. Compare their accuracy on a held-out test set.

### Step 1: Prepare the data

```typescript
import {
  trainTestSplit,
  standardScaler,
  confusionMatrix,
} from "@seanchatmangpt/wminml";

// 2D arrays: 4 features x 100 samples
const data = [
  /* feature rows: [f0, f1, f2, f3], ... */
];
const labels = [
  /* class labels: 0, 1, 2, ... */
];
const nFeatures = 4;

const { xTrain, xTest, yTrain, yTest } = trainTestSplit(
  data.flat(), labels, 0.8, nFeatures
);

// Scale features for distance-based models
const xTrainS = standardScaler(xTrain, nFeatures);
const xTestS = standardScaler(xTest, nFeatures);

// Reshape flat arrays back to 2D for classifiers
const XTrainS = [];
const XTestS = [];
for (let i = 0; i < xTrainS.length; i += nFeatures) {
  XTrainS.push(xTrainS.slice(i, i + nFeatures));
}
for (let i = 0; i < xTestS.length; i += nFeatures) {
  XTestS.push(xTestS.slice(i, i + nFeatures));
}
```

### Step 2: Train multiple classifiers

```typescript
import {
  knnClassifier,
  decisionTree,
  naiveBayes,
  logisticRegression,
} from "@seanchatmangpt/wminml";

// KNN -- good baseline, non-parametric
const knnModel = knnClassifier(XTrainS, yTrain, { k: 5 });
const knnPred = knnModel.predict(XTestS);

// Decision Tree -- interpretable, handles mixed features
const dtModel = decisionTree(XTrainS, yTrain, { maxDepth: 5 });
const dtPred = dtModel.predict(XTestS);

// Naive Bayes -- fast, works well with high-dimensional data
const nbModel = naiveBayes(XTrainS, yTrain);
const nbPred = nbModel.predict(XTestS);

// Logistic Regression -- fast linear baseline
const lrModel = logisticRegression(XTrainS, yTrain, {
  maxIterations: 100,
  learningRate: 0.01,
});
const lrPred = lrModel.predict(XTestS);
```

### Step 3: Compare results

```typescript
const models = [
  { name: "KNN", preds: knnPred },
  { name: "Decision Tree", preds: dtPred },
  { name: "Naive Bayes", preds: nbPred },
  { name: "Logistic Regression", preds: lrPred },
];

for (const { name, preds } of models) {
  // Compute accuracy manually (correct / total)
  let correct = 0;
  for (let i = 0; i < yTest.length; i++) {
    if (preds[i] === yTest[i]) correct++;
  }
  const acc = correct / yTest.length;

  const cm = confusionMatrix(yTest, preds);
  console.log(`${name}: accuracy=${acc.toFixed(3)}`);
  console.log(`  Confusion matrix: ${JSON.stringify(cm)}`);
}
```

### Step 4: Pick the right model

| Condition | Best Choice |
|-----------|-------------|
| Small dataset (< 100 samples) | KNN or Naive Bayes |
| Need interpretability | Decision Tree |
| Best accuracy, no tuning | Naive Bayes or Logistic Regression |
| Very high-dimensional features | Naive Bayes or Logistic Regression |
| Speed-critical prediction | Logistic Regression |

## Tips

- Always scale features before using KNN or Logistic Regression.
- Decision trees are prone to overfitting -- limit `maxDepth` or increase `minSamplesSplit`.
- Use `trainTestSplit` with `trainRatio: 0.8` to hold out data for honest evaluation.
- Classifiers take 2D `number[][]` arrays, not flat arrays. Reshape flat data before passing to classifiers.

## See Also

- [Handle Imbalanced Data](imbalanced-data.md) -- when classes are not evenly distributed
- [Multi-class Classification](multi-class.md) -- classifying into more than two categories
- [Scale Your Features](../preprocessing/scaling.md) -- preparing numeric features for training
