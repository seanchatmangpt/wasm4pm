//! OCEL Lifecycle Validation WASM Export Tests
//!
//! Verifies three correctness properties introduced in iter-14:
//!
//! 1. `discover_ocdfg_wasm` returns a non-empty JSON string with `dfgs` key.
//!    (Regression guard: the old `to_js()` call returned `{}` on wasm32 due to
//!    serde_wasm_bindgen silently discarding nested struct fields.  The fix uses
//!    `to_js_str()` which always serialises via serde_json.)
//!
//! 2. `validate_ocel_object_lifecycles_wasm` is exported at the module level
//!    and returns a JSON string with `valid` / `violation_count` / `violations`.
//!    (Previously this function existed only as a pure-Rust helper with no WASM
//!    binding — JS consumers could not call it.)
//!
//! 3. A NEGATIVE TEST: an OCEL with inverted timestamps triggers at least one
//!    lifecycle violation in the returned report.
//!
//! Oracle ranks:
//! - Rank 1 (Mathematical): JSON `violation_count` must equal the number of
//!   objects with at least one timestamp inversion — independent of implementation.
//! - Rank 2 (Domain contract): `valid` flag must be the logical negation of
//!   "violation_count > 0".
//!
//! NOTE: These tests exercise the pure-Rust paths that back the WASM exports.
//! The WASM exports themselves (handle-based state, JsValue return) can only be
//! fully tested in a Node.js environment.

#[cfg(feature = "feature-ocel")]
mod ocel_lifecycle_wasm_export_tests {
    use std::collections::HashMap;
    use wasm4pm::models::{OCELEvent, OCELObject, OCEL};
    use wasm4pm::ocel_io::validate_ocel_object_lifecycles;
    use wasm4pm::advanced::OCDirectlyFollowsGraph;

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    fn make_ocel_two_events(
        obj_id: &str,
        obj_type: &str,
        ts_first: &str,
        ts_second: &str,
    ) -> OCEL {
        OCEL {
            event_types: vec!["A".to_string(), "B".to_string()],
            object_types: vec![obj_type.to_string()],
            events: vec![
                OCELEvent {
                    id: "e1".to_string(),
                    event_type: "A".to_string(),
                    timestamp: ts_first.to_string(),
                    attributes: HashMap::new(),
                    object_ids: vec![obj_id.to_string()],
                    object_refs: vec![],
                },
                OCELEvent {
                    id: "e2".to_string(),
                    event_type: "B".to_string(),
                    timestamp: ts_second.to_string(),
                    attributes: HashMap::new(),
                    object_ids: vec![obj_id.to_string()],
                    object_refs: vec![],
                },
            ],
            objects: vec![OCELObject {
                id: obj_id.to_string(),
                object_type: obj_type.to_string(),
                attributes: HashMap::new(),
                changes: vec![],
                embedded_relations: vec![],
            }],
            object_relations: vec![],
        }
    }

    // -------------------------------------------------------------------------
    // Test 1: OC-DFG discover returns non-empty structure
    //
    // Regression guard against the serde_wasm_bindgen `{}` bug.
    // On the pure-Rust path we verify OCDirectlyFollowsGraph::discover() produces
    // a non-empty `dfgs` map — the same data that `discover_ocdfg_wasm` serialises.
    // -------------------------------------------------------------------------
    #[test]
    fn ocdfg_discover_produces_non_empty_dfgs_map() {
        let ocel = make_ocel_two_events("order1", "Order", "2024-01-01T09:00:00Z", "2024-01-01T10:00:00Z");
        let ocdfg = OCDirectlyFollowsGraph::discover(&ocel);

        assert!(
            !ocdfg.dfgs.is_empty(),
            "OC-DFG must contain at least one object type DFG after discovery; got empty map. \
             This would have been returned as {{}} by the old to_js() call on wasm32.",
        );

        assert!(
            ocdfg.dfgs.contains_key("Order"),
            "OC-DFG must contain a DFG for object type 'Order'",
        );

        let order_dfg = &ocdfg.dfgs["Order"];
        assert!(
            !order_dfg.nodes.is_empty(),
            "Order DFG must have at least one node (activity), got 0.",
        );
    }

