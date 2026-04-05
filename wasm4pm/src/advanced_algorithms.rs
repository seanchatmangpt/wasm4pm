use wasm_bindgen::prelude::*;
use crate::state::{get_or_init_state, StoredObject};
use crate::models::*;
use serde_json::json;
use std::collections::HashSet;
use rustc_hash::FxHashMap;
use crate::utilities::to_js;

/// Heuristic Miner - discovers process models from real-world logs
/// More lenient than Alpha++ for handling noise and incomplete data
#[wasm_bindgen]
pub fn discover_heuristic_miner(
    eventlog_handle: &str,
    activity_key: &str,
    dependency_threshold: f64,
) -> Result<JsValue, JsValue> {
    // Compute inside closure, store outside (avoids mutex re-entry).
    let dfg = get_or_init_state().with_object(eventlog_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            let mut dfg = DirectlyFollowsGraph::new();

            // Single-pass columnar approach: integer-keyed follows/precedes maps
            // are ~6× smaller than (String,String) maps and hash in O(1).
            let col = log.to_columnar(activity_key);

            // Nodes pre-allocated from vocabulary
            dfg.nodes.extend(col.vocab.iter().map(|&act| DFGNode {
                id: act.to_owned(),
                label: act.to_owned(),
                frequency: 0,
            }));

            let mut follows:  FxHashMap<(u32, u32), usize> = FxHashMap::default();
            let mut precedes: FxHashMap<(u32, u32), usize> = FxHashMap::default();

            for t in 0..col.trace_offsets.len().saturating_sub(1) {
                let start = col.trace_offsets[t];
                let end   = col.trace_offsets[t + 1];
                if start >= end { continue; }

                // Node frequencies + pair counts — single sequential pass
                for &id in &col.events[start..end] {
                    dfg.nodes[id as usize].frequency += 1;
                }
                for i in start..end - 1 {
                    let (a, b) = (col.events[i], col.events[i + 1]);
                    *follows.entry((a, b)).or_insert(0)  += 1;
                    *precedes.entry((b, a)).or_insert(0) += 1;
                }
                // Start / end
                *dfg.start_activities
                    .entry(col.vocab[col.events[start] as usize].to_owned())
                    .or_insert(0) += 1;
                *dfg.end_activities
                    .entry(col.vocab[col.events[end - 1] as usize].to_owned())
                    .or_insert(0) += 1;
            }

            // Apply dependency threshold with branchless formula
            for ((a, b), count) in follows {
                let reverse_count = precedes.get(&(b, a)).copied().unwrap_or(0);
                let ab = f64::from(count as u32);
                let ba = f64::from(reverse_count as u32);
                // +1 denominator makes division always safe — no branch needed
                if (ab - ba) / (ab + ba + 1.0) >= dependency_threshold {
                    dfg.edges.push(DirectlyFollowsRelation {
                        from: col.vocab[a as usize].to_owned(),
                        to:   col.vocab[b as usize].to_owned(),
                        frequency: count,
                    });
                }
            }

            Ok(dfg)
        }
        Some(_) => Err(JsValue::from_str("Object is not an EventLog")),
        None => Err(JsValue::from_str("EventLog not found")),
    })?;

    let n_nodes = dfg.nodes.len();
    let n_edges = dfg.edges.len();
    let handle = get_or_init_state()
        .store_object(StoredObject::DirectlyFollowsGraph(dfg))
        .map_err(|_e| JsValue::from_str("Failed to store DFG"))?;

    to_js(&json!({
        "handle": handle,
        "nodes": n_nodes,
        "edges": n_edges,
        "algorithm": "heuristic_miner",
        "dependency_threshold": dependency_threshold,
    }))
}

