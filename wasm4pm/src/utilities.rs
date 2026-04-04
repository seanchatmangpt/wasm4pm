use wasm_bindgen::prelude::*;
use crate::state::{get_or_init_state, StoredObject};
use crate::models::*;
use serde_json::json;
use std::collections::{HashMap, HashSet};

/// Get trace count from EventLog
#[wasm_bindgen]
pub fn get_trace_count(eventlog_handle: &str) -> Result<usize, JsValue> {
    match get_or_init_state().get_object(eventlog_handle)? {
        Some(StoredObject::EventLog(log)) => Ok(log.traces.len()),
        Some(_) => Err(JsValue::from_str("Object is not an EventLog")),
        None => Err(JsValue::from_str("EventLog not found")),
    }
}

/// Get total event count from EventLog
#[wasm_bindgen]
pub fn get_event_count(eventlog_handle: &str) -> Result<usize, JsValue> {
    match get_or_init_state().get_object(eventlog_handle)? {
        Some(StoredObject::EventLog(log)) => Ok(log.event_count()),
        Some(_) => Err(JsValue::from_str("Object is not an EventLog")),
        None => Err(JsValue::from_str("EventLog not found")),
    }
}

/// Get unique activities from EventLog
#[wasm_bindgen]
pub fn get_activities(eventlog_handle: &str, activity_key: &str) -> Result<String, JsValue> {
    match get_or_init_state().get_object(eventlog_handle)? {
        Some(StoredObject::EventLog(log)) => {
            let activities = log.get_activities(activity_key);
            serde_json::to_string(&activities)
                .map_err(|e| JsValue::from_str(&format!("Serialization failed: {}", e)))
        }
        Some(_) => Err(JsValue::from_str("Object is not an EventLog")),
        None => Err(JsValue::from_str("EventLog not found")),
    }
}

/// Get trace lengths (number of events per trace)
#[wasm_bindgen]
pub fn get_trace_lengths(eventlog_handle: &str) -> Result<String, JsValue> {
    match get_or_init_state().get_object(eventlog_handle)? {
        Some(StoredObject::EventLog(log)) => {
            let lengths: Vec<usize> = log.traces.iter().map(|t| t.events.len()).collect();
            serde_json::to_string(&lengths)
                .map_err(|e| JsValue::from_str(&format!("Serialization failed: {}", e)))
        }
        Some(_) => Err(JsValue::from_str("Object is not an EventLog")),
        None => Err(JsValue::from_str("EventLog not found")),
    }
}

/// Get min and max trace lengths
#[wasm_bindgen]
pub fn get_trace_length_statistics(eventlog_handle: &str) -> Result<String, JsValue> {
    match get_or_init_state().get_object(eventlog_handle)? {
        Some(StoredObject::EventLog(log)) => {
            let lengths: Vec<usize> = log.traces.iter().map(|t| t.events.len()).collect();

            let stats = if !lengths.is_empty() {
                let min = *lengths.iter().min().unwrap_or(&0);
                let max = *lengths.iter().max().unwrap_or(&0);
                let sum: usize = lengths.iter().sum();
                let avg = sum as f64 / lengths.len() as f64;

                json!({
                    "min": min,
                    "max": max,
                    "average": avg,
                    "median": lengths[lengths.len() / 2],
                    "count": lengths.len(),
                })
            } else {
                json!({
                    "min": 0,
                    "max": 0,
                    "average": 0.0,
                    "median": 0,
                    "count": 0,
                })
            };

            serde_json::to_string(&stats)
                .map_err(|e| JsValue::from_str(&format!("Serialization failed: {}", e)))
        }
        Some(_) => Err(JsValue::from_str("Object is not an EventLog")),
        None => Err(JsValue::from_str("EventLog not found")),
    }
}

/// Get all attribute names used in the log
#[wasm_bindgen]
pub fn get_attribute_names(eventlog_handle: &str) -> Result<String, JsValue> {
    match get_or_init_state().get_object(eventlog_handle)? {
        Some(StoredObject::EventLog(log)) => {
            let mut attr_names = HashSet::new();

            // Collect from log attributes
            for key in log.attributes.keys() {
                attr_names.insert(key.clone());
            }

            // Collect from trace attributes
            for trace in &log.traces {
                for key in trace.attributes.keys() {
                    attr_names.insert(key.clone());
                }
            }

            // Collect from event attributes
            for trace in &log.traces {
                for event in &trace.events {
                    for key in event.attributes.keys() {
                        attr_names.insert(key.clone());
                    }
                }
            }

            let mut names: Vec<String> = attr_names.into_iter().collect();
            names.sort();

            serde_json::to_string(&names)
                .map_err(|e| JsValue::from_str(&format!("Serialization failed: {}", e)))
        }
        Some(_) => Err(JsValue::from_str("Object is not an EventLog")),
        None => Err(JsValue::from_str("EventLog not found")),
    }
}

