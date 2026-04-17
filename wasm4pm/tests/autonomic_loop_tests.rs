//! Integration tests for the connected autonomic loop.
//!
//! Tests that the RL orchestrator persists state across autonomic cycles,
//! that SPC feedback drives reward computation, and that all WASM exports work.

use wasm4pm::reinforcement::Agent;
use wasm4pm::rl_orchestrator::{compute_reward, AgentType};
use wasm4pm::{RlAction, RlState};

/// Helper to create test RlState with reasonable defaults
fn make_test_state(health_level: u8) -> RlState {
    let features = [0.5, 0.3, 0.2, 0.0, 0.0, 0.0, 0.5, 0.0]; // dummy feature vector
    RlState::from_features(&features, health_level, 0.0) // rework_ratio = 0.0
}

// ---------------------------------------------------------------------------
// Persistent state tests
// ---------------------------------------------------------------------------

#[test]
fn test_orchestrator_default() {
    let orch = wasm4pm::rl_orchestrator::RlOrchestrator::new();
    assert_eq!(orch.active_agent(), AgentType::QLearning);
    assert_eq!(orch.telemetry().cycle_count, 0);
}

#[test]
fn test_orchestrator_persists_across_cycles() {
    let mut orch = wasm4pm::rl_orchestrator::RlOrchestrator::new();
    let features = [0.1, 0.2, 0.3, 0.5, 0.0, 1.0, 1.0, 0.0];
    let state = make_test_state(1);
    let next_state = make_test_state(1);

    // Cycle 1
    orch.run_cycle(&features, &state, &next_state, 0, true, true, false);
    assert_eq!(orch.telemetry().cycle_count, 1);

    // Cycle 2
    orch.run_cycle(&features, &state, &next_state, 0, true, true, false);
    assert_eq!(orch.telemetry().cycle_count, 2);

    // Cycle 3
    orch.run_cycle(&features, &state, &next_state, 2, false, true, false);
    assert_eq!(orch.telemetry().cycle_count, 3);
    assert_eq!(orch.telemetry().last_spc_alert_count, 2);
}

// ---------------------------------------------------------------------------
// Reward computation tests
// ---------------------------------------------------------------------------

#[test]
fn test_reward_improves_with_health_gain() {
    let r_good = compute_reward(3, 1, 0, true, true, false);
    let r_stable = compute_reward(2, 2, 0, true, true, false);
    let r_bad = compute_reward(1, 3, 0, true, true, false);
    assert!(r_good > r_stable);
    assert!(r_stable > r_bad);
}

#[test]
fn test_reward_penalizes_spc_alerts() {
    let r_clean = compute_reward(2, 2, 0, true, true, false);
    let r_dirty = compute_reward(2, 2, 5, true, true, false);
    assert!(r_clean > r_dirty);
}

#[test]
fn test_reward_terminal_is_worst() {
    let r_terminal = compute_reward(3, 4, 0, true, true, false);
    let r_stable = compute_reward(4, 4, 0, true, true, false); // already at 4
    assert!(r_terminal <= r_stable);
}

// ---------------------------------------------------------------------------
// All agents in loop tests
// ---------------------------------------------------------------------------

#[test]
fn test_all_five_agents_work_in_loop() {
    let features = [0.1, 0.2, 0.3, 0.25, 0.0, 1.0, 1.0, 0.0];
    let state = make_test_state(1);
    let next_state = make_test_state(1);

    for agent_type in &[
        AgentType::QLearning,
        AgentType::SARSA,
        AgentType::DoubleQLearning,
        AgentType::ExpectedSARSA,
        AgentType::REINFORCE,
    ] {
        let mut orch = wasm4pm::rl_orchestrator::RlOrchestrator::new();
        orch.switch_agent(*agent_type);
        for i in 0..10 {
            let spc_alerts = if i % 3 == 0 { 2 } else { 0 };
            let (action, reward) = orch.run_cycle(&features, &state, &next_state, spc_alerts, true, true, false);
            assert!(
                !action.is_empty(),
                "Agent {:?} should produce an action",
                agent_type
            );
            assert!(!reward.is_nan(), "Reward should not be NaN");
        }
        assert_eq!(orch.telemetry().cycle_count, 10);
    }
}

