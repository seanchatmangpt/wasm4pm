use wasm_bindgen::prelude::*;
use process_mining::core::{EventLog, OCEL, Importable, Exportable};
use crate::state::{get_or_init_state, StoredObject};
use crate::types::{WasmEventLog, WasmOCEL};

/// Load an EventLog from XES string content
#[wasm_bindgen]
pub fn load_eventlog_from_xes(content: &str) -> Result<String, JsValue> {
    let bytes = content.as_bytes();
    let log = EventLog::import_from_bytes(bytes, "xes")
        .map_err(|e| JsValue::from_str(&format!("Failed to load EventLog: {}", e)))?;

    let handle = get_or_init_state()
        .store_object(StoredObject::EventLog(log))
        .map_err(|e| JsValue::from_str(&format!("Failed to store EventLog: {:?}", e)))?;

    Ok(handle)
}

/// Load an EventLog from a byte array (base64 encoded string)
#[wasm_bindgen]
pub fn load_eventlog_from_bytes(data: &str, format: &str) -> Result<String, JsValue> {
    let bytes = if format == "base64" {
        // Decode base64 if needed
        match base64_to_bytes(data) {
            Ok(b) => b,
            Err(_) => return Err(JsValue::from_str("Invalid base64 data")),
        }
    } else {
        data.as_bytes().to_vec()
    };

    let log = EventLog::import_from_bytes(&bytes, "xes")
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
    let ocel = OCEL::import_from_bytes(bytes, "json")
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
    let ocel = OCEL::import_from_bytes(bytes, "xml")
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
            let bytes = log
                .export_to_bytes("xes")
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
            let bytes = ocel
                .export_to_bytes("json")
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
            let bytes = ocel
                .export_to_bytes("xml")
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
            // Convert EventLog to JSON (simplified representation)
            serde_json::to_string(&log)
                .map_err(|e| JsValue::from_str(&format!("Failed to convert to JSON: {}", e)))
        }
        Some(_) => Err(JsValue::from_str("Object is not an EventLog")),
        None => Err(JsValue::from_str("EventLog not found")),
    }
}

/// Helper function to convert base64 to bytes
fn base64_to_bytes(data: &str) -> Result<Vec<u8>, String> {
    // Simple base64 decoding
    // In a real implementation, you'd use a proper base64 library
    // For WASM, we'll decode manually since we want minimal dependencies
    let mut result = Vec::new();
    let data_bytes = data.as_bytes();
    let mut i = 0;

    while i < data_bytes.len() {
        let mut n = 0u32;
        let mut bits_read = 0;

        while bits_read < 24 && i < data_bytes.len() {
            let byte = data_bytes[i];
            i += 1;

            if byte == b'=' {
                break;
            }

            let val = match byte {
                b'A'..=b'Z' => (byte - b'A') as u32,
                b'a'..=b'z' => (byte - b'a' + 26) as u32,
                b'0'..=b'9' => (byte - b'0' + 52) as u32,
                b'+' => 62,
                b'/' => 63,
                _ => return Err("Invalid base64 character".to_string()),
            };

            n = (n << 6) | val;
            bits_read += 6;
        }

        if bits_read >= 8 {
            result.push(((n >> (bits_read - 8)) & 0xff) as u8);
        }
        if bits_read >= 16 {
            result.push(((n >> (bits_read - 16)) & 0xff) as u8);
        }
        if bits_read >= 24 {
            result.push((n & 0xff) as u8);
        }
    }

    Ok(result)
}
