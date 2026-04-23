//! Determinism validation tests for the RL subsystem.
//!
//! These tests verify the seeded-RNG / zero-exploration determinism contract
//! that all behavioral tests depend on. The key insight: when epsilon-greedy
//! agents have exploration_rate = 0.0, they always select the greedy action,
//! making them fully deterministic (no calls to `rand`).
//!
//! Determinism hierarchy:
//!   - QLearning (eps=0): deterministic action selection, deterministic update
//!   - SARSA (eps=0): deterministic action selection, deterministic update
//!   - ExpectedSARSA (eps=0): deterministic action selection, deterministic update
//!   - DoubleQLearning (eps=0): deterministic action selection, BUT update uses
//!     `rand::random::<bool>()` for table selection, so Q-table evolution is
//!     non-deterministic. Action selection itself is deterministic because it
//!     only reads the Q-tables (does not mutate them).
//!   - REINFORCE: always non-deterministic. Uses Gumbel-max trick (inherently
//!     stochastic) for every select_action call. Has no exploration_rate.
//!     Only deterministic on the very first visit to a state (all weights = 0,
//!     so Gumbel noise is the only differentiator — still random).
//!
//! Limitations documented inline.
//!
//! Algorithm family: Reinforcement Learning
//! Modules tested: reinforcement, rl_orchestrator

use wasm4pm::reinforcement::{
    Agent, DoubleQLearning, ExpectedSARSAAgent, QLearning, ReinforceAgent, SARSAAgent,
    WorkflowAction, WorkflowState,
};
use wasm4pm::rl_orchestrator::{compute_reward, compute_health_state, AgentType, RlOrchestrator};
use wasm4pm::RlState;

// ---------------------------------------------------------------------------
// Shared test types (mirrors RlAction/RlState but with minimal action space)
// ---------------------------------------------------------------------------

#[derive(Clone, Eq, PartialEq, Hash)]
struct TinyState(u8);

impl WorkflowState for TinyState {
    fn features(&self) -> Vec<f32> {
        vec![self.0 as f32]
    }

    fn is_terminal(&self) -> bool {
        self.0 == 255
    }
}

#[derive(Clone, Eq, PartialEq, Hash, Debug)]
enum TinyAction {
    A,
    B,
}

impl WorkflowAction for TinyAction {
    const ACTION_COUNT: usize = 2;

    fn to_index(&self) -> usize {
        match self {
            TinyAction::A => 0,
            TinyAction::B => 1,
        }
    }

    fn from_index(idx: usize) -> Option<Self> {
        match idx {
            0 => Some(TinyAction::A),
            1 => Some(TinyAction::B),
            _ => None,
        }
    }
}

/// Fixed feature vector for deterministic cycle tests.
const FEATURES: [f32; 8] = [0.1, 0.2, 0.3, 0.0, 0.0, 0.0, 0.5, 0.0];

/// Helper to create a deterministic RlState.
fn make_rl_state(health_level: u8) -> RlState {
    let features = [0.5, 0.3, 0.2, 0.0, 0.0, 0.0, 0.5, 0.0];
    RlState::from_features(&features, health_level, 0.0)
}

// ===========================================================================
// Test 1: Zero-exploration is deterministic
// ===========================================================================

#[test]
fn test_zero_exploration_is_deterministic() {
    // At exploration_rate = 0.0, QLearning never calls rand::random().
    // It always picks the greedy action (highest Q-value, or first on tie).
    // With an empty Q-table, all Q-values are 0.0, so the first action
    // (index 0) wins the tie — deterministic.
    let agent: QLearning<TinyState, TinyAction> =
        QLearning::with_hyperparams(0.1, 0.99, 0.0);

    let state = TinyState(42);

    // Run 50 action selections — all should be identical (greedy with empty Q-table)
    let first_action = agent.select_action(&state);
    for _ in 0..49 {
        let action = agent.select_action(&state);
        assert_eq!(
            action, first_action,
            "zero-exploration QLearning must always select the same action"
        );
    }

    // Run again with a fresh agent — must produce the same action
    let agent2: QLearning<TinyState, TinyAction> =
        QLearning::with_hyperparams(0.1, 0.99, 0.0);
    let fresh_action = agent2.select_action(&state);
    assert_eq!(
        fresh_action, first_action,
        "fresh zero-exploration agent must produce the same action"
    );
}