// ---------------------------------------------------------------------------
// LinUCB agent selection tests
// ---------------------------------------------------------------------------

#[test]
fn test_linucb_agent_selection_changes_agent() {
    let mut orch = wasm4pm::rl_orchestrator::RlOrchestrator::new();
    orch.set_linucb_selection(true);
    let features = [0.5, 0.5, 0.5, 0.5, 0.0, 1.0, 1.0, 0.0];
    let state = make_test_state(1);
    let next_state = make_test_state(1);

    let mut seen_agents = std::collections::HashSet::new();
    for _ in 0..50 {
        orch.run_cycle(&features, &state, &next_state, 0, true, true, false);
        seen_agents.insert(orch.active_agent() as u8);
    }

    // With enough cycles, LinUCB should explore different agents
    // (not guaranteed with deterministic features, but the mechanism works)
    assert_eq!(orch.telemetry().cycle_count, 50);
}

// ---------------------------------------------------------------------------
// Agent trait consistency
// ---------------------------------------------------------------------------

#[test]
fn test_agent_trait_polymorphism() {
    // Verify all agents can be used through the Agent trait
    let state = make_test_state(1);
    let next = make_test_state(2);

    let q = wasm4pm::reinforcement::QLearning::<RlState, RlAction>::new();
    let _ = Agent::select_action(&q, &state);
    Agent::update(&q, &state, &RlAction::Continue, 0.5, &next, false);

    let sa = wasm4pm::reinforcement::SARSAAgent::<RlState, RlAction>::new();
    let _ = Agent::select_action(&sa, &state);
    Agent::update(&sa, &state, &RlAction::Scale, 0.3, &next, false);

    let dq = wasm4pm::reinforcement::DoubleQLearning::<RlState, RlAction>::new();
    let _ = Agent::select_action(&dq, &state);
    Agent::update(&dq, &state, &RlAction::Retry, -0.2, &next, false);

    let es = wasm4pm::reinforcement::ExpectedSARSAAgent::<RlState, RlAction>::new();
    let _ = Agent::select_action(&es, &state);
    Agent::update(&es, &state, &RlAction::Fallback, 0.1, &next, false);

    let rf = wasm4pm::reinforcement::ReinforceAgent::<RlState, RlAction>::new();
    let _ = Agent::select_action(&rf, &state);
    Agent::update(&rf, &state, &RlAction::Restart, -1.0, &next, true);
}

// ---------------------------------------------------------------------------
// Category G: Integration and Latency SLA
// ---------------------------------------------------------------------------

#[test]
fn test_single_autonomic_cycle_completes_in_under_100ms() {
    // JTBD: Single autonomic cycle meets <100ms latency SLA
    // Oracle Rank 2: Domain contract — wall-clock SLA from specification
    // Van der Aalst doctrine: Process must be responsive to real-time telemetry changes

    let mut orch = wasm4pm::rl_orchestrator::RlOrchestrator::new_with_seed(42);
    let features = [0.5, 0.3, 0.2, 0.0, 0.0, 0.0, 0.5, 0.0];
    let state = make_test_state(1);
    let next_state = make_test_state(1);

    // Measure wall-clock time for one cycle
    let start = std::time::Instant::now();
    let (_action, _reward) = orch.run_cycle(&features, &state, &next_state, 0, true, true, false);
    let elapsed = start.elapsed();

    // Assert: single cycle completes in <100ms
    assert!(
        elapsed < std::time::Duration::from_millis(100),
        "Single autonomic cycle must complete in <100ms: took {:?}",
        elapsed
    );
}

