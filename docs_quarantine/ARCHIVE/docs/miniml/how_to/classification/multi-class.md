# Multi-class Classification

Classify samples into three or more categories.

## Problem

Binary classification (two classes) is the simplest case. Real-world problems often have many categories -- species identification, document categorization, product type classification. You need a model that handles multiple classes natively.

## Solution

Most classifiers in miniml support multi-class classification directly. No one-vs-rest wrapping is needed.

### Step 1: Verify your labels

```typescript
import { labelEncoder } from "@seanchatmangpt/wminml";

// String labels need encoding to numeric values
const labels = [
  "cat", "dog", "bird", "cat", "dog", "bird", "cat", "bird", "dog", "cat",
];
const y = labelEncoder(labels);

console.log(`Encoded: ${JSON.stringify(y)}`);
// Output: Encoded: [1, 2, 0, 1, 2, 0, 1, 0, 2, 1]
```

### Step 2: Train multi-class models

```typescript
import {
  knnClassifier,
  decisionTree,
  naiveBayes,
  trainTestSplit,
  confusionMatrix,
  standardScaler,
} from "@seanchatmangpt/wminml";

const nFeatures = 4;

const { xTrain, xTest, yTrain, yTest } = trainTestSplit(
  data.flat(), y, 0.8, nFeatures
);

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

// KNN -- works naturally with multiple classes
const knn = knnClassifier(XTrainS, yTrain, { k: 5 });
const knnPred = knn.predict(XTestS);

// Naive Bayes -- computes per-class priors automatically
const nb = naiveBayes(XTrainS, yTrain);
const nbPred = nb.predict(XTestS);

// Decision Tree -- splits can create multiple branches
const dt = decisionTree(XTrainS, yTrain, { maxDepth: 6 });
const dtPred = dt.predict(XTestS);
```

### Step 3: Evaluate per-class performance

```typescript
const results = [
  { name: "KNN", preds: knnPred },
  { name: "Naive Bayes", preds: nbPred },
  { name: "Decision Tree", preds: dtPred },
];

for (const { name, preds } of results) {
  let correct = 0;
  for (let i = 0; i < yTest.length; i++) {
    if (preds[i] === yTest[i]) correct++;
  }
  const acc = correct / yTest.length;
  const cm = confusionMatrix(yTest, preds);
  console.log(`\n${name}: ${(acc * 100).toFixed(1)}%`);

  // Per-class recall from confusion matrix diagonal
  const nClasses = cm.length;
  for (let i = 0; i < nClasses; i++) {
    const row = cm[i];
    const total = row.reduce((a, b) => a + b, 0);
    const recall = total > 0 ? row[i] / total : 0;
    console.log(`  Class ${i}: recall=${(recall * 100).toFixed(1)}%`);
  }
}
```

### Step 4: Handle common multi-class issues

**Too many classes (high cardinality):** Naive Bayes handles this best because it estimates class-conditional probabilities independently. KNN degrades as classes increase because the nearest-neighbor vote gets diluted.

```typescript
// For high-cardinality problems, increase KNN neighbors
const knnHighCard = knnClassifier(XTrainS, yTrain, { k: 15 });
```

**Uneven class counts:** Some classes may have far fewer samples. Check per-class recall and resample if needed (see [Handle Imbalanced Data](imbalanced-data.md)).

## Tips

- Always encode string labels with `labelEncoder` before training.
- Inspect the confusion matrix for every multi-class problem -- overall accuracy hides per-class failures.
- Increase `maxDepth` for trees when you have many classes, so splits can separate all of them.
- Classifiers take 2D `number[][]` arrays, not flat arrays. Reshape flat data before passing to classifiers.

## See Also

- [Train a Classifier](train-model.md) -- model comparison and basics
- [Handle Imbalanced Data](imbalanced-data.md) -- when class counts are uneven
- [Encode Categorical Data](../preprocessing/encoding.md) -- converting string labels to numbers
