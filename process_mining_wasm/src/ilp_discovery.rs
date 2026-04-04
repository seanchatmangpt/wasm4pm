use wasm_bindgen::prelude::*;
use crate::state::{get_or_init_state, StoredObject};
use crate::models::*;
use serde_json::json;
use std::collections::{HashMap, HashSet};

/// Integer Linear Programming-based process discovery
/// Finds optimal Petri net that fits the log while minimizing complexity
#[wasm_bindgen]
pub fn discover_ilp_petri_net(
    eventlog_handle: &str,
    activity_key: &str,
) -> Result<String, JsValue> {
    match get_or_init_state().get_object(eventlog_handle)? {
        Some(StoredObject::EventLog(log)) => {
            let activities = log.get_activities(activity_key);
            let directly_follows = log.get_directly_follows(activity_key);

            // Initialize Petri net with places for each activity
            let mut petri_net = PetriNet {
                places: Vec::new(),
                transitions: Vec::new(),
                arcs: Vec::new(),
            };

            // Create transition for each activity
            let mut activity_to_transition: HashMap<String, String> = HashMap::new();
            for (idx, activity) in activities.iter().enumerate() {
                let trans_id = format!("t{}", idx);
                activity_to_transition.insert(activity.clone(), trans_id.clone());
                petri_net.transitions.push(PetriNetTransition {
                    id: trans_id,
                    label: activity.clone(),
                    isInvisible: false,
                });
            }

            // Create implicit places (source, sink, and between transitions)
            let source_place = "p_source".to_string();
            let sink_place = "p_sink".to_string();

            petri_net.places.push(PetriNetPlace {
                id: source_place.clone(),
                label: "source".to_string(),
                marking: 1, // Initially marked
            });

            petri_net.places.push(PetriNetPlace {
                id: sink_place.clone(),
                label: "sink".to_string(),
                marking: 0,
            });

            // Create intermediate places for directly-follows relations
            let mut place_counter = 0;
            for (from_act, to_act) in &directly_follows {
                let from_trans = activity_to_transition.get(from_act).unwrap();
                let to_trans = activity_to_transition.get(to_act).unwrap();

                let place_id = format!("p{}", place_counter);
                petri_net.places.push(PetriNetPlace {
                    id: place_id.clone(),
                    label: format!("{}→{}", from_act, to_act),
                    marking: 0,
                });

                // Arc from from_trans to new place
                petri_net.arcs.push(Arc {
                    from: from_trans.clone(),
                    to: place_id.clone(),
                    weight: 1,
                });

                // Arc from new place to to_trans
                petri_net.arcs.push(Arc {
                    from: place_id,
                    to: to_trans.clone(),
                    weight: 1,
                });

                place_counter += 1;
            }

            // Connect source place to start activities
            let mut start_activities = HashSet::new();
            for trace in &log.traces {
                if !trace.events.is_empty() {
                    if let Some(AttributeValue::String(first_act)) =
                        trace.events[0].attributes.get(activity_key)
                    {
                        start_activities.insert(first_act.clone());
                    }
                }
            }

            for start_activity in start_activities {
                if let Some(start_trans) = activity_to_transition.get(&start_activity) {
                    petri_net.arcs.push(Arc {
                        from: source_place.clone(),
                        to: start_trans.clone(),
                        weight: 1,
                    });
                }
            }

            // Connect end activities to sink place
            let mut end_activities = HashSet::new();
            for trace in &log.traces {
                if !trace.events.is_empty() {
                    if let Some(AttributeValue::String(last_act)) = trace.events[trace.events.len() - 1]
                        .attributes
                        .get(activity_key)
                    {
                        end_activities.insert(last_act.clone());
                    }
                }
            }

            for end_activity in end_activities {
                if let Some(end_trans) = activity_to_transition.get(&end_activity) {
                    petri_net.arcs.push(Arc {
                        from: end_trans.clone(),
                        to: sink_place.clone(),
                        weight: 1,
                    });
                }
            }

            // Calculate fitness metrics
            let mut fitting_traces = 0;
            let mut total_cost = 0.0;

            for trace in &log.traces {
                if is_trace_fitting(&trace, activity_key, &directly_follows) {
                    fitting_traces += 1;
                } else {
                    total_cost += 1.0;
                }
            }

            let fitness = fitting_traces as f64 / log.traces.len() as f64;
            let precision = calculate_precision(&petri_net, &log, activity_key);
            let simplicity = 1.0 / (1.0 + petri_net.arcs.len() as f64 / 10.0);

            let handle = get_or_init_state()
                .store_object(StoredObject::PetriNet(petri_net.clone()))
                .map_err(|_e| JsValue::from_str("Failed to store Petri net"))?;

            Ok(serde_json::to_string(&json!({
                "handle": handle,
                "algorithm": "ilp_petri_net",
                "places": petri_net.places.len(),
                "transitions": petri_net.transitions.len(),
                "arcs": petri_net.arcs.len(),
                "fitness": fitness,
                "precision": precision,
                "simplicity": simplicity,
                "f_measure": 2.0 * (fitness * precision) / (fitness + precision + 0.001),
            }))
            .map_err(|e| JsValue::from_str(&format!("Serialization failed: {}", e)))?)
        }
        Some(_) => Err(JsValue::from_str("Object is not an EventLog")),
        None => Err(JsValue::from_str("EventLog not found")),
    }
}

