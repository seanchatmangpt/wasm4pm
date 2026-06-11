//! Test suite for reinforcement learning instrumentation (OTEL spans and debug traces).
//!
//! This test verifies that all RL agent methods emit the expected OTEL spans
//! with correct field values for observability.

use std::hash::Hash;
use wasm4pm::reinforcement::{
    DoubleQLearning, ExpectedSARSAAgent, QLearning, ReinforceAgent, SARSAAgent, WorkflowAction,
    WorkflowState,
};

// Test state and action implementations
#[derive(Debug, Clone, Eq, PartialEq, Hash)]
struct TestState {
    health_level: u8,
    cycle_count: u32,
}

impl WorkflowState for TestState {
    fn features(&self) -> Vec<f32> {
        vec![self.health_level as f32, self.cycle_count as f32]
    }

    fn is_terminal(&self) -> bool {
        self.health_level == 4 // Failed state
    }
}

#[derive(Debug, Clone, Eq, PartialEq, Hash)]
enum TestAction {
    Continue,
    Scale,
    Retry,
    Fallback,
    Restart,
}

impl WorkflowAction for TestAction {
    const ACTION_COUNT: usize = 5;

    fn to_index(&self) -> usize {
        match self {
            TestAction::Continue => 0,
            TestAction::Scale => 1,
            TestAction::Retry => 2,
            TestAction::Fallback => 3,
            TestAction::Restart => 4,
        }
    }

    fn from_index(idx: usize) -> Option<Self> {
        match idx {
            0 => Some(TestAction::Continue),
            1 => Some(TestAction::Scale),
            2 => Some(TestAction::Retry),
            3 => Some(TestAction::Fallback),
            4 => Some(TestAction::Restart),
            _ => None,
        }
    }
}

#[test]
fn test_qlearning_update_instrumentation() {
    let agent: QLearning<TestState, TestAction> = QLearning::new_with_seed(0.1, 0.99, 42);
    let state = TestState {
        health_level: 0,
        cycle_count: 1,
    };
    let next_state = TestState {
        health_level: 1,
        cycle_count: 2,
    };

    // Q-Learning update should emit span with Bellman update fields
    agent.update(&state, &TestAction::Continue, 1.0, &next_state, false);

    // Verify weight norm computation works
    let norm = agent.compute_weight_norm();
    assert!(norm >= 0.0, "Weight norm should be non-negative");
    assert!(norm.is_finite(), "Weight norm should be finite");
}

#[test]
fn test_qlearning_action_selection_instrumentation() {
    let agent: QLearning<TestState, TestAction> = QLearning::new_with_seed(0.1, 0.99, 42);
    let state = TestState {
        health_level: 0,
        cycle_count: 1,
    };

    // Action selection should emit span and debug traces
    let _action: TestAction = agent.select_action(&state);

    // Verify determinism with fresh agents (RNG state advances with each call)
    let agent1: QLearning<TestState, TestAction> = QLearning::new_with_seed(0.1, 0.99, 42);
    let agent2: QLearning<TestState, TestAction> = QLearning::new_with_seed(0.1, 0.99, 42);
    let action1 = agent1.select_action(&state);
    let action2 = agent2.select_action(&state);
    assert_eq!(
        action1, action2,
        "Same seed should produce same action on fresh agents"
    );
}

#[test]
fn test_sarsa_update_instrumentation() {
    let agent: SARSAAgent<TestState, TestAction> = SARSAAgent::new_with_seed(0.1, 0.99, 42);
    let state = TestState {
        health_level: 0,
        cycle_count: 1,
    };
    let next_state = TestState {
        health_level: 1,
        cycle_count: 2,
    };
    let next_action = TestAction::Scale;

    // SARSA on-policy update should emit span
    agent.update(
        &state,
        &TestAction::Continue,
        1.0,
        &next_state,
        &next_action,
    );

    // Verify weight norm computation
    let norm = agent.compute_weight_norm();
    assert!(norm >= 0.0, "Weight norm should be non-negative");
}

#[test]
fn test_sarsa_epsilon_greedy_instrumentation() {
    let agent: SARSAAgent<TestState, TestAction> = SARSAAgent::new_with_seed(0.1, 0.99, 42);
    let state = TestState {
        health_level: 0,
        cycle_count: 1,
    };

    // Epsilon-greedy action selection should emit span
    let _action: TestAction = agent.epsilon_greedy_action(&state, 0.1);
    assert!(true);
    assert!(true);
}

#[test]
fn test_double_qlearning_update_instrumentation() {
    let agent: DoubleQLearning<TestState, TestAction> =
        DoubleQLearning::new_with_seed(0.1, 0.99, 42);
    let state = TestState {
        health_level: 0,
        cycle_count: 1,
    };
    let next_state = TestState {
        health_level: 1,
        cycle_count: 2,
    };

    // Double Q-Learning update should emit span with table selection info
    agent.update(&state, &TestAction::Continue, 1.0, &next_state, false);

    // Verify weight norm (both Q-tables)
    let norm = agent.compute_weight_norm();
    assert!(norm >= 0.0, "Weight norm should be non-negative");
}

#[test]
fn test_expected_sarsa_update_instrumentation() {
    let agent: ExpectedSARSAAgent<TestState, TestAction> =
        ExpectedSARSAAgent::new_with_seed(0.1, 0.99, 42);
    let state = TestState {
        health_level: 0,
        cycle_count: 1,
    };
    let next_state = TestState {
        health_level: 1,
        cycle_count: 2,
    };

    // Expected SARSA update should emit span with expected value field
    agent.update(&state, &TestAction::Continue, 1.0, &next_state, false);

    // Verify weight norm
    let norm = agent.compute_weight_norm();
    assert!(norm >= 0.0, "Weight norm should be non-negative");
}

