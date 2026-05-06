use wasm_bindgen::prelude::*;
use crate::error::MlError;
use crate::matrix::{validate_matrix, mat_get, Rng};
use crate::decision_tree::{DecisionTreeModel, decision_tree_impl};

#[wasm_bindgen]
pub struct RandomForestModel {
    trees: Vec<DecisionTreeModel>,
    n_features: usize,
    n_trees: usize,
    is_classifier: bool,
}

#[wasm_bindgen]
impl RandomForestModel {
    #[wasm_bindgen(getter, js_name = "nTrees")]
    pub fn n_trees(&self) -> usize { self.n_trees }

    #[wasm_bindgen(getter, js_name = "nFeatures")]
    pub fn n_features(&self) -> usize { self.n_features }

    /// Predict using majority vote (classification) or averaging (regression)
    #[wasm_bindgen]
    pub fn predict(&self, data: &[f64]) -> Vec<f64> {
        let n = data.len() / self.n_features;
        let mut result = Vec::with_capacity(n);

        for i in 0..n {
            let point: Vec<f64> = (0..self.n_features)
                .map(|j| data[i * self.n_features + j])
                .collect();

            // Collect predictions from all trees (using predict_single to avoid allocation)
            let predictions: Vec<f64> = self.trees.iter()
                .map(|tree| tree.predict_single(&point))
                .collect();

            if self.is_classifier {
                // Majority vote
                let mut counts: Vec<(f64, usize)> = Vec::new();
                for &pred in &predictions {
                    let pred_rounded = pred.round();
                    if let Some(entry) = counts.iter_mut().find(|(k, _)| (*k - pred_rounded).abs() < 1e-10) {
                        entry.1 += 1;
                    } else {
                        counts.push((pred_rounded, 1));
                    }
                }
                let (best_class, _) = counts.iter().max_by_key(|(_, v)| v).unwrap();
                result.push(*best_class);
            } else {
                // Average
                let mean = predictions.iter().sum::<f64>() / predictions.len() as f64;
                result.push(mean);
            }
        }

        result
    }

    #[wasm_bindgen(js_name = "toString")]
    pub fn to_string_js(&self) -> String {
        format!("RandomForest(trees={}, features={})", self.n_trees, self.n_features)
    }
}

/// Bootstrap sample: randomly sample n indices with replacement
fn bootstrap_sample(n: usize, rng: &mut Rng) -> Vec<usize> {
    (0..n).map(|_| rng.next_usize(n)).collect()
}

#[allow(dead_code)]
/// Random feature subset: sqrt(n_features) for classification, n_features/3 for regression
fn feature_subset(n_features: usize, is_classifier: bool, rng: &mut Rng) -> Vec<usize> {
    let n_select = if is_classifier {
        (n_features as f64).sqrt().ceil() as usize
    } else {
        (n_features as f64 / 3.0).ceil() as usize
    };
    let n_select = n_select.max(1).min(n_features);

    // Fisher-Yates partial shuffle
    let mut indices: Vec<usize> = (0..n_features).collect();
    for i in 0..n_select {
        let j = rng.next_usize(n_features - i) + i;
        indices.swap(i, j);
    }
    indices[..n_select].to_vec()
}

pub fn random_forest_impl(
    data: &[f64],
    n_features: usize,
    targets: &[f64],
    n_trees: usize,
    max_depth: usize,
    min_samples_split: usize,
    is_classifier: bool,
) -> Result<RandomForestModel, MlError> {
    let n = validate_matrix(data, n_features)?;
    if targets.len() != n {
        return Err(MlError::new("targets length must match number of samples"));
    }
    if n_trees == 0 {
        return Err(MlError::new("n_trees must be > 0"));
    }
    if n < 2 {
        return Err(MlError::new("Need at least 2 samples"));
    }

    let mut rng = Rng::from_data(data);
    let mut trees = Vec::with_capacity(n_trees);

    for _ in 0..n_trees {
        // Bootstrap sample
        let sample_indices = bootstrap_sample(n, &mut rng);

        // Create bootstrap data
        let mut boot_data = Vec::with_capacity(n * n_features);
        let mut boot_targets = Vec::with_capacity(n);
        for &idx in &sample_indices {
            for j in 0..n_features {
                boot_data.push(mat_get(data, n_features, idx, j));
            }
            boot_targets.push(targets[idx]);
        }

        // Build tree (feature bagging is implicit — decision tree considers all features;
        // for true feature bagging we'd need to modify the tree builder, but for WASM size
        // we use bootstrap sampling which is the main source of randomness)
        match decision_tree_impl(&boot_data, n_features, &boot_targets, max_depth, min_samples_split, is_classifier) {
            Ok(tree) => trees.push(tree),
            Err(_) => continue, // Skip failed trees (e.g., all same class in bootstrap)
        }
    }

    if trees.is_empty() {
        return Err(MlError::new("All trees failed to build"));
    }

    Ok(RandomForestModel {
        n_features,
        n_trees: trees.len(),
        is_classifier,
        trees,
    })
}

