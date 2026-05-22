# Survival Analysis API

Non-parametric and semi-parametric survival analysis methods. Call `await init()` before use.

---

## Kaplan-Meier Estimator

### `kaplanMeier`

```ts
function kaplanMeier(
  times: Float64Array,
  events: Uint8Array
): KaplanMeierResult
```

Estimates the survival function using the Kaplan-Meier product-limit estimator with Greenwood confidence intervals.

| Parameter | Type | Description |
|-----------|------|-------------|
| `times` | `Float64Array` | Event or censoring times, must be >= 0 |
| `events` | `Uint8Array` | Event indicator: 1 = observed event, 0 = right-censored. Must be same length as `times`. |

**Returns:** `KaplanMeierResult`

```ts
interface KaplanMeierResult {
  survivalCurve: Float64Array;         // S(t) at each unique time point
  confidenceLower: Float64Array;       // Lower bound of 95% confidence interval
  confidenceUpper: Float64Array;       // Upper bound of 95% confidence interval
  medianSurvival: number;              // Median survival time (0 if undefined)
}
```

**Behavior:**
- `times` and `events` must have the same length.
- The survival curve is evaluated at each unique event time in sorted order.
- Confidence intervals are computed using Greenwood's formula (log-log transform).
- If the survival curve never drops below 0.5, `medianSurvival` is 0.

---

## Cox Proportional Hazards

### `coxProportionalHazards`

```ts
function coxProportionalHazards(
  features: Float64Array,
  nFeatures: number,
  times: Float64Array,
  events: Uint8Array,
  maxIter: number = 100,
  tol: number = 1e-6
): CoxResult
```

Fits a Cox proportional hazards regression model using partial likelihood maximization with Newton-Raphson iteration.

| Parameter | Type | Description |
|-----------|------|-------------|
| `features` | `Float64Array` | Feature matrix (nSamples x nFeatures), row-major |
| `nFeatures` | `number` | Number of covariates |
| `times` | `Float64Array` | Event or censoring times (length nSamples) |
| `events` | `Uint8Array` | Event indicator: 1 = event, 0 = censored (length nSamples) |
| `maxIter` | `number` | Maximum Newton-Raphson iterations (default: 100) |
| `tol` | `number` | Convergence tolerance on log partial likelihood (default: 1e-6) |

**Returns:** `CoxResult`

```ts
interface CoxResult {
  coefficients: Float64Array;       // Regression coefficients (beta), length nFeatures
  hazardRatios: Float64Array;      // exp(beta), length nFeatures
  standardErrors: Float64Array;    // Standard error per coefficient, length nFeatures
  pValues: Float64Array;           // Wald test p-value per coefficient, length nFeatures
}
```

**Behavior:**
- `features`, `times`, and `events` must all correspond to the same number of samples.
- Hazard ratios greater than 1 indicate increased hazard (worse survival) per unit increase in the covariate.
- Hazard ratios less than 1 indicate decreased hazard (better survival).
- The Wald test p-values test the null hypothesis that each coefficient is zero.

---

## Usage Notes

- Kaplan-Meier requires no assumptions about the underlying distribution and is suitable for descriptive analysis.
- The Cox model assumes proportional hazards (the ratio of hazards between groups is constant over time). This assumption should be checked before interpreting results.
- Both methods handle right-censoring only. Left-censoring and interval-censoring are not supported.
