//! RL Orchestrator — persistent state hub for the autonomic loop.
//!
//! Holds all 5 RL agents, manages agent selection (manual or via LinUCB),
//! computes reward from SPC feedback, and provides trait-polymorphic dispatch
//! to the currently active agent.

use crate::ml::LinUCBAgent;
use crate::reinforcement::{
    Agent, DoubleQLearning, ExpectedSARSAAgent, QLearning, ReinforceAgent, SARSAAgent,
};

// Re-export the RlState/RlAction types from lib.rs (they are pub(crate)).
// We use the concrete types directly since this module is in the same crate.
use crate::{RlAction, RlState};

/// Stable, allocation-free label for an `RlAction`. Used in telemetry to
/// avoid `format!("{:?}", action)` per cycle.
#[inline]
fn action_label(action: RlAction) -> &'static str {
    match action {
        RlAction::Continue => "Continue",
        RlAction::Scale => "Scale",
        RlAction::Retry => "Retry",
        RlAction::Fallback => "Fallback",
        RlAction::Restart => "Restart",
    }
}

/// Which RL algorithm is currently active.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum AgentType {
    QLearning = 0,
    SARSA = 1,
    DoubleQLearning = 2,
    ExpectedSARSA = 3,
    REINFORCE = 4,
}

impl AgentType {
    pub const COUNT: usize = 5;

    pub fn from_u8(v: u8) -> Option<Self> {
        match v {
            0 => Some(AgentType::QLearning),
            1 => Some(AgentType::SARSA),
            2 => Some(AgentType::DoubleQLearning),
            3 => Some(AgentType::ExpectedSARSA),
            4 => Some(AgentType::REINFORCE),
            _ => None,
        }
    }

    pub fn name(&self) -> &'static str {
        match self {
            AgentType::QLearning => "QLearning",
            AgentType::SARSA => "SARSA",
            AgentType::DoubleQLearning => "DoubleQLearning",
            AgentType::ExpectedSARSA => "ExpectedSARSA",
            AgentType::REINFORCE => "REINFORCE",
        }
    }
}

/// Cycle telemetry — persisted across cycles for reward computation.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct CycleTelemetry {
    pub cycle_count: u64,
    pub last_health_state: u8,
    pub last_action_label: String,
    pub last_spc_alert_count: usize,
    pub last_guard_pass: bool,
    pub last_circuit_allowed: bool,
    pub cumulative_reward: f32,
    pub last_reward: f32,
    pub active_agent_name: String,
    pub consecutive_successes: u32, // Track consecutive successes for health improvement eligibility
}

impl Default for CycleTelemetry {
    fn default() -> Self {
        Self {
            cycle_count: 0,
            last_health_state: 0,
            last_action_label: String::new(),
            last_spc_alert_count: 0,
            last_guard_pass: false,
            last_circuit_allowed: false,
            cumulative_reward: 0.0,
            last_reward: 0.0,
            active_agent_name: "QLearning".to_string(),
            consecutive_successes: 0,
        }
    }
}

/// Compute health state from perception metrics.
///
/// Health state (5-level: 0=Normal, 1=Warning, 2=Degraded, 3=Critical, 4=Failed)
///   0 (Normal)    : Healthy log with multiple activities
///   1 (Warning)   : Reserved for future use (SPC-based warnings)
///   2 (Degraded)  : Trivial log (single activity, < 5 events)
///   3 (Critical)  : No traces
///   4 (Failed)    : Empty log or no activities
///
/// This function extracts the health computation logic from perception
/// so it can be reused to compute the "next state" after cycle completion.
pub fn compute_health_state(event_count: u64, trace_count: u64, unique_activities: u64) -> u8 {
    if event_count == 0 || unique_activities == 0 {
        4 // Failed: empty log or no activities
    } else if trace_count == 0 {
        3 // Critical: no traces
    } else if unique_activities == 1 && event_count < 5 {
        2 // Degraded: trivial log
    } else if unique_activities <= 2 && event_count < 20 {
        1 // Warning: sparse log
    } else {
        0 // Normal
    }
}

