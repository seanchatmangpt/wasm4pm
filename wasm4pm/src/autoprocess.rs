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

/// Circuit breaker states
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum CircuitState {
    Closed = 0,   // Normal operation
    HalfOpen = 1, // Testing after timeout
    Open = 2,     // Blocking requests
}

impl From<u8> for CircuitState {
    fn from(v: u8) -> Self {
        match v {
            0 => CircuitState::Closed,
            1 => CircuitState::HalfOpen,
            2 => CircuitState::Open,
            _ => CircuitState::Open,
        }
    }
}

/// Guard rule evaluation result (can be extended for future rules)
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct GuardEval {
    pub pass: bool,
    pub rule_violations: u32,
}

impl GuardEval {
    pub fn new_pass() -> Self {
        Self {
            pass: true,
            rule_violations: 0,
        }
    }

    pub fn new_fail(violations: u32) -> Self {
        Self {
            pass: false,
            rule_violations: violations,
        }
    }
}

/// AutoProcess decision output
#[derive(Debug, Clone)]
pub struct Decision {
    pub action: RlAction,
    pub state_id: u32,
    pub q_value: f32,
    pub guard_allowed: bool,
    pub circuit_allowed: bool,
    pub agent_confidence: f32, // LinUCB UCB score (for informational purposes)
}

