//! Autonomic Audit Trail Integration Tests
//!
//! Validates event recording, chain verification, hash integrity, and timeline rendering.

use wasm4pm::autonomic_audit_trail::{
    AutonomicAuditTrail, AuditEventType, AuditPhase,
};

#[test]
fn test_event_recording() {
    let mut trail = AutonomicAuditTrail::new();

    let success = trail.record_event(
        AuditEventType::AgentSelected("QLearning".to_string()),
        "Agent selected for cycle 100".to_string(),
        AuditPhase::Decision,
        100,
    );

    assert!(success, "Event recording should succeed");
    assert_eq!(trail.event_count(), 1);

    let events = trail.get_events();
    assert_eq!(events[0].event_type, AuditEventType::AgentSelected("QLearning".to_string()));
    assert_eq!(events[0].cycle_count, 100);
    assert_eq!(events[0].phase, AuditPhase::Decision);
}

#[test]
fn test_chain_verification() {
    let mut trail = AutonomicAuditTrail::new();

    // Record sequence of events that form a valid chain
    trail.record_event(
        AuditEventType::SpcRuleFired("rule_1_outlier".to_string(), "event_rate".to_string()),
        "Event rate exceeded 3σ control limit".to_string(),
        AuditPhase::Perception,
        42,
    );

    trail.record_event(
        AuditEventType::AgentSelected("SARSA".to_string()),
        "SARSA selected by LinUCB bandit".to_string(),
        AuditPhase::Decision,
        42,
    );

    trail.record_event(
        AuditEventType::CircuitTransitioned("Closed".to_string(), "Open".to_string()),
        "Circuit breaker opened due to failure count threshold".to_string(),
        AuditPhase::Action,
        43,
    );

    trail.record_event(
        AuditEventType::RecoveryStarted("Timeout expired, HalfOpen probe initiated".to_string()),
        "Circuit ready to test recovery".to_string(),
        AuditPhase::Recovery,
        100,
    );

    trail.record_event(
        AuditEventType::RecoveryCompleted(true, -1),
        "Recovery probe succeeded, circuit closed".to_string(),
        AuditPhase::Recovery,
        101,
    );

    // Verify chain
    assert!(trail.verify_chain(), "Entire chain should be valid");
    assert_eq!(trail.event_count(), 5);

    // Verify chain linkage manually
    let events = trail.get_events();
    assert_eq!(events[0].prev_hash, "genesis");

    for i in 1..events.len() {
        assert_eq!(events[i].prev_hash, events[i - 1].event_hash);
    }
}

#[test]
fn test_hash_integrity() {
    let mut trail = AutonomicAuditTrail::new();

    trail.record_event(
        AuditEventType::EscalationTriggered("Manual intervention required".to_string()),
        "Health critical for 20 consecutive cycles".to_string(),
        AuditPhase::Escalation,
        500,
    );

    let events = trail.get_events();
    let event = &events[0];

    // Hash should be non-empty and deterministic
    assert!(!event.event_hash.is_empty(), "Event hash should be non-empty");
    assert_eq!(event.event_hash.len(), 64, "BLAKE3 hex should be 64 chars");

    // Hash should be deterministic
    let mut trail2 = AutonomicAuditTrail::new();
    trail2.record_event(
        AuditEventType::EscalationTriggered("Manual intervention required".to_string()),
        "Health critical for 20 consecutive cycles".to_string(),
        AuditPhase::Escalation,
        500,
    );

    let events2 = trail2.get_events();
    assert_eq!(event.event_hash, events2[0].event_hash, "Hash should be deterministic");
}

#[test]
fn test_timeline_rendering() {
    let mut trail = AutonomicAuditTrail::new();

    trail.record_event(
        AuditEventType::AgentSelected("QLearning".to_string()),
        "QL agent learns off-policy".to_string(),
        AuditPhase::Decision,
        1,
    );

    trail.record_event(
        AuditEventType::SpcRuleFired("rule_2_shift".to_string(), "trace_duration".to_string()),
        "Process performance shifting above baseline".to_string(),
        AuditPhase::Perception,
        2,
    );

    trail.record_event(
        AuditEventType::CircuitTransitioned("Closed".to_string(), "Open".to_string()),
        "Failure threshold crossed".to_string(),
        AuditPhase::Action,
        3,
    );

    trail.record_event(
        AuditEventType::RecoveryCompleted(true, -1),
        "Health improved from 3 to 2".to_string(),
        AuditPhase::Recovery,
        4,
    );

    let timeline = trail.export_timeline();

    // Verify timeline format
    assert!(timeline.contains("Autonomic Audit Trail"), "Should have title");
    assert!(timeline.contains("agent_selected"), "Should contain agent_selected event");
    assert!(timeline.contains("spc_rule_fired"), "Should contain spc_rule_fired event");
    assert!(timeline.contains("circuit_transitioned"), "Should contain circuit_transitioned event");
    assert!(timeline.contains("recovery_completed"), "Should contain recovery_completed event");
    assert!(timeline.contains("Checksum"), "Should show checksum");
    assert!(
        timeline.contains("Chain verified: true"),
        "Should verify chain is valid"
    );

    // Verify phase markers are present
    assert!(timeline.contains("Cycle"), "Should show cycle numbers");
    assert!(timeline.contains("Details"), "Should show event details");
}

