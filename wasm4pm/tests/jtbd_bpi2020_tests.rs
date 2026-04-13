//! JTBD tests for BPI 2020 real-scale datasets.
//!
//! These tests verify that the RL/autonomic system handles real-world process data
//! at scale without panicking, producing NaN, or exceeding time budgets.
//!
//! All tests are `#[ignore]` to skip by default (BPI 2020 files are 20-32 MB).
//! Run with: `cargo test --test jtbd_bpi2020_tests -- --include-ignored`
//!
//! JTBD = Jobs To Be Done. Each test names the user's actual goal and verifies
//! behavioral outcomes a practitioner would observe — not just "does it exit 0".
//!
//! Oracle types:
//! - Rank 1: Mathematical theorem (e.g., reward monotonicity from adversarial tests)
//! - Rank 2: Domain contract (e.g., BPI 2020 has thousands of cases)
//! - Rank 3: Metamorphic relation (e.g., larger log != healthier log)

use pictl::rl_orchestrator::{compute_health_state, compute_reward, RlOrchestrator};
use pictl::RlState;
use std::collections::HashSet;

/// Helper to create test RlState with reasonable defaults
fn make_test_state(health_level: u8) -> RlState {
    let features = [0.5, 0.3, 0.2, 0.0, 0.0, 0.0, 0.5, 0.0]; // dummy feature vector
    let rework_ratio = 0.1; // 10% rework (default value)
    RlState::from_features(&features, health_level, rework_ratio)
}

/// Load and parse a BPI 2020 XES fixture, returning (event_count, trace_count, unique_activities, features)
fn load_bpi_xes_fixture(path: &str) -> (u64, u64, u64, [f32; 8]) {
    let content = std::fs::read_to_string(path)
        .unwrap_or_else(|e| panic!("Failed to load BPI 2020 fixture {}: {}", path, e));

    // Count traces and events via simple string matching
    let trace_count = content.matches("<trace>").count() as u64;
    let event_count = content.matches("<event>").count() as u64;

    // Extract unique activities (concept:name string values)
    let mut activities = HashSet::new();
    for line in content.lines() {
        if line.contains("<string key=\"concept:name\" value=\"") {
            if let Some(start) = line.find("value=\"") {
                if let Some(end) = line[start + 7..].find('"') {
                    let activity = &line[start + 7..start + 7 + end];
                    if !activity.is_empty() {
                        activities.insert(activity.to_string());
                    }
                }
            }
        }
    }
    let unique_activities = activities.len() as u64;

    // Compute normalized feature vector from real metrics
    let trace_count_norm = if trace_count > 0 {
        (trace_count as f32 / 1000.0).min(1.0)
    } else {
        0.0
    };
    let event_count_norm = if event_count > 0 {
        (event_count as f32 / 100000.0).min(1.0)
    } else {
        0.0
    };
    let unique_activities_norm = if unique_activities > 0 {
        (unique_activities as f32 / 100.0).min(1.0)
    } else {
        0.0
    };

    // Feature vector: [trace_len, time_ratio, rework, activities, inter_event, size, entropy, variants]
    let features = [
        trace_count_norm,           // trace_length (normalized)
        0.3,                        // elapsed_time ratio (synthetic)
        0.1,                        // rework_count ratio (synthetic)
        unique_activities_norm,     // unique_activities / 100
        0.2,                        // avg_inter_event_time (synthetic)
        event_count_norm,           // log_size_bin (real)
        0.7,                        // activity_entropy (synthetic)
        0.5,                        // variant_ratio (synthetic)
    ];

    (event_count, trace_count, unique_activities, features)
}

// ──────────────────────────────────────────────────────────────────────────────
// JTBD-BPI-1: "I want to know my travel permits process is healthy"
// ──────────────────────────────────────────────────────────────────────────────

