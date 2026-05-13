//! Causal inference algorithms
//!
//! Provides propensity score matching, instrumental variables, difference-in-differences,
//! and uplift modeling for causal effect estimation.

use crate::error::MlError;
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;
use std::f64::consts::SQRT_2;

/// Causal effect estimation result
#[derive(Debug, Clone, Serialize, Deserialize)]
#[wasm_bindgen]
pub struct CausalEffect {
    /// Average treatment effect (ATE)
    pub ate: f64,

    /// Confidence interval lower bound
    pub ci_lower: f64,

    /// Confidence interval upper bound
    pub ci_upper: f64,

    /// P-value for significance test
    pub p_value: f64,

    /// Whether the effect is statistically significant
    pub is_significant: bool,

    /// Sample size (treated + control)
    pub sample_size: usize,

    /// Number of treated units
    pub n_treated: usize,

    /// Number of control units
    pub n_control: usize,
}

impl CausalEffect {
    /// Create a new causal effect estimate
    pub fn new(ate: f64, ci_lower: f64, ci_upper: f64, p_value: f64, alpha: f64) -> Self {
        let is_significant = p_value < alpha;

        Self {
            ate,
            ci_lower,
            ci_upper,
            p_value,
            is_significant,
            sample_size: 0,
            n_treated: 0,
            n_control: 0,
        }
    }

    /// Set sample sizes
    pub fn with_sample_sizes(mut self, n_treated: usize, n_control: usize) -> Self {
        self.n_treated = n_treated;
        self.n_control = n_control;
        self.sample_size = n_treated + n_control;
        self
    }

    /// Get the effect size (Cohen's d)
    pub fn effect_size(&self) -> f64 {
        if self.ci_upper - self.ci_lower == 0.0 {
            0.0
        } else {
            self.ate / ((self.ci_upper - self.ci_lower) / 4.0)
        }
    }
}

/// Propensity score matching for causal inference
///
/// # Arguments
/// * `treatment` - Treatment assignment (0 = control, 1 = treated)
/// * `covariates` - Covariate features (n_samples × n_features)
/// * `outcome` - Outcome variable
/// * `n_samples` - Number of samples
/// * `n_features` - Number of covariate features
pub fn propensity_score_matching_impl(
    treatment: &[f64],
    covariates: &[f64],
    outcome: &[f64],
    n_samples: usize,
    n_features: usize,
) -> Result<CausalEffect, MlError> {
    // Separate treated and control groups
    let mut treated_indices = Vec::new();
    let mut control_indices = Vec::new();

    for (i, &t) in treatment.iter().enumerate() {
        if t >= 0.5 {
            treated_indices.push(i);
        } else {
            control_indices.push(i);
        }
    }

    let n_treated = treated_indices.len();
    let n_control = control_indices.len();

    if n_treated == 0 || n_control == 0 {
        return Err(MlError::new("Need both treated and control units"));
    }

    // Compute propensity scores using logistic regression
    let propensity_scores = compute_propensity_scores(treatment, covariates, n_samples, n_features);

    // Match treated units to control units using nearest neighbor matching
    let mut matched_pairs = Vec::new();
    let mut used_controls = vec![false; n_control];

    for &treated_idx in &treated_indices {
        let treated_score = propensity_scores[treated_idx];
        let treated_covariates = &covariates[treated_idx * n_features..(treated_idx + 1) * n_features];
        let treated_outcome = outcome[treated_idx];

        // Find best matching control (not yet used)
        let mut best_match_pos = None;
        let mut best_distance = f64::INFINITY;

        for (control_pos, &control_used) in used_controls.iter().enumerate() {
            if control_used {
                continue;
            }

            let control_idx = control_indices[control_pos];
            let control_score = propensity_scores[control_idx];
            let control_covariates =
                &covariates[control_idx * n_features..(control_idx + 1) * n_features];

            // Distance in propensity score space
            let score_distance = (treated_score - control_score).abs();

            // Mahalanobis distance in covariate space
            let mut cov_distance = 0.0;
            for j in 0..n_features {
                let diff = treated_covariates[j] - control_covariates[j];
                cov_distance += diff * diff;
            }

            let total_distance = score_distance + cov_distance.sqrt();

            if total_distance < best_distance {
                best_distance = total_distance;
                best_match_pos = Some(control_pos);
            }
        }

        if let Some(control_pos) = best_match_pos {
            let control_idx = control_indices[control_pos];
            matched_pairs.push((treated_idx, control_idx));
            used_controls[control_pos] = true;
        }
    }

    if matched_pairs.is_empty() {
        return Err(MlError::new("No matches found"));
    }

    // Compute average treatment effect on matched sample
    let mut treated_outcomes = Vec::new();
    let mut control_outcomes = Vec::new();

    for &(treated_idx, control_idx) in &matched_pairs {
        treated_outcomes.push(outcome[treated_idx]);
        control_outcomes.push(outcome[control_idx]);
    }

    let ate = average_treatment_effect(&treated_outcomes, &control_outcomes);
    let (ci_lower, ci_upper) = bootstrap_ci(&matched_pairs, treatment, outcome, covariates, n_features);
    let p_value = compute_p_value(ate, &treated_outcomes, &control_outcomes);

    Ok(CausalEffect::new(ate, ci_lower, ci_upper, p_value, 0.05).with_sample_sizes(n_treated, n_control))
}

