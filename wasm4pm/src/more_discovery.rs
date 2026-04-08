use crate::models::*;
use crate::state::{get_or_init_state, StoredObject};
use crate::utilities::{evaluate_edges_fitness, to_js};
use rustc_hash::FxHashMap;
use serde_json::json;
use std::collections::HashSet;
use wasm_bindgen::prelude::*;

/// Simplified Inductive Miner - recursive structure discovery
#[wasm_bindgen]
pub fn discover_inductive_miner(
    eventlog_handle: &str,
    activity_key: &str,
) -> Result<JsValue, JsValue> {
    let dfg = get_or_init_state().with_object(eventlog_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            let activities = log.get_activities(activity_key);
            let directly_follows = log.get_directly_follows(activity_key);

            let mut dfg = DirectlyFollowsGraph::new();

            // Add all activities as nodes
            for activity in &activities {
                dfg.nodes.push(DFGNode {
                    id: activity.clone(),
                    label: activity.clone(),
                    frequency: 0,
                });
            }

            // Add edges from directly-follows
            for (from, to, freq) in &directly_follows {
                dfg.edges.push(DirectlyFollowsRelation {
                    from: from.clone(),
                    to: to.clone(),
                    frequency: *freq,
                });
            }

            // Extract start/end
            for trace in &log.traces {
                if !trace.events.is_empty() {
                    if let Some(AttributeValue::String(first)) =
                        trace.events[0].attributes.get(activity_key)
                    {
                        *dfg.start_activities.entry(first.clone()).or_insert(0) += 1;
                    }
                    if let Some(AttributeValue::String(last)) = trace.events[trace.events.len() - 1]
                        .attributes
                        .get(activity_key)
                    {
                        *dfg.end_activities.entry(last.clone()).or_insert(0) += 1;
                    }
                }
            }

            Ok(dfg)
        }
        Some(_) => Err(JsValue::from_str("Not an EventLog")),
        None => Err(JsValue::from_str("EventLog not found")),
    })?;

    let handle = get_or_init_state()
        .store_object(StoredObject::DirectlyFollowsGraph(dfg.clone()))
        .map_err(|_e| JsValue::from_str("Failed to store DFG"))?;

    to_js(&json!({
        "handle": handle,
        "algorithm": "inductive_miner",
        "nodes": dfg.nodes.len(),
        "edges": dfg.edges.len(),
    }))
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
    let (best_edges, best_fitness, vocab) =
        get_or_init_state().with_object(eventlog_handle, |obj| match obj {
            Some(StoredObject::EventLog(log)) => {
                let col_owned = crate::cache::columnar_cache_get(eventlog_handle, activity_key)
                    .unwrap_or_else(|| {
                        let owned = log.to_columnar_owned(activity_key);
                        crate::cache::columnar_cache_insert(
                            eventlog_handle.to_string(),
                            activity_key.to_string(),
                            owned.clone(),
                        );
                        owned
                    });
                let col = ColumnarLog::from_owned(&col_owned);

                // Build edge vocabulary from columnar log
                let mut edge_vocab: Vec<(u32, u32)> = Vec::new();
                let mut edge_map: FxHashMap<(u32, u32), usize> = FxHashMap::default();

                for t in 0..col.trace_offsets.len().saturating_sub(1) {
                    let start = col.trace_offsets[t];
                    let end = col.trace_offsets[t + 1];
                    for i in start..end.saturating_sub(1) {
                        let edge = (col.events[i], col.events[i + 1]);
                        edge_map.entry(edge).and_modify(|_| {}).or_insert_with(|| {
                            edge_vocab.push(edge);
                            edge_vocab.len() - 1
                        });
                    }
                }

                // Collect vocab before closure ends
                let vocab: Vec<String> = col.vocab.iter().map(|s| s.to_string()).collect();

                // Initialize pheromone trails on integer edges
                let mut pheromones: FxHashMap<(u32, u32), f64> = FxHashMap::default();
                for &edge in &edge_vocab {
                    pheromones.insert(edge, 1.0);
                }

                let mut best_edges: Option<HashSet<(u32, u32)>> = None;
                let mut best_fitness = 0.0;

                for _iter in 0..iterations {
                    for _ant in 0..num_ants {
                        let mut current_edges: HashSet<(u32, u32)> = HashSet::new();

                        // Build path using pheromone.
                        // Pre-compute total pheromone once per ant; each edge is
                        // selected when its share exceeds a uniform sample.
                        // Rewriting p/total > rand() as p > rand() * total avoids
                        // the per-edge division in the hot loop.
                        let total_pheromone: f64 =
                            pheromones.values().sum::<f64>().max(f64::MIN_POSITIVE);
                        for (&edge, pheromone_level) in &pheromones {
                            if *pheromone_level > fastrand::f64() * total_pheromone {
                                current_edges.insert(edge);
                            }
                        }

                        let fitness = evaluate_edges_fitness(&current_edges, &col);

                        if fitness > best_fitness {
                            best_fitness = fitness;
                            best_edges = Some(current_edges);
                        }
                    }

                    // Evaporate: use for_each to help the compiler vectorise the loop.
                    pheromones.values_mut().for_each(|p| *p *= 0.9);

                    if let Some(ref edges) = best_edges {
                        for &edge in edges {
                            pheromones
                                .entry(edge)
                                .and_modify(|p| *p += best_fitness * 10.0);
                        }
                    }
                }

                let best_edges = best_edges.unwrap_or_default();
                Ok((best_edges, best_fitness, vocab))
            }
            Some(_) => Err(JsValue::from_str("Not an EventLog")),
            None => Err(JsValue::from_str("EventLog not found")),
        })?;

    // Materialize DFG from best edges
    let best_dfg = edge_set_to_dfg(&best_edges, &vocab);

    let handle = get_or_init_state()
        .store_object(StoredObject::DirectlyFollowsGraph(best_dfg.clone()))
        .map_err(|_e| JsValue::from_str("Failed to store DFG"))?;

    to_js(&json!({
        "handle": handle,
        "algorithm": "ant_colony",
        "nodes": best_dfg.nodes.len(),
        "edges": best_dfg.edges.len(),
        "fitness": best_fitness,
    }))
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
    let (best_edges, best_fitness, vocab) =
        get_or_init_state().with_object(eventlog_handle, |obj| match obj {
            Some(StoredObject::EventLog(log)) => {
                let col_owned = crate::cache::columnar_cache_get(eventlog_handle, activity_key)
                    .unwrap_or_else(|| {
                        let owned = log.to_columnar_owned(activity_key);
                        crate::cache::columnar_cache_insert(
                            eventlog_handle.to_string(),
                            activity_key.to_string(),
                            owned.clone(),
                        );
                        owned
                    });
                let col = ColumnarLog::from_owned(&col_owned);

                // Build edge vocabulary from columnar log
                let mut edge_vocab: Vec<(u32, u32)> = Vec::new();
                let mut edge_map: FxHashMap<(u32, u32), usize> = FxHashMap::default();

                for t in 0..col.trace_offsets.len().saturating_sub(1) {
                    let start = col.trace_offsets[t];
                    let end = col.trace_offsets[t + 1];
                    for i in start..end.saturating_sub(1) {
                        let edge = (col.events[i], col.events[i + 1]);
                        edge_map.entry(edge).and_modify(|_| {}).or_insert_with(|| {
                            edge_vocab.push(edge);
                            edge_vocab.len() - 1
                        });
                    }
                }

                // Collect vocab before closure ends
                let vocab: Vec<String> = col.vocab.iter().map(|s| s.to_string()).collect();

                // Start with empty edge set
                let mut current_edges: HashSet<(u32, u32)> = HashSet::new();
                let mut current_fitness = evaluate_edges_fitness(&current_edges, &col);
                let mut best_edges = current_edges.clone();
                let mut best_fitness = current_fitness;
                let mut temp = temperature;

                while temp > 0.01 {
                    // Random neighbor move: add or remove one edge
                    let mut neighbor = current_edges.clone();

                    if fastrand::f64() < 0.5 && !current_edges.is_empty() {
                        // Remove random edge
                        if let Some(&edge) = neighbor.iter().next() {
                            neighbor.remove(&edge);
                        }
                    } else {
                        // Add random edge from vocabulary
                        if !edge_vocab.is_empty() {
                            let idx = (fastrand::f64() * edge_vocab.len() as f64) as usize;
                            neighbor.insert(edge_vocab[idx]);
                        }
                    }

                    let neighbor_fitness = evaluate_edges_fitness(&neighbor, &col);
                    let delta = neighbor_fitness - current_fitness;

                    // Branchless acceptance criterion: improvements (delta >= 0) are
                    // always accepted; worse solutions are accepted with the Boltzmann
                    // probability exp(-delta/T).  Short-circuit evaluation means
                    // exp() is only called when delta < 0, so no change in semantics.
                    let accept = delta >= 0.0 || fastrand::f64() < (-delta / temp).exp();
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

                Ok((best_edges, best_fitness, vocab))
            }
            Some(_) => Err(JsValue::from_str("Not an EventLog")),
            None => Err(JsValue::from_str("EventLog not found")),
        })?;

    // Materialize DFG from best edges
    let best_dfg = edge_set_to_dfg(&best_edges, &vocab);

    let handle = get_or_init_state()
        .store_object(StoredObject::DirectlyFollowsGraph(best_dfg.clone()))
        .map_err(|_e| JsValue::from_str("Failed to store DFG"))?;

    to_js(&json!({
        "handle": handle,
        "algorithm": "simulated_annealing",
        "nodes": best_dfg.nodes.len(),
        "edges": best_dfg.edges.len(),
        "fitness": best_fitness,
    }))
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

            dfg.nodes = dfg
                .nodes
                .into_iter()
                .filter(|n| nodes_with_edges.contains(&n.id))
                .collect();

            Ok(dfg)
        }
        Some(_) => Err(JsValue::from_str("Not an EventLog")),
        None => Err(JsValue::from_str("EventLog not found")),
    })?;

    let handle = get_or_init_state()
        .store_object(StoredObject::DirectlyFollowsGraph(dfg.clone()))
        .map_err(|_e| JsValue::from_str("Failed to store DFG"))?;

    to_js(&json!({
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
                                    .or_insert_with(HashSet::new)
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
                                    .or_insert_with(HashSet::new)
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

            to_js(&json!({
                "dependencies": result,
            }))
        }
        Some(_) => Err(JsValue::from_str("Not an EventLog")),
        None => Err(JsValue::from_str("EventLog not found")),
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
                            .or_insert_with(HashSet::new)
                            .insert(v.clone());

                        attribute_activity_map
                            .entry((key.clone(), v.clone()))
                            .or_insert_with(Vec::new)
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

            to_js(&json!({
                "case_attributes": result,
            }))
        }
        Some(_) => Err(JsValue::from_str("Not an EventLog")),
        None => Err(JsValue::from_str("EventLog not found")),
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
fn edge_set_to_dfg(edge_set: &HashSet<(u32, u32)>, vocab: &[String]) -> DirectlyFollowsGraph {
    let mut dfg = DirectlyFollowsGraph::new();

    // Add all activities as nodes
    for activity in vocab.iter() {
        dfg.nodes.push(DFGNode {
            id: activity.clone(),
            label: activity.clone(),
            frequency: 1,
        });
    }

    // Add edges from edge set
    for &(from_id, to_id) in edge_set {
        let from_idx = from_id as usize;
        let to_idx = to_id as usize;

        // Only add edge if indices are valid
        if from_idx < vocab.len() && to_idx < vocab.len() {
            dfg.edges.push(DirectlyFollowsRelation {
                from: vocab[from_idx].clone(),
                to: vocab[to_idx].clone(),
                frequency: 1,
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
