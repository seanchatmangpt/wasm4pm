//! Phase 10 — Self-conformance test.
//!
//! The test harness tests itself. Each test instruments its own execution
//! using [`PowlTestHarness`] and verifies it against a declared lifecycle
//! model. This proves that `wasm4pm::testing` is not just a claim layer —
//! the testing substrate follows its own declared route.
//!
//! Run: `cargo test --test self_conformance_tests --features browser`

use wasm4pm::testing::{ConformanceVerdict, PowlTestHarness};

fn model(name: &str) -> String {
    format!("{}/routes/test-harness/{name}", env!("CARGO_MANIFEST_DIR"))
}

// ─────────────────────────────────────────────────────────────────────────────
// Self-conformance: the test lifecycle route
// ─────────────────────────────────────────────────────────────────────────────

/// A test instruments its own lifecycle activities, then verifies they form
/// a lawful route. This is the maximalist anti-fake guarantee: even the
/// harness itself must prove conformance.
#[test]
fn test_harness_follows_its_own_declared_route() {
    let mut h = PowlTestHarness::new("test-lifecycle-route")
        .model(model("test-lifecycle.powl.json"));

    h.record_activity("test.started");

    // Simulate the command phase
    let command_result = simulate_command("discover_dfg", &["concept:name"]);
    h.record_activity("command.executed");

    // Simulate capturing output
    let captured = capture_output(command_result);
    h.record_activity("output.captured");

    // Run assertion against captured output
    assert!(!captured.is_empty(), "command should produce non-empty output");
    h.record_activity("assertion.checked");

    h.record_activity("test.completed");

    assert_eq!(
        h.finish(),
        ConformanceVerdict::Passed,
        "test lifecycle route with all activities must return Passed"
    );
}

/// A gap in the route (skipping output.captured) produces an AndonPull.
/// This proves that skipping test phases is detected by the model.
#[test]
fn skipping_output_capture_fires_andon() {
    let mut h = PowlTestHarness::new("incomplete-lifecycle-route")
        .model(model("test-lifecycle.powl.json"));

    h.record_activity("test.started");
    h.record_activity("command.executed");
    // output.captured is SKIPPED
    h.record_activity("assertion.checked");
    h.record_activity("test.completed");

    let verdict = h.finish();
    assert!(
        matches!(verdict, ConformanceVerdict::Andon(_)),
        "skipping output.captured must fire AndonPull, got: {verdict:?}"
    );
}

/// Completely skipping command execution fires AndonPull at the
/// RouteConformanceGap level (fitness < 1.0 due to missing tokens).
#[test]
fn jumping_directly_to_completion_fires_andon() {
    let mut h = PowlTestHarness::new("shortcut-route")
        .model(model("test-lifecycle.powl.json"));

    h.record_activity("test.started");
    h.record_activity("test.completed"); // skipped 3 middle steps

    let verdict = h.finish();
    assert!(
        matches!(verdict, ConformanceVerdict::Andon(_)),
        "shortcutting to test.completed must fire AndonPull, got: {verdict:?}"
    );
}

/// Hardcoding the expected output without executing the route is rejected.
/// This is the anti-FM-5 guarantee: fake completions are non-admissible.
#[test]
fn anti_fake_hardcoded_output_without_route_is_rejected() {
    let mut h = PowlTestHarness::new("fake-completion-route")
        .model(model("test-lifecycle.powl.json"));

    // Malicious actor: records "test.completed" without executing the route
    h.record_activity("test.completed");

    let verdict = h.finish();
    assert!(
        matches!(verdict, ConformanceVerdict::Andon(_)),
        "fake completion (just test.completed) must be rejected, got: {verdict:?}"
    );
}

/// OCEL evidence is emitted even when the route is rejected.
/// Evidence must survive AndonPull.
#[test]
fn ocel_evidence_survives_andon_pull() {
    let mut h = PowlTestHarness::new("evidence-on-failure")
        .model(model("test-lifecycle.powl.json"));

    h.record_activity("test.started");
    // route is incomplete — andon will fire

    let ocel = h.export_ocel();
    let verdict = h.finish();

    // OCEL was exported before finish() — always has evidence
    assert_eq!(ocel["routeId"], "evidence-on-failure");
    assert_eq!(ocel["events"].as_array().unwrap().len(), 1);

    // Verdict is still AndonPull
    assert!(
        matches!(verdict, ConformanceVerdict::Andon(_)),
        "incomplete route fires AndonPull, got: {verdict:?}"
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers — simulated command execution (no real WASM, just structural proof)
// ─────────────────────────────────────────────────────────────────────────────

fn simulate_command(algorithm: &str, _args: &[&str]) -> String {
    format!(r#"{{"algorithm":"{algorithm}","status":"ok","traces":42}}"#)
}

fn capture_output(raw: String) -> String {
    raw.trim().to_string()
}
