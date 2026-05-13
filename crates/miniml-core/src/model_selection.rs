use wasm_bindgen::prelude::*;
use crate::error::MlError;
use crate::matrix::{validate_matrix, euclidean_dist_sq};

/// ROC AUC (Area Under ROC Curve) for binary classification
/// Returns AUC score in [0, 1] where 1 = perfect classifier
#[wasm_bindgen(js_name = "rocAucScore")]
pub fn roc_auc_score(y_true: &[f64], y_scores: &[f64]) -> Result<f64, JsError> {
    if y_true.len() != y_scores.len() {
        return Err(JsError::new("y_true and y_scores must have the same length"));
    }
    if y_true.is_empty() {
        return Err(JsError::new("arrays must not be empty"));
    }

    let auc = roc_auc_impl(y_true, y_scores).map_err(|e| JsError::new(&e.message))?;
    Ok(auc)
}

pub fn roc_auc_impl(y_true: &[f64], y_scores: &[f64]) -> Result<f64, MlError> {
    // Sort by score descending
    let n = y_true.len();
    let mut indexed: Vec<(usize, f64)> = y_scores.iter().enumerate().map(|(i, s)| (i, *s)).collect();
    indexed.sort_unstable_by(|a, b| b.1.partial_cmp(&a.1).unwrap());

    // Calculate AUC using trapezoidal rule
    let mut auc = 0.0;
    let mut tp = 0.0;
    let mut fp = 0.0;
    let mut prev_tp = 0.0;
    let mut prev_fp = 0.0;

    for (idx, _score) in &indexed {
        if y_true[*idx] > 0.5 {
            tp += 1.0;
        } else {
            fp += 1.0;
        }
        // Trapezoid area
        auc += (tp + prev_tp) * (fp - prev_fp) / 2.0;
        prev_tp = tp;
        prev_fp = fp;
    }

    // Normalize by total positives × negatives
    let total_tp = y_true.iter().filter(|&y| *y > 0.5).count() as f64;
    let total_fp = y_true.iter().filter(|&y| *y <= 0.5).count() as f64;

    if total_tp == 0.0 || total_fp == 0.0 {
        return Ok(0.0); // Undefined
    }

    Ok(auc / (total_tp * total_fp))
}

/// Log Loss (Cross-Entropy) for probabilistic classification
#[wasm_bindgen(js_name = "logLoss")]
pub fn log_loss(y_true: &[f64], y_proba: &[f64], n_classes: usize) -> Result<f64, JsError> {
    if y_true.len() != y_proba.len() / n_classes {
        return Err(JsError::new("y_true length must match y_proba rows"));
    }

    let n = y_true.len();
    let mut loss = 0.0;

    for i in 0..n {
        let true_class = y_true[i] as usize;
        if true_class < n_classes {
            let prob = y_proba[i * n_classes + true_class];
            // Clip to avoid log(0)
            let prob_clipped = prob.max(1e-15).min(1.0 - 1e-15);
            loss -= prob_clipped.ln();
        }
    }

    Ok(loss / n as f64)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_perfect_auc() {
        let y_true = vec![0.0, 0.0, 1.0, 1.0];
        let y_scores = vec![0.1, 0.2, 0.9, 1.0];
        let auc = roc_auc_impl(&y_true, &y_scores).unwrap();
        assert!((auc - 1.0).abs() < 1e-10);
    }

    #[test]
    fn test_random_auc() {
        let y_true = vec![0.0, 1.0, 0.0, 1.0];
        let y_scores = vec![0.5, 0.5, 0.5, 0.5];
        let auc = roc_auc_impl(&y_true, &y_scores).unwrap();
        assert_eq!(auc, 0.5);
    }

    #[test]
    fn test_log_loss() {
        let y_true = vec![0.0, 1.0, 0.0, 1.0];
        // Perfect predictions
        let y_proba = vec![0.9, 0.1, 0.8, 0.2];
        let loss = log_loss(&y_true, &y_proba, 2).unwrap();
        // Should be low (good predictions)
        assert!(loss < 1.0);
    }

    #[test]
    fn test_single_class_auc() {
        let y_true = vec![1.0, 1.0, 1.0];
        let y_scores = vec![0.1, 0.5, 0.9];
        let auc = roc_auc_impl(&y_true, &y_scores).unwrap();
        assert_eq!(auc, 0.0); // Undefined, returns 0
    }
}
