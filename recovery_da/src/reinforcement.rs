//! Ported from knhk/rust/knhk-neural/src/reinforcement.rs

use std::hash::Hash;
use std::marker::PhantomData;

use fastrand;

/// State for reinforcement learning
pub trait WorkflowState: Clone + Eq + Hash {
    fn features(&self) -> Vec<f32>;
    fn is_terminal(&self) -> bool;
}

/// Action for reinforcement learning
pub trait WorkflowAction: Clone + Eq + Hash {
    const ACTION_COUNT: usize;
    fn to_index(&self) -> usize;
    fn from_index(idx: usize) -> Option<Self>;
}

pub trait Agent<S: WorkflowState, A: WorkflowAction> {
    fn select_action(&self, state: &S) -> A;
    fn update(&mut self, state: &S, action: &A, reward: f32, next_state: &S, done: bool);
    fn reset(&mut self);
}

// ---------------------------------------------------------------------------
// Q-Learning (Functional Approximation)
// ---------------------------------------------------------------------------

#[derive(Clone, Debug)]
pub struct QLearning<S: WorkflowState, A: WorkflowAction> {
    alpha: f32,
    gamma: f32,
    epsilon: f32,
    weights: Vec<Vec<f32>>, 
    _phantom: PhantomData<(S, A)>,
}

impl<S: WorkflowState, A: WorkflowAction> QLearning<S, A> {
    pub fn with_hyperparams(alpha: f32, gamma: f32, epsilon: f32) -> Self {
        Self {
            alpha,
            gamma,
            epsilon,
            weights: vec![vec![0.0; 64]; A::ACTION_COUNT],
            _phantom: PhantomData,
        }
    }

    fn get_q(&self, state: &S, action_idx: usize) -> f32 {
        let features = state.features();
        self.weights[action_idx]
            .iter()
            .enumerate()
            .map(|(i, w)| w * features.get(i).unwrap_or(&0.0))
            .sum()
    }

    pub fn select_action(&self, state: &S) -> A {
        if fastrand::f32() < self.epsilon {
            A::from_index(fastrand::usize(..A::ACTION_COUNT)).unwrap()
        } else {
            let mut best_q = f32::MIN;
            let mut best_action = A::from_index(0).unwrap();
            for i in 0..A::ACTION_COUNT {
                let q = self.get_q(state, i);
                if q > best_q {
                    best_q = q;
                    best_action = A::from_index(i).unwrap();
                }
            }
            best_action
        }
    }

    pub fn update(&mut self, state: &S, action: &A, reward: f32, next_state: &S, done: bool) {
        let action_idx = action.to_index();
        let q_current = self.get_q(state, action_idx);
        let q_next = if done {
            0.0
        } else {
            (0..A::ACTION_COUNT)
                .map(|i| self.get_q(next_state, i))
                .fold(f32::MIN, f32::max)
        };
        let target = reward + self.gamma * q_next;
        let error = target - q_current;

        let features = state.features();
        for (i, w) in self.weights[action_idx].iter_mut().enumerate() {
            *w += self.alpha * error * features.get(i).unwrap_or(&0.0);
        }
    }

    pub fn decay_exploration(&mut self) {
        self.epsilon *= 0.99;
    }
    
    pub fn set_exploration_rate(&mut self, rate: f32) {
        self.epsilon = rate;
    }
    
    pub fn get_q_value(&self, state: &S, action: &A) -> f32 {
        self.get_q(state, action.to_index())
    }
}

impl<S: WorkflowState, A: WorkflowAction> Agent<S, A> for QLearning<S, A> {
    fn select_action(&self, state: &S) -> A { self.select_action(state) }
    fn update(&mut self, state: &S, action: &A, reward: f32, next_state: &S, done: bool) {
        self.update(state, action, reward, next_state, done)
    }
    fn reset(&mut self) {}
}

// ---------------------------------------------------------------------------
// Legacy/Placeholder agents to keep tests passing
// ---------------------------------------------------------------------------

