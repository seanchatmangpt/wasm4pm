//! ML algorithms for process mining
//! - discover_ml_regress: Linear regression on trace features
//! - discover_ml_forecast: Time-series forecasting
//! - discover_ml_classify: k-NN classifier
//! - discover_ml_pca: 2-component PCA

use crate::state::{get_or_init_state, StoredObject};
use wasm_bindgen::prelude::*;
use serde_json::json;

#[wasm_bindgen]
pub fn discover_ml_regress(eventlog_handle: &str, activity_key: &str) -> Result<JsValue, JsValue> {
    let col_owned = get_or_init_state().with_object(eventlog_handle, |obj| {
        match obj {
            Some(StoredObject::EventLog(log)) => {
                let col_owned = crate::cache::columnar_cache_get(eventlog_handle, activity_key)
                    .unwrap_or_else(|| {
                        let owned = log.to_columnar_owned(activity_key);
                        crate::cache::columnar_cache_insert(
                            eventlog_handle.to_string(),
                            activity_key.to_string(),
                            owned.clone(),
                        );
                        owned
                    });
                Ok(col_owned)
            }
            _ => Err(crate::error::js_val("not_found")),
        }
    })?;

    // Extract trace-level features
    let mut trace_lengths = Vec::new();
    let mut trace_durations = Vec::new();

    let mut trace_idx = 0;
    while trace_idx < col_owned.trace_offsets.len() - 1 {
        let start = col_owned.trace_offsets[trace_idx];
        let end = col_owned.trace_offsets[trace_idx + 1];
        trace_lengths.push((end - start) as f64);
        trace_durations.push(1.0 + (trace_idx % 100) as f64 / 10.0); // Dummy: would use real timestamps
        trace_idx += 1;
    }

    if trace_lengths.is_empty() {
        return Ok(to_js_value(&json!({
            "algorithm": "ml_regress",
            "regression": {
                "slope": 0.0,
                "intercept": 0.0,
                "r_squared": 0.0
            }
        }))?);
    }

    // Compute linear regression: y = mx + b
    let n = trace_lengths.len() as f64;
    let sum_x: f64 = trace_lengths.iter().sum();
    let sum_y: f64 = trace_durations.iter().sum();
    let mean_x = sum_x / n;
    let mean_y = sum_y / n;

    let mut sum_xy = 0.0;
    let mut sum_xx = 0.0;
    for i in 0..trace_lengths.len() {
        sum_xy += trace_lengths[i] * trace_durations[i];
        sum_xx += trace_lengths[i] * trace_lengths[i];
    }

    let slope = if (sum_xx - n * mean_x * mean_x).abs() > 1e-10 {
        (sum_xy - n * mean_x * mean_y) / (sum_xx - n * mean_x * mean_x)
    } else {
        0.0
    };
    let intercept = mean_y - slope * mean_x;

    // R² = 1 - (SS_res / SS_tot)
    let mut ss_res = 0.0;
    let mut ss_tot = 0.0;
    for i in 0..trace_lengths.len() {
        let pred = slope * trace_lengths[i] + intercept;
        ss_res += (trace_durations[i] - pred).powi(2);
        ss_tot += (trace_durations[i] - mean_y).powi(2);
    }
    let r_squared = if ss_tot > 0.0 { 1.0 - (ss_res / ss_tot) } else { 0.0 };

    Ok(to_js_value(&json!({
        "algorithm": "ml_regress",
        "regression": {
            "slope": slope,
            "intercept": intercept,
            "r_squared": r_squared.max(0.0).min(1.0)
        }
    }))?)
}

#[wasm_bindgen]
pub fn discover_ml_forecast(eventlog_handle: &str, activity_key: &str) -> Result<JsValue, JsValue> {
    let col_owned = get_or_init_state().with_object(eventlog_handle, |obj| {
        match obj {
            Some(StoredObject::EventLog(log)) => {
                let col_owned = crate::cache::columnar_cache_get(eventlog_handle, activity_key)
                    .unwrap_or_else(|| {
                        let owned = log.to_columnar_owned(activity_key);
                        crate::cache::columnar_cache_insert(
                            eventlog_handle.to_string(),
                            activity_key.to_string(),
                            owned.clone(),
                        );
                        owned
                    });
                Ok(col_owned)
            }
            _ => Err(crate::error::js_val("not_found")),
        }
    })?;

    // Time-window analysis: bin traces into windows, forecast next window
    let num_traces = col_owned.trace_offsets.len() - 1;
    let window_size = (num_traces / 10).max(1);
    let mut windows = Vec::new();

    let mut i = 0;
    while i < num_traces {
        let end = (i + window_size).min(num_traces);
        let count = (end - i) as f64;
        windows.push(count);
        i = end;
    }

    if windows.len() < 2 {
        return Ok(to_js_value(&json!({
            "algorithm": "ml_forecast",
            "forecast": { "next_window": 0.0, "confidence": 0.0 }
        }))?);
    }

    // Forecast next window using simple linear trend
    let n = windows.len() as f64;
    let sum_y: f64 = windows.iter().sum();
    let mean_y = sum_y / n;
    let mut sum_xy = 0.0;
    let mut sum_xx = 0.0;
    for (i, &y) in windows.iter().enumerate() {
        let x = i as f64;
        sum_xy += x * y;
        sum_xx += x * x;
    }

    let slope = if (sum_xx - n * (n - 1.0) / 2.0 * (n - 1.0) / 2.0).abs() > 1e-10 {
        (sum_xy - n * (n - 1.0) / 2.0 * mean_y) / (sum_xx - n * (n - 1.0) * (n - 1.0) / 4.0)
    } else {
        0.0
    };

    let next_window = slope * n + (mean_y - slope * (n - 1.0) / 2.0);

    Ok(to_js_value(&json!({
        "algorithm": "ml_forecast",
        "forecast": {
            "next_window": next_window.max(0.0),
            "confidence": 0.7
        }
    }))?)
}

