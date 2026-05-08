# Hidden Markov Models

A Hidden Markov Model (HMM) describes a system where the true state is unobservable (hidden), but it produces observable outputs. The model assumes the hidden state evolves as a Markov chain, and each state generates observations according to a state-specific probability distribution. HMMs are foundational in speech recognition, NLP, bioinformatics, and time series analysis.

## Model Definition

An HMM is defined by five components:

- **N** -- number of hidden states $S = \{s_1, \ldots, s_N\}$
- **M** -- number of observation symbols $V = \{v_1, \ldots, v_M\}$
- **A** -- transition probability matrix, where $a_{ij} = P(q_{t+1} = s_j \mid q_t = s_i)$
- **B** -- emission probability matrix, where $b_j(k) = P(o_t = v_k \mid q_t = s_j)$
- **$\pi$** -- initial state distribution, where $\pi_i = P(q_1 = s_i)$

The model is compactly written as $\lambda = (A, B, \pi)$.

At each time step $t$, the hidden state $q_t$ transitions according to $A$, and generates an observation $o_t$ according to $B$. The observer sees only the sequence $O = (o_1, o_2, \ldots, o_T)$, never the hidden states.

## The Three Fundamental Problems

HMMs address three computational problems:

1. **Evaluation**: Given $\lambda$ and $O$, compute $P(O \mid \lambda)$
2. **Decoding**: Given $\lambda$ and $O$, find the most likely state sequence
3. **Learning**: Given $O$, find the model parameters $\lambda$ that maximize $P(O \mid \lambda)$

Each problem has an efficient dynamic programming solution.

## Forward Algorithm (Evaluation)

The forward algorithm computes $P(O \mid \lambda)$ in $O(N^2 T)$ time using the forward variable:

$$\alpha_t(i) = P(o_1, o_2, \ldots, o_t, q_t = s_i \mid \lambda)$$

**Initialization:**

$$\alpha_1(i) = \pi_i \cdot b_i(o_1), \quad 1 \leq i \leq N$$

**Induction:**

$$\alpha_{t+1}(j) = \left[ \sum_{i=1}^{N} \alpha_t(i) \cdot a_{ij} \right] \cdot b_j(o_{t+1})$$

**Termination:**

$$P(O \mid \lambda) = \sum_{i=1}^{N} \alpha_T(i)$$

A direct (naive) computation would require $O(N^T)$ -- the forward algorithm reduces this to $O(N^2 T)$.

## Viterbi Algorithm (Decoding)

The Viterbi algorithm finds the single best state sequence $Q^* = \arg\max_Q P(Q \mid O, \lambda)$ using the Viterbi variable:

$$\delta_t(i) = \max_{q_1, \ldots, q_{t-1}} P(q_1, \ldots, q_{t-1}, q_t = s_i, o_1, \ldots, o_t \mid \lambda)$$

**Initialization:**

$$\delta_1(i) = \pi_i \cdot b_i(o_1), \quad \psi_1(i) = 0$$

**Recursion:**

$$\delta_{t+1}(j) = \max_{1 \leq i \leq N} \left[ \delta_t(i) \cdot a_{ij} \right] \cdot b_j(o_{t+1})$$

$$\psi_{t+1}(j) = \arg\max_{1 \leq i \leq N} \left[ \delta_t(i) \cdot a_{ij} \right]$$

**Termination** (backtrack):

$$q_T^* = \arg\max_{1 \leq i \leq N} \delta_T(i), \quad q_t^* = \psi_{t+1}(q_{t+1}^*)$$

The backtracking pointers $\psi$ let us recover the optimal path. Like the forward algorithm, Viterbi runs in $O(N^2 T)$.

## Backward Algorithm

The backward variable complements the forward variable:

$$\beta_t(i) = P(o_{t+1}, o_{t+2}, \ldots, o_T \mid q_t = s_i, \lambda)$$

**Initialization:** $\beta_T(i) = 1$ for all $i$.

**Induction:**

$$\beta_t(i) = \sum_{j=1}^{N} a_{ij} \cdot b_j(o_{t+1}) \cdot \beta_{t+1}(j)$$

Combining forward and backward variables gives the posterior probability of being in state $s_i$ at time $t$:

$$\gamma_t(i) = P(q_t = s_i \mid O, \lambda) = \frac{\alpha_t(i) \cdot \beta_t(i)}{\sum_{j=1}^{N} \alpha_t(j) \cdot \beta_t(j)}$$

## Baum-Welch Algorithm (Learning)

The Baum-Welch algorithm uses Expectation-Maximization to learn model parameters from observations. It iteratively updates $\lambda = (A, B, \pi)$ to maximize $P(O \mid \lambda)$.

**E-step.** Compute $\gamma_t(i)$ (state posterior) and $\xi_t(i,j)$ (transition posterior):

$$\xi_t(i,j) = \frac{\alpha_t(i) \cdot a_{ij} \cdot b_j(o_{t+1}) \cdot \beta_{t+1}(j)}{\sum_{i=1}^{N}\sum_{j=1}^{N} \alpha_t(i) \cdot a_{ij} \cdot b_j(o_{t+1}) \cdot \beta_{t+1}(j)}$$

**M-step.** Re-estimate parameters:

$$\hat{\pi}_i = \gamma_1(i), \quad \hat{a}_{ij} = \frac{\sum_{t=1}^{T-1} \xi_t(i,j)}{\sum_{t=1}^{T-1} \gamma_t(i)}, \quad \hat{b}_j(k) = \frac{\sum_{t: o_t = v_k} \gamma_t(j)}{\sum_{t=1}^{T} \gamma_t(j)}$$

Each iteration is guaranteed to increase (or maintain) $P(O \mid \lambda)$. Convergence is to a local maximum.

## Applications

- **Speech recognition**: Acoustic signals map to phonemes (hidden) via HMMs
- **Part-of-speech tagging**: Words (observations) generated from POS tags (hidden states)
- **Bioinformatics**: Gene finding -- DNA sequence observations, coding/non-coding hidden states
- **Finance**: Regime-switching models for market states (bull/bear)
- **Robotics**: Localization with noisy sensor readings

## See Also

- [Markov Chains](./markov-chains.md) -- The underlying Markov process theory
- [MCMC Theory](./mcmc.md) -- Another approach to sampling from latent variable models
- [Bayesian Inference](../bayesian/inference.md) -- Bayesian perspective on learning HMM parameters
- [Monte Carlo Methods](./monte-carlo.md) -- Stochastic computation underlying HMM inference
