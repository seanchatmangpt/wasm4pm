# All Algorithms

Complete list of algorithms available in miniml, organized by family.

## Classification

| Algorithm | Function | Description | Key Parameters |
|-----------|----------|-------------|----------------|
| KNN | `knnClassifier(data, labels, { k? })` | K-Nearest Neighbors classifier | `k` (default 3) |
| Decision Tree | `decisionTree(data, targets, { maxDepth?, minSamplesSplit?, mode? })` | CART decision tree (classify or regress) | `maxDepth` (default 10), `minSamplesSplit` (default 2), `mode` |
| Random Forest | `randomForestClassify(x, y, nFeatures, nTrees, maxDepth)` | Ensemble of decision trees | `nTrees`, `maxDepth` |
| Logistic Regression | `logisticRegression(data, labels, { learningRate?, maxIterations?, lambda? })` | Binary classification via sigmoid | `learningRate` (default 0.01), `maxIterations` (default 1000), `lambda` |
| Naive Bayes | `naiveBayes(data, labels)` | Gaussian Naive Bayes classifier | (no hyperparameters) |
| Linear SVM | `linearSVM(x, y, nFeatures, lambda, maxIter, learningRate?)` | PEGASOS linear SVM | `lambda`, `maxIter`, `learningRate` |
| Perceptron | `perceptron(data, labels, { learningRate?, maxIterations? })` | Single-layer linear classifier | `learningRate` (default 0.01), `maxIterations` (default 1000) |
| Gradient Boosting | `gradientBoostingClassify(x, y, nFeatures, nTrees, maxDepth, learningRate)` | Sequential ensemble boosting | `nTrees`, `maxDepth`, `learningRate` |
| AdaBoost | `adaboostClassify(x, y, nFeatures, nEstimators, learningRate?)` | Adaptive boosting ensemble | `nEstimators`, `learningRate` (default 0.1) |

All classifiers that accept `number[][]` data return a model with `.predict(data: number[][])` and `.toString()`.

### Classification Examples

```typescript
import { init, knnClassifier, decisionTree, naiveBayes, logisticRegression } from '@seanchatmangpt/wminml';
await init();

// KNN
const knnModel = await knnClassifier(
  [[1, 2], [3, 4], [5, 6]], [0, 1, 1], { k: 3 }
);
const knnPreds = knnModel.predict([[2, 3], [4, 5]]);

// Decision Tree
const treeModel = await decisionTree(
  [[1, 2], [3, 4], [5, 6]], [0, 1, 1], { maxDepth: 5, mode: 'classify' }
);
const treePreds = treeModel.predict([[2, 3]]);

// Naive Bayes
const nbModel = await naiveBayes(
  [[1, 2], [3, 4], [5, 6]], [0, 1, 1]
);
const nbPreds = nbModel.predict([[2, 3]]);

// Logistic Regression
const lrModel = await logisticRegression(
  [[1, 2], [3, 4], [5, 6]], [0, 1, 1], { learningRate: 0.01, maxIterations: 500, lambda: 0.01 }
);
const lrPreds = lrModel.predict([[2, 3]]);
```

## Regression

| Algorithm | Function | Description | Key Parameters |
|-----------|----------|-------------|----------------|
| Linear Regression | `linearRegression(x, y)` | Ordinary least squares | (no hyperparameters) |
| Simple Linear Regression | `linearRegressionSimple(y)` | Auto-generated x (0, 1, 2, ...) | (no hyperparameters) |
| Polynomial Regression | `polynomialRegression(x, y, { degree? })` | Polynomial feature mapping + linear fit | `degree` (default 2) |
| Exponential Regression | `exponentialRegression(x, y)` | y = a * e^(b*x) | (no hyperparameters) |
| Logarithmic Regression | `logarithmicRegression(x, y)` | y = a + b * ln(x) | (no hyperparameters) |
| Power Regression | `powerRegression(x, y)` | y = a * x^b | (no hyperparameters) |
| Ridge Regression | `ridgeRegression(x, y, nFeatures, alpha)` | L2-regularized regression | `alpha` (regularization strength) |
| Lasso Regression | `lassoRegression(x, y, nFeatures, alpha, maxIter?, tol?)` | L1-regularized regression | `alpha`, `maxIter` (default 1000), `tol` (default 1e-4) |
| Random Forest Regression | `randomForestRegress(x, y, nFeatures, nTrees, maxDepth)` | Ensemble regression trees | `nTrees`, `maxDepth` |

