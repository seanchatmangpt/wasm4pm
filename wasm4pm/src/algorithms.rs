use crate::error::{codes, wasm_err};
use crate::models::*;
use crate::state::{get_or_init_state, StoredObject};
use crate::utilities::to_js;
use rustc_hash::FxHashMap;
use serde_json::json;
use std::collections::HashMap;
use wasm_bindgen::prelude::*;

/// Discover Petri Net using Alpha++ algorithm
#[wasm_bindgen]
pub fn discover_alpha_plus_plus(
    eventlog_handle: &str,
    activity_key: &str,
    min_support: f64,
) -> Result<JsValue, JsValue> {
    // Compute inside closure (no store — avoids mutex re-entry), store outside.
    let pn = get_or_init_state().with_object(eventlog_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            // Simplified Alpha++ implementation
            let mut pn = PetriNet::new();
            let activities = log.get_activities(activity_key);

            // Create places for start and end
            pn.places.push(PetriNetPlace {
                id: "start".to_string(),
                label: "Start".to_string(),
                marking: Some(1),
            });
            pn.places.push(PetriNetPlace {
                id: "end".to_string(),
                label: "End".to_string(),
                marking: None,
            });
            pn.initial_marking.insert("start".to_string(), 1);
            pn.final_markings.push({
                let mut m = HashMap::new();
                m.insert("end".to_string(), 1);
                m
            });

            // Create transitions for activities
            for activity in &activities {
                pn.transitions.push(PetriNetTransition {
                    id: format!("t_{}", activity),
                    label: activity.clone(),
                    is_invisible: None,
                });

                // Create place for activity
                pn.places.push(PetriNetPlace {
                    id: format!("p_{}", activity),
                    label: format!("After {}", activity),
                    marking: None,
                });
            }

            // Add start arcs
            if !activities.is_empty() {
                for trace in &log.traces {
                    if !trace.events.is_empty() {
                        if let Some(AttributeValue::String(first_act)) =
                            trace.events[0].attributes.get(activity_key)
                        {
                            pn.arcs.push(PetriNetArc {
                                from: "start".to_string(),
                                to: format!("t_{}", first_act),
                                weight: Some(1),
                            });
                            break;
                        }
                    }
                }
            }

            // Add directly-follows arcs
            let relations = log.get_directly_follows(activity_key);
            let threshold = (log.traces.len() as f64 * min_support) as usize;
            for (from, to, freq) in relations {
                if freq >= threshold {
                    pn.arcs.push(PetriNetArc {
                        from: format!("p_{}", from),
                        to: format!("t_{}", to),
                        weight: Some(1),
                    });
                    pn.arcs.push(PetriNetArc {
                        from: format!("t_{}", to),
                        to: format!("p_{}", to),
                        weight: Some(1),
                    });
                }
            }

            // Add end arcs
            for trace in &log.traces {
                if !trace.events.is_empty() {
                    if let Some(AttributeValue::String(last_act)) = trace.events
                        [trace.events.len() - 1]
                        .attributes
                        .get(activity_key)
                    {
                        pn.arcs.push(PetriNetArc {
                            from: format!("p_{}", last_act),
                            to: "end".to_string(),
                            weight: Some(1),
                        });
                        break;
                    }
                }
            }

            Ok(pn)
        }
        Some(_) => Err(wasm_err(codes::INVALID_INPUT, "Object is not an EventLog")),
        None => Err(wasm_err(
            codes::INVALID_HANDLE,
            format!("EventLog '{}' not found", eventlog_handle),
        )),
    })?;

    let n_places = pn.places.len();
    let n_transitions = pn.transitions.len();
    let n_arcs = pn.arcs.len();
    let handle = get_or_init_state()
        .store_object(StoredObject::PetriNet(pn))
        .map_err(|_e| wasm_err(codes::INTERNAL_ERROR, "Failed to store PetriNet"))?;

    to_js(&json!({
        "handle": handle,
        "places": n_places,
        "transitions": n_transitions,
        "arcs": n_arcs,
    }))
}

