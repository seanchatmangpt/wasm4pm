# Monte Carlo Methods

Monte Carlo methods use random sampling to approximate quantities that are deterministic but difficult to compute directly. The name comes from the Monte Carlo Casino in Monaco, reflecting the role of randomness. These methods are foundational to modern statistics, machine learning, and scientific computing.

## Law of Large Numbers and CLT

Monte Carlo methods rest on two pillars of probability theory.

**Strong Law of Large Numbers.** If $X_1, X_2, \ldots$ are i.i.d. with mean $\mu$, then:

$$\bar{X}_n = \frac{1}{n}\sum_{i=1}^{n} X_i \xrightarrow{a.s.} \mu \quad \text{as } n \to \infty$$

This guarantees that sample averages converge to the true expected value. The Monte Carlo estimate is consistent.

**Central Limit Theorem.** For large $n$:

$$\sqrt{n}(\bar{X}_n - \mu) \xrightarrow{d} \mathcal{N}(0, \sigma^2)$$

This gives us the convergence rate and lets us construct error bounds. The standard error of the mean is $\sigma / \sqrt{n}$, meaning Monte Carlo converges at rate $O(1/\sqrt{n})$ regardless of dimension.

## Monte Carlo Integration

The core application is estimating integrals. Given $I = \int_a^b f(x)\,dx$, rewrite as an expectation:

$$I = (b-a) \cdot \mathbb{E}[f(U)] \quad \text{where } U \sim \text{Uniform}(a, b)$$

**Sample-mean estimator:**

$$\hat{I} = \frac{b-a}{n} \sum_{i=1}^{n} f(U_i)$$

This extends naturally to multi-dimensional integrals. If $d$ is the dimension, deterministic methods like Simpson's rule need $O(n^d)$ points, while Monte Carlo needs only $O(n)$ -- the method is dimension-independent.

**Importance sampling** draws from a proposal distribution $g(x)$ rather than uniform:

$$\hat{I}_{\text{IS}} = \frac{1}{n}\sum_{i=1}^{n} \frac{f(X_i)}{g(X_i)}, \quad X_i \sim g$$

Choosing $g$ that concentrates mass where $f$ is large dramatically reduces variance.

## Variance Reduction Techniques

The raw Monte Carlo estimator can have high variance. Several techniques reduce it:

**Antithetic variates.** For each sample $U_i$, also compute $f(1 - U_i)$. Since $\text{Cov}(f(U), f(1-U)) \leq 0$ when $f$ is monotone, the paired estimator has lower variance:

$$\hat{I}_{\text{AV}} = \frac{1}{n}\sum_{i=1}^{n} \frac{f(U_i) + f(1 - U_i)}{2}$$

**Control variates.** Use a correlated quantity with known mean. If $C$ has known mean $\mu_C$ and is correlated with $f$:

$$\hat{I}_{\text{CV}} = \frac{1}{n}\sum_{i=1}^{n} \left[ f(X_i) - c(C_i - \mu_C) \right]$$

Optimal coefficient $c^* = \text{Cov}(f, C) / \text{Var}(C)$ achieves maximum variance reduction.

## Bootstrap Methods

The bootstrap resamples observed data to estimate sampling distributions without parametric assumptions. Given a dataset of $n$ observations:

1. Draw $B$ bootstrap samples, each of size $n$, with replacement
2. Compute the statistic $\hat{\theta}^*_b$ for each bootstrap sample
3. Use the distribution of $\hat{\theta}^*_1, \ldots, \hat{\theta}^*_B$ to construct confidence intervals

**Percentile bootstrap confidence interval:**

$$\text{CI}_{1-\alpha} = \left[ \hat{\theta}^*_{(\alpha/2)},\; \hat{\theta}^*_{(1-\alpha/2)} \right]$$

where $\hat{\theta}^*_{(q)}$ is the $q$-th quantile of the bootstrap distribution. Bootstrap is particularly useful when the theoretical distribution of a statistic is unknown or intractable.

## Convergence: How Many Samples?

The $O(1/\sqrt{n})$ convergence rate means halving the error requires quadrupling the sample size. For a 95% confidence interval with half-width $\epsilon$:

$$n = \left( \frac{1.96 \cdot \sigma}{\epsilon} \right)^2$$

To achieve $\epsilon = 0.01$ when $\sigma = 1$, you need $n \approx 38{,}416$ samples. This slow convergence is the price Monte Carlo pays for its dimension-independence.

## When to Use Monte Carlo

- **High-dimensional integration** (d > 5) where deterministic quadrature is infeasible
- **Complex geometries** where the integration region is irregular
- **Stochastic models** where randomness is inherent (simulation)
- **Bayesian inference** where posterior distributions have no closed form
- **Optimization** via stochastic methods (simulated annealing, evolutionary algorithms)

Monte Carlo is not ideal for smooth, low-dimensional integrals where Gauss quadrature converges exponentially faster.

## See Also

- [Markov Chains](./markov-chains.md) -- Markov chain theory underlying MCMC sampling
- [MCMC Theory](./mcmc.md) -- Markov chain Monte Carlo for intractable distributions
- [Bayesian Inference](../bayesian/inference.md) -- Monte Carlo methods in Bayesian computation
- [Probability Distributions](../statistical/distributions.md) -- Distributions used as sampling targets
