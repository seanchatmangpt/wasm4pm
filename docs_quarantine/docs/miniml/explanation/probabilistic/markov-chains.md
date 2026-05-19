# Markov Chains

A Markov chain is a stochastic process where the future depends only on the present, not the past. This "memoryless" property makes Markov chains tractable models for sequential data, random walks, state transitions, and the foundation of MCMC sampling.

## The Markov Property

A discrete-time stochastic process $\{X_t\}_{t=0,1,2,\ldots}$ is a Markov chain if:

$$P(X_{t+1} = j \mid X_t = i, X_{t-1} = i_{t-1}, \ldots, X_0 = i_0) = P(X_{t+1} = j \mid X_t = i)$$

The conditional probability $P(X_{t+1} = j \mid X_t = i)$ is the **transition probability**, denoted $p_{ij}$. The entire chain is characterized by:

1. **Initial distribution**: $\pi_0(i) = P(X_0 = i)$
2. **Transition matrix**: $\mathbf{P}$ where $P_{ij} = p_{ij}$

## Transition Matrices

The transition matrix $\mathbf{P}$ is a square matrix with specific properties:

- **Stochastic**: Each row sums to 1: $\sum_j p_{ij} = 1$ for all $i$
- **Non-negative**: All entries $p_{ij} \geq 0$

For a chain with states $\{1, 2, \ldots, N\}$:

$$\mathbf{P} = \begin{pmatrix} p_{11} & p_{12} & \cdots & p_{1N} \\ p_{21} & p_{22} & \cdots & p_{2N} \\ \vdots & \vdots & \ddots & \vdots \\ p_{N1} & p_{N2} & \cdots & p_{NN} \end{pmatrix}$$

**N-step transitions.** The probability of going from state $i$ to state $j$ in exactly $n$ steps is the $(i, j)$ entry of $\mathbf{P}^n$:

$$P(X_{t+n} = j \mid X_t = i) = (\mathbf{P}^n)_{ij}$$

This is proven by induction using the Chapman-Kolmogorov equations:

$$(\mathbf{P}^{m+n})_{ij} = \sum_k (\mathbf{P}^m)_{ik} (\mathbf{P}^n)_{kj}$$

## Chain Properties

Three properties determine whether a chain has a well-behaved long-run distribution:

**Irreducibility.** Every state is reachable from every other state. Formally, for all $i, j$, there exists $n \geq 0$ such that $(\mathbf{P}^n)_{ij} > 0$. An irreducible chain has a single communicating class.

**Aperiodicity.** A state $i$ is aperiodic if $\gcd\{n \geq 1 : (\mathbf{P}^n)_{ii} > 0\} = 1$. A chain is aperiodic if all its states are aperiodic. Periodic chains oscillate and never settle.

**Positive recurrence.** The expected return time to every state is finite: $\mathbb{E}[T_i \mid X_0 = i] < \infty$ for all $i$.

A chain that is **irreducible, aperiodic, and positive recurrent** is called **ergodic**.

## Stationary Distributions

A distribution $\boldsymbol{\pi}$ is **stationary** if it is invariant under the transition matrix:

$$\boldsymbol{\pi} \mathbf{P} = \boldsymbol{\pi}, \quad \sum_i \pi_i = 1, \quad \pi_i \geq 0$$

This is equivalent to the eigenvalue problem: $\boldsymbol{\pi}$ is a left eigenvector of $\mathbf{P}$ with eigenvalue 1.

**Power iteration.** For an ergodic chain, the stationary distribution can be found by iterating:

$$\boldsymbol{\pi}^{(k+1)} = \boldsymbol{\pi}^{(k)} \mathbf{P}$$

Starting from any initial distribution $\boldsymbol{\pi}^{(0)}$, the iteration converges: $\boldsymbol{\pi}^{(k)} \to \boldsymbol{\pi}$ as $k \to \infty$.

**Uniqueness.** An irreducible and positive recurrent chain has exactly one stationary distribution. If it is also aperiodic, the chain converges to it regardless of the starting state.

## Simulation

Simulating a Markov chain is straightforward:

1. Choose initial state $X_0$ from initial distribution $\pi_0$
2. At each step $t$, sample $X_{t+1}$ from the conditional distribution $P(X_{t+1} \mid X_t)$

For a discrete chain with transition matrix $\mathbf{P}$, given current state $i$, sample $X_{t+1}$ from the categorical distribution defined by row $i$ of $\mathbf{P}$.

## Mixing Times

The **mixing time** measures how quickly a chain approaches its stationary distribution. Define the total variation distance:

$$d_{\text{TV}}(\mu, \nu) = \frac{1}{2}\sum_i |\mu_i - \nu_i|$$

The mixing time is:

$$\tau_{\text{mix}}(\epsilon) = \min\{n : \max_{x_0} d_{\text{TV}}(P(X_n \mid X_0 = x_0), \boldsymbol{\pi}) \leq \epsilon\}$$

Fast mixing (small $\tau_{\text{mix}}$) means the chain "forgets" its starting position quickly. This is critical for MCMC, where we want samples from the stationary distribution as soon as possible.

## Ergodic Theorem

For an ergodic Markov chain, time averages converge to ensemble averages:

$$\frac{1}{n}\sum_{t=0}^{n-1} f(X_t) \xrightarrow{a.s.} \mathbb{E}_{\boldsymbol{\pi}}[f(X)] = \sum_i \pi_i f(i)$$

This justifies using a single long simulation to estimate expectations under the stationary distribution. It is the theoretical foundation of MCMC methods.

## See Also

- [MCMC Theory](./mcmc.md) -- Using Markov chains to sample from arbitrary distributions
- [Hidden Markov Models](./hmm.md) -- Markov chains with unobserved states
- [Monte Carlo Methods](./monte-carlo.md) -- Random sampling for numerical computation
- [Bayesian Inference](../bayesian/inference.md) -- Markov chains in Bayesian computation
