use wasm_bindgen::prelude::*;
use crate::error::MlError;
use crate::matrix::validate_matrix;

/// Ridge Regression - L2 regularized linear regression
#[wasm_bindgen]
pub struct RidgeRegression {
    coefficients: Vec<f64>,
    intercept: f64,
    n_features: usize,
    alpha: f64,
}

#[wasm_bindgen]
impl RidgeRegression {
    #[wasm_bindgen(getter, js_name = "nFeatures")]
    pub fn n_features(&self) -> usize { self.n_features }

    #[wasm_bindgen(getter, js_name = "coefficients")]
    pub fn coef_js(&self) -> Vec<f64> { self.coefficients.clone() }

    #[wasm_bindgen(getter, js_name = "intercept")]
    pub fn intercept_js(&self) -> f64 { self.intercept }

    /// Predict target values
    #[wasm_bindgen]
    pub fn predict(&self, data: &[f64]) -> Vec<f64> {
        let n = data.len() / self.n_features;
        let mut result = Vec::with_capacity(n);

        for i in 0..n {
            let mut pred = self.intercept;
            for f in 0..self.n_features {
                pred += self.coefficients[f] * data[i * self.n_features + f];
            }
            result.push(pred);
        }

        result
    }

    #[wasm_bindgen(js_name = "toString")]
    pub fn to_string_js(&self) -> String {
        format!("RidgeRegression(n_features={}, alpha={})", self.n_features, self.alpha)
    }
}

/// Ridge regression using closed-form solution: (X'X + alpha*I)^-1 X'y
pub fn ridge_regression_impl(
    data: &[f64],
    n_features: usize,
    targets: &[f64],
    alpha: f64,
) -> Result<RidgeRegression, MlError> {
    let n = validate_matrix(data, n_features)?;
    if targets.len() != n {
        return Err(MlError::new("targets length must match number of samples"));
    }

    // Compute X'X and X'y
    let mut xt_x = vec![0.0f64; n_features * n_features];
    let mut xt_y = vec![0.0f64; n_features];

    for i in 0..n {
        for f1 in 0..n_features {
            let val1 = data[i * n_features + f1];

            // X'y
            xt_y[f1] += val1 * targets[i];

            // X'X
            for f2 in 0..n_features {
                let val2 = data[i * n_features + f2];
                xt_x[f1 * n_features + f2] += val1 * val2;
            }
        }
    }

    // Add L2 regularization to diagonal
    for f in 0..n_features {
        xt_x[f * n_features + f] += alpha;
    }

    // Solve using Cholesky-style approach (for small matrices, use simple inversion)
    let coefficients = solve_symmetric(&xt_x, n_features, &xt_y)?;

    // Compute intercept (mean(y) - sum(coef * mean(x)))
    let mut mean_y = 0.0;
    for &t in targets { mean_y += t; }
    mean_y /= n as f64;

    let mut mean_x = vec![0.0f64; n_features];
    for f in 0..n_features {
        for i in 0..n {
            mean_x[f] += data[i * n_features + f];
        }
        mean_x[f] /= n as f64;
    }

    let mut intercept = mean_y;
    for f in 0..n_features {
        intercept -= coefficients[f] * mean_x[f];
    }

    Ok(RidgeRegression {
        coefficients,
        intercept,
        n_features,
        alpha,
    })
}

/// Solve symmetric positive-definite system Ax = b using Cholesky decomposition
fn solve_symmetric(a: &[f64], n: usize, b: &[f64]) -> Result<Vec<f64>, MlError> {
    // Cholesky decomposition: A = LL'
    let mut l = vec![0.0f64; n * n];

    for i in 0..n {
        for j in 0..=i {
            let mut sum = a[i * n + j];

            for k in 0..j {
                sum -= l[i * n + k] * l[j * n + k];
            }

            if i == j {
                if sum <= 0.0 {
                    return Err(MlError::new("matrix not positive definite"));
                }
                l[i * n + j] = sum.sqrt();
            } else {
                l[i * n + j] = sum / l[j * n + j];
            }
        }
    }

    // Solve Ly = b (forward substitution)
    let mut y = vec![0.0f64; n];
    for i in 0..n {
        let mut sum = b[i];
        for j in 0..i {
            sum -= l[i * n + j] * y[j];
        }
        y[i] = sum / l[i * n + i];
    }

    // Solve L'x = y (backward substitution)
    let mut x = vec![0.0f64; n];
    for i in (0..n).rev() {
        let mut sum = y[i];
        for j in (i + 1)..n {
            sum -= l[j * n + i] * x[j];
        }
        x[i] = sum / l[i * n + i];
    }

    Ok(x)
}

/// Lasso Regression - L1 regularized linear regression (using coordinate descent)
#[wasm_bindgen]
pub struct LassoRegression {
    coefficients: Vec<f64>,
    intercept: f64,
    n_features: usize,
    alpha: f64,
}

#[wasm_bindgen]
impl LassoRegression {
    #[wasm_bindgen(getter, js_name = "nFeatures")]
    pub fn n_features(&self) -> usize { self.n_features }

    #[wasm_bindgen(getter, js_name = "coefficients")]
    pub fn coef_js(&self) -> Vec<f64> { self.coefficients.clone() }

    #[wasm_bindgen(getter, js_name = "intercept")]
    pub fn intercept_js(&self) -> f64 { self.intercept }

