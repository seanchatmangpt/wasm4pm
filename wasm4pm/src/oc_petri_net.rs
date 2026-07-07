use crate::algorithms::discover_alpha_plus_plus;
use crate::error::{codes, wasm_err};
use crate::models::OCEL;
use crate::state::{get_or_init_state, StoredObject};
use crate::utilities::to_js;
use serde_json::json;
/// Object-Centric Petri Net Discovery (Phase 2A)
///
/// Discovers Object-Centric Petri Nets (OCPNs) from Object-Centric Event Logs.
/// For each object type, flattens the OCEL to a single-type EventLog and discovers
/// a Petri Net representing the lifecycle of objects of that type.
///
/// The resulting OCPN has:
/// - Per-type Petri Nets: one net per object type, representing object lifecycles
/// - Shared transitions: transitions may fire when events synchronize across multiple object types
/// - Places tagged by object type for lifecycle tracking
#[cfg(feature = "ocel")]
use wasm_bindgen::prelude::*;

/// Discover Object-Centric Petri Nets from OCEL
///
/// For each object type in the OCEL:
/// 1. Flatten OCEL to single-type EventLog
/// 2. Discover Petri Net using specified algorithm
/// 3. Tag places with object type
/// 4. Return per-type nets as JSON mapping
///
/// Returns: JSON { "Order": { places, transitions, ... }, "Item": { ... } }
#[cfg(feature = "ocel")]
#[wasm_bindgen]
pub fn discover_oc_petri_net(ocel_handle: &str, algorithm: &str) -> Result<JsValue, JsValue> {
    // Get OCEL from state
    let ocel = get_or_init_state().with_object(ocel_handle, |obj| match obj {
        Some(StoredObject::OCEL(ocel)) => Ok(ocel.clone()),
        Some(_) => Err(wasm_err(codes::INVALID_INPUT, "Object is not an OCEL")),
        None => Err(wasm_err(
            codes::INVALID_HANDLE,
            format!("OCEL '{}' not found", ocel_handle),
        )),
    })?;

    let mut result = serde_json::Map::new();

    // For each object type, flatten and discover Petri Net
    for obj_type in &ocel.object_types {
        // Flatten OCEL to EventLog for this object type
        let flattened_log = flatten_ocel_to_eventlog_for_type(&ocel, obj_type)?;

        // Store flattened log temporarily
        let temp_handle = get_or_init_state()
            .store_object(StoredObject::EventLog(flattened_log))
            .map_err(|_e| crate::error::js_val("Failed to store flattened EventLog"))?;

        // Discover Petri Net using specified algorithm
        // Note: discover_alpha_plus_plus returns Result<JsValue, JsValue> which is the Petri Net JSON
        let net_json_value = match algorithm {
            "alpha++" | "alpha-plus-plus" => {
                discover_alpha_plus_plus(&temp_handle, "concept:name", 0.5)?
            }
            "heuristic" => {
                // For now, fall back to Alpha++
                discover_alpha_plus_plus(&temp_handle, "concept:name", 0.5)?
            }
            _ => {
                return Err(crate::error::js_val(&format!(
                    "Unknown algorithm: {}",
                    algorithm
                )))
            }
        };

        // Convert JsValue to serde_json::Value
        let net_json = serde_wasm_bindgen::from_value::<serde_json::Value>(net_json_value)
            .map_err(|e| crate::error::js_val(&format!("Failed to parse Petri Net: {}", e)))?;

        // Add object_type annotation to places
        let mut annotated_net = net_json.clone();
        if let Some(obj) = annotated_net.as_object_mut() {
            if let Some(places) = obj.get_mut("places") {
                if let Some(places_arr) = places.as_array_mut() {
                    for place in places_arr {
                        if let Some(place_obj) = place.as_object_mut() {
                            place_obj.insert("object_type".to_string(), json!(obj_type));
                        }
                    }
                }
            }
        }

        // Store in result under object type
        result.insert(obj_type.clone(), annotated_net);
    }

    // OCPN essence annotations: shared transitions + variable arcs.
    let (shared_transitions, variable_arcs) = compute_ocpn_annotations(&ocel);
    result.insert("shared_transitions".to_string(), json!(shared_transitions));
    result.insert("variable_arcs".to_string(), json!(variable_arcs));

    // Return as JSON
    to_js(&result)
}

