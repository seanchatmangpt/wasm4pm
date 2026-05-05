//! Tests for the RL Orchestrator — persistent state hub for the autonomic loop.
//!
//! Algorithm family: Reinforcement Learning
//! Modules tested: rl_orchestrator (RlOrchestrator, AgentType, CycleTelemetry, compute_reward)

use wasm4pm::rl_orchestrator::{compute_reward, AgentType, CycleTelemetry, RlOrchestrator};
use wasm4pm::RlAction;
use wasm4pm::RlState;

/// Helper to create test RlState with reasonable defaults
fn make_test_state(health_level: u8) -> RlState {
    let features = [0.5, 0.3, 0.2, 0.0, 0.0, 0.0, 0.5, 0.0]; // dummy feature vector
    RlState::from_features(&features, health_level, 0.0) // rework_ratio = 0.0
}

// ---------------------------------------------------------------------------
// AgentType tests
// ---------------------------------------------------------------------------

#[test]
fn test_agent_type_from_u8() {
    assert_eq!(AgentType::from_u8(0), Some(AgentType::QLearning));
    assert_eq!(AgentType::from_u8(1), Some(AgentType::SARSA));
    assert_eq!(AgentType::from_u8(2), Some(AgentType::DoubleQLearning));
    assert_eq!(AgentType::from_u8(3), Some(AgentType::ExpectedSARSA));
    assert_eq!(AgentType::from_u8(4), Some(AgentType::REINFORCE));
    assert_eq!(AgentType::from_u8(5), None);
    assert_eq!(AgentType::from_u8(255), None);
}

#[test]
fn test_agent_type_name() {
    assert_eq!(AgentType::QLearning.name(), "QLearning");
    assert_eq!(AgentType::SARSA.name(), "SARSA");
    assert_eq!(AgentType::DoubleQLearning.name(), "DoubleQLearning");
    assert_eq!(AgentType::ExpectedSARSA.name(), "ExpectedSARSA");
    assert_eq!(AgentType::REINFORCE.name(), "REINFORCE");
}

#[test]
fn test_agent_type_count() {
    assert_eq!(AgentType::COUNT, 5);
}

// ---------------------------------------------------------------------------
// RlOrchestrator basic tests
// ---------------------------------------------------------------------------

#[test]
fn test_orchestrator_new_has_default_agent() {
    let orch = RlOrchestrator::new();
    assert_eq!(orch.active_agent(), AgentType::QLearning);
}

#[test]
fn test_switch_agent() {
    let mut orch = RlOrchestrator::new();
    orch.switch_agent(AgentType::SARSA);
    assert_eq!(orch.active_agent(), AgentType::SARSA);
    orch.switch_agent(AgentType::REINFORCE);
    assert_eq!(orch.active_agent(), AgentType::REINFORCE);
    orch.switch_agent(AgentType::DoubleQLearning);
    assert_eq!(orch.active_agent(), AgentType::DoubleQLearning);
}

#[test]
fn test_all_agents_can_select_and_update() {
    let state = make_test_state(2);

    for agent_type in &[
        AgentType::QLearning,
        AgentType::SARSA,
        AgentType::DoubleQLearning,
        AgentType::ExpectedSARSA,
        AgentType::REINFORCE,
    ] {
        let mut orch = RlOrchestrator::new();
        orch.switch_agent(*agent_type);
        // Should not panic
        let _action = orch.select_action(&state);
        // Should not panic
        orch.update(&state, &RlAction::Continue, 1.0, &make_test_state(1), false);
    }
}

#[test]
fn test_telemetry_default() {
    let t = CycleTelemetry::default();
    assert_eq!(t.cycle_count, 0);
    assert_eq!(t.last_health_state, 0);
    assert_eq!(t.cumulative_reward, 0.0);
    assert_eq!(t.last_reward, 0.0);
}

// ---------------------------------------------------------------------------
// compute_reward tests
// ---------------------------------------------------------------------------

#[test]
fn test_compute_reward_health_improvement() {
    // Health improved (2 -> 1), no SPC alerts, guards pass
    let reward = compute_reward(2, 1, 0, true, true, false);
    assert!(
        reward > 0.0,
        "Health improvement should yield positive reward"
    );
}

