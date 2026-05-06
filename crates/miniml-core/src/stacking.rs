//! Ensemble stacking and advanced ensemble methods
//!
//! Provides stacked ensembles, blended ensembles, and voting ensembles.

use crate::error::MlError;
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;
use std::collections::HashMap;
use serde_wasm_bindgen;

/// Voting type for ensemble
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[wasm_bindgen]
pub enum VotingType {
    /// Majority vote (hard voting)
    Hard,

    /// Weighted probability average (soft voting)
    Soft,

    /// User-specified weights
    Weighted,
}

/// Stacked ensemble model
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StackedEnsemble {
    /// Base models
    pub base_models: Vec<String>,

    /// Meta-model (combines base model predictions)
    pub meta_model: String,

    /// Out-of-fold predictions from base models (for training meta-model)
    pub cv_predictions: Vec<Vec<f64>>,

    /// Training metadata
    pub training_metadata: EnsembleMetadata,
}

/// Blended ensemble (weighted average)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BlendedEnsemble {
    /// Base models
    pub base_models: Vec<String>,

    /// Model weights (must sum to 1.0)
    pub weights: Vec<f64>,

    /// Training metadata
    pub training_metadata: EnsembleMetadata,
}

/// Voting ensemble
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VotingEnsemble {
    /// Base models
    pub base_models: Vec<String>,

    /// Voting type
    pub voting_type: VotingType,

    /// User-specified weights (for Weighted voting)
    pub weights: Option<Vec<f64>>,

    /// Training metadata
    pub training_metadata: EnsembleMetadata,
}

/// Ensemble metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnsembleMetadata {
    /// Number of base models
    pub n_models: usize,

    /// Training samples
    pub n_samples: usize,

    /// Cross-validation folds
    pub cv_folds: usize,

    /// Ensemble accuracy
    pub accuracy: Option<f64>,
}

impl StackedEnsemble {
    /// Create a new stacked ensemble
    pub fn new(base_models: Vec<String>, meta_model: String) -> Self {
        let n_models = base_models.len();

        Self {
            base_models,
            meta_model,
            cv_predictions: Vec::new(),
            training_metadata: EnsembleMetadata {
                n_models,
                n_samples: 0,
                cv_folds: 0,
                accuracy: None,
            },
        }
    }

    /// Set cross-validation predictions
    pub fn with_cv_predictions(mut self, predictions: Vec<Vec<f64>>) -> Self {
        self.cv_predictions = predictions;
        self
    }

    /// Predict using stacked ensemble
    pub fn predict(&self, base_predictions: &[f64]) -> f64 {
        // In production, would use meta_model to combine predictions
        // For now, use simple average
        base_predictions.iter().sum::<f64>() / base_predictions.len() as f64
    }
}

impl BlendedEnsemble {
    /// Create a new blended ensemble
    pub fn new(base_models: Vec<String>, weights: Vec<f64>) -> Result<Self, MlError> {
        if base_models.len() != weights.len() {
            return Err(MlError::new(
                "Number of models must equal number of weights".to_string(),
            ));
        }

        let weight_sum: f64 = weights.iter().sum();

        if (weight_sum - 1.0).abs() > 1e-6 {
            return Err(MlError::new(format!(
                "Weights must sum to 1.0, got {}",
                weight_sum
            )));
        }

        let n_models = base_models.len();

        Ok(Self {
            base_models,
            weights,
            training_metadata: EnsembleMetadata {
                n_models,
                n_samples: 0,
                cv_folds: 0,
                accuracy: None,
            },
        })
    }

    /// Predict using blended ensemble
    pub fn predict(&self, base_predictions: &[f64]) -> f64 {
        base_predictions
            .iter()
            .zip(self.weights.iter())
            .map(|(&pred, &weight)| pred * weight)
            .sum()
    }
}

impl VotingEnsemble {
    /// Create a new voting ensemble
    pub fn new(base_models: Vec<String>, voting_type: VotingType) -> Self {
        let n_models = base_models.len();

        Self {
            base_models,
            voting_type,
            weights: None,
            training_metadata: EnsembleMetadata {
                n_models,
                n_samples: 0,
                cv_folds: 0,
                accuracy: None,
            },
        }
    }

    /// Set custom weights for weighted voting
    pub fn with_weights(mut self, weights: Vec<f64>) -> Result<Self, MlError> {
        if self.voting_type != VotingType::Weighted {
            return Err(MlError::new(
                "Weights can only be set for Weighted voting".to_string(),
            ));
        }

        if weights.len() != self.base_models.len() {
            return Err(MlError::new(
                "Number of weights must equal number of models".to_string(),
            ));
        }

        self.weights = Some(weights);
        Ok(self)
    }

