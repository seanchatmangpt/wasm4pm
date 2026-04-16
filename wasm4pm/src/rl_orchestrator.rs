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
    pub consecutive_successes: u32,  // Track consecutive successes for health improvement eligibility
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
pub fn compute_health_state(
    event_count: u64,
    trace_count: u64,
    unique_activities: u64,
) -> u8 {
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
///
/// Bounded range: approximately [-5.0, +1.1]
pub fn compute_reward(
    prev_health: u8,
    curr_health: u8,
    spc_alert_count: usize,
    guard_pass: bool,
    circuit_allowed: bool,
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
    ///
    /// Returns (action_label, reward).
    pub fn run_cycle(
        &mut self,
        features: &[f32; 8],
        state: &RlState,
        next_state: &RlState,
        spc_alert_count: usize,
        guard_pass: bool,
        circuit_allowed: bool,
    ) -> (String, f32) {
        // LinUCB agent selection (if enabled)
        if self.use_linucb_for_selection {
            let recommended = self.linucb_select_agent(features);
            self.switch_agent(recommended);
        }

        // Select action based on CURRENT state
        let action = self.select_action(state);
        let action_label = format!("{:?}", action);

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
        self.telemetry.last_action_label = action_label.clone();
        self.telemetry.last_spc_alert_count = spc_alert_count;
        self.telemetry.last_guard_pass = guard_pass;
        self.telemetry.last_circuit_allowed = circuit_allowed;
        self.telemetry.cumulative_reward += reward;
        self.telemetry.last_reward = reward;

        // Track consecutive successes for health improvement eligibility
        if guard_pass && circuit_allowed {
            self.telemetry.consecutive_successes += 1;
        } else {
            self.telemetry.consecutive_successes = 0; // Reset on failure
        }

        (action_label, reward)
    }
}
