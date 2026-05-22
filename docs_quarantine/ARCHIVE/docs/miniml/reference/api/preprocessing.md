# Preprocessing API

Complete reference for all data preprocessing functions exported by `miniml`. Includes scalers, encoders, imputation, dimensionality reduction, and data normalization.

---

## Standard Scaler

```ts
standardScaler(nFeatures): StandardScaler
```

Creates a z-score normalizer. After fitting, transforms data to mean=0, std=1 per feature.

| Parameter | Type | Description |
|-----------|------|-------------|
| `nFeatures` | `number` | Number of features |

**Returns:** `StandardScaler` (mutable object)

| Property / Method | Return Type | Description |
|--------------------|-------------|-------------|
| `.nFeatures` | `number` (readonly) | Feature dimensionality |
| `.nSamples` | `number` (readonly) | Samples used in last fit |
| `.fit(data)` | `void` | Compute mean and std from data |
| `.transform(data)` | `number[]` | Apply z-score normalization |
| `.fitTransform(data)` | `number[]` | Fit and transform in one call |
| `.inverseTransform(data)` | `number[]` | Restore original scale |
| `.toString()` | `string` | Human-readable description |

```ts
const scaler = standardScaler(2);
const scaled = scaler.fitTransform([1,10, 2,20, 3,30, 4,40, 5,50]);
const restored = scaler.inverseTransform(scaled);
```

---

## MinMax Scaler

```ts
minMaxScaler(nFeatures): MinMaxScaler
```

Scales features to [0, 1] range per feature.

| Parameter | Type | Description |
|-----------|------|-------------|
| `nFeatures` | `number` | Number of features |

**Returns:** `MinMaxScaler` (mutable object)

| Property / Method | Return Type | Description |
|--------------------|-------------|-------------|
| `.nFeatures` | `number` (readonly) | Feature dimensionality |
| `.nSamples` | `number` (readonly) | Samples used in last fit |
| `.fit(data)` | `void` | Compute min and scale from data |
| `.transform(data)` | `number[]` | Apply min-max scaling |
| `.fitTransform(data)` | `number[]` | Fit and transform in one call |
| `.inverseTransform(data)` | `number[]` | Restore original scale |
| `.toString()` | `string` | Human-readable description |

---

## Robust Scaler

```ts
robustScaler(nFeatures): RobustScaler
```

Scales features using median and interquartile range (IQR). Robust to outliers.

| Parameter | Type | Description |
|-----------|------|-------------|
| `nFeatures` | `number` | Number of features |

**Returns:** `RobustScaler` (mutable object)

| Property / Method | Return Type | Description |
|--------------------|-------------|-------------|
| `.nFeatures` | `number` (readonly) | Feature dimensionality |
| `.nSamples` | `number` (readonly) | Samples used in last fit |
| `.fit(data)` | `void` | Compute median and IQR |
| `.transform(data)` | `number[]` | Apply robust scaling |
| `.fitTransform(data)` | `number[]` | Fit and transform in one call |
| `.toString()` | `string` | Human-readable description |

---

## Normalizer

```ts
normalizer(nFeatures, norm): Normalizer
```

Scales individual samples to unit norm. Stateless -- no fit step required.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `nFeatures` | `number` | -- | Number of features |
| `norm` | `string` | `'l2'` | Norm type: `'l1'`, `'l2'`, or `'max'` |

**Returns:** `Normalizer`

| Property / Method | Return Type | Description |
|--------------------|-------------|-------------|
| `.nFeatures` | `number` (readonly) | Feature dimensionality |
| `.norm` | `string` (readonly) | Norm type |
| `.transform(data)` | `number[]` | Normalize samples to unit norm |
| `.fitTransform(data)` | `number[]` | Alias for transform (stateless) |
| `.toString()` | `string` | Human-readable description |

```ts
const norm = normalizer(2, 'l2');
const result = norm.transform([3, 4]); // [0.6, 0.8] -- L2 norm = 5
```

---

## Label Encoder

```ts
labelEncoder(y): Promise<number[]>
```

Converts class labels to integer indices. Unique labels are mapped to 0, 1, 2, ... in order of first appearance.

| Parameter | Type | Description |
|-----------|------|-------------|
| `y` | `number[]` | Input labels |

**Returns:** `number[]` -- Encoded integer labels.

---

## One-Hot Encoder

```ts
oneHotEncoder(y, nClasses): Promise<number[]>
```

Converts integer class labels to binary one-hot vectors.

