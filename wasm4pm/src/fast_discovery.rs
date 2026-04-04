use wasm_bindgen::prelude::*;
use crate::state::{get_or_init_state, StoredObject};
use crate::models::*;
use serde_json::json;
use std::collections::{HashMap, HashSet};

/// A* Search-based process discovery - informed heuristic search
#[wasm_bindgen]
pub fn discover_astar(
    eventlog_handle: &str,
    activity_key: &str,
    max_iterations: usize,
) -> Result<String, JsValue> {
    match get_or_init_state().get_object(eventlog_handle)? {
        Some(StoredObject::EventLog(log)) => {
            let activities = log.get_activities(activity_key);
            let directly_follows = log.get_directly_follows(activity_key);

            // Initialize DFG with all edges from log
            let mut best_dfg = DirectlyFollowsGraph::new();
            for activity in &activities {
                best_dfg.nodes.push(DFGNode {
                    id: activity.clone(),
                    label: activity.clone(),
                    frequency: 0,
                });
            }

            let mut open_set = vec![(best_dfg.clone(), 0f64)];
            let mut iterations = 0;

            while !open_set.is_empty() && iterations < max_iterations {
                open_set.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap());
                let (current_dfg, _score) = open_set.pop().unwrap();

                // Add edges with highest frequency
                for (from, to, freq) in &directly_follows {
                    if !current_dfg.edges.iter().any(|e| &e.from == from && &e.to == to) {
                        let mut new_dfg = current_dfg.clone();
                        new_dfg.edges.push(DirectlyFollowsRelation {
                            from: from.clone(),
                            to: to.clone(),
                            frequency: *freq,
                        });

                        let fitness = evaluate_dfg_fitness(&new_dfg, &log, activity_key);
                        let complexity_penalty = new_dfg.edges.len() as f64 / 100.0;
                        let heuristic = fitness - complexity_penalty;

                        if fitness > 0.5 {
                            open_set.push((new_dfg, heuristic));
                        }
                    }
                }

                best_dfg = current_dfg;
                iterations += 1;
            }

            let handle = get_or_init_state()
                .store_object(StoredObject::DirectlyFollowsGraph(best_dfg.clone()))
                .map_err(|_e| JsValue::from_str("Failed to store DFG"))?;

            Ok(serde_json::to_string(&json!({
                "handle": handle,
                "algorithm": "astar",
                "nodes": best_dfg.nodes.len(),
                "edges": best_dfg.edges.len(),
                "iterations": iterations,
            }))
            .map_err(|e| JsValue::from_str(&format!("Serialization failed: {}", e)))?)
        }
        Some(_) => Err(JsValue::from_str("Not an EventLog")),
        None => Err(JsValue::from_str("EventLog not found")),
    }
}

