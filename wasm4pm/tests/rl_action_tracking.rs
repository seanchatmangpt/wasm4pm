#![cfg(feature = "cloud")]
//! RL Action Tracking Tests
//!
//! Tests for RL Gap 2 implementation: healing actions tracking with success rates.

use wasm4pm::{rl_orchestrator::RlOrchestrator, RlState};

#[test]
fn test_action_history_tracks_success() {
    let mut orch = RlOrchestrator::new_with_seed(42);

    // Run 50 cycles with fixed seed for determinism
    let mut total_actions = 0;
    for cycle in 0..50 {
        let state = RlState {
            health_level: if cycle < 10 { 0 } else { 1 },
            event_rate_q: (cycle % 8) as u8,
            activity_count_q: ((cycle / 2) % 8) as u8,
            spc_alert_level: 0,
            drift_status: 0,
            rework_ratio_q: 2,
            circuit_state: 0,
            cycle_phase: (cycle % 4) as u8,
        };

        let next_state = RlState {
            health_level: if cycle < 15 { 0 } else { 1 },
            ..state
        };

        let (action_label, _reward) = orch.run_cycle(
            &[0.5, 1.0, 2.0, 0.0, 1.0, 2.0, 0.0, 1.0],
            &state,
            &next_state,
            0,     // spc_alert_count
            true,  // guard_pass
            true,  // circuit_allowed
            false, // latency_budget_exceeded
        );

        total_actions += 1;
        assert!(!action_label.is_empty(), "action label must be non-empty");
    }

    // Verify action history has entries
    let stats = orch.get_action_stats();
    assert!(!stats.is_empty(), "action history must not be empty");

    // Verify totals sum correctly
    let total_recorded: u32 = stats.values().map(|(total, _, _)| total).sum();
    assert_eq!(
        total_recorded, total_actions as u32,
        "total recorded actions must match cycle count"
    );

    // Verify each action has valid success rate [0.0, 1.0]
    for (action, (total, successful, rate)) in &stats {
        assert!(*total > 0, "action {} must have total > 0", action);
        assert!(
            *successful <= *total,
            "action {} successful count {} exceeds total {}",
            action,
            successful,
            total
        );
        assert!(
            *rate >= 0.0 && *rate <= 1.0,
            "action {} success rate {:.3} must be in [0.0, 1.0]",
            action,
            rate
        );
    }
}

#[test]
fn test_action_history_rolling_window() {
    let mut orch = RlOrchestrator::new_with_seed(123);

    // Run 150 cycles to exceed 100-entry rolling window
    for cycle in 0..150 {
        let state = RlState {
            health_level: 0,
            event_rate_q: 1,
            activity_count_q: 2,
            spc_alert_level: 0,
            drift_status: 0,
            rework_ratio_q: 1,
            circuit_state: 0,
            cycle_phase: (cycle % 4) as u8,
        };

        orch.run_cycle(
            &[0.5, 1.0, 2.0, 0.0, 1.0, 2.0, 0.0, 1.0],
            &state,
            &state,
            0,
            true,
            true,
            false,
        );
    }

    // Verify action history is capped at 100
    let stats = orch.get_action_stats();
    let total: u32 = stats.values().map(|(t, _, _)| t).sum();
    assert!(
        total <= 100,
        "action history must be capped at 100 entries, got {}",
        total
    );
}

#[test]
fn test_action_distribution_histogram() {
    let mut orch = RlOrchestrator::new_with_seed(999);

    // Run 30 cycles
    for cycle in 0..30 {
        let state = RlState {
            health_level: if cycle < 15 { 0 } else { 2 },
            event_rate_q: (cycle % 8) as u8,
            activity_count_q: 2,
            spc_alert_level: 0,
            drift_status: 0,
            rework_ratio_q: 2,
            circuit_state: 0,
            cycle_phase: (cycle % 4) as u8,
        };

        let next_state = RlState {
            health_level: if cycle < 20 { 0 } else { 1 },
            ..state
        };

        orch.run_cycle(
            &[0.5, 1.0, 2.0, 0.0, 1.0, 2.0, 0.0, 1.0],
            &state,
            &next_state,
            0,
            true,
            true,
            false,
        );
    }

    let stats = orch.get_action_stats();

    // Verify histogram properties:
    // 1. All actions have valid names (Continue, Scale, Retry, Fallback, Restart)
    for action in stats.keys() {
        assert!(
            matches!(
                action.as_str(),
                "Continue" | "Scale" | "Retry" | "Fallback" | "Restart"
            ),
            "action '{}' is not a valid RlAction variant",
            action
        );
    }

    // 2. Success rates sum to expected pattern (should have some successes)
    let success_count: u32 = stats.values().map(|(_, s, _)| s).sum();
    assert!(
        success_count > 0,
        "should have at least some successful actions"
    );
}

#[test]
fn test_action_success_rate_calculation() {
    let mut orch = RlOrchestrator::new_with_seed(555);

    // Simulate scenario: health improvement → success, health degradation → failure
    for cycle in 0..40 {
        let (health_before, health_after) = if cycle < 20 {
            (1, 0) // Improving health → reward > 0 → successful
        } else {
            (0, 2) // Degrading health → reward < 0 → failure
        };

        let state = RlState {
            health_level: health_before,
            event_rate_q: 2,
            activity_count_q: 3,
            spc_alert_level: 0,
            drift_status: 0,
            rework_ratio_q: 1,
            circuit_state: 0,
            cycle_phase: 0,
        };

        let next_state = RlState {
            health_level: health_after,
            ..state
        };

        orch.run_cycle(
            &[0.5, 1.0, 2.0, 0.0, 1.0, 2.0, 0.0, 1.0],
            &state,
            &next_state,
            0,
            true,
            true,
            false,
        );
    }

    let stats = orch.get_action_stats();

    // Verify: action stats are computed correctly
    for (action, (total, successful, rate)) in stats {
        let computed_rate = if total > 0 {
            successful as f32 / total as f32
        } else {
            0.0
        };

        assert!(
            (rate - computed_rate).abs() < 0.001,
            "action {} success rate mismatch: expected {:.3}, got {:.3}",
            action,
            computed_rate,
            rate
        );

        println!(
            "Action: {}, Total: {}, Successful: {}, Rate: {:.3}",
            action, total, successful, rate
        );
    }
}
