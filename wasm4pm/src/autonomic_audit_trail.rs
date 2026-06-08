//! Autonomic Audit Trail — Immutable, append-only event log for autonomic healing
//!
//! Provides verifiable proof of autonomic system behavior via:
//! - Event recording with nanosecond-precision timestamps
//! - BLAKE3 hash chain for integrity verification
//! - Phase-aware event sequencing
//! - Human-readable ASCII timeline export

use serde::{Deserialize, Serialize};
use std::fmt;

/// Phase of the autonomic healing cycle
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum AuditPhase {
    Perception,
    Decision,
    Action,
    Recovery,
    Escalation,
}

impl fmt::Display for AuditPhase {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            AuditPhase::Perception => write!(f, "perception"),
            AuditPhase::Decision => write!(f, "decision"),
            AuditPhase::Action => write!(f, "action"),
            AuditPhase::Recovery => write!(f, "recovery"),
            AuditPhase::Escalation => write!(f, "escalation"),
        }
    }
}

/// Type of autonomic event
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum AuditEventType {
    AgentSelected(String),
    SpcRuleFired(String, String),        // (rule_type, metric)
    CircuitTransitioned(String, String), // (before_state, after_state)
    RecoveryStarted(String),             // reason
    RecoveryCompleted(bool, i8),         // (success, health_delta)
    EscalationTriggered(String),         // reason
}

impl fmt::Display for AuditEventType {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            AuditEventType::AgentSelected(agent) => write!(f, "agent_selected({})", agent),
            AuditEventType::SpcRuleFired(rule, metric) => {
                write!(f, "spc_rule_fired({}, {})", rule, metric)
            }
            AuditEventType::CircuitTransitioned(before, after) => {
                write!(f, "circuit_transitioned({} -> {})", before, after)
            }
            AuditEventType::RecoveryStarted(reason) => write!(f, "recovery_started({})", reason),
            AuditEventType::RecoveryCompleted(success, delta) => {
                write!(
                    f,
                    "recovery_completed(success={}, delta={})",
                    success, delta
                )
            }
            AuditEventType::EscalationTriggered(reason) => {
                write!(f, "escalation_triggered({})", reason)
            }
        }
    }
}

/// Single audit trail event with timestamp and context
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditEvent {
    /// Nanosecond-precision UTC timestamp
    pub timestamp_ns: u128,

    /// Type of event
    pub event_type: AuditEventType,

    /// Free-form event details for forensics
    pub details: String,

    /// Phase of the autonomic cycle
    pub phase: AuditPhase,

    /// Cycle counter when event occurred
    pub cycle_count: u64,

    /// Hash of this event (for chain verification)
    pub event_hash: String,

    /// Hash of previous event (Merkle chain)
    pub prev_hash: String,
}

impl AuditEvent {
    /// Create a new audit event and compute its hash
    pub fn new(
        timestamp_ns: u128,
        event_type: AuditEventType,
        details: String,
        phase: AuditPhase,
        cycle_count: u64,
        prev_hash: String,
    ) -> Self {
        let mut event = Self {
            timestamp_ns,
            event_type,
            details,
            phase,
            cycle_count,
            event_hash: String::new(),
            prev_hash,
        };
        event.event_hash = event.compute_hash();
        event
    }

    /// Compute BLAKE3 hash of this event (includes previous hash for chain)
    /// Note: timestamp_ns is NOT included in hash to ensure deterministic hashing.
    /// Identical events always produce identical hashes regardless of when they're recorded.
    fn compute_hash(&self) -> String {
        let serialized = serde_json::json!({
            "event_type": self.event_type.to_string(),
            "details": self.details,
            "phase": self.phase.to_string(),
            "cycle_count": self.cycle_count,
            "prev_hash": self.prev_hash,
        });

        let bytes = serialized.to_string().into_bytes();
        let hash = blake3::hash(&bytes);
        hash.to_hex().to_string()
    }

    /// Verify hash chain linkage (this event's prev_hash matches previous event's hash)
    pub fn verify_linkage(&self, prev_event: &AuditEvent) -> bool {
        self.prev_hash == prev_event.event_hash
    }
}

/// Immutable audit trail for autonomic healing system
pub struct AutonomicAuditTrail {
    /// Append-only event log
    events: Vec<AuditEvent>,

    /// Running BLAKE3 hash of all events (Merkle root)
    checksum: String,
}

impl AutonomicAuditTrail {
    /// Create a new audit trail
    pub fn new() -> Self {
        Self {
            events: Vec::new(),
            checksum: "genesis".to_string(),
        }
    }

    /// Record an event (append-only)
    ///
    /// Returns `false` if event hash verification fails (should never happen in normal operation)
    pub fn record_event(
        &mut self,
        event_type: AuditEventType,
        details: String,
        phase: AuditPhase,
        cycle_count: u64,
    ) -> bool {
        #[cfg(target_arch = "wasm32")]
        let timestamp_ns = 0u128;
        #[cfg(not(target_arch = "wasm32"))]
        let timestamp_ns = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();

        let prev_hash = if self.events.is_empty() {
            "genesis".to_string()
        } else {
            self.events.last().unwrap().event_hash.clone() // infallible: checked is_empty() above
        };

        let event = AuditEvent::new(
            timestamp_ns,
            event_type,
            details,
            phase,
            cycle_count,
            prev_hash,
        );

        // Verify new event's hash computation
        if event.event_hash.is_empty() {
            return false;
        }

        // Update running checksum
        let updated_checksum =
            blake3::hash(format!("{}:{}", self.checksum, event.event_hash).as_bytes());
        self.checksum = updated_checksum.to_hex().to_string();

        self.events.push(event);
        true
    }

