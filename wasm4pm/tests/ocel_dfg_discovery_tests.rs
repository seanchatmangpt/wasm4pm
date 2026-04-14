//! OCEL DFG Discovery Tests
//!
//! Van der Aalst Process Mining — proving that the process model discovered from
//! OCEL evidence matches the declared 4-phase autonomic cycle sequence.
//!
//! These tests verify that:
//! 1. DFG nodes include all declared phase activities
//! 2. DFG edges show correct temporal ordering (Perception→Decision→Protection→Optimization)
//! 3. Negative test: wrong phase order in OCEL produces inverted edges (proving discovery detects violations)

use chrono::{Duration, Utc};
use pictl::models::{OCELEvent, OCELEventObjectRef, OCELObject, OCEL};
use pictl::discovery::discover_ocel_dfg_pure;
use std::collections::{HashMap, HashSet};

// ============================================================================
// Test Helper
// ============================================================================

/// Build a test OCEL with N autonomic cycles in correct order.
/// Each cycle has 4 phases (Perception, Decision, Protection, Optimization),
/// represented as 4 events with monotonically increasing timestamps.
fn build_test_ocel(cycles: usize) -> OCEL {
    let phases = ["Perception", "Decision", "Protection", "Optimization"];
    let base_time = Utc::now();
    let mut events = Vec::new();
    let mut objects = Vec::new();

    for i in 0..cycles {
        let obj_id = format!("run_{}", i);

        // Create cycle_run object
        objects.push(OCELObject {
            id: obj_id.clone(),
            object_type: "cycle_run".to_string(),
            attributes: HashMap::new(),
            changes: Vec::new(),
            embedded_relations: Vec::new(),
        });

        // Create 4 phase events for this cycle
        for (j, phase) in phases.iter().enumerate() {
            let event_id = format!("{}_{}", obj_id, phase.to_lowercase());
            let timestamp = (base_time + Duration::seconds((i * 4 + j) as i64))
                .format("%Y-%m-%dT%H:%M:%S%.3fZ")
                .to_string();

            events.push(OCELEvent {
                id: event_id,
                event_type: phase.to_string(),
                timestamp,
                attributes: HashMap::new(),
                object_ids: vec![obj_id.clone()],
                object_refs: vec![OCELEventObjectRef {
                    object_id: obj_id.clone(),
                    qualifier: "".to_string(),
                }],
            });
        }
    }

    OCEL {
        event_types: vec!["Perception".to_string(), "Decision".to_string(), "Protection".to_string(), "Optimization".to_string()],
        object_types: vec!["cycle_run".to_string()],
        events,
        objects,
        object_relations: Vec::new(),
    }
}

/// Build a test OCEL with phases in WRONG order (reversed).
/// Useful for negative testing: prove that DFG reveals the phase-order violation.
fn build_reversed_ocel(cycles: usize) -> OCEL {
    let phases = ["Optimization", "Protection", "Decision", "Perception"];  // WRONG ORDER
    let base_time = Utc::now();
    let mut events = Vec::new();
    let mut objects = Vec::new();

    for i in 0..cycles {
        let obj_id = format!("run_{}", i);

        objects.push(OCELObject {
            id: obj_id.clone(),
            object_type: "cycle_run".to_string(),
            attributes: HashMap::new(),
            changes: Vec::new(),
            embedded_relations: Vec::new(),
        });

        for (j, phase) in phases.iter().enumerate() {
            let event_id = format!("{}_{}", obj_id, phase.to_lowercase());
            let timestamp = (base_time + Duration::seconds((i * 4 + j) as i64))
                .format("%Y-%m-%dT%H:%M:%S%.3fZ")
                .to_string();

            events.push(OCELEvent {
                id: event_id,
                event_type: phase.to_string(),
                timestamp,
                attributes: HashMap::new(),
                object_ids: vec![obj_id.clone()],
                object_refs: vec![OCELEventObjectRef {
                    object_id: obj_id.clone(),
                    qualifier: "".to_string(),
                }],
            });
        }
    }

    OCEL {
        event_types: vec!["Perception".to_string(), "Decision".to_string(), "Protection".to_string(), "Optimization".to_string()],
        object_types: vec!["cycle_run".to_string()],
        events,
        objects,
        object_relations: Vec::new(),
    }
}

// ============================================================================
// Test 1: All Four Phase Nodes Present
// ============================================================================

#[test]
fn test_dfg_has_all_four_phase_nodes() {
    // JTBD: "I need the DFG to show all 4 declared phases as nodes"
    // Oracle Rank 2: Domain contract — autonomic cycle has 4 stages
    let ocel = build_test_ocel(5);
    let dfg = discover_ocel_dfg_pure(&ocel);

    let node_ids: HashSet<&str> = dfg.nodes.iter().map(|n| n.id.as_str()).collect();

    assert!(node_ids.contains("Perception"), "DFG must have Perception node");
    assert!(node_ids.contains("Decision"), "DFG must have Decision node");
    assert!(node_ids.contains("Protection"), "DFG must have Protection node");
    assert!(node_ids.contains("Optimization"), "DFG must have Optimization node");
}

// ============================================================================
// Test 2: Correct Directed Edges with Proper Frequency
// ============================================================================

