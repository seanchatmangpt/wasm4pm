use wasm_bindgen::prelude::*;
use crate::error::MlError;
use crate::matrix::{validate_matrix, mat_get, Rng};
use crate::decision_tree::decision_tree_impl;
use crate::knn::knn_fit_impl;
use crate::naive_bayes::naive_bayes_impl;

/// K-fold cross-validation.
/// Returns: [mean_score, std_score, score_fold_0, score_fold_1, ..., score_fold_K-1]
pub fn cross_validate_score_impl(
    data: &[f64],
    n_features: usize,
    labels: &[f64],
    k_folds: usize,
    model_type: &str,
    model_params: &[f64],
) -> Result<Vec<f64>, MlError> {
    let n = validate_matrix(data, n_features)?;
    if labels.len() != n {
        return Err(MlError::new("labels length must match number of samples"));
    }
    if k_folds < 2 {
        return Err(MlError::new("k_folds must be >= 2"));
    }
    if n < k_folds {
        return Err(MlError::new("n_samples must be >= k_folds"));
    }

    // Shuffle indices deterministically
    let mut rng = Rng::from_data(data);
    let mut indices: Vec<usize> = (0..n).collect();
    for i in (1..n).rev() {
        let j = rng.next_usize(i + 1);
        indices.swap(i, j);
    }

    // Create folds
    let fold_size = n / k_folds;
    let remainder = n % k_folds;
    let mut folds: Vec<Vec<usize>> = Vec::with_capacity(k_folds);
    let mut offset = 0;
    for f in 0..k_folds {
        let size = fold_size + if f < remainder { 1 } else { 0 };
        folds.push(indices[offset..offset + size].to_vec());
        offset += size;
    }

    let mut scores = Vec::with_capacity(k_folds);

    for fold_idx in 0..k_folds {
        // Build train/test data for this fold
        let test_indices = &folds[fold_idx];
        let _test_len = test_indices.len();

        let mut train_data = Vec::new();
        let mut train_labels = Vec::new();
        let mut test_data = Vec::new();
        let mut test_labels = Vec::new();

        for (f, fold) in folds.iter().enumerate() {
            for &idx in fold {
                if f == fold_idx {
                    for j in 0..n_features {
                        test_data.push(mat_get(data, n_features, idx, j));
                    }
                    test_labels.push(labels[idx]);
                } else {
                    for j in 0..n_features {
                        train_data.push(mat_get(data, n_features, idx, j));
                    }
                    train_labels.push(labels[idx]);
                }
            }
        }

        // Train model and compute accuracy
        let score = match model_type {
            "decision_tree" => {
                let max_depth = if !model_params.is_empty() { model_params[0] as usize } else { 10 };
                let min_samples = if model_params.len() > 1 { model_params[1] as usize } else { 2 };
                let model = decision_tree_impl(&train_data, n_features, &train_labels, max_depth, min_samples, true)?;
                let preds = model.predict(&test_data);
                compute_accuracy(&test_labels, &preds)
            }
            "knn" => {
                let k = if !model_params.is_empty() { model_params[0] as usize } else { 3 };
                let model = knn_fit_impl(&train_data, n_features, &train_labels, k)?;
                let preds_u32 = model.predict(&test_data);
                let preds: Vec<f64> = preds_u32.iter().map(|&p| p as f64).collect();
                compute_accuracy(&test_labels, &preds)
            }
            "naive_bayes" => {
                let model = naive_bayes_impl(&train_data, n_features, &train_labels)?;
                let preds_u32 = model.predict(&test_data);
                let preds: Vec<f64> = preds_u32.iter().map(|&p| p as f64).collect();
                compute_accuracy(&test_labels, &preds)
            }
            _ => return Err(MlError::new(format!("Unknown model type: {}", model_type))),
        };

        scores.push(score);
    }

    // Compute mean and std of scores
    let mean = scores.iter().sum::<f64>() / scores.len() as f64;
    let variance = scores.iter()
        .map(|s| (s - mean).powi(2))
        .sum::<f64>() / scores.len() as f64;
    let std = variance.sqrt();

    // Result: [mean, std, score_0, score_1, ..., score_K-1]
    let mut result = Vec::with_capacity(2 + k_folds);
    result.push(mean);
    result.push(std);
    result.extend_from_slice(&scores);

    Ok(result)
}