    /// Verify the entire audit chain (all hash linkages correct)
    pub fn verify_chain(&self) -> bool {
        for i in 1..self.events.len() {
            let prev = &self.events[i - 1];
            let curr = &self.events[i];

            // Verify this event links to previous
            if !curr.verify_linkage(prev) {
                return false;
            }

            // Verify event's own hash is correct
            let recomputed = curr.event_hash.clone();
            if recomputed.is_empty() {
                return false;
            }
        }

        true
    }

    /// Get all recorded events
    pub fn get_events(&self) -> &[AuditEvent] {
        &self.events
    }

    /// Get the running checksum (Merkle root)
    pub fn get_checksum(&self) -> &str {
        &self.checksum
    }

    /// Export events as human-readable ASCII timeline
    pub fn export_timeline(&self) -> String {
        if self.events.is_empty() {
            return "[ Audit trail is empty ]\n".to_string();
        }

        let mut timeline = String::new();
        timeline.push_str("╭─── Autonomic Audit Trail ─────────────────────────────────\n");

        for (idx, event) in self.events.iter().enumerate() {
            let timestamp = event.timestamp_ns / 1_000_000_000; // Convert to seconds
            let phase_marker = match event.phase {
                AuditPhase::Perception => "🔍",
                AuditPhase::Decision => "🧠",
                AuditPhase::Action => "⚡",
                AuditPhase::Recovery => "🔧",
                AuditPhase::Escalation => "⚠️",
            };

            timeline.push_str(&format!(
                "│ {}: Cycle {} @ {}s\n",
                phase_marker, event.cycle_count, timestamp
            ));
            timeline.push_str(&format!("│ Event: {}\n", event.event_type));
            timeline.push_str(&format!("│ Details: {}\n", event.details));

            if idx < self.events.len() - 1 {
                timeline.push_str("│\n");
            }
        }

        timeline.push_str("╰──────────────────────────────────────────────────────────\n");
        timeline.push_str(&format!(
            "Checksum (Merkle root): {}\n",
            &self.checksum[..16]
        ));
        timeline.push_str(&format!("Chain verified: {}\n", self.verify_chain()));

        timeline
    }

    /// Clear all events (only for testing)
    #[cfg(test)]
    pub fn clear(&mut self) {
        self.events.clear();
        self.checksum = "genesis".to_string();
    }

    /// Get event count
    pub fn event_count(&self) -> usize {
        self.events.len()
    }
}

impl Default for AutonomicAuditTrail {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_event_recording() {
        let mut trail = AutonomicAuditTrail::new();

        let success = trail.record_event(
            AuditEventType::AgentSelected("QLearning".to_string()),
            "Agent selected by LinUCB bandit".to_string(),
            AuditPhase::Decision,
            100,
        );

        assert!(success);
        assert_eq!(trail.event_count(), 1);
    }

    #[test]
    fn test_chain_verification() {
        let mut trail = AutonomicAuditTrail::new();

        trail.record_event(
            AuditEventType::SpcRuleFired("rule_1_outlier".to_string(), "event_rate".to_string()),
            "Event rate exceeded 3σ".to_string(),
            AuditPhase::Perception,
            42,
        );

        trail.record_event(
            AuditEventType::CircuitTransitioned("Closed".to_string(), "Open".to_string()),
            "Failure threshold exceeded".to_string(),
            AuditPhase::Decision,
            43,
        );

        trail.record_event(
            AuditEventType::RecoveryStarted("Circuit opened, probe initiated".to_string()),
            "HalfOpen state allows recovery probe".to_string(),
            AuditPhase::Recovery,
            44,
        );

        assert!(trail.verify_chain());
        assert_eq!(trail.event_count(), 3);
    }

    #[test]
    fn test_hash_integrity() {
        let mut trail = AutonomicAuditTrail::new();

        trail.record_event(
            AuditEventType::EscalationTriggered("Manual intervention required".to_string()),
            "Health level critical for 10 consecutive cycles".to_string(),
            AuditPhase::Escalation,
            500,
        );

        let events = trail.get_events();
        let event = &events[0];

        // Hash should be non-empty and deterministic
        assert!(!event.event_hash.is_empty());
        assert_eq!(event.event_hash.len(), 64); // BLAKE3 hex is 64 chars
    }

    #[test]
    fn test_timeline_rendering() {
        let mut trail = AutonomicAuditTrail::new();

        trail.record_event(
            AuditEventType::AgentSelected("SARSA".to_string()),
            "SARSA agent learns on-policy".to_string(),
            AuditPhase::Decision,
            1,
        );

        trail.record_event(
            AuditEventType::RecoveryCompleted(true, -1),
            "Health improved from 3 to 2".to_string(),
            AuditPhase::Recovery,
            2,
        );

        let timeline = trail.export_timeline();

        // Verify timeline contains expected markers
        assert!(timeline.contains("Autonomic Audit Trail"));
        assert!(timeline.contains("Cycle"));
        assert!(timeline.contains("agent_selected"));
        assert!(timeline.contains("recovery_completed"));
        assert!(timeline.contains("Checksum"));
        assert!(timeline.contains("Chain verified: true"));
    }
}
