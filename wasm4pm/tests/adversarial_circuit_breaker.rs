//! Adversarial Category D — Circuit Breaker State Machine (Oracle Rank 1/2)
//!
//! These tests attack the circuit breaker state machine from the
//! ADVERSARIAL_TEST_PLAN.md Category D specification.
//!
//! Oracle: State machine invariant — all transitions valid per spec.
//! Known regression: CB-1 — Open→HalfOpen REQUIRES advance_clock().
//!                  Without it the breaker stays Open forever.
//!
//! State machine under test:
//!   Closed --[failures >= threshold]--> Open
//!   Open --[advance_clock >= open_timeout_ms]--> HalfOpen (via allow_request)
//!   HalfOpen --[success_count >= success_threshold]--> Closed
//!   HalfOpen --[failure]--> Open
//!
//! Rank-1 oracle: mathematical invariant (state machine correctness).
//! Rank-2 oracle: domain contract (reward function semantics).

use wasm4pm::rl_orchestrator::compute_reward;
use wasm4pm::self_healing::{
    advance_clock, reset_clock, CircuitBreaker, CircuitBreakerConfig, CircuitState, CLOCK_LOCK,
};

/// Shared setup — resets the global monotonic clock before each test.
fn setup() -> std::sync::MutexGuard<'static, ()> {
    let guard = CLOCK_LOCK
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    reset_clock();
    guard
}

// ===========================================================================
// D1: Closed → Open on failure threshold (Rank-1 oracle)
// ===========================================================================
//
// Property: the breaker must remain Closed until exactly `failure_threshold`
// consecutive failures have been recorded, at which point it transitions to
// Open on the threshold-th call — not before, not after.

#[test]
fn d1_closed_to_open_on_failure_threshold() {
    let _clock_guard = setup();

    let threshold = 5u32;
    let config = CircuitBreakerConfig {
        failure_threshold: threshold,
        success_threshold: 2,
        open_timeout_ms: 60_000,
        half_open_timeout_ms: 30_000,
    };
    let mut breaker = CircuitBreaker::with_config(config);

    // Adversarial check: state must be exactly Closed for every failure
    // BEFORE the threshold fires.
    for i in 0..threshold {
        assert_eq!(
            breaker.state(),
            CircuitState::Closed,
            "D1 pre-trip: expected Closed at failure {} of {} (adversary checks early trip)",
            i + 1,
            threshold
        );
        breaker.record_failure();
    }

    // Immediately after the threshold-th failure the state must be Open.
    assert_eq!(
        breaker.state(),
        CircuitState::Open,
        "D1 post-trip: expected Open after {} consecutive failures (threshold={})",
        threshold,
        threshold
    );

    // Failure count must equal the threshold (not over-counted, not lost).
    assert_eq!(
        breaker.failure_count(),
        threshold,
        "D1 failure_count must equal threshold after trip"
    );
}

// ===========================================================================
// D2: Open → HalfOpen after advance_clock (Rank-1 oracle)
// ===========================================================================
//
// Property: the breaker stays Open until the clock has advanced at least
// `open_timeout_ms` milliseconds from the time it entered Open state.
// Calling allow_request() at exactly open_timeout_ms - 1 must return false
// and leave the state as Open. Calling it at open_timeout_ms must return true
// and transition the state to HalfOpen.

#[test]
fn d2_open_to_half_open_after_advance_clock() {
    let _clock_guard = setup();

    let open_timeout_ms = 60_000u64;
    let config = CircuitBreakerConfig {
        failure_threshold: 3,
        success_threshold: 2,
        open_timeout_ms,
        half_open_timeout_ms: 30_000,
    };
    let mut breaker = CircuitBreaker::with_config(config);

    // Drive to Open.
    for _ in 0..3 {
        breaker.record_failure();
    }
    assert_eq!(
        breaker.state(),
        CircuitState::Open,
        "D2 setup failed: not Open"
    );

    // Adversarial check: one tick before timeout — must still reject.
    advance_clock(open_timeout_ms - 1);
    assert!(
        !breaker.allow_request(),
        "D2 adversary: allow_request must return false at open_timeout_ms - 1 (got true)"
    );
    assert_eq!(
        breaker.state(),
        CircuitState::Open,
        "D2 adversary: state must remain Open at open_timeout_ms - 1"
    );

    // Advance past the timeout boundary by exactly 1 tick.
    advance_clock(1);

    // Now allow_request must trigger the Open→HalfOpen transition.
    assert!(
        breaker.allow_request(),
        "D2: allow_request must return true after open_timeout_ms"
    );
    assert_eq!(
        breaker.state(),
        CircuitState::HalfOpen,
        "D2: state must be HalfOpen after timeout + allow_request"
    );
}

