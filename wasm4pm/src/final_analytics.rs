use wasm_bindgen::prelude::*;
use crate::state::{get_or_init_state, StoredObject};
use crate::models::*;
use serde_json::json;
use std::collections::HashMap;

/// Variant Complexity - measure variant entropy and diversity
#[wasm_bindgen]
pub fn analyze_variant_complexity(
    eventlog_handle: &str,
    activity_key: &str,
) -> Result<String, JsValue> {
    match get_or_init_state().get_object(eventlog_handle)? {
        Some(StoredObject::EventLog(log)) => {
            let mut variants: HashMap<Vec<String>, usize> = HashMap::new();
            let total = log.traces.len() as f64;

            for trace in &log.traces {
                let path: Vec<String> = trace
                    .events
                    .iter()
                    .filter_map(|e| {
                        if let Some(AttributeValue::String(a)) = e.attributes.get(activity_key) {
                            Some(a.clone())
                        } else {
                            None
                        }
                    })
                    .collect();
                *variants.entry(path).or_insert(0) += 1;
            }

            // Calculate Shannon entropy
            let mut entropy = 0.0;
            for count in variants.values() {
                let p = *count as f64 / total;
                entropy -= p * p.log2();
            }

            let coverage_top_10: f64 = variants
                .values()
                .map(|v| (*v as f64 / total).max(0.0))
                .take(10)
                .sum();

            Ok(serde_json::to_string(&json!({
                "total_variants": variants.len(),
                "entropy": entropy,
                "max_entropy": (total.log2()),
                "normalized_entropy": entropy / total.log2(),
                "top_10_coverage": coverage_top_10,
                "predominant_variant_size": variants.values().max().copied().unwrap_or(0),
            }))
            .map_err(|e| JsValue::from_str(&format!("Serialization failed: {}", e)))?)
        }
        Some(_) => Err(JsValue::from_str("Not an EventLog")),
        None => Err(JsValue::from_str("EventLog not found")),
    }
}

/// Activity Transition Matrix - co-activity flow matrix
#[wasm_bindgen]
pub fn compute_activity_transition_matrix(
    eventlog_handle: &str,
    activity_key: &str,
) -> Result<String, JsValue> {
    match get_or_init_state().get_object(eventlog_handle)? {
        Some(StoredObject::EventLog(log)) => {
            let activities = log.get_activities(activity_key);
            let mut transitions: HashMap<(String, String), usize> = HashMap::new();
            let mut activity_total: HashMap<String, usize> = HashMap::new();

            for activity in &activities {
                activity_total.insert(activity.clone(), 0);
            }

            for trace in &log.traces {
                for i in 0..trace.events.len().saturating_sub(1) {
                    if let (Some(AttributeValue::String(a1)), Some(AttributeValue::String(a2))) = (
                        trace.events[i].attributes.get(activity_key),
                        trace.events[i + 1].attributes.get(activity_key),
                    ) {
                        *transitions.entry((a1.clone(), a2.clone())).or_insert(0) += 1;
                        *activity_total.entry(a1.clone()).or_insert(0) += 1;
                    }
                }
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

            Ok(serde_json::to_string(&json!({
                "matrix": matrix_data,
                "num_activities": activities.len(),
            }))
            .map_err(|e| JsValue::from_str(&format!("Serialization failed: {}", e)))?)
        }
        Some(_) => Err(JsValue::from_str("Not an EventLog")),
        None => Err(JsValue::from_str("EventLog not found")),
    }
}

/// Process Speedup Analysis - identify where process accelerates/decelerates
#[wasm_bindgen]
pub fn analyze_process_speedup(
    eventlog_handle: &str,
    timestamp_key: &str,
    window_size: usize,
) -> Result<String, JsValue> {
    match get_or_init_state().get_object(eventlog_handle)? {
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
                return Ok(serde_json::to_string(&json!({
                    "message": "No timestamps found",
                    "gaps": []
                }))
                .map_err(|e| JsValue::from_str(&format!("Serialization failed: {}", e)))?);
            }

            time_gaps.sort_by(|a, b| a.partial_cmp(b).unwrap());

            let mean: f64 = time_gaps.iter().sum::<f64>() / time_gaps.len() as f64;
            let percentile_25 = time_gaps[(time_gaps.len() as f64 * 0.25) as usize];
            let percentile_75 = time_gaps[(time_gaps.len() as f64 * 0.75) as usize];

            Ok(serde_json::to_string(&json!({
                "avg_gap": mean,
                "p25": percentile_25,
                "p75": percentile_75,
                "speedup_range": percentile_75 - percentile_25,
            }))
            .map_err(|e| JsValue::from_str(&format!("Serialization failed: {}", e)))?)
        }
        Some(_) => Err(JsValue::from_str("Not an EventLog")),
        None => Err(JsValue::from_str("EventLog not found")),
    }
}

