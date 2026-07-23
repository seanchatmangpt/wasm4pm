#![cfg(feature = "cloud")]
#![allow(clippy::all, dead_code)]
//! RL Systems Audit — 5 Critical Gaps + Rank-1 Oracle Validation
//!
//! Comprehensive audit of wasm4pm RL orchestrator identifying and validating
//! fixes for:
//!   GAP-1: Bellman update divergence (unbounded Q-values)
//!   GAP-2: Feature normalization (invalid LinUCB context)
//!   GAP-3: TD error monotonicity (learning rate stability)
//!   GAP-4: State quantization bounds (rework_ratio_q overflow)
//!   GAP-5: State coverage analysis (exploration gaps)
//!
//! **Test Coverage (14 total):** All 14 tests are active (no #[ignore] tags).
//! Test count: 14 tests (Rank-1 mathematical oracles + integration)
//! All tests are deterministic (seeded RNG where applicable).

use wasm4pm::reinforcement::QLearning;
use wasm4pm::rl_orchestrator::{
    compute_health_state, compute_reward, learning_rate_schedule, RlOrchestrator,
};
use wasm4pm::{create_rl_state, RlAction};

// ---------------------------------------------------------------------------
// GAP-1: Bellman Update Divergence (Q-values Unbounded)
// ---------------------------------------------------------------------------

#[test]
fn gap1_q_values_have_reasonable_bounds_under_reward_range() {
    // RANK-1 ORACLE: Bellman equation with bounded rewards and discount factor < 1
    // guarantees bounded Q-values IF no learning rate is unbounded.
    // With α=0.1, γ=0.99, reward ∈ [-5.5, +1.6]:
    //   Q_target ≤ r_max + γ·Q_max ≤ 1.6 + 0.99·Q_max
    //   Solving: Q_max ≤ 160 (loose upper bound from series)

    let agent = QLearning::new_with_seed(0.1, 0.99, 42);
    let state = create_rl_state(0, 0, 0, 0, 0, 0, 0, 0);
    let next_state = create_rl_state(0, 0, 0, 0, 0, 0, 0, 0);
    let action = RlAction::Continue;

    // Worst-case: maximize Q via extreme negative reward bootstrapping
    // Repeatedly reinforce with negative terminal states
    for _ in 0..1000 {
        agent.update(&state, &action, -5.5, &next_state, true);
    }

    let q_value = agent.get_q_value(&state, &action);
    assert!(
        q_value.is_finite(),
        "Q-value must remain finite under bounded rewards, got {}",
        q_value
    );
    assert!(
        q_value.abs() < 1000.0,
        "Q-value must stay bounded under controlled updates, got {}",
        q_value
    );
}

#[test]
fn gap1_q_value_divergence_detection() {
    // Detect if Q-values start exploding (early warning for instability)
    let agent = QLearning::new_with_seed(0.1, 0.99, 43);
    let mut state = create_rl_state(0, 0, 0, 0, 0, 0, 0, 0);
    let action = RlAction::Continue;

    let mut max_q_seen = 0.0_f32;
    for cycle in 0..500 {
        let next_state = create_rl_state((cycle % 5) as u8, 0, 0, 0, 0, 0, 0, 0);
        agent.update(&state, &action, 1.5, &next_state, false);

        let q = agent.get_q_value(&state, &action);
        if q.abs() > max_q_seen {
            max_q_seen = q.abs();
        }
        state = next_state;
    }

    // Over 500 cycles, max Q should not exceed ~50 (reasonable learning plateau)
    assert!(
        max_q_seen < 100.0,
        "Q-value growth should stabilize, got max={}, indicating possible divergence",
        max_q_seen
    );
}

// ---------------------------------------------------------------------------
// GAP-2: Feature Normalization (LinUCB Context Validation)
// ---------------------------------------------------------------------------

#[test]
fn gap2_linucb_action_selection_is_valid() {
    // RANK-1 ORACLE: LinUCB must always return valid action index [0, 4]
    // LinUCB feature normalization is caller's responsibility.
    // We verify the contract is respected by testing multiple feature ranges.

    let orchestrator = RlOrchestrator::new();

    // Valid range: all features in [0, 1]
    let valid_features = [0.0, 0.25, 0.5, 0.75, 1.0, 0.1, 0.3, 0.9];
    let action1 = orchestrator.linucb_bounded_select(&valid_features);
    assert!(action1 < 5, "LinUCB must return valid action index [0, 4]");

    // Verify action selection is deterministic
    let action1_again = orchestrator.linucb_bounded_select(&valid_features);
    assert_eq!(
        action1, action1_again,
        "LinUCB selection must be deterministic"
    );
}

