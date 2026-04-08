//! WASM bindings for the probabilistic data structures.
//!
//! Exposes [`StreamingLog`] to JavaScript via `wasm-bindgen`, following the
//! handle pattern used in `crate::state`.

use wasm_bindgen::prelude::*;
use crate::probabilistic::streaming_log::StreamingLog;

/// Global store for StreamingLog instances, keyed by handle.
static mut STREAMING_LOGS: Option<std::collections::HashMap<usize, StreamingLog>> = None;

/// Initialize the global store (called lazily).
fn ensure_store() {
    unsafe {
        if STREAMING_LOGS.is_none() {
            STREAMING_LOGS = Some(std::collections::HashMap::new());
        }
    }
}

/// Get a mutable reference to the store.
fn with_store<F, R>(f: F) -> R
where
    F: FnOnce(&mut std::collections::HashMap<usize, StreamingLog>) -> R,
{
    ensure_store();
    // SAFETY: ensure_store() guarantees STREAMING_LOGS is Some.
    let store = unsafe { STREAMING_LOGS.as_mut().unwrap() };
    f(store)
}

static mut NEXT_HANDLE: usize = 1;

fn next_handle() -> usize {
    let handle = unsafe { NEXT_HANDLE };
    unsafe { NEXT_HANDLE += 1 };
    handle
}

/// Create a new StreamingLog instance and return its handle.
///
/// The handle is used to reference the instance in subsequent calls.
/// Call `free_streaming_log` to release the instance.
#[wasm_bindgen]
pub fn create_streaming_log() -> usize {
    let handle = next_handle();
    with_store(|store| {
        store.insert(handle, StreamingLog::new());
    });
    handle
}

/// Add a trace (array of activity strings) to the StreamingLog.
///
/// # Arguments
///
/// * `handle` - The handle returned by `create_streaming_log`
/// * `activities` - A JavaScript array of activity name strings
#[wasm_bindgen]
pub fn streaming_log_add_trace(handle: usize, activities: &JsValue) -> Result<(), JsValue> {
    with_store(|store| {
        let slog = store.get_mut(&handle).ok_or_else(|| {
            JsValue::from_str(&format!("Invalid StreamingLog handle: {}", handle))
        })?;

        let arr: Vec<String> = serde_wasm_bindgen::from_value(activities.clone())
            .map_err(|e| JsValue::from_str(&format!("Failed to parse activities array: {}", e)))?;

        let refs: Vec<&str> = arr.iter().map(|s| s.as_str()).collect();
        slog.add_trace(&refs);

        Ok(())
    })
}

/// Estimate the DFG from the StreamingLog and return it as a JSON string.
///
/// Returns a `DirectlyFollowsGraph` serialized as JSON.
#[wasm_bindgen]
pub fn streaming_log_estimate_dfg(handle: usize) -> Result<JsValue, JsValue> {
    with_store(|store| {
        let slog = store.get(&handle).ok_or_else(|| {
            JsValue::from_str(&format!("Invalid StreamingLog handle: {}", handle))
        })?;

        let dfg = slog.estimate_dfg();
        let json = serde_json::to_string(&dfg)
            .map_err(|e| JsValue::from_str(&format!("Failed to serialize DFG: {}", e)))?;

        Ok(JsValue::from_str(&json))
    })
}

/// Estimate the number of unique traces seen.
#[wasm_bindgen]
pub fn streaming_log_estimate_cardinality(handle: usize) -> Result<usize, JsValue> {
    with_store(|store| {
        let slog = store.get(&handle).ok_or_else(|| {
            JsValue::from_str(&format!("Invalid StreamingLog handle: {}", handle))
        })?;

        Ok(slog.estimate_cardinality())
    })
}

/// Get the total event count.
#[wasm_bindgen]
pub fn streaming_log_event_count(handle: usize) -> Result<usize, JsValue> {
    with_store(|store| {
        let slog = store.get(&handle).ok_or_else(|| {
            JsValue::from_str(&format!("Invalid StreamingLog handle: {}", handle))
        })?;

        Ok(slog.event_count())
    })
}

/// Get the number of unique activities seen.
#[wasm_bindgen]
pub fn streaming_log_activity_count(handle: usize) -> Result<usize, JsValue> {
    with_store(|store| {
        let slog = store.get(&handle).ok_or_else(|| {
            JsValue::from_str(&format!("Invalid StreamingLog handle: {}", handle))
        })?;

        Ok(slog.activity_count())
    })
}

/// Get the approximate memory usage in bytes.
#[wasm_bindgen]
pub fn streaming_log_memory_bytes(handle: usize) -> Result<usize, JsValue> {
    with_store(|store| {
        let slog = store.get(&handle).ok_or_else(|| {
            JsValue::from_str(&format!("Invalid StreamingLog handle: {}", handle))
        })?;

        Ok(slog.memory_bytes())
    })
}

/// Free a StreamingLog instance and release its memory.
#[wasm_bindgen]
pub fn free_streaming_log(handle: usize) -> Result<(), JsValue> {
    with_store(|store| {
        if store.remove(&handle).is_none() {
            return Err(JsValue::from_str(&format!(
                "Invalid StreamingLog handle: {}",
                handle
            )));
        }
        Ok(())
    })
}
