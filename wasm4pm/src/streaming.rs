use wasm_bindgen::prelude::*;
use crate::state::{get_or_init_state, StoredObject};
use crate::models::StreamingDfgBuilder;
use serde_json::json;
use serde_wasm_bindgen;

/// Begin a new streaming DFG session.
///
/// Returns an opaque handle string.  Pass this handle to every subsequent
/// `streaming_dfg_*` call.
///
/// Memory model: only currently-open (in-progress) trace buffers are kept in
/// memory.  Completed traces are folded into O(activities²) count tables and
/// freed immediately.  This is ideal for IoT pipelines where cases arrive
/// incrementally and the full log must never be resident at once.
#[wasm_bindgen]
pub fn streaming_dfg_begin() -> Result<JsValue, JsValue> {
    let handle = get_or_init_state().store_object(StoredObject::StreamingDfgBuilder(StreamingDfgBuilder::new()))?;
    Ok(JsValue::from_str(&handle))
}

/// Append one event to an in-progress trace.
///
/// - `handle`:    the handle returned by `streaming_dfg_begin`
/// - `case_id`:   identifier for the trace/case this event belongs to
/// - `activity`:  activity name string
///
/// The trace buffer for `case_id` is created automatically on first use.
/// Returns a small JSON stats object: `{"ok": true, "event_count": N, "open_traces": N}`.
#[wasm_bindgen]
pub fn streaming_dfg_add_event(handle: &str, case_id: &str, activity: &str) -> Result<JsValue, JsValue> {
    get_or_init_state().with_object_mut(handle, |obj| match obj {
        Some(StoredObject::StreamingDfgBuilder(b)) => {
            b.add_event(case_id, activity);
            serde_wasm_bindgen::to_value(&json!({
                "ok": true,
                "event_count": b.event_count,
                "open_traces": b.open_traces.len(),
                "activities": b.vocab.len(),
            })).map_err(|e| JsValue::from_str(&e.to_string()))
        }
        Some(_) => Err(JsValue::from_str("Handle is not a StreamingDfgBuilder")),
        None => Err(JsValue::from_str("StreamingDfgBuilder handle not found")),
    })
}

/// Add a batch of events in one call (chunked ingestion).
///
/// `events_json` must be a JSON array of objects, each with `"case_id"` and
/// `"activity"` string fields:
/// ```json
/// [{"case_id":"c1","activity":"A"},{"case_id":"c1","activity":"B"}, ...]
/// ```
/// Returns `{"ok": true, "added": N, "event_count": N, "open_traces": N}`.
#[wasm_bindgen]
pub fn streaming_dfg_add_batch(handle: &str, events_json: &str) -> Result<JsValue, JsValue> {
    let batch: Vec<serde_json::Value> = serde_json::from_str(events_json)
        .map_err(|e| JsValue::from_str(&format!("Invalid events JSON: {}", e)))?;

    get_or_init_state().with_object_mut(handle, |obj| match obj {
        Some(StoredObject::StreamingDfgBuilder(b)) => {
            let mut added = 0usize;
            for item in &batch {
                let case_id = item["case_id"].as_str()
                    .ok_or_else(|| JsValue::from_str("Each event must have a 'case_id' string field"))?;
                let activity = item["activity"].as_str()
                    .ok_or_else(|| JsValue::from_str("Each event must have an 'activity' string field"))?;
                b.add_event(case_id, activity);
                added += 1;
            }
            serde_wasm_bindgen::to_value(&json!({
                "ok": true,
                "added": added,
                "event_count": b.event_count,
                "open_traces": b.open_traces.len(),
                "activities": b.vocab.len(),
            })).map_err(|e| JsValue::from_str(&e.to_string()))
        }
        Some(_) => Err(JsValue::from_str("Handle is not a StreamingDfgBuilder")),
        None => Err(JsValue::from_str("StreamingDfgBuilder handle not found")),
    })
}

/// Close a trace: folds its event buffer into the running DFG counts, then
/// frees the per-trace buffer.
///
/// Call this when a case completes (e.g., the device signals end-of-process
/// or a timeout expires).  After this call the per-case buffer is gone — the
/// data lives only in the compact count tables.
///
/// Returns `{"ok": true, "trace_count": N, "open_traces": N}`, or
/// `{"ok": false, "reason": "case_id not open"}` if the case was never opened.
#[wasm_bindgen]
pub fn streaming_dfg_close_trace(handle: &str, case_id: &str) -> Result<JsValue, JsValue> {
    get_or_init_state().with_object_mut(handle, |obj| match obj {
        Some(StoredObject::StreamingDfgBuilder(b)) => {
            let closed = b.close_trace(case_id);
            serde_wasm_bindgen::to_value(&json!({
                "ok": closed,
                "trace_count": b.trace_count,
                "open_traces": b.open_traces.len(),
            })).map_err(|e| JsValue::from_str(&e.to_string()))
        }
        Some(_) => Err(JsValue::from_str("Handle is not a StreamingDfgBuilder")),
        None => Err(JsValue::from_str("StreamingDfgBuilder handle not found")),
    })
}

/// Flush all currently-open traces.
///
/// Useful at end-of-batch when you want to include incomplete traces in the
/// snapshot (e.g., IoT device lost connection mid-process).
/// Returns `{"ok": true, "flushed": N, "trace_count": N}`.
#[wasm_bindgen]
pub fn streaming_dfg_flush_open(handle: &str) -> Result<JsValue, JsValue> {
    get_or_init_state().with_object_mut(handle, |obj| match obj {
        Some(StoredObject::StreamingDfgBuilder(b)) => {
            let case_ids: Vec<String> = b.open_traces.keys().cloned().collect();
            let flushed = case_ids.len();
            for id in case_ids {
                b.close_trace(&id);
            }
            serde_wasm_bindgen::to_value(&json!({
                "ok": true,
                "flushed": flushed,
                "trace_count": b.trace_count,
            })).map_err(|e| JsValue::from_str(&e.to_string()))
        }
        Some(_) => Err(JsValue::from_str("Handle is not a StreamingDfgBuilder")),
        None => Err(JsValue::from_str("StreamingDfgBuilder handle not found")),
    })
}

