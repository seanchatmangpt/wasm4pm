//! Nanosecond AutoML — automated parameter selection for ML algorithm families.

use crate::ml::classification::{extract_features, knn_sweep_cv};
use crate::ml::forecasting::get_windows;
use crate::state::{get_or_init_state, StoredObject};
use serde_json::json;
use wasm_bindgen::prelude::*;

/// Automated smoothing factor selection for Forecasting.
///
/// Performs a 5-fold cross-validation sweep across alpha [0.05, 0.95].
/// For each fold, EWMA is fit on the training complement (windows outside
/// the test fold), then RMSE is computed on the held-out test fold using
/// the fitted smoothed level as the initial state.
#[wasm_bindgen]
pub fn discover_automl_forecast(
    eventlog_handle: &str,
    _activity_key: &str,
) -> Result<JsValue, JsValue> {
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
        "best_beta": result.best_beta,
        // back-compat field: avg_rmse == min_avg_rmse == cv_rmse for best alpha
        "avg_rmse": result.min_avg_rmse,
        // additive: explicit cross-validated test RMSE/MAE (k-fold aggregated)
        "cv_rmse": result.min_avg_rmse,
        "cv_mae": result.min_avg_mae,
        "cv_folds": result.folds,
        "cv_method": "kfold_train_complement_test_holdout",
        "status": "OPTIMIZED",
        "scope": "exhaustive_sweep_0.05_0.95"
    }))
}

/// Result of an automated forecasting parameter search.
pub struct AutomlForecastResult {
    /// The smoothing factor (α) that resulted in the lowest cross-validated error.
    pub best_alpha: f64,
    /// The trend factor (β) that resulted in the lowest cross-validated error.
    /// 0.0 means plain SES (no trend) was optimal.
    pub best_beta: f64,
    /// The minimum average Root Mean Squared Error (RMSE) achieved during the sweep.
    pub min_avg_rmse: f64,
    /// The minimum average Mean Absolute Error (MAE) achieved during the sweep.
    pub min_avg_mae: f64,
    /// The number of cross-validation folds used.
    pub folds: usize,
}

/// One fold of k-fold CV for Holt smoothing: fit on train, evaluate on holdout.
///
/// Train phase: roll Holt level/trend over the training complement
/// (windows[0..test_start] then windows[test_end..end]). Level initializes
/// to the first train value; the trend initializes to 0.0 so that `beta=0.0`
/// keeps the trend at zero forever and the recursion reduces EXACTLY to the
/// SES CV this replaced (`s_t = alpha*x_t + (1-alpha)*s_{t-1}`).
/// Test phase: starting from the fitted (level, trend), one-step-ahead
/// predict `level + trend`, accumulate errors on held-out values only, and
/// propagate state using the observed test value.
fn eval_fold(
    windows: &[f64],
    alpha: f64,
    beta: f64,
    test_start: usize,
    test_end: usize,
) -> (f64, f64, usize) {
    // ---- Train on complement (prefix + suffix). ----
    let mut state: Option<(f64, f64)> = None; // (level, trend)
    let prefix = &windows[..test_start];
    let suffix = &windows[test_end..];
    for &val in prefix.iter().chain(suffix.iter()) {
        state = Some(match state {
            None => (val, 0.0),
            Some((prev_level, prev_trend)) => {
                let level = alpha * val + (1.0 - alpha) * (prev_level + prev_trend);
                let trend = beta * (level - prev_level) + (1.0 - beta) * prev_trend;
                (level, trend)
            }
        });
    }
    // If train complement is empty, we cannot CV — caller guards this case.
    let (mut level, mut trend) = match state {
        Some(v) => v,
        None => return (0.0, 0.0, 0),
    };
    // ---- Evaluate on test fold (held-out). ----
    let mut sum_sq = 0.0;
    let mut sum_abs = 0.0;
    let mut n_err = 0usize;
    for &val in windows[test_start..test_end].iter() {
        let pred = level + trend;
        let err = val - pred;
        sum_sq += err * err;
        sum_abs += err.abs();
        n_err += 1;
        // Update state using the observed test value (state propagates).
        let prev_level = level;
        level = alpha * val + (1.0 - alpha) * pred;
        trend = beta * (level - prev_level) + (1.0 - beta) * trend;
    }
    (sum_sq, sum_abs, n_err)
}

/// Beta (trend) grid for the Holt sweep: 0.0 (= plain SES), then 0.05..0.95 step 0.1.
const BETA_GRID: [f64; 11] = [
    0.0, 0.05, 0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85, 0.95,
];