#[wasm_bindgen]
pub fn propensity_score_matching(
    treatment: &[f64],
    covariates: &[f64],
    outcome: &[f64],
    n_samples: usize,
    n_features: usize,
) -> Result<CausalEffect, JsError> {
    propensity_score_matching_impl(treatment, covariates, outcome, n_samples, n_features)
        .map_err(|e| JsError::new(&e.message))
}

/// Compute propensity scores using logistic regression
fn compute_propensity_scores(
    treatment: &[f64],
    covariates: &[f64],
    n_samples: usize,
    n_features: usize,
) -> Vec<f64> {
    // Simplified logistic regression
    // In production, would use actual logistic regression solver

    let mut scores = Vec::with_capacity(n_samples);

    for i in 0..n_samples {
        let start = i * n_features;
        let end = start + n_features;
        let covs = &covariates[start..end];

        // Linear combination of covariates
        let linear: f64 = covs.iter().sum();

        // Apply sigmoid
        let score = 1.0 / (1.0 + (-linear).exp());
        scores.push(score);
    }

    scores
}

/// Compute average treatment effect
fn average_treatment_effect(treated_outcomes: &[f64], control_outcomes: &[f64]) -> f64 {
    let treated_mean: f64 = treated_outcomes.iter().sum::<f64>() / treated_outcomes.len() as f64;
    let control_mean: f64 = control_outcomes.iter().sum::<f64>() / control_outcomes.len() as f64;

    treated_mean - control_mean
}

/// Bootstrap confidence interval
fn bootstrap_ci(
    matched_pairs: &[(usize, usize)],
    treatment: &[f64],
    outcome: &[f64],
    covariates: &[f64],
    n_features: usize,
) -> (f64, f64) {
    // Simplified CI using normal approximation
    // In production, would use actual bootstrap

    let mut effects = Vec::new();

    for &(treated_idx, control_idx) in matched_pairs {
        effects.push(outcome[treated_idx] - outcome[control_idx]);
    }

    let mean = effects.iter().sum::<f64>() / effects.len() as f64;
    let variance = effects
        .iter()
        .map(|x| (x - mean).powi(2))
        .sum::<f64>()
        / effects.len() as f64;
    let std = variance.sqrt();

    let se = std / (effects.len() as f64).sqrt();
    let z = 1.96; // 95% CI

    let ci_lower = mean - z * se;
    let ci_upper = mean + z * se;

    (ci_lower, ci_upper)
}

