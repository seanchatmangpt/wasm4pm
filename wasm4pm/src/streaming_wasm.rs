//! WASM bindings for streaming discovery algorithms.
//!
//! This module provides JavaScript-accessible functions for all streaming
//! algorithms. Each algorithm has:
//!
//! - `streaming_<algorithm>_begin()` - Create new session
//! - `streaming_<algorithm>_add_event()` - Add one event
//! - `streaming_<algorithm>_add_batch()` - Add batch of events
//! - `streaming_<algorithm>_close_trace()` - Close a trace
//! - `streaming_<algorithm>_snapshot()` - Get current model
//! - `streaming_<algorithm>_finalize()` - Finalize and return model
//! - `streaming_<algorithm>_stats()` - Get statistics

use wasm_bindgen::prelude::*;
use crate::state::{get_or_init_state, StoredObject};
use crate::streaming::{
    StreamingAlgorithm,
    StreamingDfgBuilder,
    StreamingSkeletonBuilder,
    StreamingHeuristicBuilder,
};
use serde_json::json;

// ============================================================================
// DFG Streaming (already existed, moved here)
// ============================================================================

/// Begin a new streaming DFG session.
#[wasm_bindgen]
pub fn streaming_dfg_begin() -> Result<JsValue, JsValue> {
    let handle = get_or_init_state().store_object(StoredObject::StreamingDfgBuilder(StreamingDfgBuilder::new()))?;
    Ok(JsValue::from_str(&handle))
}

/// Append one event to an in-progress DFG trace.
#[wasm_bindgen]
pub fn streaming_dfg_add_event(handle: &str, case_id: &str, activity: &str) -> Result<JsValue, JsValue> {
    get_or_init_state().with_object_mut(handle, |obj| match obj {
        Some(StoredObject::StreamingDfgBuilder(b)) => {
            b.add_event(case_id, activity);
            serde_wasm_bindgen::to_value(&json!({
                "ok": true,
                "event_count": b.event_count,
                "open_traces": b.open_traces.len(),
                "activities": b.interner.len(),
            })).map_err(|e| JsValue::from_str(&e.to_string()))
        }
        Some(_) => Err(JsValue::from_str("Handle is not a StreamingDfgBuilder")),
        None => Err(JsValue::from_str("StreamingDfgBuilder handle not found")),
    })
}

/// Add a batch of events in one call (chunked ingestion).
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
                "activities": b.interner.len(),
            })).map_err(|e| JsValue::from_str(&e.to_string()))
        }
        Some(_) => Err(JsValue::from_str("Handle is not a StreamingDfgBuilder")),
        None => Err(JsValue::from_str("StreamingDfgBuilder handle not found")),
    })
}

/// Close a DFG trace and fold into model.
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

/// Flush all currently-open DFG traces.
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

/// Take a non-destructive DFG snapshot.
#[wasm_bindgen]
pub fn streaming_dfg_snapshot(handle: &str) -> Result<JsValue, JsValue> {
    get_or_init_state().with_object(handle, |obj| match obj {
        Some(StoredObject::StreamingDfgBuilder(b)) => {
            let dfg = b.snapshot();
            serde_wasm_bindgen::to_value(&dfg)
                .map_err(|e| JsValue::from_str(&e.to_string()))
        }
        Some(_) => Err(JsValue::from_str("Handle is not a StreamingDfgBuilder")),
        None => Err(JsValue::from_str("StreamingDfgBuilder handle not found")),
    })
}

/// Finalize the stream and return DFG handle.
#[wasm_bindgen]
pub fn streaming_dfg_finalize(handle: &str) -> Result<JsValue, JsValue> {
    let dfg = get_or_init_state().with_object_mut(handle, |obj| match obj {
        Some(StoredObject::StreamingDfgBuilder(b)) => {
            let case_ids: Vec<String> = b.open_traces.keys().cloned().collect();
            for id in case_ids {
                b.close_trace(&id);
            }
            Ok(b.snapshot())
        }
        Some(_) => Err(JsValue::from_str("Handle is not a StreamingDfgBuilder")),
        None => Err(JsValue::from_str("StreamingDfgBuilder handle not found")),
    })?;

    let n_nodes = dfg.nodes.len();
    let n_edges = dfg.edges.len();
    let dfg_handle = get_or_init_state()
        .store_object(StoredObject::DirectlyFollowsGraph(dfg))
        .map_err(|_| JsValue::from_str("Failed to store DFG"))?;

    get_or_init_state().delete_object(handle)?;

    serde_wasm_bindgen::to_value(&json!({
        "dfg_handle": dfg_handle,
        "nodes": n_nodes,
        "edges": n_edges,
    })).map_err(|e| JsValue::from_str(&e.to_string()))
}

