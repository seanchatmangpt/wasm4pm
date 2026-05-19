# ANOVA

Analysis of Variance (ANOVA) is a statistical method for testing whether the means of two or more groups differ significantly. Despite its name, ANOVA tests differences in means by decomposing the total variability in the data into components attributable to different sources.

## One-Way ANOVA

One-way ANOVA tests the null hypothesis that $k$ group means are equal:

$$H_0: \mu_1 = \mu_2 = \cdots = \mu_k$$
$$H_1: \text{At least one } \mu_i \text{ differs}$$

Given groups $i = 1, \ldots, k$, each with $n_i$ observations:

**Grand mean:**

$$\bar{X}_{\cdot\cdot} = \frac{1}{N}\sum_{i=1}^{k}\sum_{j=1}^{n_i} X_{ij}, \quad N = \sum_{i=1}^{k} n_i$$

## Decomposing Variability

ANOVA partitions the total sum of squares (SST) into between-group (SSB) and within-group (SSW) components:

$$\underbrace{\sum_{i=1}^{k}\sum_{j=1}^{n_i}(X_{ij} - \bar{X}_{\cdot\cdot})^2}_{\text{SST}} = \underbrace{\sum_{i=1}^{k} n_i(\bar{X}_{i\cdot} - \bar{X}_{\cdot\cdot})^2}_{\text{SSB}} + \underbrace{\sum_{i=1}^{k}\sum_{j=1}^{n_i}(X_{ij} - \bar{X}_{i\cdot})^2}_{\text{SSW}}$$

- **SSB** (between groups): How much group means differ from the grand mean
- **SSW** (within groups): How much individual observations vary within their group

Dividing by degrees of freedom gives mean squares:

$$\text{MS}_{\text{between}} = \frac{\text{SSB}}{k - 1}, \quad \text{MS}_{\text{within}} = \frac{\text{SSW}}{N - k}$$

## The F-Statistic

The test statistic is the ratio of between-group to within-group variance:

$$F = \frac{\text{MS}_{\text{between}}}{\text{MS}_{\text{within}}} \sim F_{k-1, \; N-k}$$

Under $H_0$, both mean squares estimate the same population variance $\sigma^2$, so $F \approx 1$. A large $F$ indicates that group means differ more than expected by chance alone. We reject $H_0$ when $F > F_{\alpha,\; k-1,\; N-k}$.

**Intuition:** If $H_0$ is true, the between-group variability is just noise (same as within-group). If $H_0$ is false, between-group variability is inflated by real differences in means.

## Assumptions

ANOVA relies on three assumptions about the residuals:

1. **Normality**: Residuals within each group are approximately normally distributed. Test with Shapiro-Wilk. Robust to mild violations for large samples (CLT).

2. **Homoscedasticity** (equal variances): $\sigma_1^2 = \sigma_2^2 = \cdots = \sigma_k^2$. Test with Levene's test or Bartlett's test. If violated, use Welch's ANOVA.

3. **Independence**: Observations are independent within and between groups. This is a study design requirement, not something to test statistically.

## ANOVA Table

| Source | SS | df | MS | F |
|--------|-----|-----|-----|-----|
| Between groups | SSB | $k - 1$ | SSB / $(k-1)$ | MS_B / MS_W |
| Within groups | SSW | $N - k$ | SSW / $(N-k)$ | |
| Total | SST | $N - 1$ | | |

## Post-Hoc Analysis

When ANOVA rejects $H_0$, it tells us *some* means differ but not *which* ones. Post-hoc tests identify specific differences:

- **Tukey's HSD**: Controls family-wise error rate. Best for all pairwise comparisons.
- **Bonferroni**: Divide $\alpha$ by the number of comparisons. Conservative.
- **Scheffe**: Most conservative. Works for arbitrary contrasts, not just pairwise.
- **Games-Howell**: Does not assume equal variances. Use when homoscedasticity is violated.

Each post-hoc test produces confidence intervals for the difference between pairs of means, adjusted for multiple comparisons.

## ANOVA vs Multiple t-Tests

Running $k(k-1)/2$ pairwise t-tests inflates the Type I error rate. With $k = 5$ groups, there are 10 pairwise tests; at $\alpha = 0.05$ each, the family-wise error rate is approximately $1 - (1 - 0.05)^{10} \approx 0.40$.

ANOVA performs a single test at the desired $\alpha$ level, then uses post-hoc procedures with proper corrections. This is the correct approach for comparing multiple group means.

## Connection to Linear Regression

One-way ANOVA is a special case of linear regression. Encode group membership as dummy variables:

$$Y_i = \beta_0 + \beta_1 X_{1i} + \beta_2 X_{2i} + \cdots + \beta_{k-1} X_{(k-1)i} + \epsilon_i$$

where $X_{ji}$ is 1 if observation $i$ belongs to group $j+1$, 0 otherwise. The F-test for overall regression significance is identical to the ANOVA F-test. This connection extends to factorial designs (two-way ANOVA = regression with interaction terms) and ANCOVA (regression with categorical and continuous predictors).

## See Also

- [Hypothesis Testing](./hypothesis-testing.md) -- General testing framework
- [Probability Distributions](./distributions.md) -- F distribution and related distributions
- [Bayesian Inference](../bayesian/inference.md) -- Bayesian alternatives to ANOVA
