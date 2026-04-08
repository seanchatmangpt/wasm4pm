/// Intervention Simulator — What-if analysis for process changes.
///
/// Simulate the effect of interventions on an event log:
/// - Remove an activity from all traces
/// - Add an event to traces matching a condition
/// - Reorder events (swap adjacent activities)
///
/// Pure Rust/WASM — no ML/LLM dependencies.
use wasm_bindgen::prelude::*;
use crate::state::{get_or_init_state, StoredObject};
use crate::models::{EventLog, Trace, Event, AttributeValue};
use crate::error::{wasm_err, codes};
use crate::utilities::to_js;
use std::collections::HashSet;

/// Simulate removing an activity from all traces.
///
/// Returns a new log handle with the activity removed, plus before/after metrics.
///
/// ```javascript
/// const result = JSON.parse(pm.simulate_remove_activity(handle, 'concept:name', 'Approve'));
/// // { after_handle: "obj_5", before: {...}, after: {...}, diff: {...} }
/// ```
#[wasm_bindgen]
pub fn simulate_remove_activity(
    log_handle: &str,
    activity_key: &str,
    activity_name: &str,
) -> Result<JsValue, JsValue> {
    let (traces, attributes, before_metrics) = get_or_init_state().with_object(log_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            let metrics = compute_log_metrics(log, activity_key);
            Ok((log.traces.clone(), log.attributes.clone(), metrics))
        }
        Some(_) => Err(wasm_err(codes::INVALID_INPUT, "Handle is not an EventLog")),
        None => Err(wasm_err(codes::INVALID_HANDLE, format!("EventLog '{}' not found", log_handle))),
    })?;

    // Remove activity from all traces
    let mut after_log = EventLog::new();
    after_log.attributes = attributes;

    for mut trace in traces {
        trace.events.retain(|e| {
            e.attributes.get(activity_key)
                .and_then(|v| v.as_string())
                .map(|a| a != activity_name)
                .unwrap_or(true)
        });
        // Only keep traces that still have at least one event
        if !trace.events.is_empty() {
            after_log.traces.push(trace);
        }
    }

    let after_metrics = compute_log_metrics(&after_log, activity_key);

    let after_handle = get_or_init_state()
        .store_object(StoredObject::EventLog(after_log))
        .map_err(|_| wasm_err(codes::INTERNAL_ERROR, "Failed to store modified log"))?;

    to_js(&serde_json::json!({
        "after_handle": after_handle,
        "before": before_metrics,
        "after": after_metrics,
        "diff": {
            "trace_count_change": after_metrics["trace_count"].as_i64().unwrap_or(0) as i64 - before_metrics["trace_count"].as_i64().unwrap_or(0) as i64,
            "event_count_change": after_metrics["event_count"].as_i64().unwrap_or(0) as i64 - before_metrics["event_count"].as_i64().unwrap_or(0) as i64,
            "activity_count_change": after_metrics["activity_count"].as_i64().unwrap_or(0) as i64 - before_metrics["activity_count"].as_i64().unwrap_or(0) as i64,
            "edge_count_change": after_metrics["edge_count"].as_i64().unwrap_or(0) as i64 - before_metrics["edge_count"].as_i64().unwrap_or(0) as i64,
        },
        "intervention": {
            "type": "remove_activity",
            "activity": activity_name,
        },
    }))
}

