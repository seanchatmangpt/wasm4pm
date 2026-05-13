//! Model explainability and interpretability
//!
//! Provides SHAP-like feature attribution, LIME-like local explanations,
//! decision paths for trees, confidence intervals, and counterfactuals.

use crate::error::MlError;
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

/// Explanation result for a single prediction
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Explanation {
    /// Feature importance scores (SHAP values)
    pub feature_importance: Vec<f64>,

    /// Predicted value
    pub prediction: f64,

    /// Confidence score (0-1)
    pub confidence: f64,

    /// Counterfactual explanation (what would change prediction?)
    pub counterfactual: Option<Counterfactual>,
}

impl Explanation {
    /// Create a new explanation
    pub fn new(n_features: usize) -> Self {
        Self {
            feature_importance: vec![0.0; n_features],
            prediction: 0.0,
            confidence: 0.0,
            counterfactual: None,
        }
    }

    /// Set feature importance
    pub fn with_importance(mut self, importance: Vec<f64>) -> Self {
        self.feature_importance = importance;
        self
    }

    /// Set prediction
    pub fn with_prediction(mut self, prediction: f64) -> Self {
        self.prediction = prediction;
        self
    }

    /// Set confidence
    pub fn with_confidence(mut self, confidence: f64) -> Self {
        self.confidence = confidence;
        self
    }

    /// Set counterfactual
    pub fn with_counterfactual(mut self, counterfactual: Counterfactual) -> Self {
        self.counterfactual = Some(counterfactual);
        self
    }
}

/// Counterfactual explanation: "What would change the prediction?"
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Counterfactual {
    /// Original prediction
    pub original_prediction: f64,

    /// Counterfactual prediction
    pub counterfactual_prediction: f64,

    /// Feature changes needed
    pub feature_changes: Vec<f64>,

    /// Which features to change
    pub feature_indices: Vec<usize>,

    /// Explanation text
    pub explanation: String,
}

impl Counterfactual {
    /// Create a new counterfactual
    pub fn new(
        original: f64,
        counterfactual: f64,
        feature_indices: Vec<usize>,
        feature_changes: Vec<f64>,
    ) -> Self {
        let explanation = format!(
            "Change features {:?} by {:?} to change prediction from {:.2} to {:.2}",
            feature_indices, feature_changes, original, counterfactual
        );

        Self {
            original_prediction: original,
            counterfactual_prediction: counterfactual,
            feature_indices,
            feature_changes,
            explanation,
        }
    }
}

/// Decision node in a tree path
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DecisionNode {
    /// Feature index for this decision
    pub feature_index: usize,

    /// Threshold value
    pub threshold: f64,

    /// Decision made
    pub decision: String,

    /// Sample count at this node
    pub sample_count: usize,

    /// Class distribution at this node
    pub class_distribution: Vec<f64>,
}

impl DecisionNode {
    /// Create a new decision node
    pub fn new(
        feature_index: usize,
        threshold: f64,
        decision: &str,
        sample_count: usize,
        class_distribution: Vec<f64>,
    ) -> Self {
        Self {
            feature_index,
            threshold,
            decision: decision.to_string(),
            sample_count,
            class_distribution,
        }
    }
}

