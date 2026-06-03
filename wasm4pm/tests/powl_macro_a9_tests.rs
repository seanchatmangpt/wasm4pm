//! A9 — Route-Driven TDD proc-macro sugar tests (C7-compliant).
//!
//! Self-contained: depends on NO external `routes/*.powl.json` fixtures, so it
//! runs on any checkout regardless of which other agents' model files exist.
//!
//! Per reconciliation delta **C7**, this test exercises ALL FOUR harness types
//! BY NAME — `PowlTestHarness`, `ExpectedConformance`, `ConformanceVerdict`,
//! `AndonPull` — including the negative (AndonPull) path.
//!
//! Chicago-TDD oracle: the macro is sugar over `PowlTestHarness`. Its correctness
//! is grounded in the harness contract (mcpp-conformance.md): a test admits ONLY
//! at exact conformance; anything else is a typed `AndonPull`, never a soft pass.
//! No FM-5 self-reference — the expected verdicts are derived from the route-TDD
//! doctrine, not from the macro's own output.
//!
//! Run: `cargo test --test powl_macro_a9_tests`

use wasm4pm::testing::{
    classify_conformance, AndonPull, ConformanceVerdict, ExpectedConformance, PowlTestHarness,
    ProofDimension, ReplayReport,
};
use wasm4pm_macros::{powl_activity, powl_test};

// ─────────────────────────────────────────────────────────────────────────────
// 1. #[powl_test] — negative path through the macro (no external fixture).
//    A missing model file makes `h.finish()` return AndonPull::TestRouteIncomplete.
//    `expect_refusal` asserts exactly that variant fires — the macro's negative
//    path, proven without depending on any committed .powl.json fixture.
// ─────────────────────────────────────────────────────────────────────────────

#[powl_test(
    route = "a9-macro-missing-model",
    model = "routes/__a9_does_not_exist__.powl.json",
    expect_refusal = "TestRouteIncomplete"
)]
fn macro_missing_model_fires_test_route_incomplete() {
    // Body records an activity, but the model cannot be loaded → AndonPull.
    h.record_activity("A");
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. #[powl_activity] — sugar that prepends a record_activity() call without
//    altering the wrapped function's behavior. Oracle: return value unchanged.
// ─────────────────────────────────────────────────────────────────────────────

#[powl_activity(activity = "a9.fixture.created")]
fn build_value(seed: u32) -> u32 {
    seed * 2 + 1
}

#[test]
fn powl_activity_preserves_return_value() {
    // The macro must be transparent to the function's contract.
    assert_eq!(
        build_value(20),
        41,
        "#[powl_activity] must not alter behavior"
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. C7: name and exercise ALL FOUR harness types directly.
//    PowlTestHarness + ExpectedConformance (construction),
//    ConformanceVerdict + AndonPull (the negative verdict the macro relies on).
// ─────────────────────────────────────────────────────────────────────────────

#[test]
fn c7_all_four_harness_types_named_and_exercised() {
    // (a) PowlTestHarness — explicit construction (what the macro expands to).
    let mut harness: PowlTestHarness = PowlTestHarness::new("a9-c7-explicit")
        // (b) ExpectedConformance — the exact-1.0 admission contract.
        .expect(ExpectedConformance::exact());
    harness.record_activity("A");

    // With no model set, the harness cannot replay a route.
    // (c) ConformanceVerdict + (d) AndonPull — the typed negative verdict.
    let verdict: ConformanceVerdict = harness.finish();
    assert_eq!(
        verdict,
        ConformanceVerdict::Andon(AndonPull::TestRouteIncomplete),
        "a harness with no route model must refuse with TestRouteIncomplete"
    );
    assert!(!verdict.is_passed(), "an AndonPull verdict is never passed");
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. ExpectedConformance::exact() is the ONLY admission bar — 1.0 on every plane.
//    Below 1.0 on the fitness plane ⇒ AndonPull::RouteConformanceGap.
//    Oracle: mcpp-conformance.md (exact 1.0 admission, no tolerance).
// ─────────────────────────────────────────────────────────────────────────────

#[test]
fn c7_exact_conformance_admits_only_at_one() {
    let expected: ExpectedConformance = ExpectedConformance::exact();
    assert_eq!(expected.fitness, 1.0);
    assert_eq!(expected.precision, 1.0);
    assert_eq!(expected.receipt_coverage, 1.0);
    assert_eq!(expected.required_stage_coverage, 1.0);
    assert_eq!(expected.object_lifecycle_validity, 1.0);

    // Exact replay admits.
    let exact = ReplayReport {
        fitness: ProofDimension::Measured(1.0),
        precision: ProofDimension::Measured(1.0),
        receipt_coverage: ProofDimension::Measured(1.0),
        required_stage_coverage: ProofDimension::Measured(1.0),
        object_lifecycle_validity: ProofDimension::Measured(1.0),
    };
    assert_eq!(
        classify_conformance(&exact, expected),
        ConformanceVerdict::Passed,
        "exact 1.0 across all planes must admit"
    );

    // 0.999 fitness refuses with the route-conformance gap AndonPull.
    let gap = ReplayReport {
        fitness: ProofDimension::Measured(0.999),
        ..exact
    };
    assert_eq!(
        classify_conformance(&gap, expected),
        ConformanceVerdict::Andon(AndonPull::RouteConformanceGap),
        "0.999 < 1.0 is a RouteConformanceGap — there is no tolerance"
    );
}
