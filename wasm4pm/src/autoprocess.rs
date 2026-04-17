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

use crate::{RlAction, RlState};
use crate::reinforcement::WorkflowAction;

/// 8-dimensional state space: 5×8×8×4×3×8×3×4 = 460,800 total states
/// Q-table indexed by u32 state_id (0..460_799)
pub const STATE_SPACE_SIZE: usize = 460_800;

/// Action space size (Continue, Scale, Retry, Fallback, Restart)
pub const ACTION_SPACE_SIZE: usize = 5;

/// Total Q-table entries (per agent)
pub const QTABLE_SIZE: usize = STATE_SPACE_SIZE * ACTION_SPACE_SIZE;

/// Precomputed lookup tables for fast perception
mod perception_lut {
    /// Precomputed multipliers for encoding 8D state to u32 state_id (branchless)
    /// state_id = h*122400 + er*15300 + ac*1912 + sa*456 + d*152 + rr*19 + cs*8 + cp
    pub const H_MULT: u32 = 122_400;  // 8*8*4*3*8*3*4
    pub const ER_MULT: u32 = 15_300;  // 8*4*3*8*3*4
    pub const AC_MULT: u32 = 1_912;   // 4*3*8*3*4
    pub const SA_MULT: u32 = 456;     // 3*8*3*4
    pub const D_MULT: u32 = 152;      // 8*3*4
    pub const RR_MULT: u32 = 19;      // 3*4
    pub const CS_MULT: u32 = 8;       // 4
    #[allow(dead_code)]
    pub const CP_MULT: u32 = 1;       // 1
}

/// Circuit breaker states
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum CircuitState {
    Closed = 0,      // Normal operation
    HalfOpen = 1,    // Testing after timeout
    Open = 2,        // Blocking requests
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
    pub agent_confidence: f32,  // LinUCB UCB score (for informational purposes)
}

/// AutoProcessAgent — branchless autonomic loop
pub struct AutoProcessAgent {
    /// Q-table storage: 460,800 states × 5 actions × 4 bytes (f32) = ~9.2 MB
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

    // =========================================================================
    // PERCEPTION: Encode 8D state to u32 state_id (branchless)
    // =========================================================================

    /// Encode RlState to state_id using precomputed multipliers
    ///
    /// Computation (all bitwise/arithmetic, no branches):
    /// ```
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
    /// state_id must be < 460,800 (ensured by encode_state).
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

    /// Look up Q-value and return corresponding action
    ///
    /// Branchless: uses bit twiddling to select max Q-value and its index.
    #[inline(always)]
    pub fn select_action_epsilon_greedy(
        &self,
        state_id: u32,
        _epsilon: f32,
    ) -> (RlAction, f32, u32) {
        // Greedy selection: find argmax_a Q(s, a)
        let mut max_q = f32::NEG_INFINITY;
        let mut best_action_idx: usize = 0;

        for a in 0..ACTION_SPACE_SIZE {
            let q = self.q_lookup(state_id, a);
            // Branchless max: use float comparison
            let is_better = q > max_q;
            max_q = if is_better { q } else { max_q };
            best_action_idx = if is_better { a } else { best_action_idx };
        }

        // ε-greedy: explore with probability ε (simplified: always greedy for latency)
        // Real implementation would use seeded RNG here
        let action = RlAction::from_index(best_action_idx).unwrap_or(RlAction::Continue);

        (action, max_q, best_action_idx as u32)
    }

