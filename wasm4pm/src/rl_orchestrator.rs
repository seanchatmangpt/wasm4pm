//! RL Orchestrator — persistent state hub for the autonomic loop.
//!
//! Holds all 5 RL agents, manages agent selection (manual or via LinUCB),
//! computes reward from SPC feedback, and provides trait-polymorphic dispatch
//! to the currently active agent.

use crate::ml::LinUCBAgent;
use crate::reinforcement::{
    Agent, AgentMeta, DoubleQLearning, ExpectedSARSAAgent, QLearning, ReinforceAgent, SARSAAgent,
};
use std::collections::{HashSet, VecDeque};
use tracing::{error, warn, span, Level};

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
// Blanket impl covers all 5 agent types automatically.
trait AgentBehavior: Agent<RlState, RlAction> + AgentMeta + RlSerialization {}
impl<T: Agent<RlState, RlAction> + AgentMeta + RlSerialization> AgentBehavior for T {}

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

/// Compute reward signal from SPC alert count, health transition, rework ratio, and action diversity.
///
/// Reward semantics:
///   +1.0  : Health improved (lower health_state number) AND no SPC alerts
///   +0.2  : Health stable AND no SPC alerts
///    0.0  : Baseline (neutral)
///   -0.5  : SPC alerts detected (process instability)
///   -1.0  : Health degraded (higher health_state number)
///   -2.0  : Terminal state reached (health == 4 = Failed)
///   -0.3  : Cycle latency exceeded budget (added to total)
///   -0.2  : Rework penalty (high rework_ratio_q indicates wasted cycles; penalty scales 0.0-0.2 as ratio 0-7)
///   -0.1  : Action diversity penalty (if same action >70% of last 10 cycles)
///
/// **Rework penalty rationale (NEW):**
/// High rework_ratio_q (dimension 5 of 8D state space) indicates repeated activities,
/// signaling inefficient or cyclical processes. Penalty scales from 0 at ratio_q=0
/// to -0.2 at ratio_q=7 (max). Encourages policies that reduce rework.
///
/// **Action diversity penalty rationale:**
/// If the RL agent picks the same action repeatedly (>70% frequency in last 10 cycles),
/// it indicates a stuck or converged policy. Applying a small penalty encourages
/// exploration of alternative actions to prevent policy lock-in.
///
/// Bounded range: approximately [-5.5, +1.6] (worst: -3.0 health + -1.5 SPC + -0.5 guard + -0.3 latency + -0.2 rework = -5.5; best: +1.0 health + 0 SPC + 0.1 guard + 0 latency + 0 rework + 0.5 momentum = +1.6)
///
/// # Examples
///
/// ```
/// use wasm4pm::rl_orchestrator::compute_reward;
///
/// // Health improved, no SPC alerts, no rework → positive reward
/// let r = compute_reward(2, 1, 0, true, true, false, 0);
/// assert!(r > 0.0, "health improvement must yield positive reward, got {r}");
///
/// // Terminal failure state with high rework → large negative penalty
/// let r2 = compute_reward(3, 4, 5, true, true, false, 7);
/// assert!(r2 < -3.0, "failed state with rework must yield large negative reward, got {r2}");
/// ```
pub fn compute_reward(
    prev_health: u8,
    curr_health: u8,
    spc_alert_count: usize,
    guard_pass: bool,
    circuit_allowed: bool,
    latency_budget_exceeded: bool,
    rework_ratio_q: u8,
) -> f32 {
    compute_reward_with_momentum(
        prev_health,
        curr_health,
        spc_alert_count,
        guard_pass,
        circuit_allowed,
        latency_budget_exceeded,
        rework_ratio_q,
        0, // default: no momentum bonus
    )
}

