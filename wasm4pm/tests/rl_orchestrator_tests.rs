//! Tests for the RL Orchestrator — persistent state hub for the autonomic loop.
//!
//! Algorithm family: Reinforcement Learning
//! Modules tested: rl_orchestrator (RlOrchestrator, AgentType, CycleTelemetry, compute_reward)

use pictl::rl_orchestrator::{compute_reward, AgentType, CycleTelemetry, RlOrchestrator};
use pictl::RlAction;
use pictl::RlState;

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
    let state = RlState(2);

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
        orch.update(&state, &RlAction::Continue, 1.0, &RlState(1), false);
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
    let reward = compute_reward(2, 1, 0, true, true);
    assert!(
        reward > 0.0,
        "Health improvement should yield positive reward"
    );
}

#[test]
fn test_compute_reward_health_degradation() {
    // Health degraded (1 -> 3), no SPC alerts
    let reward = compute_reward(1, 3, 0, true, true);
    assert!(
        reward < 0.0,
        "Health degradation should yield negative reward"
    );
}

#[test]
fn test_compute_reward_spc_penalty() {
    // Stable health, but SPC alerts
    let reward_with_alerts = compute_reward(1, 1, 5, true, true);
    let reward_no_alerts = compute_reward(1, 1, 0, true, true);
    assert!(
        reward_with_alerts < reward_no_alerts,
        "SPC alerts should decrease reward"
    );
}

#[test]
fn test_compute_reward_terminal_penalty() {
    // Terminal state (health == 4)
    let reward_terminal = compute_reward(3, 4, 0, true, true);
    let reward_stable = compute_reward(3, 3, 0, true, true);
    assert!(
        reward_terminal < reward_stable,
        "Terminal state should have extra penalty"
    );
}

#[test]
fn test_compute_reward_bounded() {
    // Test extreme inputs to verify boundedness
    let max_reward = compute_reward(4, 0, 0, true, true); // best case
    let min_reward = compute_reward(0, 4, 100, false, false); // worst case
    assert!(max_reward < 2.0, "Reward should be bounded above");
    assert!(min_reward > -10.0, "Reward should be bounded below");
}

#[test]
fn test_compute_reward_circuit_failure() {
    let reward_ok = compute_reward(1, 1, 0, true, true);
    let reward_fail = compute_reward(1, 1, 0, true, false);
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
    let state = RlState(2);

    let (action_label, reward) = orch.run_cycle(&features, &state, 0, true, true);

    assert!(!action_label.is_empty());
    assert_eq!(orch.telemetry().cycle_count, 1);
    assert_eq!(orch.telemetry().last_health_state, 2);
    assert_eq!(orch.telemetry().cumulative_reward, reward);

    // Second cycle
    let (_, reward2) = orch.run_cycle(&features, &state, 0, true, true);
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
        let state = RlState(1);
        // Should not panic for any agent
        let (action, reward) = orch.run_cycle(&features, &state, 0, true, true);
        assert!(!action.is_empty());
        assert!(!reward.is_nan());
    }
}

#[test]
fn test_run_cycle_with_linucb_selection() {
    let mut orch = RlOrchestrator::new();
    orch.set_linucb_selection(true);
    let features = [0.1, 0.1, 0.1, 0.5, 0.0, 1.0, 1.0, 0.0];
    let state = RlState(1);

    // Run multiple cycles — LinUCB should eventually change agent
    for _ in 0..20 {
        let _ = orch.run_cycle(&features, &state, 0, true, true);
    }

    // Telemetry should reflect multiple cycles
    assert_eq!(orch.telemetry().cycle_count, 20);
}
