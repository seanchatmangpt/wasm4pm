use wasm_bindgen::prelude::*;
use crate::state::{get_or_init_state, StoredObject};
use crate::models::{EventLog, OCEL, OCELEvent, OCELObject, AttributeValue};
use serde_json::json;
use std::collections::HashMap;

/// Load an EventLog from JSON string
#[wasm_bindgen]
pub fn load_eventlog_from_json(content: &str) -> Result<String, JsValue> {
    let log: EventLog = serde_json::from_str(content)
        .map_err(|e| JsValue::from_str(&format!("Failed to parse EventLog JSON: {}", e)))?;

    let handle = get_or_init_state()
        .store_object(StoredObject::EventLog(log))
        .map_err(|_e| JsValue::from_str("Failed to store EventLog"))?;

    Ok(handle)
}

/// Load an OCEL from JSON string
#[wasm_bindgen]
pub fn load_ocel_from_json(content: &str) -> Result<String, JsValue> {
    let ocel: OCEL = serde_json::from_str(content)
        .map_err(|e| JsValue::from_str(&format!("Failed to parse OCEL JSON: {}", e)))?;

    let handle = get_or_init_state()
        .store_object(StoredObject::OCEL(ocel))
        .map_err(|_e| JsValue::from_str("Failed to store OCEL"))?;

    Ok(handle)
}

/// Export EventLog to JSON string
#[wasm_bindgen]
pub fn export_eventlog_to_json(handle: &str) -> Result<String, JsValue> {
    get_or_init_state().with_object(handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => {
            serde_json::to_string(log)
                .map_err(|e| JsValue::from_str(&format!("Failed to serialize EventLog: {}", e)))
        }
        Some(_) => Err(JsValue::from_str("Object is not an EventLog")),
        None => Err(JsValue::from_str("EventLog not found")),
    })
}

/// Export OCEL to JSON string
#[wasm_bindgen]
pub fn export_ocel_to_json(handle: &str) -> Result<String, JsValue> {
    get_or_init_state().with_object(handle, |obj| match obj {
        Some(StoredObject::OCEL(ocel)) => {
            serde_json::to_string(ocel)
                .map_err(|e| JsValue::from_str(&format!("Failed to serialize OCEL: {}", e)))
        }
        Some(_) => Err(JsValue::from_str("Object is not an OCEL")),
        None => Err(JsValue::from_str("OCEL not found")),
    })
}

