use wasm_bindgen::prelude::*;
use crate::state::{get_or_init_state, StoredObject};
use crate::models::{EventLog, OCEL};
use serde_json::json;

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

/// Get information about supported formats
#[wasm_bindgen]
pub fn get_io_info() -> String {
    json!({
        "supported_formats": [
            {
                "type": "EventLog",
                "format": "json",
                "functions": ["load_eventlog_from_json", "export_eventlog_to_json"]
            },
            {
                "type": "OCEL",
                "format": "json",
                "functions": ["load_ocel_from_json", "export_ocel_to_json"]
            }
        ],
        "note": "WASM version supports JSON format for data exchange"
    })
    .to_string()
}
