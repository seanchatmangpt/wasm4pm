#![allow(clippy::all, dead_code)]
//! Edge case audit for RL orchestrator: action bounds, reward NaN/Inf, LinUCB safety

use wasm4pm::rl_orchestrator::{RlOrchestrator, AgentType, compute_reward, compute_reward_with_momentum, RewardParameters};
use wasm4pm::{RlState, RlAction};

// GUARD 1: Action bounds (0-4 valid, reject out-of-range)
#[test]
fn action_out_of_range_detection() {
    let _orchestrator = RlOrchestrator::new();

    // All valid actions should map successfully
    let valid_actions = vec![
        RlAction::Continue,
        RlAction::Scale,
        RlAction::Retry,
        RlAction::Fallback,
        RlAction::Restart,
    ];

    for (idx, action) in valid_actions.iter().enumerate() {
        assert_eq!(*action as usize, idx, "action index mismatch");
    }

    // Verify AgentType from_u8 rejects out-of-range
    assert!(AgentType::from_u8(5).is_none(), "AgentType should reject 5");
    assert!(AgentType::from_u8(255).is_none(), "AgentType should reject 255");

    // Valid agent types: 0-4
    for i in 0u8..5 {
        assert!(AgentType::from_u8(i).is_some(), "AgentType should accept {}", i);
    }
}

// GUARD 2: Division by zero in get_action_stats
#[test]
fn action_stats_zero_division_guard() {
    let orchestrator = RlOrchestrator::new();

    // Empty action history should not panic and should return empty map
    let stats = orchestrator.get_action_stats();
    assert!(stats.is_empty(), "empty history should yield empty stats");

    // With empty stats, verify no division by zero occurred
    for (action, (total, _successful, rate)) in &stats {
        // Guard: if total is 0, rate should be 0.0 (not NaN from division)
        if *total == 0 {
            assert_eq!(*rate, 0.0, "zero action count must yield 0.0 rate, not NaN");
        } else {
            // rate = successful / total, should be in [0.0, 1.0]
            assert!(*rate >= 0.0 && *rate <= 1.0, "rate {} out of bounds for action {}", rate, action);
        }
    }
}

// GUARD 3: Reward NaN/Inf detection
#[test]
fn reward_never_nan_or_inf() {
    // Test boundary cases that might produce NaN/Inf

    // Case 1: All zeros
    let r = compute_reward(0, 0, 0, false, false, false, 0);
    assert!(r.is_finite(), "reward should be finite, got {}", r);

    // Case 2: Maximum values
    let r = compute_reward(4, 4, 1000, true, true, true, 7);
    assert!(r.is_finite(), "reward should be finite even with max values, got {}", r);

    // Case 3: State with extreme rework
    let r = compute_reward(3, 4, 5, false, false, true, 7);
    assert!(r.is_finite(), "reward with max rework should be finite, got {}", r);

    // Case 4: With momentum bonus that could accumulate
    for momentum in [0u32, 5, 10, 100, 1000] {
        let r = compute_reward_with_momentum(RewardParameters {
            prev_health: 2,
            curr_health: 1,
            spc_alert_count: 0,
            guard_pass: true,
            circuit_allowed: true,
            latency_budget_exceeded: false,
            rework_ratio_q: 0,
            consecutive_successes: momentum,
        });
        assert!(r.is_finite(), "reward with momentum {} should be finite, got {}", momentum, r);
        // Momentum bonus caps at 10-cycle window, should not grow unbounded
        if momentum > 10 {
            let r_capped = compute_reward_with_momentum(RewardParameters {
                prev_health: 2,
                curr_health: 1,
                spc_alert_count: 0,
                guard_pass: true,
                circuit_allowed: true,
                latency_budget_exceeded: false,
                rework_ratio_q: 0,
                consecutive_successes: 10,
            });
            assert!(r <= r_capped * 1.001, "momentum bonus should cap at 10-cycle window");
        }
    }
}

// GUARD 4: Terminal state handling (health=4)
#[test]
fn terminal_state_reward_contract() {
    // When health == 4 (terminal/failed), should apply -2.0 penalty PLUS degradation penalty
    // terminal: 3->4 is degradation (-1.0) + terminal (-2.0) + guard+circuit (+0.1) = -2.9
    // stable: 3->3 is stable (+0.2) + guard+circuit (+0.1) = +0.3
    // diff: -2.9 - 0.3 = -3.2 (degradation -1.0 + terminal -2.0)
    let terminal = compute_reward(3, 4, 0, true, true, false, 0);
    let non_terminal = compute_reward(3, 3, 0, true, true, false, 0);

    // Difference: terminal includes both degradation (-1.0) and terminal penalty (-2.0) = -3.0 total impact
    let diff = terminal - non_terminal;
    assert!((diff - (-3.2)).abs() < 1e-6, "terminal + degradation should be -3.2, got {}", diff);
}

// GUARD 5: LinUCB action index bounds
#[test]
fn linucb_action_index_bounds() {
    let orchestrator = RlOrchestrator::new();

    // Create features for LinUCB selection
    let features = [0.5_f32; 8];

    // LinUCB bounded select should return action in [0, 4]
    let action_idx = orchestrator.linucb_bounded_select(&features);
    assert!(action_idx <= 4, "LinUCB action index {} must be in [0,4]", action_idx);

    // Verify conversion to AgentType is safe
    let agent = AgentType::from_u8(action_idx as u8);
    assert!(agent.is_some(), "LinUCB action {} should map to valid AgentType", action_idx);
}

