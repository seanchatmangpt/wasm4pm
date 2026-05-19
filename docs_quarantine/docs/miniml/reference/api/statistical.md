# Statistical API

Probability distributions, hypothesis testing, and descriptive statistics. All functions are pure and stateless unless otherwise noted. Call `await init()` before use.

---

## Probability Distributions

### Normal Distribution

#### `normalPdf`

```ts
function normalPdf(x: number, mean: number, std: number): number
```

Probability density of the normal distribution at `x`.

| Parameter | Type | Description |
|-----------|------|-------------|
| `x` | `number` | Point at which to evaluate |
| `mean` | `number` | Distribution mean (mu) |
| `std` | `number` | Distribution standard deviation (sigma), must be > 0 |

**Returns:** `number` -- Density value f(x).

---

#### `normalCdf`

```ts
function normalCdf(x: number, mean: number, std: number): number
```

Cumulative distribution function of the normal distribution at `x`.

| Parameter | Type | Description |
|-----------|------|-------------|
| `x` | `number` | Point at which to evaluate |
| `mean` | `number` | Distribution mean (mu) |
| `std` | `number` | Distribution standard deviation (sigma), must be > 0 |

**Returns:** `number` -- P(X <= x).

---

#### `normalPpf`

```ts
function normalPpf(p: number, mean: number, std: number): number
```

Percent point function (inverse CDF / quantile function) of the normal distribution.

| Parameter | Type | Description |
|-----------|------|-------------|
| `p` | `number` | Probability, must be in (0, 1) |
| `mean` | `number` | Distribution mean (mu) |
| `std` | `number` | Distribution standard deviation (sigma), must be > 0 |

**Returns:** `number` -- The value `x` such that P(X <= x) = p.

---

### Binomial Distribution

#### `binomialPmf`

```ts
function binomialPmf(k: number, n: number, p: number): number
```

Probability mass at `k` for the binomial distribution.

| Parameter | Type | Description |
|-----------|------|-------------|
| `k` | `number` | Number of successes (integer >= 0) |
| `n` | `number` | Number of trials (integer >= 0) |
| `p` | `number` | Success probability per trial, in [0, 1] |

**Returns:** `number` -- P(X = k).

---

#### `binomialCdf`

```ts
function binomialCdf(k: number, n: number, p: number): number
```

Cumulative probability P(X <= k) for the binomial distribution.

| Parameters** -- Same as `binomialPmf`.

**Returns:** `number` -- P(X <= k).

---

### Poisson Distribution

#### `poissonPmf`

```ts
function poissonPmf(k: number, lambda: number): number
```

Probability mass at `k` for the Poisson distribution.

| Parameter | Type | Description |
|-----------|------|-------------|
| `k` | `number` | Number of events (integer >= 0) |
| `lambda` | `number` | Rate parameter (mean), must be > 0 |

**Returns:** `number` -- P(X = k).

---

#### `poissonCdf`

```ts
function poissonCdf(k: number, lambda: number): number
```

Cumulative probability P(X <= k) for the Poisson distribution.

| Parameters** -- Same as `poissonPmf`.

**Returns:** `number` -- P(X <= k).

---

### Exponential Distribution

#### `exponentialPdf`

```ts
function exponentialPdf(x: number, lambda: number): number
```

Probability density at `x` for the exponential distribution.

| Parameter | Type | Description |
|-----------|------|-------------|
| `x` | `number` | Point at which to evaluate, must be >= 0 |
| `lambda` | `number` | Rate parameter, must be > 0 |

**Returns:** `number` -- f(x) = lambda * exp(-lambda * x).

---

#### `exponentialCdf`

```ts
function exponentialCdf(x: number, lambda: number): number
```

Cumulative probability P(X <= x) for the exponential distribution.

| Parameters** -- Same as `exponentialPdf`.

**Returns:** `number` -- P(X <= x).

---

### Chi-Squared Distribution

#### `chiSquaredPdf`

```ts
function chiSquaredPdf(x: number, k: number): number
```

Probability density at `x` for the chi-squared distribution with `k` degrees of freedom.

| Parameter | Type | Description |
|-----------|------|-------------|
| `x` | `number` | Point at which to evaluate, must be >= 0 |
| `k` | `number` | Degrees of freedom, must be > 0 |

**Returns:** `number` -- Density value f(x).

---

#### `chiSquaredCdf`

```ts
function chiSquaredCdf(x: number, k: number): number
```

Cumulative probability P(X <= x) for the chi-squared distribution.

| Parameters** -- Same as `chiSquaredPdf`.

**Returns:** `number` -- P(X <= x).

---

### Student's t-Distribution

#### `studentTPdf`

```ts
function studentTPdf(x: number, nu: number): number
```

Probability density at `x` for Student's t-distribution.

| Parameter | Type | Description |
|-----------|------|-------------|
| `x` | `number` | Point at which to evaluate |
| `nu` | `number` | Degrees of freedom, must be > 0 |

**Returns:** `number` -- Density value f(x).

---

#### `studentTCdf`

```ts
function studentTCdf(x: number, nu: number): number
```

Cumulative probability P(T <= x) for Student's t-distribution.

| Parameters** -- Same as `studentTPdf`.

**Returns:** `number` -- P(T <= x).

---

### Special Functions

#### `gammaFunction`

```ts
function gammaFunction(x: number): number
```

Euler's gamma function Gamma(x).

