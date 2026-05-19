# Regression Analysis

Regression predicts continuous numeric values from input features. Where classification assigns discrete labels, regression fits a function f(X) that maps features to a real-valued output. miniml implements eight regression algorithms spanning linear models, polynomial models, and nonlinear models.

## Overview

Regression algorithms in miniml share the interface `fit(X, y)` and `predict(X_new)`, where y is a vector of continuous target values. They differ in the functional form they assume and how they handle the bias-variance tradeoff.

| Family | Algorithms | Key Idea |
|--------|-----------|----------|
| Linear | Linear, Ridge, Lasso, Elastic Net | y = w^T * x + b |
| Polynomial | Polynomial | y = w^T * phi(x) + b (basis expansion) |
| Nonlinear transform | Exponential, Power, Logarithmic | y = f(w^T * transform(x)) |
| Kernel-based | SVR | Maximum margin in feature space |

## Linear Regression

Ordinary Least Squares (OLS) linear regression finds the weights that minimize the sum of squared residuals:

```
minimize  sum_{i=1}^{n} (y_i - w^T * x_i - b)^2
```

### Normal Equation

The closed-form solution (when X^T * X is invertible):

```
w = (X^T * X)^{-1} * X^T * y
```

This is exact and fast for small datasets, but computing the matrix inverse is O(d^3) and numerically unstable when features are correlated. For larger datasets, gradient descent is preferred.

### Assumptions

OLS assumes:
- **Linearity** -- the relationship between features and target is linear
- **Independence** -- residuals are independent
- **Homoscedasticity** -- constant variance of residuals
- **Normality** -- residuals are normally distributed (for inference, not prediction)

Violations of these assumptions do not necessarily prevent prediction, but they affect confidence intervals and hypothesis tests.

## Ridge Regression (L2 Regularization)

Ridge regression adds an L2 penalty to the OLS objective:

```
minimize  sum(y_i - w^T * x_i)^2 + alpha * sum(w_j^2)
```

where alpha controls regularization strength.

### Effect

The L2 penalty shrinks all coefficients toward zero but never sets them exactly to zero. This:
- Reduces model variance (simpler model, less sensitive to training data)
- Handles multicollinearity (correlated features get similar weights)
- Stabilizes the normal equation (X^T * X + alpha * I is always invertible)

The closed-form solution becomes:

```
w = (X^T * X + alpha * I)^{-1} * X^T * y
```

### Bias-Variance Tradeoff

Ridge introduces bias (coefficients are shrunk) but reduces variance. The optimal alpha balances total error = bias^2 + variance. Cross-validation is used to select alpha.

## Lasso Regression (L1 Regularization)

Lasso adds an L1 penalty:

```
minimize  sum(y_i - w^T * x_i)^2 + alpha * sum(|w_j|)
```

### Feature Selection Effect

Unlike L2, the L1 penalty can set coefficients exactly to zero. This happens because the L1 penalty creates corners in the constraint region, and the loss function contours frequently intersect at these corners.

The practical implication: Lasso performs automatic feature selection. Features with zero coefficients are effectively removed from the model. This produces sparse, interpretable models.

### When L1 vs L2

| Property | Ridge (L2) | Lasso (L1) |
|----------|-----------|------------|
| Coefficient shrinkage | All shrunk toward zero | Some set exactly to zero |
| Feature selection | No (keeps all features) | Yes (removes irrelevant features) |
| Correlated features | Distributes weight evenly | Picks one, drops others |
| Solution | Closed-form | No closed-form (iterative) |
| Best when | Many small effects | Few large effects, many irrelevant |

## Elastic Net

Elastic Net combines L1 and L2 penalties:

```
minimize  sum(y_i - w^T * x_i)^2 + alpha * [l1_ratio * sum(|w_j|) + (1 - l1_ratio) * sum(w_j^2)]
```

This provides the best of both:
- L1 for feature selection (sparsity)
- L2 for handling correlated features (grouping effect)

The `l1_ratio` parameter controls the mix: 0 = pure Ridge, 1 = pure Lasso, 0.5 = equal mix.

Elastic Net is particularly useful when:
- Features are correlated (Lasso alone is unstable)
- There are more features than samples (p > n)
- You want both sparsity and stability

## Polynomial Regression

Polynomial regression expands features into polynomial terms before fitting a linear model:

```
For degree d, transform x into [x, x^2, x^3, ..., x^d]
Then: y = w_1 * x + w_2 * x^2 + ... + w_d * x^d + b
```

