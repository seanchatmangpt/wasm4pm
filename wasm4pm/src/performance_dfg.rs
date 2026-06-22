use crate::models::{parse_timestamp_ms, AttributeValue, EventLog};
use crate::state::{get_or_init_state, StoredObject};
use crate::{Data, Median};
use std::collections::HashMap;
/// Priority 1 — Performance DFG (time-annotated directly-follows graph).
///
/// Extends the standard DFG with per-edge timing statistics computed from
/// event timestamps.  For each directly-follows pair (A→B) the function
/// records the elapsed time between A and B in every trace, then computes
/// mean, median, and 95th-percentile (p95) in milliseconds.
use wasm_bindgen::prelude::*; // Conditional import: statrs or hand_rolled_stats

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
/// Pure-Rust performance DFG discovery without wasm-bindgen. Used by integration tests.
pub fn discover_performance_dfg_from_log(
    log: &EventLog,
    activity_key: &str,
    timestamp_key: &str,
) -> String {
    let mut edge_times: HashMap<(String, String), Vec<f64>> = HashMap::new();
    let mut node_freq: HashMap<String, usize> = HashMap::new();
    let mut start_acts: HashMap<String, usize> = HashMap::new();
    let mut end_acts: HashMap<String, usize> = HashMap::new();

    for trace in &log.traces {
        let pairs: Vec<(String, Option<i64>)> = trace
            .events
            .iter()
            .filter_map(|e| {
                let act = e
                    .attributes
                    .get(activity_key)
                    .and_then(|v| v.as_string())
                    .map(str::to_owned)?;
                let ts = e.attributes.get(timestamp_key).and_then(|v| {
                    if let AttributeValue::Date(s) = v {
                        parse_timestamp_ms(s)
                    } else {
                        None
                    }
                });
                Some((act, ts))
            })
            .collect();

        if pairs.is_empty() {
            continue;
        }

        for (act, _) in &pairs {
            *node_freq.entry(act.clone()).or_default() += 1;
        }
        *start_acts.entry(pairs[0].0.clone()).or_default() += 1;
        *end_acts
            .entry(pairs[pairs.len() - 1].0.clone())
            .or_default() += 1;

        for w in pairs.windows(2) {
            let key = (w[0].0.clone(), w[1].0.clone());
            let dur = match (w[0].1, w[1].1) {
                (Some(t1), Some(t2)) if t2 >= t1 => (t2 - t1) as f64,
                _ => f64::NAN,
            };
            edge_times.entry(key).or_default().push(dur);
        }
    }

    let nodes: Vec<serde_json::Value> = node_freq
        .iter()
        .map(|(id, freq)| serde_json::json!({"id": id, "label": id, "frequency": freq}))
        .collect();

    let edges: Vec<serde_json::Value> = edge_times
        .into_iter()
        .map(|(key, durs)| {
            let valid: Vec<f64> = durs.iter().copied().filter(|v| v.is_finite()).collect();
            let mean_ms = if valid.is_empty() {
                0.0
            } else {
                valid.iter().sum::<f64>() / valid.len() as f64
            };
            let data = Data::new(valid.clone());
            let median_ms = data.median();
            let mut sorted = valid.clone();
            sorted.sort_unstable_by(f64::total_cmp);
            let p95_idx = ((sorted.len() as f64 - 1.0) * 0.95).round() as usize;
            let p95_ms = if sorted.is_empty() {
                0.0
            } else {
                sorted[p95_idx.min(sorted.len() - 1)]
            };
            serde_json::json!({
                "from": key.0, "to": key.1,
                "count": durs.len(),
                "mean_ms": mean_ms, "median_ms": median_ms, "p95_ms": p95_ms,
            })
        })
        .collect();

    let result = serde_json::json!({
        "nodes": nodes,
        "edges": edges,
        "start_activities": start_acts,
        "end_activities": end_acts,
    });
    serde_json::to_string(&result).unwrap_or_else(|_| {
        r#"{"nodes":[],"edges":[],"start_activities":{},"end_activities":{}}"#.to_string()
    })
}

#[wasm_bindgen]
pub fn discover_performance_dfg(
    log_handle: &str,
    activity_key: &str,
    timestamp_key: &str,
) -> Result<JsValue, JsValue> {
    let log = get_or_init_state().with_object(log_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => Ok(log.clone()),
        Some(_) => Err(crate::error::js_val("Handle is not an EventLog")),
        None => Err(crate::error::js_val("EventLog handle not found")),
    })?;

    Ok(crate::error::js_val(&discover_performance_dfg_from_log(
        &log,
        activity_key,
        timestamp_key,
    )))
}
