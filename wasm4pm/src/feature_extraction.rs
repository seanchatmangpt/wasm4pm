use crate::models::*;
use crate::state::{get_or_init_state, StoredObject};
use crate::utilities::to_js;
use serde_json::{Map, Value};
use std::collections::HashMap;
use wasm_bindgen::prelude::*;

/// Extract feature vectors from event log traces for ML training.
///
/// Config JSON structure:
/// ```json
/// {
///   "features": ["trace_length", "elapsed_time", "activity_counts", "rework_count"],
///   "target": "remaining_time"  // or "outcome", "next_activity"
/// }
/// ```
///
/// Returns: JSON array of feature vectors (one per trace)
#[wasm_bindgen]
pub fn extract_case_features(
    log_handle: &str,
    activity_key: &str,
    timestamp_key: &str,
    config_json: &str,
) -> Result<JsValue, JsValue> {
    // Parse config
    let config: Map<String, Value> = serde_json::from_str(config_json)
        .map_err(|e| JsValue::from_str(&format!("Invalid config JSON: {}", e)))?;

    let features_list: Vec<String> = config
        .get("features")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str())
                .map(|s| s.to_string())
                .collect()
        })
        .unwrap_or_default();

    let target: String = config
        .get("target")
        .and_then(|v| v.as_str())
        .unwrap_or("remaining_time")
        .to_string();

    get_or_init_state().with_object(log_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            let mut results = Vec::new();

            for trace in &log.traces {
                if trace.events.is_empty() {
                    continue;
                }

                let mut feature_vec = Map::new();

                // Add case ID if available
                if let Some(case_id) = trace
                    .attributes
                    .get("concept:name")
                    .and_then(|v| v.as_string())
                {
                    feature_vec.insert("case_id".to_string(), Value::String(case_id.to_string()));
                }

                // Extract requested features
                for feature in &features_list {
                    match feature.as_str() {
                        "trace_length" => {
                            feature_vec.insert(
                                "trace_length".to_string(),
                                Value::Number(trace.events.len().into()),
                            );
                        }
                        "elapsed_time" => {
                            if let Some(elapsed) = compute_elapsed_time(&trace, timestamp_key) {
                                feature_vec.insert(
                                    "elapsed_time".to_string(),
                                    Value::Number(elapsed.into()),
                                );
                            }
                        }
                        "activity_counts" => {
                            let counts = count_activities(&trace, activity_key);
                            for (act, count) in counts {
                                let key = format!("activity_{}", act);
                                feature_vec.insert(key, Value::Number(count.into()));
                            }
                        }
                        "rework_count" => {
                            let rework = count_rework(&trace, activity_key);
                            feature_vec
                                .insert("rework_count".to_string(), Value::Number(rework.into()));
                        }
                        "unique_activities" => {
                            let unique = count_unique_activities(&trace, activity_key);
                            feature_vec.insert(
                                "unique_activities".to_string(),
                                Value::Number(unique.into()),
                            );
                        }
                        "avg_inter_event_time" => {
                            if let Some(avg_time) =
                                compute_avg_inter_event_time(&trace, timestamp_key)
                            {
                                feature_vec.insert(
                                    "avg_inter_event_time".to_string(),
                                    Value::Number(
                                        serde_json::Number::from_f64(avg_time)
                                            .unwrap_or(serde_json::Number::from(0)),
                                    ),
                                );
                            }
                        }
                        _ => {} // Skip unknown features
                    }
                }

                // Add target variable
                match target.as_str() {
                    "remaining_time" => {
                        // For complete traces, remaining time is 0 (case is finished)
                        feature_vec.insert("remaining_time".to_string(), Value::Number(0.into()));
                    }
                    "outcome" => {
                        // Get last activity as outcome
                        if let Some(last_event) = trace.events.last() {
                            if let Some(activity) = last_event
                                .attributes
                                .get(activity_key)
                                .and_then(|v| v.as_string())
                            {
                                feature_vec.insert(
                                    "outcome".to_string(),
                                    Value::String(activity.to_string()),
                                );
                            }
                        }
                    }
                    "next_activity" => {
                        // For case features, use last activity as default
                        if let Some(last_event) = trace.events.last() {
                            if let Some(activity) = last_event
                                .attributes
                                .get(activity_key)
                                .and_then(|v| v.as_string())
                            {
                                feature_vec.insert(
                                    "next_activity".to_string(),
                                    Value::String(activity.to_string()),
                                );
                            }
                        }
                    }
                    _ => {} // Skip unknown targets
                }

                results.push(Value::Object(feature_vec));
            }

            to_js(&results)
        }
        Some(_) => Err(JsValue::from_str("Object is not an EventLog")),
        None => Err(JsValue::from_str("EventLog not found")),
    })
}