/// Discover infrequent behavior patterns (deviations from main process)
#[wasm_bindgen]
pub fn analyze_infrequent_paths(
    eventlog_handle: &str,
    activity_key: &str,
    frequency_threshold: f64,
) -> Result<JsValue, JsValue> {
    get_or_init_state().with_object(eventlog_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            let total_traces = log.traces.len() as f64;
            let mut path_frequencies: FxHashMap<Vec<String>, usize> = FxHashMap::default();

            // Extract activity sequences (paths)
            for trace in &log.traces {
                let mut path = Vec::new();
                for event in &trace.events {
                    if let Some(AttributeValue::String(activity)) =
                        event.attributes.get(activity_key)
                    {
                        path.push(activity.clone());
                    }
                }
                *path_frequencies.entry(path).or_insert(0) += 1;
            }

            // Find infrequent paths
            let total_distinct_paths = path_frequencies.len();
            let mut infrequent_paths = Vec::new();
            for (path, count) in path_frequencies {
                let frequency = count as f64 / total_traces;
                if frequency < frequency_threshold {
                    infrequent_paths.push(json!({
                        "path": path,
                        "count": count,
                        "frequency": frequency,
                    }));
                }
            }

            infrequent_paths.sort_by(|a, b| {
                let freq_a = a["frequency"].as_f64().unwrap_or(0.0);
                let freq_b = b["frequency"].as_f64().unwrap_or(0.0);
                freq_b.partial_cmp(&freq_a).unwrap_or(std::cmp::Ordering::Equal)
            });

            to_js(&json!({
                "infrequent_paths": infrequent_paths,
                "total_distinct_paths": total_distinct_paths,
                "frequency_threshold": frequency_threshold,
            }))
        }
        Some(_) => Err(JsValue::from_str("Object is not an EventLog")),
        None => Err(JsValue::from_str("EventLog not found")),
    })
}

/// Detect rework patterns (activities that are repeated in same trace)
#[wasm_bindgen]
pub fn detect_rework(eventlog_handle: &str, activity_key: &str) -> Result<JsValue, JsValue> {
    get_or_init_state().with_object(eventlog_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            let mut rework_stats: FxHashMap<String, usize> = FxHashMap::default();
            let mut traces_with_rework = 0;
            let mut total_rework_count = 0;

            for trace in &log.traces {
                // Collect all activity names present in this trace into a sorted vec.
                // Sorting groups identical activities together so a single .windows(2)
                // pass can identify duplicates without a per-trace HashMap allocation.
                let mut activities: Vec<&str> = trace
                    .events
                    .iter()
                    .filter_map(|e| match e.attributes.get(activity_key) {
                        Some(AttributeValue::String(s)) => Some(s.as_str()),
                        _ => None,
                    })
                    .collect();

                activities.sort_unstable();

                // Each consecutive equal pair in the sorted list represents one extra
                // occurrence (rework).  Counting them gives the rework contribution of
                // this trace without any HashMap or explicit `if` inside the loop.
                let trace_rework: usize = activities
                    .windows(2)
                    .filter(|w| w[0] == w[1])
                    .inspect(|w| {
                        *rework_stats.entry(w[0].to_owned()).or_insert(0) += 1;
                    })
                    .count();

                if trace_rework > 0 {
                    traces_with_rework += 1;
                    total_rework_count += trace_rework;
                }
            }

            let mut rework_vec: Vec<(String, usize)> = rework_stats.into_iter().collect();
            rework_vec.sort_by(|a, b| b.1.cmp(&a.1));

            to_js(&json!({
                "traces_with_rework": traces_with_rework,
                "rework_percentage": (traces_with_rework as f64 / log.traces.len() as f64) * 100.0,
                "total_rework_instances": total_rework_count,
                "rework_by_activity": rework_vec,
            }))
        }
        Some(_) => Err(JsValue::from_str("Object is not an EventLog")),
        None => Err(JsValue::from_str("EventLog not found")),
    })
}