// ===========================================================================
// Test 2: Deterministic reward accumulation
// ===========================================================================

#[test]
fn test_deterministic_reward_accumulation() {
    // Create two QLearning agents with zero exploration.
    // Run 100 update cycles with identical (state, action, reward, next_state).
    // Record cumulative Q-value for a specific (state, action) pair after each cycle.
    // Assert: both agents accumulate identical Q-values at every step.

    let agent1: QLearning<TinyState, TinyAction> =
        QLearning::with_hyperparams(0.1, 0.99, 0.0);
    let agent2: QLearning<TinyState, TinyAction> =
        QLearning::with_hyperparams(0.1, 0.99, 0.0);

    let action = TinyAction::A;

    // Deterministic health-like transitions: 0 -> 1 -> 2 -> 3 -> 3 -> 3 ...
    let state_vals: [u8; 10] = [0, 1, 2, 3, 3, 3, 3, 3, 3, 3];
    // Rewards: +1.0 for health improvement (0->1, 1->2, 2->3), +0.2 for stability (3->3)
    let rewards: [f32; 10] = [1.0, 1.0, 1.0, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2];

    // Repeat the pattern for 100 cycles
    let num_cycles = 100;
    for cycle in 0..num_cycles {
        let i = cycle % state_vals.len();
        let curr = TinyState(state_vals[i]);
        let next = TinyState(state_vals[(i + 1) % state_vals.len()]);
        let reward = rewards[i];
        let done = false;

        Agent::update(&agent1, &curr, &action, reward, &next, done);
        Agent::update(&agent2, &curr, &action, reward, &next, done);

        // Q-value for (TinyState(0), A) must match between both agents at every step
        let q1 = agent1.get_q_value(&TinyState(0), &action);
        let q2 = agent2.get_q_value(&TinyState(0), &action);
        assert!(
            (q1 - q2).abs() < 1e-6,
            "cycle {}: Q(s0,A) diverged between two zero-exploration agents: {:.6} vs {:.6}",
            cycle, q1, q2
        );
    }

    // Final cumulative reward must also match
    assert!(
        (agent1.total_reward() - agent2.total_reward()).abs() < 1e-6,
        "total_reward diverged: {:.6} vs {:.6}",
        agent1.total_reward(),
        agent2.total_reward()
    );
}

// ===========================================================================
// Test 3: All agents deterministic at zero exploration
// ===========================================================================

