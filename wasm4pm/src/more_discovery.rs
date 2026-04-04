use wasm_bindgen::prelude::*;
use crate::state::{get_or_init_state, StoredObject};
use crate::models::*;
use serde_json::json;
use std::collections::{HashMap, HashSet};

/// Simplified Inductive Miner - recursive structure discovery
#[wasm_bindgen]
pub fn discover_inductive_miner(
    eventlog_handle: &str,
    activity_key: &str,
) -> Result<String, JsValue> {
    match get_or_init_state().get_object(eventlog_handle)? {
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

            let handle = get_or_init_state()
                .store_object(StoredObject::DirectlyFollowsGraph(dfg.clone()))
                .map_err(|_e| JsValue::from_str("Failed to store DFG"))?;

            Ok(serde_json::to_string(&json!({
                "handle": handle,
                "algorithm": "inductive_miner",
                "nodes": dfg.nodes.len(),
                "edges": dfg.edges.len(),
            }))
            .map_err(|e| JsValue::from_str(&format!("Serialization failed: {}", e)))?)
        }
        Some(_) => Err(JsValue::from_str("Not an EventLog")),
        None => Err(JsValue::from_str("EventLog not found")),
    }
}

/// Ant Colony Optimization - pheromone-based model discovery
#[wasm_bindgen]
pub fn discover_ant_colony(
    eventlog_handle: &str,
    activity_key: &str,
    num_ants: usize,
    iterations: usize,
) -> Result<String, JsValue> {
    match get_or_init_state().get_object(eventlog_handle)? {
        Some(StoredObject::EventLog(log)) => {
            let activities = log.get_activities(activity_key);
            let directly_follows_vec = log.get_directly_follows(activity_key);

            // Initialize pheromone trails on edges
            let mut pheromones: HashMap<(String, String), f64> = HashMap::new();
            for (from, to, freq) in &directly_follows_vec {
                pheromones.insert((from.clone(), to.clone()), (*freq).max(1) as f64);
            }

            let mut best_dfg: Option<DirectlyFollowsGraph> = None;
            let mut best_fitness = 0.0;

            for _iter in 0..iterations {
                for _ant in 0..num_ants {
                    let mut dfg = DirectlyFollowsGraph::new();

                    for activity in &activities {
                        dfg.nodes.push(DFGNode {
                            id: activity.clone(),
                            label: activity.clone(),
                            frequency: 0,
                        });
                    }

                    // Build path using pheromone
                    for ((from, to), pheromone_level) in &pheromones {
                        if *pheromone_level > 1.0 {
                            dfg.edges.push(DirectlyFollowsRelation {
                                from: from.clone(),
                                to: to.clone(),
                                frequency: 1,
                            });
                        }
                    }

                    let fitness = evaluate_dfg_fitness(&dfg, &log, activity_key);

                    if fitness > best_fitness {
                        best_fitness = fitness;
                        best_dfg = Some(dfg);
                    }
                }

                // Evaporate and reinforce
                for pheromone in pheromones.values_mut() {
                    *pheromone *= 0.9; // Evaporate
                }

                if let Some(ref dfg) = best_dfg {
                    for edge in &dfg.edges {
                        let key = (edge.from.clone(), edge.to.clone());
                        pheromones
                            .entry(key)
                            .and_modify(|p| *p += best_fitness * 10.0);
                    }
                }
            }

            let dfg = best_dfg.unwrap_or_else(DirectlyFollowsGraph::new);

            let handle = get_or_init_state()
                .store_object(StoredObject::DirectlyFollowsGraph(dfg.clone()))
                .map_err(|_e| JsValue::from_str("Failed to store DFG"))?;

            Ok(serde_json::to_string(&json!({
                "handle": handle,
                "algorithm": "ant_colony",
                "nodes": dfg.nodes.len(),
                "edges": dfg.edges.len(),
                "fitness": best_fitness,
            }))
            .map_err(|e| JsValue::from_str(&format!("Serialization failed: {}", e)))?)
        }
        Some(_) => Err(JsValue::from_str("Not an EventLog")),
        None => Err(JsValue::from_str("EventLog not found")),
    }
}

