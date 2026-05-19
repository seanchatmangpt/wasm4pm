# Bayesian Inference

Bayesian inference provides a coherent framework for updating beliefs in light of evidence. Unlike frequentist statistics, which treats parameters as fixed unknowns, Bayesian inference treats parameters as random variables with probability distributions that evolve as data arrives. This perspective naturally quantifies uncertainty, incorporates prior knowledge, and produces full posterior distributions rather than point estimates.

## Bayes' Theorem

The foundation is Bayes' theorem, which relates the posterior distribution to the prior and the likelihood:

$$\underbrace{p(\theta \mid \text{data})}_{\text{posterior}} = \frac{\overbrace{p(\text{data} \mid \theta)}^{\text{likelihood}} \cdot \overbrace{p(\theta)}^{\text{prior}}}{\underbrace{p(\text{data})}_{\text{marginal likelihood}}}$$

The marginal likelihood (evidence) is the normalizing constant:

$$p(\text{data}) = \int p(\text{data} \mid \theta) \, p(\theta) \, d\theta$$

In practice, we often work with the unnormalized posterior:

$$p(\theta \mid \text{data}) \propto p(\text{data} \mid \theta) \, p(\theta)$$

The proportionality is sufficient for many computational methods (MCMC, variational inference) that do not require the normalizing constant.

## Prior Distributions

The prior $p(\theta)$ encodes our beliefs about the parameter before seeing data. The choice of prior is subjective and domain-dependent, but several strategies guide the choice:

**Informative priors** encode substantive domain knowledge. Example: if we know a parameter should be near 0.5 with moderate uncertainty, we might use $\theta \sim \text{Beta}(10, 10)$.

**Weakly informative priors** regularize the posterior without dominating it. They prevent extreme parameter values that the data does not support. Example: $\theta \sim \mathcal{N}(0, 10^2)$ constrains the parameter to a plausible range without asserting strong prior beliefs.

**Non-informative (flat) priors** attempt to let the data speak for itself. The Jeffreys prior is a common choice:

$$p(\theta) \propto \sqrt{\det(I(\theta))}$$

where $I(\theta)$ is the Fisher information matrix. Jeffreys priors are invariant under reparameterization, a desirable property.

## Likelihood Function

The likelihood $p(\text{data} \mid \theta)$ describes the probability of the observed data given the parameter. It is the bridge between data and parameters.

For independent observations $\mathbf{x} = (x_1, \ldots, x_n)$:

$$p(\mathbf{x} \mid \theta) = \prod_{i=1}^{n} p(x_i \mid \theta)$$

In log space (more numerically stable):

$$\log p(\mathbf{x} \mid \theta) = \sum_{i=1}^{n} \log p(x_i \mid \theta)$$

The likelihood is not a probability distribution over $\theta$ -- it is a function of $\theta$ for fixed data. It becomes a distribution only after multiplication by the prior and normalization.

## Posterior Distribution

The posterior $p(\theta \mid \text{data})$ is the complete Bayesian answer. It contains all information about the parameter given the observed data.

**Posterior summaries:**
- **Point estimate**: Posterior mean $\mathbb{E}[\theta \mid \text{data}]$ (minimizes squared error loss), or posterior mode (MAP estimate, maximizes posterior density)
- **Uncertainty**: Posterior variance, credible intervals
- **Credible interval**: A $100(1-\alpha)\%$ credible interval $[a, b]$ satisfies $\int_a^b p(\theta \mid \text{data}) \, d\theta = 1 - \alpha$. Unlike frequentist confidence intervals, the Bayesian interpretation is direct: there is a $(1-\alpha)$ probability the parameter lies in this interval, given the data and prior.

## Conjugate Priors

When the prior and posterior belong to the same distribution family, the pair is called **conjugate**. Conjugate priors give closed-form posterior updates -- no numerical integration needed.

| Likelihood | Parameter | Conjugate Prior | Posterior |
|-----------|-----------|----------------|-----------|
| Binomial | $p$ | Beta | Beta |
| Poisson | $\lambda$ | Gamma | Gamma |
| Normal (known $\sigma^2$) | $\mu$ | Normal | Normal |
| Normal (known $\mu$) | $\sigma^2$ | Inverse-Gamma | Inverse-Gamma |
| Multinomial | $\mathbf{p}$ | Dirichlet | Dirichlet |

**Example (Beta-Binomial):** If $X \sim \text{Bin}(n, p)$ with prior $p \sim \text{Beta}(\alpha, \beta)$, then after observing $k$ successes:

$$p \mid \text{data} \sim \text{Beta}(\alpha + k, \; \beta + n - k)$$

The posterior is a simple update: add successes to $\alpha$, add failures to $\beta$.

## MCMC for Non-Conjugate Models

When conjugate priors are unavailable or the model is complex, we resort to Markov Chain Monte Carlo:

1. Construct a Markov chain whose stationary distribution is the posterior
2. Run the chain long enough to collect samples from the posterior
3. Approximate posterior summaries from the samples

Common methods: Metropolis-Hastings, Gibbs sampling, Hamiltonian Monte Carlo (HMC), No-U-Turn Sampler (NUTS). See [MCMC Theory](../probabilistic/mcmc.md) for details.

## Bayesian vs Frequentist

| Aspect | Bayesian | Frequentist |
|--------|----------|-------------|
| Parameters | Random variables with distributions | Fixed unknown constants |
| Data | Fixed (observed) | Random (from repeated sampling) |
| Uncertainty | Posterior distribution | Confidence intervals, p-values |
| Prior knowledge | Explicitly incorporated | Not formally used |
| Prediction | Predictive distribution | Point predictions |
| Small samples | Naturally handles via prior | Limited by asymptotic approximations |

The Bayesian approach is most advantageous when data is scarce, prior knowledge is available, or full uncertainty quantification is needed. It is computationally more expensive but conceptually more direct.

## See Also

- [MCMC Theory](../probabilistic/mcmc.md) -- Computational methods for Bayesian inference
- [Monte Carlo Methods](../probabilistic/monte-carlo.md) -- Sampling techniques for posterior computation
- [GP Regression](../gaussian-processes/regression.md) -- Bayesian non-parametric regression
- [Hypothesis Testing](../statistical/hypothesis-testing.md) -- Frequentist counterpart
