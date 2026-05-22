# Kernel Functions

A kernel function measures the similarity between two data points in a way that depends only on their relative position, not their absolute location. Kernels are the engine behind kernel methods -- algorithms that operate implicitly in high-dimensional feature spaces without ever computing the coordinates of data in those spaces.

## What Kernels Compute

Formally, a kernel is a function $K: \mathcal{X} \times \mathcal{X} \to \mathbb{R}$ that satisfies:

$$K(\mathbf{x}, \mathbf{y}) = \langle \phi(\mathbf{x}), \phi(\mathbf{y}) \rangle$$

for some mapping $\phi: \mathcal{X} \to \mathcal{H}$ into a (possibly infinite-dimensional) Hilbert space $\mathcal{H}$. The kernel computes the inner product in the feature space $\mathcal{H}$, but we never need to know $\phi$ explicitly.

Intuitively, $K(\mathbf{x}, \mathbf{y})$ is large when $\mathbf{x}$ and $\mathbf{y}$ are similar, and small when they are different. The choice of kernel encodes our assumptions about what "similar" means for the data.

## Common Kernel Functions

### RBF (Gaussian) Kernel

The most widely used kernel. It produces a smooth, infinite-dimensional feature space.

$$K(\mathbf{x}, \mathbf{y}) = \exp\left(-\gamma \|\mathbf{x} - \mathbf{y}\|^2\right)$$

**Parameter:** $\gamma > 0$ (inverse width). Large $\gamma$ means narrow kernels (local, sensitive to nearby points). Small $\gamma$ means wide kernels (smooth, global). Related to bandwidth $h$ by $\gamma = 1/(2h^2)$.

**Properties:** The corresponding feature space $\mathcal{H}$ is infinite-dimensional. Every function in $\mathcal{H}$ is smooth. The RBF kernel is universal -- given enough data, it can approximate any continuous function arbitrarily well.

### Polynomial Kernel

Maps data into a feature space of polynomial features up to degree $d$.

$$K(\mathbf{x}, \mathbf{y}) = (\mathbf{x} \cdot \mathbf{y} + c)^d$$

**Parameters:** degree $d \in \mathbb{N}$, constant $c \geq 0$.

**Properties:** For $d = 2$ and $\mathbf{x} \in \mathbb{R}^p$, the feature space contains all monomials of degree $\leq 2$: $\{1, x_i, x_i^2, x_i x_j\}$. Higher $d$ captures more complex interactions but risks overfitting. Unlike RBF, the polynomial kernel is not universal for fixed $d$.

### Sigmoid (Hyperbolic Tangent) Kernel

$$K(\mathbf{x}, \mathbf{y}) = \tanh(\alpha \, \mathbf{x} \cdot \mathbf{y} + c)$$

**Parameters:** slope $\alpha$, intercept $c$.

**Properties:** Historically motivated by neural networks (simulates a two-layer perceptron). The sigmoid kernel is **not** positive semi-definite for all parameter values, so it does not always correspond to a valid inner product. Use with caution -- RBF or polynomial kernels are generally preferred.

### Linear Kernel

The simplest kernel -- no feature space transformation.

$$K(\mathbf{x}, \mathbf{y}) = \mathbf{x} \cdot \mathbf{y}$$

Equivalent to $\phi(\mathbf{x}) = \mathbf{x}$. Linear kernels are fast to compute and appropriate when the data is already linearly separable or in very high dimensions where non-linear kernels offer little benefit.

## The Kernel Trick

Many algorithms can be expressed entirely in terms of inner products. If an algorithm uses data only through expressions like $\mathbf{x}_i \cdot \mathbf{x}_j$, we can replace these with $K(\mathbf{x}_i, \mathbf{x}_j)$ and implicitly work in a higher-dimensional space.

**Example with SVM.** The dual form of the SVM objective depends only on inner products:

$$\max_{\alpha} \sum_i \alpha_i - \frac{1}{2}\sum_{i,j} \alpha_i \alpha_j y_i y_j K(\mathbf{x}_i, \mathbf{x}_j)$$

The decision function is:

$$f(\mathbf{x}) = \sum_i \alpha_i y_i K(\mathbf{x}_i, \mathbf{x}) + b$$

No explicit computation of $\phi(\mathbf{x})$ is needed -- only evaluations of $K$. This lets us use feature spaces of infinite dimension (as with the RBF kernel) at the cost of computing $K$ for pairs of training points.

## Mercer's Condition

Not every symmetric function is a valid kernel. A function $K$ is a valid (Mercer) kernel if and only if for any finite set $\{\mathbf{x}_1, \ldots, \mathbf{x}_n\}$, the **kernel matrix** (Gram matrix) is positive semi-definite:

$$\mathbf{K} = \begin{pmatrix} K(\mathbf{x}_1, \mathbf{x}_1) & \cdots & K(\mathbf{x}_1, \mathbf{x}_n) \\ \vdots & \ddots & \vdots \\ K(\mathbf{x}_n, \mathbf{x}_1) & \cdots & K(\mathbf{x}_n, \mathbf{x}_n) \end{pmatrix} \succeq 0$$

Positive semi-definiteness means all eigenvalues of $\mathbf{K}$ are non-negative. This ensures the feature space $\mathcal{H}$ has a valid inner product structure.

Mercer's theorem guarantees that any positive semi-definite kernel corresponds to an inner product in some Hilbert space. This is the theoretical foundation that makes the kernel trick valid.

## Choosing Kernel Parameters

Kernel parameters have a strong effect on model performance:

- **RBF $\gamma$**: Cross-validate over a log-scale grid (e.g., $2^{-15}, 2^{-13}, \ldots, 2^{3}$). Too large $\gamma$ overfits (complex decision boundary); too small underfits (nearly linear).
- **Polynomial $d$**: Start with $d = 2$ or $d = 3$. Higher degrees rarely help and increase computational cost.
- **Multiple kernels**: Kernel alignment measures how well a kernel matches the target function. Automated kernel selection is possible via multiple kernel learning (MKL).

## Kernel Matrices in Practice

The $n \times n$ kernel matrix $\mathbf{K}$ is central to kernel methods. Properties:

- Symmetric: $\mathbf{K} = \mathbf{K}^T$
- Positive semi-definite: $\mathbf{v}^T \mathbf{K} \mathbf{v} \geq 0$ for all $\mathbf{v}$
- Computational cost: $O(n^2)$ storage, $O(n^3)$ for inversion (eigenvalue decomposition)
- Nystrom approximation and random Fourier features can reduce cost for large $n$

## See Also

- [Bayesian Inference](../bayesian/inference.md) -- Kernels in Gaussian process priors
- [GP Regression](../gaussian-processes/regression.md) -- Kernel functions as covariance functions
- [Hypothesis Testing](../statistical/hypothesis-testing.md) -- Kernel-based two-sample tests