    /// Predict target values
    #[wasm_bindgen]
    pub fn predict(&self, data: &[f64]) -> Vec<f64> {
        let n = data.len() / self.n_features;
        let mut result = Vec::with_capacity(n);

        for i in 0..n {
            let mut pred = self.intercept;
            for f in 0..self.n_features {
                pred += self.coefficients[f] * data[i * self.n_features + f];
            }
            result.push(pred);
        }

        result
    }

    #[wasm_bindgen(js_name = "toString")]
    pub fn to_string_js(&self) -> String {
        format!("LassoRegression(n_features={}, alpha={})", self.n_features, self.alpha)
    }
}

/// Lasso regression using coordinate descent
pub fn lasso_regression_impl(
    data: &[f64],
    n_features: usize,
    targets: &[f64],
    alpha: f64,
    max_iter: usize,
    tol: f64,
) -> Result<LassoRegression, MlError> {
    let n = validate_matrix(data, n_features)?;
    if targets.len() != n {
        return Err(MlError::new("targets length must match number of samples"));
    }

    // Center data and targets
    let mut mean_x = vec![0.0f64; n_features];
    for f in 0..n_features {
        for i in 0..n {
            mean_x[f] += data[i * n_features + f];
        }
        mean_x[f] /= n as f64;
    }

    let mut mean_y = 0.0;
    for &t in targets { mean_y += t; }
    mean_y /= n as f64;

    let mut centered_data = vec![0.0f64; data.len()];
    for i in 0..n {
        for f in 0..n_features {
            centered_data[i * n_features + f] = data[i * n_features + f] - mean_x[f];
        }
    }

    let mut centered_targets: Vec<f64> = targets.iter().map(|&t| t - mean_y).collect();

    // Coordinate descent
    let mut coefficients = vec![0.0f64; n_features];
    let mut residuals = centered_targets.clone();

    for _iter in 0..max_iter {
        let mut max_change: f64 = 0.0;

        for f in 0..n_features {
            // Compute feature norm squared
            let mut norm_sq = 0.0;
            for i in 0..n {
                norm_sq += centered_data[i * n_features + f] * centered_data[i * n_features + f];
            }

            if norm_sq < 1e-12 {
                continue;
            }

            // Compute correlation with residuals
            let mut rho = 0.0;
            for i in 0..n {
                rho += centered_data[i * n_features + f] * residuals[i];
            }
            rho /= n as f64;

            // Soft threshold
            let old_coef = coefficients[f];
            let raw = rho + old_coef * norm_sq / n as f64;

            let new_coef = if raw.abs() <= alpha {
                0.0
            } else {
                (raw - alpha.signum() * alpha) / (norm_sq / n as f64)
            };

            coefficients[f] = new_coef;

            // Update residuals
            let delta = new_coef - old_coef;
            for i in 0..n {
                residuals[i] -= delta * centered_data[i * n_features + f];
            }

            max_change = max_change.max(delta.abs());
        }

        if max_change < tol {
            break;
        }
    }

    // Compute intercept
    let mut intercept = mean_y;
    for f in 0..n_features {
        intercept -= coefficients[f] * mean_x[f];
    }

    Ok(LassoRegression {
        coefficients,
        intercept,
        n_features,
        alpha,
    })
}

#[wasm_bindgen(js_name = "ridgeRegression")]
pub fn ridge_regression(
    data: &[f64],
    n_features: usize,
    targets: &[f64],
    alpha: f64,
) -> Result<RidgeRegression, JsError> {
    ridge_regression_impl(data, n_features, targets, alpha)
        .map_err(|e| JsError::new(&e.message))
}

#[wasm_bindgen(js_name = "lassoRegression")]
pub fn lasso_regression(
    data: &[f64],
    n_features: usize,
    targets: &[f64],
    alpha: f64,
    max_iter: usize,
    tol: f64,
) -> Result<LassoRegression, JsError> {
    lasso_regression_impl(data, n_features, targets, alpha, max_iter, tol)
        .map_err(|e| JsError::new(&e.message))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ridge_fits() {
        let data = vec![1.0, 2.0, 3.0, 4.0];
        let targets = vec![2.0, 4.0, 6.0, 8.0];

        let model = ridge_regression_impl(&data, 1, &targets, 0.1).unwrap();
        let preds = model.predict(&data);

        // Should fit well (y = 2x)
        for (p, &t) in preds.iter().zip(&targets) {
            assert!((p - t).abs() < 0.5);
        }
    }

    #[test]
    fn test_lasso_sparsity() {
        let data = vec![
            1.0, 0.0, 0.0,
            2.0, 0.0, 0.0,
            3.0, 0.0, 0.0,
        ];
        let targets = vec![2.0, 4.0, 6.0];

        // High alpha should force sparsity
        let model = lasso_regression_impl(&data, 3, &targets, 10.0, 1000, 1e-4).unwrap();

        // Most coefficients should be zero
        let non_zero = model.coefficients.iter().filter(|&&c| c.abs() > 1e-10).count();
        assert!(non_zero <= 2);
    }

    #[test]
    fn test_ridge_vs_lasso() {
        let data = vec![1.0, 2.0, 3.0];
        let targets = vec![2.0, 4.0, 6.0];

        let ridge = ridge_regression_impl(&data, 1, &targets, 1.0).unwrap();
        let lasso = lasso_regression_impl(&data, 1, &targets, 1.0, 1000, 1e-4).unwrap();

        // Both should make predictions
        let r_preds = ridge.predict(&data);
        let l_preds = lasso.predict(&data);

        assert_eq!(r_preds.len(), 3);
        assert_eq!(l_preds.len(), 3);
    }
}
