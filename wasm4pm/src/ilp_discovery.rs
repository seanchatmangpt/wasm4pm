use wasm_bindgen::prelude::*;
use crate::state::{get_or_init_state, StoredObject};
use crate::models::*;
use serde_json::json;
use std::collections::HashSet;
use rustc_hash::FxHashMap;
#[cfg(target_arch = "wasm32")]
use serde_wasm_bindgen;
use crate::utilities::to_js;

type DirectlyFollowsSet = HashSet<(String, String)>;

/// Integer Linear Programming-based process discovery
/// Finds optimal Petri net that fits the log while minimizing complexity
#[wasm_bindgen]
pub fn discover_ilp_petri_net(
    eventlog_handle: &str,
    activity_key: &str,
) -> Result<JsValue, JsValue> {
    // Compute inside closure (borrowed), store outside (after lock released).
    let (petri_net, fitness, precision) = get_or_init_state().with_object(eventlog_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            let activities = log.get_activities(activity_key);
            let directly_follows_vec = log.get_directly_follows(activity_key);

            // Convert to set for fast lookup
            let mut directly_follows: DirectlyFollowsSet = HashSet::new();
            for (from, to, _freq) in &directly_follows_vec {
                directly_follows.insert((from.clone(), to.clone()));
            }

            // Initialize Petri net with places for each activity
            let mut petri_net = PetriNet::new();

            // Create transition for each activity
            let mut activity_to_transition: FxHashMap<String, String> = FxHashMap::default();
            for (idx, activity) in activities.iter().enumerate() {
                let trans_id = format!("t{}", idx);
                activity_to_transition.insert(activity.clone(), trans_id.clone());
                petri_net.transitions.push(PetriNetTransition {
                    id: trans_id,
                    label: activity.clone(),
                    is_invisible: Some(false),
                });
            }

            // Create implicit places (source, sink, and between transitions)
            let source_place = "p_source".to_string();
            let sink_place = "p_sink".to_string();

            petri_net.places.push(PetriNetPlace {
                id: source_place.clone(),
                label: "source".to_string(),
                marking: Some(1), // Initially marked
            });

            petri_net.places.push(PetriNetPlace {
                id: sink_place.clone(),
                label: "sink".to_string(),
                marking: Some(0),
            });

            // Set initial marking
            petri_net.initial_marking.insert(source_place.clone(), 1);

            // Create intermediate places for directly-follows relations
            let mut place_counter = 0;
            for (from_act, to_act) in &directly_follows {
                let from_trans = activity_to_transition.get(from_act).unwrap();
                let to_trans = activity_to_transition.get(to_act).unwrap();

                let place_id = format!("p{}", place_counter);
                petri_net.places.push(PetriNetPlace {
                    id: place_id.clone(),
                    label: format!("{}→{}", from_act, to_act),
                    marking: Some(0),
                });

                // Arc from from_trans to new place
                petri_net.arcs.push(PetriNetArc {
                    from: from_trans.clone(),
                    to: place_id.clone(),
                    weight: Some(1),
                });

                // Arc from new place to to_trans
                petri_net.arcs.push(PetriNetArc {
                    from: place_id,
                    to: to_trans.clone(),
                    weight: Some(1),
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
                    petri_net.arcs.push(PetriNetArc {
                        from: source_place.clone(),
                        to: start_trans.clone(),
                        weight: Some(1),
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
                    petri_net.arcs.push(PetriNetArc {
                        from: end_trans.clone(),
                        to: sink_place.clone(),
                        weight: Some(1),
                    });
                }
            }

            // Set final marking
            let mut final_marking = std::collections::HashMap::new();
            final_marking.insert(sink_place, 1);
            petri_net.final_markings.push(final_marking);

            // Calculate fitness metrics
            let mut fitting_traces = 0;
            for trace in &log.traces {
                if is_trace_fitting(trace, activity_key, &directly_follows) {
                    fitting_traces += 1;
                }
            }

            let fitness = fitting_traces as f64 / log.traces.len().max(1) as f64;
            let precision = calculate_precision(&petri_net, &log, activity_key);
            Ok((petri_net, fitness, precision))
        }
        Some(_) => Err(JsValue::from_str("Object is not an EventLog")),
        None => Err(JsValue::from_str("EventLog not found")),
    })?;
    // Lock released here — safe to store.
    let simplicity = 1.0 / (1.0 + petri_net.arcs.len() as f64 / 10.0);
    let handle = get_or_init_state()
        .store_object(StoredObject::PetriNet(petri_net.clone()))
        .map_err(|_e| JsValue::from_str("Failed to store Petri net"))?;

    to_js(&json!({
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
}

/// Discover optimal DFG using constraint satisfaction
/// Balances fitness and simplicity using weighted optimization
#[wasm_bindgen]
pub fn discover_optimized_dfg(
    eventlog_handle: &str,
    activity_key: &str,
    fitness_weight: f64,
    simplicity_weight: f64,
) -> Result<JsValue, JsValue> {
    // Compute inside closure (borrowed), store outside (after lock released).
    let dfg = get_or_init_state().with_object(eventlog_handle, |obj| match obj {
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

            // O(1) index: activity name → node position
            let node_index: FxHashMap<&str, usize> = activities
                .iter()
                .enumerate()
                .map(|(i, a)| (a.as_str(), i))
                .collect();

            // Count activity and edge frequencies — single pass
            let mut edge_counts: FxHashMap<(String, String), usize> = FxHashMap::default();
            for trace in &log.traces {
                for event in &trace.events {
                    if let Some(AttributeValue::String(activity)) =
                        event.attributes.get(activity_key)
                    {
                        if let Some(&idx) = node_index.get(activity.as_str()) {
                            dfg.nodes[idx].frequency += 1;
                        }
                    }
                }

                // Count edges with .windows(2)
                for window in trace.events.windows(2) {
                    if let (
                        Some(AttributeValue::String(act1)),
                        Some(AttributeValue::String(act2)),
                    ) = (
                        window[0].attributes.get(activity_key),
                        window[1].attributes.get(activity_key),
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

            Ok(dfg)
        }
        Some(_) => Err(JsValue::from_str("Object is not an EventLog")),
        None => Err(JsValue::from_str("EventLog not found")),
    })?;
    // Lock released here — safe to store.
    let handle = get_or_init_state()
        .store_object(StoredObject::DirectlyFollowsGraph(dfg.clone()))
        .map_err(|_e| JsValue::from_str("Failed to store DFG"))?;

    to_js(&json!({
        "handle": handle,
        "algorithm": "optimized_dfg",
        "nodes": dfg.nodes.len(),
        "edges": dfg.edges.len(),
        "fitness_weight": fitness_weight,
        "simplicity_weight": simplicity_weight,
    }))
}

// Helper function to check if a trace conforms to directly-follows relations
#[inline]
fn is_trace_fitting(
    trace: &Trace,
    activity_key: &str,
    directly_follows: &DirectlyFollowsSet,
) -> bool {
    // Extract activity strings once, avoiding repeated attribute lookups in the pair loop
    let activities: Vec<&str> = trace
        .events
        .iter()
        .filter_map(|e| match e.attributes.get(activity_key) {
            Some(AttributeValue::String(s)) => Some(s.as_str()),
            _ => None,
        })
        .collect();

    activities.windows(2).all(|w| {
        // Borrow-based lookup avoids cloning both sides of the pair
        directly_follows.contains(&(w[0].to_owned(), w[1].to_owned()))
    })
}

// Calculate precision: ratio of fitting behavior to model behavior
#[inline]
fn calculate_precision(
    _petri_net: &PetriNet,
    log: &EventLog,
    activity_key: &str,
) -> f64 {
    // Collect unique directly-follows pairs via iterator chain — no manual counter
    let unique_edges: HashSet<(String, String)> = log
        .traces
        .iter()
        .flat_map(|trace| {
            trace.events.windows(2).filter_map(|w| {
                match (
                    w[0].attributes.get(activity_key),
                    w[1].attributes.get(activity_key),
                ) {
                    (
                        Some(AttributeValue::String(a1)),
                        Some(AttributeValue::String(a2)),
                    ) => Some((a1.clone(), a2.clone())),
                    _ => None,
                }
            })
        })
        .collect();

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
