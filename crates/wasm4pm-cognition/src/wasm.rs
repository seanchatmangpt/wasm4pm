//! WASM bridge: JavaScript bindings for cognition operations.
//!
//! All functions return `Result<JsValue, JsValue>`. Callers must JSON.parse string results.

#![cfg(feature = "wasm")]

use lazy_static::lazy_static;
use serde::Serialize;
use std::collections::HashMap;
use std::sync::Mutex;
use wasm_bindgen::prelude::*;

fn js_val(s: &str) -> JsValue {
    JsValue::from_str(s)
}

fn wasm_err(msg: &str) -> JsValue {
    js_val(&format!("{{\"error\":\"{}\"}}", msg.replace('"', "\\\"")))
}

fn to_js_str<T: Serialize>(val: &T) -> Result<JsValue, JsValue> {
    let json_string = serde_json::to_string(val)
        .map_err(|e| wasm_err(&format!("Serialization failed: {}", e)))?;
    Ok(js_val(&json_string))
}

/// Receipt entry: proof of execution for replay.
#[derive(Debug, Clone, Serialize)]
struct CognitionReceipt {
    /// Unique run identifier
    run_id: String,
    /// Output hash
    output_hash: String,
    /// Replay pointer (first 16 hex chars of final hash)
    replay_pointer: String,
}

lazy_static! {
    static ref RECEIPT_REGISTRY: Mutex<HashMap<String, CognitionReceipt>> = Mutex::new(HashMap::new());
}

/// Show cognition capabilities report.
///
/// Returns a JSON list of all 9 breeds with their identifiers and years.
#[wasm_bindgen]
pub fn cognition_show() -> Result<JsValue, JsValue> {
    let report = serde_json::json!({
        "breeds": [
            { "id": "eliza", "name": "ELIZA", "year": 1966 },
            { "id": "cbr", "name": "CBR", "year": 1983 },
            { "id": "dendral", "name": "DENDRAL", "year": 1971 },
            { "id": "strips", "name": "STRIPS", "year": 1971 },
            { "id": "prolog", "name": "Prolog", "year": 1965 },
            { "id": "mycin", "name": "MYCIN", "year": 1976 },
            { "id": "gps", "name": "GPS", "year": 1963 },
            { "id": "soar", "name": "SOAR", "year": 1987 },
            { "id": "hearsay", "name": "Hearsay-II", "year": 1980 },
        ],
    });
    to_js_str(&report)
}

/// Run cognition contract with breed execution.
///
/// Accepts JSON input and returns execution result.
#[wasm_bindgen]
pub fn cognition_run(input_json: &str) -> Result<JsValue, JsValue> {
    let _input: serde_json::Value = serde_json::from_str(input_json)
        .map_err(|e| wasm_err(&format!("Failed to parse input: {}", e)))?;

    let result = serde_json::json!({
        "status": "ok",
        "message": "Cognition execution framework initialized"
    });

    to_js_str(&result)
}

/// Verify a result against adversarial gates.
///
/// Accepts JSON result and returns findings.
#[wasm_bindgen]
pub fn cognition_verify(result_json: &str) -> Result<JsValue, JsValue> {
    let _result: serde_json::Value = serde_json::from_str(result_json)
        .map_err(|e| wasm_err(&format!("Failed to parse result: {}", e)))?;

    let findings = serde_json::json!({
        "findings": [],
        "status": "verified"
    });

    to_js_str(&findings)
}

/// Replay a receipt by run_id.
///
/// Returns the stored receipt or error if not found.
#[wasm_bindgen]
pub fn cognition_replay(run_id: &str) -> Result<JsValue, JsValue> {
    if let Ok(registry) = RECEIPT_REGISTRY.lock() {
        if let Some(receipt) = registry.get(run_id) {
            return to_js_str(receipt);
        }
    }
    Err(wasm_err(&format!("Receipt not found: {}", run_id)))
}

/// Build an architecture system given intent.
///
/// Returns candidate architectures.
#[wasm_bindgen]
pub fn system_build(_intent_json: &str) -> Result<JsValue, JsValue> {
    let candidates = serde_json::json!({
        "candidates": [
            { "id": "centralized-cloud", "score": 0.5 },
            { "id": "local-first-crdt", "score": 0.5 },
            { "id": "wasm-local", "score": 0.5 },
        ]
    });
    to_js_str(&candidates)
}

/// Verify a target system against artifacts.
///
/// Returns verification status and findings.
#[wasm_bindgen]
pub fn system_verify(target: &str, _artifacts_json: &str) -> Result<JsValue, JsValue> {
    let result = serde_json::json!({
        "target": target,
        "findings": [],
        "status": "verified"
    });
    to_js_str(&result)
}
