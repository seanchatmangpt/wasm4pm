# Bayesian Parameter Estimation

Estimate unknown parameters from data using Bayesian inference with MCMC sampling.

## What You'll Learn

- Using `bayesianEstimate` for posterior inference
- Interpreting posterior statistics and credible intervals
- Setting proposal width and burn-in

## Prerequisites

```typescript
import { init, bayesianEstimate } from '@seanchatmangpt/wminml';
await init();
```

## Basic Estimation

`bayesianEstimate` runs Metropolis-Hastings with a standard normal target and flat prior.

```typescript
const result = bayesianEstimate(
  50_000,  // nSamples: posterior samples to collect
  5_000,   // burnIn: samples to discard
  42,      // seed
  0.0,     // initial: starting value for the chain
  1.0,     // proposalSd: random walk step size
);

console.log(result.posteriorMean);    // ~0.0 (target is N(0,1))
console.log(result.posteriorStd);     // ~1.0
console.log(result.posteriorMedian);  // ~0.0
console.log(result.ciLower);          // 95% credible interval lower (~-1.96)
console.log(result.ciUpper);          // 95% credible interval upper (~1.96)
console.log(result.nSamples);         // 50000
```

## Reading the Posterior

The posterior distribution gives you more than a point estimate:

```typescript
const result = bayesianEstimate(100_000, 10_000, 42, 5.0, 0.5);

console.log(`Point estimate (mean): ${result.posteriorMean.toFixed(4)}`);
console.log(`Uncertainty (std):     ${result.posteriorStd.toFixed(4)}`);
console.log(`Robust estimate (med): ${result.posteriorMedian.toFixed(4)}`);
console.log(`95% CI: [${result.ciLower.toFixed(4)}, ${result.ciUpper.toFixed(4)}]`);
```

## Parameter Selection

| Parameter | How to Choose |
|-----------|---------------|
| `nSamples` | More samples = tighter intervals. 10,000 minimum, 100,000 for publication quality. |
| `burnIn` | Discard early samples before the chain stabilizes. 10-20% of nSamples. |
| `initial` | Starting point. Should be in a region of non-zero posterior density. |
| `proposalSd` | Step size of the random walk. Too small = slow mixing; too large = low acceptance. Target 20-50% acceptance. |

## Tuning Proposal Width

```typescript
// Too narrow: high acceptance but slow exploration
const narrow = bayesianEstimate(10_000, 1_000, 42, 0.0, 0.01);

// Good: balanced acceptance and exploration
const good = bayesianEstimate(10_000, 1_000, 42, 0.0, 1.0);

// Too wide: low acceptance, chain gets stuck
const wide = bayesianEstimate(10_000, 1_000, 42, 0.0, 10.0);
```

## Tips

- The 95% credible interval is the percentile method (2.5th and 97.5th percentiles).
- Unlike frequentist confidence intervals, credible intervals have a direct probability interpretation.
- Same `seed` always produces identical results -- use this for reproducible analyses.
- For custom likelihood/prior functions, use the Rust API directly.
