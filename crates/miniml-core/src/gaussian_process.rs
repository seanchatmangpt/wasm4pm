use wasm_bindgen::prelude::*;
use crate::error::MlError;

// ============================================================
// Structs
// ============================================================

/// Gaussian Process regression model
#[wasm_bindgen]
pub struct GPModel {
    x_train: Vec<f64>,
    y_train: Vec<f64>,
    alpha: Vec<f64>,     // (K + noise*I)^{-1} * y
    l_matrix: Vec<f64>,  // Cholesky of (K + noise*I)
    n_features: usize,
    n_train: usize,
    kernel_type: String,
    kernel_gamma: f64,
    noise: f64,
}

#[wasm_bindgen]
impl GPModel {
    #[wasm_bindgen(getter, js_name = "nTrain")]
    pub fn n_train(&self) -> usize { self.n_train }

    #[wasm_bindgen(getter, js_name = "nFeatures")]
    pub fn n_features(&self) -> usize { self.n_features }

    #[wasm_bindgen(getter, js_name = "kernelType")]
    pub fn kernel_type(&self) -> String { self.kernel_type.clone() }

    /// Predict using the GP model. Returns mean, std, lower CI, upper CI.
    #[wasm_bindgen]
    pub fn predict(&self, x_test: &[f64]) -> Result<GPPrediction, JsValue> {
        gp_predict_impl(self, x_test)
            .map_err(|e| JsValue::from_str(&e.message))
    }
}

/// GP prediction result with uncertainty estimates
#[wasm_bindgen]
pub struct GPPrediction {
    mean: Vec<f64>,
    std: Vec<f64>,
    lower: Vec<f64>,
    upper: Vec<f64>,
}

#[wasm_bindgen]
impl GPPrediction {
    #[wasm_bindgen(getter)]
    pub fn mean(&self) -> Vec<f64> { self.mean.clone() }

    #[wasm_bindgen(getter)]
    pub fn std(&self) -> Vec<f64> { self.std.clone() }

    #[wasm_bindgen(getter)]
    pub fn lower(&self) -> Vec<f64> { self.lower.clone() }

    #[wasm_bindgen(getter)]
    pub fn upper(&self) -> Vec<f64> { self.upper.clone() }

    #[wasm_bindgen(getter)]
    pub fn n_test(&self) -> usize { self.mean.len() }
}

// ============================================================
// Pure Rust implementations
// ============================================================

/// Fit a Gaussian Process regression model.
///
/// `kernel_type`: "rbf" or "linear"
/// `kernel_params`: [gamma] for RBF, or [] for linear
/// `noise`: observation noise variance (jitter)
pub fn gp_fit_impl(
    data: &[f64],
    n_features: usize,
    targets: &[f64],
    kernel_type: &str,
    kernel_params: &[f64],
    noise: f64,
) -> Result<GPModel, MlError> {
    let n = data.len() / n_features;
    if n == 0 {
        return Err(MlError::new("data must not be empty"));
    }
    if targets.len() != n {
        return Err(MlError::new("targets length must match number of samples"));
    }
    if noise < 0.0 {
        return Err(MlError::new("noise must be >= 0"));
    }

    let gamma = if kernel_params.is_empty() {
        1.0 / n_features as f64
    } else {
        kernel_params[0]
    };

    // Compute kernel matrix K
    let mut k_matrix = vec![0.0; n * n];
    for i in 0..n {
        for j in i..n {
            let k = compute_kernel(
                &data[i * n_features..(i + 1) * n_features],
                &data[j * n_features..(j + 1) * n_features],
                kernel_type, gamma,
            );
            k_matrix[i * n + j] = k;
            k_matrix[j * n + i] = k;
        }
    }

    // Add noise to diagonal
    for i in 0..n {
        k_matrix[i * n + i] += noise;
    }

    // Cholesky decomposition: K + noise*I = L * L^T
    let l_matrix = cholesky_decompose(&k_matrix, n)?;

    // Solve (K + noise*I) * alpha = y using forward-backward substitution
    let alpha = cholesky_solve(&l_matrix, &k_matrix, targets, n);

    Ok(GPModel {
        x_train: data.to_vec(),
        y_train: targets.to_vec(),
        alpha,
        l_matrix,
        n_features,
        n_train: n,
        kernel_type: kernel_type.to_string(),
        kernel_gamma: gamma,
        noise,
    })
}

