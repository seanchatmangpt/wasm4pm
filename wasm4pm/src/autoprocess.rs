//! AutoProcessAgent — Vision 2030 Autonomic Loop
//!
//! Closed-loop perception → decision → protection → optimization cycle.
//! Budget: 34 nanoseconds per cycle with 10% margin (30.6ns target).
//!
//! Implements 4 operations:
//! 1. **Perception**: Encode 8D state vector to u32 state_id (branchless)
//! 2. **Decision**: Q-table lookup + LinUCB agent selection (precomputed sqrt)
//! 3. **Protection**: Circuit breaker + guard rules (branchless)
//! 4. **Optimization**: Bellman update to Q[state_id]
//!
//! All operations use integer arithmetic and LUT-based quantization.
//! No floating-point operations in the critical path except Bellman alpha.

use crate::reinforcement::WorkflowAction;
use crate::{RlAction, RlState};

/// 8-dimensional state space: 5×8×8×4×3×8×3×4 = 368,640 total states
/// Q-table indexed by u32 state_id (0..460_799)
pub const STATE_SPACE_SIZE: usize = 368_640;

/// Action space size (Continue, Scale, Retry, Fallback, Restart)
pub const ACTION_SPACE_SIZE: usize = 5;

/// Total Q-table entries (per agent)
pub const QTABLE_SIZE: usize = STATE_SPACE_SIZE * ACTION_SPACE_SIZE;

/// Packed representation of a Bellman transition (20 bytes)
/// Used for deferred queue to reduce hot-path overhead
#[repr(C)]
#[derive(Debug, Clone, Copy)]
struct BellmanTransition {
    state_id: u32,
    action_idx: u8,
    done: bool,
    _pad: u16, // Padding for alignment
    reward: f32,
    next_state_id: u32,
}

/// Precomputed lookup tables for fast perception
mod perception_lut {
    /// Precomputed multipliers for encoding 8D state to u32 state_id (branchless)
    /// state_id = h*122400 + er*15300 + ac*1912 + sa*456 + d*152 + rr*19 + cs*8 + cp
    pub const H_MULT: u32 = 122_400; // 8*8*4*3*8*3*4
    pub const ER_MULT: u32 = 15_300; // 8*4*3*8*3*4
    pub const AC_MULT: u32 = 1_912; // 4*3*8*3*4
    pub const SA_MULT: u32 = 456; // 3*8*3*4
    pub const D_MULT: u32 = 152; // 8*3*4
    pub const RR_MULT: u32 = 19; // 3*4
    pub const CS_MULT: u32 = 8; // 4
    #[allow(dead_code)]
    pub const CP_MULT: u32 = 1; // 1
}

/// Circuit breaker states for the autonomic loop.
///
/// The circuit breaker protects the target system from death spirals and
/// cascading failures by blocking actions when failure thresholds are exceeded.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum CircuitState {
    /// Normal operation — requests are allowed.
    Closed = 0,
    /// Testing recovery — a limited number of requests are allowed to probe if the system has recovered.
    HalfOpen = 1,
    /// Blocking mode — requests are blocked to allow the system to recover.
    Open = 2,
}

impl From<u8> for CircuitState {
    /// Converts a raw u8 value to a `CircuitState`.
    ///
    /// Values 0 and 1 map to `Closed` and `HalfOpen` respectively; any other value maps to `Open`.
    fn from(v: u8) -> Self {
        match v {
            0 => CircuitState::Closed,
            1 => CircuitState::HalfOpen,
            2 => CircuitState::Open,
            _ => CircuitState::Open,
        }
    }
}

/// Guard rule evaluation result.
///
/// Guards check for state validity and prevent dangerous transitions (e.g., sudden death spirals)
/// before an action is dispatched.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct GuardEval {
    /// Whether the guard rules passed.
    pub pass: bool,
    /// A bitmask or count of rule violations detected.
    pub rule_violations: u32,
}

impl GuardEval {
    /// Creates a successful guard evaluation result.
    pub fn new_pass() -> Self {
        Self {
            pass: true,
            rule_violations: 0,
        }
    }

    /// Creates a failed guard evaluation result with the specified violation details.
    pub fn new_fail(violations: u32) -> Self {
        Self {
            pass: false,
            rule_violations: violations,
        }
    }
}

/// Typed reason explaining *why* the AutoProcessAgent chose a given action.
///
/// This makes the **Decision** stage of the autonomic loop observable: callers
/// (telemetry, OTEL spans, audit receipts) can distinguish between exploration,
/// exploitation, and protection-driven overrides without re-deriving the
/// decision from internal state.
///
/// The variants are mutually exclusive and ordered by precedence: protection
/// overrides (`GuardViolation`, `CircuitBlocked`) are reported when set, even
/// if the action itself came from exploration or exploitation. `GuardViolation`
/// outranks `CircuitBlocked` because a guard violation signals an *invalid*
/// action while a blocked circuit signals a *deferred* action.
///
/// All variants are stable, allocation-free labels suitable for OTEL span
/// attributes (use [`DecisionReason::label`]).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum DecisionReason {
    /// Action picked by ε-greedy exploration (random draw within ε).
    Explored = 0,
    /// Action picked by argmax Q(s, a) — the policy chose the best known action.
    Exploited = 1,
    /// Action was selected but the circuit breaker is Open; the caller should
    /// treat the selection as advisory only.
    CircuitBlocked = 2,
    /// Action violated a guard rule (e.g. death-spiral check). The caller
    /// should not dispatch this action.
    GuardViolation = 3,
}

