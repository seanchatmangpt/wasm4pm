//! Nanosecond Forecasting Family — branchless Exponential Smoothing for process mining.

use crate::models::{AttributeValue, parse_timestamp_ms};
use crate::state::{get_or_init_state, StoredObject};
use serde_json::json;
use wasm_bindgen::prelude::*;

const NUM_WINDOWS: usize = 10;
const DEFAULT_ALPHA: f64 = 0.3;
const TIME_KEY: &str = "time:timestamp";

#[derive(serde::Serialize)]
pub struct ForecastResult {
    pub rmse: f64,
    pub next_window: f64,
}

#[inline(always)]
pub fn forecast_internal(data: &[f64], alpha: f64) -> ForecastResult {
    let n = data.len();
    if n == 0 {
        return ForecastResult {
            rmse: 0.0,
            next_window: 0.0,
        };
    }

    let mut s = data[0];
    let mut sum_sq_err = 0.0;

    for i in 1..n {
        let val = data[i];
        let prev_s = s;
        // Simple Exponential Smoothing: s_t = alpha * x_t + (1 - alpha) * s_{t-1}
        s = alpha * val + (1.0 - alpha) * prev_s;
        let err = val - prev_s;
        sum_sq_err += err * err;
    }

    let rmse = if n > 1 {
        (sum_sq_err / (n - 1) as f64).sqrt()
    } else {
        0.0
    };

    ForecastResult {
        rmse,
        next_window: s,
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
pub fn discover_ml_forecast(eventlog_handle: &str, _activity_key: &str) -> Result<JsValue, JsValue> {
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
        (1.0 - (res.rmse / mean_density)).max(0.0).min(1.0)
    } else {
        0.0
    };

    to_js_val(&json!({
        "algorithm": "ml_forecast",
        "forecast": {
            "next_window": res.next_window,
            "confidence": confidence,
            "rmse": res.rmse
        }
    }))
}

fn to_js_val(value: &serde_json::Value) -> Result<JsValue, JsValue> {
    serde_json::to_string(value)
        .map(|s| crate::error::js_val(&s))
        .map_err(|e| crate::error::wasm_err(crate::error::codes::INTERNAL_ERROR, e.to_string()))
}
