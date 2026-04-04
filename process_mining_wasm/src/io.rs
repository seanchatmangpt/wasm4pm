use wasm_bindgen::prelude::*;
use process_mining::{EventLog, OCEL, Importable, Exportable};
use crate::state::{get_or_init_state, StoredObject};

/// Load an EventLog from XES string content
#[wasm_bindgen]
pub fn load_eventlog_from_xes(content: &str) -> Result<String, JsValue> {
    let bytes = content.as_bytes();
    let log = <EventLog as Importable>::import_from_bytes(bytes, "xes")
        .map_err(|e| JsValue::from_str(&format!("Failed to load EventLog: {}", e)))?;

    let handle = get_or_init_state()
        .store_object(StoredObject::EventLog(log))
        .map_err(|e| JsValue::from_str(&format!("Failed to store EventLog: {:?}", e)))?;

    Ok(handle)
}

/// Load an OCEL from JSON string content
#[wasm_bindgen]
pub fn load_ocel_from_json(content: &str) -> Result<String, JsValue> {
    let bytes = content.as_bytes();
    let ocel = <OCEL as Importable>::import_from_bytes(bytes, "json")
        .map_err(|e| JsValue::from_str(&format!("Failed to load OCEL: {}", e)))?;

    let handle = get_or_init_state()
        .store_object(StoredObject::OCEL(ocel))
        .map_err(|e| JsValue::from_str(&format!("Failed to store OCEL: {:?}", e)))?;

    Ok(handle)
}

/// Load an OCEL from XML string content
#[wasm_bindgen]
pub fn load_ocel_from_xml(content: &str) -> Result<String, JsValue> {
    let bytes = content.as_bytes();
    let ocel = <OCEL as Importable>::import_from_bytes(bytes, "xml")
        .map_err(|e| JsValue::from_str(&format!("Failed to load OCEL: {}", e)))?;

    let handle = get_or_init_state()
        .store_object(StoredObject::OCEL(ocel))
        .map_err(|e| JsValue::from_str(&format!("Failed to store OCEL: {:?}", e)))?;

    Ok(handle)
}

/// Export EventLog to XES format
#[wasm_bindgen]
pub fn export_eventlog_to_xes(handle: &str) -> Result<String, JsValue> {
    match get_or_init_state().get_object(handle)? {
        Some(StoredObject::EventLog(log)) => {
            let bytes = <EventLog as Exportable>::export_to_bytes(&log, "xes")
                .map_err(|e| JsValue::from_str(&format!("Failed to export EventLog: {}", e)))?;

            String::from_utf8(bytes)
                .map_err(|e| JsValue::from_str(&format!("UTF8 error: {}", e)))
        }
        Some(_) => Err(JsValue::from_str("Object is not an EventLog")),
        None => Err(JsValue::from_str("EventLog not found")),
    }
}

/// Export OCEL to JSON format
#[wasm_bindgen]
pub fn export_ocel_to_json(handle: &str) -> Result<String, JsValue> {
    match get_or_init_state().get_object(handle)? {
        Some(StoredObject::OCEL(ocel)) => {
            let bytes = <OCEL as Exportable>::export_to_bytes(&ocel, "json")
                .map_err(|e| JsValue::from_str(&format!("Failed to export OCEL: {}", e)))?;

            String::from_utf8(bytes)
                .map_err(|e| JsValue::from_str(&format!("UTF8 error: {}", e)))
        }
        Some(_) => Err(JsValue::from_str("Object is not an OCEL")),
        None => Err(JsValue::from_str("OCEL not found")),
    }
}

/// Export OCEL to XML format
#[wasm_bindgen]
pub fn export_ocel_to_xml(handle: &str) -> Result<String, JsValue> {
    match get_or_init_state().get_object(handle)? {
        Some(StoredObject::OCEL(ocel)) => {
            let bytes = <OCEL as Exportable>::export_to_bytes(&ocel, "xml")
                .map_err(|e| JsValue::from_str(&format!("Failed to export OCEL: {}", e)))?;

            String::from_utf8(bytes)
                .map_err(|e| JsValue::from_str(&format!("UTF8 error: {}", e)))
        }
        Some(_) => Err(JsValue::from_str("Object is not an OCEL")),
        None => Err(JsValue::from_str("OCEL not found")),
    }
}

/// Get EventLog as a JSON representation
#[wasm_bindgen]
pub fn eventlog_to_json(handle: &str) -> Result<String, JsValue> {
    match get_or_init_state().get_object(handle)? {
        Some(StoredObject::EventLog(log)) => {
            serde_json::to_string(&log)
                .map_err(|e| JsValue::from_str(&format!("Failed to convert to JSON: {}", e)))
        }
        Some(_) => Err(JsValue::from_str("Object is not an EventLog")),
        None => Err(JsValue::from_str("EventLog not found")),
    }
}
