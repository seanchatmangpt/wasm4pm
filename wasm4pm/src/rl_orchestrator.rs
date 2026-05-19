//! RL Orchestrator — persistent state hub for the autonomic loop.
//!
//! Holds all 5 RL agents, manages agent selection (manual or via LinUCB),
//! computes reward from SPC feedback, and provides trait-polymorphic dispatch
//! to the currently active agent.

use crate::ml::LinUCBAgent;
use crate::reinforcement::{
    Agent, AgentMeta, DoubleQLearning, ExpectedSARSAAgent, QLearning, ReinforceAgent, SARSAAgent,
};

// Re-export the RlState/RlAction types from lib.rs (they are pub(crate)).
// We use the concrete types directly since this module is in the same crate.
use crate::{RlAction, RlState};

/// Serialization capability for RlState/RlAction agents.
/// Separate trait so that the generic `impl<S,A> AgentMeta for ...` doesn't need
/// to compile `encode_rl_state_key` for arbitrary S (only RlState is concrete here).
trait RlSerialization {
    fn export_q_table(
        &self,
        agent_type: u8,
    ) -> crate::rl_state_serialization::SerializedAgentQTable;
    fn restore_q_table(&self, table: crate::rl_state_serialization::SerializedAgentQTable);
}

macro_rules! impl_rl_serialization {
    ($t:ty) => {
        impl RlSerialization for $t {
            fn export_q_table(
                &self,
                agent_type: u8,
            ) -> crate::rl_state_serialization::SerializedAgentQTable {
                self.export_as_serialized(agent_type)
            }
            fn restore_q_table(
                &self,
                table: crate::rl_state_serialization::SerializedAgentQTable,
            ) {
                self.restore_from_serialized(table);
            }
        }
    };
}

impl_rl_serialization!(QLearning<RlState, RlAction>);
impl_rl_serialization!(SARSAAgent<RlState, RlAction>);
impl_rl_serialization!(DoubleQLearning<RlState, RlAction>);
impl_rl_serialization!(ExpectedSARSAAgent<RlState, RlAction>);
impl_rl_serialization!(ReinforceAgent<RlState, RlAction>);

// Combined dispatch trait — object-safe because RlState/RlAction are concrete.
trait AgentBehavior: Agent<RlState, RlAction> + AgentMeta + RlSerialization {
    /// Get Q-value for (state, action) — required for OTEL instrumentation (Gap 2)
    fn get_q_value_for_otel(&self, state: &RlState, action: &RlAction) -> f32;
}

// Implement AgentBehavior for all 5 agent types
// Only QLearning has get_q_value; others return 0.0 for OTEL instrumentation
impl AgentBehavior for QLearning<RlState, RlAction> {
    fn get_q_value_for_otel(&self, state: &RlState, action: &RlAction) -> f32 {
        self.get_q_value(state, action)
    }
}

impl AgentBehavior for SARSAAgent<RlState, RlAction> {
    fn get_q_value_for_otel(&self, _state: &RlState, _action: &RlAction) -> f32 {
        0.0 // SARSA doesn't expose get_q_value; gap 2 only instruments QLearning
    }
}

impl AgentBehavior for DoubleQLearning<RlState, RlAction> {
    fn get_q_value_for_otel(&self, _state: &RlState, _action: &RlAction) -> f32 {
        0.0 // DoubleQLearning doesn't expose get_q_value
    }
}

impl AgentBehavior for ExpectedSARSAAgent<RlState, RlAction> {
    fn get_q_value_for_otel(&self, _state: &RlState, _action: &RlAction) -> f32 {
        0.0 // ExpectedSARSA doesn't expose get_q_value
    }
}

