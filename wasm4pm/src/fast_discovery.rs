use wasm_bindgen::prelude::*;
use crate::state::{get_or_init_state, StoredObject};
use crate::models::*;
use serde_json::json;
use std::collections::HashSet;
use rustc_hash::FxHashMap;
use crate::utilities::to_js;

/// A* Search-based process discovery - informed heuristic search
#[wasm_bindgen]
pub fn discover_astar(
    eventlog_handle: &str,
    activity_key: &str,
    max_iterations: usize,
) -> Result<JsValue, JsValue> {
    let (best_dfg, iterations) = get_or_init_state().with_object(eventlog_handle, |obj| match obj {
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
                open_set.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
                let (current_dfg, _score) = open_set.pop().unwrap();

                // Build candidate DFGs via iterator chain; heuristic is inlined,
                // no separate complexity_penalty binding needed
                let new_candidates: Vec<(DirectlyFollowsGraph, f64)> = directly_follows
                    .iter()
                    .filter(|(from, to, _)| {
                        !current_dfg.edges.iter().any(|e| &e.from == from && &e.to == to)
                    })
                    .filter_map(|(from, to, freq)| {
                        let mut new_dfg = current_dfg.clone();
                        new_dfg.edges.push(DirectlyFollowsRelation {
                            from: from.clone(),
                            to: to.clone(),
                            frequency: *freq,
                        });
                        let fitness = evaluate_dfg_fitness(&new_dfg, log, activity_key);
                        let edge_count = new_dfg.edges.len();
                        (fitness > 0.5)
                            .then(|| (new_dfg, fitness - edge_count as f64 / 100.0))
                    })
                    .collect();
                open_set.extend(new_candidates);

                best_dfg = current_dfg;
                iterations += 1;
            }

            Ok((best_dfg, iterations))
        }
        Some(_) => Err(JsValue::from_str("Not an EventLog")),
        None => Err(JsValue::from_str("EventLog not found")),
    })?;

    let handle = get_or_init_state()
        .store_object(StoredObject::DirectlyFollowsGraph(best_dfg.clone()))
        .map_err(|_e| JsValue::from_str("Failed to store DFG"))?;

    to_js(&json!({
        "handle": handle,
        "algorithm": "astar",
        "nodes": best_dfg.nodes.len(),
        "edges": best_dfg.edges.len(),
        "iterations": iterations,
    }))
}