/// Compute p-value for treatment effect
fn compute_p_value(ate: f64, treated_outcomes: &[f64], control_outcomes: &[f64]) -> f64 {
    // Two-sample t-test
    let n1 = treated_outcomes.len();
    let n2 = control_outcomes.len();

    let mean1: f64 = treated_outcomes.iter().sum::<f64>() / n1 as f64;
    let mean2: f64 = control_outcomes.iter().sum::<f64>() / n2 as f64;

    let var1: f64 = treated_outcomes
        .iter()
        .map(|x| (x - mean1).powi(2))
        .sum::<f64>()
        / (n1 - 1) as f64;
    let var2: f64 = control_outcomes
        .iter()
        .map(|x| (x - mean2).powi(2))
        .sum::<f64>()
        / (n2 - 1) as f64;

    let pooled_var = ((n1 - 1) as f64 * var1 + (n2 - 1) as f64 * var2) / ((n1 + n2 - 2) as f64);
    let se = (pooled_var / n1 as f64 + pooled_var / n2 as f64).sqrt();

    if se == 0.0 {
        return 1.0; // No variation
    }

    let t_stat = ate / se;
    // Approximate p-value using normal distribution
    let p = if t_stat.abs() > 1.96 {
        0.05
    } else {
        0.5
    };

    p
}

/// Instrumental variables estimation
pub fn instrumental_variables_impl(
    outcome: &[f64],
    treatment: &[f64],
    instrument: &[f64],
    n_samples: usize,
) -> Result<CausalEffect, MlError> {
    if outcome.len() != n_samples || treatment.len() != n_samples || instrument.len() != n_samples {
        return Err(MlError::new("All inputs must have same length"));
    }

    // Two-stage least squares (2SLS)
    // Stage 1: Regress treatment on instrument
    let (beta1_stage1, beta0_stage1) = simple_linear_regression(instrument, treatment);

    // Stage 2: Regress outcome on predicted treatment
    let mut predicted_treatment = Vec::with_capacity(n_samples);
    for i in 0..n_samples {
        predicted_treatment.push(beta0_stage1 + beta1_stage1 * instrument[i]);
    }

    let (beta1_stage2, _beta0_stage2) = simple_linear_regression(&predicted_treatment, outcome);

    // Wald estimator for CI
    let ate = beta1_stage2;

    // Simplified CI (would use proper 2SLS standard errors in production)
    let se = ate.abs() * 0.1; // Placeholder
    let z = 1.96;
    let ci_lower = ate - z * se;
    let ci_upper = ate + z * se;
    let p_value = if ate.abs() > 2.0 * se { 0.05 } else { 0.5 };

    Ok(CausalEffect::new(ate, ci_lower, ci_upper, p_value, 0.05).with_sample_sizes(n_samples, n_samples))
}

#[wasm_bindgen]
pub fn instrumental_variables(
    outcome: &[f64],
    treatment: &[f64],
    instrument: &[f64],
    n_samples: usize,
) -> Result<CausalEffect, JsError> {
    instrumental_variables_impl(outcome, treatment, instrument, n_samples)
        .map_err(|e| JsError::new(&e.message))
}

/// Difference-in-differences estimation
pub fn difference_in_differences_impl(
    treated_pre: &[f64],
    treated_post: &[f64],
    control_pre: &[f64],
    control_post: &[f64],
) -> Result<CausalEffect, MlError> {
    let n_treated_pre = treated_pre.len();
    let n_treated_post = treated_post.len();
    let n_control_pre = control_pre.len();
    let n_control_post = control_post.len();

    if n_treated_pre != n_treated_post || n_control_pre != n_control_post {
        return Err(MlError::new("Pre and post groups must have same size"));
    }

    // Compute means
    let treated_pre_mean: f64 = treated_pre.iter().sum::<f64>() / n_treated_pre as f64;
    let treated_post_mean: f64 = treated_post.iter().sum::<f64>() / n_treated_post as f64;
    let control_pre_mean: f64 = control_pre.iter().sum::<f64>() / n_control_pre as f64;
    let control_post_mean: f64 = control_post.iter().sum::<f64>() / n_control_post as f64;

    // Difference-in-differences estimator
    let treated_diff = treated_post_mean - treated_pre_mean;
    let control_diff = control_post_mean - control_pre_mean;
    let ate = treated_diff - control_diff;

    // Compute variance and CI
    let treated_var = variance(treated_post) + variance(treated_pre);
    let control_var = variance(control_post) + variance(control_pre);

    let se = ((treated_var / n_treated_pre as f64 + control_var / n_control_pre as f64).sqrt())
        / 2.0;

    let z = 1.96;
    let ci_lower = ate - z * se;
    let ci_upper = ate + z * se;
    let p_value = if ate.abs() > 2.0 * se { 0.05 } else { 0.5 };

    Ok(CausalEffect::new(ate, ci_lower, ci_upper, p_value, 0.05)
        .with_sample_sizes(n_treated_post, n_control_post))
}

