use crate::models::*;
use crate::state::{get_or_init_state, StoredObject};
use crate::utilities::{evaluate_edges_fitness, to_js_str};
use rand::rngs::StdRng;
use rand::{Rng, SeedableRng};
use rustc_hash::FxHashMap;
use serde_json::json;
use std::collections::HashSet;
use wasm_bindgen::prelude::*;

/// Inductive Miner - recursive structure discovery via cuts
/// Implements IM-basic (no noise filtering, all directly-follows preserved)
/// Returns ProcessTree via XOR/Sequence/Parallel/Loop cuts
/// Pure-Rust Inductive Miner: returns JSON string with the discovered process tree.
/// Testable without wasm-bindgen runtime.
pub fn discover_inductive_miner_from_log(log: &EventLog, activity_key: &str) -> String {
    let activities = log.get_activities(activity_key);
    let mut sorted_acts: Vec<_> = activities.to_vec();
    sorted_acts.sort();
    match inductive_miner_recursive(log, &sorted_acts, activity_key, 0) {
        Ok(tree) => {
            let nodes = tree.count_nodes();
            serde_json::to_string(&json!({
                "algorithm": "inductive_miner",
                "root": tree,
                "nodes": nodes,
            }))
            .unwrap_or_else(|_| r#"{"error":"serialize"}"#.to_string())
        }
        Err(_) => r#"{"error":"discovery"}"#.to_string(),
    }
}

#[wasm_bindgen]
pub fn discover_inductive_miner(
    eventlog_handle: &str,
    activity_key: &str,
) -> Result<JsValue, JsValue> {
    let tree = get_or_init_state().with_object(eventlog_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            let activities = log.get_activities(activity_key);
            let mut sorted_acts: Vec<_> = activities.to_vec();
            sorted_acts.sort(); // Deterministic ordering

            inductive_miner_recursive(log, &sorted_acts, activity_key, 0)
        }
        Some(_) => Err(crate::error::js_val("Not an EventLog")),
        None => Err(crate::error::js_val("EventLog not found")),
    })?;

    let nodes = tree.count_nodes();
    let result = json!({
        "algorithm": "inductive_miner",
        "root": tree,
        "nodes": nodes,
    });
    to_js_str(&result)
}

fn inductive_miner_recursive(
    log: &EventLog,
    activities: &[String],
    activity_key: &str,
    depth: usize,
) -> Result<ProcessTreeNode, JsValue> {
    // Base case: single activity
    if activities.len() == 1 {
        return Ok(ProcessTreeNode::leaf(activities[0].clone()));
    }

    // Depth limit: prevent stack overflow on cyclic logs
    if depth > 100 {
        return Ok(ProcessTreeNode::flower());
    }

    // Build directly-follows on this subset
    let df = build_df_subset(log, activities, activity_key);

    // Try cuts in order: XOR → Sequence → Parallel → Loop

    // 1. XOR cut: partition with no edges between sets
    if let Some((left, right)) = find_xor_cut(activities, &df) {
        let left_tree = inductive_miner_recursive(log, &left, activity_key, depth + 1)?;
        let right_tree = inductive_miner_recursive(log, &right, activity_key, depth + 1)?;
        return Ok(ProcessTreeNode::xor(vec![left_tree, right_tree]));
    }

    // 2. Sequence cut: A→B partition (all A edges → B, all B edges ← A)
    if let Some((left, right)) = find_sequence_cut(activities, &df) {
        let left_tree = inductive_miner_recursive(log, &left, activity_key, depth + 1)?;
        let right_tree = inductive_miner_recursive(log, &right, activity_key, depth + 1)?;
        return Ok(ProcessTreeNode::sequence(vec![left_tree, right_tree]));
    }

    // 3. Parallel cut: all pairs have bidirectional edges
    if let Some(partitions) = find_parallel_cut(activities, &df) {
        if partitions.len() > 1 {
            let mut trees = Vec::new();
            for partition in partitions {
                trees.push(inductive_miner_recursive(
                    log,
                    &partition,
                    activity_key,
                    depth + 1,
                )?);
            }
            return Ok(ProcessTreeNode::parallel(trees));
        }
    }

    // 4. Loop cut: partition where right has edges back to left
    if let Some((left, right)) = find_loop_cut(activities, &df) {
        let body = inductive_miner_recursive(log, &left, activity_key, depth + 1)?;
        let redo = inductive_miner_recursive(log, &right, activity_key, depth + 1)?;
        return Ok(ProcessTreeNode::loop_node(body, redo));
    }

    // 5. Fallback: flower model (all activities in loop)
    Ok(ProcessTreeNode::flower())
}