/// Compute the OCPN essence annotations from an OCEL:
///
/// * `shared_transitions` — activities that appear in ≥ 2 object types' nets
///   (i.e. their events touch objects of ≥ 2 types), with the sorted list of
///   those object types.
/// * `variable_arcs` — `(activity, object_type)` pairs where at least one
///   event of that activity touches more than one object of that type.
///
/// Pure (no wasm-bindgen) so it is unit-testable on native targets.
pub fn compute_ocpn_annotations(
    ocel: &OCEL,
) -> (Vec<serde_json::Value>, Vec<serde_json::Value>) {
    use std::collections::{BTreeMap, BTreeSet};

    let obj_to_type: BTreeMap<&str, &str> = ocel
        .objects
        .iter()
        .map(|o| (o.id.as_str(), o.object_type.as_str()))
        .collect();

    // activity → set of object types its events touch
    let mut activity_types: BTreeMap<&str, BTreeSet<&str>> = BTreeMap::new();
    // (activity, object_type) pairs with a >1-objects-of-that-type event
    let mut variable_pairs: BTreeSet<(&str, &str)> = BTreeSet::new();

    for event in &ocel.events {
        let mut per_type_count: BTreeMap<&str, usize> = BTreeMap::new();
        for obj_id in event.all_object_ids() {
            if let Some(&ot) = obj_to_type.get(obj_id) {
                *per_type_count.entry(ot).or_default() += 1;
                activity_types
                    .entry(event.event_type.as_str())
                    .or_default()
                    .insert(ot);
            }
        }
        for (ot, count) in per_type_count {
            if count > 1 {
                variable_pairs.insert((event.event_type.as_str(), ot));
            }
        }
    }

    let shared_transitions: Vec<serde_json::Value> = activity_types
        .iter()
        .filter(|(_, types)| types.len() >= 2)
        .map(|(activity, types)| {
            json!({
                "activity": activity,
                "object_types": types.iter().collect::<Vec<_>>(),
            })
        })
        .collect();

    let variable_arcs: Vec<serde_json::Value> = variable_pairs
        .iter()
        .map(|(activity, object_type)| {
            json!({
                "activity": activity,
                "object_type": object_type,
            })
        })
        .collect();

    (shared_transitions, variable_arcs)
}

/// Flatten OCEL to EventLog for a specific object type.
///
/// Public so that sibling OC modules (`oc_performance`, `oc_conformance`) can
/// reuse the same flattening logic.
pub fn flatten_ocel_to_eventlog_for_type(
    ocel: &OCEL,
    object_type: &str,
) -> Result<crate::models::EventLog, JsValue> {
    use crate::models::{AttributeValue, Event, EventLog, Trace};
    use std::collections::{BTreeMap, HashMap};

    // Get all objects of the target type
    let target_objects: Vec<_> = ocel
        .objects
        .iter()
        .filter(|o| o.object_type == object_type)
        .collect();

    if target_objects.is_empty() {
        return Err(crate::error::js_val(&format!(
            "No objects found of type '{}'",
            object_type
        )));
    }

    // Create the flattened EventLog
    let mut event_log = EventLog::new();

    // For each object of the target type, create a trace
    for obj in target_objects {
        // Collect all events that reference this object
        let mut events_for_obj: Vec<&crate::models::OCELEvent> = ocel
            .events
            .iter()
            .filter(|e| e.all_object_ids().any(|oid| oid == obj.id))
            .collect();

        // Sort events by timestamp
        events_for_obj.sort_by_key(|x| x.timestamp.clone());

        // Create a trace
        let mut trace = Trace {
            attributes: {
                let mut attrs = BTreeMap::new();
                attrs.insert(
                    "concept:name".to_string(),
                    AttributeValue::String(obj.id.clone()),
                );
                attrs.insert(
                    "object_id".to_string(),
                    AttributeValue::String(obj.id.clone()),
                );
                attrs.insert(
                    "object_type".to_string(),
                    AttributeValue::String(object_type.to_string()),
                );
                attrs.extend(obj.attributes.clone());
                attrs
            },
            events: Vec::new(),
        };

        // Add events to trace
        for ocel_event in events_for_obj {
            let mut event_attrs = BTreeMap::new();

            // Add event type as activity
            event_attrs.insert(
                "concept:name".to_string(),
                AttributeValue::String(ocel_event.event_type.clone()),
            );

            // Add timestamp
            event_attrs.insert(
                "time:timestamp".to_string(),
                AttributeValue::String(ocel_event.timestamp.clone()),
            );

            // Copy event attributes
            event_attrs.extend(ocel_event.attributes.clone());

            trace.events.push(Event {
                attributes: event_attrs,
            });
        }

        event_log.traces.push(trace);
    }

    Ok(event_log)
}

