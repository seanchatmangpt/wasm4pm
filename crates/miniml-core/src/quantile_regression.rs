use wasm_bindgen::prelude::*;
use crate::error::MlError;
use crate::matrix::validate_matrix;

/// Quantile Regression - Predicts conditional quantiles via pinball loss.
///
/// Pinball loss: L(y, f) = quantile * max(y - f, 0) + (1 - quantile) * max(f - y, 0)
/// - quantile = 0.5: median regression (least absolute deviations)
/// - quantile = 0.25: 25th percentile
/// - quantile = 0.75: 75th percentile
#[wasm_bindgen]
pub struct QuantileRegressionModel {
    coefficients: Vec<f64>,
    intercept: f64,
    n_features: usize,
    quantile: f64,
}

#[wasm_bindgen]
impl QuantileRegressionModel {
    #[wasm_bindgen(getter, js_name = "nFeatures")]
    pub fn n_features(&self) -> usize { self.n_features }

    #[wasm_bindgen(getter, js_name = "coefficients")]
    pub fn coef_js(&self) -> Vec<f64> { self.coefficients.clone() }

    #[wasm_bindgen(getter, js_name = "intercept")]
    pub fn intercept_js(&self) -> f64 { self.intercept }

    #[wasm_bindgen(getter, js_name = "quantile")]
    pub fn quantile_js(&self) -> f64 { self.quantile }

    /// Predict target values at the fitted quantile.
    #[wasm_bindgen]
    pub fn predict(&self, data: &[f64]) -> Vec<f64> {
        quantile_regression_predict_impl(self, data).unwrap_or_default()
    }

    #[wasm_bindgen(js_name = "toString")]
    pub fn to_string_js(&self) -> String {
        format!(
            "QuantileRegressionModel(n_features={}, quantile={})",
            self.n_features, self.quantile
        )
    }
}

/// Quantile regression using gradient descent on pinball loss.
///
/// The pinball loss is piecewise linear, making it robust to outliers.
/// For quantile = 0.5, this is equivalent to least absolute deviations (LAD).
///
/// Pinball loss: L(r) = quantile * r if r >= 0, (quantile - 1) * r if r < 0
/// where r = y - (w.x + b)
///
/// Subgradient w.r.t. w:
///   -quantile * x    if r > 0  (under-prediction)
///   (1-quantile) * x if r < 0  (over-prediction)
///   0                if r = 0
pub fn quantile_regression_fit_impl(
    data: &[f64],
    n_features: usize,
    targets: &[f64],
    quantile: f64,
    max_iter: usize,
    lr: f64,
    tol: f64,
) -> Result<QuantileRegressionModel, MlError> {
    let n = validate_matrix(data, n_features)?;
    if targets.len() != n {
        return Err(MlError::new("targets length must match number of samples"));
    }
    if !(0.0..=1.0).contains(&quantile) {
        return Err(MlError::new("quantile must be in [0, 1]"));
    }
    if lr <= 0.0 {
        return Err(MlError::new("learning rate must be > 0"));
    }
    if tol < 0.0 {
        return Err(MlError::new("tolerance must be >= 0"));
    }

    // Initialize coefficients to zero
    let mut coefficients = vec![0.0f64; n_features];
    let mut intercept = 0.0f64;

    let mut prev_loss = f64::MAX;

    for iter in 0..max_iter {
        // Compute gradients for each sample and accumulate
        let mut grad_coef = vec![0.0f64; n_features];
        let mut grad_intercept = 0.0f64;
        let mut total_loss = 0.0;

        for i in 0..n {
            // Compute prediction
            let mut pred = intercept;
            for f in 0..n_features {
                pred += coefficients[f] * data[i * n_features + f];
            }

            let residual = targets[i] - pred;

            // Pinball loss gradient:
            // d/dw L(y, f(x)) =
            //   -quantile * x    if residual > 0  (under-prediction)
            //   (1-quantile) * x if residual < 0  (over-prediction)
            //   0               if residual = 0
            let (loss_grad, pinball_val) = if residual > 0.0 {
                (-quantile, quantile * residual)
            } else if residual < 0.0 {
                (1.0 - quantile, (1.0 - quantile) * (-residual))
            } else {
                (0.0, 0.0)
            };

            total_loss += pinball_val;

            for f in 0..n_features {
                grad_coef[f] += loss_grad * data[i * n_features + f];
            }
            grad_intercept += loss_grad;
        }

        total_loss /= n as f64;

        // Check convergence
        let loss_change = (prev_loss - total_loss).abs();
        if iter > 0 && loss_change < tol {
            break;
        }
        prev_loss = total_loss;

        // Decaying learning rate
        let eta = lr / (1.0 + 0.001 * iter as f64);

        // Update coefficients and intercept
        for f in 0..n_features {
            coefficients[f] -= eta * grad_coef[f] / n as f64;
        }
        intercept -= eta * grad_intercept / n as f64;
    }

    Ok(QuantileRegressionModel {
        coefficients,
        intercept,
        n_features,
        quantile,
    })
}

