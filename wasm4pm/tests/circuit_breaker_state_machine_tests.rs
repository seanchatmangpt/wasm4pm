//! Category D — Circuit Breaker State Machine Transition Tests
//!
//! Rank-1 tests: explicitly advance the state machine through transitions
//! and verify the state at each step. These complement the existing Rank-2
//! tests in autonomic_tests.rs that check reward consequences of circuit state.
//!
//! State machine under test:
//!   Closed --[failures >= threshold]--> Open
//!   Open --[timeout expires]--> HalfOpen
//!   HalfOpen --[success count >= threshold]--> Closed
//!   HalfOpen --[failure]--> Open

use wasm4pm::rl_orchestrator::compute_reward;
use wasm4pm::self_healing::{
    advance_clock, reset_clock, CircuitBreaker, CircuitBreakerConfig, CircuitState, CLOCK_LOCK,
};

/// RAII guard returned from `setup()`. Holding it serializes all tests in
/// this file (and any other file using `CLOCK_LOCK`) against the shared
/// `TIME_OFFSET_MS` atomic so `reset_clock()` + `advance_clock()` are
/// observed atomically by the test that called `setup()`.
///
/// Keep the binding alive (e.g. `let _g = setup();`) for the entire body
/// of the test — dropping it early releases the lock and reopens the race.
fn setup() -> std::sync::MutexGuard<'static, ()> {
    let guard = CLOCK_LOCK
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    reset_clock();
    guard
}

// ===========================================================================
// Test 1: Closed -> Open on threshold failures
// ===========================================================================

#[test]
fn test_closed_to_open_on_threshold_failures() {
    let _clock_guard = setup();

    let threshold = 5u32;
    let config = CircuitBreakerConfig {
        failure_threshold: threshold,
        success_threshold: 2,
        open_timeout_ms: 60_000,
        half_open_timeout_ms: 30_000,
    };
    let mut breaker = CircuitBreaker::with_config(config).unwrap();

    // State must remain Closed for every failure up to (but not including) threshold
    for i in 0..threshold {
        assert_eq!(
            breaker.state(),
            CircuitState::Closed,
            "expected Closed at failure {} of {}",
            i + 1,
            threshold
        );
        breaker.record_failure();
    }

    // Immediately after recording the threshold-th failure, state transitions to Open
    assert_eq!(
        breaker.state(),
        CircuitState::Open,
        "expected Open after {} consecutive failures (threshold={})",
        threshold,
        threshold
    );

    // Verify failure count matches threshold
    assert_eq!(breaker.failure_count(), threshold);
}

// ===========================================================================
// Test 2: Open -> HalfOpen after timeout
// ===========================================================================

#[test]
fn test_open_to_half_open_after_timeout() {
    let _clock_guard = setup();

    let open_timeout_ms = 60_000u64;
    let config = CircuitBreakerConfig {
        failure_threshold: 3,
        success_threshold: 2,
        open_timeout_ms,
        half_open_timeout_ms: 30_000,
    };
    let mut breaker = CircuitBreaker::with_config(config).unwrap();

    // Drive to Open
    for _ in 0..3 {
        breaker.record_failure();
    }
    assert_eq!(breaker.state(), CircuitState::Open);

    // Just before timeout: allow_request must return false, state stays Open
    advance_clock(open_timeout_ms - 1);
    assert!(
        !breaker.allow_request(),
        "expected allow_request=false just before timeout"
    );
    assert_eq!(
        breaker.state(),
        CircuitState::Open,
        "expected Open just before timeout"
    );

    // Advance past the timeout boundary
    advance_clock(1);

    // Now allow_request triggers the transition to HalfOpen
    assert!(
        breaker.allow_request(),
        "expected allow_request=true after timeout"
    );
    assert_eq!(
        breaker.state(),
        CircuitState::HalfOpen,
        "expected HalfOpen after timeout"
    );
}

// ===========================================================================
// Test 3: HalfOpen -> Closed on success
// ===========================================================================

