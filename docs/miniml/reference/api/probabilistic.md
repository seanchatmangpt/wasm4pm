# Probabilistic API

Monte Carlo simulation, Markov chains, hidden Markov models, and MCMC sampling.

All functions operate on typed arrays (`Float64Array`, `Uint32Array`) for WASM interop. Call `await init()` before use.

---

## Monte Carlo Integration

### `mcIntegrate`

```ts
function mcIntegrate(
  a: number,
  b: number,
  nSamples: number,
  seed: number
): MonteCarloResult
```

Numerically integrates a user-defined function over `[a, b]` via Monte Carlo sampling.

| Parameter | Type | Description |
|-----------|------|-------------|
| `a` | `number` | Lower bound of integration |
| `b` | `number` | Upper bound of integration |
| `nSamples` | `number` | Number of Monte Carlo samples |
| `seed` | `number` | PRNG seed (deterministic reproducibility) |

**Returns:** `MonteCarloResult`

```ts
interface MonteCarloResult {
  estimate: number;      // Point estimate of the integral
  stdError: number;      // Standard error of the estimate
  ciLower: number;       // Lower bound of 95% confidence interval
  ciUpper: number;       // Upper bound of 95% confidence interval
  nSamples: number;      // Number of samples used
  converged: boolean;    // Whether the estimate converged (stdError < threshold)
}
```

---

### `mcIntegrateMultidim`

```ts
function mcIntegrateMultidim(
  lower: number[],
  upper: number[],
  nSamples: number,
  seed: number
): MonteCarloResult
```

Monte Carlo integration over a multidimensional hyper-rectangle.

| Parameter | Type | Description |
|-----------|------|-------------|
| `lower` | `number[]` | Lower bounds per dimension |
| `upper` | `number[]` | Upper bounds per dimension |
| `nSamples` | `number` | Number of Monte Carlo samples |
| `seed` | `number` | PRNG seed |

**Returns:** `MonteCarloResult` (same shape as `mcIntegrate`)

---

### `mcEstimatePi`

```ts
function mcEstimatePi(
  nSamples: number,
  seed: number
): MonteCarloResult
```

Estimates pi via rejection sampling within the unit square.

| Parameter | Type | Description |
|-----------|------|-------------|
| `nSamples` | `number` | Number of random points to sample |
| `seed` | `number` | PRNG seed |

**Returns:** `MonteCarloResult`

---

### `mcBootstrap`

```ts
function mcBootstrap(
  data: Float64Array,
  nBootstrap: number,
  seed: number
): BootstrapResult
```

Non-parametric bootstrap resampling for confidence interval estimation.

| Parameter | Type | Description |
|-----------|------|-------------|
| `data` | `Float64Array` | Input data vector |
| `nBootstrap` | `number` | Number of bootstrap resamples |
| `seed` | `number` | PRNG seed |

**Returns:** `BootstrapResult`

```ts
interface BootstrapResult {
  estimate: number;       // Bootstrap mean estimate
  ciLower: number;        // Lower confidence bound
  ciUpper: number;        // Upper confidence bound
  stdError: number;       // Bootstrap standard error
  nBootstrap: number;     // Number of resamples performed
  statisticName: string;  // Name of the computed statistic
}
```

---

## Markov Chains

### `markovSteadyState`

```ts
function markovSteadyState(
  matrix: Float64Array,
  nStates: number
): Float64Array
```

Computes the stationary distribution of a discrete-time Markov chain via power iteration.

| Parameter | Type | Description |
|-----------|------|-------------|
| `matrix` | `Float64Array` | Transition matrix (nStates x nStates), row-stochastic |
| `nStates` | `number` | Number of states |

**Returns:** `Float64Array` -- Stationary distribution (length `nStates`). Each element is non-negative and sums to 1.0.

---

### `markovNStepProbability`

```ts
function markovNStepProbability(
  matrix: Float64Array,
  nStates: number,
  steps: number
): Float64Array
```

Computes the state probability distribution after `steps` transitions.

| Parameter | Type | Description |
|-----------|------|-------------|
| `matrix` | `Float64Array` | Transition matrix (nStates x nStates), row-stochastic |
| `nStates` | `number` | Number of states |
| `steps` | `number` | Number of steps ahead |

**Returns:** `Float64Array` -- Probability distribution after n steps (length `nStates`).

---

### `simulateChain`

```ts
function simulateChain(
  matrix: Float64Array,
  nStates: number,
  initial: number,
  steps: number,
  seed: number
): Float64Array
```

Simulates a single realization of a Markov chain.

| Parameter | Type | Description |
|-----------|------|-------------|
| `matrix` | `Float64Array` | Transition matrix (nStates x nStates), row-stochastic |
| `nStates` | `number` | Number of states |
| `initial` | `number` | Starting state index (0-based) |
| `steps` | `number` | Chain length (number of transitions) |
| `seed` | `number` | PRNG seed |

