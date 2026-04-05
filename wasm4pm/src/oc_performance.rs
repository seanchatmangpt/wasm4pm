/// Object-Centric Performance Analysis (Phase 2C).
///
/// For each object type in an OCEL log, builds a performance-annotated
/// directly-follows graph with per-edge timing statistics (mean, median, p95)
/// computed from event timestamps.

use wasm_bindgen::prelude::*;
use crate::state::{get_or_init_state, StoredObject};
use crate::models::{parse_timestamp_ms, OCEL};
use crate::utilities::to_js;
use crate::error::{wasm_err, codes};
use rustc_hash::FxHashMap;
use serde::Serialize;
use serde_json::json;
use statrs::statistics::{Data, Median};

// -------------------------------------------------------------------------
// Types
// -------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
struct PerformanceNode {
    id: String,
    label: String,
    frequency: usize,
}

#[derive(Debug, Clone, Serialize)]
struct PerformanceEdge {
    from: String,
    to: String,
    count: usize,
    mean_ms: f64,
    median_ms: f64,
    p95_ms: f64,
}

#[derive(Debug, Clone, Serialize)]
struct PerformanceDFG {
    nodes: Vec<PerformanceNode>,
    edges: Vec<PerformanceEdge>,
    start_activities: FxHashMap<String, usize>,
    end_activities: FxHashMap<String, usize>,
}

// -------------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------------

fn get_ocel(handle: &str) -> Result<OCEL, JsValue> {
    get_or_init_state().with_object(handle, |obj| match obj {
        Some(StoredObject::OCEL(ocel)) => Ok(ocel.clone()),
        Some(_) => Err(wasm_err(codes::INVALID_INPUT, "Object is not an OCEL")),
        None => Err(wasm_err(
            codes::INVALID_HANDLE,
            format!("OCEL '{}' not found", handle),
        )),
    })
}

/// Compute mean / median / p95 from a slice of durations (ms).
/// NaN entries are filtered out.
fn compute_edge_stats(durs: &[f64]) -> (f64, f64, f64) {
    let valid: Vec<f64> = durs.iter().copied().filter(|v| v.is_finite()).collect();
    if valid.is_empty() {
        return (0.0, 0.0, 0.0);
    }
    let mean = valid.iter().sum::<f64>() / valid.len() as f64;
    let data = Data::new(valid.clone());
    let median = data.median();
    let mut sorted = valid;
    sorted.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let p95_idx = ((sorted.len() as f64 - 1.0) * 0.95).round() as usize;
    let p95 = sorted[p95_idx.min(sorted.len() - 1)];
    (mean, median, p95)
}

/// Build per-type performance DFGs directly from the OCEL, without flattening.
fn build_performance_dfgs(ocel: &OCEL) -> FxHashMap<String, PerformanceDFG> {
    let mut result: FxHashMap<String, PerformanceDFG> = FxHashMap::default();

    for obj_type in &ocel.object_types {
        // Map object-id → vec of (event-index, event-type, timestamp-ms)
        let mut events_by_object: FxHashMap<String, Vec<(usize, &str, Option<i64>)>> =
            FxHashMap::default();
        for obj in &ocel.objects {
            if &obj.object_type == obj_type {
                events_by_object.insert(obj.id.clone(), Vec::new());
            }
        }

        for (idx, event) in ocel.events.iter().enumerate() {
            let ts_ms = parse_timestamp_ms(&event.timestamp);
            for obj_id in event.all_object_ids() {
                if let Some(events) = events_by_object.get_mut(obj_id) {
                    events.push((idx, event.event_type.as_str(), ts_ms));
                }
            }
        }

        // Sort by timestamp (ISO 8601 lexicographic sort)
        for events in events_by_object.values_mut() {
            events.sort_by_key(|(idx, _, _)| ocel.events[*idx].timestamp.clone());
        }

        // Activity frequencies scoped to this object type
        let mut activity_counts: FxHashMap<String, usize> = FxHashMap::default();
        for events in events_by_object.values() {
            for (_, event_type, _) in events {
                *activity_counts.entry(event_type.to_string()).or_insert(0) += 1;
            }
        }

        let nodes: Vec<PerformanceNode> = activity_counts
            .iter()
            .map(|(id, freq)| PerformanceNode {
                id: id.clone(),
                label: id.clone(),
                frequency: *freq,
            })
            .collect();

        // Edge durations + start/end
        let mut edge_times: FxHashMap<(String, String), Vec<f64>> = FxHashMap::default();
        let mut start_acts: FxHashMap<String, usize> = FxHashMap::default();
        let mut end_acts: FxHashMap<String, usize> = FxHashMap::default();

        for events in events_by_object.values() {
            if events.is_empty() {
                continue;
            }
            *start_acts
                .entry(events[0].1.to_string())
                .or_insert(0) += 1;
            *end_acts
                .entry(events[events.len() - 1].1.to_string())
                .or_insert(0) += 1;

            for pair in events.windows(2) {
                let from = pair[0].1;
                let to = pair[1].1;
                let dur = match (pair[0].2, pair[1].2) {
                    (Some(t1), Some(t2)) if t2 >= t1 => (t2 - t1) as f64,
                    _ => f64::NAN,
                };
                edge_times
                    .entry((from.to_string(), to.to_string()))
                    .or_default()
                    .push(dur);
            }
        }

        let edges: Vec<PerformanceEdge> = edge_times
            .into_iter()
            .map(|((from, to), durs)| {
                let count = durs.len();
                let (mean_ms, median_ms, p95_ms) = compute_edge_stats(&durs);
                PerformanceEdge {
                    from,
                    to,
                    count,
                    mean_ms,
                    median_ms,
                    p95_ms,
                }
            })
            .collect();

        result.insert(
            obj_type.clone(),
            PerformanceDFG {
                nodes,
                edges,
                start_activities: start_acts,
                end_activities: end_acts,
            },
        );
    }

    result
}

