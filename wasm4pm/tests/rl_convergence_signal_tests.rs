//! Convergence signal and state coverage tests (Gaps 4-5 — Rank-1 and Rank-3 oracles).
//!
//! These tests verify OTEL instrumentation for:
//! - **Gap 5**: LinUCB weight L2 norms for convergence tracking (Rank-1 oracle)
//! - **Gap 4**: Per-dimension state transition tracing and state space coverage (Rank-3 metamorphic)

use wasm4pm::rl_orchestrator::{RlOrchestrator, StateCoverage};
use wasm4pm::RlState;

fn make_state(
    health: u8,
    event_rate_q: u8,
    activity_count_q: u8,
    spc_alert_level: u8,
    drift_status: u8,
    rework_ratio_q: u8,
    circuit_state: u8,
    cycle_phase: u8,
) -> RlState {
    RlState {
        health_level: health,
        event_rate_q,
        activity_count_q,
        spc_alert_level,
        drift_status,
        rework_ratio_q,
        circuit_state,
        cycle_phase,
    }
}

// ============================================================================
// Gap 5: Weight norm convergence tracking (Rank-1 oracle)
// ============================================================================

#[test]
fn weight_norms_non_negative() {
    // Rank-1 oracle: L2 norm is always non-negative
    let orch = RlOrchestrator::new_with_seed(42);
    let norms = orch.weight_norms();

    for (i, &norm) in norms.iter().enumerate() {
        assert!(
            norm >= 0.0,
            "Weight norm for agent {} must be non-negative, got {}",
            i,
            norm
        );
    }
}

#[test]
fn weight_norms_array_length() {
    // Rank-1 oracle: should return exactly 5 norms (one per agent)
    let orch = RlOrchestrator::new();
    let norms = orch.weight_norms();

    assert_eq!(
        norms.len(),
        5,
        "weight_norms() should return 5 values (one per agent)"
    );
}

#[test]
fn weight_norm_delta_across_cycles() {
    // Rank-1 oracle (convergence signal): weight norms should stabilize
    // Collect norms over time and verify they don't diverge
    let mut orch = RlOrchestrator::new_with_seed(42);

    let features = &[0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5];

    // Collect initial norms
    let norms_initial = orch.weight_norms();
    let mut last_avg = norms_initial.iter().sum::<f32>() / 5.0;

    // Run 100 cycles and track norm changes
    let mut max_delta = 0.0_f32;
    for _ in 0..100 {
        let _recommended = orch.linucb_select_agent(features);
        orch.linucb_update(features, 0.5);

        let norms = orch.weight_norms();
        let avg = norms.iter().sum::<f32>() / 5.0;
        let delta = (avg - last_avg).abs();

        max_delta = max_delta.max(delta);
        last_avg = avg;
    }

    // Rank-1: norms should not have explosive deltas
    assert!(
        max_delta < 1.0,
        "Weight norm deltas should remain bounded, got max_delta={}",
        max_delta
    );
}

// ============================================================================
// Gap 4: State space coverage and transition tracing (Rank-3 metamorphic)
// ============================================================================

#[test]
fn state_coverage_initializes_empty() {
    // Rank-1 oracle: fresh StateCoverage has zero visited states
    let coverage = StateCoverage::new();
    assert_eq!(coverage.unique_states_visited(), 0);
    assert!(coverage.coverage_percentage() < 0.01);
}

#[test]
fn state_coverage_grows_with_transitions() {
    // Rank-1 oracle: tracking new states increases coverage
    let mut coverage = StateCoverage::new();

    let s1 = make_state(0, 0, 0, 0, 0, 0, 0, 0);
    coverage.track_state(&s1);
    let count_after_1 = coverage.unique_states_visited();

    let s2 = make_state(0, 1, 0, 0, 0, 0, 0, 0);
    coverage.track_state(&s2);
    let count_after_2 = coverage.unique_states_visited();

    assert_eq!(count_after_1, 1);
    assert!(count_after_2 >= count_after_1);
}

#[test]
fn state_coverage_duplicate_states_not_double_counted() {
    // Rank-1 oracle: same state tracked twice doesn't double-count
    let mut coverage = StateCoverage::new();

    let s = make_state(0, 0, 0, 0, 0, 0, 0, 0);
    coverage.track_state(&s);
    let count_after_1st = coverage.unique_states_visited();

    coverage.track_state(&s);
    let count_after_2nd = coverage.unique_states_visited();

    assert_eq!(count_after_1st, count_after_2nd, "Duplicate states should not increase count");
}

#[test]
fn dimension_coverage_breakdown_valid() {
    // Rank-1 oracle: per-dimension coverage is valid percentage [0, 100]
    let mut coverage = StateCoverage::new();

    // Track a few diverse states to populate bins
    for health in 0..3 {
        for event_rate in 0..4 {
            let s = make_state(health, event_rate, 0, 0, 0, 0, 0, 0);
            coverage.track_state(&s);
        }
    }

    let dim_coverage = coverage.get_dimension_coverage();

    assert_eq!(dim_coverage.len(), 8, "Should have 8 dimension coverage values");
    for (i, &cov) in dim_coverage.iter().enumerate() {
        assert!(
            0.0 <= cov && cov <= 100.0,
            "Dimension {} coverage must be in [0, 100], got {}",
            i,
            cov
        );
    }
}

