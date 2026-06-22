use crate::models::*;
use crate::state::{get_or_init_state, StoredObject};
use crate::utilities::{evaluate_edges_fitness, to_js_str};
use rustc_hash::FxHashMap;
use serde_json::json;
use std::collections::HashSet;
use wasm_bindgen::prelude::*;

/// Discover a process model using A* informed search.
///
/// Iteratively expands DFG edge candidates using a fitness-minus-penalty heuristic.
/// Returns `{handle, algorithm, nodes, edges, iterations_used: usize}`.
///
/// **IMPORTANT:** The `iterations_used` field in the result is a search step count,
/// **not a fitness score**. Do not interpret it as model quality.
///
/// # Parameters
/// * `max_iterations` — Maximum A* expansion steps. Use 500–2000 for real logs.
///   Higher values allow more thorough search but take longer.
#[wasm_bindgen]
pub fn discover_astar(
    eventlog_handle: &str,
    activity_key: &str,
    max_iterations: usize,
) -> Result<JsValue, JsValue> {
    tracing::info!(
        target: "wasm4pm.discovery.astar",
        algorithm = "astar",
        activity_key = activity_key,
        max_iterations = max_iterations,
        "A* search discovery started"
    );

    let (best_dfg, iterations) =
        get_or_init_state().with_object(eventlog_handle, |obj| match obj {
            Some(StoredObject::EventLog(log)) => {
                tracing::info!(
                    target: "wasm4pm.discovery.astar",
                    checkpoint = "feature_extraction",
                    log_size = log.traces.len(),
                    activity_count = log.get_activities(activity_key).len(),
                    "Log loaded and analyzed"
                );
                Ok(discover_astar_from_log(log, activity_key, max_iterations))
            }
            Some(_) => Err(crate::error::js_val("Not an EventLog")),
            None => Err(crate::error::js_val("EventLog not found")),
        })?;

    let node_count = best_dfg.nodes.len();
    let edge_count = best_dfg.edges.len();

    tracing::info!(
        target: "wasm4pm.discovery.astar",
        checkpoint = "result_generation",
        node_count = node_count,
        edge_count = edge_count,
        iterations_used = iterations,
        "DFG model discovered"
    );

    let handle = get_or_init_state()
        .store_object(StoredObject::DFG(best_dfg.clone()))
        .map_err(|_e| crate::error::js_val("Failed to store DFG"))?;

    to_js_str(&json!({
        "handle": handle,
        "algorithm": "astar",
        "nodes": node_count,
        "edges": edge_count,
        "iterations": iterations,
    }))
}

/// Hill Climbing - greedy local optimization
#[wasm_bindgen]
pub fn discover_hill_climbing(
    eventlog_handle: &str,
    activity_key: &str,
) -> Result<JsValue, JsValue> {
    tracing::info!(
        target: "wasm4pm.discovery.hill_climbing",
        algorithm = "hill_climbing",
        activity_key = activity_key,
        "Hill Climbing discovery started"
    );

    let current_dfg = get_or_init_state().with_object(eventlog_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            tracing::info!(
                target: "wasm4pm.discovery.hill_climbing",
                checkpoint = "feature_extraction",
                log_size = log.traces.len(),
                activity_count = log.get_activities(activity_key).len(),
                "Log loaded and analyzed"
            );
            Ok(discover_hill_climbing_from_log(log, activity_key))
        }
        Some(_) => Err(crate::error::js_val("Not an EventLog")),
        None => Err(crate::error::js_val("EventLog not found")),
    })?;

    let node_count = current_dfg.nodes.len();
    let edge_count = current_dfg.edges.len();

    tracing::info!(
        target: "wasm4pm.discovery.hill_climbing",
        checkpoint = "result_generation",
        node_count = node_count,
        edge_count = edge_count,
        complexity = if node_count > 0 { edge_count as f64 / node_count as f64 } else { 0.0 },
        "DFG model optimized"
    );

    let handle = get_or_init_state()
        .store_object(StoredObject::DFG(current_dfg.clone()))
        .map_err(|_e| crate::error::js_val("Failed to store DFG"))?;

    to_js_str(&json!({
        "handle": handle,
        "algorithm": "hill_climbing",
        "nodes": node_count,
        "edges": edge_count,
    }))
}

