use wasm_bindgen::prelude::*;
use crate::state::{get_or_init_state, StoredObject};
use serde_json::json;
#[cfg(target_arch = "wasm32")]
use serde_wasm_bindgen;
use crate::utilities::to_js;

/// Wrapper for EventLog - stores handle in WASM state
#[wasm_bindgen]
pub struct WasmEventLog {
    handle: String,
}

#[wasm_bindgen]
impl WasmEventLog {
    /// Get the internal handle (for internal use only)
    pub fn handle(&self) -> String {
        self.handle.clone()
    }

    /// Get the number of events in the log
    pub fn event_count(&self) -> Result<usize, JsValue> {
        get_or_init_state().with_object(&self.handle, |obj| match obj {
            Some(StoredObject::EventLog(log)) => {
                let count = log.traces.iter().map(|t| t.events.len()).sum();
                Ok(count)
            }
            Some(_) => Err(JsValue::from_str("Object is not an EventLog")),
            None => Err(JsValue::from_str("EventLog not found")),
        })
    }

    /// Get the number of cases in the log
    pub fn case_count(&self) -> Result<usize, JsValue> {
        get_or_init_state().with_object(&self.handle, |obj| match obj {
            Some(StoredObject::EventLog(log)) => Ok(log.traces.len()),
            Some(_) => Err(JsValue::from_str("Object is not an EventLog")),
            None => Err(JsValue::from_str("EventLog not found")),
        })
    }

    /// Get attributes count
    pub fn attribute_count(&self) -> Result<usize, JsValue> {
        get_or_init_state().with_object(&self.handle, |obj| match obj {
            Some(StoredObject::EventLog(log)) => Ok(log.attributes.len()),
            Some(_) => Err(JsValue::from_str("Object is not an EventLog")),
            None => Err(JsValue::from_str("EventLog not found")),
        })
    }

    /// Get basic statistics as JSON
    pub fn stats(&self) -> Result<JsValue, JsValue> {
        get_or_init_state().with_object(&self.handle, |obj| match obj {
            Some(StoredObject::EventLog(log)) => {
                let event_count: usize = log.traces.iter().map(|t| t.events.len()).sum();
                let stats = json!({
                    "event_count": event_count,
                    "case_count": log.traces.len(),
                    "attribute_count": log.attributes.len(),
                });
                to_js(&stats)
            }
            Some(_) => Err(JsValue::from_str("Object is not an EventLog")),
            None => Err(JsValue::from_str("EventLog not found")),
        })
    }
}

impl WasmEventLog {
    pub fn new(handle: String) -> Self {
        WasmEventLog { handle }
    }
}

/// Wrapper for OCEL
#[wasm_bindgen]
pub struct WasmOCEL {
    handle: String,
}

#[wasm_bindgen]
impl WasmOCEL {
    /// Get the internal handle (for internal use only)
    pub fn handle(&self) -> String {
        self.handle.clone()
    }

    /// Get the number of events in the OCEL
    pub fn event_count(&self) -> Result<usize, JsValue> {
        get_or_init_state().with_object(&self.handle, |obj| match obj {
            Some(StoredObject::OCEL(ocel)) => Ok(ocel.events.len()),
            Some(_) => Err(JsValue::from_str("Object is not an OCEL")),
            None => Err(JsValue::from_str("OCEL not found")),
        })
    }

    /// Get the number of objects in the OCEL
    pub fn object_count(&self) -> Result<usize, JsValue> {
        get_or_init_state().with_object(&self.handle, |obj| match obj {
            Some(StoredObject::OCEL(ocel)) => Ok(ocel.objects.len()),
            Some(_) => Err(JsValue::from_str("Object is not an OCEL")),
            None => Err(JsValue::from_str("OCEL not found")),
        })
    }

    /// Get basic statistics as JSON
    pub fn stats(&self) -> Result<JsValue, JsValue> {
        get_or_init_state().with_object(&self.handle, |obj| match obj {
            Some(StoredObject::OCEL(ocel)) => {
                let stats = json!({
                    "event_count": ocel.events.len(),
                    "object_count": ocel.objects.len(),
                });
                to_js(&stats)
            }
            Some(_) => Err(JsValue::from_str("Object is not an OCEL")),
            None => Err(JsValue::from_str("OCEL not found")),
        })
    }
}

impl WasmOCEL {
    pub fn new(handle: String) -> Self {
        WasmOCEL { handle }
    }
}

/// Generic result for operations
#[wasm_bindgen]
pub struct OperationResult {
    success: bool,
    message: String,
    data: Option<String>,
}

#[wasm_bindgen]
impl OperationResult {
    pub fn is_success(&self) -> bool {
        self.success
    }

    pub fn message(&self) -> String {
        self.message.clone()
    }

    pub fn data(&self) -> Option<String> {
        self.data.clone()
    }
}

impl OperationResult {
    pub fn success(message: String, data: Option<String>) -> Self {
        OperationResult {
            success: true,
            message,
            data,
        }
    }

    pub fn error(message: String) -> Self {
        OperationResult {
            success: false,
            message,
            data: None,
        }
    }
}
