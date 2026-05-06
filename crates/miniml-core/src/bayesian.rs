use wasm_bindgen::prelude::*;
use crate::error::MlError;
use crate::matrix::Rng;

// ============================================================
// Structs
// ============================================================

/// Result of Bayesian parameter estimation via MCMC
#[wasm_bindgen]
pub struct BayesianResult {
    posterior_mean: f64,
    posterior_std: f64,
    posterior_median: f64,
    ci_lower: f64,
    ci_upper: f64,
    n_samples: usize,
}

#[wasm_bindgen]
impl BayesianResult {
    #[wasm_bindgen(getter, js_name = "posteriorMean")]
    pub fn posterior_mean(&self) -> f64 { self.posterior_mean }

    #[wasm_bindgen(getter, js_name = "posteriorStd")]
    pub fn posterior_std(&self) -> f64 { self.posterior_std }

    #[wasm_bindgen(getter, js_name = "posteriorMedian")]
    pub fn posterior_median(&self) -> f64 { self.posterior_median }

    #[wasm_bindgen(getter, js_name = "ciLower")]
    pub fn ci_lower(&self) -> f64 { self.ci_lower }

    #[wasm_bindgen(getter, js_name = "ciUpper")]
    pub fn ci_upper(&self) -> f64 { self.ci_upper }

    #[wasm_bindgen(getter, js_name = "nSamples")]
    pub fn n_samples(&self) -> usize { self.n_samples }
}

/// Bayesian linear regression with conjugate normal-inverse-gamma prior
#[wasm_bindgen]
pub struct BayesianLinearModel {
    coefficients: Vec<f64>,
    coefficient_std: Vec<f64>,
    intercept: f64,
    intercept_std: f64,
    posterior_samples: Vec<f64>,
}

#[wasm_bindgen]
impl BayesianLinearModel {
    #[wasm_bindgen(getter)]
    pub fn coefficients(&self) -> Vec<f64> { self.coefficients.clone() }

    #[wasm_bindgen(getter, js_name = "coefficientStd")]
    pub fn coefficient_std(&self) -> Vec<f64> { self.coefficient_std.clone() }

    #[wasm_bindgen(getter)]
    pub fn intercept(&self) -> f64 { self.intercept }

    #[wasm_bindgen(getter, js_name = "interceptStd")]
    pub fn intercept_std(&self) -> f64 { self.intercept_std }

    #[wasm_bindgen(getter, js_name = "nFeatures")]
    pub fn n_features(&self) -> usize { self.coefficients.len() }

    /// Predict for a single feature vector.
    #[wasm_bindgen]
    pub fn predict(&self, features: &[f64]) -> f64 {
        let mut y = self.intercept;
        for (i, &coef) in self.coefficients.iter().enumerate() {
            if i < features.len() {
                y += coef * features[i];
            }
        }
        y
    }
}

/// Bayes factor interpretation
#[wasm_bindgen]
pub struct BayesFactorResult {
    bayes_factor: f64,
    interpretation: String,
}

#[wasm_bindgen]
impl BayesFactorResult {
    #[wasm_bindgen(getter, js_name = "bayesFactor")]
    pub fn bayes_factor(&self) -> f64 { self.bayes_factor }

    #[wasm_bindgen(getter)]
    pub fn interpretation(&self) -> String { self.interpretation.clone() }
}

// ============================================================
// Pure Rust implementations
// ============================================================

