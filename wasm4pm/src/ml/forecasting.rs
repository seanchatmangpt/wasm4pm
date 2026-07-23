//! Nanosecond Forecasting Family — branchless Exponential Smoothing for process mining.

use crate::models::{parse_timestamp_ms, AttributeValue};
use crate::state::{get_or_init_state, StoredObject};
use serde_json::json;
use wasm_bindgen::prelude::*;

const NUM_WINDOWS: usize = 10;
const DEFAULT_ALPHA: f64 = 0.3;
const TIME_KEY: &str = "time:timestamp";

#[derive(serde::Serialize)]
pub struct ForecastResult {
    pub rmse: f64,
    pub mae: f64,
    /// Mean Absolute Percentage Error, in [0, +inf). 0.0 when no non-zero actuals.
    pub mape: f64,
    pub next_window: f64,
}

#[inline(always)]
pub fn forecast_internal(data: &[f64], alpha: f64) -> ForecastResult {
    let n = data.len();
    if n == 0 {
        return ForecastResult {
            rmse: 0.0,
            mae: 0.0,
            mape: 0.0,
            next_window: 0.0,
        };
    }

    let mut s = data[0];
    let mut sum_sq_err = 0.0;
    let mut sum_abs_err = 0.0;
    let mut sum_abs_pct_err = 0.0;
    let mut mape_count = 0usize;

    for &val in data.iter().skip(1) {
        let prev_s = s;
        // Simple Exponential Smoothing: s_t = alpha * x_t + (1 - alpha) * s_{t-1}
        s = alpha * val + (1.0 - alpha) * prev_s;
        // one-step-ahead forecast error: actual - prior smoothed
        let err = val - prev_s;
        sum_sq_err += err * err;
        sum_abs_err += err.abs();
        // MAPE skips zero actuals to avoid division explosion
        if val.abs() > f64::EPSILON {
            sum_abs_pct_err += (err / val).abs();
            mape_count += 1;
        }
    }

    let denom = (n - 1).max(1) as f64;
    let rmse = if n > 1 {
        (sum_sq_err / denom).sqrt()
    } else {
        0.0
    };
    let mae = if n > 1 { sum_abs_err / denom } else { 0.0 };
    let mape = if mape_count > 0 {
        sum_abs_pct_err / mape_count as f64
    } else {
        0.0
    };

    ForecastResult {
        rmse,
        mae,
        mape,
        next_window: s,
    }
}

/// Holt double exponential smoothing (level + trend).
///
/// `l_t = alpha*x_t + (1-alpha)(l_{t-1}+b_{t-1})`,
/// `b_t = beta*(l_t - l_{t-1}) + (1-beta)*b_{t-1}`.
/// Init: `l_0 = x_0`, `b_0 = x_1 - x_0` (0.0 when the series has < 2 points).
/// Error metrics are one-step-ahead, identical in construction to SES.
pub fn holt_internal(series: &[f64], alpha: f64, beta: f64) -> ForecastResult {
    let n = series.len();
    if n == 0 {
        return ForecastResult {
            rmse: 0.0,
            mae: 0.0,
            mape: 0.0,
            next_window: 0.0,
        };
    }

    let mut level = series[0];
    let mut trend = if n >= 2 { series[1] - series[0] } else { 0.0 };
    let mut sum_sq_err = 0.0;
    let mut sum_abs_err = 0.0;
    let mut sum_abs_pct_err = 0.0;
    let mut mape_count = 0usize;

    for &val in series.iter().skip(1) {
        let pred = level + trend;
        let err = val - pred;
        sum_sq_err += err * err;
        sum_abs_err += err.abs();
        if val.abs() > f64::EPSILON {
            sum_abs_pct_err += (err / val).abs();
            mape_count += 1;
        }
        let prev_level = level;
        level = alpha * val + (1.0 - alpha) * (prev_level + trend);
        trend = beta * (level - prev_level) + (1.0 - beta) * trend;
    }

    let denom = (n - 1).max(1) as f64;
    let rmse = if n > 1 {
        (sum_sq_err / denom).sqrt()
    } else {
        0.0
    };
    let mae = if n > 1 { sum_abs_err / denom } else { 0.0 };
    let mape = if mape_count > 0 {
        sum_abs_pct_err / mape_count as f64
    } else {
        0.0
    };

    ForecastResult {
        rmse,
        mae,
        mape,
        next_window: level + trend,
    }
}