/// Hill Climbing - greedy local optimization
#[wasm_bindgen]
pub fn discover_hill_climbing(
    eventlog_handle: &str,
    activity_key: &str,
) -> Result<String, JsValue> {
    match get_or_init_state().get_object(eventlog_handle)? {
        Some(StoredObject::EventLog(log)) => {
            let activities = log.get_activities(activity_key);
            let directly_follows_vec = log.get_directly_follows(activity_key);
            let mut directly_follows: HashSet<(String, String)> = HashSet::new();
            for (from, to, _) in &directly_follows_vec {
                directly_follows.insert((from.clone(), to.clone()));
            }

            let mut current_dfg = DirectlyFollowsGraph::new();
            for activity in &activities {
                current_dfg.nodes.push(DFGNode {
                    id: activity.clone(),
                    label: activity.clone(),
                    frequency: 0,
                });
            }

            let mut improved = true;
            while improved {
                improved = false;
                let mut best_neighbor = current_dfg.clone();
                let mut best_fitness = evaluate_dfg_fitness(&current_dfg, &log, activity_key);

                for (from, to) in &directly_follows {
                    if !current_dfg.edges.iter().any(|e| &e.from == from && &e.to == to) {
                        let mut neighbor = current_dfg.clone();
                        neighbor.edges.push(DirectlyFollowsRelation {
                            from: from.clone(),
                            to: to.clone(),
                            frequency: 1,
                        });

                        let fitness = evaluate_dfg_fitness(&neighbor, &log, activity_key);
                        if fitness > best_fitness {
                            best_fitness = fitness;
                            best_neighbor = neighbor;
                            improved = true;
                        }
                    }
                }

                current_dfg = best_neighbor;
            }

            let handle = get_or_init_state()
                .store_object(StoredObject::DirectlyFollowsGraph(current_dfg.clone()))
                .map_err(|_e| JsValue::from_str("Failed to store DFG"))?;

            Ok(serde_json::to_string(&json!({
                "handle": handle,
                "algorithm": "hill_climbing",
                "nodes": current_dfg.nodes.len(),
                "edges": current_dfg.edges.len(),
            }))
            .map_err(|e| JsValue::from_str(&format!("Serialization failed: {}", e)))?)
        }
        Some(_) => Err(JsValue::from_str("Not an EventLog")),
        None => Err(JsValue::from_str("EventLog not found")),
    }
}

/// Trace Variants - extract unique process paths and their frequencies
#[wasm_bindgen]
pub fn analyze_trace_variants(
    eventlog_handle: &str,
    activity_key: &str,
) -> Result<String, JsValue> {
    match get_or_init_state().get_object(eventlog_handle)? {
        Some(StoredObject::EventLog(log)) => {
            let mut variants: HashMap<Vec<String>, usize> = HashMap::new();

            for trace in &log.traces {
                let mut path = Vec::new();
                for event in &trace.events {
                    if let Some(AttributeValue::String(activity)) =
                        event.attributes.get(activity_key)
                    {
                        path.push(activity.clone());
                    }
                }
                *variants.entry(path).or_insert(0) += 1;
            }

            let mut variant_list: Vec<(Vec<String>, usize)> = variants.into_iter().collect();
            variant_list.sort_by(|a, b| b.1.cmp(&a.1));

            let top_variants: Vec<_> = variant_list
                .iter()
                .take(20)
                .map(|(path, count)| {
                    json!({
                        "path": path,
                        "count": count,
                        "percentage": (*count as f64 / log.traces.len() as f64 * 100.0).round()
                    })
                })
                .collect();

            Ok(serde_json::to_string(&json!({
                "total_variants": variant_list.len(),
                "top_variants": top_variants,
                "coverage": (top_variants.len() as f64 / variant_list.len().max(1) as f64 * 100.0),
            }))
            .map_err(|e| JsValue::from_str(&format!("Serialization failed: {}", e)))?)
        }
        Some(_) => Err(JsValue::from_str("Not an EventLog")),
        None => Err(JsValue::from_str("EventLog not found")),
    }
}

/// Sequential Pattern Mining - find frequent activity sequences
#[wasm_bindgen]
pub fn mine_sequential_patterns(
    eventlog_handle: &str,
    activity_key: &str,
    min_support: f64,
    pattern_length: usize,
) -> Result<String, JsValue> {
    match get_or_init_state().get_object(eventlog_handle)? {
        Some(StoredObject::EventLog(log)) => {
            let mut patterns: HashMap<Vec<String>, usize> = HashMap::new();
            let min_count = ((log.traces.len() as f64 * min_support).ceil()) as usize;

            for trace in &log.traces {
                let activities: Vec<String> = trace
                    .events
                    .iter()
                    .filter_map(|e| {
                        if let Some(AttributeValue::String(act)) =
                            e.attributes.get(activity_key)
                        {
                            Some(act.clone())
                        } else {
                            None
                        }
                    })
                    .collect();

                for window in activities.windows(pattern_length) {
                    *patterns.entry(window.to_vec()).or_insert(0) += 1;
                }
            }

            let mut frequent_patterns: Vec<_> = patterns
                .into_iter()
                .filter(|(_, count)| *count >= min_count)
                .collect();
            frequent_patterns.sort_by(|a, b| b.1.cmp(&a.1));

            let result_patterns: Vec<_> = frequent_patterns
                .iter()
                .take(50)
                .map(|(pattern, count)| {
                    json!({
                        "pattern": pattern,
                        "count": count,
                        "support": (*count as f64 / log.traces.len() as f64)
                    })
                })
                .collect();

            Ok(serde_json::to_string(&json!({
                "pattern_length": pattern_length,
                "patterns": result_patterns,
                "min_support": min_support,
            }))
            .map_err(|e| JsValue::from_str(&format!("Serialization failed: {}", e)))?)
        }
        Some(_) => Err(JsValue::from_str("Not an EventLog")),
        None => Err(JsValue::from_str("EventLog not found")),
    }
}

