use wasm_bindgen::prelude::*;
use crate::state::{get_or_init_state, StoredObject};
use crate::models::*;
use serde_json::json;
use std::collections::HashSet;
use rustc_hash::FxHashMap;
use itertools::Itertools;
use crate::utilities::to_js;

/// Variant Complexity - measure variant entropy and diversity
#[wasm_bindgen]
pub fn analyze_variant_complexity(
    eventlog_handle: &str,
    activity_key: &str,
) -> Result<JsValue, JsValue> {
    get_or_init_state().with_object(eventlog_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            let total = log.traces.len() as f64;

            // Single-pass: build variant counts with itertools::counts()
            let variants = log
                .traces
                .iter()
                .map(|trace| {
                    trace
                        .events
                        .iter()
                        .filter_map(|e| {
                            if let Some(AttributeValue::String(a)) = e.attributes.get(activity_key)
                            {
                                Some(a.clone())
                            } else {
                                None
                            }
                        })
                        .collect::<Vec<String>>()
                })
                .counts();

            // Shannon entropy — use mul_add to reduce rounding error (enables FMA)
            let entropy: f64 = variants.values().fold(0.0_f64, |acc, &count| {
                let p = count as f64 / total;
                // acc + (- p * log2(p))  =>  p.log2().mul_add(-p, acc)
                p.log2().mul_add(-p, acc)
            });

            let coverage_top_10: f64 = variants
                .values()
                .map(|&v| v as f64 / total)
                .take(10)
                .sum();

            to_js(&json!({
                "total_variants": variants.len(),
                "entropy": entropy,
                "max_entropy": total.log2(),
                "normalized_entropy": entropy / total.log2(),
                "top_10_coverage": coverage_top_10,
                "predominant_variant_size": variants.values().copied().max().unwrap_or(0),
            }))
        }
        Some(_) => Err(JsValue::from_str("Not an EventLog")),
        None => Err(JsValue::from_str("EventLog not found")),
    })
}

/// Activity Transition Matrix - co-activity flow matrix
#[wasm_bindgen]
pub fn compute_activity_transition_matrix(
    eventlog_handle: &str,
    activity_key: &str,
) -> Result<JsValue, JsValue> {
    get_or_init_state().with_object(eventlog_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            let activities = log.get_activities(activity_key);
            let mut transitions: FxHashMap<(String, String), usize> = FxHashMap::default();
            let mut activity_total: FxHashMap<String, usize> = FxHashMap::default();

            for activity in &activities {
                activity_total.insert(activity.clone(), 0);
            }

            for trace in &log.traces {
                trace.events.windows(2).for_each(|w| {
                    if let (
                        Some(AttributeValue::String(a1)),
                        Some(AttributeValue::String(a2)),
                    ) = (
                        w[0].attributes.get(activity_key),
                        w[1].attributes.get(activity_key),
                    ) {
                        *transitions.entry((a1.clone(), a2.clone())).or_insert(0) += 1;
                        *activity_total.entry(a1.clone()).or_insert(0) += 1;
                    }
                });
            }

            // Compute transition probabilities
            let matrix_data: Vec<_> = transitions
                .iter()
                .map(|((from, to), count)| {
                    let prob = *count as f64 / activity_total.get(from).copied().unwrap_or(1) as f64;
                    json!({
                        "from": from,
                        "to": to,
                        "count": count,
                        "probability": prob
                    })
                })
                .collect();

            to_js(&json!({
                "matrix": matrix_data,
                "num_activities": activities.len(),
            }))
        }
        Some(_) => Err(JsValue::from_str("Not an EventLog")),
        None => Err(JsValue::from_str("EventLog not found")),
    })
}

/// Process Speedup Analysis - identify where process accelerates/decelerates
#[wasm_bindgen]
pub fn analyze_process_speedup(
    eventlog_handle: &str,
    timestamp_key: &str,
    _window_size: usize,
) -> Result<JsValue, JsValue> {
    get_or_init_state().with_object(eventlog_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            let mut time_gaps: Vec<f64> = Vec::new();

            for trace in &log.traces {
                let mut timestamps: Vec<String> = Vec::new();
                for event in &trace.events {
                    if let Some(AttributeValue::String(ts)) = event.attributes.get(timestamp_key)
                    {
                        timestamps.push(ts.clone());
                    }
                }

                // Calculate gaps (simplified - just string length as proxy)
                for i in 0..timestamps.len().saturating_sub(1) {
                    let gap = (timestamps[i + 1].len() as f64 - timestamps[i].len() as f64).abs();
                    time_gaps.push(gap);
                }
            }

            if time_gaps.is_empty() {
                return to_js(&json!({
                    "message": "No timestamps found",
                    "gaps": []
                }));
            }

            time_gaps.sort_by(|a, b| a.partial_cmp(b).unwrap());

            let mean: f64 = time_gaps.iter().sum::<f64>() / time_gaps.len() as f64;

            // Calculate percentiles using index-based approach
            let p25_idx = ((time_gaps.len() as f64 - 1.0) * 0.25).round() as usize;
            let p75_idx = ((time_gaps.len() as f64 - 1.0) * 0.75).round() as usize;
            let percentile_25 = time_gaps[p25_idx];
            let percentile_75 = time_gaps[p75_idx];

            to_js(&json!({
                "avg_gap": mean,
                "p25": percentile_25,
                "p75": percentile_75,
                "speedup_range": percentile_75 - percentile_25,
            }))
        }
        Some(_) => Err(JsValue::from_str("Not an EventLog")),
        None => Err(JsValue::from_str("EventLog not found")),
    })
}