#[test]
fn test_all_agents_deterministic_at_zero_exploration() {
    // For epsilon-greedy agents (QLearning, SARSA, ExpectedSARSA, DoubleQLearning),
    // setting exploration_rate = 0.0 eliminates all randomness in action selection.
    //
    // REINFORCE is EXCLUDED from this test because it uses Gumbel-max sampling
    // which is inherently stochastic regardless of any exploration parameter.
    // REINFORCE has no exploration_rate field. Its action selection is never
    // deterministic — this is a fundamental property of policy gradient methods.

    let state = TinyState(7);
    let cycles = 20;

    // --- QLearning ---
    let q_agent: QLearning<TinyState, TinyAction> =
        QLearning::with_hyperparams(0.1, 0.99, 0.0);
    let q_first = q_agent.select_action(&state);
    for _ in 1..cycles {
        assert_eq!(
            q_agent.select_action(&state),
            q_first,
            "QLearning (eps=0) must produce identical actions"
        );
    }

    // --- SARSA ---
    let sa_agent: SARSAAgent<TinyState, TinyAction> = SARSAAgent::new();
    // SARSA::new() sets exploration_rate = 1.0, but we call epsilon_greedy_action
    // directly with epsilon=0.0 to bypass the field.
    let sa_first = sa_agent.epsilon_greedy_action(&state, 0.0);
    for _ in 1..cycles {
        assert_eq!(
            sa_agent.epsilon_greedy_action(&state, 0.0),
            sa_first,
            "SARSA (eps=0) must produce identical actions"
        );
    }

    // --- DoubleQLearning ---
    let dq_agent: DoubleQLearning<TinyState, TinyAction> =
        DoubleQLearning::with_hyperparams(0.1, 0.99, 0.0);
    let dq_first = dq_agent.select_action(&state);
    for _ in 1..cycles {
        assert_eq!(
            dq_agent.select_action(&state),
            dq_first,
            "DoubleQLearning (eps=0) must produce identical actions"
        );
    }

    // --- ExpectedSARSA ---
    let es_agent: ExpectedSARSAAgent<TinyState, TinyAction> =
        ExpectedSARSAAgent::with_hyperparams(0.1, 0.99, 0.0);
    let es_first = es_agent.select_action(&state);
    for _ in 1..cycles {
        assert_eq!(
            es_agent.select_action(&state),
            es_first,
            "ExpectedSARSA (eps=0) must produce identical actions"
        );
    }

    // --- REINFORCE: document non-determinism ---
    // REINFORCE uses Gumbel-max sampling: val = weight + gumbel_noise.
    // Even with all-zero weights, the gumbel noise is random, so actions vary.
    // This is NOT a bug — it's the expected behavior of stochastic policy gradient.
    let rf_agent: ReinforceAgent<TinyState, TinyAction> = ReinforceAgent::new();
    let _rf_first = rf_agent.select_action(&state);
    // We do NOT assert all_same for REINFORCE. Instead, we document:
    // REINFORCE action selection is inherently non-deterministic due to
    // Gumbel-max sampling. The behavioral tests that use REINFORCE accept
    // this variance and test aggregate properties (reward improvement),
    // not exact action reproducibility.
}

// ===========================================================================
// Test 4: Exploration rate affects action diversity
// ===========================================================================

#[test]
fn test_exploration_rate_affects_diversity() {
    // Run A: exploration_rate = 0.0 → agent always picks greedy action
    // Run B: exploration_rate = 1.0 → agent always picks random action
    // Assert: unique_actions_B >= unique_actions_A
    //
    // With 5 actions (RlAction has ACTION_COUNT = 5) and 50 selections:
    // - eps=0: always 1 unique action (greedy)
    // - eps=1: expected ~3.5 unique actions (coupon collector with n=5, k=50)
    //
    // We use the TinyAction space (2 actions) for a clearer signal:
    // - eps=0: 1 unique action
    // - eps=1: expected ~1.5 unique actions (sometimes both, sometimes one)

    let state = TinyState(99);
    let selections = 50;

    // Run A: zero exploration
    let agent_a: QLearning<TinyState, TinyAction> =
        QLearning::with_hyperparams(0.1, 0.99, 0.0);
    let mut unique_a = std::collections::HashSet::new();
    for _ in 0..selections {
        unique_a.insert(agent_a.select_action(&state));
    }

    // Run B: full exploration
    let agent_b: QLearning<TinyState, TinyAction> =
        QLearning::with_hyperparams(0.1, 0.99, 1.0);
    let mut unique_b = std::collections::HashSet::new();
    for _ in 0..selections {
        unique_b.insert(agent_b.select_action(&state));
    }

    assert!(
        unique_b.len() >= unique_a.len(),
        "high exploration (eps=1, {} unique) should produce >= unique actions than zero exploration (eps=0, {} unique)",
        unique_b.len(),
        unique_a.len()
    );

    // Zero exploration should produce exactly 1 unique action (greedy)
    assert_eq!(
        unique_a.len(),
        1,
        "zero exploration should produce exactly 1 unique action, got {}",
        unique_a.len()
    );
}

// ===========================================================================
// Test 5: compute_reward is pure (no hidden state)
// ===========================================================================