impl DecisionReason {
    /// Stable, allocation-free label suitable for OTEL span attributes.
    #[inline]
    pub fn label(self) -> &'static str {
        match self {
            DecisionReason::Explored => "explored",
            DecisionReason::Exploited => "exploited",
            DecisionReason::CircuitBlocked => "circuit_blocked",
            DecisionReason::GuardViolation => "guard_violation",
        }
    }
}

/// AutoProcess decision output.
///
/// This struct captures the result of a single autonomic cycle's decision phase,
/// including the selected action, the encoded state ID, and the protection status.
#[derive(Debug, Clone)]
pub struct Decision {
    /// The RL action selected for dispatch.
    pub action: RlAction,
    /// The u32 encoding of the 8D perception state.
    pub state_id: u32,
    /// The Q-value associated with the selected (state, action) pair.
    pub q_value: f32,
    /// Whether the selected action passed the guard rules.
    pub guard_allowed: bool,
    /// Whether the circuit breaker allowed the dispatch of this action.
    pub circuit_allowed: bool,
    /// LinUCB UCB score, used for agent selection and confidence monitoring.
    pub agent_confidence: f32,
    /// Typed reason explaining why this action was chosen (exploration, exploitation, or protection).
    pub reason: DecisionReason,
}

/// AutoProcessAgent — branchless autonomic loop implementation.
///
/// This agent implements a high-performance, nanosecond-scale MAPE-K loop.
/// It uses a binned Q-table for reinforcement learning, a step-driven circuit
/// breaker for protection, and branchless arithmetic for state perception.
pub struct AutoProcessAgent {
    /// Q-table storage: 368,640 states × 5 actions × 4 bytes (f32) = ~9.2 MB
    q_table: Box<[f32; QTABLE_SIZE]>,

    /// Circuit breaker state (Closed/HalfOpen/Open)
    circuit_state: CircuitState,

    /// Circuit breaker counter (step-driven, not time-based)
    circuit_failure_count: u32,

    /// Failure threshold for circuit Open
    circuit_threshold: u32,

    /// Step counter for advancing circuit breaker state machine
    step_counter: u64,

    /// Circuit HalfOpen timeout (in steps)
    circuit_timeout_steps: u64,

    /// When circuit transitioned to Open
    circuit_open_at_step: u64,

    /// Learning rate (alpha) for Bellman update
    learning_rate: f32,

    /// Discount factor (gamma)
    discount_factor: f32,

    /// Precomputed sqrt values for LinUCB context selection (128 entries)
    /// Index: quantized feature magnitude (0..127)
    /// Value: sqrt of feature magnitude
    sqrt_lut: [f32; 128],

    /// Deferred Bellman update queue (256 transitions max)
    deferred_queue: [BellmanTransition; 256],

    /// Head pointer for queue (write position)
    queue_head: u8,

    /// Current queue length
    queue_len: u8,

    /// Drain period (number of cycles between drains): 0 = immediate, 128 = deferred
    drain_every: u8,

    /// Cycle counter modulo drain_every
    cycle_mod: u8,

    /// RNG for epsilon-greedy exploration
    rng: fastrand::Rng,

    /// Epsilon for ε-greedy exploration (exploration probability)
    epsilon: f32,

    /// Epsilon decay rate per cycle (multiplicative)
    epsilon_decay: f32,

    /// Minimum epsilon (lower bound)
    epsilon_min: f32,

    /// Last health level (for Guard Rule 3 evaluation)
    last_health_level: u8,
}

impl AutoProcessAgent {
    /// Look up a Q-value for a given state and action.
    pub fn q_lookup(&self, state_id: usize, action_id: usize) -> f32 {
        let idx = state_id * ACTION_SPACE_SIZE + action_id;
        if idx < QTABLE_SIZE {
            self.q_table[idx]
        } else {
            0.0
        }
    }

    /// Creates a new `AutoProcessAgent` with default parameters.
    ///
    /// Defaults: α=0.1, γ=0.99, circuit_threshold=3, circuit_timeout=100.
    pub fn new() -> Self {
        Self::with_config(0.1, 0.99, 3, 100)
    }