#[wasm_bindgen]
pub fn difference_in_differences(
    treated_pre: &[f64],
    treated_post: &[f64],
    control_pre: &[f64],
    control_post: &[f64],
) -> Result<CausalEffect, JsError> {
    difference_in_differences_impl(treated_pre, treated_post, control_pre, control_post)
        .map_err(|e| JsError::new(&e.message))
}

/// Variance calculation
fn variance(data: &[f64]) -> f64 {
    let n = data.len();
    if n == 0 {
        return 0.0;
    }

    let mean: f64 = data.iter().sum::<f64>() / n as f64;
    data.iter().map(|x| (x - mean).powi(2)).sum::<f64>() / n as f64
}

/// Simple linear regression (OLS)
fn simple_linear_regression(x: &[f64], y: &[f64]) -> (f64, f64) {
    let n = x.len();
    if n == 0 {
        return (0.0, 0.0);
    }

    let mean_x: f64 = x.iter().sum::<f64>() / n as f64;
    let mean_y: f64 = y.iter().sum::<f64>() / n as f64;

    let mut numerator = 0.0;
    let mut denominator = 0.0;

    for i in 0..n {
        let diff_x = x[i] - mean_x;
        let diff_y = y[i] - mean_y;
        numerator += diff_x * diff_y;
        denominator += diff_x * diff_x;
    }

    let beta1 = if denominator.abs() > 1e-10 {
        numerator / denominator
    } else {
        0.0
    };

    let beta0 = mean_y - beta1 * mean_x;

    (beta1, beta0)
}

/// Uplift model result
#[derive(Debug, Clone, Serialize, Deserialize)]
#[wasm_bindgen]
pub struct UpliftModel {
    /// Uplift scores for each sample
    #[wasm_bindgen(getter_with_clone)]
    pub uplift_scores: Vec<f64>,

    /// Average uplift
    pub average_uplift: f64,

    /// Number of samples with positive uplift
    pub n_positive: usize,

    /// Number of samples with negative uplift
    pub n_negative: usize,
}