// -------------------------------------------------------------------------
// Public WASM API
// -------------------------------------------------------------------------

/// Analyze object-centric performance across all object types.
///
/// For each object type, builds a performance DFG with per-edge duration
/// statistics derived from event timestamps. The `timestamp_key` parameter
/// is accepted for API consistency but OCEL timestamps are always read from
/// the standard `time` / `timestamp` field of each event (ISO 8601).
///
/// Returns JSON keyed by object type:
/// ```json
/// {
///   "Order": {
///     "nodes": [{"id":"Create Order","label":"Create Order","frequency":50}],
///     "edges": [{"from":"Create Order","to":"Pay","count":45,
///                "mean_ms":86400000,"median_ms":82800000,"p95_ms":172800000}],
///     "start_activities": {"Create Order": 50},
///     "end_activities":   {"Close": 50}
///   },
///   "Item": { ... }
/// }
/// ```
#[wasm_bindgen]
pub fn analyze_oc_performance(
    ocel_handle: &str,
    _timestamp_key: &str,
) -> Result<JsValue, JsValue> {
    let ocel = get_ocel(ocel_handle)?;
    let result = build_performance_dfgs(&ocel);
    to_js(&result)
}

/// Compute per-object-type aggregate performance metrics from an OCEL.
///
/// Simpler than `analyze_oc_performance` — returns only min / max / mean /
/// median of all inter-event durations per object type.
///
/// Returns: JSON `{ "Order": { "min_ms": …, "max_ms": …, … }, "Item": { … } }`
#[wasm_bindgen]
pub fn oc_performance_analysis(ocel_handle: &str) -> Result<JsValue, JsValue> {
    let ocel = get_ocel(ocel_handle)?;

    let mut result = serde_json::Map::new();

    for obj_type in &ocel.object_types {
        // Collect all inter-event durations for objects of this type
        let mut events_by_object: FxHashMap<String, Vec<Option<i64>>> = FxHashMap::default();
        for obj in &ocel.objects {
            if &obj.object_type == obj_type {
                events_by_object.insert(obj.id.clone(), Vec::new());
            }
        }

        for event in &ocel.events {
            let ts_ms = parse_timestamp_ms(&event.timestamp);
            for obj_id in event.all_object_ids() {
                if let Some(timestamps) = events_by_object.get_mut(obj_id) {
                    timestamps.push(ts_ms);
                }
            }
        }

        let mut durations: Vec<f64> = Vec::new();
        for timestamps in events_by_object.values() {
            // Sort; timestamps come from sorted events but ensure order
            let mut sorted_ts: Vec<i64> = timestamps.iter().filter_map(|t| *t).collect();
            sorted_ts.sort();
            for pair in sorted_ts.windows(2) {
                durations.push((pair[1] - pair[0]).abs() as f64);
            }
        }

        result.insert(obj_type.clone(), compute_duration_stats(&durations));
    }

    to_js(&result)
}

/// Module info for capability registry.
#[wasm_bindgen]
pub fn oc_performance_info() -> JsValue {
    let info = json!({
        "module": "oc_performance",
        "description": "Object-Centric performance analysis from OCEL",
        "functions": [
            {
                "name": "analyze_oc_performance",
                "description": "Build per-type performance DFGs with edge timing stats (mean/median/p95)",
                "params": ["ocel_handle", "timestamp_key"],
                "returns": "JSON {object_type: {nodes, edges, start_activities, end_activities}}"
            },
            {
                "name": "oc_performance_analysis",
                "description": "Compute per-type aggregate performance metrics (min/max/mean/median duration)",
                "params": ["ocel_handle"],
                "returns": "JSON {object_type: {min_ms, max_ms, mean_ms, median_ms, count}}"
            }
        ]
    });

    to_js(&info).unwrap_or_else(|_| JsValue::NULL)
}

// -------------------------------------------------------------------------
// Internal helpers
// -------------------------------------------------------------------------

fn compute_duration_stats(durations: &[f64]) -> serde_json::Value {
    if durations.is_empty() {
        return json!({
            "min_ms": 0.0,
            "max_ms": 0.0,
            "mean_ms": 0.0,
            "median_ms": 0.0,
            "count": 0
        });
    }

    let mut sorted = durations.to_vec();
    sorted.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));

    let min = sorted.first().copied().unwrap_or(0.0);
    let max = sorted.last().copied().unwrap_or(0.0);
    let mean = sorted.iter().sum::<f64>() / sorted.len() as f64;
    let median = if sorted.len() % 2 == 0 {
        (sorted[sorted.len() / 2 - 1] + sorted[sorted.len() / 2]) / 2.0
    } else {
        sorted[sorted.len() / 2]
    };

    json!({
        "min_ms": min,
        "max_ms": max,
        "mean_ms": mean,
        "median_ms": median,
        "count": sorted.len()
    })
}