    /// Predict using voting ensemble
    pub fn predict(&self, base_predictions: &[f64]) -> f64 {
        match self.voting_type {
            VotingType::Hard => {
                // Majority vote
                let mut counts: HashMap<i32, usize> = HashMap::new();

                for &pred in base_predictions {
                    let class = pred.round() as i32;
                    *counts.entry(class).or_insert(0) += 1;
                }

                // Find class with most votes
                counts
                    .into_iter()
                    .max_by(|a, b| a.1.cmp(&b.1))
                    .map(|(class, _)| class as f64)
                    .unwrap_or(0.0)
            }
            VotingType::Soft => {
                // Weighted probability average
                base_predictions.iter().sum::<f64>() / base_predictions.len() as f64
            }
            VotingType::Weighted => {
                // User-specified weights
                if let Some(ref weights) = self.weights {
                    base_predictions
                        .iter()
                        .zip(weights.iter())
                        .map(|(&pred, &weight)| pred * weight)
                        .sum()
                } else {
                    // Fallback to simple average
                    base_predictions.iter().sum::<f64>() / base_predictions.len() as f64
                }
            }
        }
    }
}

/// Create a stacked ensemble
///
/// # Arguments
/// * `base_models` - List of base model names
/// * `meta_model` - Meta-model name
/// * `X` - Training data (n_samples × n_features)
/// * `y` - Training labels
/// * `cv_folds` - Number of cross-validation folds
/// * `n_samples` - Number of samples
/// * `n_features` - Number of features
#[wasm_bindgen]
pub fn stacked_ensemble(
    base_models: Vec<String>,
    meta_model: String,
    X: &[f64],
    y: &[f64],
    cv_folds: usize,
    n_samples: usize,
    n_features: usize,
) -> Result<JsValue, JsError> {
    let n_models = base_models.len();

    // Generate out-of-fold predictions for each base model
    let fold_size = n_samples / cv_folds;

    let mut cv_predictions = Vec::new();

    for _model_idx in 0..n_models {
        let mut model_preds = Vec::new();

        for fold in 0..cv_folds {
            let test_start = fold * fold_size;
            let test_end = test_start + fold_size;

            // Simplified: use actual values as predictions
            // In production, would get predictions from actual models
            for i in test_start..test_end.min(n_samples) {
                model_preds.push(y[i]);
            }
        }

        cv_predictions.push(model_preds);
    }

    let ensemble = StackedEnsemble::new(base_models, meta_model)
        .with_cv_predictions(cv_predictions);

    serde_wasm_bindgen::to_value(&ensemble)
        .map_err(|e| JsError::new(&format!("Failed to convert ensemble: {}", e)))
}

/// Create a blended ensemble
///
/// # Arguments
/// * `models` - List of model names
/// * `weights` - Model weights (must sum to 1.0)
#[wasm_bindgen]
pub fn blend_ensemble(models: Vec<String>, weights: Vec<f64>) -> Result<JsValue, JsError> {
    let ensemble = BlendedEnsemble::new(models, weights)
        .map_err(|e| JsError::new(&format!("Failed to create ensemble: {}", e)))?;
    serde_wasm_bindgen::to_value(&ensemble)
        .map_err(|e| JsError::new(&format!("Failed to convert ensemble: {}", e)))
}

/// Create a voting ensemble
///
/// # Arguments
/// * `models` - List of model names
/// * `voting` - Voting type
/// * `weights` - Optional weights (for Weighted voting)
#[wasm_bindgen]
pub fn voting_ensemble(
    models: Vec<String>,
    voting: VotingType,
    weights: Option<Vec<f64>>,
) -> Result<JsValue, JsError> {
    let mut ensemble = VotingEnsemble::new(models, voting);

    if let Some(w) = weights {
        ensemble = ensemble.with_weights(w)
            .map_err(|e| JsError::new(&format!("Failed to set weights: {}", e)))?;
    }

    serde_wasm_bindgen::to_value(&ensemble)
        .map_err(|e| JsError::new(&format!("Failed to convert ensemble: {}", e)))
}

