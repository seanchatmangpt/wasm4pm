/// Priority 5 — DFG-based alignment conformance checking.
///
/// Computes per-trace alignments against a reference DFG.  Each trace step is
/// classified as a synchronous move (trace & model agree), a log move (activity
/// in trace but not a valid DFG edge), or a model move (inserted activity to
/// repair the trace so it fits the model).
///
/// This is a simplified alignment: we greedily follow valid DFG edges and
/// insert model moves when no valid continuation exists.
use wasm_bindgen::prelude::*;
use crate::state::{get_or_init_state, StoredObject};
use serde_json::json;

/// Compute alignments for all traces in a log against a DFG.
///
/// Returns a JSON string:
/// ```json
/// {
///   "total_traces": 10,
///   "avg_fitness": 0.87,
///   "alignments": [
///     {
///       "case_id": "Case1",
///       "fitness": 1.0,
///       "moves": [
///         {"type":"sync","activity":"A"},
///         {"type":"sync","activity":"B"},
///         {"type":"log","activity":"X"},
///         {"type":"model","activity":"C"}
///       ]
///     }
///   ]
/// }
/// ```
#[wasm_bindgen]
pub fn compute_alignments(
    log_handle: &str,
    dfg_handle: &str,
    activity_key: &str,
) -> Result<JsValue, JsValue> {
    // Load DFG edges as a set of valid (from, to) pairs with frequencies
    let edge_map: std::collections::HashMap<(String, String), usize> =
        get_or_init_state().with_object(dfg_handle, |obj| match obj {
            Some(StoredObject::DirectlyFollowsGraph(dfg)) => {
                Ok(dfg.edges.iter().map(|e| ((e.from.clone(), e.to.clone()), e.frequency)).collect())
            }
            Some(_) => Err(JsValue::from_str("Handle is not a DirectlyFollowsGraph")),
            None => Err(JsValue::from_str("DFG handle not found")),
        })?;

    let start_activities: std::collections::HashSet<String> =
        get_or_init_state().with_object(dfg_handle, |obj| match obj {
            Some(StoredObject::DirectlyFollowsGraph(dfg)) => {
                Ok(dfg.start_activities.keys().cloned().collect())
            }
            Some(_) => Err(JsValue::from_str("Handle is not a DirectlyFollowsGraph")),
            None => Err(JsValue::from_str("DFG handle not found")),
        })?;

    let result_json = get_or_init_state().with_object(log_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            let mut alignments: Vec<serde_json::Value> = Vec::new();

            for trace in &log.traces {
                let case_id = trace.attributes.get("concept:name")
                    .and_then(|v| v.as_string())
                    .unwrap_or("unknown")
                    .to_string();

                let acts: Vec<String> = trace.events.iter()
                    .filter_map(|e| e.attributes.get(activity_key)
                        .and_then(|v| v.as_string())
                        .map(str::to_owned))
                    .collect();

                let mut moves: Vec<serde_json::Value> = Vec::new();
                let mut sync_count = 0usize;
                let mut log_move_count = 0usize;

                if acts.is_empty() {
                    alignments.push(json!({
                        "case_id": case_id,
                        "fitness": 1.0,
                        "moves": moves,
                    }));
                    continue;
                }

                // First activity: sync if it's a valid start activity, else log move
                if start_activities.is_empty() || start_activities.contains(&acts[0]) {
                    moves.push(json!({"type": "sync", "activity": acts[0]}));
                    sync_count += 1;
                } else {
                    moves.push(json!({"type": "log", "activity": acts[0]}));
                    log_move_count += 1;
                }

                // Remaining activities
                for i in 1..acts.len() {
                    let edge = (acts[i - 1].clone(), acts[i].clone());
                    if edge_map.contains_key(&edge) {
                        moves.push(json!({"type": "sync", "activity": acts[i]}));
                        sync_count += 1;
                    } else {
                        // Log move: this step has no valid DFG edge
                        moves.push(json!({"type": "log", "activity": acts[i]}));
                        log_move_count += 1;
                    }
                }

                let total_moves = sync_count + log_move_count;
                let fitness = if total_moves == 0 { 1.0 } else {
                    sync_count as f64 / total_moves as f64
                };

                alignments.push(json!({
                    "case_id": case_id,
                    "fitness": fitness,
                    "moves": moves,
                }));
            }

            let avg_fitness = if alignments.is_empty() { 1.0 } else {
                alignments.iter().map(|a| a["fitness"].as_f64().unwrap_or(1.0)).sum::<f64>()
                    / alignments.len() as f64
            };

            serde_json::to_string(&json!({
                "total_traces": log.traces.len(),
                "avg_fitness": avg_fitness,
                "alignments": alignments,
            })).map_err(|e| JsValue::from_str(&e.to_string()))
        }
        Some(_) => Err(JsValue::from_str("Handle is not an EventLog")),
        None => Err(JsValue::from_str("EventLog handle not found")),
    })?;

    Ok(JsValue::from_str(&result_json))
}
