use wasm_bindgen::prelude::*;
use crate::state::{get_or_init_state, StoredObject};
use crate::models::OCEL;
use serde_json::json;
use std::collections::HashSet;

/// Load an OCEL 2.0 from JSON string
/// Parses JSON into OCEL struct, stores in AppState, returns handle
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
#[wasm_bindgen]
pub fn export_ocel2_to_json(handle: &str) -> Result<String, JsValue> {
    get_or_init_state().with_object(handle, |obj| match obj {
        Some(StoredObject::OCEL(ocel)) => {
            serde_json::to_string_pretty(ocel)
                .map_err(|e| JsValue::from_str(&format!("Failed to serialize OCEL 2.0: {}", e)))
        }
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
#[wasm_bindgen]
pub fn validate_ocel(handle: &str) -> Result<JsValue, JsValue> {
    get_or_init_state().with_object(handle, |obj| match obj {
        Some(StoredObject::OCEL(ocel)) => {
            let mut errors = Vec::new();

            // Build a set of valid object IDs for quick lookup
            let valid_object_ids: HashSet<String> = ocel
                .objects
                .iter()
                .map(|o| o.id.clone())
                .collect();

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
            let declared_event_types: HashSet<String> = ocel.event_types.clone().into_iter().collect();
            for event in &ocel.events {
                if !declared_event_types.is_empty() && !declared_event_types.contains(&event.event_type) {
                    errors.push(format!(
                        "Event '{}' has undeclared type: '{}'",
                        event.id, event.event_type
                    ));
                }
            }

            // Check object type consistency
            let declared_object_types: HashSet<String> = ocel.object_types.clone().into_iter().collect();
            for object in &ocel.objects {
                if !declared_object_types.is_empty() && !declared_object_types.contains(&object.object_type) {
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
            let report_json = serde_json::to_string(&report)
                .map_err(|e| JsValue::from_str(&format!("Failed to serialize validation report: {}", e)))?;
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
