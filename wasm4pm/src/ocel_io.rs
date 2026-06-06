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
//! import { load_ocel2_from_json, validate_ocel } from "wasm4pm";
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
        .map_err(|e| crate::error::js_val(&format!("Failed to parse OCEL 2.0 JSON: {}", e)))?;

    let handle = get_or_init_state()
        .store_object(StoredObject::OCEL(ocel))
        .map_err(|_e| crate::error::js_val("Failed to store OCEL 2.0"))?;

    Ok(handle)
}

/// Export OCEL 2.0 to JSON string (pretty-printed)
/// Retrieves OCEL from state by handle, serializes to JSON string
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

#[cfg(feature = "ocel")]
fn validate_ocel_core(ocel: &OCEL) -> Vec<String> {
    let mut errors = Vec::new();

    // Build a set of valid object IDs for quick lookup
    let valid_object_ids: HashSet<String> = ocel.objects.iter().map(|o| o.id.clone()).collect();

    // 1. Event Referential Integrity
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

    // 2. Object Relations Referential Integrity
    for rel in &ocel.object_relations {
        if !valid_object_ids.contains(&rel.source_id) {
            errors.push(format!(
                "Object relation references non-existent source object '{}' with qualifier '{}'",
                rel.source_id, rel.qualifier
            ));
        }
        if !valid_object_ids.contains(&rel.target_id) {
            errors.push(format!(
                "Object relation references non-existent target object '{}' with qualifier '{}'",
                rel.target_id, rel.qualifier
            ));
        }
    }
    for obj in &ocel.objects {
        for rel in &obj.embedded_relations {
            if !valid_object_ids.contains(&rel.object_id) {
                errors.push(format!(
                    "Object '{}' embedded relation references non-existent object '{}' with qualifier '{}'",
                    obj.id, rel.object_id, rel.qualifier
                ));
            }
        }
    }

    // 3. Unique Object IDs
    let mut seen_object_ids = HashSet::new();
    for object in &ocel.objects {
        if !seen_object_ids.insert(&object.id) {
            errors.push(format!("Duplicate object ID: '{}'", object.id));
        }
    }

    // 4. Declared Types Consistency
    let declared_event_types: HashSet<String> = ocel.event_types.clone().into_iter().collect();
    for event in &ocel.events {
        if !declared_event_types.is_empty() && !declared_event_types.contains(&event.event_type) {
            errors.push(format!(
                "Event '{}' has undeclared type: '{}'",
                event.id, event.event_type
            ));
        }
    }

    let declared_object_types: HashSet<String> = ocel.object_types.clone().into_iter().collect();
    for object in &ocel.objects {
        if !declared_object_types.is_empty() && !declared_object_types.contains(&object.object_type)
        {
            errors.push(format!(
                "Object '{}' has undeclared type: '{}'",
                object.id, object.object_type
            ));
        }
    }

    // 5. Monotonicity (Timeline conformance)
    let violations = validate_ocel_object_lifecycles(ocel);
    for v in violations {
        let ts_a_str = ocel
            .events
            .iter()
            .find(|e| e.id == v.event_a_id)
            .map(|e| e.timestamp.as_str())
            .unwrap_or("");
        let ts_b_str = ocel
            .events
            .iter()
            .find(|e| e.id == v.event_b_id)
            .map(|e| e.timestamp.as_str())
            .unwrap_or("");
        errors.push(format!(
            "Monotonicity violation for object '{}': event '{}' at '{}' ({} ms) is followed by event '{}' with earlier timestamp '{}' ({} ms)",
            v.object_id, v.event_a_id, ts_a_str, v.timestamp_a_ms,
            v.event_b_id, ts_b_str, v.timestamp_b_ms
        ));
    }

    errors
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
            let errors = validate_ocel_core(ocel);
            let is_valid = errors.is_empty();

            let report = json!({
                "valid": is_valid,
                "error_count": errors.len(),
                "errors": errors
            });

            let report_json = serde_json::to_string(&report).map_err(|e| {
                crate::error::js_val(&format!("Failed to serialize validation report: {}", e))
            })?;
            Ok(crate::error::js_val(&report_json))
        }
        Some(_) => Err(crate::error::js_val("Object is not an OCEL")),
        None => Err(crate::error::js_val("OCEL not found")),
    })
}

