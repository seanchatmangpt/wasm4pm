/// Priority 1 — Performance DFG (time-annotated directly-follows graph).
///
/// Extends the standard DFG with per-edge timing statistics computed from
/// event timestamps.  For each directly-follows pair (A→B) the function
/// records the elapsed time between A and B in every trace, then computes
/// mean, median, and 95th-percentile (p95) in milliseconds.
use wasm_bindgen::prelude::*;
use crate::state::{get_or_init_state, StoredObject};
use crate::models::{AttributeValue, parse_timestamp_ms};
use std::collections::HashMap;

fn median_sorted(v: &mut Vec<f64>) -> f64 {
    if v.is_empty() { return 0.0; }
    v.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let mid = v.len() / 2;
    if v.len() % 2 == 0 { (v[mid - 1] + v[mid]) / 2.0 } else { v[mid] }
}

fn percentile_sorted(v: &[f64], p: f64) -> f64 {
    if v.is_empty() { return 0.0; }
    let idx = ((v.len() as f64 - 1.0) * p / 100.0).round() as usize;
    v[idx.min(v.len() - 1)]
}

/// Discover a time-annotated DFG from an EventLog.
///
/// Returns a JSON string:
/// ```json
/// {
///   "nodes": [{"id":"Register","label":"Register","frequency":100}],
///   "edges": [{"from":"Register","to":"Approve","count":80,
///              "mean_ms":3600000,"median_ms":3500000,"p95_ms":7200000}],
///   "start_activities": {"Register": 100},
///   "end_activities":   {"Close": 100}
/// }
/// ```
/// `timestamp_key` defaults to `"time:timestamp"` in most XES logs.
#[wasm_bindgen]
pub fn discover_performance_dfg(
    log_handle: &str,
    activity_key: &str,
    timestamp_key: &str,
) -> Result<JsValue, JsValue> {
    let json = get_or_init_state().with_object(log_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            // edge → Vec<duration_ms>
            let mut edge_times: HashMap<(String, String), Vec<f64>> = HashMap::new();
            let mut node_freq: HashMap<String, usize> = HashMap::new();
            let mut start_acts: HashMap<String, usize> = HashMap::new();
            let mut end_acts: HashMap<String, usize> = HashMap::new();

            for trace in &log.traces {
                let pairs: Vec<(String, Option<i64>)> = trace.events.iter()
                    .filter_map(|e| {
                        let act = e.attributes.get(activity_key)
                            .and_then(|v| v.as_string())
                            .map(str::to_owned)?;
                        let ts = e.attributes.get(timestamp_key).and_then(|v| {
                            if let AttributeValue::Date(s) = v { parse_timestamp_ms(s) } else { None }
                        });
                        Some((act, ts))
                    })
                    .collect();

                if pairs.is_empty() { continue; }

                // Node frequencies
                for (act, _) in &pairs {
                    *node_freq.entry(act.clone()).or_insert(0) += 1;
                }
                *start_acts.entry(pairs[0].0.clone()).or_insert(0) += 1;
                *end_acts.entry(pairs[pairs.len() - 1].0.clone()).or_insert(0) += 1;

                // Edge durations
                for i in 0..pairs.len() - 1 {
                    let key = (pairs[i].0.clone(), pairs[i + 1].0.clone());
                    let dur = match (pairs[i].1, pairs[i + 1].1) {
                        (Some(t1), Some(t2)) if t2 >= t1 => (t2 - t1) as f64,
                        _ => f64::NAN,
                    };
                    edge_times.entry(key).or_default().push(dur);
                }
            }

            // Build output
            let nodes: Vec<serde_json::Value> = node_freq.iter().map(|(id, freq)| {
                serde_json::json!({"id": id, "label": id, "frequency": freq})
            }).collect();

            let edges: Vec<serde_json::Value> = edge_times.into_iter().map(|(key, durs)| {
                let valid: Vec<f64> = durs.iter().copied().filter(|v| v.is_finite()).collect();
                let mut sorted = valid.clone();
                let mean_ms = if valid.is_empty() { 0.0 } else {
                    valid.iter().sum::<f64>() / valid.len() as f64
                };
                let median_ms = median_sorted(&mut sorted);
                sorted.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
                let p95_ms = percentile_sorted(&sorted, 95.0);
                serde_json::json!({
                    "from": key.0, "to": key.1,
                    "count": durs.len(),
                    "mean_ms": mean_ms, "median_ms": median_ms, "p95_ms": p95_ms,
                })
            }).collect();

            let result = serde_json::json!({
                "nodes": nodes,
                "edges": edges,
                "start_activities": start_acts,
                "end_activities": end_acts,
            });
            serde_json::to_string(&result).map_err(|e| JsValue::from_str(&e.to_string()))
        }
        Some(_) => Err(JsValue::from_str("Handle is not an EventLog")),
        None => Err(JsValue::from_str("EventLog handle not found")),
    })?;

    Ok(JsValue::from_str(&json))
}
