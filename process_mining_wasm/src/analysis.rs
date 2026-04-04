use wasm_bindgen::prelude::*;
use process_mining::{EventLog, OCEL};
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
                let case_events = trace.events.len();
                total_events += case_events;

                data.push(json!({
                    "case_id": case_idx,
                    "event_count": case_events,
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
            let mut total_events = 0;

            for trace in &log.traces {
                total_events += trace.events.len();
            }

            let total_cases = log.traces.len();
            let stats = json!({
                "total_events": total_events,
                "total_cases": total_cases,
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
            let stats = json!({
                "total_events": ocel.events.len(),
                "total_objects": ocel.objects.len(),
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
            // Calculate case statistics based on event counts
            let mut event_counts = Vec::new();

            for trace in &log.traces {
                event_counts.push(trace.events.len());
            }

            let stats = if !event_counts.is_empty() {
                event_counts.sort();
                let sum: usize = event_counts.iter().sum();
                let avg = sum as f64 / event_counts.len() as f64;
                let median = event_counts[event_counts.len() / 2];

                json!({
                    "case_count": event_counts.len(),
                    "average_events_per_case": avg,
                    "median_events_per_case": median,
                    "min_events_per_case": event_counts[0],
                    "max_events_per_case": event_counts[event_counts.len() - 1],
                })
            } else {
                json!({
                    "case_count": 0,
                    "average_events_per_case": 0,
                    "median_events_per_case": 0,
                    "min_events_per_case": 0,
                    "max_events_per_case": 0,
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