// ===========================================================================
// D3: HalfOpen → Closed on success probe (Rank-1 oracle)
// ===========================================================================
//
// Property: recording `success_threshold` successes in HalfOpen state closes
// the breaker. Intermediate successes must not close it early.

#[test]
fn d3_half_open_to_closed_on_success_probe() {
    let _clock_guard = setup();

    let success_threshold = 2u32;
    let config = CircuitBreakerConfig {
        failure_threshold: 3,
        success_threshold,
        open_timeout_ms: 60_000,
        half_open_timeout_ms: 30_000,
    };
    let mut breaker = CircuitBreaker::with_config(config);

    // Navigate: Closed → Open → HalfOpen.
    for _ in 0..3 {
        breaker.record_failure();
    }
    advance_clock(60_100);
    breaker.allow_request();
    assert_eq!(
        breaker.state(),
        CircuitState::HalfOpen,
        "D3 setup: not HalfOpen"
    );

    // First success — must NOT close yet.
    breaker.record_success();
    assert_eq!(
        breaker.state(),
        CircuitState::HalfOpen,
        "D3 adversary: 1 success must not close breaker (success_threshold={})",
        success_threshold
    );

    // Second success — must close.
    breaker.record_success();
    assert_eq!(
        breaker.state(),
        CircuitState::Closed,
        "D3: {} successes must close breaker",
        success_threshold
    );

    // Counters must be reset after Closed transition.
    assert_eq!(
        breaker.failure_count(),
        0,
        "D3: failure_count must be 0 after Closed transition"
    );
    assert_eq!(
        breaker.success_count(),
        0,
        "D3: success_count must be 0 after Closed transition"
    );
}

// ===========================================================================
// D4: HalfOpen → Open on failure probe (Rank-1 oracle)
// ===========================================================================
//
// Property: a single failure in HalfOpen state immediately re-opens the
// breaker. The success counter must be reset.

#[test]
fn d4_half_open_to_open_on_failure_probe() {
    let _clock_guard = setup();

    let config = CircuitBreakerConfig {
        failure_threshold: 3,
        success_threshold: 2,
        open_timeout_ms: 60_000,
        half_open_timeout_ms: 30_000,
    };
    let mut breaker = CircuitBreaker::with_config(config);

    // Navigate: Closed → Open → HalfOpen.
    for _ in 0..3 {
        breaker.record_failure();
    }
    advance_clock(60_100);
    breaker.allow_request();
    assert_eq!(
        breaker.state(),
        CircuitState::HalfOpen,
        "D4 setup: not HalfOpen"
    );

    // A single failure in HalfOpen must immediately revert to Open.
    breaker.record_failure();
    assert_eq!(
        breaker.state(),
        CircuitState::Open,
        "D4: one failure in HalfOpen must revert to Open immediately"
    );

    // Success counter must be reset on the reversion.
    assert_eq!(
        breaker.success_count(),
        0,
        "D4: success_count must be 0 after HalfOpen→Open reversion"
    );
}

// ===========================================================================
// D5: CB-1 Regression — advance_clock required for Open→HalfOpen
// ===========================================================================
//
// CB-1 is the known bug: without calling advance_clock(), Open never
// transitions to HalfOpen — allow_request() returns false indefinitely.
//
// This test pins the regression: it deliberately does NOT advance the clock
// after driving the breaker to Open state and verifies that allow_request()
// correctly rejects and the state stays Open.