/// Hill Climbing - greedy local optimization
#[wasm_bindgen]
pub fn discover_hill_climbing(
    eventlog_handle: &str,
    activity_key: &str,
) -> Result<JsValue, JsValue> {
    let current_dfg = get_or_init_state().with_object(eventlog_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            // Build columnar view once — integer-keyed ops throughout
            let col = log.to_columnar(activity_key);

            // Current edge set as integer pairs — O(1) membership test
            let mut current_edges: HashSet<(u32, u32)> = HashSet::new();

            let mut improved = true;
            while improved {
                improved = false;

                // Single O(events) pass over flat array — compute marginal gain for every
                // candidate edge simultaneously, instead of calling evaluate_dfg_fitness
                // once per candidate (old: O(E × events) per iteration).
                //
                // gain[pair] = number of traces where `pair` is the ONLY consecutive pair
                // absent from current_edges.  Adding that edge makes exactly those traces fit.
                let mut gain: FxHashMap<(u32, u32), usize> =
                    FxHashMap::default();

                for t in 0..col.trace_offsets.len().saturating_sub(1) {
                    let start = col.trace_offsets[t];
                    let end   = col.trace_offsets[t + 1];
                    if start >= end { continue; }

                    // Track the unique missing pair (if exactly one exists)
                    let mut sole_missing: Option<(u32, u32)> = None;
                    let mut multi = false;

                    for i in start..end - 1 {
                        let pair = (col.events[i], col.events[i + 1]);
                        if !current_edges.contains(&pair) {
                            match sole_missing {
                                None           => sole_missing = Some(pair),
                                Some(p) if p == pair => {} // same pair repeated — still sole
                                Some(_)        => { multi = true; break; }
                            }
                        }
                    }

                    if !multi {
                        if let Some(p) = sole_missing {
                            *gain.entry(p).or_insert(0) += 1;
                        }
                    }
                }

                // Add the edge with the highest marginal gain
                if let Some((&best_pair, _)) = gain.iter().max_by_key(|(_, &v)| v) {
                    current_edges.insert(best_pair);
                    improved = true;
                }
            }

            // Materialise back to DFG
            let mut dfg = DirectlyFollowsGraph::new();
            dfg.nodes.extend(col.vocab.iter().map(|&act| DFGNode {
                id: act.to_owned(),
                label: act.to_owned(),
                frequency: 0,
            }));
            dfg.edges.extend(current_edges.iter().map(|&(f, t)| DirectlyFollowsRelation {
                from: col.vocab[f as usize].to_owned(),
                to:   col.vocab[t as usize].to_owned(),
                frequency: 1,
            }));

            Ok(dfg)
        }
        Some(_) => Err(JsValue::from_str("Not an EventLog")),
        None => Err(JsValue::from_str("EventLog not found")),
    })?;

    let handle = get_or_init_state()
        .store_object(StoredObject::DirectlyFollowsGraph(current_dfg.clone()))
        .map_err(|_e| JsValue::from_str("Failed to store DFG"))?;

    to_js(&json!({
        "handle": handle,
        "algorithm": "hill_climbing",
        "nodes": current_dfg.nodes.len(),
        "edges": current_dfg.edges.len(),
    }))
}

/// Trace Variants - extract unique process paths and their frequencies
#[wasm_bindgen]
pub fn analyze_trace_variants(
    eventlog_handle: &str,
    activity_key: &str,
) -> Result<JsValue, JsValue> {
    get_or_init_state().with_object(eventlog_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            let mut variants: FxHashMap<Vec<String>, usize> = FxHashMap::default();

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

            to_js(&json!({
                "total_variants": variant_list.len(),
                "top_variants": top_variants,
                "coverage": (top_variants.len() as f64 / variant_list.len().max(1) as f64 * 100.0),
            }))
        }
        Some(_) => Err(JsValue::from_str("Not an EventLog")),
        None => Err(JsValue::from_str("EventLog not found")),
    })
}

/// Sequential Pattern Mining - find frequent activity sequences
#[wasm_bindgen]
pub fn mine_sequential_patterns(
    eventlog_handle: &str,
    activity_key: &str,
    min_support: f64,
    pattern_length: usize,
) -> Result<JsValue, JsValue> {
    get_or_init_state().with_object(eventlog_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            let mut patterns: FxHashMap<Vec<String>, usize> = FxHashMap::default();
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

            to_js(&json!({
                "pattern_length": pattern_length,
                "patterns": result_patterns,
                "min_support": min_support,
            }))
        }
        Some(_) => Err(JsValue::from_str("Not an EventLog")),
        None => Err(JsValue::from_str("EventLog not found")),
    })
}

/// Concept Drift Detection - identify where process behavior changes
#[wasm_bindgen]
pub fn detect_concept_drift(
    eventlog_handle: &str,
    activity_key: &str,
    window_size: usize,
) -> Result<JsValue, JsValue> {
    get_or_init_state().with_object(eventlog_handle, |obj| match obj {
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

            to_js(&json!({
                "drifts_detected": drifts.len(),
                "drifts": drifts,
                "window_size": window_size,
            }))
        }
        Some(_) => Err(JsValue::from_str("Not an EventLog")),
        None => Err(JsValue::from_str("EventLog not found")),
    })
}

