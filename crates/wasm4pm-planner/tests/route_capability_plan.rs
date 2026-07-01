//! Integration test for the `route_capability_plan` MCP tool's underlying
//! library function, proving the three properties the tool contract
//! depends on. A direct library-level test is sufficient for this stage;
//! see `capability_router.rs`'s own unit tests for the established pattern
//! this test follows (in particular: asserting the specific non-overlap
//! guarantee for the conflicting pair, not a global parallelism count).

use wasm4pm_planner::{route_capability_plan, CapabilityTask, DesiredEffect};

#[test]
fn route_capability_plan_covers_admit_sequence_and_refuse() {
    // (a) Disjoint files, attention_capacity 2 -> admitted.
    let disjoint = CapabilityTask {
        desired_effects: vec![
            DesiredEffect::Edited("f1".to_string()),
            DesiredEffect::FormFilled("f2".to_string()),
        ],
        attention_capacity: 2,
    };
    let disjoint_receipt = route_capability_plan(&disjoint).expect("routing should succeed");
    assert!(
        disjoint_receipt.admitted,
        "disjoint-file task under capacity 2 should be admitted, refusal_reason={:?}",
        disjoint_receipt.refusal_reason
    );

    // (b) Same file, edit + draft -> admitted, and the two conflicting
    // steps do not overlap in time (not a global parallelism assertion).
    let conflict = CapabilityTask {
        desired_effects: vec![
            DesiredEffect::Edited("f1".to_string()),
            DesiredEffect::Drafted("f1".to_string()),
        ],
        attention_capacity: 2,
    };
    let conflict_receipt = route_capability_plan(&conflict).expect("routing should succeed");
    assert!(
        conflict_receipt.admitted,
        "same-file edit+draft task should be admitted, refusal_reason={:?}",
        conflict_receipt.refusal_reason
    );
    let interval = |name: &str| -> (f64, f64) {
        let s = conflict_receipt
            .plan
            .steps
            .iter()
            .find(|s| s.action_name == name)
            .unwrap_or_else(|| panic!("expected a {name} step in the plan"));
        (s.start_time, s.start_time + s.duration)
    };
    let edit = interval("claude-code-edit-file");
    let draft = interval("claude-desktop-draft");
    let overlaps = edit.0 < draft.1 && draft.0 < edit.1;
    assert!(
        !overlaps,
        "edit and draft on the same file must be sequenced: edit={edit:?} draft={draft:?}"
    );

    // (c) attention_capacity 0 -> admitted false with a refusal_reason, not a crash.
    let starved = CapabilityTask {
        desired_effects: vec![DesiredEffect::Edited("f1".to_string())],
        attention_capacity: 0,
    };
    let starved_receipt =
        route_capability_plan(&starved).expect("route_capability_plan itself should not error");
    assert!(
        !starved_receipt.admitted,
        "zero attention capacity must refuse, not silently default a route"
    );
    assert!(starved_receipt.refusal_reason.is_some());
}