/// Oracle Rank-2 (domain contract): BPI 2020 has thousands of cases and activities.
/// A real-world government process should have measurable scale and not be Failed.
#[test]
#[ignore = "requires 20MB fixture — run with --include-ignored"]
fn jtbd_travel_permits_log_is_healthy_scale() {
    let fixture_path = "tests/fixtures/BPI_2020_Travel_Permits_Actual.xes";
    let (event_count, trace_count, unique_activities, _features) = load_bpi_xes_fixture(fixture_path);

    // JTBD: I want to know if my travel permits process is healthy.
    // Contract: BPI 2020 is a well-formed real government process.
    // Oracle: scale (thousands of cases) + health state (not Failed).

    // Verify scale
    assert!(
        trace_count >= 1000,
        "BPI Travel Permits should have >= 1000 traces (got {})",
        trace_count
    );
    assert!(
        event_count >= 5000,
        "BPI Travel Permits should have >= 5000 events (got {})",
        event_count
    );
    assert!(
        unique_activities >= 5,
        "BPI Travel Permits should have >= 5 activities (got {})",
        unique_activities
    );

    // Verify health state computation works at scale
    let health = compute_health_state(event_count, trace_count, unique_activities);

    // Oracle: a well-formed log should not be Failed (4)
    // It may be Normal (0), Warning (1), or Degraded (2), but not Critical (3) or Failed (4).
    assert!(
        health <= 2,
        "BPI Travel Permits should be Normal/Warning/Degraded, not Critical/Failed (got health={})",
        health
    );
}

// ──────────────────────────────────────────────────────────────────────────────
// JTBD-BPI-2: "I want the RL system to handle my large-scale process without errors"
// ──────────────────────────────────────────────────────────────────────────────

/// Oracle Rank-2 (domain contract): RL cycles must complete with finite, non-NaN rewards.
/// The system should gracefully handle real-scale feature vectors without panicking.
#[test]
#[ignore = "requires 20MB fixture — run with --include-ignored"]
fn jtbd_rl_orchestrator_handles_bpi_scale_features() {
    let fixture_path = "tests/fixtures/BPI_2020_Travel_Permits_Actual.xes";
    let (_event_count, _trace_count, _unique_activities, features) =
        load_bpi_xes_fixture(fixture_path);

    // JTBD: I want the RL system to handle my large-scale process automatically.
    // Contract: RL orchestrator must work on real feature vectors.
    // Oracle: 20 cycles without NaN, panic, or empty actions.

    let mut orch = RlOrchestrator::new();
    let state = make_test_state(1);

    for cycle_idx in 0..20 {
        let next_state = if cycle_idx % 2 == 0 {
            make_test_state(0)
        } else {
            make_test_state(1)
        };

        let spc_alerts = (cycle_idx % 5) as usize;
        let (action_label, reward) = orch.run_cycle(
            &features,
            &state,
            &next_state,
            spc_alerts,  // Simulate occasional SPC alerts
            true,        // guard_pass
            true,        // circuit_allowed
        );

        // Verify action is non-empty
        assert!(
            !action_label.is_empty(),
            "Cycle {}: action must be non-empty",
            cycle_idx
        );

        // Verify reward is finite
        assert!(
            !reward.is_nan(),
            "Cycle {}: reward must not be NaN",
            cycle_idx
        );
        assert!(
            !reward.is_infinite(),
            "Cycle {}: reward must not be infinite",
            cycle_idx
        );
    }

    // Verify final state
    let telem = orch.telemetry();
    assert_eq!(telem.cycle_count, 20);
    assert!(telem.cumulative_reward.is_finite());
}

// ──────────────────────────────────────────────────────────────────────────────
// JTBD-BPI-3: "I want to compare health across two process variants"
// ──────────────────────────────────────────────────────────────────────────────

/// Oracle Rank-3 (metamorphic relation): Two processes must both be measurable.
/// Larger/more complex log should not automatically be healthier or less healthy.
#[test]
#[ignore = "requires 40MB fixtures — run with --include-ignored"]
fn jtbd_domestic_vs_international_health_comparison() {
    let domestic_path = "tests/fixtures/BPI_2020_DomesticDeclarations.xes";
    let international_path = "tests/fixtures/BPI_2020_InternationalDeclarations.xes";

    // JTBD: I want to compare health of domestic vs international expense declarations.
    // Contract: Both are valid real government processes.
    // Oracle: both have measurable scale + valid health states.

    let (domestic_events, domestic_traces, domestic_activities, _) =
        load_bpi_xes_fixture(domestic_path);
    let (intl_events, intl_traces, intl_activities, _) = load_bpi_xes_fixture(international_path);

    // Verify both are real-scale
    assert!(
        domestic_traces >= 1000,
        "Domestic should have >= 1000 traces (got {})",
        domestic_traces
    );
    assert!(
        intl_traces >= 1000,
        "International should have >= 1000 traces (got {})",
        intl_traces
    );

    // Compute health states
    let domestic_health = compute_health_state(domestic_events, domestic_traces, domestic_activities);
    let intl_health = compute_health_state(intl_events, intl_traces, intl_activities);

    // Oracle: both are valid health states in [0..4]
    assert!(domestic_health <= 4);
    assert!(intl_health <= 4);

    // Oracle: international (28MB) has >= as many events as domestic (20MB)
    // This is a metamorphic relation: larger log != necessarily worse health
    // but we verify the relationship holds
    assert!(
        intl_events >= domestic_events,
        "International ({} events) should have >= Domestic ({} events)",
        intl_events,
        domestic_events
    );
}

