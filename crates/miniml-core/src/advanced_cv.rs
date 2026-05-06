//! Advanced cross-validation strategies
//!
//! Provides stratified K-fold, group K-fold, time series CV, nested CV, LOOCV, and bootstrapping.

use crate::error::MlError;
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;
use std::collections::HashMap;

/// Cross-validation split indices
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CvSplit {
    /// Training indices
    pub train_indices: Vec<usize>,

    /// Validation indices
    pub val_indices: Vec<usize>,

    /// Fold number (1-indexed)
    pub fold: usize,
}

/// Cross-validation result with scores
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CvResult {
    /// All fold scores
    pub fold_scores: Vec<f64>,

    /// Mean score across folds
    pub mean_score: f64,

    /// Standard deviation of scores
    pub std_score: f64,

    /// Number of folds
    pub n_folds: usize,
}

/// Bootstrap result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BootstrapResult {
    /// All bootstrap scores
    pub scores: Vec<f64>,

    /// Mean score
    pub mean: f64,

    /// Standard error
    pub std_error: f64,

    /// 95% confidence interval (lower, upper)
    pub confidence_interval: (f64, f64),

    /// Number of bootstrap iterations
    pub n_iterations: usize,
}

/// Stratified K-Fold cross-validation
///
/// Preserves class distribution in each fold.
///
/// # Arguments
/// * `y` - Labels (n_samples)
/// * `n_folds` - Number of folds
/// * `shuffle` - Whether to shuffle data before splitting
/// * `seed` - Random seed for shuffling
#[wasm_bindgen]
pub fn stratified_k_fold(
    y: &[f64],
    n_folds: usize,
    shuffle: bool,
    seed: Option<f64>,
) -> Result<js_sys::Array, JsError> {
    let n_samples = y.len();

    if n_folds < 2 {
        return Err(JsError::new("n_folds must be >= 2"));
    }

    if n_samples < n_folds {
        return Err(JsError::new("n_samples must be >= n_folds"));
    }

    // Group indices by class (using u64 bits for HashMap key)
    let mut class_indices: HashMap<u64, Vec<usize>> = HashMap::new();

    for (i, &label) in y.iter().enumerate() {
        let label_bits = label.to_bits();
        class_indices.entry(label_bits).or_insert_with(Vec::new).push(i);
    }

    // Shuffle within each class if requested
    if shuffle {
        let mut rng_seed = seed.unwrap_or(42.0);

        for indices in class_indices.values_mut() {
            // Fisher-Yates shuffle
            for i in (1..indices.len()).rev() {
                // Simple pseudo-random based on seed
                let j = ((rng_seed * 1000.0) % (i + 1) as f64) as usize;
                indices.swap(i, j);
                rng_seed = (rng_seed * 1.1) % 10000.0;
            }
        }
    }

    // Create stratified folds
    let mut folds: Vec<Vec<usize>> = vec![Vec::new(); n_folds];

    for (_, indices) in class_indices.iter() {
        let n_class = indices.len();

        for (fold_idx, &idx) in indices.iter().enumerate() {
            let fold = fold_idx % n_folds;
            folds[fold].push(idx);
        }
    }

    // Convert to CvSplit objects
    let result = js_sys::Array::new();

    for fold_idx in 0..n_folds {
        let mut train_indices = Vec::new();
        let mut val_indices = folds[fold_idx].clone();

        for (i, fold) in folds.iter().enumerate() {
            if i != fold_idx {
                train_indices.extend(fold.clone());
            }
        }

        let cv_split = CvSplit {
            train_indices,
            val_indices,
            fold: fold_idx + 1,
        };

        let serde_val = serde_wasm_bindgen::to_value(&cv_split)
            .map_err(|e| JsError::new(&format!("Serialization failed: {}", e)))?;

        result.push(&serde_val);
    }

    Ok(result)
}