/// Get information about OC Petri Net discovery
#[wasm_bindgen]
pub fn oc_petri_net_info() -> JsValue {
    let info = json!({
        "module": "oc_petri_net",
        "description": "Object-Centric Petri Net discovery from OCEL",
        "algorithms": ["alpha++", "heuristic"],
        "functions": [
            {
                "name": "discover_oc_petri_net",
                "description": "Discover per-type Petri Nets from OCEL",
                "params": ["ocel_handle", "algorithm"],
                "returns": "JSON {object_type: {places, transitions, ...}}"
            },
            {
                "name": "oc_petri_net_info",
                "description": "Get information about this module",
                "params": [],
                "returns": "JSON info"
            }
        ]
    });

    to_js(&info).unwrap_or(JsValue::NULL)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{OCELEvent, OCELObject, OCEL};

    fn create_test_ocel() -> OCEL {
        OCEL {
            event_types: vec!["A".to_string(), "B".to_string()],
            object_types: vec!["Order".to_string()],
            events: vec![
                OCELEvent {
                    id: "e1".to_string(),
                    event_type: "A".to_string(),
                    timestamp: "2024-01-01T10:00:00Z".to_string(),
                    attributes: std::collections::BTreeMap::new(),
                    object_ids: vec!["order1".to_string()],
                    object_refs: vec![],
                },
                OCELEvent {
                    id: "e2".to_string(),
                    event_type: "B".to_string(),
                    timestamp: "2024-01-01T11:00:00Z".to_string(),
                    attributes: std::collections::BTreeMap::new(),
                    object_ids: vec!["order1".to_string()],
                    object_refs: vec![],
                },
            ],
            objects: vec![OCELObject {
                id: "order1".to_string(),
                object_type: "Order".to_string(),
                attributes: std::collections::BTreeMap::new(),
                changes: vec![],
                embedded_relations: vec![],
            }],
            object_relations: vec![],
        }
    }

    fn make_obj(id: &str, object_type: &str) -> OCELObject {
        OCELObject {
            id: id.to_string(),
            object_type: object_type.to_string(),
            attributes: std::collections::BTreeMap::new(),
            changes: vec![],
            embedded_relations: vec![],
        }
    }

    fn make_ev(id: &str, event_type: &str, ts: &str, obj_ids: &[&str]) -> OCELEvent {
        OCELEvent {
            id: id.to_string(),
            event_type: event_type.to_string(),
            timestamp: ts.to_string(),
            attributes: std::collections::BTreeMap::new(),
            object_ids: obj_ids.iter().map(|s| s.to_string()).collect(),
            object_refs: vec![],
        }
    }

    #[test]
    fn test_shared_transitions_and_variable_arcs() {
        // "ship" touches an order and two items in one event; "pack" touches
        // only one item.
        let ocel = OCEL {
            event_types: vec!["pack".to_string(), "ship".to_string()],
            object_types: vec!["item".to_string(), "order".to_string()],
            events: vec![
                make_ev("e1", "pack", "2024-01-01T09:00:00Z", &["item1"]),
                make_ev(
                    "e2",
                    "ship",
                    "2024-01-01T10:00:00Z",
                    &["order1", "item1", "item2"],
                ),
            ],
            objects: vec![
                make_obj("order1", "order"),
                make_obj("item1", "item"),
                make_obj("item2", "item"),
            ],
            object_relations: vec![],
        };

        let (shared, variable) = compute_ocpn_annotations(&ocel);

        // ship appears in both "order" and "item" nets → shared, sorted types.
        assert_eq!(shared.len(), 1);
        assert_eq!(shared[0]["activity"], "ship");
        assert_eq!(
            shared[0]["object_types"],
            serde_json::json!(["item", "order"])
        );

        // ship touches 2 items in one event → variable arc (ship, item) only.
        assert_eq!(variable.len(), 1);
        assert_eq!(variable[0]["activity"], "ship");
        assert_eq!(variable[0]["object_type"], "item");
    }

    #[test]
    fn test_no_shared_or_variable_for_single_type_single_object() {
        let ocel = create_test_ocel();
        let (shared, variable) = compute_ocpn_annotations(&ocel);
        assert!(shared.is_empty());
        assert!(variable.is_empty());
    }

    #[test]
    #[ignore = "discover_oc_petri_net uses JsValue which panics in test environment"]
    fn test_oc_petri_net_discovery() {
        let ocel = create_test_ocel();
        let handle = get_or_init_state()
            .store_object(StoredObject::OCEL(ocel))
            .expect("Failed to store OCEL");

        let result = discover_oc_petri_net(&handle, "alpha++");
        assert!(result.is_ok(), "Petri net discovery should succeed");
    }

    #[test]
    #[ignore = "discover_oc_petri_net uses JsValue which panics in test environment"]
    fn test_oc_petri_net_invalid_handle() {
        let result = discover_oc_petri_net("invalid", "alpha++");
        assert!(result.is_err(), "Should fail on invalid handle");
    }

    #[test]
    #[ignore = "serde_wasm_bindgen requires WASM context"]
    fn test_oc_petri_net_returns_json() {
        let ocel = create_test_ocel();
        let handle = get_or_init_state()
            .store_object(StoredObject::OCEL(ocel))
            .expect("Failed to store OCEL");

        let result = discover_oc_petri_net(&handle, "alpha++").expect("Discovery failed");
        let json = serde_wasm_bindgen::from_value::<serde_json::Value>(result)
            .expect("Should return valid JSON");
        assert!(json.is_object());
    }

    #[test]
    #[ignore = "discover_oc_petri_net uses JsValue which panics in test environment"]
    fn test_oc_petri_net_empty_ocel() {
        let ocel = OCEL {
            event_types: vec![],
            object_types: vec![],
            events: vec![],
            objects: vec![],
            object_relations: vec![],
        };

        let handle = get_or_init_state()
            .store_object(StoredObject::OCEL(ocel))
            .expect("Failed to store OCEL");

        let result = discover_oc_petri_net(&handle, "alpha++");
        // Should handle empty OCEL gracefully
        assert!(result.is_ok());
    }

    #[test]
    #[ignore = "discover_oc_petri_net uses JsValue which panics in test environment"]
    fn test_oc_petri_net_heuristic_algorithm() {
        let ocel = create_test_ocel();
        let handle = get_or_init_state()
            .store_object(StoredObject::OCEL(ocel))
            .expect("Failed to store OCEL");

        let result = discover_oc_petri_net(&handle, "heuristic");
        assert!(result.is_ok(), "Heuristic discovery should succeed");
    }
}
