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

/// Load an OCEL from XML string using roxmltree parser
/// Supports OCEL-XML structure with events, objects, and typed attributes
#[wasm_bindgen]
pub fn load_ocel_from_xml(content: &str) -> Result<String, JsValue> {
    let doc = roxmltree::Document::parse(content)
        .map_err(|e| JsValue::from_str(&format!("Failed to parse XML: {}", e)))?;

    let mut ocel = OCEL::new();

    // Extract event and object type declarations
    for node in doc.root().children() {
        match node.tag_name().name() {
            "eventType" | "event-type" => {
                if let Some(type_name) = node.attribute("name") {
                    if !ocel.event_types.contains(&type_name.to_string()) {
                        ocel.event_types.push(type_name.to_string());
                    }
                }
            }
            "objectType" | "object-type" => {
                if let Some(type_name) = node.attribute("name") {
                    if !ocel.object_types.contains(&type_name.to_string()) {
                        ocel.object_types.push(type_name.to_string());
                    }
                }
            }
            "event" => {
                let event_id = node
                    .attribute("id")
                    .map(|s| s.to_string())
                    .unwrap_or_else(|| format!("event_{}", ocel.events.len()));
                let event_type = node
                    .attribute("type")
                    .map(|s| s.to_string())
                    .unwrap_or_else(|| "Activity".to_string());
                let timestamp = node
                    .attribute("timestamp")
                    .map(|s| s.to_string())
                    .unwrap_or_else(|| "1970-01-01T00:00:00Z".to_string());

                let mut attributes = HashMap::new();
                let mut object_ids = Vec::new();

                // Parse child elements (attributes and object references)
                for child in node.children() {
                    match child.tag_name().name() {
                        "string" => {
                            if let (Some(key), Some(value)) = (child.attribute("key"), child.attribute("value")) {
                                attributes.insert(key.to_string(), AttributeValue::String(value.to_string()));
                            }
                        }
                        "int" => {
                            if let (Some(key), Some(value_str)) = (child.attribute("key"), child.attribute("value")) {
                                if let Ok(value) = value_str.parse::<i64>() {
                                    attributes.insert(key.to_string(), AttributeValue::Int(value));
                                }
                            }
                        }
                        "float" => {
                            if let (Some(key), Some(value_str)) = (child.attribute("key"), child.attribute("value")) {
                                if let Ok(value) = value_str.parse::<f64>() {
                                    attributes.insert(key.to_string(), AttributeValue::Float(value));
                                }
                            }
                        }
                        "boolean" => {
                            if let (Some(key), Some(value_str)) = (child.attribute("key"), child.attribute("value")) {
                                let value = value_str == "true" || value_str == "1";
                                attributes.insert(key.to_string(), AttributeValue::Boolean(value));
                            }
                        }
                        "omap" | "object-ref" => {
                            if let Some(object_id) = child.attribute("id") {
                                object_ids.push(object_id.to_string());
                            }
                        }
                        _ => {}
                    }
                }

                ocel.events.push(OCELEvent {
                    id: event_id,
                    event_type,
                    timestamp,
                    attributes,
                    object_ids,
                });
            }
            "object" => {
                let object_id = node
                    .attribute("id")
                    .map(|s| s.to_string())
                    .unwrap_or_else(|| format!("obj_{}", ocel.objects.len()));
                let object_type = node
                    .attribute("type")
                    .map(|s| s.to_string())
                    .unwrap_or_else(|| "Object".to_string());

                let mut attributes = HashMap::new();

                // Parse child elements (attributes)
                for child in node.children() {
                    match child.tag_name().name() {
                        "string" => {
                            if let (Some(key), Some(value)) = (child.attribute("key"), child.attribute("value")) {
                                attributes.insert(key.to_string(), AttributeValue::String(value.to_string()));
                            }
                        }
                        "int" => {
                            if let (Some(key), Some(value_str)) = (child.attribute("key"), child.attribute("value")) {
                                if let Ok(value) = value_str.parse::<i64>() {
                                    attributes.insert(key.to_string(), AttributeValue::Int(value));
                                }
                            }
                        }
                        "float" => {
                            if let (Some(key), Some(value_str)) = (child.attribute("key"), child.attribute("value")) {
                                if let Ok(value) = value_str.parse::<f64>() {
                                    attributes.insert(key.to_string(), AttributeValue::Float(value));
                                }
                            }
                        }
                        "boolean" => {
                            if let (Some(key), Some(value_str)) = (child.attribute("key"), child.attribute("value")) {
                                let value = value_str == "true" || value_str == "1";
                                attributes.insert(key.to_string(), AttributeValue::Boolean(value));
                            }
                        }
                        _ => {}
                    }
                }

                ocel.objects.push(OCELObject {
                    id: object_id,
                    object_type,
                    attributes,
                });
            }
            _ => {}
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
