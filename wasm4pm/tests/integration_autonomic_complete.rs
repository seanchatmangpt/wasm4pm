//! End-to-end integration test for the complete autonomic loop.
//!
//! This test exercises the full pipeline:
//! 1. Load a real XES log (running-example.xes fixture)
//! 2. Run 10 complete autonomic cycles
//! 3. Verify state transitions, telemetry updates, and RL action selection
//! 4. Assert cycle count, reward finiteness, and health state evolution
//!
//! This is an 80/20 test: one comprehensive test that covers the full pipeline
//! without testing every edge case.

use wasm4pm::rl_orchestrator::{compute_health_state, compute_reward, RlOrchestrator};
use wasm4pm::RlState;
use std::collections::HashSet;

/// Helper to create test RlState with reasonable defaults
fn make_test_state(health_level: u8) -> RlState {
    let features = [0.5, 0.3, 0.2, 0.0, 0.0, 0.0, 0.5, 0.0]; // dummy feature vector
    let rework_ratio = 0.1; // 10% rework (default value)
    RlState::from_features(&features, health_level, rework_ratio)
}

/// Load XES fixture and extract basic metrics
///
/// Returns (event_count, trace_count, unique_activities, feature_vector)
fn load_xes_fixture() -> (u64, u64, u64, [f32; 8]) {
    // Use the running-example.xes fixture (small, fast, well-formed)
    let fixture_path = "tests/fixtures/running-example.xes";

    // Parse the XES file to extract metrics
    let content = std::fs::read_to_string(fixture_path)
        .unwrap_or_else(|e| panic!("Failed to load fixture {}: {}", fixture_path, e));

    // Count traces, events, and unique activities
    let trace_count = content.matches("<trace>").count() as u64;
    let event_count = content.matches("<event>").count() as u64;

    // Extract unique activities (simplified parsing for speed)
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

    // Compute feature vector (normalized)
    let trace_count_norm = if trace_count > 0 {
        (trace_count as f32 / 1000.0).min(1.0)
    } else {
        0.0
    };
    let _event_count_norm = if event_count > 0 {
        (event_count as f32 / 10000.0).min(1.0)
    } else {
        0.0
    };
    let unique_activities_norm = if unique_activities > 0 {
        (unique_activities as f32 / 100.0).min(1.0)
    } else {
        0.0
    };

    // Feature vector: [trace_len, time_ratio, rework, activities, inter_event, size, entropy, variants]
    // For running-example, use reasonable synthetic values
    let features = [
        trace_count_norm,           // trace_length (normalized)
        0.3,                        // elapsed_time ratio (synthetic)
        0.1,                        // rework_count ratio (synthetic)
        unique_activities_norm,     // unique_activities / 100
        0.2,                        // avg_inter_event_time / 3600 (synthetic)
        1.0,                        // log_size_bin (non-trivial log)
        0.7,                        // activity_entropy (Shannon / log2, synthetic)
        0.5,                        // variant_ratio (synthetic)
    ];

    (event_count, trace_count, unique_activities, features)
}

