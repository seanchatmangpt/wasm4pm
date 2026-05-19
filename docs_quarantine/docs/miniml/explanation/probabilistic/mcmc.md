# MCMC Theory

Markov Chain Monte Carlo (MCMC) methods construct a Markov chain whose stationary distribution is a target distribution we want to sample from. When direct sampling is impossible -- because the distribution is only known up to a normalizing constant, or because it lives in a high-dimensional space -- MCMC provides a practical way to generate dependent samples that are (asymptotically) from the target distribution.

## The Problem MCMC Solves

Suppose we want to sample from a distribution $\pi(x)$ but can only evaluate $f(x) = c \cdot \pi(x)$ for some unknown constant $c$. This arises constantly in Bayesian inference, where:

$$\pi(\theta \mid \text{data}) = \frac{p(\text{data} \mid \theta) \, p(\theta)}{p(\text{data})}$$

The marginal likelihood $p(\text{data}) = \int p(\text{data} \mid \theta) \, p(\theta) \, d\theta$ is typically intractable. MCMC lets us sample from $\pi(\theta \mid \text{data})$ without computing this integral.

## Metropolis-Hastings Algorithm

The Metropolis-Hastings (MH) algorithm is the most general MCMC method. At each step, it proposes a move and decides whether to accept it.

**Algorithm:**

1. Start at current state $x_t$
2. Propose $x' \sim q(x' \mid x_t)$ from a proposal distribution
3. Compute acceptance probability:

$$\alpha = \min\left(1, \frac{\pi(x') \, q(x_t \mid x')}{\pi(x_t) \, q(x' \mid x_t)}\right)$$

4. Set $x_{t+1} = \begin{cases} x' & \text{with probability } \alpha \\ x_t & \text{otherwise} \end{cases}$

**Special case -- Metropolis.** If the proposal is symmetric ($q(x' \mid x) = q(x \mid x')$), the acceptance ratio simplifies to:

$$\alpha = \min\left(1, \frac{\pi(x')}{\pi(x_t)}\right)$$

This is the original Metropolis algorithm. Common symmetric proposals include Gaussian random walk: $q(x' \mid x) = \mathcal{N}(x, \sigma^2 I)$.

## Detailed Balance

The key theoretical property ensuring MCMC correctness is **detailed balance**:

$$\pi(x) \, P(x \to x') = \pi(x') \, P(x' \to x)$$

where $P(x \to x')$ is the transition probability of the chain. Detailed balance implies that $\pi$ is a stationary distribution of the chain. The MH acceptance ratio is designed specifically to satisfy detailed balance.

Proof sketch: if $\pi(x') q(x' \mid x) \geq \pi(x) q(x \mid x')$, then $\alpha = 1$ for both directions and balance holds. Otherwise, the acceptance probabilities adjust to maintain equality.

## Burn-in Period

The chain starts at an arbitrary point and needs time to "forget" its initial state and approach the stationary distribution. The **burn-in** (or warm-up) is the number of initial samples discarded.

There is no general formula for burn-in length. It depends on:

- **Starting point**: Closer to high-probability regions means shorter burn-in
- **Chain geometry**: Highly correlated targets mix slowly, requiring longer burn-in
- **Proposal distribution**: Well-tuned proposals converge faster

A practical approach: monitor a scalar summary of the chain (e.g., log-posterior) and discard samples until it stabilizes. Conservative practice: discard the first half of the chain.

## Convergence Diagnostics

How do we know the chain has converged? Several diagnostics help:

**Trace plots.** Plot the parameter value against iteration number. A converged chain should look like "hairy caterpillar" -- no trends, no long-range structure.

**Autocorrelation.** The lag-$k$ autocorrelation measures dependence between samples $k$ steps apart:

$$\rho_k = \frac{\text{Cov}(X_t, X_{t+k})}{\text{Var}(X_t)}$$

High autocorrelation means the chain is mixing slowly. The **effective sample size** is:

$$n_{\text{eff}} = \frac{n}{1 + 2\sum_{k=1}^{\infty} \rho_k}$$

A chain of 10,000 samples with $n_{\text{eff}} = 100$ provides roughly as much information as 100 independent samples.

**Gelman-Rubin statistic ($\hat{R}$).** Run multiple chains from dispersed starting points. Convergence is indicated when $\hat{R} \approx 1$ (values above 1.1 suggest non-convergence).

## Gibbs Sampling

Gibbs sampling is a special case of MH where each component of the state vector is updated in turn by sampling from its full conditional distribution.

Given $x = (x_1, x_2, \ldots, x_d)$, cycle through:

$$x_1^{(t+1)} \sim \pi(x_1 \mid x_2^{(t)}, x_3^{(t)}, \ldots, x_d^{(t)})$$
$$x_2^{(t+1)} \sim \pi(x_2 \mid x_1^{(t+1)}, x_3^{(t)}, \ldots, x_d^{(t)})$$
$$\vdots$$

The acceptance probability is always 1 -- every proposal is accepted. This is because the full conditional is the exact conditional distribution, so detailed balance is automatically satisfied.

Gibbs sampling is most effective when the full conditionals are easy to sample from (e.g., conjugate models). When conditionals are not standard distributions, MH-within-Gibbs or slice sampling may be needed.

## Applications

- **Bayesian inference**: Sampling from posterior distributions
- **Numerical integration**: $\mathbb{E}[f(X)] \approx \frac{1}{n}\sum_{t=1}^{n} f(X_t)$
- **Optimization**: Simulated annealing is a variant of MCMC
- **Model selection**: Computing marginal likelihoods via bridge sampling
- **Latent variable models**: Imputing missing data, mixture model estimation

## See Also

- [Markov Chains](./markov-chains.md) -- Theoretical foundation of chain properties
- [Monte Carlo Methods](./monte-carlo.md) -- General random sampling techniques
- [Bayesian Inference](../bayesian/inference.md) -- Primary application domain for MCMC
- [Hidden Markov Models](./hmm.md) -- Latent variable models with Markov structure
