use crate::ocel::{OCELEvent, OCELObject, OCELType, OCEL};
use hashbrown::HashSet;
use serde_json;

pub fn import_ocel_json(ocel_json: &str) -> Result<OCEL, serde_json::Error> {
    serde_json::from_str(ocel_json)
}

pub fn import_ocel_json_slice(slice: &[u8]) -> Result<OCEL, serde_json::Error> {
    serde_json::from_slice(slice)
}

/// Parses an NDJSON stream of OCEL events and objects.
///
/// Tolerates partial final lines (for crash-safe append-only files).
/// Synthesizes `event_types` and `object_types` from the observed events and objects.
pub fn import_ocel_ndjson(ndjson: &str) -> Result<OCEL, String> {
    let mut events = Vec::new();
    let mut objects: Vec<OCELObject> = Vec::new();
    let mut event_type_names = HashSet::new();
    let mut object_type_names = HashSet::new();

    for line in ndjson.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }

        if let Ok(mut val) = serde_json::from_str::<serde_json::Value>(line) {
            let mut is_event = false;
            if let Some(val_map) = val.as_object_mut() {
                if val_map.contains_key("timestamp") || val_map.contains_key("time") {
                    is_event = true;
                }
            }

            if is_event {
                if let Some(val_map) = val.as_object_mut() {
                    // Map event_id -> id if id is missing.
                    if !val_map.contains_key("id") {
                        if let Some(event_id) = val_map.get("event_id").cloned() {
                            val_map.insert("id".to_string(), event_id);
                        }
                    }
                    // Map activity -> type if type is missing.
                    if !val_map.contains_key("type") {
                        if let Some(activity) = val_map.get("activity").cloned() {
                            val_map.insert("type".to_string(), activity);
                        }
                    }
                    // Map timestamp -> time if time is missing.
                    if !val_map.contains_key("time") {
                        if let Some(timestamp) = val_map.get("timestamp").cloned() {
                            val_map.insert("time".to_string(), timestamp);
                        }
                    }

                    // Normalize time
                    if let Some(time_val) = val_map.get_mut("time") {
                        if let Some(time_str) = time_val.as_str() {
                            let mut s = time_str.to_string();
                            if s.contains(' ') {
                                s = s.replacen(' ', "T", 1);
                            }
                            let has_offset = s.ends_with('Z')
                                || (s.len() > 10
                                    && (s[10..].contains('+') || s[10..].contains('-')));
                            if !has_offset {
                                s.push('Z');
                            }
                            *time_val = serde_json::Value::String(s);
                        }
                    }

                    // Convert objects (if present as an array of objects) to relationships array:
                    let mut relationships = if let Some(serde_json::Value::Array(rels)) =
                        val_map.get("relationships")
                    {
                        rels.clone()
                    } else {
                        Vec::new()
                    };

                    if let Some(serde_json::Value::Array(objects_arr)) = val_map.get("objects") {
                        for obj_val in objects_arr {
                            if let Some(obj_map) = obj_val.as_object() {
                                let obj_id = obj_map
                                    .get("id")
                                    .or_else(|| obj_map.get("objectId"))
                                    .and_then(|v| v.as_str())
                                    .map(|s| s.to_string());
                                let obj_type = obj_map
                                    .get("type")
                                    .or_else(|| obj_map.get("qualifier"))
                                    .and_then(|v| v.as_str())
                                    .map(|s| s.to_string());

                                if let (Some(oid), Some(otype)) = (obj_id, obj_type) {
                                    relationships.push(serde_json::json!({
                                        "objectId": oid,
                                        "qualifier": otype
                                    }));

                                    if !objects.iter().any(|o| o.id == oid) {
                                        objects.push(OCELObject {
                                            id: oid.clone(),
                                            object_type: otype.clone(),
                                            attributes: vec![],
                                            relationships: vec![],
                                        });
                                        object_type_names.insert(otype);
                                    }
                                }
                            }
                        }
                    }
                    val_map.insert(
                        "relationships".to_string(),
                        serde_json::Value::Array(relationships),
                    );

                    // For all other flat properties (keys not standard for event), map them to attributes
                    let mut attributes = Vec::new();
                    if let Some(serde_json::Value::Array(attrs)) = val_map.get("attributes") {
                        attributes.extend(attrs.clone());
                    } else if let Some(serde_json::Value::Object(attrs_map)) =
                        val_map.get("attributes")
                    {
                        for (k, v) in attrs_map {
                            attributes.push(serde_json::json!({
                                "name": k,
                                "value": v.clone()
                            }));
                        }
                    }

                    let standard_event_keys: HashSet<&str> = [
                        "id",
                        "event_id",
                        "type",
                        "activity",
                        "time",
                        "timestamp",
                        "attributes",
                        "relationships",
                        "objects",
                    ]
                    .iter()
                    .cloned()
                    .collect();

                    let keys_to_remove: Vec<String> = val_map
                        .keys()
                        .filter(|k| !standard_event_keys.contains(k.as_str()))
                        .cloned()
                        .collect();

                    for k in keys_to_remove {
                        if let Some(v) = val_map.remove(&k) {
                            attributes.push(serde_json::json!({
                                "name": k,
                                "value": v
                            }));
                        }
                    }
                    val_map.insert(
                        "attributes".to_string(),
                        serde_json::Value::Array(attributes),
                    );
                }

                if let Ok(event) = serde_json::from_value::<OCELEvent>(val) {
                    event_type_names.insert(event.event_type.clone());
                    events.push(event);
                }
            } else {
                if let Some(val_map) = val.as_object_mut() {
                    // Map type -> type
                    if !val_map.contains_key("type") {
                        if let Some(otype) = val_map.get("object_type").cloned() {
                            val_map.insert("type".to_string(), otype);
                        }
                    }

                    // Convert flat properties to attributes
                    let mut attributes = Vec::new();
                    if let Some(serde_json::Value::Array(attrs)) = val_map.get("attributes") {
                        attributes.extend(attrs.clone());
                    } else if let Some(serde_json::Value::Object(attrs_map)) =
                        val_map.get("attributes")
                    {
                        for (k, v) in attrs_map {
                            attributes.push(serde_json::json!({
                                "name": k,
                                "value": v.clone(),
                                "time": "1970-01-01T00:00:00Z"
                            }));
                        }
                    }

                    let standard_obj_keys: HashSet<&str> =
                        ["id", "type", "object_type", "attributes", "relationships"]
                            .iter()
                            .cloned()
                            .collect();

                    let keys_to_remove: Vec<String> = val_map
                        .keys()
                        .filter(|k| !standard_obj_keys.contains(k.as_str()))
                        .cloned()
                        .collect();

                    for k in keys_to_remove {
                        if let Some(v) = val_map.remove(&k) {
                            attributes.push(serde_json::json!({
                                "name": k,
                                "value": v,
                                "time": "1970-01-01T00:00:00Z"
                            }));
                        }
                    }
                    val_map.insert(
                        "attributes".to_string(),
                        serde_json::Value::Array(attributes),
                    );
                }

                if let Ok(object) = serde_json::from_value::<OCELObject>(val) {
                    if let Some(existing) = objects.iter_mut().find(|o| o.id == object.id) {
                        existing.object_type = object.object_type.clone();
                        existing.attributes = object.attributes.clone();
                        existing.relationships = object.relationships.clone();
                    } else {
                        objects.push(object.clone());
                    }
                    object_type_names.insert(object.object_type);
                }
            }
        }
    }

    let event_types = event_type_names
        .into_iter()
        .map(|name| OCELType {
            name,
            attributes: vec![],
        })
        .collect();

    let object_types = object_type_names
        .into_iter()
        .map(|name| OCELType {
            name,
            attributes: vec![],
        })
        .collect();

    Ok(OCEL {
        event_types,
        object_types,
        events,
        objects,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_import_ocel_ndjson_basic() {
        let ndjson = r#"
{"id":"e1","type":"DiagnosticRaised","time":"2026-05-30T12:00:00Z","attributes":[],"relationships":[{"objectId":"o1","qualifier":"subject"}]}
{"id":"o1","type":"File","attributes":[],"relationships":[]}
{"id":"e2","type":"RouteSelected","time":"2026-05-30T12:05:00Z","attributes":[],"relationships":[{"objectId":"o1","qualifier":"subject"}]}
{"id":"e3","type":"RouteSelected","time":"2026-05-30T12:05:00Z"#;

        let ocel = import_ocel_ndjson(ndjson).unwrap();
        assert_eq!(ocel.events.len(), 2);
        assert_eq!(ocel.objects.len(), 1);
        assert_eq!(ocel.event_types.len(), 2); // DiagnosticRaised, RouteSelected
        assert_eq!(ocel.object_types.len(), 1); // File
    }

    #[test]
    fn test_import_ocel_ndjson_preprocessing() {
        let ndjson = r#"
{"event_id":"e1","activity":"DiagnosticRaised","timestamp":"2026-05-30 12:00:00","custom_event_prop":"hello","objects":[{"objectId":"o1","type":"File"}]}
{"id":"o1","object_type":"File","custom_obj_prop":"world"}
"#;
        let ocel = import_ocel_ndjson(ndjson).unwrap();
        assert_eq!(ocel.events.len(), 1);
        assert_eq!(ocel.objects.len(), 1);

        let e = &ocel.events[0];
        assert_eq!(e.id, "e1");
        assert_eq!(e.event_type, "DiagnosticRaised");
        assert_eq!(e.time.to_rfc3339(), "2026-05-30T12:00:00+00:00");
        assert_eq!(e.relationships.len(), 1);
        assert_eq!(e.relationships[0].object_id, "o1");
        assert_eq!(e.relationships[0].qualifier, "File");
        assert_eq!(e.attributes.len(), 1);
        assert_eq!(e.attributes[0].name, "custom_event_prop");
        assert_eq!(
            e.attributes[0].value,
            crate::ocel::OCELAttributeValue::String("hello".to_string())
        );

        let o = &ocel.objects[0];
        assert_eq!(o.id, "o1");
        assert_eq!(o.object_type, "File");
        assert_eq!(o.attributes.len(), 1);
        assert_eq!(o.attributes[0].name, "custom_obj_prop");
        assert_eq!(
            o.attributes[0].value,
            crate::ocel::OCELAttributeValue::String("world".to_string())
        );
        assert_eq!(
            o.attributes[0].time.to_rfc3339(),
            "1970-01-01T00:00:00+00:00"
        );
    }

    #[test]
    fn test_import_ocel_ndjson_map_attributes() {
        let ndjson = r#"
{"id":"e1","type":"DiagnosticRaised","time":"2026-05-30T12:00:00Z","attributes":{"custom_event_prop":"hello"},"relationships":[]}
{"id":"o1","type":"File","attributes":{"custom_obj_prop":"world"},"relationships":[]}
"#;
        let ocel = import_ocel_ndjson(ndjson).unwrap();
        assert_eq!(ocel.events.len(), 1);
        assert_eq!(ocel.objects.len(), 1);

        let e = &ocel.events[0];
        assert_eq!(e.attributes.len(), 1);
        assert_eq!(e.attributes[0].name, "custom_event_prop");
        assert_eq!(
            e.attributes[0].value,
            crate::ocel::OCELAttributeValue::String("hello".to_string())
        );

        let o = &ocel.objects[0];
        assert_eq!(o.attributes.len(), 1);
        assert_eq!(o.attributes[0].name, "custom_obj_prop");
        assert_eq!(
            o.attributes[0].value,
            crate::ocel::OCELAttributeValue::String("world".to_string())
        );
    }
}