/// Compute reward signal from SPC alert count and health transition.
///
/// Reward semantics:
///   +1.0  : Health improved (lower health_state number) AND no SPC alerts
///   +0.2  : Health stable AND no SPC alerts
///    0.0  : Baseline (neutral)
///   -0.5  : SPC alerts detected (process instability)
///   -1.0  : Health degraded (higher health_state number)
///   -2.0  : Terminal state reached (health == 4 = Failed)
///   -0.3  : Cycle latency exceeded budget (added to total)
///
/// Bounded range: approximately [-5.3, +1.1]
pub fn compute_reward(
    prev_health: u8,
    curr_health: u8,
    spc_alert_count: usize,
    guard_pass: bool,
    circuit_allowed: bool,
    latency_budget_exceeded: bool,
) -> f32 {
    let mut reward = 0.0_f32;

    // Health improvement/stability component
    if curr_health < prev_health {
        reward += 1.0; // health improved
    } else if curr_health == prev_health {
        reward += 0.2; // stable
    } else {
        reward -= 1.0; // health degraded
    }

    // SPC penalty: each special cause signal is a -0.3 penalty (bounded by -1.5)
    reward -= (spc_alert_count as f32 * 0.3).min(1.5);

    // Guard/circuit bonus/penalty
    if guard_pass && circuit_allowed {
        reward += 0.1;
    } else {
        reward -= 0.5;
    }

    // Latency budget penalty
    if latency_budget_exceeded {
        reward -= 0.3;
    }

    // Terminal penalty
    if curr_health == 4 {
        reward -= 2.0;
    }

    reward
}

/// The RL Orchestrator — holds all agents, dispatches to active one.
pub struct RlOrchestrator {
    q_learning: QLearning<RlState, RlAction>,
    sarsa: SARSAAgent<RlState, RlAction>,
    double_q: DoubleQLearning<RlState, RlAction>,
    expected_sarsa: ExpectedSARSAAgent<RlState, RlAction>,
    reinforce: ReinforceAgent<RlState, RlAction>,
    active_agent: AgentType,
    linucb: LinUCBAgent,
    telemetry: CycleTelemetry,
    use_linucb_for_selection: bool,
}

impl Default for RlOrchestrator {
    fn default() -> Self {
        Self::new()
    }
}

impl RlOrchestrator {
    pub fn new() -> Self {
        Self {
            q_learning: QLearning::new(),
            sarsa: SARSAAgent::new(),
            double_q: DoubleQLearning::new(),
            expected_sarsa: ExpectedSARSAAgent::new(),
            reinforce: ReinforceAgent::new(),
            active_agent: AgentType::QLearning,
            linucb: LinUCBAgent::new(),
            telemetry: CycleTelemetry::default(),
            use_linucb_for_selection: false,
        }
    }

    /// Create orchestrator with seeded RNG for all 5 RL agents.
    /// Each agent gets a unique seed derived from the base seed.
    #[allow(dead_code)]
    pub fn new_with_seed(seed: u64) -> Self {
        Self {
            q_learning: QLearning::new_with_seed(0.1, 0.99, seed),
            sarsa: SARSAAgent::new_with_seed(0.1, 0.99, seed.wrapping_add(1)),
            double_q: DoubleQLearning::new_with_seed(0.1, 0.99, seed.wrapping_add(2)),
            expected_sarsa: ExpectedSARSAAgent::new_with_seed(0.1, 0.99, seed.wrapping_add(3)),
            reinforce: ReinforceAgent::new_with_seed(0.01, 0.99, seed.wrapping_add(4)),
            active_agent: AgentType::QLearning,
            linucb: LinUCBAgent::new(),
            telemetry: CycleTelemetry::default(),
            use_linucb_for_selection: false,
        }
    }

