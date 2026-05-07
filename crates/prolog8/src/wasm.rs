//! WASM ABI — ARD section 13.
//!
//! Byte-buffer oriented surface. No source text accepted at the kernel
//! boundary; callers serialize `QueryAtom8` etc. via `serde_json::to_string`
//! and pass strings; on the Rust side we deserialize and run admission.

#![cfg(feature = "wasm")]

use crate::admission::RejectionCode;
use crate::catalog::Catalog;
use crate::kernel::{Kernel, QueryResult};
use crate::types::QueryAtom8;
use serde_json::json;
use wasm_bindgen::prelude::*;

const MAX_INPUT_LEN: usize = 10 * 1024 * 1024;

fn js_err(message: &str) -> JsValue {
    JsValue::from_str(&serde_json::to_string(&json!({"error": message})).unwrap())
}

fn to_js_str<T: serde::Serialize>(v: &T) -> Result<JsValue, JsValue> {
    serde_json::to_string(v)
        .map(|s| JsValue::from_str(&s))
        .map_err(|e| js_err(&format!("serialize: {e}")))
}

/// Capability report.
#[wasm_bindgen]
pub fn prolog8_show() -> Result<JsValue, JsValue> {
    to_js_str(&json!({
        "engine": crate::ENGINE_NAME,
        "version": crate::ENGINE_VERSION,
        "caps": {
            "arity": crate::ARITY_CAP,
            "body": crate::BODY_CAP,
            "vars": crate::VAR_CAP,
            "binding_patterns": crate::BINDING_PATTERNS,
        }
    }))
}

/// Evaluate a query.
///
/// Input JSON shape:
/// ```json
/// {
///   "catalog": { /* serialized Catalog */ },
///   "facts":   [ /* FactBlock8 */ ],
///   "rules":   [ /* Rule8 */ ],
///   "query":   { /* QueryAtom8 */ }
/// }
/// ```
#[wasm_bindgen]
pub fn prolog8_query(input_json: &str) -> Result<JsValue, JsValue> {
    if input_json.len() > MAX_INPUT_LEN {
        return Err(js_err(&format!(
            "input exceeds {MAX_INPUT_LEN} bytes (got {})",
            input_json.len()
        )));
    }

    #[derive(serde::Deserialize)]
    #[serde(deny_unknown_fields)]
    struct Input {
        catalog: Catalog,
        #[serde(default)]
        facts: Vec<crate::types::FactBlock8>,
        #[serde(default)]
        rules: Vec<crate::types::Rule8>,
        query: QueryAtom8,
    }

    let parsed: Input =
        serde_json::from_str(input_json).map_err(|e| js_err(&format!("schema rejected: {e}")))?;

    let mut kernel = Kernel::new(parsed.catalog);
    for block in parsed.facts {
        kernel
            .load_facts(block)
            .map_err(|c| js_err(&format!("fact admission rejected: {:?}", c)))?;
    }
    for rule in parsed.rules {
        kernel
            .load_rule(rule)
            .map_err(|c| js_err(&format!("rule admission rejected: {:?}", c)))?;
    }

    let result = kernel.query(&parsed.query);
    to_js_str(&result)
}

/// Replay a receipt.
#[wasm_bindgen]
pub fn prolog8_replay(input_json: &str) -> Result<JsValue, JsValue> {
    if input_json.len() > MAX_INPUT_LEN {
        return Err(js_err("input exceeds 10MiB"));
    }

    #[derive(serde::Deserialize)]
    #[serde(deny_unknown_fields)]
    struct Input {
        catalog: Catalog,
        #[serde(default)]
        facts: Vec<crate::types::FactBlock8>,
        #[serde(default)]
        rules: Vec<crate::types::Rule8>,
        query: QueryAtom8,
        receipt: crate::types::Receipt,
    }
    let parsed: Input =
        serde_json::from_str(input_json).map_err(|e| js_err(&format!("schema: {e}")))?;
    let mut kernel = Kernel::new(parsed.catalog);
    for block in parsed.facts {
        kernel
            .load_facts(block)
            .map_err(|c: RejectionCode| js_err(&format!("{:?}", c)))?;
    }
    for rule in parsed.rules {
        kernel
            .load_rule(rule)
            .map_err(|c: RejectionCode| js_err(&format!("{:?}", c)))?;
    }
    let status = crate::replay::replay(&kernel, &parsed.query, &parsed.receipt);
    to_js_str(&status)
}
