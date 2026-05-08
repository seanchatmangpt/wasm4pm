# Regression API

Complete reference for all regression algorithms exported by `miniml`. Includes univariate curve-fitting models and multivariate linear models.

---

## Linear Regression (Univariate)

```ts
linearRegression(x, y): Promise<LinearModel>
linearRegressionSimple(y): Promise<LinearModel>
```

Ordinary least squares: `y = slope * x + intercept`. `linearRegressionSimple` uses auto-generated x values `[0, 1, 2, ...]`.

| Parameter | Type | Description |
|-----------|------|-------------|
| `x` | `number[]` | Independent variable values |
| `y` | `number[]` | Dependent variable values |

**Returns:** `LinearModel`

| Property / Method | Return Type | Description |
|--------------------|-------------|-------------|
| `.slope` | `number` (readonly) | Slope coefficient |
| `.intercept` | `number` (readonly) | Y-intercept |
| `.rSquared` | `number` (readonly) | Coefficient of determination [0, 1] |
| `.n` | `number` (readonly) | Number of data points |
| `.predict(x)` | `number[]` | Predicted y values |
| `.toString()` | `string` | Equation as string |

---

## Polynomial Regression (Univariate)

```ts
polynomialRegression(x, y, options?): Promise<PolynomialModel>
polynomialRegressionSimple(y, options?): Promise<PolynomialModel>
```

Least-squares polynomial fit: `y = c0 + c1*x + c2*x^2 + ...`

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `x` | `number[]` | Independent variable values |
| `y` | `number[]` | Dependent variable values |
| `options.degree` | `number` | `2` | Polynomial degree |

**Returns:** `PolynomialModel`

| Property / Method | Return Type | Description |
|--------------------|-------------|-------------|
| `.degree` | `number` (readonly) | Polynomial degree |
| `.rSquared` | `number` (readonly) | Coefficient of determination [0, 1] |
| `.n` | `number` (readonly) | Number of data points |
| `.getCoefficients()` | `number[]` | Coefficients [c0, c1, c2, ...] |
| `.predict(x)` | `number[]` | Predicted y values |
| `.toString()` | `string` | Equation as string |

---

## Exponential Regression (Univariate)

```ts
exponentialRegression(x, y): Promise<ExponentialModel>
exponentialRegressionSimple(y): Promise<ExponentialModel>
```

Fit: `y = a * e^(b*x)`. All y values must be positive.

**Returns:** `ExponentialModel`

| Property / Method | Return Type | Description |
|--------------------|-------------|-------------|
| `.a` | `number` (readonly) | Amplitude |
| `.b` | `number` (readonly) | Growth/decay rate |
| `.rSquared` | `number` (readonly) | Coefficient of determination [0, 1] |
| `.n` | `number` (readonly) | Number of data points |
| `.predict(x)` | `number[]` | Predicted y values |
| `.doublingTime()` | `number` | Doubling time (b > 0) or half-life (b < 0) |
| `.toString()` | `string` | Equation as string |

---

## Logarithmic Regression (Univariate)

```ts
logarithmicRegression(x, y): Promise<LogarithmicModel>
```

Fit: `y = a + b * ln(x)`. All x values must be positive.

**Returns:** `LogarithmicModel`

| Property / Method | Return Type | Description |
|--------------------|-------------|-------------|
| `.a` | `number` (readonly) | Intercept |
| `.b` | `number` (readonly) | Logarithmic coefficient |
| `.rSquared` | `number` (readonly) | Coefficient of determination [0, 1] |
| `.n` | `number` (readonly) | Number of data points |
| `.predict(x)` | `number[]` | Predicted y values |
| `.toString()` | `string` | Equation as string |

---

## Power Regression (Univariate)

```ts
powerRegression(x, y): Promise<PowerModel>
```

Fit: `y = a * x^b`. All x and y values must be positive.

**Returns:** `PowerModel`

| Property / Method | Return Type | Description |
|--------------------|-------------|-------------|
| `.a` | `number` (readonly) | Coefficient |
| `.b` | `number` (readonly) | Exponent |
| `.rSquared` | `number` (readonly) | Coefficient of determination [0, 1] |
| `.n` | `number` (readonly) | Number of data points |
| `.predict(x)` | `number[]` | Predicted y values |
| `.toString()` | `string` | Equation as string |

---

## Ridge Regression (L2 Regularized)

```ts
ridgeRegression(x, y, alpha, nSamples, nFeatures): Promise<RidgeModel>
```

L2-regularized linear regression via closed-form solution: `(X'X + alpha*I)^-1 X'y`.

| Parameter | Type | Description |
|-----------|------|-------------|
| `x` | `number[]` | Flat features (nSamples * nFeatures) |
| `y` | `number[]` | Target values |
| `alpha` | `number` | Regularization strength (>= 0) |
| `nSamples` | `number` | Number of samples |
| `nFeatures` | `number` | Features per sample |

**Returns:** `RidgeModel`

| Property / Method | Return Type | Description |
|--------------------|-------------|-------------|
| `.nFeatures` | `number` (readonly) | Feature dimensionality |
| `.coefficients` | `number[]` (readonly) | Learned coefficients |
| `.intercept` | `number` (readonly) | Y-intercept |
| `.predict(data)` | `number[]` | Predicted values |
| `.toString()` | `string` | Human-readable description |

---

## Lasso Regression (L1 Regularized)

```ts
lassoRegression(x, y, alpha, maxIter, tol, nSamples, nFeatures): Promise<LassoModel>
```

L1-regularized linear regression via coordinate descent. Produces sparse coefficients.

