# Handle Imbalanced Data

Train classifiers that perform well when one class dominates the dataset.

## Problem

Your dataset has far more samples of one class than others. A model that always predicts the majority class can achieve high accuracy while being completely useless for the minority class. Standard accuracy alone hides this failure.

## Solution

Diagnose the imbalance with a confusion matrix, then use appropriate techniques to handle it.

### Step 1: Diagnose the problem

```typescript
import { confusionMatrix, naiveBayes } from "@seanchatmangpt/wminml";

// Train a model on imbalanced data (90% class 0, 10% class 1)
const model = naiveBayes(XTrain, yTrain);
const preds = model.predict(XTest);

// Accuracy looks fine but hides the real problem
let correct = 0;
for (let i = 0; i < yTest.length; i++) {
  if (preds[i] === yTest[i]) correct++;
}
const acc = correct / yTest.length;
console.log(`Accuracy: ${(acc * 100).toFixed(1)}%`); // might show 90%

// Confusion matrix reveals the truth
const cm = confusionMatrix(yTest, preds);
// For binary: cm[0][0]=true negatives, cm[0][1]=false positives,
//             cm[1][0]=false negatives, cm[1][1]=true positives
const fnRate = cm[1][0] / (cm[1][0] + cm[1][1]);
console.log(`False negative rate: ${(fnRate * 100).toFixed(1)}%`);
```

### Step 2: Resample the training data

The most practical approach is to balance the training set by oversampling the minority class or undersampling the majority class.

```typescript
function balanceByOversampling(
  X: number[][],
  y: number[]
): { X: number[][]; y: number[] } {
  // Count samples per class
  const counts = new Map<number, number>();
  for (const cls of y) {
    counts.set(cls, (counts.get(cls) || 0) + 1);
  }

  // Find the max class count
  const maxCount = Math.max(...counts.values());

  // Oversample minority classes
  const newX: number[][] = [];
  const newY: number[] = [];

  for (const [cls, count] of counts) {
    const classIndices: number[] = [];
    for (let i = 0; i < y.length; i++) {
      if (y[i] === cls) classIndices.push(i);
    }

    for (let r = 0; r < maxCount; r++) {
      const idx = classIndices[r % classIndices.length];
      newX.push(X[idx]);
      newY.push(cls);
    }
  }

  return { X: newX, y: newY };
}
```

### Step 3: Train on the balanced data

```typescript
import { decisionTree, knnClassifier } from "@seanchatmangpt/wminml";

const { X: XBal, y: yBal } = balanceByOversampling(XTrain, yTrain);

const model = decisionTree(XBal, yBal, { maxDepth: 5 });
const preds = model.predict(XTest);

// Now evaluate -- check per-class performance
const cm = confusionMatrix(yTest, preds);
console.log(`Balanced confusion matrix: ${JSON.stringify(cm)}`);
```

### Step 4: Choose the right model for imbalance

Not all classifiers handle imbalance equally. Prefer models that are less sensitive to class distribution.

| Classifier | Imbalance Sensitivity | Notes |
|------------|-----------------------|-------|
| Naive Bayes | Low | Prior probabilities naturally compensate |
| Decision Tree | Medium | Tends to favor majority class |
| KNN | High | Distance-based, minority gets swamped |
| Logistic Regression | High | Linear boundary shifts toward majority |

## Tips

- Always report per-class metrics from the confusion matrix, not just overall accuracy.
- For medical or fraud detection, false negatives are usually far more costly than false positives.
- Oversampling is generally safer than undersampling -- you keep all your data.
- Compute accuracy manually: `correct / total` -- there is no standalone `accuracy()` function.

## See Also

- [Train a Classifier](train-model.md) -- model comparison basics
- [Multi-class Classification](multi-class.md) -- handling multiple categories
- [Handle Missing Values](../preprocessing/missing-values.md) -- data quality before training