#[cfg(feature = "ocel")]
#[derive(Debug, serde::Deserialize, Clone)]
#[serde(tag = "step_type")]
pub enum TraversalStep {
    ObjectToEvent {
        event_type: String,
        qualifier: String,
    },
    EventToObject {
        object_type: String,
        qualifier: String,
    },
    ObjectToObject {
        object_type: String,
        qualifier: String,
        #[serde(default = "default_direction")]
        direction: String, // "forward", "reverse", or "both"
    },
}

#[cfg(feature = "ocel")]
fn default_direction() -> String {
    "forward".to_string()
}

#[cfg(feature = "ocel")]
#[derive(Debug, serde::Deserialize, Clone)]
pub struct ProvenanceQuery {
    pub start_object_id: Option<String>,
    pub start_object_type: String,
    pub steps: Vec<TraversalStep>,
}

#[cfg(feature = "ocel")]
#[derive(Debug, serde::Serialize, serde::Deserialize, Clone)]
#[serde(tag = "type")]
pub enum PathNode {
    #[serde(rename = "object")]
    Object { id: String, object_type: String },
    #[serde(rename = "event")]
    Event { id: String, event_type: String },
}

#[cfg(feature = "ocel")]
#[derive(Debug, serde::Serialize, serde::Deserialize, Clone)]
pub struct ProvenanceQueryResult {
    pub paths: Vec<Vec<PathNode>>,
}

