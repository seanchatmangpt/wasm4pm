//! Metamorphic Relation Tests for DFG Discovery
//!
//! Van der Aalst Process Mining — testing discovered process models under input perturbations.
//! Metamorphic relations specify relationships between multiple test cases without requiring
//! absolute output values.
//!
//! These tests implement Category E from ADVERSARIAL_TEST_PLAN.md:
//! - E1: Larger log → more or equal DFG edges (input size perturbation)
//! - E2: DFG edge frequency scales linearly with object count (metamorphic property)
//! - E3: More phases → larger DFG topology (activity diversity perturbation)

use chrono::{Duration, Utc};
use wasm4pm::models::{OCELEvent, OCELEventObjectRef, OCELObject, OCEL};
use wasm4pm::discovery::discover_ocel_dfg_pure;
use std::collections::HashMap;

// ============================================================================
// Test Helper — OCEL Construction
// ============================================================================

/// Build a test OCEL with N autonomic cycles, each with P phases.
/// Phases execute in declared order with monotonically increasing timestamps.
fn build_test_ocel_with_phases(cycles: usize, phases: &[&str]) -> OCEL {
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

        // Create P phase events for this cycle
        for (j, phase) in phases.iter().enumerate() {
            let event_id = format!("{}_{}", obj_id, phase.to_lowercase());
            let timestamp = (base_time + Duration::seconds((i as i64) * (phases.len() as i64) + (j as i64)))
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

    let event_types: Vec<String> = phases.iter().map(|p| p.to_string()).collect();
    OCEL {
        event_types,
        object_types: vec!["cycle_run".to_string()],
        events,
        objects,
        object_relations: Vec::new(),
    }
}

// ============================================================================
// Test E1: Larger Log → More or Equal DFG Edges
// ============================================================================

#[test]
fn test_larger_log_has_more_or_equal_dfg_edges() {
    // JTBD: "Larger event logs should produce DFGs with >= edges than smaller logs"
    // Oracle Rank 3: Metamorphic relation — input size perturbation
    // Van der Aalst doctrine: "Larger event populations should reveal at least as many
    // distinct directly-follows relationships as smaller populations"

    let phases = ["Perception", "Decision", "Protection", "Optimization"];

    // Small OCEL: 3 objects × 4 phases = 12 events
    let small_ocel = build_test_ocel_with_phases(3, &phases);
    let small_dfg = discover_ocel_dfg_pure(&small_ocel);

    // Large OCEL: 10 objects × 4 phases = 40 events (same phase sequence)
    let large_ocel = build_test_ocel_with_phases(10, &phases);
    let large_dfg = discover_ocel_dfg_pure(&large_ocel);

    assert!(
        large_dfg.edges.len() >= small_dfg.edges.len(),
        "Larger log (40 events) should have >= edges than smaller log (12 events). \
         Small edges: {}, Large edges: {}",
        small_dfg.edges.len(),
        large_dfg.edges.len()
    );

    // Both should discover the same set of edges (same phase sequence)
    assert_eq!(
        small_dfg.edges.len(),
        large_dfg.edges.len(),
        "Small and large OCELs with same phase sequence should discover same number of edges"
    );
}

// ============================================================================
// Test E2: DFG Edge Frequency Scales Linearly with Object Count
// ============================================================================

#[test]
fn test_dfg_frequency_scales_linearly_with_object_count() {
    // JTBD: "DFG edge frequency should scale linearly with object count"
    // Oracle Rank 3: Metamorphic relation — frequency as function of input size
    // Van der Aalst doctrine: "Each object produces one directly-follows relationship per phase pair"

    let phases = ["Perception", "Decision", "Protection", "Optimization"];

    for object_count in [1, 5, 10] {
        let ocel = build_test_ocel_with_phases(object_count, &phases);
        let dfg = discover_ocel_dfg_pure(&ocel);

        // Each of the 3 phase transitions should occur once per object
        let edges_map: std::collections::HashMap<(&str, &str), usize> = dfg
            .edges
            .iter()
            .map(|e| ((e.from.as_str(), e.to.as_str()), e.frequency))
            .collect();

        assert_eq!(
            edges_map.get(&("Perception", "Decision")).copied().unwrap_or(0),
            object_count,
            "Edge Perception→Decision frequency should equal object count ({})",
            object_count
        );
        assert_eq!(
            edges_map.get(&("Decision", "Protection")).copied().unwrap_or(0),
            object_count,
            "Edge Decision→Protection frequency should equal object count ({})",
            object_count
        );
        assert_eq!(
            edges_map.get(&("Protection", "Optimization")).copied().unwrap_or(0),
            object_count,
            "Edge Protection→Optimization frequency should equal object count ({})",
            object_count
        );
    }
}

// ============================================================================
// Test E3: Different Phase Sequences Produce Different DFG Topologies
// ============================================================================

#[test]
fn test_different_phase_sequences_produce_different_dfg_topologies() {
    // JTBD: "More phases should produce larger DFG topology"
    // Oracle Rank 3: Metamorphic relation — activity diversity perturbation
    // Van der Aalst doctrine: "More distinct activities → more nodes, more potential edges"

    // 2-phase sequence
    let two_phase_ocel = build_test_ocel_with_phases(5, &["PhaseA", "PhaseB"]);
    let two_phase_dfg = discover_ocel_dfg_pure(&two_phase_ocel);

    // 3-phase sequence
    let three_phase_ocel = build_test_ocel_with_phases(5, &["PhaseA", "PhaseB", "PhaseC"]);
    let three_phase_dfg = discover_ocel_dfg_pure(&three_phase_ocel);

    // 3-phase should have more nodes than 2-phase (more activity types)
    assert_eq!(
        two_phase_dfg.nodes.len(),
        2,
        "2-phase OCEL should discover 2 nodes (PhaseA, PhaseB)"
    );
    assert_eq!(
        three_phase_dfg.nodes.len(),
        3,
        "3-phase OCEL should discover 3 nodes (PhaseA, PhaseB, PhaseC)"
    );

    assert!(
        three_phase_dfg.nodes.len() > two_phase_dfg.nodes.len(),
        "3-phase DFG should have more nodes than 2-phase DFG. \
         2-phase nodes: {}, 3-phase nodes: {}",
        two_phase_dfg.nodes.len(),
        three_phase_dfg.nodes.len()
    );

    // 3-phase should have more edges (more directly-follows relationships)
    assert!(
        three_phase_dfg.edges.len() > two_phase_dfg.edges.len(),
        "3-phase DFG should have more edges than 2-phase DFG. \
         2-phase edges: {}, 3-phase edges: {}",
        two_phase_dfg.edges.len(),
        three_phase_dfg.edges.len()
    );
}

// ============================================================================
// Test E4 (Category E — Metamorphic): TS-1 regression
// Duration proportional to actual time gap
// ============================================================================

#[test]
fn test_e4_ts1_regression_duration_proportional_to_time_gap() {
    // TS-1 fix: parse_iso8601_duration must return a value proportional to the
    // actual time gap between ISO-8601 timestamps, not String::len().
    //
    // ISO-8601 strings are fixed length — String::len() always produces 0 for
    // same-length timestamps. After the fix, real millisecond durations are returned.
    //
    // Metamorphic property:
    //   gap(t1, t3) == gap(t1, t2) + gap(t2, t3)  (additivity)
    //   gap(t1, t2) > 0 when t2 > t1               (positive for future timestamps)
    //   gap(t1, t2) * 2 == gap(t1, t3) when gap(t2,t3) == gap(t1,t2) (linearity)

    // Timestamps 1 hour apart
    let t1 = "2026-04-13T10:00:00Z";
    let t2 = "2026-04-13T11:00:00Z"; // 1 hour = 3_600_000 ms later
    let t3 = "2026-04-13T12:00:00Z"; // 2 hours = 7_200_000 ms later

    let gap_t1_t2 = wasm4pm::parse_iso8601_duration(t1, t2);
    let gap_t2_t3 = wasm4pm::parse_iso8601_duration(t2, t3);
    let gap_t1_t3 = wasm4pm::parse_iso8601_duration(t1, t3);

    // Property 1: duration must be positive for future timestamps (not 0 from len())
    assert!(
        gap_t1_t2 > 0.0,
        "TS-1 REGRESSION: gap between t1 and t2 must be positive (1 hour = 3_600_000 ms). \
         Got {:.0}. If 0.0, String::len() is still being used.",
        gap_t1_t2
    );

    // Property 2: exact duration (1 hour = 3_600_000 ms)
    assert!(
        (gap_t1_t2 - 3_600_000.0).abs() < 1000.0, // within 1 second tolerance
        "TS-1 REGRESSION: gap_t1_t2 should be ~3_600_000 ms (1 hour): got {:.0}",
        gap_t1_t2
    );

    // Property 3: additivity — gap(t1,t3) == gap(t1,t2) + gap(t2,t3)
    assert!(
        (gap_t1_t3 - (gap_t1_t2 + gap_t2_t3)).abs() < 1000.0,
        "TS-1 REGRESSION: Additive property must hold: gap(t1,t3)={:.0} should equal \
         gap(t1,t2)+gap(t2,t3)={:.0}",
        gap_t1_t3,
        gap_t1_t2 + gap_t2_t3
    );

    // Property 4: linearity — equal intervals produce equal gaps
    assert!(
        (gap_t1_t2 - gap_t2_t3).abs() < 1000.0,
        "TS-1 REGRESSION: Equal time intervals should produce equal gaps. \
         gap_t1_t2={:.0}, gap_t2_t3={:.0}",
        gap_t1_t2,
        gap_t2_t3
    );

    // Property 5: gap(t1,t3) == 2 * gap(t1,t2) (since t3 is 2x further than t2)
    assert!(
        (gap_t1_t3 - 2.0 * gap_t1_t2).abs() < 1000.0,
        "TS-1 REGRESSION: gap(t1,t3) should be 2x gap(t1,t2). \
         gap_t1_t3={:.0}, 2*gap_t1_t2={:.0}",
        gap_t1_t3,
        2.0 * gap_t1_t2
    );
}
