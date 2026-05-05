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

use fastrand::Rng;

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

    /// Seeded RNG for deterministic behavior (RefCell for &self compatibility)
    rng: RefCell<Rng>,

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
            rng: RefCell::new(Rng::new()),
            _phantom: std::marker::PhantomData,
        }
    }

    /// Create agent with a seeded RNG for deterministic behavior.
    #[allow(dead_code)]
    pub fn new_with_seed(lr: f32, df: f32, seed: u64) -> Self {
        Self {
            q_table: RefCell::new(HashMap::new()),
            learning_rate: lr,
            discount_factor: df,
            exploration_rate: 1.0,
            exploration_decay: 0.995,
            episodes: RefCell::new(0),
            total_reward: RefCell::new(0.0),
            rng: RefCell::new(Rng::with_seed(seed)),
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
        if self.rng.borrow_mut().f32() < self.exploration_rate {
            // Random action
            let idx = self.rng.borrow_mut().usize(..A::ACTION_COUNT);
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
    pub fn update(&self, state: &S, action: &A, reward: f32, next_state: &S, done: bool) {
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

    /// Set exploration rate manually (used by MAPE-K action dispatch).
    pub fn set_exploration_rate(&mut self, rate: f32) {
        self.exploration_rate = rate;
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

// Serialization support for QLearning (to be called only with RlState/RlAction context)
impl QLearning<crate::RlState, crate::RlAction> {
    /// Export Q-table as serialized format for persistence.
    #[allow(dead_code)]
    pub fn export_as_serialized(
        &self,
        agent_type: u8,
    ) -> crate::rl_state_serialization::SerializedAgentQTable {
        use crate::rl_state_serialization::{encode_rl_state_key, SerializedAgentQTable};
        use std::collections::HashMap;

        let q_table = self.q_table.borrow();
        let mut state_values = HashMap::new();

        for (state, q_values) in q_table.iter() {
            let key = encode_rl_state_key(
                state.health_level,
                state.event_rate_q,
                state.activity_count_q,
                state.spc_alert_level,
                state.drift_status,
                state.rework_ratio_q,
                state.circuit_state,
                state.cycle_phase,
            );
            state_values.insert(key, q_values.clone());
        }

        SerializedAgentQTable {
            agent_type,
            state_values,
        }
    }

    /// Restore Q-table from serialized format.
    #[allow(dead_code)]
    pub fn restore_from_serialized(
        &self,
        table: crate::rl_state_serialization::SerializedAgentQTable,
    ) {
        use crate::rl_state_serialization::decode_rl_state_key;

        let mut q_table = self.q_table.borrow_mut();
        q_table.clear();

        for (key, q_values) in table.state_values.into_iter() {
            let (h, e, a, s, d, r, c, p) = decode_rl_state_key(key);
            let state = crate::RlState {
                health_level: h,
                event_rate_q: e,
                activity_count_q: a,
                spc_alert_level: s,
                drift_status: d,
                rework_ratio_q: r,
                circuit_state: c,
                cycle_phase: p,
            };
            q_table.insert(state, q_values);
        }
    }
}

/// SARSA agent: model-free, on-policy
/// Updates based on actual action taken (S, A, R, S', A')
pub struct SARSAAgent<S: WorkflowState, A: WorkflowAction> {
    q_table: RefCell<HashMap<S, Vec<f32>>>,
    learning_rate: f32,
    discount_factor: f32,
    exploration_rate: f32,
    exploration_decay: f32,
    /// Stores the action selected by the most recent select_action call,
    /// bridging the Agent trait's (s,a,r,s',done) signature with SARSA's
    /// on-policy (s,a,r,s',a') signature.
    last_action: RefCell<Option<A>>,
    /// Seeded RNG for deterministic behavior (RefCell for &self compatibility)
    rng: RefCell<Rng>,
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
            exploration_decay: 0.995,
            last_action: RefCell::new(None),
            rng: RefCell::new(Rng::new()),
            _phantom: std::marker::PhantomData,
        }
    }

    /// Create agent with a seeded RNG for deterministic behavior.
    #[allow(dead_code)]
    pub fn new_with_seed(lr: f32, df: f32, seed: u64) -> Self {
        SARSAAgent {
            q_table: RefCell::new(HashMap::new()),
            learning_rate: lr,
            discount_factor: df,
            exploration_rate: 1.0,
            exploration_decay: 0.995,
            last_action: RefCell::new(None),
            rng: RefCell::new(Rng::with_seed(seed)),
            _phantom: std::marker::PhantomData,
        }
    }

    /// SARSA update: Q(s,a) <- Q(s,a) + alpha[r + gamma Q(s',a') - Q(s,a)]
    /// Note: Uses next_action instead of max_next_action (on-policy)
    #[allow(dead_code)]
    pub fn update(&self, state: &S, action: &A, reward: f32, next_state: &S, next_action: &A) {
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
        if self.rng.borrow_mut().f32() < epsilon {
            let idx = self.rng.borrow_mut().usize(..A::ACTION_COUNT);
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

    #[allow(dead_code)]
    pub fn decay_exploration(&mut self) {
        self.exploration_rate *= self.exploration_decay;
    }

    /// Set exploration rate manually (used by MAPE-K action dispatch).
    pub fn set_exploration_rate(&mut self, rate: f32) {
        self.exploration_rate = rate;
    }

    #[allow(dead_code)]
    pub fn get_exploration_rate(&self) -> f32 {
        self.exploration_rate
    }
}

impl<S: WorkflowState, A: WorkflowAction> Default for SARSAAgent<S, A> {
    fn default() -> Self {
        Self::new()
    }
}

// Serialization support for SARSAAgent
impl SARSAAgent<crate::RlState, crate::RlAction> {
    /// Export Q-table as serialized format for persistence.
    #[allow(dead_code)]
    pub fn export_as_serialized(
        &self,
        agent_type: u8,
    ) -> crate::rl_state_serialization::SerializedAgentQTable {
        use crate::rl_state_serialization::{encode_rl_state_key, SerializedAgentQTable};
        use std::collections::HashMap;

        let q_table = self.q_table.borrow();
        let mut state_values = HashMap::new();

        for (state, q_values) in q_table.iter() {
            let key = encode_rl_state_key(
                state.health_level,
                state.event_rate_q,
                state.activity_count_q,
                state.spc_alert_level,
                state.drift_status,
                state.rework_ratio_q,
                state.circuit_state,
                state.cycle_phase,
            );
            state_values.insert(key, q_values.clone());
        }

        SerializedAgentQTable {
            agent_type,
            state_values,
        }
    }

    /// Restore Q-table from serialized format.
    #[allow(dead_code)]
    pub fn restore_from_serialized(
        &self,
        table: crate::rl_state_serialization::SerializedAgentQTable,
    ) {
        use crate::rl_state_serialization::decode_rl_state_key;

        let mut q_table = self.q_table.borrow_mut();
        q_table.clear();

        for (key, q_values) in table.state_values.into_iter() {
            let (h, e, a, s, d, r, c, p) = decode_rl_state_key(key);
            let state = crate::RlState {
                health_level: h,
                event_rate_q: e,
                activity_count_q: a,
                spc_alert_level: s,
                drift_status: d,
                rework_ratio_q: r,
                circuit_state: c,
                cycle_phase: p,
            };
            q_table.insert(state, q_values);
        }
    }
}

// ---------------------------------------------------------------------------
// Double Q-Learning: decouples action selection from evaluation
// ---------------------------------------------------------------------------

/// Double Q-Learning agent: reduces maximization bias by maintaining two Q-tables
///
/// Algorithm:
///   For each update, randomly pick Q1 or Q2 to select the greedy action,
///   then use the OTHER table to evaluate that action's value.
///   This breaks the "max" operator's optimistic bias.
pub struct DoubleQLearning<S: WorkflowState, A: WorkflowAction> {
    q_a: RefCell<HashMap<S, Vec<f32>>>,
    q_b: RefCell<HashMap<S, Vec<f32>>>,
    learning_rate: f32,
    discount_factor: f32,
    exploration_rate: f32,
    exploration_decay: f32,
    /// Seeded RNG for deterministic behavior (RefCell for &self compatibility)
    rng: RefCell<Rng>,
    _phantom: std::marker::PhantomData<A>,
}

impl<S: WorkflowState, A: WorkflowAction> DoubleQLearning<S, A> {
    #[allow(dead_code)]
    pub fn new() -> Self {
        Self {
            q_a: RefCell::new(HashMap::new()),
            q_b: RefCell::new(HashMap::new()),
            learning_rate: 0.1,
            discount_factor: 0.99,
            exploration_rate: 1.0,
            exploration_decay: 0.995,
            rng: RefCell::new(Rng::new()),
            _phantom: std::marker::PhantomData,
        }
    }

    /// Create agent with a seeded RNG for deterministic behavior.
    #[allow(dead_code)]
    pub fn new_with_seed(lr: f32, df: f32, seed: u64) -> Self {
        Self {
            q_a: RefCell::new(HashMap::new()),
            q_b: RefCell::new(HashMap::new()),
            learning_rate: lr,
            discount_factor: df,
            exploration_rate: 1.0,
            exploration_decay: 0.995,
            rng: RefCell::new(Rng::with_seed(seed)),
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

    /// epsilon-greedy action selection (uses combined Q-values)
    #[allow(dead_code)]
    pub fn select_action(&self, state: &S) -> A {
        if self.rng.borrow_mut().f32() < self.exploration_rate {
            let idx = self.rng.borrow_mut().usize(..A::ACTION_COUNT);
            A::from_index(idx).unwrap()
        } else {
            self.greedy_action(state)
        }
    }

    /// Greedy action using average of both Q-tables
    fn greedy_action(&self, state: &S) -> A {
        let qa = self.q_a.borrow();
        let qb = self.q_b.borrow();
        let va = qa
            .get(state)
            .cloned()
            .unwrap_or_else(|| vec![0.0; A::ACTION_COUNT]);
        let vb = qb
            .get(state)
            .cloned()
            .unwrap_or_else(|| vec![0.0; A::ACTION_COUNT]);

        let best_idx = va
            .iter()
            .zip(vb.iter())
            .enumerate()
            .max_by(|a, b| {
                (a.1 .0 + a.1 .1)
                    .partial_cmp(&(b.1 .0 + b.1 .1))
                    .unwrap_or(std::cmp::Ordering::Equal)
            })
            .unwrap()
            .0;

        A::from_index(best_idx).unwrap()
    }

    /// Double Q-Learning update
    ///
    /// With 50% probability:
    ///   Use Q_a to select best next action, Q_b to evaluate it
    /// Otherwise:
    ///   Use Q_b to select best next action, Q_a to evaluate it
    #[allow(dead_code)]
    pub fn update(&self, state: &S, action: &A, reward: f32, next_state: &S, done: bool) {
        let mut qa = self.q_a.borrow_mut();
        let mut qb = self.q_b.borrow_mut();

        qa.entry(state.clone())
            .or_insert_with(|| vec![0.0; A::ACTION_COUNT]);
        qb.entry(state.clone())
            .or_insert_with(|| vec![0.0; A::ACTION_COUNT]);

        let action_idx = action.to_index();

        if self.rng.borrow_mut().bool() {
            // Update Q_a: use Q_a to select action, Q_b to evaluate
            let best_next_idx = qa
                .get(next_state)
                .map(|vals| {
                    vals.iter()
                        .enumerate()
                        .max_by(|a, b| a.1.partial_cmp(b.1).unwrap_or(std::cmp::Ordering::Equal))
                        .unwrap()
                        .0
                })
                .unwrap_or(0);

            let next_q = qb
                .get(next_state)
                .map(|vals| vals[best_next_idx])
                .unwrap_or(0.0);

            let target = reward + self.discount_factor * if done { 0.0 } else { next_q };
            let current = qa[state][action_idx];
            qa.get_mut(state).unwrap()[action_idx] += self.learning_rate * (target - current);
        } else {
            // Update Q_b: use Q_b to select action, Q_a to evaluate
            let best_next_idx = qb
                .get(next_state)
                .map(|vals| {
                    vals.iter()
                        .enumerate()
                        .max_by(|a, b| a.1.partial_cmp(b.1).unwrap_or(std::cmp::Ordering::Equal))
                        .unwrap()
                        .0
                })
                .unwrap_or(0);

            let next_q = qa
                .get(next_state)
                .map(|vals| vals[best_next_idx])
                .unwrap_or(0.0);

            let target = reward + self.discount_factor * if done { 0.0 } else { next_q };
            let current = qb[state][action_idx];
            qb.get_mut(state).unwrap()[action_idx] += self.learning_rate * (target - current);
        }
    }

    #[allow(dead_code)]
    pub fn decay_exploration(&mut self) {
        self.exploration_rate *= self.exploration_decay;
    }

    /// Set exploration rate manually (used by MAPE-K action dispatch).
    pub fn set_exploration_rate(&mut self, rate: f32) {
        self.exploration_rate = rate;
    }

    #[allow(dead_code)]
    pub fn get_exploration_rate(&self) -> f32 {
        self.exploration_rate
    }
}

impl<S: WorkflowState, A: WorkflowAction> Default for DoubleQLearning<S, A> {
    fn default() -> Self {
        Self::new()
    }
}

// Serialization support for DoubleQLearning
impl DoubleQLearning<crate::RlState, crate::RlAction> {
    /// Export Q-tables as serialized format for persistence (uses merged Q_A + Q_B).
    #[allow(dead_code)]
    pub fn export_as_serialized(
        &self,
        agent_type: u8,
    ) -> crate::rl_state_serialization::SerializedAgentQTable {
        use crate::rl_state_serialization::{encode_rl_state_key, SerializedAgentQTable};
        use std::collections::HashMap;

        let qa = self.q_a.borrow();
        let _qb = self.q_b.borrow();
        let mut state_values = HashMap::new();

        // Export Q_A; Q_B will be stored by RL orchestrator as separate entry
        for (state, q_values) in qa.iter() {
            let key = encode_rl_state_key(
                state.health_level,
                state.event_rate_q,
                state.activity_count_q,
                state.spc_alert_level,
                state.drift_status,
                state.rework_ratio_q,
                state.circuit_state,
                state.cycle_phase,
            );
            state_values.insert(key, q_values.clone());
        }

        SerializedAgentQTable {
            agent_type,
            state_values,
        }
    }

    /// Restore Q-table from serialized format.
    #[allow(dead_code)]
    pub fn restore_from_serialized(
        &self,
        table: crate::rl_state_serialization::SerializedAgentQTable,
    ) {
        use crate::rl_state_serialization::decode_rl_state_key;

        let mut qa = self.q_a.borrow_mut();
        qa.clear();

        for (key, q_values) in table.state_values.into_iter() {
            let (h, e, a, s, d, r, c, p) = decode_rl_state_key(key);
            let state = crate::RlState {
                health_level: h,
                event_rate_q: e,
                activity_count_q: a,
                spc_alert_level: s,
                drift_status: d,
                rework_ratio_q: r,
                circuit_state: c,
                cycle_phase: p,
            };
            qa.insert(state, q_values);
        }
    }
}

// ---------------------------------------------------------------------------
// Expected SARSA: uses expected Q-value instead of sampled next action
// ---------------------------------------------------------------------------

/// Expected SARSA agent: model-free, on-policy with full expectation
///
/// Instead of using the actual next action (SARSA) or the max action (Q-Learning),
/// Expected SARSA uses the expected value over all actions weighted by their
/// selection probability under the current policy. This reduces variance.
pub struct ExpectedSARSAAgent<S: WorkflowState, A: WorkflowAction> {
    q_table: RefCell<HashMap<S, Vec<f32>>>,
    learning_rate: f32,
    discount_factor: f32,
    exploration_rate: f32,
    exploration_decay: f32,
    /// Seeded RNG for deterministic behavior (RefCell for &self compatibility)
    rng: RefCell<Rng>,
    _phantom: std::marker::PhantomData<A>,
}

impl<S: WorkflowState, A: WorkflowAction> ExpectedSARSAAgent<S, A> {
    #[allow(dead_code)]
    pub fn new() -> Self {
        Self {
            q_table: RefCell::new(HashMap::new()),
            learning_rate: 0.1,
            discount_factor: 0.99,
            exploration_rate: 1.0,
            exploration_decay: 0.995,
            rng: RefCell::new(Rng::new()),
            _phantom: std::marker::PhantomData,
        }
    }

    /// Create agent with a seeded RNG for deterministic behavior.
    #[allow(dead_code)]
    pub fn new_with_seed(lr: f32, df: f32, seed: u64) -> Self {
        Self {
            q_table: RefCell::new(HashMap::new()),
            learning_rate: lr,
            discount_factor: df,
            exploration_rate: 1.0,
            exploration_decay: 0.995,
            rng: RefCell::new(Rng::with_seed(seed)),
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
        if self.rng.borrow_mut().f32() < self.exploration_rate {
            let idx = self.rng.borrow_mut().usize(..A::ACTION_COUNT);
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

    /// Expected SARSA update: Q(s,a) <- Q(s,a) + alpha[r + gamma * E[Q(s',.)] - Q(s,a)]
    #[allow(dead_code)]
    pub fn update(&self, state: &S, action: &A, reward: f32, next_state: &S, done: bool) {
        // Compute expected Q-value BEFORE taking mutable borrow
        let expected_next = if done {
            0.0
        } else {
            // Inline computation to avoid RefCell double-borrow
            let q_table = self.q_table.borrow();
            let q_vals = q_table
                .get(next_state)
                .cloned()
                .unwrap_or_else(|| vec![0.0; A::ACTION_COUNT]);
            // Drop immutable borrow before computing
            drop(q_table);

            let max_q = q_vals.iter().cloned().fold(f32::NEG_INFINITY, f32::max);
            let sum_q: f32 = q_vals.iter().cloned().sum();
            let n = A::ACTION_COUNT as f32;
            let eps = self.exploration_rate;
            (1.0 - eps) * max_q + (eps / n) * sum_q
        };

        let mut q_table = self.q_table.borrow_mut();

        q_table
            .entry(state.clone())
            .or_insert_with(|| vec![0.0; A::ACTION_COUNT]);

        let action_idx = action.to_index();
        let current_q = q_table[state][action_idx];
        let target = reward + self.discount_factor * expected_next;
        q_table.get_mut(state).unwrap()[action_idx] += self.learning_rate * (target - current_q);
    }

    #[allow(dead_code)]
    pub fn decay_exploration(&mut self) {
        self.exploration_rate *= self.exploration_decay;
    }

    /// Set exploration rate manually (used by MAPE-K action dispatch).
    pub fn set_exploration_rate(&mut self, rate: f32) {
        self.exploration_rate = rate;
    }

    #[allow(dead_code)]
    pub fn get_exploration_rate(&self) -> f32 {
        self.exploration_rate
    }
}

// Serialization support for ExpectedSARSAAgent
impl ExpectedSARSAAgent<crate::RlState, crate::RlAction> {
    /// Export Q-table as serialized format for persistence.
    #[allow(dead_code)]
    pub fn export_as_serialized(
        &self,
        agent_type: u8,
    ) -> crate::rl_state_serialization::SerializedAgentQTable {
        use crate::rl_state_serialization::{encode_rl_state_key, SerializedAgentQTable};
        use std::collections::HashMap;

        let q_table = self.q_table.borrow();
        let mut state_values = HashMap::new();

        for (state, q_values) in q_table.iter() {
            let key = encode_rl_state_key(
                state.health_level,
                state.event_rate_q,
                state.activity_count_q,
                state.spc_alert_level,
                state.drift_status,
                state.rework_ratio_q,
                state.circuit_state,
                state.cycle_phase,
            );
            state_values.insert(key, q_values.clone());
        }

        SerializedAgentQTable {
            agent_type,
            state_values,
        }
    }

    /// Restore Q-table from serialized format.
    #[allow(dead_code)]
    pub fn restore_from_serialized(
        &self,
        table: crate::rl_state_serialization::SerializedAgentQTable,
    ) {
        use crate::rl_state_serialization::decode_rl_state_key;

        let mut q_table = self.q_table.borrow_mut();
        q_table.clear();

        for (key, q_values) in table.state_values.into_iter() {
            let (h, e, a, s, d, r, c, p) = decode_rl_state_key(key);
            let state = crate::RlState {
                health_level: h,
                event_rate_q: e,
                activity_count_q: a,
                spc_alert_level: s,
                drift_status: d,
                rework_ratio_q: r,
                circuit_state: c,
                cycle_phase: p,
            };
            q_table.insert(state, q_values);
        }
    }
}

impl<S: WorkflowState, A: WorkflowAction> Default for ExpectedSARSAAgent<S, A> {
    fn default() -> Self {
        Self::new()
    }
}

// ---------------------------------------------------------------------------
// REINFORCE (Monte Carlo Policy Gradient)
// ---------------------------------------------------------------------------

/// REINFORCE agent: Monte Carlo policy gradient without baseline
///
/// Learns a stochastic policy directly (no value function).
/// Collects a full episode trajectory, then updates policy weights
/// using the return G_t for each state-action pair visited.
///
/// Policy: pi(a|s) = softmax(theta_s . a)
/// Update: theta += alpha * G_t * grad log pi(a|s)
pub struct ReinforceAgent<S: WorkflowState, A: WorkflowAction> {
    /// Policy weights: theta[state][action]
    theta: RefCell<HashMap<S, Vec<f32>>>,
    learning_rate: f32,
    discount_factor: f32,
    /// Seeded RNG for deterministic behavior (RefCell for &self compatibility)
    rng: RefCell<Rng>,
    _phantom: std::marker::PhantomData<A>,
}

impl<S: WorkflowState, A: WorkflowAction> ReinforceAgent<S, A> {
    #[allow(dead_code)]
    pub fn new() -> Self {
        Self {
            theta: RefCell::new(HashMap::new()),
            learning_rate: 0.01,
            discount_factor: 0.99,
            rng: RefCell::new(Rng::new()),
            _phantom: std::marker::PhantomData,
        }
    }

    /// Create agent with a seeded RNG for deterministic behavior.
    #[allow(dead_code)]
    pub fn new_with_seed(lr: f32, df: f32, seed: u64) -> Self {
        Self {
            theta: RefCell::new(HashMap::new()),
            learning_rate: lr,
            discount_factor: df,
            rng: RefCell::new(Rng::with_seed(seed)),
            _phantom: std::marker::PhantomData,
        }
    }

    #[allow(dead_code)]
    pub fn with_hyperparams(lr: f32, df: f32) -> Self {
        let mut agent = Self::new();
        agent.learning_rate = lr;
        agent.discount_factor = df;
        agent
    }

    /// Select action using softmax policy: pi(a|s) = exp(theta[s][a]) / Z
    #[allow(dead_code)]
    pub fn select_action(&self, state: &S) -> A {
        let theta = self.theta.borrow();
        let weights = theta
            .get(state)
            .cloned()
            .unwrap_or_else(|| vec![0.0; A::ACTION_COUNT]);

        // Softmax sampling (Gumbel-max trick for numerical stability)
        let mut best_idx = 0;
        let mut best_val = f32::NEG_INFINITY;
        for (i, &w) in weights.iter().enumerate() {
            // Gumbel noise: -ln(-ln(u))
            let u = self.rng.borrow_mut().f32().clamp(1e-6, 1.0 - 1e-6);
            let gumbel = -(-u.ln()).ln();
            let val = w + gumbel;
            if val > best_val {
                best_val = val;
                best_idx = i;
            }
        }
        A::from_index(best_idx).unwrap()
    }

    /// Update policy weights from a complete episode trajectory
    ///
    /// trajectory: [(state, action, reward), ...]
    /// Uses discounted returns G_t = sum_{k=0}^{T-t} gamma^k * r_{t+k}
    #[allow(dead_code)]
    pub fn update_from_trajectory(&self, trajectory: &[(S, A, f32)]) {
        let n = trajectory.len();
        if n == 0 {
            return;
        }

        // Compute discounted returns G_t for each timestep
        let mut returns: Vec<f32> = vec![0.0; n];
        let mut g = 0.0;
        for i in (0..n).rev() {
            g = trajectory[i].2 + self.discount_factor * g;
            returns[i] = g;
        }

        let mut theta = self.theta.borrow_mut();

        // Update each state-action pair
        for (t, (state, action, _reward)) in trajectory.iter().enumerate() {
            // Initialize weights if needed
            theta
                .entry(state.clone())
                .or_insert_with(|| vec![0.0; A::ACTION_COUNT]);

            let weights = theta.get_mut(state).unwrap();
            let action_idx = action.to_index();

            // Compute log softmax and gradient
            // log pi(a|s) = theta[a] - log(sum exp(theta[*]))
            let max_w = weights.iter().cloned().fold(f32::NEG_INFINITY, f32::max);
            let log_z: f32 = max_w + weights.iter().map(|&w| (w - max_w).exp()).sum::<f32>().ln();

            // Gradient: d/d(theta[a]) log pi(a|s) = 1 - softmax(theta[a])
            // For other actions j != a: d/d(theta[j]) = -softmax(theta[j])
            let g_t = returns[t];
            for (j, w) in weights.iter_mut().enumerate() {
                let softmax = (*w - max_w).exp() / (log_z - max_w).exp();
                if j == action_idx {
                    *w += self.learning_rate * g_t * (1.0 - softmax);
                } else {
                    *w -= self.learning_rate * g_t * softmax;
                }
            }
        }
    }

    /// Convenience: update from single step (online approximation)
    /// Treats each (s, a, r) as a 1-step episode with return = r
    #[allow(dead_code)]
    pub fn update_step(&self, state: &S, action: &A, reward: f32) {
        self.update_from_trajectory(&[(state.clone(), action.clone(), reward)]);
    }

    #[allow(dead_code)]
    pub fn get_policy_weights(&self, state: &S) -> Vec<f32> {
        let theta = self.theta.borrow();
        theta
            .get(state)
            .cloned()
            .unwrap_or_else(|| vec![0.0; A::ACTION_COUNT])
    }

    /// Set exploration rate manually (REINFORCE is on-policy, so this is a no-op).
    pub fn set_exploration_rate(&mut self, _rate: f32) {
        // REINFORCE doesn't use epsilon-greedy exploration
    }
}

// Serialization support for ReinforceAgent
impl ReinforceAgent<crate::RlState, crate::RlAction> {
    /// Export policy weights (theta) as serialized format for persistence.
    #[allow(dead_code)]
    pub fn export_as_serialized(
        &self,
        agent_type: u8,
    ) -> crate::rl_state_serialization::SerializedAgentQTable {
        use crate::rl_state_serialization::{encode_rl_state_key, SerializedAgentQTable};
        use std::collections::HashMap;

        let theta = self.theta.borrow();
        let mut state_values = HashMap::new();

        for (state, weights) in theta.iter() {
            let key = encode_rl_state_key(
                state.health_level,
                state.event_rate_q,
                state.activity_count_q,
                state.spc_alert_level,
                state.drift_status,
                state.rework_ratio_q,
                state.circuit_state,
                state.cycle_phase,
            );
            state_values.insert(key, weights.clone());
        }

        SerializedAgentQTable {
            agent_type,
            state_values,
        }
    }

    /// Restore policy weights (theta) from serialized format.
    #[allow(dead_code)]
    pub fn restore_from_serialized(
        &self,
        table: crate::rl_state_serialization::SerializedAgentQTable,
    ) {
        use crate::rl_state_serialization::decode_rl_state_key;

        let mut theta = self.theta.borrow_mut();
        theta.clear();

        for (key, weights) in table.state_values.into_iter() {
            let (h, e, a, s, d, r, c, p) = decode_rl_state_key(key);
            let state = crate::RlState {
                health_level: h,
                event_rate_q: e,
                activity_count_q: a,
                spc_alert_level: s,
                drift_status: d,
                rework_ratio_q: r,
                circuit_state: c,
                cycle_phase: p,
            };
            theta.insert(state, weights);
        }
    }
}

impl<S: WorkflowState, A: WorkflowAction> Default for ReinforceAgent<S, A> {
    fn default() -> Self {
        Self::new()
    }
}

/// Trait for any learning agent
pub trait Agent<S: WorkflowState, A: WorkflowAction> {
    fn select_action(&self, state: &S) -> A;
    fn update(&self, state: &S, action: &A, reward: f32, next_state: &S, done: bool);
}

/// Metadata trait for agent introspection
pub trait AgentMeta {
    fn name(&self) -> &'static str;
    fn exploration_rate(&self) -> f32;
    fn decay_exploration(&mut self);
}

// ---------------------------------------------------------------------------
// Agent trait implementations
// ---------------------------------------------------------------------------

impl<S: WorkflowState, A: WorkflowAction> Agent<S, A> for QLearning<S, A> {
    fn select_action(&self, state: &S) -> A {
        QLearning::select_action(self, state)
    }
    fn update(&self, state: &S, action: &A, reward: f32, next_state: &S, done: bool) {
        QLearning::update(self, state, action, reward, next_state, done)
    }
}

impl<S: WorkflowState, A: WorkflowAction> AgentMeta for QLearning<S, A> {
    fn name(&self) -> &'static str {
        "QLearning"
    }
    fn exploration_rate(&self) -> f32 {
        self.exploration_rate
    }
    fn decay_exploration(&mut self) {
        self.exploration_rate *= self.exploration_decay;
    }
}

impl<S: WorkflowState, A: WorkflowAction> Agent<S, A> for SARSAAgent<S, A> {
    fn select_action(&self, state: &S) -> A {
        let action = self.epsilon_greedy_action(state, self.exploration_rate);
        *self.last_action.borrow_mut() = Some(action.clone());
        action
    }
    fn update(&self, state: &S, action: &A, reward: f32, next_state: &S, done: bool) {
        if done {
            // Terminal: use standard Q-update with zero future value
            // (on-policy cannot observe next action at terminal state)
            let mut q_table = self.q_table.borrow_mut();
            q_table
                .entry(state.clone())
                .or_insert_with(|| vec![0.0; A::ACTION_COUNT]);
            let action_idx = action.to_index();
            let current_q = q_table[state][action_idx];
            let target = reward; // no future value at terminal
            q_table.get_mut(state).unwrap()[action_idx] +=
                self.learning_rate * (target - current_q);
        } else {
            // On-policy: use the stored next action from the last select_action call
            let next_action = self
                .last_action
                .borrow()
                .clone()
                .unwrap_or_else(|| self.greedy_action(next_state));
            SARSAAgent::update(self, state, action, reward, next_state, &next_action);
        }
    }
}

impl<S: WorkflowState, A: WorkflowAction> AgentMeta for SARSAAgent<S, A> {
    fn name(&self) -> &'static str {
        "SARSA"
    }
    fn exploration_rate(&self) -> f32 {
        self.exploration_rate
    }
    fn decay_exploration(&mut self) {
        self.exploration_rate *= self.exploration_decay;
    }
}

impl<S: WorkflowState, A: WorkflowAction> Agent<S, A> for DoubleQLearning<S, A> {
    fn select_action(&self, state: &S) -> A {
        DoubleQLearning::select_action(self, state)
    }
    fn update(&self, state: &S, action: &A, reward: f32, next_state: &S, done: bool) {
        DoubleQLearning::update(self, state, action, reward, next_state, done)
    }
}

impl<S: WorkflowState, A: WorkflowAction> AgentMeta for DoubleQLearning<S, A> {
    fn name(&self) -> &'static str {
        "DoubleQLearning"
    }
    fn exploration_rate(&self) -> f32 {
        self.exploration_rate
    }
    fn decay_exploration(&mut self) {
        self.exploration_rate *= self.exploration_decay;
    }
}

impl<S: WorkflowState, A: WorkflowAction> Agent<S, A> for ExpectedSARSAAgent<S, A> {
    fn select_action(&self, state: &S) -> A {
        ExpectedSARSAAgent::select_action(self, state)
    }
    fn update(&self, state: &S, action: &A, reward: f32, next_state: &S, done: bool) {
        ExpectedSARSAAgent::update(self, state, action, reward, next_state, done)
    }
}

impl<S: WorkflowState, A: WorkflowAction> AgentMeta for ExpectedSARSAAgent<S, A> {
    fn name(&self) -> &'static str {
        "ExpectedSARSA"
    }
    fn exploration_rate(&self) -> f32 {
        self.exploration_rate
    }
    fn decay_exploration(&mut self) {
        self.exploration_rate *= self.exploration_decay;
    }
}

impl<S: WorkflowState, A: WorkflowAction> Agent<S, A> for ReinforceAgent<S, A> {
    fn select_action(&self, state: &S) -> A {
        ReinforceAgent::select_action(self, state)
    }
    fn update(&self, state: &S, action: &A, reward: f32, _next_state: &S, _done: bool) {
        // REINFORCE ignores next_state and done in online mode.
        // Uses the immediate reward as the 1-step return.
        self.update_step(state, action, reward);
    }
}

impl<S: WorkflowState, A: WorkflowAction> AgentMeta for ReinforceAgent<S, A> {
    fn name(&self) -> &'static str {
        "REINFORCE"
    }
    fn exploration_rate(&self) -> f32 {
        0.0 // Softmax has inherent exploration
    }
    fn decay_exploration(&mut self) {
        // No-op for policy gradient
    }
}

// Tests consolidated in tests/reinforcement_tests.rs