impl AgentBehavior for ReinforceAgent<RlState, RlAction> {
    fn get_q_value_for_otel(&self, _state: &RlState, _action: &RlAction) -> f32 {
        0.0 // REINFORCE is policy-gradient; no Q-table
    }
}

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
    pub last_norm: f32,  // Last average L2 norm for convergence tracking
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
            last_norm: 0.0,
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
///
/// # Examples
///
/// ```
/// use wasm4pm::rl_orchestrator::compute_health_state;
///
/// assert_eq!(compute_health_state(0, 0, 0), 4);   // Failed: empty log
/// assert_eq!(compute_health_state(10, 0, 2), 3);  // Critical: no traces
/// assert_eq!(compute_health_state(3, 1, 1), 2);   // Degraded: trivial log
/// assert_eq!(compute_health_state(100, 5, 5), 0); // Normal
/// ```
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
///
/// # Examples
///
/// ```
/// use wasm4pm::rl_orchestrator::compute_reward;
///
/// // Health improved, no SPC alerts → positive reward
/// let r = compute_reward(2, 0, 0, true, true, false);
/// assert!(r > 0.0, "health improvement must yield positive reward, got {r}");
///
/// // Terminal failure state → large negative penalty
/// let r2 = compute_reward(3, 4, 5, true, true, false);
/// assert!(r2 < -1.0, "failed state must yield large negative reward, got {r2}");
/// ```
pub fn compute_reward(
    prev_health: u8,
    curr_health: u8,
    spc_alert_count: usize,
    guard_pass: bool,
    circuit_allowed: bool,
    latency_budget_exceeded: bool,
) -> f32 {
    let mut reward = 0.0_f32;

    // Health delta — branchless 3-entry LUT.
    // Encoding: improved=1 (0b01), stable=2 (0b10), degraded=0 (0b00)
    const HEALTH_DELTA: [f32; 3] = [-1.0, 1.0, 0.2]; // [degraded, improved, stable]
    let improved = (curr_health < prev_health) as usize;
    let stable   = ((curr_health == prev_health) as usize) << 1;
    reward += HEALTH_DELTA[improved | stable];

    // SPC penalty: each special cause signal is a -0.3 penalty (bounded by -1.5)
    reward -= (spc_alert_count as f32 * 0.3).min(1.5);

    // Guard/circuit bonus/penalty — branchless 2D LUT
    const GUARD_CIRCUIT: [[f32; 2]; 2] = [[-0.5, -0.5], [-0.5, 0.1]];
    reward += GUARD_CIRCUIT[guard_pass as usize][circuit_allowed as usize];

    // Latency budget penalty — branchless
    reward -= latency_budget_exceeded as i32 as f32 * 0.3;

    // Terminal penalty — branchless
    reward -= (curr_health == 4) as i32 as f32 * 2.0;

    reward
}

/// Action history tracking for observability.
/// Maintains a rolling window of the last 100 actions with success metrics.
#[derive(Debug, Clone)]
pub struct ActionHistory {
    /// Rolling window of recent actions (max 100).
    actions: std::collections::VecDeque<(RlAction, f32)>,
    /// Success count per action type.
    success_counts: [u32; 5],
    /// Total count per action type.
    total_counts: [u32; 5],
}

impl ActionHistory {
    pub fn new() -> Self {
        Self {
            actions: std::collections::VecDeque::with_capacity(100),
            success_counts: [0; 5],
            total_counts: [0; 5],
        }
    }

    pub fn record_action(&mut self, action: RlAction, reward: f32) {
        if self.actions.len() >= 100 {
            let _ = self.actions.pop_front();
        }
        self.actions.push_back((action, reward));

        let action_idx = match action {
            RlAction::Continue => 0,
            RlAction::Scale => 1,
            RlAction::Retry => 2,
            RlAction::Fallback => 3,
            RlAction::Restart => 4,
        };
        self.total_counts[action_idx] = self.total_counts[action_idx].saturating_add(1);
        if reward > 0.0 {
            self.success_counts[action_idx] = self.success_counts[action_idx].saturating_add(1);
        }

        // Emit OTEL span every 10 actions for action performance observability
        let total_actions: u32 = self.total_counts.iter().sum();
        if total_actions % 10 == 0 {
            let success_rate = self.get_success_rate(action);
            let recent_reward_avg = if self.actions.is_empty() {
                0.0
            } else {
                let recent_rewards: Vec<f32> = self.actions.iter().map(|(_, r)| *r).collect();
                recent_rewards.iter().sum::<f32>() / recent_rewards.len() as f32
            };

            tracing::info!(
                target: "autonomic.rl.action_performance",
                action_label = action_label(action),
                success_rate = success_rate,
                recent_reward_avg = recent_reward_avg,
                total_actions_recorded = total_actions,
                "Action performance metrics"
            );
        }
    }

    pub fn get_success_rate(&self, action: RlAction) -> f32 {
        let action_idx = match action {
            RlAction::Continue => 0,
            RlAction::Scale => 1,
            RlAction::Retry => 2,
            RlAction::Fallback => 3,
            RlAction::Restart => 4,
        };
        if self.total_counts[action_idx] == 0 {
            0.0
        } else {
            self.success_counts[action_idx] as f32 / self.total_counts[action_idx] as f32
        }
    }