fn build_df_subset(
    log: &EventLog,
    activities: &[String],
    activity_key: &str,
) -> FxHashMap<(String, String), usize> {
    let mut df = FxHashMap::default();
    let activity_set: HashSet<_> = activities.iter().cloned().collect();
    let _ = &activity_set; // Used in loop check below

    for trace in &log.traces {
        for i in 0..trace.events.len().saturating_sub(1) {
            let curr = trace.events[i].attributes.get(activity_key);
            let next = trace.events[i + 1].attributes.get(activity_key);

            if let (Some(AttributeValue::String(c)), Some(AttributeValue::String(n))) = (curr, next)
            {
                if activity_set.contains(c) && activity_set.contains(n) {
                    *df.entry((c.clone(), n.clone())).or_insert(0) += 1;
                }
            }
        }
    }

    df
}

fn find_xor_cut(
    activities: &[String],
    df: &FxHashMap<(String, String), usize>,
) -> Option<(Vec<String>, Vec<String>)> {
    // Find partition with zero edges between sets (any split counts if no edges cross)
    for i in 1..activities.len() {
        let left: Vec<_> = activities[..i].to_vec();
        let right: Vec<_> = activities[i..].to_vec();

        let has_cross_edge = df.keys().any(|(from, to)| {
            (left.contains(from) && right.contains(to))
                || (right.contains(from) && left.contains(to))
        });

        if !has_cross_edge && !left.is_empty() && !right.is_empty() {
            return Some((left, right));
        }
    }

    None
}

fn find_sequence_cut(
    activities: &[String],
    df: &FxHashMap<(String, String), usize>,
) -> Option<(Vec<String>, Vec<String>)> {
    // A→B: all edges from A go to B, all edges to B come from A
    for i in 1..activities.len() {
        let left: Vec<_> = activities[..i].to_vec();
        let right: Vec<_> = activities[i..].to_vec();

        let mut valid = true;

        // Check: no edges within left, no edges within right, all edges are left→right or right-only
        for (from, to) in df.keys() {
            let from_in_left = left.contains(from);
            let from_in_right = right.contains(from);
            let to_in_left = left.contains(to);
            let to_in_right = right.contains(to);

            match (from_in_left, from_in_right, to_in_left, to_in_right) {
                (true, false, true, false) => {
                    valid = false;
                    break;
                } // left→left (bad)
                (false, true, false, true) => {
                    valid = false;
                    break;
                } // right→right (bad)
                (false, true, true, false) => {
                    valid = false;
                    break;
                } // right→left (bad)
                _ => {}
            }
        }

        if valid && !left.is_empty() && !right.is_empty() {
            return Some((left, right));
        }
    }

    None
}

