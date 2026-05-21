# Nonparametric Tests

Test hypotheses without assuming normality: Mann-Whitney U and Wilcoxon signed-rank.

## What You'll Learn

- Mann-Whitney U test for independent groups
- Wilcoxon signed-rank test for paired data
- KS test for normality

## Prerequisites

```typescript
import { init, mannWhitneyU, wilcoxonSignedRank, ksTest } from '@seanchatmangpt/wminml';
await init();
```

## Mann-Whitney U Test

Nonparametric alternative to the independent two-sample t-test. Tests whether two groups come from the same distribution.

```typescript
const groupA = new Float64Array([1.0, 2.0, 1.5, 2.5, 1.8]);
const groupB = new Float64Array([10.0, 11.0, 12.0, 10.5, 11.5]);

const result = mannWhitneyU(groupA, groupB);

console.log(result.uStatistic);  // U statistic
console.log(result.pValue);      // < 0.05 = distributions differ
console.log(result.zApprox);     // z-approximation for large samples
```

## Wilcoxon Signed-Rank Test

Nonparametric alternative to the paired t-test. Tests whether paired observations are symmetric around zero.

```typescript
const before = new Float64Array([85, 72, 91, 68, 77, 83]);
const after  = new Float64Array([88, 79, 93, 74, 82, 89]);

const result = wilcoxonSignedRank(before, after);

console.log(result.uStatistic);  // W statistic (min of W+ and W-)
console.log(result.pValue);      // < 0.05 = significant difference
console.log(result.zApprox);     // z-approximation
```

## Kolmogorov-Smirnov Test

Test whether data follows a standard normal distribution.

```typescript
const data = new Float64Array([
  -0.5, 0.2, -0.1, 0.8, -0.3, 0.1, -0.7, 0.4, -0.2, 0.6,
  -0.4, 0.3, -0.6, 0.0, -0.8, 0.5, -0.9, 0.7, -0.15, 0.35,
]);

const result = ksTest(data);

console.log(result.statistic);  // D statistic (max CDF difference)
console.log(result.pValue);     // > 0.05 = data is consistent with normal
```

## When to Use Nonparametric Tests

| Situation | Parametric | Nonparametric |
|-----------|-----------|---------------|
| Two independent groups, normal data | t-test | -- |
| Two independent groups, non-normal | -- | Mann-Whitney U |
| Paired data, normal differences | Paired t-test | -- |
| Paired data, non-normal differences | -- | Wilcoxon signed-rank |
| Test for normality | -- | KS test |

## Tips

- Mann-Whitney U requires both samples to be non-empty.
- Wilcoxon signed-rank requires paired samples of the same length, with at least 2 observations.
- Non-zero differences are required for Wilcoxon (ties are excluded).
- The KS test compares against standard normal (mean=0, std=1). Standardize your data first if needed.