/// Load an OCEL from XML string
/// Simple XML parser supporting basic OCEL-XML structure with events and objects
#[wasm_bindgen]
pub fn load_ocel_from_xml(content: &str) -> Result<String, JsValue> {
    let mut ocel = OCEL::new();
    let mut current_event: Option<OCELEvent> = None;
    let mut current_object: Option<OCELObject> = None;

    for line in content.lines() {
        let trimmed = line.trim();

        // Skip empty lines and XML prologue
        if trimmed.is_empty() || trimmed.starts_with("<?") {
            continue;
        }

        // Parse event type declarations
        if trimmed.contains("<eventType") || trimmed.contains("<event-type") {
            if let Some(type_name) = extract_xml_attr(trimmed, "name") {
                if !ocel.event_types.contains(&type_name.to_string()) {
                    ocel.event_types.push(type_name.to_string());
                }
            }
            continue;
        }

        // Parse object type declarations
        if trimmed.contains("<objectType") || trimmed.contains("<object-type") {
            if let Some(type_name) = extract_xml_attr(trimmed, "name") {
                if !ocel.object_types.contains(&type_name.to_string()) {
                    ocel.object_types.push(type_name.to_string());
                }
            }
            continue;
        }

        // Parse event opening tags
        if trimmed.starts_with("<event") && !trimmed.starts_with("</event") {
            let event_id = extract_xml_attr(trimmed, "id")
                .map(|s| s.to_string())
                .unwrap_or_else(|| format!("event_{}", ocel.events.len()));
            let event_type = extract_xml_attr(trimmed, "type")
                .map(|s| s.to_string())
                .unwrap_or_else(|| "Activity".to_string());
            let timestamp = extract_xml_attr(trimmed, "timestamp")
                .map(|s| s.to_string())
                .unwrap_or_else(|| "1970-01-01T00:00:00Z".to_string());

            current_event = Some(OCELEvent {
                id: event_id,
                event_type,
                timestamp,
                attributes: HashMap::new(),
                object_ids: Vec::new(),
            });
            continue;
        }

        // Parse object opening tags
        if trimmed.starts_with("<object") && !trimmed.starts_with("</object") {
            let object_id = extract_xml_attr(trimmed, "id")
                .map(|s| s.to_string())
                .unwrap_or_else(|| format!("obj_{}", ocel.objects.len()));
            let object_type = extract_xml_attr(trimmed, "type")
                .map(|s| s.to_string())
                .unwrap_or_else(|| "Object".to_string());

            current_object = Some(OCELObject {
                id: object_id,
                object_type,
                attributes: HashMap::new(),
            });
            continue;
        }

        // Parse object references in events
        if (trimmed.starts_with("<omap") || trimmed.starts_with("<object-ref")) && !trimmed.ends_with("/>") {
            if let Some(ref mut event) = current_event {
                if let Some(object_id) = extract_xml_attr(trimmed, "id") {
                    event.object_ids.push(object_id.to_string());
                }
            }
            continue;
        }

        // Parse string attributes
        if trimmed.starts_with("<string") {
            if let (Some(key), Some(value)) = (extract_xml_attr(trimmed, "key"), extract_xml_attr(trimmed, "value")) {
                if let Some(ref mut event) = current_event {
                    event.attributes.insert(key.to_string(), AttributeValue::String(value.to_string()));
                } else if let Some(ref mut object) = current_object {
                    object.attributes.insert(key.to_string(), AttributeValue::String(value.to_string()));
                }
            }
            continue;
        }

        // Parse int attributes
        if trimmed.starts_with("<int") {
            if let (Some(key), Some(value_str)) = (extract_xml_attr(trimmed, "key"), extract_xml_attr(trimmed, "value")) {
                if let Ok(value) = value_str.parse::<i64>() {
                    if let Some(ref mut event) = current_event {
                        event.attributes.insert(key.to_string(), AttributeValue::Int(value));
                    } else if let Some(ref mut object) = current_object {
                        object.attributes.insert(key.to_string(), AttributeValue::Int(value));
                    }
                }
            }
            continue;
        }

        // Parse float attributes
        if trimmed.starts_with("<float") {
            if let (Some(key), Some(value_str)) = (extract_xml_attr(trimmed, "key"), extract_xml_attr(trimmed, "value")) {
                if let Ok(value) = value_str.parse::<f64>() {
                    if let Some(ref mut event) = current_event {
                        event.attributes.insert(key.to_string(), AttributeValue::Float(value));
                    } else if let Some(ref mut object) = current_object {
                        object.attributes.insert(key.to_string(), AttributeValue::Float(value));
                    }
                }
            }
            continue;
        }

        // Close event
        if trimmed == "</event>" {
            if let Some(event) = current_event.take() {
                ocel.events.push(event);
            }
            continue;
        }

        // Close object
        if trimmed == "</object>" {
            if let Some(object) = current_object.take() {
                ocel.objects.push(object);
            }
            continue;
        }
    }

    let handle = get_or_init_state()
        .store_object(StoredObject::OCEL(ocel))
        .map_err(|_e| JsValue::from_str("Failed to store OCEL"))?;

    Ok(handle)
}

/// Get the number of events in an OCEL
#[wasm_bindgen]
pub fn get_ocel_event_count(ocel_handle: &str) -> Result<usize, JsValue> {
    get_or_init_state().with_object(ocel_handle, |obj| match obj {
        Some(StoredObject::OCEL(ocel)) => Ok(ocel.event_count()),
        Some(_) => Err(JsValue::from_str("Object is not an OCEL")),
        None => Err(JsValue::from_str("OCEL not found")),
    })
}

/// Get the number of objects in an OCEL
#[wasm_bindgen]
pub fn get_ocel_object_count(ocel_handle: &str) -> Result<usize, JsValue> {
    get_or_init_state().with_object(ocel_handle, |obj| match obj {
        Some(StoredObject::OCEL(ocel)) => Ok(ocel.object_count()),
        Some(_) => Err(JsValue::from_str("Object is not an OCEL")),
        None => Err(JsValue::from_str("OCEL not found")),
    })
}

/// Helper function to extract XML attribute values
fn extract_xml_attr(line: &str, attr_name: &str) -> Option<String> {
    let pattern = format!("{}=\"", attr_name);
    if let Some(start) = line.find(&pattern) {
        let value_start = start + pattern.len();
        if let Some(end) = line[value_start..].find('"') {
            return Some(line[value_start..value_start + end].to_string());
        }
    }
    None
}

/// Get information about supported formats
#[wasm_bindgen]
pub fn get_io_info() -> String {
    json!({
        "supported_formats": [
            {
                "type": "EventLog",
                "formats": ["json", "xes"],
                "functions": ["load_eventlog_from_json", "load_eventlog_from_xes", "export_eventlog_to_json", "export_eventlog_to_xes"]
            },
            {
                "type": "OCEL",
                "formats": ["json", "xml"],
                "functions": ["load_ocel_from_json", "load_ocel_from_xml", "export_ocel_to_json", "get_ocel_event_count", "get_ocel_object_count"]
            }
        ],
        "note": "WASM version supports JSON and XML/XES format for data exchange"
    })
    .to_string()
}