fn find_parallel_cut(
    activities: &[String],
    df: &FxHashMap<(String, String), usize>,
) -> Option<Vec<Vec<String>>> {
    let n = activities.len();
    if n < 2 {
        return None;
    }

    // Union-Find: group activities connected by bidirectional df-edges.
    let mut parent: Vec<usize> = (0..n).collect();

    fn uf_find(parent: &mut [usize], mut x: usize) -> usize {
        while parent[x] != x {
            parent[x] = parent[parent[x]]; // path compression (halving)
            x = parent[x];
        }
        x
    }

    fn uf_union(parent: &mut [usize], a: usize, b: usize) {
        let ra = uf_find(parent, a);
        let rb = uf_find(parent, b);
        if ra != rb {
            parent[ra] = rb;
        }
    }

    for i in 0..n {
        for j in (i + 1)..n {
            let ab = df.contains_key(&(activities[i].clone(), activities[j].clone()));
            let ba = df.contains_key(&(activities[j].clone(), activities[i].clone()));
            if ab && ba {
                uf_union(&mut parent, i, j);
            }
        }
    }

    // Collect groups, sorting by root for deterministic output.
    let mut groups: FxHashMap<usize, Vec<String>> = FxHashMap::default();
    for (i, activity) in activities.iter().enumerate() {
        let root = uf_find(&mut parent, i);
        groups.entry(root).or_default().push(activity.clone());
    }

    if groups.len() < 2 {
        return None;
    }

    let mut result: Vec<Vec<String>> = groups.into_values().collect();
    result.sort_by(|a, b| a[0].cmp(&b[0])); // deterministic order
    Some(result)
}

fn find_loop_cut(
    activities: &[String],
    df: &FxHashMap<(String, String), usize>,
) -> Option<(Vec<String>, Vec<String>)> {
    // Body→Redo partition where Redo has edges back to Body
    for i in 1..activities.len() {
        let body: Vec<_> = activities[..i].to_vec();
        let redo: Vec<_> = activities[i..].to_vec();

        let has_redo_to_body = df
            .keys()
            .any(|(from, to)| redo.contains(from) && body.contains(to));

        if has_redo_to_body && !body.is_empty() && !redo.is_empty() {
            return Some((body, redo));
        }
    }

    None
}

/// Ant Colony Optimization - pheromone-based model discovery
/// Layer 6b: Edge-set representation with integer-keyed pheromone map
#[wasm_bindgen]
pub fn discover_ant_colony(
    eventlog_handle: &str,
    activity_key: &str,
    num_ants: usize,
    iterations: usize,
) -> Result<JsValue, JsValue> {
    // DEPRECATED: delegates to discover_aco_algorithm (proper ACO implementation with heuristic eta and all-ant pheromone deposit)
    crate::genetic_discovery::discover_aco_algorithm(
        eventlog_handle,
        activity_key,
        num_ants,
        iterations,
    )
}

/// Simulated Annealing - thermal search for optimal models
/// Layer 6b: Edge-set representation with integer-based edge mutation
#[wasm_bindgen]
pub fn discover_simulated_annealing(
    eventlog_handle: &str,
    activity_key: &str,
    temperature: f64,
    cooling_rate: f64,
) -> Result<JsValue, JsValue> {
    let (best_dfg, best_fitness) =
        get_or_init_state().with_object(eventlog_handle, |obj| match obj {
            Some(StoredObject::EventLog(log)) => {
                Ok(discover_simulated_annealing_from_log(
                    log,
                    activity_key,
                    temperature,
                    cooling_rate,
                ))
            }
            Some(_) => Err(crate::error::js_val("Not an EventLog")),
            None => Err(crate::error::js_val("EventLog not found")),
        })?;

    let handle = get_or_init_state()
        .store_object(StoredObject::DirectlyFollowsGraph(best_dfg.clone()))
        .map_err(|_e| crate::error::js_val("Failed to store DFG"))?;

    to_js_str(&json!({
        "handle": handle,
        "algorithm": "simulated_annealing",
        "nodes": best_dfg.nodes.len(),
        "edges": best_dfg.edges.len(),
        "fitness": best_fitness,
    }))
}

