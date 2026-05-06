//! Feature Importance (Permutation/SHAP-lite)
//!
//! Ported from wasm4pm feature_importance.rs
//!
//! Provides permutation-based feature importance analysis.
//! Answers: "Which features matter most for prediction?"

use crate::optimization::types::*;
use crate::optimization::fitness::*;
use wasm_bindgen::prelude::*;

/// Feature importance result for a single feature
#[derive(Clone, Debug)]
#[wasm_bindgen]
pub struct FeatureImportance {
    /// Feature index or name
    #[wasm_bindgen(getter_with_clone)]
    pub feature: usize,

    /// Position in the original feature vector
    #[wasm_bindgen(getter_with_clone)]
    pub position: usize,

    /// Baseline confidence without this feature
    #[wasm_bindgen(getter_with_clone)]
    pub confidence_without: f64,

    /// Delta in confidence when feature is removed
    #[wasm_bindgen(getter_with_clone)]
    pub delta: f64,

    /// Normalized importance (0-1, sums to 1 across all features)
    #[wasm_bindgen(getter_with_clone)]
    pub importance: f64,
}

/// Feature importance analysis result
#[derive(Clone, Debug)]
#[wasm_bindgen]
pub struct FeatureImportanceResult {
    /// Baseline confidence (with all features)
    #[wasm_bindgen(getter_with_clone)]
    pub baseline: f64,

    /// Individual feature importances
    #[wasm_bindgen(getter_with_clone)]
    pub importances: Vec<FeatureImportance>,

    /// Method used for importance computation
    #[wasm_bindgen(getter_with_clone)]
    pub method: String,
}

