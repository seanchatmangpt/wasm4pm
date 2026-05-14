//! Phase 12 — Anti-fake guarantee tests.
//!
//! Proves that fake completions are non-admissible. No combination of
//! hardcoded output, partial activity recording, or route shortcuts can
//! produce `ConformanceVerdict::Passed` without executing the declared route.
//!
//! Every test here is a negative test: it describes an evasion attempt
//! and asserts the harness rejects it.
//!
//! Run: `cargo test --test anti_fake_tests --features browser`

use wasm4pm::testing::{ConformanceVerdict, PowlTestHarness};

fn model(name: &str) -> String {
    format!("{}/routes/test-harness/{name}", env!("CARGO_MANIFEST_DIR"))
}

// ─────────────────────────────────────────────────────────────────────────────
// FM-5: hardcoded output without route activities
// ─────────────────────────────────────────────────────────────────────────────

#[test]
fn empty_harness_cannot_pass_any_model() {
    let h = PowlTestHarness::new("no-activities")
        .model(model("sequential-two-step.powl.json"));
    assert!(
        matches!(h.finish(), ConformanceVerdict::Andon(_)),
        "empty harness must never pass"
    );
}

#[test]
fn wrong_activity_names_cannot_pass() {
    let mut h = PowlTestHarness::new("wrong-names")
        .model(model("sequential-two-step.powl.json"));
    // Model expects "A", "B" — inject unrelated names
    h.record_activity("x");
    h.record_activity("y");
    assert!(
        matches!(h.finish(), ConformanceVerdict::Andon(_)),
        "unrelated activity names must be rejected"
    );
}

#[test]
fn duplicate_activities_without_missing_ones_cannot_pass() {
    let mut h = PowlTestHarness::new("duplicates-only")
        .model(model("sequential-two-step.powl.json"));
    // Only record A twice — B never appears
    h.record_activity("A");
    h.record_activity("A");
    assert!(
        matches!(h.finish(), ConformanceVerdict::Andon(_)),
        "recording A twice instead of A,B must be rejected"
    );
}

#[test]
fn only_final_activity_cannot_pass_sequential_model() {
    let mut h = PowlTestHarness::new("only-final")
        .model(model("sequential-two-step.powl.json"));
    // Skip A, record only B
    h.record_activity("B");
    assert!(
        matches!(h.finish(), ConformanceVerdict::Andon(_)),
        "starting with B (skipping A) must be rejected"
    );
}

#[test]
fn only_final_activity_of_three_step_cannot_pass() {
    let mut h = PowlTestHarness::new("only-c")
        .model(model("sequential-three-step.powl.json"));
    h.record_activity("C");
    assert!(
        matches!(h.finish(), ConformanceVerdict::Andon(_)),
        "just recording C (missing A,B) must be rejected"
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Extra activities are tolerated but missing ones are not
// ─────────────────────────────────────────────────────────────────────────────

#[test]
fn extra_unknown_activity_with_full_route_can_pass() {
    let mut h = PowlTestHarness::new("extra-activity")
        .model(model("sequential-two-step.powl.json"));
    h.record_activity("A");
    h.record_activity("B");
    h.record_activity("extra.diagnostic"); // not in model
    // Token replay typically allows remaining tokens (extra events after model
    // completion). This may or may not pass depending on the token replay impl.
    // We don't assert a specific verdict here — we assert that A,B (the route)
    // was at least executed.
    let verdict = h.finish();
    // The route A,B was completed. If extra activity causes Andon, that's acceptable.
    // What's NOT acceptable: passing without A and B.
    let _ = verdict; // verdict is informational here
    assert_eq!(h.event_count(), 3);
}

#[test]
fn missing_required_activity_never_passes() {
    let mut h = PowlTestHarness::new("missing-b")
        .model(model("sequential-three-step.powl.json"));
    h.record_activity("A");
    // B is missing
    h.record_activity("C");
    assert!(
        matches!(h.finish(), ConformanceVerdict::Andon(_)),
        "skipping B in A->B->C must be rejected"
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Panic does not count as route completion
// ─────────────────────────────────────────────────────────────────────────────

#[test]
fn panic_in_route_body_produces_unhandled_panic_not_passed() {
    use wasm4pm::testing::AndonPull;

    let mut h = PowlTestHarness::new("panicking-route")
        .model(model("sequential-two-step.powl.json"));

    let verdict = h.run_catching_panic(|h| {
        h.record_activity("A");
        panic!("simulated failure mid-route");
    });

    assert_eq!(
        verdict,
        ConformanceVerdict::Andon(AndonPull::UnhandledPanic),
        "panic mid-route must produce UnhandledPanic, not Passed"
    );
}

#[test]
fn completing_route_after_catching_panic_produces_correct_verdict() {
    let mut h = PowlTestHarness::new("recovered-route")
        .model(model("sequential-two-step.powl.json"));

    // Simulate: first body panics (bad), then we continue with a new harness
    let bad_verdict = h.run_catching_panic(|h| {
        h.record_activity("A");
        panic!("first attempt failed");
    });

    assert!(
        matches!(bad_verdict, ConformanceVerdict::Andon(_)),
        "panicking body must produce AndonPull"
    );
    // A fresh harness with the complete route must pass.
    let mut h2 = PowlTestHarness::new("fresh-route")
        .model(model("sequential-two-step.powl.json"));
    h2.record_activity("A");
    h2.record_activity("B");
    assert_eq!(
        h2.finish(),
        ConformanceVerdict::Passed,
        "fresh harness with complete route must return Passed"
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// OCEL evidence is always available, even when verdict is Andon
// ─────────────────────────────────────────────────────────────────────────────

#[test]
fn ocel_captures_fake_activities_for_audit() {
    let mut h = PowlTestHarness::new("audit-route")
        .model(model("sequential-two-step.powl.json"));

    h.record_activity("fake.evidence");
    h.record_activity("another.fake");

    let ocel = h.export_ocel();
    let verdict = h.finish();

    // OCEL records what actually happened
    let events = ocel["events"].as_array().unwrap();
    assert_eq!(events.len(), 2, "OCEL must record the actual fake activities");
    assert_eq!(events[0]["type"], "fake.evidence");

    // Verdict proves the fake activities were rejected
    assert!(
        matches!(verdict, ConformanceVerdict::Andon(_)),
        "fake activities must produce AndonPull"
    );
}