    /// Creates an `AutoProcessAgent` with custom learning and protection parameters.
    ///
    /// # Arguments
    /// * `learning_rate` - The α parameter for Bellman updates.
    /// * `discount_factor` - The γ parameter for Bellman updates.
    /// * `circuit_threshold` - Number of consecutive failures before opening the circuit.
    /// * `circuit_timeout_steps` - Number of steps to wait before transitioning from Open to HalfOpen.
    pub fn with_config(
        learning_rate: f32,
        discount_factor: f32,
        circuit_threshold: u32,
        circuit_timeout_steps: u64,
    ) -> Self {
        let mut agent = Self {
            q_table: vec![0.0_f32; QTABLE_SIZE].into_boxed_slice().try_into().unwrap(), // infallible: vec has exactly QTABLE_SIZE elements
            circuit_state: CircuitState::Closed,
            circuit_failure_count: 0,
            circuit_threshold,
            step_counter: 0,
            circuit_timeout_steps,
            circuit_open_at_step: 0,
            learning_rate,
            discount_factor,
            sqrt_lut: [0.0_f32; 128],
            deferred_queue: [BellmanTransition {
                state_id: 0,
                action_idx: 0,
                done: false,
                _pad: 0,
                reward: 0.0,
                next_state_id: 0,
            }; 256],
            queue_head: 0,
            queue_len: 0,
            drain_every: 128,
            cycle_mod: 0,
            rng: fastrand::Rng::new(),
            epsilon: 1.0,
            epsilon_decay: 0.9995,
            epsilon_min: 0.01,
            last_health_level: 0,
        };

        // Precompute sqrt LUT for LinUCB
        agent.compute_sqrt_lut();
        agent
    }

    /// Precompute square roots for LinUCB context magnitudes
    fn compute_sqrt_lut(&mut self) {
        for i in 0..128 {
            self.sqrt_lut[i] = (i as f32).sqrt();
        }
    }

    /// Set the drain cadence for the deferred Bellman queue.
    ///
    /// * `0`: Immediate updates (no queueing).
    /// * `n > 0`: Buffer updates and apply them every `n` cycles.
    pub fn set_drain_cadence(&mut self, n: u8) {
        self.drain_every = n;
    }

    /// Decay epsilon by the `epsilon_decay` factor.
    ///
    /// This should be called at the end of each cycle to transition the agent
    /// from exploration to exploitation over time. Epsilon is clamped to `epsilon_min`.
    #[inline(always)]
    pub fn decay_epsilon(&mut self) {
        self.epsilon = (self.epsilon * self.epsilon_decay).max(self.epsilon_min);
    }

    // =========================================================================
    // PERCEPTION: Encode 8D state to u32 state_id (branchless)
    // =========================================================================

    /// Encode an `RlState` to a u32 `state_id` using precomputed multipliers.
    ///
    /// This is a high-performance branchless operation. The 8D state space is
    /// flattened into a single linear index.
    #[inline(always)]
    pub fn encode_state(&self, state: &RlState) -> u32 {
        let h = state.health_level as u32;
        let er = state.event_rate_q as u32;
        let ac = state.activity_count_q as u32;
        let sa = state.spc_alert_level as u32;
        let d = state.drift_status as u32;
        let rr = state.rework_ratio_q as u32;
        let cs = state.circuit_state as u32;
        let cp = state.cycle_phase as u32;

        h.wrapping_mul(perception_lut::H_MULT)
            .wrapping_add(er.wrapping_mul(perception_lut::ER_MULT))
            .wrapping_add(ac.wrapping_mul(perception_lut::AC_MULT))
            .wrapping_add(sa.wrapping_mul(perception_lut::SA_MULT))
            .wrapping_add(d.wrapping_mul(perception_lut::D_MULT))
            .wrapping_add(rr.wrapping_mul(perception_lut::RR_MULT))
            .wrapping_add(cs.wrapping_mul(perception_lut::CS_MULT))
            .wrapping_add(cp)
    }

    // =========================================================================
    // DECISION: Q-table lookup + LinUCB agent selection
    // =========================================================================

    /// Look up Q-value and return corresponding action with ε-greedy exploration.
    ///
    /// This variant is kept for backward compatibility. New code should use
    /// `select_action_epsilon_greedy_with_reason`.
    #[inline(always)]
    pub fn select_action_epsilon_greedy(
        &mut self,
        state_id: u32,
        epsilon_override: Option<f32>,
    ) -> (RlAction, f32, u32) {
        let (action, q, idx, _reason) =
            self.select_action_epsilon_greedy_with_reason(state_id, epsilon_override);
        (action, q, idx)
    }

