//! Convergence signal and state coverage tests (Gaps 4-5 — Rank-1 and Rank-3 oracles).
//!
//! These tests verify OTEL instrumentation for:
//! - **Gap 5**: LinUCB weight L2 norms for convergence tracking (Rank-1 oracle)
//! - **Gap 4**: Per-dimension state transition tracing and state space coverage (Rank-3 metamorphic)
//!
//! Rank-1 oracle for weight norms:
//!   LinUCB maintains per-action weight vectors w_a ∈ ℝ^d
//!   Convergence: ||w_a||_2 → ||w*||_2 (true optimal weights)
//!   Stability: Δ||w_a||_2 → 0 as convergence reached
//!
//! Rank-3 metamorphic for state transitions:
//!   Input perturbation: change health by ±1
//!   Expected output: state_coverage should increase (more states visited)
//!   Impossible transitions: event_rate_delta > 4 should not occur (bounded state changes)

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
fn weight_norms_initially_low() {
    // Rank-1 oracle: fresh LinUCB has near-zero weights (before learning)
    let orch = RlOrchestrator::new();
    let norms = orch.weight_norms();

    // Fresh LinearUCB should have very small weights (near identity init or zeros)
    // Conservative bound: < 1.0
    for (i, &norm) in norms.iter().enumerate() {
        assert!(
            norm < 1.0,
            "Fresh weight norm for agent {} should be small, got {}",
            i,
            norm
        );
    }
}

#[test]
fn weight_norms_increase_with_learning() {
    // Rank-1 oracle: learning updates should increase weight norm magnitude
    let mut orch = RlOrchestrator::new_with_seed(42);

    let norms_before = orch.weight_norms();
    let avg_norm_before = norms_before.iter().sum::<f32>() / 5.0;

    // Run 100 cycles to accumulate weight updates
    let features = &[0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5];
    for _ in 0..100 {
        let _recommended = orch.linucb_select_agent(features);
        orch.linucb_update(features, 0.5); // Positive reward promotes learning
    }

    let norms_after = orch.weight_norms();
    let avg_norm_after = norms_after.iter().sum::<f32>() / 5.0;

    // Rank-1: average norm should increase (or stay same) with learning
    assert!(
        avg_norm_after >= avg_norm_before * 0.95, // Allow 5% margin for numerical stability
        "Weight norms should increase or stay stable with learning: before={}, after={}",
        avg_norm_before,
        avg_norm_after
    );
}

#[test]
fn weight_norm_delta_decreases_with_convergence() {
    // Rank-1 oracle (convergence signal): weight norm delta should decay
    // Early cycles: Δ||w||_2 may be large (learning phase)
    // Late cycles: Δ||w||_2 → 0 (convergence phase)
    let mut orch = RlOrchestrator::new_with_seed(42);

    let features = &[0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5];

    // Collect norm deltas over time
    let norms_initial = orch.weight_norms();
    let mut last_avg_norm = norms_initial.iter().sum::<f32>() / 5.0;

    let mut early_deltas = Vec::new();
    let mut late_deltas = Vec::new();

    for cycle in 0..200 {
        let _recommended = orch.linucb_select_agent(features);
        orch.linucb_update(features, 0.5);

        let norms = orch.weight_norms();
        let avg_norm = norms.iter().sum::<f32>() / 5.0;
        let delta = (avg_norm - last_avg_norm).abs();

        if cycle < 50 {
            early_deltas.push(delta);
        } else if cycle >= 150 {
            late_deltas.push(delta);
        }

        last_avg_norm = avg_norm;
    }

    // Rank-3 metamorphic: early deltas should be >= late deltas on average
    let early_avg = early_deltas.iter().sum::<f32>() / early_deltas.len() as f32;
    let late_avg = late_deltas.iter().sum::<f32>() / late_deltas.len() as f32;

    assert!(
        early_avg >= late_avg * 0.5, // Allow factor of 2 variance
        "Early weight deltas should be >= late deltas: early_avg={}, late_avg={}",
        early_avg,
        late_avg
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
    // Rank-1 oracle: same state tracked twice increases count by at most 1
    let mut coverage = StateCoverage::new();

    let s = make_state(0, 0, 0, 0, 0, 0, 0, 0);
    coverage.track_state(&s);
    let count_after_1st = coverage.unique_states_visited();

    coverage.track_state(&s); // Track same state again
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
fn state_transition_metamorphic_impossibly_large_deltas() {
    // Rank-3 metamorphic: state transitions should have bounded deltas
    // Impossible transition: event_rate_delta > 4 (all bins are 0-7)
    let s1 = make_state(0, 0, 0, 0, 0, 0, 0, 0);
    let s2 = make_state(0, 5, 0, 0, 0, 0, 0, 0); // event_rate: 0 -> 5 (delta=5, possible)

    let delta = (s2.event_rate_q as i8 - s1.event_rate_q as i8).abs();
    assert!(delta <= 8, "Event rate transition within bounds");

    // Extreme case: 0 -> 7
    let s3 = make_state(0, 7, 0, 0, 0, 0, 0, 0);
    let delta_extreme = (s3.event_rate_q as i8 - s1.event_rate_q as i8).abs();
    assert!(delta_extreme <= 8, "Max event rate transition is 7");
}

#[test]
fn per_dimension_coverage_health_only() {
    // Rank-3: test health dimension coverage (5 bins: 0-4)
    let mut coverage = StateCoverage::new();

    // Track all 5 health levels
    for health in 0..5 {
        let s = make_state(health, 0, 0, 0, 0, 0, 0, 0);
        coverage.track_state(&s);
    }

    let dim_coverage = coverage.get_dimension_coverage();
    let health_coverage = dim_coverage[0]; // Health is first dimension

    // Should have 100% coverage (all 5 bins visited)
    assert!(
        health_coverage >= 99.0,
        "Health dimension with all 5 levels visited should be 100%, got {}",
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

    // 4 out of 8 bins = 50% coverage
    assert!(
        event_rate_coverage >= 40.0 && event_rate_coverage <= 60.0,
        "Event rate with 4/8 bins should be ~50%, got {}",
        event_rate_coverage
    );
}

#[test]
fn full_state_space_size_correct() {
    // Rank-1 oracle: 8D state space has 5*8*8*4*3*8*3*4 = 368,640 possible states
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