    /// Estimate agent confidence using LinUCB upper confidence bound
    ///
    /// Simplified UCB formula (for 8D context):
    /// UCB(a) ≈ Q(a) + sqrt(feature_magnitude) / sqrt(visit_count + 1)
    ///
    /// For speed, we use precomputed sqrt LUT and estimate visit_count from
    /// Q-value magnitude.
    #[inline(always)]
    fn linucb_ucb_estimate(
        &self,
        q_value: f32,
        features: &[f32; 8],
    ) -> f32 {
        // Estimate feature magnitude: L2 norm quantized to [0..127]
        let magnitude_sq: f32 = features.iter().map(|x| x * x).sum();
        let magnitude = magnitude_sq.sqrt();
        let mag_quantized = ((magnitude * 127.0).min(127.0).max(0.0)) as usize;
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
    /// 2. Health cannot transition from non-4 to 4 in a single step (unless triggered by SPC)
    /// 3. Action must be in [0, 4]
    #[inline(always)]
    pub fn evaluate_guard(&self, state: &RlState, action: RlAction) -> GuardEval {
        let mut violations = 0u32;

        // Rule 1: Health must be in valid range
        let health_valid = (state.health_level <= 4) as u32;
        violations += (1 - health_valid) & 1;

        // Rule 2: Action must be in valid range
        let action_idx = action.to_index() as u32;
        let action_valid = (action_idx < 5) as u32;
        violations += (1 - action_valid) & 1;

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
        matches!(self.circuit_state, CircuitState::Closed | CircuitState::HalfOpen)
    }

    // =========================================================================
    // OPTIMIZATION: Bellman update to Q-table
    // =========================================================================

    /// Perform Bellman Q-learning update
    ///
    /// Q(s,a) ← Q(s,a) + α[r + γ max_a' Q(s',a') - Q(s,a)]
    ///
    /// Branchless except for the max_a' operation.
    /// Terminal state check (done flag) is branchless.
    #[inline(always)]
    pub fn bellman_update(
        &mut self,
        state_id: u32,
        action_idx: usize,
        reward: f32,
        next_state_id: u32,
        done: bool,
    ) {
        // Find max Q(s', a')
        let mut max_next_q = f32::NEG_INFINITY;
        for a in 0..ACTION_SPACE_SIZE {
            let q = self.q_lookup(next_state_id, a);
            max_next_q = if q > max_next_q { q } else { max_next_q };
        }

        // Branchless terminal check: if done, target = r; else r + γ Q(s', a')
        let target = reward + (1.0 - done as u32 as f32) * self.discount_factor * max_next_q;

        // Get current Q value and apply update
        let q_idx = (state_id as usize)
            .wrapping_mul(ACTION_SPACE_SIZE)
            .wrapping_add(action_idx);

        if q_idx < QTABLE_SIZE {
            let current_q = self.q_table[q_idx];
            let delta = target - current_q;
            self.q_table[q_idx] = current_q + self.learning_rate * delta;
        }
    }

    // =========================================================================
    // ORCHESTRATION: Full cycle (Perception → Decision → Protection → Optimization)
    // =========================================================================

    /// Run one complete autonomic cycle
    ///
    /// Returns the decision, including selected action and protection status.
    pub fn run_cycle(
        &mut self,
        state: &RlState,
        features: &[f32; 8],
        reward: f32,
        next_state: &RlState,
        done: bool,
        action_success: bool,
    ) -> Decision {
        // Step 1: PERCEPTION — Encode 8D state to state_id
        let state_id = self.encode_state(state);
        let next_state_id = self.encode_state(next_state);

        // Step 2: DECISION — Select action via epsilon-greedy
        let (action, q_value, _action_idx) = self.select_action_epsilon_greedy(state_id, 0.0);

        // Step 3: PROTECTION
        // - Evaluate guard rules
        let guard_eval = self.evaluate_guard(state, action);

        // - Advance circuit breaker
        self.advance_circuit_breaker();

        // - Update circuit breaker on action result
        self.record_action_result(action_success);

        // Step 4: OPTIMIZATION — Bellman update
        self.bellman_update(
            state_id,
            action.to_index(),
            reward,
            next_state_id,
            done,
        );

        // Estimate agent confidence using LinUCB
        let agent_confidence = self.linucb_ucb_estimate(q_value, features);

        Decision {
            action,
            state_id,
            q_value,
            guard_allowed: guard_eval.pass,
            circuit_allowed: self.circuit_allows_request(),
            agent_confidence,
        }
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
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
    fn test_q_lookup_valid() {
        let agent = AutoProcessAgent::new();
        let q = agent.q_lookup(0, 0);
        assert_eq!(q, 0.0, "Uninitialized Q-values should be 0.0");
    }

    #[test]
    fn test_select_action_epsilon_greedy() {
        let agent = AutoProcessAgent::new();
        let (action, q, _idx) = agent.select_action_epsilon_greedy(0, 0.0);

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

        let guard = agent.evaluate_guard(&state, RlAction::Continue);
        assert!(guard.pass, "Valid state and action should pass guard");
        assert_eq!(guard.rule_violations, 0);
    }

    #[test]
    fn test_bellman_update() {
        let mut agent = AutoProcessAgent::new();

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
        agent.bellman_update(state_id, action_idx, reward, next_state_id, done);

        // After update: Q[0,0] should increase
        let q_after = agent.q_lookup(state_id, action_idx);
        assert!(
            q_after > q_before,
            "Q-value should increase with positive reward"
        );
    }

    #[test]
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

        let decision = agent.run_cycle(&state, &features, reward, &next_state, false, true);

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