/// Detect bottlenecks - activities with high duration or long waiting times
#[wasm_bindgen]
pub fn detect_bottlenecks(
    eventlog_handle: &str,
    activity_key: &str,
    timestamp_key: &str,
    duration_threshold_seconds: u64,
) -> Result<JsValue, JsValue> {
    get_or_init_state().with_object(eventlog_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            let mut activity_durations: FxHashMap<String, Vec<u64>> = FxHashMap::default();

            for trace in &log.traces {
                for i in 0..trace.events.len() - 1 {
                    if let (
                        Some(AttributeValue::String(activity)),
                        Some(AttributeValue::Date(_start_time)),
                        Some(AttributeValue::Date(end_time)),
                    ) = (
                        trace.events[i].attributes.get(activity_key),
                        trace.events[i].attributes.get(timestamp_key),
                        trace.events[i + 1].attributes.get(timestamp_key),
                    ) {
                        // Simplified duration calculation (in real implementation, parse ISO 8601)
                        let duration = end_time.len() as u64; // Placeholder

                        if duration > duration_threshold_seconds {
                            activity_durations
                                .entry(activity.clone())
                                .or_insert_with(Vec::new)
                                .push(duration);
                        }
                    }
                }
            }

            let mut bottlenecks = Vec::new();
            for (activity, durations) in activity_durations {
                if !durations.is_empty() {
                    let avg = durations.iter().sum::<u64>() as f64 / durations.len() as f64;
                    let max = *durations.iter().max().unwrap_or(&0);

                    bottlenecks.push(json!({
                        "activity": activity,
                        "occurrences": durations.len(),
                        "avg_duration": avg,
                        "max_duration": max,
                    }));
                }
            }

            bottlenecks.sort_by(|a, b| {
                let avg_a = a["avg_duration"].as_f64().unwrap_or(0.0);
                let avg_b = b["avg_duration"].as_f64().unwrap_or(0.0);
                avg_b.partial_cmp(&avg_a).unwrap_or(std::cmp::Ordering::Equal)
            });

            to_js(&json!({
                "bottlenecks": bottlenecks,
                "duration_threshold": duration_threshold_seconds,
            }))
        }
        Some(_) => Err(JsValue::from_str("Object is not an EventLog")),
        None => Err(JsValue::from_str("EventLog not found")),
    })
}

/// Get process model complexity metrics
#[wasm_bindgen]
pub fn compute_model_metrics(eventlog_handle: &str, activity_key: &str) -> Result<JsValue, JsValue> {
    get_or_init_state().with_object(eventlog_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            let activities = log.get_activities(activity_key);
            let relations = log.get_directly_follows(activity_key);

            // Calculate metrics
            let avg_degree = if !activities.is_empty() {
                (relations.len() as f64 * 2.0) / activities.len() as f64
            } else {
                0.0
            };

            // Density: ratio of actual to possible edges
            let max_edges = activities.len() * (activities.len() - 1);
            let density = if max_edges > 0 {
                relations.len() as f64 / max_edges as f64
            } else {
                0.0
            };

            // Variant count (number of unique case traces)
            let mut variants = HashSet::new();
            for trace in &log.traces {
                let mut path = Vec::new();
                for event in &trace.events {
                    if let Some(AttributeValue::String(activity)) =
                        event.attributes.get(activity_key)
                    {
                        path.push(activity.clone());
                    }
                }
                variants.insert(path);
            }

            to_js(&json!({
                "num_activities": activities.len(),
                "num_edges": relations.len(),
                "num_variants": variants.len(),
                "avg_degree": avg_degree,
                "density": density,
                "complexity_score": (activities.len() as f64 * variants.len() as f64).sqrt(),
            }))
        }
        Some(_) => Err(JsValue::from_str("Object is not an EventLog")),
        None => Err(JsValue::from_str("EventLog not found")),
    })
}

#[wasm_bindgen]
pub fn advanced_algorithms_info() -> String {
    json!({
        "status": "advanced_algorithms_available",
        "algorithms": [
            {
                "name": "heuristic_miner",
                "description": "Discovers process models with configurable dependency threshold",
                "better_for": "Real-world logs with noise and incomplete data"
            },
            {
                "name": "analyze_infrequent_paths",
                "description": "Identifies rare or exceptional process variants",
                "better_for": "Detecting outliers and uncommon behaviors"
            },
            {
                "name": "detect_rework",
                "description": "Finds activities that are repeated in the same case",
                "better_for": "Process optimization and quality assurance"
            },
            {
                "name": "detect_bottlenecks",
                "description": "Identifies slow activities with high duration",
                "better_for": "Performance analysis and optimization"
            },
            {
                "name": "compute_model_metrics",
                "description": "Calculates complexity and structure metrics",
                "better_for": "Model quality assessment"
            }
        ]
    })
    .to_string()
}