/// Pure-Rust Hill Climbing discovery: takes EventLog directly, returns DFG.
/// Testable without wasm-bindgen runtime — same logic as discover_hill_climbing.
///
/// Uses fitness-driven greedy pruning: try removing each edge (sorted for
/// determinism); keep the removal if fitness does not decrease. First-improvement
/// restart until no beneficial removal remains.
pub fn discover_hill_climbing_from_log(log: &EventLog, activity_key: &str) -> DFG {
    let col_owned = log.to_columnar_owned(activity_key);
    let col = ColumnarLog::from_owned(&col_owned);

    // Pre-size: n² / 4 is a practical upper bound for DFG edge count (sparse graphs).
    let n = col.vocab.len();
    let cap = n.saturating_mul(n) / 4 + 1;
    let mut current_edges: std::collections::BTreeSet<(u32, u32)> =
        std::collections::BTreeSet::new();
    let mut edge_freq: FxHashMap<(u32, u32), usize> =
        FxHashMap::with_capacity_and_hasher(cap, Default::default());
    let mut node_freq: FxHashMap<u32, usize> =
        FxHashMap::with_capacity_and_hasher(n + 1, Default::default());

    for t in 0..col.trace_offsets.len().saturating_sub(1) {
        let start = col.trace_offsets[t];
        let end = col.trace_offsets[t + 1];
        for i in start..end {
            *node_freq.entry(col.events[i]).or_default() += 1;
            if i + 1 < end {
                let edge = (col.events[i], col.events[i + 1]);
                *edge_freq.entry(edge).or_default() += 1;
                current_edges.insert(edge);
            }
        }
    }

    let edge_vocab_len = current_edges.len();
    if edge_vocab_len > 1 {
        // Fitness-driven greedy pruning — first-improvement restart.
        // Sorted iteration makes the search order deterministic regardless of
        // HashSet RandomState. Edges with low observed frequency are tried first.
        //
        // Optimisation: instead of cloning the whole edge set per candidate
        // (O(edges) per trial), remove the edge in-place, evaluate fitness,
        // then re-insert on failure. This turns O(edges²) allocations into
        // O(1) set mutations per trial — no heap allocation in the inner loop.
        let mut current_fitness = evaluate_edges_fitness(&current_edges, &col, edge_vocab_len);
        let mut improved = true;
        while improved && current_edges.len() > 1 {
            improved = false;
            let mut candidates: Vec<(u32, u32)> = current_edges.iter().copied().collect();
            // Sort by ascending frequency so cheapest-to-remove edges are tried first.
            candidates.sort_unstable_by_key(|e| (edge_freq.get(e).copied().unwrap_or(0), *e));
            for &edge in &candidates {
                // Mutate in place — no clone needed.
                current_edges.remove(&edge);
                let trial_fitness = evaluate_edges_fitness(&current_edges, &col, edge_vocab_len);
                if trial_fitness >= current_fitness - f64::EPSILON {
                    current_fitness = trial_fitness;
                    improved = true;
                    break; // first-improvement restart; edge stays removed
                } else {
                    // Fitness dropped — restore the edge and continue.
                    current_edges.insert(edge);
                }
            }
        }
    }

    let mut dfg = DFG::new();
    dfg.nodes
        .extend(col.vocab.iter().enumerate().map(|(idx, act)| DFGNode {
            id: act.to_string(),
            label: act.to_string(),
            frequency: node_freq.get(&(idx as u32)).copied().unwrap_or(0),
        }));
    dfg.edges
        .extend(current_edges.iter().map(|&(f, t)| DirectlyFollowsRelation {
            from: col.vocab[f as usize].to_owned(),
            to: col.vocab[t as usize].to_owned(),
            frequency: edge_freq.get(&(f, t)).copied().unwrap_or(1),
        }));
    dfg
}