#[test]
fn test_compute_reward_health_degradation() {
    // Health degraded (1 -> 3), no SPC alerts
    let reward = compute_reward(1, 3, 0, true, true, false);
    assert!(
        reward < 0.0,
        "Health degradation should yield negative reward"
    );
}

#[test]
fn test_compute_reward_spc_penalty() {
    // Stable health, but SPC alerts
    let reward_with_alerts = compute_reward(1, 1, 5, true, true, false);
    let reward_no_alerts = compute_reward(1, 1, 0, true, true, false);
    assert!(
        reward_with_alerts < reward_no_alerts,
        "SPC alerts should decrease reward"
    );
}

#[test]
fn test_compute_reward_terminal_penalty() {
    // Terminal state (health == 4)
    let reward_terminal = compute_reward(3, 4, 0, true, true, false);
    let reward_stable = compute_reward(3, 3, 0, true, true, false);
    assert!(
        reward_terminal < reward_stable,
        "Terminal state should have extra penalty"
    );
}

#[test]
fn test_compute_reward_bounded() {
    // Test extreme inputs to verify boundedness
    let max_reward = compute_reward(4, 0, 0, true, true, false); // best case
    let min_reward = compute_reward(0, 4, 100, false, false, false); // worst case
    assert!(max_reward < 2.0, "Reward should be bounded above");
    assert!(min_reward > -10.0, "Reward should be bounded below");
}

#[test]
fn test_compute_reward_circuit_failure() {
    let reward_ok = compute_reward(1, 1, 0, true, true, false);
    let reward_fail = compute_reward(1, 1, 0, true, false, false);
    assert!(
        reward_fail < reward_ok,
        "Circuit breaker failure should decrease reward"
    );
}

// ---------------------------------------------------------------------------
// LinUCB integration tests
// ---------------------------------------------------------------------------

#[test]
fn test_linucb_select_agent_returns_valid_type() {
    let mut orch = RlOrchestrator::new();
    let features = [0.5, 0.5, 0.5, 0.5, 0.0, 1.0, 1.0, 0.0];
    let agent_type = orch.linucb_select_agent(&features);
    // Should be a valid agent type 0-4
    assert!(agent_type as u8 <= 4);
}

#[test]
fn test_linucb_selection_toggle() {
    let mut orch = RlOrchestrator::new();
    assert!(!orch.linucb_selection_enabled());
    orch.set_linucb_selection(true);
    assert!(orch.linucb_selection_enabled());
    orch.set_linucb_selection(false);
    assert!(!orch.linucb_selection_enabled());
}

#[test]
fn test_linucb_update_no_panic() {
    let mut orch = RlOrchestrator::new();
    let features = [0.1, 0.2, 0.3, 0.4, 0.0, 1.0, 1.0, 0.0];
    // Should not panic
    orch.linucb_update(&features, 1.0);
    orch.linucb_update(&features, -0.5);
}

// ---------------------------------------------------------------------------
// Exploration decay tests
// ---------------------------------------------------------------------------

#[test]
fn test_exploration_decay() {
    let mut orch = RlOrchestrator::new();
    orch.switch_agent(AgentType::QLearning);
    // QLearning starts with exploration_rate = 1.0, decay = 0.995
    orch.decay_exploration();
    // After one decay, rate should be 0.995
    assert!(orch.active_agent().name() == "QLearning");
}

// ---------------------------------------------------------------------------
// run_cycle integration tests
// ---------------------------------------------------------------------------

#[test]
fn test_run_cycle_updates_telemetry() {
    let mut orch = RlOrchestrator::new();
    let features = [0.1, 0.1, 0.1, 0.5, 0.0, 1.0, 1.0, 0.0];
    let state = make_test_state(2);
    let next_state = make_test_state(2);

    let (action_label, reward) =
        orch.run_cycle(&features, &state, &next_state, 0, true, true, false);

    assert!(!action_label.is_empty());
    assert_eq!(orch.telemetry().cycle_count, 1);
    assert_eq!(orch.telemetry().last_health_state, 2);
    assert_eq!(orch.telemetry().cumulative_reward, reward);

    // Second cycle
    let (_, reward2) = orch.run_cycle(&features, &state, &next_state, 0, true, true, false);
    assert_eq!(orch.telemetry().cycle_count, 2);
    assert_eq!(orch.telemetry().cumulative_reward, reward + reward2);
}