/// Group K-Fold cross-validation
///
/// Ensures same group is not in both training and validation.
///
/// # Arguments
/// * `groups` - Group labels for each sample (n_samples)
/// * `n_folds` - Number of folds
/// * `n_samples` - Total number of samples
#[wasm_bindgen]
pub fn group_k_fold(
    groups: &[f64],
    n_folds: usize,
    n_samples: usize,
) -> Result<js_sys::Array, JsError> {
    if n_folds < 2 {
        return Err(JsError::new("n_folds must be >= 2"));
    }

    if groups.len() != n_samples {
        return Err(JsError::new("groups length must equal n_samples"));
    }

    // Group indices by group label (using u64 bits for HashMap key)
    let mut group_to_int: HashMap<u64, usize> = HashMap::new();
    let mut int_to_group: Vec<f64> = Vec::new();
    let mut group_indices: Vec<Vec<usize>> = Vec::new();

    for (i, &group) in groups.iter().enumerate() {
        // Convert f64 to u64 for HashMap key
        let group_key = group.to_bits();

        // Find or create integer mapping for this group
        let group_idx = if let Some(&idx) = group_to_int.get(&group_key) {
            idx
        } else {
            let idx = int_to_group.len();
            group_to_int.insert(group_key, idx);
            int_to_group.push(group);
            group_indices.push(Vec::new());
            idx
        };

        group_indices[group_idx].push(i);
    }

    let n_unique_groups = int_to_group.len();

    if n_unique_groups < n_folds {
        return Err(JsError::new("Number of unique groups must be >= n_folds"));
    }

    // Assign groups to folds
    let mut group_folds: Vec<usize> = vec![0; n_unique_groups];

    for (i, _group) in int_to_group.iter().enumerate() {
        group_folds[i] = i % n_folds;
    }

    // Create fold indices
    let mut folds: Vec<Vec<usize>> = vec![Vec::new(); n_folds];

    for (i, &group) in groups.iter().enumerate() {
        let group_key = group.to_bits();
        let group_idx = group_to_int[&group_key];
        let fold = group_folds[group_idx];
        folds[fold].push(i);
    }

    // Convert to CvSplit objects
    let result = js_sys::Array::new();

    for fold_idx in 0..n_folds {
        let mut train_indices = Vec::new();
        let mut val_indices = folds[fold_idx].clone();

        for (i, fold) in folds.iter().enumerate() {
            if i != fold_idx {
                train_indices.extend(fold.clone());
            }
        }

        let cv_split = CvSplit {
            train_indices,
            val_indices,
            fold: fold_idx + 1,
        };

        let serde_val = serde_wasm_bindgen::to_value(&cv_split)
            .map_err(|e| JsError::new(&format!("Serialization failed: {}", e)))?;

        result.push(&serde_val);
    }

    Ok(result)
}

/// Time series cross-validation
///
/// Forward chaining: Train on [0, t], validate on [t+1, t+test_size].
///
/// # Arguments
/// * `n_samples` - Total number of samples
/// * `n_folds` - Number of folds
/// * `test_size` - Size of test set for each fold
/// * `gap` - Gap between train and test (number of samples to skip)
#[wasm_bindgen]
pub fn time_series_cv(
    n_samples: usize,
    n_folds: usize,
    test_size: usize,
    gap: usize,
) -> Result<js_sys::Array, JsError> {
    if n_folds < 2 {
        return Err(JsError::new("n_folds must be >= 2"));
    }

    if test_size < 1 {
        return Err(JsError::new("test_size must be >= 1"));
    }

    let result = js_sys::Array::new();

    for fold_idx in 0..n_folds {
        let train_end = fold_idx * test_size;
        let test_start = train_end + gap + 1;
        let test_end = test_start + test_size;

        if test_end > n_samples {
            break; // Not enough data for this fold
        }

        let train_indices: Vec<usize> = (0..train_end).collect();
        let val_indices: Vec<usize> = (test_start..test_end).collect();

        let cv_split = CvSplit {
            train_indices,
            val_indices,
            fold: fold_idx + 1,
        };

        let serde_val = serde_wasm_bindgen::to_value(&cv_split)
            .map_err(|e| JsError::new(&format!("Serialization failed: {}", e)))?;

        result.push(&serde_val);
    }

    Ok(result)
}