/// Compute SHAP-like feature attribution using Kernel SHAP approximation
///
/// # Arguments
/// * `model` - Model prediction function
/// * `X` - Background dataset (for reference)
/// * `x` - Instance to explain
/// * `n_samples` - Number of samples for approximation
#[wasm_bindgen]
pub fn shap_values(
    X: &[f64],
    x: &[f64],
    n_samples: usize,
    n_features: usize,
    predict_fn: &js_sys::Function,
) -> Result<Vec<f64>, JsError> {
    let mut shap_values = vec![0.0; n_features];

    // Kernel SHAP approximation using weighted linear regression
    // This is a simplified version - full implementation would use:
    // 1. Sample coalitions (feature subsets)
    // 2. Evaluate model on each coalition
    // 3. Weighted linear regression to get SHAP values

    // For now, use a simpler permutation-based approach
    let base_prediction = predict_fn
        .call1(&JsValue::NULL, &JsValue::from_f64(0.0)) // Background prediction placeholder
        .ok()
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0);

    for feature_idx in 0..n_features {
        // Permutation importance: what happens when we remove this feature?
        let mut x_perturbed = x.to_vec();

        // Perturb feature to background mean
        let feature_mean: f64 = (0..n_samples)
            .map(|i| X[i * n_features + feature_idx])
            .sum::<f64>()
            / n_samples as f64;

        x_perturbed[feature_idx] = feature_mean;

        // Get prediction with perturbed feature
        let prediction_perturbed = predict_fn
            .call1(&JsValue::NULL, &JsValue::from_f64(x_perturbed[feature_idx]))
            .ok()
            .and_then(|v| v.as_f64())
            .unwrap_or(0.0);

        // SHAP value = difference in prediction
        shap_values[feature_idx] = base_prediction - prediction_perturbed;
    }

    Ok(shap_values)
}

/// Compute LIME-like local explanation
///
/// # Arguments
/// * `model` - Model prediction function
/// * `x` - Instance to explain
/// * `n_samples` - Number of perturbed samples
#[wasm_bindgen]
pub fn lime_explain(
    x: &[f64],
    n_samples: usize,
    n_features: usize,
    predict_fn: &js_sys::Function,
    kernel_width: f64,
) -> Result<JsValue, JsError> {
    let original_prediction = predict_fn
        .call1(&JsValue::NULL, &JsValue::from_f64(x[0]))
        .ok()
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0);

    let mut feature_importance = vec![0.0; n_features];

    // Generate perturbed samples around instance
    for feature_idx in 0..n_features {
        let mut total_diff = 0.0;

        for _ in 0..n_samples {
            // Perturb this feature
            let perturbation = (js_sys::Math::random() - 0.5) * 2.0 * kernel_width;
            let mut x_perturbed = x.to_vec();
            x_perturbed[feature_idx] += perturbation;

            // Get prediction
            let prediction = predict_fn
                .call1(&JsValue::NULL, &JsValue::from_f64(x_perturbed[feature_idx]))
                .ok()
                .and_then(|v| v.as_f64())
                .unwrap_or(0.0);

            // Accumulate difference
            total_diff += (original_prediction - prediction).abs();
        }

        // Average importance
        feature_importance[feature_idx] = total_diff / n_samples as f64;
    }

    // Normalize to sum to 1
    let sum: f64 = feature_importance.iter().sum();
    if sum > 0.0 {
        for imp in &mut feature_importance {
            *imp /= sum;
        }
    }

    let explanation = Explanation::new(n_features)
        .with_prediction(original_prediction)
        .with_importance(feature_importance)
        .with_confidence(0.8); // Placeholder confidence

    serde_wasm_bindgen::to_value(&explanation)
        .map_err(|e| JsError::new(&format!("Failed to convert explanation: {}", e)))
}

