//! OCEL I/O Module
//!
//! Provides functions for loading, exporting, and validating Object-Centric Event Logs (OCEL 2.0).

#[cfg(feature = "ocel")]
use crate::models::{
    parse_robust_timestamp, OCELAttributeValue, OCELEvent, OCELObject, OCELObjectAttributeChange,
    OCELRelationship, OCEL,
};
#[cfg(feature = "ocel")]
use crate::state::{get_or_init_state, StoredObject};
use serde_json::json;
use std::collections::HashSet;
#[cfg(feature = "ocel")]
use wasm_bindgen::prelude::*;

/// Load an OCEL 2.0 from JSON string
#[cfg(feature = "ocel")]
#[wasm_bindgen]
pub fn load_ocel2_from_json(content: &str) -> Result<String, JsValue> {
    let mut ocel: OCEL = serde_json::from_str(content)
        .map_err(|e| crate::error::js_val(&format!("Failed to parse OCEL 2.0 JSON: {}", e)))?;

    ocel.normalize_relations();

    let handle = get_or_init_state()
        .store_object(StoredObject::OCEL(ocel))
        .map_err(|_e| crate::error::js_val("Failed to store OCEL 2.0"))?;

    Ok(handle)
}

/// Export OCEL 2.0 to JSON string (pretty-printed)
#[cfg(feature = "ocel")]
#[wasm_bindgen]
pub fn export_ocel2_to_json(handle: &str) -> Result<String, JsValue> {
    get_or_init_state().with_object(handle, |obj| match obj {
        Some(StoredObject::OCEL(ocel)) => serde_json::to_string_pretty(ocel)
            .map_err(|e| crate::error::js_val(&format!("Failed to serialize OCEL 2.0: {}", e))),
        Some(_) => Err(crate::error::js_val("Object is not an OCEL")),
        None => Err(crate::error::js_val("OCEL not found")),
    })
}

/// Validate OCEL 2.0 structure
#[cfg(feature = "ocel")]
#[wasm_bindgen]
pub fn validate_ocel(handle: &str) -> Result<JsValue, JsValue> {
    get_or_init_state().with_object(handle, |obj| match obj {
        Some(StoredObject::OCEL(ocel)) => {
            let mut errors = Vec::new();

            // Build a set of valid object IDs for quick lookup
            let valid_object_ids: HashSet<String> =
                ocel.objects.iter().map(|o| o.id.clone()).collect();

            // Check event-object references
            for event in &ocel.events {
                for rel in &event.relationships {
                    if !valid_object_ids.contains(&rel.object_id) {
                        errors.push(format!(
                            "Event '{}' references non-existent object '{}' with qualifier '{}'",
                            event.id, rel.object_id, rel.qualifier
                        ));
                    }
                }

                // Validate timestamp format
                if parse_robust_timestamp(&event.timestamp).is_none() {
                    errors.push(format!(
                        "Event '{}' has invalid timestamp: '{}'",
                        event.id, event.timestamp
                    ));
                }
            }

            // Check for duplicate object IDs and embedded relations
            let mut seen_object_ids = HashSet::new();
            for object in &ocel.objects {
                if !seen_object_ids.insert(&object.id) {
                    errors.push(format!("Duplicate object ID: '{}'", object.id));
                }
                
                for rel in &object.embedded_relations {
                    if !valid_object_ids.contains(&rel.object_id) {
                        errors.push(format!(
                            "Object '{}' references non-existent object '{}' with qualifier '{}'",
                            object.id, rel.object_id, rel.qualifier
                        ));
                    }
                }
            }

            let is_valid = errors.is_empty();

            // Build validation report as JSON
            let report = json!({
                "valid": is_valid,
                "error_count": errors.len(),
                "errors": errors
            });

            Ok(crate::error::js_val(&report.to_string()))
        }
        Some(_) => Err(crate::error::js_val("Object is not an OCEL")),
        None => Err(crate::error::js_val("OCEL not found")),
    })
}

/// Violation where event B appears later in the log for a given object but has an earlier timestamp.
#[derive(Debug)]
pub struct LifecycleViolation {
    pub object_id: String,
    pub event_a_id: String,
    pub event_b_id: String,
    pub timestamp_a_ms: i64,
    pub timestamp_b_ms: i64,
}

/// Checks that each object's events are in non-decreasing timestamp order.
#[cfg(feature = "ocel")]
pub fn validate_ocel_object_lifecycles(ocel: &OCEL) -> Vec<LifecycleViolation> {
    use std::collections::HashMap as StdMap;
    use crate::models::parse_timestamp_ms;

    // Build object_id → Vec<(arrival_index, event_id, timestamp_ms)>
    let mut object_events: StdMap<String, Vec<(usize, String, i64)>> = StdMap::new();
    for (idx, event) in ocel.events.iter().enumerate() {
        let ts_ms = parse_timestamp_ms(&event.timestamp).unwrap_or(i64::MIN);
        for oid in event.all_object_ids() {
            object_events
                .entry(oid.to_string())
                .or_default()
                .push((idx, event.id.clone(), ts_ms));
        }
    }

    // For each object, sort by arrival index and check consecutive timestamp order
    let mut violations = Vec::new();
    for (object_id, mut events) in object_events {
        events.sort_by_key(|(idx, _, _)| *idx);
        for pair in events.windows(2) {
            let (_, ref id_a, ts_a) = pair[0];
            let (_, ref id_b, ts_b) = pair[1];
            if ts_b < ts_a {
                violations.push(LifecycleViolation {
                    object_id: object_id.clone(),
                    event_a_id: id_a.clone(),
                    event_b_id: id_b.clone(),
                    timestamp_a_ms: ts_a,
                    timestamp_b_ms: ts_b,
                });
            }
        }
    }
    violations
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{OCELAttributeValue};

    fn create_test_ocel() -> OCEL {
        OCEL {
            event_types: vec!["Create".to_string()],
            object_types: vec!["Order".to_string()],
            events: vec![OCELEvent {
                id: "e1".to_string(),
                event_type: "Create".to_string(),
                timestamp: "2024-01-01T10:00:00Z".to_string(),
                attributes: {
                    let mut attrs = std::collections::HashMap::new();
                    attrs.insert("cost".to_string(), OCELAttributeValue::Float(100.0));
                    attrs
                },
                object_ids: vec!["order1".to_string()],
                relationships: vec![],
            }],
            objects: vec![OCELObject {
                id: "order1".to_string(),
                object_type: "Order".to_string(),
                attributes: std::collections::HashMap::new(),
                changes: vec![],
                embedded_relations: vec![],
            }],
            object_relations: vec![],
        }
    }

    #[test]
    fn test_ocel_io_roundtrip_json() {
        let ocel = create_test_ocel();
        let json_str = serde_json::to_string(&ocel).expect("Serialize failed");
        let parsed: OCEL = serde_json::from_str(&json_str).expect("Deserialize failed");
        assert_eq!(parsed.events.len(), 1);
        assert_eq!(parsed.objects.len(), 1);
    }
}