/// Concept Drift Detection - identify where process behavior changes
#[wasm_bindgen]
pub fn detect_concept_drift(
    eventlog_handle: &str,
    activity_key: &str,
    window_size: usize,
) -> Result<String, JsValue> {
    match get_or_init_state().get_object(eventlog_handle)? {
        Some(StoredObject::EventLog(log)) => {
            let mut drifts = Vec::new();
            let mut previous_activities: HashSet<String> = HashSet::new();

            for (idx, window) in log.traces.windows(window_size).enumerate() {
                let mut current_activities: HashSet<String> = HashSet::new();

                for trace in window {
                    for event in &trace.events {
                        if let Some(AttributeValue::String(activity)) =
                            event.attributes.get(activity_key)
                        {
                            current_activities.insert(activity.clone());
                        }
                    }
                }

                if !previous_activities.is_empty() {
                    let jaccard_distance = 1.0
                        - (current_activities.intersection(&previous_activities).count() as f64
                            / current_activities.union(&previous_activities).count().max(1) as f64);

                    if jaccard_distance > 0.3 {
                        drifts.push(json!({
                            "position": idx * window_size,
                            "distance": jaccard_distance,
                            "type": "concept_drift"
                        }));
                    }
                }

                previous_activities = current_activities;
            }

            Ok(serde_json::to_string(&json!({
                "drifts_detected": drifts.len(),
                "drifts": drifts,
                "window_size": window_size,
            }))
            .map_err(|e| JsValue::from_str(&format!("Serialization failed: {}", e)))?)
        }
        Some(_) => Err(JsValue::from_str("Not an EventLog")),
        None => Err(JsValue::from_str("EventLog not found")),
    }
}