All regression models return an object with `.predict(x: number[])` and `.toString()`.

### Regression Examples

```typescript
import { init, linearRegression, polynomialRegression, ridgeRegression } from '@seanchatmangpt/wminml';
await init();

// Linear Regression
const linModel = await linearRegression([1, 2, 3, 4], [2, 4, 6, 8]);
console.log(linModel.slope);     // 2
console.log(linModel.intercept); // 0
console.log(linModel.rSquared);  // 1
const linPreds = linModel.predict([5, 6]); // [10, 12]

// Polynomial Regression
const polyModel = await polynomialRegression([0, 1, 2, 3], [1, 2, 5, 10], { degree: 2 });
console.log(polyModel.getCoefficients()); // [c0, c1, c2]

// Ridge Regression
const ridgeModel = await ridgeRegression(xFlat, yFlat, nFeatures, 0.5);
const ridgePreds = ridgeModel.predict(testX);
```

## Clustering

| Algorithm | Function | Description | Key Parameters |
|-----------|----------|-------------|----------------|
| K-Means | `kmeans(data, { k, maxIterations? })` | Lloyd's algorithm | `k`, `maxIterations` (default 100) |
| K-Means++ | `kmeansPlus(x, nFeatures, nClusters, maxIter?)` | Smart initialization | `nClusters`, `maxIter` (default 100) |
| DBSCAN | `dbscan(data, { eps, minPoints? })` | Density-based clustering | `eps`, `minPoints` (default 5) |
| Hierarchical | `hierarchicalClustering(x, nFeatures, nClusters)` | Agglomerative clustering | `nClusters` |

### Clustering Examples

```typescript
import { init, kmeans, dbscan, kmeansPlus, hierarchicalClustering } from '@seanchatmangpt/wminml';
await init();

// K-Means (takes number[][] data)
const kmModel = await kmeans([[1, 2], [3, 4], [5, 6]], { k: 2, maxIterations: 100 });
console.log(kmModel.getCentroids());   // cluster centers
console.log(kmModel.getAssignments()); // cluster labels per sample
console.log(kmModel.inertia);          // sum of squared distances

// DBSCAN (takes number[][] data)
const dbResult = await dbscan([[1, 2], [3, 4], [10, 12]], { eps: 2.0, minPoints: 2 });
console.log(dbResult.nClusters); // number of clusters found
console.log(dbResult.nNoise);    // number of noise points
console.log(dbResult.getLabels()); // cluster labels per sample

// K-Means++ (takes flat number[])
const plusLabels = await kmeansPlus(xFlat, nFeatures, 3, 100);

// Hierarchical (takes flat number[])
const hierLabels = await hierarchicalClustering(xFlat, nFeatures, 3);
```

## Preprocessing

### Scalers (take flat `number[]` + `nFeatures`, return `number[]`)

| Scaler | Function | Description |
|--------|----------|-------------|
| Standard Scaler | `standardScaler(x, nFeatures)` | Zero mean, unit variance (z-score) |
| Min-Max Scaler | `minMaxScaler(x, nFeatures)` | Scale to [0, 1] |
| Robust Scaler | `robustScaler(x, nFeatures)` | Median and IQR scaling |
| Normalizer | `normalizer(x, nFeatures, norm?)` | L2 row normalization (default `'l2'`) |

### Encoders (return `number[]`)