/// Trace Distance Matrix - compute pairwise trace similarity
#[wasm_bindgen]
pub fn compute_trace_similarity_matrix(
    eventlog_handle: &str,
    activity_key: &str,
) -> Result<JsValue, JsValue> {
    get_or_init_state().with_object(eventlog_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            let mut similarities = Vec::new();

            // Pre-compute HashSet<&str> per trace — O(n log n) once, O(1) per pair lookup
            let trace_sets: Vec<HashSet<&str>> = log.traces
                .iter()
                .map(|trace| {
                    trace.events
                        .iter()
                        .filter_map(|e| e.attributes.get(activity_key)?.as_string())
                        .collect()
                })
                .collect();

            for i in 0..log.traces.len() {
                for j in (i + 1)..log.traces.len() {
                    // Jaccard via set intersection/union — O(min(|i|,|j|)) per pair
                    let common = trace_sets[i]
                        .intersection(&trace_sets[j])
                        .count();
                    let union = trace_sets[i].len() + trace_sets[j].len() - common;
                    let similarity = if union > 0 {
                        common as f64 / union as f64
                    } else {
                        0.0
                    };

                    if similarity > 0.5 {
                        similarities.push(json!({
                            "trace_i": i,
                            "trace_j": j,
                            "similarity": similarity
                        }));
                    }
                }
            }

            to_js(&json!({
                "similar_pairs": similarities,
                "total_pairs": (log.traces.len() * (log.traces.len() - 1)) / 2,
            }))
        }
        Some(_) => Err(JsValue::from_str("Not an EventLog")),
        None => Err(JsValue::from_str("EventLog not found")),
    })
}

/// Process Bottleneck Timeline - identify temporal bottlenecks
#[wasm_bindgen]
pub fn analyze_temporal_bottlenecks(
    eventlog_handle: &str,
    activity_key: &str,
    timestamp_key: &str,
) -> Result<JsValue, JsValue> {
    get_or_init_state().with_object(eventlog_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            let mut activity_durations: FxHashMap<String, Vec<f64>> = FxHashMap::default();

            for trace in &log.traces {
                let activities: Vec<(String, String)> = trace
                    .events
                    .iter()
                    .filter_map(|e| {
                        if let (Some(AttributeValue::String(act)), Some(AttributeValue::String(ts))) =
                            (e.attributes.get(activity_key), e.attributes.get(timestamp_key))
                        {
                            Some((act.clone(), ts.clone()))
                        } else {
                            None
                        }
                    })
                    .collect();

                for i in 0..activities.len().saturating_sub(1) {
                    let duration = (activities[i + 1].1.len() as f64) - (activities[i].1.len() as f64);
                    activity_durations
                        .entry(activities[i].0.clone())
                        .or_insert_with(Vec::new)
                        .push(duration.abs());
                }
            }

            let bottlenecks: Vec<_> = activity_durations
                .iter()
                .map(|(activity, durations)| {
                    let avg: f64 = durations.iter().sum::<f64>() / durations.len() as f64;
                    let max = durations
                        .iter()
                        .copied()
                        .fold(f64::NEG_INFINITY, f64::max);
                    json!({
                        "activity": activity,
                        "avg_duration": avg,
                        "max_duration": max,
                    })
                })
                .collect();

            to_js(&json!({
                "bottlenecks": bottlenecks,
            }))
        }
        Some(_) => Err(JsValue::from_str("Not an EventLog")),
        None => Err(JsValue::from_str("EventLog not found")),
    })
}

/// Activity Ordering - extract mandatory activity ordering from log
#[wasm_bindgen]
pub fn extract_activity_ordering(
    eventlog_handle: &str,
    activity_key: &str,
) -> Result<JsValue, JsValue> {
    get_or_init_state().with_object(eventlog_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            let mut mandatory_predecessors: FxHashMap<String, HashSet<String>> = FxHashMap::default();

            for trace in &log.traces {
                // Collect only events that carry the activity key, preserving order
                let activities: Vec<&str> = trace
                    .events
                    .iter()
                    .filter_map(|e| {
                        if let Some(AttributeValue::String(a)) = e.attributes.get(activity_key) {
                            Some(a.as_str())
                        } else {
                            None
                        }
                    })
                    .collect();

                for (pos, &activity) in activities.iter().enumerate() {
                    // All activities that appear before this position are predecessors
                    let predecessors: HashSet<String> = activities
                        .iter()
                        .take(pos)
                        .map(|&a| a.to_owned())
                        .collect();
                    mandatory_predecessors
                        .entry(activity.to_owned())
                        .or_insert_with(HashSet::new)
                        .extend(predecessors);
                }
            }

            let result: Vec<_> = mandatory_predecessors
                .iter()
                .map(|(activity, preds)| {
                    json!({
                        "activity": activity,
                        "mandatory_predecessors": preds.iter().cloned().collect::<Vec<_>>()
                    })
                })
                .collect();

            to_js(&json!({
                "activity_ordering": result,
            }))
        }
        Some(_) => Err(JsValue::from_str("Not an EventLog")),
        None => Err(JsValue::from_str("EventLog not found")),
    })
}

#[wasm_bindgen]
pub fn final_analytics_info() -> String {
    json!({
        "status": "final_analytics_available",
        "functions": [
            {"name": "variant_complexity", "type": "entropy_analysis"},
            {"name": "transition_matrix", "type": "markov_chain"},
            {"name": "speedup_analysis", "type": "temporal"},
            {"name": "trace_similarity", "type": "distance_metric"},
            {"name": "temporal_bottlenecks", "type": "performance"},
            {"name": "activity_ordering", "type": "constraints"},
        ]
    })
    .to_string()
}
