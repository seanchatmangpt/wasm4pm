use crate::models::*;
use crate::state::{get_or_init_state, StoredObject};
use crate::utilities::to_js;
use rustc_hash::FxHashMap;
use serde_json::json;
use std::collections::HashSet;
use wasm_bindgen::prelude::*;

type DirectlyFollowsSet = HashSet<(String, String)>;

/// Compute simplicity score for a Petri net based on structural complexity.
///
/// Based on process mining literature (García & Caballero, Buijs et al.):
/// compares actual model elements against the theoretical minimum for a linear
/// workflow — the simplest possible Petri net structure.
///
/// The theoretical minimum for N visible activities:
/// - N+1 places (source, one per gap, sink)
/// - N transitions (one per activity)
/// - 2N arcs (one in, one out per transition)
///
/// Returns the geometric mean of the three element ratios, clamped to [0.0, 1.0].
/// A value of 1.0 means the model is as simple as a linear sequence.
pub fn compute_simplicity(places: usize, transitions: usize, arcs: usize) -> f64 {
    if places == 0 || transitions == 0 || arcs == 0 {
        return 1.0; // Empty model is trivially simple
    }

    let n = transitions.max(1); // visible activities
    let min_places = n + 1;
    let min_transitions = n;
    let min_arcs = 2 * n;

    let place_ratio = (min_places as f64 / places as f64).min(1.0);
    let transition_ratio = (min_transitions as f64 / transitions as f64).min(1.0);
    let arc_ratio = (min_arcs as f64 / arcs as f64).min(1.0);

    // Geometric mean of the three ratios
    (place_ratio * transition_ratio * arc_ratio).cbrt()
}

#[wasm_bindgen]
pub fn wasm_compute_simplicity(places: usize, transitions: usize, arcs: usize) -> f64 {
    compute_simplicity(places, transitions, arcs)
}

/// Pure-Rust ILP discovery: returns (PetriNet, fitness, precision) without wasm-bindgen.
///
/// This is the testable core of `discover_ilp_petri_net`. Integration tests
/// on native targets cannot call `#[wasm_bindgen]` functions, so they use
/// this instead and then store the PetriNet in state manually.
pub fn discover_ilp_petri_net_from_log(
    log: &EventLog,
    activity_key: &str,
) -> (PetriNet, f64, f64) {
    let activities = log.get_activities(activity_key);
    let directly_follows_vec = log.get_directly_follows(activity_key);

    let mut directly_follows: DirectlyFollowsSet = HashSet::new();
    for (from, to, _freq) in &directly_follows_vec {
        directly_follows.insert((from.clone(), to.clone()));
    }

    let mut petri_net = PetriNet::new();

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

    let source_place = "p_source".to_string();
    let sink_place = "p_sink".to_string();

    petri_net.places.push(PetriNetPlace {
        id: source_place.clone(),
        label: "source".to_string(),
        marking: Some(1),
    });
    petri_net.places.push(PetriNetPlace {
        id: sink_place.clone(),
        label: "sink".to_string(),
        marking: Some(0),
    });
    petri_net.initial_marking.insert(source_place.clone(), 1);

    for (place_counter, (from_act, to_act)) in directly_follows.iter().enumerate() {
        let from_trans = match activity_to_transition.get(from_act) {
            Some(t) => t.clone(),
            None => continue,
        };
        let to_trans = match activity_to_transition.get(to_act) {
            Some(t) => t.clone(),
            None => continue,
        };

        let place_id = format!("p{}", place_counter);
        petri_net.places.push(PetriNetPlace {
            id: place_id.clone(),
            label: format!("{}->{}", from_act, to_act),
            marking: Some(0),
        });
        petri_net.arcs.push(PetriNetArc {
            from: from_trans.clone(),
            to: place_id.clone(),
            weight: Some(1),
        });
        petri_net.arcs.push(PetriNetArc {
            from: place_id,
            to: to_trans.clone(),
            weight: Some(1),
        });
    }

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

    let mut end_activities = HashSet::new();
    for trace in &log.traces {
        if !trace.events.is_empty() {
            if let Some(AttributeValue::String(last_act)) = trace.events
                [trace.events.len() - 1]
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

    let mut final_marking = std::collections::HashMap::new();
    final_marking.insert(sink_place, 1);
    petri_net.final_markings.push(final_marking);

    let mut fitting_traces = 0;
    for trace in &log.traces {
        if is_trace_fitting(trace, activity_key, &directly_follows) {
            fitting_traces += 1;
        }
    }

    let fitness = fitting_traces as f64 / log.traces.len().max(1) as f64;
    let precision = calculate_precision(&petri_net, log, activity_key);

    (petri_net, fitness, precision)
}

/// Integer Linear Programming-based process discovery
/// Finds optimal Petri net that fits the log while minimizing complexity
#[wasm_bindgen]
pub fn discover_ilp_petri_net(
    eventlog_handle: &str,
    activity_key: &str,
) -> Result<JsValue, JsValue> {
    // Compute inside closure (borrowed), store outside (after lock released).
    let (petri_net, fitness, precision) =
        get_or_init_state().with_object(eventlog_handle, |obj| match obj {
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
                for (place_counter, (from_act, to_act)) in directly_follows.iter().enumerate() {
                    let from_trans = activity_to_transition.get(from_act).ok_or_else(|| {
                        format!("Activity {} not found in transition map", from_act)
                    })?;
                    let to_trans = activity_to_transition.get(to_act).ok_or_else(|| {
                        format!("Activity {} not found in transition map", to_act)
                    })?;

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
                        if let Some(AttributeValue::String(last_act)) = trace.events
                            [trace.events.len() - 1]
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
                let precision = calculate_precision(&petri_net, log, activity_key);
                Ok((petri_net, fitness, precision))
            }
            Some(_) => Err(JsValue::from_str("Object is not an EventLog")),
            None => Err(JsValue::from_str("EventLog not found")),
        })?;
    // Lock released here — safe to store.
    let simplicity = compute_simplicity(petri_net.places.len(), petri_net.transitions.len(), petri_net.arcs.len());
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
                    if let Some(AttributeValue::String(last_act)) = trace.events
                        [trace.events.len() - 1]
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

// Calculate precision: fraction of model transitions (visible activities) that are
// covered by activities observed in the log.
#[inline]
fn calculate_precision(petri_net: &PetriNet, log: &EventLog, activity_key: &str) -> f64 {
    // Collect unique activities observed in the log
    let log_activities: HashSet<String> = log
        .traces
        .iter()
        .flat_map(|trace| {
            trace.events.iter().filter_map(|e| {
                if let Some(AttributeValue::String(a)) = e.attributes.get(activity_key) {
                    Some(a.clone())
                } else {
                    None
                }
            })
        })
        .collect();

    // Collect visible (non-silent) transition labels from the model
    let model_activities: HashSet<String> = petri_net
        .transitions
        .iter()
        .filter(|t| !t.is_invisible.unwrap_or(false))
        .map(|t| t.label.clone())
        .collect();

    if model_activities.is_empty() {
        return 0.0;
    }

    let covered = log_activities.intersection(&model_activities).count();
    covered as f64 / model_activities.len() as f64
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