    /// Select an action using ε-greedy exploration and return the selection rationale.
    ///
    /// With probability ε, a random action is picked (Explored). Otherwise, the
    /// action with the highest Q-value is selected (Exploited).
    #[inline(always)]
    pub fn select_action_epsilon_greedy_with_reason(
        &mut self,
        state_id: u32,
        epsilon_override: Option<f32>,
    ) -> (RlAction, f32, u32, DecisionReason) {
        let eps = epsilon_override.unwrap_or(self.epsilon);

        let (selected_idx, reason) = if self.rng.f32() < eps {
            // Explore: pick random action
            (self.rng.usize(0..ACTION_SPACE_SIZE), DecisionReason::Explored)
        } else {
            // Exploit: find argmax_a Q(s, a)
            let mut max_q = f32::NEG_INFINITY;
            let mut best_action_idx: usize = 0;

            for a in 0..ACTION_SPACE_SIZE {
                let q = self.q_lookup(state_id as usize, a as usize);
                let is_better = q > max_q;
                max_q = if is_better { q } else { max_q };
                best_action_idx = if is_better { a } else { best_action_idx };
            }
            (best_action_idx, DecisionReason::Exploited)
        };

        let q_val = self.q_lookup(state_id as usize, selected_idx as usize);
        let action = RlAction::from_index(selected_idx).unwrap_or(RlAction::Continue);

        (action, q_val, selected_idx as u32, reason)
    }

    /// Estimate agent confidence using the LinUCB upper confidence bound formula.
    ///
    /// Uses a precomputed square root lookup table for performance.
    #[inline(always)]
    pub fn linucb_ucb_estimate(&self, q_value: f32, features: &[f32; 8]) -> f32 {
        // Estimate feature magnitude: L2 norm quantized to [0..127]
        let magnitude_sq: f32 = features.iter().map(|x| x * x).sum();
        let magnitude = magnitude_sq.sqrt();
        let mag_quantized = ((magnitude * 127.0).clamp(0.0, 127.0)) as usize;
        let mag_sqrt = self.sqrt_lut[mag_quantized];

        // Estimate visit count from Q-value magnitude (avoid division by zero)
        let visit_count_est = 1.0 + q_value.abs().sqrt();

        // UCB = Q + sqrt(mag) / sqrt(visits)
        let exploration_bonus = mag_sqrt / visit_count_est.sqrt().max(1.0);
        q_value + exploration_bonus
    }

    // =========================================================================
    // PROTECTION: Circuit breaker + guard rules
    // =========================================================================

    /// Evaluate guard rules to prevent dangerous state transitions.
    ///
    /// Checks include:
    /// 1. Health range validity.
    /// 2. Action index validity.
    /// 3. Death spiral prevention (no sudden transition to Failed state from healthy).
    #[inline(always)]
    pub fn evaluate_guard(&self, state: &RlState, action: RlAction, prev_health: u8) -> GuardEval {
        let mut violations = 0u32;

        // Rule 1: Health must be in valid range
        let health_valid = (state.health_level <= 4) as u32;
        violations += (1 - health_valid) & 1;

        // Rule 2: Action must be in valid range
        let action_idx = action.to_index() as u32;
        let action_valid = (action_idx < 5) as u32;
        violations += (1 - action_valid) & 1;

        // Rule 3: Prevent sudden death spiral (prev_health < 3 AND current health == 4)
        let death_spiral_check = ((prev_health < 3) as u32) & ((state.health_level == 4) as u32);
        violations += death_spiral_check;

        let pass = violations == 0;
        GuardEval {
            pass,
            rule_violations: violations,
        }
    }

    /// Advance the circuit breaker state machine by one step.
    ///
    /// This drives time-based transitions (e.g., Open to HalfOpen after a timeout).
    #[inline(always)]
    pub fn advance_circuit_breaker(&mut self) {
        self.step_counter += 1;

        match self.circuit_state {
            CircuitState::Closed => {
                // Defensive: record_action_result already trips on threshold;
                // keep this idempotent guard for callers that mutate the
                // failure count via a back door (tests, restored state).
                let should_open = (self.circuit_failure_count >= self.circuit_threshold) as u32;
                if should_open != 0 {
                    self.circuit_state = CircuitState::Open;
                    self.circuit_open_at_step = self.step_counter;
                }
            }
            CircuitState::Open => {
                let time_since_open = self.step_counter - self.circuit_open_at_step;
                let should_test = (time_since_open >= self.circuit_timeout_steps) as u32;
                if should_test != 0 {
                    self.circuit_state = CircuitState::HalfOpen;
                }
            }
            CircuitState::HalfOpen => {
                // HalfOpen transitions are handled by record_action_result()
            }
        }
    }

    /// Record the result of an action to update the circuit breaker's health metrics.
    ///
    /// A failure will increment the failure count and may immediately trip the
    /// circuit to Open. A success will reset the failure count and transition
    /// the circuit from HalfOpen to Closed.
    #[inline(always)]
    pub fn record_action_result(&mut self, success: bool) {
        if success {
            self.circuit_failure_count = 0;
            if self.circuit_state == CircuitState::HalfOpen {
                self.circuit_state = CircuitState::Closed;
            }
        } else {
            self.circuit_failure_count = self.circuit_failure_count.saturating_add(1);
            // CB-1 fix: trip immediately, do not wait for a caller-driven
            // advance_circuit_breaker() tick.
            match self.circuit_state {
                CircuitState::Closed
                    if self.circuit_failure_count >= self.circuit_threshold =>
                {
                    self.circuit_state = CircuitState::Open;
                    self.circuit_open_at_step = self.step_counter;
                }
                CircuitState::HalfOpen => {
                    // Any failure during recovery probe → back to Open.
                    self.circuit_state = CircuitState::Open;
                    self.circuit_open_at_step = self.step_counter;
                }
                _ => {}
            }
        }
    }