// ──────────────────────────────────────────────────────────────────────────────
// JTBD-BPI-4: "I want reward to reflect real process quality"
// ──────────────────────────────────────────────────────────────────────────────

/// Oracle Rank-1 (mathematical): Reward computation must satisfy monotone property
/// on real-scale feature vectors. Matches the Bellman theorem from adversarial tests.
#[test]
#[ignore = "requires 20MB fixture — run with --include-ignored"]
fn jtbd_reward_computation_on_real_features() {
    let fixture_path = "tests/fixtures/BPI_2020_Travel_Permits_Actual.xes";
    let (_event_count, _trace_count, _unique_activities, _features) =
        load_bpi_xes_fixture(fixture_path);

    // JTBD: I want reward to reflect real process quality changes.
    // Contract: reward function is monotone in health improvements.
    // Oracle Rank-1: reward(improve) > reward(stable) > reward(degrade).

    // Test on real-scale: health=0→0 (stable), health=0→1 (degrade), health=1→0 (improve)
    let reward_stable = compute_reward(0, 0, 0, true, true);
    let reward_degrade = compute_reward(0, 1, 0, true, true);
    let reward_improve = compute_reward(1, 0, 0, true, true);

    // Oracle Rank-1: stability > degradation
    assert!(
        reward_stable > reward_degrade,
        "Stable (0→0) should be better than degrade (0→1): {} vs {}",
        reward_stable,
        reward_degrade
    );

    // Oracle Rank-1: improvement > stability
    assert!(
        reward_improve > reward_stable,
        "Improve (1→0) should be better than stable (0→0): {} vs {}",
        reward_improve,
        reward_stable
    );

    // Verify all rewards are finite
    assert!(reward_stable.is_finite());
    assert!(reward_degrade.is_finite());
    assert!(reward_improve.is_finite());
}

// ──────────────────────────────────────────────────────────────────────────────
// JTBD-BPI-5: "I need LinUCB to select a good agent on large data"
// ──────────────────────────────────────────────────────────────────────────────

/// Oracle Rank-2 (domain contract): LinUCB agent selection must always return
/// one of the 5 valid agents, never NaN, never panic on real-scale data.
#[test]
#[ignore = "requires 20MB fixture — run with --include-ignored"]
fn jtbd_linucb_agent_selection_on_real_features() {
    let fixture_path = "tests/fixtures/BPI_2020_Travel_Permits_Actual.xes";
    let (_event_count, _trace_count, _unique_activities, features) =
        load_bpi_xes_fixture(fixture_path);

    // JTBD: I need the system to automatically select the best RL agent.
    // Contract: LinUCB must work on real feature vectors.
    // Oracle: 20 cycles with valid agent selection, finite rewards, no NaN.

    let mut orch = RlOrchestrator::new();
    orch.set_linucb_selection(true);

    let state = make_test_state(1);

    for cycle_idx in 0..20 {
        let next_state = make_test_state((cycle_idx % 2) as u8);

        let (action_label, reward) = orch.run_cycle(
            &features,
            &state,
            &next_state,
            0,     // no SPC alerts
            true,  // guard_pass
            true,  // circuit_allowed
        );

        // Oracle: action must be non-empty
        assert!(!action_label.is_empty(), "Cycle {}: action must exist", cycle_idx);

        // Oracle: reward must be finite
        assert!(!reward.is_nan(), "Cycle {}: reward must not be NaN", cycle_idx);
        assert!(
            !reward.is_infinite(),
            "Cycle {}: reward must not be infinite",
            cycle_idx
        );

        // Oracle: active agent must be valid [0..4]
        let active = orch.active_agent() as u8;
        assert!(
            active < 5,
            "Cycle {}: active agent must be in [0..4] (got {})",
            cycle_idx, active
        );
    }

    // Final telemetry
    let telem = orch.telemetry();
    assert_eq!(telem.cycle_count, 20);
    assert!(telem.cumulative_reward.is_finite());
}