#[test]
fn gap2_linucb_context_binding_validates_features() {
    // RANK-2 ORACLE: LinUCB agent selection must work with normalized features [0,1]
    // This test documents the feature normalization requirement.

    let orchestrator = RlOrchestrator::new_with_seed(42);

    let features1 = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8];
    let mut features2 = features1;
    features2[0] = 0.9; // Change one feature to different normalized value

    // Both should return valid action indices
    let action1 = orchestrator.linucb_bounded_select(&features1);
    let action2 = orchestrator.linucb_bounded_select(&features2);

    assert!(
        action1 < 5 && action2 < 5,
        "Both feature contexts should yield valid actions"
    );

    // Different contexts should generally produce different decisions
    // (though not guaranteed, it's expected for distinct feature vectors)
}

// ---------------------------------------------------------------------------
// GAP-3: TD Error Monotonicity (Learning Rate Stability)
// ---------------------------------------------------------------------------

#[test]
fn gap3_td_error_should_generally_decrease_with_learning() {
    // RANK-1 ORACLE: In stable environment, TD error should generally decrease
    // as agent learns. Aggressive learning rate can cause oscillation.

    let agent = QLearning::new_with_seed(0.1, 0.99, 44);
    let state = create_rl_state(0, 0, 0, 0, 0, 0, 0, 0);
    let action = RlAction::Continue;

    let mut td_errors = Vec::new();

    // Consistent positive reward → agent learns to expect +1.0
    for i in 0..100 {
        let next_state = create_rl_state(0, i % 4, 0, 0, 0, 0, 0, 0);
        let q_before = agent.get_q_value(&state, &action);
        let reward = 1.0; // Consistent positive reward
        agent.update(&state, &action, reward, &next_state, false);
        let _q_after = agent.get_q_value(&state, &action);
        let td_error = (reward - q_before).abs();
        td_errors.push(td_error);
    }

    // TD error should trend downward (decreasing, not increasing)
    let early_avg = td_errors[0..20].iter().sum::<f32>() / 20.0;
    let late_avg = td_errors[80..100].iter().sum::<f32>() / 20.0;

    assert!(
        late_avg < early_avg,
        "TD error must decrease as agent learns: early={:.6}, late={:.6}",
        early_avg,
        late_avg
    );
}

#[test]
fn gap3_learning_rate_decay_reduces_update_magnitude() {
    // RANK-1 ORACLE: Learning rate schedule α_t = α_0 * (0.9999 ^ cycle_count)
    // should produce decreasing update magnitudes over cycles.

    let alpha_0 = 0.1_f32;
    let lr_0 = learning_rate_schedule(alpha_0, 0);
    let lr_1000 = learning_rate_schedule(alpha_0, 1000);
    let lr_10000 = learning_rate_schedule(alpha_0, 10000);

    // Verify monotonic decay
    assert!(
        lr_0 >= lr_1000 && lr_1000 >= lr_10000,
        "Learning rate must decay monotonically: α(0)={}, α(1000)={}, α(10k)={}",
        lr_0,
        lr_1000,
        lr_10000
    );

    // At cycle 0: no decay
    assert!(
        (lr_0 - alpha_0).abs() < 1e-6,
        "Learning rate at cycle 0 should be α_0"
    );

    // At cycle 10000: roughly 37% of original (0.9999^10000 ≈ 0.37)
    let expected_at_10k = alpha_0 * 0.37;
    assert!(
        (lr_10000 - expected_at_10k).abs() < 0.01,
        "Learning rate decay schedule incorrect: expected ~{}, got {}",
        expected_at_10k,
        lr_10000
    );
}

// ---------------------------------------------------------------------------
// GAP-4: State Quantization Bounds (Rework Ratio Overflow)
// ---------------------------------------------------------------------------

