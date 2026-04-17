//! RL State Serialization — persistence layer for autonomic orchestrator.
//!
//! Provides serializable versions of RL orchestrator state for localStorage
//! persistence across CLI sessions. Enables checkpoint/resume of learning
//! progress without restarting from scratch.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Encode an RlState into a compact u64 key.
///
/// Packs 8 u8 fields (each 0-7 range) into bit positions:
/// - Bits 0-3: health_level
/// - Bits 4-7: event_rate_q
/// - Bits 8-11: activity_count_q
/// - Bits 12-15: spc_alert_level
/// - Bits 16-18: drift_status
/// - Bits 19-22: rework_ratio_q
/// - Bits 23-25: circuit_state
/// - Bits 26-29: cycle_phase
pub fn encode_rl_state_key(health_level: u8, event_rate_q: u8, activity_count_q: u8,
                           spc_alert_level: u8, drift_status: u8, rework_ratio_q: u8,
                           circuit_state: u8, cycle_phase: u8) -> u64 {
    ((health_level & 0x0F) as u64) |
    (((event_rate_q & 0x0F) as u64) << 4) |
    (((activity_count_q & 0x0F) as u64) << 8) |
    (((spc_alert_level & 0x0F) as u64) << 12) |
    (((drift_status & 0x07) as u64) << 16) |
    (((rework_ratio_q & 0x0F) as u64) << 19) |
    (((circuit_state & 0x07) as u64) << 23) |
    (((cycle_phase & 0x0F) as u64) << 26)
}

/// Decode a u64 key back into RlState components.
pub fn decode_rl_state_key(key: u64) -> (u8, u8, u8, u8, u8, u8, u8, u8) {
    (
        (key & 0x0F) as u8,                       // health_level
        ((key >> 4) & 0x0F) as u8,               // event_rate_q
        ((key >> 8) & 0x0F) as u8,               // activity_count_q
        ((key >> 12) & 0x0F) as u8,              // spc_alert_level
        ((key >> 16) & 0x07) as u8,              // drift_status
        ((key >> 19) & 0x0F) as u8,              // rework_ratio_q
        ((key >> 23) & 0x07) as u8,              // circuit_state
        ((key >> 26) & 0x0F) as u8,              // cycle_phase
    )
}

/// Serializable Q-table for a single RL agent.
///
/// Stores state→action-values mappings for checkpoint/resume.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SerializedAgentQTable {
    /// Agent type (0=QLearning, 1=SARSA, 2=DoubleQ, 3=ExpectedSARSA, 4=REINFORCE)
    pub agent_type: u8,
    /// State key (packed u64) → Q-values for each action
    pub state_values: HashMap<u64, Vec<f32>>,
}

/// Serializable RL orchestrator state.
///
/// Captures the minimal state needed to restore RL learning progress
/// across CLI invocations. Includes telemetry, agent selection, and Q-tables
/// from all 5 RL agents for full checkpoint/resume capability.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SerializedRlState {
    /// Cycle telemetry including reward history and action labels
    pub telemetry: RlTelemetry,
    /// Currently active RL agent (0=QLearning, 1=SARSA, 2=DoubleQ, 3=ExpectedSARSA, 4=REINFORCE)
    pub active_agent: u8,
    /// Whether LinUCB contextual bandit is enabled for agent selection
    pub linucb_enabled: bool,
    /// Q-tables from all 5 RL agents (default empty, populated on export)
    #[serde(default)]
    pub agent_q_tables: Vec<SerializedAgentQTable>,
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
    fn test_encode_decode_rl_state_key() {
        let key = encode_rl_state_key(1, 2, 3, 4, 5, 6, 7, 0);
        let (h, e, a, s, d, r, c, p) = decode_rl_state_key(key);
        assert_eq!(h, 1);
        assert_eq!(e, 2);
        assert_eq!(a, 3);
        assert_eq!(s, 4);
        assert_eq!(d, 5);
        assert_eq!(r, 6);
        assert_eq!(c, 7);
        assert_eq!(p, 0);
    }

    #[test]
    fn test_serialized_agent_q_table() {
        let mut state_values = HashMap::new();
        let key = encode_rl_state_key(1, 2, 3, 4, 5, 6, 7, 0);
        state_values.insert(key, vec![0.1, 0.2, 0.3, 0.4, 0.5]);

        let table = SerializedAgentQTable {
            agent_type: 0,
            state_values,
        };

        let json = serde_json::to_string(&table).unwrap();
        let restored: SerializedAgentQTable = serde_json::from_str(&json).unwrap();

        assert_eq!(restored.agent_type, 0);
        assert_eq!(restored.state_values.len(), 1);
        let values = restored.state_values.get(&key).unwrap();
        assert_eq!(values.len(), 5);
    }

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
            agent_q_tables: vec![],
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
        assert_eq!(restored.agent_q_tables.len(), 0);
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