/// Discover DFG with frequency filtering
#[wasm_bindgen]
pub fn discover_dfg_filtered(
    eventlog_handle: &str,
    activity_key: &str,
    min_frequency: usize,
) -> Result<JsValue, JsValue> {
    // Compute inside closure (no store — avoids mutex re-entry), store outside.
    let dfg = get_or_init_state().with_object(eventlog_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            let mut dfg = DirectlyFollowsGraph::new();

            // Get all activities
            let all_activities = log.get_activities(activity_key);
            for activity in &all_activities {
                dfg.nodes.push(DFGNode {
                    id: activity.clone(),
                    label: activity.clone(),
                    frequency: 0,
                });
            }

            // Build O(1) index: activity name → node position
            let node_index: FxHashMap<&str, usize> = all_activities
                .iter()
                .enumerate()
                .map(|(i, a)| (a.as_str(), i))
                .collect();

            // Count activity frequencies
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
            }

            // Get directly-follows relations with filtering
            let all_relations = log.get_directly_follows(activity_key);
            for (from, to, freq) in all_relations {
                if freq >= min_frequency {
                    dfg.edges.push(DirectlyFollowsRelation {
                        from,
                        to,
                        frequency: freq,
                    });
                }
            }

            // Get start and end activities using .first()/.last() — no index arithmetic
            for trace in &log.traces {
                if let Some(act) = trace
                    .events
                    .first()
                    .and_then(|e| e.attributes.get(activity_key))
                    .and_then(|v| v.as_string())
                {
                    *dfg.start_activities.entry(act.to_owned()).or_insert(0) += 1;
                }
                if let Some(act) = trace
                    .events
                    .last()
                    .and_then(|e| e.attributes.get(activity_key))
                    .and_then(|v| v.as_string())
                {
                    *dfg.end_activities.entry(act.to_owned()).or_insert(0) += 1;
                }
            }

            Ok(dfg)
        }
        Some(_) => Err(wasm_err(codes::INVALID_INPUT, "Object is not an EventLog")),
        None => Err(wasm_err(
            codes::INVALID_HANDLE,
            format!("EventLog '{}' not found", eventlog_handle),
        )),
    })?;

    let n_nodes = dfg.nodes.len();
    let n_edges = dfg.edges.len();
    let handle = get_or_init_state()
        .store_object(StoredObject::DirectlyFollowsGraph(dfg))
        .map_err(|_e| wasm_err(codes::INTERNAL_ERROR, "Failed to store DFG"))?;

    to_js(&json!({
        "handle": handle,
        "nodes": n_nodes,
        "edges": n_edges,
        "min_frequency_applied": min_frequency,
    }))
}

/// Export DFG to JSON
#[wasm_bindgen]
pub fn export_dfg_to_json(handle: &str) -> Result<String, JsValue> {
    get_or_init_state().with_object(handle, |obj| match obj {
        Some(StoredObject::DirectlyFollowsGraph(dfg)) => serde_json::to_string(dfg)
            .map_err(|e| JsValue::from_str(&format!("Serialization failed: {}", e))),
        Some(_) => Err(wasm_err(codes::INVALID_INPUT, "Object is not a DFG")),
        None => Err(wasm_err(
            codes::INVALID_HANDLE,
            format!("DFG '{}' not found", handle),
        )),
    })
}

/// Export PetriNet to JSON
#[wasm_bindgen]
pub fn export_petri_net_to_json(handle: &str) -> Result<String, JsValue> {
    get_or_init_state().with_object(handle, |obj| match obj {
        Some(StoredObject::PetriNet(pn)) => serde_json::to_string(pn)
            .map_err(|_e| wasm_err(codes::INTERNAL_ERROR, "Serialization failed")),
        Some(_) => Err(wasm_err(codes::INVALID_INPUT, "Object is not a PetriNet")),
        None => Err(wasm_err(
            codes::INVALID_HANDLE,
            format!("PetriNet '{}' not found", handle),
        )),
    })
}