/// Helper: Encode traces as bitsets for O(1) Jaccard similarity
/// Returns (bitsets, activity_index) where bitsets[i] is u128 encoding of trace i
fn encode_traces_as_bitsets(log: &EventLog, activity_key: &str) -> (Vec<u128>, FxHashMap<String, u16>) {
    // Build activity_index: each unique activity gets a bit position 0..127
    let mut activity_index: FxHashMap<String, u16> = FxHashMap::default();
    let mut next_bit = 0u16;

    // First pass: collect all unique activities
    for trace in &log.traces {
        for event in &trace.events {
            if let Some(AttributeValue::String(activity)) = event.attributes.get(activity_key) {
                if !activity_index.contains_key(activity) && next_bit < 128 {
                    activity_index.insert(activity.clone(), next_bit);
                    next_bit += 1;
                }
            }
        }
    }

    // Second pass: encode each trace as a bitset
    let mut bitsets = Vec::new();
    for trace in &log.traces {
        let mut bitset: u128 = 0;
        for event in &trace.events {
            if let Some(AttributeValue::String(activity)) = event.attributes.get(activity_key) {
                if let Some(&bit_pos) = activity_index.get(activity) {
                    bitset |= 1u128 << bit_pos;
                }
            }
        }
        bitsets.push(bitset);
    }

    (bitsets, activity_index)
}

/// Helper: Compute Jaccard similarity between two bitsets
/// jaccard(a, b) = popcount(a & b) / popcount(a | b)
#[inline]
fn jaccard_bitset(a: u128, b: u128) -> f64 {
    let intersection = (a & b).count_ones() as f64;
    let union = (a | b).count_ones() as f64;
    if union == 0.0 {
        0.0
    } else {
        intersection / union
    }
}

/// Helper: Recompute cluster center using majority voting on each bit
fn recompute_center(cluster_indices: &[usize], bitsets: &[u128]) -> u128 {
    if cluster_indices.is_empty() {
        return 0u128;
    }

    let mut center: u128 = 0;
    let threshold = (cluster_indices.len() as f64 / 2.0).ceil() as usize;

    // For each of 128 bits: count how many traces have bit set
    for bit_pos in 0..128 {
        let bit_mask = 1u128 << bit_pos;
        let count = cluster_indices
            .iter()
            .filter(|&&idx| (bitsets[idx] & bit_mask) != 0)
            .count();
        // Set bit in center if majority of traces have it
        if count >= threshold {
            center |= bit_mask;
        }
    }

    center
}

/// Process Clustering - group similar traces using bitset-based k-means
/// Time complexity: O(T×K) where T = traces, K = clusters (vs O(T×K×A) for string-based)
#[wasm_bindgen]
pub fn cluster_traces(
    eventlog_handle: &str,
    activity_key: &str,
    num_clusters: usize,
) -> Result<JsValue, JsValue> {
    get_or_init_state().with_object(eventlog_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            if log.traces.is_empty() {
                return to_js(&json!({
                    "num_clusters": num_clusters,
                    "cluster_sizes": [],
                    "total_traces": 0,
                }));
            }

            let num_clusters = num_clusters.min(log.traces.len());

            // Encode all traces as bitsets: O(T×A) but amortized O(T) after index build
            let (bitsets, _activity_index) = encode_traces_as_bitsets(log, activity_key);

            let mut cluster_centers: Vec<u128> = vec![0u128; num_clusters];
            let mut clusters: Vec<Vec<usize>> = vec![Vec::new(); num_clusters];

            // Initialize centers from first K traces
            for i in 0..num_clusters {
                cluster_centers[i] = bitsets[i];
            }

            // K-means: converge with bitset operations
            let max_iterations = 10;
            let mut converged = false;
            let mut iteration = 0;

            while !converged && iteration < max_iterations {
                iteration += 1;
                converged = true;

                // Clear cluster assignments
                for cluster in &mut clusters {
                    cluster.clear();
                }

                // Assignment: O(T×K) — integer bitwise ops, no String operations
                for (trace_idx, &bitset) in bitsets.iter().enumerate() {
                    let mut best_cluster = 0;
                    let mut best_similarity = -1.0;

                    for (center_idx, &center) in cluster_centers.iter().enumerate() {
                        let similarity = jaccard_bitset(bitset, center);
                        if similarity > best_similarity {
                            best_similarity = similarity;
                            best_cluster = center_idx;
                        }
                    }

                    clusters[best_cluster].push(trace_idx);
                }

                // Update centers using majority voting: O(K×128) = O(K)
                for (center_idx, cluster_indices) in clusters.iter().enumerate() {
                    let new_center = recompute_center(cluster_indices, &bitsets);
                    if new_center != cluster_centers[center_idx] {
                        converged = false;
                    }
                    cluster_centers[center_idx] = new_center;
                }
            }

            // Build result
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

            to_js(&json!({
                "num_clusters": num_clusters,
                "cluster_sizes": cluster_sizes,
                "total_traces": log.traces.len(),
                "iterations": iteration,
            }))
        }
        Some(_) => Err(JsValue::from_str("Not an EventLog")),
        None => Err(JsValue::from_str("EventLog not found")),
    })
}

