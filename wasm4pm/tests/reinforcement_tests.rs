//! Consolidated tests for the reinforcement learning module.
//!
//! Algorithm family: Reinforcement Learning
//! Modules tested: reinforcement (QLearning, SARSA, DoubleQLearning,
//!                 ExpectedSARSAAgent, ReinforceAgent)
//!
//! Extracted from embedded #[cfg(test)] block in src/reinforcement.rs.

use pictl::reinforcement::{
    Agent, DoubleQLearning, ExpectedSARSAAgent, QLearning, ReinforceAgent, SARSAAgent,
    WorkflowAction, WorkflowState,
};
use std::hash::Hash;

// ---------------------------------------------------------------------------
// Shared test types
// ---------------------------------------------------------------------------

#[derive(Clone, Eq, PartialEq, Hash)]
struct SimpleState(i32);

impl WorkflowState for SimpleState {
    fn features(&self) -> Vec<f32> {
        vec![self.0 as f32]
    }

    fn is_terminal(&self) -> bool {
        self.0 >= 100
    }
}

#[derive(Clone, Eq, PartialEq, Hash)]
enum SimpleAction {
    Increment,
    Double,
}

impl WorkflowAction for SimpleAction {
    const ACTION_COUNT: usize = 2;

    fn to_index(&self) -> usize {
        match self {
            SimpleAction::Increment => 0,
            SimpleAction::Double => 1,
        }
    }

    fn from_index(idx: usize) -> Option<Self> {
        match idx {
            0 => Some(SimpleAction::Increment),
            1 => Some(SimpleAction::Double),
            _ => None,
        }
    }
}

// ---------------------------------------------------------------------------
// Q-Learning Tests
// ---------------------------------------------------------------------------

#[test]
fn test_q_learning_basic() {
    let agent: QLearning<SimpleState, SimpleAction> = QLearning::new();

    let s1 = SimpleState(0);
    let s2 = SimpleState(1);
    let action = SimpleAction::Increment;

    agent.update(&s1, &action, 1.0, &s2, false);

    let q_val = agent.get_q_value(&s1, &action);
    assert!(
        q_val > 0.0,
        "Q-value should increase after positive reward"
    );
}

// ---------------------------------------------------------------------------
// SARSA Tests
// ---------------------------------------------------------------------------

#[test]
fn test_sarsa_agent_basic() {
    let agent: SARSAAgent<SimpleState, SimpleAction> = SARSAAgent::new();

    let s1 = SimpleState(0);
    let s2 = SimpleState(1);
    let a1 = SimpleAction::Increment;
    let a2 = SimpleAction::Double;

    agent.update(&s1, &a1, 1.0, &s2, &a2);
}

// ---------------------------------------------------------------------------
// Double Q-Learning Tests
// ---------------------------------------------------------------------------

#[test]
fn test_double_q_learning_basic() {
    let agent: DoubleQLearning<SimpleState, SimpleAction> = DoubleQLearning::new();

    let s1 = SimpleState(0);
    let s2 = SimpleState(1);
    let action = SimpleAction::Increment;

    agent.update(&s1, &action, 1.0, &s2, false);
}

#[test]
fn test_double_q_learning_convergence() {
    let mut agent: DoubleQLearning<SimpleState, SimpleAction> =
        DoubleQLearning::with_hyperparams(0.1, 0.99, 1.0);

    for _ in 0..200 {
        let state = SimpleState(0);
        let action = agent.select_action(&state);
        let reward = if matches!(action, SimpleAction::Increment) { 1.0 } else { 0.0 };
        agent.update(&state, &action, reward, &SimpleState(1), false);
        agent.decay_exploration();
    }

    assert!(
        agent.get_exploration_rate() < 0.5,
        "epsilon should decay significantly after 200 steps"
    );
}

// ---------------------------------------------------------------------------
// Expected SARSA Tests
// ---------------------------------------------------------------------------

