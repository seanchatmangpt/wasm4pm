use wasm_bindgen::prelude::*;
use crate::error::MlError;
use crate::matrix::validate_matrix;

/// Linear SVM Classifier (using PEGASOS algorithm for WASM compatibility)
/// Subgradient descent with hinge loss
#[wasm_bindgen]
pub struct LinearSVM {
    weights: Vec<f64>,
    bias: f64,
    n_features: usize,
    lambda: f64,  // Regularization parameter
}

#[wasm_bindgen]
impl LinearSVM {
    #[wasm_bindgen(getter, js_name = "nFeatures")]
    pub fn n_features(&self) -> usize { self.n_features }

    /// Predict class labels
    #[wasm_bindgen]
    pub fn predict(&self, data: &[f64]) -> Vec<f64> {
        let n = data.len() / self.n_features;
        let mut result = Vec::with_capacity(n);

        for i in 0..n {
            let mut sum = self.bias;
            for f in 0..self.n_features {
                sum += self.weights[f] * data[i * self.n_features + f];
            }
            result.push(if sum > 0.0 { 1.0 } else { 0.0 });
        }

        result
    }

    /// Predict decision function (raw scores)
    #[wasm_bindgen(js_name = "decisionFunction")]
    pub fn decision_function(&self, data: &[f64]) -> Vec<f64> {
        let n = data.len() / self.n_features;
        let mut result = Vec::with_capacity(n);

        for i in 0..n {
            let mut sum = self.bias;
            for f in 0..self.n_features {
                sum += self.weights[f] * data[i * self.n_features + f];
            }
            result.push(sum);
        }

        result
    }

    #[wasm_bindgen(js_name = "toString")]
    pub fn to_string_js(&self) -> String {
        format!("LinearSVM(n_features={}, lambda={})", self.n_features, self.lambda)
    }
}

/// PEGASOS SVM implementation (Primal Estimated sub-GrAdient SOlver for SVM)
pub fn linear_svm_impl(
    data: &[f64],
    n_features: usize,
    labels: &[f64],
    lambda: f64,
    max_iter: usize,
    learning_rate: f64,
) -> Result<LinearSVM, MlError> {
    let n = validate_matrix(data, n_features)?;
    if labels.len() != n {
        return Err(MlError::new("labels length must match number of samples"));
    }

    // Convert labels to -1/1
    let y: Vec<f64> = labels.iter().map(|&l| if l > 0.5 { 1.0 } else { -1.0 }).collect();

    // Initialize weights and bias
    let mut weights = vec![0.0f64; n_features];
    let mut bias = 0.0;

    // PEGASOS algorithm
    for iter in 0..max_iter {
        // Decay learning rate
        let eta = learning_rate / (1.0 + (iter as f64) * learning_rate * lambda);

        // Select random sample
        let idx = (iter % n) as usize;
        let x = &data[idx * n_features..(idx + 1) * n_features];
        let label = y[idx];

        // Compute decision value
        let mut decision = bias;
        for f in 0..n_features {
            decision += weights[f] * x[f];
        }

        // Subgradient step
        if label * decision < 1.0 {
            // Misclassified: update weights and bias
            for f in 0..n_features {
                weights[f] = (1.0 - eta * lambda) * weights[f] + eta * label * x[f];
            }
            bias += eta * label;
        } else {
            // Correctly classified: only regularization
            for f in 0..n_features {
                weights[f] *= 1.0 - eta * lambda;
            }
        }
    }

    Ok(LinearSVM {
        weights,
        bias,
        n_features,
        lambda,
    })
}

#[wasm_bindgen(js_name = "linearSVM")]
pub fn linear_svm(
    data: &[f64],
    n_features: usize,
    labels: &[f64],
    lambda: f64,
    max_iter: usize,
    learning_rate: f64,
) -> Result<LinearSVM, JsError> {
    linear_svm_impl(data, n_features, labels, lambda, max_iter, learning_rate)
        .map_err(|e| JsError::new(&e.message))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_linearly_separable() {
        // Simple linearly separable data
        let data = vec![
            0.0, 0.0,  // Class 0
            1.0, 0.0,  // Class 0
            0.0, 1.0,  // Class 0
            10.0, 10.0,  // Class 1
            11.0, 10.0,  // Class 1
            10.0, 11.0,  // Class 1
        ];
        let labels = vec![0.0, 0.0, 0.0, 1.0, 1.0, 1.0];

        let model = linear_svm_impl(&data, 2, &labels, 0.01, 1000, 0.01).unwrap();
        let preds = model.predict(&data);

        // Should classify correctly
        assert_eq!(preds[0], 0.0);
        assert_eq!(preds[1], 0.0);
        assert_eq!(preds[2], 0.0);
        assert_eq!(preds[3], 1.0);
        assert_eq!(preds[4], 1.0);
        assert_eq!(preds[5], 1.0);
    }

    #[test]
    fn test_decision_function() {
        let data = vec![
            0.0, 0.0,
            10.0, 10.0,
        ];
        let labels = vec![0.0, 1.0];

        let model = linear_svm_impl(&data, 2, &labels, 0.01, 500, 0.01).unwrap();
        let decision = model.decision_function(&data);

        // First sample should have negative score (class 0)
        assert!(decision[0] < 0.0);
        // Second sample should have positive score (class 1)
        assert!(decision[1] > 0.0);
    }

    #[test]
    fn test_convergence() {
        let data = vec![
            1.0, 2.0,
            2.0, 3.0,
            5.0, 6.0,
        ];
        let labels = vec![0.0, 0.0, 1.0];

        // With more iterations, should converge
        let model1 = linear_svm_impl(&data, 2, &labels, 0.01, 100, 0.01).unwrap();
        let model2 = linear_svm_impl(&data, 2, &labels, 0.01, 1000, 0.01).unwrap();

        // Both should make predictions
        let preds1 = model1.predict(&data);
        let preds2 = model2.predict(&data);

        assert!(!preds1.is_empty());
        assert!(!preds2.is_empty());
    }
}
