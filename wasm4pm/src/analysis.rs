use crate::error::{codes, wasm_err};
use crate::state::{get_or_init_state, StoredObject};
use crate::utilities::to_js;
use crate::{Data, Median}; // Conditional import: statrs or hand_rolled_stats
use serde_json::json;
use wasm_bindgen::prelude::*;

/// Perform dotted chart analysis on an EventLog
#[wasm_bindgen]
pub fn analyze_dotted_chart(eventlog_handle: &str) -> Result<JsValue, JsValue> {
    get_or_init_state().with_object(eventlog_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
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

            to_js(&json!({
                "type": "dotted_chart",
                "case_count": log.traces.len(),
                "total_events": total_events,
                "cases": data
            }))
        }
        Some(_) => Err(wasm_err(codes::INVALID_INPUT, "Object is not an EventLog")),
        None => Err(wasm_err(
            codes::INVALID_HANDLE,
            format!("EventLog '{}' not found", eventlog_handle),
        )),
    })
}

/// Get event statistics from an EventLog
#[wasm_bindgen]
pub fn analyze_event_statistics(eventlog_handle: &str) -> Result<JsValue, JsValue> {
    get_or_init_state().with_object(eventlog_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            let total_events = log.event_count();
            let total_cases = log.case_count();

            let stats = json!({
                "total_events": total_events,
                "total_cases": total_cases,
                "avg_events_per_case": if total_cases > 0 {
                    total_events as f64 / total_cases as f64
                } else {
                    0.0
                },
            });

            to_js(&stats)
        }
        Some(_) => Err(wasm_err(codes::INVALID_INPUT, "Object is not an EventLog")),
        None => Err(wasm_err(
            codes::INVALID_HANDLE,
            format!("EventLog '{}' not found", eventlog_handle),
        )),
    })
}

/// Get object statistics from an OCEL
#[wasm_bindgen]
pub fn analyze_ocel_statistics(ocel_handle: &str) -> Result<JsValue, JsValue> {
    get_or_init_state().with_object(ocel_handle, |obj| match obj {
        Some(StoredObject::OCEL(ocel)) => {
            let stats = json!({
                "total_events": ocel.event_count(),
                "total_objects": ocel.object_count(),
            });

            to_js(&stats)
        }
        Some(_) => Err(wasm_err(codes::INVALID_INPUT, "Object is not an OCEL")),
        None => Err(wasm_err(
            codes::INVALID_HANDLE,
            format!("OCEL '{}' not found", ocel_handle),
        )),
    })
}

/// Analyze case duration from an EventLog
#[wasm_bindgen]
pub fn analyze_case_duration(eventlog_handle: &str) -> Result<JsValue, JsValue> {
    get_or_init_state().with_object(eventlog_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            let mut event_counts: Vec<usize> = log.traces.iter().map(|t| t.events.len()).collect();

            let stats = if !event_counts.is_empty() {
                event_counts.sort();
                let sum: usize = event_counts.iter().sum();
                let avg = sum as f64 / event_counts.len() as f64;

                // Use statrs for proper median calculation
                let counts_f64: Vec<f64> = event_counts.iter().map(|&x| x as f64).collect();
                let data = Data::new(counts_f64);
                let median = data.median() as usize;

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

            to_js(&stats)
        }
        Some(_) => Err(wasm_err(codes::INVALID_INPUT, "Object is not an EventLog")),
        None => Err(wasm_err(
            codes::INVALID_HANDLE,
            format!("EventLog '{}' not found", eventlog_handle),
        )),
    })
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
