//! State coverage tracking tests for the RL orchestrator.
//! Validates unique state tracking, dimension bin increments, and coverage calculations.

use wasm4pm::rl_orchestrator::StateCoverage;
use wasm4pm::RlState;

/// Test 1: Verify unique state tracking (HashSet semantics)
/// Same state visited twice should only increment the set once.
#[test]
fn test_unique_state_tracking() {
    let mut coverage = StateCoverage::new();

    let state1 = RlState {
        health_level: 0,
        event_rate_q: 1,
        activity_count_q: 2,
        spc_alert_level: 0,
        drift_status: 0,
        rework_ratio_q: 0,
        circuit_state: 0,
        cycle_phase: 0,
    };

    // Track the same state twice
    coverage.track_state(&state1);
    coverage.track_state(&state1);

    // Should only have 1 unique state
    assert_eq!(coverage.unique_states_visited(), 1, "HashSet should deduplicate identical states");
}

/// Test 2: Verify dimension bin increments
/// Tracking different states in different bins should increment corresponding bins.
#[test]
fn test_dimension_bin_increments() {
    let mut coverage = StateCoverage::new();

    // State with health_level = 0
    let state0 = RlState {
        health_level: 0,
        event_rate_q: 0,
        activity_count_q: 0,
        spc_alert_level: 0,
        drift_status: 0,
        rework_ratio_q: 0,
        circuit_state: 0,
        cycle_phase: 0,
    };

    // State with health_level = 2
    let state2 = RlState {
        health_level: 2,
        event_rate_q: 0,
        activity_count_q: 0,
        spc_alert_level: 0,
        drift_status: 0,
        rework_ratio_q: 0,
        circuit_state: 0,
        cycle_phase: 0,
    };

    coverage.track_state(&state0);
    coverage.track_state(&state2);

    // health_level dimension (bins 0-4) should have bin 0 and bin 2 occupied
    let dim_cov = coverage.get_dimension_coverage();
    assert!(dim_cov[0] > 0.0, "Health coverage should be non-zero");

    // Both states have same other dimensions, so other coverage should also be non-zero
    assert!(dim_cov[1] > 0.0, "Event rate coverage should be non-zero");
}

/// Test 3: Verify coverage percentage calculation
/// Coverage = (unique_states_visited / 368,640) * 100
#[test]
fn test_coverage_percentage_calculation() {
    let mut coverage = StateCoverage::new();

    // Create and track 100 distinct states
    for i in 0..100 {
        let state = RlState {
            health_level: (i % 5) as u8,
            event_rate_q: ((i / 5) % 8) as u8,
            activity_count_q: ((i / 40) % 8) as u8,
            spc_alert_level: 0,
            drift_status: 0,
            rework_ratio_q: 0,
            circuit_state: 0,
            cycle_phase: 0,
        };
        coverage.track_state(&state);
    }

    let coverage_pct = coverage.coverage_percentage();
    let expected = (100.0 / 368_640.0) * 100.0;

    // Allow small floating-point error
    assert!((coverage_pct - expected).abs() < 0.01,
        "Coverage percentage should be {}, got {}", expected, coverage_pct);
}

/// Test 4: Verify state-to-ID encoding is deterministic
/// Same state should always encode to same ID.
#[test]
fn test_state_id_determinism() {
    let state = RlState {
        health_level: 3,
        event_rate_q: 5,
        activity_count_q: 7,
        spc_alert_level: 2,
        drift_status: 1,
        rework_ratio_q: 4,
        circuit_state: 1,
        cycle_phase: 2,
    };

    let mut coverage1 = StateCoverage::new();
    let mut coverage2 = StateCoverage::new();

    coverage1.track_state(&state);
    coverage2.track_state(&state);

    // Both should have exactly 1 unique state (same state)
    assert_eq!(coverage1.unique_states_visited(), 1);
    assert_eq!(coverage2.unique_states_visited(), 1);

    // Coverage percentages should be identical
    assert_eq!(coverage1.coverage_percentage(), coverage2.coverage_percentage());
}

/// Test 5: Verify per-dimension coverage breakdown
/// Each dimension should report coverage 0-100%.
#[test]
fn test_dimension_coverage_breakdown() {
    let mut coverage = StateCoverage::new();

    // Track states that exercise all bins in health_level dimension (0-4)
    for h in 0..5 {
        let state = RlState {
            health_level: h,
            event_rate_q: 0,
            activity_count_q: 0,
            spc_alert_level: 0,
            drift_status: 0,
            rework_ratio_q: 0,
            circuit_state: 0,
            cycle_phase: 0,
        };
        coverage.track_state(&state);
    }

    let dim_cov = coverage.get_dimension_coverage();

    // health_level should be 100% (all 5 bins visited: 5/5)
    assert_eq!(dim_cov[0], 100.0, "Health coverage should be 100% after visiting all bins");

    // event_rate_q should be 12.5% (1 out of 8 bins)
    assert_eq!(dim_cov[1], 12.5, "Event rate coverage should be 12.5% (1/8)");

    // activity_count_q should be 12.5% (1 out of 8 bins)
    assert_eq!(dim_cov[2], 12.5, "Activity count coverage should be 12.5% (1/8)");

    // spc_alert_level should be 25% (1 out of 4 bins)
    assert_eq!(dim_cov[3], 25.0, "SPC alert coverage should be 25% (1/4)");

    // drift_status should be 33.33% (1 out of 3 bins)
    assert!((dim_cov[4] - 33.33).abs() < 1.0, "Drift coverage should be ~33.33% (1/3)");

    // rework_ratio_q should be 12.5% (1 out of 8 bins)
    assert_eq!(dim_cov[5], 12.5, "Rework coverage should be 12.5% (1/8)");

    // circuit_state should be 33.33% (1 out of 3 bins)
    assert!((dim_cov[6] - 33.33).abs() < 1.0, "Circuit coverage should be ~33.33% (1/3)");

    // cycle_phase should be 25% (1 out of 4 bins)
    assert_eq!(dim_cov[7], 25.0, "Cycle phase coverage should be 25% (1/4)");
}

/// Test 6: Integration test — multiple cycles with varied states
#[test]
fn test_integration_multiple_cycles() {
    let mut coverage = StateCoverage::new();

    // Simulate 50 cycles with varied states
    for cycle in 0..50 {
        let state = RlState {
            health_level: (cycle % 5) as u8,
            event_rate_q: ((cycle / 5) % 8) as u8,
            activity_count_q: ((cycle / 40) % 8) as u8,
            spc_alert_level: (cycle % 4) as u8,
            drift_status: (cycle % 3) as u8,
            rework_ratio_q: ((cycle / 3) % 8) as u8,
            circuit_state: ((cycle / 2) % 3) as u8,
            cycle_phase: ((cycle / 6) % 4) as u8,
        };
        coverage.track_state(&state);
    }

    // Should have multiple unique states
    let unique = coverage.unique_states_visited();
    assert!(unique > 30, "Should have visited many unique states, got {}", unique);

    // Coverage should be non-zero but small
    let cov_pct = coverage.coverage_percentage();
    assert!(cov_pct > 0.0 && cov_pct < 1.0,
        "Coverage should be small but non-zero, got {}", cov_pct);

    // Dimension coverage should be non-uniform
    let dim_cov = coverage.get_dimension_coverage();
    let max_cov = dim_cov.iter().copied().fold(0.0_f32, f32::max);
    let min_cov = dim_cov.iter().copied().fold(100.0_f32, f32::min);

    // With 50 varied states, we expect some variation
    assert!(max_cov > min_cov, "Dimension coverage should vary: max={}, min={}", max_cov, min_cov);
}