    pub fn recent_actions(&self) -> Vec<(RlAction, f32)> {
        self.actions.iter().copied().collect()
    }

    pub fn distribution(&self) -> [(&'static str, u32); 5] {
        [
            ("Continue", self.total_counts[0]),
            ("Scale", self.total_counts[1]),
            ("Retry", self.total_counts[2]),
            ("Fallback", self.total_counts[3]),
            ("Restart", self.total_counts[4]),
        ]
    }
}

/// State space coverage tracking for observability.
/// Tracks unique states visited and per-dimension bin occupancy across cycles.
///
/// 8-dimensional state space:
///   - health_level: 5 bins (0-4)
///   - event_rate_q: 8 bins (0-7)
///   - activity_count_q: 8 bins (0-7)
///   - spc_alert_level: 4 bins (0-3)
///   - drift_status: 3 bins (0-2)
///   - rework_ratio_q: 8 bins (0-7)
///   - circuit_state: 3 bins (0-2)
///   - cycle_phase: 4 bins (0-3)
/// Total: 5*8*8*4*3*8*3*4 = 368,640 possible states
#[derive(Debug, Clone)]
pub struct StateCoverage {
    /// Set of unique state IDs visited (encoded 8D → u32)
    visited_states: std::collections::HashSet<u32>,
    /// Per-dimension bin occupancy counters
    /// Bins: [5(health) + 8(event_rate) + 8(activity) + 4(spc) + 3(drift) + 8(rework) + 3(circuit) + 4(phase)] = 43 total
    dimension_bins: [u32; 43],
}

impl StateCoverage {
    pub fn new() -> Self {
        Self {
            visited_states: std::collections::HashSet::new(),
            dimension_bins: [0; 43],
        }
    }

    /// Encode 8-dimensional state to u32 via Cantor-like pairing.
    /// Maps (h, e, a, s, d, r, c, p) → unique u32 in [0, 368640)
    fn state_to_id(state: &RlState) -> u32 {
        // Use a factoradic encoding: state_id = h + e*5 + a*5*8 + s*5*8*8 + ...
        let h = state.health_level as u32;       // 0-4
        let e = state.event_rate_q as u32;       // 0-7
        let a = state.activity_count_q as u32;   // 0-7
        let s = state.spc_alert_level as u32;    // 0-3
        let d = state.drift_status as u32;       // 0-2
        let r = state.rework_ratio_q as u32;     // 0-7
        let c = state.circuit_state as u32;      // 0-2
        let p = state.cycle_phase as u32;        // 0-3

        h + e * 5 + a * 5 * 8 + s * 5 * 8 * 8 + d * 5 * 8 * 8 * 4
            + r * 5 * 8 * 8 * 4 * 3 + c * 5 * 8 * 8 * 4 * 3 * 8
            + p * 5 * 8 * 8 * 4 * 3 * 8 * 3
    }

    /// Track a state visit: increment visited set and dimension bins.
    pub fn track_state(&mut self, state: &RlState) {
        let state_id = Self::state_to_id(state);
        self.visited_states.insert(state_id);

        // Increment bins for each dimension
        // health_level: bins 0-4
        if (state.health_level as usize) < 5 {
            self.dimension_bins[state.health_level as usize] += 1;
        }

        // event_rate_q: bins 5-12
        if (state.event_rate_q as usize) < 8 {
            self.dimension_bins[5 + state.event_rate_q as usize] += 1;
        }

        // activity_count_q: bins 13-20
        if (state.activity_count_q as usize) < 8 {
            self.dimension_bins[13 + state.activity_count_q as usize] += 1;
        }

        // spc_alert_level: bins 21-24
        if (state.spc_alert_level as usize) < 4 {
            self.dimension_bins[21 + state.spc_alert_level as usize] += 1;
        }

        // drift_status: bins 25-27
        if (state.drift_status as usize) < 3 {
            self.dimension_bins[25 + state.drift_status as usize] += 1;
        }

        // rework_ratio_q: bins 28-35
        if (state.rework_ratio_q as usize) < 8 {
            self.dimension_bins[28 + state.rework_ratio_q as usize] += 1;
        }

        // circuit_state: bins 36-38
        if (state.circuit_state as usize) < 3 {
            self.dimension_bins[36 + state.circuit_state as usize] += 1;
        }

        // cycle_phase: bins 39-42 (4 bins)
        if (state.cycle_phase as usize) < 4 {
            self.dimension_bins[39 + state.cycle_phase as usize] += 1;
        }
    }