#[test]
fn test_dfg_has_correct_directed_edges() {
    // JTBD: "I need the DFG to show Perception→Decision→Protection→Optimization ordering"
    // Oracle Rank 2: Domain contract — phase sequence is lawful
    let ocel = build_test_ocel(5);
    let dfg = discover_ocel_dfg_pure(&ocel);

    let edges_map: HashMap<(&str, &str), usize> =
        dfg.edges.iter()
            .map(|e| ((e.from.as_str(), e.to.as_str()), e.frequency))
            .collect();

    // Verify the three correct edges, each with frequency = 5 (one per cycle)
    assert_eq!(
        edges_map.get(&("Perception", "Decision")).copied().unwrap_or(0),
        5,
        "Edge Perception→Decision should have frequency 5"
    );
    assert_eq!(
        edges_map.get(&("Decision", "Protection")).copied().unwrap_or(0),
        5,
        "Edge Decision→Protection should have frequency 5"
    );
    assert_eq!(
        edges_map.get(&("Protection", "Optimization")).copied().unwrap_or(0),
        5,
        "Edge Protection→Optimization should have frequency 5"
    );

    // Verify NO inverted edges exist
    assert_eq!(
        edges_map.get(&("Decision", "Perception")).copied(),
        None,
        "Inverted edge Decision→Perception must not exist"
    );
    assert_eq!(
        edges_map.get(&("Optimization", "Perception")).copied(),
        None,
        "No edge Optimization→Perception should exist (proves correct order)"
    );
}

// ============================================================================
// Test 3: Start Activity is Perception
// ============================================================================

#[test]
fn test_dfg_start_activity_is_perception() {
    // JTBD: "I need to prove the cycle starts with Perception"
    // Oracle Rank 2: Domain contract — Perception is the entry point
    let ocel = build_test_ocel(5);
    let dfg = discover_ocel_dfg_pure(&ocel);

    assert!(
        dfg.start_activities.contains_key("Perception"),
        "Start activities must include Perception"
    );
    assert_eq!(
        dfg.start_activities["Perception"],
        5,
        "Perception should be the first activity for all 5 cycles"
    );

    // Verify no other activity is a start
    assert!(
        !dfg.start_activities.contains_key("Decision"),
        "Decision should not be a start activity"
    );
    assert!(
        !dfg.start_activities.contains_key("Protection"),
        "Protection should not be a start activity"
    );
    assert!(
        !dfg.start_activities.contains_key("Optimization"),
        "Optimization should not be a start activity"
    );
}

// ============================================================================
// Test 4: End Activity is Optimization
// ============================================================================

#[test]
fn test_dfg_end_activity_is_optimization() {
    // JTBD: "I need to prove the cycle ends with Optimization"
    // Oracle Rank 2: Domain contract — Optimization is the exit point
    let ocel = build_test_ocel(5);
    let dfg = discover_ocel_dfg_pure(&ocel);

    assert!(
        dfg.end_activities.contains_key("Optimization"),
        "End activities must include Optimization"
    );
    assert_eq!(
        dfg.end_activities["Optimization"],
        5,
        "Optimization should be the last activity for all 5 cycles"
    );

    // Verify no other activity is an end
    assert!(
        !dfg.end_activities.contains_key("Perception"),
        "Perception should not be an end activity"
    );
    assert!(
        !dfg.end_activities.contains_key("Decision"),
        "Decision should not be an end activity"
    );
    assert!(
        !dfg.end_activities.contains_key("Protection"),
        "Protection should not be an end activity"
    );
}

// ============================================================================
// Test 5: NEGATIVE TEST — Wrong Phase Order Reveals Violation
// ============================================================================

#[test]
fn test_dfg_reversed_ocel_reveals_phase_order_violation() {
    // JTBD: "I need to prove that the DFG detects when phases execute in wrong order"
    // Oracle Rank 2: Domain contract — process mining reveals actual execution
    // Van der Aalst doctrine: "Inject impossible event sequences, verify discovery reveals the violation"
    let reversed_ocel = build_reversed_ocel(5);
    let dfg = discover_ocel_dfg_pure(&reversed_ocel);

    let edges_map: HashMap<(&str, &str), usize> =
        dfg.edges.iter()
            .map(|e| ((e.from.as_str(), e.to.as_str()), e.frequency))
            .collect();

    // Verify the inverted edges appear (Optimization→Protection→Decision→Perception)
    assert_eq!(
        edges_map.get(&("Optimization", "Protection")).copied().unwrap_or(0),
        5,
        "Edge Optimization→Protection should appear in reversed OCEL"
    );
    assert_eq!(
        edges_map.get(&("Protection", "Decision")).copied().unwrap_or(0),
        5,
        "Edge Protection→Decision should appear in reversed OCEL"
    );
    assert_eq!(
        edges_map.get(&("Decision", "Perception")).copied().unwrap_or(0),
        5,
        "Edge Decision→Perception should appear in reversed OCEL"
    );

    // Verify the CORRECT edges do NOT appear
    assert_eq!(
        edges_map.get(&("Perception", "Decision")).copied(),
        None,
        "Edge Perception→Decision must NOT appear when phases are reversed"
    );
    assert_eq!(
        edges_map.get(&("Decision", "Protection")).copied(),
        None,
        "Edge Decision→Protection must NOT appear when phases are reversed"
    );
    assert_eq!(
        edges_map.get(&("Protection", "Optimization")).copied(),
        None,
        "Edge Protection→Optimization must NOT appear when phases are reversed"
    );

    // Verify start/end are also reversed
    assert_eq!(
        dfg.start_activities.get("Optimization").copied().unwrap_or(0),
        5,
        "Optimization should be first in reversed order"
    );
    assert_eq!(
        dfg.end_activities.get("Perception").copied().unwrap_or(0),
        5,
        "Perception should be last in reversed order"
    );
}