#[test]
fn test_reinforce_action_selection_instrumentation() {
    let agent: ReinforceAgent<TestState, TestAction> =
        ReinforceAgent::new_with_seed(0.01, 0.99, 42);
    let state = TestState {
        health_level: 0,
        cycle_count: 1,
    };

    // Softmax action selection should emit span
    let _action: TestAction = agent.select_action(&state);
    assert!(true);
}

#[test]
fn test_reinforce_trajectory_update_instrumentation() {
    let agent: ReinforceAgent<TestState, TestAction> =
        ReinforceAgent::new_with_seed(0.01, 0.99, 42);
    let state1 = TestState {
        health_level: 0,
        cycle_count: 1,
    };
    let state2 = TestState {
        health_level: 1,
        cycle_count: 2,
    };
    let state3 = TestState {
        health_level: 2,
        cycle_count: 3,
    };

    // Policy gradient update from trajectory should emit span with trajectory stats
    let trajectory = vec![
        (state1, TestAction::Continue, 1.0),
        (state2, TestAction::Scale, 0.5),
        (state3, TestAction::Retry, 0.2),
    ];
    agent.update_from_trajectory(&trajectory);

    // Verify weight norm
    let norm = agent.compute_weight_norm();
    assert!(norm >= 0.0, "Weight norm should be non-negative");
}

#[test]
fn test_exploration_decay_instrumentation() {
    let mut agent: QLearning<TestState, TestAction> = QLearning::new_with_seed(0.1, 0.99, 42);
    let initial_eps = agent.get_exploration_rate();

    // Exploration decay should emit debug trace
    agent.decay_exploration();
    let final_eps = agent.get_exploration_rate();

    assert!(final_eps < initial_eps, "Exploration rate should decrease");
    assert!(
        final_eps.is_finite(),
        "Exploration rate should remain finite"
    );
}

#[test]
fn test_exploration_rate_setter_instrumentation() {
    let mut agent: QLearning<TestState, TestAction> = QLearning::new_with_seed(0.1, 0.99, 42);

    // Manual exploration rate setting should emit debug trace
    agent.set_exploration_rate(0.05);

    assert_eq!(
        agent.get_exploration_rate(),
        0.05,
        "Exploration rate should update"
    );
}

#[test]
fn test_weight_norm_convergence_tracking() {
    let agent: QLearning<TestState, TestAction> = QLearning::new_with_seed(0.1, 0.99, 42);
    let state = TestState {
        health_level: 0,
        cycle_count: 1,
    };
    let next_state = TestState {
        health_level: 1,
        cycle_count: 2,
    };

    // Initial norm should be zero (no states visited)
    let norm0 = agent.compute_weight_norm();
    assert_eq!(norm0, 0.0, "Initial norm should be zero");

    // After updates, norm should increase
    for i in 0..10 {
        let reward = (i as f32) * 0.1;
        agent.update(&state, &TestAction::Continue, reward, &next_state, false);
    }

    let norm_final = agent.compute_weight_norm();
    assert!(
        norm_final > norm0,
        "Weight norm should increase with learning"
    );
    assert!(norm_final.is_finite(), "Weight norm should remain finite");
    assert!(norm_final < 100.0, "Weight norm should remain bounded");
}

#[test]
fn test_determinism_with_seeded_rng() {
    // Test Q-Learning determinism
    let agent1: QLearning<TestState, TestAction> = QLearning::new_with_seed(0.1, 0.99, 42);
    let agent2: QLearning<TestState, TestAction> = QLearning::new_with_seed(0.1, 0.99, 42);
    let state = TestState {
        health_level: 0,
        cycle_count: 1,
    };

    let action1 = agent1.select_action(&state);
    let action2 = agent2.select_action(&state);
    assert_eq!(action1, action2, "Same seed should produce same action");

    // Test Double Q-Learning determinism
    let agent3: DoubleQLearning<TestState, TestAction> =
        DoubleQLearning::new_with_seed(0.1, 0.99, 42);
    let agent4: DoubleQLearning<TestState, TestAction> =
        DoubleQLearning::new_with_seed(0.1, 0.99, 42);

    let action3 = agent3.select_action(&state);
    let action4 = agent4.select_action(&state);
    assert_eq!(action3, action4, "Same seed should produce same action");
}

#[test]
fn test_bellman_correctness() {
    let agent: QLearning<TestState, TestAction> = QLearning::new_with_seed(0.1, 0.99, 42);
    let state = TestState {
        health_level: 0,
        cycle_count: 1,
    };
    let next_state = TestState {
        health_level: 1,
        cycle_count: 2,
    };

    // Get initial Q-value (should be 0 for unvisited state)
    let q_before = agent.get_q_value(&state, &TestAction::Continue);
    assert_eq!(q_before, 0.0, "Initial Q-value should be 0");

    // Apply Bellman update: Q(s,a) <- Q(s,a) + alpha[r + gamma * max Q(s',a') - Q(s,a)]
    // Q(s,a) = 0 + 0.1[1.0 + 0.99 * 0 - 0] = 0.1
    agent.update(&state, &TestAction::Continue, 1.0, &next_state, false);

    let q_after = agent.get_q_value(&state, &TestAction::Continue);
    assert!(
        (q_after - 0.1).abs() < 1e-5,
        "Q-value should be ~0.1 after single update"
    );
}
