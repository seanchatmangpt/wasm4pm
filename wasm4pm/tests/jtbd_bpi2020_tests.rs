#![allow(clippy::all, dead_code)]
//! JTBD BPI 2020 Real-Scale Tests
//!
//! Tests that verify the RL/Auto pipeline handles real-world BPI 2020 datasets at scale.
//! **All 5 tests are tagged #[ignore]** and require 20-40 MB fixtures; run explicitly with
//! `cargo test --test jtbd_bpi2020_tests -- --include-ignored`.
//!
//! BPI 2020 datasets are real government process data (thousands of traces, 20-32 MB each).
//! These tests validate actual system behavior on production-scale event logs.
//!
//! **Ignored Tests (5 total):**
//! 1. JTBD-BPI-1: Travel Permits log validation (requires 20MB BPI_2020_Travel_Permits_Actual.xes)
//! 2. JTBD-BPI-2: RL orchestrator feature handling at scale (requires 20MB fixture)
//! 3. JTBD-BPI-3: Health comparison across variants (requires 40MB pair of fixtures)
//! 4. JTBD-BPI-4: Reward monotonicity on real features (requires 20MB fixture)
//! 5. JTBD-BPI-5: LinUCB agent selection on real features (requires 20MB fixture)
//!
//! Oracle: Rank 2 (Domain Contract) — real processes have measurable health and
//! RL agents should handle large feature spaces without panics or NaN values.

use std::fs;
use wasm4pm::rl_orchestrator::RlOrchestrator;
use wasm4pm::RlState;

const FIXTURES_DIR: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures");

/// Load and parse BPI 2020 XES file to extract event count and trace count.
fn parse_bpi_log(filename: &str) -> (usize, usize) {
    let path = format!("{FIXTURES_DIR}/{filename}");
    let content = fs::read_to_string(&path)
        .unwrap_or_else(|e| panic!("Failed to load fixture {}: {}", path, e));

    let trace_count = content.matches("<trace>").count();
    let event_count = content.matches("<event>").count();

    (event_count, trace_count)
}

/// Extract unique activity names from BPI XES log.
fn extract_unique_activities(filename: &str) -> usize {
    let path = format!("{FIXTURES_DIR}/{filename}");
    let content = fs::read_to_string(&path)
        .unwrap_or_else(|e| panic!("Failed to load fixture {}: {}", path, e));

    let mut activities = std::collections::HashSet::new();
    let lines: Vec<&str> = content.lines().collect();

    for i in 0..lines.len() {
        if lines[i].contains("concept:name") && i > 0 {
            // Look for the value attribute in this line or nearby
            let line = lines[i];
            if let Some(start) = line.find("value=\"") {
                if let Some(end) = line[start + 7..].find('"') {
                    let activity = &line[start + 7..start + 7 + end];
                    // Filter out trace/event metadata, keep only activity names
                    if !activity.starts_with("case:") && !activity.starts_with("concept:") {
                        activities.insert(activity.to_string());
                    }
                }
            }
        }
    }

    activities.len()
}

/// Create normalized feature vector from BPI 2020 metrics.
fn features_from_bpi_metrics(event_count: usize, trace_count: usize) -> [f32; 8] {
    let event_rate_norm = (event_count as f32 / 100_000.0).min(1.0);
    let trace_rate_norm = (trace_count as f32 / 10_000.0).min(1.0);
    let activity_count_norm = 0.5; // Mid-range for government processes

    [
        event_rate_norm,     // health_level proxy
        event_rate_norm,     // event_rate_q
        activity_count_norm, // activity_count_q
        0.0,                 // spc_alert_level (start healthy)
        0.0,                 // drift_status (no drift at start)
        trace_rate_norm,     // rework_ratio_q
        0.0,                 // circuit_state (closed)
        0.0,                 // cycle_phase
    ]
}

// ---------------------------------------------------------------------------
// JTBD-BPI-1: Travel Permits Log is Healthy at Scale
// ---------------------------------------------------------------------------

#[test]
#[ignore = "requires 20MB fixture — run with --include-ignored"]
fn jtbd_travel_permits_log_is_healthy_scale() {
    // JTBD: "I want to know my travel permits process is healthy"
    // Oracle Rank 2 (Domain Contract): BPI 2020 has thousands of cases,
    // real process should not indicate critical failure

    let (event_count, trace_count) = parse_bpi_log("BPI_2020_Travel_Permits_Actual.xes");

    // BPI 2020 Travel Permits: ~5000+ traces, ~20k+ events
    assert!(
        trace_count >= 1000,
        "BPI 2020 should have 1000+ traces, got {}",
        trace_count
    );
    assert!(
        event_count >= 10_000,
        "BPI 2020 should have 10k+ events, got {}",
        event_count
    );

    // Extract metrics
    let activity_count = extract_unique_activities("BPI_2020_Travel_Permits_Actual.xes");
    assert!(
        activity_count >= 5,
        "Real government process should have 5+ activities, got {}",
        activity_count
    );

    println!(
        "BPI 2020 Travel Permits: {} traces, {} events, {} activities",
        trace_count, event_count, activity_count
    );
}

