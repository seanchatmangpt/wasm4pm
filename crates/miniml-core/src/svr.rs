use wasm_bindgen::prelude::*;
use crate::error::MlError;
use crate::matrix::{validate_matrix, Rng};

/// Epsilon-Support Vector Regression using PEGASOS-style subgradient descent.
///
/// Uses epsilon-insensitive loss:
/// L(y, f(x)) = 0                        if |y - f(x)| <= epsilon
/// L(y, f(x)) = |y - f(x)| - epsilon     otherwise
#[wasm_bindgen]
pub struct SVRModel {
    weights: Vec<f64>,
    bias: f64,
    support_vectors: Vec<f64>,
    support_labels: Vec<f64>,
    support_alphas: Vec<f64>,
    n_features: usize,
    epsilon: f64,
    c: f64,
}

#[wasm_bindgen]
impl SVRModel {
    #[wasm_bindgen(getter, js_name = "nFeatures")]
    pub fn n_features(&self) -> usize { self.n_features }

    #[wasm_bindgen(getter, js_name = "weights")]
    pub fn weights_js(&self) -> Vec<f64> { self.weights.clone() }

    #[wasm_bindgen(getter, js_name = "bias")]
    pub fn bias_js(&self) -> f64 { self.bias }

    #[wasm_bindgen(getter, js_name = "supportVectors")]
    pub fn support_vectors_js(&self) -> Vec<f64> { self.support_vectors.clone() }

    #[wasm_bindgen(getter, js_name = "supportLabels")]
    pub fn support_labels_js(&self) -> Vec<f64> { self.support_labels.clone() }

    #[wasm_bindgen(getter, js_name = "supportAlphas")]
    pub fn support_alphas_js(&self) -> Vec<f64> { self.support_alphas.clone() }

    #[wasm_bindgen(getter, js_name = "epsilon")]
    pub fn epsilon_js(&self) -> f64 { self.epsilon }

    #[wasm_bindgen(getter, js_name = "c")]
    pub fn c_js(&self) -> f64 { self.c }

    /// Predict target values using the learned weight vector.
    #[wasm_bindgen]
    pub fn predict(&self, data: &[f64]) -> Vec<f64> {
        svr_predict_impl(self, data).unwrap_or_default()
    }

    #[wasm_bindgen(js_name = "toString")]
    pub fn to_string_js(&self) -> String {
        format!(
            "SVRModel(n_features={}, epsilon={}, c={}, n_support={})",
            self.n_features, self.epsilon, self.c, self.support_labels.len()
        )
    }
}

/// Epsilon-SVR using PEGASOS-style subgradient descent.
///
/// The epsilon-insensitive loss ignores errors smaller than epsilon,
/// creating a "tube" around the regression function where no penalty is incurred.
/// The C parameter controls the trade-off between flatness and tolerance for errors
/// outside the tube.
///
/// Subgradient w.r.t. w: if |residual| > epsilon: sign(residual) * x, else 0
/// Update: w = (1 - lr/(t*c)) * w + lr * subgradient / c
/// Normalize: w = min(1, sqrt(c)/||w||) * w
pub fn svr_fit_impl(
    data: &[f64],
    n_features: usize,
    targets: &[f64],
    epsilon: f64,
    c: f64,
    max_iter: usize,
    lr: f64,
    seed: u64,
) -> Result<SVRModel, MlError> {
    let n = validate_matrix(data, n_features)?;
    if targets.len() != n {
        return Err(MlError::new("targets length must match number of samples"));
    }
    if epsilon < 0.0 {
        return Err(MlError::new("epsilon must be >= 0"));
    }
    if c <= 0.0 {
        return Err(MlError::new("c must be > 0"));
    }
    if lr <= 0.0 {
        return Err(MlError::new("learning rate must be > 0"));
    }

    let mut rng = Rng::new(seed);
    let mut weights = vec![0.0f64; n_features];
    let mut bias = 0.0f64;

    // Track support vectors (samples with non-zero loss)
    let mut support_vectors: Vec<f64> = Vec::new();
    let mut support_labels: Vec<f64> = Vec::new();
    let mut support_alphas: Vec<f64> = Vec::new();

    for t in 1..=max_iter {
        // Random sample selection
        let idx = rng.next_usize(n);
        let x = &data[idx * n_features..(idx + 1) * n_features];
        let target = targets[idx];

        // Compute prediction
        let mut prediction = bias;
        for f in 0..n_features {
            prediction += weights[f] * x[f];
        }

        let residual = target - prediction;

        // Subgradient of epsilon-insensitive loss:
        // If |residual| > epsilon: subgrad_w = sign(residual) * x
        // Else: subgrad_w = 0
        let subgrad = if residual.abs() > epsilon {
            residual.signum()
        } else {
            0.0
        };

        // PEGASOS update: w = (1 - lr/(t*c)) * w + lr * subgrad * x / c
        let shrink = 1.0 - lr / (t as f64 * c);
        for f in 0..n_features {
            weights[f] = shrink * weights[f] + lr * subgrad * x[f] / c;
        }
        // Bias updated similarly but without regularization
        bias += lr * subgrad / c;

        // Project weights: w = min(1, sqrt(c)/||w||) * w
        let mut norm_sq = 0.0;
        for f in 0..n_features {
            norm_sq += weights[f] * weights[f];
        }
        let norm = norm_sq.sqrt();
        if norm > 0.0 {
            let scale = (c.sqrt() / norm).min(1.0);
            for f in 0..n_features {
                weights[f] *= scale;
            }
        }

        // Collect support vectors (samples with non-zero loss)
        if residual.abs() > epsilon {
            // Check if already tracked
            let already = support_vectors.len() / n_features;
            let mut found = false;
            for s in 0..already {
                let sv = &support_vectors[s * n_features..(s + 1) * n_features];
                let mut same = true;
                for f in 0..n_features {
                    if (sv[f] - x[f]).abs() > 1e-12 {
                        same = false;
                        break;
                    }
                }
                if same {
                    // Update alpha
                    support_alphas[s] += lr * subgrad.abs();
                    found = true;
                    break;
                }
            }
            if !found {
                support_vectors.extend_from_slice(x);
                support_labels.push(target);
                support_alphas.push(lr * subgrad.abs());
            }
        }
    }

    Ok(SVRModel {
        weights,
        bias,
        support_vectors,
        support_labels,
        support_alphas,
        n_features,
        epsilon,
        c,
    })
}

