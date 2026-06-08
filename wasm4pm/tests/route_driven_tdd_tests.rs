//! Phase 8 — Route-Driven TDD integration tests.
//!
//! Uses [`PowlTestHarness`] explicitly (no proc-macros). Verifies that:
//! - A conforming trace produces [`ConformanceVerdict::Passed`] (all 5 proof
//!   dimensions are measured and meet the 1.0 threshold)
//! - A gap trace (missing activities) produces an [`AndonPull`]
//! - A missing model file returns [`AndonPull::TestRouteIncomplete`]
//!
//! Run: `cargo test --test route_driven_tdd_tests --features browser`

use wasm4pm::testing::{
    ActivityEvidence, AndonPull, ConformanceVerdict, ObjectEvidence, PowlTestHarness,
};

fn bh(data: &str) -> String {
    blake3::hash(data.as_bytes()).to_hex().to_string()
}

fn model(name: &str) -> String {
    format!("{}/routes/test-harness/{name}", env!("CARGO_MANIFEST_DIR"))
}

// ─────────────────────────────────────────────────────────────────────────────
// Sequential two-step model: A → B
// ─────────────────────────────────────────────────────────────────────────────

#[test]
fn conforming_sequential_trace_passes() {
    let mut harness =
        PowlTestHarness::new("sequential-ab-route").model(model("sequential-two-step.powl.json"));
    harness
        .complete_activity(
            ActivityEvidence::new("A")
                .with_outputs(vec![ObjectEvidence::new("a-out", bh("A:output"))]),
        )
        .unwrap();
    harness
        .complete_activity(
            ActivityEvidence::new("B")
                .with_inputs(vec![ObjectEvidence::new("a-out", bh("A:output"))])
                .with_outputs(vec![ObjectEvidence::new("b-out", bh("B:output"))]),
        )
        .unwrap();
    assert_eq!(
        harness.finish(),
        ConformanceVerdict::Passed,
        "conforming A→B with evidence must return Passed"
    );
}

#[test]
fn empty_trace_fires_andon_against_sequential_model() {
    let h = PowlTestHarness::new("empty-route").model(model("sequential-two-step.powl.json"));
    let verdict = h.finish();
    assert!(
        matches!(verdict, ConformanceVerdict::Andon(_)),
        "empty trace must fire AndonPull, got: {verdict:?}"
    );
}

#[test]
fn missing_second_activity_fires_andon() {
    let mut h = PowlTestHarness::new("partial-route").model(model("sequential-two-step.powl.json"));
    h.record_activity("A");
    let verdict = h.finish();
    assert!(
        matches!(verdict, ConformanceVerdict::Andon(_)),
        "partial trace (A only) must fire AndonPull, got: {verdict:?}"
    );
}