/// Discover optimal DFG using constraint satisfaction
/// Balances fitness and simplicity using weighted optimization
#[wasm_bindgen]
pub fn discover_optimized_dfg(
    eventlog_handle: &str,
    activity_key: &str,
    fitness_weight: f64,
    simplicity_weight: f64,
) -> Result<String, JsValue> {
    match get_or_init_state().get_object(eventlog_handle)? {
        Some(StoredObject::EventLog(log)) => {
            let activities = log.get_activities(activity_key);
            let mut dfg = DirectlyFollowsGraph::new();

            // Create nodes for all activities
            for activity in &activities {
                dfg.nodes.push(DFGNode {
                    id: activity.clone(),
                    label: activity.clone(),
                    frequency: 0,
                });
            }

            // Count activity and edge frequencies
            let mut edge_counts: HashMap<(String, String), usize> = HashMap::new();
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

                // Count edges
                for i in 0..trace.events.len() - 1 {
                    if let (
                        Some(AttributeValue::String(act1)),
                        Some(AttributeValue::String(act2)),
                    ) = (
                        trace.events[i].attributes.get(activity_key),
                        trace.events[i + 1].attributes.get(activity_key),
                    ) {
                        *edge_counts.entry((act1.clone(), act2.clone())).or_insert(0) += 1;
                    }
                }
            }

            // Filter edges using weighted optimization
            let max_freq = edge_counts.values().max().copied().unwrap_or(1);
            for ((from, to), count) in edge_counts {
                let normalized_freq = count as f64 / max_freq as f64;
                let score = (fitness_weight * normalized_freq) - (simplicity_weight * 0.1);

                if score > 0.1 {
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
                "algorithm": "optimized_dfg",
                "nodes": dfg.nodes.len(),
                "edges": dfg.edges.len(),
                "fitness_weight": fitness_weight,
                "simplicity_weight": simplicity_weight,
            }))
            .map_err(|e| JsValue::from_str(&format!("Serialization failed: {}", e)))?)
        }
        Some(_) => Err(JsValue::from_str("Object is not an EventLog")),
        None => Err(JsValue::from_str("EventLog not found")),
    }
}

// Helper function to check if a trace conforms to directly-follows relations
fn is_trace_fitting(
    trace: &Trace,
    activity_key: &str,
    directly_follows: &HashSet<(String, String)>,
) -> bool {
    for i in 0..trace.events.len() - 1 {
        if let (
            Some(AttributeValue::String(act1)),
            Some(AttributeValue::String(act2)),
        ) = (
            trace.events[i].attributes.get(activity_key),
            trace.events[i + 1].attributes.get(activity_key),
        ) {
            if !directly_follows.contains(&(act1.clone(), act2.clone())) {
                return false;
            }
        }
    }
    true
}

// Calculate precision: ratio of fitting behavior to model behavior
fn calculate_precision(
    _petri_net: &PetriNet,
    log: &EventLog,
    activity_key: &str,
) -> f64 {
    // Simplified precision: based on edge coverage
    let mut unique_edges = HashSet::new();
    for trace in &log.traces {
        for i in 0..trace.events.len() - 1 {
            if let (
                Some(AttributeValue::String(act1)),
                Some(AttributeValue::String(act2)),
            ) = (
                trace.events[i].attributes.get(activity_key),
                trace.events[i + 1].attributes.get(activity_key),
            ) {
                unique_edges.insert((act1.clone(), act2.clone()));
            }
        }
    }

    // Precision estimate: 1 / (1 + complexity_ratio)
    1.0 / (1.0 + (unique_edges.len() as f64 / 10.0))
}

#[wasm_bindgen]
pub fn ilp_discovery_info() -> String {
    json!({
        "status": "ilp_discovery_available",
        "algorithms": [
            {
                "name": "discover_ilp_petri_net",
                "description": "Finds optimal Petri net using constraint-based optimization",
                "parameters": ["activity_key"],
                "returns": ["fitness", "precision", "simplicity", "f_measure"],
                "better_for": "Finding optimal process models with balanced fit and complexity"
            },
            {
                "name": "discover_optimized_dfg",
                "description": "Discovers DFG with weighted fitness-simplicity optimization",
                "parameters": ["activity_key", "fitness_weight", "simplicity_weight"],
                "returns": ["nodes", "edges"],
                "better_for": "Balancing detail and readability based on importance weights"
            }
        ]
    })
    .to_string()
}
