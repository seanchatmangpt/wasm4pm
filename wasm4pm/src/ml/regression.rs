//! Nanosecond Regression Family — branchless Least Squares solvers for process mining.

use crate::models::{AttributeValue, parse_timestamp_ms};
use crate::state::{get_or_init_state, StoredObject};
use crate::utilities::to_js;
use wasm_bindgen::prelude::*;

const EPSILON: f64 = 1e-12;
const TIME_KEY: &str = "time:timestamp";

#[derive(Debug, Clone, Copy, serde::Serialize)]
pub struct RegressionResult {
    pub slope: f64,
    pub intercept: f64,
    pub r_squared: f64,
    /// Mean Absolute Error on the training residuals: mean(|y_i - (slope*x_i + intercept)|).
    /// Zero when no slope/intercept can be computed.
    pub mae: f64,
    /// Root Mean Squared Error on the training residuals: sqrt(mean((y_i - ŷ_i)^2)).
    pub rmse: f64,
    /// Standard error of the residuals (sqrt of unbiased variance, n-2 denominator).
    /// Zero for n < 3 or when the regression is undefined.
    pub residual_std: f64,
}

#[derive(serde::Serialize)]
struct MLRegressOutput {
    algorithm: &'static str,
    regression: RegressionResult,
}

#[derive(serde::Serialize)]
struct MLRegressAutoMLOutput {
    algorithm: &'static str,
    folds: usize,
    results: Vec<RegressionResult>,
}

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
    let mut sx0 = 0.0; let mut sx1 = 0.0;
    let mut sy0 = 0.0; let mut sy1 = 0.0;
    let mut sxy0 = 0.0; let mut sxy1 = 0.0;
    let mut sxx0 = 0.0; let mut sxx1 = 0.0;
    let mut syy0 = 0.0; let mut syy1 = 0.0;

    let x_chunks = x.chunks_exact(8);
    let y_chunks = y.chunks_exact(8);
    let rem_x = x_chunks.remainder();
    let rem_y = y_chunks.remainder();

    for (xc, yc) in x_chunks.zip(y_chunks) {
        // First 4
        let x0 = xc[0]; let x1 = xc[1]; let x2 = xc[2]; let x3 = xc[3];
        let y0 = yc[0]; let y1 = yc[1]; let y2 = yc[2]; let y3 = yc[3];
        
        sx0 += x0 + x1 + x2 + x3;
        sy0 += y0 + y1 + y2 + y3;
        sxy0 += x0 * y0 + x1 * y1 + x2 * y2 + x3 * y3;
        sxx0 += x0 * x0 + x1 * x1 + x2 * x2 + x3 * x3;
        syy0 += y0 * y0 + y1 * y1 + y2 * y2 + y3 * y3;

        // Second 4
        let x4 = xc[4]; let x5 = xc[5]; let x6 = xc[6]; let x7 = xc[7];
        let y4 = yc[4]; let y5 = yc[5]; let y6 = yc[6]; let y7 = yc[7];

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
        });
    }

    let result = regression_internal(&lengths, &durations);

    to_js(&MLRegressOutput {
        algorithm: "ml_regress",
        regression: result
    })
}

#[wasm_bindgen]
pub fn discover_ml_regress_automl(eventlog_handle: &str, k_folds: u32) -> Result<JsValue, JsValue> {
    let (lengths, durations) = extract_lengths_durations(eventlog_handle)?;
    let n = lengths.len();
    
    if n == 0 {
        return to_js(&MLRegressAutoMLOutput { algorithm: "ml_regress_automl", folds: 0, results: vec![] });
    }

    let k = k_folds.max(1) as usize;
    let chunk_size = n.div_ceil(k);
    let mut results = Vec::with_capacity(k);

    for i in 0..k {
        let start = i * chunk_size;
        if start >= n { break; }
        let end = (start + chunk_size).min(n);
        
        let sub_x = &lengths[start..end];
        let sub_y = &durations[start..end];
        
        results.push(regression_internal(sub_x, sub_y));
    }

    to_js(&MLRegressAutoMLOutput {
        algorithm: "ml_regress_automl",
        folds: k,
        results
    })
}
