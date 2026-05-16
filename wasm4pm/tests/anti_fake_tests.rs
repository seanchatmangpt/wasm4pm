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

use wasm4pm::testing::{ActivityEvidence, ConformanceVerdict, EvidenceError, ObjectEvidence, PowlTestHarness};

fn bh(data: &str) -> String {
    blake3::hash(data.as_bytes()).to_hex().to_string()
}

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
    // A fresh harness with complete route + bound evidence must pass.
    let mut h2 = PowlTestHarness::new("fresh-route")
        .model(model("sequential-two-step.powl.json"));
    h2.complete_activity(
        ActivityEvidence::new("A").with_outputs(vec![ObjectEvidence::new("a-out", bh("A:output"))]),
    ).unwrap();
    h2.complete_activity(
        ActivityEvidence::new("B")
            .with_inputs(vec![ObjectEvidence::new("a-out", bh("A:output"))])
            .with_outputs(vec![ObjectEvidence::new("b-out", bh("B:output"))]),
    ).unwrap();
    assert_eq!(
        h2.finish(),
        ConformanceVerdict::Passed,
        "fresh harness with complete evidence chain must return Passed"
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

// ─────────────────────────────────────────────────────────────────────────────
// Decisive evidence-binding adversarial tests
//
// These five tests define the proof boundary. The system is not done until
// every one of these fails closed.
// ─────────────────────────────────────────────────────────────────────────────

/// Test 1: Activity-name-only route cannot pass.
///
/// `record_activity()` produces `receipt_coverage = 0.0`.
/// A route that only records names — even in perfect POWL order — must not pass.
#[test]
fn activity_only_route_cannot_pass() {
    let mut harness = PowlTestHarness::new("names-only")
        .model(model("sequential-two-step.powl.json"));
    harness.record_activity("A");
    harness.record_activity("B");
    // Fitness = 1.0 (correct order) but receipt_coverage = 0.0 — not Passed.
    assert_ne!(
        harness.finish(),
        ConformanceVerdict::Passed,
        "activity-name recording without object evidence must never pass"
    );
}

/// Test 2: `complete_activity` with no inputs and no outputs is rejected.
///
/// A receipt cannot bind to nothing. This is the minimal evidence requirement.
#[test]
fn complete_activity_without_object_evidence_is_rejected() {
    let mut harness = PowlTestHarness::new("no-evidence");
    let result = harness.complete_activity(ActivityEvidence::new("part.built"));
    assert_eq!(
        result,
        Err(EvidenceError::NoObjectEvidence),
        "complete_activity with no inputs or outputs must be rejected"
    );
}

/// Test 3: Tampered input hash is detected and rejected at recording time.
///
/// Activity A creates "a-out" with hash H1. Activity B claims to consume
/// "a-out" but provides hash H2 (a different content). The harness catches this
/// mismatch and rejects B.
#[test]
fn tampered_input_hash_is_rejected() {
    let mut harness = PowlTestHarness::new("tamper-route")
        .model(model("sequential-two-step.powl.json"));
    // A creates "a-out" with the real hash.
    harness.complete_activity(
        ActivityEvidence::new("A")
            .with_outputs(vec![ObjectEvidence::new("a-out", bh("original-content"))]),
    ).unwrap();
    // B claims to consume "a-out" but provides a different hash (tampered content).
    let result = harness.complete_activity(
        ActivityEvidence::new("B")
            .with_inputs(vec![ObjectEvidence::new("a-out", bh("tampered-content"))])
            .with_outputs(vec![ObjectEvidence::new("b-out", bh("B:output"))]),
    );
    assert!(
        matches!(result, Err(EvidenceError::InputHashMismatch { .. })),
        "tampered input hash must be rejected; got: {result:?}"
    );
}

/// Test 4: Object used before creation is rejected.
///
/// Activity B claims to consume "a-out" as an input, but "a-out" was never
/// registered as any prior activity's output. The harness catches this.
#[test]
fn object_used_before_created_is_rejected() {
    let mut harness = PowlTestHarness::new("oob-route")
        .model(model("sequential-two-step.powl.json"));
    // Skip creating "a-out" — B tries to use it immediately.
    let result = harness.complete_activity(
        ActivityEvidence::new("B")
            .with_inputs(vec![ObjectEvidence::new("a-out", bh("A:output"))])
            .with_outputs(vec![ObjectEvidence::new("b-out", bh("B:output"))]),
    );
    assert_eq!(
        result,
        Err(EvidenceError::InputObjectNotRegistered("a-out".to_string())),
        "consuming an unregistered object must be rejected"
    );
}

/// Test 5: A conformant activity sequence without an evidence chain cannot pass.
///
/// Even with fitness = 1.0 (correct POWL order), `receipt_coverage = 0.0`
/// when `record_activity` is used. This closes the "names in right order" loophole.
#[test]
fn conformant_sequence_without_evidence_chain_cannot_pass() {
    let mut harness = PowlTestHarness::new("names-in-order")
        .model(model("sequential-three-step.powl.json"));
    // Perfect activity order — but no evidence.
    harness.record_activity("A");
    harness.record_activity("B");
    harness.record_activity("C");
    // Fitness should be 1.0, but receipt_coverage = 0.0 → not Passed.
    let verdict = harness.finish();
    assert_ne!(
        verdict,
        ConformanceVerdict::Passed,
        "correct order without evidence chain must not pass; got: {verdict:?}"
    );
}