| Parameter | Type | Description |
|-----------|------|-------------|
| `x` | `number[]` | Flat features |
| `y` | `number[]` | Target values |
| `alpha` | `number` | Regularization strength (>= 0) |
| `maxIter` | `number` | Maximum coordinate descent iterations |
| `tol` | `number` | Convergence tolerance |
| `nSamples` | `number` | Number of samples |
| `nFeatures` | `number` | Features per sample |

**Returns:** `LassoModel`

| Property / Method | Return Type | Description |
|--------------------|-------------|-------------|
| `.nFeatures` | `number` (readonly) | Feature dimensionality |
| `.coefficients` | `number[]` (readonly) | Learned coefficients (sparse) |
| `.intercept` | `number` (readonly) | Y-intercept |
| `.predict(data)` | `number[]` | Predicted values |
| `.toString()` | `string` | Human-readable description |

---

## Elastic Net

```ts
elasticNet(x, y, alpha, l1Ratio, maxIter, tol, nSamples, nFeatures): Promise<ElasticNetModel>
```

Combined L1 + L2 regularization via coordinate descent.

| Parameter | Type | Description |
|-----------|------|-------------|
| `x` | `number[]` | Flat features |
| `y` | `number[]` | Target values |
| `alpha` | `number` | Total regularization strength (>= 0) |
| `l1Ratio` | `number` | L1/L2 mixing ratio [0, 1] (0 = Ridge, 1 = Lasso) |
| `maxIter` | `number` | Maximum iterations |
| `tol` | `number` | Convergence tolerance |
| `nSamples` | `number` | Number of samples |
| `nFeatures` | `number` | Features per sample |

**Returns:** `ElasticNetModel`

| Property / Method | Return Type | Description |
|--------------------|-------------|-------------|
| `.nFeatures` | `number` (readonly) | Feature dimensionality |
| `.coefficients` | `number[]` (readonly) | Learned coefficients |
| `.intercept` | `number` (readonly) | Y-intercept |
| `.alpha` | `number` (readonly) | Configured alpha |
| `.l1Ratio` | `number` (readonly) | Configured L1 ratio |
| `.predict(data)` | `number[]` | Predicted values |
| `.toString()` | `string` | Human-readable description |

---

## Support Vector Regression (SVR)

```ts
svrFit(data, nFeatures, targets, epsilon, c, maxIter, lr, seed): Promise<SVRModel>
```

Epsilon-SVR using PEGASOS-style subgradient descent with epsilon-insensitive loss.

| Parameter | Type | Description |
|-----------|------|-------------|
| `data` | `number[]` | Flat features |
| `nFeatures` | `number` | Features per sample |
| `targets` | `number[]` | Target values |
| `epsilon` | `number` | Epsilon-tube width (>= 0) |
| `c` | `number` | Regularization parameter (> 0) |
| `maxIter` | `number` | Maximum iterations |
| `lr` | `number` | Learning rate (> 0) |
| `seed` | `number` | Random seed |

**Returns:** `SVRModel`

| Property / Method | Return Type | Description |
|--------------------|-------------|-------------|
| `.nFeatures` | `number` (readonly) | Feature dimensionality |
| `.weights` | `number[]` (readonly) | Weight vector |
| `.bias` | `number` (readonly) | Bias term |
| `.epsilon` | `number` (readonly) | Epsilon-tube width |
| `.c` | `number` (readonly) | Regularization parameter |
| `.supportVectors` | `number[]` (readonly) | Support vector data |
| `.supportLabels` | `number[]` (readonly) | Support vector targets |
| `.supportAlphas` | `number[]` (readonly) | Support vector alphas |
| `.predict(data)` | `number[]` | Predicted values |
| `.toString()` | `string` | Human-readable description |

---

## Quantile Regression

```ts
quantileRegressionFit(data, nFeatures, targets, quantile, maxIter, lr, tol): Promise<QuantileRegressionModel>
```

Predicts conditional quantiles via pinball loss gradient descent.

| Parameter | Type | Description |
|-----------|------|-------------|
| `data` | `number[]` | Flat features |
| `nFeatures` | `number` | Features per sample |
| `targets` | `number[]` | Target values |
| `quantile` | `number` | Target quantile [0, 1] (0.5 = median) |
| `maxIter` | `number` | Maximum iterations |
| `lr` | `number` | Learning rate (> 0) |
| `tol` | `number` | Convergence tolerance (>= 0) |

**Returns:** `QuantileRegressionModel`

| Property / Method | Return Type | Description |
|--------------------|-------------|-------------|
| `.nFeatures` | `number` (readonly) | Feature dimensionality |
| `.coefficients` | `number[]` (readonly) | Learned coefficients |
| `.intercept` | `number` (readonly) | Y-intercept |
| `.quantile` | `number` (readonly) | Fitted quantile |
| `.predict(data)` | `number[]` | Predicted values at the fitted quantile |
| `.toString()` | `string` | Human-readable description |

---

## Random Forest Regression

```ts
randomForestRegress(x, y, nTrees, maxDepth): Promise<RandomForestModel>
```

Bootstrap-aggregated ensemble averaging tree predictions for regression.

See [Random Forest (Classification)](./classification.md#random-forest) for the full `RandomForestModel` interface.

---

## Regression Metrics

```ts
meanAbsoluteError(yTrue, yPred): Promise<number>
meanSquaredError(yTrue, yPred): Promise<number>
r2Score(yTrue, yPred): Promise<number>
adjustedR2Score(yTrue, yPred, nFeatures): Promise<number>
medianAbsoluteError(yTrue, yPred): Promise<number>
explainedVarianceScore(yTrue, yPred): Promise<number>
```

Pure-TypeScript convenience wrappers (no WASM required):

```ts
rmse(actual, predicted): number
mae(actual, predicted): number
mape(actual, predicted): number
errorMetrics(actual, predicted): ErrorMetrics
residuals(actual, predicted): ResidualsResult
```
