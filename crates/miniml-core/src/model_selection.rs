use wasm_bindgen::prelude::*;
use crate::error::MlError;

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
    let total_tp = y_true.iter().filter(|&y| *y > 0.5).count() as f64;
    let total_fp = y_true.iter().filter(|&y| *y <= 0.5).count() as f64;

    if total_tp == 0.0 || total_fp == 0.0 {
        return Ok(0.0); // Undefined
    }

    // Sort by score descending.
    let mut indexed: Vec<(usize, f64)> = y_scores.iter().enumerate().map(|(i, s)| (i, *s)).collect();
    indexed.sort_unstable_by(|a, b| b.1.partial_cmp(&a.1).unwrap());

    // Process tied-score groups together so the trapezoidal area is symmetric.
    // Without this, a random classifier (all equal scores) gives 0.25 instead of 0.5
    // because point-by-point accumulation treats ties asymmetrically.
    let mut auc = 0.0;
    let mut tp = 0.0;
    let mut _fp = 0.0;
    let n = indexed.len();
    let mut i = 0;

    while i < n {
        // Find the end of the current tie group
        let mut j = i + 1;
        while j < n && (indexed[j].1 - indexed[i].1).abs() < f64::EPSILON {
            j += 1;
        }

        // Count TPs and FPs in this tie group
        let mut group_tp = 0.0;
        let mut group_fp = 0.0;
        for k in i..j {
            if y_true[indexed[k].0] > 0.5 {
                group_tp += 1.0;
            } else {
                group_fp += 1.0;
            }
        }

        // Trapezoidal area for this group:
        // The ROC curve advances both TPR and FPR simultaneously within a tie group.
        // Area = (prev_tp + group_tp/2) / total_tp * (group_fp / total_fp) * total_tp * total_fp
        //      = (2*tp + group_tp) * group_fp / 2  (before normalising)
        auc += (2.0 * tp + group_tp) * group_fp / 2.0;

        tp += group_tp;
        _fp += group_fp;
        i = j;
    }

    Ok(auc / (total_tp * total_fp))
}

/// Log Loss (Cross-Entropy) for probabilistic classification — pure-Rust impl.
pub fn log_loss_impl(y_true: &[f64], y_proba: &[f64], n_classes: usize) -> Result<f64, MlError> {
    if n_classes == 0 {
        return Err(MlError::new("n_classes must be at least 1"));
    }
    if y_true.len() != y_proba.len() / n_classes {
        return Err(MlError::new("y_true length must match y_proba rows"));
    }

    let n = y_true.len();
    let mut loss = 0.0;

    for i in 0..n {
        let true_class = y_true[i] as usize;
        if true_class < n_classes {
            let prob = y_proba[i * n_classes + true_class];
            // Clip to avoid log(0)
            let prob_clipped = prob.clamp(1e-15, 1.0 - 1e-15);
            loss -= prob_clipped.ln();
        }
    }

    Ok(loss / n as f64)
}

/// Log Loss (Cross-Entropy) for probabilistic classification
#[wasm_bindgen(js_name = "logLoss")]
pub fn log_loss(y_true: &[f64], y_proba: &[f64], n_classes: usize) -> Result<f64, JsError> {
    log_loss_impl(y_true, y_proba, n_classes).map_err(|e| JsError::new(&e.message))
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
        // A classifier that assigns the same score to all samples is random.
        // The AUC of a random classifier must equal 0.5 regardless of label order.
        let y_true = vec![0.0, 1.0, 0.0, 1.0];
        let y_scores = vec![0.5, 0.5, 0.5, 0.5];
        let auc = roc_auc_impl(&y_true, &y_scores).unwrap();
        assert!(
            (auc - 0.5).abs() < 1e-10,
            "Random classifier AUC must be 0.5 (got {})", auc
        );
    }

    #[test]
    fn test_log_loss() {
        let y_true = vec![0.0, 1.0, 0.0, 1.0];
        // y_proba layout: [p(c0|s), p(c1|s)] per sample
        // Good predictions: high prob for the correct class.
        let y_proba = vec![
            0.9, 0.1,  // sample 0, true class 0 -> prob 0.9
            0.1, 0.9,  // sample 1, true class 1 -> prob 0.9
            0.8, 0.2,  // sample 2, true class 0 -> prob 0.8
            0.2, 0.8,  // sample 3, true class 1 -> prob 0.8
        ];
        // Use the pure-Rust impl to avoid wasm-bindgen panic on native targets.
        let loss = log_loss_impl(&y_true, &y_proba, 2).unwrap();
        assert!(loss < 0.5, "Good predictions should yield low loss (got {})", loss);
    }

    #[test]
    fn test_single_class_auc() {
        let y_true = vec![1.0, 1.0, 1.0];
        let y_scores = vec![0.1, 0.5, 0.9];
        let auc = roc_auc_impl(&y_true, &y_scores).unwrap();
        assert_eq!(auc, 0.0); // Undefined, returns 0
    }
}