For multivariate data, this includes interaction terms:

```
phi(x) = [x_1, x_2, x_1^2, x_1*x_2, x_2^2, ...]
```

### Overfitting Risk

Higher degree polynomials fit training data better but generalize worse. A degree-n polynomial with n data points fits perfectly (zero training error) but typically has terrible test error.

Strategies to control overfitting:
- **Cross-validation** -- select degree that minimizes validation error
- **Regularization** -- Ridge/Lasso on polynomial coefficients
- **Low degree** -- degree 2-3 is often sufficient for real-world data

## Exponential, Power, and Logarithmic Regression

These models apply nonlinear transformations to the target or features, then fit a linear model in the transformed space.

**Exponential:** `y = a * exp(b * x)` -- take log: `ln(y) = ln(a) + b * x` (linear in log space)

**Power:** `y = a * x^b` -- take log: `ln(y) = ln(a) + b * ln(x)` (linear in log-log space)

**Logarithmic:** `y = a * ln(x) + b` -- linear in the log of features

### When to Use

- **Exponential** -- growth/decay processes (population growth, radioactive decay)
- **Power** -- scaling relationships (area vs side length, force vs distance)
- **Logarithmic** -- diminishing returns (learning curves, score vs study time)

The log transform compresses large values and expands small values, making relationships linear that would otherwise be nonlinear.

## SVR (Support Vector Regression)

SVR extends the SVM principle to regression. Instead of maximizing the margin between classes, SVR finds a function that deviates from the target by at most epsilon for each training point:

```
minimize  0.5 * ||w||^2 + C * sum(max(0, |y_i - w^T * x_i - b| - epsilon))
```

Points within the epsilon tube (the margin) contribute zero loss. Only points outside the tube (support vectors) influence the model. This makes SVR robust to outliers.

The kernel trick allows SVR to learn nonlinear regression functions without explicitly computing the feature mapping.

## Quantile Regression

Standard regression (OLS, Ridge, Lasso) predicts the conditional mean: E[y | x]. Quantile regression predicts conditional quantiles: Q_tau[y | x] for any quantile tau in (0, 1).

```
minimize  sum pinball_loss_tau(y_i, w^T * x_i + b)

pinball_loss_tau(y, f) = tau * max(0, y - f) + (1 - tau) * max(0, f - y)
```

For tau = 0.5, this is median regression (least absolute deviations). For tau = 0.1, it predicts the 10th percentile.

### Why Quantile Regression

- **Prediction intervals** -- fit tau = 0.1 and tau = 0.9 to get an 80% prediction interval
- **Asymmetric loss** -- penalize overprediction differently from underprediction
- **Robustness** -- median regression (tau = 0.5) is robust to outliers
- **Heteroscedastic data** -- different quantiles capture different conditional distributions

## Bias-Variance Tradeoff

All regression algorithms face the same fundamental tradeoff:

```
Expected Prediction Error = Bias^2 + Variance + Irreducible Noise
```

- **Underfitting (high bias):** Model is too simple to capture the true relationship (e.g., linear model for quadratic data)
- **Overfitting (high variance):** Model is too complex and fits noise in the training data (e.g., degree-20 polynomial on 50 data points)

Regularization (Ridge, Lasso, Elastic Net) controls this tradeoff by penalizing model complexity. The regularization strength (alpha) determines where on the bias-variance spectrum the model falls.

Cross-validation selects the alpha that minimizes out-of-sample error, automatically finding the right balance.

## Algorithm Comparison

| Algorithm | Linearity | Feature Selection | Regularization | Speed | Best For |
|-----------|-----------|-------------------|----------------|-------|----------|
| Linear | Linear | No | None | Fast | Baseline, interpretable |
| Ridge | Linear | No | L2 | Fast | Correlated features |
| Lasso | Linear | Yes (L1) | L1 | Medium | Sparse solutions |
| Elastic Net | Linear | Yes (L1+L2) | L1+L2 | Medium | Many correlated features |
| Polynomial | Nonlinear | No | Optional | Medium | Curved relationships |
| Exponential | Nonlinear | No | None | Fast | Growth/decay patterns |
| SVR | Linear/Kernel | No | Epsilon tube | Slow | Robust to outliers |
| Quantile | Linear | No | None | Medium | Prediction intervals |

## See Also

- [Classification Algorithms](classification.md) -- Discrete-output counterparts
- [What is AutoML?](../automl/overview.md) -- Automated regression pipeline selection
- [Algorithm Reference](../../../algorithms.md) -- API details and usage examples