| Encoder | Function | Description |
|---------|----------|-------------|
| Label Encoder | `labelEncoder(y, nFeatures?)` | Encode labels as integers |
| One-Hot Encoder | `oneHotEncoder(y, nFeatures)` | Binary column encoding |
| Ordinal Encoder | `ordinalEncoder(y, nFeatures?)` | Order-preserving integer encoding |

### Other

| Preprocessing | Function | Description |
|---------------|----------|-------------|
| PCA | `pca(data, { nComponents? })` | Principal Component Analysis |
| Simple Imputer | `simpleImputer(x, nFeatures, strategy?, fillValue?)` | Fill missing values (`'mean'`, `'median'`, `'most_frequent'`) |
| Feature Importance | `featureImportance(x, y, nFeatures, nEstimators?)` | Decision tree feature importance |
| Feature Importance (Forest) | `featureImportanceForest(x, y, nFeatures, nTrees, maxDepth?)` | Random forest feature importance |
| Train/Test Split | `trainTestSplit(x, y, trainRatio, nFeatures)` | Split data into training and test sets |

### Preprocessing Examples

```typescript
import { init, standardScaler, minMaxScaler, labelEncoder, pca, simpleImputer, trainTestSplit } from '@seanchatmangpt/wminml';
await init();

// Scalers (take flat arrays + nFeatures)
const scaled = await standardScaler(xFlat, nFeatures);
const normalized = await minMaxScaler(xFlat, nFeatures);

// Encoders
const encoded = await labelEncoder(yFlat);
const oneHot = await oneHotEncoder(yFlat, nFeatures);

// PCA (takes number[][] data)
const pcaResult = await pca(dataMatrix, { nComponents: 2 });
console.log(pcaResult.getComponents());         // principal components
console.log(pcaResult.getExplainedVariance());  // variance per component
console.log(pcaResult.getTransformed());        // transformed data

// Imputer
const imputed = await simpleImputer(xFlat, nFeatures, 'mean');

// Train/Test Split
const { xTrain, xTest, yTrain, yTest } = await trainTestSplit(xFlat, yFlat, 0.8, nFeatures);
```

## Metrics

### Classification Metrics

| Metric | Function | Description |
|--------|----------|-------------|
| Confusion Matrix | `confusionMatrix(yTrue, yPred)` | Returns `number[][]` (rows=true, cols=predicted) |
| Classification Report | `classificationReport(yTrue, yPred)` | Returns `{ precision, recall, f1, support }` |

### Clustering Metrics

| Metric | Function | Description |
|--------|----------|-------------|
| Silhouette Score | `silhouetteScore(x, nFeatures, labels)` | Clustering quality (-1 to 1, higher is better) |
| Calinski-Harabasz | `calinskiHarabaszScore(x, nFeatures, labels)` | Variance ratio (higher is better) |
| Davies-Bouldin | `daviesBouldinScore(x, nFeatures, labels)` | Cluster separation (lower is better) |

### Regression Metrics

| Metric | Function | Description |
|--------|----------|-------------|
| MAE | `meanAbsoluteError(yTrue, yPred)` | Mean Absolute Error |
| MSE | `meanSquaredError(yTrue, yPred)` | Mean Squared Error |
| R-squared | `r2Score(yTrue, yPred)` | Regression goodness of fit |
| MAPE | `mape(actual, predicted)` | Mean Absolute Percentage Error (pure JS) |
| RMSE | `rmse(actual, predicted)` | Root Mean Squared Error (pure JS) |

### Model Selection

| Metric | Function | Description |
|--------|----------|-------------|
| Cross-Validation | `crossValidateScore(x, y, cvFolds, modelType?, nFeatures?)` | Returns `number[]` of fold scores |

### Metrics Examples

```typescript
import { init, confusionMatrix, classificationReport, meanSquaredError, r2Score, silhouetteScore } from '@seanchatmangpt/wminml';
await init();

// Classification
const matrix = await confusionMatrix(yTrue, yPred);
const report = await classificationReport(yTrue, yPred);
console.log(report.precision, report.recall, report.f1, report.support);

// Regression
const mse = await meanSquaredError(yTrue, yPred);
const r2 = await r2Score(yTrue, yPred);

// Clustering
const sil = await silhouetteScore(xFlat, nFeatures, labels);
const ch = await calinskiHarabaszScore(xFlat, nFeatures, labels);
const db = await daviesBouldinScore(xFlat, nFeatures, labels);

// Cross-Validation
const scores = await crossValidateScore(xFlat, yFlat, 5, 'decision_tree', nFeatures);
```

