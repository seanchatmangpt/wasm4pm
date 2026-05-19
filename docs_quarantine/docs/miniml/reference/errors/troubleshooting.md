# Troubleshooting

Common issues and solutions when using miniml.

## WASM Initialization

### "WASM initialization failed"

**Cause:** `init()` was not called before using ML functions, or the WASM module failed to load.

**Solution:**
```typescript
import { init, knnClassifier } from '@seanchatmangpt/wminml';

// Always call init() first and await it
await init();

// Now safe to use ML functions
const model = await knnClassifier(
  [[1, 2], [3, 4], [5, 6]], [0, 1, 1], { k: 3 }
);
const predictions = model.predict([[2, 3]]);
```

**Check:** Ensure `init()` is called once at the top of your module before any ML operations. In browsers, the WASM file must be served with correct MIME type (`application/wasm`).

---

## Matrix Dimension Mismatches

### "data length must be divisible by n_features"

**Cause:** The total number of elements in `X` is not evenly divisible by the number of features.

**Solution:** Verify the math:
```typescript
const X = new Float64Array([...]); // e.g., 11 elements
const nFeatures = 2;

// 11 / 2 = 5.5 -- NOT divisible
// Fix: ensure X.length % nFeatures === 0

console.log(X.length / nFeatures);  // must be an integer
```

**Common mistake:** Off-by-one error when constructing the array, or mixing up nFeatures and nSamples.

### "targets length must match number of samples"

**Cause:** The `y` array has a different length than the number of rows in `X`.

**Solution:**
```typescript
const nSamples = X.length / nFeatures;
if (y.length !== nSamples) {
  throw new Error(`Expected ${nSamples} targets, got ${y.length}`);
}
```

---

## Convergence Issues

### "Convergence not reached" (iterative algorithms)

**Cause:** The algorithm hit `maxIter` without converging. Common with SVM, logistic regression, K-Means, and gradient-based methods.

**Solutions:**

1. **Increase iterations:**
```typescript
// Default maxIterations may be too low for your data
const model = await logisticRegression(data, labels, {
  maxIterations: 1000,  // increase from default
  learningRate: 0.01,
});
```

2. **Adjust learning rate:**
```typescript
// Learning rate too high causes oscillation
// Learning rate too low causes slow convergence
const model = await logisticRegression(data, labels, {
  learningRate: 0.001,  // try smaller
  maxIterations: 500,
});
```

3. **Scale your features:**
```typescript
import { standardScaler } from '@seanchatmangpt/wminml';

const Xscaled = await standardScaler(xFlat, nFeatures);
// Now train on Xscaled
```

---

## Insufficient Data

### "Need at least 2 observations"

**Cause:** ML algorithms and statistical tests require minimum sample sizes.

| Function | Minimum Requirement |
|----------|-------------------|
| `knnClassifier` | n >= k (at least `k` neighbors) |
| `logisticRegression` | n >= 2 samples |
| `decisionTree` | n >= 1 sample |
| `naiveBayes` | n >= 1 sample per class |
| `kmeans` | n >= k clusters |
| `dbscan` | n >= minPoints |
| `pca` | n >= nComponents |
| `linearRegression` | n >= 2 |
| `trainTestSplit` | n >= 2 |

---

## Memory Issues

### "Memory allocation failed"

**Cause:** Large matrices exceed available WASM memory.

**Solutions:**

1. **Reduce data size.** Subsample or use PCA for dimensionality reduction.
2. **Use efficient algorithms.** Linear regression is O(n*d), avoid brute-force methods on large datasets.
3. **Increase WASM memory** (if your bundler supports it):
```typescript
// Some bundlers allow configuring initial/maximum WASM memory
import init, { memory } from '@seanchatmangpt/wminml';
```

---

## Numerical Issues

### NaN or Infinity in results

**Cause:** Division by zero, log of zero, or numerical overflow.

**Common fixes:**
- Ensure no features have zero variance (all identical values).
- Check for extreme outliers that cause overflow.
- Use the Robust Scaler instead of Standard Scaler for data with outliers.
- Ensure all `x` values are positive for logarithmic and power regression.

### "Matrix is not positive definite"

**Cause:** Occurs in ridge/lasso regression when the data matrix is singular or near-singular.

**Solutions:**

1. **Add regularization** (increase `alpha`):
```typescript
const model = await ridgeRegression(xFlat, yFlat, nFeatures, 1.0); // increase alpha
```

2. **Remove collinear features.** Check for features that are linear combinations of others.

3. **Standardize features first** so they have similar scales:
```typescript
const scaled = await standardScaler(xFlat, nFeatures);
const model = await ridgeRegression(scaled, yFlat, nFeatures, 0.5);
```

---

## Performance Tips

### Slow training

- **KNN prediction is slow** for large datasets. Use Decision Tree or Logistic Regression for faster prediction.
- **Random Forest and Gradient Boosting** scale with `nTrees` -- reduce if training is slow.
- **SVM training is O(n^2).** Subsample for large datasets.
- **Enable SIMD** by building with `--features simd` flag for faster matrix operations.

### Poor accuracy

- **Scale your features** before training (`standardScaler` or `minMaxScaler`).
- **Try different algorithms** -- no single algorithm is best for all problems.
- **Use AutoML** to automatically find the best algorithm and hyperparameters: `autoFitClassification` or `autoFitRegression`.
- **Check for data leakage** -- ensure train/test split happens before preprocessing. Use `trainTestSplit` first.
- **Use feature importance** to identify the most informative features: `featureImportance(x, y, nFeatures)`.