#[test]
fn test_half_open_to_closed_on_success() {
    let _clock_guard = setup();

    let success_threshold = 2u32;
    let config = CircuitBreakerConfig {
        failure_threshold: 3,
        success_threshold,
        open_timeout_ms: 60_000,
        half_open_timeout_ms: 30_000,
    };
    let mut breaker = CircuitBreaker::with_config(config).unwrap();

    // Drive to Open, then to HalfOpen
    for _ in 0..3 {
        breaker.record_failure();
    }
    assert_eq!(breaker.state(), CircuitState::Open);
    advance_clock(60_100);
    breaker.allow_request(); // triggers Open -> HalfOpen
    assert_eq!(breaker.state(), CircuitState::HalfOpen);

    // Record successes one by one; state stays HalfOpen until threshold
    breaker.record_success();
    assert_eq!(
        breaker.state(),
        CircuitState::HalfOpen,
        "expected HalfOpen after 1 success (threshold={})",
        success_threshold
    );

    breaker.record_success();
    assert_eq!(
        breaker.state(),
        CircuitState::Closed,
        "expected Closed after {} successes (threshold={})",
        success_threshold,
        success_threshold
    );

    // Failure counter must be reset in Closed state
    assert_eq!(breaker.failure_count(), 0);
    assert_eq!(breaker.success_count(), 0);
}

// ===========================================================================
// Test 4: HalfOpen -> Open on failure
// ===========================================================================

#[test]
fn test_half_open_to_open_on_failure() {
    let _clock_guard = setup();

    let config = CircuitBreakerConfig {
        failure_threshold: 3,
        success_threshold: 2,
        open_timeout_ms: 60_000,
        half_open_timeout_ms: 30_000,
    };
    let mut breaker = CircuitBreaker::with_config(config).unwrap();

    // Drive to Open, then to HalfOpen
    for _ in 0..3 {
        breaker.record_failure();
    }
    assert_eq!(breaker.state(), CircuitState::Open);
    advance_clock(60_100);
    breaker.allow_request(); // triggers Open -> HalfOpen
    assert_eq!(breaker.state(), CircuitState::HalfOpen);

    // A single failure in HalfOpen immediately reverts to Open
    breaker.record_failure();
    assert_eq!(
        breaker.state(),
        CircuitState::Open,
        "expected Open after failure in HalfOpen"
    );

    // Success count must be reset
    assert_eq!(breaker.success_count(), 0);
}

// ===========================================================================
// Test 5: allow_request behavior per state
// ===========================================================================

#[test]
fn test_allow_request_per_state() {
    let _clock_guard = setup();

    // --- Closed: allow_request returns true ---
    let mut breaker_closed = CircuitBreaker::new();
    assert_eq!(breaker_closed.state(), CircuitState::Closed);
    assert!(
        breaker_closed.allow_request(),
        "Closed should allow requests"
    );

    // --- Open: allow_request returns false ---
    let mut breaker_open = CircuitBreaker::with_config(CircuitBreakerConfig {
        failure_threshold: 2,
        success_threshold: 2,
        open_timeout_ms: 100_000, // long timeout so it stays Open
        half_open_timeout_ms: 30_000,
    })
    .unwrap();
    breaker_open.record_failure();
    breaker_open.record_failure();
    assert_eq!(breaker_open.state(), CircuitState::Open);
    assert!(!breaker_open.allow_request(), "Open should reject requests");

    // --- HalfOpen: allow_request returns true (probe) ---
    let mut breaker_half_open = CircuitBreaker::with_config(CircuitBreakerConfig {
        failure_threshold: 2,
        success_threshold: 2,
        open_timeout_ms: 1_000,
        half_open_timeout_ms: 100_000, // long half-open timeout so it stays HalfOpen
    })
    .unwrap();
    breaker_half_open.record_failure();
    breaker_half_open.record_failure();
    assert_eq!(breaker_half_open.state(), CircuitState::Open);
    advance_clock(1_100); // past open_timeout_ms
    assert!(
        breaker_half_open.allow_request(),
        "HalfOpen should allow requests (probe)"
    );
    assert_eq!(breaker_half_open.state(), CircuitState::HalfOpen);

    // Verify allow_request in HalfOpen still returns true on second call
    assert!(
        breaker_half_open.allow_request(),
        "HalfOpen should continue allowing requests"
    );
}

