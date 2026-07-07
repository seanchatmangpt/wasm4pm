#![cfg(feature = "cloud")]
//! Iter-4 regression oracles for previously-untested boundaries.
//!
//! Scope:
//! - LinUCB out-of-spec feature handling (Rank-1 contract: A^{-1} stays
//!   symmetric and Q values stay finite under negative/large features).
//! - LinUCB covariance variance non-negativity (Rank-1, depends only on
//!   stored state being positive-definite-ish).
//! - SpcHistory ring-buffer capacity-1 (smallest non-degenerate ring).
//! - SpcHistory cycle_count monotonicity (never decrements across pushes
//!   even when the buffer evicts).
//! - CircuitBreaker time-skew safety: `last_state_change_ms` may exceed
//!   `now_ms()` after JSON state restore — saturating subtract must yield
//!   `elapsed == 0` (no premature timeout).
//!
//! Every test pins a Rank-1 or Rank-2 oracle. None are self-referential.

#![cfg(feature = "cloud")]

use std::sync::Mutex;
use wasm4pm::ml::linucb::{LinUCBAgent, N_ACTIONS, N_FEATURES};
use wasm4pm::self_healing::{
    advance_clock, now_ms, reset_clock, CircuitBreaker, CircuitBreakerConfig, CircuitState,
};
use wasm4pm::spc_history::{RingBuffer, SpcHistory, SpcSnapshot};

/// Serialises access to the global `TIME_OFFSET_MS` static used by
/// `now_ms / advance_clock / reset_clock`. cargo runs tests in parallel by
/// default, and that global is the only shared mutable state in our suite,
/// so any test that touches it must hold this mutex for its duration.
static CLOCK_LOCK: Mutex<()> = Mutex::new(());

// ---------------------------------------------------------------------------
// LinUCB — Rank-1 numeric invariants
// ---------------------------------------------------------------------------

/// Rank-1: x^T A^{-1} x ≥ 0 because A is initialised as λI (positive definite)
/// and every rank-1 outer-product update preserves positive semi-definiteness.
/// `compute_ucb_variance` therefore must never return a negative value, even
/// when the caller violates the documented [0,1] contract.
#[test]
fn linucb_variance_non_negative_under_unnormalized_features() {
    let agent = LinUCBAgent::new();
    let cases: [[f32; N_FEATURES]; 4] = [
        [0.0; N_FEATURES],
        [1.0; N_FEATURES],
        [-1.0; N_FEATURES], // out-of-spec negative
        [10.0; N_FEATURES], // out-of-spec >1
    ];
    for (i, x) in cases.iter().enumerate() {
        let v = agent.compute_ucb_variance(x);
        assert!(v >= 0.0, "case {i}: variance must be ≥ 0, got {v}");
        assert!(v.is_finite(), "case {i}: variance must be finite, got {v}");
    }
}

/// Rank-1: Sherman-Morrison preserves matrix symmetry exactly when implemented
/// with the outer-product formula. After many updates A_inv[i][j] must equal
/// A_inv[j][i] within f32 rounding (≤ ~1e-5 for our magnitudes).
#[test]
#[allow(clippy::needless_range_loop)]
fn linucb_a_inv_symmetric_after_repeated_updates() {
    let mut agent = LinUCBAgent::new();
    let features = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8];
    for _ in 0..20 {
        agent.update(&features, 1, 0.5);
    }
    let a_inv = agent.inverse_covariance();
    for i in 0..N_FEATURES {
        for j in (i + 1)..N_FEATURES {
            let d = (a_inv[i][j] - a_inv[j][i]).abs();
            assert!(
                d < 1e-5,
                "A_inv[{i}][{j}]={} vs [{j}][{i}]={} Δ={d}",
                a_inv[i][j],
                a_inv[j][i]
            );
        }
    }
}

/// Rank-1: select() must still pick a valid action and produce a finite
/// score when given negative or oversize features (defensive: the caller is
/// supposed to normalize but a bug upstream must not crash the bandit).
#[test]
fn linucb_select_finite_under_out_of_spec_features() {
    let agent = LinUCBAgent::new();
    let weird = [-0.5_f32, 2.0, -3.0, 0.0, 1.5, -0.1, 0.7, 4.2];
    let (action, score) = agent.select(&weird);
    assert!(
        (action as usize) < N_ACTIONS,
        "action {action} out of range"
    );
    assert!(score.is_finite(), "score must be finite, got {score}");
}

// ---------------------------------------------------------------------------
// SpcHistory — ring buffer boundary cases
// ---------------------------------------------------------------------------

/// Rank-2 contract: A ring buffer of capacity 1 must hold at most 1 item and
/// always evict the previous element on every push (smallest non-degenerate
/// ring; protects against fence-post errors in the eviction predicate).
#[test]
fn ring_buffer_capacity_one_evicts_every_push() {
    let mut rb: RingBuffer<i32, 1> = RingBuffer::new();
    assert_eq!(rb.len(), 0);
    rb.push(1);
    rb.push(2);
    rb.push(3);
    assert_eq!(rb.len(), 1, "capacity-1 ring must never exceed 1 item");
    let vals: Vec<i32> = rb.iter().copied().collect();
    assert_eq!(vals, vec![3], "only the newest item must remain");
}

/// Rank-2 contract: SpcHistory.cycle_count is the lifetime push counter.
/// It must NEVER decrement when the bounded ring evicts; it tracks total
/// snapshots ever recorded, not stored snapshots.
#[test]
fn spc_history_cycle_count_monotonic_across_evictions() {
    let mut h = SpcHistory::new();
    for i in 0..150_u64 {
        h.record_snapshot(SpcSnapshot::new(format!("t{i}"), 1.0, 100.0, 0.5, 0));
        assert_eq!(
            h.cycle_count,
            i + 1,
            "cycle_count must monotonically increase"
        );
    }
    // Buffer capacity is 100; storage saturates but counter does not.
    assert_eq!(h.history.len(), 100, "ring buffer must cap at 100");
    assert_eq!(h.cycle_count, 150, "cycle_count must equal total pushes");
}