/// Extract feature vectors for each prefix of each trace.
///
/// Generates one feature vector per prefix (up to prefix_length).
/// This is useful for "predict next activity" or "predict remaining time" tasks.
///
/// Returns: JSON array with many more entries (one per prefix).
#[wasm_bindgen]
pub fn extract_prefix_features(
    log_handle: &str,
    activity_key: &str,
    timestamp_key: &str,
    prefix_length: usize,
) -> Result<JsValue, JsValue> {
    get_or_init_state().with_object(log_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            let mut results = Vec::new();

            for trace in &log.traces {
                if trace.events.is_empty() {
                    continue;
                }

                // Generate features for each prefix up to prefix_length
                for prefix_idx in 1..=trace.events.len().min(prefix_length) {
                    let prefix_events = &trace.events[0..prefix_idx];

                    let mut feature_vec = Map::new();

                    // Basic features
                    feature_vec.insert(
                        "prefix_length".to_string(),
                        Value::Number(prefix_idx.into()),
                    );
                    feature_vec.insert(
                        "trace_length".to_string(),
                        Value::Number(trace.events.len().into()),
                    );

                    // Activity counts in prefix
                    let counts = count_activities_in_events(prefix_events, activity_key);
                    for (act, count) in counts {
                        let key = format!("activity_{}", act);
                        feature_vec.insert(key, Value::Number(count.into()));
                    }

                    // Rework in prefix
                    let rework = count_rework_in_events(prefix_events, activity_key);
                    feature_vec.insert("rework_count".to_string(), Value::Number(rework.into()));

                    // Elapsed time in prefix
                    if let Some(elapsed) =
                        compute_elapsed_time_in_events(prefix_events, timestamp_key)
                    {
                        feature_vec
                            .insert("elapsed_time".to_string(), Value::Number(elapsed.into()));
                    }

                    // Remaining time: total duration - elapsed in prefix
                    if let (Some(total_duration), Some(prefix_elapsed)) = (
                        compute_elapsed_time(&trace, timestamp_key),
                        compute_elapsed_time_in_events(prefix_events, timestamp_key),
                    ) {
                        let remaining = (total_duration - prefix_elapsed).max(0);
                        feature_vec.insert(
                            "remaining_time".to_string(),
                            Value::Number(remaining.into()),
                        );
                    }

                    // Add case ID if available
                    if let Some(case_id) = trace
                        .attributes
                        .get("concept:name")
                        .and_then(|v| v.as_string())
                    {
                        feature_vec
                            .insert("case_id".to_string(), Value::String(case_id.to_string()));
                    }

                    // Target: next activity (what comes after the prefix)
                    if prefix_idx < trace.events.len() {
                        if let Some(next_activity) = trace.events[prefix_idx]
                            .attributes
                            .get(activity_key)
                            .and_then(|v| v.as_string())
                        {
                            feature_vec.insert(
                                "next_activity".to_string(),
                                Value::String(next_activity.to_string()),
                            );
                        }
                    }

                    results.push(Value::Object(feature_vec));
                }
            }

            to_js(&results)
        }
        Some(_) => Err(JsValue::from_str("Object is not an EventLog")),
        None => Err(JsValue::from_str("EventLog not found")),
    })
}

/// CSV escape helper: wraps values in quotes and escapes internal quotes.
fn csv_escape(s: &str) -> String {
    format!("\"{}\"", s.replace('"', "\"\""))
}