| Parameter | Type | Description |
|-----------|------|-------------|
| `y` | `number[]` | Integer class labels |
| `nClasses` | `number` | Total number of classes |

**Returns:** `number[]` -- Flat one-hot encoded array (nSamples * nClasses).

```ts
const encoded = await oneHotEncoder([0, 1, 2], 3);
// [1, 0, 0, 0, 1, 0, 0, 0, 1]
```

---

## Ordinal Encoder

```ts
ordinalEncoder(y): Promise<number[]>
```

Converts categories to ordered integers based on sorted unique values.

| Parameter | Type | Description |
|-----------|------|-------------|
| `y` | `number[]` | Input labels |

**Returns:** `number[]` -- Ordinal-encoded integers.

---

## Simple Imputer

```ts
simpleImputer(nFeatures, strategy, fillValue): SimpleImputer
```

Fills missing values (represented as `NaN`) per feature column.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `nFeatures` | `number` | -- | Number of features |
| `strategy` | `string` | `'mean'` | Imputation strategy: `'mean'`, `'median'`, `'most_frequent'`, `'constant'` |
| `fillValue` | `number` | `0.0` | Fill value for `'constant'` strategy |

**Returns:** `SimpleImputer` (mutable object)

| Property / Method | Return Type | Description |
|--------------------|-------------|-------------|
| `.nFeatures` | `number` (readonly) | Feature dimensionality |
| `.strategy` | `string` (readonly) | Imputation strategy |
| `.fit(data)` | `void` | Compute imputation values |
| `.transform(data)` | `number[]` | Replace NaN values |
| `.fitTransform(data)` | `number[]` | Fit and transform in one call |
| `.toString()` | `string` | Human-readable description |

```ts
const imp = simpleImputer(2, 'mean', 0.0);
const cleaned = imp.fitTransform([1, NaN, 2, 4, 3, 6]);
// [1, 5, 2, 4, 3, 6] -- NaN replaced with mean of non-NaN values (5)
```

---

## PCA (Principal Component Analysis)

```ts
pca(data, options?): Promise<PcaResult>
```

Dimensionality reduction via singular value decomposition. Projects data onto the top principal components.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `data` | `number[][]` | -- | Training features (nSamples x nFeatures) |
| `options.nComponents` | `number` | `min(nFeatures, nSamples, 2)` | Number of components to keep |

**Returns:** `PcaResult`

| Property / Method | Return Type | Description |
|--------------------|-------------|-------------|
| `.nComponents` | `number` (readonly) | Number of components |
| `.getComponents()` | `number[][]` | Principal axes (nComponents x nFeatures) |
| `.getExplainedVariance()` | `number[]` | Absolute variance per component |
| `.getExplainedVarianceRatio()` | `number[]` | Fraction of total variance per component |
| `.getTransformed()` | `number[][]` | Training data projected into component space |
| `.getMean()` | `number[]` | Per-feature mean |
| `.transform(data)` | `number[][]` | Project new data into component space |
| `.toString()` | `string` | Human-readable description |

```ts
const result = await pca(data, { nComponents: 2 });
const projected = result.transform(newData);
console.log(result.getExplainedVarianceRatio()); // e.g. [0.85, 0.12]
```

---

## Pure-TypeScript Normalization

```ts
normalize(data, type?): NormalizedData
minMaxNormalize(data): NormalizedData
zScoreNormalize(data): NormalizedData
```

Simple 1D normalization with inverse transform.

| Function | Description |
|----------|-------------|
| `normalize(data, 'min-max')` | Scale to [0, 1] |
| `normalize(data, 'z-score')` | Scale to mean=0, std=1 |
| `minMaxNormalize(data)` | Alias for `'min-max'` |
| `zScoreNormalize(data)` | Alias for `'z-score'` |

**Returns:** `NormalizedData`

| Property / Method | Return Type | Description |
|--------------------|-------------|-------------|
| `.data` | `number[]` | Normalized values |
| `.inverse(normalized)` | `number[]` | Restore original scale |

---

## Feature Importance

```ts
featureImportance(x, y, nSamples, nFeatures): Promise<number[]>
featureImportanceForest(x, y, nTrees, maxDepth, nSamples, nFeatures): Promise<number[]>
```

Per-feature importance scores based on decision tree impurity reduction.

| Function | Return Type | Description |
|----------|-------------|-------------|
| `featureImportance(...)` | `number[]` | Importance scores from single tree |
| `featureImportanceForest(...)` | `number[]` | Importance scores from random forest ensemble |