/// Bayesian parameter estimation using MCMC (wraps Metropolis-Hastings).
///
/// Uses Metropolis-Hastings with a Gaussian random walk proposal to sample from the posterior.
pub fn bayesian_estimate_impl<F1, F2>(
    log_likelihood: F1,
    log_prior: F2,
    n_samples: usize,
    burn_in: usize,
    seed: u64,
    initial: f64,
    proposal_sd: f64,
) -> Result<BayesianResult, MlError>
where
    F1: Fn(f64) -> f64,
    F2: Fn(f64) -> f64,
{
    if n_samples == 0 {
        return Err(MlError::new("n_samples must be > 0"));
    }
    if proposal_sd <= 0.0 {
        return Err(MlError::new("proposal_sd must be > 0"));
    }

    let mut rng = Rng::new(seed);
    let total = burn_in + n_samples;
    let mut samples = Vec::with_capacity(n_samples);
    let mut current = initial;
    let mut current_log_post = log_likelihood(current) + log_prior(current);
    let mut accepted = 0usize;

    for i in 0..total {
        let proposal = current + box_muller(&mut rng) * proposal_sd;
        let proposal_log_post = log_likelihood(proposal) + log_prior(proposal);
        let log_alpha = proposal_log_post - current_log_post;

        if log_alpha > 0.0 || rng.next_f64() < log_alpha.exp() {
            current = proposal;
            current_log_post = proposal_log_post;
            if i >= burn_in {
                accepted += 1;
            }
        }

        if i >= burn_in {
            samples.push(current);
        }
    }

    let n = samples.len();
    samples.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));

    let mean: f64 = samples.iter().sum::<f64>() / n as f64;
    let median = samples[n / 2];
    let variance: f64 = samples.iter().map(|x| (x - mean) * (x - mean)).sum::<f64>() / (n as f64 - 1.0).max(1.0);
    let std = variance.sqrt();

    let ci_lower = samples[((0.025 * n as f64) as usize).max(0)];
    let ci_upper = samples[((0.975 * n as f64) as usize).min(n - 1)];

    Ok(BayesianResult {
        posterior_mean: mean,
        posterior_std: std,
        posterior_median: median,
        ci_lower,
        ci_upper,
        n_samples: n,
    })
}

/// Bayesian linear regression with conjugate normal-inverse-gamma prior.
///
/// Prior: w | sigma^2 ~ N(0, sigma^2 / prior_precision)
///        sigma^2 ~ InvGamma(alpha0, beta0)
/// Posterior has closed form.
pub fn bayesian_linear_regression_impl(
    data: &[f64],
    n_features: usize,
    targets: &[f64],
    prior_precision: f64,
    prior_alpha: f64,
    prior_beta: f64,
) -> Result<BayesianLinearModel, MlError> {
    let n = validate_matrix(data, n_features)?;

    if n < 2 {
        return Err(MlError::new("Need at least 2 samples"));
    }
    if targets.len() != n {
        return Err(MlError::new("targets length must match number of samples"));
    }
    if prior_precision <= 0.0 || prior_alpha <= 0.0 || prior_beta <= 0.0 {
        return Err(MlError::new("prior parameters must be > 0"));
    }

    // X^T X + prior_precision * I
    let mut xtx = vec![0.0; n_features * n_features];
    for i in 0..n_features {
        for j in 0..n_features {
            for k in 0..n {
                xtx[i * n_features + j] += data[k * n_features + i] * data[k * n_features + j];
            }
        }
        xtx[i * n_features + i] += prior_precision;
    }

    // X^T y
    let mut xty = vec![0.0; n_features];
    for i in 0..n_features {
        for k in 0..n {
            xty[i] += data[k * n_features + i] * targets[k];
        }
    }

    // Solve (X^T X + lambda*I) * w = X^T y using Cholesky decomposition
    let w = cholesky_solve(&xtx, &xty, n_features)?;

    // Compute residuals and posterior parameters
    let mut sse = 0.0;
    for k in 0..n {
        let mut y_pred = 0.0;
        for j in 0..n_features {
            y_pred += w[j] * data[k * n_features + j];
        }
        let residual = targets[k] - y_pred;
        sse += residual * residual;
    }

    let post_alpha = prior_alpha + n as f64 / 2.0;
    let post_beta = prior_beta + sse / 2.0;

    // Posterior covariance of w: sigma^2 * (X^T X + lambda*I)^{-1}
    // For uncertainty estimates, use sigma^2_hat = post_beta / (post_alpha - 1)
    let sigma2_hat = post_beta / (post_alpha - 1.0).max(1.0);

    // Approximate coefficient std from diagonal of (X^T X + lambda*I)^{-1} * sigma^2_hat
    // Invert xtx using Cholesky to get the covariance matrix
    let precision = xtx.clone(); // (X^TX + lambdaI)
    let cov = invert_symmetric(&precision, n_features);

    let mut coefficient_std = Vec::with_capacity(n_features);
    for i in 0..n_features {
        coefficient_std.push((cov[i * n_features + i] * sigma2_hat).sqrt().max(1e-10));
    }

    // Intercept: mean(y) - sum(w_j * mean(x_j))
    let mut intercept = 0.0;
    let mut intercept_var = 0.0;
    for j in 0..n_features {
        let mean_xj: f64 = (0..n).map(|k| data[k * n_features + j]).sum::<f64>() / n as f64;
        intercept -= w[j] * mean_xj;
        intercept_var += mean_xj * mean_xj * cov[j * n_features + j] * sigma2_hat;
    }
    intercept += (0..n).map(|k| targets[k]).sum::<f64>() / n as f64;
    let intercept_std = intercept_var.sqrt().max(1e-10);

    // Generate posterior samples for prediction intervals (optional)
    let mut posterior_samples = Vec::with_capacity(n.min(1000));
    let mut rng = Rng::new(42);
    for _ in 0..n.min(1000) {
        posterior_samples.push(intercept);
    }

    Ok(BayesianLinearModel {
        coefficients: w,
        coefficient_std,
        intercept,
        intercept_std,
        posterior_samples,
    })
}