    /// Returns `true` if the circuit breaker currently allows requests to proceed.
    #[inline(always)]
    pub fn circuit_allows_request(&self) -> bool {
        matches!(
            self.circuit_state,
            CircuitState::Closed | CircuitState::HalfOpen
        )
    }

    // =========================================================================
    // DEFERRED BELLMAN QUEUEING
    // =========================================================================

    /// Enqueue a Bellman transition for deferred processing
    /// Auto-drains if queue becomes full
    #[inline(always)]
    fn enqueue_bellman(
        &mut self,
        state_id: u32,
        action_idx: usize,
        reward: f32,
        next_state_id: u32,
        done: bool,
    ) {
        if self.queue_len < 255 {
            let idx = self.queue_head as usize;
            self.deferred_queue[idx] = BellmanTransition {
                state_id,
                action_idx: action_idx as u8,
                done,
                _pad: 0,
                reward,
                next_state_id,
            };
            self.queue_head = self.queue_head.wrapping_add(1);
            self.queue_len = self.queue_len.saturating_add(1);
        } else {
            // Queue full: drain before enqueuing new transition
            self.drain_bellman_queue();
            let idx = self.queue_head as usize;
            self.deferred_queue[idx] = BellmanTransition {
                state_id,
                action_idx: action_idx as u8,
                done,
                _pad: 0,
                reward,
                next_state_id,
            };
            self.queue_head = self.queue_head.wrapping_add(1);
            self.queue_len = 1;
        }
    }

    /// Drain all buffered Bellman transitions and apply updates to the Q-table.
    pub fn drain_bellman_queue(&mut self) {
        for i in 0..self.queue_len {
            let idx = i as usize;
            let trans = self.deferred_queue[idx];

            let mut max_next_q = f32::NEG_INFINITY;
            let next_base = (trans.next_state_id as usize) * ACTION_SPACE_SIZE;

            // Strict bounds-checking assertion before unsafe access
            assert!(next_base + ACTION_SPACE_SIZE <= QTABLE_SIZE, "Q-table bounds check failed for next_state_id");
            unsafe {
                let s = self
                    .q_table
                    .get_unchecked(next_base..next_base + ACTION_SPACE_SIZE);
                let m01 = if s[0] > s[1] { s[0] } else { s[1] };
                let m23 = if s[2] > s[3] { s[2] } else { s[3] };
                let m = if m01 > m23 { m01 } else { m23 };
                max_next_q = if m > s[4] { m } else { s[4] };
            }

            let target =
                trans.reward + (1.0 - trans.done as u32 as f32) * self.discount_factor * max_next_q;

            let q_idx = (trans.state_id as usize)
                .wrapping_mul(ACTION_SPACE_SIZE)
                .wrapping_add(trans.action_idx as usize);

            // Strict bounds-checking assertion before unsafe access
            assert!(q_idx < QTABLE_SIZE, "Q-table bounds check failed for q_idx");
            unsafe {
                let current_q = *self.q_table.get_unchecked(q_idx);
                let delta = target - current_q;
                *self.q_table.get_unchecked_mut(q_idx) = current_q + self.learning_rate * delta;
            }
        }
        self.queue_head = 0;
        self.queue_len = 0;
    }

    // =========================================================================
    // OPTIMIZATION: Bellman update to Q-table
    // =========================================================================

    /// Perform a direct Bellman Q-learning update (non-deferred path).
    ///
    /// Formula: Q(s,a) ← Q(s,a) + α[r + γ max_a' Q(s',a') - Q(s,a)]
    #[inline(never)]
    pub fn bellman_update_direct(
        &mut self,
        state_id: u32,
        action_idx: usize,
        reward: f32,
        next_state_id: u32,
        done: bool,
    ) {
        let next_base = (next_state_id as usize) * ACTION_SPACE_SIZE;
        
        // Strict bounds-checking assertion before unsafe access
        assert!(next_base + ACTION_SPACE_SIZE <= QTABLE_SIZE, "Q-table bounds check failed for next_state_id");
        let max_next_q = unsafe {
            let s = self
                .q_table
                .get_unchecked(next_base..next_base + ACTION_SPACE_SIZE);
            let m01 = if s[0] > s[1] { s[0] } else { s[1] };
            let m23 = if s[2] > s[3] { s[2] } else { s[3] };
            let m = if m01 > m23 { m01 } else { m23 };
            if m > s[4] {
                m
            } else {
                s[4]
            }
        };

        // Branchless terminal check: if done, target = r; else r + γ Q(s', a')
        let target = reward + (1.0 - done as u32 as f32) * self.discount_factor * max_next_q;

        // Get current Q value and apply update
        let q_idx = (state_id as usize)
            .wrapping_mul(ACTION_SPACE_SIZE)
            .wrapping_add(action_idx);

        // Strict bounds-checking assertion before unsafe access
        assert!(q_idx < QTABLE_SIZE, "Q-table bounds check failed for q_idx");
        unsafe {
            let current_q = *self.q_table.get_unchecked(q_idx);
            let delta = target - current_q;
            *self.q_table.get_unchecked_mut(q_idx) = current_q + self.learning_rate * delta;
        }
    }