#[test]
fn test_expected_sarsa_basic() {
    let agent: ExpectedSARSAAgent<SimpleState, SimpleAction> = ExpectedSARSAAgent::new();

    let s1 = SimpleState(0);
    let s2 = SimpleState(1);
    let action = SimpleAction::Increment;

    agent.update(&s1, &action, 1.0, &s2, false);
}

#[test]
fn test_expected_sarsa_lower_variance() {
    let agent: ExpectedSARSAAgent<SimpleState, SimpleAction> =
        ExpectedSARSAAgent::with_hyperparams(0.1, 0.99, 0.0);

    let s1 = SimpleState(0);
    let s2 = SimpleState(1);
    let action = SimpleAction::Increment;

    for _ in 0..100 {
        agent.update(&s1, &action, 1.0, &s2, false);
    }

    let greedy_action = agent.select_action(&s1);
    assert!(
        matches!(greedy_action, SimpleAction::Increment),
        "greedy Expected SARSA should learn to select rewarded action"
    );
}

// ---------------------------------------------------------------------------
// REINFORCE Tests
// ---------------------------------------------------------------------------

#[test]
fn test_reinforce_basic() {
    let agent: ReinforceAgent<SimpleState, SimpleAction> = ReinforceAgent::new();

    let s1 = SimpleState(0);
    let a1 = SimpleAction::Increment;

    agent.update_from_trajectory(&[(s1, a1, 1.0)]);
}

#[test]
fn test_reinforce_trajectory_update() {
    let agent: ReinforceAgent<SimpleState, SimpleAction> =
        ReinforceAgent::with_hyperparams(0.1, 0.99);

    let trajectory = vec![
        (SimpleState(0), SimpleAction::Increment, 0.0),
        (SimpleState(1), SimpleAction::Increment, 0.0),
        (SimpleState(2), SimpleAction::Increment, 1.0),
    ];

    agent.update_from_trajectory(&trajectory);

    let weights_0 = agent.get_policy_weights(&SimpleState(0));
    let weights_1 = agent.get_policy_weights(&SimpleState(1));
    let weights_2 = agent.get_policy_weights(&SimpleState(2));

    assert_eq!(weights_0.len(), 2);
    assert_eq!(weights_1.len(), 2);
    assert_eq!(weights_2.len(), 2);
}

#[test]
fn test_reinforce_convergence() {
    let agent: ReinforceAgent<SimpleState, SimpleAction> =
        ReinforceAgent::with_hyperparams(0.05, 0.99);

    for _ in 0..500 {
        let s = SimpleState(0);
        let a = agent.select_action(&s);
        let reward = if matches!(a, SimpleAction::Increment) { 1.0 } else { -1.0 };
        agent.update_step(&s, &a, reward);
    }

    let weights = agent.get_policy_weights(&SimpleState(0));
    assert!(
        weights[0] > weights[1],
        "REINFORCE should learn higher weight for rewarded action: {} vs {}",
        weights[0],
        weights[1]
    );
}

// ---------------------------------------------------------------------------
// Interface Consistency Test
// ---------------------------------------------------------------------------

#[test]
fn test_all_agents_interface_consistency() {
    let s = SimpleState(0);

    let q_agent: QLearning<SimpleState, SimpleAction> = QLearning::new();
    let sarsa_agent: SARSAAgent<SimpleState, SimpleAction> = SARSAAgent::new();
    let dq_agent: DoubleQLearning<SimpleState, SimpleAction> = DoubleQLearning::new();
    let esarsa_agent: ExpectedSARSAAgent<SimpleState, SimpleAction> = ExpectedSARSAAgent::new();
    let reinforce_agent: ReinforceAgent<SimpleState, SimpleAction> = ReinforceAgent::new();

    let _ = q_agent.select_action(&s);
    let _ = sarsa_agent.epsilon_greedy_action(&s, 0.5);
    let _ = dq_agent.select_action(&s);
    let _ = esarsa_agent.select_action(&s);
    let _ = reinforce_agent.select_action(&s);
}