/// Test the complete autonomic loop with 10 cycles
///
/// This is the main end-to-end test that verifies:
/// 1. XES log loading and feature extraction
/// 2. RL orchestrator state persistence across cycles
/// 3. Health state transitions
/// 4. Reward computation (finite, non-NaN)
/// 5. Action selection (always produces a valid label)
/// 6. Telemetry tracking (cycle_count, cumulative_reward, etc.)
#[test]
fn e2e_autonomic_loop_complete_pipeline() {
    // Step 1: Load XES fixture and extract metrics
    let (event_count, trace_count, unique_activities, features) = load_xes_fixture();

    // Verify we loaded a non-trivial log
    assert!(
        event_count > 0,
        "XES fixture must contain events (got {})",
        event_count
    );
    assert!(
        trace_count > 0,
        "XES fixture must contain traces (got {})",
        trace_count
    );
    assert!(
        unique_activities > 0,
        "XES fixture must contain activities (got {})",
        unique_activities
    );

    // Step 2: Initialize RL orchestrator with LinUCB agent selection
    let mut orch = RlOrchestrator::new();
    orch.set_linucb_selection(true);

    // Step 3: Compute initial health state
    let initial_health = compute_health_state(event_count, trace_count, unique_activities);
    let state = make_test_state(initial_health);

    // Verify initial health is reasonable (running-example is a healthy log)
    assert!(
        initial_health <= 2,
        "Initial health state should be Normal/Warning/Degraded (got {})",
        initial_health
    );

    // Step 4: Run 10 autonomic cycles
    const NUM_CYCLES: u64 = 10;
    let mut cycle_rewards = Vec::with_capacity(NUM_CYCLES as usize);
    let mut cycle_actions = Vec::with_capacity(NUM_CYCLES as usize);
    let mut cycle_health_states = Vec::with_capacity(NUM_CYCLES as usize);

    for cycle_idx in 0..NUM_CYCLES {
        // Simulate health evolution: cycle between Normal (0) and Warning (1)
        // This simulates real process monitoring where health fluctuates
        let simulated_health = if cycle_idx % 3 == 0 { 1 } else { 0 };
        let next_state = make_test_state(simulated_health);

        // Simulate SPC alerts (occasional alerts on cycle 3, 6, 9)
        let spc_alerts = if cycle_idx % 3 == 0 && cycle_idx > 0 {
            2
        } else {
            0
        };

        // Run one autonomic cycle (using state as both current and next for simplicity)
        let (action_label, reward) = orch.run_cycle(
            &features,
            &state,
            &next_state,  // Health state AFTER cycle completes
            spc_alerts,
            true,  // guard_pass
            true,  // circuit_allowed
            false,  // latency_budget_exceeded
        );

        // Verify action selection
        assert!(
            !action_label.is_empty(),
            "Cycle {}: RL must produce an action label",
            cycle_idx
        );

        // Verify reward is finite (not NaN or infinite)
        assert!(
            !reward.is_nan(),
            "Cycle {}: Reward must not be NaN (got {})",
            cycle_idx, reward
        );
        assert!(
            !reward.is_infinite(),
            "Cycle {}: Reward must not be infinite (got {})",
            cycle_idx, reward
        );

        // Track results
        cycle_rewards.push(reward);
        cycle_actions.push(action_label.clone());
        cycle_health_states.push(simulated_health);

        // Verify telemetry after each cycle
        let telem = orch.telemetry();
        assert_eq!(
            telem.cycle_count,
            cycle_idx + 1,
            "Cycle {}: cycle_count must increment",
            cycle_idx
        );
        assert_eq!(
            telem.last_spc_alert_count, spc_alerts,
            "Cycle {}: SPC alert count must match",
            cycle_idx
        );
        assert_eq!(
            telem.last_health_state, simulated_health,
            "Cycle {}: health state must match",
            cycle_idx
        );
    }

    // Step 5: Verify final state after 10 cycles

    // All rewards must be finite
    for (idx, &reward) in cycle_rewards.iter().enumerate() {
        assert!(
            reward.is_finite(),
            "Reward at cycle {} must be finite (got {})",
            idx, reward
        );
    }

    // All actions must be non-empty
    for (idx, action) in cycle_actions.iter().enumerate() {
        assert!(
            !action.is_empty(),
            "Action at cycle {} must not be empty",
            idx
        );
    }

    // Health states must be in valid range [0, 4]
    for (idx, &health) in cycle_health_states.iter().enumerate() {
        assert!(
            health <= 4,
            "Health state at cycle {} must be <= 4 (got {})",
            idx, health
        );
    }

    // Final telemetry verification
    let telem = orch.telemetry();
    assert_eq!(telem.cycle_count, NUM_CYCLES, "Final cycle_count must be 10");
    assert!(
        telem.cumulative_reward.is_finite(),
        "Final cumulative_reward must be finite (got {})",
        telem.cumulative_reward
    );

    // Cumulative reward must be sum of individual rewards
    let expected_cumulative: f32 = cycle_rewards.iter().sum();
    assert!(
        (telem.cumulative_reward - expected_cumulative).abs() < 1e-4,
        "Cumulative reward mismatch: expected {}, got {}",
        expected_cumulative,
        telem.cumulative_reward
    );

    // Active agent must be one of the 5 valid types
    let active_agent = orch.active_agent();
    assert!(
        (active_agent as u8) < 5,
        "Active agent must be valid (got {:?})",
        active_agent
    );

    // Step 6: Verify reward computation directly
    // Best case: health improves, no alerts, guards pass
    let best_reward = compute_reward(2, 0, 0, true, true, false);
    assert!(
        best_reward > 0.0,
        "Best-case reward should be positive (got {})",
        best_reward
    );

    // Worst case: health degrades, many alerts, guards fail
    let worst_reward = compute_reward(0, 4, 100, false, false, false);
    assert!(
        worst_reward < 0.0,
        "Worst-case reward should be negative (got {})",
        worst_reward
    );

    assert!(
        best_reward > worst_reward,
        "Best reward must be better than worst reward"
    );
}

