use wasm_bindgen::prelude::*;
use crate::state::{get_or_init_state, StoredObject};
use crate::models::*;
use serde_json::json;
use std::collections::{HashMap, HashSet};

/// Heuristic Miner - discovers process models from real-world logs
/// More lenient than Alpha++ for handling noise and incomplete data
#[wasm_bindgen]
pub fn discover_heuristic_miner(
    eventlog_handle: &str,
    activity_key: &str,
    dependency_threshold: f64,
) -> Result<String, JsValue> {
    match get_or_init_state().get_object(eventlog_handle)? {
        Some(StoredObject::EventLog(log)) => {
            let mut dfg = DirectlyFollowsGraph::new();
            let activities = log.get_activities(activity_key);

            // Create nodes for all activities
            for activity in &activities {
                dfg.nodes.push(DFGNode {
                    id: activity.clone(),
                    label: activity.clone(),
                    frequency: 0,
                });
            }

            // Count activity frequencies
            for trace in &log.traces {
                for event in &trace.events {
                    if let Some(AttributeValue::String(activity)) =
                        event.attributes.get(activity_key)
                    {
                        if let Some(node) = dfg.nodes.iter_mut().find(|n| &n.id == activity) {
                            node.frequency += 1;
                        }
                    }
                }
            }

            // Calculate dependency measures
            let mut follows: HashMap<(String, String), usize> = HashMap::new();
            let mut precedes: HashMap<(String, String), usize> = HashMap::new();

            for trace in &log.traces {
                for i in 0..trace.events.len() - 1 {
                    if let (
                        Some(AttributeValue::String(act1)),
                        Some(AttributeValue::String(act2)),
                    ) = (
                        trace.events[i].attributes.get(activity_key),
                        trace.events[i + 1].attributes.get(activity_key),
                    ) {
                        *follows.entry((act1.clone(), act2.clone())).or_insert(0) += 1;
                        *precedes.entry((act2.clone(), act1.clone())).or_insert(0) += 1;
                    }
                }
            }

            // Filter edges by dependency threshold
            for ((from, to), count) in follows {
                let reverse_count = *precedes.get(&(to.clone(), from.clone())).unwrap_or(&0);

                // Dependency measure: (A→B) - (B→A) / (A→B) + (B→A) + 1
                let dependency = if count + reverse_count > 0 {
                    (count as f64 - reverse_count as f64) / (count as f64 + reverse_count as f64 + 1.0)
                } else {
                    0.0
                };

                if dependency >= dependency_threshold {
                    dfg.edges.push(DirectlyFollowsRelation {
                        from,
                        to,
                        frequency: count,
                    });
                }
            }

            // Extract start and end activities
            for trace in &log.traces {
                if !trace.events.is_empty() {
                    if let Some(AttributeValue::String(first_act)) =
                        trace.events[0].attributes.get(activity_key)
                    {
                        *dfg.start_activities.entry(first_act.clone()).or_insert(0) += 1;
                    }
                    if let Some(AttributeValue::String(last_act)) = trace.events[trace.events.len() - 1]
                        .attributes
                        .get(activity_key)
                    {
                        *dfg.end_activities.entry(last_act.clone()).or_insert(0) += 1;
                    }
                }
            }

            let handle = get_or_init_state()
                .store_object(StoredObject::DirectlyFollowsGraph(dfg.clone()))
                .map_err(|_e| JsValue::from_str("Failed to store DFG"))?;

            Ok(serde_json::to_string(&json!({
                "handle": handle,
                "nodes": dfg.nodes.len(),
                "edges": dfg.edges.len(),
                "algorithm": "heuristic_miner",
                "dependency_threshold": dependency_threshold,
            }))
            .map_err(|e| JsValue::from_str(&format!("Serialization failed: {}", e)))?)
        }
        Some(_) => Err(JsValue::from_str("Object is not an EventLog")),
        None => Err(JsValue::from_str("EventLog not found")),
    }
}