/// Automated hyperparameter search for forecasting parameters.
///
/// Sweeps the (alpha, beta) Holt grid — alpha in [0.05, 0.95] step 0.05,
/// beta in `BETA_GRID` — using k-fold cross-validation. beta=0.0 reproduces
/// the previous SES-only sweep exactly. Selection is lowest CV RMSE; ties
/// keep the earliest grid point (lowest alpha, then lowest beta) so the
/// result is deterministic.
pub fn discover_automl_forecast_internal(windows: &[f64]) -> AutomlForecastResult {
    const FOLDS: usize = 5;
    let n = windows.len();
    // Need at least FOLDS+1 windows so each fold has a non-empty train complement.
    if n < FOLDS + 1 {
        return AutomlForecastResult {
            best_alpha: 0.3,
            best_beta: 0.0,
            min_avg_rmse: f64::INFINITY,
            min_avg_mae: f64::INFINITY,
            folds: FOLDS,
        };
    }
    let fold_size = n / FOLDS;

    let mut best_alpha = 0.3;
    let mut best_beta = 0.0;
    let mut min_avg_rmse = f64::MAX;
    let mut min_avg_mae = f64::MAX;

    // Exhaustive sweep: alpha 0.05..0.95 step 0.05 × beta grid.
    for i in 1..20 {
        let alpha = i as f64 * 0.05;
        for &beta in &BETA_GRID {
            let mut total_sq = 0.0;
            let mut total_abs = 0.0;
            let mut total_n = 0usize;

            for fold in 0..FOLDS {
                let test_start = fold * fold_size;
                let test_end = if fold == FOLDS - 1 {
                    n
                } else {
                    (fold + 1) * fold_size
                };
                let (sq, ab, nn) = eval_fold(windows, alpha, beta, test_start, test_end);
                total_sq += sq;
                total_abs += ab;
                total_n += nn;
            }

            if total_n == 0 {
                continue;
            }
            let cv_rmse = (total_sq / total_n as f64).sqrt();
            let cv_mae = total_abs / total_n as f64;
            if cv_rmse < min_avg_rmse {
                min_avg_rmse = cv_rmse;
                min_avg_mae = cv_mae;
                best_alpha = alpha;
                best_beta = beta;
            }
        }
    }

    AutomlForecastResult {
        best_alpha,
        best_beta,
        min_avg_rmse,
        min_avg_mae,
        folds: FOLDS,
    }
}