#[wasm_bindgen(js_name = "randomForestClassify")]
pub fn random_forest_classify(
    data: &[f64],
    n_features: usize,
    labels: &[f64],
    n_trees: usize,
    max_depth: usize,
    min_samples_split: usize,
) -> Result<RandomForestModel, JsError> {
    random_forest_impl(data, n_features, labels, n_trees, max_depth, min_samples_split, true)
        .map_err(|e| JsError::new(&e.message))
}

#[wasm_bindgen(js_name = "randomForestRegress")]
pub fn random_forest_regress(
    data: &[f64],
    n_features: usize,
    targets: &[f64],
    n_trees: usize,
    max_depth: usize,
    min_samples_split: usize,
) -> Result<RandomForestModel, JsError> {
    random_forest_impl(data, n_features, targets, n_trees, max_depth, min_samples_split, false)
        .map_err(|e| JsError::new(&e.message))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_classification() {
        // XOR-like pattern
        let data = vec![
            0.0, 0.0,  1.0, 1.0,  0.0, 1.0,  1.0, 0.0,
            0.1, 0.1,  1.1, 1.1,  0.1, 1.1,  1.1, 0.1,
        ];
        let labels = vec![0.0, 0.0, 1.0, 1.0, 0.0, 0.0, 1.0, 1.0];
        let model = random_forest_impl(&data, 2, &labels, 10, 5, 2, true).unwrap();

        let test = vec![0.05, 0.05, 1.05, 1.05, 0.05, 1.05, 1.05, 0.05];
        let preds = model.predict(&test);
        assert_eq!(preds.len(), 4);
        // XOR pattern: (0,0)→0, (1,1)→0, (0,1)→1, (1,0)→1
        assert_eq!(preds[0], 0.0);
        assert_eq!(preds[1], 0.0);
        assert_eq!(preds[2], 1.0);
        assert_eq!(preds[3], 1.0);
    }

    #[test]
    fn test_regression() {
        let data: Vec<f64> = (0..20).map(|i| i as f64).collect();
        let targets: Vec<f64> = (0..20).map(|i| (i as f64) * 2.0 + 1.0).collect();
        let model = random_forest_impl(&data, 1, &targets, 5, 5, 2, false).unwrap();

        let test = vec![5.0, 10.0, 15.0];
        let preds = model.predict(&test);

        // Should be close to 11, 21, 31
        assert!((preds[0] - 11.0).abs() < 3.0);
        assert!((preds[1] - 21.0).abs() < 3.0);
        assert!((preds[2] - 31.0).abs() < 3.0);
    }

    #[test]
    fn test_single_tree_fallback() {
        let data = vec![0.0, 0.0, 1.0, 1.0];
        let labels = vec![0.0, 1.0];
        let model = random_forest_impl(&data, 2, &labels, 1, 3, 2, true).unwrap();
        assert_eq!(model.n_trees(), 1);
    }

    #[test]
    fn test_deterministic() {
        let data = vec![
            0.0, 0.0,  1.0, 1.0,  0.0, 1.0,  1.0, 0.0,
        ];
        let labels = vec![0.0, 0.0, 1.0, 1.0];

        let m1 = random_forest_impl(&data, 2, &labels, 5, 3, 2, true).unwrap();
        let m2 = random_forest_impl(&data, 2, &labels, 5, 3, 2, true).unwrap();

        // Same data → same seed → same result
        let test = vec![0.0, 0.0, 1.0, 1.0];
        assert_eq!(m1.predict(&test), m2.predict(&test));
    }

    #[test]
    fn test_getters() {
        let data = vec![0.0, 0.0, 1.0, 1.0];
        let labels = vec![0.0, 1.0];
        let model = random_forest_impl(&data, 2, &labels, 5, 3, 2, true).unwrap();
        assert_eq!(model.n_features(), 2);
        assert!(model.n_trees() > 0);
    }
}
