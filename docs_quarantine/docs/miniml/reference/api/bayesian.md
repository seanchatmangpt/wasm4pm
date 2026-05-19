# Bayesian API

Bayesian estimation and Bayesian linear regression. Call `await init()` before use.

---

## Bayesian Estimation

### `bayesianEstimate`

```ts
function bayesianEstimate(
  logLikelihood: number,
  logPrior: number,
  nSamples: number,
  burnIn: number,
  seed: number,
  initial: number
): BayesianResult
```

Samples from a posterior distribution using MCMC (Metropolis-Hastings), combining a log-likelihood function with a log-prior function.

| Parameter | Type | Description |
|-----------|------|-------------|
| `logLikelihood` | `number` | Index of the registered log-likelihood function |
| `logPrior` | `number` | Index of the registered log-prior function |
| `nSamples` | `number` | Number of posterior samples to collect |
| `burnIn` | `number` | Number of initial samples to discard |
| `seed` | `number` | PRNG seed |
| `initial` | `number` | Starting parameter value |

**Returns:** `BayesianResult`

```ts
interface BayesianResult {
  samples: Float64Array;         // Posterior samples (length nSamples)
  posteriorMean: number;         // Mean of posterior samples
  posteriorStd: number;          // Standard deviation of posterior samples
  credibleInterval: [number, number]; // 95% credible interval [lower, upper]
}
```

> **Note:** The `logLikelihood` and `logPrior` parameters accept indices into a pre-registered function table. Use the WASM registration API to bind JavaScript functions before calling `bayesianEstimate`.

---

## Bayesian Linear Regression

### `bayesianLinearRegression`

```ts
function bayesianLinearRegression(
  X: Float64Array,
  y: Float64Array,
  nSamples: number,
  nFeatures: number,
  priorPrecision: number,
  noisePrecision: number
): BayesianRegressionResult
```

Fits a Bayesian linear regression model with Gaussian priors and known noise precision. Returns the full posterior distribution over coefficients.

| Parameter | Type | Description |
|-----------|------|-------------|
| `X` | `Float64Array` | Feature matrix (nSamples x nFeatures), row-major |
| `y` | `Float64Array` | Target vector (length nSamples) |
| `nSamples` | `number` | Number of data points |
| `nFeatures` | `number` | Number of features (including intercept if prepended) |
| `priorPrecision` | `number` | Precision (1/variance) of the Gaussian prior on coefficients, must be > 0 |
| `noisePrecision` | `number` | Precision (1/variance) of the Gaussian noise model, must be > 0 |

**Returns:** `BayesianRegressionResult`

```ts
interface BayesianRegressionResult {
  coefficients: Float64Array;              // Posterior mean coefficients (length nFeatures)
  posteriorMean: Float64Array;             // Same as coefficients (length nFeatures)
  posteriorCovariance: Float64Array;       // Posterior covariance matrix (nFeatures x nFeatures), row-major
  credibleIntervals: Array<[number, number]>; // 95% credible interval per coefficient
}
```

---

## Usage Notes

- For `bayesianLinearRegression`, prepend a column of ones to `X` to include an intercept term.
- Higher `priorPrecision` encodes stronger prior belief that coefficients are near zero (ridge-like regularization).
- Higher `noisePrecision` assumes less observation noise (tighter fit to training data).
- The posterior covariance matrix from `bayesianLinearRegression` can be used for uncertainty-aware predictions.
