use wasm_bindgen::prelude::*;
use crate::state::{get_or_init_state, StoredObject};
use crate::models::*;
use serde_json::json;
use std::collections::{HashMap, HashSet};
use crate::utilities::to_js;
use crate::error::{wasm_err, codes};

/// List all unique object types in an OCEL
#[wasm_bindgen]
pub fn list_ocel_object_types(ocel_handle: &str) -> Result<JsValue, JsValue> {
    get_or_init_state().with_object(ocel_handle, |obj| match obj {
        Some(StoredObject::OCEL(ocel)) => {
            let mut object_types: Vec<String> = ocel
                .objects
                .iter()
                .map(|obj| obj.object_type.clone())
                .collect();

            // Remove duplicates while preserving first occurrence order
            let mut seen = HashSet::new();
            object_types.retain(|t| seen.insert(t.clone()));

            to_js(&object_types)
        }
        Some(_) => Err(wasm_err(codes::INVALID_INPUT, "Object is not an OCEL")),
        None => Err(wasm_err(codes::INVALID_HANDLE, format!("OCEL '{}' not found", ocel_handle))),
    })
}

/// Get statistics about OCEL structure and content
#[wasm_bindgen]
pub fn get_ocel_type_statistics(ocel_handle: &str) -> Result<JsValue, JsValue> {
    get_or_init_state().with_object(ocel_handle, |obj| match obj {
        Some(StoredObject::OCEL(ocel)) => {
            // Collect unique event types
            let event_types: Vec<String> = {
                let mut types: HashSet<String> = HashSet::new();
                for event in &ocel.events {
                    types.insert(event.event_type.clone());
                }
                let mut types_vec: Vec<String> = types.into_iter().collect();
                types_vec.sort();
                types_vec
            };

            // Collect unique object types and compute stats
            let mut object_type_stats: HashMap<String, serde_json::Value> = HashMap::new();

            for obj_type in &ocel.object_types {
                let objects_of_type: Vec<&OCELObject> = ocel
                    .objects
                    .iter()
                    .filter(|o| &o.object_type == obj_type)
                    .collect();

                let count = objects_of_type.len();

                // Calculate average events per object of this type
                let mut total_events = 0;
                for obj in &objects_of_type {
                    let event_count = ocel
                        .events
                        .iter()
                        .filter(|e| e.all_object_ids().any(|oid| oid == obj.id))
                        .count();
                    total_events += event_count;
                }

                let avg_events = if count > 0 {
                    total_events as f64 / count as f64
                } else {
                    0.0
                };

                object_type_stats.insert(
                    obj_type.clone(),
                    json!({
                        "count": count,
                        "avg_events": avg_events
                    }),
                );
            }

            let stats = json!({
                "event_types": event_types,
                "object_types": &ocel.object_types,
                "event_count": ocel.events.len(),
                "object_type_stats": object_type_stats
            });

            to_js(&stats)
        }
        Some(_) => Err(wasm_err(codes::INVALID_INPUT, "Object is not an OCEL")),
        None => Err(wasm_err(codes::INVALID_HANDLE, format!("OCEL '{}' not found", ocel_handle))),
    })
}

/// Flatten an OCEL to an EventLog by projecting onto a single object type
///
/// For the given object_type:
/// - Each object of that type becomes a case (trace)
/// - Events referencing that object become the events in the trace
/// - Events are sorted by timestamp within each trace
/// - Stores the flattened EventLog in state and returns its handle
#[wasm_bindgen]
pub fn flatten_ocel_to_eventlog(ocel_handle: &str, object_type: &str) -> Result<String, JsValue> {
    // First, extract and clone the OCEL data out of the lock
    let ocel_clone = get_or_init_state().with_object(ocel_handle, |obj| match obj {
        Some(StoredObject::OCEL(ocel)) => Ok(ocel.clone()),
        Some(_) => Err(wasm_err(codes::INVALID_INPUT, "Object is not an OCEL")),
        None => Err(wasm_err(codes::INVALID_HANDLE, format!("OCEL '{}' not found", ocel_handle))),
    })?;

    // Now process outside the lock to avoid deadlock
    let ocel = &ocel_clone;

    // Get all objects of the target type
    let target_objects: Vec<&OCELObject> = ocel
        .objects
        .iter()
        .filter(|o| o.object_type == object_type)
        .collect();

    if target_objects.is_empty() {
        return Err(wasm_err(
            codes::INVALID_INPUT,
            format!("No objects found of type '{}'", object_type),
        ));
    }

    // Create the flattened EventLog
    let mut event_log = EventLog::new();

    // For each object of the target type, create a trace
    for obj in target_objects {
        // Collect all events that reference this object
        let mut events_for_obj: Vec<&OCELEvent> = ocel
            .events
            .iter()
            .filter(|e| e.all_object_ids().any(|oid| oid == obj.id))
            .collect();

        // Sort events by timestamp (ascending)
        events_for_obj.sort_by(|a, b| a.timestamp.cmp(&b.timestamp));

        // Create a trace with ID = object ID
        let mut trace = Trace {
            attributes: {
                let mut attrs = HashMap::new();
                // Add object ID and type as trace attributes
                attrs.insert(
                    "object_id".to_string(),
                    AttributeValue::String(obj.id.clone()),
                );
                attrs.insert(
                    "object_type".to_string(),
                    AttributeValue::String(obj.object_type.clone()),
                );
                // Also copy object attributes
                attrs.extend(obj.attributes.clone());
                attrs
            },
            events: Vec::new(),
        };

        // Add events to the trace
        for ocel_event in events_for_obj {
            let mut event_attrs = HashMap::new();

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

    // Store the flattened EventLog and return its handle (now outside the original lock)
    get_or_init_state().store_object(StoredObject::EventLog(event_log))
}
