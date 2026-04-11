use crate::models::AttributeValue;
use crate::prediction_additions::{
    build_transition_graph, calculate_rework_score, extract_prefix_features,
};
use crate::state::{get_or_init_state, StoredObject};
use serde_json::json;
use std::collections::HashMap;
/// Case Feature Extraction — inputs for ML models and remaining-time prediction
///
/// WASM-exported wrappers around the core feature extraction functions in
/// `prediction_additions`.  Each function accepts JSON from JavaScript and
/// returns a JSON result via `JsValue`.
use wasm_bindgen::prelude::*;

/// Extract numeric features from a trace prefix (JSON string array).
///
/// Returns `{ length, last_activity, unique_activities, rework_count, activity_frequency_entropy }`.
///
/// ```javascript
/// const features = JSON.parse(pm.extract_prefix_features_wasm(
///     JSON.stringify(["Register", "Check", "Approve"])
/// ));
/// ```
#[wasm_bindgen]
pub fn extract_prefix_features_wasm(prefix_json: &str) -> Result<JsValue, JsValue> {
    let prefix: Vec<String> = serde_json::from_str(prefix_json)
        .map_err(|e| JsValue::from_str(&format!("Invalid prefix JSON: {}", e)))?;

    let features = extract_prefix_features(&prefix);

    let result = json!({
        "length": features.length,
        "last_activity": features.last_activity,
        "unique_activities": features.unique_activities,
        "rework_count": features.rework_count,
        "activity_frequency_entropy": features.activity_frequency_entropy,
    });

    let serialized = serde_json::to_string(&result)
        .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))?;
    Ok(JsValue::from_str(&serialized))
}

/// Compute rework metrics for a trace (JSON string array).
///
/// Returns `{ rework_count, rework_ratio, repeated_pairs }` where:
/// - `rework_count` — number of consecutive repeated activities
/// - `rework_ratio` — rework_count / max(trace.len() - 1, 1)
/// - `repeated_pairs` — list of `"A→A"` strings for each repeated pair
///
/// ```javascript
/// const rework = JSON.parse(pm.compute_rework_score(
///     JSON.stringify(["A", "B", "B", "C", "C", "C"])
/// ));
/// // { rework_count: 3, rework_ratio: 0.6, repeated_pairs: ["B→B", "C→C", "C→C"] }
/// ```
#[wasm_bindgen]
pub fn compute_rework_score(trace_json: &str) -> Result<JsValue, JsValue> {
    let trace: Vec<String> = serde_json::from_str(trace_json)
        .map_err(|e| JsValue::from_str(&format!("Invalid trace JSON: {}", e)))?;

    let rework_count = calculate_rework_score(&trace);
    let denominator = if trace.len() > 1 { trace.len() - 1 } else { 1 };
    let rework_ratio = rework_count as f64 / denominator as f64;

    let mut repeated_pairs: Vec<String> = Vec::new();
    for i in 1..trace.len() {
        if trace[i] == trace[i - 1] {
            repeated_pairs.push(format!("{}→{}", trace[i - 1], trace[i]));
        }
    }

    let result = json!({
        "rework_count": rework_count,
        "rework_ratio": rework_ratio,
        "repeated_pairs": repeated_pairs,
    });

    let serialized = serde_json::to_string(&result)
        .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))?;
    Ok(JsValue::from_str(&serialized))
}

/// Build a transition probability graph from an event log stored in state.
///
/// Returns `{ edges: [{from, to, probability, count}], activities: string[] }`.
///
/// ```javascript
/// const graph = JSON.parse(pm.build_transition_probabilities(logHandle, 'concept:name'));
/// ```
#[wasm_bindgen]
pub fn build_transition_probabilities(
    log_handle: &str,
    activity_key: &str,
) -> Result<JsValue, JsValue> {
    let activity_key = activity_key.to_string();

    let result_json = get_or_init_state().with_object(log_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            // Compute edge counts alongside the transition graph so we can
            // include raw counts in the output.
            let mut edge_counts: HashMap<(String, String), usize> = HashMap::new();
            let mut activity_totals: HashMap<String, usize> = HashMap::new();

            for trace in &log.traces {
                let mut prev_act: Option<String> = None;
                for event in &trace.events {
                    if let Some(AttributeValue::String(act)) = event.attributes.get(&activity_key) {
                        *activity_totals.entry(act.clone()).or_insert(0) += 1;
                        if let Some(ref prev) = prev_act {
                            *edge_counts.entry((prev.clone(), act.clone())).or_insert(0) += 1;
                        }
                        prev_act = Some(act.clone());
                    }
                }
            }

            // Also call build_transition_graph for the sorted activity list
            let tg = build_transition_graph(log, &activity_key);

            let edges: Vec<serde_json::Value> = edge_counts
                .iter()
                .map(|((from, to), &count)| {
                    let total = activity_totals.get(from).copied().unwrap_or(1);
                    let probability = count as f64 / total as f64;
                    json!({
                        "from": from,
                        "to": to,
                        "probability": probability,
                        "count": count,
                    })
                })
                .collect();

            let result = json!({
                "edges": edges,
                "activities": tg.activities,
            });

            serde_json::to_string(&result)
                .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
        }
        Some(_) => Err(JsValue::from_str("Handle is not an EventLog")),
        None => Err(JsValue::from_str("EventLog handle not found")),
    })?;

    Ok(JsValue::from_str(&result_json))
}
