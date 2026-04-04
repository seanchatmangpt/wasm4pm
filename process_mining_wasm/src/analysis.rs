use wasm_bindgen::prelude::*;
use process_mining::core::{EventLog, OCEL};
use crate::state::{get_or_init_state, StoredObject};
use serde_json::json;

/// Perform dotted chart analysis on an EventLog
#[wasm_bindgen]
pub fn analyze_dotted_chart(eventlog_handle: &str) -> Result<String, JsValue> {
    match get_or_init_state().get_object(eventlog_handle)? {
        Some(StoredObject::EventLog(log)) => {
            // Collect statistics for dotted chart
            let mut data = Vec::new();
            let mut total_events = 0;

            for (case_idx, trace) in log.traces.iter().enumerate() {
                let mut events_in_case = Vec::new();
                for (idx, event) in trace.events.iter().enumerate() {
                    events_in_case.push(json!({
                        "timestamp": event.timestamp().to_string(),
                        "activity": event.activity(),
                        "sequence": idx,
                    }));
                }
                total_events += trace.events.len();

                let duration = if !trace.events.is_empty() {
                    let first_time = trace.events.first().map(|e| e.timestamp());
                    let last_time = trace.events.last().map(|e| e.timestamp());
                    if let (Some(f), Some(l)) = (first_time, last_time) {
                        l.signed_duration_since(*f).num_seconds()
                    } else {
                        0
                    }
                } else {
                    0
                };

                data.push(json!({
                    "case_id": case_idx,
                    "events": events_in_case,
                    "duration": duration,
                }));
            }

            serde_json::to_string(&json!({
                "type": "dotted_chart",
                "case_count": log.traces.len(),
                "total_events": total_events,
                "cases": data
            }))
            .map_err(|e| JsValue::from_str(&format!("Analysis failed: {}", e)))
        }
        Some(_) => Err(JsValue::from_str("Object is not an EventLog")),
        None => Err(JsValue::from_str("EventLog not found")),
    }
}

/// Get event statistics from an EventLog
#[wasm_bindgen]
pub fn analyze_event_statistics(eventlog_handle: &str) -> Result<String, JsValue> {
    match get_or_init_state().get_object(eventlog_handle)? {
        Some(StoredObject::EventLog(log)) => {
            // Count activity occurrences
            let mut activity_counts: std::collections::HashMap<String, usize> =
                std::collections::HashMap::new();
            let mut total_events = 0;

            for trace in &log.traces {
                for event in &trace.events {
                    total_events += 1;
                    *activity_counts
                        .entry(event.activity().to_string())
                        .or_insert(0) += 1;
                }
            }

            let total_cases = log.traces.len();
            let stats = json!({
                "total_events": total_events,
                "total_cases": total_cases,
                "unique_activities": activity_counts.len(),
                "activity_frequencies": activity_counts,
                "avg_events_per_case": if total_cases > 0 {
                    total_events as f64 / total_cases as f64
                } else {
                    0.0
                },
            });

            serde_json::to_string(&stats)
                .map_err(|e| JsValue::from_str(&format!("Analysis failed: {}", e)))
        }
        Some(_) => Err(JsValue::from_str("Object is not an EventLog")),
        None => Err(JsValue::from_str("EventLog not found")),
    }
}

/// Get object statistics from an OCEL
#[wasm_bindgen]
pub fn analyze_ocel_statistics(ocel_handle: &str) -> Result<String, JsValue> {
    match get_or_init_state().get_object(ocel_handle)? {
        Some(StoredObject::OCEL(ocel)) => {
            let mut object_type_counts: std::collections::HashMap<String, usize> =
                std::collections::HashMap::new();

            for obj in &ocel.objects {
                let otype = obj.object_type.clone();
                *object_type_counts.entry(otype).or_insert(0) += 1;
            }

            let stats = json!({
                "total_events": ocel.events.len(),
                "total_objects": ocel.objects.len(),
                "object_types": object_type_counts,
            });

            serde_json::to_string(&stats)
                .map_err(|e| JsValue::from_str(&format!("Analysis failed: {}", e)))
        }
        Some(_) => Err(JsValue::from_str("Object is not an OCEL")),
        None => Err(JsValue::from_str("OCEL not found")),
    }
}

/// Analyze case duration from an EventLog
#[wasm_bindgen]
pub fn analyze_case_duration(eventlog_handle: &str) -> Result<String, JsValue> {
    match get_or_init_state().get_object(eventlog_handle)? {
        Some(StoredObject::EventLog(log)) => {
            let mut durations = Vec::new();

            for trace in &log.traces {
                if let (Some(first), Some(last)) = (trace.events.first(), trace.events.last()) {
                    let duration = last
                        .timestamp()
                        .signed_duration_since(*first.timestamp())
                        .num_seconds();
                    durations.push(duration);
                }
            }

            let stats = if !durations.is_empty() {
                durations.sort();
                let sum: i64 = durations.iter().sum();
                let avg = sum as f64 / durations.len() as f64;
                let median = durations[durations.len() / 2];

                json!({
                    "case_count": durations.len(),
                    "average_duration_seconds": avg,
                    "median_duration_seconds": median,
                    "min_duration_seconds": durations[0],
                    "max_duration_seconds": durations[durations.len() - 1],
                })
            } else {
                json!({
                    "case_count": 0,
                    "average_duration_seconds": 0,
                    "median_duration_seconds": 0,
                    "min_duration_seconds": 0,
                    "max_duration_seconds": 0,
                })
            };

            serde_json::to_string(&stats)
                .map_err(|e| JsValue::from_str(&format!("Analysis failed: {}", e)))
        }
        Some(_) => Err(JsValue::from_str("Object is not an EventLog")),
        None => Err(JsValue::from_str("EventLog not found")),
    }
}

/// Get list of available analysis functions
#[wasm_bindgen]
pub fn available_analysis_functions() -> String {
    json!({
        "functions": [
            {
                "name": "dotted_chart",
                "description": "Dotted chart analysis for EventLogs",
                "input_type": "EventLog"
            },
            {
                "name": "event_statistics",
                "description": "Event frequency and activity statistics",
                "input_type": "EventLog"
            },
            {
                "name": "ocel_statistics",
                "description": "Object-centric statistics from OCEL",
                "input_type": "OCEL"
            },
            {
                "name": "case_duration",
                "description": "Case duration analysis",
                "input_type": "EventLog"
            }
        ]
    })
    .to_string()
}
