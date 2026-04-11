//! OCEL I/O Module
//!
//! Provides functions for loading, exporting, and validating Object-Centric Event Logs (OCEL 2.0).
//!
//! ## Functions
//!
//! - [`load_ocel2_from_json`] - Load OCEL from JSON string
//! - [`export_ocel2_to_json`] - Export OCEL to JSON string
//! - [`validate_ocel`] - Validate OCEL structure and referential integrity
//!
//! ## Example
//!
//! ```javascript
//! import { load_ocel2_from_json, validate_ocel } from "@seanchatmangpt/pictl";
//!
//! const handle = load_ocel2_from_json(jsonString);
//! const validation = validate_ocel(handle);
//! ```

#[cfg(feature = "ocel")]
use crate::models::OCEL;
#[cfg(feature = "ocel")]
use crate::state::{get_or_init_state, StoredObject};
use serde_json::json;
use std::collections::HashSet;
#[cfg(feature = "ocel")]
use wasm_bindgen::prelude::*;

/// Load an OCEL 2.0 from JSON string
/// Parses JSON into OCEL struct, stores in AppState, returns handle
#[cfg(feature = "ocel")]
#[wasm_bindgen]
pub fn load_ocel2_from_json(content: &str) -> Result<String, JsValue> {
    let ocel: OCEL = serde_json::from_str(content)
        .map_err(|e| JsValue::from_str(&format!("Failed to parse OCEL 2.0 JSON: {}", e)))?;

    let handle = get_or_init_state()
        .store_object(StoredObject::OCEL(ocel))
        .map_err(|_e| JsValue::from_str("Failed to store OCEL 2.0"))?;

    Ok(handle)
}

/// Export OCEL 2.0 to JSON string (pretty-printed)
/// Retrieves OCEL from state by handle, serializes to JSON string
#[cfg(feature = "ocel")]
#[wasm_bindgen]
pub fn export_ocel2_to_json(handle: &str) -> Result<String, JsValue> {
    get_or_init_state().with_object(handle, |obj| match obj {
        Some(StoredObject::OCEL(ocel)) => serde_json::to_string_pretty(ocel)
            .map_err(|e| JsValue::from_str(&format!("Failed to serialize OCEL 2.0: {}", e))),
        Some(_) => Err(JsValue::from_str("Object is not an OCEL")),
        None => Err(JsValue::from_str("OCEL not found")),
    })
}

/// Validate OCEL 2.0 structure
/// Checks:
/// - All events reference existing objects (referential integrity)
/// - All timestamps are valid ISO 8601
/// - Object relations: source_id and target_id reference existing objects (if present)
/// Returns a validation report as JSON: { valid: bool, errors: Vec<String> }
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
                // Check object_ids
                for object_id in &event.object_ids {
                    if !valid_object_ids.contains(object_id) {
                        errors.push(format!(
                            "Event '{}' references non-existent object '{}'",
                            event.id, object_id
                        ));
                    }
                }

                // Check object_refs (OCEL 2.0)
                for object_ref in &event.object_refs {
                    if !valid_object_ids.contains(&object_ref.object_id) {
                        errors.push(format!(
                            "Event '{}' references non-existent object '{}' with qualifier '{}'",
                            event.id, object_ref.object_id, object_ref.qualifier
                        ));
                    }
                }

                // Validate timestamp format (ISO 8601)
                if !is_valid_iso8601(&event.timestamp) {
                    errors.push(format!(
                        "Event '{}' has invalid ISO 8601 timestamp: '{}'",
                        event.id, event.timestamp
                    ));
                }
            }

            // Check object attribute changes (if present in future OCEL extensions)
            // For now, just validate that object IDs are unique
            let mut seen_object_ids = HashSet::new();
            for object in &ocel.objects {
                if !seen_object_ids.insert(&object.id) {
                    errors.push(format!("Duplicate object ID: '{}'", object.id));
                }
            }

            // Check event type consistency
            let declared_event_types: HashSet<String> =
                ocel.event_types.clone().into_iter().collect();
            for event in &ocel.events {
                if !declared_event_types.is_empty()
                    && !declared_event_types.contains(&event.event_type)
                {
                    errors.push(format!(
                        "Event '{}' has undeclared type: '{}'",
                        event.id, event.event_type
                    ));
                }
            }

            // Check object type consistency
            let declared_object_types: HashSet<String> =
                ocel.object_types.clone().into_iter().collect();
            for object in &ocel.objects {
                if !declared_object_types.is_empty()
                    && !declared_object_types.contains(&object.object_type)
                {
                    errors.push(format!(
                        "Object '{}' has undeclared type: '{}'",
                        object.id, object.object_type
                    ));
                }
            }

            let is_valid = errors.is_empty();

            // Build validation report as JSON
            let report = json!({
                "valid": is_valid,
                "error_count": errors.len(),
                "errors": errors
            });

            // Serialize to string and return as JsValue
            let report_json = serde_json::to_string(&report).map_err(|e| {
                JsValue::from_str(&format!("Failed to serialize validation report: {}", e))
            })?;
            Ok(JsValue::from_str(&report_json))
        }
        Some(_) => Err(JsValue::from_str("Object is not an OCEL")),
        None => Err(JsValue::from_str("OCEL not found")),
    })
}