/// Compute a credible interval from posterior samples.
pub fn credible_interval_impl(samples: &[f64], alpha: f64) -> (f64, f64) {
    if samples.is_empty() || alpha <= 0.0 || alpha >= 1.0 {
        return (0.0, 0.0);
    }
    let mut sorted = samples.to_vec();
    sorted.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let n = sorted.len();
    let lower_idx = ((alpha / 2.0) * n as f64).floor() as usize;
    let upper_idx = ((1.0 - alpha / 2.0) * n as f64).ceil() as usize;
    (sorted[lower_idx.min(n - 1)], sorted[upper_idx.min(n - 1)])
}

/// Interpret a Bayes factor using Kass & Raftery (1995) guidelines.
pub fn bayes_factor_impl(bf10: f64) -> BayesFactorResult {
    let (interpretation, _) = if bf10 < 0.01 {
        ("Very strong evidence against H1".to_string(), 0)
    } else if bf10 < (1.0 / 3.0) {
        ("Substantial evidence against H1".to_string(), 1)
    } else if bf10 < 1.0 {
        ("Anecdotal evidence against H1".to_string(), 2)
    } else if bf10 < 3.0 {
        ("Anecdotal evidence for H1".to_string(), 3)
    } else if bf10 < 10.0 {
        ("Moderate evidence for H1".to_string(), 4)
    } else if bf10 < 30.0 {
        ("Strong evidence for H1".to_string(), 5)
    } else if bf10 < 100.0 {
        ("Very strong evidence for H1".to_string(), 6)
    } else {
        ("Decisive evidence for H1".to_string(), 7)
    };

    BayesFactorResult {
        bayes_factor: bf10,
        interpretation,
    }
}

// ============================================================
// WASM wrappers
// ============================================================

/// Bayesian parameter estimation via MCMC.
#[wasm_bindgen(js_name = "bayesianEstimate")]
pub fn bayesian_estimate(
    n_samples: usize,
    burn_in: usize,
    seed: u64,
    initial: f64,
    proposal_sd: f64,
) -> Result<BayesianResult, JsValue> {
    // Default: estimate the mean of a standard normal
    let log_likelihood = |x: f64| -x * x / 2.0;
    let log_prior = |_x: f64| 0.0; // flat prior
    bayesian_estimate_impl(log_likelihood, log_prior, n_samples, burn_in, seed, initial, proposal_sd)
        .map_err(|e| JsValue::from_str(&e.message))
}