/// Simulate adding an event to traces that match a condition.
///
/// For traces whose last activity matches `condition_activity`, appends
/// `new_activity` as a new event.
///
/// ```javascript
/// const result = JSON.parse(pm.simulate_add_event(handle, 'concept:name', 'Approve', 'Archive'));
/// // { after_handle: "obj_6", before: {...}, after: {...}, diff: {...} }
/// ```
#[wasm_bindgen]
pub fn simulate_add_event(
    log_handle: &str,
    activity_key: &str,
    condition_activity: &str,
    new_activity: &str,
) -> Result<JsValue, JsValue> {
    let (traces, attributes, before_metrics) = get_or_init_state().with_object(log_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            let metrics = compute_log_metrics(log, activity_key);
            Ok((log.traces.clone(), log.attributes.clone(), metrics))
        }
        Some(_) => Err(wasm_err(codes::INVALID_INPUT, "Handle is not an EventLog")),
        None => Err(wasm_err(codes::INVALID_HANDLE, format!("EventLog '{}' not found", log_handle))),
    })?;

    let mut modified_count = 0usize;
    let mut after_log = EventLog::new();
    after_log.attributes = attributes;

    for mut trace in traces {
        let last_activity = trace.events.last()
            .and_then(|e| e.attributes.get(activity_key))
            .and_then(|v| v.as_string());

        if last_activity == Some(condition_activity) {
            let mut new_event = Event {
                attributes: std::collections::HashMap::new(),
            };
            new_event.attributes.insert(activity_key.to_string(), AttributeValue::String(new_activity.to_string()));
            trace.events.push(new_event);
            modified_count += 1;
        }
        after_log.traces.push(trace);
    }

    let after_metrics = compute_log_metrics(&after_log, activity_key);

    let after_handle = get_or_init_state()
        .store_object(StoredObject::EventLog(after_log))
        .map_err(|_| wasm_err(codes::INTERNAL_ERROR, "Failed to store modified log"))?;

    to_js(&serde_json::json!({
        "after_handle": after_handle,
        "before": before_metrics,
        "after": after_metrics,
        "diff": {
            "modified_traces": modified_count,
            "event_count_change": after_metrics["event_count"].as_i64().unwrap_or(0) as i64 - before_metrics["event_count"].as_i64().unwrap_or(0) as i64,
            "edge_count_change": after_metrics["edge_count"].as_i64().unwrap_or(0) as i64 - before_metrics["edge_count"].as_i64().unwrap_or(0) as i64,
        },
        "intervention": {
            "type": "add_event",
            "condition_activity": condition_activity,
            "new_activity": new_activity,
            "modified_count": modified_count,
        },
    }))
}

/// Simulate reordering: swap two adjacent activities wherever they appear consecutively.
///
/// ```javascript
/// const result = JSON.parse(pm.simulate_reorder(handle, 'concept:name', 'B', 'C'));
/// // Swaps all B->C sequences to C->B
/// ```
#[wasm_bindgen]
pub fn simulate_reorder(
    log_handle: &str,
    activity_key: &str,
    first_activity: &str,
    second_activity: &str,
) -> Result<JsValue, JsValue> {
    let (traces, attributes, before_metrics) = get_or_init_state().with_object(log_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            let metrics = compute_log_metrics(log, activity_key);
            Ok((log.traces.clone(), log.attributes.clone(), metrics))
        }
        Some(_) => Err(wasm_err(codes::INVALID_INPUT, "Handle is not an EventLog")),
        None => Err(wasm_err(codes::INVALID_HANDLE, format!("EventLog '{}' not found", log_handle))),
    })?;

    let mut swap_count = 0usize;
    let mut after_log = EventLog::new();
    after_log.attributes = attributes;

    for mut trace in traces {
        let events = &mut trace.events;
        let mut i = 0;
        while i + 1 < events.len() {
            let a = events[i].attributes.get(activity_key).and_then(|v| v.as_string());
            let b = events[i + 1].attributes.get(activity_key).and_then(|v| v.as_string());
            if a == Some(first_activity) && b == Some(second_activity) {
                events.swap(i, i + 1);
                swap_count += 1;
                i += 2; // Skip swapped pair to avoid re-swapping
            } else {
                i += 1;
            }
        }
        after_log.traces.push(trace);
    }

    let after_metrics = compute_log_metrics(&after_log, activity_key);

    let after_handle = get_or_init_state()
        .store_object(StoredObject::EventLog(after_log))
        .map_err(|_| wasm_err(codes::INTERNAL_ERROR, "Failed to store modified log"))?;

    to_js(&serde_json::json!({
        "after_handle": after_handle,
        "before": before_metrics,
        "after": after_metrics,
        "diff": {
            "swapped_pairs": swap_count,
            "edge_count_change": after_metrics["edge_count"].as_i64().unwrap_or(0) as i64 - before_metrics["edge_count"].as_i64().unwrap_or(0) as i64,
        },
        "intervention": {
            "type": "reorder",
            "first_activity": first_activity,
            "second_activity": second_activity,
            "swap_count": swap_count,
        },
    }))
}

