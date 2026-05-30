//! OCEL-v2 reachable-surface tests (`wasm4pm::ocel_v2` exports).
//!
//! These exercise the `#[wasm_bindgen]` wrappers `load_ocel_v2`,
//! `validate_ocel_v2`, `flatten_ocel_v2` on the NATIVE target. On native,
//! `to_js_str` returns `JsValue::null()` (the documented serialization path is
//! only exercised under wasm32), so we cannot inspect the returned JSON string
//! here — content correctness is proven by `crates/ocel-core/tests/ocel_v2.rs`
//! (whose oracle is the OCEDO/OCPQ math) and by the Node.js WASM smoke check.
//!
//! What IS observable on native and what these tests assert:
//! - lawful input yields `Ok(_)` from each export (the wiring + parse path runs);
//! - unlawful JSON yields `Err(_)` (errors propagate before serialization);
//! - an unknown flatten target yields `Err(_)`.
//!
//! This proves the export module compiles against `ocel-core` and that the
//! reachable surface refuses malformed input — the anti-FAKE-LIVE "reachable"
//! leg of the ALIVE rule. The substantive validation/flatten oracles live in
//! the ocel-core integration tests.

#![cfg(feature = "ocel")]

use wasm4pm::ocel_v2::{flatten_ocel_v2, load_ocel_v2, validate_ocel_v2};

const ORDER_TO_CASH: &str = r#"
{
  "eventTypes": [{"name": "place_order"}, {"name": "ship"}],
  "objectTypes": [{"name": "Order"}, {"name": "Customer"}],
  "objects": [
    {"id": "c1", "type": "Customer", "attributes": [], "relationships": []},
    {"id": "o1", "type": "Order", "attributes": [], "relationships": [{"objectId": "c1", "qualifier": "placed_by"}]}
  ],
  "events": [
    {"id": "ev1", "type": "place_order", "time": "2024-01-02T09:00:00Z", "attributes": [],
     "relationships": [{"objectId": "o1", "qualifier": "order"}, {"objectId": "c1", "qualifier": "customer"}]},
    {"id": "ev2", "type": "ship", "time": "2024-01-03T10:00:00Z", "attributes": [],
     "relationships": [{"objectId": "o1", "qualifier": "order"}]}
  ]
}
"#;

#[test]
fn load_ocel_v2_accepts_lawful_log() {
    assert!(load_ocel_v2(ORDER_TO_CASH).is_ok());
}

#[test]
fn load_ocel_v2_rejects_malformed_json() {
    assert!(load_ocel_v2("{ not json").is_err());
    // Missing required eventTypes key -> deserialization error.
    assert!(load_ocel_v2("{}").is_err());
}

#[test]
fn validate_ocel_v2_accepts_lawful_log_no_cardinality() {
    assert!(validate_ocel_v2(ORDER_TO_CASH, "").is_ok());
    assert!(validate_ocel_v2(ORDER_TO_CASH, "{}").is_ok());
}

#[test]
fn validate_ocel_v2_accepts_cardinality_window() {
    let card = r#"{"Order": {"min_count": 1, "max_count": 1}}"#;
    assert!(validate_ocel_v2(ORDER_TO_CASH, card).is_ok());
}

#[test]
fn validate_ocel_v2_rejects_bad_cardinality_json() {
    assert!(validate_ocel_v2(ORDER_TO_CASH, "{ not json").is_err());
}

#[test]
fn flatten_ocel_v2_accepts_declared_type() {
    assert!(flatten_ocel_v2(ORDER_TO_CASH, "Order").is_ok());
    assert!(flatten_ocel_v2(ORDER_TO_CASH, "Customer").is_ok());
}

#[test]
fn flatten_ocel_v2_rejects_unknown_type() {
    assert!(flatten_ocel_v2(ORDER_TO_CASH, "Nope").is_err());
}

#[test]
fn flatten_ocel_v2_rejects_malformed_json() {
    assert!(flatten_ocel_v2("{ bad", "Order").is_err());
}