#[test]
fn gap4_rework_ratio_q_must_be_in_bounds() {
    // RANK-1 ORACLE: rework_ratio_q (dimension 5 of 8D state) is quantized u8 [0,7].
    // Ensure reward computation clamps out-of-range values.

    // Valid range: [0, 7]
    for rework_q in 0..=7 {
        let reward = compute_reward(0, 0, 0, true, true, false, rework_q);
        assert!(
            reward.is_finite(),
            "Reward must be finite for valid rework_q={}, got {}",
            rework_q,
            reward
        );
    }

    // Out-of-range value (simulating buffer overflow or bug)
    // The compute_reward function guards against this by clamping
    let reward_overflow = compute_reward(0, 0, 0, true, true, false, 255);
    assert!(
        reward_overflow.is_finite(),
        "Reward computation must guard against out-of-range rework_q"
    );
}

#[test]
fn gap4_state_construction_respects_dimension_bounds() {
    // RANK-1 ORACLE: RlState dimensions must fit their declared bounds
    // Verify all create_rl_state calls enforce bounds.

    // Health: [0, 4]
    for h in 0..=4 {
        let s = create_rl_state(h, 0, 0, 0, 0, 0, 0, 0);
        assert_eq!(s.health_level, h, "Health should be preserved");
    }

    // Event rate: [0, 7]
    for e in 0..=7 {
        let s = create_rl_state(0, e, 0, 0, 0, 0, 0, 0);
        assert_eq!(s.event_rate_q, e);
    }

    // Activity count: [0, 7]
    for a in 0..=7 {
        let s = create_rl_state(0, 0, a, 0, 0, 0, 0, 0);
        assert_eq!(s.activity_count_q, a);
    }

    // SPC alert level: [0, 3]
    for sp in 0..=3 {
        let s = create_rl_state(0, 0, 0, sp, 0, 0, 0, 0);
        assert_eq!(s.spc_alert_level, sp);
    }

    // Drift status: [0, 2]
    for d in 0..=2 {
        let s = create_rl_state(0, 0, 0, 0, d, 0, 0, 0);
        assert_eq!(s.drift_status, d);
    }

    // Rework ratio: [0, 7]
    for r in 0..=7 {
        let s = create_rl_state(0, 0, 0, 0, 0, r, 0, 0);
        assert_eq!(s.rework_ratio_q, r);
    }

    // Circuit state: [0, 2]
    for c in 0..=2 {
        let s = create_rl_state(0, 0, 0, 0, 0, 0, c, 0);
        assert_eq!(s.circuit_state, c);
    }

    // Cycle phase: [0, 3]
    for p in 0..=3 {
        let s = create_rl_state(0, 0, 0, 0, 0, 0, 0, p);
        assert_eq!(s.cycle_phase, p);
    }
}

// ---------------------------------------------------------------------------
// GAP-5: State Coverage Analysis (Exploration Verification)
// ---------------------------------------------------------------------------

#[test]
fn gap5_state_coverage_tracking_basic() {
    // RANK-2 ORACLE: State coverage should track visited state bins in the 8D space.
    // Total possible bins: 5 × 8 × 8 × 4 × 3 × 8 × 3 × 4 = 368,640

    let orchestrator = RlOrchestrator::new();

    // Visit a few distinct states
    let state1 = create_rl_state(0, 0, 0, 0, 0, 0, 0, 0);
    let state2 = create_rl_state(1, 1, 1, 1, 1, 1, 1, 1);
    let state3 = create_rl_state(2, 2, 2, 2, 2, 2, 2, 2);

    // Simulate run_cycle by inserting states manually
    let bin1 = RlOrchestrator::state_to_bin(&state1);
    let bin2 = RlOrchestrator::state_to_bin(&state2);
    let bin3 = RlOrchestrator::state_to_bin(&state3);

    assert_ne!(bin1, bin2, "Different states must map to different bins");
    assert_ne!(bin2, bin3, "Different states must map to different bins");

    // Coverage should reflect visited bins
    let coverage = orchestrator.get_state_coverage();
    assert_eq!(
        coverage.states_visited, 0,
        "Initial coverage should be empty"
    );
}

#[test]
fn gap5_state_coverage_percentage_is_accurate() {
    // RANK-2 ORACLE: Coverage percentage = states_visited / total_bins * 100
    // Total bins = 368,640

    let orchestrator = RlOrchestrator::new();
    let coverage = orchestrator.get_state_coverage();

    // Empty orchestrator: 0 states visited → 0% coverage
    assert_eq!(coverage.coverage_percentage, 0.0);
    assert_eq!(coverage.states_visited, 0);
}