/// Simulate a batch of interventions (applied sequentially).
///
/// ```javascript
/// const interventions = JSON.stringify([
///   { type: "remove_activity", activity: "Approve" },
///   { type: "add_event", condition_activity: "Review", new_activity: "Archive" }
/// ]);
/// const result = JSON.parse(pm.simulate_batch(handle, 'concept:name', interventions));
/// ```
#[wasm_bindgen]
pub fn simulate_batch(
    log_handle: &str,
    activity_key: &str,
    interventions_json: &str,
) -> Result<JsValue, JsValue> {
    let interventions: Vec<serde_json::Value> = serde_json::from_str(interventions_json)
        .map_err(|e| wasm_err(codes::INVALID_JSON, format!("Invalid interventions JSON: {}", e)))?;

    if interventions.is_empty() {
        return Err(wasm_err(codes::INVALID_INPUT, "Interventions list must not be empty"));
    }

    let (mut traces, attributes, before_metrics) = get_or_init_state().with_object(log_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            let metrics = compute_log_metrics(log, activity_key);
            Ok((log.traces.clone(), log.attributes.clone(), metrics))
        }
        Some(_) => Err(wasm_err(codes::INVALID_INPUT, "Handle is not an EventLog")),
        None => Err(wasm_err(codes::INVALID_HANDLE, format!("EventLog '{}' not found", log_handle))),
    })?;

    let mut step_results = Vec::new();

    for (step, intervention) in interventions.iter().enumerate() {
        let int_type = intervention["type"].as_str().unwrap_or("unknown");
        let _step_before = compute_log_metrics_traces(&traces, activity_key);

        match int_type {
            "remove_activity" => {
                let activity = intervention["activity"].as_str().unwrap_or("");
                let mut removed = 0usize;
                for trace in &mut traces {
                    let before_len = trace.events.len();
                    trace.events.retain(|e| {
                        e.attributes.get(activity_key)
                            .and_then(|v| v.as_string())
                            .map(|a| a != activity)
                            .unwrap_or(true)
                    });
                    if trace.events.len() < before_len {
                        removed += before_len - trace.events.len();
                    }
                }
                traces.retain(|t| !t.events.is_empty());

                step_results.push(serde_json::json!({
                    "step": step + 1,
                    "type": "remove_activity",
                    "activity": activity,
                    "events_removed": removed,
                }));
            }
            "add_event" => {
                let condition = intervention["condition_activity"].as_str().unwrap_or("");
                let new_act = intervention["new_activity"].as_str().unwrap_or("");
                let mut added = 0usize;
                for trace in &mut traces {
                    let last = trace.events.last()
                        .and_then(|e| e.attributes.get(activity_key))
                        .and_then(|v| v.as_string());
                    if last == Some(condition) {
                        let mut new_event = Event {
                            attributes: std::collections::HashMap::new(),
                        };
                        new_event.attributes.insert(activity_key.to_string(), AttributeValue::String(new_act.to_string()));
                        trace.events.push(new_event);
                        added += 1;
                    }
                }
                step_results.push(serde_json::json!({
                    "step": step + 1,
                    "type": "add_event",
                    "condition_activity": condition,
                    "new_activity": new_act,
                    "traces_modified": added,
                }));
            }
            "reorder" => {
                let first = intervention["first_activity"].as_str().unwrap_or("");
                let second = intervention["second_activity"].as_str().unwrap_or("");
                let mut swaps = 0usize;
                for trace in &mut traces {
                    let events = &mut trace.events;
                    let mut i = 0;
                    while i + 1 < events.len() {
                        let a = events[i].attributes.get(activity_key).and_then(|v| v.as_string());
                        let b = events[i + 1].attributes.get(activity_key).and_then(|v| v.as_string());
                        if a == Some(first) && b == Some(second) {
                            events.swap(i, i + 1);
                            swaps += 1;
                            i += 2;
                        } else {
                            i += 1;
                        }
                    }
                }
                step_results.push(serde_json::json!({
                    "step": step + 1,
                    "type": "reorder",
                    "first_activity": first,
                    "second_activity": second,
                    "swaps": swaps,
                }));
            }
            _ => {
                step_results.push(serde_json::json!({
                    "step": step + 1,
                    "type": int_type,
                    "error": "unknown_intervention_type",
                }));
            }
        }
    }

    let mut after_log = EventLog::new();
    after_log.attributes = attributes;
    after_log.traces = traces;
    let after_metrics = compute_log_metrics(&after_log, activity_key);

    let after_handle = get_or_init_state()
        .store_object(StoredObject::EventLog(after_log))
        .map_err(|_| wasm_err(codes::INTERNAL_ERROR, "Failed to store modified log"))?;

    to_js(&serde_json::json!({
        "after_handle": after_handle,
        "before": before_metrics,
        "after": after_metrics,
        "steps": step_results,
        "total_interventions": interventions.len(),
    }))
}

/// Compute metrics for an EventLog.
fn compute_log_metrics(log: &EventLog, activity_key: &str) -> serde_json::Value {
    compute_log_metrics_traces(&log.traces, activity_key)
}