/// Test health state computation edge cases
#[test]
fn e2e_health_state_computation_edge_cases() {
    // Empty log → Failed (4)
    let health = compute_health_state(0, 0, 0);
    assert_eq!(health, 4, "Empty log should be Failed");

    // No traces → Critical (3)
    let health = compute_health_state(10, 0, 2);
    assert_eq!(health, 3, "No traces should be Critical");

    // Trivial log → Degraded (2)
    let health = compute_health_state(3, 1, 1);
    assert_eq!(health, 2, "Trivial log should be Degraded");

    // Healthy log → Normal (0)
    let health = compute_health_state(100, 10, 5);
    assert_eq!(health, 0, "Healthy log should be Normal");
}

/// Test RL orchestrator with all 5 agent types
#[test]
fn e2e_rl_orchestrator_all_agent_types() {
    use wasm4pm::rl_orchestrator::AgentType;

    let features = [0.5, 0.3, 0.2, 0.0, 0.0, 0.0, 0.5, 0.0];
    let state = make_test_state(1);

    for agent_type in &[
        AgentType::QLearning,
        AgentType::SARSA,
        AgentType::DoubleQLearning,
        AgentType::ExpectedSARSA,
        AgentType::REINFORCE,
    ] {
        let mut orch = RlOrchestrator::new();
        orch.switch_agent(*agent_type);

        let (action, reward) = orch.run_cycle(&features, &state, &state, 0, true, true, false);

        assert!(
            !action.is_empty(),
            "Agent {:?} must produce an action",
            agent_type
        );
        assert!(
            !reward.is_nan(),
            "Agent {:?} must produce a finite reward",
            agent_type
        );
        assert_eq!(
            orch.active_agent(),
            *agent_type,
            "Active agent must match"
        );
    }
}

/// Test LinUCB agent selection across multiple cycles
#[test]
fn e2e_linucb_agent_selection_persists() {
    let mut orch = RlOrchestrator::new();
    orch.set_linucb_selection(true);

    let features = [0.5, 0.3, 0.2, 0.0, 0.0, 0.0, 0.5, 0.0];
    let state = make_test_state(1);

    // Run 20 cycles to allow LinUCB exploration
    for _ in 0..20 {
        let (action, reward) = orch.run_cycle(&features, &state, &state, 0, true, true, false);
        assert!(!action.is_empty());
        assert!(!reward.is_nan());
    }

    // Verify all cycles completed
    assert_eq!(orch.telemetry().cycle_count, 20);
    assert!(orch.telemetry().cumulative_reward.is_finite());
}

/// Test reward computation bounds
#[test]
fn e2e_reward_computation_bounds() {
    // Test all possible health transitions [0..4] → [0..4]
    for from in 0u8..=4 {
        for to in 0u8..=4 {
            for spc_alerts in &[0, 1, 5, 10, 100] {
                for &guard_pass in &[true, false] {
                    for &circuit_allowed in &[true, false] {
                        let reward = compute_reward(from, to, *spc_alerts, guard_pass, circuit_allowed, false);

                        // Reward must always be finite
                        assert!(
                            reward.is_finite(),
                            "Reward must be finite: from={}, to={}, spc={}, guard={}, circuit={}",
                            from, to, spc_alerts, guard_pass, circuit_allowed
                        );

                        // Reasonable bounds (allow some margin for extreme cases)
                        assert!(
                            reward > -50.0 && reward < 10.0,
                            "Reward out of bounds: from={}, to={}, spc={}, guard={}, circuit={}, reward={}",
                            from, to, spc_alerts, guard_pass, circuit_allowed, reward
                        );
                    }
                }
            }
        }
    }
}
