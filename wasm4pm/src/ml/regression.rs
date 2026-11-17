//! Nanosecond Regression Family — branchless Least Squares solvers for process mining.

use crate::ml::evaluation::{
    kfold_indices, prefix_split, CvResult, FoldResult, RegressionAccumulator,
    HoldoutRegressionMetrics, DEFAULT_TRAIN_RATIO, MIN_EVAL_SAMPLES,
};
use crate::ml::utils::ensure_finite_1d;
use crate::models::{parse_timestamp_ms, AttributeValue};
use crate::state::{get_or_init_state, StoredObject};
use crate::utilities::to_js;
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

const EPSILON: f64 = 1e-12;
const TIME_KEY: &str = "time:timestamp";

/// Nanosecond-scale Ordinary Least Squares (OLS) linear regression.
///
/// # Caller contract (hot path)
/// `regression_internal` performs NO input validation (no finiteness check,
/// no length check beyond `n != y.len()`) — it is the inner loop and trusts
/// the caller to pre-screen inputs with
/// [`ensure_finite_1d`](crate::ml::utils::ensure_finite_1d). NaN/Inf in
/// silently produce NaN metrics.
///
/// Implements a high-performance two-pass solver for simple linear regression.
/// The first pass computes the normal equations using multiple accumulators to
/// break dependency chains, enabling SIMD-like performance. The second pass
/// computes detailed residual metrics (MAE, RMSE, R²).
#[inline(always)]
pub fn regression_internal(x: &[f64], y: &[f64]) -> RegressionResult {
    let n = x.len();
    if n == 0 || n != y.len() {
        return RegressionResult {
            slope: 0.0,
            intercept: 0.0,
            r_squared: 0.0,
            mae: 0.0,
            rmse: 0.0,
            residual_std: 0.0,
        };
    }

    let nf = n as f64;

    // Use multiple accumulators to break dependency chains and enable SIMD
    let mut sx0 = 0.0;
    let mut sx1 = 0.0;
    let mut sy0 = 0.0;
    let mut sy1 = 0.0;
    let mut sxy0 = 0.0;
    let mut sxy1 = 0.0;
    let mut sxx0 = 0.0;
    let mut sxx1 = 0.0;
    let mut syy0 = 0.0;
    let mut syy1 = 0.0;

    let x_chunks = x.chunks_exact(8);
    let y_chunks = y.chunks_exact(8);
    let rem_x = x_chunks.remainder();
    let rem_y = y_chunks.remainder();

    for (xc, yc) in x_chunks.zip(y_chunks) {
        // First 4
        let x0 = xc[0];
        let x1 = xc[1];
        let x2 = xc[2];
        let x3 = xc[3];
        let y0 = yc[0];
        let y1 = yc[1];
        let y2 = yc[2];
        let y3 = yc[3];

        sx0 += x0 + x1 + x2 + x3;
        sy0 += y0 + y1 + y2 + y3;
        sxy0 += x0 * y0 + x1 * y1 + x2 * y2 + x3 * y3;
        sxx0 += x0 * x0 + x1 * x1 + x2 * x2 + x3 * x3;
        syy0 += y0 * y0 + y1 * y1 + y2 * y2 + y3 * y3;

        // Second 4
        let x4 = xc[4];
        let x5 = xc[5];
        let x6 = xc[6];
        let x7 = xc[7];
        let y4 = yc[4];
        let y5 = yc[5];
        let y6 = yc[6];
        let y7 = yc[7];

        sx1 += x4 + x5 + x6 + x7;
        sy1 += y4 + y5 + y6 + y7;
        sxy1 += x4 * y4 + x5 * y5 + x6 * y6 + x7 * y7;
        sxx1 += x4 * x4 + x5 * x5 + x6 * x6 + x7 * x7;
        syy1 += y4 * y4 + y5 * y5 + y6 * y6 + y7 * y7;
    }

    let mut sum_x = sx0 + sx1;
    let mut sum_y = sy0 + sy1;
    let mut sum_xy = sxy0 + sxy1;
    let mut sum_xx = sxx0 + sxx1;
    let mut sum_yy = syy0 + syy1;

    for (&xi, &yi) in rem_x.iter().zip(rem_y.iter()) {
        sum_x += xi;
        sum_y += yi;
        sum_xy += xi * yi;
        sum_xx += xi * xi;
        sum_yy += yi * yi;
    }

    let den_x = nf * sum_xx - sum_x * sum_x;
    let den_y = nf * sum_yy - sum_y * sum_y;

    let slope = if den_x.abs() > EPSILON {
        (nf * sum_xy - sum_x * sum_y) / den_x
    } else {
        0.0
    };

    let intercept = (sum_y - slope * sum_x) / nf;
    let r2_num = (nf * sum_xy - sum_x * sum_y).powi(2);
    let r2_den = den_x * den_y;

    let r_squared = if r2_den.abs() > EPSILON {
        (r2_num / r2_den).clamp(0.0, 1.0)
    } else {
        0.0
    };

    // Residual error metrics — second pass (|y - ŷ| needs the fitted line,
    // only known after the OLS normal-equations reduction completes).
    let mut sum_abs_err = 0.0_f64;
    let mut sum_sq_err = 0.0_f64;
    for (&xi, &yi) in x.iter().zip(y.iter()) {
        let pred = slope * xi + intercept;
        let residual = yi - pred;
        let abs_r = if residual >= 0.0 { residual } else { -residual };
        sum_abs_err += abs_r;
        sum_sq_err += residual * residual;
    }
    let mae = sum_abs_err / nf;
    let rmse = (sum_sq_err / nf).sqrt();
    // Unbiased residual standard error: n - 2 (slope + intercept free params).
    // Returns 0 sentinel for n <= 2 where the estimator is undefined.
    let residual_std = if n > 2 {
        (sum_sq_err / (n as f64 - 2.0)).sqrt()
    } else {
        0.0
    };

    RegressionResult {
        slope,
        intercept,
        r_squared,
        mae,
        rmse,
        residual_std,
    }
}

