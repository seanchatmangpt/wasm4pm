# Sigmoid Kernel

Compute the sigmoid (hyperbolic tangent) kernel, inspired by neural network activation functions.

## What You'll Learn

- Computing pairwise sigmoid kernel values
- Building a full kernel matrix
- Understanding when the sigmoid kernel is appropriate

## Prerequisites

```typescript
import { init, sigmoidKernel, sigmoidKernelMatrix } from '@seanchatmangpt/wminml';
await init();
```

## Pairwise Sigmoid Kernel

`K(x, y) = tanh(gamma * <x, y> + coef0)` -- output is always in [-1, 1].

```typescript
const x = new Float64Array([1.0, 2.0, 3.0]);
const y = new Float64Array([4.0, 5.0, 6.0]);

const k = sigmoidKernel(x, y, 0.1, 0.0);
// tanh(0.1 * (1*4 + 2*5 + 3*6)) = tanh(3.2) ~ 0.9967
console.log(k.toFixed(4));  // "0.9967"
```

```typescript
const k2 = sigmoidKernel(x, y, 0.01, 0.0);
// tanh(0.01 * 32) = tanh(0.32) ~ 0.3089
console.log(k2.toFixed(4));  // "0.3089"
```

## Kernel Matrix

Compute all pairwise sigmoid kernel values for a dataset.

```typescript
// 3 samples, 2 features each
const X = new Float64Array([
  1.0, 2.0,
  3.0, 4.0,
  5.0, 6.0,
]);
const nSamples = 3;
const nFeatures = 2;

const K = sigmoidKernelMatrix(X, nSamples, nFeatures, 0.1, 1.0);
console.log(K[0 * 3 + 0]);  // self-similarity
console.log(K[0 * 3 + 1]);  // cross-similarity
```

## Choosing Parameters

| Parameter | Effect | Typical Values |
|-----------|--------|----------------|
| `gamma` | Scale of the dot product | 0.001 - 0.5 |
| `coef0` | Offset (like a bias term) | 0.0, 1.0 |

```typescript
// Small gamma: more linear behavior
const K1 = sigmoidKernelMatrix(X, nSamples, nFeatures, 0.01, 0.0);

// Moderate gamma: more nonlinear behavior
const K2 = sigmoidKernelMatrix(X, nSamples, nFeatures, 0.1, 1.0);
```

## When to Use the Sigmoid Kernel

- The sigmoid kernel behaves like a two-layer neural network.
- It is **not** guaranteed to be positive semi-definite for all parameters, which means it may not always produce valid kernel matrices.
- For SVM classification, the RBF kernel usually outperforms the sigmoid kernel.
- Use the sigmoid kernel when you specifically want neural-network-like behavior without training an actual neural network.

## Tips

- Output is bounded to [-1, 1] for any input.
- The kernel matrix is symmetric.
- Start with small gamma values (0.01-0.1) and adjust upward.
- If you get unexpected results, try the RBF kernel instead.