/// Predict using a fitted GP model.
///
/// Returns predictive mean, standard deviation, and 95% confidence interval.
pub fn gp_predict_impl(
    model: &GPModel,
    x_test: &[f64],
) -> Result<GPPrediction, MlError> {
    let n_test = x_test.len() / model.n_features;
    if n_test == 0 {
        return Err(MlError::new("x_test must not be empty"));
    }

    let n = model.n_train;
    let gamma = model.kernel_gamma;

    // Compute cross-covariance: k* = K(x_test, x_train), shape n_test x n
    let mut k_star = vec![0.0; n_test * n];
    for i in 0..n_test {
        for j in 0..n {
            k_star[i * n + j] = compute_kernel(
                &x_test[i * model.n_features..(i + 1) * model.n_features],
                &model.x_train[j * model.n_features..(j + 1) * model.n_features],
                &model.kernel_type, gamma,
            );
        }
    }

    // Predictive mean: f* = k*^T * alpha
    let mut mean = vec![0.0; n_test];
    for i in 0..n_test {
        for j in 0..n {
            mean[i] += k_star[i * n + j] * model.alpha[j];
        }
    }

    // Predictive variance: v = k(x_test, x_test) - k*^T * K^{-1} * k*
    // Solve K^{-1} * k* using the Cholesky: solve L * L^T * x = k* for each test point column
    let mut v = vec![0.0; n_test];
    for i in 0..n_test {
        // k(test_i, test_i) with noise added
        let k_self = compute_kernel(
            &x_test[i * model.n_features..(i + 1) * model.n_features],
            &x_test[i * model.n_features..(i + 1) * model.n_features],
            &model.kernel_type, gamma,
        ) + model.noise;

        // Solve K^{-1} * k_star[:,i] via Cholesky
        let mut k_inv_kstar = vec![0.0; n];
        for j in 0..n {
            k_inv_kstar[j] = k_star[i * n + j];
        }
        let solved = cholesky_solve(&model.l_matrix, &k_star, &k_inv_kstar, n);

        let mut quad_form = 0.0;
        for j in 0..n {
            quad_form += k_star[i * n + j] * solved[j];
        }

        v[i] = k_self - quad_form;
    }

    // Standard deviation and 95% CI
    let mut std = vec![0.0; n_test];
    let mut lower = vec![0.0; n_test];
    let mut upper = vec![0.0; n_test];
    let z = 1.96; // 95% CI

    for i in 0..n_test {
        std[i] = v[i].sqrt().max(1e-10);
        lower[i] = mean[i] - z * std[i];
        upper[i] = mean[i] + z * std[i];
    }

    Ok(GPPrediction { mean, std, lower, upper })
}

// ============================================================
// WASM wrappers
// ============================================================

/// Fit a Gaussian Process model.
#[wasm_bindgen(js_name = "gpFit")]
pub fn gp_fit(
    data: &[f64],
    n_features: usize,
    targets: &[f64],
    kernel_type: &str,
    kernel_params: &[f64],
    noise: f64,
) -> Result<GPModel, JsValue> {
    gp_fit_impl(data, n_features, targets, kernel_type, kernel_params, noise)
        .map_err(|e| JsValue::from_str(&e.message))
}

// ============================================================
// Utility functions
// ============================================================

/// Compute a kernel between two feature vectors.
fn compute_kernel(x: &[f64], y: &[f64], kernel_type: &str, gamma: f64) -> f64 {
    match kernel_type {
        "rbf" => {
            let mut sq_dist = 0.0;
            for i in 0..x.len() {
                let d = x[i] - y[i];
                sq_dist += d * d;
            }
            (-gamma * sq_dist).exp()
        }
        "linear" => {
            let mut dot = 0.0;
            for i in 0..x.len() {
                dot += x[i] * y[i];
            }
            dot
        }
        _ => {
            // Default to RBF
            let mut sq_dist = 0.0;
            for i in 0..x.len() {
                let d = x[i] - y[i];
                sq_dist += d * d;
            }
            (-gamma * sq_dist).exp()
        }
    }
}

/// Cholesky decomposition: A = L * L^T
fn cholesky_decompose(a: &[f64], n: usize) -> Result<Vec<f64>, MlError> {
    let mut l = vec![0.0; n * n];

    for i in 0..n {
        for j in 0..=i {
            let mut sum = a[i * n + j];
            for k in 0..j {
                sum -= l[i * n + k] * l[j * n + k];
            }
            if i == j {
                if sum <= 1e-10 {
                    // Add small jitter for numerical stability
                    sum = 1e-10;
                }
                l[i * n + j] = sum.sqrt();
            } else {
                if l[j * n + j].abs() < 1e-10 {
                    l[i * n + j] = 0.0;
                } else {
                    l[i * n + j] = sum / l[j * n + j];
                }
            }
        }
    }

    Ok(l)
}