/// Export features as CSV string.
///
/// Input: JSON array of feature vectors (from extract_case_features or extract_prefix_features)
/// Output: CSV string with headers and one row per feature vector
#[wasm_bindgen]
pub fn export_features_csv(features_json: &str) -> Result<String, JsValue> {
    let features: Vec<serde_json::Map<String, Value>> = serde_json::from_str(features_json)
        .map_err(|e| JsValue::from_str(&format!("Invalid features JSON: {}", e)))?;

    if features.is_empty() {
        return Ok(String::new());
    }

    // Collect all keys (columns) from all objects
    let mut all_keys = std::collections::HashSet::new();
    for feature in &features {
        all_keys.extend(feature.keys().cloned());
    }

    let mut keys: Vec<String> = all_keys.into_iter().collect();
    keys.sort(); // Deterministic column order

    // Build CSV
    let mut csv = String::new();

    // Header row (with escaping)
    let header_row: Vec<String> = keys.iter().map(|k| csv_escape(k)).collect();
    csv.push_str(&header_row.join(","));
    csv.push('\n');

    // Data rows (with escaping)
    for feature in features {
        let row: Vec<String> = keys
            .iter()
            .map(|k| {
                let value_str = feature
                    .get(k)
                    .map(|v| match v {
                        Value::String(s) => s.clone(),
                        Value::Number(n) => n.to_string(),
                        Value::Bool(b) => b.to_string(),
                        _ => String::new(),
                    })
                    .unwrap_or_else(|| String::new());
                csv_escape(&value_str)
            })
            .collect();
        csv.push_str(&row.join(","));
        csv.push('\n');
    }

    Ok(csv)
}

/// Extract features and export as JSON string.
///
/// Convenience wrapper that calls extract_case_features internally
/// and returns the result as a JSON string (not JsValue).
#[wasm_bindgen]
pub fn export_features_json(
    log_handle: &str,
    activity_key: &str,
    timestamp_key: &str,
    config_json: &str,
) -> Result<String, JsValue> {
    get_or_init_state().with_object(log_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            // Parse config
            let config: Map<String, Value> = serde_json::from_str(config_json)
                .map_err(|e| JsValue::from_str(&format!("Invalid config JSON: {}", e)))?;

            let features_list: Vec<String> = config
                .get("features")
                .and_then(|v| v.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| v.as_str())
                        .map(|s| s.to_string())
                        .collect()
                })
                .unwrap_or_default();

            let target: String = config
                .get("target")
                .and_then(|v| v.as_str())
                .unwrap_or("remaining_time")
                .to_string();

            let mut results = Vec::new();

            for trace in &log.traces {
                if trace.events.is_empty() {
                    continue;
                }

                let mut feature_vec = Map::new();

                // Extract requested features
                for feature in &features_list {
                    match feature.as_str() {
                        "trace_length" => {
                            feature_vec.insert(
                                "trace_length".to_string(),
                                Value::Number(trace.events.len().into()),
                            );
                        }
                        "elapsed_time" => {
                            if let Some(elapsed) = compute_elapsed_time(&trace, timestamp_key) {
                                feature_vec.insert(
                                    "elapsed_time".to_string(),
                                    Value::Number(elapsed.into()),
                                );
                            }
                        }
                        "activity_counts" => {
                            let counts = count_activities(&trace, activity_key);
                            for (act, count) in counts {
                                let key = format!("activity_{}", act);
                                feature_vec.insert(key, Value::Number(count.into()));
                            }
                        }
                        "rework_count" => {
                            let rework = count_rework(&trace, activity_key);
                            feature_vec
                                .insert("rework_count".to_string(), Value::Number(rework.into()));
                        }
                        "unique_activities" => {
                            let unique = count_unique_activities(&trace, activity_key);
                            feature_vec.insert(
                                "unique_activities".to_string(),
                                Value::Number(unique.into()),
                            );
                        }
                        "avg_inter_event_time" => {
                            if let Some(avg_time) =
                                compute_avg_inter_event_time(&trace, timestamp_key)
                            {
                                feature_vec.insert(
                                    "avg_inter_event_time".to_string(),
                                    Value::Number(
                                        serde_json::Number::from_f64(avg_time)
                                            .unwrap_or(serde_json::Number::from(0)),
                                    ),
                                );
                            }
                        }
                        _ => {}
                    }
                }

                // Add target variable
                match target.as_str() {
                    "remaining_time" => {
                        if let Some(elapsed) = compute_elapsed_time(&trace, timestamp_key) {
                            let remaining = elapsed / 2;
                            feature_vec.insert(
                                "remaining_time".to_string(),
                                Value::Number(remaining.into()),
                            );
                        }
                    }
                    "outcome" => {
                        if let Some(last_event) = trace.events.last() {
                            if let Some(activity) = last_event
                                .attributes
                                .get(activity_key)
                                .and_then(|v| v.as_string())
                            {
                                feature_vec.insert(
                                    "outcome".to_string(),
                                    Value::String(activity.to_string()),
                                );
                            }
                        }
                    }
                    "next_activity" => {
                        if let Some(last_event) = trace.events.last() {
                            if let Some(activity) = last_event
                                .attributes
                                .get(activity_key)
                                .and_then(|v| v.as_string())
                            {
                                feature_vec.insert(
                                    "next_activity".to_string(),
                                    Value::String(activity.to_string()),
                                );
                            }
                        }
                    }
                    _ => {}
                }

                results.push(Value::Object(feature_vec));
            }

            serde_json::to_string(&results)
                .map_err(|e| JsValue::from_str(&format!("Failed to serialize features: {}", e)))
        }
        Some(_) => Err(JsValue::from_str("Object is not an EventLog")),
        None => Err(JsValue::from_str("EventLog not found")),
    })
}