    /// Switch the active RL algorithm.
    pub fn switch_agent(&mut self, agent_type: AgentType) {
        self.active_agent = agent_type;
        self.telemetry.active_agent_name = agent_type.name().to_string();
    }

    /// Get the currently active agent type.
    pub fn active_agent(&self) -> AgentType {
        self.active_agent
    }

    /// Get telemetry snapshot.
    pub fn telemetry(&self) -> &CycleTelemetry {
        &self.telemetry
    }

    /// Select action using the active RL agent.
    pub fn select_action(&self, state: &RlState) -> RlAction {
        match self.active_agent {
            AgentType::QLearning => Agent::select_action(&self.q_learning, state),
            AgentType::SARSA => Agent::select_action(&self.sarsa, state),
            AgentType::DoubleQLearning => Agent::select_action(&self.double_q, state),
            AgentType::ExpectedSARSA => Agent::select_action(&self.expected_sarsa, state),
            AgentType::REINFORCE => Agent::select_action(&self.reinforce, state),
        }
    }

    /// Update the active RL agent with reward signal.
    pub fn update(
        &self,
        state: &RlState,
        action: &RlAction,
        reward: f32,
        next_state: &RlState,
        done: bool,
    ) {
        match self.active_agent {
            AgentType::QLearning => {
                Agent::update(&self.q_learning, state, action, reward, next_state, done)
            }
            AgentType::SARSA => Agent::update(&self.sarsa, state, action, reward, next_state, done),
            AgentType::DoubleQLearning => {
                Agent::update(&self.double_q, state, action, reward, next_state, done)
            }
            AgentType::ExpectedSARSA => Agent::update(
                &self.expected_sarsa,
                state,
                action,
                reward,
                next_state,
                done,
            ),
            AgentType::REINFORCE => {
                Agent::update(&self.reinforce, state, action, reward, next_state, done)
            }
        }
    }

    /// Decay exploration on the active agent.
    pub fn decay_exploration(&mut self) {
        match self.active_agent {
            AgentType::QLearning => self.q_learning.decay_exploration(),
            AgentType::SARSA => self.sarsa.decay_exploration(),
            AgentType::DoubleQLearning => self.double_q.decay_exploration(),
            AgentType::ExpectedSARSA => self.expected_sarsa.decay_exploration(),
            AgentType::REINFORCE => {} // no-op for policy gradient
        }
    }

    /// Set exploration rate on all agents (for MAPE-K action dispatch).
    pub fn set_exploration_rate(&mut self, rate: f32) {
        self.q_learning.set_exploration_rate(rate);
        self.sarsa.set_exploration_rate(rate);
        self.double_q.set_exploration_rate(rate);
        self.expected_sarsa.set_exploration_rate(rate);
        self.reinforce.set_exploration_rate(rate);
    }

    /// Reset all exploration rates to default (1.0) — used by Restart action.
    pub fn reset_all_exploration_rates(&mut self) {
        self.set_exploration_rate(1.0);
    }

    /// Use LinUCB to recommend which RL agent to use based on features.
    /// Maps LinUCB actions 0..4 to AgentType.
    pub fn linucb_select_agent(&mut self, features: &[f32; 8]) -> AgentType {
        let (action_idx, _score) = self.linucb.select(features);
        // action_idx is now 0..4 (directly maps to agents)
        AgentType::from_u8(action_idx as u8).unwrap_or(AgentType::QLearning)
    }

    /// Update LinUCB with reward for the current agent selection.
    pub fn linucb_update(&mut self, features: &[f32; 8], reward: f32) {
        let action_idx = self.active_agent as u32;
        self.linucb.update(features, action_idx, reward);
    }

    /// Enable/disable LinUCB-based agent selection.
    pub fn set_linucb_selection(&mut self, enabled: bool) {
        self.use_linucb_for_selection = enabled;
    }

    /// Check if LinUCB-based selection is enabled.
    pub fn linucb_selection_enabled(&self) -> bool {
        self.use_linucb_for_selection
    }

