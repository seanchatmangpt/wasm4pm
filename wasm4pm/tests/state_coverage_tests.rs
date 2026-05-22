//! State space reachability and coverage analysis tests.
//! Verifies that RL orchestrator tracks 8D state bin visits correctly.

use wasm4pm::rl_orchestrator::RlOrchestrator;
use wasm4pm::RlState;

#[test]
fn test_state_coverage_initialization() {
    let orch = RlOrchestrator::new();
    let coverage = orch.get_state_coverage();

    assert_eq!(coverage.states_visited, 0, "should start with no visited states");
    assert_eq!(coverage.coverage_percentage, 0.0, "should have 0% coverage");
    for i in 0..8 {
        assert_eq!(coverage.dimension_coverage[i], 0, "dimension {} should have 0 coverage", i);
    }
}

#[test]
fn test_state_coverage_after_cycles() {
    let mut orch = RlOrchestrator::new_with_seed(42);
    
    // Run 100 cycles with varying states
    for cycle in 0..100 {
        let state = RlState {
            health_level: (cycle % 5) as u8,
            event_rate_q: ((cycle / 5) % 8) as u8,
            activity_count_q: ((cycle / 13) % 8) as u8,
            spc_alert_level: (cycle % 4) as u8,
            drift_status: ((cycle / 7) % 3) as u8,
            rework_ratio_q: ((cycle / 11) % 8) as u8,
            circuit_state: (cycle % 3) as u8,
            cycle_phase: ((cycle / 17) % 4) as u8,
        };

        let next_state = RlState {
            health_level: ((cycle + 1) % 5) as u8,
            event_rate_q: (((cycle + 1) / 5) % 8) as u8,
            activity_count_q: (((cycle + 1) / 13) % 8) as u8,
            spc_alert_level: ((cycle + 1) % 4) as u8,
            drift_status: (((cycle + 1) / 7) % 3) as u8,
            rework_ratio_q: (((cycle + 1) / 11) % 8) as u8,
            circuit_state: ((cycle + 1) % 3) as u8,
            cycle_phase: (((cycle + 1) / 17) % 4) as u8,
        };

        let features = [
            ((cycle as f32) % 8.0) / 8.0,
            (((cycle + 1) as f32) % 8.0) / 8.0,
            (((cycle + 2) as f32) % 4.0) / 4.0,
            (((cycle + 3) as f32) % 3.0) / 3.0,
            (((cycle + 4) as f32) % 8.0) / 8.0,
            (((cycle + 5) as f32) % 3.0) / 3.0,
            (((cycle + 6) as f32) % 4.0) / 4.0,
            (((cycle + 7) as f32) % 5.0) / 5.0,
        ];

        let _ = orch.run_cycle(
            &features,
            &state,
            &next_state,
            cycle % 3,  // spc_alert_count
            cycle % 2 == 0,  // guard_pass
            cycle % 2 == 1,  // circuit_allowed
            cycle % 5 == 0,  // latency_budget_exceeded
        );
    }

    let coverage = orch.get_state_coverage();
    
    // After 100 cycles with varying states, we should have visited multiple bins
    assert!(coverage.states_visited > 0, "should have visited at least one state");
    assert!(
        coverage.coverage_percentage > 0.0,
        "coverage percentage should be > 0%"
    );
    assert!(coverage.coverage_percentage < 100.0, "coverage should be < 100%");

    // Check that multiple dimensions have coverage
    let nonzero_dims: Vec<usize> = (0..8)
        .filter(|&i| coverage.dimension_coverage[i] > 0)
        .collect();
    assert!(
        nonzero_dims.len() >= 5,
        "at least 5 dimensions should have coverage, got {}",
        nonzero_dims.len()
    );
}

#[test]
fn test_state_coverage_all_health_levels() {
    let mut orch = RlOrchestrator::new_with_seed(123);

    // Explicitly visit all 5 health levels
    for health in 0..5 {
        let state = RlState {
            health_level: health as u8,
            event_rate_q: 0,
            activity_count_q: 0,
            spc_alert_level: 0,
            drift_status: 0,
            rework_ratio_q: 0,
            circuit_state: 0,
            cycle_phase: 0,
        };

        let next_state = state.clone();
        let features = [0.0; 8];

        let _ = orch.run_cycle(&features, &state, &next_state, 0, true, true, false);
    }

    let coverage = orch.get_state_coverage();

    // Health level (dimension 0) should have all 5 values
    assert_eq!(
        coverage.dimension_coverage[0], 5,
        "health_level dimension should have coverage of 5"
    );
}

#[test]
fn test_state_bin_determinism() {
    // Verify that state_to_bin returns consistent hashes
    let state1 = RlState {
        health_level: 2,
        event_rate_q: 3,
        activity_count_q: 4,
        spc_alert_level: 1,
        drift_status: 2,
        rework_ratio_q: 5,
        circuit_state: 1,
        cycle_phase: 2,
    };

    let state2 = RlState {
        health_level: 2,
        event_rate_q: 3,
        activity_count_q: 4,
        spc_alert_level: 1,
        drift_status: 2,
        rework_ratio_q: 5,
        circuit_state: 1,
        cycle_phase: 2,
    };

    let bin1 = RlOrchestrator::state_to_bin(&state1);
    let bin2 = RlOrchestrator::state_to_bin(&state2);

    assert_eq!(bin1, bin2, "identical states should hash to same bin");
}

#[test]
fn test_state_coverage_low_utilization_flag() {
    // After 100 cycles, if coverage < 1%, flag it
    let mut orch = RlOrchestrator::new_with_seed(999);

    for _ in 0..100 {
        let state = RlState {
            health_level: 0,
            event_rate_q: 0,
            activity_count_q: 0,
            spc_alert_level: 0,
            drift_status: 0,
            rework_ratio_q: 0,
            circuit_state: 0,
            cycle_phase: 0,
        };

        let features = [0.0; 8];
        let _ = orch.run_cycle(&features, &state, &state, 0, true, true, false);
    }

    let coverage = orch.get_state_coverage();

    // Stuck in one bin → coverage should be very low (< 0.001%)
    assert!(
        coverage.coverage_percentage < 0.001,
        "should stay in single bin, got {:.6}% coverage",
        coverage.coverage_percentage
    );
    assert_eq!(coverage.states_visited, 1, "should visit exactly 1 state");
}