**Returns:** `Float64Array` -- Sequence of visited state indices (length `steps + 1`).

---

## Hidden Markov Models

### `hmmForward`

```ts
function hmmForward(
  initial: Float64Array,
  transition: Float64Array,
  emission: Float64Array,
  obs: Uint32Array,
  nStates: number,
  nObs: number
): ForwardResult
```

Runs the forward algorithm to compute the observation likelihood and alpha matrix.

| Parameter | Type | Description |
|-----------|------|-------------|
| `initial` | `Float64Array` | Initial state distribution (length `nStates`) |
| `transition` | `Float64Array` | Transition matrix (nStates x nStates), row-stochastic |
| `emission` | `Float64Array` | Emission matrix (nStates x nObsSymbols) |
| `obs` | `Uint32Array` | Observed symbol sequence |
| `nStates` | `number` | Number of hidden states |
| `nObs` | `number` | Length of observation sequence |

**Returns:** `ForwardResult`

```ts
interface ForwardResult {
  alpha: Float64Array;   // Forward probabilities (nStates x nObs)
  likelihood: number;    // P(observations | model), log-scaled
}
```

---

### `hmmViterbi`

```ts
function hmmViterbi(
  initial: Float64Array,
  transition: Float64Array,
  emission: Float64Array,
  obs: Uint32Array,
  nStates: number,
  nObs: number
): ViterbiResult
```

Finds the most likely hidden state sequence via the Viterbi algorithm.

| Parameters** -- Same as `hmmForward`.

**Returns:** `ViterbiResult`

```ts
interface ViterbiResult {
  path: Uint32Array;        // Most likely state sequence (length nObs)
  logProbability: number;   // Log probability of the optimal path
}
```

---

### `hmmBackward`

```ts
function hmmBackward(
  initial: Float64Array,
  transition: Float64Array,
  emission: Float64Array,
  obs: Uint32Array,
  nStates: number,
  nObs: number
): BackwardResult
```

Runs the backward algorithm to compute backward probabilities and observation likelihood.

| Parameters** -- Same as `hmmForward`.

**Returns:** `BackwardResult`

```ts
interface BackwardResult {
  beta: Float64Array;    // Backward probabilities (nStates x nObs)
  likelihood: number;    // P(observations | model), log-scaled
}
```

---

### `hmmBaumWelch`

```ts
function hmmBaumWelch(
  obs: Uint32Array,
  nStates: number,
  nObsSymbols: number,
  maxIter: number = 100,
  tol: number = 1e-6,
  seed: number
): HMMResult
```

Learns HMM parameters from observation data using the Baum-Welch (EM) algorithm.

| Parameter | Type | Description |
|-----------|------|-------------|
| `obs` | `Uint32Array` | Observed symbol sequence |
| `nStates` | `number` | Number of hidden states |
| `nObsSymbols` | `number` | Number of distinct observation symbols |
| `maxIter` | `number` | Maximum EM iterations (default: 100) |
| `tol` | `number` | Convergence tolerance on log-likelihood (default: 1e-6) |
| `seed` | `number` | PRNG seed for initialization |

**Returns:** `HMMResult`

```ts
interface HMMResult {
  initial: Float64Array;        // Learned initial distribution (nStates)
  transition: Float64Array;     // Learned transition matrix (nStates x nStates)
  emission: Float64Array;       // Learned emission matrix (nStates x nObsSymbols)
  logLikelihood: number;        // Final log-likelihood
}
```

---

## MCMC Sampling

### `metropolisHastings`

```ts
function metropolisHastings(
  logProbFn: number,
  proposalSd: number,
  nSamples: number,
  burnIn: number,
  seed: number,
  initial: number
): MCMCResult
```

Samples from a target distribution using the Metropolis-Hastings algorithm with a Gaussian proposal.

| Parameter | Type | Description |
|-----------|------|-------------|
| `logProbFn` | `number` | Index of the registered log-probability function |
| `proposalSd` | `number` | Standard deviation of the Gaussian proposal distribution |
| `nSamples` | `number` | Total samples to collect (after burn-in) |
| `burnIn` | `number` | Number of initial samples to discard |
| `seed` | `number` | PRNG seed |
| `initial` | `number` | Starting parameter value |

**Returns:** `MCMCResult`

```ts
interface MCMCResult {
  samples: Float64Array;     // Posterior samples (length nSamples)
  acceptanceRate: number;    // Fraction of proposals accepted
}
```

> **Note:** The `logProbFn` parameter accepts an index into a pre-registered function table. Use the WASM registration API to bind JavaScript log-probability functions before calling `metropolisHastings`.
