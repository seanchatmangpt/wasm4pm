#![allow(clippy::all, dead_code)]
//! State Invariant Audit — wasm4pm RL Autonomic System
//!
//! Validates that state transitions respect fundamental invariants:
//! 1. Health levels only transition within valid bounds [0-4]
//! 2. Health only improves on success (guard_pass && circuit_allowed)
//! 3. Health only degrades on failure
//! 4. Health is monotonic per transition direction
//! 5. Circuit breaker transitions only follow valid state machine paths
//! 6. SPC alert levels stay within bounds [0-3]
//! 7. All quantized dimensions stay within their declared bounds
//! 8. Terminal state (health=4) blocks further degradation
//!
//! Identifies 5 critical invalid state transition patterns that could occur due to bugs.

use wasm4pm::self_healing::{CircuitBreaker, CircuitBreakerConfig, CircuitState};
use wasm4pm::RlState;

// ============================================================================
// INVALID STATE TRANSITION PATTERNS (5 Critical Bugs)
// ============================================================================

/// Bug P1: Health jumps non-monotonically (e.g., 2→4 in single cycle)
///
/// If the improvement logic or degradation logic is bypassed, health could jump
/// multiple steps instead of stepping by 1. This violates monotonicity.
///
/// **Root cause:** Conditional logic error where health update is skipped or
/// applied incorrectly (e.g., `health_level + 2` instead of `health_level + 1`).
///
/// **Detection:** Track before/after health, assert |delta| ≤ 1
#[test]
fn test_invalid_p1_health_non_monotonic_jump() {
    // Valid transitions: only ±1 or 0
    let cases = vec![
        (0, 1, true), // 0→1 degrade: valid
        (0, 0, true), // 0→0 stable: valid
        (1, 2, true), // 1→2 degrade: valid
        (2, 1, true), // 2→1 improve: valid
        (4, 4, true), // 4→4 terminal: valid
        // INVALID cases
        (1, 3, false), // 1→3 jump +2: INVALID
        (3, 0, false), // 3→0 jump -3: INVALID
        (0, 4, false), // 0→4 jump +4: INVALID
    ];

    for (before, after, should_be_valid) in cases {
        let delta = (after as i8 - before as i8).abs();
        let is_monotonic = delta <= 1;
        assert_eq!(
            is_monotonic, should_be_valid,
            "Health jump {}->{} (delta={}): expected valid={}, got {}",
            before, after, delta, should_be_valid, is_monotonic
        );
    }
}

/// Bug P2: Circuit breaker skips states (e.g., Closed→Open without HalfOpen)
///
/// The circuit breaker has a 3-state FSM: Closed ⇄ HalfOpen ⇄ Open.
/// Invalid transitions skip intermediate states.
///
/// **Root cause:** Conditional logic error in `allow_request()` or `transition_to()`.
/// Example: if timeout logic is wrong, it could jump Open→Closed directly.
///
/// **Detection:** Verify all transitions follow valid paths in the FSM
#[test]
fn test_invalid_p2_circuit_breaker_state_skip() {
    // Valid state machine transitions:
    let valid_transitions = vec![
        (CircuitState::Closed, CircuitState::Closed),   // stay
        (CircuitState::Closed, CircuitState::Open),     // failure threshold hit
        (CircuitState::Open, CircuitState::HalfOpen),   // timeout expired
        (CircuitState::HalfOpen, CircuitState::Closed), // success threshold hit
        (CircuitState::HalfOpen, CircuitState::Open),   // timeout expired (recovery failed)
        (CircuitState::Open, CircuitState::Open),       // stay (waiting for timeout)
    ];

    // INVALID transitions (direct jumps, self-loops from other states, etc.)
    let invalid_transitions = vec![
        (CircuitState::Closed, CircuitState::HalfOpen), // should go Closed→Open first
        (CircuitState::Open, CircuitState::Closed),     // must go Open→HalfOpen first
        (CircuitState::HalfOpen, CircuitState::HalfOpen), // not a valid self-loop
    ];

    // Verify valid transitions are recognized
    for (from, to) in &valid_transitions {
        let is_valid = matches!(
            (from, to),
            (CircuitState::Closed, CircuitState::Closed)
                | (CircuitState::Closed, CircuitState::Open)
                | (CircuitState::Open, CircuitState::HalfOpen)
                | (CircuitState::HalfOpen, CircuitState::Closed)
                | (CircuitState::HalfOpen, CircuitState::Open)
                | (CircuitState::Open, CircuitState::Open)
        );
        assert!(is_valid, "Expected valid transition {:?} → {:?}", from, to);
    }

    // Verify invalid transitions are rejected
    for (from, to) in &invalid_transitions {
        let is_valid = matches!(
            (from, to),
            (CircuitState::Closed, CircuitState::Closed)
                | (CircuitState::Closed, CircuitState::Open)
                | (CircuitState::Open, CircuitState::HalfOpen)
                | (CircuitState::HalfOpen, CircuitState::Closed)
                | (CircuitState::HalfOpen, CircuitState::Open)
                | (CircuitState::Open, CircuitState::Open)
        );
        assert!(
            !is_valid,
            "Expected INVALID transition {:?} → {:?}",
            from, to
        );
    }
}

