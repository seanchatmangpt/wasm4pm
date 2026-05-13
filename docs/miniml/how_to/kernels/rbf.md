# RBF Kernel

Compute the Radial Basis Function (Gaussian) kernel between data points.

## What You'll Learn

- Computing pairwise RBF kernel values
- Building a full kernel matrix for a dataset
- Choosing the gamma parameter

## Prerequisites

```typescript
import { init, rbfKernel, rbfKernelMatrix } from '@seanchatmangpt/wminml';
await init();
```

## Pairwise RBF Kernel

`K(x, y) = exp(-gamma * ||x - y||^2)` -- identical points score 1.0, distant points score near 0.

```typescript
const x = new Float64Array([1.0, 2.0, 3.0]);
const y = new Float64Array([1.0, 2.0, 3.0]);

const k = rbfKernel(x, y, 1.0);
console.log(k);  // 1.0 (identical vectors)
```

```typescript
const a = new Float64Array([0.0, 0.0]);
const b = new Float64Array([1.0, 0.0]);

const k = rbfKernel(a, b, 1.0);
// exp(-1 * 1) = exp(-1) ~ 0.3679
console.log(k.toFixed(4));  // "0.3679"
```

## Kernel Matrix

Compute all pairwise kernel values for a dataset (n_samples x n_samples symmetric matrix).

```typescript
// 4 samples, 2 features each
const X = new Float64Array([
  1.0, 2.0,  // sample 0
  3.0, 4.0,  // sample 1
  5.0, 6.0,  // sample 2
  7.0, 8.0,  // sample 3
]);
const nSamples = 4;
const nFeatures = 2;

const K = rbfKernelMatrix(X, nSamples, nFeatures, 0.5);
// K[i * nSamples + j] = rbfKernel(sample_i, sample_j, 0.5)
// Diagonal is always 1.0, symmetric
console.log(K[0 * 4 + 0]);  // 1.0 (self-similarity)
console.log(K[0 * 4 + 1]);  // ~0.0183 (very different)
```

## Choosing Gamma

| Gamma | Effect |
|-------|--------|
| Small (0.01-0.1) | Wide influence -- far points still similar |
| Medium (0.5-2.0) | Balanced -- typical default |
| Large (5.0-50.0) | Narrow influence -- only very close points similar |

If `gamma <= 0`, the default `1.0 / nFeatures` is used automatically.

```typescript
// Default gamma (1/2 = 0.5 for 2 features)
const K1 = rbfKernelMatrix(X, nSamples, nFeatures, 0);

// Explicit gamma
const K2 = rbfKernelMatrix(X, nSamples, nFeatures, 1.0);
```

## Tips

- The kernel matrix is symmetric: `K[i][j] === K[j][i]`.
- Diagonal entries are always 1.0 (each point is maximally similar to itself).
- The RBF kernel is the default kernel for SVM and Gaussian Process models in miniml.
- Scale your features before computing kernels if features have very different ranges.