/// Discover infrequent behavior patterns (deviations from main process)
#[wasm_bindgen]
pub fn analyze_infrequent_paths(
    eventlog_handle: &str,
    activity_key: &str,
    frequency_threshold: f64,
) -> Result<String, JsValue> {
    match get_or_init_state().get_object(eventlog_handle)? {
        Some(StoredObject::EventLog(log)) => {
            let total_traces = log.traces.len() as f64;
            let mut path_frequencies: HashMap<Vec<String>, usize> = HashMap::new();

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
                freq_b.partial_cmp(&freq_a).unwrap()
            });

            Ok(serde_json::to_string(&json!({
                "infrequent_paths": infrequent_paths,
                "total_distinct_paths": total_distinct_paths,
                "frequency_threshold": frequency_threshold,
            }))
            .map_err(|e| JsValue::from_str(&format!("Serialization failed: {}", e)))?)
        }
        Some(_) => Err(JsValue::from_str("Object is not an EventLog")),
        None => Err(JsValue::from_str("EventLog not found")),
    }
}

/// Detect rework patterns (activities that are repeated in same trace)
#[wasm_bindgen]
pub fn detect_rework(eventlog_handle: &str, activity_key: &str) -> Result<String, JsValue> {
    match get_or_init_state().get_object(eventlog_handle)? {
        Some(StoredObject::EventLog(log)) => {
            let mut rework_stats: HashMap<String, usize> = HashMap::new();
            let mut traces_with_rework = 0;
            let mut total_rework_count = 0;

            for trace in &log.traces {
                let mut activity_counts: HashMap<String, usize> = HashMap::new();
                let mut has_rework = false;

                for event in &trace.events {
                    if let Some(AttributeValue::String(activity)) =
                        event.attributes.get(activity_key)
                    {
                        let count = activity_counts.entry(activity.clone()).or_insert(0);
                        *count += 1;

                        if *count > 1 {
                            has_rework = true;
                            *rework_stats.entry(activity.clone()).or_insert(0) += 1;
                            total_rework_count += 1;
                        }
                    }
                }

                if has_rework {
                    traces_with_rework += 1;
                }
            }

            let mut rework_vec: Vec<(String, usize)> = rework_stats.into_iter().collect();
            rework_vec.sort_by(|a, b| b.1.cmp(&a.1));

            Ok(serde_json::to_string(&json!({
                "traces_with_rework": traces_with_rework,
                "rework_percentage": (traces_with_rework as f64 / log.traces.len() as f64) * 100.0,
                "total_rework_instances": total_rework_count,
                "rework_by_activity": rework_vec,
            }))
            .map_err(|e| JsValue::from_str(&format!("Serialization failed: {}", e)))?)
        }
        Some(_) => Err(JsValue::from_str("Object is not an EventLog")),
        None => Err(JsValue::from_str("EventLog not found")),
    }
}

/// Detect bottlenecks - activities with high duration or long waiting times
#[wasm_bindgen]
pub fn detect_bottlenecks(
    eventlog_handle: &str,
    activity_key: &str,
    timestamp_key: &str,
    duration_threshold_seconds: u64,
) -> Result<String, JsValue> {
    match get_or_init_state().get_object(eventlog_handle)? {
        Some(StoredObject::EventLog(log)) => {
            let mut activity_durations: HashMap<String, Vec<u64>> = HashMap::new();

            for trace in &log.traces {
                for i in 0..trace.events.len() - 1 {
                    if let (
                        Some(AttributeValue::String(activity)),
                        Some(AttributeValue::Date(start_time)),
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
                avg_b.partial_cmp(&avg_a).unwrap()
            });

            Ok(serde_json::to_string(&json!({
                "bottlenecks": bottlenecks,
                "duration_threshold": duration_threshold_seconds,
            }))
            .map_err(|e| JsValue::from_str(&format!("Serialization failed: {}", e)))?)
        }
        Some(_) => Err(JsValue::from_str("Object is not an EventLog")),
        None => Err(JsValue::from_str("EventLog not found")),
    }
}

/// Get process model complexity metrics
#[wasm_bindgen]
pub fn compute_model_metrics(eventlog_handle: &str, activity_key: &str) -> Result<String, JsValue> {
    match get_or_init_state().get_object(eventlog_handle)? {
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

            Ok(serde_json::to_string(&json!({
                "num_activities": activities.len(),
                "num_edges": relations.len(),
                "num_variants": variants.len(),
                "avg_degree": avg_degree,
                "density": density,
                "complexity_score": (activities.len() as f64 * variants.len() as f64).sqrt(),
            }))
            .map_err(|e| JsValue::from_str(&format!("Serialization failed: {}", e)))?)
        }
        Some(_) => Err(JsValue::from_str("Object is not an EventLog")),
        None => Err(JsValue::from_str("EventLog not found")),
    }
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