#[test]
fn reversed_activities_fires_andon() {
    let mut h =
        PowlTestHarness::new("reversed-route").model(model("sequential-two-step.powl.json"));
    h.record_activity("B");
    h.record_activity("A");
    let verdict = h.finish();
    assert!(
        matches!(verdict, ConformanceVerdict::Andon(_)),
        "reversed trace B→A must fire AndonPull against A→B model, got: {verdict:?}"
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sequential three-step model: A → B → C
// ─────────────────────────────────────────────────────────────────────────────

#[test]
fn conforming_three_step_trace_passes() {
    let mut harness =
        PowlTestHarness::new("three-step-route").model(model("sequential-three-step.powl.json"));
    harness
        .complete_activity(
            ActivityEvidence::new("A")
                .with_outputs(vec![ObjectEvidence::new("a-out", bh("A:output"))]),
        )
        .unwrap();
    harness
        .complete_activity(
            ActivityEvidence::new("B")
                .with_inputs(vec![ObjectEvidence::new("a-out", bh("A:output"))])
                .with_outputs(vec![ObjectEvidence::new("b-out", bh("B:output"))]),
        )
        .unwrap();
    harness
        .complete_activity(
            ActivityEvidence::new("C")
                .with_inputs(vec![ObjectEvidence::new("b-out", bh("B:output"))])
                .with_outputs(vec![ObjectEvidence::new("c-out", bh("C:output"))]),
        )
        .unwrap();
    assert_eq!(
        harness.finish(),
        ConformanceVerdict::Passed,
        "conforming A→B→C with evidence must return Passed"
    );
}

#[test]
fn missing_middle_activity_fires_andon_on_three_step() {
    let mut h = PowlTestHarness::new("gap-three-step-route")
        .model(model("sequential-three-step.powl.json"));
    h.record_activity("A");
    h.record_activity("C"); // B skipped
    let verdict = h.finish();
    assert!(
        matches!(verdict, ConformanceVerdict::Andon(_)),
        "skipping B in A→B→C must fire AndonPull, got: {verdict:?}"
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Concurrent model: {A, B} (no ordering constraint)
// ─────────────────────────────────────────────────────────────────────────────

#[test]
fn conforming_concurrent_trace_ab_passes() {
    let mut harness =
        PowlTestHarness::new("concurrent-ab-route").model(model("concurrent-two-step.powl.json"));
    // A and B are concurrent — neither is input to the other.
    harness
        .complete_activity(
            ActivityEvidence::new("A")
                .with_outputs(vec![ObjectEvidence::new("a-out", bh("A:output"))]),
        )
        .unwrap();
    harness
        .complete_activity(
            ActivityEvidence::new("B")
                .with_outputs(vec![ObjectEvidence::new("b-out", bh("B:output"))]),
        )
        .unwrap();
    assert_eq!(
        harness.finish(),
        ConformanceVerdict::Passed,
        "concurrent A,B with evidence must return Passed"
    );
}

#[test]
fn conforming_concurrent_trace_ba_passes() {
    let mut harness =
        PowlTestHarness::new("concurrent-ba-route").model(model("concurrent-two-step.powl.json"));
    harness
        .complete_activity(
            ActivityEvidence::new("B")
                .with_outputs(vec![ObjectEvidence::new("b-out", bh("B:output"))]),
        )
        .unwrap();
    harness
        .complete_activity(
            ActivityEvidence::new("A")
                .with_outputs(vec![ObjectEvidence::new("a-out", bh("A:output"))]),
        )
        .unwrap();
    assert_eq!(
        harness.finish(),
        ConformanceVerdict::Passed,
        "concurrent B,A with evidence must return Passed"
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Model file errors
// ─────────────────────────────────────────────────────────────────────────────

#[test]
fn missing_model_file_returns_incomplete() {
    let h = PowlTestHarness::new("missing-route").model("/nonexistent/model.powl.json");
    assert_eq!(
        h.finish(),
        ConformanceVerdict::Andon(AndonPull::TestRouteIncomplete),
        "missing model file must return TestRouteIncomplete"
    );
}

#[test]
fn no_model_set_returns_incomplete() {
    let mut h = PowlTestHarness::new("no-model-route");
    h.record_activity("A");
    assert_eq!(
        h.finish(),
        ConformanceVerdict::Andon(AndonPull::TestRouteIncomplete),
        "harness without model path must return TestRouteIncomplete"
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// OCEL export side-channel (harness emits evidence regardless of verdict)
// ─────────────────────────────────────────────────────────────────────────────

#[test]
fn ocel_export_contains_route_id_and_events() {
    let mut h =
        PowlTestHarness::new("evidence-route").model(model("sequential-two-step.powl.json"));
    h.record_activity("A");
    h.record_activity("B");

    let ocel = h.export_ocel();
    assert_eq!(ocel["routeId"], "evidence-route");
    let events = ocel["events"].as_array().unwrap();
    assert_eq!(events.len(), 2);
    assert_eq!(events[0]["type"], "A");
    assert_eq!(events[1]["type"], "B");
}

#[test]
fn ocel_is_exported_even_when_verdict_is_andon() {
    let h = PowlTestHarness::new("andon-route").model(model("sequential-two-step.powl.json"));
    // No activities recorded — will produce AndonPull
    let ocel = h.export_ocel();
    assert_eq!(ocel["routeId"], "andon-route");
    assert_eq!(ocel["ocelVersion"], "2.0");
    // events array is empty but the document is still valid
    assert!(ocel["events"].as_array().is_some());
}
