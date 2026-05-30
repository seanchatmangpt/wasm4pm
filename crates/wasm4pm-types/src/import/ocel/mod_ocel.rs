use crate::ocel::{OCEL, OCELEvent, OCELObject, OCELType};
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
    let mut objects = Vec::new();
    let mut event_type_names = HashSet::new();
    let mut object_type_names = HashSet::new();

    for line in ndjson.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }

        // Try parsing as Event or Object based on the presence of `time`.
        // If it's a partial last line, `serde_json::from_str` will fail, and we just ignore it.
        if let Ok(val) = serde_json::from_str::<serde_json::Value>(line) {
            if val.get("time").is_some() {
                if let Ok(event) = serde_json::from_value::<OCELEvent>(val) {
                    event_type_names.insert(event.event_type.clone());
                    events.push(event);
                }
            } else if val.get("name").is_some() {
                // If they explicitly send an OCELType
                if let Ok(_ocel_type) = serde_json::from_value::<OCELType>(val.clone()) {
                    // We don't know if it's event or object type here without more context,
                    // but usually they will send events and objects.
                }
            } else {
                if let Ok(object) = serde_json::from_value::<OCELObject>(val) {
                    object_type_names.insert(object.object_type.clone());
                    objects.push(object);
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
}