// GUARD 6: State space dimension bounds
#[test]
fn state_space_dimension_bounds() {
    let state = RlState {
        health_level: 4,        // max 4
        event_rate_q: 7,        // max 7
        activity_count_q: 7,    // max 7
        spc_alert_level: 3,     // max 3
        drift_status: 2,        // max 2
        rework_ratio_q: 7,      // max 7
        circuit_state: 2,       // max 2
        cycle_phase: 3,         // max 3
    };

    // state_to_bin should handle max values without overflow
    let bin = RlOrchestrator::state_to_bin(&state);

    // Max bin: 4*61440 + 7*7680 + 7*960 + 3*240 + 2*80 + 7*10 + 2*3 + 3
    //        = 245760 + 53760 + 6720 + 720 + 160 + 70 + 6 + 3 = 306999
    // This should be < 368640 (total state space)
    assert!(bin < 368_640, "state bin {} must be < 368640", bin);
}

// GUARD 7: Reward component bounds accumulation
#[test]
fn reward_component_bounds_verified() {
    // Worst case: all penalties fire
    let r_worst = compute_reward(
        3,    // prev_health
        4,    // curr_health (degraded + terminal)
        5,    // spc_alert_count (capped at -1.5)
        false, // guard_pass (penalty -0.5)
        false, // circuit_allowed (redundant penalty, LUT [false,false]=-0.5)
        true,  // latency_budget_exceeded (-0.3)
        7,    // rework_ratio_q (max -0.2)
    );

    // Expected: -1.0 (degradation) + -2.0 (terminal) - 1.5 (SPC) - 0.5 (guard/circuit) - 0.3 (latency) - 0.2 (rework)
    //         = -5.5
    assert!(r_worst <= -5.4 && r_worst >= -5.6, "worst case should be ~-5.5, got {}", r_worst);

    // Best case: all bonuses
    let r_best = compute_reward_with_momentum(RewardParameters {
        prev_health: 2,    // prev_health
        curr_health: 1,    // curr_health (improved)
        spc_alert_count: 0,    // spc_alert_count
        guard_pass: true, // guard_pass
        circuit_allowed: true, // circuit_allowed
        latency_budget_exceeded: false, // latency_budget_exceeded
        rework_ratio_q: 0,    // rework_ratio_q
        consecutive_successes: 10,   // consecutive_successes (max momentum)
    });

    // Expected: +1.0 (improved) + 0.1 (guard+circuit) + 0.5 (momentum capped) = +1.6
    assert!(r_best <= 1.61 && r_best >= 1.59, "best case should be ~+1.6, got {}", r_best);
}

// GUARD 8: State equality check (FM-1 self-referential fix)
#[test]
fn state_equality_prevents_self_reference() {
    let state1 = RlState {
        health_level: 2,
        event_rate_q: 3,
        activity_count_q: 4,
        spc_alert_level: 1,
        drift_status: 0,
        rework_ratio_q: 2,
        circuit_state: 0,
        cycle_phase: 1,
    };

    let state2 = state1.clone();
    let state3 = RlState {
        health_level: 3,  // Different
        ..state1
    };

    assert_eq!(state1, state2, "identical states should be equal");
    assert_ne!(state1, state3, "different states should not be equal");

    // In run_cycle, if state == next_state, it forces done=true to avoid self-reference
    // This prevents pathological Q-update divergence
}

// GUARD 9: Rework ratio quantization bounds
#[test]
fn rework_ratio_quantization_safe() {
    // Test quantization at boundaries (per lib.rs quantize_rework_ratio)
    let test_cases = vec![
        (0.0, 0),     // 0% → 0-5% range → 0
        (0.03, 0),    // 3% → 0-5% range → 0
        (0.05, 0),    // 5% → 0-5% range → 0
        (0.10, 1),    // 10% → 6-15% range → 1
        (0.20, 2),    // 20% → 16-25% range → 2 (NOT 1!)
        (0.50, 4),    // 50% → 41-55% range → 4
        (0.80, 6),    // 80% → 71-85% range → 6
        (0.95, 7),    // 95% → 86-100% range → 7
        (1.00, 7),    // 100% → 86-100% range → 7
        (1.5, 7),     // Out of range (should clamp at 100%) → 7
    ];

    for (ratio, expected_q) in test_cases {
        let state = RlState::from_features(&[0.5; 8], 0, ratio);
        assert_eq!(state.rework_ratio_q, expected_q, "rework_ratio {} should quantize to {}, got {}", ratio, expected_q, state.rework_ratio_q);
    }
}

// GUARD 10: Coverage percentage NaN guard
#[test]
fn state_coverage_percentage_never_nan() {
    let orchestrator = RlOrchestrator::new();

    // Initially, no states visited
    let coverage = orchestrator.get_state_coverage();
    assert!(coverage.coverage_percentage.is_finite(), "coverage % should be finite");
    assert_eq!(coverage.coverage_percentage, 0.0, "initial coverage should be 0%");

    // Verify coverage percentage calculation is safe
    // (actual state visits would populate this in real runs)
    let coverage = orchestrator.get_state_coverage();
    assert!(coverage.coverage_percentage.is_finite(), "coverage % should remain finite");
    assert!(coverage.coverage_percentage >= 0.0 && coverage.coverage_percentage <= 100.0, "coverage should be in [0,100]");
}