/// Pure-Rust A* discovery: takes EventLog directly, returns (DFG, iterations_used).
/// Testable without wasm-bindgen runtime — same logic as discover_astar.
pub fn discover_astar_from_log(
    log: &EventLog,
    activity_key: &str,
    max_iterations: usize,
) -> (DFG, usize) {
    let activities = log.get_activities(activity_key);
    let directly_follows = log.get_directly_follows(activity_key);

    let total_pairs: usize = directly_follows.iter().map(|(_, _, freq)| freq).sum();
    let total_df = directly_follows.len().max(1);

    let mut best_dfg = DFG::new();
    for activity in &activities {
        best_dfg.nodes.push(DFGNode {
            id: activity.clone(),
            label: activity.clone(),
            frequency: 0,
        });
    }

    let mut open_set = vec![(best_dfg.clone(), 0f64)];
    let mut best_score = 0f64;
    let mut iterations = 0;

    while !open_set.is_empty() && iterations < max_iterations {
        open_set.sort_unstable_by(|a, b| a.1.total_cmp(&b.1));
        let (current_dfg, _score) = match open_set.pop() {
            Some(item) => item,
            None => break,
        };

        let current_covered_pairs: usize = current_dfg.edges.iter().map(|e| e.frequency).sum();
        let current_edge_count = current_dfg.edges.len();

        let new_candidates: Vec<(DFG, f64)> = directly_follows
            .iter()
            .filter(|(from, to, _)| {
                !current_dfg
                    .edges
                    .iter()
                    .any(|e| &e.from == from && &e.to == to)
            })
            .filter_map(|(from, to, freq)| {
                // Incremental fitness calculation
                let new_covered_pairs = current_covered_pairs + freq;
                let new_edge_count = current_edge_count + 1;

                let coverage = if total_pairs == 0 {
                    1.0
                } else {
                    new_covered_pairs as f64 / total_pairs as f64
                };
                let relative_density = new_edge_count as f64 / total_pairs.max(1) as f64;
                let simplicity = 1.0 / (1.0 + relative_density);
                let fitness = coverage.mul_add(0.8, simplicity * 0.2);

                let edge_penalty = new_edge_count as f64 / total_df as f64;
                let candidate_score = fitness.mul_add(0.8, -edge_penalty * 0.2);

                if fitness > 0.0 {
                    let mut new_dfg = current_dfg.clone();
                    new_dfg.edges.push(DirectlyFollowsRelation {
                        from: from.clone(),
                        to: to.clone(),
                        frequency: *freq,
                    });
                    Some((new_dfg, candidate_score))
                } else {
                    None
                }
            })
            .collect();
        // Track best across NEW candidates (where the actual scores live), not the
        // parent we just popped. Prior bug: `if score > best_score` only ever read
        // the popped score — for iteration 0 that score is always 0 (the seed
        // empty DFG), so `best_dfg` perpetually lagged the frontier by one step
        // and an A* run with `max_iterations=1` always returned an empty DFG.
        for (cand_dfg, cand_score) in &new_candidates {
            if *cand_score > best_score {
                best_score = *cand_score;
                best_dfg = cand_dfg.clone();
            }
        }
        open_set.extend(new_candidates);
        // Beam: sort descending by score and cap the open set to prevent memory explosion.
        open_set.sort_unstable_by(|a, b| b.1.total_cmp(&a.1));
        open_set.truncate(128);
        iterations += 1;
    }
    (best_dfg, iterations)
}