/// Pure-Rust SA discovery: takes EventLog directly, returns (DFG, fitness).
/// Testable without wasm-bindgen runtime — same logic as discover_simulated_annealing.
pub fn discover_simulated_annealing_from_log(
    log: &EventLog,
    activity_key: &str,
    temperature: f64,
    cooling_rate: f64,
) -> (DirectlyFollowsGraph, f64) {
    use std::collections::HashSet as HS;
    let col_owned = log.to_columnar_owned(activity_key);
    let col = ColumnarLog::from_owned(&col_owned);

    let mut edge_vocab: Vec<(u32, u32)> = Vec::new();
    let mut edge_freq: FxHashMap<(u32, u32), f64> = FxHashMap::default();
    let mut node_freq: FxHashMap<u32, usize> = FxHashMap::default();
    for t in 0..col.trace_offsets.len().saturating_sub(1) {
        let start = col.trace_offsets[t];
        let end = col.trace_offsets[t + 1];
        for i in start..end {
            *node_freq.entry(col.events[i]).or_insert(0) += 1;
            if i + 1 < end {
                let edge = (col.events[i], col.events[i + 1]);
                let cnt = edge_freq.entry(edge).or_insert(0.0);
                if *cnt == 0.0 {
                    edge_vocab.push(edge);
                }
                *cnt += 1.0;
            }
        }
    }
    let vocab: Vec<String> = col.vocab.iter().map(|s| s.to_string()).collect();
    let vocab_len = edge_vocab.len();
    let cooling_rate = cooling_rate.clamp(0.001_f64, 0.9999_f64);
    // Fix (PR #54 SPC NaN class): temperature was unguarded — a caller passing NaN
    // skipped the entire loop (NaN > 0.01 is false) and the algorithm returned the
    // empty edge set; a caller passing Inf would run for ~∞ iterations until
    // cooling_rate exponential decay reached 0.01. Clamp into a finite, positive
    // working range.
    let temperature = if temperature.is_finite() && temperature > 0.0 {
        temperature.clamp(0.02_f64, 1.0e6_f64)
    } else {
        1.0_f64
    };
    let mut rng = StdRng::seed_from_u64(42);

    let mut current_edges: HS<(u32, u32)> = HS::new();
    let mut current_fitness = evaluate_edges_fitness(&current_edges, &col, vocab_len);
    let mut best_edges = current_edges.clone();
    let mut best_fitness = current_fitness;
    let mut temp = temperature;

    while temp > 0.01 {
        let mut neighbor = current_edges.clone();
        if rng.gen::<f64>() < 0.5 && !current_edges.is_empty() {
            // Sort for deterministic selection independent of HashSet RandomState.
            let mut edges_sorted: Vec<(u32, u32)> = neighbor.iter().copied().collect();
            edges_sorted.sort_unstable();
            let pick = (rng.gen::<f64>() * edges_sorted.len() as f64) as usize;
            neighbor.remove(&edges_sorted[pick]);
        } else if !edge_vocab.is_empty() {
            let idx = (rng.gen::<f64>() * edge_vocab.len() as f64) as usize;
            neighbor.insert(edge_vocab[idx]);
        }
        let neighbor_fitness = evaluate_edges_fitness(&neighbor, &col, vocab_len);
        let delta = neighbor_fitness - current_fitness;
        // Fix (PR #54 SPC NaN class): if either fitness was NaN, `delta` is NaN and
        // `delta >= 0.0` is false; `(NaN/temp).exp()` is also NaN and `rng.gen() < NaN`
        // is false, so the branch was silently always-reject. Treat NaN delta as a
        // worst-case "do not accept" while still allowing the loop to terminate.
        let accept = if delta.is_nan() {
            false
        } else {
            delta >= 0.0 || rng.gen::<f64>() < (delta / temp).exp()
        };
        if accept {
            current_edges = neighbor;
            current_fitness = neighbor_fitness;
            if current_fitness > best_fitness {
                best_fitness = current_fitness;
                best_edges = current_edges.clone();
            }
        }
        temp *= cooling_rate;
    }
    (edge_set_to_dfg(&best_edges, &vocab, &edge_freq, &node_freq), best_fitness)
}

