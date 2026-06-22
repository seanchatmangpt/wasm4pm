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
use tracing::{debug, span, Level};

// ---------------------------------------------------------------------------
// Internal helpers (alloc-free hot-path utilities)
// ---------------------------------------------------------------------------

/// Argmax over a slice of f32 values, NaN-safe (treats NaN as less-than).
/// Returns 0 on empty slice (caller is expected to guarantee non-empty).
#[inline]
fn argmax_f32(values: &[f32]) -> usize {
    let mut best_idx = 0;
    let mut best_val = f32::NEG_INFINITY;
    for (i, &v) in values.iter().enumerate() {
        if v > best_val {
            best_val = v;
            best_idx = i;
        }
    }
    best_idx
}

/// Max value in slice, returning 0.0 for an empty slice. Used for `max_a' Q(s',a')`
/// when the next state has not yet been visited (Q is initialised to zero).
#[inline]
fn max_f32_or_zero(values: &[f32]) -> f32 {
    let m = values.iter().copied().fold(f32::NEG_INFINITY, f32::max);
    if m == f32::NEG_INFINITY {
        0.0
    } else {
        m
    }
}

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
    #[must_use]
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
        let span = span!(
            Level::DEBUG,
            "autonomic.rl.action_selection",
            epsilon = self.exploration_rate,
            algorithm = "q_learning"
        );
        let _guard = span.enter();

        // Explore with probability epsilon
        let rand_val = self.rng.borrow_mut().f32();
        let is_exploration = rand_val < self.exploration_rate;

        let selected_action = if is_exploration {
            // Random action
            let idx = self.rng.borrow_mut().usize(..A::ACTION_COUNT);
            let action = A::from_index(idx).expect("invariant: idx < A::ACTION_COUNT guarantees from_index succeeds");
            debug!(
                action_idx = idx,
                exploitation = false,
                "epsilon-greedy: exploration selected"
            );
            action
        } else {
            // Greedy: select action with max Q-value
            let action = self.best_action(state);
            debug!(
                exploitation = true,
                "epsilon-greedy: greedy action selected"
            );
            action
        };

        selected_action
    }

    /// Get action with highest Q-value (alloc-free).
    /// Falls back to action 0 when the state is unvisited (all Q-values implicitly 0).
    fn best_action(&self, state: &S) -> A {
        let q_table = self.q_table.borrow();
        let best_idx = match q_table.get(state) {
            Some(q_values) => argmax_f32(q_values),
            None => 0, // unvisited state: all Q == 0, deterministic tie-break to first action
        };
        A::from_index(best_idx).expect("invariant: idx < A::ACTION_COUNT guarantees from_index succeeds")
    }

    /// Q-Learning update: Q(s,a) <- Q(s,a) + alpha[r + gamma max Q(s',a') - Q(s,a)]
    ///
    /// Off-policy TD(0): bootstraps from `max_a' Q(s',a')` regardless of the
    /// behaviour policy. Terminal transitions use a zero bootstrap so the
    /// target reduces to `r` (Bellman equation for absorbing states).
    #[allow(dead_code)]
    pub fn update(&self, state: &S, action: &A, reward: f32, next_state: &S, done: bool) {
        let action_idx = action.to_index();
        let mut q_table = self.q_table.borrow_mut();

        // Compute max Q(s', a') without cloning the row.
        let max_next_q = if done {
            0.0
        } else {
            q_table
                .get(next_state)
                .map(|v| max_f32_or_zero(v))
                .unwrap_or(0.0)
        };

        // Initialize Q(s) on demand.
        let row = q_table
            .entry(state.clone())
            .or_insert_with(|| vec![0.0; A::ACTION_COUNT]);
        let current_q = row[action_idx];
        let target = reward + self.discount_factor * max_next_q;
        let delta = self.learning_rate * (target - current_q);
        let new_q = current_q + delta;
        row[action_idx] = new_q;

        // Emit OTEL span for Bellman update
        let span = span!(
            Level::DEBUG,
            "autonomic.rl.q_update",
            algorithm = "q_learning",
            old_q = current_q,
            new_q = new_q,
            delta = delta,
            reward = reward,
            max_next_q = max_next_q,
            is_terminal = done,
            learning_rate = self.learning_rate,
            discount_factor = self.discount_factor
        );
        let _guard = span.enter();

        debug!(
            old_q = current_q,
            new_q = new_q,
            delta = delta,
            "Q-value updated via Bellman equation"
        );

        *self.total_reward.borrow_mut() += reward;
    }

    /// Compute L2 norm of Q-table weights for convergence analysis.
    /// Used by LinUCB for convergence detection.
    #[allow(dead_code)]
    pub fn compute_weight_norm(&self) -> f32 {
        let q_table = self.q_table.borrow();
        let mut norm_sq = 0.0f32;
        for q_values in q_table.values() {
            for &q in q_values.iter() {
                norm_sq += q * q;
            }
        }
        norm_sq.sqrt()
    }

    #[allow(dead_code)]
    pub fn decay_exploration(&mut self) {
        let old_rate = self.exploration_rate;
        self.exploration_rate *= self.exploration_decay;
        debug!(
            old_epsilon = old_rate,
            new_epsilon = self.exploration_rate,
            decay_factor = self.exploration_decay,
            "exploration rate decayed"
        );
    }

    /// Set exploration rate manually (used by MAPE-K action dispatch).
    pub fn set_exploration_rate(&mut self, rate: f32) {
        debug!(
            old_epsilon = self.exploration_rate,
            new_epsilon = rate,
            "exploration rate set"
        );
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
    ///
    /// On-policy TD(0): bootstraps from the *actually selected* next action
    /// `a' = pi(s')`, not the greedy one. This is what makes SARSA conservative
    /// in the presence of exploration noise.
    #[allow(dead_code)]
    pub fn update(&self, state: &S, action: &A, reward: f32, next_state: &S, next_action: &A) {
        let action_idx = action.to_index();
        let mut q_table = self.q_table.borrow_mut();

        let next_q = q_table
            .get(next_state)
            .map(|q_vals| q_vals[next_action.to_index()])
            .unwrap_or(0.0);

        let row = q_table
            .entry(state.clone())
            .or_insert_with(|| vec![0.0; A::ACTION_COUNT]);
        let current_q = row[action_idx];
        let target = reward + self.discount_factor * next_q;
        let delta = self.learning_rate * (target - current_q);
        let new_q = current_q + delta;
        row[action_idx] = new_q;

        // Emit OTEL span for on-policy SARSA update
        let span = span!(
            Level::DEBUG,
            "autonomic.rl.q_update",
            algorithm = "sarsa",
            old_q = current_q,
            new_q = new_q,
            delta = delta,
            reward = reward,
            next_q = next_q,
            learning_rate = self.learning_rate,
            discount_factor = self.discount_factor
        );
        let _guard = span.enter();

        debug!(
            old_q = current_q,
            new_q = new_q,
            delta = delta,
            next_action_idx = next_action.to_index(),
            "SARSA Q-value updated (on-policy)"
        );
    }

    #[allow(dead_code)]
    pub fn epsilon_greedy_action(&self, state: &S, epsilon: f32) -> A {
        let span = span!(
            Level::DEBUG,
            "autonomic.rl.action_selection",
            epsilon = epsilon,
            algorithm = "sarsa"
        );
        let _guard = span.enter();

        let rand_val = self.rng.borrow_mut().f32();
        let is_exploration = rand_val < epsilon;

        let selected_action = if is_exploration {
            let idx = self.rng.borrow_mut().usize(..A::ACTION_COUNT);
            let action = A::from_index(idx).expect("invariant: idx < A::ACTION_COUNT guarantees from_index succeeds");
            debug!(
                action_idx = idx,
                exploitation = false,
                "epsilon-greedy: exploration selected"
            );
            action
        } else {
            let action = self.greedy_action(state);
            debug!(
                exploitation = true,
                "epsilon-greedy: greedy action selected"
            );
            action
        };

        selected_action
    }

    fn greedy_action(&self, state: &S) -> A {
        let q_table = self.q_table.borrow();
        let best_idx = match q_table.get(state) {
            Some(v) => argmax_f32(v),
            None => 0,
        };
        A::from_index(best_idx).expect("invariant: idx < A::ACTION_COUNT guarantees from_index succeeds")
    }

    /// Compute L2 norm of Q-table weights for convergence analysis.
    #[allow(dead_code)]
    pub fn compute_weight_norm(&self) -> f32 {
        let q_table = self.q_table.borrow();
        let mut norm_sq = 0.0f32;
        for q_values in q_table.values() {
            for &q in q_values.iter() {
                norm_sq += q * q;
            }
        }
        norm_sq.sqrt()
    }

    #[allow(dead_code)]
    pub fn decay_exploration(&mut self) {
        let old_rate = self.exploration_rate;
        self.exploration_rate *= self.exploration_decay;
        debug!(
            old_epsilon = old_rate,
            new_epsilon = self.exploration_rate,
            decay_factor = self.exploration_decay,
            "exploration rate decayed"
        );
    }

    /// Set exploration rate manually (used by MAPE-K action dispatch).
    pub fn set_exploration_rate(&mut self, rate: f32) {
        debug!(
            old_epsilon = self.exploration_rate,
            new_epsilon = rate,
            "exploration rate set"
        );
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
    #[must_use]
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
            A::from_index(idx).expect("invariant: idx < A::ACTION_COUNT guarantees from_index succeeds")
        } else {
            self.greedy_action(state)
        }
    }

    /// Greedy action using the sum of both Q-tables (alloc-free).
    /// Sum is monotone-equivalent to mean for argmax.
    fn greedy_action(&self, state: &S) -> A {
        let qa = self.q_a.borrow();
        let qb = self.q_b.borrow();
        let va = qa.get(state);
        let vb = qb.get(state);

        let best_idx = match (va, vb) {
            (None, None) => 0,
            (Some(v), None) | (None, Some(v)) => argmax_f32(v),
            (Some(a), Some(b)) => {
                debug_assert_eq!(a.len(), b.len());
                let mut best_idx = 0;
                let mut best_val = f32::NEG_INFINITY;
                for i in 0..a.len() {
                    let s = a[i] + b[i];
                    if s > best_val {
                        best_val = s;
                        best_idx = i;
                    }
                }
                best_idx
            }
        };
        A::from_index(best_idx).expect("invariant: idx < A::ACTION_COUNT guarantees from_index succeeds")
    }

    /// Double Q-Learning update
    ///
    /// With 50% probability:
    ///   Use Q_a to select best next action, Q_b to evaluate it
    /// Otherwise:
    ///   Use Q_b to select best next action, Q_a to evaluate it
    /// Double Q-Learning update — decouples action selection from action
    /// evaluation to remove the maximisation bias of vanilla Q-learning.
    ///
    /// With probability 1/2 we update Q_A using Q_A.argmax for selection and
    /// Q_B for evaluation; otherwise the roles are swapped. The resulting
    /// estimator is unbiased in expectation (van Hasselt 2010, Thm 1).
    #[allow(dead_code)]
    pub fn update(&self, state: &S, action: &A, reward: f32, next_state: &S, done: bool) {
        let action_idx = action.to_index();
        let update_a_first = self.rng.borrow_mut().bool();

        let mut qa = self.q_a.borrow_mut();
        let mut qb = self.q_b.borrow_mut();

        // Compute next-state bootstrap before mutably touching the row we update.
        let bootstrap = if done {
            0.0
        } else if update_a_first {
            // best_next_idx from Q_A, evaluated with Q_B.
            let best_next_idx = qa.get(next_state).map(|v| argmax_f32(v)).unwrap_or(0);
            qb.get(next_state).map(|v| v[best_next_idx]).unwrap_or(0.0)
        } else {
            let best_next_idx = qb.get(next_state).map(|v| argmax_f32(v)).unwrap_or(0);
            qa.get(next_state).map(|v| v[best_next_idx]).unwrap_or(0.0)
        };

        let target = reward + self.discount_factor * bootstrap;

        let (current, new_q) = if update_a_first {
            let row = qa
                .entry(state.clone())
                .or_insert_with(|| vec![0.0; A::ACTION_COUNT]);
            let current = row[action_idx];
            let delta = self.learning_rate * (target - current);
            let new_val = current + delta;
            row[action_idx] = new_val;
            (current, new_val)
        } else {
            let row = qb
                .entry(state.clone())
                .or_insert_with(|| vec![0.0; A::ACTION_COUNT]);
            let current = row[action_idx];
            let delta = self.learning_rate * (target - current);
            let new_val = current + delta;
            row[action_idx] = new_val;
            (current, new_val)
        };

        // Emit OTEL span for Double Q-Learning update
        let span = span!(
            Level::DEBUG,
            "autonomic.rl.q_update",
            algorithm = "double_q_learning",
            old_q = current,
            new_q = new_q,
            delta = new_q - current,
            reward = reward,
            bootstrap_value = bootstrap,
            table_updated = if update_a_first { "Q_A" } else { "Q_B" },
            learning_rate = self.learning_rate,
            discount_factor = self.discount_factor
        );
        let _guard = span.enter();

        debug!(
            old_q = current,
            new_q = new_q,
            delta = new_q - current,
            table = if update_a_first { "Q_A" } else { "Q_B" },
            "Double Q-value updated (decoupled selection)"
        );
    }

    #[allow(dead_code)]
    pub fn decay_exploration(&mut self) {
        let old_rate = self.exploration_rate;
        self.exploration_rate *= self.exploration_decay;
        debug!(
            old_epsilon = old_rate,
            new_epsilon = self.exploration_rate,
            decay_factor = self.exploration_decay,
            "exploration rate decayed"
        );
    }

    /// Set exploration rate manually (used by MAPE-K action dispatch).
    pub fn set_exploration_rate(&mut self, rate: f32) {
        debug!(
            old_epsilon = self.exploration_rate,
            new_epsilon = rate,
            "exploration rate set"
        );
        self.exploration_rate = rate;
    }

    /// Compute combined L2 norm of both Q-tables for convergence analysis.
    #[allow(dead_code)]
    pub fn compute_weight_norm(&self) -> f32 {
        let qa = self.q_a.borrow();
        let qb = self.q_b.borrow();
        let mut norm_sq = 0.0f32;
        for q_values in qa.values() {
            for &q in q_values.iter() {
                norm_sq += q * q;
            }
        }
        for q_values in qb.values() {
            for &q in q_values.iter() {
                norm_sq += q * q;
            }
        }
        norm_sq.sqrt()
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
    #[must_use]
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
            A::from_index(idx).expect("invariant: idx < A::ACTION_COUNT guarantees from_index succeeds")
        } else {
            self.greedy_action(state)
        }
    }

    fn greedy_action(&self, state: &S) -> A {
        let q_table = self.q_table.borrow();
        let best_idx = match q_table.get(state) {
            Some(v) => argmax_f32(v),
            None => 0,
        };
        A::from_index(best_idx).expect("invariant: idx < A::ACTION_COUNT guarantees from_index succeeds")
    }

    /// Expected SARSA update: Q(s,a) <- Q(s,a) + alpha[r + gamma * E_pi[Q(s',.)] - Q(s,a)]
    ///
    /// Under epsilon-greedy: E_pi[Q(s', .)] = (1 - eps) * max_a Q(s', a) + (eps / |A|) * sum_a Q(s', a).
    /// This has lower variance than SARSA's sampled bootstrap because it integrates
    /// over the policy rather than sampling a single next action.
    #[allow(dead_code)]
    pub fn update(&self, state: &S, action: &A, reward: f32, next_state: &S, done: bool) {
        let expected_next = if done {
            0.0
        } else {
            let q_table = self.q_table.borrow();
            match q_table.get(next_state) {
                Some(v) => {
                    let max_q = max_f32_or_zero(v);
                    let sum_q: f32 = v.iter().sum();
                    let n = A::ACTION_COUNT as f32;
                    let eps = self.exploration_rate;
                    (1.0 - eps) * max_q + (eps / n) * sum_q
                }
                None => 0.0, // unvisited next state -> all Q == 0
            }
        };

        let mut q_table = self.q_table.borrow_mut();
        let action_idx = action.to_index();
        let row = q_table
            .entry(state.clone())
            .or_insert_with(|| vec![0.0; A::ACTION_COUNT]);
        let current_q = row[action_idx];
        let target = reward + self.discount_factor * expected_next;
        let delta = self.learning_rate * (target - current_q);
        let new_q = current_q + delta;
        row[action_idx] = new_q;

        // Emit OTEL span for Expected SARSA update
        let span = span!(
            Level::DEBUG,
            "autonomic.rl.q_update",
            algorithm = "expected_sarsa",
            old_q = current_q,
            new_q = new_q,
            delta = delta,
            reward = reward,
            expected_bootstrap = expected_next,
            is_terminal = done,
            learning_rate = self.learning_rate,
            discount_factor = self.discount_factor
        );
        let _guard = span.enter();

        debug!(
            old_q = current_q,
            new_q = new_q,
            delta = delta,
            expected_bootstrap = expected_next,
            "Expected SARSA Q-value updated (low-variance)"
        );
    }

    /// Compute L2 norm of Q-table weights for convergence analysis.
    #[allow(dead_code)]
    pub fn compute_weight_norm(&self) -> f32 {
        let q_table = self.q_table.borrow();
        let mut norm_sq = 0.0f32;
        for q_values in q_table.values() {
            for &q in q_values.iter() {
                norm_sq += q * q;
            }
        }
        norm_sq.sqrt()
    }

    #[allow(dead_code)]
    pub fn decay_exploration(&mut self) {
        let old_rate = self.exploration_rate;
        self.exploration_rate *= self.exploration_decay;
        debug!(
            old_epsilon = old_rate,
            new_epsilon = self.exploration_rate,
            decay_factor = self.exploration_decay,
            "exploration rate decayed"
        );
    }

    /// Set exploration rate manually (used by MAPE-K action dispatch).
    pub fn set_exploration_rate(&mut self, rate: f32) {
        debug!(
            old_epsilon = self.exploration_rate,
            new_epsilon = rate,
            "exploration rate set"
        );
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
    #[must_use]
    pub fn with_hyperparams(lr: f32, df: f32) -> Self {
        let mut agent = Self::new();
        agent.learning_rate = lr;
        agent.discount_factor = df;
        agent
    }

    /// Select action using softmax policy: pi(a|s) = exp(theta[s][a]) / Z.
    /// Uses the Gumbel-max trick: argmax_i (theta_i + Gumbel_i(0,1)) ~ softmax(theta).
    /// Avoids any allocation on visited states by indexing the row in place.
    #[allow(dead_code)]
    pub fn select_action(&self, state: &S) -> A {
        let span = span!(
            Level::DEBUG,
            "autonomic.rl.action_selection",
            algorithm = "reinforce",
            policy_type = "softmax"
        );
        let _guard = span.enter();

        let theta = self.theta.borrow();
        let mut rng = self.rng.borrow_mut();

        let mut best_idx = 0;
        let mut best_val = f32::NEG_INFINITY;

        // Closure: draw one Gumbel(0,1) sample.
        let mut gumbel = || {
            let u = rng.f32().clamp(1e-6, 1.0 - 1e-6);
            -(-u.ln()).ln()
        };

        match theta.get(state) {
            Some(weights) => {
                for (i, &w) in weights.iter().enumerate() {
                    let val = w + gumbel();
                    if val > best_val {
                        best_val = val;
                        best_idx = i;
                    }
                }
            }
            None => {
                // All weights are implicitly zero -> uniform softmax -> pure Gumbel.
                for i in 0..A::ACTION_COUNT {
                    let val = gumbel();
                    if val > best_val {
                        best_val = val;
                        best_idx = i;
                    }
                }
            }
        }
        let selected = A::from_index(best_idx).expect("invariant: idx < A::ACTION_COUNT guarantees from_index succeeds");
        debug!(
            action_idx = best_idx,
            gumbel_value = best_val,
            "softmax policy action selected"
        );
        selected
    }

    /// Update policy weights from a complete episode trajectory.
    ///
    /// trajectory: [(state, action, reward), ...]
    /// Uses discounted returns G_t = sum_{k=0}^{T-t} gamma^k * r_{t+k}
    ///
    /// Policy gradient (REINFORCE, Williams 1992):
    ///     theta <- theta + alpha * G_t * grad_theta log pi(a_t | s_t)
    /// For softmax pi(a|s) = exp(theta_{s,a}) / sum_j exp(theta_{s,j}),
    /// the gradient is:
    ///     d/d theta_{s,a}   log pi(a|s) = 1 - pi(a|s)
    ///     d/d theta_{s,j!=a} log pi(a|s) =   - pi(j|s)
    #[allow(dead_code)]
    pub fn update_from_trajectory(&self, trajectory: &[(S, A, f32)]) {
        let n = trajectory.len();
        if n == 0 {
            return;
        }

        let span = span!(
            Level::DEBUG,
            "autonomic.rl.policy_gradient_update",
            algorithm = "reinforce",
            trajectory_length = n,
            learning_rate = self.learning_rate,
            discount_factor = self.discount_factor
        );
        let _guard = span.enter();

        // Compute discounted returns G_t for each timestep (backwards pass).
        let mut returns: Vec<f32> = vec![0.0; n];
        let mut g = 0.0;
        for i in (0..n).rev() {
            g = trajectory[i].2 + self.discount_factor * g;
            returns[i] = g;
        }

        let total_return: f32 = returns.iter().sum();
        debug!(
            trajectory_length = n,
            total_return = total_return,
            mean_return = total_return / n as f32,
            "episode trajectory processed"
        );

        let mut theta = self.theta.borrow_mut();
        // Reuse a single softmax scratch buffer across the trajectory.
        let mut softmax = vec![0.0f32; A::ACTION_COUNT];

        for (t, (state, action, _reward)) in trajectory.iter().enumerate() {
            let weights = theta
                .entry(state.clone())
                .or_insert_with(|| vec![0.0; A::ACTION_COUNT]);
            let action_idx = action.to_index();

            // Numerically-stable softmax: subtract max before exp, normalise by sum.
            let max_w = max_f32_or_zero(weights);
            let mut sum = 0.0f32;
            for (j, &w) in weights.iter().enumerate() {
                let e = (w - max_w).exp();
                softmax[j] = e;
                sum += e;
            }
            let inv_sum = 1.0 / sum;
            let g_t = returns[t];
            let lr = self.learning_rate;
            let old_weight = weights[action_idx];
            for (j, w) in weights.iter_mut().enumerate() {
                let pi_j = softmax[j] * inv_sum;
                let indicator = f64::from(j == action_idx);
                *w += lr * g_t * (indicator - pi_j);
            }
            let new_weight = weights[action_idx];
            debug!(
                timestep = t,
                action_idx = action_idx,
                old_weight = old_weight,
                new_weight = new_weight,
                return_g_t = g_t,
                "policy weight gradient update"
            );
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

    /// Compute L2 norm of policy weights for convergence analysis.
    #[allow(dead_code)]
    pub fn compute_weight_norm(&self) -> f32 {
        let theta = self.theta.borrow();
        let mut norm_sq = 0.0f32;
        for weights in theta.values() {
            for &w in weights.iter() {
                norm_sq += w * w;
            }
        }
        norm_sq.sqrt()
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
    fn set_exploration_rate(&mut self, rate: f32);
    fn set_learning_rate(&mut self, rate: f32);
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
    fn set_exploration_rate(&mut self, rate: f32) {
        self.exploration_rate = rate;
    }
    fn set_learning_rate(&mut self, rate: f32) {
        self.learning_rate = rate;
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
    fn set_exploration_rate(&mut self, rate: f32) {
        self.exploration_rate = rate;
    }
    fn set_learning_rate(&mut self, rate: f32) {
        self.learning_rate = rate;
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
    fn set_exploration_rate(&mut self, rate: f32) {
        self.exploration_rate = rate;
    }
    fn set_learning_rate(&mut self, rate: f32) {
        self.learning_rate = rate;
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
    fn set_exploration_rate(&mut self, rate: f32) {
        self.exploration_rate = rate;
    }
    fn set_learning_rate(&mut self, rate: f32) {
        self.learning_rate = rate;
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
    fn set_exploration_rate(&mut self, _rate: f32) {
        // No-op: REINFORCE uses softmax temperature, not ε-greedy
    }
    fn set_learning_rate(&mut self, rate: f32) {
        self.learning_rate = rate;
    }
}

// Tests consolidated in tests/reinforcement_tests.rs
