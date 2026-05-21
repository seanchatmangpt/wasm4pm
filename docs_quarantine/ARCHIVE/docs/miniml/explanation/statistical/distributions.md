# Probability Distributions

Probability distributions describe how random variables are spread across possible values. They are the building blocks of statistical inference, machine learning, and stochastic modeling. This reference covers the most important distributions, their properties, and the relationships between them.

## Normal (Gaussian) Distribution

The normal distribution is the most important distribution in statistics, due to the Central Limit Theorem.

$$f(x) = \frac{1}{\sigma\sqrt{2\pi}} \exp\left(-\frac{(x - \mu)^2}{2\sigma^2}\right), \quad x \in \mathbb{R}$$

**Parameters:** mean $\mu$, standard deviation $\sigma$ (variance $\sigma^2$).

**Notation:** $X \sim \mathcal{N}(\mu, \sigma^2)$.

**Properties:**
- Symmetric about $\mu$
- 68-95-99.7 rule: approximately 68%, 95%, 99.7% of mass within 1, 2, 3 standard deviations
- The sum of independent normals is normal: $X + Y \sim \mathcal{N}(\mu_X + \mu_Y, \sigma_X^2 + \sigma_Y^2)$
- Standard normal: $Z = (X - \mu) / \sigma \sim \mathcal{N}(0, 1)$

**CLT connection:** For i.i.d. random variables with finite variance, the sample mean is approximately normal for large $n$, regardless of the underlying distribution.

## Binomial Distribution

Models the number of successes in $n$ independent trials, each with success probability $p$.

$$P(X = k) = \binom{n}{k} p^k (1-p)^{n-k}, \quad k = 0, 1, \ldots, n$$

**Parameters:** number of trials $n$, success probability $p$.

**Notation:** $X \sim \text{Bin}(n, p)$.

**Properties:**
- Mean: $\mathbb{E}[X] = np$
- Variance: $\text{Var}(X) = np(1-p)$
- Sum of independent binomials with same $p$: $\text{Bin}(n_1, p) + \text{Bin}(n_2, p) = \text{Bin}(n_1 + n_2, p)$

**Special cases:** $\text{Bin}(1, p)$ is the Bernoulli distribution. For large $n$, $\text{Bin}(n, p) \approx \mathcal{N}(np, np(1-p))$.

## Poisson Distribution

Models the number of events occurring in a fixed interval, given a constant average rate.

$$P(X = k) = \frac{\lambda^k e^{-\lambda}}{k!}, \quad k = 0, 1, 2, \ldots$$

**Parameter:** rate $\lambda$ (mean and variance are both $\lambda$).

**Notation:** $X \sim \text{Pois}(\lambda)$.

**Properties:**
- Models rare events (small $p$, large $n$ with $\lambda = np$)
- $\text{Bin}(n, p) \to \text{Pois}(\lambda)$ as $n \to \infty$, $p \to 0$, $np = \lambda$
- Sum of independent Poissons: $\text{Pois}(\lambda_1) + \text{Pois}(\lambda_2) = \text{Pois}(\lambda_1 + \lambda_2)$
- Used in: count data, event rates, queuing theory, defect modeling

## Exponential Distribution

Models the time between events in a Poisson process (waiting times).

$$f(x) = \lambda e^{-\lambda x}, \quad x \geq 0$$

**Parameter:** rate $\lambda$ (mean = $1/\lambda$).

**Notation:** $X \sim \text{Exp}(\lambda)$.

**Properties:**
- **Memoryless**: $P(X > s + t \mid X > s) = P(X > t)$. The remaining wait time does not depend on how long you have already waited.
- CDF: $F(x) = 1 - e^{-\lambda x}$
- Relationship to Poisson: If events occur at rate $\lambda$, inter-arrival times are $\text{Exp}(\lambda)$

## Chi-Squared Distribution

The distribution of the sum of squared standard normal variables.

$$Q = \sum_{i=1}^{k} Z_i^2 \sim \chi^2_k, \quad Z_i \sim \mathcal{N}(0, 1) \text{ i.i.d.}$$

**Parameter:** degrees of freedom $k$.

**Notation:** $Q \sim \chi^2_k$.

**Properties:**
- Mean: $k$, Variance: $2k$
- Non-negative and right-skewed
- Applications: goodness-of-fit tests, confidence intervals for variance, likelihood ratio tests
- Sum: $\chi^2_k + \chi^2_m = \chi^2_{k+m}$ (for independent variables)

## Student's t Distribution

Used for inference about means when the sample size is small and the population variance is unknown.

$$f(t) = \frac{\Gamma(\frac{\nu+1}{2})}{\sqrt{\nu\pi}\,\Gamma(\frac{\nu}{2})} \left(1 + \frac{t^2}{\nu}\right)^{-\frac{\nu+1}{2}}, \quad t \in \mathbb{R}$$

**Parameter:** degrees of freedom $\nu = n - 1$.

**Notation:** $T \sim t_\nu$.

**Properties:**
- Symmetric about 0, heavier tails than the normal
- Converges to $\mathcal{N}(0, 1)$ as $\nu \to \infty$
- For small $\nu$, more probability mass in the tails -- wider confidence intervals
- Derivation: $T = Z / \sqrt{Q/\nu}$ where $Z \sim \mathcal{N}(0, 1)$ and $Q \sim \chi^2_\nu$ independently

## F Distribution

The ratio of two independent chi-squared variables, each divided by its degrees of freedom.

$$F = \frac{Q_1 / \nu_1}{Q_2 / \nu_2}, \quad Q_1 \sim \chi^2_{\nu_1}, \; Q_2 \sim \chi^2_{\nu_2}$$

**Parameters:** numerator df $\nu_1$, denominator df $\nu_2$.

**Notation:** $F \sim F_{\nu_1, \nu_2}$.

**Properties:**
- Non-negative, right-skewed
- Used in ANOVA (comparing group variances) and regression (overall model significance)
- If $T \sim t_\nu$, then $T^2 \sim F_{1, \nu}$

## Relationships Between Distributions

```
Normal Z ~ N(0,1)
  |                Z^2 ~ chi^2_1
  |                Z/sqrt(chi^2_nu/nu) ~ t_nu
  |
chi^2_k
  |  sum: chi^2_k + chi^2_m = chi^2_{k+m}
  |  ratio: (chi^2_a/a) / (chi^2_b/b) ~ F_{a,b}
  |
Binomial(n, p)
  |  n large, p fixed -> N(np, np(1-p))
  |  n large, p small, np=lambda -> Pois(lambda)
  |
Poisson(lambda)
  |  lambda large -> N(lambda, lambda)
  |
Exponential(lambda)
  |  sum of k iid -> Gamma(k, lambda)
```

## See Also

- [Hypothesis Testing](./hypothesis-testing.md) -- Using these distributions for statistical tests
- [ANOVA](./anova.md) -- F distribution in analysis of variance
- [Bayesian Inference](../bayesian/inference.md) -- Distributions as priors and posteriors
- [Monte Carlo Methods](../probabilistic/monte-carlo.md) -- Sampling from these distributions