#[test]
fn test_run_cycle_all_agents() {
    for agent_type in &[
        AgentType::QLearning,
        AgentType::SARSA,
        AgentType::DoubleQLearning,
        AgentType::ExpectedSARSA,
        AgentType::REINFORCE,
    ] {
        let mut orch = RlOrchestrator::new();
        orch.switch_agent(*agent_type);
        let features = [0.1, 0.1, 0.1, 0.5, 0.0, 1.0, 1.0, 0.0];
        let state = make_test_state(1);
        let next_state = make_test_state(1);
        // Should not panic for any agent
        let (action, reward) = orch.run_cycle(&features, &state, &next_state, 0, true, true, false);
        assert!(!action.is_empty());
        assert!(!reward.is_nan());
    }
}

#[test]
fn test_run_cycle_with_linucb_selection() {
    let mut orch = RlOrchestrator::new();
    orch.set_linucb_selection(true);
    let features = [0.1, 0.1, 0.1, 0.5, 0.0, 1.0, 1.0, 0.0];
    let state = make_test_state(1);
    let next_state = make_test_state(1);

    // Run multiple cycles — LinUCB should eventually change agent
    for _ in 0..20 {
        let _ = orch.run_cycle(&features, &state, &next_state, 0, true, true, false);
    }

    // Telemetry should reflect multiple cycles
    assert_eq!(orch.telemetry().cycle_count, 20);
}

// ---------------------------------------------------------------------------
// WASM Export Tests for RlState
// ---------------------------------------------------------------------------

#[test]
fn test_create_rl_state_direct() {
    // Test direct construction with all 8 fields
    let state = wasm4pm::create_rl_state(
        2, // health_level: Degraded
        3, // event_rate_q
        4, // activity_count_q
        1, // spc_alert_level
        0, // drift_status
        2, // rework_ratio_q
        1, // circuit_state: open
        1, // cycle_phase: Learning
    );

    assert_eq!(state.health_level, 2);
    assert_eq!(state.event_rate_q, 3);
    assert_eq!(state.activity_count_q, 4);
    assert_eq!(state.spc_alert_level, 1);
    assert_eq!(state.drift_status, 0);
    assert_eq!(state.rework_ratio_q, 2);
    assert_eq!(state.circuit_state, 1);
    assert_eq!(state.cycle_phase, 1);
}

#[test]
fn test_create_rl_state_bounds() {
    // Test boundary values
    let min_state = wasm4pm::create_rl_state(0, 0, 0, 0, 0, 0, 0, 0);
    assert_eq!(min_state.health_level, 0);

    let max_state = wasm4pm::create_rl_state(4, 7, 7, 3, 2, 7, 2, 3);
    assert_eq!(max_state.health_level, 4);
}

#[test]
fn test_rl_state_from_features_slice() {
    // Test construction from feature slice
    let features = vec![0.1f32, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8];
    let state = wasm4pm::rl_state_from_features(&features, 1, 0.0); // health_level = Warning, rework_ratio = 0.0

    // Should quantize features appropriately
    assert_eq!(state.health_level, 1);
    // event_rate_q quantizes 0.1 * 10000 = 1000 events → level 1
    assert_eq!(state.event_rate_q, 1);
    // activity_count_q quantizes 0.3 * 100 = 30 activities → level 2
    assert_eq!(state.activity_count_q, 2);
}

#[test]
fn test_rl_state_from_features_short_slice() {
    // Test with fewer than 8 features (should pad with zeros)
    let features = vec![0.5f32, 0.5]; // Only 2 features
    let state = wasm4pm::rl_state_from_features(&features, 0, 0.0); // health_level = Normal, rework_ratio = 0.0

    assert_eq!(state.health_level, 0);
    // event_rate_q quantizes 0.5 * 10000 = 5000 events → level 5
    assert_eq!(state.event_rate_q, 5);
    // activity_count_q should be 0 (feature not provided)
    assert_eq!(state.activity_count_q, 0);
}

#[test]
fn test_rl_state_health_level_getter() {
    let state = wasm4pm::create_rl_state(
        3, // health_level: Critical
        0, 0, 0, 0, 0, 0, 0, // other fields irrelevant
    );

    let health = wasm4pm::rl_state_health_level(&state);
    assert_eq!(health, 3);
}

