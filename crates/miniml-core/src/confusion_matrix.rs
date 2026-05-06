use wasm_bindgen::prelude::*;
use crate::error::MlError;

/// Build confusion matrix from true and predicted labels.
/// Returns: [n_classes, class_0, class_1, ..., matrix_flat (n_classes × n_classes)]
pub fn confusion_matrix_impl(y_true: &[f64], y_pred: &[f64]) -> Result<Vec<f64>, MlError> {
    if y_true.len() != y_pred.len() {
        return Err(MlError::new("y_true and y_pred must have the same length"));
    }
    if y_true.is_empty() {
        return Err(MlError::new("arrays must not be empty"));
    }

    // Find unique sorted classes
    let mut classes: Vec<f64> = y_true.iter().chain(y_pred.iter()).copied().collect();
    classes.sort_unstable_by(|a, b| a.partial_cmp(b).unwrap());
    classes.dedup();
    let n_classes = classes.len();

    // Build confusion matrix
    let mut matrix = vec![0.0f64; n_classes * n_classes];
    for i in 0..y_true.len() {
        let true_idx = classes.iter().position(|&c| (c - y_true[i]).abs() < 1e-10).unwrap();
        let pred_idx = classes.iter().position(|&c| (c - y_pred[i]).abs() < 1e-10).unwrap();
        matrix[true_idx * n_classes + pred_idx] += 1.0;
    }

    // Build result: [n_classes, classes..., matrix_flat...]
    let mut result = Vec::with_capacity(1 + n_classes + n_classes * n_classes);
    result.push(n_classes as f64);
    result.extend_from_slice(&classes);
    result.extend_from_slice(&matrix);

    Ok(result)
}

#[wasm_bindgen(js_name = "confusionMatrix")]
pub fn confusion_matrix(y_true: &[f64], y_pred: &[f64]) -> Result<Vec<f64>, JsError> {
    confusion_matrix_impl(y_true, y_pred).map_err(|e| JsError::new(&e.message))
}

/// Classification accuracy: (TP + TN) / total
#[wasm_bindgen(js_name = "accuracy")]
pub fn accuracy(y_true: &[f64], y_pred: &[f64]) -> Result<f64, JsError> {
    if y_true.len() != y_pred.len() {
        return Err(JsError::new("y_true and y_pred must have the same length"));
    }
    if y_true.is_empty() {
        return Err(JsError::new("arrays must not be empty"));
    }

    let correct = y_true.iter()
        .zip(y_pred.iter())
        .filter(|(t, p)| (**t - **p).abs() < 1e-10)
        .count();

    Ok(correct as f64 / y_true.len() as f64)
}

/// Macro-averaged F1 score across all classes
#[wasm_bindgen(js_name = "f1Score")]
pub fn f1_score(y_true: &[f64], y_pred: &[f64]) -> Result<f64, JsError> {
    let cm = confusion_matrix_impl(y_true, y_pred).map_err(|e| JsError::new(&e.message))?;
    let n_classes = cm[0] as usize;

    if n_classes == 0 {
        return Err(JsError::new("no classes found"));
    }

    let _classes_offset = 1;
    let matrix_offset = 1 + n_classes;
    let mut f1_sum = 0.0;

    for c in 0..n_classes {
        let tp = cm[matrix_offset + c * n_classes + c];
        // Column sum = all predicted as class c
        let mut fp = 0.0;
        for r in 0..n_classes {
            if r != c { fp += cm[matrix_offset + r * n_classes + c]; }
        }
        // Row sum = all actual class c
        let mut fn_val = 0.0;
        for p in 0..n_classes {
            if p != c { fn_val += cm[matrix_offset + c * n_classes + p]; }
        }

        let precision = if tp + fp > 0.0 { tp / (tp + fp) } else { 0.0 };
        let recall = if tp + fn_val > 0.0 { tp / (tp + fn_val) } else { 0.0 };
        let f1 = if precision + recall > 0.0 {
            2.0 * precision * recall / (precision + recall)
        } else { 0.0 };

        f1_sum += f1;
    }

    Ok(f1_sum / n_classes as f64)
}

/// Precision for a specific class (positive class index)
#[wasm_bindgen(js_name = "precision")]
pub fn precision(y_true: &[f64], y_pred: &[f64], positive_class: f64) -> Result<f64, JsError> {
    let cm = confusion_matrix_impl(y_true, y_pred).map_err(|e| JsError::new(&e.message))?;
    let n_classes = cm[0] as usize;
    let _classes_offset = 1;
    let matrix_offset = 1 + n_classes;

    let pos_idx = cm[1..1 + n_classes]
        .iter()
        .position(|&c: &f64| (c - positive_class).abs() < 1e-10)
        .ok_or_else(|| JsError::new("positive_class not found in labels"))?;

    let tp = cm[matrix_offset + pos_idx * n_classes + pos_idx];
    let mut fp = 0.0;
    for r in 0..n_classes {
        if r != pos_idx { fp += cm[matrix_offset + r * n_classes + pos_idx]; }
    }

    if tp + fp == 0.0 { return Ok(0.0); }
    Ok(tp / (tp + fp))
}

