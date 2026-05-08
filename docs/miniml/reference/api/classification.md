# Classification API

Complete reference for all classification algorithms exported by `miniml`. All classifiers accept a flat `Float64Array` in row-major order (`nSamples * nFeatures` values) and return a model object with a `predict` method.

---

## K-Nearest Neighbors

```ts
knnClassifier(data, labels, options?): Promise<KnnModel>
```

Lazy classifier using majority vote among k nearest training samples. Euclidean distance.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `data` | `number[][]` | -- | Training features (nSamples x nFeatures) |
| `labels` | `number[]` | -- | Training labels (nSamples, integer class ids) |
| `options.k` | `number` | `3` | Number of neighbors |

**Returns:** `KnnModel`

| Property / Method | Return Type | Description |
|--------------------|-------------|-------------|
| `.k` | `number` (readonly) | Number of neighbors |
| `.nSamples` | `number` (readonly) | Training sample count |
| `.predict(data)` | `Promise<number[]>` | Predicted class labels |
| `.predictProba(data)` | `Promise<number[]>` | Probability of class 1 (binary) |
| `.toString()` | `string` | Human-readable description |

```ts
const model = await knnClassifier([[1,2],[3,4],[5,6]], [0,0,1], { k: 5 });
const preds = await model.predict([[2,3]]);
```

---

## Decision Tree

```ts
decisionTree(data, targets, options?): Promise<DecisionTreeModel>
```

CART decision tree with Gini impurity (classification) or MSE (regression).

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `data` | `number[][]` | -- | Training features |
| `targets` | `number[]` | -- | Training labels or values |
| `options.maxDepth` | `number` | `10` | Maximum tree depth |
| `options.minSamplesSplit` | `number` | `2` | Minimum samples to split a node |
| `options.mode` | `'classify' \| 'regress'` | `'classify'` | Tree mode |

**Returns:** `DecisionTreeModel`

| Property / Method | Return Type | Description |
|--------------------|-------------|-------------|
| `.depth` | `number` (readonly) | Actual tree depth |
| `.nNodes` | `number` (readonly) | Total node count |
| `.predict(data)` | `Promise<number[]>` | Predicted labels or values |
| `.getTree()` | `number[]` | Flat tree array (6 values per node) |
| `.toString()` | `string` | Human-readable description |

---

## Random Forest

```ts
randomForestClassify(x, y, nTrees, maxDepth): Promise<RandomForestModel>
randomForestRegress(x, y, nTrees, maxDepth): Promise<RandomForestModel>
```

Bootstrap-aggregated ensemble of decision trees. Majority vote (classification) or averaging (regression).

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `x` | `number[]` | -- | Flat training features (nSamples * nFeatures) |
| `y` | `number[]` | -- | Training labels |
| `nTrees` | `number` | -- | Number of trees in ensemble |
| `maxDepth` | `number` | -- | Maximum depth per tree |

**Returns:** `RandomForestModel`

| Property / Method | Return Type | Description |
|--------------------|-------------|-------------|
| `.nTrees` | `number` (readonly) | Trees actually built |
| `.nFeatures` | `number` (readonly) | Feature dimensionality |
| `.predict(data)` | `number[]` | Predicted labels or values |
| `.toString()` | `string` | Human-readable description |

---

## Gradient Boosting

```ts
gradientBoostingClassify(x, y, nEstimators, learningRate, maxDepth): Promise<GradientBoostingModel>
```

Sequential ensemble of decision trees correcting prior errors.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `x` | `number[]` | -- | Flat training features |
| `y` | `number[]` | -- | Training labels |
| `nEstimators` | `number` | -- | Number of boosting rounds (trees) |
| `learningRate` | `number` | -- | Step size shrinkage (e.g. 0.1) |
| `maxDepth` | `number` | -- | Maximum depth per weak learner |

**Returns:** `GradientBoostingModel`

| Property / Method | Return Type | Description |
|--------------------|-------------|-------------|
| `.nTrees` | `number` (readonly) | Trees in ensemble |
| `.nFeatures` | `number` (readonly) | Feature dimensionality |
| `.learningRate` | `number` (readonly) | Configured learning rate |
| `.predict(data)` | `number[]` | Predicted class labels |
| `.predictProba(data)` | `number[]` | Class probabilities (flat, nClasses per sample) |
| `.toString()` | `string` | Human-readable description |

---

## AdaBoost

```ts
adaboostClassify(x, y, nEstimators): Promise<AdaBoostModel>
```

Adaptive boosting with weighted decision stumps.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `x` | `number[]` | -- | Flat training features |
| `y` | `number[]` | -- | Training labels (binary: 0 or 1) |
| `nEstimators` | `number` | -- | Number of weak learners |

**Returns:** `AdaBoostModel`