    /// Restore telemetry from a serialized snapshot.
    ///
    /// Used by `restore_rl_state` to resume learning progress across sessions.
    /// Note: Q-tables are NOT restored (agents start fresh) — only the
    /// cycle count, cumulative reward, and metadata are preserved.
    pub fn restore_telemetry(&mut self, telemetry: CycleTelemetry) {
        self.telemetry = telemetry;
    }

    /// Get mutable reference to telemetry (for restoration).
    pub fn telemetry_mut(&mut self) -> &mut CycleTelemetry {
        &mut self.telemetry
    }

    /// Run one full cycle: select agent (if LinUCB enabled), select action,
    /// compute reward, update agent, update telemetry.
    ///
    /// # Parameters
    /// - `features`: Current perception feature vector
    /// - `state`: Current health state (before cycle actions)
    /// - `next_state`: Health state AFTER cycle actions complete
    /// - `spc_alert_count`: Number of SPC violations detected
    /// - `guard_pass`: Whether pre-action guard passed
    /// - `circuit_allowed`: Whether circuit breaker allowed execution
    /// - `latency_budget_exceeded`: Whether cycle latency exceeded budget
    ///
    /// Returns (action_label, reward).
    #[allow(clippy::too_many_arguments)]
    pub fn run_cycle(
        &mut self,
        features: &[f32; 8],
        state: &RlState,
        next_state: &RlState,
        spc_alert_count: usize,
        guard_pass: bool,
        circuit_allowed: bool,
        latency_budget_exceeded: bool,
    ) -> (String, f32) {
        // LinUCB agent selection (if enabled)
        if self.use_linucb_for_selection {
            let recommended = self.linucb_select_agent(features);
            self.switch_agent(recommended);
        }

        // Select action based on CURRENT state.
        // Use the static `action_label()` helper to avoid `format!("{:?}", ..)`
        // allocation per cycle. We still incur exactly one `String` allocation
        // (for telemetry storage + return), down from two previously.
        let action = self.select_action(state);
        let action_label_str: &'static str = action_label(action);

        // On first cycle, initialize prev_health from current state
        // to avoid reward mismatch (default last_health_state=0)
        if self.telemetry.cycle_count == 0 {
            self.telemetry.last_health_state = state.health_level;
        }

        // Compute reward based on health transition (prev -> next)
        let prev_health = self.telemetry.last_health_state;
        let curr_health = next_state.health_level; // Use NEXT state for reward computation
        let reward = compute_reward(
            prev_health,
            curr_health,
            spc_alert_count,
            guard_pass,
            circuit_allowed,
            latency_budget_exceeded,
        );

        // For SARSA: pre-select action for next_state so the update uses the
        // correct on-policy next action a' = π(s'). This must happen BEFORE
        // the update call because SARSA's update reads last_action to get a'.
        // For other agents (QLearning, DoubleQ, etc.) this is a no-op since
        // they don't use last_action.
        // (SARSA stale action bug fix)
        let done = curr_health == 4;
        if !done {
            self.select_action(next_state);
        }

        // Update agent with proper state transition (state -> next_state)
        self.update(state, &action, reward, next_state, done);

        // Update LinUCB
        self.linucb_update(features, reward);

        // Decay exploration
        self.decay_exploration();

        // Update telemetry with NEXT state (post-cycle)
        self.telemetry.cycle_count += 1;
        self.telemetry.last_health_state = curr_health;
        self.telemetry.last_action_label.clear();
        self.telemetry.last_action_label.push_str(action_label_str);
        self.telemetry.last_spc_alert_count = spc_alert_count;
        self.telemetry.last_guard_pass = guard_pass;
        self.telemetry.last_circuit_allowed = circuit_allowed;
        self.telemetry.cumulative_reward += reward;
        self.telemetry.last_reward = reward;

        // Track consecutive successes for health improvement eligibility.
        // saturating_add prevents pathological wraparound on extremely long
        // runs (>4 billion successful cycles).
        if guard_pass && circuit_allowed {
            self.telemetry.consecutive_successes =
                self.telemetry.consecutive_successes.saturating_add(1);
        } else {
            self.telemetry.consecutive_successes = 0; // Reset on failure
        }

        (action_label_str.to_string(), reward)
    }