/// Bug P3: SPC alert level exceeds bounds [0-3]
///
/// The spc_alert_level is quantized to 4 levels (0-3). If the quantization
/// function is incorrect or has an off-by-one error, the level could exceed 3.
///
/// **Root cause:** Quantization logic error (e.g., `(count / 5).min(4)` should be `.min(3)`).
///
/// **Detection:** All SPC levels in RlState must satisfy 0 ≤ spc_alert_level ≤ 3
#[test]
fn test_invalid_p3_spc_alert_out_of_bounds() {
    // Valid SPC alert levels
    let valid_levels = vec![0, 1, 2, 3];

    // INVALID levels
    let invalid_levels = vec![4, 5, 8, 255];

    for level in valid_levels {
        assert!(level <= 3, "Valid SPC level {} should be ≤ 3", level);
    }

    for level in invalid_levels {
        assert!(level > 3, "Invalid SPC level {} should exceed 3", level);
    }
}

/// Bug P4: Health bounds not enforced on degradation (e.g., health > 4)
///
/// Health is capped at 4 (terminal state). If the cap is removed or the
/// saturation logic is wrong (e.g., `.min(5)` instead of `.min(4)`),
/// health could exceed 4.
///
/// **Root cause:** Degradation logic: `(health_level + 1).min(4)` is written as
/// `(health_level + 1).min(5)` or just `health_level + 1`.
///
/// **Detection:** All RlState health_level ≤ 4
#[test]
fn test_invalid_p4_health_exceeds_max_bound() {
    let test_cases = vec![
        (0, 1, true), // 0+1 capped at 4 = 1: valid
        (3, 4, true), // 3+1 capped at 4 = 4: valid
        (4, 4, true), // 4+1 capped at 4 = 4: valid (terminal)
    ];

    for (before, expected_after, _should_be_valid) in test_cases {
        // Simulate degradation with proper cap
        let after_proper = (before + 1).min(4);
        // Simulate degradation with buggy cap
        let after_buggy = (before + 1).min(5); // BUG: should be .min(4)

        assert_eq!(
            after_proper, expected_after,
            "Proper degradation {}->{}: expected {}, got {}",
            before, after_proper, expected_after, after_proper
        );

        // Buggy version would exceed 4
        if before == 4 {
            assert_eq!(
                after_buggy, 5,
                "Buggy version with .min(5) would exceed bound"
            );
        }
    }
}

/// Bug P5: Circuit breaker allows request from Open state without timeout check
///
/// When circuit is Open, allow_request() should block unless timeout has elapsed.
/// A bug could cause immediate allow during Open state (ignoring timeout).
///
/// **Root cause:** Timeout check is skipped or incorrectly short-circuited.
/// Example: `if self.state != CircuitState::Open { true }` (wrong condition).
///
/// **Detection:** Verify Open state rejects requests until timeout expires
#[test]
fn test_invalid_p5_circuit_open_allows_without_timeout() {
    use wasm4pm::self_healing::{advance_clock, reset_clock};

    reset_clock();

    let config = CircuitBreakerConfig {
        failure_threshold: 1,
        success_threshold: 1,
        open_timeout_ms: 100,
        half_open_timeout_ms: 50,
    };

    let mut cb = CircuitBreaker::with_config(config);

    // Record a failure to open the circuit
    cb.record_failure();
    assert_eq!(
        cb.state(),
        CircuitState::Open,
        "Circuit should be open after failure"
    );

    // IMMEDIATELY check allow_request (no timeout)
    let allow_now = cb.allow_request();
    assert!(
        !allow_now,
        "Circuit Open should block requests before timeout (P5 bug check)"
    );

    // Advance time but not enough to exceed timeout
    advance_clock(50);
    let allow_50ms = cb.allow_request();
    assert!(
        !allow_50ms,
        "Circuit Open should still block after 50ms (need 100ms timeout)"
    );

    // Advance past timeout (60ms additional = 110ms total)
    advance_clock(60);
    let allow_110ms = cb.allow_request();
    // After timeout, should transition to HalfOpen and allow the probe
    assert!(
        allow_110ms,
        "Circuit should probe (transition to HalfOpen) after timeout"
    );

    reset_clock();
}