fn extract_lengths_durations(eventlog_handle: &str) -> Result<(Vec<f64>, Vec<f64>), JsValue> {
    let state = get_or_init_state();

    state.with_object(eventlog_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            let trace_count = log.traces.len();
            let mut lengths = Vec::with_capacity(trace_count);
            let mut durations = Vec::with_capacity(trace_count);

            for trace in &log.traces {
                lengths.push(trace.events.len() as f64);

                let mut min_ts = i64::MAX;
                let mut max_ts = i64::MIN;
                let mut found = false;

                for event in &trace.events {
                    if let Some(val) = event.attributes.get(TIME_KEY) {
                        let ts_opt = match val {
                            AttributeValue::Date(d) => parse_timestamp_ms(d),
                            AttributeValue::String(s) => parse_timestamp_ms(s),
                            _ => None,
                        };
                        if let Some(ts) = ts_opt {
                            min_ts = min_ts.min(ts);
                            max_ts = max_ts.max(ts);
                            found = true;
                        }
                    }
                }
                let duration = if found { (max_ts - min_ts) as f64 } else { 0.0 };
                durations.push(duration);
            }
            Ok((lengths, durations))
        }
        _ => Err(crate::error::js_val("not_found")),
    })
}

#[wasm_bindgen]
pub fn discover_ml_regress(eventlog_handle: &str, _activity_key: &str) -> Result<JsValue, JsValue> {
    let (lengths, durations) = extract_lengths_durations(eventlog_handle)?;

    if lengths.is_empty() {
        return to_js(&MLRegressOutput {
            algorithm: "ml_regress",
            regression: RegressionResult {
                slope: 0.0,
                intercept: 0.0,
                r_squared: 0.0,
                mae: 0.0,
                rmse: 0.0,
                residual_std: 0.0,
            },
            holdout: None,
            insufficient_data: true,
        });
    }

    ensure_finite_1d(&lengths).map_err(|e| crate::error::js_val(&e))?;
    ensure_finite_1d(&durations).map_err(|e| crate::error::js_val(&e))?;

    let result = regression_internal(&lengths, &durations);

    // Honest holdout evaluation (prefix split, train on the first slice,
    // score the tail). Refused below MIN_EVAL_SAMPLES total samples.
    let holdout = if lengths.len() >= MIN_EVAL_SAMPLES {
        let (train_len, _) = prefix_split(lengths.len(), DEFAULT_TRAIN_RATIO);
        let fit = regression_internal(&lengths[..train_len], &durations[..train_len]);
        let mut acc = RegressionAccumulator::new();
        for i in train_len..lengths.len() {
            let pred = fit.slope * lengths[i] + fit.intercept;
            acc.push(pred, durations[i]);
        }
        Some(acc.finish(train_len))
    } else {
        None
    };

    let insufficient_data = holdout.is_none();
    to_js(&MLRegressOutput {
        algorithm: "ml_regress",
        regression: result,
        holdout,
        insufficient_data,
    })
}