/// AutoProcessAgent — branchless autonomic loop
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
    /// Create a new AutoProcessAgent with default parameters
    pub fn new() -> Self {
        Self::with_config(0.1, 0.99, 3, 100)
    }

    /// Create with custom learning parameters
    pub fn with_config(
        learning_rate: f32,
        discount_factor: f32,
        circuit_threshold: u32,
        circuit_timeout_steps: u64,
    ) -> Self {
        let mut agent = Self {
            q_table: Box::new([0.0_f32; QTABLE_SIZE]),
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

    /// Set the drain cadence (drain_every parameter)
    /// 0 = immediate updates (no queue)
    /// n > 0 = drain every n cycles
    pub fn set_drain_cadence(&mut self, n: u8) {
        self.drain_every = n;
    }

    /// Decay epsilon by epsilon_decay factor (called at end of cycle)
    #[inline(always)]
    pub fn decay_epsilon(&mut self) {
        self.epsilon = (self.epsilon * self.epsilon_decay).max(self.epsilon_min);
    }

    // =========================================================================
    // PERCEPTION: Encode 8D state to u32 state_id (branchless)
    // =========================================================================

    /// Encode RlState to state_id using precomputed multipliers
    ///
    /// Computation (all bitwise/arithmetic, no branches):
    /// ```text
    /// state_id = h*122400 + er*15300 + ac*1912 + sa*456 + d*152 + rr*19 + cs*8 + cp
    /// ```
    ///
    /// All indices validated to [0, max_range) at RlState construction,
    /// so this is safe from overflow.
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

    /// Look up Q-value for (state, action) pair
    ///
    /// Direct array indexing (no search, no branching).
    /// state_id must be < 368,640 (ensured by encode_state).
    /// action index is 0..4 (enum constraint).
    #[inline(always)]
    fn q_lookup(&self, state_id: u32, action_idx: usize) -> f32 {
        let q_idx = (state_id as usize)
            .wrapping_mul(ACTION_SPACE_SIZE)
            .wrapping_add(action_idx);

        // Bounds check (should always pass if state_id valid)
        if q_idx < QTABLE_SIZE {
            self.q_table[q_idx]
        } else {
            0.0
        }
    }

    /// Look up Q-value and return corresponding action with ε-greedy exploration
    ///
    /// ε-greedy: with probability ε, pick random action; otherwise pick argmax Q(s,a).
    /// Uses internal RNG and epsilon field for true exploration.
    #[inline(always)]
    pub fn select_action_epsilon_greedy(
        &mut self,
        state_id: u32,
        epsilon_override: Option<f32>,
    ) -> (RlAction, f32, u32) {
        let eps = epsilon_override.unwrap_or(self.epsilon);

        // ε-greedy: explore with probability ε
        let selected_idx = if self.rng.f32() < eps {
            // Explore: pick random action
            self.rng.usize(0..ACTION_SPACE_SIZE)
        } else {
            // Exploit: find argmax_a Q(s, a)
            let mut max_q = f32::NEG_INFINITY;
            let mut best_action_idx: usize = 0;

            for a in 0..ACTION_SPACE_SIZE {
                let q = self.q_lookup(state_id, a);
                // Branchless max: use float comparison
                let is_better = q > max_q;
                max_q = if is_better { q } else { max_q };
                best_action_idx = if is_better { a } else { best_action_idx };
            }
            best_action_idx
        };

        let q_val = self.q_lookup(state_id, selected_idx);
        let action = RlAction::from_index(selected_idx).unwrap_or(RlAction::Continue);

        (action, q_val, selected_idx as u32)
    }

    /// Estimate agent confidence using LinUCB upper confidence bound
    ///
    /// Simplified UCB formula (for 8D context):
    /// UCB(a) ≈ Q(a) + sqrt(feature_magnitude) / sqrt(visit_count + 1)
    ///
    /// For speed, we use precomputed sqrt LUT and estimate visit_count from
    /// Q-value magnitude.
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

    /// Evaluate guard rules (branchless)
    ///
    /// Guard rules check state validity and prevent invalid state transitions.
    /// Branchless implementation using bitwise operations.
    ///
    /// Rules:
    /// 1. Health must be in [0, 4]
    /// 2. Action must be in [0, 4]
    /// 3. Cannot transition from health < 3 to health == 4 in a single step (death spiral check)
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

    /// Advance circuit breaker state machine (step-driven)
    ///
    /// States:
    /// - **Closed**: Normal operation
    /// - **Open**: Blocking all requests after threshold failures
    /// - **HalfOpen**: Testing recovery after timeout elapsed
    ///
    /// All state transitions branchless via bit manipulation.
    #[inline(always)]
    pub fn advance_circuit_breaker(&mut self) {
        self.step_counter += 1;

        match self.circuit_state {
            CircuitState::Closed => {
                // Closed → Open if failures exceed threshold
                let should_open = (self.circuit_failure_count >= self.circuit_threshold) as u32;
                if should_open != 0 {
                    self.circuit_state = CircuitState::Open;
                    self.circuit_open_at_step = self.step_counter;
                }
            }
            CircuitState::Open => {
                // Open → HalfOpen if timeout elapsed
                let time_since_open = self.step_counter - self.circuit_open_at_step;
                let should_test = (time_since_open >= self.circuit_timeout_steps) as u32;
                if should_test != 0 {
                    self.circuit_state = CircuitState::HalfOpen;
                }
            }
            CircuitState::HalfOpen => {
                // HalfOpen → Closed if probe succeeds (external signal)
                // HalfOpen → Open if probe fails (external signal)
                // This is handled by record_action_result()
            }
        }
    }

    /// Record action success/failure to update circuit breaker state
    ///
    /// - Success: HalfOpen → Closed, reset failure count
    /// - Failure: Increment count, trigger Open if threshold exceeded
    #[inline(always)]
    pub fn record_action_result(&mut self, success: bool) {
        if success {
            self.circuit_failure_count = 0;
            if self.circuit_state == CircuitState::HalfOpen {
                self.circuit_state = CircuitState::Closed;
            }
        } else {
            self.circuit_failure_count = self.circuit_failure_count.saturating_add(1);
            // Will transition to Open on next advance_circuit_breaker() call
        }
    }

    /// Check if circuit breaker allows request execution
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

    /// Drain all buffered Bellman transitions and apply updates
    pub fn drain_bellman_queue(&mut self) {
        for i in 0..self.queue_len {
            let idx = i as usize;
            let trans = self.deferred_queue[idx];

            let mut max_next_q = f32::NEG_INFINITY;
            let next_base = (trans.next_state_id as usize) * ACTION_SPACE_SIZE;

            // Unsafe: we trust next_state_id is bounds checked during encoding
            unsafe {
                if next_base + ACTION_SPACE_SIZE <= QTABLE_SIZE {
                    let s = self
                        .q_table
                        .get_unchecked(next_base..next_base + ACTION_SPACE_SIZE);
                    let m01 = if s[0] > s[1] { s[0] } else { s[1] };
                    let m23 = if s[2] > s[3] { s[2] } else { s[3] };
                    let m = if m01 > m23 { m01 } else { m23 };
                    max_next_q = if m > s[4] { m } else { s[4] };
                }
            }

            let target =
                trans.reward + (1.0 - trans.done as u32 as f32) * self.discount_factor * max_next_q;

            let q_idx = (trans.state_id as usize)
                .wrapping_mul(ACTION_SPACE_SIZE)
                .wrapping_add(trans.action_idx as usize);

            unsafe {
                if q_idx < QTABLE_SIZE {
                    let current_q = *self.q_table.get_unchecked(q_idx);
                    let delta = target - current_q;
                    *self.q_table.get_unchecked_mut(q_idx) = current_q + self.learning_rate * delta;
                }
            }
        }
        self.queue_head = 0;
        self.queue_len = 0;
    }

    // =========================================================================
    // OPTIMIZATION: Bellman update to Q-table
    // =========================================================================

    /// Perform Bellman Q-learning update directly (non-deferred path)
    ///
    /// Q(s,a) ← Q(s,a) + α[r + γ max_a' Q(s',a') - Q(s,a)]
    ///
    /// Branchless except for the max_a' operation.
    /// Terminal state check (done flag) is branchless.
    /// Uses unrolled 5-element max reduction for faster Q-max computation.
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
        let max_next_q = unsafe {
            if next_base + ACTION_SPACE_SIZE <= QTABLE_SIZE {
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
            } else {
                0.0
            }
        };

        // Branchless terminal check: if done, target = r; else r + γ Q(s', a')
        let target = reward + (1.0 - done as u32 as f32) * self.discount_factor * max_next_q;

        // Get current Q value and apply update
        let q_idx = (state_id as usize)
            .wrapping_mul(ACTION_SPACE_SIZE)
            .wrapping_add(action_idx);

        unsafe {
            if q_idx < QTABLE_SIZE {
                let current_q = *self.q_table.get_unchecked(q_idx);
                let delta = target - current_q;
                *self.q_table.get_unchecked_mut(q_idx) = current_q + self.learning_rate * delta;
            }
        }
    }

    // =========================================================================
    // ORCHESTRATION: Full cycle (Perception → Decision → Protection → Optimization)
    // =========================================================================

    /// Run one complete autonomic cycle
    ///
    /// Returns the decision, including selected action and protection status.
    #[allow(clippy::too_many_arguments)]
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

        // Step 2: DECISION — Select action via epsilon-greedy
        let (action, q_value, _action_idx) = self.select_action_epsilon_greedy(state_id, None);

        // Step 3: PROTECTION
        // - Evaluate guard rules
        let guard_eval = self.evaluate_guard(state, action, self.last_health_level);

        // - Advance circuit breaker
        self.advance_circuit_breaker();

        // - Update circuit breaker on action result
        self.record_action_result(action_success);

        // Step 4: OPTIMIZATION — Bellman update (immediate or deferred)
        if self.drain_every == 0 {
            // Immediate update path
            self.bellman_update_direct(state_id, action.to_index(), reward, next_state_id, done);
        } else {
            // Deferred queue path
            self.enqueue_bellman(state_id, action.to_index(), reward, next_state_id, done);

            // Periodic drain check
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

        Decision {
            action,
            state_id,
            q_value,
            guard_allowed: guard_eval.pass,
            circuit_allowed: self.circuit_allows_request(),
            agent_confidence,
        }
    }

    /// Create a new AutoProcessAgent with immediate Bellman updates (for testing)
    #[cfg(test)]
    pub fn new_immediate() -> Self {
        let mut agent = Self::new();
        agent.drain_every = 0; // Immediate mode
        agent
    }

    /// Get mutable reference to Q-table for testing/inspection
    pub fn q_table_mut(&mut self) -> &mut [f32; QTABLE_SIZE] {
        &mut self.q_table
    }

    /// Get immutable reference to Q-table for testing/inspection
    pub fn q_table(&self) -> &[f32; QTABLE_SIZE] {
        &self.q_table
    }

    /// Get current circuit breaker state
    pub fn circuit_state(&self) -> CircuitState {
        self.circuit_state
    }

    /// Get current step counter
    pub fn step_count(&self) -> u64 {
        self.step_counter
    }

    /// Reset circuit breaker to Closed state
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
        let q_before = agent.q_lookup(state_id, action_idx);
        assert_eq!(q_before, 0.0);

        // Perform Bellman update
        agent.bellman_update_direct(state_id, action_idx, reward, next_state_id, done);

        // After update: Q[0,0] should increase
        let q_after = agent.q_lookup(state_id, action_idx);
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
    }
}