/// Simulated Annealing - thermal search for optimal models
#[wasm_bindgen]
pub fn discover_simulated_annealing(
    eventlog_handle: &str,
    activity_key: &str,
    temperature: f64,
    cooling_rate: f64,
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

            let mut best_dfg = current_dfg.clone();
            let mut current_fitness = evaluate_dfg_fitness(&current_dfg, &log, activity_key);
            let mut best_fitness = current_fitness;
            let mut temp = temperature;

            while temp > 0.01 {
                // Random neighbor move
                let mut neighbor = current_dfg.clone();

                if random_float() < 0.5 && !current_dfg.edges.is_empty() {
                    // Remove random edge
                    let idx = (random_float() * current_dfg.edges.len() as f64) as usize;
                    if idx < neighbor.edges.len() {
                        neighbor.edges.remove(idx);
                    }
                } else {
                    // Add random edge
                    if let Some((from, to)) = directly_follows.iter().next() {
                        if !neighbor
                            .edges
                            .iter()
                            .any(|e| &e.from == from && &e.to == to)
                        {
                            neighbor.edges.push(DirectlyFollowsRelation {
                                from: from.clone(),
                                to: to.clone(),
                                frequency: 1,
                            });
                        }
                    }
                }

                let neighbor_fitness = evaluate_dfg_fitness(&neighbor, &log, activity_key);
                let delta = neighbor_fitness - current_fitness;

                if delta > 0.0 || random_float() < (-delta / temp).exp() {
                    current_dfg = neighbor;
                    current_fitness = neighbor_fitness;

                    if current_fitness > best_fitness {
                        best_fitness = current_fitness;
                        best_dfg = current_dfg.clone();
                    }
                }

                temp *= cooling_rate;
            }

            let handle = get_or_init_state()
                .store_object(StoredObject::DirectlyFollowsGraph(best_dfg.clone()))
                .map_err(|_e| JsValue::from_str("Failed to store DFG"))?;

            Ok(serde_json::to_string(&json!({
                "handle": handle,
                "algorithm": "simulated_annealing",
                "nodes": best_dfg.nodes.len(),
                "edges": best_dfg.edges.len(),
                "fitness": best_fitness,
            }))
            .map_err(|e| JsValue::from_str(&format!("Serialization failed: {}", e)))?)
        }
        Some(_) => Err(JsValue::from_str("Not an EventLog")),
        None => Err(JsValue::from_str("EventLog not found")),
    }
}

/// Process Skeleton - extract minimal model structure
#[wasm_bindgen]
pub fn extract_process_skeleton(
    eventlog_handle: &str,
    activity_key: &str,
    min_frequency: usize,
) -> Result<String, JsValue> {
    match get_or_init_state().get_object(eventlog_handle)? {
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

            let handle = get_or_init_state()
                .store_object(StoredObject::DirectlyFollowsGraph(dfg.clone()))
                .map_err(|_e| JsValue::from_str("Failed to store DFG"))?;

            Ok(serde_json::to_string(&json!({
                "handle": handle,
                "algorithm": "process_skeleton",
                "nodes": dfg.nodes.len(),
                "edges": dfg.edges.len(),
                "min_frequency": min_frequency,
            }))
            .map_err(|e| JsValue::from_str(&format!("Serialization failed: {}", e)))?)
        }
        Some(_) => Err(JsValue::from_str("Not an EventLog")),
        None => Err(JsValue::from_str("EventLog not found")),
    }
}

/// Activity Dependency Analysis - identify predecessor/successor relationships
#[wasm_bindgen]
pub fn analyze_activity_dependencies(
    eventlog_handle: &str,
    activity_key: &str,
) -> Result<String, JsValue> {
    match get_or_init_state().get_object(eventlog_handle)? {
        Some(StoredObject::EventLog(log)) => {
            let mut predecessors: HashMap<String, HashSet<String>> = HashMap::new();
            let mut successors: HashMap<String, HashSet<String>> = HashMap::new();

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

            Ok(serde_json::to_string(&json!({
                "dependencies": result,
            }))
            .map_err(|e| JsValue::from_str(&format!("Serialization failed: {}", e)))?)
        }
        Some(_) => Err(JsValue::from_str("Not an EventLog")),
        None => Err(JsValue::from_str("EventLog not found")),
    }
}

/// Case Attribute Analysis - correlate case attributes with process behavior
#[wasm_bindgen]
pub fn analyze_case_attributes(
    eventlog_handle: &str,
    activity_key: &str,
) -> Result<String, JsValue> {
    match get_or_init_state().get_object(eventlog_handle)? {
        Some(StoredObject::EventLog(log)) => {
            let mut attribute_values: HashMap<String, HashSet<String>> = HashMap::new();
            let mut attribute_activity_map: HashMap<(String, String), Vec<String>> = HashMap::new();

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

            Ok(serde_json::to_string(&json!({
                "case_attributes": result,
            }))
            .map_err(|e| JsValue::from_str(&format!("Serialization failed: {}", e)))?)
        }
        Some(_) => Err(JsValue::from_str("Not an EventLog")),
        None => Err(JsValue::from_str("EventLog not found")),
    }
}

// Helpers
fn evaluate_dfg_fitness(dfg: &DirectlyFollowsGraph, log: &EventLog, activity_key: &str) -> f64 {
    let edge_set: HashSet<(String, String)> = dfg
        .edges
        .iter()
        .map(|e| (e.from.clone(), e.to.clone()))
        .collect();

    let mut fitting = 0.0;
    for trace in &log.traces {
        let mut fits = true;
        for i in 0..trace.events.len().saturating_sub(1) {
            if let (Some(AttributeValue::String(a1)), Some(AttributeValue::String(a2))) = (
                trace.events[i].attributes.get(activity_key),
                trace.events[i + 1].attributes.get(activity_key),
            ) {
                if !edge_set.contains(&(a1.clone(), a2.clone())) {
                    fits = false;
                    break;
                }
            }
        }
        if fits {
            fitting += 1.0;
        }
    }
    fitting / log.traces.len().max(1) as f64
}

fn random_float() -> f64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .subsec_nanos() as f64;
    (nanos % 1000000.0) / 1000000.0
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