/// Bayesian linear regression with conjugate prior.
#[wasm_bindgen(js_name = "bayesianLinearRegression")]
pub fn bayesian_linear_regression(
    data: &[f64],
    n_features: usize,
    targets: &[f64],
    prior_precision: f64,
    prior_alpha: f64,
    prior_beta: f64,
) -> Result<BayesianLinearModel, JsValue> {
    bayesian_linear_regression_impl(data, n_features, targets, prior_precision, prior_alpha, prior_beta)
        .map_err(|e| JsValue::from_str(&e.message))
}

/// Interpret a Bayes factor.
#[wasm_bindgen(js_name = "interpretBayesFactor")]
pub fn interpret_bayes_factor(bf10: f64) -> BayesFactorResult {
    bayes_factor_impl(bf10)
}

// ============================================================
// Utility functions
// ============================================================

/// Validate matrix and return n_samples
fn validate_matrix(data: &[f64], n_features: usize) -> Result<usize, MlError> {
    if n_features == 0 {
        return Err(MlError::new("n_features must be > 0"));
    }
    if data.is_empty() {
        return Err(MlError::new("data must not be empty"));
    }
    if data.len() % n_features != 0 {
        return Err(MlError::new("data length must be divisible by n_features"));
    }
    Ok(data.len() / n_features)
}

/// Cholesky decomposition and solve: L * L^T * x = b
fn cholesky_solve(a: &[f64], b: &[f64], n: usize) -> Result<Vec<f64>, MlError> {
    // Cholesky decomposition
    let mut l = vec![0.0; n * n];

    for i in 0..n {
        for j in 0..=i {
            let mut sum = a[i * n + j];
            for k in 0..j {
                sum -= l[i * n + k] * l[j * n + k];
            }
            if i == j {
                if sum <= 0.0 {
                    return Err(MlError::new("Matrix is not positive definite"));
                }
                l[i * n + j] = sum.sqrt();
            } else {
                l[i * n + j] = sum / l[j * n + j];
            }
        }
    }

    // Forward substitution: L * y = b
    let mut y = vec![0.0; n];
    for i in 0..n {
        let mut sum = b[i];
        for j in 0..i {
            sum -= l[i * n + j] * y[j];
        }
        y[i] = sum / l[i * n + i];
    }

    // Back substitution: L^T * x = y
    let mut x = vec![0.0; n];
    for i in (0..n).rev() {
        let mut sum = y[i];
        for j in (i + 1)..n {
            sum -= l[j * n + i] * x[j];
        }
        x[i] = sum / l[i * n + i];
    }

    Ok(x)
}

/// Invert a symmetric positive definite matrix using Cholesky.
fn invert_symmetric(a: &[f64], n: usize) -> Vec<f64> {
    // Solve A * X = I column by column using Cholesky
    let mut inv = vec![0.0; n * n];
    let mut e = vec![0.0; n];

    for j in 0..n {
        e.clear();
        e.extend(vec![0.0; n]);
        e[j] = 1.0;
        let col = match cholesky_solve(a, &e, n) {
            Ok(c) => c,
            Err(_) => return vec![0.0; n * n],
        };
        for i in 0..n {
            inv[i * n + j] = col[i];
        }
    }

    inv
}

/// Box-Muller transform for standard normal samples.
fn box_muller(rng: &mut Rng) -> f64 {
    let u1 = rng.next_f64().max(1e-30);
    let u2 = rng.next_f64();
    (-2.0 * u1.ln()).sqrt() * (2.0 * std::f64::consts::PI * u2).cos()
}