    /// Compute coverage percentage (unique states visited / total possible).
    pub fn coverage_percentage(&self) -> f32 {
        (self.visited_states.len() as f32) / 368_640.0 * 100.0
    }

    /// Get per-dimension coverage breakdown.
    /// Returns array of 8 coverage percentages (one per dimension).
    pub fn get_dimension_coverage(&self) -> [f32; 8] {
        [
            // health_level: bins 0-4 (5 bins)
            self.dimension_bins[0..5].iter().filter(|&&b| b > 0).count() as f32 / 5.0 * 100.0,
            // event_rate_q: bins 5-12 (8 bins)
            self.dimension_bins[5..13].iter().filter(|&&b| b > 0).count() as f32 / 8.0 * 100.0,
            // activity_count_q: bins 13-20 (8 bins)
            self.dimension_bins[13..21].iter().filter(|&&b| b > 0).count() as f32 / 8.0 * 100.0,
            // spc_alert_level: bins 21-24 (4 bins)
            self.dimension_bins[21..25].iter().filter(|&&b| b > 0).count() as f32 / 4.0 * 100.0,
            // drift_status: bins 25-27 (3 bins)
            self.dimension_bins[25..28].iter().filter(|&&b| b > 0).count() as f32 / 3.0 * 100.0,
            // rework_ratio_q: bins 28-35 (8 bins)
            self.dimension_bins[28..36].iter().filter(|&&b| b > 0).count() as f32 / 8.0 * 100.0,
            // circuit_state: bins 36-38 (3 bins)
            self.dimension_bins[36..39].iter().filter(|&&b| b > 0).count() as f32 / 3.0 * 100.0,
            // cycle_phase: bins 39-42 (4 bins)
            self.dimension_bins[39..43].iter().filter(|&&b| b > 0).count() as f32 / 4.0 * 100.0,
        ]
    }