/// Process Skeleton - extract minimal model structure
#[wasm_bindgen]
pub fn extract_process_skeleton(
    eventlog_handle: &str,
    activity_key: &str,
    min_frequency: usize,
) -> Result<JsValue, JsValue> {
    let dfg = get_or_init_state().with_object(eventlog_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            let activities = log.get_activities(activity_key);
            let directly_follows_vec = log.get_directly_follows(activity_key);

            let mut dfg = DirectlyFollowsGraph::new();

            for activity in &activities {
                dfg.nodes.push(DFGNode {
                    id: activity.clone(),
                    label: activity.clone(),
                    frequency: 0,
                });
            }

            // Only include edges above frequency threshold
            for (from, to, freq) in &directly_follows_vec {
                if *freq >= min_frequency {
                    dfg.edges.push(DirectlyFollowsRelation {
                        from: from.clone(),
                        to: to.clone(),
                        frequency: *freq,
                    });
                }
            }

            // Remove nodes with no edges
            let nodes_with_edges: HashSet<String> = dfg
                .edges
                .iter()
                .flat_map(|e| vec![e.from.clone(), e.to.clone()])
                .collect();

            dfg.nodes.retain(|n| nodes_with_edges.contains(&n.id));

            Ok(dfg)
        }
        Some(_) => Err(crate::error::js_val("Not an EventLog")),
        None => Err(crate::error::js_val("EventLog not found")),
    })?;

    let handle = get_or_init_state()
        .store_object(StoredObject::DirectlyFollowsGraph(dfg.clone()))
        .map_err(|_e| crate::error::js_val("Failed to store DFG"))?;

    to_js_str(&json!({
        "handle": handle,
        "algorithm": "process_skeleton",
        "nodes": dfg.nodes.len(),
        "edges": dfg.edges.len(),
        "min_frequency": min_frequency,
    }))
}

/// Activity Dependency Analysis - identify predecessor/successor relationships
#[wasm_bindgen]
pub fn analyze_activity_dependencies(
    eventlog_handle: &str,
    activity_key: &str,
) -> Result<JsValue, JsValue> {
    get_or_init_state().with_object(eventlog_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            let mut predecessors: FxHashMap<String, HashSet<String>> = FxHashMap::default();
            let mut successors: FxHashMap<String, HashSet<String>> = FxHashMap::default();

            for trace in &log.traces {
                for (i, event) in trace.events.iter().enumerate() {
                    if let Some(AttributeValue::String(current)) =
                        event.attributes.get(activity_key)
                    {
                        // Get predecessors
                        if i > 0 {
                            if let Some(AttributeValue::String(prev)) =
                                trace.events[i - 1].attributes.get(activity_key)
                            {
                                predecessors
                                    .entry(current.clone())
                                    .or_default()
                                    .insert(prev.clone());
                            }
                        }

                        // Get successors
                        if i < trace.events.len() - 1 {
                            if let Some(AttributeValue::String(next)) =
                                trace.events[i + 1].attributes.get(activity_key)
                            {
                                successors
                                    .entry(current.clone())
                                    .or_default()
                                    .insert(next.clone());
                            }
                        }
                    }
                }
            }

            let result: Vec<_> = predecessors
                .keys()
                .map(|activity| {
                    json!({
                        "activity": activity,
                        "predecessors": predecessors.get(activity).map(|s| s.len()).unwrap_or(0),
                        "successors": successors.get(activity).map(|s| s.len()).unwrap_or(0),
                    })
                })
                .collect();

            to_js_str(&json!({
                "dependencies": result,
            }))
        }
        Some(_) => Err(crate::error::js_val("Not an EventLog")),
        None => Err(crate::error::js_val("EventLog not found")),
    })
}