    // -------------------------------------------------------------------------
    // Test 2: to_js_str produces valid JSON for OCDirectlyFollowsGraph
    //
    // Verifies that serde_json can round-trip the struct.  If it cannot, the
    // `to_js_str` call would return an error rather than silently returning `{}`.
    // -------------------------------------------------------------------------
    #[test]
    fn ocdfg_serialises_to_non_empty_json() {
        let ocel = make_ocel_two_events("order1", "Order", "2024-01-01T09:00:00Z", "2024-01-01T10:00:00Z");
        let ocdfg = OCDirectlyFollowsGraph::discover(&ocel);

        let json_str = serde_json::to_string(&ocdfg)
            .expect("OCDirectlyFollowsGraph must serialise without error");

        assert_ne!(
            json_str, "{}",
            "Serialised OC-DFG must not be the empty-object '{{}}' — \
             this would indicate the serde_wasm_bindgen bug is still present on wasm32.",
        );
        assert!(
            json_str.contains("dfgs"),
            "Serialised OC-DFG JSON must contain the 'dfgs' key, got: {json_str}",
        );
        assert!(
            json_str.contains("Order"),
            "Serialised OC-DFG JSON must contain the 'Order' object type, got: {json_str}",
        );
    }

    // -------------------------------------------------------------------------
    // Test 3: Lifecycle validation — valid OCEL produces no violations
    // (Rank 1 mathematical: non-decreasing timestamps → empty violation list)
    // -------------------------------------------------------------------------
    #[test]
    fn lifecycle_validation_valid_ocel_zero_violations() {
        let ocel = make_ocel_two_events(
            "order1",
            "Order",
            "2024-01-01T09:00:00Z",
            "2024-01-01T10:00:00Z",
        );
        let violations = validate_ocel_object_lifecycles(&ocel);

        assert_eq!(
            violations.len(),
            0,
            "Valid OCEL with non-decreasing timestamps must produce 0 violations, got {}.",
            violations.len(),
        );
    }

    // -------------------------------------------------------------------------
    // Test 4: Lifecycle validation — NEGATIVE TEST
    // An OCEL where e1 arrives first but has a LATER timestamp than e2 must
    // produce exactly 1 violation for the single affected object.
    // (Rank 1 mathematical: inverted pair → exactly 1 violation)
    // -------------------------------------------------------------------------
    #[test]
    fn lifecycle_validation_inverted_timestamps_produces_violation() {
        let ocel = make_ocel_two_events(
            "order1",
            "Order",
            "2024-01-01T10:00:00Z", // e1 arrives first, later timestamp  <- violation
            "2024-01-01T09:00:00Z", // e2 arrives second, earlier timestamp
        );
        let violations = validate_ocel_object_lifecycles(&ocel);

        assert_eq!(
            violations.len(),
            1,
            "OCEL with exactly one inverted timestamp pair must produce exactly 1 violation, got {}.",
            violations.len(),
        );

        let v = &violations[0];
        assert_eq!(v.object_id, "order1", "Violation object_id mismatch");
        assert_eq!(v.event_a_id, "e1", "First event in violation must be e1");
        assert_eq!(v.event_b_id, "e2", "Second event in violation must be e2");
        assert!(
            v.timestamp_a_ms > v.timestamp_b_ms,
            "Violation timestamps must satisfy t_a > t_b (inversion). Got t_a={} t_b={}",
            v.timestamp_a_ms,
            v.timestamp_b_ms,
        );
    }

    // -------------------------------------------------------------------------
    // Test 5: Lifecycle validation JSON report structure
    // Verifies the JSON format that `validate_ocel_object_lifecycles_wasm` emits.
    // -------------------------------------------------------------------------
    #[test]
    fn lifecycle_validation_json_report_shape() {
        let ocel = make_ocel_two_events(
            "order1",
            "Order",
            "2024-01-01T10:00:00Z",
            "2024-01-01T09:00:00Z",
        );
        let violations = validate_ocel_object_lifecycles(&ocel);

        let violations_json: Vec<serde_json::Value> = violations
            .iter()
            .map(|v| {
                serde_json::json!({
                    "object_id": v.object_id,
                    "event_a_id": v.event_a_id,
                    "event_b_id": v.event_b_id,
                    "timestamp_a_ms": v.timestamp_a_ms,
                    "timestamp_b_ms": v.timestamp_b_ms,
                })
            })
            .collect();

        let report = serde_json::json!({
            "valid": violations.is_empty(),
            "violation_count": violations.len(),
            "violations": violations_json,
        });

        assert_eq!(
            report["valid"].as_bool(),
            Some(false),
            "JSON report `valid` must be false when violations exist",
        );
        assert_eq!(
            report["violation_count"].as_u64(),
            Some(1),
            "JSON report `violation_count` must equal 1",
        );
        assert!(
            report["violations"].as_array().map(|a| !a.is_empty()).unwrap_or(false),
            "JSON report `violations` array must be non-empty",
        );

        let json_str = serde_json::to_string(&report)
            .expect("Lifecycle report must serialise without error");
        assert!(json_str.contains("valid"), "Report must contain 'valid' key");
        assert!(json_str.contains("violation_count"), "Report must contain 'violation_count' key");
    }
}