/// Predict using a QuantileRegressionModel.
pub fn quantile_regression_predict_impl(
    model: &QuantileRegressionModel,
    data: &[f64],
) -> Result<Vec<f64>, MlError> {
    if data.is_empty() {
        return Ok(Vec::new());
    }
    if data.len() % model.n_features != 0 {
        return Err(MlError::new("data length must be divisible by n_features"));
    }

    let n = data.len() / model.n_features;
    let mut result = Vec::with_capacity(n);

    for i in 0..n {
        let mut pred = model.intercept;
        for f in 0..model.n_features {
            pred += model.coefficients[f] * data[i * model.n_features + f];
        }
        result.push(pred);
    }

    Ok(result)
}

#[wasm_bindgen(js_name = "quantileRegressionFit")]
pub fn quantile_regression_fit(
    data: &[f64],
    n_features: usize,
    targets: &[f64],
    quantile: f64,
    max_iter: usize,
    lr: f64,
    tol: f64,
) -> Result<QuantileRegressionModel, JsValue> {
    quantile_regression_fit_impl(data, n_features, targets, quantile, max_iter, lr, tol)
        .map_err(|e| JsValue::from_str(&e.message))
}

#[wasm_bindgen(js_name = "quantileRegressionPredict")]
pub fn quantile_regression_predict(
    model: &QuantileRegressionModel,
    data: &[f64],
) -> Result<Vec<f64>, JsValue> {
    quantile_regression_predict_impl(model, data)
        .map_err(|e| JsValue::from_str(&e.message))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_quantile_median() {
        // quantile=0.5 on linear data should approximate median
        let data = vec![1.0, 2.0, 3.0, 4.0, 5.0];
        let targets = vec![2.0, 4.0, 6.0, 8.0, 10.0];

        let model = quantile_regression_fit_impl(&data, 1, &targets, 0.5, 5000, 0.01, 1e-10).unwrap();
        let preds = quantile_regression_predict_impl(&model, &data).unwrap();

        // Median regression on perfectly linear data should be close to the line
        for (p, &t) in preds.iter().zip(&targets) {
            assert!(
                (p - t).abs() < 1.0,
                "median prediction {} vs target {}",
                p, t
            );
        }
    }

    #[test]
    fn test_quantile_25() {
        // quantile=0.25 should be below median predictions
        let data = vec![
            1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0,
        ];
        let targets = vec![3.0, 5.0, 4.0, 7.0, 6.0, 9.0, 8.0, 11.0, 10.0, 13.0];

        let model_q25 = quantile_regression_fit_impl(&data, 1, &targets, 0.25, 5000, 0.01, 1e-10).unwrap();
        let model_q50 = quantile_regression_fit_impl(&data, 1, &targets, 0.50, 5000, 0.01, 1e-10).unwrap();

        let preds_q25 = quantile_regression_predict_impl(&model_q25, &data).unwrap();
        let preds_q50 = quantile_regression_predict_impl(&model_q50, &data).unwrap();

        // For most samples, q25 predictions should be <= q50 predictions
        let mut below_count = 0;
        for i in 0..preds_q25.len() {
            if preds_q25[i] <= preds_q50[i] + 0.5 {
                below_count += 1;
            }
        }
        assert!(
            below_count >= preds_q25.len() * 6 / 10,
            "q25 should be below median in most predictions, got {}/{}",
            below_count, preds_q25.len()
        );
    }

    #[test]
    fn test_quantile_75() {
        // quantile=0.75 should be above median predictions
        let data = vec![
            1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0,
        ];
        let targets = vec![3.0, 5.0, 4.0, 7.0, 6.0, 9.0, 8.0, 11.0, 10.0, 13.0];

        let model_q50 = quantile_regression_fit_impl(&data, 1, &targets, 0.50, 5000, 0.01, 1e-10).unwrap();
        let model_q75 = quantile_regression_fit_impl(&data, 1, &targets, 0.75, 5000, 0.01, 1e-10).unwrap();

        let preds_q50 = quantile_regression_predict_impl(&model_q50, &data).unwrap();
        let preds_q75 = quantile_regression_predict_impl(&model_q75, &data).unwrap();

        // For most samples, q75 predictions should be >= q50 predictions
        let mut above_count = 0;
        for i in 0..preds_q75.len() {
            if preds_q75[i] >= preds_q50[i] - 0.5 {
                above_count += 1;
            }
        }
        assert!(
            above_count >= preds_q75.len() * 6 / 10,
            "q75 should be above median in most predictions, got {}/{}",
            above_count, preds_q75.len()
        );
    }
}