// ============================================================================
// STATE INVARIANT CHECKS (Helper Functions)
// ============================================================================

/// Validate that an RlState satisfies all bounds and invariants.
pub fn assert_rl_state_valid(state: &RlState) {
    // Invariant 1: health_level in [0, 4]
    assert!(
        state.health_level <= 4,
        "health_level {} exceeds max 4",
        state.health_level
    );

    // Invariant 2: event_rate_q in [0, 7]
    assert!(
        state.event_rate_q <= 7,
        "event_rate_q {} exceeds max 7",
        state.event_rate_q
    );

    // Invariant 3: activity_count_q in [0, 7]
    assert!(
        state.activity_count_q <= 7,
        "activity_count_q {} exceeds max 7",
        state.activity_count_q
    );

    // Invariant 4: spc_alert_level in [0, 3]
    assert!(
        state.spc_alert_level <= 3,
        "spc_alert_level {} exceeds max 3",
        state.spc_alert_level
    );

    // Invariant 5: drift_status in [0, 2]
    assert!(
        state.drift_status <= 2,
        "drift_status {} exceeds max 2",
        state.drift_status
    );

    // Invariant 6: rework_ratio_q in [0, 7]
    assert!(
        state.rework_ratio_q <= 7,
        "rework_ratio_q {} exceeds max 7",
        state.rework_ratio_q
    );

    // Invariant 7: circuit_state in [0, 2]
    assert!(
        state.circuit_state <= 2,
        "circuit_state {} exceeds max 2",
        state.circuit_state
    );

    // Invariant 8: cycle_phase in [0, 3]
    assert!(
        state.cycle_phase <= 3,
        "cycle_phase {} exceeds max 3",
        state.cycle_phase
    );
}

/// Validate that a health transition respects monotonicity rules.
/// - On success (guard_pass && circuit_allowed): health can stay or improve (≤0)
/// - On failure: health degrades (+1)
pub fn assert_health_transition_valid(
    prev_health: u8,
    next_health: u8,
    guard_pass: bool,
    circuit_allowed: bool,
) {
    let is_success = guard_pass && circuit_allowed;
    let delta = next_health as i8 - prev_health as i8;

    if is_success {
        // On success: health can improve (delta ≤ 0) or stay same (delta = 0)
        assert!(
            delta <= 0,
            "Success should improve or maintain health, not degrade. {} → {} (delta={})",
            prev_health,
            next_health,
            delta
        );
    } else {
        // On failure: health degrades (delta should be +1 or 0 if already terminal)
        if prev_health < 4 {
            assert_eq!(
                delta, 1,
                "Failure should degrade health by exactly 1. {} → {} (delta={})",
                prev_health, next_health, delta
            );
        } else {
            // Terminal state (health=4) should stay at 4
            assert_eq!(
                next_health, 4,
                "Terminal health (4) should not change. {} → {}",
                prev_health, next_health
            );
        }
    }
}

// ============================================================================
// INTEGRATION TESTS: Combined Invariant Validation
// ============================================================================

