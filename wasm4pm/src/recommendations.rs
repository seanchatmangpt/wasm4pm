use crate::error::{codes, wasm_err};
use crate::models::EventLog;
use crate::state::{get_or_init_state, StoredObject};
use crate::utilities::to_js;
use serde_json::json;
use std::collections::HashSet;
/// Process Mining Recommendations Engine (Phase 2B)
///
/// Analyses an event log and produces algorithm recommendations, parameter
/// tuning suggestions, next-step guidance, and data preprocessing advice
/// based on log characteristics (size, variant count, activity count, etc.).
use wasm_bindgen::prelude::*;

/// Generate recommendations for a given event log.
///
/// Inspects log characteristics and returns:
/// - Algorithm recommendations (which algorithms suit this log)
/// - Parameter adjustment suggestions
/// - Next steps guidance (conformance, optimization, etc.)
/// - Data preprocessing suggestions
///
/// Returns: JSON with `algorithm`, `parameters`, `next_steps`, `preprocessing` arrays
#[wasm_bindgen]
pub fn generate_recommendations(log_handle: &str) -> Result<JsValue, JsValue> {
    let log = get_log(log_handle)?;

    let trace_count = log.traces.len();
    let mut activity_set: HashSet<String> = HashSet::new();
    let mut variant_set: HashSet<Vec<String>> = HashSet::new();
    let mut total_events = 0usize;

    for trace in &log.traces {
        let mut variant: Vec<String> = Vec::new();
        for event in &trace.events {
            if let Some(crate::models::AttributeValue::String(s)) =
                event.attributes.get("concept:name")
            {
                activity_set.insert(s.clone());
                variant.push(s.clone());
            }
            total_events += 1;
        }
        variant_set.insert(variant);
    }

    let activity_count = activity_set.len();
    let variant_count = variant_set.len();
    let avg_trace_len = if trace_count > 0 {
        total_events as f64 / trace_count as f64
    } else {
        0.0
    };

    let characteristics = json!({
        "traces": trace_count,
        "activities": activity_count,
        "variants": variant_count,
        "total_events": total_events,
        "avg_trace_length": avg_trace_len,
    });

    // Algorithm recommendations
    let algorithm_recs = recommend_algorithms(trace_count, activity_count, variant_count);

    // Parameter suggestions
    let param_recs = recommend_parameters(trace_count, activity_count, avg_trace_len);

    // Next steps
    let next_steps = recommend_next_steps(trace_count, variant_count);

    // Preprocessing suggestions
    let preprocessing = recommend_preprocessing(trace_count, activity_count, avg_trace_len);

    let result = json!({
        "characteristics": characteristics,
        "algorithms": algorithm_recs,
        "parameters": param_recs,
        "next_steps": next_steps,
        "preprocessing": preprocessing,
    });

    to_js(&result)
}

/// Get information about the recommendations module.
#[wasm_bindgen]
pub fn recommendations_info() -> JsValue {
    let info = json!({
        "module": "recommendations",
        "description": "Algorithm and parameter recommendations based on log characteristics",
        "functions": [
            {
                "name": "generate_recommendations",
                "description": "Generate algorithm, parameter, and next-step recommendations",
                "params": ["log_handle"],
                "returns": "JSON {characteristics, algorithms, parameters, next_steps, preprocessing}"
            },
            {
                "name": "recommendations_info",
                "description": "Get information about this module",
                "params": [],
                "returns": "JSON info"
            }
        ]
    });

    to_js(&info).unwrap_or(JsValue::NULL)
}

// ---------------------------------------------------------------------------
// Recommendation logic
// ---------------------------------------------------------------------------

