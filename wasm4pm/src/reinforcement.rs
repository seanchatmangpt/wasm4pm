//! Ported from knhk/rust/knhk-neural/src/reinforcement.rs
//!
//! Q-Learning and SARSA agents for self-optimizing workflows,
//! adapted for WASM single-threaded execution.
//!
//! Key changes from original:
//! - `Arc<RwLock<HashMap>>` replaced with `RefCell<HashMap>` for WASM compatibility
//! - `Send + Sync` trait bounds removed (single-threaded environment)

use std::cell::RefCell;
use std::collections::HashMap;
use std::hash::Hash;

/// State for reinforcement learning (must be hashable and cloneable)
pub trait WorkflowState: Clone + Eq + Hash {
    /// State features for function approximation
    fn features(&self) -> Vec<f32>;

    /// Is this a terminal state?
    fn is_terminal(&self) -> bool;
}

/// Action for reinforcement learning
pub trait WorkflowAction: Clone + Eq + Hash {
    /// Total number of possible actions
    const ACTION_COUNT: usize;

    /// Convert to index (0..ACTION_COUNT)
    fn to_index(&self) -> usize;

    /// Convert from index
    fn from_index(idx: usize) -> Option<Self>;
}

/// Q-Learning agent: model-free, off-policy
pub struct QLearning<S: WorkflowState, A: WorkflowAction> {
    /// Q-table: Q(s, a) values
    q_table: RefCell<HashMap<S, Vec<f32>>>,

    /// Hyperparameters
    learning_rate: f32,
    discount_factor: f32,
    exploration_rate: f32,
    exploration_decay: f32,

    /// Statistics
    episodes: RefCell<usize>,
    total_reward: RefCell<f32>,

    _phantom: std::marker::PhantomData<A>,
}

impl<S: WorkflowState, A: WorkflowAction> QLearning<S, A> {
    #[allow(dead_code)]
    pub fn new() -> Self {
        Self {
            q_table: RefCell::new(HashMap::new()),
            learning_rate: 0.1,
            discount_factor: 0.99,
            exploration_rate: 1.0,
            exploration_decay: 0.995,
            episodes: RefCell::new(0),
            total_reward: RefCell::new(0.0),
            _phantom: std::marker::PhantomData,
        }
    }

    #[allow(dead_code)]
    pub fn with_hyperparams(lr: f32, df: f32, exp_rate: f32) -> Self {
        let mut agent = Self::new();
        agent.learning_rate = lr;
        agent.discount_factor = df;
        agent.exploration_rate = exp_rate;
        agent
    }

    /// epsilon-greedy action selection
    #[allow(dead_code)]
    pub fn select_action(&self, state: &S) -> A {
        // Explore with probability epsilon
        if rand::random::<f32>() < self.exploration_rate {
            // Random action
            let idx = rand::random::<usize>() % A::ACTION_COUNT;
            A::from_index(idx).unwrap()
        } else {
            // Greedy: select action with max Q-value
            self.best_action(state)
        }
    }

    /// Get action with highest Q-value
    fn best_action(&self, state: &S) -> A {
        let q_table = self.q_table.borrow();
        let q_values = q_table
            .get(state)
            .cloned()
            .unwrap_or_else(|| vec![0.0; A::ACTION_COUNT]);

        let best_idx = q_values
            .iter()
            .enumerate()
            .max_by(|a, b| a.1.partial_cmp(b.1).unwrap_or(std::cmp::Ordering::Equal))
            .unwrap()
            .0;

        A::from_index(best_idx).unwrap()
    }

    /// Q-Learning update: Q(s,a) <- Q(s,a) + alpha[r + gamma max Q(s',a') - Q(s,a)]
    #[allow(dead_code)]
    pub fn update(
        &self,
        state: &S,
        action: &A,
        reward: f32,
        next_state: &S,
        done: bool,
    ) {
        let mut q_table = self.q_table.borrow_mut();

        // Initialize Q(s) if needed
        q_table
            .entry(state.clone())
            .or_insert_with(|| vec![0.0; A::ACTION_COUNT]);

        // Get max Q(s', a')
        let next_q_values = q_table
            .get(next_state)
            .cloned()
            .unwrap_or_else(|| vec![0.0; A::ACTION_COUNT]);
        let max_next_q = if done {
            0.0 // Terminal state has no future value
        } else {
            next_q_values
                .iter()
                .cloned()
                .fold(f32::NEG_INFINITY, f32::max)
        };

        // Q-Learning update
        let action_idx = action.to_index();
        let current_q = q_table[state][action_idx];
        let target = reward + self.discount_factor * max_next_q;
        let delta = self.learning_rate * (target - current_q);
        q_table.get_mut(state).unwrap()[action_idx] += delta;

        // Update statistics
        *self.total_reward.borrow_mut() += reward;
    }