/// Take a non-destructive DFG snapshot from the current closed-trace counts.
///
/// Open (in-progress) traces are NOT included — call `streaming_dfg_flush_open`
/// first if you want them.  Returns the same JSON format as `discover_dfg`.
#[wasm_bindgen]
pub fn streaming_dfg_snapshot(handle: &str) -> Result<JsValue, JsValue> {
    get_or_init_state().with_object(handle, |obj| match obj {
        Some(StoredObject::StreamingDfgBuilder(b)) => {
            let dfg = b.to_dfg();
            serde_wasm_bindgen::to_value(&dfg)
                .map_err(|e| JsValue::from_str(&e.to_string()))
        }
        Some(_) => Err(JsValue::from_str("Handle is not a StreamingDfgBuilder")),
        None => Err(JsValue::from_str("StreamingDfgBuilder handle not found")),
    })
}

/// Finalize the stream: flush all open traces, store the resulting DFG as a
/// new object, free the streaming builder, and return the DFG handle.
///
/// After this call the streaming handle is invalid.  Use the returned DFG
/// handle with `conform_token_replay`, `get_dfg`, etc.
///
/// Returns `{"dfg_handle": "obj_N", "nodes": N, "edges": N, "traces": N}`.
#[wasm_bindgen]
pub fn streaming_dfg_finalize(handle: &str) -> Result<JsValue, JsValue> {
    // Step 1: flush open traces and build DFG (inside lock via with_object_mut)
    let dfg = get_or_init_state().with_object_mut(handle, |obj| match obj {
        Some(StoredObject::StreamingDfgBuilder(b)) => {
            // Flush any still-open traces
            let case_ids: Vec<String> = b.open_traces.keys().cloned().collect();
            for id in case_ids {
                b.close_trace(&id);
            }
            Ok(b.to_dfg())
        }
        Some(_) => Err(JsValue::from_str("Handle is not a StreamingDfgBuilder")),
        None => Err(JsValue::from_str("StreamingDfgBuilder handle not found")),
    })?;

    // Step 2: store DFG (outside lock — avoids mutex re-entry)
    let n_nodes = dfg.nodes.len();
    let n_edges = dfg.edges.len();
    let dfg_handle = get_or_init_state()
        .store_object(StoredObject::DirectlyFollowsGraph(dfg))
        .map_err(|_| JsValue::from_str("Failed to store DFG"))?;

    // Step 3: free the streaming builder
    get_or_init_state().delete_object(handle)?;

    serde_wasm_bindgen::to_value(&json!({
        "dfg_handle": dfg_handle,
        "nodes": n_nodes,
        "edges": n_edges,
    })).map_err(|e| JsValue::from_str(&e.to_string()))
}

/// Report memory/progress statistics for an open streaming session.
///
/// Returns:
/// ```json
/// {
///   "event_count": N,
///   "trace_count": N,
///   "open_traces": N,
///   "activities": N,
///   "edge_pairs": N,
///   "open_trace_events": N
/// }
/// ```
/// `open_trace_events` is the total buffered events across all open traces —
/// the dominant memory cost.  Once traces are closed that number returns to 0.
#[wasm_bindgen]
pub fn streaming_dfg_stats(handle: &str) -> Result<JsValue, JsValue> {
    get_or_init_state().with_object(handle, |obj| match obj {
        Some(StoredObject::StreamingDfgBuilder(b)) => {
            let open_trace_events: usize = b.open_traces.values().map(|v| v.len()).sum();
            serde_wasm_bindgen::to_value(&json!({
                "event_count": b.event_count,
                "trace_count": b.trace_count,
                "open_traces": b.open_traces.len(),
                "activities": b.vocab.len(),
                "edge_pairs": b.edge_counts.len(),
                "open_trace_events": open_trace_events,
            })).map_err(|e| JsValue::from_str(&e.to_string()))
        }
        Some(_) => Err(JsValue::from_str("Handle is not a StreamingDfgBuilder")),
        None => Err(JsValue::from_str("StreamingDfgBuilder handle not found")),
    })
}

/// Module info
#[wasm_bindgen]
pub fn streaming_info() -> String {
    serde_json::json!({
        "status": "streaming_api_available",
        "description": "Chunked/streaming event log ingestion for IoT and memory-constrained environments",
        "memory_model": "O(open_traces × avg_trace_length) — closed traces live only in count tables",
        "functions": [
            {"name": "streaming_dfg_begin", "description": "Create a new streaming session, returns handle"},
            {"name": "streaming_dfg_add_event", "description": "Append one event to an open trace"},
            {"name": "streaming_dfg_add_batch", "description": "Add a JSON array of events in one call"},
            {"name": "streaming_dfg_close_trace", "description": "Close a trace and free its buffer"},
            {"name": "streaming_dfg_flush_open", "description": "Close all open traces at once"},
            {"name": "streaming_dfg_snapshot", "description": "Non-destructive DFG snapshot from closed traces"},
            {"name": "streaming_dfg_finalize", "description": "Flush all traces, store DFG, return DFG handle"},
            {"name": "streaming_dfg_stats", "description": "Memory and progress statistics"},
        ]
    }).to_string()
}
