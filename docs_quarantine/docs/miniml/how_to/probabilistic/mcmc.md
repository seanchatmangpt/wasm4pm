# MCMC Sampling

Estimate posterior distributions using Metropolis-Hastings Markov Chain Monte Carlo.

## What You'll Learn

- Sampling from arbitrary probability distributions
- Computing posterior statistics (mean, std, credible intervals)
- Monitoring acceptance rates for sampler health

## Prerequisites

```typescript
import { init, metropolisHastings, bayesianEstimate } from '@seanchatmangpt/wminml';
await init();
```

## Bayesian Parameter Estimation

Estimate a parameter using `bayesianEstimate` with a default standard normal target.

```typescript
const result = bayesianEstimate(10_000, 1_000, 42, 0.0, 1.0);

console.log(result.posteriorMean);    // ~0.0
console.log(result.posteriorStd);     // ~1.0
console.log(result.posteriorMedian);  // ~0.0
console.log(result.ciLower);          // 95% credible interval lower
console.log(result.ciUpper);          // 95% credible interval upper
console.log(result.nSamples);         // 10000
```

## Understanding the Parameters

| Parameter | Description |
|-----------|-------------|
| `nSamples` | Number of posterior samples to collect (after burn-in) |
| `burnIn` | Samples to discard before collecting (let chain reach stationarity) |
| `seed` | Random seed for reproducibility |
| `initial` | Starting value for the chain |
| `proposalSd` | Standard deviation of the Gaussian random walk proposal |

## Custom Target Distribution

Use `metropolisHastings` for custom log-probability functions (defined in Rust/WASM, not directly in JS).

```typescript
// For JS-side usage, bayesianEstimate wraps Metropolis-Hastings
// with a standard normal target and flat prior.
// Custom targets require the Rust API.
```

## Interpreting Results

The key diagnostics:

```typescript
const result = bayesianEstimate(50_000, 5_000, 42, 0.0, 1.0);

// Point estimate
console.log(`Mean: ${result.posteriorMean.toFixed(4)}`);
console.log(`Std:  ${result.posteriorStd.toFixed(4)}`);

// 95% credible interval (percentile method)
console.log(`95% CI: [${result.ciLower.toFixed(4)}, ${result.ciUpper.toFixed(4)}]`);
```

## Tips

- Burn-in should be large enough for the chain to reach stationarity. Start with 10-20% of total samples.
- An acceptance rate between 0.2 and 0.5 is ideal. Too high means proposals are too small; too low means they are too large.
- Use more samples for tighter credible intervals.
- The `seed` ensures reproducibility -- same seed always produces the same chain.
