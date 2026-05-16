//! Nanosecond AutoML — automated parameter selection for ML algorithm families.

use crate::state::{get_or_init_state, StoredObject};
use crate::ml::forecasting::get_windows;
use crate::ml::classification::{extract_features, knn_sweep_cv};
use serde_json::json;
use wasm_bindgen::prelude::*;

/// Automated smoothing factor selection for Forecasting.
/// 
/// Performs a 5-fold cross-validation sweep across alpha [0.05, 0.95].
#[wasm_bindgen]
pub fn discover_automl_forecast(eventlog_handle: &str, _activity_key: &str) -> Result<JsValue, JsValue> {
    let (windows, count) = get_windows(eventlog_handle)?;
    
    if count < 10 {
        return to_js_val(&json!({
            "algorithm": "automl_forecast",
            "error": "Insufficient data for 5-fold CV"
        }));
    }

    let result = discover_automl_forecast_internal(&windows);

    to_js_val(&json!({
        "algorithm": "automl_forecast",
        "best_alpha": result.best_alpha,
        "avg_rmse": result.min_avg_rmse,
        "status": "OPTIMIZED",
        "scope": "exhaustive_sweep_0.05_0.95"
    }))
}

pub struct AutomlForecastResult {
    pub best_alpha: f64,
    pub min_avg_rmse: f64,
}

/// One fold of k-fold CV for EWMA: fit on train complement, evaluate on holdout.
///
/// Train phase: roll EWMA `s_t = alpha*x_t + (1-alpha)*s_{t-1}` over
/// `windows[0..test_start]` then `windows[test_end..end]`, producing a fitted
/// smoothed level `s_train`.
/// Test phase: starting from `s_train`, compute one-step-ahead prediction
/// errors over the held-out test fold only, then continue propagating state.
/// Returns (sum_sq, sum_abs, n_err) so the caller can aggregate across folds.
pub(crate) fn eval_fold(windows: &[f64], alpha: f64, test_start: usize, test_end: usize) -> (f64, f64, usize) {
    // Train on complement (prefix + suffix). Initial state = first train value.
    let mut s_opt: Option<f64> = None;
    let prefix = &windows[..test_start];
    let suffix = &windows[test_end..];
    for &val in prefix.iter().chain(suffix.iter()) {
        s_opt = Some(match s_opt {
            None => val,
            Some(prev_s) => alpha * val + (1.0 - alpha) * prev_s,
        });
    }
    // Empty train complement: caller guards against this (requires n > test fold).
    let mut s = match s_opt {
        Some(v) => v,
        None => return (0.0, 0.0, 0),
    };
    // Evaluate on test fold (held-out): one-step-ahead errors only.
    let mut sum_sq = 0.0;
    let mut sum_abs = 0.0;
    let mut n_err = 0usize;
    for &val in windows[test_start..test_end].iter() {
        let pred = s;
        let err = val - pred;
        sum_sq += err * err;
        sum_abs += err.abs();
        n_err += 1;
        s = alpha * val + (1.0 - alpha) * pred;
    }
    (sum_sq, sum_abs, n_err)
}

pub fn discover_automl_forecast_internal(windows: &[f64]) -> AutomlForecastResult {
    const FOLDS: usize = 5;
    let n = windows.len();
    // Each fold needs a non-empty train complement, so n must exceed FOLDS.
    if n < FOLDS + 1 {
        return AutomlForecastResult {
            best_alpha: 0.3,
            min_avg_rmse: f64::INFINITY,
        };
    }

    let mut best_alpha = 0.3;
    let mut min_avg_rmse = f64::MAX;

    // Exhaustive sweep: 0.05 to 0.95 with 0.05 step
    for i in 1..20 {
        let alpha = i as f64 * 0.05;
        let fold_size = n / FOLDS;
        let mut total_sq = 0.0;
        let mut total_n = 0usize;

        for fold in 0..FOLDS {
            let test_start = fold * fold_size;
            let test_end = if fold == FOLDS - 1 { n } else { test_start + fold_size };
            let (sum_sq, _sum_abs, n_err) = eval_fold(windows, alpha, test_start, test_end);
            total_sq += sum_sq;
            total_n += n_err;
        }

        let cv_rmse = if total_n > 0 { (total_sq / total_n as f64).sqrt() } else { f64::INFINITY };
        if cv_rmse < min_avg_rmse {
            min_avg_rmse = cv_rmse;
            best_alpha = alpha;
        }
    }

    AutomlForecastResult {
        best_alpha,
        min_avg_rmse,
    }
}

/// Automated hyperparameter tuning for k-NN Classification.
/// 
/// Performs a 5-fold cross-validation sweep across K [1, 15].
#[wasm_bindgen]
pub fn discover_automl_classify(eventlog_handle: &str, activity_key: &str) -> Result<JsValue, JsValue> {
    let state = get_or_init_state();
    
    let (features, labels) = state.with_object(eventlog_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            Ok(extract_features(log, activity_key))
        }
        _ => Err(crate::error::js_val("not_found")),
    })?;

    let n = features.len();
    if n < 10 {
        return to_js_val(&json!({
            "algorithm": "automl_classify",
            "error": "Insufficient data for 5-fold CV"
        }));
    }

    let result = discover_automl_classify_internal(&features, &labels);

    to_js_val(&json!({
        "algorithm": "automl_classify",
        "best_k": result.best_k,
        "max_accuracy": result.max_avg_accuracy,
        "status": "OPTIMIZED",
        "folds": 5
    }))
}