/// Rank-2: after clear(), cycle_count resets to zero AND the buffer is empty;
/// subsequent pushes restart the count at 1. Guards against partial reset bugs.
#[test]
fn spc_history_clear_resets_both_counter_and_storage() {
    let mut h = SpcHistory::new();
    for i in 0..10 {
        h.record_snapshot(SpcSnapshot::new(format!("t{i}"), 1.0, 100.0, 0.5, 0));
    }
    assert_eq!(h.cycle_count, 10);
    h.clear();
    assert_eq!(h.cycle_count, 0, "cycle_count must reset on clear()");
    assert!(
        h.history.is_empty(),
        "ring buffer must be empty after clear()"
    );
    h.record_snapshot(SpcSnapshot::new("post".into(), 1.0, 100.0, 0.5, 0));
    assert_eq!(h.cycle_count, 1, "post-clear push must increment from 0");
}

// ---------------------------------------------------------------------------
// CircuitBreaker — time-skew handling
// ---------------------------------------------------------------------------

/// Rank-2: if a serialised circuit breaker is restored on a host where
/// `now_ms()` is less than the previously-recorded `last_state_change_ms`
/// (clock skew or test-clock reset), `allow_request` must not panic, must
/// not prematurely time-out from Open→HalfOpen, and must return the
/// state-appropriate `allow` flag.
///
/// Implementation contract: `elapsed = now_ms().saturating_sub(last)` so
/// `elapsed` clamps to 0 and the per-state timeout cannot fire until
/// `now_ms()` catches up.
#[test]
fn circuit_breaker_handles_clock_skew_after_state_restore() {
    let _guard = CLOCK_LOCK.lock().unwrap();
    reset_clock();
    let base = now_ms();
    // Build a state JSON whose timestamp is FAR in the future relative to now.
    let json_state = wasm4pm::self_healing::CircuitBreakerStateJson {
        config: wasm4pm::self_healing::CircuitBreakerConfigJson {
            failure_threshold: 5,
            success_threshold: 2,
            open_timeout_ms: 1_000,
            half_open_timeout_ms: 500,
        },
        state: 2, // Open
        failure_count: 5,
        success_count: 0,
        // Pretend the breaker tripped 1 hour in the "future".
        last_state_change_ms: base.saturating_add(3_600_000),
        last_transition_reason: "failure_threshold_exceeded".to_string(),
        transition_count: 1,
    };
    let mut cb = CircuitBreaker::from_state_json(json_state);
    assert_eq!(cb.state(), CircuitState::Open);

    // allow_request must NOT trip the timeout (elapsed clamps to 0).
    let allowed = cb.allow_request();
    assert!(
        !allowed,
        "Open + skewed-future timestamp must still reject requests"
    );
    assert_eq!(
        cb.state(),
        CircuitState::Open,
        "must remain Open under clock skew"
    );

    // Once the real clock catches up past the timeout, it must transition.
    advance_clock(3_600_000 + 1_500); // catch up + timeout
    let allowed = cb.allow_request();
    assert!(
        allowed,
        "after clock catches up + timeout, Open→HalfOpen must allow probe"
    );
    assert_eq!(cb.state(), CircuitState::HalfOpen);
    reset_clock();
}

/// Rank-2: a freshly-constructed Open breaker with a `last_state_change_ms`
/// in the past by exactly `open_timeout_ms` must transition Open→HalfOpen on
/// the next `allow_request`. Pin the boundary so the comparator is `>=`,
/// not `>`.
#[test]
fn circuit_breaker_open_to_half_open_at_exact_timeout() {
    let _guard = CLOCK_LOCK.lock().unwrap();
    reset_clock();
    let json_state = wasm4pm::self_healing::CircuitBreakerStateJson {
        config: wasm4pm::self_healing::CircuitBreakerConfigJson {
            failure_threshold: 5,
            success_threshold: 2,
            open_timeout_ms: 1_000,
            half_open_timeout_ms: 500,
        },
        state: 2, // Open
        failure_count: 5,
        success_count: 0,
        last_state_change_ms: now_ms().saturating_sub(1_000), // exactly at timeout
        last_transition_reason: "failure_threshold_exceeded".to_string(),
        transition_count: 1,
    };
    let mut cb = CircuitBreaker::from_state_json(json_state);
    let allowed = cb.allow_request();
    assert!(
        allowed,
        "at exact timeout, Open must transition to HalfOpen"
    );
    assert_eq!(cb.state(), CircuitState::HalfOpen);
}

/// Rank-2: Closed breakers never time out regardless of `last_state_change_ms`
/// (encoded via `timeouts[Closed] = u64::MAX` in `allow_request`).
#[test]
fn circuit_breaker_closed_never_times_out() {
    let _guard = CLOCK_LOCK.lock().unwrap();
    reset_clock();
    let cb_cfg = CircuitBreakerConfig {
        failure_threshold: 5,
        success_threshold: 2,
        open_timeout_ms: 1, // tiny
        half_open_timeout_ms: 1,
    };
    let mut cb = CircuitBreaker::with_config(cb_cfg).unwrap();
    advance_clock(1_000_000_000); // huge skip
    let allowed = cb.allow_request();
    assert!(
        allowed,
        "Closed must always allow regardless of elapsed time"
    );
    assert_eq!(cb.state(), CircuitState::Closed);
    reset_clock();
}