#[wasm_bindgen]
pub fn discover_ml_regress_automl(eventlog_handle: &str, k_folds: u32) -> Result<JsValue, JsValue> {
    let (lengths, durations) = extract_lengths_durations(eventlog_handle)?;
    let n = lengths.len();

    if n == 0 {
        return to_js(&MLRegressAutoMLOutput {
            algorithm: "ml_regress_automl",
            folds: 0,
            results: vec![],
            cv: None,
            insufficient_data: true,
        });
    }

    ensure_finite_1d(&lengths).map_err(|e| crate::error::js_val(&e))?;
    ensure_finite_1d(&durations).map_err(|e| crate::error::js_val(&e))?;

    let k = k_folds.max(1) as usize;
    let (results, cv) = kfold_regression_native(&lengths, &durations, k);

    let insufficient_data = cv.is_none();
    to_js(&MLRegressAutoMLOutput {
        algorithm: "ml_regress_automl",
        folds: k,
        results,
        cv,
        insufficient_data,
    })
}

/// Real k-fold cross-validated OLS: for each fold, train on the complement
/// of the fold and score the held-out fold. Pure Rust — testable natively.
///
/// Returns `(deprecated_in_sample_fits, cv)`. `cv` is `None` when no fold
/// had any test sample.
pub fn kfold_regression_native(
    x: &[f64],
    y: &[f64],
    k: usize,
) -> (Vec<RegressionResult>, Option<CvResult>) {
    let n = x.len();
    let folds = kfold_indices(n, k);
    let mut results = Vec::with_capacity(k);
    let mut fold_results = Vec::with_capacity(k);

    for (i, test_idx) in folds.iter().enumerate() {
        if test_idx.is_empty() {
            continue;
        }
        // Real k-fold: train on the complement of the fold, score the fold.
        let mut train_x = Vec::with_capacity(n - test_idx.len());
        let mut train_y = Vec::with_capacity(n - test_idx.len());
        let mut test_x = Vec::with_capacity(test_idx.len());
        let mut test_y = Vec::with_capacity(test_idx.len());
        let is_test: std::collections::BTreeSet<usize> = test_idx.iter().copied().collect();
        for idx in 0..n {
            if is_test.contains(&idx) {
                test_x.push(x[idx]);
                test_y.push(y[idx]);
            } else {
                train_x.push(x[idx]);
                train_y.push(y[idx]);
            }
        }

        let fit = regression_internal(&train_x, &train_y);
        // Deprecated one-cycle output: the in-sample training fit.
        results.push(fit.clone());

        let mut acc = RegressionAccumulator::new();
        for (xi, yi) in test_x.iter().zip(test_y.iter()) {
            acc.push(fit.slope * xi + fit.intercept, *yi);
        }
        let m = acc.finish(train_x.len());
        fold_results.push(FoldResult {
            fold: i,
            n_train: train_x.len(),
            n_test: test_x.len(),
            test_mae: m.mae,
            test_rmse: m.rmse,
            // Deprecated in-sample diagnostic (optimism-gap visibility only).
            train_fit_mae: fit.mae,
        });
    }

    let n_folds = fold_results.len();
    let cv = if n_folds > 0 {
        Some(CvResult {
            k: n_folds,
            mean_test_mae: fold_results.iter().map(|f| f.test_mae).sum::<f64>() / n_folds as f64,
            mean_test_rmse: fold_results.iter().map(|f| f.test_rmse).sum::<f64>()
                / n_folds as f64,
            folds: fold_results,
            n_samples: n,
        })
    } else {
        None
    };
    (results, cv)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Hand-computed k=2 oracle: x = [1,2,3,4], y = [2,4,6,8] (perfect line).
    /// Fold 0 test = {0,2}, fold 1 test = {1,3}. Each training complement is
    /// still exactly on the line, so every test prediction is exact:
    /// test_mae = 0 and test_rmse = 0 for both folds.
    #[test]
    fn kfold_perfect_line_zero_test_error() {
        let x = [1.0, 2.0, 3.0, 4.0];
        let y = [2.0, 4.0, 6.0, 8.0];
        let (_, cv) = kfold_regression_native(&x, &y, 2);
        let cv = cv.expect("cv present");
        assert_eq!(cv.k, 2);
        assert_eq!(cv.folds[0].n_test, 2);
        assert!(cv.mean_test_mae.abs() < 1e-9);
        assert!(cv.mean_test_rmse.abs() < 1e-9);
    }

    /// Honesty property: on noise-injected synthetic data the in-sample
    /// training MAE must understate the held-out MAE.
    #[test]
    fn holdout_mae_exceeds_in_sample_mae_on_noisy_data() {
        // y = 3x + 1 with deterministic "noise" of alternating ±2.
        let n = 40;
        let x: Vec<f64> = (0..n).map(|i| i as f64).collect();
        let y: Vec<f64> = (0..n)
            .map(|i| 3.0 * (i as f64) + 1.0 + if i % 2 == 0 { 2.0 } else { -2.0 })
            .collect();
        let (in_sample, cv) = kfold_regression_native(&x, &y, 4);
        let cv = cv.expect("cv present");
        let mean_train_fit_mae =
            in_sample.iter().map(|r| r.mae).sum::<f64>() / in_sample.len() as f64;
        assert!(
            cv.mean_test_mae > mean_train_fit_mae,
            "honest test MAE ({}) must exceed in-sample MAE ({}) on noisy data",
            cv.mean_test_mae,
            mean_train_fit_mae
        );
    }
}

