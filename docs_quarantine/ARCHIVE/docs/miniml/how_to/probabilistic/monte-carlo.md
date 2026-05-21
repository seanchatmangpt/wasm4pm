# Monte Carlo Methods

Estimate integrals, expected values, and confidence intervals through random sampling.

## What You'll Learn

- Numerical integration via the sample-mean method
- Estimating pi with the dartboard method
- Bootstrap confidence intervals for any statistic

## Prerequisites

```typescript
import { init, mcEstimatePi, mcBootstrap, mcExpectedValue } from '@seanchatmangpt/wminml';
await init();
```

## Estimate Pi

The dartboard method: sample points uniformly in a unit square, count how many fall inside the unit circle.

```typescript
const result = mcEstimatePi(100_000, 42);

console.log(result.estimate);    // ~3.14159
console.log(result.stdError);    // standard error of the estimate
console.log(result.ciLower);     // 95% CI lower bound
console.log(result.ciUpper);     // 95% CI upper bound
console.log(result.converged);   // true if within 0.01 of actual pi
```

## Bootstrap Confidence Intervals

Estimate a statistic with confidence intervals using resampling. Supports `"mean"`, `"median"`, `"std"`, and `"var"` statistics.

```typescript
const data = new Float64Array([23, 45, 12, 67, 34, 89, 56, 78, 41, 33]);

const result = mcBootstrap(data, 5_000, 'mean', 0.95, 42);

console.log(result.estimate);       // bootstrap mean (~47.8)
console.log(result.ciLower);        // lower 95% CI bound
console.log(result.ciUpper);        // upper 95% CI bound
console.log(result.stdError);       // bootstrap standard error
console.log(result.statisticName);  // "mean"
```

Bootstrap the median instead:

```typescript
const median = mcBootstrap(data, 5_000, 'median', 0.95, 42);
console.log(median.estimate);  // ~44.5
```

## Expected Value

Compute the expected value of a uniform random variable over an interval.

```typescript
const result = mcExpectedValue(0.0, 10.0, 50_000, 42);
// E[X] for X ~ Uniform(0, 10) = 5.0
console.log(result.estimate);  // ~5.0
```

## Tips

- More samples means smaller standard error. Start with 10,000, increase to 100,000+ for production.
- The `seed` parameter makes results deterministic. Use the same seed for reproducibility.
- The `converged` flag indicates whether the estimate stabilized within tolerance.