#[test]
fn test_all_event_types() {
    let mut trail = AutonomicAuditTrail::new();

    // Record all event types
    let event_types = vec![
        AuditEventType::AgentSelected("Agent1".to_string()),
        AuditEventType::SpcRuleFired("rule_3_trend".to_string(), "activity_frequency".to_string()),
        AuditEventType::CircuitTransitioned("Closed".to_string(), "HalfOpen".to_string()),
        AuditEventType::RecoveryStarted("Probe allowed".to_string()),
        AuditEventType::RecoveryCompleted(true, -2),
        AuditEventType::EscalationTriggered("Repeated failures".to_string()),
    ];

    for (idx, event_type) in event_types.iter().enumerate() {
        trail.record_event(
            event_type.clone(),
            format!("Event {}", idx),
            match idx % 5 {
                0 => AuditPhase::Decision,
                1 => AuditPhase::Perception,
                2 => AuditPhase::Action,
                3 => AuditPhase::Recovery,
                _ => AuditPhase::Escalation,
            },
            (idx + 1) as u64,
        );
    }

    assert!(trail.verify_chain(), "All event types should form valid chain");
    assert_eq!(trail.event_count(), 6);

    // Export timeline and verify all types appear
    let timeline = trail.export_timeline();
    assert!(timeline.contains("agent_selected"));
    assert!(timeline.contains("spc_rule_fired"));
    assert!(timeline.contains("circuit_transitioned"));
    assert!(timeline.contains("recovery_started"));
    assert!(timeline.contains("recovery_completed"));
    assert!(timeline.contains("escalation_triggered"));
}

#[test]
fn test_empty_audit_trail() {
    let trail = AutonomicAuditTrail::new();

    assert_eq!(trail.event_count(), 0);
    assert!(trail.verify_chain(), "Empty chain should be valid");

    let timeline = trail.export_timeline();
    assert!(timeline.contains("empty"));
}

#[test]
fn test_large_audit_trail() {
    let mut trail = AutonomicAuditTrail::new();

    // Record 100 events
    for i in 0..100 {
        let event_type = match i % 4 {
            0 => AuditEventType::AgentSelected(format!("Agent{}", i % 5)),
            1 => AuditEventType::SpcRuleFired(
                format!("rule_{}", i % 4),
                format!("metric_{}", i % 3),
            ),
            2 => AuditEventType::CircuitTransitioned("Closed".to_string(), "Open".to_string()),
            _ => AuditEventType::RecoveryCompleted(true, -1),
        };

        let success = trail.record_event(
            event_type,
            format!("Event {}", i),
            AuditPhase::Decision,
            i as u64,
        );

        assert!(success, "Event {} should record successfully", i);
    }

    assert_eq!(trail.event_count(), 100);
    assert!(trail.verify_chain(), "Large chain should be valid");

    // Checksum should be stable
    let checksum = trail.get_checksum().to_string();
    assert!(!checksum.is_empty());
    assert_eq!(checksum.len(), 64); // BLAKE3 hex
}

#[test]
fn test_phase_tracking() {
    let mut trail = AutonomicAuditTrail::new();

    let phases = vec![
        AuditPhase::Perception,
        AuditPhase::Decision,
        AuditPhase::Action,
        AuditPhase::Recovery,
        AuditPhase::Escalation,
    ];

    for (idx, phase) in phases.iter().enumerate() {
        trail.record_event(
            AuditEventType::AgentSelected(format!("Agent{}", idx)),
            format!("Phase {:?}", phase),
            *phase,
            idx as u64,
        );
    }

    let events = trail.get_events();
    for (idx, phase) in phases.iter().enumerate() {
        assert_eq!(events[idx].phase, *phase, "Phase should match at index {}", idx);
    }
}