/// Recall for a specific class (positive class index)
#[wasm_bindgen(js_name = "recall")]
pub fn recall(y_true: &[f64], y_pred: &[f64], positive_class: f64) -> Result<f64, JsError> {
    let cm = confusion_matrix_impl(y_true, y_pred).map_err(|e| JsError::new(&e.message))?;
    let n_classes = cm[0] as usize;
    let _classes_offset = 1;
    let matrix_offset = 1 + n_classes;

    let pos_idx = cm[1..1 + n_classes]
        .iter()
        .position(|&c: &f64| (c - positive_class).abs() < 1e-10)
        .ok_or_else(|| JsError::new("positive_class not found in labels"))?;

    let tp = cm[matrix_offset + pos_idx * n_classes + pos_idx];
    let mut fn_val = 0.0;
    for p in 0..n_classes {
        if p != pos_idx { fn_val += cm[matrix_offset + pos_idx * n_classes + p]; }
    }

    if tp + fn_val == 0.0 { return Ok(0.0); }
    Ok(tp / (tp + fn_val))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_binary_confusion_matrix() {
        let y_true = vec![0.0, 0.0, 1.0, 1.0, 0.0, 1.0];
        let y_pred = vec![0.0, 1.0, 1.0, 1.0, 0.0, 0.0];
        let result = confusion_matrix_impl(&y_true, &y_pred).unwrap();

        let n_classes = result[0] as usize;
        assert_eq!(n_classes, 2);

        // Classes: [0.0, 1.0]
        assert_eq!(result[1], 0.0);
        assert_eq!(result[2], 1.0);

        // Matrix (2×2):
        // [[2, 1],  (true 0: 2 correct, 1 wrong)
        //  [1, 2]]  (true 1: 1 wrong, 2 correct)
        let m = &result[3..];
        assert_eq!(m[0], 2.0); // TN
        assert_eq!(m[1], 1.0); // FP
        assert_eq!(m[2], 1.0); // FN
        assert_eq!(m[3], 2.0); // TP
    }

    #[test]
    fn test_accuracy_perfect() {
        let y_true = vec![0.0, 1.0, 2.0, 0.0, 1.0, 2.0];
        let y_pred = vec![0.0, 1.0, 2.0, 0.0, 1.0, 2.0];
        assert!((accuracy(&y_true, &y_pred).unwrap() - 1.0).abs() < 1e-10);
    }

    #[test]
    fn test_accuracy_half() {
        let y_true = vec![0.0, 0.0, 1.0, 1.0];
        let y_pred = vec![0.0, 1.0, 0.0, 1.0];
        assert!((accuracy(&y_true, &y_pred).unwrap() - 0.5).abs() < 1e-10);
    }

    #[test]
    fn test_f1_perfect() {
        let y_true = vec![0.0, 0.0, 1.0, 1.0];
        let y_pred = vec![0.0, 0.0, 1.0, 1.0];
        assert!((f1_score(&y_true, &y_pred).unwrap() - 1.0).abs() < 1e-10);
    }

    #[test]
    fn test_precision_recall() {
        let y_true = vec![0.0, 0.0, 0.0, 1.0, 1.0, 1.0];
        let y_pred = vec![0.0, 0.0, 1.0, 1.0, 1.0, 0.0];
        // TP=2, FP=1, FN=1 for class 1
        let p = precision(&y_true, &y_pred, 1.0).unwrap();
        let r = recall(&y_true, &y_pred, 1.0).unwrap();
        assert!((p - 2.0 / 3.0).abs() < 1e-10);
        assert!((r - 2.0 / 3.0).abs() < 1e-10);
    }

    #[test]
    fn test_multiclass() {
        let y_true = vec![0.0, 1.0, 2.0, 0.0, 1.0, 2.0, 0.0];
        let y_pred = vec![0.0, 1.0, 2.0, 0.0, 2.0, 2.0, 1.0];
        let result = confusion_matrix_impl(&y_true, &y_pred).unwrap();

        let n_classes = result[0] as usize;
        assert_eq!(n_classes, 3);
    }

    #[test]
    fn test_length_mismatch() {
        assert!(confusion_matrix_impl(&[0.0, 1.0], &[0.0]).is_err());
    }
}