/// Start/End Activity Analysis - find entry and exit points
#[wasm_bindgen]
pub fn analyze_start_end_activities(
    eventlog_handle: &str,
    activity_key: &str,
) -> Result<JsValue, JsValue> {
    get_or_init_state().with_object(eventlog_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            let mut start_acts: FxHashMap<String, usize> = FxHashMap::default();
            let mut end_acts: FxHashMap<String, usize> = FxHashMap::default();
            let mut start_end_pairs: FxHashMap<(String, String), usize> = FxHashMap::default();

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

            to_js(&json!({
                "start_activities": starts.iter().take(10).map(|(a, c)| json!({"activity": a, "count": c})).collect::<Vec<_>>(),
                "end_activities": ends.iter().take(10).map(|(a, c)| json!({"activity": a, "count": c})).collect::<Vec<_>>(),
                "start_end_pairs": pairs.iter().take(10).map(|(p, c)| json!({"start": p.0, "end": p.1, "count": c})).collect::<Vec<_>>(),
            }))
        }
        Some(_) => Err(JsValue::from_str("Not an EventLog")),
        None => Err(JsValue::from_str("EventLog not found")),
    })
}

/// Activity Co-occurrence - find activities that happen together
#[wasm_bindgen]
pub fn analyze_activity_cooccurrence(
    eventlog_handle: &str,
    activity_key: &str,
) -> Result<JsValue, JsValue> {
    get_or_init_state().with_object(eventlog_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            let mut cooccurrence: FxHashMap<(String, String), usize> = FxHashMap::default();

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

            to_js(&json!({
                "cooccurrences": result,
            }))
        }
        Some(_) => Err(JsValue::from_str("Not an EventLog")),
        None => Err(JsValue::from_str("EventLog not found")),
    })
}

// Helper: Evaluate DFG fitness
#[inline(always)]
fn evaluate_dfg_fitness(dfg: &DirectlyFollowsGraph, log: &EventLog, activity_key: &str) -> f64 {
    // Build a borrowed edge set — no String allocations for keys or lookups.
    let edge_set: HashSet<(&str, &str)> = dfg
        .edges
        .iter()
        .map(|e| (e.from.as_str(), e.to.as_str()))
        .collect();

    let fitting = log
        .traces
        .iter()
        .filter(|trace| {
            trace.events.windows(2).all(|pair| {
                // as_string() returns Option<&str> without any allocation.
                match (
                    pair[0].attributes.get(activity_key).and_then(|v| v.as_string()),
                    pair[1].attributes.get(activity_key).and_then(|v| v.as_string()),
                ) {
                    (Some(a1), Some(a2)) => edge_set.contains(&(a1, a2)),
                    // Missing activity key — treat as non-fitting pair.
                    _ => false,
                }
            })
        })
        .count() as f64;

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