pub struct AutomlClassifyResult {
    pub best_k: usize,
    pub max_avg_accuracy: f64,
}

pub fn discover_automl_classify_internal(features: &[[f64; 2]], labels: &[u8]) -> AutomlClassifyResult {
    const FOLDS: usize = 5;
    const MAX_K: usize = 15;

    // Optimized Nanosecond Sweep: Multi-K CV in a single pass
    let accuracies = knn_sweep_cv(features, labels, FOLDS, MAX_K);
    
    let mut best_k = 1;
    let mut max_avg_accuracy = -1.0;

    for (k, &acc) in accuracies[1..=MAX_K].iter().enumerate() {
        let k = k + 1; // accuracies[1..] maps to k=1..=MAX_K
        if acc > max_avg_accuracy {
            max_avg_accuracy = acc;
            best_k = k;
        }
    }

    AutomlClassifyResult {
        best_k,
        max_avg_accuracy,
    }
}

fn to_js_val(value: &serde_json::Value) -> Result<JsValue, JsValue> {
    serde_json::to_string(value)
        .map(|s| crate::error::js_val(&s))
        .map_err(|e| crate::error::wasm_err(crate::error::codes::INTERNAL_ERROR, e.to_string()))
}

#[cfg(test)]
mod cv_tests {
    use super::*;
    use crate::ml::forecasting::forecast_internal;

    /// Rank-2 (domain contract): a proper k-fold CV must differ from chunked
    /// evaluation. The previous broken pattern evaluated
    /// `forecast_internal(&windows[test_start..test_end], alpha)`, which
    /// initializes `s = test_fold[0]` — making the test fold contribute to its
    /// own metric (FM-5 self-referential). With non-degenerate data the
    /// CV-aggregated sum_sq must NOT equal the chunked-eval aggregation.
    #[test]
    fn proper_cv_differs_from_chunked_evaluation() {
        // Non-constant series so the two regimes produce different residuals.
        let windows: Vec<f64> = (0..25).map(|i| (i as f64) * 1.5 + (i as f64).sin()).collect();
        let alpha = 0.3;
        const FOLDS: usize = 5;
        let n = windows.len();
        let fold_size = n / FOLDS;

        let mut cv_sum_sq = 0.0;
        let mut chunked_sum_sq = 0.0;
        for fold in 0..FOLDS {
            let test_start = fold * fold_size;
            let test_end = if fold == FOLDS - 1 { n } else { test_start + fold_size };
            let (sum_sq, _, _) = eval_fold(&windows, alpha, test_start, test_end);
            cv_sum_sq += sum_sq;
            // Reproduce the broken chunked pattern: evaluate only on the slice.
            let chunked = forecast_internal(&windows[test_start..test_end], alpha);
            // forecast_internal returns RMSE over the slice (n-1 errors); recover
            // its squared-error sum so the comparison is on the same scale.
            let slice_len = test_end - test_start;
            if slice_len > 1 {
                chunked_sum_sq += chunked.rmse * chunked.rmse * (slice_len - 1) as f64;
            }
        }
        assert!(
            (cv_sum_sq - chunked_sum_sq).abs() > 1e-6,
            "proper k-fold CV must not collapse to chunked-eval (cv={}, chunked={})",
            cv_sum_sq, chunked_sum_sq,
        );
    }

    /// Rank-2 (domain contract): the first observation of each test fold is
    /// predicted from the *train-fitted* level, not from itself. For a
    /// strongly trending series, the train-fitted level lags the test fold,
    /// so the residual on `test[0]` is strictly non-zero. The broken
    /// chunked-eval, which re-initializes from `test[0]`, would yield a
    /// zero residual at that index — collapsing total RMSE.
    #[test]
    fn test_fold_first_point_uses_train_fitted_level() {
        let windows: Vec<f64> = (0..30).map(|i| (i as f64) * 2.0).collect(); // y = 2i
        let alpha = 0.4;
        // Choose an interior fold so the train complement is non-empty.
        let test_start = 12;
        let test_end = 18;
        let (sum_sq, _, n_err) = eval_fold(&windows, alpha, test_start, test_end);
        assert!(n_err > 0, "test fold must produce residuals");
        assert!(sum_sq > 0.0, "trending series must produce non-zero CV residuals");

        // Contrast: chunked-eval initializes s = windows[test_start], so the
        // first error term is zero. Its sum_sq is strictly smaller than the
        // proper CV's sum_sq on the same fold for this trending series.
        let chunked = forecast_internal(&windows[test_start..test_end], alpha);
        let chunked_sum_sq = chunked.rmse * chunked.rmse * ((test_end - test_start) - 1) as f64;
        assert!(
            sum_sq > chunked_sum_sq,
            "proper-CV residuals must exceed chunked-eval residuals on trending data \
             (sum_sq={}, chunked_sum_sq={})",
            sum_sq, chunked_sum_sq,
        );
    }
}