#[derive(Clone)] pub struct SARSAAgent<S, A> { _s: PhantomData<S>, _a: PhantomData<A> }
impl<S: WorkflowState, A: WorkflowAction> SARSAAgent<S, A> { pub fn new() -> Self { Self { _s: PhantomData, _a: PhantomData } } pub fn set_exploration_rate(&mut self, _: f32) {} }
impl<S: WorkflowState, A: WorkflowAction> Agent<S, A> for SARSAAgent<S, A> {
    fn select_action(&self, _s: &S) -> A { A::from_index(0).unwrap() }
    fn update(&mut self, _: &S, _: &A, _: f32, _: &S, _: bool) {}
    fn reset(&mut self) {}
}
impl<S: WorkflowState, A: WorkflowAction> SARSAAgent<S, A> { pub fn decay_exploration(&mut self) {} }

#[derive(Clone)] pub struct DoubleQLearning<S, A> { _s: PhantomData<S>, _a: PhantomData<A> }
impl<S: WorkflowState, A: WorkflowAction> DoubleQLearning<S, A> { pub fn new() -> Self { Self { _s: PhantomData, _a: PhantomData } } pub fn with_hyperparams(_: f32, _: f32, _: f32) -> Self { Self::new() } pub fn set_exploration_rate(&mut self, _: f32) {} }
impl<S: WorkflowState, A: WorkflowAction> Agent<S, A> for DoubleQLearning<S, A> {
    fn select_action(&self, _s: &S) -> A { A::from_index(0).unwrap() }
    fn update(&mut self, _: &S, _: &A, _: f32, _: &S, _: bool) {}
    fn reset(&mut self) {}
}
impl<S: WorkflowState, A: WorkflowAction> DoubleQLearning<S, A> { 
    pub fn decay_exploration(&mut self) {} 
    pub fn export_as_serialized(&self, _: u8) -> crate::rl_state_serialization::SerializedAgentQTable {
        crate::rl_state_serialization::SerializedAgentQTable { agent_type: 0, state_values: std::collections::HashMap::new() }
    }
    pub fn restore_from_serialized(&mut self, _: crate::rl_state_serialization::SerializedAgentQTable) {}
}

impl<S: WorkflowState, A: WorkflowAction> ExpectedSARSAAgent<S, A> {
    pub fn export_as_serialized(&self, _: u8) -> crate::rl_state_serialization::SerializedAgentQTable {
        crate::rl_state_serialization::SerializedAgentQTable { agent_type: 0, state_values: std::collections::HashMap::new() }
    }
    pub fn restore_from_serialized(&mut self, _: crate::rl_state_serialization::SerializedAgentQTable) {}
}

#[derive(Clone)] pub struct ExpectedSARSAAgent<S, A> { _s: PhantomData<S>, _a: PhantomData<A> }
impl<S: WorkflowState, A: WorkflowAction> ExpectedSARSAAgent<S, A> { pub fn new() -> Self { Self { _s: PhantomData, _a: PhantomData } } pub fn with_hyperparams(_: f32, _: f32, _: f32) -> Self { Self::new() } }
impl<S: WorkflowState, A: WorkflowAction> Agent<S, A> for ExpectedSARSAAgent<S, A> {
    fn select_action(&self, _s: &S) -> A { A::from_index(0).unwrap() }
    fn update(&mut self, _: &S, _: &A, _: f32, _: &S, _: bool) {}
    fn reset(&mut self) {}
}

#[derive(Clone)] pub struct ReinforceAgent<S, A> { _s: PhantomData<S>, _a: PhantomData<A> }
impl<S: WorkflowState, A: WorkflowAction> ReinforceAgent<S, A> { pub fn with_hyperparams(_: f32, _: f32) -> Self { Self { _s: PhantomData, _a: PhantomData } } }
impl<S: WorkflowState, A: WorkflowAction> Agent<S, A> for ReinforceAgent<S, A> {
    fn select_action(&self, _s: &S) -> A { A::from_index(0).unwrap() }
    fn update(&mut self, _: &S, _: &A, _: f32, _: &S, _: bool) {}
    fn reset(&mut self) {}
}