/// Report memory/progress statistics.
#[wasm_bindgen]
pub fn streaming_dfg_stats(handle: &str) -> Result<JsValue, JsValue> {
    get_or_init_state().with_object(handle, |obj| match obj {
        Some(StoredObject::StreamingDfgBuilder(b)) => {
            let stats = b.stats();
            serde_wasm_bindgen::to_value(&stats)
                .map_err(|e| JsValue::from_str(&e.to_string()))
        }
        Some(_) => Err(JsValue::from_str("Handle is not a StreamingDfgBuilder")),
        None => Err(JsValue::from_str("StreamingDfgBuilder handle not found")),
    })
}

// ============================================================================
// Skeleton Streaming
// ============================================================================

/// Begin a new streaming Skeleton session.
#[wasm_bindgen]
pub fn streaming_skeleton_begin(min_frequency: usize) -> Result<JsValue, JsValue> {
    let builder = StreamingSkeletonBuilder::with_min_frequency(min_frequency);
    let handle = get_or_init_state().store_object(StoredObject::StreamingSkeletonBuilder(builder))?;
    Ok(JsValue::from_str(&handle))
}

/// Append one event to an in-progress Skeleton trace.
#[wasm_bindgen]
pub fn streaming_skeleton_add_event(handle: &str, case_id: &str, activity: &str) -> Result<JsValue, JsValue> {
    get_or_init_state().with_object_mut(handle, |obj| match obj {
        Some(StoredObject::StreamingSkeletonBuilder(b)) => {
            b.add_event(case_id, activity);
            let stats = b.stats();
            serde_wasm_bindgen::to_value(&json!({
                "ok": true,
                "event_count": stats.event_count,
                "open_traces": stats.open_traces,
            })).map_err(|e| JsValue::from_str(&e.to_string()))
        }
        Some(_) => Err(JsValue::from_str("Handle is not a StreamingSkeletonBuilder")),
        None => Err(JsValue::from_str("StreamingSkeletonBuilder handle not found")),
    })
}

/// Close a Skeleton trace.
#[wasm_bindgen]
pub fn streaming_skeleton_close_trace(handle: &str, case_id: &str) -> Result<JsValue, JsValue> {
    get_or_init_state().with_object_mut(handle, |obj| match obj {
        Some(StoredObject::StreamingSkeletonBuilder(b)) => {
            let closed = b.close_trace(case_id);
            serde_wasm_bindgen::to_value(&json!({
                "ok": closed,
                "trace_count": b.trace_count,
            })).map_err(|e| JsValue::from_str(&e.to_string()))
        }
        Some(_) => Err(JsValue::from_str("Handle is not a StreamingSkeletonBuilder")),
        None => Err(JsValue::from_str("StreamingSkeletonBuilder handle not found")),
    })
}

/// Take a non-destructive Skeleton snapshot.
#[wasm_bindgen]
pub fn streaming_skeleton_snapshot(handle: &str) -> Result<JsValue, JsValue> {
    get_or_init_state().with_object(handle, |obj| match obj {
        Some(StoredObject::StreamingSkeletonBuilder(b)) => {
            let dfg = b.snapshot();
            serde_wasm_bindgen::to_value(&dfg)
                .map_err(|e| JsValue::from_str(&e.to_string()))
        }
        Some(_) => Err(JsValue::from_str("Handle is not a StreamingSkeletonBuilder")),
        None => Err(JsValue::from_str("StreamingSkeletonBuilder handle not found")),
    })
}

/// Finalize Skeleton stream.
#[wasm_bindgen]
pub fn streaming_skeleton_finalize(handle: &str) -> Result<JsValue, JsValue> {
    let dfg = get_or_init_state().with_object_mut(handle, |obj| match obj {
        Some(StoredObject::StreamingSkeletonBuilder(b)) => {
            let case_ids: Vec<String> = b.open_trace_ids();
            for id in case_ids {
                b.close_trace(&id);
            }
            Ok(b.snapshot())
        }
        Some(_) => Err(JsValue::from_str("Handle is not a StreamingSkeletonBuilder")),
        None => Err(JsValue::from_str("StreamingSkeletonBuilder handle not found")),
    })?;

    let n_nodes = dfg.nodes.len();
    let n_edges = dfg.edges.len();
    let dfg_handle = get_or_init_state()
        .store_object(StoredObject::DirectlyFollowsGraph(dfg))
        .map_err(|_| JsValue::from_str("Failed to store DFG"))?;

    get_or_init_state().delete_object(handle)?;

    serde_wasm_bindgen::to_value(&json!({
        "dfg_handle": dfg_handle,
        "nodes": n_nodes,
        "edges": n_edges,
    })).map_err(|e| JsValue::from_str(&e.to_string()))
}

// ============================================================================
// Heuristic Streaming
// ============================================================================