#[test]
fn test_compute_reward_is_pure_function() {
    // compute_reward is a free function with no mutable state.
    // Calling it 100 times with identical inputs must produce identical outputs.

    let inputs = (3u8, 2u8, 0usize, true, true);

    let first_result = compute_reward(inputs.0, inputs.1, inputs.2, inputs.3, inputs.4, false);

    for _ in 0..99 {
        let result = compute_reward(inputs.0, inputs.1, inputs.2, inputs.3, inputs.4, false);
        assert_eq!(
            result, first_result,
            "compute_reward must return identical results for identical inputs"
        );
    }

    // Different inputs should produce different results
    let different = compute_reward(3u8, 3u8, 0usize, true, true, false);
    assert_ne!(
        first_result, different,
        "compute_reward must return different results for different inputs"
    );

    // More specific: health improvement (3->2) vs stability (2->2)
    let improvement = compute_reward(3, 2, 0, true, true, false);
    let stability = compute_reward(2, 2, 0, true, true, false);
    assert!(
        improvement > stability,
        "health improvement reward ({:.2}) should exceed stability reward ({:.2})",
        improvement,
        stability
    );
}

// ===========================================================================
// Test 6: RlState creation is deterministic
// ===========================================================================

#[test]
fn test_rl_state_creation_is_deterministic() {
    // Creating RlState from the same features + health_level must always
    // produce identical states. RlState derives PartialEq + Eq.

    let features = [0.1, 0.2, 0.3, 0.0, 0.0, 0.0, 0.5, 0.0];
    let health = 2u8;
    let rework = 0.05f32;

    let reference = RlState::from_features(&features, health, rework);

    for _ in 0..99 {
        let state = RlState::from_features(&features, health, rework);
        assert_eq!(
            state, reference,
            "RlState::from_features must produce identical states for identical inputs"
        );
    }

    // Different health level should produce different state
    let different_health = RlState::from_features(&features, 3, rework);
    assert_ne!(
        reference, different_health,
        "different health_level should produce different RlState"
    );

    // Different features should produce different state
    let mut diff_features = features;
    diff_features[0] = 0.9;
    let different_features = RlState::from_features(&diff_features, health, rework);
    assert_ne!(
        reference, different_features,
        "different features should produce different RlState"
    );
}

// ===========================================================================
// Test 7: Telemetry accumulation is deterministic
// ===========================================================================

#[test]
fn test_telemetry_accumulation_deterministic() {
    // NOTE: This test documents a LIMITATION.
    //
    // RlOrchestrator::new() creates agents with exploration_rate = 1.0.
    // There is NO public API to set exploration_rate on the orchestrator's
    // internal agents. The agents are created via Agent::new() internally.
    //
    // With exploration_rate = 1.0, all epsilon-greedy agents pick random actions,
    // making run_cycle non-deterministic. Telemetry fields like last_action_label
    // and cumulative_reward will diverge between two orchestrators.
    //
    // HOWEVER: compute_reward is a pure function (Test 5 proves this), and
    // compute_health_state is also a pure function. If we fix the action_label
    // by using select_action with zero-exploration agents directly, we can
    // verify that the reward computation portion of telemetry is deterministic.
    //
    // The behavioral tests work around this by testing aggregate properties
    // (monotonic reward growth, convergence trends) rather than exact values.

    // Verify compute_health_state is pure and deterministic
    for _ in 0..100 {
        let h = compute_health_state(100, 10, 5);
        assert_eq!(h, 0, "compute_health_state(100, 10, 5) should always return 0 (Normal)");
    }

    // Verify compute_reward is pure (reinforcement of Test 5, in context)
    let reward = compute_reward(3, 2, 0, true, true, false);
    for _ in 0..100 {
        assert_eq!(
            compute_reward(3, 2, 0, true, true, false),
            reward,
            "compute_reward must be deterministic"
        );
    }

    // Demonstrate that the orchestrator's reward computation is deterministic
    // when we bypass action selection randomness.
    //
    // We do this by showing that two independent calls to compute_reward
    // with the same parameters produce identical results — which is exactly
    // what run_cycle does internally (it calls compute_reward, which is pure).
    let mut orch = RlOrchestrator::new_with_seed(42);
    orch.switch_agent(AgentType::QLearning);

    // Run 50 cycles — we can't assert exact telemetry match between two
    // orchestrators (because action selection is random), but we CAN assert
    // that the reward formula is applied consistently.
    let state = make_rl_state(3);
    let next_state = make_rl_state(2);

    // On cycle 0, prev_health is initialized from state.health_level (=3).
    // So reward = compute_reward(3, 2, 0, true, true).
    let expected_reward = compute_reward(3, 2, 0, true, true, false);

    let (_, actual_reward) = orch.run_cycle(&FEATURES, &state, &next_state, 0, true, true, false);

    assert!(
        (actual_reward - expected_reward).abs() < 1e-6,
        "run_cycle reward ({:.4}) must match compute_reward ({:.4})",
        actual_reward,
        expected_reward
    );

    // Cumulative reward after one cycle is exactly the first reward
    assert!(
        (orch.telemetry().cumulative_reward - actual_reward).abs() < 1e-6,
        "cumulative_reward after 1 cycle should equal the first reward"
    );

    assert_eq!(orch.telemetry().cycle_count, 1);
}

