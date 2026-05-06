use wasm_bindgen::prelude::*;
use crate::error::MlError;
use crate::matrix::validate_matrix;

/// Elastic Net Regression - Combined L1 (Lasso) and L2 (Ridge) regularization
/// Loss: (1/(2n)) * ||y - Xw||^2 + alpha * l1_ratio * ||w||_1 + 0.5 * alpha * (1-l1_ratio) * ||w||_2^2
#[wasm_bindgen]
pub struct ElasticNetModel {
    coefficients: Vec<f64>,
    intercept: f64,
    n_features: usize,
    alpha: f64,
    l1_ratio: f64,
}

#[wasm_bindgen]
impl ElasticNetModel {
    #[wasm_bindgen(getter, js_name = "nFeatures")]
    pub fn n_features(&self) -> usize { self.n_features }

    #[wasm_bindgen(getter, js_name = "coefficients")]
    pub fn coef_js(&self) -> Vec<f64> { self.coefficients.clone() }

    #[wasm_bindgen(getter, js_name = "intercept")]
    pub fn intercept_js(&self) -> f64 { self.intercept }

    #[wasm_bindgen(getter, js_name = "alpha")]
    pub fn alpha_js(&self) -> f64 { self.alpha }

    #[wasm_bindgen(getter, js_name = "l1Ratio")]
    pub fn l1_ratio_js(&self) -> f64 { self.l1_ratio }

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
        format!(
            "ElasticNetModel(n_features={}, alpha={}, l1_ratio={})",
            self.n_features, self.alpha, self.l1_ratio
        )
    }
}

/// Soft-thresholding operator: S(z, gamma) = sign(z) * max(|z| - gamma, 0)
#[inline]
fn soft_threshold(z: f64, gamma: f64) -> f64 {
    if z > gamma {
        z - gamma
    } else if z < -gamma {
        z + gamma
    } else {
        0.0
    }
}