/// Trace Variants - extract unique process paths and their frequencies
#[wasm_bindgen]
pub fn analyze_trace_variants(
    eventlog_handle: &str,
    activity_key: &str,
) -> Result<JsValue, JsValue> {
    get_or_init_state().with_object(eventlog_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            let mut variants: std::collections::BTreeMap<Vec<String>, usize> =
                std::collections::BTreeMap::new();

            for trace in &log.traces {
                let path: Vec<String> = trace
                    .events
                    .iter()
                    .filter_map(|e| {
                        e.attributes
                            .get(activity_key)?
                            .as_string()
                            .map(str::to_owned)
                    })
                    .collect();
                *variants.entry(path).or_default() += 1;
            }

            let mut variant_list: Vec<(Vec<String>, usize)> = variants.into_iter().collect();
            variant_list.sort_unstable_by_key(|b| std::cmp::Reverse(b.1));

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

            to_js_str(&json!({
                "total_variants": variant_list.len(),
                "top_variants": top_variants,
                "coverage": (top_variants.len() as f64 / variant_list.len().max(1) as f64 * 100.0),
            }))
        }
        Some(_) => Err(crate::error::js_val("Not an EventLog")),
        None => Err(crate::error::js_val("EventLog not found")),
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
            let mut patterns: std::collections::BTreeMap<Vec<String>, usize> =
                std::collections::BTreeMap::new();
            let min_count = ((log.traces.len() as f64 * min_support).ceil()) as usize;

            for trace in &log.traces {
                let activities: Vec<String> = trace
                    .events
                    .iter()
                    .filter_map(|e| {
                        e.attributes
                            .get(activity_key)?
                            .as_string()
                            .map(str::to_owned)
                    })
                    .collect();

                for window in activities.windows(pattern_length) {
                    *patterns.entry(window.to_vec()).or_default() += 1;
                }
            }

            let mut frequent_patterns: Vec<_> = patterns
                .into_iter()
                .filter(|(_, count)| *count >= min_count)
                .collect();
            frequent_patterns.sort_unstable_by_key(|b| std::cmp::Reverse(b.1));

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

            to_js_str(&json!({
                "pattern_length": pattern_length,
                "patterns": result_patterns,
                "min_support": min_support,
            }))
        }
        Some(_) => Err(crate::error::js_val("Not an EventLog")),
        None => Err(crate::error::js_val("EventLog not found")),
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
                        - (current_activities
                            .intersection(&previous_activities)
                            .count() as f64
                            / current_activities
                                .union(&previous_activities)
                                .count()
                                .max(1) as f64);

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

            to_js_str(&json!({
                "drifts_detected": drifts.len(),
                "drifts": drifts,
                "window_size": window_size,
            }))
        }
        Some(_) => Err(crate::error::js_val("Not an EventLog")),
        None => Err(crate::error::js_val("EventLog not found")),
    })
}