/// Process Clustering - group similar traces
#[wasm_bindgen]
pub fn cluster_traces(
    eventlog_handle: &str,
    activity_key: &str,
    num_clusters: usize,
) -> Result<String, JsValue> {
    match get_or_init_state().get_object(eventlog_handle)? {
        Some(StoredObject::EventLog(log)) => {
            let mut clusters: Vec<Vec<usize>> = vec![Vec::new(); num_clusters];
            let mut cluster_centers: Vec<Vec<String>> = vec![Vec::new(); num_clusters];

            // Initialize centers randomly from traces
            for i in 0..num_clusters {
                if i < log.traces.len() {
                    let activities: Vec<String> = log.traces[i]
                        .events
                        .iter()
                        .filter_map(|e| {
                            if let Some(AttributeValue::String(act)) =
                                e.attributes.get(activity_key)
                            {
                                Some(act.clone())
                            } else {
                                None
                            }
                        })
                        .collect();
                    cluster_centers[i] = activities;
                }
            }

            // Assign traces to closest cluster
            for (trace_idx, trace) in log.traces.iter().enumerate() {
                let trace_activities: Vec<String> = trace
                    .events
                    .iter()
                    .filter_map(|e| {
                        if let Some(AttributeValue::String(act)) =
                            e.attributes.get(activity_key)
                        {
                            Some(act.clone())
                        } else {
                            None
                        }
                    })
                    .collect();

                let mut best_cluster = 0;
                let mut best_similarity = -1.0;

                for (center_idx, center) in cluster_centers.iter().enumerate() {
                    let common = trace_activities
                        .iter()
                        .filter(|a| center.contains(a))
                        .count();
                    let similarity = common as f64 / (trace_activities.len().max(center.len())) as f64;

                    if similarity > best_similarity {
                        best_similarity = similarity;
                        best_cluster = center_idx;
                    }
                }

                clusters[best_cluster].push(trace_idx);
            }

            let cluster_sizes: Vec<_> = clusters
                .iter()
                .enumerate()
                .map(|(idx, cluster)| {
                    json!({
                        "cluster": idx,
                        "size": cluster.len(),
                        "percentage": (cluster.len() as f64 / log.traces.len() as f64 * 100.0)
                    })
                })
                .collect();

            Ok(serde_json::to_string(&json!({
                "num_clusters": num_clusters,
                "cluster_sizes": cluster_sizes,
                "total_traces": log.traces.len(),
            }))
            .map_err(|e| JsValue::from_str(&format!("Serialization failed: {}", e)))?)
        }
        Some(_) => Err(JsValue::from_str("Not an EventLog")),
        None => Err(JsValue::from_str("EventLog not found")),
    }
}

/// Start/End Activity Analysis - find entry and exit points
#[wasm_bindgen]
pub fn analyze_start_end_activities(
    eventlog_handle: &str,
    activity_key: &str,
) -> Result<String, JsValue> {
    match get_or_init_state().get_object(eventlog_handle)? {
        Some(StoredObject::EventLog(log)) => {
            let mut start_acts: HashMap<String, usize> = HashMap::new();
            let mut end_acts: HashMap<String, usize> = HashMap::new();
            let mut start_end_pairs: HashMap<(String, String), usize> = HashMap::new();

            for trace in &log.traces {
                if !trace.events.is_empty() {
                    if let Some(AttributeValue::String(first)) =
                        trace.events[0].attributes.get(activity_key)
                    {
                        *start_acts.entry(first.clone()).or_insert(0) += 1;
                    }

                    if let Some(AttributeValue::String(last)) =
                        trace.events[trace.events.len() - 1]
                            .attributes
                            .get(activity_key)
                    {
                        *end_acts.entry(last.clone()).or_insert(0) += 1;
                    }

                    if trace.events.len() >= 2 {
                        if let (
                            Some(AttributeValue::String(first)),
                            Some(AttributeValue::String(last)),
                        ) = (
                            trace.events[0].attributes.get(activity_key),
                            trace.events[trace.events.len() - 1]
                                .attributes
                                .get(activity_key),
                        ) {
                            *start_end_pairs
                                .entry((first.clone(), last.clone()))
                                .or_insert(0) += 1;
                        }
                    }
                }
            }

            let mut starts: Vec<_> = start_acts.into_iter().collect();
            let mut ends: Vec<_> = end_acts.into_iter().collect();
            let mut pairs: Vec<_> = start_end_pairs.into_iter().collect();

            starts.sort_by(|a, b| b.1.cmp(&a.1));
            ends.sort_by(|a, b| b.1.cmp(&a.1));
            pairs.sort_by(|a, b| b.1.cmp(&a.1));

            Ok(serde_json::to_string(&json!({
                "start_activities": starts.iter().take(10).map(|(a, c)| json!({"activity": a, "count": c})).collect::<Vec<_>>(),
                "end_activities": ends.iter().take(10).map(|(a, c)| json!({"activity": a, "count": c})).collect::<Vec<_>>(),
                "start_end_pairs": pairs.iter().take(10).map(|(p, c)| json!({"start": p.0, "end": p.1, "count": c})).collect::<Vec<_>>(),
            }))
            .map_err(|e| JsValue::from_str(&format!("Serialization failed: {}", e)))?)
        }
        Some(_) => Err(JsValue::from_str("Not an EventLog")),
        None => Err(JsValue::from_str("EventLog not found")),
    }
}

