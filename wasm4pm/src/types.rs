use crate::state::{get_or_init_state, StoredObject};
use crate::utilities::to_js;
use serde_json::json;
use wasm_bindgen::prelude::*;

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
        get_or_init_state().with_event_log(&self.handle, |log| {
            let count = log.traces.iter().map(|t| t.events.len()).sum();
            Ok(count)
        })
    }

    /// Get the number of cases in the log
    pub fn case_count(&self) -> Result<usize, JsValue> {
        get_or_init_state().with_event_log(&self.handle, |log| Ok(log.traces.len()))
    }

    /// Get attributes count
    pub fn attribute_count(&self) -> Result<usize, JsValue> {
        get_or_init_state().with_event_log(&self.handle, |log| Ok(log.attributes.len()))
    }

    /// Get basic statistics as JSON
    pub fn stats(&self) -> Result<JsValue, JsValue> {
        get_or_init_state().with_event_log(&self.handle, |log| {
            let event_count: usize = log.traces.iter().map(|t| t.events.len()).sum();
            let stats = json!({
                "event_count": event_count,
                "case_count": log.traces.len(),
                "attribute_count": log.attributes.len(),
            });
            to_js(&stats)
        })
    }
}

#[wasm_bindgen]
impl WasmEventLog {
    #[wasm_bindgen(constructor)]
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
            Some(_) => Err(crate::error::js_val("Object is not an OCEL")),
            None => Err(crate::error::js_val("OCEL not found")),
        })
    }

    /// Get the number of objects in the OCEL
    pub fn object_count(&self) -> Result<usize, JsValue> {
        get_or_init_state().with_object(&self.handle, |obj| match obj {
            Some(StoredObject::OCEL(ocel)) => Ok(ocel.objects.len()),
            Some(_) => Err(crate::error::js_val("Object is not an OCEL")),
            None => Err(crate::error::js_val("OCEL not found")),
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
            Some(_) => Err(crate::error::js_val("Object is not an OCEL")),
            None => Err(crate::error::js_val("OCEL not found")),
        })
    }
}

#[wasm_bindgen]
impl WasmOCEL {
    #[wasm_bindgen(constructor)]
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