/// Core decision path logic — pure Rust, no WASM bindings.
///
/// Traces a greedy decision path through feature space using a CART-style
/// threshold selection: at each step, pick the feature with the highest
/// absolute value and split at zero. The path ends when all features are used
/// or the instance is "pure" (dominant class probability > 80%).
///
/// Returns `Err` if `x.len() < n_features`.
pub fn decision_path_impl(x: &[f64], n_features: usize) -> Result<Vec<DecisionNode>, String> {
    if x.len() < n_features {
        return Err(format!(
            "x has {} elements but n_features={}",
            x.len(),
            n_features
        ));
    }

    let mut path = Vec::new();
    let mut remaining: Vec<usize> = (0..n_features).collect();
    let mut sample_count = 1000usize;
    let mut class_prob = 0.5f64;

    while !remaining.is_empty() {
        // Pick the feature with the greatest absolute value among remaining
        // (proxy for "most informative split" when no background dataset available)
        let best_idx = remaining
            .iter()
            .copied()
            .max_by(|&a, &b| x[a].abs().partial_cmp(&x[b].abs()).unwrap_or(std::cmp::Ordering::Equal))
            .unwrap();

        remaining.retain(|&f| f != best_idx);

        let val = x[best_idx];
        let threshold = 0.0f64;
        let goes_right = val > threshold;

        let decision = if goes_right {
            format!("feature_{} > {:.4}", best_idx, threshold)
        } else {
            format!("feature_{} <= {:.4}", best_idx, threshold)
        };

        sample_count = (sample_count as f64 * 0.6).max(1.0) as usize;
        class_prob = if goes_right {
            (class_prob + 0.1).min(1.0)
        } else {
            (class_prob - 0.1).max(0.0)
        };

        path.push(DecisionNode::new(
            best_idx,
            threshold,
            &decision,
            sample_count,
            vec![1.0 - class_prob, class_prob],
        ));

        if class_prob > 0.8 || class_prob < 0.2 {
            break;
        }
    }

    Ok(path)
}

/// Get decision path for a tree-based model
///
/// # Arguments
/// * `x` - Instance to trace (length must be `n_features`)
/// * `n_features` - Number of features
#[wasm_bindgen]
pub fn decision_path(x: &[f64], n_features: usize) -> Result<JsValue, JsError> {
    let path = decision_path_impl(x, n_features)
        .map_err(|e| JsError::new(&e))?;

    serde_wasm_bindgen::to_value(&path)
        .map_err(|e| JsError::new(&format!("Failed to convert path: {}", e)))
}

/// Compute prediction interval using bootstrap method
///
/// # Arguments
/// * `predictions` - Collection of predictions (e.g., from bootstrap)
/// * `confidence` - Confidence level (0-1)
#[wasm_bindgen]
pub fn prediction_interval(
    predictions: &[f64],
    confidence: f64,
) -> Result<js_sys::Array, JsError> {
    if predictions.is_empty() {
        return Err(JsError::new("No predictions provided"));
    }

    // Sort predictions
    let mut sorted = predictions.to_vec();
    sorted.sort_by(|a, b| a.partial_cmp(b).unwrap());

    let n = sorted.len();
    let alpha = 1.0 - confidence;
    let lower_idx = ((alpha / 2.0) * n as f64).floor() as usize;
    let upper_idx = ((1.0 - alpha / 2.0) * n as f64).ceil() as usize;

    let lower = sorted[lower_idx.min(n - 1)];
    let upper = sorted[upper_idx.min(n - 1)];

    let result = js_sys::Array::new();
    result.push(&JsValue::from_f64(lower));
    result.push(&JsValue::from_f64(upper));

    Ok(result)
}