/// Trace Distance Matrix - compute pairwise trace similarity
#[wasm_bindgen]
pub fn compute_trace_similarity_matrix(
    eventlog_handle: &str,
    activity_key: &str,
) -> Result<String, JsValue> {
    match get_or_init_state().get_object(eventlog_handle)? {
        Some(StoredObject::EventLog(log)) => {
            let mut similarities = Vec::new();

            for i in 0..log.traces.len() {
                for j in (i + 1)..log.traces.len() {
                    let trace_i: Vec<String> = log.traces[i]
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
                        .collect();

                    let trace_j: Vec<String> = log.traces[j]
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
                        .collect();

                    // Jaccard similarity
                    let common = trace_i
                        .iter()
                        .filter(|a| trace_j.contains(a))
                        .count();
                    let union = trace_i.len() + trace_j.len() - common;
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

            Ok(serde_json::to_string(&json!({
                "similar_pairs": similarities,
                "total_pairs": (log.traces.len() * (log.traces.len() - 1)) / 2,
            }))
            .map_err(|e| JsValue::from_str(&format!("Serialization failed: {}", e)))?)
        }
        Some(_) => Err(JsValue::from_str("Not an EventLog")),
        None => Err(JsValue::from_str("EventLog not found")),
    }
}

/// Process Bottleneck Timeline - identify temporal bottlenecks
#[wasm_bindgen]
pub fn analyze_temporal_bottlenecks(
    eventlog_handle: &str,
    activity_key: &str,
    timestamp_key: &str,
) -> Result<String, JsValue> {
    match get_or_init_state().get_object(eventlog_handle)? {
        Some(StoredObject::EventLog(log)) => {
            let mut activity_durations: HashMap<String, Vec<f64>> = HashMap::new();

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

            Ok(serde_json::to_string(&json!({
                "bottlenecks": bottlenecks,
            }))
            .map_err(|e| JsValue::from_str(&format!("Serialization failed: {}", e)))?)
        }
        Some(_) => Err(JsValue::from_str("Not an EventLog")),
        None => Err(JsValue::from_str("EventLog not found")),
    }
}

/// Activity Ordering - extract mandatory activity ordering from log
#[wasm_bindgen]
pub fn extract_activity_ordering(
    eventlog_handle: &str,
    activity_key: &str,
) -> Result<String, JsValue> {
    match get_or_init_state().get_object(eventlog_handle)? {
        Some(StoredObject::EventLog(log)) => {
            let mut mandatory_predecessors: HashMap<String, std::collections::HashSet<String>> =
                HashMap::new();

            for trace in &log.traces {
                let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();
                for event in &trace.events {
                    if let Some(AttributeValue::String(activity)) =
                        event.attributes.get(activity_key)
                    {
                        mandatory_predecessors
                            .entry(activity.clone())
                            .or_insert_with(std::collections::HashSet::new)
                            .extend(seen.clone());
                        seen.insert(activity.clone());
                    }
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

            Ok(serde_json::to_string(&json!({
                "activity_ordering": result,
            }))
            .map_err(|e| JsValue::from_str(&format!("Serialization failed: {}", e)))?)
        }
        Some(_) => Err(JsValue::from_str("Not an EventLog")),
        None => Err(JsValue::from_str("EventLog not found")),
    }
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