// ===========================================================================
// Test 6: Failure counter resets on Closed transition
// ===========================================================================

#[test]
fn test_failure_counter_resets_on_closed() {
    let _clock_guard = setup();

    let threshold = 3u32;
    let config = CircuitBreakerConfig {
        failure_threshold: threshold,
        success_threshold: 2,
        open_timeout_ms: 10_000,
        half_open_timeout_ms: 30_000,
    };
    let mut breaker = CircuitBreaker::with_config(config).unwrap();

    // Cycle 1: Closed -> Open via failures
    for _ in 0..threshold {
        breaker.record_failure();
    }
    assert_eq!(breaker.state(), CircuitState::Open);
    assert_eq!(breaker.failure_count(), threshold);

    // Open -> HalfOpen -> Closed via recovery
    advance_clock(10_100);
    breaker.allow_request(); // triggers HalfOpen
    assert_eq!(breaker.state(), CircuitState::HalfOpen);
    breaker.record_success();
    breaker.record_success(); // triggers Closed
    assert_eq!(breaker.state(), CircuitState::Closed);

    // Verify counters are reset
    assert_eq!(
        breaker.failure_count(),
        0,
        "failure counter must reset to 0 on Closed transition"
    );
    assert_eq!(
        breaker.success_count(),
        0,
        "success counter must reset to 0 on Closed transition"
    );

    // Cycle 2: must require the full threshold again to reach Open
    for i in 0..threshold {
        assert_eq!(
            breaker.state(),
            CircuitState::Closed,
            "expected Closed at failure {} of {} in second cycle",
            i + 1,
            threshold
        );
        breaker.record_failure();
    }
    assert_eq!(
        breaker.state(),
        CircuitState::Open,
        "expected Open after {} failures in second cycle (no stale counter leak)",
        threshold
    );
}

// ===========================================================================
// Test 7: Recovery timeout is configurable
// ===========================================================================

#[test]
fn test_recovery_timeout_is_configurable() {
    let _clock_guard = setup();

    let short_timeout_ms = 100u64;
    let long_timeout_ms = 500u64;

    let mut breaker_short = CircuitBreaker::with_config(CircuitBreakerConfig {
        failure_threshold: 2,
        success_threshold: 2,
        open_timeout_ms: short_timeout_ms,
        half_open_timeout_ms: 30_000,
    })
    .unwrap();

    let mut breaker_long = CircuitBreaker::with_config(CircuitBreakerConfig {
        failure_threshold: 2,
        success_threshold: 2,
        open_timeout_ms: long_timeout_ms,
        half_open_timeout_ms: 30_000,
    })
    .unwrap();

    // Drive both to Open
    breaker_short.record_failure();
    breaker_short.record_failure();
    assert_eq!(breaker_short.state(), CircuitState::Open);

    breaker_long.record_failure();
    breaker_long.record_failure();
    assert_eq!(breaker_long.state(), CircuitState::Open);

    // Advance to just past the short timeout
    advance_clock(short_timeout_ms + 1);

    // Short-timeout breaker should transition to HalfOpen
    assert!(
        breaker_short.allow_request(),
        "short-timeout breaker ({}ms) should allow requests after {}ms",
        short_timeout_ms,
        short_timeout_ms + 1
    );
    assert_eq!(
        breaker_short.state(),
        CircuitState::HalfOpen,
        "short-timeout breaker should be HalfOpen"
    );

    // Long-timeout breaker should still be Open
    assert!(
        !breaker_long.allow_request(),
        "long-timeout breaker ({}ms) should still reject requests at {}ms",
        long_timeout_ms,
        short_timeout_ms + 1
    );
    assert_eq!(
        breaker_long.state(),
        CircuitState::Open,
        "long-timeout breaker should still be Open"
    );

    // Advance past the long timeout
    advance_clock(long_timeout_ms - short_timeout_ms - 1 + 1);

    // Now the long-timeout breaker should also transition
    assert!(
        breaker_long.allow_request(),
        "long-timeout breaker ({}ms) should allow requests after full timeout",
        long_timeout_ms
    );
    assert_eq!(
        breaker_long.state(),
        CircuitState::HalfOpen,
        "long-timeout breaker should now be HalfOpen"
    );
}