/// Elastic Net regression using coordinate descent.
///
/// Combines L1 (Lasso) and L2 (Ridge) regularization:
/// - l1_ratio = 0: pure Ridge
/// - l1_ratio = 1: pure Lasso
/// - 0 < l1_ratio < 1: Elastic Net (combination)
pub fn elastic_net_impl(
    data: &[f64],
    n_features: usize,
    targets: &[f64],
    alpha: f64,
    l1_ratio: f64,
    max_iter: usize,
    tol: f64,
) -> Result<ElasticNetModel, MlError> {
    let n = validate_matrix(data, n_features)?;
    if targets.len() != n {
        return Err(MlError::new("targets length must match number of samples"));
    }
    if !(0.0..=1.0).contains(&l1_ratio) {
        return Err(MlError::new("l1_ratio must be in [0, 1]"));
    }
    if alpha < 0.0 {
        return Err(MlError::new("alpha must be >= 0"));
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
    for &t in targets {
        mean_y += t;
    }
    mean_y /= n as f64;

    let mut centered_data = vec![0.0f64; data.len()];
    for i in 0..n {
        for f in 0..n_features {
            centered_data[i * n_features + f] = data[i * n_features + f] - mean_x[f];
        }
    }

    let centered_targets: Vec<f64> = targets.iter().map(|&t| t - mean_y).collect();

    // Coordinate descent
    let l1_penalty = alpha * l1_ratio;
    let l2_penalty = alpha * (1.0 - l1_ratio);

    let mut coefficients = vec![0.0f64; n_features];

    for _iter in 0..max_iter {
        let mut max_change: f64 = 0.0;

        for f in 0..n_features {
            let old_coef = coefficients[f];

            // Compute partial residual excluding feature f:
            // r_i = y_i - sum_{j != f} coef_j * x_ij
            // rho_f = (1/n) * sum_i x_if * r_i
            // This equals (1/n) * sum_i x_if * (y_i - Xw + coef_f * x_if)
            //        = (1/n) * sum_i x_if * residual_i + coef_f * norm_sq_f
            // But we compute it directly from the centered data and current coefficients.

            // Compute rho_f = (1/n) * X_f^T * (y - X * w + w_f * X_f)
            //              = (1/n) * X_f^T * y_centered - (1/n) * X_f^T * X_{-f} * w_{-f}
            // Using the approach: compute full prediction, add back current feature contribution
            let mut rho = 0.0;
            for i in 0..n {
                let mut pred_excl_f = 0.0;
                for j in 0..n_features {
                    if j != f {
                        pred_excl_f += coefficients[j] * centered_data[i * n_features + j];
                    }
                }
                rho += centered_data[i * n_features + f] * (centered_targets[i] - pred_excl_f);
            }
            rho /= n as f64;

            // Compute feature norm squared
            let mut norm_sq = 0.0;
            for i in 0..n {
                norm_sq += centered_data[i * n_features + f]
                    * centered_data[i * n_features + f];
            }
            norm_sq /= n as f64;

            if norm_sq < 1e-12 {
                coefficients[f] = 0.0;
                continue;
            }

            // Coordinate descent update with elastic net penalty
            // w_f = S(rho_f, l1_penalty) / (norm_sq + l2_penalty)
            coefficients[f] = soft_threshold(rho, l1_penalty) / (norm_sq + l2_penalty);

            let change = (coefficients[f] - old_coef).abs();
            max_change = max_change.max(change);
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

    Ok(ElasticNetModel {
        coefficients,
        intercept,
        n_features,
        alpha,
        l1_ratio,
    })
}

#[wasm_bindgen(js_name = "elasticNet")]
pub fn elastic_net(
    data: &[f64],
    n_features: usize,
    targets: &[f64],
    alpha: f64,
    l1_ratio: f64,
    max_iter: usize,
    tol: f64,
) -> Result<ElasticNetModel, JsError> {
    elastic_net_impl(data, n_features, targets, alpha, l1_ratio, max_iter, tol)
        .map_err(|e| JsError::new(&e.message))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_perfect_fit_linear() {
        // y = 2x, should fit perfectly with low regularization
        let data = vec![1.0, 2.0, 3.0, 4.0, 5.0];
        let targets = vec![2.0, 4.0, 6.0, 8.0, 10.0];

        let model =
            elastic_net_impl(&data, 1, &targets, 0.001, 0.5, 5000, 1e-8).unwrap();
        let preds = model.predict(&data);

        for (p, &t) in preds.iter().zip(&targets) {
            assert!(
                (p - t).abs() < 0.1,
                "prediction {} vs target {}",
                p,
                t
            );
        }
    }

    #[test]
    fn test_l1_ratio_zero_ridge_like() {
        // l1_ratio = 0 should behave like Ridge (no sparsity, all coefficients non-zero)
        let data = vec![
            1.0, 0.5, 0.1,
            2.0, 0.3, 0.2,
            3.0, 0.7, 0.3,
            4.0, 0.2, 0.4,
            5.0, 0.8, 0.5,
        ];
        let targets = vec![3.0, 5.0, 7.0, 9.0, 11.0];

        let model =
            elastic_net_impl(&data, 3, &targets, 0.1, 0.0, 5000, 1e-8).unwrap();

        // With l1_ratio=0 (pure Ridge), coefficients should generally be non-zero
        let non_zero = model
            .coefficients
            .iter()
            .filter(|&&c| c.abs() > 1e-10)
            .count();
        assert!(
            non_zero >= 2,
            "expected non-zero coefficients with l1_ratio=0, got {}",
            non_zero
        );
    }

    #[test]
    fn test_l1_ratio_one_lasso_like() {
        // l1_ratio = 1 should behave like Lasso (sparsity on irrelevant features)
        let data = vec![
            1.0, 0.0, 0.0,
            2.0, 0.0, 0.0,
            3.0, 0.0, 0.0,
            4.0, 0.0, 0.0,
            5.0, 0.0, 0.0,
        ];
        let targets = vec![2.0, 4.0, 6.0, 8.0, 10.0];

        // High alpha with l1_ratio=1 should force sparsity
        let model =
            elastic_net_impl(&data, 3, &targets, 5.0, 1.0, 5000, 1e-8).unwrap();

        // Irrelevant features (columns 1 and 2) should be zero
        assert!(
            model.coefficients[1].abs() < 1e-6,
            "feature 1 should be zero, got {}",
            model.coefficients[1]
        );
        assert!(
            model.coefficients[2].abs() < 1e-6,
            "feature 2 should be zero, got {}",
            model.coefficients[2]
        );
    }

    #[test]
    fn test_elastic_net_predictions_sensible() {
        // Multi-feature data with known relationship: y = x0 + x1
        let data = vec![
            1.0, 2.0,
            2.0, 4.0,
            3.0, 6.0,
        ];
        let targets = vec![3.0, 6.0, 9.0];

        let model =
            elastic_net_impl(&data, 2, &targets, 0.01, 0.5, 5000, 1e-8).unwrap();
        let preds = model.predict(&data);

        for (p, &t) in preds.iter().zip(&targets) {
            assert!(
                (p - t).abs() < 0.5,
                "prediction {} vs target {}",
                p,
                t
            );
        }
    }
}
