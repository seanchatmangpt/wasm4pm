# Kernel API

Kernel functions for pairwise similarity computation. Used by SVM, Gaussian processes, and other kernelized methods. Call `await init()` before use.

---

## RBF (Radial Basis Function) Kernel

### `rbfKernel`

```ts
function rbfKernel(
  x1: Float64Array,
  x2: Float64Array,
  gamma: number
): number
```

Computes the RBF (squared exponential) kernel between two vectors.

| Parameter | Type | Description |
|-----------|------|-------------|
| `x1` | `Float64Array` | First vector (length nFeatures) |
| `x2` | `Float64Array` | Second vector (length nFeatures) |
| `gamma` | `number` | Kernel bandwidth parameter, must be > 0 |

**Returns:** `number` -- K(x1, x2) = exp(-gamma * ||x1 - x2||^2).

---

### `rbfKernelMatrix`

```ts
function rbfKernelMatrix(
  X: Float64Array,
  nSamples: number,
  nFeatures: number,
  gamma: number
): Float64Array
```

Computes the full pairwise RBF kernel matrix for a dataset.

| Parameter | Type | Description |
|-----------|------|-------------|
| `X` | `Float64Array` | Data matrix (nSamples x nFeatures), row-major |
| `nSamples` | `number` | Number of samples |
| `nFeatures` | `number` | Number of features per sample |
| `gamma` | `number` | Kernel bandwidth parameter, must be > 0 |

**Returns:** `Float64Array` -- Symmetric kernel matrix (nSamples x nSamples), row-major. Diagonal elements are 1.0.

---

## Polynomial Kernel

### `polynomialKernel`

```ts
function polynomialKernel(
  x1: Float64Array,
  x2: Float64Array,
  degree: number,
  coef0: number
): number
```

Computes the polynomial kernel between two vectors.

| Parameter | Type | Description |
|-----------|------|-------------|
| `x1` | `Float64Array` | First vector (length nFeatures) |
| `x2` | `Float64Array` | Second vector (length nFeatures) |
| `degree` | `number` | Polynomial degree, must be >= 1 |
| `coef0` | `number` | Independent term (offset) |

**Returns:** `number` -- K(x1, x2) = (x1 . x2 + coef0)^degree.

---

### `polynomialKernelMatrix`

```ts
function polynomialKernelMatrix(
  X: Float64Array,
  nSamples: number,
  nFeatures: number,
  degree: number,
  coef0: number
): Float64Array
```

Computes the full pairwise polynomial kernel matrix for a dataset.

| Parameter | Type | Description |
|-----------|------|-------------|
| `X` | `Float64Array` | Data matrix (nSamples x nFeatures), row-major |
| `nSamples` | `number` | Number of samples |
| `nFeatures` | `number` | Number of features per sample |
| `degree` | `number` | Polynomial degree, must be >= 1 |
| `coef0` | `number` | Independent term (offset) |

**Returns:** `Float64Array` -- Symmetric kernel matrix (nSamples x nSamples), row-major.

---

## Sigmoid Kernel

### `sigmoidKernel`

```ts
function sigmoidKernel(
  x1: Float64Array,
  x2: Float64Array,
  alpha: number,
  coef0: number
): number
```

Computes the sigmoid (hyperbolic tangent) kernel between two vectors.

| Parameter | Type | Description |
|-----------|------|-------------|
| `x1` | `Float64Array` | First vector (length nFeatures) |
| `x2` | `Float64Array` | Second vector (length nFeatures) |
| `alpha` | `number` | Slope parameter |
| `coef0` | `number` | Independent term (offset) |

**Returns:** `number` -- K(x1, x2) = tanh(alpha * x1 . x2 + coef0).

---

### `sigmoidKernelMatrix`

```ts
function sigmoidKernelMatrix(
  X: Float64Array,
  nSamples: number,
  nFeatures: number,
  alpha: number,
  coef0: number
): Float64Array
```

Computes the full pairwise sigmoid kernel matrix for a dataset.

| Parameter | Type | Description |
|-----------|------|-------------|
| `X` | `Float64Array` | Data matrix (nSamples x nFeatures), row-major |
| `nSamples` | `number` | Number of samples |
| `nFeatures` | `number` | Number of features per sample |
| `alpha` | `number` | Slope parameter |
| `coef0` | `number` | Independent term (offset) |

**Returns:** `Float64Array` -- Kernel matrix (nSamples x nSamples), row-major. Note: the sigmoid kernel is not positive semi-definite in general, so the resulting matrix is not guaranteed to be a valid Mercer kernel.

---

## Usage Notes

- All `*KernelMatrix` functions operate on row-major dense matrices.
- The RBF kernel is the default choice for most applications. Set `gamma = 1 / (2 * sigma^2)` where `sigma` is the desired radial width.
- The polynomial kernel with `degree=1, coef0=0` reduces to the linear kernel.
- The sigmoid kernel does not satisfy Mercer's condition; use with caution in methods that require positive semi-definite kernel matrices.