## AutoML

| Function | Description |
|----------|-------------|
| `autoFitClassification(x, y, nSamples, nFeatures)` | Automated classification pipeline |
| `autoFitRegression(x, y, nSamples, nFeatures)` | Automated regression pipeline |
| `recommendAlgorithm(nSamples, nFeatures, nClasses, isSparse)` | Algorithm recommendation |

AutoML performs genetic algorithm feature selection followed by PSO hyperparameter optimization. Returns an `AutoMLResult` with `best_algorithm`, `best_score`, `selected_features`, `evaluations`, and `summary()`.

```typescript
import { init, autoFitClassification, autoFitRegression, recommendAlgorithm } from '@seanchatmangpt/wminml';
await init();

const result = await autoFitClassification(xFlat, yFlat, nSamples, nFeatures);
console.log(result.best_algorithm);  // e.g., "decision_tree"
console.log(result.best_score);      // e.g., 0.95
console.log(result.selected_features);
console.log(result.summary());

const rec = await recommendAlgorithm(100, 10, 3, false);
console.log(rec); // e.g., "logistic_regression"
```

## Time Series

| Function | Description | Key Parameters |
|----------|-------------|----------------|
| `movingAverage(data, { window, type? })` | Moving average (SMA, EMA, WMA) | `window`, `type` (`'sma'`, `'ema'`, `'wma'`) |
| `sma(data, window)` | Simple Moving Average | `window` |
| `ema(data, window)` | Exponential Moving Average | `window` |
| `wma(data, window)` | Weighted Moving Average | `window` |
| `trendForecast(data, periods)` | Trend analysis and forecast | `periods` |
| `rateOfChange(data, periods)` | Rate of change as percentage | `periods` |
| `momentum(data, periods)` | Momentum (difference from n periods ago) | `periods` |
| `exponentialSmoothing(data, { alpha? })` | Exponential smoothing | `alpha` (default 0.3) |
| `seasonalDecompose(data, period)` | Seasonal decomposition | `period` |
| `autocorrelation(data, maxLag?)` | Autocorrelation function | `maxLag` |
| `detectSeasonality(data)` | Detect seasonality period | (none) |
| `findPeaks(data)` | Find local maxima (returns indices) | (none) |
| `findTroughs(data)` | Find local minima (returns indices) | (none) |

## Data Normalization (Pure JS)

These are pure JavaScript functions (no WASM) that return both the normalized data and an inverse function.

| Function | Description |
|----------|-------------|
| `minMaxNormalize(data)` | Normalize to [0, 1] with inverse |
| `zScoreNormalize(data)` | Z-score standardization with inverse |
| `normalize(data, type?)` | `'min-max'` or `'z-score'` with inverse |

```typescript
import { minMaxNormalize } from '@seanchatmangpt/wminml';
// No await needed -- pure JS
const norm = minMaxNormalize([10, 20, 30, 40, 50]);
console.log(norm.data);      // [0, 0.25, 0.5, 0.75, 1]
console.log(norm.inverse([0.5])); // [30]
```

## Error Metrics (Pure JS)

These are pure JavaScript functions (no WASM, no `await` needed).

| Function | Description |
|----------|-------------|
| `rmse(actual, predicted)` | Root Mean Squared Error |
| `mae(actual, predicted)` | Mean Absolute Error |
| `mape(actual, predicted)` | Mean Absolute Percentage Error |
| `errorMetrics(actual, predicted)` | All three at once: `{ rmse, mae, mape, n }` |
| `residuals(actual, predicted)` | Residual analysis: `{ residuals, mean, stdDev, standardized }` |