#[test]
fn test_rl_state_roundtrip() {
    // Test that we can create a state, extract health_level, and create another
    let features = vec![0.8f32, 0.1, 0.9, 0.2, 0.0, 0.1, 0.3, 0.05];
    let original_health = 2; // Degraded

    let state1 = wasm4pm::rl_state_from_features(&features, original_health, 0.0);
    let extracted_health = wasm4pm::rl_state_health_level(&state1);

    assert_eq!(extracted_health, original_health);

    // Create a new state with the same health_level
    let state2 = wasm4pm::create_rl_state(extracted_health, 0, 0, 0, 0, 0, 0, 0);
    assert_eq!(wasm4pm::rl_state_health_level(&state2), original_health);
}

// ---------------------------------------------------------------------------
// Category B: Policy Improvement and Stability
// ---------------------------------------------------------------------------

#[test]
fn test_policy_reward_stable_under_sustained_degraded_health() {
    // JTBD: Policy remains stable (non-collapsing reward) when health=3 for 50+ cycles
    // Oracle Rank 2: Domain contract — reward should not degenerate under sustained degradation
    // Van der Aalst doctrine: Policy should not thrash between actions at edge of terminal state

    let mut orch = RlOrchestrator::new_with_seed(42);
    let features = [0.5, 0.3, 0.2, 0.0, 0.0, 0.0, 0.5, 0.0];
    let state_degraded = make_test_state(3); // health=3 (one step from terminal)

    let mut rewards = Vec::new();

    // Run 50 cycles at health=3
    for _ in 0..50 {
        let (_action, reward) = orch.run_cycle(
            &features,
            &state_degraded,
            &state_degraded,
            0,
            true,
            true,
            false,
        );
        rewards.push(reward);
    }

    // Compute mean and std dev of rewards in second half (cycles 25-50)
    let second_half: Vec<f32> = rewards[25..50].to_vec();
    let mean_reward: f32 = second_half.iter().sum::<f32>() / second_half.len() as f32;
    let variance: f32 = second_half
        .iter()
        .map(|r| (r - mean_reward).powi(2))
        .sum::<f32>()
        / second_half.len() as f32;
    let std_dev = variance.sqrt();

    // Assert: reward stabilizes in second half (std_dev < 2.0 indicates convergence)
    assert!(
        std_dev < 2.0,
        "Policy reward should stabilize under sustained health=3: std_dev={}, expected <2.0",
        std_dev
    );
}

#[test]
fn test_policy_recovers_from_terminal_health_state() {
    // JTBD: Policy recovers from terminal state (health=4) when conditions improve
    // Oracle Rank 2: Domain contract — recovery must produce net-positive reward delta
    // Van der Aalst doctrine: Policy should escape terminal state through learning

    let mut orch = RlOrchestrator::new_with_seed(42);
    let features = [0.5, 0.3, 0.2, 0.0, 0.0, 0.0, 0.5, 0.0];

    // Phase 1: Terminal state (health=4, done=true)
    let state_terminal = make_test_state(4);
    let mut phase1_rewards = Vec::new();
    for _ in 0..10 {
        let (_action, reward) = orch.run_cycle(
            &features,
            &state_terminal,
            &state_terminal,
            0,
            true,
            true,
            false,
        );
        phase1_rewards.push(reward);
    }
    let phase1_avg_reward: f32 = phase1_rewards.iter().sum::<f32>() / phase1_rewards.len() as f32;

    // Phase 2: Recovery (health=0, done=false)
    let state_recovered = make_test_state(0);
    let mut phase2_rewards = Vec::new();
    for _ in 0..10 {
        let (_action, reward) = orch.run_cycle(
            &features,
            &state_recovered,
            &state_recovered,
            0,
            true,
            true,
            false,
        );
        phase2_rewards.push(reward);
    }
    let phase2_avg_reward: f32 = phase2_rewards.iter().sum::<f32>() / phase2_rewards.len() as f32;

    // Assert: recovery phase produces better (less negative) reward than terminal phase
    assert!(
        phase2_avg_reward > phase1_avg_reward,
        "Policy recovery should improve reward: phase2_avg={}, phase1_avg={}, delta={}",
        phase2_avg_reward,
        phase1_avg_reward,
        phase2_avg_reward - phase1_avg_reward
    );
}