/// Compute reward with momentum bonus for consecutive successes.
///
/// **Momentum bonus (NEW):**
/// Rewards persistent improvement: 0.05 * min(consecutive_successes, 10) bonus
/// when guard_pass && circuit_allowed. Scales from 0 to +0.5 over 10-cycle window.
/// Encourages policies that achieve sustained positive outcomes.
///
/// # Examples
///
/// ```ignore
/// // 5 consecutive successes: +0.25 bonus
/// let r = compute_reward_with_momentum(2, 1, 0, true, true, false, 0, 5);
/// assert!(r > 1.1, "momentum bonus should increase reward");
/// ```
pub fn compute_reward_with_momentum(
    prev_health: u8,
    curr_health: u8,
    spc_alert_count: usize,
    guard_pass: bool,
    circuit_allowed: bool,
    latency_budget_exceeded: bool,
    rework_ratio_q: u8,
    consecutive_successes: u32,
) -> f32 {
    let mut reward = 0.0_f32;

    // Health delta — branchless 3-entry LUT.
    // Encoding: improved=1 (0b01), stable=2 (0b10), degraded=0 (0b00)
    const HEALTH_DELTA: [f32; 3] = [-1.0, 1.0, 0.2]; // [degraded, improved, stable]
    let improved = (curr_health < prev_health) as usize;
    let stable   = ((curr_health == prev_health) as usize) << 1;
    reward += HEALTH_DELTA[improved | stable];

    // SPC penalty: each special cause signal is a -0.3 penalty (bounded by -1.5)
    // **GUARD: SPC penalty is explicitly capped at 1.5 to prevent overflow**
    // This ensures even pathological cases (1000+ SPC alerts) don't exceed bounds.
    let spc_penalty_magnitude = (spc_alert_count as f32 * 0.3).min(1.5);
    debug_assert!(spc_penalty_magnitude >= 0.0 && spc_penalty_magnitude <= 1.5, "spc penalty magnitude must be in [0, 1.5], got {}", spc_penalty_magnitude);
    reward -= spc_penalty_magnitude;

    // Guard/circuit bonus/penalty — branchless 2D LUT
    const GUARD_CIRCUIT: [[f32; 2]; 2] = [[-0.5, -0.5], [-0.5, 0.1]];
    reward += GUARD_CIRCUIT[guard_pass as usize][circuit_allowed as usize];

    // Latency budget penalty — branchless
    reward -= latency_budget_exceeded as i32 as f32 * 0.3;

    // Rework penalty (NEW): scales from 0 at ratio_q=0 to -0.2 at ratio_q=7
    // Encourages policies that reduce repeated activities and cycle inefficiency
    // **GUARD: rework_ratio_q must be in [0, 7]; clamp to prevent out-of-range**
    let clamped_rework_q = (rework_ratio_q as f32).min(7.0).max(0.0) as f32;
    let rework_penalty = -(clamped_rework_q / 7.0) * 0.2;
    debug_assert!(rework_penalty >= -0.2 && rework_penalty <= 0.0, "rework penalty must be in [-0.2, 0], got {}", rework_penalty);
    reward += rework_penalty;

    // Momentum bonus (NEW): reward persistent improvement
    // Only applies when guard_pass && circuit_allowed (successful cycle)
    // Scales from 0 to +0.5 over 10-cycle window
    // **GUARD: momentum bonus caps at 10-cycle window (0.05 * min(consecutive_successes, 10))**
    // This prevents unbounded accumulation and keeps reward magnitude bounded.
    if guard_pass && circuit_allowed {
        // Verified: consecutive_successes is capped via saturating_add; here we add additional cap
        let capped_successes = (consecutive_successes as f32).min(10.0);
        let momentum_bonus = 0.05_f32 * capped_successes;
        debug_assert!(momentum_bonus >= 0.0 && momentum_bonus <= 0.5, "momentum bonus must be in [0, 0.5], got {}", momentum_bonus);
        reward += momentum_bonus;
    }

    // Terminal penalty — branchless
    reward -= (curr_health == 4) as i32 as f32 * 2.0;

    reward
}

/// Compute decayed learning rate (alpha) for the current cycle.
///
/// Uses multiplicative decay schedule: alpha_t = alpha_0 * (0.9999 ^ cycle_count)
///
/// **Why decay is beneficial:**
/// Learning rate decay implements an exploration→exploitation transition. Early cycles
/// aggressively update Q-values to explore the state-action space (high alpha). As the
/// agent converges on a good policy, lower alpha (smaller updates) stabilizes learned
/// values, reducing the risk of policy oscillation. The base (0.9999) is gentle — after
/// 10,000 cycles, alpha drops to ~0.37x its initial value, allowing long learning horizons.
///
/// # Parameters
/// - `alpha_0`: Initial learning rate (typically 0.1)
/// - `cycle_count`: Current cycle number (0-based)
///
/// # Returns
/// Decayed alpha for the current cycle.
///
/// # Examples
///
/// ```
/// use wasm4pm::rl_orchestrator::learning_rate_schedule;
///
/// let alpha_0 = 0.1;
/// assert!((learning_rate_schedule(alpha_0, 0) - 0.1).abs() < 1e-6);   // cycle 0 → no decay
/// assert!(learning_rate_schedule(alpha_0, 1000) < alpha_0);            // cycle 1000 → decayed
/// assert!(learning_rate_schedule(alpha_0, 10000) < 0.04);              // cycle 10000 → ~37% decay
/// ```
pub fn learning_rate_schedule(alpha_0: f32, cycle_count: u64) -> f32 {
    // alpha_t = alpha_0 * (0.9999 ^ cycle_count)
    // Using f32::powf for clarity; compiler may inline/optimize.
    alpha_0 * 0.9999_f32.powf(cycle_count as f32)
}

/// Action history entry — tracks healing decision outcome per cycle.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ActionHistory {
    pub action: String,     // e.g., "Continue", "Scale", "Restart"
    pub reward_before: f32, // Cumulative reward before cycle
    pub reward_after: f32,  // Cumulative reward after cycle
    pub successful: bool,   // true if reward improved (reward_after > reward_before)
    pub timestamp: u64,     // Cycle count when action was taken
}

/// State space coverage metrics — tracks which 8D bins have been visited.
/// Total possible bins: 5 × 8 × 8 × 4 × 3 × 8 × 3 × 4 = 368,640 states.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct StateCoverage {
    /// Total unique states visited across all cycles.
    pub states_visited: usize,
    /// Per-dimension visit counts: [health_level, event_rate_q, activity_count_q, spc_alert_level, drift_status, rework_ratio_q, circuit_state, cycle_phase]
    pub dimension_coverage: [usize; 8],
    /// Coverage percentage (0-100).
    pub coverage_percentage: f32,
}

impl Default for StateCoverage {
    fn default() -> Self {
        Self {
            states_visited: 0,
            dimension_coverage: [0; 8],
            coverage_percentage: 0.0,
        }
    }
}