fn recommend_algorithms(
    trace_count: usize,
    activity_count: usize,
    variant_count: usize,
) -> Vec<serde_json::Value> {
    let mut recs = Vec::new();

    // Always recommend DFG for quick overview
    recs.push(json!({
        "algorithm": "dfg",
        "reason": "Fast overview suitable for any log size",
        "priority": "high",
    }));

    if trace_count < 5000 && activity_count < 50 {
        recs.push(json!({
            "algorithm": "alpha++",
            "reason": "Good balance of accuracy and speed for moderate logs",
            "priority": "high",
        }));
    }

    if trace_count < 2000 {
        recs.push(json!({
            "algorithm": "heuristic_miner",
            "reason": "Handles noise well; suitable for logs with <= 2K traces",
            "priority": "medium",
        }));
    }

    if variant_count > 20 && trace_count < 10000 {
        recs.push(json!({
            "algorithm": "genetic",
            "reason": "Best quality for complex processes with many variants",
            "priority": "medium",
        }));
    }

    if trace_count > 10000 {
        recs.push(json!({
            "algorithm": "process_skeleton",
            "reason": "Fastest algorithm - recommended for large logs",
            "priority": "high",
        }));
    }

    recs
}

fn recommend_parameters(
    trace_count: usize,
    _activity_count: usize,
    avg_trace_len: f64,
) -> Vec<serde_json::Value> {
    let mut recs = Vec::new();

    if trace_count > 5000 {
        recs.push(json!({
            "parameter": "dependency_threshold",
            "suggested_value": 0.7,
            "reason": "Higher threshold filters noise in large logs",
        }));
    } else {
        recs.push(json!({
            "parameter": "dependency_threshold",
            "suggested_value": 0.5,
            "reason": "Lower threshold preserves infrequent paths in small logs",
        }));
    }

    if avg_trace_len > 20.0 {
        recs.push(json!({
            "parameter": "max_trace_length",
            "suggested_value": 100,
            "reason": "Cap trace length to avoid outlier-driven complexity",
        }));
    }

    recs
}

fn recommend_next_steps(trace_count: usize, variant_count: usize) -> Vec<serde_json::Value> {
    let mut steps = Vec::new();

    steps.push(json!({
        "step": "conformance_check",
        "description": "Run conformance checking against the discovered model",
        "priority": "high",
    }));

    if variant_count > 10 {
        steps.push(json!({
            "step": "variant_analysis",
            "description": "Analyse process variants to find deviations",
            "priority": "high",
        }));
    }

    steps.push(json!({
        "step": "performance_analysis",
        "description": "Compute bottleneck and waiting-time metrics",
        "priority": "medium",
    }));

    if trace_count > 1000 {
        steps.push(json!({
            "step": "clustering",
            "description": "Cluster traces to discover sub-processes",
            "priority": "medium",
        }));
    }

    steps
}

fn recommend_preprocessing(
    trace_count: usize,
    activity_count: usize,
    avg_trace_len: f64,
) -> Vec<serde_json::Value> {
    let mut recs = Vec::new();

    if avg_trace_len > 50.0 {
        recs.push(json!({
            "action": "filter_long_traces",
            "description": "Consider filtering traces longer than 2x the mean length",
            "priority": "high",
        }));
    }

    if activity_count > 100 {
        recs.push(json!({
            "action": "aggregate_activities",
            "description": "Group infrequent activities to reduce complexity",
            "priority": "high",
        }));
    }

    if trace_count < 50 {
        recs.push(json!({
            "action": "collect_more_data",
            "description": "Log has few traces; results may not be statistically reliable",
            "priority": "medium",
        }));
    }

    recs.push(json!({
        "action": "check_timestamps",
        "description": "Verify all events have valid timestamps for performance analysis",
        "priority": "low",
    }));

    recs
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn get_log(handle: &str) -> Result<EventLog, JsValue> {
    get_or_init_state().with_object(handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => Ok(log.clone()),
        Some(_) => Err(wasm_err(codes::INVALID_INPUT, "Object is not an EventLog")),
        None => Err(wasm_err(
            codes::INVALID_HANDLE,
            format!("EventLog '{}' not found", handle),
        )),
    })
}