/// Case Attribute Analysis - correlate case attributes with process behavior
#[wasm_bindgen]
pub fn analyze_case_attributes(
    eventlog_handle: &str,
    activity_key: &str,
) -> Result<JsValue, JsValue> {
    get_or_init_state().with_object(eventlog_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            let mut attribute_values: FxHashMap<String, HashSet<String>> = FxHashMap::default();
            let mut attribute_activity_map: FxHashMap<(String, String), Vec<String>> =
                FxHashMap::default();

            for trace in &log.traces {
                let activities: Vec<String> = trace
                    .events
                    .iter()
                    .filter_map(|e| {
                        if let Some(AttributeValue::String(act)) = e.attributes.get(activity_key) {
                            Some(act.clone())
                        } else {
                            None
                        }
                    })
                    .collect();

                for (key, value) in &trace.attributes {
                    if let AttributeValue::String(v) = value {
                        attribute_values
                            .entry(key.clone())
                            .or_default()
                            .insert(v.clone());

                        attribute_activity_map
                            .entry((key.clone(), v.clone()))
                            .or_default()
                            .extend(activities.clone());
                    }
                }
            }

            let result: Vec<_> = attribute_values
                .iter()
                .map(|(attr, values)| {
                    json!({
                        "attribute": attr,
                        "unique_values": values.len(),
                        "examples": values.iter().take(5).collect::<Vec<_>>()
                    })
                })
                .collect();

            to_js_str(&json!({
                "case_attributes": result,
            }))
        }
        Some(_) => Err(crate::error::js_val("Not an EventLog")),
        None => Err(crate::error::js_val("EventLog not found")),
    })
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
/// Fitness function: fraction of traces fully covered by the DFG edges.
/// Marked inline(always) so the compiler can specialise it at each call site
// Helper: Evaluate fitness of an edge set against columnar log (zero string allocation)
#[inline]
// Helper: Materialize a DirectlyFollowsGraph from edge set and vocabulary
fn edge_set_to_dfg(
    edge_set: &HashSet<(u32, u32)>,
    vocab: &[String],
    edge_freq: &FxHashMap<(u32, u32), f64>,
    node_freq: &FxHashMap<u32, usize>,
) -> DirectlyFollowsGraph {
    let mut dfg = DirectlyFollowsGraph::new();

    for (idx, activity) in vocab.iter().enumerate() {
        dfg.nodes.push(DFGNode {
            id: activity.clone(),
            label: activity.clone(),
            frequency: node_freq.get(&(idx as u32)).copied().unwrap_or(0),
        });
    }

    let mut sorted_edges: Vec<(u32, u32)> = edge_set.iter().copied().collect();
    sorted_edges.sort_unstable();

    for (from_id, to_id) in sorted_edges {
        let from_idx = from_id as usize;
        let to_idx = to_id as usize;
        if from_idx < vocab.len() && to_idx < vocab.len() {
            let freq = edge_freq.get(&(from_id, to_id)).copied().unwrap_or(1.0) as usize;
            dfg.edges.push(DirectlyFollowsRelation {
                from: vocab[from_idx].clone(),
                to: vocab[to_idx].clone(),
                frequency: freq,
            });
        }
    }

    dfg
}

#[wasm_bindgen]
pub fn more_discovery_info() -> String {
    json!({
        "status": "more_discovery_available",
        "algorithms": [
            {"name": "inductive_miner", "type": "structured", "speed": "fast"},
            {"name": "ant_colony", "type": "metaheuristic", "speed": "medium"},
            {"name": "simulated_annealing", "type": "thermal_search", "speed": "medium"},
            {"name": "process_skeleton", "type": "filtering", "speed": "very_fast"},
            {"name": "activity_dependencies", "type": "analytics", "speed": "fast"},
            {"name": "case_attributes", "type": "analytics", "speed": "fast"},
        ]
    })
    .to_string()
}
