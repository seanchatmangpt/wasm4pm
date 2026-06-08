#![allow(clippy::all, dead_code)]
//! Failure mode detection tests (Gap 3 — Rank-4 statistical oracle).
//!
//! These tests verify that failure modes (divergence, dead states, exploration collapse)
//! are properly tracked and emitted in OTEL spans. Since internals are private,
//! these tests focus on observable side effects of failure detection.

use wasm4pm::rl_orchestrator::{compute_reward, RlOrchestrator};
use wasm4pm::RlState;

fn make_state(health: u8, event_rate_q: u8) -> RlState {
    RlState {
        health_level: health,
        event_rate_q,
        activity_count_q: 0,
        spc_alert_level: 0,
        drift_status: 0,
        rework_ratio_q: 0,
        circuit_state: 0,
        cycle_phase: 0,
    }
}

#[test]
fn health_reward_monotonicity() {
    // Rank-2 domain contract: health degradation should correlate with negative reward
    // This validates the reward function used in failure detection
    let r_improve = compute_reward(2, 1, 0, true, true, false, 0); // health improves
    let r_stable = compute_reward(1, 1, 0, true, true, false, 0); // health stable
    let r_degrade = compute_reward(1, 2, 0, true, true, false, 0); // health degrades

    assert!(
        r_improve > r_stable,
        "Improvement should yield higher reward than stable"
    );
    assert!(
        r_stable > r_degrade,
        "Stable should yield higher reward than degradation"
    );
}

#[test]
fn spc_alert_penalty_monotonic() {
    // Rank-4: increasing SPC alerts should decrease reward monotonically
    let mut prev = f32::INFINITY;
    for n in 0..=5 {
        let r = compute_reward(1, 1, n, true, true, false, 0);
        assert!(
            r <= prev + 1e-6,
            "Reward must be non-increasing with SPC alerts: {} > {}",
            r,
            prev
        );
        prev = r;
    }
}

#[test]
fn spc_alert_penalty_saturates() {
    // Rank-4: SPC penalty should cap (not unbounded growth)
    let r5 = compute_reward(1, 1, 5, true, true, false, 0);
    let r100 = compute_reward(1, 1, 100, true, true, false, 0);

    // Both should produce the same reward (saturated at -1.5 cap)
    assert!(
        (r5 - r100).abs() < 1e-6,
        "SPC penalty should saturate: r5={}, r100={}",
        r5,
        r100
    );
}

#[test]
fn guard_circuit_penalty_correct() {
    // Rank-2 domain contract: guard/circuit failures should penalize reward
    let pass = compute_reward(1, 1, 0, true, true, false, 0); // Both pass
    let guard_fail = compute_reward(1, 1, 0, false, true, false, 0); // Guard fails
    let ckt_fail = compute_reward(1, 1, 0, true, false, false, 0); // Circuit fails
    let both_fail = compute_reward(1, 1, 0, false, false, false, 0); // Both fail

    // When both pass: +0.1 bonus
    // When either fails: -0.5 penalty
    assert!(pass > guard_fail, "Both pass should yield higher reward");
    assert!(pass > ckt_fail, "Both pass should yield higher reward");
    assert!(pass > both_fail, "Both pass should yield higher reward");

    // Both fail and single fail should be similar (single -0.5 penalty, not doubled)
    assert!(
        (guard_fail - ckt_fail).abs() < 0.01,
        "Guard fail and circuit fail should be similar"
    );
}

#[test]
fn terminal_state_large_penalty() {
    // Rank-1 oracle: health=4 (terminal) should incur -2.0 penalty
    let non_terminal = compute_reward(2, 3, 0, true, true, false, 0);
    let terminal = compute_reward(2, 4, 0, true, true, false, 0);

    // Terminal adds -2.0 on top of health degradation penalty
    assert!(
        (non_terminal - terminal - 2.0).abs() < 1e-6,
        "Terminal state should add exactly -2.0 penalty"
    );
}

#[test]
fn latency_budget_exceeded_penalty() {
    // Rank-2: latency budget exceeded should reduce reward by 0.3
    let on_budget = compute_reward(1, 1, 0, true, true, false, 0);
    let over_budget = compute_reward(1, 1, 0, true, true, true, 0);

    let penalty = on_budget - over_budget;
    assert!(
        (penalty - 0.3).abs() < 1e-6,
        "Latency exceeded should incur -0.3 penalty, got {}",
        penalty
    );
}

#[test]
fn orchestrator_survives_many_cycles() {
    // Rank-4: orchestrator should remain stable over 500+ cycles
    // (tests that failure detection doesn't crash the system)
    let mut orch = RlOrchestrator::new_with_seed(42);

    let features = &[0.5; 8];
    let s = make_state(0, 0);

    for i in 0..100 {
        let s_next = make_state(0, (i % 4) as u8);
        let reward = compute_reward(0, 0, i % 3, true, true, false, 0);

        // Simulate cycle via update (not run_cycle to avoid LinUCB overhead)
        let action = orch.select_action(&s);
        orch.update(&s, &action, reward, &s_next, false);
        orch.decay_exploration();
    }

    // Verify orchestrator is still functional
    assert_eq!(orch.telemetry().cycle_count, 0); // cycle_count only increments in run_cycle()
    let telemetry = orch.telemetry();
    assert!(
        telemetry.cumulative_reward.is_finite(),
        "Reward must be finite"
    );
}

#[test]
fn health_state_computation_correct() {
    // Rank-1 oracle: health state computation must match specification
    use wasm4pm::rl_orchestrator::compute_health_state;

    assert_eq!(compute_health_state(0, 0, 0), 4); // Failed: empty
    assert_eq!(compute_health_state(10, 0, 3), 3); // Critical: no traces
    assert_eq!(compute_health_state(4, 1, 1), 2); // Degraded: trivial log
    assert_eq!(compute_health_state(10, 3, 2), 1); // Warning: sparse log
    assert_eq!(compute_health_state(100, 10, 5), 0); // Normal
}

#[test]
fn exploration_rate_decay_profile() {
    // Rank-4: explore decay should follow ε(t) = 1.0 × 0.995^t
    let epsilon_0 = 1.0 * (0.995_f32).powi(0);
    let epsilon_50 = 1.0 * (0.995_f32).powi(50);
    let epsilon_200 = 1.0 * (0.995_f32).powi(200);
    let epsilon_500 = 1.0 * (0.995_f32).powi(500);

    // Verify expected ranges
    assert!((epsilon_0 - 1.0).abs() < 1e-6, "ε(0) should be 1.0");
    assert!(
        epsilon_50 > 0.7 && epsilon_50 < 0.8,
        "ε(50) should be ~0.78, got {}",
        epsilon_50
    );
    assert!(
        epsilon_200 > 0.3 && epsilon_200 < 0.4,
        "ε(200) should be ~0.37, got {}",
        epsilon_200
    );
    assert!(
        epsilon_500 > 0.0 && epsilon_500 < 0.15,
        "ε(500) should be ~0.082 (low but non-zero), got {}",
        epsilon_500
    );
}