#[cfg(feature = "ocel")]
#[wasm_bindgen]
pub fn query_provenance_traversal(ocel_handle: &str, query_json: &str) -> Result<String, JsValue> {
    get_or_init_state().with_object(ocel_handle, |obj| match obj {
        Some(StoredObject::OCEL(ocel)) => {
            let query: ProvenanceQuery = serde_json::from_str(query_json)
                .map_err(|e| crate::error::js_val(&format!("Failed to parse query JSON: {}", e)))?;

            // 1. Collect start nodes
            let mut initial_objects = Vec::new();
            if let Some(ref start_id) = query.start_object_id {
                if let Some(o) = ocel.objects.iter().find(|obj| &obj.id == start_id) {
                    if o.object_type == query.start_object_type {
                        initial_objects.push(o);
                    } else {
                        return Err(crate::error::js_val(&format!(
                            "Start object '{}' type mismatch: expected '{}', got '{}'",
                            start_id, query.start_object_type, o.object_type
                        )));
                    }
                } else {
                    return Err(crate::error::js_val(&format!(
                        "Start object '{}' not found",
                        start_id
                    )));
                }
            } else {
                for o in &ocel.objects {
                    if o.object_type == query.start_object_type {
                        initial_objects.push(o);
                    }
                }
            }

            let mut active_paths: Vec<Vec<PathNode>> = initial_objects
                .into_iter()
                .map(|o| {
                    vec![PathNode::Object {
                        id: o.id.clone(),
                        object_type: o.object_type.clone(),
                    }]
                })
                .collect();

            // 2. Fetch O2O relations locally (global + embedded) to avoid mutability issues
            let mut all_relations = ocel.object_relations.clone();
            for object in &ocel.objects {
                for embedded in &object.embedded_relations {
                    all_relations.push(crate::models::OCELObjectRelation {
                        source_id: object.id.clone(),
                        target_id: embedded.object_id.clone(),
                        qualifier: embedded.qualifier.clone(),
                    });
                }
            }

            // 3. Step-by-step path generation
            for step in &query.steps {
                let mut new_paths = Vec::new();
                for path in &active_paths {
                    if let Some(last_node) = path.last() {
                        match (last_node, step) {
                            (
                                PathNode::Object { id: obj_id, .. },
                                TraversalStep::ObjectToEvent {
                                    event_type,
                                    qualifier,
                                },
                            ) => {
                                for event in &ocel.events {
                                    if &event.event_type == event_type {
                                        let matches_qualifier = event.object_refs.iter().any(|r| {
                                            &r.object_id == obj_id && &r.qualifier == qualifier
                                        });
                                        if matches_qualifier {
                                            let mut next_path = path.clone();
                                            next_path.push(PathNode::Event {
                                                id: event.id.clone(),
                                                event_type: event.event_type.clone(),
                                            });
                                            new_paths.push(next_path);
                                        }
                                    }
                                }
                            }
                            (
                                PathNode::Event { id: ev_id, .. },
                                TraversalStep::EventToObject {
                                    object_type,
                                    qualifier,
                                },
                            ) => {
                                if let Some(event) = ocel.events.iter().find(|e| &e.id == ev_id) {
                                    for r in &event.object_refs {
                                        if &r.qualifier == qualifier {
                                            if let Some(target_obj) =
                                                ocel.objects.iter().find(|o| o.id == r.object_id)
                                            {
                                                if &target_obj.object_type == object_type {
                                                    let mut next_path = path.clone();
                                                    next_path.push(PathNode::Object {
                                                        id: target_obj.id.clone(),
                                                        object_type: target_obj.object_type.clone(),
                                                    });
                                                    new_paths.push(next_path);
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                            (
                                PathNode::Object { id: obj_id, .. },
                                TraversalStep::ObjectToObject {
                                    object_type,
                                    qualifier,
                                    direction,
                                },
                            ) => {
                                for rel in &all_relations {
                                    if &rel.qualifier == qualifier {
                                        // Forward search
                                        if (direction == "forward" || direction == "both")
                                            && &rel.source_id == obj_id
                                        {
                                            if let Some(target_obj) =
                                                ocel.objects.iter().find(|o| o.id == rel.target_id)
                                            {
                                                if &target_obj.object_type == object_type {
                                                    let mut next_path = path.clone();
                                                    next_path.push(PathNode::Object {
                                                        id: target_obj.id.clone(),
                                                        object_type: target_obj.object_type.clone(),
                                                    });
                                                    new_paths.push(next_path);
                                                }
                                            }
                                        }
                                        // Reverse search
                                        if (direction == "reverse" || direction == "both")
                                            && &rel.target_id == obj_id
                                        {
                                            if let Some(source_obj) =
                                                ocel.objects.iter().find(|o| o.id == rel.source_id)
                                            {
                                                if &source_obj.object_type == object_type {
                                                    let mut next_path = path.clone();
                                                    next_path.push(PathNode::Object {
                                                        id: source_obj.id.clone(),
                                                        object_type: source_obj.object_type.clone(),
                                                    });
                                                    new_paths.push(next_path);
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                            _ => {} // Drop path on step type mismatch
                        }
                    }
                }
                active_paths = new_paths;
            }

            let result = ProvenanceQueryResult {
                paths: active_paths,
            };
            let result_json = serde_json::to_string(&result).map_err(|e| {
                crate::error::js_val(&format!("Failed to serialize query result: {}", e))
            })?;
            Ok(result_json)
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
/// Returns violations where event B has an earlier timestamp than event A
/// but appears later in the log for the same object.
///
/// Uses ISO 8601 lexicographic ordering (valid for UTC / offset-normalised strings).
#[cfg(feature = "ocel")]
pub fn validate_ocel_object_lifecycles(ocel: &OCEL) -> Vec<LifecycleViolation> {
    use std::collections::HashMap as StdMap;

    // Parse an ISO 8601 timestamp to milliseconds via chrono, falling back to
    // lexicographic ordering encoded as i64 (multiply string hash won't work; we
    // treat parse failure as i64::MIN so the violation is still surfaced).
    fn parse_ts_ms(s: &str) -> i64 {
        use chrono::{DateTime, NaiveDateTime, TimeZone, Utc};
        if let Ok(dt) = DateTime::parse_from_rfc3339(s) {
            return dt.timestamp_millis();
        }
        if let Ok(dt) = DateTime::parse_from_rfc3339(&s.replacen(' ', "T", 1)) {
            return dt.timestamp_millis();
        }
        for fmt in &[
            "%Y-%m-%dT%H:%M:%S%.f",
            "%Y-%m-%dT%H:%M:%S",
            "%Y-%m-%d %H:%M:%S%.f",
            "%Y-%m-%d %H:%M:%S",
        ] {
            if let Ok(ndt) = NaiveDateTime::parse_from_str(s, fmt) {
                return Utc.from_utc_datetime(&ndt).timestamp_millis();
            }
        }
        i64::MIN
    }

    // Build object_id → Vec<(arrival_index, event_id, timestamp_ms)>
    let mut object_events: StdMap<String, Vec<(usize, String, i64)>> = StdMap::new();
    for (idx, event) in ocel.events.iter().enumerate() {
        let ts_ms = parse_ts_ms(&event.timestamp);
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

/// Load an OCEL 2.0 from NDJSON string
#[cfg(feature = "ocel")]
#[wasm_bindgen]
pub fn load_ocel2_from_ndjson(ndjson: &str) -> Result<String, JsValue> {
    let ocel_types_struct = wasm4pm_compat::legacy_import::ocel::import_ocel_ndjson(ndjson)
        .map_err(|e| crate::error::js_val(&format!("Failed to parse NDJSON: {}", e)))?;

    let serialized = serde_json::to_string(&ocel_types_struct)
        .map_err(|e| crate::error::js_val(&format!("Failed to serialize OCEL structure: {}", e)))?;

    let ocel: crate::models::OCEL = serde_json::from_str(&serialized).map_err(|e| {
        crate::error::js_val(&format!("Failed to convert to internal OCEL 2.0: {}", e))
    })?;

    let handle = get_or_init_state()
        .store_object(StoredObject::OCEL(ocel))
        .map_err(|_e| crate::error::js_val("Failed to store OCEL 2.0"))?;

    Ok(handle)
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

    #[test]
    fn test_validation_o2o_referential_integrity() {
        use crate::models::OCELObjectRelation;
        let mut ocel = create_test_ocel();
        ocel.object_relations.push(OCELObjectRelation {
            source_id: "nonexistent_source".to_string(),
            target_id: "order1".to_string(),
            qualifier: "relates".to_string(),
        });
        let errors = validate_ocel_internals(&ocel);
        assert!(
            !errors.is_empty(),
            "Should detect invalid source in global relation"
        );
        assert!(errors
            .iter()
            .any(|e| e.contains("references non-existent source object")));

        let mut ocel = create_test_ocel();
        ocel.objects[0]
            .embedded_relations
            .push(crate::models::OCELObjectRelRef {
                object_id: "nonexistent_embedded".to_string(),
                qualifier: "relates".to_string(),
            });
        let errors = validate_ocel_internals(&ocel);
        assert!(
            !errors.is_empty(),
            "Should detect invalid target in embedded relation"
        );
        assert!(errors
            .iter()
            .any(|e| e.contains("embedded relation references non-existent object")));
    }

    #[test]
    fn test_validation_timeline_monotonicity() {
        let mut ocel = create_test_ocel();
        ocel.events.push(OCELEvent {
            id: "e2".to_string(),
            event_type: "Complete".to_string(),
            timestamp: "2024-01-01T09:00:00Z".to_string(),
            attributes: std::collections::HashMap::new(),
            object_ids: vec!["order1".to_string()],
            object_refs: vec![],
        });
        let errors = validate_ocel_internals(&ocel);
        assert!(!errors.is_empty(), "Should detect monotonicity violation");
        assert!(errors.iter().any(|e| e.contains("Monotonicity violation")));
    }

    #[test]
    fn test_provenance_traversal() {
        use crate::models::{OCELEventObjectRef, OCELObjectRelRef};
        let mut ocel = OCEL {
            event_types: vec![
                "FileModification".to_string(),
                "DiagnosticCheck".to_string(),
                "DiagnosticCleared".to_string(),
                "ReceiptGeneration".to_string(),
            ],
            object_types: vec![
                "Agent".to_string(),
                "File".to_string(),
                "DiagnosticSpecies".to_string(),
                "Receipt".to_string(),
            ],
            events: vec![
                OCELEvent {
                    id: "e_mod".to_string(),
                    event_type: "FileModification".to_string(),
                    timestamp: "2026-05-30T08:00:00Z".to_string(),
                    attributes: std::collections::HashMap::new(),
                    object_ids: vec![],
                    object_refs: vec![
                        OCELEventObjectRef {
                            object_id: "agent_1".to_string(),
                            qualifier: "editor".to_string(),
                        },
                        OCELEventObjectRef {
                            object_id: "file_1".to_string(),
                            qualifier: "modified".to_string(),
                        },
                    ],
                },
                OCELEvent {
                    id: "e_check".to_string(),
                    event_type: "DiagnosticCheck".to_string(),
                    timestamp: "2026-05-30T08:05:00Z".to_string(),
                    attributes: std::collections::HashMap::new(),
                    object_ids: vec![],
                    object_refs: vec![
                        OCELEventObjectRef {
                            object_id: "agent_1".to_string(),
                            qualifier: "checker".to_string(),
                        },
                        OCELEventObjectRef {
                            object_id: "file_1".to_string(),
                            qualifier: "checked".to_string(),
                        },
                        OCELEventObjectRef {
                            object_id: "diag_species_1".to_string(),
                            qualifier: "ruleset".to_string(),
                        },
                    ],
                },
                OCELEvent {
                    id: "e_clear".to_string(),
                    event_type: "DiagnosticCleared".to_string(),
                    timestamp: "2026-05-30T08:10:00Z".to_string(),
                    attributes: std::collections::HashMap::new(),
                    object_ids: vec![],
                    object_refs: vec![
                        OCELEventObjectRef {
                            object_id: "agent_1".to_string(),
                            qualifier: "resolver".to_string(),
                        },
                        OCELEventObjectRef {
                            object_id: "file_1".to_string(),
                            qualifier: "source".to_string(),
                        },
                        OCELEventObjectRef {
                            object_id: "diag_species_1".to_string(),
                            qualifier: "resolved".to_string(),
                        },
                    ],
                },
                OCELEvent {
                    id: "e_receipt".to_string(),
                    event_type: "ReceiptGeneration".to_string(),
                    timestamp: "2026-05-30T08:15:00Z".to_string(),
                    attributes: std::collections::HashMap::new(),
                    object_ids: vec![],
                    object_refs: vec![
                        OCELEventObjectRef {
                            object_id: "agent_1".to_string(),
                            qualifier: "creator".to_string(),
                        },
                        OCELEventObjectRef {
                            object_id: "receipt_1".to_string(),
                            qualifier: "output".to_string(),
                        },
                        OCELEventObjectRef {
                            object_id: "file_1".to_string(),
                            qualifier: "basis".to_string(),
                        },
                    ],
                },
            ],
            objects: vec![
                OCELObject {
                    id: "agent_1".to_string(),
                    object_type: "Agent".to_string(),
                    attributes: std::collections::HashMap::new(),
                    changes: vec![],
                    embedded_relations: vec![],
                },
                OCELObject {
                    id: "file_1".to_string(),
                    object_type: "File".to_string(),
                    attributes: std::collections::HashMap::new(),
                    changes: vec![],
                    embedded_relations: vec![],
                },
                OCELObject {
                    id: "diag_species_1".to_string(),
                    object_type: "DiagnosticSpecies".to_string(),
                    attributes: std::collections::HashMap::new(),
                    changes: vec![],
                    embedded_relations: vec![],
                },
                OCELObject {
                    id: "receipt_1".to_string(),
                    object_type: "Receipt".to_string(),
                    attributes: std::collections::HashMap::new(),
                    changes: vec![],
                    embedded_relations: vec![OCELObjectRelRef {
                        object_id: "file_1".to_string(),
                        qualifier: "basis".to_string(),
                    }],
                },
            ],
            object_relations: vec![],
        };

        let handle = get_or_init_state()
            .store_object(StoredObject::OCEL(ocel))
            .expect("Store failed");

        let query_json = r#"{
            "start_object_id": "receipt_1",
            "start_object_type": "Receipt",
            "steps": [
                {
                    "step_type": "ObjectToObject",
                    "object_type": "File",
                    "qualifier": "basis",
                    "direction": "forward"
                }
            ]
        }"#;

        let res_str = query_provenance_traversal(&handle, query_json).expect("Query failed");
        let res: ProvenanceQueryResult =
            serde_json::from_str(&res_str).expect("Deserialize result failed");

        assert_eq!(res.paths.len(), 1);
        assert_eq!(res.paths[0].len(), 2);
        match &res.paths[0][0] {
            PathNode::Object { id, object_type } => {
                assert_eq!(id, "receipt_1");
                assert_eq!(object_type, "Receipt");
            }
            _ => unreachable!("Expected object node"),
        }
        match &res.paths[0][1] {
            PathNode::Object { id, object_type } => {
                assert_eq!(id, "file_1");
                assert_eq!(object_type, "File");
            }
            _ => unreachable!("Expected object node"),
        }
    }

    /// Helper for testing: run validation and return errors
    fn validate_ocel_internals(ocel: &OCEL) -> Vec<String> {
        validate_ocel_core(ocel)
    }
}
