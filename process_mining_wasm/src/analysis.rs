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
            let cases = log.cases();
            let mut data = Vec::new();

            for (case_id, case) in cases {
                let mut events_in_case = Vec::new();
                for (idx, event) in case.iter().enumerate() {
                    events_in_case.push(json!({
                        "timestamp": event.timestamp(),
                        "activity": event.activity(),
                        "sequence": idx,
                    }));
                }
                data.push(json!({
                    "case_id": case_id,
                    "events": events_in_case,
                    "duration": if case.is_empty() {
                        0
                    } else {
                        let first_time = case.first().map(|e| e.timestamp());
                        let last_time = case.last().map(|e| e.timestamp());
                        if let (Some(f), Some(l)) = (first_time, last_time) {
                            l.signed_duration_since(*f).num_seconds()
                        } else {
                            0
                        }
                    },
                }));
            }

            serde_json::to_string(&json!({
                "type": "dotted_chart",
                "case_count": cases.len(),
                "total_events": log.len(),
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
            for case in log.cases().values() {
                for event in case {
                    *activity_counts.entry(event.activity().to_string()).or_insert(0) += 1;
                }
            }

            let stats = json!({
                "total_events": log.len(),
                "total_cases": log.cases().len(),
                "unique_activities": activity_counts.len(),
                "activity_frequencies": activity_counts,
                "avg_events_per_case": log.len() as f64 / log.cases().len().max(1) as f64,
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
            let events = ocel.events();
            let objects = ocel.objects();

            let mut object_type_counts: std::collections::HashMap<String, usize> =
                std::collections::HashMap::new();
            for obj in objects.values() {
                let otype = obj.object_type();
                *object_type_counts.entry(otype.to_string()).or_insert(0) += 1;
            }

            let stats = json!({
                "total_events": events.len(),
                "total_objects": objects.len(),
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
            let cases = log.cases();
            let mut durations = Vec::new();

            for case in cases.values() {
                if let (Some(first), Some(last)) = (case.first(), case.last()) {
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
