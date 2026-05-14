//! Phase 9 — Proc-macro integration tests.
//!
//! Verifies that `#[powl_test]` and `#[powl_activity]` expand correctly and
//! that the resulting tests enforce route-driven conformance.
//!
//! Run: `cargo test --test powl_macro_tests --features browser`

use wasm4pm_macros::{powl_activity, powl_test};

// ─────────────────────────────────────────────────────────────────────────────
// #[powl_test] — conforming traces (all 5 proof dimensions measured → Passed)
// ─────────────────────────────────────────────────────────────────────────────

#[powl_test(
    route = "macro-sequential-ab",
    model = "routes/test-harness/sequential-two-step.powl.json"
)]
fn macro_sequential_trace_passes() {
    h.record_activity("A");
    h.record_activity("B");
}

#[powl_test(
    route = "macro-three-step",
    model = "routes/test-harness/sequential-three-step.powl.json"
)]
fn macro_three_step_trace_passes() {
    h.record_activity("A");
    h.record_activity("B");
    h.record_activity("C");
}

#[powl_test(
    route = "macro-concurrent-ab",
    model = "routes/test-harness/concurrent-two-step.powl.json"
)]
fn macro_concurrent_ab_passes() {
    h.record_activity("A");
    h.record_activity("B");
}

#[powl_test(
    route = "macro-concurrent-ba",
    model = "routes/test-harness/concurrent-two-step.powl.json"
)]
fn macro_concurrent_ba_passes() {
    h.record_activity("B");
    h.record_activity("A");
}

// ─────────────────────────────────────────────────────────────────────────────
// #[powl_test] — expect_refusal (negative tests)
// ─────────────────────────────────────────────────────────────────────────────

#[powl_test(
    route = "macro-negative-empty",
    model = "routes/test-harness/sequential-two-step.powl.json",
    expect_refusal = "RouteConformanceGap"
)]
fn macro_empty_trace_fires_route_conformance_gap() {
    // no activities — fitness will be < 1.0
}

#[powl_test(
    route = "macro-negative-partial",
    model = "routes/test-harness/sequential-two-step.powl.json",
    expect_refusal = "RouteConformanceGap"
)]
fn macro_partial_trace_fires_route_conformance_gap() {
    h.record_activity("A"); // B is missing
}

#[powl_test(
    route = "macro-missing-model",
    model = "routes/test-harness/this-file-does-not-exist.powl.json",
    expect_refusal = "TestRouteIncomplete"
)]
fn macro_missing_model_fires_test_route_incomplete() {
    h.record_activity("A");
}

// ─────────────────────────────────────────────────────────────────────────────
// #[powl_activity] — activity recording instrumentation
// ─────────────────────────────────────────────────────────────────────────────

#[powl_activity(activity = "fixture.created")]
fn create_test_fixture(x: u32) -> u32 {
    x + 1
}

#[powl_activity(activity = "assertion.checked")]
fn run_assertion(value: bool) -> bool {
    value
}

#[test]
fn powl_activity_calls_through_to_body() {
    let result = create_test_fixture(41);
    assert_eq!(result, 42, "#[powl_activity] must not alter the return value");
}

#[test]
fn powl_activity_on_bool_returns_correctly() {
    assert!(run_assertion(true));
    assert!(!run_assertion(false));
}

// ─────────────────────────────────────────────────────────────────────────────
// #[powl_activity] — verify body is not altered (no side-effect on return)
// ─────────────────────────────────────────────────────────────────────────────

#[powl_activity(activity = "step.a")]
fn step_a() -> &'static str {
    "a"
}

#[powl_activity(activity = "step.b")]
fn step_b() -> &'static str {
    "b"
}

#[test]
fn activity_macro_does_not_alter_return_values() {
    assert_eq!(step_a(), "a");
    assert_eq!(step_b(), "b");
}
