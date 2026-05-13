use crate::models::EventLog;
use crate::state::{get_or_init_state, StoredObject};
use serde_json::json;
/// Priority 8 — Social network / organisational mining.
///
/// Discovers a handover-of-work network from an event log: for every pair of
/// resources (A → B) where A performs one activity and B performs the very next
/// activity in the same trace, we record the number of handovers.
///
/// Also supports working-together (both resources appear in the same trace) and
/// subcontracting (A triggers B's work without B being the immediate successor).
use wasm_bindgen::prelude::*;

/// Pure-Rust handover network discovery without wasm-bindgen. Used by integration tests.
pub fn discover_handover_network_from_log(log: &EventLog, resource_key: &str) -> String {
    let mut handovers: std::collections::HashMap<(String, String), usize> =
        std::collections::HashMap::new();
    let mut workload: std::collections::HashMap<String, usize> =
        std::collections::HashMap::new();

    for trace in &log.traces {
        let resources: Vec<Option<String>> = trace
            .events
            .iter()
            .map(|e| {
                e.attributes
                    .get(resource_key)
                    .and_then(|v| v.as_string())
                    .map(str::to_owned)
            })
            .collect();

        for (r, _) in resources.iter().filter_map(|r| r.as_ref().map(|x| (x, ()))) {
            *workload.entry(r.clone()).or_insert(0) += 1;
        }

        for i in 0..resources.len().saturating_sub(1) {
            if let (Some(r1), Some(r2)) = (&resources[i], &resources[i + 1]) {
                if r1 != r2 {
                    *handovers.entry((r1.clone(), r2.clone())).or_insert(0) += 1;
                }
            }
        }
    }

    let nodes: Vec<serde_json::Value> = workload
        .iter()
        .map(|(id, w)| json!({"id": id, "label": id, "workload": w}))
        .collect();

    let edges: Vec<serde_json::Value> = handovers
        .iter()
        .map(|((f, t), cnt)| json!({"from": f, "to": t, "handovers": cnt}))
        .collect();

    serde_json::to_string(&json!({"nodes": nodes, "edges": edges}))
        .unwrap_or_else(|_| r#"{"nodes":[],"edges":[]}"#.to_string())
}

/// Discover a handover-of-work social network.
///
/// `resource_key` — event attribute holding the resource/originator
///   (typically `"org:resource"` in XES).
#[wasm_bindgen]
pub fn discover_handover_network(log_handle: &str, resource_key: &str) -> Result<JsValue, JsValue> {
    let log = get_or_init_state().with_object(log_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => Ok(log.clone()),
        Some(_) => Err(crate::error::js_val("Handle is not an EventLog")),
        None => Err(crate::error::js_val("EventLog handle not found")),
    })?;
    Ok(crate::error::js_val(&discover_handover_network_from_log(&log, resource_key)))
}

/// Pure-Rust working-together network discovery without wasm-bindgen. Used by integration tests.
pub fn discover_working_together_network_from_log(log: &EventLog, resource_key: &str) -> String {
    let mut co_occur: std::collections::HashMap<(String, String), usize> =
        std::collections::HashMap::new();
    let mut all_resources: std::collections::HashSet<String> =
        std::collections::HashSet::new();

    for trace in &log.traces {
        let resources: std::collections::HashSet<String> = trace
            .events
            .iter()
            .filter_map(|e| {
                e.attributes
                    .get(resource_key)
                    .and_then(|v| v.as_string())
                    .map(str::to_owned)
            })
            .collect();

        for r in &resources {
            all_resources.insert(r.clone());
        }

        let mut sorted: Vec<&String> = resources.iter().collect();
        sorted.sort();
        for i in 0..sorted.len() {
            for j in i + 1..sorted.len() {
                let key = (sorted[i].clone(), sorted[j].clone());
                *co_occur.entry(key).or_insert(0) += 1;
            }
        }
    }

    let nodes: Vec<serde_json::Value> = all_resources
        .iter()
        .map(|id| json!({"id": id, "label": id}))
        .collect();

    let edges: Vec<serde_json::Value> = co_occur
        .iter()
        .map(|((f, t), cnt)| json!({"from": f, "to": t, "co_occurrences": cnt}))
        .collect();

    serde_json::to_string(&json!({"nodes": nodes, "edges": edges}))
        .unwrap_or_else(|_| r#"{"nodes":[],"edges":[]}"#.to_string())
}

/// Discover a working-together network.
#[wasm_bindgen]
pub fn discover_working_together_network(
    log_handle: &str,
    resource_key: &str,
) -> Result<JsValue, JsValue> {
    let log = get_or_init_state().with_object(log_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => Ok(log.clone()),
        Some(_) => Err(crate::error::js_val("Handle is not an EventLog")),
        None => Err(crate::error::js_val("EventLog handle not found")),
    })?;
    Ok(crate::error::js_val(&discover_working_together_network_from_log(&log, resource_key)))
}