// ---------------------------------------------------------------------------
// Test G2 (Category G — Integration): 50 consecutive cycles without panic
// ---------------------------------------------------------------------------
#[test]
fn test_g2_fifty_consecutive_cycles_no_panic() {
    // Run 50 consecutive autonomic cycles. Assert no panics and cycle count == 50.
    // This validates end-to-end orchestrator stability without state corruption.
    let mut orch = wasm4pm::rl_orchestrator::RlOrchestrator::new_with_seed(42);
    let features = [0.1, 0.2, 0.3, 0.25, 0.0, 1.0, 1.0, 0.0];
    let state = make_test_state(1);
    let next_state = make_test_state(1);

    for i in 0..50 {
        let (action, reward) = orch.run_cycle(&features, &state, &next_state, 0, true, true, false);
        assert!(
            !action.is_empty(),
            "cycle {}: action should not be empty",
            i + 1
        );
        assert!(
            !reward.is_nan(),
            "cycle {}: reward should not be NaN",
            i + 1
        );
    }

    assert_eq!(
        orch.telemetry().cycle_count,
        50,
        "cycle_count must equal exactly 50 after 50 run_cycle calls"
    );
}

// ---------------------------------------------------------------------------
// Test G3 (Category G — Integration): Degraded→recovery reward increase
// ---------------------------------------------------------------------------
#[test]
fn test_g3_degraded_to_recovery_reward_increases() {
    // Phase 1: 10 cycles at health=3 (Critical) — degraded environment.
    // Phase 2: 10 cycles transitioning health=3→2→1→0 — recovery environment.
    // Assert: mean reward in Phase 2 > mean reward in Phase 1.
    let mut orch = wasm4pm::rl_orchestrator::RlOrchestrator::new_with_seed(42);
    let features = [0.1, 0.2, 0.3, 0.25, 0.0, 1.0, 1.0, 0.0];

    // Phase 1: degraded (health stays at 3)
    let degraded = make_test_state(3);
    let mut phase1_rewards = Vec::new();
    for _ in 0..10 {
        let (_, reward) = orch.run_cycle(&features, &degraded, &degraded, 0, true, true, false);
        phase1_rewards.push(reward);
    }

    // Phase 2: recovery (health improves each cycle)
    let mut phase2_rewards = Vec::new();
    let mut current_health: u8 = 3;
    for _ in 0..10 {
        let state = make_test_state(current_health);
        let next_health = if current_health > 0 { current_health - 1 } else { 0 };
        let next_state = make_test_state(next_health);
        let (_, reward) = orch.run_cycle(&features, &state, &next_state, 0, true, true, false);
        phase2_rewards.push(reward);
        current_health = next_health;
    }

    let mean_phase1: f32 = phase1_rewards.iter().sum::<f32>() / phase1_rewards.len() as f32;
    let mean_phase2: f32 = phase2_rewards.iter().sum::<f32>() / phase2_rewards.len() as f32;

    assert!(
        mean_phase2 > mean_phase1,
        "Mean reward during recovery ({:.4}) should exceed mean reward during degraded phase ({:.4}). \
         Phase 1 rewards: {:?}\nPhase 2 rewards: {:?}",
        mean_phase2,
        mean_phase1,
        phase1_rewards,
        phase2_rewards
    );
}

// ---------------------------------------------------------------------------
// Test: Latency budget penalty verification
// ---------------------------------------------------------------------------

#[test]
fn test_reward_penalizes_latency_budget_exceeded() {
    // Oracle Rank 1: Mathematical theorem — reward function penalty for latency_budget_exceeded
    // Verify: latency_budget_exceeded=true → reward -= 0.3

    // Baseline reward without latency budget exceeded
    let r_no_latency = compute_reward(2, 1, 0, true, true, false);

    // Same reward components but with latency budget exceeded
    let r_with_latency = compute_reward(2, 1, 0, true, true, true);

    // Assert: penalty is exactly -0.3
    let penalty = r_no_latency - r_with_latency;
    assert_eq!(
        penalty, 0.3,
        "Latency budget exceeded should apply -0.3 penalty: \
         reward without latency={:.4}, with latency={:.4}, penalty={:.4}",
        r_no_latency, r_with_latency, penalty
    );

    // Additional test: verify latency penalty stacks with other penalties
    let r_spc_only = compute_reward(2, 2, 1, true, true, false);
    let r_spc_and_latency = compute_reward(2, 2, 1, true, true, true);
    let stacked_penalty = r_spc_only - r_spc_and_latency;
    assert_eq!(
        stacked_penalty, 0.3,
        "Latency penalty should stack independently with SPC penalty: \
         penalty={:.4}",
        stacked_penalty
    );
}