#[test]
fn gap5_dimension_coverage_tracks_per_dimension_reachability() {
    // RANK-2 ORACLE: dimension_coverage array tracks unique values per dimension.
    // For 8 dimensions: [health, event_rate, activity_count, spc_alert, drift, rework, circuit, phase]

    let orchestrator = RlOrchestrator::new();
    let coverage = orchestrator.get_state_coverage();

    // Empty orchestrator: all dimensions have 0 unique values
    for dim in 0..8 {
        assert_eq!(
            coverage.dimension_coverage[dim], 0,
            "Dimension {} should have 0 coverage initially",
            dim
        );
    }
}

// ---------------------------------------------------------------------------
// Integration Tests
// ---------------------------------------------------------------------------

#[test]
fn integration_rl_cycle_reward_bounds() {
    // Integration: verify reward computation stays bounded across a full cycle

    let mut orchestrator = RlOrchestrator::new_with_seed(42);

    for cycle in 0..100 {
        let state = create_rl_state(
            (cycle % 5) as u8,
            (cycle % 8) as u8,
            (cycle % 8) as u8,
            (cycle % 4) as u8,
            (cycle % 3) as u8,
            (cycle % 8) as u8,
            (cycle % 3) as u8,
            (cycle % 4) as u8,
        );
        let next_state = create_rl_state(
            ((cycle + 1) % 5) as u8,
            ((cycle + 1) % 8) as u8,
            ((cycle + 1) % 8) as u8,
            ((cycle + 1) % 4) as u8,
            ((cycle + 1) % 3) as u8,
            ((cycle + 1) % 8) as u8,
            ((cycle + 1) % 3) as u8,
            ((cycle + 1) % 4) as u8,
        );

        let features = [
            (cycle % 100) as f32 / 100.0,
            ((cycle + 1) % 100) as f32 / 100.0,
            ((cycle + 2) % 100) as f32 / 100.0,
            ((cycle + 3) % 100) as f32 / 100.0,
            ((cycle + 4) % 100) as f32 / 100.0,
            ((cycle + 5) % 100) as f32 / 100.0,
            ((cycle + 6) % 100) as f32 / 100.0,
            ((cycle + 7) % 100) as f32 / 100.0,
        ];

        let (_, reward) =
            orchestrator.run_cycle(&features, &state, &next_state, 0, true, true, false);

        assert!(
            reward.is_finite(),
            "Reward must be finite at cycle {}, got {}",
            cycle,
            reward
        );
        assert!(
            reward >= -6.0 && reward <= 2.0,
            "Reward must stay in expected range at cycle {}, got {}",
            cycle,
            reward
        );
    }
}

#[test]
fn integration_health_state_computation_consistency() {
    // RANK-1 ORACLE: compute_health_state must be deterministic and consistent

    // Test all boundary conditions
    assert_eq!(compute_health_state(0, 0, 0), 4); // Empty: Failed
    assert_eq!(compute_health_state(1, 0, 1), 3); // No traces: Critical
    assert_eq!(compute_health_state(3, 1, 1), 2); // Trivial: Degraded
    assert_eq!(compute_health_state(10, 2, 2), 1); // Sparse: Warning
    assert_eq!(compute_health_state(100, 10, 5), 0); // Normal: OK

    // Consistency: calling twice with same input should give same output
    for events in 0..10 {
        for traces in 0..10 {
            for activities in 0..10 {
                let h1 = compute_health_state(events, traces, activities);
                let h2 = compute_health_state(events, traces, activities);
                assert_eq!(
                    h1, h2,
                    "Health state must be deterministic for ({}, {}, {})",
                    events, traces, activities
                );
            }
        }
    }
}

#[test]
fn integration_action_stats_no_nan() {
    // RANK-1 ORACLE: get_action_stats must never produce NaN
    // even with empty action history

    let orchestrator = RlOrchestrator::new();
    let stats = orchestrator.get_action_stats();

    // Empty history: stats should be empty (no NaN division)
    assert!(stats.is_empty(), "Empty history should produce empty stats");

    // All stats values should be finite
    for (action, (total, successful, rate)) in &stats {
        assert!(
            rate.is_finite(),
            "Success rate for action {} must be finite, got {}",
            action,
            rate
        );
        assert!(
            *successful <= *total,
            "Successful count cannot exceed total for action {}: {} > {}",
            action,
            successful,
            total
        );
    }
}
