# Gaussian Process API

Gaussian process regression for non-parametric supervised learning with uncertainty quantification. Call `await init()` before use.

---

## Model Fitting

### `gpFit`

```ts
function gpFit(
  X: Float64Array,
  y: Float64Array,
  nSamples: number,
  nFeatures: number,
  kernelType: string,
  kernelParams: object,
  noise: number
): GpModel
```

Fits a Gaussian process regression model to training data.

| Parameter | Type | Description |
|-----------|------|-------------|
| `X` | `Float64Array` | Training feature matrix (nSamples x nFeatures), row-major |
| `y` | `Float64Array` | Training target vector (length nSamples) |
| `nSamples` | `number` | Number of training observations |
| `nFeatures` | `number` | Number of features per observation |
| `kernelType` | `string` | Kernel function: `"rbf"`, `"polynomial"`, or `"sigmoid"` |
| `kernelParams` | `object` | Kernel-specific parameters (see below) |
| `noise` | `number` | Observation noise variance (nugget), must be >= 0 |

**Kernel parameters by type:**

| `kernelType` | `kernelParams` fields |
|--------------|----------------------|
| `"rbf"` | `{ gamma: number }` -- RBF bandwidth parameter |
| `"polynomial"` | `{ degree: number, coef0: number }` -- Polynomial degree and offset |
| `"sigmoid"` | `{ alpha: number, coef0: number }` -- Sigmoid slope and offset |

**Returns:** `GpModel` -- Opaque model handle to be passed to `gpPredict`. Do not inspect or modify.

---

## Prediction

### `gpPredict`

```ts
function gpPredict(
  model: GpModel,
  xTest: Float64Array,
  nFeatures: number
): GpPrediction
```

Generates predictions with uncertainty estimates from a fitted Gaussian process model.

| Parameter | Type | Description |
|-----------|------|-------------|
| `model` | `GpModel` | Fitted model from `gpFit` |
| `xTest` | `Float64Array` | Test feature matrix (nTest x nFeatures), row-major |
| `nFeatures` | `number` | Number of features (must match training) |

**Returns:** `GpPrediction`

```ts
interface GpPrediction {
  mean: Float64Array;     // Predictive mean (length nTest)
  std: Float64Array;      // Predictive standard deviation (length nTest)
  ciLower: Float64Array;  // Lower bound of 95% credible interval (length nTest)
  ciUpper: Float64Array;  // Upper bound of 95% credible interval (length nTest)
}
```

---

## Usage Notes

- Gaussian process regression scales as O(n^3) in the number of training samples due to matrix inversion. Suitable for datasets up to several thousand samples.
- The `noise` parameter controls the nugget added to the kernel diagonal. Set to a small positive value (e.g., 1e-8) for numerical stability, or a larger value if the data has substantial observation noise.
- Credible intervals are computed as `mean +/- 1.96 * std` (approximate 95% interval under the Gaussian posterior assumption).
- `xTest` can be a single test point (1 x nFeatures) or a batch of test points.