    // =========================================================================
    // ORCHESTRATION: Full cycle (Perception → Decision → Protection → Optimization)
    // =========================================================================

    /// Run one complete autonomic cycle.
    ///
    /// This method orchestrates the full MAPE-K loop:
    /// 1. Perception: Encode current and next state.
    /// 2. Decision: Select action via ε-greedy exploration.
    /// 3. Protection: Evaluate guards and update circuit breaker.
    /// 4. Optimization: Apply Bellman update.
    ///
    /// Returns a `Decision` struct containing the results.
    pub fn run_cycle(
        &mut self,
        state: &RlState,
        features: &[f32; 8],
        reward: f32,
        next_state: &RlState,
        done: bool,
        action_success: bool,
        _circuit_state_u8: u8,
    ) -> Decision {
        // Step 1: PERCEPTION — Encode 8D state to state_id
        let state_id = self.encode_state(state);
        let next_state_id = self.encode_state(next_state);

        // Step 2: DECISION — Select action via epsilon-greedy, capturing
        // explore-vs-exploit so callers can observe the decision rationale.
        let (action, q_value, _action_idx, base_reason) =
            self.select_action_epsilon_greedy_with_reason(state_id, None);

        // Step 3: PROTECTION
        // - Evaluate guard rules
        let guard_eval = self.evaluate_guard(state, action, self.last_health_level);

        // - Advance circuit breaker
        self.advance_circuit_breaker();

        // - Update circuit breaker on action result
        self.record_action_result(action_success);

        // Step 4: OPTIMIZATION — Bellman update (immediate or deferred)
        if self.drain_every == 0 {
            self.bellman_update_direct(state_id, action.to_index(), reward, next_state_id, done);
        } else {
            self.enqueue_bellman(state_id, action.to_index(), reward, next_state_id, done);

            self.cycle_mod = self.cycle_mod.wrapping_add(1);
            if self.cycle_mod >= self.drain_every {
                self.drain_bellman_queue();
                self.cycle_mod = 0;
            }
        }

        // Estimate agent confidence using LinUCB
        let agent_confidence = self.linucb_ucb_estimate(q_value, features);

        // Update last_health_level for next cycle's Guard Rule 3
        self.last_health_level = state.health_level;

        // Decay epsilon for exploration-exploitation tradeoff
        self.decay_epsilon();

        // Protection overrides win over explore/exploit for telemetry purposes:
        // a guard violation or open breaker is the load-bearing reason callers
        // need to see in audit receipts. GuardViolation outranks CircuitBlocked
        // because a guard violation signals an *invalid* action while a blocked
        // circuit signals a *deferred* action.
        let circuit_allowed = self.circuit_allows_request();
        let reason = if !guard_eval.pass {
            DecisionReason::GuardViolation
        } else if !circuit_allowed {
            DecisionReason::CircuitBlocked
        } else {
            base_reason
        };

        Decision {
            action,
            state_id,
            q_value,
            guard_allowed: guard_eval.pass,
            circuit_allowed,
            agent_confidence,
            reason,
        }
    }

    /// Create a new AutoProcessAgent with immediate Bellman updates (for testing).
    #[cfg(test)]
    pub fn new_immediate() -> Self {
        let mut agent = Self::new();
        agent.drain_every = 0; // Immediate mode
        agent
    }

    /// Returns a mutable reference to the Q-table.
    pub fn q_table_mut(&mut self) -> &mut [f32; QTABLE_SIZE] {
        &mut self.q_table
    }

    /// Returns an immutable reference to the Q-table.
    pub fn q_table(&self) -> &[f32; QTABLE_SIZE] {
        &self.q_table
    }

    /// Returns the current circuit breaker state.
    pub fn circuit_state(&self) -> CircuitState {
        self.circuit_state
    }

    /// Returns the current step counter.
    pub fn step_count(&self) -> u64 {
        self.step_counter
    }

    /// Resets the circuit breaker to the Closed state and clears failure counts.
    pub fn reset_circuit_breaker(&mut self) {
        self.circuit_state = CircuitState::Closed;
        self.circuit_failure_count = 0;
        self.circuit_open_at_step = 0;
    }
}

