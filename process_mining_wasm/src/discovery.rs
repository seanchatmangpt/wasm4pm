use wasm_bindgen::prelude::*;
use process_mining::{EventLog, OCEL};
use process_mining::discovery::case_centric::{alpha_plus_plus, discover_dfg};
use crate::state::{get_or_init_state, StoredObject};

/// Options for Alpha++ algorithm
#[wasm_bindgen]
pub struct AlphaPlusPlusOptions {
    #[wasm_bindgen(skip)]
    pub infrequent_threshold: usize,
}

#[wasm_bindgen]
impl AlphaPlusPlusOptions {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        AlphaPlusPlusOptions {
            infrequent_threshold: 0,
        }
    }

    pub fn with_threshold(mut self, threshold: usize) -> AlphaPlusPlusOptions {
        self.infrequent_threshold = threshold;
        self
    }
}

impl Default for AlphaPlusPlusOptions {
    fn default() -> Self {
        AlphaPlusPlusOptions {
            infrequent_threshold: 0,
        }
    }
}

/// Discover a Petri Net using the Alpha++ algorithm
#[wasm_bindgen]
pub fn discover_alpha_plus_plus(
    eventlog_handle: &str,
    infrequent_threshold: usize,
) -> Result<String, JsValue> {
    match get_or_init_state().get_object(eventlog_handle)? {
        Some(StoredObject::EventLog(log)) => {
            let petri_net = alpha_plus_plus(&log, infrequent_threshold)
                .map_err(|e| JsValue::from_str(&format!("Discovery failed: {}", e)))?;

            // Return JSON representation of the Petri net
            serde_json::to_string(&petri_net)
                .map_err(|e| JsValue::from_str(&format!("Serialization failed: {}", e)))
        }
        Some(_) => Err(JsValue::from_str("Object is not an EventLog")),
        None => Err(JsValue::from_str("EventLog not found")),
    }
}

/// Discover a Directly-Follows Graph (DFG) from an EventLog
#[wasm_bindgen]
pub fn discover_dfg_fn(eventlog_handle: &str) -> Result<String, JsValue> {
    match get_or_init_state().get_object(eventlog_handle)? {
        Some(StoredObject::EventLog(log)) => {
            let dfg = discover_dfg(&log);

            // Return JSON representation of the DFG
            serde_json::to_string(&dfg)
                .map_err(|e| JsValue::from_str(&format!("Serialization failed: {}", e)))
        }
        Some(_) => Err(JsValue::from_str("Object is not an EventLog")),
        None => Err(JsValue::from_str("EventLog not found")),
    }
}

/// Discover an Object-Centric DFG (OC-DFG) from an OCEL
#[wasm_bindgen]
pub fn discover_oc_dfg(ocel_handle: &str) -> Result<String, JsValue> {
    match get_or_init_state().get_object(ocel_handle)? {
        Some(StoredObject::OCEL(_ocel)) => {
            // Note: OCDirectlyFollowsGraph requires LinkedOCELAccess trait
            // For now, return a placeholder indicating the feature is in development
            serde_json::to_string(&serde_json::json!({
                "message": "OC-DFG discovery requires OCEL conversion - implementation in progress",
                "status": "pending"
            }))
            .map_err(|e| JsValue::from_str(&format!("Serialization failed: {}", e)))
        }
        Some(_) => Err(JsValue::from_str("Object is not an OCEL")),
        None => Err(JsValue::from_str("OCEL not found")),
    }
}

/// Discover DECLARE constraints from an EventLog
/// Note: This may not be fully implemented in the library yet
#[wasm_bindgen]
pub fn discover_declare(eventlog_handle: &str) -> Result<String, JsValue> {
    match get_or_init_state().get_object(eventlog_handle)? {
        Some(StoredObject::EventLog(_log)) => {
            // Return a placeholder for DECLARE discovery
            serde_json::to_string(&serde_json::json!({
                "constraints": [],
                "message": "DECLARE discovery not yet implemented"
            }))
            .map_err(|e| JsValue::from_str(&format!("Serialization failed: {}", e)))
        }
        Some(_) => Err(JsValue::from_str("Object is not an EventLog")),
        None => Err(JsValue::from_str("EventLog not found")),
    }
}

/// Discover Object-Centric DECLARE constraints from an OCEL
/// Note: This may not be fully implemented in the library yet
#[wasm_bindgen]
pub fn discover_oc_declare(ocel_handle: &str) -> Result<String, JsValue> {
    match get_or_init_state().get_object(ocel_handle)? {
        Some(StoredObject::OCEL(_ocel)) => {
            // Return a placeholder for OC-DECLARE discovery
            serde_json::to_string(&serde_json::json!({
                "constraints": [],
                "message": "OC-DECLARE discovery not yet implemented"
            }))
            .map_err(|e| JsValue::from_str(&format!("Serialization failed: {}", e)))
        }
        Some(_) => Err(JsValue::from_str("Object is not an OCEL")),
        None => Err(JsValue::from_str("OCEL not found")),
    }
}

/// Get list of available discovery algorithms
#[wasm_bindgen]
pub fn available_discovery_algorithms() -> String {
    serde_json::json!({
        "algorithms": [
            {
                "name": "alpha_plus_plus",
                "description": "Alpha++ algorithm for discovering Petri nets from event logs",
                "input_type": "EventLog",
                "output_type": "PetriNet",
                "parameters": [
                    {
                        "name": "infrequent_threshold",
                        "type": "integer",
                        "default": 0,
                        "description": "Threshold for filtering infrequent edges"
                    }
                ]
            },
            {
                "name": "dfg",
                "description": "Directly-Follows Graph discovery from event logs",
                "input_type": "EventLog",
                "output_type": "DFG",
                "parameters": []
            },
            {
                "name": "oc_dfg",
                "description": "Object-Centric Directly-Follows Graph discovery from OCEL",
                "input_type": "OCEL",
                "output_type": "OC_DFG",
                "parameters": []
            },
            {
                "name": "declare",
                "description": "DECLARE constraint discovery from event logs",
                "input_type": "EventLog",
                "output_type": "DeclareModel",
                "parameters": []
            },
            {
                "name": "oc_declare",
                "description": "Object-Centric DECLARE discovery from OCEL",
                "input_type": "OCEL",
                "output_type": "OCDeclareModel",
                "parameters": []
            }
        ]
    })
    .to_string()
}