    /// Export all Q-tables from all 5 agents as serialized format.
    pub fn export_all_q_tables(&self) -> Vec<crate::rl_state_serialization::SerializedAgentQTable> {
        vec![
            self.q_learning.export_as_serialized(0),
            self.sarsa.export_as_serialized(1),
            self.double_q.export_as_serialized(2),
            self.expected_sarsa.export_as_serialized(3),
            self.reinforce.export_as_serialized(4),
        ]
    }

    /// Restore all Q-tables to all 5 agents from serialized format.
    pub fn restore_all_q_tables(
        &self,
        tables: Vec<crate::rl_state_serialization::SerializedAgentQTable>,
    ) {
        for table in tables {
            match table.agent_type {
                0 => self.q_learning.restore_from_serialized(table),
                1 => self.sarsa.restore_from_serialized(table),
                2 => self.double_q.restore_from_serialized(table),
                3 => self.expected_sarsa.restore_from_serialized(table),
                4 => self.reinforce.restore_from_serialized(table),
                _ => {} // Unknown agent type, skip
            }
        }
    }
}

#[cfg(test)]
mod tests {
    //! Pure-function unit tests (Rank-1 mathematical oracles).
    //!
    //! These tests cover `compute_health_state`, `compute_reward`, and the
    //! `AgentType` enum mapping. They do not exercise the full orchestrator
    //! (those tests live in `tests/rl_orchestrator_tests.rs`); instead they
    //! pin down the documented contract of the pure helpers so refactors
    //! cannot silently change reward semantics.
    use super::*;

    // --- AgentType round-trip --------------------------------------------

    #[test]
    fn agent_type_round_trip_covers_all_variants() {
        for v in 0u8..(AgentType::COUNT as u8) {
            let a = AgentType::from_u8(v).expect("valid variant");
            assert_eq!(a as u8, v, "from_u8/as u8 must round-trip");
            assert!(!a.name().is_empty(), "name() must not be empty");
        }
        assert!(AgentType::from_u8(AgentType::COUNT as u8).is_none());
        assert!(AgentType::from_u8(255).is_none());
    }

    // --- compute_health_state --------------------------------------------

    #[test]
    fn health_state_failed_on_empty_log() {
        assert_eq!(compute_health_state(0, 0, 0), 4);
        assert_eq!(compute_health_state(10, 5, 0), 4); // no activities
        assert_eq!(compute_health_state(0, 5, 3), 4); // no events
    }

    #[test]
    fn health_state_critical_when_no_traces() {
        assert_eq!(compute_health_state(10, 0, 3), 3);
    }

    #[test]
    fn health_state_degraded_on_trivial_log() {
        // Single activity, < 5 events → Degraded (2)
        assert_eq!(compute_health_state(4, 1, 1), 2);
    }

    #[test]
    fn health_state_warning_on_sparse_log() {
        // <= 2 activities, < 20 events, but not trivial → Warning (1)
        assert_eq!(compute_health_state(10, 3, 2), 1);
    }

    #[test]
    fn health_state_normal_on_healthy_log() {
        assert_eq!(compute_health_state(100, 10, 5), 0);
    }

    // --- compute_reward: documented bounds ------------------------------

    /// Best case: health improves, no SPC, guard+circuit pass, in budget.
    #[test]
    fn reward_best_case_is_one_point_one() {
        let r = compute_reward(2, 1, 0, true, true, false);
        assert!((r - 1.1).abs() < 1e-6, "best case reward should be +1.1, got {}", r);
    }

