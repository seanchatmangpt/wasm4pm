# Gaussian Process Regression

Fit a nonparametric regression model that provides uncertainty estimates for every prediction.

## What You'll Learn

- Fitting a GP model with RBF or linear kernels
- Setting noise and kernel parameters
- Understanding model properties

## Prerequisites

```typescript
import { init, gpFit } from '@seanchatmangpt/wminml';
await init();
```

## Fit a GP Model

```typescript
// Training data: y = 2x + 1
const X = new Float64Array([1.0, 2.0, 3.0, 4.0, 5.0]);
const y = new Float64Array([3.0, 5.0, 7.0, 9.0, 11.0]);
const nFeatures = 1;

const model = gpFit(X, nFeatures, y, 'rbf', [1.0], 1e-6);

console.log(model.nTrain());      // 5
console.log(model.nFeatures());   // 1
console.log(model.kernelType());  // "rbf"
```

## Kernel Types

| Kernel | Parameters | Use Case |
|--------|-----------|----------|
| `"rbf"` | `[gamma]` | Smooth, nonlinear functions. Default. |
| `"linear"` | `[]` | Linear relationships. |

```typescript
// RBF kernel with gamma=0.5
const modelRbf = gpFit(X, nFeatures, y, 'rbf', [0.5], 1e-6);

// Linear kernel (no parameters needed)
const modelLinear = gpFit(X, nFeatures, y, 'linear', [], 1e-6);
```

## Noise Parameter

The `noise` parameter adds a jitter to the diagonal of the kernel matrix for numerical stability and to model observation noise.

```typescript
// Very low noise: interpolates training data closely
const exact = gpFit(X, nFeatures, y, 'rbf', [1.0], 1e-6);

// Moderate noise: smoother fit, handles noisy data
const noisy = gpFit(X, nFeatures, y, 'rbf', [1.0], 0.1);
```

## Multivariate GP

```typescript
// y = x1 + x2
const X = new Float64Array([
  1.0, 0.0,
  0.0, 1.0,
  1.0, 1.0,
  2.0, 1.0,
  3.0, 2.0,
]);
const y = new Float64Array([1.0, 1.0, 2.0, 3.0, 5.0]);

const model = gpFit(X, 2, y, 'rbf', [0.5], 1e-6);
console.log(model.nFeatures());  // 2
```

## Tips

- GP fitting involves a Cholesky decomposition of an n x n matrix, so it scales as O(n^3). Keep training sets small (< 1000 points).
- RBF gamma controls smoothness: small gamma = smoother functions, large gamma = more wiggly.
- Default gamma is `1.0 / nFeatures` if `kernelParams` is empty.
- Set noise > 0 when data has measurement error.
- See [GP Prediction](../gaussian-processes/predict.md) for making predictions.