/// Nested cross-validation
///
/// Outer loop for model evaluation, inner loop for hyperparameter tuning.
///
/// # Arguments
/// * `n_samples` - Total number of samples
/// * `outer_folds` - Number of outer folds
/// * `inner_folds` - Number of inner folds
#[wasm_bindgen]
pub fn nested_cv(
    n_samples: usize,
    outer_folds: usize,
    inner_folds: usize,
) -> Result<js_sys::Array, JsError> {
    if outer_folds < 2 {
        return Err(JsError::new("outer_folds must be >= 2"));
    }

    if inner_folds < 2 {
        return Err(JsError::new("inner_folds must be >= 2"));
    }

    let fold_size = n_samples / outer_folds;

    let result = js_sys::Array::new();

    for outer_fold in 0..outer_folds {
        let test_start = outer_fold * fold_size;
        let test_end = if outer_fold == outer_folds - 1 {
            n_samples
        } else {
            test_start + fold_size
        };

        // Test indices for outer fold
        let test_indices: Vec<usize> = (test_start..test_end).collect();

        // Training indices for outer fold (used for inner CV)
        let mut train_indices = Vec::new();
        for i in 0..n_samples {
            if i < test_start || i >= test_end {
                train_indices.push(i);
            }
        }

        // Create inner CV splits for hyperparameter tuning
        let inner_cv = js_sys::Array::new();
        let inner_fold_size = train_indices.len() / inner_folds;

        for inner_fold in 0..inner_folds {
            let inner_test_start = inner_fold * inner_fold_size;
            let inner_test_end = if inner_fold == inner_folds - 1 {
                train_indices.len()
            } else {
                inner_test_start + inner_fold_size
            };

            let mut inner_train = Vec::new();
            let mut inner_val = Vec::new();

            for (idx, &sample_idx) in train_indices.iter().enumerate() {
                if idx >= inner_test_start && idx < inner_test_end {
                    inner_val.push(sample_idx);
                } else {
                    inner_train.push(sample_idx);
                }
            }

            let inner_split = CvSplit {
                train_indices: inner_train,
                val_indices: inner_val,
                fold: inner_fold + 1,
            };

            let serde_val = serde_wasm_bindgen::to_value(&inner_split)
                .map_err(|e| JsError::new(&format!("Serialization failed: {}", e)))?;

            inner_cv.push(&serde_val);
        }

        // Convert inner_cv Array to Vec<Value> for serialization
        let inner_cv_vec: Vec<serde_json::Value> = (0..inner_cv.length())
            .map(|i| inner_cv.get(i))
            .filter_map(|val| val.as_string())
            .filter_map(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
            .collect();

        // Outer fold info with inner CV attached
        let outer_info = serde_json::json!({
            "fold": outer_fold + 1,
            "train_indices": train_indices,
            "test_indices": test_indices,
            "inner_cv": inner_cv_vec
        });

        let serde_val = serde_wasm_bindgen::to_value(&outer_info)
            .map_err(|e| JsError::new(&format!("Serialization failed: {}", e)))?;

        result.push(&serde_val);
    }

    Ok(result)
}

/// Leave-One-Out cross-validation
///
/// Each sample is used once as validation.
///
/// # Arguments
/// * `n_samples` - Total number of samples
#[wasm_bindgen]
pub fn leave_one_out_cv(n_samples: usize) -> Result<js_sys::Array, JsError> {
    if n_samples < 2 {
        return Err(JsError::new("n_samples must be >= 2"));
    }

    let result = js_sys::Array::new();

    for i in 0..n_samples {
        let train_indices: Vec<usize> = (0..n_samples).filter(|&j| j != i).collect();
        let val_indices = vec![i];

        let cv_split = CvSplit {
            train_indices,
            val_indices,
            fold: i + 1,
        };

        let serde_val = serde_wasm_bindgen::to_value(&cv_split)
            .map_err(|e| JsError::new(&format!("Serialization failed: {}", e)))?;

        result.push(&serde_val);
    }

    Ok(result)
}

/// Bootstrapping
///
/// Resample with replacement to estimate confidence intervals.
///
/// # Arguments
/// * `n_samples` - Total number of samples
/// * `n_iterations` - Number of bootstrap iterations
/// * `seed` - Random seed
#[wasm_bindgen]
pub fn bootstrap(
    n_samples: usize,
    n_iterations: usize,
    seed: Option<f64>,
) -> Result<js_sys::Array, JsError> {
    if n_samples < 1 {
        return Err(JsError::new("n_samples must be >= 1"));
    }

    if n_iterations < 1 {
        return Err(JsError::new("n_iterations must be >= 1"));
    }

    let result = js_sys::Array::new();
    let mut rng_seed = seed.unwrap_or(42.0);

    for iter in 0..n_iterations {
        let mut train_indices = Vec::with_capacity(n_samples);
        let mut oob_indices = Vec::new(); // Out-of-bag indices

        // Sample with replacement
        for _ in 0..n_samples {
            let idx = ((rng_seed * 1000.0) % n_samples as f64) as usize;
            train_indices.push(idx);
            rng_seed = (rng_seed * 1.1) % 10000.0;
        }

        // Find out-of-bag samples (not selected in training)
        let train_set: std::collections::HashSet<usize> = train_indices.iter().cloned().collect();

        for i in 0..n_samples {
            if !train_set.contains(&i) {
                oob_indices.push(i);
            }
        }

        let bootstrap_info = serde_json::json!({
            "iteration": iter + 1,
            "train_indices": train_indices,
            "oob_indices": oob_indices
        });

        let serde_val = serde_wasm_bindgen::to_value(&bootstrap_info)
            .map_err(|e| JsError::new(&format!("Serialization failed: {}", e)))?;

        result.push(&serde_val);
    }

    Ok(result)
}

/// Compute cross-validation result from scores
///
/// # Arguments
/// * `scores` - Scores from each fold
#[wasm_bindgen]
pub fn compute_cv_result(scores: Vec<f64>) -> Result<JsValue, JsError> {
    if scores.is_empty() {
        return Err(JsError::new("scores cannot be empty"));
    }

    let n = scores.len();
    let mean = scores.iter().sum::<f64>() / n as f64;

    let variance = scores.iter()
        .map(|&s| (s - mean).powi(2))
        .sum::<f64>() / n as f64;

    let std_score = variance.sqrt();

    let result = CvResult {
        fold_scores: scores,
        mean_score: mean,
        std_score,
        n_folds: n,
    };

    serde_wasm_bindgen::to_value(&result)
        .map_err(|e| JsError::new(&format!("Serialization failed: {}", e)))
}

/// Compute bootstrap result from scores
///
/// # Arguments
/// * `scores` - Scores from each bootstrap iteration
/// * `confidence_level` - Confidence level (e.g., 0.95 for 95% CI)
#[wasm_bindgen]
pub fn compute_bootstrap_result(
    scores: Vec<f64>,
    confidence_level: f64,
) -> Result<JsValue, JsError> {
    if scores.is_empty() {
        return Err(JsError::new("scores cannot be empty"));
    }

    if confidence_level <= 0.0 || confidence_level >= 1.0 {
        return Err(JsError::new("confidence_level must be in (0, 1)"));
    }

    let n = scores.len();
    let mean = scores.iter().sum::<f64>() / n as f64;

    // Standard error
    let variance = scores.iter()
        .map(|&s| (s - mean).powi(2))
        .sum::<f64>() / n as f64;

    let std_error = variance.sqrt();

    // Percentile-based confidence interval
    let mut sorted_scores = scores.clone();
    sorted_scores.sort_by(|a, b| a.partial_cmp(b).unwrap());

    let alpha = 1.0 - confidence_level;
    let lower_idx = ((alpha / 2.0) * n as f64).floor() as usize;
    let upper_idx = ((1.0 - alpha / 2.0) * n as f64).ceil() as usize;

    let lower = sorted_scores[lower_idx.min(n - 1)];
    let upper = sorted_scores[upper_idx.min(n - 1)];

    let result = BootstrapResult {
        scores,
        mean,
        std_error,
        confidence_interval: (lower, upper),
        n_iterations: n,
    };

    serde_wasm_bindgen::to_value(&result)
        .map_err(|e| JsError::new(&format!("Serialization failed: {}", e)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_stratified_k_fold() {
        let y = vec![0.0, 0.0, 1.0, 1.0, 1.0, 0.0];
        let result = stratified_k_fold(&y, 3, false, None).unwrap();

        assert_eq!(result.length(), 3);
    }

    #[test]
    fn test_group_k_fold() {
        let groups = vec![1.0, 1.0, 2.0, 2.0, 3.0, 3.0];
        let result = group_k_fold(&groups, 3, 6).unwrap();

        assert_eq!(result.length(), 3);
    }

    #[test]
    fn test_time_series_cv() {
        let result = time_series_cv(100, 5, 10, 0).unwrap();

        assert_eq!(result.length(), 5);
    }

    #[test]
    fn test_nested_cv() {
        let result = nested_cv(100, 3, 3).unwrap();

        assert_eq!(result.length(), 3);
    }

    #[test]
    fn test_leave_one_out_cv() {
        let result = leave_one_out_cv(10).unwrap();

        assert_eq!(result.length(), 10);
    }

    #[test]
    fn test_bootstrap() {
        let result = bootstrap(100, 10, Some(42.0)).unwrap();

        assert_eq!(result.length(), 10);
    }

    #[test]
    fn test_compute_cv_result() {
        let scores = vec![0.8, 0.85, 0.9, 0.75, 0.95];
        let result = compute_cv_result(scores).unwrap();

        // Result should be a valid CvResult
        assert!(result.is_object());
    }

    #[test]
    fn test_compute_bootstrap_result() {
        let scores = vec![0.8, 0.85, 0.9, 0.75, 0.95];
        let result = compute_bootstrap_result(scores, 0.95).unwrap();

        // Result should be a valid BootstrapResult
        assert!(result.is_object());
    }
}