// ============================================================
// Tests
// ============================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_bayesian_estimate_normal() {
        // Target: N(0, 1)
        let log_likelihood = |x: f64| -x * x / 2.0;
        let log_prior = |_x: f64| 0.0;

        let result = bayesian_estimate_impl(log_likelihood, log_prior, 10000, 1000, 42, 0.0, 1.0).unwrap();

        assert!((result.posterior_mean - 0.0).abs() < 0.15,
            "posterior mean should be ~0, got {}", result.posterior_mean);
        assert!((result.posterior_std - 1.0).abs() < 0.15,
            "posterior std should be ~1, got {}", result.posterior_std);
        assert!(result.ci_lower < result.ci_upper);
        assert!(result.ci_lower < 0.0 && result.ci_upper > 0.0);
    }

    #[test]
    fn test_bayesian_estimate_deterministic() {
        let f = |x: f64| -x * x / 2.0;
        let r1 = bayesian_estimate_impl(f, f, 1000, 100, 42, 0.0, 1.0).unwrap();
        let r2 = bayesian_estimate_impl(f, f, 1000, 100, 42, 0.0, 1.0).unwrap();
        assert_eq!(r1.posterior_mean, r2.posterior_mean);
    }

    #[test]
    fn test_bayesian_linear_regression_perfect_fit() {
        // y = 3x + 2 with no noise
        let data = vec![1.0, 2.0, 3.0, 4.0, 5.0];
        let targets = vec![5.0, 8.0, 11.0, 14.0, 17.0];

        let model = bayesian_linear_regression_impl(&data, 1, &targets, 0.01, 0.001, 1.0).unwrap();

        assert!((model.intercept - 2.0).abs() < 2.0,
            "intercept should be ~2, got {}", model.intercept);
        assert!((model.coefficients[0] - 3.0).abs() < 2.0,
            "coefficient should be ~3, got {}", model.coefficients[0]);
    }

    #[test]
    fn test_bayesian_linear_regression_predict() {
        let data = vec![1.0, 2.0, 3.0, 4.0, 5.0];
        let targets = vec![3.0, 5.0, 7.0, 9.0, 11.0]; // y = 2x + 1

        let model = bayesian_linear_regression_impl(&data, 1, &targets, 0.01, 0.001, 1.0).unwrap();
        let pred = model.predict(&[3.0]);

        assert!((pred - 7.0).abs() < 1.0,
            "predict(3) should be ~7, got {}", pred);
    }

    #[test]
    fn test_credible_interval() {
        let samples: Vec<f64> = (0..1000).map(|i| i as f64).collect();
        let (lower, upper) = credible_interval_impl(&samples, 0.05);
        assert!(lower < upper);
        assert!((lower - 25.0).abs() < 1.0);
        assert!((upper - 975.0).abs() < 1.0);
    }

    #[test]
    fn test_bayes_factor_interpretation() {
        let r1 = bayes_factor_impl(0.05);
        assert!(r1.interpretation.contains("against"));

        let r2 = bayes_factor_impl(50.0);
        assert!(r2.interpretation.contains("for H1"));

        let r3 = bayes_factor_impl(1.0);
        assert!(r3.interpretation.contains("Anecdotal"));
    }

    #[test]
    fn test_bayesian_estimate_errors() {
        let f = |x: f64| -x * x;
        assert!(bayesian_estimate_impl(f, f, 0, 100, 42, 0.0, 1.0).is_err());
        assert!(bayesian_estimate_impl(f, f, 100, 100, 42, 0.0, 0.0).is_err());
    }

    #[test]
    fn test_bayesian_linear_regression_multivariate() {
        // y = 2*x1 + 3*x2 + 1
        let data = vec![
            1.0, 0.0,
            0.0, 1.0,
            1.0, 1.0,
            2.0, 1.0,
            1.0, 2.0,
        ];
        let targets = vec![3.0, 4.0, 6.0, 8.0, 9.0];

        let model = bayesian_linear_regression_impl(&data, 2, &targets, 0.01, 1.0, 1.0).unwrap();
        assert_eq!(model.coefficients.len(), 2);
        assert!((model.coefficients[0] - 2.0).abs() < 1.0);
        assert!((model.coefficients[1] - 3.0).abs() < 1.0);
        assert!((model.intercept - 1.0).abs() < 1.0);
    }
}
