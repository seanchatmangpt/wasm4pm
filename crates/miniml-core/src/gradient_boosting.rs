use wasm_bindgen::prelude::*;
use crate::error::MlError;
use crate::matrix::{validate_matrix, mat_get, Rng};
use crate::decision_tree::{decision_tree_impl, DecisionTreeModel};

/// Gradient Boosting Classifier (XGBoost/LightGBM-style)
/// Sequential ensemble of weak learners (decision stumps) correcting previous errors
#[wasm_bindgen]
pub struct GradientBoostingClassifier {
    trees: Vec<DecisionTreeModel>,
    n_features: usize,
    n_classes: usize,
    learning_rate: f64,
    max_depth: usize,
}

#[wasm_bindgen]
impl GradientBoostingClassifier {
    #[wasm_bindgen(getter, js_name = "nTrees")]
    pub fn n_trees(&self) -> usize { self.trees.len() }

    #[wasm_bindgen(getter, js_name = "nFeatures")]
    pub fn n_features(&self) -> usize { self.n_features }

    #[wasm_bindgen(getter, js_name = "learningRate")]
    pub fn learning_rate(&self) -> f64 { self.learning_rate }

    #[wasm_bindgen]
    pub fn predict(&self, data: &[f64]) -> Vec<f64> {
        let n = data.len() / self.n_features;
        let mut result = Vec::with_capacity(n);

        for i in 0..n {
            // Sum predictions from all trees (using predict_single to avoid allocation)
            let mut scores = vec![0.0f64; self.n_classes];
            for tree in &self.trees {
                let pred = tree.predict_single(&data[i * self.n_features..(i + 1) * self.n_features]) as usize;
                if pred < self.n_classes {
                    scores[pred] += 1.0;
                }
            }
            // Find class with max votes
            let (best_class, _) = scores.iter().enumerate()
                .max_by_key(|(_, &s)| s.to_bits())
                .unwrap();
            result.push(best_class as f64);
        }

        result
    }

    #[wasm_bindgen(js_name = "predictProba")]
    pub fn predict_proba(&self, data: &[f64]) -> Vec<f64> {
        let n = data.len() / self.n_features;
        let mut result = Vec::with_capacity(n * self.n_classes);

        for i in 0..n {
            let mut scores = vec![0.0f64; self.n_classes];
            for tree in &self.trees {
                let pred = tree.predict_single(&data[i * self.n_features..(i + 1) * self.n_features]) as usize;
                if pred < self.n_classes {
                    scores[pred] += 1.0;
                }
            }
            // Softmax
            let max_score = scores.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
            let sum_exp: f64 = scores.iter().map(|s| (s - max_score).exp()).sum();
            for s in &scores {
                result.push(((s - max_score).exp()) / sum_exp);
            }
        }

        result
    }

    #[wasm_bindgen(js_name = "toString")]
    pub fn to_string_js(&self) -> String {
        format!("GradientBoostingClassifier(trees={}, features={}, lr={})",
            self.trees.len(), self.n_features, self.learning_rate)
    }
}

pub fn gradient_boosting_impl(
    data: &[f64],
    n_features: usize,
    labels: &[f64],
    n_trees: usize,
    max_depth: usize,
    learning_rate: f64,
) -> Result<GradientBoostingClassifier, MlError> {
    let n = validate_matrix(data, n_features)?;
    if labels.len() != n {
        return Err(MlError::new("labels length must match number of samples"));
    }
    if n_trees == 0 {
        return Err(MlError::new("n_trees must be > 0"));
    }

    // Find unique classes
    let mut classes: Vec<f64> = labels.iter().copied().collect();
    classes.sort_unstable_by(|a, b| a.partial_cmp(b).unwrap());
    classes.dedup();
    let n_classes = classes.len();

    // Initialize with equal weights
    let mut sample_weights: Vec<f64> = vec![1.0; n];
    let mut residual_labels = labels.to_vec();
    let mut trees = Vec::new();

    for _ in 0..n_trees {
        // Fit tree to current residuals
        let tree = decision_tree_impl(data, n_features, &residual_labels, max_depth, 2, true)?;

        // Update residuals (gradient: move in direction that reduces loss)
        // For classification: subtract predicted class probability from residual
        let predictions = tree.predict(data);
        for j in 0..n {
            let pred_class = predictions[j] as usize;
            if pred_class < n_classes {
                // Simple: subtract 1.0 from the predicted class, add to true class
                let actual_class = residual_labels[j] as usize;
                if actual_class < n_classes {
                    residual_labels[j] = if pred_class == actual_class {
                        residual_labels[j] - learning_rate
                    } else {
                        residual_labels[j] + learning_rate
                    };
                }
            }
        }

        trees.push(tree);

        // Check if residuals are near zero
        let max_residual: f64 = residual_labels.iter().map(|r| r.abs()).fold(0.0, f64::max);
        if max_residual < 0.01 {
            break;
        }
    }

    Ok(GradientBoostingClassifier {
        trees,
        n_features,
        n_classes,
        learning_rate,
        max_depth,
    })
}

#[wasm_bindgen(js_name = "gradientBoostingClassify")]
pub fn gradient_boosting_classify(
    data: &[f64],
    n_features: usize,
    labels: &[f64],
    n_trees: usize,
    max_depth: usize,
    learning_rate: f64,
) -> Result<GradientBoostingClassifier, JsError> {
    gradient_boosting_impl(data, n_features, labels, n_trees, max_depth, learning_rate)
        .map_err(|e| JsError::new(&e.message))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_gradient_boosting_binary() {
        let data = vec![
            0.0, 0.0,  1.0, 1.0,
            0.0, 1.0,  1.0, 0.0,
        ];
        let labels = vec![0.0, 1.0, 0.0, 1.0];
        let model = gradient_boosting_impl(&data, 2, &labels, 10, 2, 0.1).unwrap();

        let preds = model.predict(&data);
        // Should classify correctly
        assert_eq!(preds[0], 0.0);
        assert_eq!(preds[1], 1.0);
    }

    #[test]
    fn test_learning_rate() {
        let lr = 0.5;
        let data = vec![0.0, 1.0, 2.0, 3.0];
        let labels = vec![0.0, 1.0];
        let model = gradient_boosting_impl(&data, 2, &labels, 5, 2, lr).unwrap();
        assert_eq!(model.learning_rate, lr);
    }
}
