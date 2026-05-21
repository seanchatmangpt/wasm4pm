# Statistical Analysis

In this tutorial you will learn how to use miniml's statistical functions to analyze data, test hypotheses, and draw conclusions with quantified confidence. You will work with probability distributions, run t-tests and chi-square tests, perform ANOVA, and compute descriptive statistics.

## Prerequisites

- Node.js 18+ and `pnpm install` completed
- Basic understanding of mean, standard deviation, and p-values

## Setup

```typescript
import {
  normalPdf,
  normalCdf,
  normalPpf,
  binomialPmf,
  binomialCdf,
  poissonPmf,
  poissonCdf,
  tTestOneSample,
  tTestTwoSample,
  chiSquareTest,
  oneWayAnova,
  describe,
} from '@seanchatmangpt/wminml';
```

---

## Step 1: Working with Distributions

### Normal Distribution

The normal (Gaussian) distribution is the workhorse of statistics. Use the PDF to compute density, the CDF to compute cumulative probability, and the PPF (percent point function) to find quantiles.

```typescript
// PDF: probability density at a specific value
console.log(`P(X=0) for N(0,1): ${normalPdf(0, 0, 1).toFixed(4)}`);

// CDF: probability that X <= x
console.log(`P(X<=1.96) for N(0,1): ${normalCdf(1.96, 0, 1).toFixed(4)}`);

// PPF: inverse CDF -- find x such that P(X<=x) = p
const criticalValue = normalPpf(0.975, 0, 1);
console.log(`97.5th percentile of N(0,1): ${criticalValue.toFixed(4)}`);
// This is the classic z = 1.96

// Non-standard normal: mean=100, std=15 (IQ distribution)
console.log(`P(IQ >= 130): ${(1 - normalCdf(130, 100, 15)).toFixed(4)}`);
console.log(`90th percentile IQ: ${normalPpf(0.9, 100, 15).toFixed(1)}`);
```

### Binomial Distribution

Model the number of successes in a fixed number of independent trials.

```typescript
// Coin flips: 10 flips, P(heads)=0.5
// PMF: exact probability of k successes
console.log(`P(exactly 7 heads in 10 flips): ${binomialPmf(7, 10, 0.5).toFixed(4)}`);

// CDF: P(k or fewer successes)
console.log(`P(7 or fewer heads): ${binomialCdf(7, 10, 0.5).toFixed(4)}`);
console.log(`P(more than 7 heads): ${(1 - binomialCdf(7, 10, 0.5)).toFixed(4)}`);
```

### Poisson Distribution

Model the count of events occurring in a fixed interval.

```typescript
// Website receives average 4.5 visits per minute
const lambda = 4.5;
console.log(`P(exactly 6 visits): ${poissonPmf(6, lambda).toFixed(4)}`);
console.log(`P(6 or fewer visits): ${poissonCdf(6, lambda).toFixed(4)}`);
console.log(`P(more than 10 visits): ${(1 - poissonCdf(10, lambda)).toFixed(6)}`);
```

---

## Step 2: Descriptive Statistics

Before running any tests, understand your data with descriptive statistics.

```typescript
const examScores = [72, 85, 90, 65, 78, 92, 88, 76, 95, 81, 70, 83, 87, 74, 91];

const stats = describe(examScores);
console.log('Exam Score Summary:');
console.log(`  Mean:     ${stats.mean.toFixed(2)}`);
console.log(`  Median:   ${stats.median.toFixed(2)}`);
console.log(`  Std Dev:  ${stats.std.toFixed(2)}`);
console.log(`  Min:      ${stats.min}`);
console.log(`  Max:      ${stats.max}`);
console.log(`  Q1:       ${stats.q1.toFixed(2)}`);
console.log(`  Q3:       ${stats.q3.toFixed(2)}`);
console.log(`  Skewness: ${stats.skewness.toFixed(4)}`);
console.log(`  Kurtosis: ${stats.kurtosis.toFixed(4)}`);
```

A negative skewness indicates the distribution is left-skewed (tail extends left). Kurtosis near 0 means the distribution is close to normal. Values above 0 indicate heavier tails than a normal distribution.

---

## Step 3: One-Sample t-Test

Test whether a sample mean differs from a hypothesized value.

```typescript
// A factory claims their lightbulbs last 1000 hours on average
// We tested 15 bulbs and recorded these lifetimes:
const lifetimes = [
  985, 1020, 990, 1015, 980,
  1005, 995, 1010, 975, 1025,
  990, 1000, 970, 1030, 1008
];

const result = tTestOneSample(lifetimes, 1000);
console.log('One-sample t-test (H0: mean = 1000):');
console.log(`  t-statistic: ${result.tStatistic.toFixed(4)}`);
console.log(`  p-value:     ${result.pValue.toFixed(4)}`);
console.log(`  df:          ${result.df}`);
console.log(`  95% CI:      [${result.ciLower.toFixed(2)}, ${result.ciUpper.toFixed(2)}]`);
console.log(`  Significant (alpha=0.05): ${result.significant}`);
```