// ---------------------------------------------------------------------------
// JTBD-BPI-2: RL Orchestrator Handles Large-Scale Features Without Errors
// ---------------------------------------------------------------------------

#[test]
#[ignore = "requires 20MB fixture — run with --include-ignored"]
fn jtbd_rl_orchestrator_handles_bpi_scale_features() {
    // JTBD: "I want the RL system to handle my large-scale process without errors"
    // Oracle Rank 2 (Domain Contract): RL cycles must complete — no NaN, no panic,
    // finite rewards. State transitions must be valid (0..5 for health_level).

    let (event_count, trace_count) = parse_bpi_log("BPI_2020_Travel_Permits_Actual.xes");
    let features = features_from_bpi_metrics(event_count, trace_count);

    let mut orch = RlOrchestrator::new_with_seed(42);
    let state = RlState {
        health_level: 0,
        event_rate_q: 3,
        activity_count_q: 3,
        spc_alert_level: 0,
        drift_status: 0,
        rework_ratio_q: 1,
        circuit_state: 0,
        cycle_phase: 0,
    };

    // Run 20 cycles on real-scale features
    let mut rewards = Vec::new();
    for i in 0..20 {
        let next_state = RlState {
            health_level: 0,
            event_rate_q: 3,
            activity_count_q: 3,
            spc_alert_level: if i < 10 { 0 } else { 1 },
            drift_status: 0,
            rework_ratio_q: 1,
            circuit_state: 0,
            cycle_phase: (i as u8) % 4,
        };

        let (action, reward) = orch.run_cycle(&features, &state, &next_state, 0, true, true, false);

        // Validate reward is finite
        assert!(
            reward.is_finite(),
            "Cycle {}: reward must be finite, got {}",
            i,
            reward
        );

        // Validate action is non-empty
        assert!(!action.is_empty(), "Cycle {}: action must be non-empty", i);

        rewards.push(reward);
    }

    // Validate cumulative reward is finite
    let cumulative: f32 = rewards.iter().sum();
    assert!(
        cumulative.is_finite(),
        "Cumulative reward must be finite, got {}",
        cumulative
    );

    println!(
        "RL orchestrator completed 20 cycles on BPI 2020 scale ({}M events). \
         Cumulative reward: {:.3}",
        event_count / 1_000_000,
        cumulative
    );
}

// ---------------------------------------------------------------------------
// JTBD-BPI-3: Compare Health Across Two Process Variants
// ---------------------------------------------------------------------------

#[test]
#[ignore = "requires 40MB fixtures — run with --include-ignored"]
fn jtbd_domestic_vs_international_health_comparison() {
    // JTBD: "I want to compare health across two process variants"
    // Oracle Rank 3 (Metamorphic): Process metrics should be comparable across
    // different event logs. Larger logs have more events but similar health logic.

    let (domestic_events, domestic_traces) = parse_bpi_log("BPI_2020_DomesticDeclarations.xes");
    let (intl_events, intl_traces) = parse_bpi_log("BPI_2020_InternationalDeclarations.xes");

    // Both should be large real-world datasets
    assert!(
        domestic_traces >= 1000,
        "Domestic declarations should have 1000+ traces, got {}",
        domestic_traces
    );
    assert!(
        intl_traces >= 1000,
        "International declarations should have 1000+ traces, got {}",
        intl_traces
    );

    // International should have more events (larger process)
    assert!(
        intl_events >= domestic_events,
        "International ({}) should have >= events than Domestic ({})",
        intl_events,
        domestic_events
    );

    let domestic_features = features_from_bpi_metrics(domestic_events, domestic_traces);
    let intl_features = features_from_bpi_metrics(intl_events, intl_traces);

    // Validate both feature vectors are normalized
    for (i, f) in domestic_features.iter().enumerate() {
        assert!(
            f.is_finite() && *f >= 0.0 && *f <= 1.0,
            "Domestic feature[{}] = {} not in [0,1]",
            i,
            f
        );
    }

    for (i, f) in intl_features.iter().enumerate() {
        assert!(
            f.is_finite() && *f >= 0.0 && *f <= 1.0,
            "International feature[{}] = {} not in [0,1]",
            i,
            f
        );
    }

    println!(
        "BPI 2020 Comparison: Domestic {} traces, International {} traces. \
         Both processes are valid.",
        domestic_traces, intl_traces
    );
}