/// Compute ensemble weights based on validation performance
///
/// # Arguments
/// * `validation_scores` - Validation scores for each model
/// * `weighting_method` - Method for computing weights
#[wasm_bindgen]
pub fn compute_ensemble_weights(
    validation_scores: &[f64],
    weighting_method: &str,
) -> Result<Vec<f64>, JsError> {
    let n = validation_scores.len();

    if n == 0 {
        return Err(JsError::new("No validation scores provided"));
    }

    let weights = match weighting_method {
        "uniform" => vec![1.0; n],
        "performance" => {
            // Weight by performance (normalize scores)
            let sum: f64 = validation_scores.iter().sum();
            if sum == 0.0 {
                return Err(JsError::new("Sum of validation scores is zero"));
            }
            validation_scores.iter().map(|&s| s / sum).collect()
        }
        "softmax" => {
            // Softmax weighting
            let max_score = validation_scores
                .iter()
                .fold(f64::NEG_INFINITY, |a, b| a.max(*b));

            let exp_sum: f64 = validation_scores
                .iter()
                .map(|&s| (s - max_score).exp())
                .sum();

            if exp_sum == 0.0 {
                return Err(JsError::new("Softmax sum is zero"));
            }

            validation_scores
                .iter()
                .map(|&s| (s - max_score).exp() / exp_sum)
                .collect()
        }
        _ => {
            return Err(JsError::new("Unknown weighting method"));
        }
    };

    Ok(weights)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_stacked_ensemble() {
        let base_models = vec!["Model1".to_string(), "Model2".to_string()];
        let ensemble = StackedEnsemble::new(base_models.clone(), "LogisticRegression".to_string());

        assert_eq!(ensemble.base_models, base_models);
        assert_eq!(ensemble.meta_model, "LogisticRegression");
    }

    #[test]
    fn test_blended_ensemble() {
        let models = vec!["Model1".to_string(), "Model2".to_string()];
        let weights = vec![0.6, 0.4];

        let ensemble = BlendedEnsemble::new(models, weights).unwrap();

        assert_eq!(ensemble.weights, vec![0.6, 0.4]);

        // Test prediction
        let predictions = vec![1.0, 2.0];
        let result = ensemble.predict(&predictions);

        assert_eq!(result, 1.0 * 0.6 + 2.0 * 0.4);
    }

    #[test]
    fn test_blended_ensemble_invalid_weights() {
        let models = vec!["Model1".to_string(), "Model2".to_string()];
        let weights = vec![0.6, 0.3]; // Doesn't sum to 1.0

        let result = BlendedEnsemble::new(models, weights);
        assert!(result.is_err());
    }

    #[test]
    fn test_voting_ensemble_hard() {
        let models = vec!["Model1".to_string(), "Model2".to_string(), "Model3".to_string()];
        let ensemble = VotingEnsemble::new(models, VotingType::Hard);

        let predictions = vec![0.0, 1.0, 1.0]; // Two votes for class 1

        let result = ensemble.predict(&predictions);

        assert_eq!(result, 1.0); // Class 1 wins
    }

    #[test]
    fn test_voting_ensemble_soft() {
        let models = vec!["Model1".to_string(), "Model2".to_string()];
        let ensemble = VotingEnsemble::new(models, VotingType::Soft);

        let predictions = vec![0.3, 0.7];

        let result = ensemble.predict(&predictions);

        assert_eq!(result, 0.5); // Average
    }

    #[test]
    fn test_voting_ensemble_weighted() {
        let models = vec!["Model1".to_string(), "Model2".to_string()];
        let ensemble = VotingEnsemble::new(models, VotingType::Weighted)
            .with_weights(vec![0.7, 0.3])
            .unwrap();

        let predictions = vec![1.0, 0.0];

        let result = ensemble.predict(&predictions);

        assert_eq!(result, 0.7); // Weighted sum
    }

    #[test]
    fn test_compute_ensemble_weights_uniform() {
        let scores = vec![0.8, 0.9, 0.7];
        let weights = compute_ensemble_weights(&scores, "uniform").unwrap();

        assert_eq!(weights, vec![1.0, 1.0, 1.0]);
    }

    #[test]
    fn test_compute_ensemble_weights_performance() {
        let scores = vec![0.8, 0.9, 0.7];
        let weights = compute_ensemble_weights(&scores, "performance").unwrap();

        let sum: f64 = weights.iter().sum();
        assert!((sum - 1.0).abs() < 1e-6);
        assert_eq!(weights[1], 0.9 / (0.8 + 0.9 + 0.7)); // Highest score gets highest weight
    }

    #[test]
    fn test_compute_ensemble_weights_softmax() {
        let scores = vec![0.8, 0.9, 0.7];
        let weights = compute_ensemble_weights(&scores, "softmax").unwrap();

        let sum: f64 = weights.iter().sum();
        assert!((sum - 1.0).abs() < 1e-6);
        assert!(weights[1] > weights[0]); // Highest score gets highest weight
        assert!(weights[1] > weights[2]); // Lowest score gets lowest weight
    }
}