/// Activity Co-occurrence - find activities that happen together
#[wasm_bindgen]
pub fn analyze_activity_cooccurrence(
    eventlog_handle: &str,
    activity_key: &str,
) -> Result<String, JsValue> {
    match get_or_init_state().get_object(eventlog_handle)? {
        Some(StoredObject::EventLog(log)) => {
            let mut cooccurrence: HashMap<(String, String), usize> = HashMap::new();

            for trace in &log.traces {
                let activities: Vec<String> = trace
                    .events
                    .iter()
                    .filter_map(|e| {
                        if let Some(AttributeValue::String(act)) =
                            e.attributes.get(activity_key)
                        {
                            Some(act.clone())
                        } else {
                            None
                        }
                    })
                    .collect();

                for i in 0..activities.len() {
                    for j in i + 1..activities.len() {
                        let pair = if activities[i] < activities[j] {
                            (activities[i].clone(), activities[j].clone())
                        } else {
                            (activities[j].clone(), activities[i].clone())
                        };
                        *cooccurrence.entry(pair).or_insert(0) += 1;
                    }
                }
            }

            let mut pairs: Vec<_> = cooccurrence.into_iter().collect();
            pairs.sort_by(|a, b| b.1.cmp(&a.1));

            let result: Vec<_> = pairs
                .iter()
                .take(30)
                .map(|((a1, a2), count)| {
                    json!({
                        "activity1": a1,
                        "activity2": a2,
                        "cooccurrence_count": count
                    })
                })
                .collect();

            Ok(serde_json::to_string(&json!({
                "cooccurrences": result,
            }))
            .map_err(|e| JsValue::from_str(&format!("Serialization failed: {}", e)))?)
        }
        Some(_) => Err(JsValue::from_str("Not an EventLog")),
        None => Err(JsValue::from_str("EventLog not found")),
    }
}

// Helper: Evaluate DFG fitness
fn evaluate_dfg_fitness(dfg: &DirectlyFollowsGraph, log: &EventLog, activity_key: &str) -> f64 {
    let edge_set: HashSet<(String, String)> = dfg
        .edges
        .iter()
        .map(|e| (e.from.clone(), e.to.clone()))
        .collect();

    let mut fitting = 0.0;
    for trace in &log.traces {
        let mut trace_fits = true;
        for i in 0..trace.events.len().saturating_sub(1) {
            if let (
                Some(AttributeValue::String(a1)),
                Some(AttributeValue::String(a2)),
            ) = (
                trace.events[i].attributes.get(activity_key),
                trace.events[i + 1].attributes.get(activity_key),
            ) {
                if !edge_set.contains(&(a1.clone(), a2.clone())) {
                    trace_fits = false;
                    break;
                }
            }
        }
        if trace_fits {
            fitting += 1.0;
        }
    }

    fitting / log.traces.len().max(1) as f64
}

#[wasm_bindgen]
pub fn fast_discovery_info() -> String {
    json!({
        "status": "fast_discovery_available",
        "algorithms": [
            {"name": "astar", "type": "informed_search", "speed": "fast"},
            {"name": "hill_climbing", "type": "greedy", "speed": "very_fast"},
            {"name": "trace_variants", "type": "analytics", "speed": "very_fast"},
            {"name": "sequential_patterns", "type": "mining", "speed": "fast"},
            {"name": "concept_drift", "type": "analysis", "speed": "medium"},
            {"name": "trace_clustering", "type": "analytics", "speed": "fast"},
            {"name": "activity_cooccurrence", "type": "analytics", "speed": "fast"},
            {"name": "start_end_analysis", "type": "analytics", "speed": "very_fast"},
        ]
    })
    .to_string()
}