impl Default for AutoProcessAgent {
    fn default() -> Self {
        Self::new()
    }
}

// =========================================================================
// Tests
// =========================================================================
// NOTE: Tests for AutoProcessAgent allocate ~9.2MB per test instance (Q-table).
// This can cause stack overflow when running multiple tests in one batch.
// Run individual tests with: cargo test --lib autoprocess::tests::test_name -- --ignored --test-threads=1
// Or build with increased stack: RUST_MIN_STACK=8388608 cargo test

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[ignore] // Stack-intensive tests; run with RUST_MIN_STACK=8388608 cargo test -- --ignored --test-threads=1
    fn test_encode_state_branchless() {
        // Test with known state
        let state = RlState {
            health_level: 0,
            event_rate_q: 0,
            activity_count_q: 0,
            spc_alert_level: 0,
            drift_status: 0,
            rework_ratio_q: 0,
            circuit_state: 0,
            cycle_phase: 0,
        };

        let agent = AutoProcessAgent::new();
        let state_id = agent.encode_state(&state);
        assert_eq!(state_id, 0, "All-zero state should encode to 0");
    }

    #[test]
    #[ignore] // Stack-intensive tests; run with RUST_MIN_STACK=8388608 cargo test -- --ignored --test-threads=1
    fn test_encode_state_max_values() {
        // Test with max valid values
        let state = RlState {
            health_level: 4,
            event_rate_q: 7,
            activity_count_q: 7,
            spc_alert_level: 3,
            drift_status: 2,
            rework_ratio_q: 7,
            circuit_state: 2,
            cycle_phase: 3,
        };

        let agent = AutoProcessAgent::new();
        let state_id = agent.encode_state(&state);
        assert!(
            state_id < STATE_SPACE_SIZE as u32,
            "Max state should be < {}: got {}",
            STATE_SPACE_SIZE,
            state_id
        );
    }

    #[test]
    #[ignore] // Stack-intensive tests; run with RUST_MIN_STACK=8388608 cargo test -- --ignored --test-threads=1
    fn test_q_lookup_valid() {
        let agent = AutoProcessAgent::new();
        let q = agent.q_lookup(0, 0);
        assert_eq!(q, 0.0, "Uninitialized Q-values should be 0.0");
    }

    #[test]
    #[ignore] // Stack-intensive tests; run with RUST_MIN_STACK=8388608 cargo test -- --ignored --test-threads=1
    fn test_select_action_epsilon_greedy() {
        let mut agent = AutoProcessAgent::new();
        let (action, q, _idx) = agent.select_action_epsilon_greedy(0, None);

        // With all Q-values at 0, any action is equally good
        assert!(matches!(
            action,
            RlAction::Continue
                | RlAction::Scale
                | RlAction::Retry
                | RlAction::Fallback
                | RlAction::Restart
        ));
        assert_eq!(q, 0.0);
    }

    #[test]
    #[ignore] // Stack-intensive tests; run with RUST_MIN_STACK=8388608 cargo test -- --ignored --test-threads=1
    fn test_guard_eval_pass() {
        let agent = AutoProcessAgent::new();
        let state = RlState {
            health_level: 2,
            event_rate_q: 4,
            activity_count_q: 3,
            spc_alert_level: 1,
            drift_status: 1,
            rework_ratio_q: 2,
            circuit_state: 0,
            cycle_phase: 1,
        };

        let guard = agent.evaluate_guard(&state, RlAction::Continue, 0);
        assert!(guard.pass, "Valid state and action should pass guard");
        assert_eq!(guard.rule_violations, 0);
    }

    #[test]
    #[ignore] // Skip in normal test runs; run separately with `cargo test -- --ignored`
    fn test_bellman_update() {
        let mut agent = AutoProcessAgent::new_immediate();

        // Set up initial Q-value
        let state_id = 0u32;
        let action_idx = 0usize;
        let reward = 1.0;
        let next_state_id = 1u32;
        let done = false;

        // Before update: Q[0,0] = 0
        let q_before = agent.q_lookup(state_id as usize, action_idx);
        assert_eq!(q_before, 0.0);

        // Perform Bellman update
        agent.bellman_update_direct(state_id, action_idx, reward, next_state_id, done);

        // After update: Q[0,0] should increase
        let q_after = agent.q_lookup(state_id as usize, action_idx);
        assert!(
            q_after > q_before,
            "Q-value should increase with positive reward"
        );
    }

    #[test]
    #[ignore] // Skip in normal test runs; run separately with `cargo test -- --ignored`
    fn test_circuit_breaker_closed_to_open() {
        let mut agent = AutoProcessAgent::with_config(0.1, 0.99, 2, 5);

        // Initially Closed
        assert_eq!(agent.circuit_state(), CircuitState::Closed);
        assert!(agent.circuit_allows_request());

        // Record 2 failures to exceed threshold (2)
        agent.record_action_result(false);
        agent.record_action_result(false);
        agent.advance_circuit_breaker();

        // Should now be Open
        assert_eq!(agent.circuit_state(), CircuitState::Open);
        assert!(!agent.circuit_allows_request());
    }

    #[test]
    #[ignore] // Skip in normal test runs; run separately with `cargo test -- --ignored`
    fn test_circuit_breaker_open_to_halfopen() {
        let mut agent = AutoProcessAgent::with_config(0.1, 0.99, 2, 5);

        // Force Open
        agent.circuit_failure_count = 2;
        agent.circuit_state = CircuitState::Open;
        agent.circuit_open_at_step = 0;

        // Advance by less than timeout
        for _ in 0..4 {
            agent.advance_circuit_breaker();
        }
        assert_eq!(agent.circuit_state(), CircuitState::Open);

        // Advance past timeout
        agent.step_counter = 5; // Manually set to timeout threshold
        agent.advance_circuit_breaker();
        assert_eq!(agent.circuit_state(), CircuitState::HalfOpen);
        assert!(agent.circuit_allows_request()); // HalfOpen allows testing
    }

    /// Regression for CB-1 pattern (see `.claude/rules/ml-rl-testing.md`).
    ///
    /// Before the fix, Closed → Open required a caller-driven
    /// `advance_circuit_breaker()` tick after the failure threshold was met.
    /// A caller that only ran `record_action_result(false)` (e.g. because it
    /// had its own clock loop) would see the breaker stay Closed forever,
    /// contradicting the fail-fast doctrine.
    #[test]
    #[ignore] // Stack-intensive
    fn test_circuit_breaker_trips_without_advance_call() {
        let mut agent = AutoProcessAgent::with_config(0.1, 0.99, 3, 100);
        assert_eq!(agent.circuit_state(), CircuitState::Closed);

        // Record exactly `threshold` failures WITHOUT calling
        // advance_circuit_breaker.
        for _ in 0..3 {
            agent.record_action_result(false);
        }

        // Must be Open immediately, with no clock advancement needed.
        assert_eq!(
            agent.circuit_state(),
            CircuitState::Open,
            "Breaker must trip on threshold-reached failure even without an advance_circuit_breaker tick (CB-1 regression)"
        );
        assert!(!agent.circuit_allows_request());
    }

    #[test]
    #[ignore] // Skip in normal test runs; run separately with `cargo test -- --ignored`
    fn test_linucb_ucb_estimate() {
        let agent = AutoProcessAgent::new();
        let features = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8];
        let q_value = 0.5;

        let ucb = agent.linucb_ucb_estimate(q_value, &features);
        assert!(
            ucb >= q_value,
            "UCB should be >= Q-value (includes exploration bonus)"
        );
    }

    #[test]
    #[ignore] // Skip in normal test runs; run separately with `cargo test -- --ignored`
    fn test_run_cycle_nominal() {
        let mut agent = AutoProcessAgent::new();

        let state = RlState {
            health_level: 0,
            event_rate_q: 2,
            activity_count_q: 3,
            spc_alert_level: 0,
            drift_status: 0,
            rework_ratio_q: 1,
            circuit_state: 0,
            cycle_phase: 0,
        };

        let next_state = RlState {
            health_level: 0,
            event_rate_q: 2,
            activity_count_q: 3,
            spc_alert_level: 0,
            drift_status: 0,
            rework_ratio_q: 1,
            circuit_state: 0,
            cycle_phase: 1,
        };

        let features = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8];
        let reward = 0.5;

        let decision = agent.run_cycle(&state, &features, reward, &next_state, false, true, 0);

        // Verify decision has valid action
        assert!(matches!(
            decision.action,
            RlAction::Continue
                | RlAction::Scale
                | RlAction::Retry
                | RlAction::Fallback
                | RlAction::Restart
        ));

        // Guard should pass for valid state
        assert!(decision.guard_allowed);

        // Circuit should allow request (started in Closed state)
        assert!(decision.circuit_allowed);

        // Decision must carry a typed reason. With guard pass + circuit
        // allowed, the reason should be one of the base explore/exploit
        // values, never a protection override.
        assert!(
            matches!(
                decision.reason,
                DecisionReason::Explored | DecisionReason::Exploited
            ),
            "nominal cycle must report Explored or Exploited, got {:?}",
            decision.reason
        );
    }

    /// `DecisionReason::label()` returns stable, allocation-free identifiers
    /// suitable for OTEL span attributes — pin them down so a future enum
    /// reshuffle does not silently change span semantics.
    #[test]
    fn test_decision_reason_labels_are_stable() {
        assert_eq!(DecisionReason::Explored.label(), "explored");
        assert_eq!(DecisionReason::Exploited.label(), "exploited");
        assert_eq!(DecisionReason::CircuitBlocked.label(), "circuit_blocked");
        assert_eq!(DecisionReason::GuardViolation.label(), "guard_violation");
    }
}