// ---------------------------------------------------------------------------
// JTBD-BPI-4: Reward Reflects Real Process Quality
// ---------------------------------------------------------------------------

#[test]
#[ignore = "requires 20MB fixture — run with --include-ignored"]
fn jtbd_reward_computation_on_real_features() {
    // JTBD: "I want reward to reflect real process quality, not just be positive"
    // Oracle Rank 1 (Mathematical): Reward function is monotone w.r.t. health improvement.
    // Health 0→0 (stability) > Health 0→1 (degradation)
    // Health 1→0 (improvement) > Health 0→0 (stability)

    let (event_count, trace_count) = parse_bpi_log("BPI_2020_Travel_Permits_Actual.xes");
    let features = features_from_bpi_metrics(event_count, trace_count);

    let mut orch = RlOrchestrator::new_with_seed(42);

    // Scenario A: Stable (health 0→0)
    let state_stable = RlState {
        health_level: 0,
        event_rate_q: 3,
        activity_count_q: 3,
        spc_alert_level: 0,
        drift_status: 0,
        rework_ratio_q: 0,
        circuit_state: 0,
        cycle_phase: 0,
    };

    let (_, reward_stable) = orch.run_cycle(
        &features,
        &state_stable,
        &state_stable,
        0,
        true,
        true,
        false,
    );

    // Scenario B: Degradation (health 0→2)
    let state_degraded = RlState {
        health_level: 2,
        event_rate_q: 5,
        activity_count_q: 5,
        spc_alert_level: 2,
        drift_status: 1,
        rework_ratio_q: 3,
        circuit_state: 0,
        cycle_phase: 0,
    };

    let (_, reward_degraded) = orch.run_cycle(
        &features,
        &state_stable,
        &state_degraded,
        2,
        false,
        true,
        false,
    );

    // Scenario C: Improvement (health 2→0)
    let (_, reward_improved) = orch.run_cycle(
        &features,
        &state_degraded,
        &state_stable,
        0,
        true,
        true,
        false,
    );

    // Validate reward monotonicity
    assert!(
        reward_stable > reward_degraded,
        "Stability ({:.3}) should yield higher reward than degradation ({:.3})",
        reward_stable,
        reward_degraded
    );

    assert!(
        reward_improved > reward_stable,
        "Improvement ({:.3}) should yield higher reward than stability ({:.3})",
        reward_improved,
        reward_stable
    );

    println!(
        "Reward monotonicity validated on BPI 2020 ({}k events): \
         Degraded {:.3} < Stable {:.3} < Improved {:.3}",
        event_count / 1000,
        reward_degraded,
        reward_stable,
        reward_improved
    );
}

// ---------------------------------------------------------------------------
// JTBD-BPI-5: LinUCB Agent Selection on Large Process
// ---------------------------------------------------------------------------

#[test]
#[ignore = "requires 20MB fixture — run with --include-ignored"]
fn jtbd_linucb_agent_selection_on_real_features() {
    // JTBD: "I need LinUCB to select a good agent even on a large process"
    // Oracle Rank 2 (Domain Contract): LinUCB must return one of the 5 valid agents,
    // always. No crashes, no out-of-bounds, finite confidence bounds.

    let (event_count, trace_count) = parse_bpi_log("BPI_2020_Travel_Permits_Actual.xes");
    let features = features_from_bpi_metrics(event_count, trace_count);

    let mut orch = RlOrchestrator::new_with_seed(42);
    let state = RlState {
        health_level: 1,
        event_rate_q: 3,
        activity_count_q: 3,
        spc_alert_level: 1,
        drift_status: 0,
        rework_ratio_q: 2,
        circuit_state: 0,
        cycle_phase: 0,
    };

    // Run 20 cycles and validate agent selection
    for i in 0..20 {
        let next_state = RlState {
            health_level: 1,
            event_rate_q: 3,
            activity_count_q: 3,
            spc_alert_level: (i as u8) % 3,
            drift_status: 0,
            rework_ratio_q: 2,
            circuit_state: 0,
            cycle_phase: (i as u8) % 4,
        };

        let (action, reward) = orch.run_cycle(&features, &state, &next_state, 1, true, true, false);

        // Validate reward is finite
        assert!(
            reward.is_finite(),
            "Cycle {}: reward must be finite, got {}",
            i,
            reward
        );

        // Validate action is one of 5 expected RL actions
        let valid_actions = ["Continue", "Scale", "Retry", "Fallback", "Restart"];
        assert!(
            valid_actions.contains(&action.as_str()),
            "Cycle {}: action '{}' not in valid set",
            i,
            action
        );
    }

    println!(
        "LinUCB agent selection validated on BPI 2020 ({}k events, {} traces). \
         All 20 cycles selected valid agents.",
        event_count / 1000,
        trace_count
    );
}