If `significant` is `true`, you reject the null hypothesis -- the sample mean is statistically different from 1000 at the 5% significance level.

---

## Step 4: Two-Sample t-Test

Compare the means of two independent groups.

```typescript
// Compare test scores between two teaching methods
const methodA = [78, 82, 85, 80, 77, 83, 79, 81, 84, 76];
const methodB = [85, 88, 91, 87, 90, 86, 89, 92, 84, 93];

const result = tTestTwoSample(methodA, methodB);
console.log('Two-sample t-test (H0: equal means):');
console.log(`  t-statistic: ${result.tStatistic.toFixed(4)}`);
console.log(`  p-value:     ${result.pValue.toFixed(6)}`);
console.log(`  df:          ${result.df}`);
console.log(`  95% CI:      [${result.ciLower.toFixed(2)}, ${result.ciUpper.toFixed(2)}]`);
console.log(`  Significant (alpha=0.05): ${result.significant}`);
```

The confidence interval estimates the true difference between the population means. If it does not contain 0, the means are significantly different.

---

## Step 5: Chi-Square Test for Independence

Determine whether two categorical variables are independent.

```typescript
// Survey: does product preference depend on region?
// Rows: products (A, B, C), Columns: regions (North, South, East, West)
const observed = [
  30, 20, 15, 35,  // Product A
  25, 30, 20, 25,  // Product B
  15, 25, 35, 20,  // Product C
];

// Expected frequencies under the null hypothesis of independence
const rowTotals = observed.map(r => r.reduce((a, b) => a + b, 0));
const colTotals = [0, 1, 2, 3].map(j =>
  observed.reduce((sum, row) => sum + row[j], 0)
);
const total = rowTotals.reduce((a, b) => a + b, 0);
const expected = rowTotals.map(rt =>
  colTotals.map(ct => (rt * ct) / total)
).flat();

const result = chiSquareTest(observed, expected);
console.log('Chi-square test for independence:');
console.log(`  Chi-square: ${result.chiSquare.toFixed(4)}`);
console.log(`  p-value:    ${result.pValue.toFixed(4)}`);
console.log(`  df:         ${result.df}`);
console.log(`  Significant (alpha=0.05): ${result.significant}`);
```

A significant result means product preference and region are not independent -- there is an association between them.

---

## Step 6: One-Way ANOVA

Compare means across three or more groups simultaneously.

```typescript
// Compare crop yields across three fertilizer types
const fertilizerA = [45, 48, 50, 47, 52, 49, 46, 51];
const fertilizerB = [52, 55, 53, 58, 56, 54, 51, 57];
const fertilizerC = [60, 63, 58, 62, 65, 61, 59, 64];

const result = oneWayAnova([fertilizerA, fertilizerB, fertilizerC]);
console.log('One-way ANOVA (H0: all means equal):');
console.log(`  F-statistic: ${result.fStatistic.toFixed(4)}`);
console.log(`  p-value:     ${result.pValue.toFixed(6)}`);
console.log(`  df between:  ${result.dfBetween}`);
console.log(`  df within:   ${result.dfWithin}`);
console.log(`  Significant (alpha=0.05): ${result.significant}`);
```

A significant ANOVA tells you at least one group mean differs, but not which ones. Follow up with post-hoc pairwise comparisons (t-tests with Bonferroni correction) to identify the specific differences.

---

## What You Learned

| Technique | Purpose | Key Function |
|-----------|---------|--------------|
| Distributions | Compute densities, probabilities, quantiles | `normalPdf/Cdf/Ppf`, `binomialPmf/Cdf`, `poissonPmf/Cdf` |
| Descriptive stats | Summarize a dataset | `describe` |
| t-Test (one-sample) | Compare sample mean to a reference value | `tTestOneSample` |
| t-Test (two-sample) | Compare two group means | `tTestTwoSample` |
| Chi-square | Test independence of categorical variables | `chiSquareTest` |
| ANOVA | Compare means across 3+ groups | `oneWayAnova` |

## Next Steps

- [Compare Groups with t-Tests how-to](../how_to/statistical/t-tests.md) -- paired tests, effect sizes
- [Test Independence how-to](../how_to/statistical/chi-square.md) -- contingency table analysis
- [ANOVA for Multiple Groups how-to](../how_to/statistical/anova.md) -- post-hoc tests, assumptions
- [Probability Distributions explanation](../explanation/statistical/distributions.md) -- deeper theory
- [Hypothesis Testing explanation](../explanation/statistical/hypothesis-testing.md) -- p-values, power, Type I/II errors