// ============================================================================
// Helper Functions
// ============================================================================

/// Count activity occurrences in a trace
fn count_activities(trace: &Trace, activity_key: &str) -> HashMap<String, usize> {
    let mut counts = HashMap::new();
    for event in &trace.events {
        if let Some(activity) = event
            .attributes
            .get(activity_key)
            .and_then(|v| v.as_string())
        {
            *counts.entry(activity.to_string()).or_insert(0) += 1;
        }
    }
    counts
}

/// Count activity occurrences in a slice of events
fn count_activities_in_events(events: &[Event], activity_key: &str) -> HashMap<String, usize> {
    let mut counts = HashMap::new();
    for event in events {
        if let Some(activity) = event
            .attributes
            .get(activity_key)
            .and_then(|v| v.as_string())
        {
            *counts.entry(activity.to_string()).or_insert(0) += 1;
        }
    }
    counts
}

/// Count total rework (extra executions of activities that appear more than once)
/// E.g., if A appears 3 times: (3-1) = 2 extra executions
fn count_rework(trace: &Trace, activity_key: &str) -> usize {
    let counts = count_activities(trace, activity_key);
    counts.values().filter(|&&c| c > 1).map(|&c| c - 1).sum()
}

/// Count total rework in a slice of events
fn count_rework_in_events(events: &[Event], activity_key: &str) -> usize {
    let counts = count_activities_in_events(events, activity_key);
    counts.values().filter(|&&c| c > 1).map(|&c| c - 1).sum()
}

/// Count unique activities in a trace
fn count_unique_activities(trace: &Trace, activity_key: &str) -> usize {
    count_activities(trace, activity_key).len()
}

/// Compute elapsed time (last timestamp - first timestamp) in milliseconds
fn compute_elapsed_time(trace: &Trace, timestamp_key: &str) -> Option<i64> {
    if trace.events.len() < 2 {
        return Some(0);
    }

    let first_ts = trace.events[0]
        .attributes
        .get(timestamp_key)
        .and_then(|v| v.as_string())
        .and_then(parse_timestamp_ms)?;

    let last_ts = trace.events[trace.events.len() - 1]
        .attributes
        .get(timestamp_key)
        .and_then(|v| v.as_string())
        .and_then(parse_timestamp_ms)?;

    Some((last_ts - first_ts).max(0))
}

/// Compute elapsed time for a slice of events
fn compute_elapsed_time_in_events(events: &[Event], timestamp_key: &str) -> Option<i64> {
    if events.len() < 1 {
        return Some(0);
    }

    if events.len() == 1 {
        return Some(0);
    }

    let first_ts = events[0]
        .attributes
        .get(timestamp_key)
        .and_then(|v| v.as_string())
        .and_then(parse_timestamp_ms)?;

    let last_ts = events[events.len() - 1]
        .attributes
        .get(timestamp_key)
        .and_then(|v| v.as_string())
        .and_then(parse_timestamp_ms)?;

    Some((last_ts - first_ts).max(0))
}

/// Compute average inter-event time in milliseconds
fn compute_avg_inter_event_time(trace: &Trace, timestamp_key: &str) -> Option<f64> {
    if trace.events.len() < 2 {
        return Some(0.0);
    }

    let mut total_time = 0i64;
    let mut count = 0;

    for i in 0..trace.events.len() - 1 {
        let curr_ts = trace.events[i]
            .attributes
            .get(timestamp_key)
            .and_then(|v| v.as_string())
            .and_then(parse_timestamp_ms)?;

        let next_ts = trace.events[i + 1]
            .attributes
            .get(timestamp_key)
            .and_then(|v| v.as_string())
            .and_then(parse_timestamp_ms)?;

        total_time += (next_ts - curr_ts).max(0);
        count += 1;
    }

    if count > 0 {
        Some(total_time as f64 / count as f64)
    } else {
        Some(0.0)
    }
}
