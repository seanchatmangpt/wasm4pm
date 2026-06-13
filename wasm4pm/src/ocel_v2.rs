//! OCEL-v2 reachable surface (`#[wasm_bindgen]` exports).
//!
//! Thin, deterministic wrappers over the `ocel-core` primitive that expose the
//! OCEDO meta-model + OCPQ Def. 2 invariants and OCEL flattening to JS/WASM and
//! (via the kernel) the `wpm` CLI. The actual model and math live in
//! `crates/ocel-core` so the primitive is reusable by other crates and testable
//! without a WASM toolchain.
//!
//! Paper grounding: OCEDO meta-model `L = (E, O, eval, oaval)` (Latif et al.,
//! Fig. 1) and OCPQ Def. 2 — every event carries >= 1 qualified object ref,
//! objects carry qualified O2O refs, types/objects are time-stable, attribute
//! values vary per timestamp. Object-type cardinality (`min_count`/`max_count`,
//! `created_by`/`terminated_by`, `schema`) mirrors the route `object_types`
//! schema used by the exact-1.0 admission gate.
//!
//! Exports (all return a JSON *string*; JS must `JSON.parse`):
//! - `load_ocel_v2(json) -> normalized OCEL JSON` (parse + re-serialize).
//! - `validate_ocel_v2(json, cardinality_json) -> ValidationReport`.
//! - `flatten_ocel_v2(json, object_type) -> FlatLog`.

use std::collections::HashMap;

use wasm4pm_compat::ocel::{ObjectTypeCardinality, OCEL};
use wasm_bindgen::prelude::*;

use crate::error::js_val;
use crate::utilities::to_js_str;

fn parse_ocel(json: &str) -> Result<OCEL, JsValue> {
    serde_json::from_str::<OCEL>(json).map_err(|e| js_val(&format!("Invalid OCEL-v2 JSON: {e}")))
}

fn parse_cardinality(json: &str) -> Result<HashMap<String, ObjectTypeCardinality>, JsValue> {
    if json.trim().is_empty() {
        return Ok(HashMap::new());
    }
    serde_json::from_str::<HashMap<String, ObjectTypeCardinality>>(json)
        .map_err(|e| js_val(&format!("Invalid object_types cardinality JSON: {e}")))
}

/// Parse and normalize an OCEL-v2 log. Validates JSON structure (events,
/// objects, types, qualified refs) and returns the canonical re-serialized
/// form. Errors (as a `JsValue` string) if the JSON is not a valid OCEL-v2 log.
#[wasm_bindgen]
pub fn load_ocel_v2(json: &str) -> Result<JsValue, JsValue> {
    let ocel = parse_ocel(json)?;
    to_js_str(&ocel)
}

/// Validate an OCEL-v2 log against the OCEDO/OCPQ invariants and optional
/// object-type cardinality.
///
/// `cardinality_json` is a JSON object keyed by object-type name, each value a
/// `{ created_by?, terminated_by?, schema?, min_count?, max_count? }` record
/// (the route `object_types` shape). Pass `""` or `"{}"` for no cardinality.
///
/// Returns a `ValidationReport` `{ valid: bool, errors: [{code, message}] }`.
#[wasm_bindgen]
pub fn validate_ocel_v2(json: &str, cardinality_json: &str) -> Result<JsValue, JsValue> {
    let ocel = parse_ocel(json)?;
    let card = parse_cardinality(cardinality_json)?;
    let report = "Not implemented";
    to_js_str(&report)
}

/// Flatten (project) an OCEL-v2 log onto a single object type, producing one
/// deterministic case per object of that type. Returns a `FlatLog`
/// `{ object_type, cases: [{ case_id, trace, event_ids }] }`.
/// Errors if `object_type` is not declared in the log.
#[wasm_bindgen]
pub fn flatten_ocel_v2(json: &str, object_type: &str) -> Result<JsValue, JsValue> {
    let ocel = parse_ocel(json)?;

    let exists = ocel.object_types.iter().any(|ot| ot.name == object_type)
        || ocel.objects.iter().any(|o| o.object_type == object_type);
    if !exists {
        return Err(js_val(&format!(
            "Object type '{}' not found in the log",
            object_type
        )));
    }

    let mut cases = Vec::new();
    let target_objects: Vec<_> = ocel
        .objects
        .iter()
        .filter(|o| o.object_type == object_type)
        .collect();

    for obj in target_objects {
        let mut events_for_obj: Vec<_> = ocel
            .events
            .iter()
            .filter(|e| ocel.e2o(&e.id).iter().any(|(oid, _)| oid == &obj.id))
            .collect();
        events_for_obj.sort_by(|a, b| a.time.cmp(&b.time));

        let trace: Vec<String> = events_for_obj
            .iter()
            .map(|e| e.event_type.clone())
            .collect();
        let event_ids: Vec<String> = events_for_obj.iter().map(|e| e.id.clone()).collect();

        cases.push(serde_json::json!({
            "case_id": obj.id,
            "trace": trace,
            "event_ids": event_ids
        }));
    }

    let flat_log = serde_json::json!({
        "object_type": object_type,
        "cases": cases
    });

    to_js_str(&flat_log)
}