/// The RL Orchestrator — holds all agents, dispatches to active one.
pub struct RlOrchestrator {
    // Indexed by AgentType discriminant (0–4); vtable dispatch replaces match blocks.
    agents: Vec<Box<dyn AgentBehavior>>,
    active_agent: AgentType,
    linucb: LinUCBAgent,
    telemetry: CycleTelemetry,
    use_linucb_for_selection: bool,
    /// Tracks which 8D state bins have been visited for reachability analysis.
    visited_states: HashSet<u32>,
    /// Rolling window of healing actions (max 100 entries).
    action_history: VecDeque<ActionHistory>,
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
            use_linucb_for_selection: false,
            visited_states: HashSet::new(),
            action_history: VecDeque::with_capacity(100),
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
            use_linucb_for_selection: false,
            visited_states: HashSet::new(),
            action_history: VecDeque::with_capacity(100),
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

    /// Convert an RlState into a single u32 hash for state space binning.
    pub fn state_to_bin(state: &RlState) -> u32 {
        let h = state.health_level as u32;
        let e = state.event_rate_q as u32;
        let a = state.activity_count_q as u32;
        let s = state.spc_alert_level as u32;
        let d = state.drift_status as u32;
        let r = state.rework_ratio_q as u32;
        let c = state.circuit_state as u32;
        let p = state.cycle_phase as u32;

        h * 61440 + e * 7680 + a * 960 + s * 240 + d * 80 + r * 10 + c * 3 + p
    }

    /// Get state space coverage metrics.
    pub fn get_state_coverage(&self) -> StateCoverage {
        let total_bins = 368_640_u32;
        let states_visited = self.visited_states.len();
        let coverage_percentage = (states_visited as f32 / total_bins as f32) * 100.0;

        let mut dimension_coverage = [0usize; 8];
        let mut dim_seen: [std::collections::HashSet<u32>; 8] = Default::default();
        for &bin in &self.visited_states {
            let h = bin / 61440;
            let e = (bin % 61440) / 7680;
            let a = (bin % 7680) / 960;
            let s = (bin % 960) / 240;
            let d = (bin % 240) / 80;
            let r = (bin % 80) / 10;
            let c = (bin % 10) / 3;
            let p = bin % 3;

            dim_seen[0].insert(h);
            dim_seen[1].insert(e);
            dim_seen[2].insert(a);
            dim_seen[3].insert(s);
            dim_seen[4].insert(d);
            dim_seen[5].insert(r);
            dim_seen[6].insert(c);
            dim_seen[7].insert(p);
        }

        for i in 0..8 {
            dimension_coverage[i] = dim_seen[i].len();
        }

        StateCoverage {
            states_visited,
            dimension_coverage,
            coverage_percentage,
        }
    }