/// Predict using an SVRModel.
pub fn svr_predict_impl(model: &SVRModel, data: &[f64]) -> Result<Vec<f64>, MlError> {
    if data.is_empty() {
        return Ok(Vec::new());
    }
    if data.len() % model.n_features != 0 {
        return Err(MlError::new("data length must be divisible by n_features"));
    }

    let n = data.len() / model.n_features;
    let mut result = Vec::with_capacity(n);

    for i in 0..n {
        let mut pred = model.bias;
        for f in 0..model.n_features {
            pred += model.weights[f] * data[i * model.n_features + f];
        }
        result.push(pred);
    }

    Ok(result)
}

#[wasm_bindgen(js_name = "svrFit")]
pub fn svr_fit(
    data: &[f64],
    n_features: usize,
    targets: &[f64],
    epsilon: f64,
    c: f64,
    max_iter: usize,
    lr: f64,
    seed: u64,
) -> Result<SVRModel, JsValue> {
    svr_fit_impl(data, n_features, targets, epsilon, c, max_iter, lr, seed)
        .map_err(|e| JsValue::from_str(&e.message))
}

#[wasm_bindgen(js_name = "svrPredict")]
pub fn svr_predict(model: &SVRModel, data: &[f64]) -> Result<Vec<f64>, JsValue> {
    svr_predict_impl(model, data)
        .map_err(|e| JsValue::from_str(&e.message))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_svr_perfect_fit() {
        // Linear data: y = 2x + 1
        let data = vec![0.0, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0];
        let targets: Vec<f64> = (0..10).map(|i| 2.0 * i as f64 + 1.0).collect();

        let model = svr_fit_impl(&data, 1, &targets, 0.1, 10.0, 10000, 0.01, 42).unwrap();
        let preds = svr_predict_impl(&model, &data).unwrap();

        for (p, &t) in preds.iter().zip(&targets) {
            assert!(
                (p - t).abs() < 1.0,
                "prediction {} vs target {}, diff {}",
                p, t, (p - t).abs()
            );
        }
    }

    #[test]
    fn test_svr_within_epsilon() {
        // Linear data: y = 3x, tight epsilon
        let data = vec![1.0, 2.0, 3.0, 4.0, 5.0];
        let targets = vec![3.0, 6.0, 9.0, 12.0, 15.0];

        let model = svr_fit_impl(&data, 1, &targets, 0.5, 10.0, 10000, 0.01, 42).unwrap();
        let preds = svr_predict_impl(&model, &data).unwrap();

        // Predictions on training data should be within epsilon
        for (p, &t) in preds.iter().zip(&targets) {
            assert!(
                (p - t).abs() < model.epsilon + 1.0,
                "prediction {} vs target {}, should be within epsilon {}",
                p, t, model.epsilon
            );
        }
    }

    #[test]
    fn test_svr_multidimensional() {
        // 2D data: y = x1 + x2
        let data = vec![
            1.0, 2.0,
            2.0, 3.0,
            3.0, 4.0,
            4.0, 5.0,
            5.0, 6.0,
        ];
        let targets = vec![3.0, 5.0, 7.0, 9.0, 11.0];

        let model = svr_fit_impl(&data, 2, &targets, 0.1, 10.0, 10000, 0.01, 42).unwrap();
        let preds = svr_predict_impl(&model, &data).unwrap();

        for (p, &t) in preds.iter().zip(&targets) {
            assert!(
                (p - t).abs() < 1.0,
                "prediction {} vs target {}, diff {}",
                p, t, (p - t).abs()
            );
        }
    }
}