/// Compute permutation feature importance
///
/// For each feature, remove it and measure the change in prediction quality.
/// Features whose removal causes the largest drop are most important.
///
/// # Arguments
/// * `fitness_fn` - Fitness function to evaluate feature subsets
/// * `dimension` - Number of features
/// * `baseline_genes` - Full feature set to evaluate as baseline
///
/// # Returns
/// Feature importance result with normalized importances
///
/// # Example
/// ```no_run
/// // Compute permutation importance by evaluating feature subsets
/// // Returns feature importance result with normalized scores
/// ```
pub fn compute_permutation_importance(
    fitness_fn: &dyn FitnessFunction<f64>,
    dimension: usize,
    baseline_genes: &[f64],
) -> FeatureImportanceResult {
    if dimension == 0 {
        return FeatureImportanceResult {
            baseline: 0.0,
            importances: vec![],
            method: "permutation_importance".to_string(),
        };
    }

    // Compute baseline prediction
    let baseline_individual = Individual::new(baseline_genes.to_vec());
    let baseline_confidence = fitness_fn.evaluate(&baseline_individual);

    // Single feature case
    if dimension == 1 {
        return FeatureImportanceResult {
            baseline: baseline_confidence,
            importances: vec![FeatureImportance {
                feature: 0,
                position: 0,
                confidence_without: 0.0,
                delta: 0.0,
                importance: 0.0,
            }],
            method: "permutation_importance".to_string(),
        };
    }

    // For each feature, compute importance by ablating it
    let mut importances = Vec::with_capacity(dimension);

    for pos in 0..dimension {
        // Build ablated feature vector (remove feature at position pos)
        let ablated_genes: Vec<f64> = baseline_genes
            .iter()
            .enumerate()
            .filter(|(i, _)| *i != pos)
            .map(|(_, &v)| v)
            .collect();

        let ablated_confidence = if ablated_genes.is_empty() {
            0.0
        } else {
            let ablated = Individual::new(ablated_genes);
            fitness_fn.evaluate(&ablated)
        };

        let delta = ablated_confidence - baseline_confidence; // negative = important
        let importance = -delta; // positive = important

        importances.push(FeatureImportance {
            feature: pos,
            position: pos,
            confidence_without: ablated_confidence,
            delta,
            importance,
        });
    }

    // Sort by importance descending
    importances.sort_by(|a, b| {
        b.importance
            .partial_cmp(&a.importance)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    // Normalize importances to sum to 1.0
    let total_importance: f64 = importances.iter().map(|imp| imp.importance).sum();

    if total_importance > 0.0 {
        for imp in &mut importances {
            imp.importance /= total_importance;
        }
    }

    FeatureImportanceResult {
        baseline: baseline_confidence,
        importances,
        method: "permutation_importance".to_string(),
    }
}

/// Compute feature importance for classification models
///
/// Specialized version for classification where features are binary (0/1).
/// Useful for feature selection in binary classification problems.
///
/// # Arguments
/// * `predict_fn` - Prediction function that takes features and returns class probability
/// * `feature_matrix` - 2D array [n_samples, n_features]
/// * `true_labels` - True labels for each sample
///
/// # Returns
/// Feature importance result based on accuracy drop when feature is removed
pub fn compute_classification_importance(
    predict_fn: &dyn Fn(&[f64]) -> f64,
    feature_matrix: &[f64],
    true_labels: &[f64],
    n_samples: usize,
    n_features: usize,
) -> FeatureImportanceResult {
    if n_features == 0 {
        return FeatureImportanceResult {
            baseline: 0.0,
            importances: vec![],
            method: "classification_importance".to_string(),
        };
    }

    // Compute baseline accuracy
    let baseline_accuracy = (0..n_samples)
        .map(|i| {
            let features = &feature_matrix[i * n_features..(i + 1) * n_features];
            let pred = if predict_fn(features) > 0.5 { 1.0 } else { 0.0 };
            if pred == true_labels[i] { 1.0 } else { 0.0 }
        })
        .sum::<f64>()
        / n_samples as f64;

    // Single feature case
    if n_features == 1 {
        return FeatureImportanceResult {
            baseline: baseline_accuracy,
            importances: vec![FeatureImportance {
                feature: 0,
                position: 0,
                confidence_without: 0.0,
                delta: 0.0,
                importance: 0.0,
            }],
            method: "classification_importance".to_string(),
        };
    }

    let mut importances = Vec::with_capacity(n_features);

    for feat in 0..n_features {
        // Compute accuracy without this feature
        let accuracy_without = (0..n_samples)
            .map(|i| {
                let features = &feature_matrix[i * n_features..(i + 1) * n_features];
                // Ablate: set feature to 0
                let mut ablated = features.to_vec();
                ablated[feat] = 0.0;

                let pred = if predict_fn(&ablated) > 0.5 { 1.0 } else { 0.0 };
                if pred == true_labels[i] { 1.0 } else { 0.0 }
            })
            .sum::<f64>()
            / n_samples as f64;

        let delta = accuracy_without - baseline_accuracy;
        let importance = -delta; // positive = important

        importances.push(FeatureImportance {
            feature: feat,
            position: feat,
            confidence_without: accuracy_without,
            delta,
            importance,
        });
    }

    // Sort and normalize
    importances.sort_by(|a, b| {
        b.importance
            .partial_cmp(&a.importance)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    let total_importance: f64 = importances.iter().map(|imp| imp.importance).sum();

    if total_importance > 0.0 {
        for imp in &mut importances {
            imp.importance /= total_importance;
        }
    }

    FeatureImportanceResult {
        baseline: baseline_accuracy,
        importances,
        method: "classification_importance".to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use super::super::genetic::seed_rng;

    // Simple linear model that works with variable dimension
    // y = sum of genes (each feature contributes equally)
    fn linear_model(genes: &[f64]) -> f64 {
        genes.iter().sum()
    }

    #[test]
    fn test_permutation_importance() {
        seed_rng(42);

        // Features: [1.0, 2.0, 3.0] -> y = 6.0
        let baseline = vec![1.0, 2.0, 3.0];
        let fitness = ClosureFitnessFunction::new(linear_model, 3);

        let result = compute_permutation_importance(&fitness, 3, &baseline);

        // All features should have equal importance since they contribute equally
        assert_eq!(result.importances.len(), 3);

        // Check that importances sum to approximately 1.0
        let total: f64 = result.importances.iter().map(|imp| imp.importance).sum();
        assert!((total - 1.0).abs() < 0.01);

        // With equal contributions, each feature should have ~33% importance
        // But due to sorting, the first one has the highest importance
        let max_importance = result.importances[0].importance;
        assert!(max_importance > 0.2); // At least 20%
    }

    #[test]
    fn test_single_feature() {
        let fitness = ClosureFitnessFunction::new(|genes| genes[0], 1);
        let baseline = vec![5.0];

        let result = compute_permutation_importance(&fitness, 1, &baseline);

        assert_eq!(result.importances.len(), 1);
        assert_eq!(result.importances[0].importance, 0.0);
    }

    #[test]
    fn test_classification_importance() {
        seed_rng(42);

        // Simple AND-like model: predict 1 if both features are > 0.5
        let predict_fn = |features: &[f64]| -> f64 {
            if features[0] > 0.5 && features[1] > 0.5 { 1.0 } else { 0.0 }
        };

        let feature_matrix = vec![
            1.0, 1.0, // Both > 0.5, should predict 1
            1.0, 0.0, // Second feature < 0.5, should predict 0
            0.0, 1.0, // First feature < 0.5, should predict 0
            0.0, 0.0, // Both < 0.5, should predict 0
        ];
        let labels = vec![1.0, 0.0, 0.0, 0.0];

        let result = compute_classification_importance(
            &predict_fn,
            &feature_matrix,
            &labels,
            4,
            2
        );

        // Both features should be important
        assert_eq!(result.importances.len(), 2);
        assert!(result.baseline > 0.5); // Should be accurate

        // Check normalization
        let total: f64 = result.importances.iter().map(|imp| imp.importance).sum();
        assert!((total - 1.0).abs() < 0.01);
    }
}