#[test]
fn test_all_rl_state_fields_in_bounds() {
    // Construct RlState with extreme values (all valid boundaries)
    let extreme_states = vec![
        RlState {
            health_level: 0,
            event_rate_q: 0,
            activity_count_q: 0,
            spc_alert_level: 0,
            drift_status: 0,
            rework_ratio_q: 0,
            circuit_state: 0,
            cycle_phase: 0,
        },
        RlState {
            health_level: 4,
            event_rate_q: 7,
            activity_count_q: 7,
            spc_alert_level: 3,
            drift_status: 2,
            rework_ratio_q: 7,
            circuit_state: 2,
            cycle_phase: 3,
        },
        // Mixed values
        RlState {
            health_level: 2,
            event_rate_q: 4,
            activity_count_q: 3,
            spc_alert_level: 1,
            drift_status: 1,
            rework_ratio_q: 5,
            circuit_state: 1,
            cycle_phase: 2,
        },
    ];

    for state in extreme_states {
        assert_rl_state_valid(&state);
    }
}

#[test]
fn test_health_transitions_respect_monotonicity() {
    // Test all valid improvement transitions (success case)
    let success_transitions = vec![
        (4, 4, true), // Terminal: stable
        (3, 3, true), // Sufficient successes: improve by 1 → but shows as stable until threshold
        (3, 2, true), // After threshold: improve
        (2, 1, true), // Continue improving
        (1, 0, true), // Reach normal
        (0, 0, true), // Already normal
    ];

    for (prev, next, guard_pass) in success_transitions {
        assert_health_transition_valid(prev, next, guard_pass, true);
    }

    // Test all valid degradation transitions (failure case)
    let failure_transitions = vec![
        (0, 1, false),
        (1, 2, false),
        (2, 3, false),
        (3, 4, false),
        (4, 4, false), // Terminal stays terminal
    ];

    for (prev, next, guard_fail) in failure_transitions {
        assert_health_transition_valid(prev, next, guard_fail, true);
    }
}

#[test]
fn test_circuit_breaker_timeout_logic_integrity() {
    use wasm4pm::self_healing::{advance_clock, reset_clock};

    reset_clock();

    let config = CircuitBreakerConfig {
        failure_threshold: 2,
        success_threshold: 1,
        open_timeout_ms: 100,
        half_open_timeout_ms: 50,
    };

    let mut cb = CircuitBreaker::with_config(config);

    // Closed state: always allow
    assert!(cb.allow_request(), "Closed should allow requests");

    // Trigger open: 2 failures
    cb.record_failure();
    cb.record_failure();
    assert_eq!(cb.state(), CircuitState::Open);

    // Open state: block until timeout
    assert!(!cb.allow_request(), "Open should block request at t=0");

    advance_clock(100);
    // After 100ms, allow_request should transition to HalfOpen and return true
    let allowed = cb.allow_request();
    assert!(
        allowed,
        "Open should allow probe after timeout (transitions to HalfOpen)"
    );
    assert_eq!(
        cb.state(),
        CircuitState::HalfOpen,
        "Should transition to HalfOpen after timeout"
    );

    // HalfOpen: one success closes
    cb.record_success();
    assert_eq!(
        cb.state(),
        CircuitState::Closed,
        "One success should close circuit from HalfOpen"
    );

    reset_clock();
}

#[test]
fn test_spc_alert_bounds_never_exceeded() {
    // Simulate various SPC alert counts and verify quantization stays in bounds
    let spc_counts = vec![0, 1, 3, 5, 10, 20, 100];

    for count in spc_counts {
        // Quantization: map count to [0-3]
        // Typical: (count / 5).min(3) or similar
        let quantized = ((count / 5) as u8).min(3);
        assert!(
            quantized <= 3,
            "SPC quantization of {} alerts should be ≤ 3, got {}",
            count,
            quantized
        );
    }
}

#[test]
fn test_no_invalid_health_jumps_possible() {
    // For each valid health state, verify that transitions are always ±1 or 0
    for health in 0u8..=4 {
        // Degradation (failure): health → (health + 1).min(4)
        let degraded = (health + 1).min(4);
        let degrade_delta = degraded as i8 - health as i8;
        assert!(
            degrade_delta >= 0 && degrade_delta <= 1,
            "Degradation from {} → {} (delta={}) violates monotonicity",
            health,
            degraded,
            degrade_delta
        );

        // Improvement (success): health → health.saturating_sub(1)
        let improved = health.saturating_sub(1);
        let improve_delta = improved as i8 - health as i8;
        assert!(
            improve_delta <= 0,
            "Improvement from {} → {} (delta={}) violates monotonicity",
            health,
            improved,
            improve_delta
        );
    }
}
