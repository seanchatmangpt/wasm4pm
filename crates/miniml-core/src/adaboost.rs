use wasm_bindgen::prelude::*;
use crate::error::MlError;
use crate::matrix::{validate_matrix, mat_get};

/// AdaBoost Classifier - Adaptive Boosting
/// Ensemble of weighted weak learners (decision stumps)
#[wasm_bindgen]
pub struct AdaBoostClassifier {
    stump_features: Vec<usize>,
    stump_thresholds: Vec<f64>,
    stump_predictions: Vec<f64>,  // -1 or 1 for left/right
    alphas: Vec<f64>,
    n_classes: usize,
    n_features: usize,
}

#[wasm_bindgen]
impl AdaBoostClassifier {
    #[wasm_bindgen(getter, js_name = "nEstimators")]
    pub fn n_estimators(&self) -> usize { self.stump_features.len() }

    #[wasm_bindgen(getter, js_name = "nFeatures")]
    pub fn n_features(&self) -> usize { self.n_features }

    /// Predict class labels
    #[wasm_bindgen]
    pub fn predict(&self, data: &[f64]) -> Vec<f64> {
        let n = data.len() / self.n_features;
        let mut result = Vec::with_capacity(n);

        for i in 0..n {
            let mut score = 0.0;

            for (stump_idx, &feature) in self.stump_features.iter().enumerate() {
                let val = data[i * self.n_features + feature];
                let threshold = self.stump_thresholds[stump_idx];
                let prediction = self.stump_predictions[stump_idx];

                let vote = if val <= threshold {
                    prediction
                } else {
                    -prediction
                };

                score += self.alphas[stump_idx] * vote;
            }

            result.push(if score > 0.0 { 1.0 } else { 0.0 });
        }

        result
    }

    /// Predict probabilities (sigmoid of weighted vote)
    #[wasm_bindgen(js_name = "predictProba")]
    pub fn predict_proba(&self, data: &[f64]) -> Vec<f64> {
        let n = data.len() / self.n_features;
        let mut result = Vec::with_capacity(n * 2);

        for i in 0..n {
            let mut score = 0.0;

            for (stump_idx, &feature) in self.stump_features.iter().enumerate() {
                let val = data[i * self.n_features + feature];
                let threshold = self.stump_thresholds[stump_idx];
                let prediction = self.stump_predictions[stump_idx];

                let vote = if val <= threshold {
                    prediction
                } else {
                    -prediction
                };

                score += self.alphas[stump_idx] * vote;
            }

            // Sigmoid for probability
            let prob_class_1 = 1.0 / (1.0 + (-score).exp());
            result.push(1.0 - prob_class_1);
            result.push(prob_class_1);
        }

        result
    }

    #[wasm_bindgen(js_name = "toString")]
    pub fn to_string_js(&self) -> String {
        format!("AdaBoostClassifier(estimators={}, features={})",
                self.stump_features.len(), self.n_features)
    }
}

/// AdaBoost M1 implementation with decision stumps
pub fn adaboost_impl(
    data: &[f64],
    n_features: usize,
    labels: &[f64],
    n_estimators: usize,
    learning_rate: f64,
) -> Result<AdaBoostClassifier, MlError> {
    let n = validate_matrix(data, n_features)?;
    if labels.len() != n {
        return Err(MlError::new("labels length must match number of samples"));
    }
    if n_estimators == 0 {
        return Err(MlError::new("n_estimators must be > 0"));
    }

    // Convert labels to -1/1
    let y: Vec<f64> = labels.iter().map(|&l| if l > 0.5 { 1.0 } else { -1.0 }).collect();

    // Initialize sample weights uniformly
    let mut weights = vec![1.0 / n as f64; n];

    let mut stump_features = Vec::new();
    let mut stump_thresholds = Vec::new();
    let mut stump_predictions = Vec::new();
    let mut alphas = Vec::new();

    for _ in 0..n_estimators {
        // Find best decision stump
        let (best_feature, best_threshold, best_pred, min_error) =
            find_best_stump(data, n_features, &y, &weights);

        if min_error >= 0.5 {
            break;  // Can't improve further
        }

        // Compute stump weight (alpha)
        let alpha = learning_rate * 0.5 * ((1.0 - min_error) / (min_error + 1e-10)).ln();
        alphas.push(alpha);

        stump_features.push(best_feature);
        stump_thresholds.push(best_threshold);
        stump_predictions.push(best_pred);

        // Update sample weights
        let mut sum_weights = 0.0;
        for i in 0..n {
            let val = data[i * n_features + best_feature];
            let prediction = if val <= best_threshold { best_pred } else { -best_pred };
            let exponent = alpha * y[i] * prediction;
            weights[i] *= exponent.exp();
            sum_weights += weights[i];
        }

        // Normalize weights
        for w in &mut weights {
            *w /= sum_weights;
        }
    }

    Ok(AdaBoostClassifier {
        stump_features,
        stump_thresholds,
        stump_predictions,
        alphas,
        n_classes: 2,
        n_features,
    })
}