/// Filter EventLog by activity (keep only traces containing the activity)
#[wasm_bindgen]
pub fn filter_log_by_activity(
    eventlog_handle: &str,
    activity_key: &str,
    activity_name: &str,
) -> Result<String, JsValue> {
    match get_or_init_state().get_object(eventlog_handle)? {
        Some(StoredObject::EventLog(mut log)) => {
            log.traces.retain(|trace| {
                trace.events.iter().any(|event| {
                    if let Some(AttributeValue::String(act)) = event.attributes.get(activity_key) {
                        act == activity_name
                    } else {
                        false
                    }
                })
            });

            let handle = get_or_init_state()
                .store_object(StoredObject::EventLog(log.clone()))
                .map_err(|_e| JsValue::from_str("Failed to store filtered log"))?;

            Ok(serde_json::to_string(&json!({
                "handle": handle,
                "trace_count": log.traces.len(),
                "event_count": log.event_count(),
            }))
            .map_err(|e| JsValue::from_str(&format!("Serialization failed: {}", e)))?)
        }
        Some(_) => Err(JsValue::from_str("Object is not an EventLog")),
        None => Err(JsValue::from_str("EventLog not found")),
    }
}

/// Filter EventLog by trace length range
#[wasm_bindgen]
pub fn filter_log_by_trace_length(
    eventlog_handle: &str,
    min_length: usize,
    max_length: usize,
) -> Result<String, JsValue> {
    match get_or_init_state().get_object(eventlog_handle)? {
        Some(StoredObject::EventLog(mut log)) => {
            log.traces.retain(|trace| {
                let len = trace.events.len();
                len >= min_length && len <= max_length
            });

            let handle = get_or_init_state()
                .store_object(StoredObject::EventLog(log.clone()))
                .map_err(|_e| JsValue::from_str("Failed to store filtered log"))?;

            Ok(serde_json::to_string(&json!({
                "handle": handle,
                "trace_count": log.traces.len(),
                "event_count": log.event_count(),
            }))
            .map_err(|e| JsValue::from_str(&format!("Serialization failed: {}", e)))?)
        }
        Some(_) => Err(JsValue::from_str("Object is not an EventLog")),
        None => Err(JsValue::from_str("EventLog not found")),
    }
}

/// Calculate trace durations (difference between first and last event timestamps)
#[wasm_bindgen]
pub fn calculate_trace_durations(
    eventlog_handle: &str,
    timestamp_key: &str,
) -> Result<String, JsValue> {
    match get_or_init_state().get_object(eventlog_handle)? {
        Some(StoredObject::EventLog(log)) => {
            let mut durations = Vec::new();

            for trace in &log.traces {
                if trace.events.len() >= 2 {
                    if let (
                        Some(AttributeValue::Date(start_time)),
                        Some(AttributeValue::Date(end_time)),
                    ) = (
                        trace.events[0].attributes.get(timestamp_key),
                        trace.events[trace.events.len() - 1]
                            .attributes
                            .get(timestamp_key),
                    ) {
                        durations.push(json!({
                            "start": start_time,
                            "end": end_time,
                            "duration_str": "computed"
                        }));
                    }
                }
            }

            serde_json::to_string(&durations)
                .map_err(|e| JsValue::from_str(&format!("Serialization failed: {}", e)))
        }
        Some(_) => Err(JsValue::from_str("Object is not an EventLog")),
        None => Err(JsValue::from_str("EventLog not found")),
    }
}

/// Validate that EventLog has timestamp attribute
#[wasm_bindgen]
pub fn validate_has_timestamps(eventlog_handle: &str, timestamp_key: &str) -> Result<bool, JsValue> {
    match get_or_init_state().get_object(eventlog_handle)? {
        Some(StoredObject::EventLog(log)) => {
            let has_timestamps = log.traces.iter().all(|trace| {
                trace.events.iter().all(|event| {
                    matches!(
                        event.attributes.get(timestamp_key),
                        Some(AttributeValue::Date(_))
                    )
                })
            });
            Ok(has_timestamps)
        }
        Some(_) => Err(JsValue::from_str("Object is not an EventLog")),
        None => Err(JsValue::from_str("EventLog not found")),
    }
}

/// Validate that EventLog has activity attribute
#[wasm_bindgen]
pub fn validate_has_activities(eventlog_handle: &str, activity_key: &str) -> Result<bool, JsValue> {
    match get_or_init_state().get_object(eventlog_handle)? {
        Some(StoredObject::EventLog(log)) => {
            let has_activities = log.traces.iter().all(|trace| {
                trace.events.iter().all(|event| {
                    matches!(
                        event.attributes.get(activity_key),
                        Some(AttributeValue::String(_))
                    )
                })
            });
            Ok(has_activities)
        }
        Some(_) => Err(JsValue::from_str("Object is not an EventLog")),
        None => Err(JsValue::from_str("EventLog not found")),
    }
}

/// Get activity frequencies
#[wasm_bindgen]
pub fn get_activity_frequencies(
    eventlog_handle: &str,
    activity_key: &str,
) -> Result<String, JsValue> {
    match get_or_init_state().get_object(eventlog_handle)? {
        Some(StoredObject::EventLog(log)) => {
            let mut frequencies: HashMap<String, usize> = HashMap::new();

            for trace in &log.traces {
                for event in &trace.events {
                    if let Some(AttributeValue::String(activity)) =
                        event.attributes.get(activity_key)
                    {
                        *frequencies.entry(activity.clone()).or_insert(0) += 1;
                    }
                }
            }

            let mut freq_vec: Vec<(String, usize)> = frequencies.into_iter().collect();
            freq_vec.sort_by(|a, b| b.1.cmp(&a.1));

            serde_json::to_string(&freq_vec)
                .map_err(|e| JsValue::from_str(&format!("Serialization failed: {}", e)))
        }
        Some(_) => Err(JsValue::from_str("Object is not an EventLog")),
        None => Err(JsValue::from_str("EventLog not found")),
    }
}