#[test]
fn d5_cb1_regression_open_stays_open_without_advance_clock() {
    let _clock_guard = setup();

    let config = CircuitBreakerConfig {
        failure_threshold: 3,
        success_threshold: 2,
        // Long timeout — would never expire without advance_clock.
        open_timeout_ms: 60_000,
        half_open_timeout_ms: 30_000,
    };
    let mut breaker = CircuitBreaker::with_config(config);

    // Drive to Open.
    for _ in 0..3 {
        breaker.record_failure();
    }
    assert_eq!(breaker.state(), CircuitState::Open, "D5 setup: not Open");

    // CB-1 regression: without advance_clock the timeout has NOT elapsed.
    // allow_request() must return false and the state must remain Open.
    assert!(
        !breaker.allow_request(),
        "D5 CB-1: allow_request must return false when clock has not been advanced (timeout has not elapsed)"
    );
    assert_eq!(
        breaker.state(),
        CircuitState::Open,
        "D5 CB-1: state must remain Open when clock has not been advanced"
    );

    // Calling allow_request multiple times without advancing the clock must
    // never trigger the transition — no amount of probing can bypass the timer.
    for i in 0..5 {
        assert!(
            !breaker.allow_request(),
            "D5 CB-1: repeated allow_request call {} must still return false without clock advance",
            i + 1
        );
        assert_eq!(
            breaker.state(),
            CircuitState::Open,
            "D5 CB-1: state must remain Open after {} allow_request calls",
            i + 1
        );
    }

    // Sanity: advancing the clock past the timeout DOES unblock the transition.
    advance_clock(60_001);
    assert!(
        breaker.allow_request(),
        "D5 CB-1 sanity: allow_request must return true after advancing clock past open_timeout_ms"
    );
    assert_eq!(
        breaker.state(),
        CircuitState::HalfOpen,
        "D5 CB-1 sanity: state must be HalfOpen after clock advance + allow_request"
    );
}

// ===========================================================================
// D6: Reward impact — Open circuit strictly lowers reward vs Closed (Rank-2)
// ===========================================================================
//
// Oracle (Rank-2 domain contract): identical health, SPC alerts, and
// guard_pass — the only difference is circuit_allowed (Closed=true,
// Open=false). The reward function must yield a strictly lower value when
// circuit_allowed=false.
//
// From the reward LUT:
//   GUARD_CIRCUIT[true][true]  = +0.1  (allowed)
//   GUARD_CIRCUIT[true][false] = -0.5  (blocked)
//   Delta = 0.6 — this exact value is pinned.
//
// The test does not reach into the circuit breaker struct; it tests the
// reward function in isolation — this is a Rank-2 domain contract test.

#[test]
fn d6_open_circuit_reward_strictly_lower_than_closed() {
    // Use a neutral health state (stable — no improvement or degradation).
    let prev_health = 2u8;
    let curr_health = 2u8;
    let spc_alerts = 0usize;
    let guard_pass = true;

    // Closed circuit — circuit_allowed = true.
    let reward_closed = compute_reward(
        prev_health,
        curr_health,
        spc_alerts,
        guard_pass,
        true,  // circuit_allowed
        false, // latency_budget_exceeded
        0,     // rework_ratio_q
    );

    // Open circuit — circuit_allowed = false.
    let reward_open = compute_reward(
        prev_health,
        curr_health,
        spc_alerts,
        guard_pass,
        false, // circuit_allowed
        false,
        0, // rework_ratio_q
    );

    // Domain contract: Open circuit must yield strictly lower reward.
    assert!(
        reward_open < reward_closed,
        "D6: Open circuit reward ({:.4}) must be strictly lower than Closed reward ({:.4})",
        reward_open,
        reward_closed
    );

    // Pin the exact delta: 0.6 (from GUARD_CIRCUIT LUT).
    let delta = reward_closed - reward_open;
    assert!(
        (delta - 0.6).abs() < 1e-5,
        "D6: circuit breaker reward delta must be exactly 0.6; got {:.6}",
        delta
    );

    // Metamorphic: adding SPC alerts should not change the circuit delta.
    // The penalty is additive; the guard/circuit component is independent.
    let reward_closed_spc = compute_reward(prev_health, curr_health, 3, guard_pass, true, false, 0);
    let reward_open_spc = compute_reward(prev_health, curr_health, 3, guard_pass, false, false, 0);
    let delta_spc = reward_closed_spc - reward_open_spc;

    assert!(
        (delta_spc - 0.6).abs() < 1e-5,
        "D6: circuit breaker reward delta must stay 0.6 even with SPC alerts; got {:.6}",
        delta_spc
    );
}