/// Result of a linear regression analysis.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegressionResult {
    pub slope: f64,
    pub intercept: f64,
    pub r_squared: f64,
    pub mae: f64,
    pub rmse: f64,
    pub residual_std: f64,
}

/// High-level output for the single-run regression algorithm.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MLRegressOutput {
    pub algorithm: &'static str,
    pub regression: RegressionResult,
    /// Honest holdout metrics (prefix split, model trained only on the train
    /// slice, scored on unseen traces). `None` below `MIN_EVAL_SAMPLES`
    /// total samples — see `insufficient_data`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub holdout: Option<HoldoutRegressionMetrics>,
    /// True when the log was too small for honest holdout evaluation.
    pub insufficient_data: bool,
}

/// High-level output for the AutoML cross-validated regression algorithm.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MLRegressAutoMLOutput {
    pub algorithm: &'static str,
    pub folds: usize,
    /// **Deprecated** (one release cycle): per-fold IN-SAMPLE training fits.
    /// These overstate quality; use `cv` for honest numbers. Removed next
    /// release.
    pub results: Vec<RegressionResult>,
    /// Real k-fold cross-validation: each fold trained on the complement and
    /// scored on the held-out fold.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cv: Option<CvResult>,
    /// True when the log was too small for cross-validation.
    pub insufficient_data: bool,
}