    #[allow(dead_code)]
    pub fn decay_exploration(&mut self) {
        self.exploration_rate *= self.exploration_decay;
    }

    #[allow(dead_code)]
    pub fn get_q_value(&self, state: &S, action: &A) -> f32 {
        let q_table = self.q_table.borrow();
        q_table
            .get(state)
            .map(|q_vals| q_vals[action.to_index()])
            .unwrap_or(0.0)
    }

    #[allow(dead_code)]
    pub fn episode_count(&self) -> usize {
        *self.episodes.borrow()
    }

    #[allow(dead_code)]
    pub fn total_reward(&self) -> f32 {
        *self.total_reward.borrow()
    }

    #[allow(dead_code)]
    pub fn get_exploration_rate(&self) -> f32 {
        self.exploration_rate
    }
}

impl<S: WorkflowState, A: WorkflowAction> Default for QLearning<S, A> {
    fn default() -> Self {
        Self::new()
    }
}

/// SARSA agent: model-free, on-policy
/// Updates based on actual action taken (S, A, R, S', A')
pub struct SARSAAgent<S: WorkflowState, A: WorkflowAction> {
    q_table: RefCell<HashMap<S, Vec<f32>>>,
    learning_rate: f32,
    discount_factor: f32,
    #[allow(dead_code)]
    exploration_rate: f32,
    _phantom: std::marker::PhantomData<A>,
}

impl<S: WorkflowState, A: WorkflowAction> SARSAAgent<S, A> {
    #[allow(dead_code)]
    pub fn new() -> Self {
        SARSAAgent {
            q_table: RefCell::new(HashMap::new()),
            learning_rate: 0.1,
            discount_factor: 0.99,
            exploration_rate: 1.0,
            _phantom: std::marker::PhantomData,
        }
    }

    /// SARSA update: Q(s,a) <- Q(s,a) + alpha[r + gamma Q(s',a') - Q(s,a)]
    /// Note: Uses next_action instead of max_next_action (on-policy)
    #[allow(dead_code)]
    pub fn update(
        &self,
        state: &S,
        action: &A,
        reward: f32,
        next_state: &S,
        next_action: &A,
    ) {
        let mut q_table = self.q_table.borrow_mut();

        q_table
            .entry(state.clone())
            .or_insert_with(|| vec![0.0; A::ACTION_COUNT]);

        // Get Q(s', a') - the actual next action taken
        let next_q = q_table
            .get(next_state)
            .map(|q_vals| q_vals[next_action.to_index()])
            .unwrap_or(0.0);

        // SARSA update
        let action_idx = action.to_index();
        let current_q = q_table[state][action_idx];
        let target = reward + self.discount_factor * next_q;
        q_table.get_mut(state).unwrap()[action_idx] += self.learning_rate * (target - current_q);
    }

    #[allow(dead_code)]
    pub fn epsilon_greedy_action(&self, state: &S, epsilon: f32) -> A {
        if rand::random::<f32>() < epsilon {
            let idx = rand::random::<usize>() % A::ACTION_COUNT;
            A::from_index(idx).unwrap()
        } else {
            self.greedy_action(state)
        }
    }

    fn greedy_action(&self, state: &S) -> A {
        let q_table = self.q_table.borrow();
        let q_vals = q_table
            .get(state)
            .cloned()
            .unwrap_or_else(|| vec![0.0; A::ACTION_COUNT]);

        let best_idx = q_vals
            .iter()
            .enumerate()
            .max_by(|a, b| a.1.partial_cmp(b.1).unwrap_or(std::cmp::Ordering::Equal))
            .unwrap()
            .0;

        A::from_index(best_idx).unwrap()
    }
}

impl<S: WorkflowState, A: WorkflowAction> Default for SARSAAgent<S, A> {
    fn default() -> Self {
        Self::new()
    }
}

/// Trait for any learning agent
#[allow(dead_code)]
pub trait Agent<S: WorkflowState, A: WorkflowAction> {
    fn select_action(&self, state: &S) -> A;
    fn update(&self, state: &S, action: &A, reward: f32, next_state: &S, done: bool);
}

#[cfg(test)]
mod tests {
    use super::*;

    // Simple test state
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

    // Simple test action
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

    #[test]
    fn test_sarsa_agent_basic() {
        let agent: SARSAAgent<SimpleState, SimpleAction> = SARSAAgent::new();

        let s1 = SimpleState(0);
        let s2 = SimpleState(1);
        let a1 = SimpleAction::Increment;
        let a2 = SimpleAction::Double;

        agent.update(&s1, &a1, 1.0, &s2, &a2);
        // Should complete without error
    }
}