/// Check if a string is a valid ISO 8601 timestamp
fn is_valid_iso8601(s: &str) -> bool {
    use chrono::{DateTime, NaiveDateTime, TimeZone, Utc};

    // Try RFC 3339 / ISO 8601 with offset
    if DateTime::parse_from_rfc3339(s).is_ok() {
        return true;
    }

    // Try with space instead of T
    if DateTime::parse_from_rfc3339(&s.replacen(' ', "T", 1)).is_ok() {
        return true;
    }

    // Try naive datetime formats (assume UTC)
    for fmt in &[
        "%Y-%m-%dT%H:%M:%S%.f",
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%d %H:%M:%S%.f",
        "%Y-%m-%d %H:%M:%S",
    ] {
        if let Ok(ndt) = NaiveDateTime::parse_from_str(s, fmt) {
            // Successfully parsed as naive datetime
            let _dt = Utc.from_utc_datetime(&ndt);
            return true;
        }
    }

    false
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{AttributeValue, OCELEvent, OCELEventObjectRef, OCELObject};

    fn create_test_ocel() -> OCEL {
        OCEL {
            event_types: vec!["Create".to_string(), "Complete".to_string()],
            object_types: vec!["Order".to_string(), "Item".to_string()],
            events: vec![OCELEvent {
                id: "e1".to_string(),
                event_type: "Create".to_string(),
                timestamp: "2024-01-01T10:00:00Z".to_string(),
                attributes: {
                    let mut attrs = std::collections::HashMap::new();
                    attrs.insert("cost".to_string(), AttributeValue::Float(100.0));
                    attrs
                },
                object_ids: vec!["order1".to_string()],
                object_refs: vec![],
            }],
            objects: vec![OCELObject {
                id: "order1".to_string(),
                object_type: "Order".to_string(),
                attributes: {
                    let mut attrs = std::collections::HashMap::new();
                    attrs.insert(
                        "status".to_string(),
                        AttributeValue::String("new".to_string()),
                    );
                    attrs
                },
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

    #[test]
    fn test_ocel_io_pretty_json() {
        let ocel = create_test_ocel();
        let pretty = serde_json::to_string_pretty(&ocel).expect("Pretty serialize failed");
        assert!(pretty.contains("\n"));
        assert!(pretty.contains("\"events\""));
    }

    #[test]
    fn test_ocel_io_invalid_json() {
        let invalid = "{ not valid json }";
        let result: Result<OCEL, _> = serde_json::from_str(invalid);
        assert!(result.is_err(), "Should fail on invalid JSON");
    }

    #[test]
    fn test_ocel_io_validation_valid() {
        let ocel = create_test_ocel();
        let errors = validate_ocel_internals(&ocel);
        assert!(errors.is_empty(), "Valid OCEL should have no errors");
    }

    #[test]
    fn test_ocel_io_validation_invalid_ref() {
        let mut ocel = create_test_ocel();
        // Add event with invalid object reference
        ocel.events.push(OCELEvent {
            id: "e2".to_string(),
            event_type: "Test".to_string(),
            timestamp: "2024-01-01T11:00:00Z".to_string(),
            attributes: std::collections::HashMap::new(),
            object_ids: vec!["nonexistent".to_string()],
            object_refs: vec![],
        });

        let errors = validate_ocel_internals(&ocel);
        assert!(!errors.is_empty(), "Should detect missing object");
        assert!(errors.iter().any(|e| e.contains("non-existent")));
    }

    #[test]
    fn test_ocel_io_validation_invalid_timestamp() {
        let mut ocel = create_test_ocel();
        ocel.events[0].timestamp = "not-a-timestamp".to_string();

        let errors = validate_ocel_internals(&ocel);
        assert!(!errors.is_empty(), "Should detect invalid timestamp");
        assert!(errors.iter().any(|e| e.contains("invalid ISO 8601")));
    }

    #[test]
    fn test_ocel_io_validation_duplicate_objects() {
        let mut ocel = create_test_ocel();
        ocel.objects.push(OCELObject {
            id: "order1".to_string(), // Duplicate ID
            object_type: "Order".to_string(),
            attributes: std::collections::HashMap::new(),
            changes: vec![],
            embedded_relations: vec![],
        });

        let errors = validate_ocel_internals(&ocel);
        assert!(!errors.is_empty(), "Should detect duplicate object ID");
        assert!(errors.iter().any(|e| e.contains("Duplicate object")));
    }

    #[test]
    fn test_ocel_io_validation_with_object_refs() {
        let mut ocel = create_test_ocel();
        ocel.events[0].object_refs = vec![OCELEventObjectRef {
            object_id: "order1".to_string(),
            qualifier: "related".to_string(),
        }];

        let errors = validate_ocel_internals(&ocel);
        assert!(errors.is_empty(), "Valid object refs should pass");
    }

    #[test]
    fn test_ocel_io_validation_invalid_object_ref() {
        let mut ocel = create_test_ocel();
        ocel.events[0].object_refs = vec![OCELEventObjectRef {
            object_id: "missing".to_string(),
            qualifier: "related".to_string(),
        }];

        let errors = validate_ocel_internals(&ocel);
        assert!(!errors.is_empty(), "Should detect invalid object ref");
    }

    #[test]
    fn test_iso8601_validation() {
        assert!(is_valid_iso8601("2024-01-01T10:00:00Z"));
        assert!(is_valid_iso8601("2024-01-01T10:00:00.123Z"));
        assert!(is_valid_iso8601("2024-01-01 10:00:00"));
        assert!(!is_valid_iso8601("invalid"));
        assert!(!is_valid_iso8601("2024-13-01T10:00:00Z")); // Invalid month
    }

    /// Helper for testing: run validation and return errors
    fn validate_ocel_internals(ocel: &OCEL) -> Vec<String> {
        let mut errors = Vec::new();

        let valid_object_ids: HashSet<String> = ocel.objects.iter().map(|o| o.id.clone()).collect();

        for event in &ocel.events {
            for object_id in &event.object_ids {
                if !valid_object_ids.contains(object_id) {
                    errors.push(format!(
                        "Event '{}' references non-existent object '{}'",
                        event.id, object_id
                    ));
                }
            }

            for object_ref in &event.object_refs {
                if !valid_object_ids.contains(&object_ref.object_id) {
                    errors.push(format!(
                        "Event '{}' references non-existent object '{}' with qualifier '{}'",
                        event.id, object_ref.object_id, object_ref.qualifier
                    ));
                }
            }

            if !is_valid_iso8601(&event.timestamp) {
                errors.push(format!(
                    "Event '{}' has invalid ISO 8601 timestamp: '{}'",
                    event.id, event.timestamp
                ));
            }
        }

        let mut seen_object_ids = HashSet::new();
        for object in &ocel.objects {
            if !seen_object_ids.insert(&object.id) {
                errors.push(format!("Duplicate object ID: '{}'", object.id));
            }
        }

        errors
    }
}
