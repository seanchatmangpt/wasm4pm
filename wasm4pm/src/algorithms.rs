use wasm_bindgen::prelude::*;
use crate::state::{get_or_init_state, StoredObject};
use crate::models::*;
use serde_json::json;
use std::collections::HashMap;

/// Discover Petri Net using Alpha++ algorithm
#[wasm_bindgen]
pub fn discover_alpha_plus_plus(
    eventlog_handle: &str,
    activity_key: &str,
    min_support: f64,
) -> Result<String, JsValue> {
    match get_or_init_state().get_object(eventlog_handle)? {
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
            for (from, to, freq) in relations {
                let threshold = (log.traces.len() as f64 * min_support) as usize;
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
                    if let Some(AttributeValue::String(last_act)) = trace.events[trace.events.len() - 1]
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

            // Store and return handle
            let handle = get_or_init_state()
                .store_object(StoredObject::PetriNet(pn.clone()))
                .map_err(|_e| JsValue::from_str("Failed to store PetriNet"))?;

            Ok(serde_json::to_string(&json!({
                "handle": handle,
                "places": pn.places.len(),
                "transitions": pn.transitions.len(),
                "arcs": pn.arcs.len(),
            }))
            .map_err(|e| JsValue::from_str(&format!("Serialization failed: {}", e)))?)
        }
        Some(_) => Err(JsValue::from_str("Object is not an EventLog")),
        None => Err(JsValue::from_str("EventLog not found")),
    }
}

/// Discover DFG with frequency filtering
#[wasm_bindgen]
pub fn discover_dfg_filtered(
    eventlog_handle: &str,
    activity_key: &str,
    min_frequency: usize,
) -> Result<String, JsValue> {
    match get_or_init_state().get_object(eventlog_handle)? {
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

            // Count activity frequencies
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

            // Get start and end activities
            for trace in &log.traces {
                if !trace.events.is_empty() {
                    if let Some(AttributeValue::String(activity)) =
                        trace.events[0].attributes.get(activity_key)
                    {
                        *dfg.start_activities.entry(activity.clone()).or_insert(0) += 1;
                    }
                    if let Some(AttributeValue::String(activity)) =
                        trace.events[trace.events.len() - 1]
                            .attributes
                            .get(activity_key)
                    {
                        *dfg.end_activities.entry(activity.clone()).or_insert(0) += 1;
                    }
                }
            }

            // Store and return handle
            let handle = get_or_init_state()
                .store_object(StoredObject::DirectlyFollowsGraph(dfg.clone()))
                .map_err(|_e| JsValue::from_str("Failed to store DFG"))?;

            Ok(serde_json::to_string(&json!({
                "handle": handle,
                "nodes": dfg.nodes.len(),
                "edges": dfg.edges.len(),
                "min_frequency_applied": min_frequency,
            }))
            .map_err(|e| JsValue::from_str(&format!("Serialization failed: {}", e)))?)
        }
        Some(_) => Err(JsValue::from_str("Object is not an EventLog")),
        None => Err(JsValue::from_str("EventLog not found")),
    }
}

/// Export DFG to JSON
#[wasm_bindgen]
pub fn export_dfg_to_json(handle: &str) -> Result<String, JsValue> {
    match get_or_init_state().get_object(handle)? {
        Some(StoredObject::DirectlyFollowsGraph(dfg)) => {
            serde_json::to_string(&dfg)
                .map_err(|e| JsValue::from_str(&format!("Serialization failed: {}", e)))
        }
        Some(_) => Err(JsValue::from_str("Object is not a DFG")),
        None => Err(JsValue::from_str("DFG not found")),
    }
}

/// Export PetriNet to JSON
#[wasm_bindgen]
pub fn export_petri_net_to_json(handle: &str) -> Result<String, JsValue> {
    match get_or_init_state().get_object(handle)? {
        Some(StoredObject::PetriNet(pn)) => {
            serde_json::to_string(&pn)
                .map_err(|e| JsValue::from_str(&format!("Serialization failed: {}", e)))
        }
        Some(_) => Err(JsValue::from_str("Object is not a PetriNet")),
        None => Err(JsValue::from_str("PetriNet not found")),
    }
}
