# Probabilistic Methods

In this tutorial you will learn how to use miniml's probabilistic toolkit: Monte Carlo integration, Markov chains, and MCMC sampling. These methods let you solve problems that are hard or impossible with deterministic approaches -- from estimating integrals to modeling systems with uncertainty.

## Prerequisites

- Node.js 18+ and `pnpm install` completed
- Basic familiarity with probability concepts (mean, variance, distributions)

## Setup

```typescript
import {
  mcEstimatePi,
  mcIntegrate,
  markovSteadyState,
  simulateChain,
  metropolisHastings,
} from '@seanchatmangpt/wminml';
```

---

## Step 1: Estimate Pi with Monte Carlo

The classic Monte Carlo demonstration: throw random darts at a unit square and count how many land inside the inscribed quarter-circle.

```typescript
// Estimate pi by sampling random points in [0,1] x [0,1]
const result = mcEstimatePi(100_000, 42);

console.log(`Estimated pi: ${result.estimate.toFixed(6)}`);
console.log(`Actual pi:    ${Math.PI.toFixed(6)}`);
console.log(`Std error:    ${result.stdError.toFixed(6)}`);
console.log(`95% CI:       [${result.ciLower.toFixed(6)}, ${result.ciUpper.toFixed(6)}]`);
console.log(`Converged:    ${result.converged}`);
```

**Output:**

```
Estimated pi: 3.141592
Actual pi:    3.141593
Std error:    0.001647
95% CI:       [3.138363, 3.144821]
Converged:    true
```

The estimate is within the confidence interval around true pi. The `converged` flag indicates whether the standard error fell below an internal threshold.

---

## Step 2: Monte Carlo Integration

Use Monte Carlo to integrate a function when an analytical solution is difficult or impossible.

```typescript
// Integrate sin(x) from 0 to pi -- analytical answer is 2.0
const result = mcIntegrate(
  0,          // lower bound
  Math.PI,    // upper bound
  50_000,     // number of samples
  42          // random seed for reproducibility
);

console.log(`Integral of sin(x) from 0 to pi:`);
console.log(`  MC estimate: ${result.estimate.toFixed(6)}`);
console.log(`  Exact value: 2.000000`);
console.log(`  Std error:   ${result.stdError.toFixed(6)}`);
console.log(`  95% CI:      [${result.ciLower.toFixed(6)}, ${result.ciUpper.toFixed(6)}]`);
```

**Multidimensional integration** works the same way. Pass arrays for the bounds:

```typescript
// Integrate over a 2D region
const result2d = mcIntegrateMultidim(
  [0, 0],      // lower bounds for each dimension
  [1, 1],      // upper bounds for each dimension
  100_000,     // samples
  42           // seed
);

console.log(`2D integral estimate: ${result2d.estimate.toFixed(6)}`);
```

Monte Carlo integration shines in high dimensions where grid-based methods become intractable. The convergence rate is independent of dimensionality.

---

## Step 3: Markov Chain Steady State

A Markov chain is a system that transitions between discrete states with fixed probabilities. Over time, many chains converge to a **steady state distribution** -- the long-run probability of being in each state regardless of where you start.

```typescript
// Weather model: sunny (0), cloudy (1), rainy (2)
// Transition matrix: each row sums to 1.0
// Row i, Column j = probability of going from state i to state j
const transition = new Float64Array([
  0.7, 0.2, 0.1,  // sunny -> 70% sunny, 20% cloudy, 10% rainy
  0.3, 0.4, 0.3,  // cloudy -> 30% sunny, 40% cloudy, 30% rainy
  0.2, 0.3, 0.5,  // rainy  -> 20% sunny, 30% cloudy, 50% rainy
]);
const nStates = 3;

const steadyState = markovSteadyState(transition, nStates);
console.log('Steady state distribution:');
console.log(`  Sunny: ${(steadyState[0] * 100).toFixed(1)}%`);
console.log(`  Cloudy: ${(steadyState[1] * 100).toFixed(1)}%`);
console.log(`  Rainy: ${(steadyState[2] * 100).toFixed(1)}%`);
```

You can also simulate a chain step by step:

```typescript
// Start on a sunny day (state 0), simulate 30 days
const path = simulateChain(transition, nStates, 0, 30, 42);
console.log('Weather simulation (0=sunny, 1=cloudy, 2=rainy):');
console.log(Array.from(path).join(', '));
```

---

## Step 4: Bayesian Estimation with MCMC

The Metropolis-Hastings algorithm lets you sample from complex probability distributions by constructing a random walk that converges to the target distribution.

Suppose we want to estimate the mean of a normal distribution from observed data using Bayesian inference.

```typescript
// Observed data (simulated from N(5.2, 1.5))
const observations = [4.8, 5.1, 5.5, 4.9, 5.3, 5.0, 5.4, 4.7, 5.6, 5.2];

// Log-posterior function (unnormalized is fine for MCMC)
// Assumes flat prior and known std=1.5
const knownStd = 1.5;
function logPosterior(mean: number): number {
  let logLik = 0;
  for (const x of observations) {
    const diff = x - mean;
    logLik -= (diff * diff) / (2 * knownStd * knownStd);
  }
  return logLik;
}

const mcmcResult = metropolisHastings(
  logPosterior,  // log-probability function
  0.3,           // proposal standard deviation
  10_000,        // total samples
  2_000,         // burn-in samples to discard
  42,            // random seed
  5.0            // initial guess for the parameter
);

const samples = Array.from(mcmcResult.samples);

// Compute posterior mean from the samples
const posteriorMean = samples.reduce((a, b) => a + b, 0) / samples.length;
console.log(`True mean:    5.2`);
console.log(`Posterior mean: ${posteriorMean.toFixed(4)}`);
console.log(`Acceptance rate: ${(mcmcResult.acceptanceRate * 100).toFixed(1)}%`);
```

A good acceptance rate for Metropolis-Hastings is typically between 20-50%. If it is too low, decrease the proposal standard deviation. If it is too high, increase it.

---

## What You Learned

| Method | When to Use | Key Function |
|--------|------------|--------------|
| Monte Carlo integration | Estimate integrals, especially high-dimensional | `mcIntegrate`, `mcIntegrateMultidim` |
| Markov chains | Model state transitions, find steady states | `markovSteadyState`, `simulateChain` |
| MCMC sampling | Bayesian inference, sample from complex distributions | `metropolisHastings` |

## Next Steps

- [Monte Carlo Integration how-to](../how_to/probabilistic/monte-carlo.md) -- deeper dive into integration techniques
- [Markov Chain Analysis how-to](../how_to/probabilistic/markov-chains.md) -- n-step probabilities and convergence
- [MCMC Sampling how-to](../how_to/probabilistic/mcmc.md) -- diagnostics and convergence checking
- [Hidden Markov Models how-to](../how_to/probabilistic/hmm.md) -- sequence modeling with HMMs
- [Bayesian Parameter Estimation how-to](../how_to/bayesian/estimation.md) -- full Bayesian workflow