/// Helper: Encode traces as bitsets for O(1) Jaccard similarity
/// Returns (bitsets, activity_index) where bitsets[i] is u128 encoding of trace i
fn encode_traces_as_bitsets(
    log: &EventLog,
    activity_key: &str,
) -> (Vec<u128>, FxHashMap<String, u16>) {
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
                return to_js_str(&json!({
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
            cluster_centers[..num_clusters].copy_from_slice(&bitsets[..num_clusters]);

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

            to_js_str(&json!({
                "num_clusters": num_clusters,
                "cluster_sizes": cluster_sizes,
                "total_traces": log.traces.len(),
                "iterations": iteration,
            }))
        }
        Some(_) => Err(crate::error::js_val("Not an EventLog")),
        None => Err(crate::error::js_val("EventLog not found")),
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
                        *start_acts.entry(first.clone()).or_default() += 1;
                    }

                    if let Some(AttributeValue::String(last)) =
                        trace.events[trace.events.len() - 1]
                            .attributes
                            .get(activity_key)
                    {
                        *end_acts.entry(last.clone()).or_default() += 1;
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
                                .or_default() += 1;
                        }
                    }
                }
            }

            let mut starts: Vec<_> = start_acts.into_iter().collect();
            let mut ends: Vec<_> = end_acts.into_iter().collect();
            let mut pairs: Vec<_> = start_end_pairs.into_iter().collect();

            starts.sort_unstable_by_key(|b| std::cmp::Reverse(b.1));
            ends.sort_unstable_by_key(|b| std::cmp::Reverse(b.1));
            pairs.sort_unstable_by_key(|b| std::cmp::Reverse(b.1));

            to_js_str(&json!({
                "start_activities": starts.iter().take(10).map(|(a, c)| json!({"activity": a, "count": c})).collect::<Vec<_>>(),
                "end_activities": ends.iter().take(10).map(|(a, c)| json!({"activity": a, "count": c})).collect::<Vec<_>>(),
                "start_end_pairs": pairs.iter().take(10).map(|(p, c)| json!({"start": p.0, "end": p.1, "count": c})).collect::<Vec<_>>(),
            }))
        }
        Some(_) => Err(crate::error::js_val("Not an EventLog")),
        None => Err(crate::error::js_val("EventLog not found")),
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
                        e.attributes
                            .get(activity_key)?
                            .as_string()
                            .map(str::to_owned)
                    })
                    .collect();

                for i in 0..activities.len() {
                    for j in i + 1..activities.len() {
                        let pair = if activities[i] < activities[j] {
                            (activities[i].clone(), activities[j].clone())
                        } else {
                            (activities[j].clone(), activities[i].clone())
                        };
                        *cooccurrence.entry(pair).or_default() += 1;
                    }
                }
            }

            let mut pairs: Vec<_> = cooccurrence.into_iter().collect();
            pairs.sort_unstable_by_key(|b| std::cmp::Reverse(b.1));

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

            to_js_str(&json!({
                "cooccurrences": result,
            }))
        }
        Some(_) => Err(crate::error::js_val("Not an EventLog")),
        None => Err(crate::error::js_val("EventLog not found")),
    })
}

/// Partial edge-coverage fitness: fraction of consecutive event pairs in the log
/// that are present in the DFG, minus a complexity penalty per extra edge.
///
/// Unlike all-or-nothing trace fitness, partial coverage provides a non-zero
/// gradient from an empty DFG — essential for incremental construction in A*.
/// Fitness ∈ [0, 1]: 0 = no edges match any pair, 1 = all pairs covered exactly.
fn evaluate_dfg_partial_fitness(dfg: &DFG, log: &EventLog, activity_key: &str) -> f64 {
    let edge_set: HashSet<(&str, &str)> = dfg
        .edges
        .iter()
        .map(|e| (e.from.as_str(), e.to.as_str()))
        .collect();
    let mut total_pairs = 0usize;
    let mut covered_pairs = 0usize;
    for trace in &log.traces {
        for pair in trace.events.windows(2) {
            let a1 = pair[0]
                .attributes
                .get(activity_key)
                .and_then(|v| v.as_string());
            let a2 = pair[1]
                .attributes
                .get(activity_key)
                .and_then(|v| v.as_string());
            if let (Some(from), Some(to)) = (a1, a2) {
                total_pairs += 1;
                if edge_set.contains(&(from, to)) {
                    covered_pairs += 1;
                }
            }
        }
    }
    if total_pairs == 0 {
        return 1.0;
    }
    // 80% coverage + 20% simplicity (vocabulary-relative density)
    let coverage = covered_pairs as f64 / total_pairs as f64;
    // edge_set.len() == dfg.edges.len() here, so normalize by unique observed pairs
    let relative_density = dfg.edges.len() as f64 / total_pairs.max(1) as f64;
    let simplicity = 1.0 / (1.0 + relative_density);
    coverage.mul_add(0.8, simplicity * 0.2)
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
