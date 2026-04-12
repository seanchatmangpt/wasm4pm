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
#[derive(Debug, Clone, serde::Serialize)]
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
        }
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
/// Bounded range: approximately [-3.5, +1.1]
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
        let idx = (action_idx as usize) % AgentType::COUNT;
        AgentType::from_u8(idx as u8).unwrap_or(AgentType::QLearning)
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

    /// Run one full cycle: select agent (if LinUCB enabled), select action,
    /// compute reward, update agent, update telemetry.
    /// Returns (action_label, reward).
    pub fn run_cycle(
        &mut self,
        features: &[f32; 8],
        state: &RlState,
        spc_alert_count: usize,
        guard_pass: bool,
        circuit_allowed: bool,
    ) -> (String, f32) {
        // LinUCB agent selection (if enabled)
        if self.use_linucb_for_selection {
            let recommended = self.linucb_select_agent(features);
            self.switch_agent(recommended);
        }

        // Select action
        let action = self.select_action(state);
        let action_label = format!("{:?}", action);

        // Compute reward
        let prev_health = self.telemetry.last_health_state;
        let curr_health = state.0;
        let reward = compute_reward(
            prev_health,
            curr_health,
            spc_alert_count,
            guard_pass,
            circuit_allowed,
        );

        // Update agent
        let done = curr_health == 4;
        self.update(state, &action, reward, state, done);

        // Update LinUCB
        self.linucb_update(features, reward);

        // Decay exploration
        self.decay_exploration();

        // Update telemetry
        self.telemetry.cycle_count += 1;
        self.telemetry.last_health_state = curr_health;
        self.telemetry.last_action_label = action_label.clone();
        self.telemetry.last_spc_alert_count = spc_alert_count;
        self.telemetry.last_guard_pass = guard_pass;
        self.telemetry.last_circuit_allowed = circuit_allowed;
        self.telemetry.cumulative_reward += reward;
        self.telemetry.last_reward = reward;

        (action_label, reward)
    }
}