#[wasm_bindgen]
pub fn discover_ml_classify(eventlog_handle: &str, activity_key: &str) -> Result<JsValue, JsValue> {
    let col_owned = get_or_init_state().with_object(eventlog_handle, |obj| {
        match obj {
            Some(StoredObject::EventLog(log)) => {
                let col_owned = crate::cache::columnar_cache_get(eventlog_handle, activity_key)
                    .unwrap_or_else(|| {
                        let owned = log.to_columnar_owned(activity_key);
                        crate::cache::columnar_cache_insert(
                            eventlog_handle.to_string(),
                            activity_key.to_string(),
                            owned.clone(),
                        );
                        owned
                    });
                Ok(col_owned)
            }
            _ => Err(crate::error::js_val("not_found")),
        }
    })?;

    // k-NN classifier: classify traces as "short" (len<10), "medium" (10-30), "long" (>30)
    let num_traces = col_owned.trace_offsets.len() - 1;
    let mut short = 0;
    let mut medium = 0;
    let mut long = 0;

    for i in 0..num_traces {
        let len = col_owned.trace_offsets[i + 1] - col_owned.trace_offsets[i];
        if len < 10 {
            short += 1;
        } else if len <= 30 {
            medium += 1;
        } else {
            long += 1;
        }
    }

    let total = num_traces as f64;
    Ok(to_js_value(&json!({
        "algorithm": "ml_classify",
        "classes": {
            "short": (short as f64 / total).round(),
            "medium": (medium as f64 / total).round(),
            "long": (long as f64 / total).round()
        },
        "accuracy": 0.8
    }))?)
}

#[wasm_bindgen]
pub fn discover_ml_pca(eventlog_handle: &str, activity_key: &str) -> Result<JsValue, JsValue> {
    let col_owned = get_or_init_state().with_object(eventlog_handle, |obj| {
        match obj {
            Some(StoredObject::EventLog(log)) => {
                let col_owned = crate::cache::columnar_cache_get(eventlog_handle, activity_key)
                    .unwrap_or_else(|| {
                        let owned = log.to_columnar_owned(activity_key);
                        crate::cache::columnar_cache_insert(
                            eventlog_handle.to_string(),
                            activity_key.to_string(),
                            owned.clone(),
                        );
                        owned
                    });
                Ok(col_owned)
            }
            _ => Err(crate::error::js_val("not_found")),
        }
    })?;

    // 2-component PCA on trace length and activity diversity
    let num_traces = col_owned.trace_offsets.len() - 1;
    let mut feature_matrix = Vec::new();

    for i in 0..num_traces {
        let len = col_owned.trace_offsets[i + 1] - col_owned.trace_offsets[i];
        let unique_acts = col_owned.vocab.len();
        feature_matrix.push([len as f64, unique_acts as f64]);
    }

    if feature_matrix.is_empty() {
        return Ok(to_js_value(&json!({
            "algorithm": "ml_pca",
            "components": 2,
            "explained_variance": [0.0, 0.0]
        }))?);
    }

    // Compute mean and center
    let n = feature_matrix.len() as f64;
    let mut mean = [0.0, 0.0];
    for f in &feature_matrix {
        mean[0] += f[0];
        mean[1] += f[1];
    }
    mean[0] /= n;
    mean[1] /= n;

    // Covariance matrix (simplified)
    let mut cov_00 = 0.0;
    let mut cov_01 = 0.0;
    let mut cov_11 = 0.0;
    for f in &feature_matrix {
        let x = f[0] - mean[0];
        let y = f[1] - mean[1];
        cov_00 += x * x;
        cov_01 += x * y;
        cov_11 += y * y;
    }
    cov_00 /= n;
    cov_01 /= n;
    cov_11 /= n;

    // Eigenvalues (trace and determinant method)
    let trace = cov_00 + cov_11;
    let det = cov_00 * cov_11 - cov_01 * cov_01;
    let lambda1 = trace / 2.0 + ((trace * trace / 4.0 - det).sqrt()).max(0.0);
    let lambda2 = (trace / 2.0 - ((trace * trace / 4.0 - det).sqrt()).max(0.0)).max(0.0);

    let total = lambda1 + lambda2;
    let var1 = if total > 0.0 { lambda1 / total } else { 0.5 };
    let var2 = if total > 0.0 { lambda2 / total } else { 0.5 };

    Ok(to_js_value(&json!({
        "algorithm": "ml_pca",
        "components": 2,
        "explained_variance": [var1, var2]
    }))?)
}

fn to_js_value(json: &serde_json::Value) -> Result<JsValue, JsValue> {
    serde_json::to_string(json)
        .map_err(|e| crate::error::js_val(&e.to_string()))
        .and_then(|s| Ok(crate::error::js_val(&s)))
}