    /// Worst case: health degrades to terminal, max SPC penalty, guard fail,
    /// latency exceeded. Per docstring: -5.3.
    #[test]
    fn reward_worst_case_is_negative_five_point_three() {
        // health 3 -> 4 (degrade + terminal), 5 SPC alerts (caps at -1.5),
        // guard fail, latency exceeded.
        let r = compute_reward(3, 4, 5, false, false, true);
        assert!((r - (-5.3)).abs() < 1e-6, "worst case reward should be -5.3, got {}", r);
    }

    #[test]
    fn reward_health_components_are_correct() {
        // Improved (curr < prev): +1.0 contribution
        let improved = compute_reward(2, 1, 0, true, true, false);
        // Stable (curr == prev): +0.2 contribution
        let stable = compute_reward(1, 1, 0, true, true, false);
        // Degraded (curr > prev, non-terminal): -1.0 contribution
        let degraded = compute_reward(1, 2, 0, true, true, false);

        // Differences are exactly 0.8 (1.0 vs 0.2) and 1.2 (0.2 vs -1.0).
        assert!((improved - stable - 0.8).abs() < 1e-6);
        assert!((stable - degraded - 1.2).abs() < 1e-6);
    }

    #[test]
    fn reward_spc_penalty_caps_at_one_point_five() {
        // 1 alert: -0.3; 5 alerts: capped at -1.5; 100 alerts: still -1.5.
        let r1 = compute_reward(1, 1, 1, true, true, false);
        let r5 = compute_reward(1, 1, 5, true, true, false);
        let r100 = compute_reward(1, 1, 100, true, true, false);
        assert!((r1 - (0.2 + 0.1 - 0.3)).abs() < 1e-6);
        assert!((r5 - (0.2 + 0.1 - 1.5)).abs() < 1e-6);
        assert!((r100 - r5).abs() < 1e-6, "SPC penalty must cap at -1.5");
    }

    #[test]
    fn reward_guard_circuit_penalty_only_when_either_fails() {
        let pass = compute_reward(1, 1, 0, true, true, false); // +0.1
        let guard_fail = compute_reward(1, 1, 0, false, true, false); // -0.5
        let ckt_fail = compute_reward(1, 1, 0, true, false, false); // -0.5
        let both_fail = compute_reward(1, 1, 0, false, false, false); // -0.5 (single penalty)
        assert!((pass - 0.3).abs() < 1e-6); // 0.2 (stable) + 0.1
        assert!((guard_fail - (-0.3)).abs() < 1e-6); // 0.2 - 0.5
        assert!((ckt_fail - (-0.3)).abs() < 1e-6);
        assert!((both_fail - (-0.3)).abs() < 1e-6);
    }

    #[test]
    fn reward_terminal_state_adds_two_point_zero_penalty() {
        // Same conditions, only difference is curr_health == 4 vs 3.
        // Both are degradations from health=2, so health component is -1.0.
        let non_terminal = compute_reward(2, 3, 0, true, true, false);
        let terminal = compute_reward(2, 4, 0, true, true, false);
        assert!((non_terminal - terminal - 2.0).abs() < 1e-6);
    }

    /// Rank-2 domain contract: monotonic SPC degradation → monotonically
    /// non-increasing reward. (Saturates once SPC penalty caps at -1.5.)
    #[test]
    fn reward_monotone_in_spc_alerts() {
        let mut prev = f32::INFINITY;
        for n in 0..=10 {
            let r = compute_reward(1, 1, n, true, true, false);
            assert!(r <= prev + 1e-6, "reward must be non-increasing in SPC alerts");
            prev = r;
        }
    }

    // --- CycleTelemetry default ------------------------------------------

    #[test]
    fn telemetry_default_starts_at_qlearning() {
        let t = CycleTelemetry::default();
        assert_eq!(t.cycle_count, 0);
        assert_eq!(t.cumulative_reward, 0.0);
        assert_eq!(t.active_agent_name, "QLearning");
    }
}
