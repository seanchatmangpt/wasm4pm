use crate::models::{DirectlyFollowsGraph, StreamingConformanceChecker};
use crate::state::{get_or_init_state, StoredObject};
use serde_json::json;
use wasm_bindgen::prelude::*;

/// Store a DFG from its JSON representation and return a handle.
///
/// Use this to bridge the output of `discover_dfg` (which returns inline JSON)
/// into a stored object that `streaming_conformance_begin` and other
/// handle-based APIs can consume.
///
/// ```javascript
/// const dfgJson = JSON.stringify(pm.discover_dfg(logHandle, 'concept:name'));
/// const dfgHandle = pm.store_dfg_from_json(dfgJson);
/// const session = pm.streaming_conformance_begin(dfgHandle);
/// ```
#[wasm_bindgen]
pub fn store_dfg_from_json(dfg_json: &str) -> Result<JsValue, JsValue> {
    let dfg: DirectlyFollowsGraph = serde_json::from_str(dfg_json)
        .map_err(|e| JsValue::from_str(&format!("Invalid DFG JSON: {}", e)))?;
    let handle = get_or_init_state().store_object(StoredObject::DirectlyFollowsGraph(dfg))?;
    Ok(JsValue::from_str(&handle))
}

/// Begin a new streaming conformance session against a reference DFG.
///
/// `dfg_handle` — handle returned by `store_dfg_from_json` or
/// `streaming_dfg_finalize`.
///
/// Returns an opaque session handle string.
#[wasm_bindgen]
pub fn streaming_conformance_begin(dfg_handle: &str) -> Result<JsValue, JsValue> {
    let checker = get_or_init_state().with_object(dfg_handle, |obj| match obj {
        Some(StoredObject::DirectlyFollowsGraph(dfg)) => {
            Ok(StreamingConformanceChecker::from_dfg(dfg))
        }
        Some(_) => Err(JsValue::from_str("Handle is not a DirectlyFollowsGraph")),
        None => Err(JsValue::from_str("DFG handle not found")),
    })?;

    let handle =
        get_or_init_state().store_object(StoredObject::StreamingConformanceChecker(checker))?;
    Ok(JsValue::from_str(&handle))
}

/// Append one event to an in-progress trace.
///
/// Returns a JSON string: `{"ok": true, "event_count": N, "open_traces": N}`.
#[wasm_bindgen]
pub fn streaming_conformance_add_event(
    handle: &str,
    case_id: &str,
    activity: &str,
) -> Result<JsValue, JsValue> {
    get_or_init_state().with_object_mut(handle, |obj| match obj {
        Some(StoredObject::StreamingConformanceChecker(c)) => {
            c.add_event(case_id, activity);
            let json = serde_json::to_string(&json!({
                "ok": true,
                "event_count": c.event_count,
                "open_traces": c.open_traces.len(),
            }))
            .map_err(|e| JsValue::from_str(&e.to_string()))?;
            Ok(JsValue::from_str(&json))
        }
        Some(_) => Err(JsValue::from_str(
            "Handle is not a StreamingConformanceChecker",
        )),
        None => Err(JsValue::from_str(
            "StreamingConformanceChecker handle not found",
        )),
    })
}

/// Close a trace: replay it against the reference DFG and return the result.
///
/// Returns a JSON string with fields: `ok`, `case_id`, `is_conforming`,
/// `fitness`, `deviations`.
#[wasm_bindgen]
pub fn streaming_conformance_close_trace(handle: &str, case_id: &str) -> Result<JsValue, JsValue> {
    get_or_init_state().with_object_mut(handle, |obj| match obj {
        Some(StoredObject::StreamingConformanceChecker(c)) => {
            let val = match c.close_trace(case_id) {
                Some(result) => json!({
                    "ok": true,
                    "case_id": result.case_id,
                    "is_conforming": result.is_conforming,
                    "fitness": result.fitness,
                    "deviations": result.deviations,
                }),
                None => json!({ "ok": false, "reason": "case_id not open" }),
            };
            let json =
                serde_json::to_string(&val).map_err(|e| JsValue::from_str(&e.to_string()))?;
            Ok(JsValue::from_str(&json))
        }
        Some(_) => Err(JsValue::from_str(
            "Handle is not a StreamingConformanceChecker",
        )),
        None => Err(JsValue::from_str(
            "StreamingConformanceChecker handle not found",
        )),
    })
}

/// Memory and progress statistics for an open streaming conformance session.
///
/// Returns a JSON string with `event_count`, `closed_traces`, `open_traces`,
/// `conforming_traces`, `deviating_traces`, `avg_fitness`.
#[wasm_bindgen]
pub fn streaming_conformance_stats(handle: &str) -> Result<JsValue, JsValue> {
    get_or_init_state().with_object(handle, |obj| match obj {
        Some(StoredObject::StreamingConformanceChecker(c)) => {
            let conforming = c.results.iter().filter(|r| r.is_conforming).count();
            let avg_fitness = if c.results.is_empty() {
                1.0_f64
            } else {
                c.results.iter().map(|r| r.fitness).sum::<f64>() / c.results.len() as f64
            };
            let json = serde_json::to_string(&json!({
                "event_count": c.event_count,
                "closed_traces": c.results.len(),
                "open_traces": c.open_traces.len(),
                "conforming_traces": conforming,
                "deviating_traces": c.results.len() - conforming,
                "avg_fitness": avg_fitness,
            }))
            .map_err(|e| JsValue::from_str(&e.to_string()))?;
            Ok(JsValue::from_str(&json))
        }
        Some(_) => Err(JsValue::from_str(
            "Handle is not a StreamingConformanceChecker",
        )),
        None => Err(JsValue::from_str(
            "StreamingConformanceChecker handle not found",
        )),
    })
}

/// Finalize the streaming conformance session.
///
/// Flushes any still-open traces, returns a JSON summary string, and frees the
/// session handle.
#[wasm_bindgen]
pub fn streaming_conformance_finalize(handle: &str) -> Result<JsValue, JsValue> {
    let summary_json = get_or_init_state().with_object_mut(handle, |obj| match obj {
        Some(StoredObject::StreamingConformanceChecker(c)) => {
            let open_ids: Vec<String> = c.open_traces.keys().cloned().collect();
            for id in open_ids {
                c.close_trace(&id);
            }
            let conforming = c.results.iter().filter(|r| r.is_conforming).count();
            let avg_fitness = if c.results.is_empty() {
                1.0_f64
            } else {
                c.results.iter().map(|r| r.fitness).sum::<f64>() / c.results.len() as f64
            };
            let json = serde_json::to_string(&json!({
                "total_traces": c.results.len(),
                "conforming_traces": conforming,
                "deviating_traces": c.results.len() - conforming,
                "avg_fitness": avg_fitness,
                "results": c.results,
            }))
            .map_err(|e| JsValue::from_str(&e.to_string()))?;
            Ok(json)
        }
        Some(_) => Err(JsValue::from_str(
            "Handle is not a StreamingConformanceChecker",
        )),
        None => Err(JsValue::from_str(
            "StreamingConformanceChecker handle not found",
        )),
    })?;

    get_or_init_state().delete_object(handle)?;
    Ok(JsValue::from_str(&summary_json))
}
