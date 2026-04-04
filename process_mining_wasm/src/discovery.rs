use wasm_bindgen::prelude::*;
use crate::state::{get_or_init_state, StoredObject};
use crate::models::*;
use serde_json::json;
use std::collections::HashMap;

/// Discover a Directly-Follows Graph (DFG) from an EventLog
#[wasm_bindgen]
pub fn discover_dfg(
    eventlog_handle: &str,
    activity_key: &str,
) -> Result<String, JsValue> {
    match get_or_init_state().get_object(eventlog_handle)? {
        Some(StoredObject::EventLog(log)) => {
            let mut dfg = DirectlyFollowsGraph::new();

            // Get activities
            let activities = log.get_activities(activity_key);
            for activity in &activities {
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

            // Get directly-follows relations
            let relations = log.get_directly_follows(activity_key);
            for (from, to, freq) in relations {
                dfg.edges.push(DirectlyFollowsRelation {
                    from,
                    to,
                    frequency: freq,
                });
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

            serde_json::to_string(&dfg)
                .map_err(|e| JsValue::from_str(&format!("Failed to serialize DFG: {}", e)))
        }
        Some(_) => Err(JsValue::from_str("Object is not an EventLog")),
        None => Err(JsValue::from_str("EventLog not found")),
    }
}

/// Discover a Directly-Follows Graph (DFG) from an OCEL
#[wasm_bindgen]
pub fn discover_ocel_dfg(ocel_handle: &str) -> Result<String, JsValue> {
    match get_or_init_state().get_object(ocel_handle)? {
        Some(StoredObject::OCEL(ocel)) => {
            let mut dfg = DirectlyFollowsGraph::new();

            // Get event types
            for event_type in &ocel.event_types {
                dfg.nodes.push(DFGNode {
                    id: event_type.clone(),
                    label: event_type.clone(),
                    frequency: 0,
                });
            }

            // Count event type frequencies
            for event in &ocel.events {
                if let Some(node) = dfg
                    .nodes
                    .iter_mut()
                    .find(|n| &n.id == &event.event_type)
                {
                    node.frequency += 1;
                }
            }

            // Get directly-follows relations within same objects
            let mut events_by_object: HashMap<String, Vec<(usize, &str)>> = HashMap::new();
            for (idx, event) in ocel.events.iter().enumerate() {
                for obj_id in &event.object_ids {
                    events_by_object
                        .entry(obj_id.clone())
                        .or_insert_with(Vec::new)
                        .push((idx, event.event_type.as_str()));
                }
            }

            for events in events_by_object.values() {
                for i in 0..events.len() - 1 {
                    let from = events[i].1;
                    let to = events[i + 1].1;
                    let edge = dfg
                        .edges
                        .iter_mut()
                        .find(|e| e.from == from && e.to == to);
                    if let Some(edge) = edge {
                        edge.frequency += 1;
                    } else {
                        dfg.edges.push(DirectlyFollowsRelation {
                            from: from.to_string(),
                            to: to.to_string(),
                            frequency: 1,
                        });
                    }
                }
            }

            // Get start and end event types
            for obj_id in &ocel.object_types {
                if let Some(events) = events_by_object.get(obj_id) {
                    if !events.is_empty() {
                        let first_event_type = events[0].1;
                        *dfg.start_activities
                            .entry(first_event_type.to_string())
                            .or_insert(0) += 1;
                        let last_event_type = events[events.len() - 1].1;
                        *dfg.end_activities
                            .entry(last_event_type.to_string())
                            .or_insert(0) += 1;
                    }
                }
            }

            serde_json::to_string(&dfg)
                .map_err(|e| JsValue::from_str(&format!("Failed to serialize DFG: {}", e)))
        }
        Some(_) => Err(JsValue::from_str("Object is not an OCEL")),
        None => Err(JsValue::from_str("OCEL not found")),
    }
}

/// Discover DECLARE constraints from an EventLog
#[wasm_bindgen]
pub fn discover_declare(eventlog_handle: &str, activity_key: &str) -> Result<String, JsValue> {
    match get_or_init_state().get_object(eventlog_handle)? {
        Some(StoredObject::EventLog(log)) => {
            let mut model = DeclareModel::new();

            // Get unique activities
            model.activities = log.get_activities(activity_key);

            // Basic constraint discovery: Response(A, B) - whenever A occurs, eventually B must occur
            let total_cases = log.traces.len() as f64;

            for activity_a in &model.activities {
                for activity_b in &model.activities {
                    if activity_a != activity_b {
                        let mut supporting_cases = 0;

                        for trace in &log.traces {
                            let mut has_a = false;
                            let mut has_b_after_a = false;

                            for (i, event) in trace.events.iter().enumerate() {
                                if let Some(AttributeValue::String(act)) =
                                    event.attributes.get(activity_key)
                                {
                                    if act == activity_a {
                                        has_a = true;
                                    }
                                    if has_a && act == activity_b {
                                        has_b_after_a = true;
                                    }
                                }
                            }

                            if has_a && has_b_after_a {
                                supporting_cases += 1;
                            }
                        }

                        let support = supporting_cases as f64 / total_cases;
                        let confidence = if supporting_cases > 0 { 1.0 } else { 0.0 };

                        if support >= 0.1 && confidence >= 0.5 {
                            model.constraints.push(DeclareConstraint {
                                template: "Response".to_string(),
                                activities: vec![activity_a.clone(), activity_b.clone()],
                                support,
                                confidence,
                            });
                        }
                    }
                }
            }

            serde_json::to_string(&model)
                .map_err(|e| JsValue::from_str(&format!("Failed to serialize model: {}", e)))
        }
        Some(_) => Err(JsValue::from_str("Object is not an EventLog")),
        None => Err(JsValue::from_str("EventLog not found")),
    }
}

/// Get list of available discovery algorithms
#[wasm_bindgen]
pub fn available_discovery_algorithms() -> String {
    json!({
        "algorithms": [
            {
                "name": "dfg",
                "description": "Directly-Follows Graph discovery from EventLog",
                "input": "EventLog",
                "parameters": ["activity_key"],
                "status": "implemented"
            },
            {
                "name": "ocel_dfg",
                "description": "Object-Centric Directly-Follows Graph discovery",
                "input": "OCEL",
                "parameters": [],
                "status": "implemented"
            },
            {
                "name": "declare",
                "description": "DECLARE constraint discovery",
                "input": "EventLog",
                "parameters": ["activity_key"],
                "status": "implemented"
            },
            {
                "name": "alpha_plus_plus",
                "description": "Alpha++ algorithm for Petri net discovery",
                "input": "EventLog",
                "parameters": ["activity_key", "min_support"],
                "status": "planned"
            }
        ]
    })
    .to_string()
}

/// Get discovery module info
#[wasm_bindgen]
pub fn discovery_info() -> String {
    json!({
        "status": "discovery_module_operational",
        "implemented_algorithms": ["dfg", "ocel_dfg", "declare"],
        "note": "Core discovery algorithms implemented as WASM-native code"
    })
    .to_string()
}
