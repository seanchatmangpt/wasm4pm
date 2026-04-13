//! RL State Serialization — persistence layer for autonomic orchestrator.
//!
//! Provides serializable versions of RL orchestrator state for localStorage
//! persistence across CLI sessions. Enables checkpoint/resume of learning
//! progress without restarting from scratch.

use serde::{Deserialize, Serialize};

/// Serializable RL orchestrator state.
///
/// Captures the minimal state needed to restore RL learning progress
/// across CLI invocations. Currently includes telemetry and agent selection;
/// Q-table serialization will be added when the underlying RL agents expose
/// their internal state.
/// Serializable RL orchestrator state.
///
/// Captures the minimal state needed to restore RL learning progress
/// across CLI invocations. Currently includes telemetry and agent selection;
/// Q-table serialization will be added when the underlying RL agents expose
/// their internal state.
///
/// TODO: Add Q-table serialization when rl_orchestrator agents expose internal state.
/// The underlying RL agents (QLearning, SARSA, etc.) use private Q-tables
/// that are not currently accessible via public API. Future work should add
/// serialization methods to each agent implementation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SerializedRlState {
    /// Cycle telemetry including reward history and action labels
    pub telemetry: RlTelemetry,
    /// Currently active RL agent (0=QLearning, 1=SARSA, 2=DoubleQ, 3=ExpectedSARSA, 4=REINFORCE)
    pub active_agent: u8,
    /// Whether LinUCB contextual bandit is enabled for agent selection
    pub linucb_enabled: bool,
}

/// Serializable RL telemetry snapshot.
///
/// Extracted from CycleTelemetry in rl_orchestrator.rs, focusing on
/// fields needed for reward computation and learning continuity.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RlTelemetry {
    /// Total number of autonomic cycles executed
    pub cycle_count: u64,
    /// Last observed health state (0=Ready, 1=Planning, 2=Running, 3=Watching, 4=Failed)
    pub last_health_state: u8,
    /// Label of the last action taken by the active agent
    pub last_action_label: String,
    /// Number of SPC (statistical process control) alerts in last cycle
    pub last_spc_alert_count: usize,
    /// Cumulative reward across all cycles (bounded ~[-3.5, +1.1] per cycle)
    pub cumulative_reward: f64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_serialized_rl_state_serialization() {
        let state = SerializedRlState {
            telemetry: RlTelemetry {
                cycle_count: 42,
                last_health_state: 2,
                last_action_label: "ADAPT_TIMEOUT".to_string(),
                last_spc_alert_count: 1,
                cumulative_reward: -3.5,
            },
            active_agent: 0,
            linucb_enabled: true,
        };

        let json = serde_json::to_string(&state).unwrap();
        let restored: SerializedRlState = serde_json::from_str(&json).unwrap();

        assert_eq!(restored.telemetry.cycle_count, 42);
        assert_eq!(restored.telemetry.last_health_state, 2);
        assert_eq!(restored.telemetry.last_action_label, "ADAPT_TIMEOUT");
        assert_eq!(restored.telemetry.last_spc_alert_count, 1);
        assert_eq!(restored.telemetry.cumulative_reward, -3.5);
        assert_eq!(restored.active_agent, 0);
        assert_eq!(restored.linucb_enabled, true);
    }

    #[test]
    fn test_rl_telemetry_serialization() {
        let telemetry = RlTelemetry {
            cycle_count: 100,
            last_health_state: 1,
            last_action_label: "REDUCE_CONCURRENCY".to_string(),
            last_spc_alert_count: 0,
            cumulative_reward: 15.7,
        };

        let json = serde_json::to_string(&telemetry).unwrap();
        let restored: RlTelemetry = serde_json::from_str(&json).unwrap();

        assert_eq!(restored.cycle_count, 100);
        assert_eq!(restored.last_health_state, 1);
        assert_eq!(restored.last_action_label, "REDUCE_CONCURRENCY");
        assert_eq!(restored.last_spc_alert_count, 0);
        assert_eq!(restored.cumulative_reward, 15.7);
    }
}