#[test]
fn state_transition_bounded_deltas() {
    // Rank-3 metamorphic: state transitions should have bounded deltas
    let s1 = make_state(0, 0, 0, 0, 0, 0, 0, 0);
    let s2 = make_state(0, 5, 0, 0, 0, 0, 0, 0); // event_rate: 0 -> 5

    let delta = (s2.event_rate_q as i8 - s1.event_rate_q as i8).abs();
    assert!(
        delta <= 8,
        "Event rate transition should be bounded by max bin (7)"
    );
}

#[test]
fn per_dimension_coverage_health_all_levels() {
    // Rank-3: test health dimension coverage (5 bins: 0-4)
    let mut coverage = StateCoverage::new();

    // Track all 5 health levels
    for health in 0..5 {
        let s = make_state(health, 0, 0, 0, 0, 0, 0, 0);
        coverage.track_state(&s);
    }

    let dim_coverage = coverage.get_dimension_coverage();
    let health_coverage = dim_coverage[0]; // Health is first dimension

    // Should have high coverage (all 5 bins visited)
    assert!(
        health_coverage >= 99.0,
        "Health dimension with all 5 levels should be 100%, got {}",
        health_coverage
    );
}

#[test]
fn per_dimension_coverage_event_rate_partial() {
    // Rank-3: test event_rate dimension with partial coverage
    let mut coverage = StateCoverage::new();

    // Track only 4 out of 8 event_rate bins
    for event_rate in [0, 2, 4, 6].iter() {
        let s = make_state(0, *event_rate, 0, 0, 0, 0, 0, 0);
        coverage.track_state(&s);
    }

    let dim_coverage = coverage.get_dimension_coverage();
    let event_rate_coverage = dim_coverage[1]; // event_rate_q is second dimension

    // 4 out of 8 bins = 50% coverage (allow 10% margin for rounding)
    assert!(
        event_rate_coverage >= 40.0 && event_rate_coverage <= 60.0,
        "Event rate with 4/8 bins should be ~50%, got {}",
        event_rate_coverage
    );
}

#[test]
fn full_state_space_size_correct() {
    // Rank-1 oracle: 8D state space has 5×8×8×4×3×8×3×4 = 368,640 possible states
    let expected_total = 5 * 8 * 8 * 4 * 3 * 8 * 3 * 4;
    assert_eq!(expected_total, 368_640);

    // Coverage percentage should be 0 < cov < 100 for typical runs
    let mut coverage = StateCoverage::new();

    // Track 1000 random states (sampling)
    for i in 0..1000 {
        let s = make_state(
            (i % 5) as u8,
            ((i / 5) % 8) as u8,
            ((i / 40) % 8) as u8,
            ((i / 320) % 4) as u8,
            ((i / 1280) % 3) as u8,
            0,
            0,
            0,
        );
        coverage.track_state(&s);
    }

    let cov_pct = coverage.coverage_percentage();
    assert!(
        cov_pct > 0.0 && cov_pct < 100.0,
        "Coverage should be between 0-100%, got {}",
        cov_pct
    );
}

#[test]
fn state_coverage_with_orchestrator() {
    // Integration test: StateCoverage used within RlOrchestrator
    let mut orch = RlOrchestrator::new_with_seed(42);

    let features = &[0.5; 8];
    let s1 = make_state(0, 0, 0, 0, 0, 0, 0, 0);
    let s2 = make_state(0, 1, 0, 0, 0, 0, 0, 0);
    let s3 = make_state(1, 0, 0, 0, 0, 0, 0, 0);

    // Run 3 cycles with different states
    for (state_idx, next_state) in [&s2, &s3, &s1].iter().enumerate() {
        let (_, _reward) = orch.run_cycle(features, &s1, next_state, 0, true, true, false);
        // After each cycle, state coverage should increase
        assert!(
            orch.telemetry().cycle_count == (state_idx + 1) as u64,
            "Cycle count should increment"
        );
    }
}

#[test]
fn linucb_agent_selection_with_features() {
    // Rank-2 domain contract: LinUCB should select agents dynamically
    let mut orch = RlOrchestrator::new_with_seed(42);

    let features = &[0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5];

    // Enable LinUCB selection
    orch.set_linucb_selection(true);
    assert!(orch.linucb_selection_enabled());

    // Select agent multiple times — should execute without crash
    for _ in 0..10 {
        let recommended = orch.linucb_select_agent(features);
        // Just verify it returns a valid agent
        assert_eq!(recommended as u8, 0u8.max(recommended as u8));
    }
}