| Parameter | Type | Description |
|-----------|------|-------------|
| `x` | `number` | Input value, must not be a non-positive integer |

**Returns:** `number` -- Gamma(x).

---

#### `logGamma`

```ts
function logGamma(x: number): number
```

Natural logarithm of the gamma function, computed via Lanczos approximation for numerical stability.

| Parameter | Type | Description |
|-----------|------|-------------|
| `x` | `number` | Input value, must be > 0 |

**Returns:** `number` -- ln(Gamma(x)).

---

## Hypothesis Testing

All test functions return a `TestResult` with a default significance level of alpha = 0.05.

### Common Result Type

```ts
interface TestResult {
  tStatistic: number;     // Test statistic (or chiSquare / uStatistic)
  pValue: number;         // Two-tailed p-value
  df: number;             // Degrees of freedom
  ciLower: number;        // Lower bound of 95% confidence interval
  ciUpper: number;        // Upper bound of 95% confidence interval
  significant: boolean;   // true if pValue < 0.05
}
```

---

### `tTestOneSample`

```ts
function tTestOneSample(
  data: Float64Array,
  hypothesizedMean: number
): TestResult
```

One-sample t-test against a hypothesized mean.

| Parameter | Type | Description |
|-----------|------|-------------|
| `data` | `Float64Array` | Sample data |
| `hypothesizedMean` | `number` | Null hypothesis mean value |

---

### `tTestTwoSample`

```ts
function tTestTwoSample(
  data1: Float64Array,
  data2: Float64Array
): TestResult
```

Two-sample t-test assuming equal variances.

| Parameter | Type | Description |
|-----------|------|-------------|
| `data1` | `Float64Array` | First sample |
| `data2` | `Float64Array` | Second sample |

---

### `tTestPaired`

```ts
function tTestPaired(
  data1: Float64Array,
  data2: Float64Array
): TestResult
```

Paired t-test. `data1` and `data2` must have the same length.

| Parameter | Type | Description |
|-----------|------|-------------|
| `data1` | `Float64Array` | First measurement |
| `data2` | `Float64Array` | Second measurement (paired with data1) |

---

### `welchTTest`

```ts
function welchTTest(
  data1: Float64Array,
  data2: Float64Array
): TestResult
```

Welch's t-test (unequal variances).

| Parameter | Type | Description |
|-----------|------|-------------|
| `data1` | `Float64Array` | First sample |
| `data2` | `Float64Array` | Second sample |

---

### `mannWhitneyU`

```ts
function mannWhitneyU(
  data1: Float64Array,
  data2: Float64Array
): TestResult
```

Mann-Whitney U test (non-parametric alternative to the two-sample t-test).

| Parameter | Type | Description |
|-----------|------|-------------|
| `data1` | `Float64Array` | First sample |
| `data2` | `Float64Array` | Second sample |

**Returns:** `TestResult` with `uStatistic` instead of `tStatistic`.

---

### `wilcoxonSignedRank`

```ts
function wilcoxonSignedRank(
  data1: Float64Array,
  data2: Float64Array
): TestResult
```

Wilcoxon signed-rank test (non-parametric paired test). `data1` and `data2` must have the same length.

| Parameter | Type | Description |
|-----------|------|-------------|
| `data1` | `Float64Array` | First measurement |
| `data2` | `Float64Array` | Second measurement (paired with data1) |

---

### `chiSquareTest`

```ts
function chiSquareTest(
  observed: Float64Array,
  expected: Float64Array
): TestResult
```

Chi-squared goodness-of-fit test. `observed` and `expected` must have the same length.

| Parameter | Type | Description |
|-----------|------|-------------|
| `observed` | `Float64Array` | Observed frequencies |
| `expected` | `Float64Array` | Expected frequencies under H0 |

**Returns:** `TestResult` with `chiSquare` instead of `tStatistic`.

---

### `oneWayAnova`

```ts
function oneWayAnova(
  groups: Float64Array[]
): AnovaResult
```

One-way analysis of variance for comparing means across two or more groups.

| Parameter | Type | Description |
|-----------|------|-------------|
| `groups` | `Float64Array[]` | Array of group data vectors (minimum 2 groups) |

**Returns:** `AnovaResult`

```ts
interface AnovaResult {
  fStatistic: number;     // F-test statistic
  pValue: number;         // P-value of the F-test
  dfBetween: number;      // Degrees of freedom between groups
  dfWithin: number;       // Degrees of freedom within groups
  significant: boolean;   // true if pValue < 0.05
}
```

---

## Descriptive Statistics

### `describe`

```ts
function describe(data: Float64Array): DescriptiveStats
```

Computes a comprehensive set of descriptive statistics for a numeric vector.

| Parameter | Type | Description |
|-----------|------|-------------|
| `data` | `Float64Array` | Input data vector |

**Returns:** `DescriptiveStats`

```ts
interface DescriptiveStats {
  mean: number;      // Arithmetic mean
  median: number;    // Median (50th percentile)
  std: number;       // Sample standard deviation (Bessel-corrected)
  min: number;       // Minimum value
  max: number;       // Maximum value
  q1: number;        // First quartile (25th percentile)
  q3: number;        // Third quartile (75th percentile)
  skewness: number;  // Fisher-Pearson skewness coefficient
  kurtosis: number;  // Excess kurtosis (0 = normal distribution)
}
```