| Property / Method | Return Type | Description |
|--------------------|-------------|-------------|
| `.nEstimators` | `number` (readonly) | Number of stumps |
| `.nFeatures` | `number` (readonly) | Feature dimensionality |
| `.predict(data)` | `number[]` | Predicted class labels (0 or 1) |
| `.predictProba(data)` | `number[]` | Class probabilities (flat, 2 per sample) |
| `.toString()` | `string` | Human-readable description |

---

## Naive Bayes

```ts
naiveBayes(data, labels): Promise<NaiveBayesModel>
```

Gaussian Naive Bayes classifier. Assumes independent features with Gaussian distribution per class.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `data` | `number[][]` | -- | Training features |
| `labels` | `number[]` | -- | Training labels (integer class ids) |

**Returns:** `NaiveBayesModel`

| Property / Method | Return Type | Description |
|--------------------|-------------|-------------|
| `.nClasses` | `number` (readonly) | Number of unique classes |
| `.nFeatures` | `number` (readonly) | Feature dimensionality |
| `.predict(data)` | `Promise<number[]>` | Predicted class labels |
| `.predictProba(data)` | `Promise<number[][]>` | Class probabilities (nSamples x nClasses) |
| `.toString()` | `string` | Human-readable description |

---

## Logistic Regression

```ts
logisticRegression(data, labels, options?): Promise<LogisticModel>
```

Binary logistic regression via gradient descent with cross-entropy loss.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `data` | `number[][]` | -- | Training features |
| `labels` | `number[]` | -- | Training labels (0 or 1) |
| `options.learningRate` | `number` | `0.01` | Gradient descent step size |
| `options.maxIterations` | `number` | `1000` | Maximum training iterations |
| `options.lambda` | `number` | `0.0` | L2 regularization strength |

**Returns:** `LogisticModel`

| Property / Method | Return Type | Description |
|--------------------|-------------|-------------|
| `.bias` | `number` (readonly) | Bias term |
| `.iterations` | `number` (readonly) | Iterations run |
| `.loss` | `number` (readonly) | Final cross-entropy loss |
| `.getWeights()` | `number[]` | Weight vector copy |
| `.predict(data)` | `Promise<number[]>` | Predicted class labels (0 or 1) |
| `.predictProba(data)` | `Promise<number[]>` | Probability of class 1 |
| `.toString()` | `string` | Human-readable description |

---

## Linear SVM

```ts
linearSVM(x, y, lambda, maxIter, nSamples, nFeatures): Promise<LinearSVM>
```

Linear support vector machine using the PEGASOS subgradient descent algorithm with hinge loss.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `x` | `number[]` | -- | Flat training features |
| `y` | `number[]` | -- | Training labels (0 or 1) |
| `lambda` | `number` | -- | Regularization parameter (inverse of C) |
| `maxIter` | `number` | -- | Maximum iterations |
| `nSamples` | `number` | -- | Number of training samples |
| `nFeatures` | `number` | -- | Features per sample |

**Returns:** `LinearSVM`

| Property / Method | Return Type | Description |
|--------------------|-------------|-------------|
| `.nFeatures` | `number` (readonly) | Feature dimensionality |
| `.predict(data)` | `number[]` | Predicted class labels (0 or 1) |
| `.decisionFunction(data)` | `number[]` | Raw signed distance from hyperplane |
| `.toString()` | `string` | Human-readable description |

---

## Perceptron

```ts
perceptron(data, labels, options?): Promise<PerceptronModel>
```

Single-layer perceptron for binary classification. Uses -1/+1 internal representation.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `data` | `number[][]` | -- | Training features |
| `labels` | `number[]` | -- | Training labels (0 or 1) |
| `options.learningRate` | `number` | `0.01` | Learning rate |
| `options.maxIterations` | `number` | `1000` | Maximum training iterations |

**Returns:** `PerceptronModel`

| Property / Method | Return Type | Description |
|--------------------|-------------|-------------|
| `.bias` | `number` (readonly) | Bias term |
| `.iterations` | `number` (readonly) | Iterations run |
| `.converged` | `boolean` (readonly) | Whether the model converged |
| `.getWeights()` | `number[]` | Weight vector copy |
| `.predict(data)` | `Promise<number[]>` | Predicted class labels (0 or 1) |
| `.toString()` | `string` | Human-readable description |

---

## Classification Metrics

```ts
confusionMatrix(yTrue, yPred): Promise<number[][]>
classificationReport(yTrue, yPred): Promise<ClassificationReport>
```

| Function | Return Type | Description |
|----------|-------------|-------------|
| `confusionMatrix(yTrue, yPred)` | `number[][]` | nClasses x nClasses matrix |
| `classificationReport(yTrue, yPred)` | `{ precision, recall, f1, support }` | Per-class metrics (each `number[]`) |