/// Generate counterfactual explanation
///
/// # Arguments
/// * `x` - Original instance
/// * `prediction` - Original prediction
/// * `feature_names` - Optional feature names
#[wasm_bindgen]
pub fn generate_counterfactual(
    x: &[f64],
    prediction: f64,
    feature_names: Option<Vec<String>>,
) -> Result<JsValue, JsError> {
    // Find the feature that, when changed, would most impact the prediction
    // This is a simplified version - actual implementation would:
    // 1. Search for minimal changes that flip prediction
    // 2. Use gradient information or genetic algorithms
    // 3. Consider feature constraints and feasibility

    let mut max_impact = 0.0;
    let mut max_feature_idx = 0;
    let mut feature_change = 0.0;

    // Simple heuristic: find feature with largest absolute value
    for (i, &val) in x.iter().enumerate() {
        let impact = val.abs();
        if impact > max_impact {
            max_impact = impact;
            max_feature_idx = i;
            feature_change = -val.signum() * 0.1; // Change by 10%
        }
    }

    let counterfactual_prediction = prediction + (max_impact * 0.1 * prediction.signum());

    let feature_names_vec = feature_names.unwrap_or_else(|| {
        (0..x.len())
            .map(|i| format!("feature_{}", i))
            .collect()
    });

    let explanation = format!(
        "Decrease {} from {:.2} to {:.2} to change prediction from {:.2} to {:.2}",
        feature_names_vec[max_feature_idx],
        x[max_feature_idx],
        x[max_feature_idx] + feature_change,
        prediction,
        counterfactual_prediction
    );

    let counterfactual = Counterfactual {
        original_prediction: prediction,
        counterfactual_prediction,
        feature_indices: vec![max_feature_idx],
        feature_changes: vec![feature_change],
        explanation,
    };

    serde_wasm_bindgen::to_value(&counterfactual)
        .map_err(|e| JsError::new(&format!("Failed to convert counterfactual: {}", e)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_explanation_creation() {
        let explanation = Explanation::new(5)
            .with_prediction(0.85)
            .with_confidence(0.92)
            .with_importance(vec![0.3, 0.2, 0.15, 0.2, 0.15]);

        assert_eq!(explanation.prediction, 0.85);
        assert_eq!(explanation.confidence, 0.92);
        assert_eq!(explanation.feature_importance.len(), 5);
    }

    #[test]
    fn test_counterfactual_creation() {
        let cf = Counterfactual::new(
            0.8,
            0.2,
            vec![0, 2],
            vec![0.5, -0.3],
        );

        assert_eq!(cf.original_prediction, 0.8);
        assert_eq!(cf.counterfactual_prediction, 0.2);
        assert_eq!(cf.feature_indices, vec![0, 2]);
    }

    #[test]
    fn test_prediction_interval() {
        let predictions = vec![0.5, 0.6, 0.55, 0.7, 0.45, 0.65, 0.6];
        let interval = prediction_interval(&predictions, 0.95).unwrap();

        assert_eq!(interval.length(), 2);
        let lower = interval.get(0).as_f64().unwrap();
        let upper = interval.get(1).as_f64().unwrap();

        assert!(lower < upper);
        assert!(lower >= 0.45); // Minimum value
        assert!(upper <= 0.7); // Maximum value
    }

    // ── T006 decision_path tests (use pure decision_path_impl, not WASM binding) ─

    #[test]
    fn test_decision_path_returns_nodes() {
        // A 4-feature instance should produce at least one decision node
        let x = vec![1.0, -2.0, 0.5, -0.1];
        let nodes = decision_path_impl(&x, 4).expect("decision_path_impl should succeed");
        assert!(!nodes.is_empty(), "should return at least one decision node");
    }

    #[test]
    fn test_decision_path_feature_with_largest_abs_chosen_first() {
        // Feature 2 has the largest absolute value (10.0) — should appear first in path
        let x = vec![0.1, 0.2, 10.0, 0.05];
        let nodes = decision_path_impl(&x, 4).unwrap();
        assert_eq!(nodes[0].feature_index, 2, "largest-magnitude feature should be selected first");
    }

    #[test]
    fn test_decision_path_positive_feature_goes_right() {
        // Positive value → decision should include ">"
        let x = vec![5.0];
        let nodes = decision_path_impl(&x, 1).unwrap();
        assert_eq!(nodes.len(), 1);
        assert!(nodes[0].decision.contains('>'), "positive value should take 'goes right' branch");
    }

    #[test]
    fn test_decision_path_negative_feature_goes_left() {
        // Negative value → decision should include "<="
        let x = vec![-3.0];
        let nodes = decision_path_impl(&x, 1).unwrap();
        assert_eq!(nodes.len(), 1);
        assert!(nodes[0].decision.contains("<="), "negative value should take 'goes left' branch");
    }

    #[test]
    fn test_decision_path_error_on_too_short_input() {
        // x shorter than n_features should return an error
        let x = vec![1.0];
        let result = decision_path_impl(&x, 5);
        assert!(result.is_err(), "should error when x.len() < n_features");
    }
}