/// Automated hyperparameter tuning for k-NN Classification.
///
/// Performs a 5-fold cross-validation sweep across K [1, 15].
#[wasm_bindgen]
pub fn discover_automl_classify(
    eventlog_handle: &str,
    activity_key: &str,
) -> Result<JsValue, JsValue> {
    let state = get_or_init_state();

    let (features, labels) = state.with_object(eventlog_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => Ok(extract_features(log, activity_key)),
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

/// Result of an automated classification hyperparameter search.
pub struct AutomlClassifyResult {
    /// The number of neighbors (K) that resulted in the highest cross-validated accuracy.
    pub best_k: usize,
    /// The maximum average accuracy achieved during the sweep.
    pub max_avg_accuracy: f64,
}

/// Automated hyperparameter search for k-NN classification.
///
/// Sweeps across K [1, 15] using 5-fold cross-validation.
/// Returns the optimal K and associated accuracy.
pub fn discover_automl_classify_internal<const D: usize>(
    features: &[[f64; D]],
    labels: &[u8],
) -> AutomlClassifyResult {
    const FOLDS: usize = 5;
    const MAX_K: usize = 15;

    // Mixed magnitudes (seconds vs counts) — min-max normalize before distances.
    let normalized = crate::ml::classification::normalize_features(features, features);
    // Optimized Nanosecond Sweep: Multi-K CV in a single pass
    let accuracies = knn_sweep_cv(&normalized, labels, FOLDS, MAX_K);

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
mod cv_semantics_tests {
    //! Rank-2 (domain-contract) tests for k-fold cross-validation semantics.
    //!
    //! These tests assert properties of a proper k-fold CV that the previously
    //! broken "chunked evaluation" implementation could not satisfy.
    use super::*;

    /// Domain contract: train and test indices for each fold must be disjoint.
    /// This is the definitional property of cross-validation.
    #[test]
    fn fold_indices_train_and_test_are_disjoint() {
        let n = 25usize;
        const FOLDS: usize = 5;
        let fold_size = n / FOLDS;
        for fold in 0..FOLDS {
            let test_start = fold * fold_size;
            let test_end = if fold == FOLDS - 1 {
                n
            } else {
                (fold + 1) * fold_size
            };
            let test: std::collections::HashSet<usize> = (test_start..test_end).collect();
            let train: std::collections::HashSet<usize> =
                (0..test_start).chain(test_end..n).collect();
            // Disjoint.
            assert!(
                train.is_disjoint(&test),
                "fold {}: train ∩ test = {:?}",
                fold,
                train.intersection(&test).collect::<Vec<_>>()
            );
            // Together they cover the full index space.
            assert_eq!(
                train.len() + test.len(),
                n,
                "fold {}: train+test must partition [0,n)",
                fold
            );
        }
    }

    /// Domain contract: the test fold must NOT contribute to training.
    ///
    /// This is the discriminating property. We directly invoke `eval_fold`
    /// and assert that it uses values from the train complement to set the
    /// initial level, *not* from the test fold. We construct a contrast
    /// where the test fold has values that differ from the complement and
    /// verify that the prediction error reflects predicting test from train.
    ///
    /// Broken (chunked-eval) implementation: ran EWMA inside the test fold
    /// itself, so the first prediction equaled the first test value, yielding
    /// zero error on element 0. Proper CV: initial level is fitted from train
    /// complement, so error on element 0 is `test[0] - level_from_train`.
    #[test]
    fn test_fold_does_not_contribute_to_training() {
        // Train complement = all 1.0; test fold = all 9.0.
        let mut windows = vec![1.0; 16];
        windows.extend(vec![9.0; 4]); // last fold of size 4 (n=20, folds=5)

        let alpha = 0.5;
        // Last fold of size 4 spans indices [16, 20).
        let (sum_sq, sum_abs, n_err) = eval_fold(&windows, alpha, 0.0, 16, 20);

        // After training on 16 ones, s_train == 1.0 (geometric convergence to
        // the constant). First test prediction = 1.0, observed = 9.0,
        // err = 8.0. Squared err on that single element alone is 64.0.
        // If the broken impl were in place (init level from test[0]=9.0),
        // the first squared error would be 0.0 and total_sq << 64.0.
        assert_eq!(
            n_err, 4,
            "every test-fold element must contribute one residual"
        );
        assert!(
            sum_sq >= 64.0,
            "first test residual must reflect train-derived level (~1.0) vs test[0]=9.0; \
             sum_sq={} (broken chunked-eval would give sum_sq < 64.0 because it would \
             initialize EWMA from test[0] itself)",
            sum_sq
        );
        assert!(
            sum_abs >= 8.0,
            "first |residual| must be ≥ |9 - 1| = 8; sum_abs={}",
            sum_abs
        );
    }

    /// Property test: the test fold is forecast from a training-only level.
    /// Run the broken pattern (forecast inside test slice) and compare.
    /// They must produce different sum_sq for a non-trivial fold.
    #[test]
    fn proper_cv_differs_from_chunked_evaluation() {
        // 20 windows: low-frequency oscillation so test slice ≠ complement-fit.
        let windows: Vec<f64> = (0..20).map(|i| (i as f64).sin() * 3.0 + 5.0).collect();
        let alpha = 0.3;
        let (proper_sq, _, _) = eval_fold(&windows, alpha, 0.0, 8, 12);
        // "Chunked-eval" reproduction: run forecast_internal on the test slice
        // only (the previously broken behavior).
        let chunked_rmse = {
            let slice = &windows[8..12];
            let n = slice.len();
            if n == 0 {
                0.0
            } else {
                let mut s = slice[0];
                let mut sq = 0.0;
                for &v in slice.iter().skip(1) {
                    let err = v - s;
                    sq += err * err;
                    s = alpha * v + (1.0 - alpha) * s;
                }
                sq
            }
        };
        // The two must differ — they answer different questions.
        let diff = (proper_sq - chunked_rmse).abs();
        assert!(
            diff > 1e-6,
            "proper-CV sum_sq ({}) must differ from chunked-eval sum_sq ({}); diff={}",
            proper_sq,
            chunked_rmse,
            diff
        );
    }

    /// Domain contract: aggregated CV MAE must be reported and consistent with RMSE.
    /// MAE <= RMSE always (Jensen's inequality, both over same residual set).
    #[test]
    fn aggregated_cv_mae_and_rmse_are_reported_and_consistent() {
        let windows: Vec<f64> = (0..30).map(|i| 1.0 + (i as f64) * 0.5).collect();
        let result = discover_automl_forecast_internal(&windows);
        assert!(result.min_avg_mae.is_finite(), "cv_mae must be finite");
        assert!(result.min_avg_rmse.is_finite(), "cv_rmse must be finite");
        assert!(result.min_avg_mae >= 0.0, "cv_mae must be non-negative");
        assert!(result.min_avg_rmse >= 0.0, "cv_rmse must be non-negative");
        assert!(
            result.min_avg_mae <= result.min_avg_rmse + 1e-9,
            "MAE ({}) must be <= RMSE ({})",
            result.min_avg_mae,
            result.min_avg_rmse
        );
        assert_eq!(result.folds, 5, "folds metadata must be reported");
    }

    /// Domain contract: a flat (constant) series, when properly CV'd, should
    /// yield cv_rmse approaching 0 for any alpha — the train complement
    /// converges to the constant, and the held-out fold matches.
    /// Chunked-eval also gives ~0 here, so this is a sanity baseline, not
    /// a discriminating test. Included to anchor expected behavior.
    #[test]
    fn flat_series_yields_near_zero_cv_rmse() {
        let windows = vec![7.0_f64; 25];
        let result = discover_automl_forecast_internal(&windows);
        assert!(
            result.min_avg_rmse < 1e-9,
            "flat series cv_rmse must be ~0, got {}",
            result.min_avg_rmse
        );
        assert!(
            result.min_avg_mae < 1e-9,
            "flat series cv_mae must be ~0, got {}",
            result.min_avg_mae
        );
    }

    /// Domain contract: insufficient data (n < folds+1) returns an explicit
    /// sentinel rather than a misleading metric. The previous implementation
    /// would silently divide by a small fold_size.
    #[test]
    fn insufficient_data_returns_infinity_sentinel() {
        let windows = vec![1.0, 2.0, 3.0];
        let result = discover_automl_forecast_internal(&windows);
        assert!(
            result.min_avg_rmse.is_infinite(),
            "n < folds+1 must yield infinity sentinel, got {}",
            result.min_avg_rmse
        );
    }

    /// Holt gate: eval_fold with beta=0.0 must reduce EXACTLY to the previous
    /// SES-only CV (level recursion `s_t = alpha*x_t + (1-alpha)*s_{t-1}`,
    /// initial trend 0). Reproduced inline as the oracle.
    #[test]
    fn eval_fold_beta_zero_reduces_exactly_to_ses() {
        let windows: Vec<f64> = (0..20)
            .map(|i| (i as f64 * 0.7).sin() * 4.0 + 10.0)
            .collect();
        for &alpha in &[0.1, 0.3, 0.5, 0.9] {
            for (test_start, test_end) in [(0usize, 4usize), (8, 12), (16, 20)] {
                let (holt_sq, holt_abs, holt_n) =
                    eval_fold(&windows, alpha, 0.0, test_start, test_end);

                // SES oracle (pre-Holt implementation).
                let mut s_opt: Option<f64> = None;
                for &val in windows[..test_start]
                    .iter()
                    .chain(windows[test_end..].iter())
                {
                    s_opt = Some(match s_opt {
                        None => val,
                        Some(prev) => alpha * val + (1.0 - alpha) * prev,
                    });
                }
                let mut s = s_opt.unwrap();
                let mut sum_sq = 0.0;
                let mut sum_abs = 0.0;
                let mut n_err = 0usize;
                for &val in windows[test_start..test_end].iter() {
                    let err = val - s;
                    sum_sq += err * err;
                    sum_abs += err.abs();
                    n_err += 1;
                    s = alpha * val + (1.0 - alpha) * s;
                }

                assert_eq!(holt_n, n_err);
                assert_eq!(
                    holt_sq, sum_sq,
                    "beta=0 must be bit-identical to SES sum_sq (alpha={alpha})"
                );
                assert_eq!(holt_abs, sum_abs);
            }
        }
    }

    /// On the temporally-valid last fold (train = prefix only), Holt with
    /// trend must strictly beat SES on a linear series: SES lags the ramp by
    /// one slope unit per step, Holt tracks it exactly.
    #[test]
    fn holt_beats_ses_on_trending_last_fold() {
        let windows: Vec<f64> = (0..30).map(|i| 1.0 + (i as f64) * 0.5).collect();
        let (ses_sq, _, n_ses) = eval_fold(&windows, 0.5, 0.0, 24, 30);
        let (holt_sq, _, n_holt) = eval_fold(&windows, 0.5, 0.5, 24, 30);
        assert_eq!(n_ses, 6);
        assert_eq!(n_holt, 6);
        assert!(
            holt_sq < ses_sq,
            "Holt (beta=0.5) must beat SES on a linear ramp: holt_sq={holt_sq} ses_sq={ses_sq}"
        );
        // The sweep must report an on-grid (alpha, beta) pair and finite error.
        let result = discover_automl_forecast_internal(&windows);
        assert!(
            BETA_GRID.contains(&result.best_beta),
            "beta must be on the grid, got {}",
            result.best_beta
        );
        assert!(result.best_alpha > 0.0 && result.best_alpha < 1.0);
        assert!(result.min_avg_rmse.is_finite());
    }
}