/// Begin a new streaming Heuristic Miner session.
#[wasm_bindgen]
pub fn streaming_heuristic_begin(threshold: f64) -> Result<JsValue, JsValue> {
    let builder = StreamingHeuristicBuilder::with_dependency_threshold(threshold);
    let handle = get_or_init_state().store_object(StoredObject::StreamingHeuristicBuilder(builder))?;
    Ok(JsValue::from_str(&handle))
}

/// Append one event to an in-progress Heuristic trace.
#[wasm_bindgen]
pub fn streaming_heuristic_add_event(handle: &str, case_id: &str, activity: &str) -> Result<JsValue, JsValue> {
    get_or_init_state().with_object_mut(handle, |obj| match obj {
        Some(StoredObject::StreamingHeuristicBuilder(b)) => {
            b.add_event(case_id, activity);
            let stats = b.stats();
            serde_wasm_bindgen::to_value(&json!({
                "ok": true,
                "event_count": stats.event_count,
                "open_traces": stats.open_traces,
            })).map_err(|e| JsValue::from_str(&e.to_string()))
        }
        Some(_) => Err(JsValue::from_str("Handle is not a StreamingHeuristicBuilder")),
        None => Err(JsValue::from_str("StreamingHeuristicBuilder handle not found")),
    })
}

/// Close a Heuristic trace.
#[wasm_bindgen]
pub fn streaming_heuristic_close_trace(handle: &str, case_id: &str) -> Result<JsValue, JsValue> {
    get_or_init_state().with_object_mut(handle, |obj| match obj {
        Some(StoredObject::StreamingHeuristicBuilder(b)) => {
            let closed = b.close_trace(case_id);
            serde_wasm_bindgen::to_value(&json!({
                "ok": closed,
                "trace_count": b.trace_count,
            })).map_err(|e| JsValue::from_str(&e.to_string()))
        }
        Some(_) => Err(JsValue::from_str("Handle is not a StreamingHeuristicBuilder")),
        None => Err(JsValue::from_str("StreamingHeuristicBuilder handle not found")),
    })
}

/// Take a non-destructive Heuristic snapshot.
#[wasm_bindgen]
pub fn streaming_heuristic_snapshot(handle: &str) -> Result<JsValue, JsValue> {
    get_or_init_state().with_object(handle, |obj| match obj {
        Some(StoredObject::StreamingHeuristicBuilder(b)) => {
            let dfg = b.snapshot();
            serde_wasm_bindgen::to_value(&dfg)
                .map_err(|e| JsValue::from_str(&e.to_string()))
        }
        Some(_) => Err(JsValue::from_str("Handle is not a StreamingHeuristicBuilder")),
        None => Err(JsValue::from_str("StreamingHeuristicBuilder handle not found")),
    })
}

/// Finalize Heuristic stream.
#[wasm_bindgen]
pub fn streaming_heuristic_finalize(handle: &str) -> Result<JsValue, JsValue> {
    let dfg = get_or_init_state().with_object_mut(handle, |obj| match obj {
        Some(StoredObject::StreamingHeuristicBuilder(b)) => {
            let case_ids: Vec<String> = b.open_trace_ids();
            for id in case_ids {
                b.close_trace(&id);
            }
            Ok(b.snapshot())
        }
        Some(_) => Err(JsValue::from_str("Handle is not a StreamingHeuristicBuilder")),
        None => Err(JsValue::from_str("StreamingHeuristicBuilder handle not found")),
    })?;

    let n_nodes = dfg.nodes.len();
    let n_edges = dfg.edges.len();
    let dfg_handle = get_or_init_state()
        .store_object(StoredObject::DirectlyFollowsGraph(dfg))
        .map_err(|_| JsValue::from_str("Failed to store DFG"))?;

    get_or_init_state().delete_object(handle)?;

    serde_wasm_bindgen::to_value(&json!({
        "dfg_handle": dfg_handle,
        "nodes": n_nodes,
        "edges": n_edges,
    })).map_err(|e| JsValue::from_str(&e.to_string()))
}

/// Streaming module info.
#[wasm_bindgen]
pub fn streaming_info() -> String {
    serde_json::json!({
        "status": "streaming_api_available",
        "description": "Streaming discovery algorithms for infinite event streams",
        "algorithms": [
            {"name": "dfg", "status": "implemented"},
            {"name": "skeleton", "status": "implemented"},
            {"name": "heuristic", "status": "implemented"},
            {"name": "alpha_plus_plus", "status": "implemented"},
            {"name": "declare", "status": "implemented"},
            {"name": "inductive_miner", "status": "implemented"},
            {"name": "hill_climbing", "status": "implemented"},
            {"name": "noise_filtered_dfg", "status": "implemented"},
            {"name": "astar", "status": "implemented"},
        ]
    }).to_string()
}
