use crate::models::AttributeValue;
use crate::state::{get_or_init_state, StoredObject};
use serde_json::json;
use std::collections::HashSet;
/// Drift Detection — answers "Has the process behavior changed?"
///
/// Consolidates all drift-detection logic with proper `#[wasm_bindgen]` exports.
///
/// * `detect_drift` — unified, windowed Jaccard-distance drift detection over an
///   event log stored in WASM state.
/// * `compute_ewma` — exponential weighted moving average with trend classification.
use wasm_bindgen::prelude::*;

/// Detect concept drift over event log using windowed Jaccard distance.
///
/// Slides a window of `window_size` traces across the log and computes the
/// Jaccard distance between the activity sets of consecutive windows.  A drift
/// point is recorded whenever the distance exceeds 0.3.
///
/// Returns a JS object:
/// ```json
/// {
///   "drifts_detected": 2,
///   "drifts": [
///     { "position": 10, "distance": 0.45, "type": "concept_drift" }
///   ],
///   "window_size": 5,
///   "method": "jaccard_window"
/// }
/// ```
#[wasm_bindgen]
pub fn detect_drift(
    log_handle: &str,
    activity_key: &str,
    window_size: usize,
) -> Result<JsValue, JsValue> {
    get_or_init_state().with_object(log_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            let mut drifts = Vec::new();
            let mut previous_activities: HashSet<String> = HashSet::new();

            for (idx, window) in log.traces.windows(window_size).enumerate() {
                let mut current_activities: HashSet<String> = HashSet::new();

                for trace in window {
                    for event in &trace.events {
                        if let Some(AttributeValue::String(activity)) =
                            event.attributes.get(activity_key)
                        {
                            current_activities.insert(activity.clone());
                        }
                    }
                }

                if !previous_activities.is_empty() {
                    let jaccard_distance = 1.0
                        - (current_activities
                            .intersection(&previous_activities)
                            .count() as f64
                            / current_activities
                                .union(&previous_activities)
                                .count()
                                .max(1) as f64);

                    if jaccard_distance > 0.3 {
                        drifts.push(json!({
                            "position": idx * window_size,
                            "distance": jaccard_distance,
                            "type": "concept_drift"
                        }));
                    }
                }

                previous_activities = current_activities;
            }

            let result = json!({
                "drifts_detected": drifts.len(),
                "drifts": drifts,
                "window_size": window_size,
                "method": "jaccard_window"
            });
            serde_json::to_string(&result)
                .map(|s| JsValue::from_str(&s))
                .map_err(|e| JsValue::from_str(&e.to_string()))
        }
        Some(_) => Err(JsValue::from_str("Handle is not an EventLog")),
        None => Err(JsValue::from_str("EventLog handle not found")),
    })
}

/// Compute exponential weighted moving average (EWMA) with trend classification.
/// values and classify the overall trend.
///
/// `values_json` — JSON array of numbers, e.g. `"[1.0, 2.0, 3.5]"`.
/// `alpha` — smoothing factor in (0, 1]; higher = more weight on recent values.
///
/// Returns a JS object:
/// ```json
/// {
///   "smoothed": [1.0, 1.3, 1.96],
///   "trend": "rising",
///   "last_value": 1.96
/// }
/// ```
#[wasm_bindgen]
pub fn compute_ewma(values_json: &str, alpha: f64) -> Result<JsValue, JsValue> {
    let values: Vec<f64> = serde_json::from_str(values_json)
        .map_err(|e| JsValue::from_str(&format!("Invalid values JSON: {}", e)))?;

    if values.is_empty() {
        let r = json!({ "smoothed": [], "trend": "stable", "last_value": null });
        return serde_json::to_string(&r)
            .map(|s| JsValue::from_str(&s))
            .map_err(|e| JsValue::from_str(&e.to_string()));
    }

    // Compute EWMA inline (same logic as prediction_additions::ewma)
    let mut smoothed = Vec::with_capacity(values.len());
    smoothed.push(values[0]);
    for i in 1..values.len() {
        let ema = alpha * values[i] + (1.0 - alpha) * smoothed[i - 1];
        smoothed.push(ema);
    }

    // Classify trend from the smoothed series
    let trend = if smoothed.len() < 2 {
        "stable"
    } else {
        let first = smoothed[0];
        let last = *smoothed.last().unwrap();
        let range = (last - first).abs();
        let scale = first.abs().max(last.abs()).max(1e-9);
        if range / scale < 0.05 {
            "stable"
        } else if last > first {
            "rising"
        } else {
            "falling"
        }
    };

    let last_value = *smoothed.last().unwrap();

    let result = json!({
        "smoothed": smoothed,
        "trend": trend,
        "last_value": last_value
    });
    serde_json::to_string(&result)
        .map(|s| JsValue::from_str(&s))
        .map_err(|e| JsValue::from_str(&e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[ignore = "compute_ewma uses JsValue which panics in test environment"]
    fn test_compute_ewma_rising() {
        let json_str = "[1.0, 2.0, 3.0, 4.0, 5.0]";
        let result = compute_ewma(json_str, 0.3);
        assert!(result.is_ok());
    }

    #[test]
    #[ignore = "compute_ewma uses JsValue which panics in test environment"]
    fn test_compute_ewma_empty() {
        let result = compute_ewma("[]", 0.5);
        assert!(result.is_ok());
    }

    #[test]
    #[ignore = "compute_ewma uses JsValue which panics in test environment"]
    fn test_compute_ewma_single() {
        let result = compute_ewma("[42.0]", 0.5);
        assert!(result.is_ok());
    }

    #[test]
    #[ignore = "compute_ewma uses JsValue which panics in test environment"]
    fn test_compute_ewma_invalid_json() {
        let result = compute_ewma("not json", 0.5);
        assert!(result.is_err());
    }
}