pub(crate) fn get_windows(eventlog_handle: &str) -> Result<([f64; NUM_WINDOWS], usize), JsValue> {
    let state = get_or_init_state();

    let timestamps = state.with_object(eventlog_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            let mut ts = Vec::new();
            for trace in &log.traces {
                for event in &trace.events {
                    if let Some(val) = event.attributes.get(TIME_KEY) {
                        let ms = match val {
                            AttributeValue::Date(d) => parse_timestamp_ms(d),
                            AttributeValue::String(s) => parse_timestamp_ms(s),
                            _ => None,
                        };
                        if let Some(ms) = ms {
                            ts.push(ms);
                        }
                    }
                }
            }
            ts.sort_unstable();
            Ok(ts)
        }
        _ => Err(crate::error::js_val("not_found")),
    })?;

    if timestamps.len() < 2 {
        return Ok(([0.0; NUM_WINDOWS], timestamps.len()));
    }

    let min_t = timestamps[0];
    let max_t = timestamps[timestamps.len() - 1];
    let duration = (max_t - min_t) as f64;
    let window_ms = (duration / NUM_WINDOWS as f64).max(1.0);

    let mut windows = [0.0; NUM_WINDOWS];
    for &t in &timestamps {
        let idx = (((t - min_t) as f64 / window_ms) as usize).min(NUM_WINDOWS - 1);
        windows[idx] += 1.0;
    }

    Ok((windows, timestamps.len()))
}

#[wasm_bindgen]
pub fn discover_ml_forecast(
    eventlog_handle: &str,
    _activity_key: &str,
) -> Result<JsValue, JsValue> {
    let (windows, count) = get_windows(eventlog_handle)?;

    if count < 2 {
        return to_js_val(&json!({
            "algorithm": "ml_forecast",
            "forecast": { "next_window": 0.0, "confidence": 0.0 }
        }));
    }

    let res = forecast_internal(&windows, DEFAULT_ALPHA);

    let mean_density = count as f64 / NUM_WINDOWS as f64;
    let confidence = if mean_density > 0.0 {
        (1.0 - (res.rmse / mean_density)).clamp(0.0, 1.0)
    } else {
        0.0
    };

    to_js_val(&json!({
        "algorithm": "ml_forecast",
        "forecast": {
            "next_window": res.next_window,
            "confidence": confidence,
            "rmse": res.rmse,
            "mae": res.mae,
            "mape": res.mape
        }
    }))
}

fn to_js_val(value: &serde_json::Value) -> Result<JsValue, JsValue> {
    serde_json::to_string(value)
        .map(|s| crate::error::js_val(&s))
        .map_err(|e| crate::error::wasm_err(crate::error::codes::INTERNAL_ERROR, e.to_string()))
}

#[cfg(test)]
mod holt_tests {
    use super::*;

    /// Hand-computable: perfect linear trend with alpha=beta=1.0.
    /// Level tracks x exactly, trend stays 1, every one-step forecast is exact,
    /// next forecast = 5 + 1 = 6.
    #[test]
    fn holt_linear_series_alpha_beta_one_is_exact() {
        let series = [1.0, 2.0, 3.0, 4.0, 5.0];
        let res = holt_internal(&series, 1.0, 1.0);
        assert_eq!(res.next_window, 6.0, "forecast must be exactly 6.0");
        assert_eq!(
            res.rmse, 0.0,
            "linear trend must be forecast with zero error"
        );
        assert_eq!(res.mae, 0.0);
        assert_eq!(res.mape, 0.0);
    }

    #[test]
    fn holt_empty_and_singleton_do_not_panic() {
        let res = holt_internal(&[], 0.5, 0.5);
        assert_eq!(res.next_window, 0.0);
        // len<2: b_0 = 0, forecast = x_0.
        let res = holt_internal(&[7.0], 0.5, 0.5);
        assert_eq!(res.next_window, 7.0);
        assert_eq!(res.rmse, 0.0);
    }

    /// With beta=0 and b_0=0 (singleton init not triggered here, so force via
    /// a series whose first two points are equal), Holt's level recursion
    /// reduces to SES: l_t = alpha*x_t + (1-alpha)*l_{t-1}.
    #[test]
    fn holt_zero_trend_start_and_beta_zero_reduces_to_ses() {
        let series = [3.0, 3.0, 5.0, 4.0, 6.0, 2.0];
        let holt = holt_internal(&series, 0.3, 0.0);
        let ses = forecast_internal(&series, 0.3);
        assert!(
            (holt.next_window - ses.next_window).abs() < 1e-12,
            "beta=0 with zero initial trend must equal SES: holt={} ses={}",
            holt.next_window,
            ses.next_window
        );
        assert!((holt.rmse - ses.rmse).abs() < 1e-12);
        assert!((holt.mae - ses.mae).abs() < 1e-12);
    }
}