fn compute_log_metrics_traces(traces: &[Trace], activity_key: &str) -> serde_json::Value {
    let trace_count = traces.len();
    let event_count: usize = traces.iter().map(|t| t.events.len()).sum();

    let mut activities: HashSet<String> = HashSet::new();
    let mut edges: HashSet<(String, String)> = HashSet::new();

    for trace in traces {
        let acts: Vec<String> = trace.events.iter()
            .filter_map(|e| e.attributes.get(activity_key).and_then(|v| v.as_string()).map(str::to_owned))
            .collect();
        for a in &acts { activities.insert(a.clone()); }
        for window in acts.windows(2) {
            edges.insert((window[0].clone(), window[1].clone()));
        }
    }

    serde_json::json!({
        "trace_count": trace_count,
        "event_count": event_count,
        "activity_count": activities.len(),
        "edge_count": edges.len(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn make_test_log(traces: Vec<Vec<&str>>) -> EventLog {
        let mut log = EventLog::new();
        for activities in traces {
            let mut trace = Trace {
                attributes: HashMap::new(),
                events: Vec::new(),
            };
            for act in activities {
                let mut event = Event {
                    attributes: HashMap::new(),
                };
                event.attributes.insert("concept:name".to_string(), AttributeValue::String(act.to_string()));
                trace.events.push(event);
            }
            log.traces.push(trace);
        }
        log
    }

    #[test]
    fn test_remove_activity() {
        let log = make_test_log(vec![
            vec!["A", "B", "C"],
            vec!["A", "B", "C"],
            vec!["A", "X", "C"],
        ]);

        let mut modified = log.clone();
        for trace in &mut modified.traces {
            trace.events.retain(|e| {
                e.attributes.get("concept:name")
                    .and_then(|v| v.as_string())
                    .map(|a| a != "B")
                    .unwrap_or(true)
            });
        }
        modified.traces.retain(|t| !t.events.is_empty());

        // After removing B: ["A","C"], ["A","C"], ["A","X","C"]
        assert_eq!(modified.traces.len(), 3);
        assert_eq!(modified.traces[0].events.len(), 2);
        assert_eq!(modified.traces[2].events.len(), 3);
    }

    #[test]
    fn test_add_event() {
        let log = make_test_log(vec![
            vec!["A", "B"],
            vec!["A", "C"],
        ]);

        let mut modified = log.clone();
        for trace in &mut modified.traces {
            let last = trace.events.last()
                .and_then(|e| e.attributes.get("concept:name"))
                .and_then(|v| v.as_string());
            if last == Some("B") {
                let mut new_event = Event { attributes: HashMap::new() };
                new_event.attributes.insert("concept:name".to_string(), AttributeValue::String("D".to_string()));
                trace.events.push(new_event);
            }
        }

        assert_eq!(modified.traces[0].events.len(), 3); // A, B, D
        assert_eq!(modified.traces[1].events.len(), 2); // A, C (unchanged)
    }

    #[test]
    fn test_reorder() {
        let log = make_test_log(vec![
            vec!["A", "B", "C", "B", "C"],
        ]);

        let mut modified = log.clone();
        for trace in &mut modified.traces {
            let events = &mut trace.events;
            let mut i = 0;
            while i + 1 < events.len() {
                let a = events[i].attributes.get("concept:name").and_then(|v| v.as_string());
                let b = events[i + 1].attributes.get("concept:name").and_then(|v| v.as_string());
                if a == Some("B") && b == Some("C") {
                    events.swap(i, i + 1);
                    i += 2;
                } else {
                    i += 1;
                }
            }
        }

        // B,C swapped to C,B → A, C, B, C, B
        let acts: Vec<&str> = modified.traces[0].events.iter()
            .filter_map(|e| e.attributes.get("concept:name").and_then(|v| v.as_string()))
            .collect();
        assert_eq!(acts, vec!["A", "C", "B", "C", "B"]);
    }

    #[test]
    fn test_compute_metrics() {
        let log = make_test_log(vec![
            vec!["A", "B", "C"],
            vec!["A", "B", "D"],
        ]);
        let metrics = compute_log_metrics(&log, "concept:name");
        assert_eq!(metrics["trace_count"], 2);
        assert_eq!(metrics["event_count"], 6);
        assert_eq!(metrics["activity_count"], 4);
        assert_eq!(metrics["edge_count"], 3); // A->B, B->C, B->D
    }
}