fn compute_accuracy(y_true: &[f64], y_pred: &[f64]) -> f64 {
    let correct = y_true.iter()
        .zip(y_pred.iter())
        .filter(|(t, p)| (**t - **p).abs() < 1e-10)
        .count();
    correct as f64 / y_true.len() as f64
}

#[wasm_bindgen(js_name = "crossValidateScore")]
pub fn cross_validate_score(
    data: &[f64],
    n_features: usize,
    labels: &[f64],
    k_folds: usize,
    model_type: &str,
    model_params: &[f64],
) -> Result<Vec<f64>, JsError> {
    cross_validate_score_impl(data, n_features, labels, k_folds, model_type, model_params)
        .map_err(|e| JsError::new(&e.message))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_test_data() -> (Vec<f64>, Vec<f64>) {
        // Two clear clusters, 12 samples
        let data = vec![
            0.0, 0.0,  0.1, 0.1,  -0.1, 0.1,  0.0, -0.1,  0.1, -0.1,  -0.1, -0.1,
            5.0, 5.0,  5.1, 5.1,  4.9, 5.0,  5.0, 4.9,  5.1, 4.9,  4.9, 5.1,
        ];
        let labels = vec![
            0.0, 0.0, 0.0, 0.0, 0.0, 0.0,
            1.0, 1.0, 1.0, 1.0, 1.0, 1.0,
        ];
        (data, labels)
    }

    #[test]
    fn test_decision_tree_cv() {
        let (data, labels) = make_test_data();
        let result = cross_validate_score_impl(&data, 2, &labels, 3, "decision_tree", &[10.0, 2.0]).unwrap();

        let mean = result[0];
        let std = result[1];
        assert!(mean > 0.8, "Expected high accuracy for well-separated data, got {}", mean);
        assert!(std >= 0.0);
        // 3 fold scores
        assert_eq!(result.len(), 5); // mean + std + 3 scores
    }

    #[test]
    fn test_knn_cv() {
        let (data, labels) = make_test_data();
        let result = cross_validate_score_impl(&data, 2, &labels, 3, "knn", &[3.0]).unwrap();

        let mean = result[0];
        assert!(mean > 0.8, "Expected high accuracy for KNN on well-separated data, got {}", mean);
    }

    #[test]
    fn test_naive_bayes_cv() {
        let (data, labels) = make_test_data();
        let result = cross_validate_score_impl(&data, 2, &labels, 3, "naive_bayes", &[]).unwrap();

        let mean = result[0];
        assert!(mean > 0.8, "Expected high accuracy for NB on well-separated data, got {}", mean);
    }

    #[test]
    fn test_unknown_model_type() {
        let (data, labels) = make_test_data();
        assert!(cross_validate_score_impl(&data, 2, &labels, 3, "unknown", &[]).is_err());
    }

    #[test]
    fn test_k_folds_too_large() {
        let data = vec![1.0, 2.0, 3.0, 4.0];
        let labels = vec![0.0, 1.0];
        assert!(cross_validate_score_impl(&data, 2, &labels, 5, "knn", &[3.0]).is_err());
    }

    #[test]
    fn test_k_folds_too_small() {
        let (data, labels) = make_test_data();
        assert!(cross_validate_score_impl(&data, 2, &labels, 1, "knn", &[3.0]).is_err());
    }

    #[test]
    fn test_deterministic() {
        let (data, labels) = make_test_data();
        let r1 = cross_validate_score_impl(&data, 2, &labels, 3, "decision_tree", &[10.0, 2.0]).unwrap();
        let r2 = cross_validate_score_impl(&data, 2, &labels, 3, "decision_tree", &[10.0, 2.0]).unwrap();
        assert_eq!(r1, r2);
    }

    #[test]
    fn test_five_fold() {
        let (data, labels) = make_test_data();
        let result = cross_validate_score_impl(&data, 2, &labels, 5, "knn", &[3.0]).unwrap();
        // mean + std + 5 scores = 7
        assert_eq!(result.len(), 7);
    }
}
