# Polynomial Kernel

Compute polynomial kernel values for mapping data into higher-dimensional feature spaces.

## What You'll Learn

- Computing pairwise polynomial kernel values
- Building a full kernel matrix
- Controlling degree, gamma, and coefficient

## Prerequisites

```typescript
import { init, polynomialKernel, polynomialKernelMatrix } from '@seanchatmangpt/wminml';
await init();
```

## Pairwise Polynomial Kernel

`K(x, y) = (gamma * <x, y> + coef0)^degree`

```typescript
const x = new Float64Array([1.0, 2.0]);
const y = new Float64Array([3.0, 4.0]);

// gamma = 1/nFeatures = 0.5 (default), degree = 2, coef0 = 1
const k = polynomialKernel(x, y, 2.0, 1.0);
// (0.5 * (1*3 + 2*4) + 1)^2 = (0.5*11 + 1)^2 = 6.5^2 = 42.25
console.log(k.toFixed(4));  // "42.2500"
```

## Kernel Matrix

Compute all pairwise polynomial kernel values for a dataset.

```typescript
// 3 samples, 2 features each
const X = new Float64Array([
  1.0, 2.0,
  3.0, 4.0,
  5.0, 6.0,
]);
const nSamples = 3;
const nFeatures = 2;

const K = polynomialKernelMatrix(X, nSamples, nFeatures, 3.0, 0.5, 1.0);
// Degree 3 polynomial kernel with gamma=0.5, coef0=1.0
console.log(K[0 * 3 + 0]);  // self-similarity
console.log(K[0 * 3 + 1]);  // cross-similarity
```

## Choosing Parameters

| Parameter | Effect | Typical Values |
|-----------|--------|----------------|
| `degree` | Complexity of the decision boundary | 2, 3, 4, 5 |
| `gamma` | Scale of inner product contribution | 0.01 - 1.0 (default: 1/nFeatures) |
| `coef0` | Controls influence of higher-order vs lower-order terms | 0, 1 |

```typescript
// Degree 2: quadratic decision boundary
const K2 = polynomialKernelMatrix(X, nSamples, nFeatures, 2.0, 0.5, 1.0);

// Degree 3: cubic decision boundary
const K3 = polynomialKernelMatrix(X, nSamples, nFeatures, 3.0, 0.5, 1.0);
```

If `gamma <= 0`, the default `1.0 / nFeatures` is used.

## Tips

- Degree 2 is good for problems with curved but smooth decision boundaries.
- Higher degrees increase model capacity but risk overfitting.
- The polynomial kernel is NOT a valid positive-definite kernel for all parameter combinations with `coef0 < 0`.
- The kernel matrix is always symmetric.