    /// Get the count of unique states visited.
    pub fn unique_states_visited(&self) -> usize {
        self.visited_states.len()
    }
}

impl Default for StateCoverage {
    fn default() -> Self {
        Self::new()
    }
}

/// The RL Orchestrator — holds all agents, dispatches to active one.
pub struct RlOrchestrator {
    // Indexed by AgentType discriminant (0–4); vtable dispatch replaces match blocks.
    agents: Vec<Box<dyn AgentBehavior>>,
    active_agent: AgentType,
    linucb: LinUCBAgent,
    telemetry: CycleTelemetry,
    action_history: ActionHistory,
    state_coverage: StateCoverage,
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
            agents: vec![
                Box::new(QLearning::new()),          // 0 = QLearning
                Box::new(SARSAAgent::new()),          // 1 = SARSA
                Box::new(DoubleQLearning::new()),     // 2 = DoubleQLearning
                Box::new(ExpectedSARSAAgent::new()),  // 3 = ExpectedSARSA
                Box::new(ReinforceAgent::new()),      // 4 = REINFORCE
            ],
            active_agent: AgentType::QLearning,
            linucb: LinUCBAgent::new(),
            telemetry: CycleTelemetry::default(),
            action_history: ActionHistory::new(),
            state_coverage: StateCoverage::new(),
            use_linucb_for_selection: false,
        }
    }

    /// Create orchestrator with seeded RNG for all 5 RL agents.
    /// Each agent gets a unique seed derived from the base seed.
    #[allow(dead_code)]
    pub fn new_with_seed(seed: u64) -> Self {
        Self {
            agents: vec![
                Box::new(QLearning::new_with_seed(0.1, 0.99, seed)),
                Box::new(SARSAAgent::new_with_seed(0.1, 0.99, seed.wrapping_add(1))),
                Box::new(DoubleQLearning::new_with_seed(0.1, 0.99, seed.wrapping_add(2))),
                Box::new(ExpectedSARSAAgent::new_with_seed(0.1, 0.99, seed.wrapping_add(3))),
                Box::new(ReinforceAgent::new_with_seed(0.01, 0.99, seed.wrapping_add(4))),
            ],
            active_agent: AgentType::QLearning,
            linucb: LinUCBAgent::new(),
            telemetry: CycleTelemetry::default(),
            action_history: ActionHistory::new(),
            state_coverage: StateCoverage::new(),
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
        self.agents[self.active_agent as usize].select_action(state)
    }

    /// Update the active RL agent with reward signal.
    ///
    /// Implements complete OTEL instrumentation for Bellman updates with:
    /// - Q-value delta pre/post update (Gap 2, Rank-1 oracle)
    /// - Failure mode detection: divergence, dead states, exploration collapse (Gap 3, Rank-4)
    /// - Per-dimension state transition context (Gap 4, Rank-3)
    /// - Convergence signal tracking
    pub fn update(
        &self,
        state: &RlState,
        action: &RlAction,
        reward: f32,
        next_state: &RlState,
        done: bool,
    ) {
        // GAP 2: Q-value delta tracking (Rank-1 oracle)
        // Capture Q-value BEFORE update for delta computation
        let q_old = self.agents[self.active_agent as usize].get_q_value_for_otel(state, action);

        // Perform the actual Bellman update
        self.agents[self.active_agent as usize].update(state, action, reward, next_state, done);

        // Capture Q-value AFTER update
        let q_new = self.agents[self.active_agent as usize].get_q_value_for_otel(state, action);
        let q_delta = (q_new - q_old).abs();

        // GAP 3: Failure mode detection (Rank-4 statistical oracle)
        // Detect: (a) Q-value divergence (delta > 2.0), (b) dead state (all Q-values ~0),
        // (c) exploration collapse (no action diversity)
        let divergence_detected = q_delta > 2.0;

        // Check for dead state: sample Q-values for both actions
        let q_continue = self.agents[self.active_agent as usize].get_q_value_for_otel(state, &RlAction::Continue);
        let q_scale = self.agents[self.active_agent as usize].get_q_value_for_otel(state, &RlAction::Scale);
        let q_avg = (q_continue.abs() + q_scale.abs()) / 2.0;
        let dead_state_detected = q_avg < 0.001 && self.telemetry.cycle_count > 50;

        // GAP 6: Action selection exploration context (Rank-2 domain contract)
        // Compute exploration rate for the active agent
        let epsilon = {
            // Default ε-greedy decay: ε = ε₀ * decay^t, with ε₀=1.0, decay=0.995
            // After 500 cycles: ε ≈ 0.0067 (99.3% exploitation)
            // This is approximate; the actual implementation is in the agent
            1.0 * (0.995_f32).powi(self.telemetry.cycle_count as i32)
        };

        // GAP 4: Per-dimension state transition tracing (Rank-3 metamorphic relation)
        // Log state transition deltas per dimension to detect impossible transitions
        let health_delta = next_state.health_level as i8 - state.health_level as i8;
        let event_rate_delta = (next_state.event_rate_q as i8 - state.event_rate_q as i8).abs();
        let activity_delta = (next_state.activity_count_q as i8 - state.activity_count_q as i8).abs();
        let spc_alert_delta = (next_state.spc_alert_level as i8 - state.spc_alert_level as i8).abs();
        let drift_delta = (next_state.drift_status as i8 - state.drift_status as i8).abs();
        let rework_delta = (next_state.rework_ratio_q as i8 - state.rework_ratio_q as i8).abs();
        let circuit_delta = (next_state.circuit_state as i8 - state.circuit_state as i8).abs();
        let phase_delta = (next_state.cycle_phase as i8 - state.cycle_phase as i8).abs();

        // Detect impossible transitions (metamorphic: some deltas should be bounded)
        let impossible_transition = event_rate_delta > 4 || activity_delta > 4 || spc_alert_delta > 2;

        // Primary Bellman update span (Rank-1 oracle)
        tracing::info!(
            target: "autonomic.rl.bellman_update",
            agent_type = self.active_agent.name(),
            // Gap 2: Q-value deltas
            q_old = q_old,
            q_new = q_new,
            q_delta = q_delta,
            // Core Bellman parameters
            reward = reward,
            learning_rate = 0.1, // Default learning rate used in agents
            done = done,
            // Gap 4: State transition context
            state_health = state.health_level,
            next_state_health = next_state.health_level,
            health_delta = health_delta,
            "Bellman equation update"
        );

        // Gap 3: Failure mode span (Rank-4, emitted only on detection or every 100 updates)
        if divergence_detected || dead_state_detected || (self.telemetry.cycle_count % 100 == 0) {
            tracing::warn!(
                target: "autonomic.rl.failure_modes",
                agent_type = self.active_agent.name(),
                cycle_count = self.telemetry.cycle_count,
                divergence_detected = divergence_detected,
                q_delta = q_delta,
                dead_state_detected = dead_state_detected,
                q_continue_avg = q_avg,
                exploration_collapse_detected = epsilon < 0.05 && self.telemetry.cycle_count > 200,
                "Failure mode detection (Rank-4 oracle)"
            );
        }

        // Gap 4: State transition tracing span (Rank-3 metamorphic relation, every 50 cycles or on impossible transition)
        if impossible_transition || (self.telemetry.cycle_count % 50 == 0 && self.telemetry.cycle_count > 0) {
            tracing::info!(
                target: "autonomic.rl.state_transitions",
                agent_type = self.active_agent.name(),
                cycle_count = self.telemetry.cycle_count,
                health_delta = health_delta,
                event_rate_delta = event_rate_delta,
                activity_delta = activity_delta,
                spc_alert_delta = spc_alert_delta,
                drift_delta = drift_delta,
                rework_delta = rework_delta,
                circuit_delta = circuit_delta,
                phase_delta = phase_delta,
                impossible_transition = impossible_transition,
                "State transition context (Rank-3 metamorphic)"
            );
        }

        // Gap 6: Exploration context span (Rank-2 domain contract, every 50 cycles or if epsilon < 0.1)
        if epsilon < 0.1 || (self.telemetry.cycle_count % 50 == 0 && self.telemetry.cycle_count > 0) {
            tracing::info!(
                target: "autonomic.rl.exploration_context",
                agent_type = self.active_agent.name(),
                cycle_count = self.telemetry.cycle_count,
                epsilon = epsilon,
                exploration_rate = epsilon * 100.0,
                exploitation_rate = (1.0 - epsilon) * 100.0,
                "Action selection exploration context (Rank-2 domain)"
            );
        }
    }

    /// Decay exploration on the active agent.
    pub fn decay_exploration(&mut self) {
        self.agents[self.active_agent as usize].decay_exploration()
    }

    /// Set exploration rate on all agents (for MAPE-K action dispatch).
    pub fn set_exploration_rate(&mut self, rate: f32) {
        for a in &mut self.agents {
            a.set_exploration_rate(rate);
        }
    }

    /// Reset all exploration rates to default (1.0) — used by Restart action.
    pub fn reset_all_exploration_rates(&mut self) {
        self.set_exploration_rate(1.0);
    }

    /// Use LinUCB to recommend which RL agent to use based on features.
    /// Maps LinUCB actions 0..4 to AgentType.
    /// Emits OTEL span `autonomic.linucb.agent_selection` for every selection with:
    /// - Gap 5: Per-action weight norms (L2 norm for convergence tracking, Rank-1)
    /// - Gap 7: Agent success rate in selection context (Rank-2 domain contract)
    pub fn linucb_select_agent(&mut self, features: &[f32; 8]) -> AgentType {
        let (action_idx, linucb_score) = self.linucb.select(features);
        let recommended_agent = AgentType::from_u8(action_idx as u8).unwrap_or(AgentType::QLearning);

        // GAP 5: Per-action weight norms for convergence tracking (Rank-1 oracle)
        let weight_norms = self.weight_norms();
        let max_weight_norm = weight_norms.iter().cloned().fold(f32::NEG_INFINITY, f32::max);
        let recommended_agent_norm = weight_norms[action_idx as usize];

        // GAP 7: Agent success rate in selection context (Rank-2 domain contract)
        // Compute success rate for the selected agent over recent history
        let action_history = &self.action_history;
        let agent_success_rate = action_history.get_success_rate(action_history.recent_actions()
            .first()
            .map(|(a, _)| *a)
            .unwrap_or(RlAction::Continue));

        // Emit OTEL span for agent selection with convergence and performance context
        tracing::info!(
            target: "autonomic.linucb.agent_selection",
            recommended_agent = recommended_agent.name(),
            linucb_score = linucb_score,
            // Gap 5: Weight norm convergence tracking (Rank-1)
            recommended_agent_weight_norm = recommended_agent_norm,
            max_weight_norm = max_weight_norm,
            weight_norms = ?weight_norms,
            // Gap 7: Agent success rate (Rank-2 domain)
            agent_success_rate = agent_success_rate,
            recent_actions_count = action_history.recent_actions().len(),
            // Context
            context_features = ?features,
            action_idx = action_idx,
            cycle_count = self.telemetry.cycle_count,
            "LinUCB agent selection with convergence and success metrics"
        );

        recommended_agent
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

    /// Get action history statistics for observability.
    pub fn get_action_stats(&self) -> &ActionHistory {
        &self.action_history
    }

    /// Get LinUCB weight L2 norms for convergence monitoring.
    /// Returns per-action norms array for observability/diagnostics.
    pub fn weight_norms(&self) -> [f32; 5] {
        self.linucb.weight_l2_norms()
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

        // Record action and reward for observability
        self.action_history.record_action(action, reward);

        // Track state coverage for observability (Gap 4: state space exploration)
        self.state_coverage.track_state(next_state);

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

        // Emit convergence metrics every 100 cycles for observability (Gap 5: weight norm convergence)
        if self.telemetry.cycle_count % 100 == 0 {
            let norms = self.weight_norms();
            let avg_norm = norms.iter().sum::<f32>() / 5.0;
            let linucb_weight_delta = (avg_norm - self.telemetry.last_norm).abs();
            self.telemetry.last_norm = avg_norm;

            // Gap 5: Per-agent weight norm breakdown
            let max_norm = norms.iter().cloned().fold(f32::NEG_INFINITY, f32::max);
            let min_norm = norms.iter().cloned().fold(f32::INFINITY, f32::min);

            tracing::info!(
                target: "autonomic.rl.convergence",
                // Gap 5: Weight norm convergence (Rank-1 oracle)
                linucb_weight_delta = linucb_weight_delta,
                linucb_convergence_signal = avg_norm,
                max_weight_norm = max_norm,
                min_weight_norm = min_norm,
                weight_norms = ?norms,
                // Gap 4: State space coverage (Rank-3 metamorphic)
                state_coverage_percentage = self.state_coverage.coverage_percentage(),
                unique_states_visited = self.state_coverage.unique_states_visited(),
                // Telemetry
                cycle_count = self.telemetry.cycle_count,
                agent = ?self.active_agent,
                cumulative_reward = self.telemetry.cumulative_reward,
                "RL convergence and state coverage metrics (Gaps 4-5)"
            );

            // Gap 4: Per-dimension state coverage breakdown (every 200 cycles)
            if self.telemetry.cycle_count % 200 == 0 {
                let dim_coverage = self.state_coverage.get_dimension_coverage();
                tracing::info!(
                    target: "autonomic.rl.state_coverage",
                    cycle_count = self.telemetry.cycle_count,
                    health_coverage = dim_coverage[0],
                    event_rate_coverage = dim_coverage[1],
                    activity_count_coverage = dim_coverage[2],
                    spc_alert_coverage = dim_coverage[3],
                    drift_status_coverage = dim_coverage[4],
                    rework_ratio_coverage = dim_coverage[5],
                    circuit_state_coverage = dim_coverage[6],
                    cycle_phase_coverage = dim_coverage[7],
                    overall_coverage = self.state_coverage.coverage_percentage(),
                    "Per-dimension state space coverage breakdown (Gap 4, Rank-3)"
                );
            }
        }

        // Emit guard/circuit decision span every 10 cycles for decision observability
        if self.telemetry.cycle_count % 10 == 0 {
            let combined_signal = if guard_pass && circuit_allowed {
                1.0 // Both passed: green light
            } else if guard_pass || circuit_allowed {
                0.5 // One passed: yellow light
            } else {
                0.0 // Both failed: red light
            };

            tracing::info!(
                target: "autonomic.rl.guard_decision",
                guard_pass = guard_pass,
                circuit_allowed = circuit_allowed,
                combined_signal = combined_signal,
                spc_alert_count = spc_alert_count,
                cycle_count = self.telemetry.cycle_count,
                action_taken = action_label_str,
                reward = reward,
                "Guard and circuit breaker decision"
            );
        }

        // Emit action distribution statistics every 100 cycles (Gap 7 complement: success rate per action)
        if self.telemetry.cycle_count % 100 == 0 {
            let action_dist = self.action_history.distribution();
            let continue_rate = self.action_history.get_success_rate(RlAction::Continue);
            let scale_rate = self.action_history.get_success_rate(RlAction::Scale);
            let retry_rate = self.action_history.get_success_rate(RlAction::Retry);
            let fallback_rate = self.action_history.get_success_rate(RlAction::Fallback);
            let restart_rate = self.action_history.get_success_rate(RlAction::Restart);

            tracing::info!(
                target: "autonomic.rl.action_distribution",
                cycle_count = self.telemetry.cycle_count,
                // Action totals
                continue_total = action_dist[0].1,
                scale_total = action_dist[1].1,
                retry_total = action_dist[2].1,
                fallback_total = action_dist[3].1,
                restart_total = action_dist[4].1,
                // Gap 7: Success rates per action (Rank-2 domain contract)
                continue_success_rate = continue_rate,
                scale_success_rate = scale_rate,
                retry_success_rate = retry_rate,
                fallback_success_rate = fallback_rate,
                restart_success_rate = restart_rate,
                // Agent context
                agent = ?self.active_agent,
                "Action distribution and success rates (Gap 7, Rank-2)"
            );
        }

        (action_label_str.to_string(), reward)
    }

    /// Export all Q-tables from all 5 agents as serialized format.
    pub fn export_all_q_tables(&self) -> Vec<crate::rl_state_serialization::SerializedAgentQTable> {
        self.agents
            .iter()
            .enumerate()
            .map(|(i, a)| a.export_q_table(i as u8))
            .collect()
    }

    /// Restore all Q-tables to all 5 agents from serialized format.
    pub fn restore_all_q_tables(
        &self,
        tables: Vec<crate::rl_state_serialization::SerializedAgentQTable>,
    ) {
        for table in tables {
            if let Some(agent) = self.agents.get(table.agent_type as usize) {
                agent.restore_q_table(table);
            }
        }
    }

    /// Restore the full orchestrator state from a serialized snapshot.
    ///
    /// Replaces step-by-step mutation (`switch_agent` → `set_linucb_selection`
    /// → `restore_telemetry`) with a single atomic assignment per field. The
    /// previous step-by-step path had a PR #70-class drift bug: `switch_agent`
    /// set `telemetry.active_agent_name`, then `restore_telemetry` clobbered it
    /// back to `Default::default()` (`"QLearning"`). The clobber left
    /// `active_agent` and `telemetry.active_agent_name` inconsistent whenever
    /// the restored agent was anything other than QLearning.
    ///
    /// Fields not present on the wire (`last_guard_pass`,
    /// `last_circuit_allowed`, `last_reward`, `consecutive_successes`) are
    /// reset to their `Default::default()` values — which is the intended
    /// semantics for a fresh-process resume. `active_agent_name` is derived
    /// from `active_agent` so the invariant holds by construction.
    ///
    /// Returns the restored `cycle_count` so callers can log it without
    /// re-borrowing the orchestrator.
    pub fn restore_state(
        &mut self,
        snapshot: crate::rl_state_serialization::SerializedRlState,
    ) -> u64 {
        // Decode the active agent first; an unknown variant keeps the current
        // agent rather than corrupting state.
        let active = AgentType::from_u8(snapshot.active_agent).unwrap_or(self.active_agent);

        // Q-tables — assigned via interior mutability (`&self`), so they can
        // be restored before or after the field assignments below. We do them
        // first so a failure mid-restore leaves at most Q-tables touched.
        if !snapshot.agent_q_tables.is_empty() {
            self.restore_all_q_tables(snapshot.agent_q_tables);
        }

        // Single, atomic field-by-field assignment. No method here writes
        // a sibling field, so there is no clobber sequence.
        self.active_agent = active;
        self.use_linucb_for_selection = snapshot.linucb_enabled;
        self.telemetry = CycleTelemetry {
            cycle_count: snapshot.telemetry.cycle_count,
            last_health_state: snapshot.telemetry.last_health_state,
            last_action_label: snapshot.telemetry.last_action_label,
            last_spc_alert_count: snapshot.telemetry.last_spc_alert_count,
            last_guard_pass: false,
            last_circuit_allowed: false,
            cumulative_reward: snapshot.telemetry.cumulative_reward as f32,
            last_reward: 0.0,
            // Derived from active_agent so the invariant
            // (active_agent_name == active_agent.name()) holds by construction.
            active_agent_name: active.name().to_string(),
            consecutive_successes: 0,
            last_norm: 0.0,
        };

        self.telemetry.cycle_count
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