/// Find best decision stump (single-feature threshold)
fn find_best_stump(
    data: &[f64],
    n_features: usize,
    y: &[f64],
    weights: &[f64],
) -> (usize, f64, f64, f64) {
    let n = y.len();
    let mut best_feature = 0;
    let mut best_threshold = 0.0;
    let mut best_pred = 1.0;
    let mut min_error = f64::INFINITY;
    let total_weight: f64 = weights.iter().sum();

    for f in 0..n_features {
        // Try each sample as threshold
        for i in 0..n {
            let threshold = data[i * n_features + f];

            // Predict -1 for <= threshold, 1 for >
            let mut error_pos = 0.0;
            let mut error_neg = 0.0;

            for j in 0..n {
                let val = data[j * n_features + f];
                let prediction = if val <= threshold { -1.0 } else { 1.0 };

                if prediction != y[j] {
                    error_pos += weights[j];
                }

                let prediction_neg = -prediction;
                if prediction_neg != y[j] {
                    error_neg += weights[j];
                }
            }

            if error_pos < min_error {
                min_error = error_pos;
                best_feature = f;
                best_threshold = threshold;
                best_pred = -1.0;  // Left predicts -1
            }

            if error_neg < min_error {
                min_error = error_neg;
                best_feature = f;
                best_threshold = threshold;
                best_pred = 1.0;  // Left predicts 1
            }
        }
    }

    (best_feature, best_threshold, best_pred, min_error / total_weight)
}

#[wasm_bindgen(js_name = "adaboostClassify")]
pub fn adaboost_classify(
    data: &[f64],
    n_features: usize,
    labels: &[f64],
    n_estimators: usize,
    learning_rate: f64,
) -> Result<AdaBoostClassifier, JsError> {
    adaboost_impl(data, n_features, labels, n_estimators, learning_rate)
        .map_err(|e| JsError::new(&e.message))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_adaboost_binary() {
        let data = vec![
            0.0, 0.0,
            1.0, 0.0,
            0.0, 1.0,
            10.0, 10.0,
        ];
        let labels = vec![0.0, 0.0, 0.0, 1.0];

        let model = adaboost_impl(&data, 2, &labels, 50, 1.0).unwrap();
        let preds = model.predict(&data);

        // Should classify correctly
        assert_eq!(preds[0], 0.0);
        assert_eq!(preds[1], 0.0);
        assert_eq!(preds[2], 0.0);
        assert_eq!(preds[3], 1.0);
    }

    #[test]
    fn test_adaboost_probas() {
        let data = vec![0.0, 10.0];
        let labels = vec![0.0, 1.0];

        let model = adaboost_impl(&data, 1, &labels, 20, 1.0).unwrap();
        let probas = model.predict_proba(&data);

        // Should return 2 values per sample
        assert_eq!(probas.len(), 4);
        // Probabilities should sum to 1
        assert!((probas[0] + probas[1] - 1.0).abs() < 1e-10);
        assert!((probas[2] + probas[3] - 1.0).abs() < 1e-10);
    }
}
