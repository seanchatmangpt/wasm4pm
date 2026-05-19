# GP Regression

Gaussian process regression (GPR) is a Bayesian, non-parametric approach to regression that provides not only predictions but also a measure of uncertainty for each prediction. Instead of fitting a fixed set of parameters, a GP defines a distribution over functions -- any function drawn from a GP is consistent with the observed data, and the model quantifies how much each function is preferred.

## What is a Gaussian Process?

A Gaussian process is a collection of random variables, any finite number of which have a joint Gaussian distribution. A GP is fully specified by:

1. **Mean function** $m(\mathbf{x}) = \mathbb{E}[f(\mathbf{x})]$
2. **Covariance function** (kernel) $k(\mathbf{x}, \mathbf{x}') = \text{Cov}[f(\mathbf{x}), f(\mathbf{x}')]$

We write:

$$f(\mathbf{x}) \sim \mathcal{GP}\big(m(\mathbf{x}),\; k(\mathbf{x}, \mathbf{x}')\big)$$

The mean function is typically set to zero (or a simple trend) since the data will shift the posterior mean. The kernel encodes assumptions about the function: smoothness, periodicity, amplitude, and length scale.

**Connection to kernels:** The covariance function in a GP is exactly a kernel function as described in [Kernel Functions](../kernels/overview.md). Mercer's condition ensures the kernel matrix is positive semi-definite, which is required for a valid GP covariance.

## GP Prior

Before observing any data, the GP prior specifies a distribution over functions. For any set of points $\mathbf{X} = \{\mathbf{x}_1, \ldots, \mathbf{x}_n\}$, the function values $\mathbf{f} = (f(\mathbf{x}_1), \ldots, f(\mathbf{x}_n))^T$ follow a multivariate normal distribution:

$$\mathbf{f} \sim \mathcal{N}(\mathbf{m}, \mathbf{K})$$

where $\mathbf{m} = (m(\mathbf{x}_1), \ldots, m(\mathbf{x}_n))^T$ and $\mathbf{K}_{ij} = k(\mathbf{x}_i, \mathbf{x}_j)$.

Sampling from this prior (by sampling from the multivariate normal) produces random functions. The kernel determines their character: RBF produces smooth functions, Matern produces rougher functions, periodic kernels produce repeating patterns.

## GP Posterior

Given training data $(\mathbf{X}, \mathbf{y})$ where $\mathbf{y} = f(\mathbf{X}) + \boldsymbol{\epsilon}$ with $\boldsymbol{\epsilon} \sim \mathcal{N}(0, \sigma_n^2 I)$, the posterior at new points $\mathbf{X}_*$ is:

$$\mathbf{f}_* \mid \mathbf{X}, \mathbf{y}, \mathbf{X}_* \sim \mathcal{N}(\boldsymbol{\mu}_*, \boldsymbol{\Sigma}_*)$$

**Posterior mean (prediction):**

$$\boldsymbol{\mu}_* = \mathbf{K}_*^T (\mathbf{K} + \sigma_n^2 \mathbf{I})^{-1} \mathbf{y}$$

**Posterior covariance (uncertainty):**

$$\boldsymbol{\Sigma}_* = \mathbf{K}_{**} - \mathbf{K}_*^T (\mathbf{K} + \sigma_n^2 \mathbf{I})^{-1} \mathbf{K}_*$$

where:
- $\mathbf{K} = k(\mathbf{X}, \mathbf{X})$ is the $n \times n$ training kernel matrix
- $\mathbf{K}_* = k(\mathbf{X}, \mathbf{X}_*)$ is the $n \times n_*$ cross-covariance matrix
- $\mathbf{K}_{**} = k(\mathbf{X}_*, \mathbf{X}_*)$ is the $n_* \times n_*$ test kernel matrix
- $\sigma_n^2$ is the observation noise variance

The diagonal of $\boldsymbol{\Sigma}_*$ gives the predictive variance at each test point. This is the key advantage of GP regression: we know not just what the model predicts, but how confident it is.

## Interpretation of the Posterior

- Near training data: posterior variance is small (high confidence), posterior mean interpolates smoothly
- Far from training data: posterior variance grows toward the prior variance (low confidence), posterior mean reverts to the prior mean
- Between training points: posterior mean smoothly interpolates, with uncertainty that depends on the kernel's length scale

This automatic uncertainty quantification makes GPs ideal for applications where knowing what the model does not know is critical: active learning, Bayesian optimization, robotics, and scientific modeling.

## Kernel Choice

The kernel determines the class of functions the GP can represent:

**RBF (Squared Exponential):** Infinitely differentiable. Very smooth functions. $\ell$ controls length scale, $\sigma_f^2$ controls signal variance.

$$k_{\text{RBF}}(\mathbf{x}, \mathbf{x}') = \sigma_f^2 \exp\left(-\frac{\|\mathbf{x} - \mathbf{x}'\|^2}{2\ell^2}\right)$$

**Matern:** Differentiable $\nu - 1/2$ times. $\nu = 5/2$ is twice differentiable (a common default). $\nu = 3/2$ is once differentiable. More realistic than RBF for physical processes.

$$k_{\text{Matern}_{5/2}}(\mathbf{x}, \mathbf{x}') = \sigma_f^2 \left(1 + \frac{\sqrt{5}r}{\ell} + \frac{5r^2}{3\ell^2}\right) \exp\left(-\frac{\sqrt{5}r}{\ell}\right), \quad r = \|\mathbf{x} - \mathbf{x}'\|$$

**Rational Quadratic:** Infinite mixture of RBF kernels with different length scales. Can capture multiple scales of variation.

**Periodic:** For periodic functions. $\mathbf{x}$ includes an explicit period parameter $p$.

Kernels can be combined by addition (superposition of independent functions) or multiplication (modulation of one function by another).

## Hyperparameter Optimization

GP hyperparameters (kernel parameters $\ell$, $\sigma_f$, noise variance $\sigma_n^2$) are learned by maximizing the log marginal likelihood:

$$\log p(\mathbf{y} \mid \mathbf{X}, \boldsymbol{\theta}) = -\frac{1}{2} \mathbf{y}^T (\mathbf{K} + \sigma_n^2 \mathbf{I})^{-1} \mathbf{y} - \frac{1}{2} \log |\mathbf{K} + \sigma_n^2 \mathbf{I}| - \frac{n}{2} \log 2\pi$$

This balances data fit (first term) with model complexity (second term). A kernel that is too complex (small $\ell$) will overfit and have a poor marginal likelihood. Optimization is typically done with L-BFGS or gradient descent.

## Computational Complexity

The main bottleneck is inverting the $n \times n$ kernel matrix:

- **Training**: $O(n^3)$ for matrix inversion, $O(n^2)$ for storage
- **Prediction**: $O(n^2)$ per test point (or $O(n^2 + n n_*)$ for batch prediction)
- **Hyperparameter optimization**: Each likelihood evaluation is $O(n^3)$

For $n > 10{,}000$, exact GPs become prohibitively expensive. Approximations include:

- **Sparse GPs** (inducing points): Reduce cost to $O(nm^2)$ where $m \ll n$
- **Nystrom approximation**: Low-rank approximation of the kernel matrix
- **Random Fourier features**: Approximate the kernel with a finite-dimensional random feature map

## See Also

- [Kernel Functions](../kernels/overview.md) -- Detailed treatment of kernel functions
- [Bayesian Inference](../bayesian/inference.md) -- Bayesian framework underlying GPs
- [Monte Carlo Methods](../probabilistic/monte-carlo.md) -- Sampling-based GP approximations
- [MCMC Theory](../probabilistic/mcmc.md) -- Full Bayesian inference for GP hyperparameters
