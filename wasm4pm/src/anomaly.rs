/// Priority 7 — Trace anomaly scoring.
///
/// Scores each trace against a reference DFG.  Unusual traces (those that
/// traverse rare edges) receive high scores.  The score is the mean of
/// -log2(edge_frequency / total_edges) over every directly-follows step in the
/// trace; a step whose pair is absent from the DFG is penalised with a fixed
/// cost of 10.
use wasm_bindgen::prelude::*;
use crate::state::{get_or_init_state, StoredObject};
use serde_json::json;

const MISSING_EDGE_COST: f64 = 10.0;

/// Score a single trace (given as a JSON array of activity strings) against a
/// reference DFG.
///
/// ```javascript
/// const dfgJson   = JSON.stringify(pm.discover_dfg(logHandle, 'concept:name'));
/// const dfgHandle = pm.store_dfg_from_json(dfgJson);
/// const score = pm.score_trace_anomaly(dfgHandle,
///                 JSON.stringify(['Register','Approve','Close']));
/// console.log(score); // 0.0 = perfectly normal
/// ```
#[wasm_bindgen]
pub fn score_trace_anomaly(dfg_handle: &str, activities_json: &str) -> Result<JsValue, JsValue> {
    let activities: Vec<String> = serde_json::from_str(activities_json)
        .map_err(|e| JsValue::from_str(&format!("Invalid activities JSON: {}", e)))?;

    get_or_init_state().with_object(dfg_handle, |obj| match obj {
        Some(StoredObject::DirectlyFollowsGraph(dfg)) => {
            if activities.len() < 2 {
                return Ok(JsValue::from_f64(0.0));
            }
            let total_edges: usize = dfg.edges.iter().map(|e| e.frequency).sum();
            let total_f = total_edges.max(1) as f64;

            let mut cost_sum = 0.0_f64;
            let steps = activities.len() - 1;
            for i in 0..steps {
                let edge_freq = dfg.edges.iter()
                    .find(|e| e.from == activities[i] && e.to == activities[i + 1])
                    .map(|e| e.frequency)
                    .unwrap_or(0);
                cost_sum += if edge_freq == 0 {
                    MISSING_EDGE_COST
                } else {
                    -(edge_freq as f64 / total_f).log2()
                };
            }
            Ok(JsValue::from_f64(cost_sum / steps as f64))
        }
        Some(_) => Err(JsValue::from_str("Handle is not a DirectlyFollowsGraph")),
        None => Err(JsValue::from_str("DFG handle not found")),
    })
}

/// Score every trace in an event log against a reference DFG.
///
/// Returns a JSON string:
/// ```json
/// [{"case_id": "Case1", "score": 0.0, "steps": 2},
///  {"case_id": "Case2", "score": 10.0, "steps": 3}]
/// ```
/// Sorted descending by score (most anomalous first).
#[wasm_bindgen]
pub fn score_log_anomalies(
    log_handle: &str,
    dfg_handle: &str,
    activity_key: &str,
) -> Result<JsValue, JsValue> {
    // Collect DFG edge frequencies
    let edge_data: Vec<(String, String, usize)> =
        get_or_init_state().with_object(dfg_handle, |obj| match obj {
            Some(StoredObject::DirectlyFollowsGraph(dfg)) => {
                Ok(dfg.edges.iter().map(|e| (e.from.clone(), e.to.clone(), e.frequency)).collect())
            }
            Some(_) => Err(JsValue::from_str("dfg_handle is not a DirectlyFollowsGraph")),
            None => Err(JsValue::from_str("DFG handle not found")),
        })?;

    let total_f: f64 = edge_data.iter().map(|(_, _, f)| *f).sum::<usize>().max(1) as f64;
    let freq_map: std::collections::HashMap<(&str, &str), usize> = edge_data.iter()
        .map(|(f, t, c)| ((f.as_str(), t.as_str()), *c))
        .collect();

    let results_json = get_or_init_state().with_object(log_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            let mut results: Vec<serde_json::Value> = Vec::new();
            for trace in &log.traces {
                let case_id = trace.attributes.get("concept:name")
                    .and_then(|v| v.as_string())
                    .unwrap_or("unknown")
                    .to_string();
                let acts: Vec<&str> = trace.events.iter()
                    .filter_map(|e| e.attributes.get(activity_key).and_then(|v| v.as_string()))
                    .collect();
                if acts.len() < 2 {
                    results.push(json!({"case_id": case_id, "score": 0.0, "steps": 0}));
                    continue;
                }
                let steps = acts.len() - 1;
                let mut cost = 0.0_f64;
                for i in 0..steps {
                    let freq = freq_map.get(&(acts[i], acts[i + 1])).copied().unwrap_or(0);
                    cost += if freq == 0 {
                        MISSING_EDGE_COST
                    } else {
                        -(freq as f64 / total_f).log2()
                    };
                }
                results.push(json!({"case_id": case_id, "score": cost / steps as f64, "steps": steps}));
            }
            results.sort_by(|a, b| {
                b["score"].as_f64().unwrap_or(0.0)
                    .partial_cmp(&a["score"].as_f64().unwrap_or(0.0))
                    .unwrap_or(std::cmp::Ordering::Equal)
            });
            serde_json::to_string(&results).map_err(|e| JsValue::from_str(&e.to_string()))
        }
        Some(_) => Err(JsValue::from_str("log_handle is not an EventLog")),
        None => Err(JsValue::from_str("EventLog handle not found")),
    })?;

    Ok(JsValue::from_str(&results_json))
}
