use crate::error::{codes, wasm_err};
use crate::models::*;
use crate::state::{get_or_init_state, StoredObject};
use crate::utilities::to_js;
use serde_json::json;
use std::collections::{BTreeMap, HashMap, HashSet};
use wasm_bindgen::prelude::*;

/// List all unique object types in an OCEL
#[cfg(feature = "ocel")]
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
        None => Err(wasm_err(
            codes::INVALID_HANDLE,
            format!("OCEL '{}' not found", ocel_handle),
        )),
    })
}

/// Get statistics about OCEL structure and content
#[cfg(feature = "ocel")]
#[wasm_bindgen]
pub fn get_ocel_type_statistics(ocel_handle: &str) -> Result<JsValue, JsValue> {
    get_or_init_state().with_object(ocel_handle, |obj| match obj {
        Some(StoredObject::OCEL(ocel)) => {
            // Collect unique event types
            let event_types: Vec<String> = {
                let types: std::collections::BTreeSet<String> =
                    ocel.events.iter().map(|e| e.event_type.clone()).collect();
                types.into_iter().collect()
            };

            // Collect unique object types and compute stats
            let mut object_type_stats: BTreeMap<String, serde_json::Value> = BTreeMap::new();

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
        None => Err(wasm_err(
            codes::INVALID_HANDLE,
            format!("OCEL '{}' not found", ocel_handle),
        )),
    })
}

/// Flatten an OCEL to an EventLog by projecting onto a single object type
///
/// For the given object_type:
/// - Each object of that type becomes a case (trace)
/// - Events referencing that object become the events in the trace
/// - Events are sorted by timestamp within each trace
/// - Stores the flattened EventLog in state and returns its handle
#[cfg(feature = "ocel")]
#[wasm_bindgen]
pub fn flatten_ocel_to_eventlog(ocel_handle: &str, object_type: &str) -> Result<String, JsValue> {
    // First, extract and clone the OCEL data out of the lock
    let ocel_clone = get_or_init_state().with_object(ocel_handle, |obj| match obj {
        Some(StoredObject::OCEL(ocel)) => Ok(ocel.clone()),
        Some(_) => Err(wasm_err(codes::INVALID_INPUT, "Object is not an OCEL")),
        None => Err(wasm_err(
            codes::INVALID_HANDLE,
            format!("OCEL '{}' not found", ocel_handle),
        )),
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
                let mut attrs = BTreeMap::new();
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

    // Store the flattened EventLog and return its handle (now outside the original lock)
    get_or_init_state().store_object(StoredObject::EventLog(event_log))
}

/// Report describing information loss when flattening an OCEL to a case-centric event log.
#[derive(Debug)]
pub struct FlatteningLossReport {
    /// Events that are referenced by more than one object of `object_type`
    /// (each such event will appear duplicated in the flattened log).
    pub event_duplication_count: usize,
    /// Number of unique activity-name sequences across all objects of `object_type`
    /// when considering the OCEL event ordering.
    pub original_ocel_variant_count: usize,
    /// Number of unique activity-name sequences in the flattened log
    /// (after timestamp sort per case).
    pub flattened_variant_count: usize,
    /// Variants present in the flattened log that were not in the OCEL ordering.
    pub new_variants_introduced: usize,
    /// Total events across all cases in the flattened log.
    pub total_events_in_flattened_log: usize,
    /// Number of distinct OCEL event IDs that are referenced by at least one
    /// object of `object_type`.
    pub unique_ocel_events_referenced: usize,
}

/// Measures information loss when flattening an OCEL to a case-centric event log
/// by projecting onto a single object type.
///
/// Does **not** modify state — operates purely on the `OCEL` value.
#[cfg(feature = "ocel")]
pub fn measure_flattening_loss(ocel: &OCEL, object_type: &str) -> FlatteningLossReport {
    use std::collections::{HashMap as StdMap, HashSet};

    // Collect objects of the target type
    let target_objects: Vec<&OCELObject> = ocel
        .objects
        .iter()
        .filter(|o| o.object_type == object_type)
        .collect();

    // For each event, count how many target objects reference it
    let mut event_ref_count: StdMap<&str, usize> = StdMap::new();
    for event in &ocel.events {
        let refs = event
            .all_object_ids()
            .filter(|oid| target_objects.iter().any(|o| o.id == *oid))
            .count();
        if refs > 0 {
            *event_ref_count.entry(&event.id).or_default() += refs;
        }
    }

    let unique_ocel_events_referenced = event_ref_count.len();
    let event_duplication_count = event_ref_count.values().filter(|&&c| c > 1).count();

    // Build OCEL variants (arrival-index order, per target object)
    let mut ocel_variants: HashSet<Vec<String>> = HashSet::new();
    let mut flattened_variants: HashSet<Vec<String>> = HashSet::new();
    let mut total_events_in_flattened_log = 0usize;

    for obj in &target_objects {
        // Arrival-order sequence
        let ocel_seq: Vec<String> = ocel
            .events
            .iter()
            .filter(|e| e.all_object_ids().any(|oid| oid == obj.id))
            .map(|e| e.event_type.clone())
            .collect();

        // Timestamp-sorted sequence (mirrors what flatten_ocel_to_eventlog produces)
        let mut ts_sorted: Vec<(&OCELEvent, String)> = ocel
            .events
            .iter()
            .filter(|e| e.all_object_ids().any(|oid| oid == obj.id))
            .map(|e| (e, e.event_type.clone()))
            .collect();
        ts_sorted.sort_by(|(a, _), (b, _)| a.timestamp.cmp(&b.timestamp));
        let flat_seq: Vec<String> = ts_sorted.iter().map(|(_, et)| et.clone()).collect();

        total_events_in_flattened_log += flat_seq.len();
        ocel_variants.insert(ocel_seq);
        flattened_variants.insert(flat_seq);
    }

    let new_variants_introduced = flattened_variants
        .iter()
        .filter(|v| !ocel_variants.contains(*v))
        .count();

    FlatteningLossReport {
        event_duplication_count,
        original_ocel_variant_count: ocel_variants.len(),
        flattened_variant_count: flattened_variants.len(),
        new_variants_introduced,
        total_events_in_flattened_log,
        unique_ocel_events_referenced,
    }
}

/// Measure information loss when flattening an OCEL to a case-centric event log.
///
/// Returns a JSON object with a `flattening_loss` array — one entry per object type —
/// each containing the `FlatteningLossReport` fields plus a derived
/// `duplicate_event_ratio` (event_duplication_count / unique_ocel_events_referenced).
#[cfg(feature = "ocel")]
#[wasm_bindgen]
pub fn measure_ocel_flattening_loss(ocel_handle: &str) -> Result<JsValue, JsValue> {
    get_or_init_state().with_object(ocel_handle, |obj| match obj {
        Some(StoredObject::OCEL(ocel)) => {
            // Collect unique object types
            let mut seen = HashSet::new();
            let object_types: Vec<String> = ocel
                .objects
                .iter()
                .map(|o| o.object_type.clone())
                .filter(|t| seen.insert(t.clone()))
                .collect();

            let reports: Vec<serde_json::Value> = object_types
                .iter()
                .map(|ot| {
                    let r = measure_flattening_loss(ocel, ot);
                    let duplicate_ratio = if r.unique_ocel_events_referenced > 0 {
                        r.event_duplication_count as f64 / r.unique_ocel_events_referenced as f64
                    } else {
                        0.0
                    };
                    json!({
                        "object_type": ot,
                        "event_duplication_count": r.event_duplication_count,
                        "original_ocel_variant_count": r.original_ocel_variant_count,
                        "flattened_variant_count": r.flattened_variant_count,
                        "new_variants_introduced": r.new_variants_introduced,
                        "total_events_in_flattened_log": r.total_events_in_flattened_log,
                        "unique_ocel_events_referenced": r.unique_ocel_events_referenced,
                        "duplicate_event_ratio": duplicate_ratio,
                    })
                })
                .collect();

            to_js(&json!({ "flattening_loss": reports }))
        }
        Some(_) => Err(wasm_err(codes::INVALID_INPUT, "Object is not an OCEL")),
        None => Err(wasm_err(
            codes::INVALID_HANDLE,
            format!("OCEL '{}' not found", ocel_handle),
        )),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{AttributeValue, OCELEvent, OCELObject, OCEL};
    use std::collections::{BTreeMap, HashMap};

    fn create_multi_object_ocel() -> OCEL {
        OCEL {
            event_types: vec!["Create".to_string(), "Update".to_string()],
            object_types: vec!["Order".to_string(), "Item".to_string()],
            events: vec![
                OCELEvent {
                    id: "e1".to_string(),
                    event_type: "Create".to_string(),
                    timestamp: "2024-01-01T10:00:00Z".to_string(),
                    attributes: {
                        let mut attrs = BTreeMap::new();
                        attrs.insert(
                            "action".to_string(),
                            AttributeValue::String("create".to_string()),
                        );
                        attrs
                    },
                    object_ids: vec!["order1".to_string()],
                    object_refs: vec![],
                },
                OCELEvent {
                    id: "e2".to_string(),
                    event_type: "Update".to_string(),
                    timestamp: "2024-01-01T11:00:00Z".to_string(),
                    attributes: BTreeMap::new(),
                    object_ids: vec!["order1".to_string()],
                    object_refs: vec![],
                },
                OCELEvent {
                    id: "e3".to_string(),
                    event_type: "Create".to_string(),
                    timestamp: "2024-01-01T12:00:00Z".to_string(),
                    attributes: BTreeMap::new(),
                    object_ids: vec!["item1".to_string()],
                    object_refs: vec![],
                },
            ],
            objects: vec![
                OCELObject {
                    id: "order1".to_string(),
                    object_type: "Order".to_string(),
                    attributes: {
                        let mut attrs = BTreeMap::new();
                        attrs.insert("value".to_string(), AttributeValue::Float(100.0));
                        attrs
                    },
                    changes: vec![],
                    embedded_relations: vec![],
                },
                OCELObject {
                    id: "item1".to_string(),
                    object_type: "Item".to_string(),
                    attributes: BTreeMap::new(),
                    changes: vec![],
                    embedded_relations: vec![],
                },
            ],
            object_relations: vec![],
        }
    }

    #[test]
    #[ignore = "serde_wasm_bindgen requires WASM context"]
    fn test_list_object_types() {
        let ocel = create_multi_object_ocel();
        let handle = get_or_init_state()
            .store_object(StoredObject::OCEL(ocel))
            .expect("Failed to store OCEL");

        let result = list_ocel_object_types(&handle).expect("Failed to list types");
        let types: Vec<String> =
            serde_wasm_bindgen::from_value(result).expect("Failed to parse JSON");
        assert_eq!(types, vec!["Order", "Item"]);
    }

    #[test]
    #[ignore = "serde_wasm_bindgen requires WASM context"]
    fn test_list_object_types_empty() {
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

        let result = list_ocel_object_types(&handle).expect("Failed to list types");
        let types: Vec<String> =
            serde_wasm_bindgen::from_value(result).expect("Failed to parse JSON");
        assert!(types.is_empty());
    }

    #[test]
    #[ignore = "serde_wasm_bindgen requires WASM context"]
    fn test_get_ocel_statistics() {
        let ocel = create_multi_object_ocel();
        let handle = get_or_init_state()
            .store_object(StoredObject::OCEL(ocel))
            .expect("Failed to store OCEL");

        let result = get_ocel_type_statistics(&handle).expect("Failed to get stats");
        let stats: serde_json::Value =
            serde_wasm_bindgen::from_value(result).expect("Failed to parse JSON");

        assert_eq!(stats["event_count"], 3);
        assert!(stats["event_types"].is_array());
        assert!(stats["object_type_stats"].is_object());
    }

    #[test]
    fn test_flatten_ocel_single_type() {
        let ocel = create_multi_object_ocel();
        let handle = get_or_init_state()
            .store_object(StoredObject::OCEL(ocel))
            .expect("Failed to store OCEL");

        let log_handle = flatten_ocel_to_eventlog(&handle, "Order").expect("Failed to flatten");

        get_or_init_state()
            .with_object(&log_handle, |obj| match obj {
                Some(StoredObject::EventLog(log)) => {
                    assert_eq!(log.traces.len(), 1);
                    assert_eq!(log.traces[0].events.len(), 2);
                    Ok(())
                }
                _ => unreachable!("Expected EventLog"),
            })
            .expect("Failed to retrieve log");
    }

    #[test]
    fn test_flatten_ocel_preserves_timestamp_order() {
        let ocel = create_multi_object_ocel();
        let handle = get_or_init_state()
            .store_object(StoredObject::OCEL(ocel))
            .expect("Failed to store OCEL");

        let log_handle = flatten_ocel_to_eventlog(&handle, "Order").expect("Failed to flatten");

        get_or_init_state()
            .with_object(&log_handle, |obj| match obj {
                Some(StoredObject::EventLog(log)) => {
                    let trace = &log.traces[0];
                    assert!(matches!(
                        trace.events[0].attributes.get("concept:name"),
                        Some(AttributeValue::String(s)) if s == "Create"
                    ));
                    assert!(matches!(
                        trace.events[1].attributes.get("concept:name"),
                        Some(AttributeValue::String(s)) if s == "Update"
                    ));
                    Ok(())
                }
                _ => unreachable!("Expected EventLog"),
            })
            .expect("Failed to retrieve log");
    }

    #[test]
    #[ignore = "flatten_ocel_to_eventlog uses JsValue which panics in test environment"]
    fn test_flatten_ocel_invalid_type() {
        let ocel = create_multi_object_ocel();
        let handle = get_or_init_state()
            .store_object(StoredObject::OCEL(ocel))
            .expect("Failed to store OCEL");

        let result = flatten_ocel_to_eventlog(&handle, "NonExistent");
        assert!(result.is_err(), "Should error on non-existent object type");
    }

    #[test]
    fn test_flatten_ocel_preserves_attributes() {
        let ocel = create_multi_object_ocel();
        let handle = get_or_init_state()
            .store_object(StoredObject::OCEL(ocel))
            .expect("Failed to store OCEL");

        let log_handle = flatten_ocel_to_eventlog(&handle, "Order").expect("Failed to flatten");

        get_or_init_state()
            .with_object(&log_handle, |obj| match obj {
                Some(StoredObject::EventLog(log)) => {
                    let trace = &log.traces[0];
                    assert!(trace.attributes.contains_key("object_id"));
                    assert!(trace.attributes.contains_key("object_type"));
                    assert!(trace.attributes.contains_key("value"));
                    Ok(())
                }
                _ => unreachable!("Expected EventLog"),
            })
            .expect("Failed to retrieve log");
    }

    #[test]
    fn test_flatten_ocel_multiple_types() {
        let ocel = create_multi_object_ocel();
        let handle = get_or_init_state()
            .store_object(StoredObject::OCEL(ocel))
            .expect("Failed to store OCEL");

        let order_handle =
            flatten_ocel_to_eventlog(&handle, "Order").expect("Failed to flatten Order");
        let item_handle =
            flatten_ocel_to_eventlog(&handle, "Item").expect("Failed to flatten Item");

        get_or_init_state()
            .with_object(&order_handle, |obj| match obj {
                Some(StoredObject::EventLog(log)) => {
                    assert_eq!(log.traces.len(), 1);
                    assert_eq!(log.traces[0].events.len(), 2);
                    Ok(())
                }
                _ => unreachable!("Expected EventLog"),
            })
            .expect("Failed to retrieve order log");

        get_or_init_state()
            .with_object(&item_handle, |obj| match obj {
                Some(StoredObject::EventLog(log)) => {
                    assert_eq!(log.traces.len(), 1);
                    assert_eq!(log.traces[0].events.len(), 1);
                    Ok(())
                }
                _ => unreachable!("Expected EventLog"),
            })
            .expect("Failed to retrieve item log");
    }
}
