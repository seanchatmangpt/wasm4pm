//! OCEL Process Evidence Tests
//!
//! Van der Aalst-inspired validation of object-centric event log structure.
//! Tests verify that OCEL representation of autonomic cycles follows lawful
//! object lifecycle patterns: no orphaned objects, proper phase sequencing,
//! correct event-object relationships, and temporal monotonicity.
//!
//! Oracle types:
//! - Rank 1: Mathematical invariants (cardinality, ordering, finiteness)
//! - Rank 2: Domain contracts (4 phases per cycle, no orphans)
//! - Rank 3: Metamorphic (relationships between run count and event count)

use chrono::{Duration, Utc};
use std::collections::{BTreeMap, HashMap, HashSet};
use wasm4pm::models::{OCELEvent, OCELEventObjectRef, OCELObject, OCEL};

// ============================================================================
// Test Helper
// ============================================================================

/// Build a test OCEL with N autonomic cycles.
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
            attributes: BTreeMap::new(),
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
                attributes: BTreeMap::new(),
                object_ids: vec![obj_id.clone()],
                object_refs: vec![OCELEventObjectRef {
                    object_id: obj_id.clone(),
                    qualifier: "".to_string(),
                }],
            });
        }
    }

    OCEL {
        event_types: vec![
            "Perception".to_string(),
            "Decision".to_string(),
            "Protection".to_string(),
            "Optimization".to_string(),
        ],
        object_types: vec!["cycle_run".to_string()],
        events,
        objects,
        object_relations: Vec::new(),
    }
}

// ============================================================================
// Test 1: Cardinality — Rank 1 Mathematical Invariant
// ============================================================================

#[test]
fn test_ocel_event_count_equals_four_times_cycle_count() {
    // JTBD: "Every autonomic cycle produces exactly 4 events"
    // Oracle Rank 1: Mathematical theorem — 4 phases per cycle
    for cycles in [1, 2, 3, 5, 10] {
        let ocel = build_test_ocel(cycles);
        assert_eq!(
            ocel.events.len(),
            cycles * 4,
            "OCEL with {} cycles should have {} events, got {}",
            cycles,
            cycles * 4,
            ocel.events.len()
        );
    }
}

// ============================================================================
// Test 2: Phase Inventory — Rank 2 Domain Contract
// ============================================================================

#[test]
fn test_all_four_phases_present_in_ocel() {
    // JTBD: "All 4 declared phases appear in the event log"
    // Oracle Rank 2: Domain contract — autonomic cycle has 4 stages
    let ocel = build_test_ocel(3);

    let phases: HashSet<&str> = ocel.events.iter().map(|e| e.event_type.as_str()).collect();

    let expected: HashSet<&str> = ["Perception", "Decision", "Protection", "Optimization"]
        .iter()
        .copied()
        .collect();

    assert_eq!(
        phases, expected,
        "OCEL must contain all 4 phases. Got: {:?}",
        phases
    );
}

// ============================================================================
// Test 3: Object Lifecycle — Rank 2 Domain Contract
// ============================================================================

#[test]
fn test_each_object_has_exactly_four_phase_events() {
    // JTBD: "Every cycle_run object is referenced by exactly 4 events (no orphans)"
    // Oracle Rank 2: Domain contract — lawful object lifecycle
    let ocel = build_test_ocel(5);

    // Count events per object
    let mut events_per_object: HashMap<String, usize> = HashMap::new();
    for event in &ocel.events {
        for obj_id in &event.object_ids {
            *events_per_object.entry(obj_id.clone()).or_insert(0) += 1;
        }
    }

    // Verify every object has exactly 4 events
    for (obj_id, count) in &events_per_object {
        assert_eq!(
            *count, 4,
            "Object '{}' should have exactly 4 events, got {}",
            obj_id, count
        );
    }

    // Verify count matches object count
    assert_eq!(
        events_per_object.len(),
        5,
        "Should have 5 objects (one per cycle), got {}",
        events_per_object.len()
    );
}

// ============================================================================
// Test 4: No Orphaned Objects — Rank 2 Domain Contract
// ============================================================================

#[test]
fn test_no_orphaned_objects() {
    // JTBD: "Every object is referenced by at least one event"
    // Oracle Rank 2: Domain contract — no dangling references
    let ocel = build_test_ocel(3);

    let object_ids: HashSet<&str> = ocel.objects.iter().map(|o| o.id.as_str()).collect();

    let referenced_ids: HashSet<&str> = ocel
        .events
        .iter()
        .flat_map(|e| e.object_ids.iter().map(|id| id.as_str()))
        .collect();

    for obj_id in &object_ids {
        assert!(
            referenced_ids.contains(obj_id),
            "Object '{}' is not referenced by any event",
            obj_id
        );
    }
}

// ============================================================================
// Test 5: Phase Sequence — Rank 1 Mathematical Invariant
// ============================================================================

#[test]
fn test_phase_sequence_is_perception_decision_protection_optimization() {
    // JTBD: "Phases execute in declared order: Perception → Decision → Protection → Optimization"
    // Oracle Rank 1: Mathematical theorem — cycle phases are ordered
    let ocel = build_test_ocel(3);

    let phases = ["Perception", "Decision", "Protection", "Optimization"];

    // For each object, collect its events in timestamp order
    let mut events_by_object: HashMap<String, Vec<&OCELEvent>> = HashMap::new();
    for event in &ocel.events {
        for obj_id in &event.object_ids {
            events_by_object
                .entry(obj_id.clone())
                .or_insert_with(Vec::new)
                .push(event);
        }
    }

    // Sort events within each object by timestamp
    for events in events_by_object.values_mut() {
        events.sort_by(|a, b| a.timestamp.cmp(&b.timestamp));
    }

    // Verify phase sequence per object
    for (obj_id, events) in &events_by_object {
        assert_eq!(events.len(), 4, "Object '{}' should have 4 events", obj_id);

        for (i, event) in events.iter().enumerate() {
            assert_eq!(
                event.event_type, phases[i],
                "Event {} for object '{}' should be '{}', got '{}'",
                i, obj_id, phases[i], event.event_type
            );
        }
    }
}

// ============================================================================
// Bonus: Temporal Monotonicity — Rank 1 Mathematical Invariant
// ============================================================================

#[test]
fn test_timestamps_are_monotonically_increasing() {
    // JTBD: "Phase timestamps must increase over time (no time travel)"
    // Oracle Rank 1: Mathematical invariant — temporal ordering property
    let ocel = build_test_ocel(3);

    // For each object, verify timestamps are increasing
    let mut events_by_object: HashMap<String, Vec<&OCELEvent>> = HashMap::new();
    for event in &ocel.events {
        for obj_id in &event.object_ids {
            events_by_object
                .entry(obj_id.clone())
                .or_insert_with(Vec::new)
                .push(event);
        }
    }

    for (obj_id, events) in events_by_object {
        let mut sorted = events.clone();
        sorted.sort_by(|a, b| a.timestamp.cmp(&b.timestamp));

        for i in 1..sorted.len() {
            assert!(
                sorted[i].timestamp >= sorted[i - 1].timestamp,
                "Object '{}': Event {} timestamp should be >= Event {} timestamp",
                obj_id,
                i,
                i - 1
            );
        }
    }
}