// ===========================================================================
// Test 8: Reproducibility assertion helper (determinism contract)
// ===========================================================================

#[test]
fn test_run_cycle_output_reproducible() {
    // This test documents the determinism contract that behavioral tests depend on.
    //
    // CONTRACT: When exploration_rate = 0.0 and inputs are identical,
    //           action selection and reward computation are fully reproducible.
    //
    // LIMITATION: RlOrchestrator has no public API to set exploration_rate
    // on its internal agents. The internal agents default to eps=1.0.
    //
    // WORKAROUND: Tests that need determinism should use the agent types
    // directly (QLearning::with_hyperparams(0.1, 0.99, 0.0)) and call
    // Agent::select_action / Agent::update manually.
    //
    // For orchestrator-level tests, behavioral tests use aggregate properties
    // (monotonicity, convergence, non-negativity) that are invariant to
    // action selection randomness, because compute_reward is a pure function
    // and health transitions are deterministic.

    // Part A: Verify direct agent usage is deterministic
    let agent: QLearning<TinyState, TinyAction> =
        QLearning::with_hyperparams(0.1, 0.99, 0.0);

    let s0 = TinyState(0);
    let s1 = TinyState(1);
    let action = agent.select_action(&s0); // greedy, deterministic

    let reward = 1.0;
    Agent::update(&agent, &s0, &action, reward, &s1, false);

    // Selecting again on the same state must return the same action
    // (Q-values changed but the greedy action for empty-table state is still
    // the first action that got a positive update)
    let action2 = agent.select_action(&s0);
    assert_eq!(
        action, action2,
        "zero-exploration agent must produce reproducible action selections"
    );

    // Part B: Verify compute_reward reproducibility in the cycle context
    //
    // Even though the orchestrator's action selection is non-deterministic
    // (eps=1.0 by default), the REWARD COMPUTATION is deterministic.
    // Two orchestrators given the same (prev_health, curr_health, spc, guard, circuit)
    // will always compute the same reward, regardless of which action was selected.
    let reward_a = compute_reward(3, 2, 0, true, true, false);
    let reward_b = compute_reward(3, 2, 0, true, true, false);
    assert_eq!(
        reward_a, reward_b,
        "reward computation must be bit-identical across calls"
    );

    // Part C: Verify compute_health_state reproducibility
    assert_eq!(compute_health_state(100, 10, 5), 0);
    assert_eq!(compute_health_state(0, 0, 0), 4);
    assert_eq!(compute_health_state(50, 0, 5), 3); // trace_count=0 → Critical
    assert_eq!(compute_health_state(50, 0, 1), 3); // trace_count=0 → Critical
}