/// Solve L * L^T * x = b given the Cholesky factor L of A.
fn cholesky_solve(l: &[f64], original_a: &[f64], b: &[f64], n: usize) -> Vec<f64> {
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

    x
}

// ============================================================
// Tests
// ============================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_gp_perfect_fit() {
        // y = 2x + 1 with no noise — GP should interpolate exactly
        let data = vec![1.0, 2.0, 3.0, 4.0, 5.0];
        let targets = vec![3.0, 5.0, 7.0, 9.0, 11.0];

        let model = gp_fit_impl(&data, 1, &targets, "rbf", &[1.0], 1e-6).unwrap();

        // Predict on training data
        let pred = gp_predict_impl(&model, &data).unwrap();
        for i in 0..5 {
            assert!((pred.mean[i] - targets[i]).abs() < 0.5,
                "GP should interpolate training data: pred[{}] = {}, expected {}", i, pred.mean[i], targets[i]);
        }
        // Standard deviation on training data should be ~0
        for i in 0..5 {
            assert!(pred.std[i] < 1.0,
                "GP std on training data should be small: std[{}] = {}", i, pred.std[i]);
        }
    }

    #[test]
    fn test_gp_predict_uncertainty() {
        // Far from training data should have higher uncertainty
        let data = vec![0.0, 1.0];
        let targets = vec![0.0, 1.0];

        let model = gp_fit_impl(&data, 1, &targets, "rbf", &[1.0], 1e-6).unwrap();

        let near_pred = gp_predict_impl(&model, &[0.5]).unwrap();
        let far_pred = gp_predict_impl(&model, &[10.0]).unwrap();

        assert!(far_pred.std[0] > near_pred.std[0],
            "far prediction should have higher uncertainty: far_std={}, near_std={}",
            far_pred.std[0], near_pred.std[0]);
    }

    #[test]
    fn test_gp_linear_kernel() {
        // Linear kernel should work
        let data = vec![1.0, 2.0, 3.0, 4.0, 5.0];
        let targets = vec![3.0, 5.0, 7.0, 9.0, 11.0];

        let model = gp_fit_impl(&data, 1, &targets, "linear", &[], 1e-6).unwrap();
        let pred = gp_predict_impl(&model, &[2.5]).unwrap();

        assert!((pred.mean[0] - 6.0).abs() < 1.0,
            "linear kernel predict(2.5) should be ~6, got {}", pred.mean[0]);
    }

    #[test]
    fn test_gp_multidimensional() {
        // y = x1 + x2
        let data = vec![
            1.0, 0.0,
            0.0, 1.0,
            1.0, 1.0,
            2.0, 1.0,
            3.0, 2.0,
        ];
        let targets = vec![1.0, 1.0, 2.0, 3.0, 5.0];

        let model = gp_fit_impl(&data, 2, &targets, "rbf", &[0.5], 1e-6).unwrap();
        let pred = gp_predict_impl(&model, &[2.0, 3.0]).unwrap();

        assert!((pred.mean[0] - 5.0).abs() < 3.5,
            "predict(2,3) should be ~5, got {}", pred.mean[0]);
    }

    #[test]
 fn test_gp_errors() {
        // Empty data
        assert!(gp_fit_impl(&[], 1, &[], "rbf", &[], 0.1).is_err());
        // Mismatched lengths
        assert!(gp_fit_impl(&[1.0, 2.0], 1, &[], "rbf", &[], 0.1).is_err());
    }

    #[test]
    fn test_gp_ci_bounds() {
        let data = vec![0.0, 1.0, 2.0, 3.0];
        let targets = vec![0.5, 1.0, 1.5, 2.0];

        let model = gp_fit_impl(&data, 1, &targets, "rbf", &[1.0], 0.1).unwrap();
        let pred = gp_predict_impl(&model, &[1.5]).unwrap();

        assert!(pred.lower[0] < pred.mean[0]);
        assert!(pred.upper[0] > pred.mean[0]);
        assert!(pred.lower[0] < pred.upper[0]);
    }
}