// ===========================================================================
// Test 8: Full lifecycle — complete state machine walk
// ===========================================================================

#[test]
fn test_full_lifecycle_closed_open_half_open_closed() {
    let _clock_guard = setup();

    let config = CircuitBreakerConfig {
        failure_threshold: 3,
        success_threshold: 2,
        open_timeout_ms: 5_000,
        half_open_timeout_ms: 3_000,
    };
    let mut breaker = CircuitBreaker::with_config(config).unwrap();

    // Phase 1: Start in Closed
    assert_eq!(breaker.state(), CircuitState::Closed);
    assert!(breaker.allow_request());

    // Phase 2: Accumulate failures -> Open
    breaker.record_failure(); // 1
    assert_eq!(breaker.state(), CircuitState::Closed);
    breaker.record_failure(); // 2
    assert_eq!(breaker.state(), CircuitState::Closed);
    breaker.record_failure(); // 3 -> threshold
    assert_eq!(breaker.state(), CircuitState::Open);
    assert!(!breaker.allow_request());

    // Phase 3: Wait timeout -> HalfOpen
    advance_clock(5_100);
    assert!(breaker.allow_request()); // triggers transition
    assert_eq!(breaker.state(), CircuitState::HalfOpen);

    // Phase 4: Succeed -> Closed
    breaker.record_success(); // 1
    assert_eq!(breaker.state(), CircuitState::HalfOpen);
    breaker.record_success(); // 2 -> threshold
    assert_eq!(breaker.state(), CircuitState::Closed);
    assert!(breaker.allow_request());

    // Phase 5: Accumulate failures again -> Open (second cycle)
    breaker.record_failure(); // 1
    breaker.record_failure(); // 2
    breaker.record_failure(); // 3 -> threshold
    assert_eq!(breaker.state(), CircuitState::Open);
    assert!(!breaker.allow_request());

    // Phase 6: Wait timeout -> HalfOpen (second cycle)
    advance_clock(5_100);
    assert!(breaker.allow_request()); // triggers transition
    assert_eq!(breaker.state(), CircuitState::HalfOpen);

    // Phase 7: Fail -> Open (bounce back)
    breaker.record_failure();
    assert_eq!(breaker.state(), CircuitState::Open);
    assert!(!breaker.allow_request());

    // Verify: full lifecycle completed, all transitions at expected points
    // The breaker survived two complete Open cycles without corrupting state
    assert_eq!(breaker.failure_count(), 4); // 3 + 3 from cycles, but transition_to resets
                                            // (failure_count accumulates across cycles because Open transition only resets success_count)
}

// ===========================================================================
// Test D6 (Category D — Circuit Breaker): Reward delta for circuit state
// ===========================================================================

#[test]
fn test_d6_circuit_breaker_reward_delta_at_least_0_5() {
    // compute_reward with circuit_allowed=true vs false, same everything else.
    // The reward function gives:
    //   guard_pass=true && circuit_allowed=true: +0.1
    //   else: -0.5
    // Delta = 0.1 - (-0.5) = 0.6 >= 0.5.

    let prev_health = 2u8;
    let curr_health = 2u8;
    let spc_alerts = 0usize;
    let guard_pass = true;

    let reward_allowed = compute_reward(
        prev_health,
        curr_health,
        spc_alerts,
        guard_pass,
        true,
        false,
        0,
    );
    let reward_blocked = compute_reward(
        prev_health,
        curr_health,
        spc_alerts,
        guard_pass,
        false,
        false,
        0,
    );

    let delta = reward_allowed - reward_blocked;

    assert!(
        delta >= 0.5,
        "Reward delta between circuit_allowed=true ({:.4}) and circuit_allowed=false ({:.4}) \
         should be >= 0.5: got delta={:.4}",
        reward_allowed,
        reward_blocked,
        delta
    );

    // The known exact delta is 0.6 (guard+circuit bonus +0.1 vs -0.5 penalty)
    assert!(
        (delta - 0.6).abs() < 1e-5,
        "Exact circuit breaker reward delta should be 0.6: got {:.6}",
        delta
    );
}