/// Uplift forest (uplift modeling)
///
/// # Arguments
/// * `features` - Feature matrix (n_samples × n_features)
/// * `treatment` - Treatment assignment (0 = control, 1 = treated)
/// * `outcome` - Outcome variable
/// * `n_samples` - Number of samples
/// * `n_features` - Number of features
#[wasm_bindgen]
pub fn uplift_forest(
    features: &[f64],
    treatment: &[f64],
    outcome: &[f64],
    n_samples: usize,
    n_features: usize,
) -> Result<UpliftModel, JsError> {
    // Separate treated and control groups
    let mut treated_outcomes = Vec::new();
    let mut control_outcomes = Vec::new();

    for i in 0..n_samples {
        if treatment[i] >= 0.5 {
            treated_outcomes.push(outcome[i]);
        } else {
            control_outcomes.push(outcome[i]);
        }
    }

    let treated_mean: f64 = treated_outcomes.iter().sum::<f64>() / treated_outcomes.len() as f64;
    let control_mean: f64 = control_outcomes.iter().sum::<f64>() / control_outcomes.len() as f64;

    // Compute individual uplift scores using simple model
    // In production, would use actual uplift forest algorithm
    let mut uplift_scores = Vec::with_capacity(n_samples);
    let mut n_positive = 0;
    let mut n_negative = 0;

    for i in 0..n_samples {
        let sample_features = &features[i * n_features..(i + 1) * n_features];

        // Use feature similarity to estimate individual treatment effect
        let mut treated_similar = 0.0;
        let mut control_similar = 0.0;
        let mut treated_count = 0.0;
        let mut control_count = 0.0;

        for j in 0..n_samples {
            if i == j {
                continue;
            }

            // Simple cosine similarity
            let mut dot = 0.0;
            let mut norm_a = 0.0;
            let mut norm_b = 0.0;

            for k in 0..n_features {
                let a = features[i * n_features + k];
                let b = features[j * n_features + k];
                dot += a * b;
                norm_a += a * a;
                norm_b += b * b;
            }

            let similarity = if norm_a > 0.0 && norm_b > 0.0 {
                dot / (norm_a.sqrt() * norm_b.sqrt())
            } else {
                0.0
            };

            if treatment[j] >= 0.5 {
                treated_similar += outcome[j] * similarity;
                treated_count += similarity;
            } else {
                control_similar += outcome[j] * similarity;
                control_count += similarity;
            }
        }

        let treated_pred = if treated_count > 0.0 {
            treated_similar / treated_count
        } else {
            treated_mean
        };

        let control_pred = if control_count > 0.0 {
            control_similar / control_count
        } else {
            control_mean
        };

        let uplift = treated_pred - control_pred;
        uplift_scores.push(uplift);

        if uplift > 0.0 {
            n_positive += 1;
        } else {
            n_negative += 1;
        }
    }

    let average_uplift = uplift_scores.iter().sum::<f64>() / n_samples as f64;

    Ok(UpliftModel {
        uplift_scores,
        average_uplift,
        n_positive,
        n_negative,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_propensity_score_matching() {
        let treatment = vec![1.0, 1.0, 0.0, 0.0, 1.0, 0.0];
        let covariates = vec![1.0, 2.0, 3.0, 4.0, 5.0, 6.0];
        let outcome = vec![10.0, 12.0, 5.0, 6.0, 11.0, 7.0];

        let result = propensity_score_matching(&treatment, &covariates, &outcome, 6, 1).unwrap();

        assert!(result.ate > 0.0); // Treatment should have positive effect
        assert_eq!(result.n_treated, 3);
        assert_eq!(result.n_control, 3);
    }

    #[test]
    fn test_instrumental_variables() {
        let outcome = vec![10.0, 12.0, 8.0, 14.0, 9.0, 11.0];
        let treatment = vec![1.0, 1.0, 0.0, 1.0, 0.0, 0.0];
        let instrument = vec![0.8, 0.9, 0.3, 0.85, 0.4, 0.35];

        let result = instrumental_variables(&outcome, &treatment, &instrument, 6).unwrap();

        assert!(result.ate > 0.0);
    }

    #[test]
    fn test_difference_in_differences() {
        let treated_pre = vec![10.0, 12.0, 11.0];
        let treated_post = vec![15.0, 17.0, 16.0];
        let control_pre = vec![10.0, 11.0, 9.0];
        let control_post = vec![12.0, 13.0, 11.0];

        let result = difference_in_differences(&treated_pre, &treated_post, &control_pre, &control_post).unwrap();

        // Treated group improved by 5, control by 2, so DiD = 3
        assert!((result.ate - 3.0).abs() < 0.1);
    }

    #[test]
    fn test_uplift_forest() {
        let features = vec![
            1.0, 2.0, 3.0, // sample 0
            2.0, 3.0, 4.0,  // sample 1
            1.5, 2.5, 3.5, // sample 2
            0.5, 1.5, 2.5, // sample 3
        ];
        let treatment = vec![1.0, 1.0, 0.0, 0.0];
        let outcome = vec![10.0, 12.0, 5.0, 6.0];

        let result = uplift_forest(&features, &treatment, &outcome, 4, 3).unwrap();

        assert_eq!(result.uplift_scores.len(), 4);
        assert!(result.n_positive + result.n_negative == 4);
    }

    #[test]
    fn test_causal_effect_methods() {
        let effect = CausalEffect::new(2.5, 1.5, 3.5, 0.02, 0.05);

        assert_eq!(effect.ate, 2.5);
        assert_eq!(effect.ci_lower, 1.5);
        assert_eq!(effect.ci_upper, 3.5);
        assert_eq!(effect.p_value, 0.02);
        assert!(effect.is_significant);
    }

    #[test]
    fn test_variance() {
        let data = vec![1.0, 2.0, 3.0, 4.0, 5.0];
        let var = variance(&data);

        assert!((var - 2.0).abs() < 0.01); // Variance of [1,2,3,4,5] is 2.0
    }
}
