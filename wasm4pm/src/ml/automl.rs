//! Nanosecond AutoML — automated parameter selection for ML algorithm families.

use crate::state::{get_or_init_state, StoredObject};
use crate::ml::forecasting::{get_windows, forecast_internal};
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

pub fn discover_automl_forecast_internal(windows: &[f64]) -> AutomlForecastResult {
    let mut best_alpha = 0.3;
    let mut min_avg_rmse = f64::MAX;
    
    // Exhaustive sweep: 0.05 to 0.95 with 0.05 step
    for i in 1..20 {
        let alpha = i as f64 * 0.05;
        let mut total_rmse = 0.0;
        
        // 5-fold Cross-Validation on windows
        const FOLDS: usize = 5;
        let fold_size = windows.len() / FOLDS;
        
        for fold in 0..FOLDS {
            let test_start = fold * fold_size;
            let test_end = test_start + fold_size;
            
            // Evaluation on the fold
            let res = forecast_internal(&windows[test_start..test_end], alpha);
            total_rmse += res.rmse;
        }
        
        let avg_rmse = total_rmse / FOLDS as f64;
        if avg_rmse < min_avg_rmse {
            min_avg_rmse = avg_rmse;
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
