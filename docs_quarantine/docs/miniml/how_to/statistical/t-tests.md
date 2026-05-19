# T-Tests

Compare group means with hypothesis tests: one-sample, two-sample, paired, and Welch's.

## What You'll Learn

- One-sample t-test against a hypothesized mean
- Two-sample (independent) t-test
- Paired t-test for before/after measurements
- Welch's t-test when variances differ

## Prerequisites

```typescript
import { init, tTestOneSample, tTestTwoSample, tTestPaired, welchTTest } from '@seanchatmangpt/wminml';
await init();
```

## One-Sample T-Test

Test whether a sample mean differs from a hypothesized value.

```typescript
const measurements = new Float64Array([23.1, 24.5, 22.8, 25.0, 23.7, 24.2, 22.9]);
const result = tTestOneSample(measurements, 24.0, 0.05);

console.log(result.statistic);  // t-statistic
console.log(result.pValue);     // p-value (> 0.05 = not significant)
console.log(result.df);         // degrees of freedom (n - 1)
console.log(result.meanDiff);   // sample mean - hypothesized mean
console.log(result.ciLower);    // 95% CI lower bound for the mean
console.log(result.ciUpper);    // 95% CI upper bound for the mean
```

## Two-Sample T-Test

Compare means of two independent groups (assumes equal variances).

```typescript
const control = new Float64Array([12.3, 14.1, 13.5, 12.8, 13.9]);
const treatment = new Float64Array([15.2, 16.8, 14.9, 15.5, 16.1]);

const result = tTestTwoSample(control, treatment, 0.05);

console.log(result.statistic);  // negative = treatment mean > control mean
console.log(result.pValue);     // < 0.05 = significant difference
console.log(result.meanDiff);   // control_mean - treatment_mean
console.log(result.df);         // n1 + n2 - 2
```

## Paired T-Test

For repeated measures or matched pairs (same subjects before/after).

```typescript
const before = new Float64Array([85, 72, 91, 68, 77, 83]);
const after  = new Float64Array([88, 79, 93, 74, 82, 89]);

const result = tTestPaired(before, after, 0.05);

console.log(result.statistic);  // t-statistic on the differences
console.log(result.pValue);     // < 0.05 = significant improvement
console.log(result.meanDiff);   // average change (after - before)
console.log(result.df);         // n_pairs - 1
```

## Welch's T-Test

Use when the two groups have unequal variances.

```typescript
const groupA = new Float64Array([1.0, 1.1, 0.9, 1.2, 1.0]);
const groupB = new Float64Array([5.0, 8.0, 3.0, 12.0, 7.0]); // higher variance

const result = welchTTest(groupA, groupB, 0.05);
console.log(result.pValue);  // handles unequal variances
console.log(result.df);      // adjusted degrees of freedom (may be non-integer)
```

## Interpreting Results

| Metric | Meaning |
|--------|---------|
| `pValue < alpha` | Reject the null hypothesis (significant) |
| `pValue >= alpha` | Fail to reject (not significant) |
| `meanDiff` | Magnitude of the difference |
| `ciLower` / `ciUpper` | Confidence interval -- if it excludes 0, the difference is significant |

## Tips

- Alpha (significance level) must be between 0 and 1. Common values: 0.05, 0.01, 0.10.
- Each sample needs at least 2 observations.
- Paired samples must have the same length.
- Use Welch's test when variances are visibly different or sample sizes are unequal.
