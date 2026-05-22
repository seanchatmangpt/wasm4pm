# Hypothesis Testing

Hypothesis testing provides a formal framework for making decisions about population parameters based on sample data. It is the backbone of scientific experimentation, A/B testing, and model validation in machine learning. Understanding what hypothesis tests can and cannot tell us is essential for sound statistical reasoning.

## Null and Alternative Hypotheses

Every test starts with two competing statements:

- **$H_0$ (null hypothesis)**: The "status quo" or "no effect" claim. We assume $H_0$ is true unless the evidence strongly contradicts it.
- **$H_1$ (alternative hypothesis)**: The research claim we seek to support.

Example: $H_0: \mu = 0$ vs $H_1: \mu \neq 0$ (two-sided) or $H_1: \mu > 0$ (one-sided).

The test does not prove $H_0$ or $H_1$ directly. Instead, it quantifies how surprising the observed data would be under $H_0$.

## p-values

The p-value is the probability of observing a test statistic at least as extreme as the one computed, assuming $H_0$ is true:

$$p = P(T \geq t_{\text{obs}} \mid H_0)$$

**What a p-value is:** A measure of evidence against $H_0$. A small p-value means the data would be unlikely if $H_0$ were true.

**What a p-value is NOT:**
- The probability that $H_0$ is true (that requires Bayesian inference)
- The probability of the data (that's the likelihood)
- The probability of making an error

The conventional threshold $\alpha = 0.05$ means we reject $H_0$ when the observed result would occur less than 5% of the time under the null. This threshold is arbitrary and should be interpreted in context.

## Type I and Type II Errors

Every decision in hypothesis testing can lead to two kinds of errors:

| Decision | $H_0$ True | $H_0$ False |
|----------|-----------|-------------|
| **Reject $H_0$** | Type I error (false positive) | Correct (true positive) |
| **Fail to reject $H_0$** | Correct (true negative) | Type II error (false negative) |

- **Type I error rate**: $\alpha = P(\text{reject } H_0 \mid H_0 \text{ is true})$
- **Type II error rate**: $\beta = P(\text{fail to reject } H_0 \mid H_0 \text{ is false})$
- **Statistical power**: $1 - \beta = P(\text{reject } H_0 \mid H_0 \text{ is false})$

Decreasing $\alpha$ (making the test stricter) increases $\beta$ (reduces power). The only way to reduce both simultaneously is to increase the sample size.

## Confidence Intervals

A $100(1-\alpha)\%$ confidence interval provides a range of plausible values for a parameter:

$$\hat{\theta} \pm z_{\alpha/2} \cdot \text{SE}(\hat{\theta})$$

A 95% CI means: if we repeated the experiment many times, approximately 95% of the computed intervals would contain the true parameter. It does NOT mean there is a 95% probability the parameter lies in this specific interval.

Confidence intervals are more informative than p-values because they show the effect size and its precision simultaneously. A test can be reformulated: reject $H_0: \theta = \theta_0$ at level $\alpha$ if $\theta_0$ falls outside the $100(1-\alpha)\%$ confidence interval.

## t-tests

The t-test compares means under the assumption that the data are approximately normally distributed.

**One-sample t-test:** $H_0: \mu = \mu_0$

$$t = \frac{\bar{X} - \mu_0}{s / \sqrt{n}}, \quad \text{df} = n - 1$$

**Two-sample t-test (equal variances):** $H_0: \mu_1 = \mu_2$

$$t = \frac{\bar{X}_1 - \bar{X}_2}{s_p \sqrt{1/n_1 + 1/n_2}}, \quad s_p^2 = \frac{(n_1 - 1)s_1^2 + (n_2 - 1)s_2^2}{n_1 + n_2 - 2}$$

**Assumptions:** Normality (or large $n$ via CLT), independence, equal variances (for pooled test). Use Welch's t-test when variances differ.

## Non-Parametric Alternatives

When normality assumptions are violated:

- **Mann-Whitney U test**: Compares distributions of two independent groups. Tests whether one distribution is stochastically greater than the other. Equivalent to the Wilcoxon rank-sum test.
- **Wilcoxon signed-rank test**: Paired comparison. Tests whether the median of differences is zero.
- **Kruskal-Wallis test**: Extension to $k > 2$ groups (non-parametric ANOVA).

These tests use ranks instead of raw values, making them robust to outliers and non-normal distributions. They have slightly less power than parametric tests when parametric assumptions hold.

## Chi-Square Tests

**Goodness of fit.** Tests whether observed frequencies match expected frequencies:

$$\chi^2 = \sum_{i=1}^{k} \frac{(O_i - E_i)^2}{E_i}, \quad \text{df} = k - 1$$

**Test of independence.** Tests whether two categorical variables are independent in a contingency table:

$$\chi^2 = \sum_{i,j} \frac{(O_{ij} - E_{ij})^2}{E_{ij}}, \quad E_{ij} = \frac{(\text{row total}_i)(\text{col total}_j)}{n}$$

Assumptions: expected frequencies should be at least 5 in most cells.

## ANOVA

Analysis of Variance (ANOVA) tests whether the means of $k \geq 2$ groups differ. Instead of running $k(k-1)/2$ pairwise t-tests (which inflates Type I error), ANOVA tests the omnibus hypothesis $H_0: \mu_1 = \mu_2 = \cdots = \mu_k$ in a single test.

$$F = \frac{\text{MS}_{\text{between}}}{\text{MS}_{\text{within}}} = \frac{\text{SS}_{\text{between}} / (k-1)}{\text{SS}_{\text{within}} / (n-k)}$$

See [ANOVA](./anova.md) for a complete treatment.

## The Multiple Testing Problem

When performing $m$ tests simultaneously, the probability of at least one false positive is:

$$P(\text{at least 1 Type I error}) = 1 - (1 - \alpha)^m$$

With $\alpha = 0.05$ and $m = 20$ tests, this is approximately 64%. Corrections:

- **Bonferroni**: Use $\alpha/m$ as the threshold for each test. Conservative but simple.
- **Benjamini-Hochberg**: Control the false discovery rate (FDR). Less conservative, preferred in genomics and high-dimensional settings.

## See Also

- [Probability Distributions](./distributions.md) -- Test statistic distributions
- [ANOVA](./anova.md) -- Detailed treatment of analysis of variance
- [Bayesian Inference](../bayesian/inference.md) -- Alternative framework avoiding p-values
- [Monte Carlo Methods](../probabilistic/monte-carlo.md) -- Permutation tests and resampling