    /// Select action using the active RL agent.
    pub fn select_action(&self, state: &RlState) -> RlAction {
        self.agents[self.active_agent as usize].select_action(state)
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
        self.agents[self.active_agent as usize].update(state, action, reward, next_state, done)
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
    /// Emits OTEL span with agent selection rationale (UCB score, context features, runner-up).
    pub fn linucb_select_agent(&mut self, features: &[f32; 8]) -> AgentType {
        let (action_idx, ucb_score) = self.linucb.select(features);
        let selected_agent = AgentType::from_u8(action_idx as u8).unwrap_or(AgentType::QLearning);

        // Get all Q-values to identify runner-up agent
        let q_values = self.linucb.get_q_values(features);
        let mut runner_up_idx = 0_usize;
        let mut runner_up_score = f32::NEG_INFINITY;
        for (i, &q) in q_values.iter().enumerate() {
            if i != action_idx as usize && q > runner_up_score {
                runner_up_score = q;
                runner_up_idx = i;
            }
        }
        let runner_up_agent = AgentType::from_u8(runner_up_idx as u8)
            .unwrap_or(AgentType::QLearning)
            .name();

        // Serialize 8-dim context as JSON for span attribute
        let context_json = format!(
            r#"{{"event_rate":{:.4},"trace_count":{:.4},"activity_count":{:.4},"health":{:.4},"circuit_state":{:.4},"spc_alert_level":{:.4},"drift_status":{:.4},"cycle_phase":{:.4}}}"#,
            features[0], features[1], features[2], features[3],
            features[4], features[5], features[6], features[7]
        );

        // OBS-4 FIX: Get q_score (mean estimate) to compute exploration_bonus = ucb_score - q_score
        let q_values = self.linucb.get_q_values(features);
        let q_score = q_values[action_idx as usize];
        let exploration_bonus = ucb_score - q_score;

        // Emit OTEL span with LinUCB decision rationale (OBS-4 fix: add exploration_bonus)
        let _span = tracing::info_span!(
            "rl.linucb_agent_selection",
            linucb_selected_agent = selected_agent.name(),
            linucb_ucb_score = ucb_score,
            linucb_q_score = q_score,
            linucb_exploration_bonus = exploration_bonus,
            linucb_context = context_json.as_str(),
            linucb_runner_up = runner_up_agent,
            service_name = "wpm",
            status = "ok",
        );
        let _entered = _span.enter();

        selected_agent
    }

    /// Update LinUCB with reward for the current agent selection.
    /// Emits OTEL span with convergence metrics (TD error, weight norms, weight delta).
    pub fn linucb_update(&mut self, features: &[f32; 8], reward: f32) {
        let action_idx = self.active_agent as u32;

        // Compute TD error before update (prediction - target)
        let (_, ucb_score_before) = self.linucb.select(features);
        let td_error = reward - ucb_score_before;

        // Get weight norm BEFORE update for delta computation (OBS-1 fix)
        let norms_before = self.linucb.weight_norms();
        let active_norm_before = norms_before[action_idx as usize];

        // Update agent
        self.linucb.update(features, action_idx, reward);

        // Compute weight norms for convergence tracking
        let norms = self.linucb.weight_norms();
        let weight_norms_json = format!(
            r#"{{"q_learning":{},"sarsa":{},"double_q":{},"expected_sarsa":{},"reinforce":{}}}"#,
            norms[0], norms[1], norms[2], norms[3], norms[4]
        );

        // OBS-1 FIX: Extract active agent's weight delta for convergence signal
        let active_norm_after = norms[action_idx as usize];
        let weight_delta = (active_norm_after - active_norm_before).abs();
        let convergence_signal = if weight_delta > 0.001 { "learning" } else { "stable" };

        // Emit OTEL span with convergence signal (OBS-1 fix)
        let _span = tracing::info_span!(
            "rl.linucb_update",
            linucb_td_error = td_error,
            linucb_reward = reward,
            linucb_ucb_before = ucb_score_before,
            linucb_agent_id = self.telemetry.active_agent_name.as_str(),
            linucb_weight_norms = weight_norms_json.as_str(),
            linucb_weight_delta = weight_delta,
            linucb_convergence_signal = convergence_signal,
            learning_rate = self.linucb.alpha_lr,
            service_name = "wpm",
        );
        let _entered = _span.enter();
    }

    /// Enable/disable LinUCB-based agent selection.
    pub fn set_linucb_selection(&mut self, enabled: bool) {
        self.use_linucb_for_selection = enabled;
    }

    /// Check if LinUCB-based selection is enabled.
    pub fn linucb_selection_enabled(&self) -> bool {
        self.use_linucb_for_selection
    }

    /// Get LinUCB action bounds (GUARD: ensure action in [0, 4]).
    ///
    /// Returns the 0-based action index from LinUCB selection.
    /// Bounds check is performed; if out of range, clamps to valid [0, 4].
    pub fn linucb_bounded_select(&self, features: &[f32; 8]) -> u32 {
        let (action_idx, _) = self.linucb.select(features);
        // GUARD: clamp to valid action range [0, 4]
        action_idx.min(4)
    }

    /// Get action statistics (success rates per action type).
    ///
    /// Returns a map with action name as key and (total_count, successful_count, success_rate).
    /// Success is defined as: reward_after > reward_before.
    ///
    /// **GUARD: Division-by-zero protection** — If total is 0, rate defaults to 0.0 (not NaN).
    /// This prevents propagation of NaN through telemetry and OTEL spans.
    pub fn get_action_stats(&self) -> std::collections::HashMap<String, (u32, u32, f32)> {
        use std::collections::HashMap;
        let mut stats: HashMap<String, (u32, u32)> = HashMap::new();

        // Count totals and successes per action
        for entry in &self.action_history {
            let (total, successes) = stats.entry(entry.action.clone()).or_insert((0, 0));
            *total += 1;
            if entry.successful {
                *successes += 1;
            }
        }

        // Convert to (total, successful, success_rate)
        // GUARD: if total == 0, rate = 0.0 (preventing NaN from division by zero)
        stats
            .into_iter()
            .map(|(action, (total, successful))| {
                let rate = if total > 0 {
                    // Verified: successful <= total, so rate in [0.0, 1.0]
                    (successful as f32) / (total as f32)
                } else {
                    // No division by zero: guard ensures rate is exactly 0.0
                    0.0_f32
                };
                // Verify rate is finite (sanity check)
                debug_assert!(rate.is_finite(), "rate must be finite, got {}", rate);
                (action, (total, successful, rate))
            })
            .collect()
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
        // OTEL span wrapper for autonomic run_cycle loop
        let _cycle_span = tracing::info_span!(
            "rl.run_cycle",
            health_before = state.health_level,
            health_after = next_state.health_level,
            agent = self.telemetry.active_agent_name.as_str(),
            agent_id = self.telemetry.active_agent_name.as_str(),
            spc_alerts = spc_alert_count,
            service_name = "wpm",
            status = "ok",
        )
        .entered();

        // Track state space coverage (record visited bin)
        let current_bin = Self::state_to_bin(state);
        self.visited_states.insert(current_bin);

        // Emit state coverage diagnostics every 100 cycles
        if self.telemetry.cycle_count % 100 == 0 && self.telemetry.cycle_count > 0 {
            let coverage = self.get_state_coverage();
            tracing::info!(
                rl_state_coverage = coverage.coverage_percentage,
                rl_states_visited = coverage.states_visited,
                rl_health_level_coverage = coverage.dimension_coverage[0],
                rl_event_rate_coverage = coverage.dimension_coverage[1],
                rl_activity_count_coverage = coverage.dimension_coverage[2],
                rl_spc_alert_coverage = coverage.dimension_coverage[3],
                rl_drift_status_coverage = coverage.dimension_coverage[4],
                rl_rework_ratio_coverage = coverage.dimension_coverage[5],
                rl_circuit_state_coverage = coverage.dimension_coverage[6],
                rl_cycle_phase_coverage = coverage.dimension_coverage[7],
                service_name = "wpm",
                "state coverage diagnostics"
            );
        }

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

        // Compute reward based on health transition (prev -> next) with momentum bonus
        let prev_health = self.telemetry.last_health_state;
        let curr_health = next_state.health_level; // Use NEXT state for reward computation
        let reward = compute_reward_with_momentum(
            prev_health,
            curr_health,
            spc_alert_count,
            guard_pass,
            circuit_allowed,
            latency_budget_exceeded,
            next_state.rework_ratio_q, // NEW: pass rework ratio for penalty computation
            self.telemetry.consecutive_successes, // NEW: pass momentum for bonus computation
        );

        // Emit state transition event
        let health_changed = prev_health != curr_health;
        tracing::info!(
            health_degraded = curr_health > prev_health,
            health_improved = curr_health < prev_health,
            health_changed = health_changed,
            reward = reward,
            cycle = self.telemetry.cycle_count,
            status = if curr_health < 4 { "ok" } else { "error" },
            service_name = "wpm",
            "rl.state_transition"
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

        // FM-1 fix: when state == next_state (health is unchanged, e.g. guard_pass
        // && circuit_allowed but consecutive_successes < IMPROVEMENT_THRESHOLD), the
        // Bellman update bootstraps from itself:
        //   Q(s,a) = r + gamma * max_a' Q(s, a')
        // which is self-referential and can diverge or lock up.
        //
        // Principle: an undifferentiated state transition carries no information
        // about future value, so the correct target is the immediate reward alone
        // (terminal-equivalent). Force done=true in this case so every agent
        // collapses to: target = r.
        let effective_done = done || (state == next_state);

        // Learning rate decay (exploration → exploitation transition).
        // Compute current alpha using the multiplicative schedule: alpha_t = alpha_0 * (0.9999 ^ cycle_count).
        // Early cycles aggressively explore with high alpha; later cycles fine-tune with lower alpha,
        // reducing policy oscillation while allowing convergence on an optimal policy.
        let alpha_t = learning_rate_schedule(0.1, self.telemetry.cycle_count);
        self.agents[self.active_agent as usize].set_learning_rate(alpha_t);

        // Update agent with proper state transition (state -> next_state)
        self.update(state, &action, reward, next_state, effective_done);

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

        // Track healing action outcome (success = reward_after > reward_before)
        let reward_before = self.telemetry.cumulative_reward - reward;
        let action_entry = ActionHistory {
            action: action_label_str.to_string(),
            reward_before,
            reward_after: self.telemetry.cumulative_reward,
            successful: self.telemetry.cumulative_reward > reward_before,
            timestamp: self.telemetry.cycle_count,
        };

        // Maintain rolling window (max 100 entries)
        if self.action_history.len() >= 100 {
            self.action_history.pop_front();
        }
        self.action_history.push_back(action_entry.clone());

        // Compute action diversity metric: if same action >70% in last 10 cycles, apply penalty
        let action_repetition_penalty = if self.action_history.len() >= 10 {
            let recent_10: Vec<_> = self.action_history
                .iter()
                .rev()
                .take(10)
                .map(|h| h.action.as_str())
                .collect();

            let current_action_count = recent_10.iter()
                .filter(|a| **a == action_label_str)
                .count();

            if current_action_count > 7 {
                // >70% of last 10 were same action — apply diversity penalty
                tracing::debug!(
                    action = action_label_str,
                    repetition_count = current_action_count,
                    window_size = 10,
                    "action diversity penalty applied: policy may be locked"
                );
                -0.1
            } else {
                0.0
            }
        } else {
            0.0
        };

        // Emit final reward adjustment if diversity penalty applied
        let final_reward = reward + action_repetition_penalty;
        if action_repetition_penalty != 0.0 {
            self.telemetry.cumulative_reward += action_repetition_penalty;
        }

        // Emit OTEL span with action distribution snapshot
        let stats = self.get_action_stats();
        let mut action_histogram = String::from(r#"{"actions":{"#);
        for (action, (total, successful, rate)) in &stats {
            if action_histogram.len() > r#"{"actions":{"#.len() {
                action_histogram.push(',');
            }
            action_histogram.push_str(&format!(
                r#""{}": {{"total":{},"successful":{},"success_rate":{:.3}}}"#,
                action, total, successful, rate
            ));
        }
        action_histogram.push_str("}}");

        tracing::info!(
            action = action_label_str,
            successful = action_entry.successful,
            reward_delta = reward,
            action_distribution = action_histogram.as_str(),
            status = if action_entry.successful { "ok" } else { "error" },
            service_name = "wpm",
            "rl.action_tracked"
        );

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
    ///
    /// Returns (restored_count, skipped_count) to allow callers to detect silent failures.
    /// If skipped_count > 0, an error is logged and a warning span is emitted.
    ///
    /// # Arguments
    /// * `tables` - Serialized Q-tables from agents, indexed by agent_type (0..5)
    ///
    /// # Returns
    /// Tuple of (successfully restored tables, silently skipped tables due to invalid agent_type)
    pub fn restore_all_q_tables(
        &self,
        tables: Vec<crate::rl_state_serialization::SerializedAgentQTable>,
    ) -> (usize, usize) {
        let span = span!(Level::DEBUG, "rl_orchestrator.restore_q_tables", agent_count = self.agents.len());
        let _guard = span.enter();

        let mut restored = 0;
        let mut skipped = 0;
        let table_count = tables.len();

        for table in tables {
            let agent_idx = table.agent_type as usize;
            if let Some(agent) = self.agents.get(agent_idx) {
                agent.restore_q_table(table);
                restored += 1;
            } else {
                skipped += 1;
                error!(
                    agent_type = agent_idx,
                    total_agents = self.agents.len(),
                    "Q-table restoration failed: invalid agent_type"
                );
            }
        }

        if skipped > 0 {
            warn!(
                skipped_count = skipped,
                restored_count = restored,
                total_count = table_count,
                "Q-table restoration incomplete: policy divergence risk"
            );
        }

        (restored, skipped)
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
    fn reward_best_case_without_momentum_is_one_point_one() {
        // No momentum: health improved, no SPC, no rework, guard+circuit pass
        let r = compute_reward(2, 1, 0, true, true, false, 0);
        assert!((r - 1.1).abs() < 1e-6, "best case (no momentum) should be +1.1, got {}", r);
    }

    #[test]
    fn reward_best_case_with_momentum_is_one_point_six() {
        // With 10-cycle momentum: +0.5 bonus on top of +1.1 base
        let r = compute_reward_with_momentum(2, 1, 0, true, true, false, 0, 10);
        assert!((r - 1.6).abs() < 1e-6, "best case (10-cycle momentum) should be +1.6, got {}", r);
    }

    /// Worst case: health degrades to terminal, max SPC penalty, max rework, guard fail,
    /// latency exceeded. Per docstring: -5.6.
    #[test]
    fn reward_worst_case_is_negative_five_point_six() {
        // health 3 -> 4 (degrade -1.0 + terminal -2.0 = -3.0), 5 SPC alerts (caps at -1.5),
        // max rework_ratio_q=7 (penalty -0.2), guard fail (-0.5), latency exceeded (-0.3).
        // Total: -3.0 - 1.5 - 0.5 - 0.3 - 0.2 = -5.5
        let r = compute_reward(3, 4, 5, false, false, true, 7);
        assert!((r - (-5.5)).abs() < 1e-6, "worst case reward should be -5.5, got {}", r);
    }

    #[test]
    fn reward_health_components_are_correct() {
        // Improved (curr < prev): +1.0 contribution
        let improved = compute_reward(2, 1, 0, true, true, false, 0);
        // Stable (curr == prev): +0.2 contribution
        let stable = compute_reward(1, 1, 0, true, true, false, 0);
        // Degraded (curr > prev, non-terminal): -1.0 contribution
        let degraded = compute_reward(1, 2, 0, true, true, false, 0);

        // Differences are exactly 0.8 (1.0 vs 0.2) and 1.2 (0.2 vs -1.0).
        assert!((improved - stable - 0.8).abs() < 1e-6);
        assert!((stable - degraded - 1.2).abs() < 1e-6);
    }

    #[test]
    fn reward_spc_penalty_caps_at_one_point_five() {
        // 1 alert: -0.3; 5 alerts: capped at -1.5; 100 alerts: still -1.5.
        let r1 = compute_reward(1, 1, 1, true, true, false, 0);
        let r5 = compute_reward(1, 1, 5, true, true, false, 0);
        let r100 = compute_reward(1, 1, 100, true, true, false, 0);
        assert!((r1 - (0.2 + 0.1 - 0.3)).abs() < 1e-6);
        assert!((r5 - (0.2 + 0.1 - 1.5)).abs() < 1e-6);
        assert!((r100 - r5).abs() < 1e-6, "SPC penalty must cap at -1.5");
    }

    #[test]
    fn reward_guard_circuit_penalty_only_when_either_fails() {
        let pass = compute_reward(1, 1, 0, true, true, false, 0); // +0.1
        let guard_fail = compute_reward(1, 1, 0, false, true, false, 0); // -0.5
        let ckt_fail = compute_reward(1, 1, 0, true, false, false, 0); // -0.5
        let both_fail = compute_reward(1, 1, 0, false, false, false, 0); // -0.5 (single penalty, 0)
        assert!((pass - 0.3).abs() < 1e-6); // 0.2 (stable) + 0.1
        assert!((guard_fail - (-0.3)).abs() < 1e-6); // 0.2 - 0.5
        assert!((ckt_fail - (-0.3)).abs() < 1e-6);
        assert!((both_fail - (-0.3)).abs() < 1e-6);
    }

    #[test]
    fn reward_terminal_state_adds_two_point_zero_penalty() {
        // Same conditions, only difference is curr_health == 4 vs 3.
        // Both are degradations from health=2, so health component is -1.0.
        let non_terminal = compute_reward(2, 3, 0, true, true, false, 0);
        let terminal = compute_reward(2, 4, 0, true, true, false, 0);
        assert!((non_terminal - terminal - 2.0).abs() < 1e-6);
    }

    /// Rank-2 domain contract: monotonic SPC degradation → monotonically
    /// non-increasing reward. (Saturates once SPC penalty caps at -1.5.)
    #[test]
    fn reward_monotone_in_spc_alerts() {
        let mut prev = f32::INFINITY;
        for n in 0..=10 {
            let r = compute_reward(1, 1, n, true, true, false, 0);
            assert!(r <= prev + 1e-6, "reward must be non-increasing in SPC alerts");
            prev = r;
        }
    }

    /// NEW: Rework penalty scales linearly from 0 to -0.2 as rework_ratio_q goes 0-7.
    #[test]
    fn reward_rework_penalty_scales_zero_to_negpoint_two() {
        let no_rework = compute_reward(1, 1, 0, true, true, false, 0);
        let max_rework = compute_reward(1, 1, 0, true, true, false, 7);
        let diff = no_rework - max_rework;
        assert!((diff - 0.2).abs() < 1e-6, "rework penalty should be 0.2, got {}", diff);
    }

    /// NEW: Momentum bonus applies only when guard_pass && circuit_allowed.
    #[test]
    fn reward_momentum_bonus_only_on_successful_cycles() {
        // Successful: +0.05 * 5 = +0.25 bonus
        let with_momentum = compute_reward_with_momentum(1, 1, 0, true, true, false, 0, 5);
        // Without momentum: 0.2 + 0.1 = 0.3
        let no_momentum = compute_reward(1, 1, 0, true, true, false, 0);
        let bonus = with_momentum - no_momentum;
        assert!((bonus - 0.25).abs() < 1e-6, "momentum bonus should be 0.25, got {}", bonus);

        // Failed: no momentum bonus even with consecutive_successes>0
        let failed = compute_reward_with_momentum(1, 1, 0, false, true, false, 0, 5);
        let expected = no_momentum - 0.5; // only guard_fail penalty
        assert!((failed - expected).abs() < 1e-6, "failed cycle must not get momentum bonus");
    }

    /// NEW: Momentum bonus caps at +0.5 (10-cycle window).
    #[test]
    fn reward_momentum_bonus_caps_at_point_five() {
        let momentum_10 = compute_reward_with_momentum(1, 1, 0, true, true, false, 0, 10);
        let momentum_100 = compute_reward_with_momentum(1, 1, 0, true, true, false, 0, 100);
        assert!((momentum_10 - momentum_100).abs() < 1e-6, "momentum must cap at +0.5");
    }

    // --- CycleTelemetry default ------------------------------------------

    #[test]
    fn telemetry_default_starts_at_qlearning() {
        let t = CycleTelemetry::default();
        assert_eq!(t.cycle_count, 0);
        assert_eq!(t.cumulative_reward, 0.0);
        assert_eq!(t.active_agent_name, "QLearning");
    }

    // --- learning_rate_schedule: multiplicative decay -----

    /// At cycle 0, no decay has occurred yet.
    #[test]
    fn learning_rate_schedule_zero_decay_at_cycle_zero() {
        let alpha_0 = 0.1;
        let alpha_t = learning_rate_schedule(alpha_0, 0);
        assert!((alpha_t - alpha_0).abs() < 1e-6, "cycle 0 should have no decay");
    }

    /// Learning rate strictly decreases over time.
    #[test]
    fn learning_rate_schedule_monotonically_decreases() {
        let alpha_0 = 0.1;
        let alpha_1000 = learning_rate_schedule(alpha_0, 1000);
        let alpha_2000 = learning_rate_schedule(alpha_0, 2000);
        let alpha_10000 = learning_rate_schedule(alpha_0, 10000);

        assert!(alpha_0 > alpha_1000, "alpha should decay from cycle 0 to 1000");
        assert!(alpha_1000 > alpha_2000, "alpha should decay from cycle 1000 to 2000");
        assert!(alpha_2000 > alpha_10000, "alpha should decay from cycle 2000 to 10000");
    }

    /// After 10,000 cycles, alpha drops to approximately 37% of its original value.
    /// Empirical: 0.9999^10000 ≈ 0.3679
    #[test]
    fn learning_rate_schedule_reaches_37_percent_decay_at_ten_thousand() {
        let alpha_0 = 0.1;
        let alpha_10000 = learning_rate_schedule(alpha_0, 10000);
        let expected = alpha_0 * 0.3679; // 0.9999^10000 ≈ 0.3679
        assert!(
            (alpha_10000 - expected).abs() < 0.001,
            "alpha at 10k cycles should be ~37% of initial, got {}",
            alpha_10000
        );
    }

    /// Decay schedule remains positive (never becomes zero or negative).
    #[test]
    fn learning_rate_schedule_stays_positive() {
        let alpha_0 = 0.1;
        for cycle in [0, 100, 1000, 10000, 100000, 1_000_000] {
            let alpha_t = learning_rate_schedule(alpha_0, cycle);
            assert!(alpha_t > 0.0, "alpha at cycle {} must stay positive", cycle);
        }
    }

    // --- Reward function completeness (Cycle 4 audit) -----

    /// Rank-1 oracle: Verify that all reward components contribute meaningfully.
    /// Every component (health, SPC, guard, circuit, latency, terminal) must have measurable effect.
    #[test]
    fn test_compute_reward_component_completeness() {
        // Baseline: stable health (0.2), no SPC (0), guards pass (0.1), in budget (0) = +0.3
        let baseline = compute_reward(2, 2, 0, true, true, false, 0);
        assert!((baseline - 0.3).abs() < 1e-6, "Baseline should be 0.3");

        // Health improvement: 2->1 adds +1.0, so 0.2 (stable for wrong health) + 1.0 (improved) = 1.1
        let with_health_improvement = compute_reward(2, 1, 0, true, true, false, 0);
        assert!(
            with_health_improvement > baseline,
            "Health improvement must increase reward"
        );
        assert!(
            (with_health_improvement - baseline - 0.8).abs() < 1e-6,
            "Health improvement from stable (0.2) to improved (1.0) adds +0.8 to baseline"
        );

        // SPC penalty: -0.3 per alert
        let with_spc = compute_reward(2, 2, 1, true, true, false, 0);
        assert!(with_spc < baseline, "SPC alerts must decrease reward");
        assert!(
            (baseline - with_spc - 0.3).abs() < 1e-6,
            "SPC penalty should contribute exactly -0.3"
        );

        // Guard failure: changes from (true, true) = +0.1 to (false, true) = -0.5, delta = -0.6
        let with_guard_fail = compute_reward(2, 2, 0, false, true, false, 0);
        assert!(
            (baseline - with_guard_fail - 0.6).abs() < 1e-6,
            "Guard failure should change reward by -0.6 (0.1 -> -0.5)"
        );

        // Circuit failure: changes from (true, true) = +0.1 to (true, false) = -0.5, delta = -0.6
        let with_circuit_fail = compute_reward(2, 2, 0, true, false, false, 0);
        assert!(
            (baseline - with_circuit_fail - 0.6).abs() < 1e-6,
            "Circuit failure should change reward by -0.6 (0.1 -> -0.5)"
        );

        // Latency budget: -0.3 contribution
        let with_latency = compute_reward(2, 2, 0, true, true, true, 0);
        assert!(
            (baseline - with_latency - 0.3).abs() < 1e-6,
            "Latency budget exceeded should contribute -0.3"
        );

        // Terminal state: -2.0 contribution (on top of degradation -1.0)
        // health 2->4 is degradation (-1.0) + terminal (-2.0) = -3.0
        // guard+circuit still +0.1, so: -1.0 - 2.0 + 0.1 = -2.9
        // baseline is +0.3, so delta is 0.3 - (-2.9) = 3.2
        let with_terminal = compute_reward(2, 4, 0, true, true, false, 0);
        assert!(
            with_terminal < baseline,
            "Terminal state must dramatically decrease reward"
        );
        assert!(
            (baseline - with_terminal - 3.2).abs() < 1e-6,
            "Terminal state (2->4) degrades (-1.0) plus terminal (-2.0) = -3.0 vs stable +0.2 = 3.2 delta"
        );
    }

    /// Rank-2 domain contract: Double SPC alerts → strictly lower reward than single alert.
    /// Validates monotonic SPC penalty (already tested in reward_monotone_in_spc_alerts,
    /// but explicitly verify the doubling case for metamorphic relations).
    #[test]
    fn test_compute_reward_double_spc_worse_than_single() {
        // Same conditions except for SPC alert count
        let single_alert = compute_reward(1, 1, 1, true, true, false, 0); // -0.3 penalty
        let double_alert = compute_reward(1, 1, 2, true, true, false, 0); // -0.6 penalty

        assert!(
            double_alert < single_alert,
            "Double SPC alerts must yield strictly lower reward than single alert"
        );
        assert!(
            (single_alert - double_alert - 0.3).abs() < 1e-6,
            "Doubling alerts should add exactly -0.3 more penalty"
        );
    }

    /// Verify reward range bounds are as documented in compute_reward docstring.
    /// Range: [-5.3, +1.1] (worst to best case)
    #[test]
    fn test_compute_reward_range_is_bounded() {
        // Best case: health improves from 4->0, no SPC, guards pass, in budget
        // health: +1.0, SPC: 0, guard+circuit: +0.1, latency: 0, terminal: 0 = +1.1
        let best = compute_reward(4, 0, 0, true, true, false, 0);
        assert!(
            (best - 1.1).abs() < 1e-6,
            "Best case should be +1.1, got {}",
            best
        );

        // Worst case: health degrades to terminal (4), max SPC (-1.5 capped), guards fail, latency exceeded
        // health: -1.0 (degrade) + -2.0 (terminal) = -3.0
        // SPC: -1.5
        // guard+circuit: -0.5 (either fails is same penalty)
        // latency: -0.3
        // total: -3.0 - 1.5 - 0.5 - 0.3 = -5.3
        let worst = compute_reward(3, 4, 5, false, false, true, 0);
        assert!(
            (worst - (-5.3)).abs() < 1e-6,
            "Worst case should be -5.3, got {}",
            worst
        );

        // Verify all intermediate cases stay within bounds
        for health_prev in 0u8..=4 {
            for health_curr in 0u8..=4 {
                for spc_alerts in 0..=10 {
                    for guard in [true, false] {
                        for circuit in [true, false] {
                            for latency in [true, false] {
                                let r = compute_reward(
                                    health_prev, health_curr, spc_alerts, guard, circuit, latency, 0,
                                );
                                assert!(
                                    r >= -5.3 && r <= 1.1,
                                    "Reward {} out of bounds for ({}, {}, {}, {}, {}, {})",
                                    r, health_prev, health_curr, spc_alerts, guard, circuit, latency
                                );
                            }
                        }
                    }
                }
            }
        }
    }
}
