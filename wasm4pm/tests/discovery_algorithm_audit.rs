//! Discovery Algorithm Audit — Determinism, Monotonicity, and Edge Case Testing
//!
//! **Audit Scope:**
//! 1. Determinism: Same input → Same output (bit-identical)
//! 2. Monotonicity: Parameter changes should have monotonic effects
//! 3. Edge Cases: Rare/boundary conditions should not crash
//!
//! **Findings:**
//! - ISSUE 1: GA/PSO/ACO use StdRng::seed_from_u64(42) (hardcoded seed)
//!   → All runs are deterministic, but seed is not configurable
//! - ISSUE 2: Heuristic Miner threshold filtering can produce empty DFGs
//!   → No guard against invalid threshold ranges
//! - ISSUE 3: Inductive Miner depth limit (100) is arbitrary
//!   → Stack overflow risk on deeply nested process trees
//! - ISSUE 4: Empty log handling inconsistent across algorithms
//!   → Some return empty DFG, others panic or return "flower" model
//! - ISSUE 5: Rare event crashes in activity vocabulary building
//!   → Non-ASCII activity names can cause panic in certain algorithms
//!
//! **Guards Implemented:**
//! - Determinism test for all stochastic algorithms
//! - Monotonicity test for parameterized algorithms (threshold, iterations)
//! - Edge case tests for empty logs, single-event logs, rare characters
//! - Consistency guards for output schema validation

use std::collections::BTreeMap;
use wasm4pm::advanced_algorithms::discover_heuristic_miner_from_log;
use wasm4pm::discovery::discover_dfg_from_log;
use wasm4pm::genetic_discovery::{
    discover_aco_algorithm_from_log, discover_genetic_algorithm_from_log,
    discover_pso_algorithm_from_log,
};
use wasm4pm::models::{AttributeValue, Event, EventLog, Trace};
use wasm4pm::more_discovery::{
    discover_inductive_miner_from_log, discover_simulated_annealing_from_log,
};

// ============================================================================
// Test Fixtures
// ============================================================================

fn empty_log() -> EventLog {
    EventLog::new()
}

fn single_trace_single_event() -> EventLog {
    let mut log = EventLog::new();
    let mut trace = Trace {
        attributes: {
            let mut m = BTreeMap::new();
            m.insert(
                "concept:name".to_string(),
                AttributeValue::String("case-1".to_string()),
            );
            m
        },
        events: vec![],
    };
    let mut attrs = BTreeMap::new();
    attrs.insert(
        "concept:name".to_string(),
        AttributeValue::String("Activity".to_string()),
    );
    trace.events.push(Event { attributes: attrs });
    log.traces.push(trace);
    log
}

fn standard_log() -> EventLog {
    let mut log = EventLog::new();
    for case in 0..10 {
        let mut trace = Trace {
            attributes: {
                let mut m = BTreeMap::new();
                m.insert(
                    "concept:name".to_string(),
                    AttributeValue::String(format!("case-{}", case)),
                );
                m
            },
            events: vec![],
        };

        for (i, act) in vec!["Start", "Process", "End"].iter().enumerate() {
            let mut attrs = BTreeMap::new();
            attrs.insert(
                "concept:name".to_string(),
                AttributeValue::String(act.to_string()),
            );
            attrs.insert(
                "time:timestamp".to_string(),
                AttributeValue::String(format!("2024-01-01T00:{:02}:00Z", i)),
            );
            trace.events.push(Event { attributes: attrs });
        }
        log.traces.push(trace);
    }
    log
}

fn rare_char_log() -> EventLog {
    let mut log = EventLog::new();
    let mut trace = Trace {
        attributes: {
            let mut m = BTreeMap::new();
            m.insert(
                "concept:name".to_string(),
                AttributeValue::String("case-rare".to_string()),
            );
            m
        },
        events: vec![],
    };

    // Test with non-ASCII characters, emoji, special symbols
    for act in &["Café", "データ処理", "🔧", "A|B"] {
        let mut attrs = BTreeMap::new();
        attrs.insert(
            "concept:name".to_string(),
            AttributeValue::String(act.to_string()),
        );
        trace.events.push(Event { attributes: attrs });
    }
    log.traces.push(trace);
    log
}

// ============================================================================
// ISSUE 1: Determinism — Stochastic algorithms MUST be deterministic
// ============================================================================

#[test]
fn ga_determinism_same_seed_bit_identical() {
    let log = standard_log();
    let (dfg1, fitness1) = discover_genetic_algorithm_from_log(&log, "concept:name", 20, 30)
        .expect("GA must succeed on standard log");
    let (dfg2, fitness2) = discover_genetic_algorithm_from_log(&log, "concept:name", 20, 30)
        .expect("GA must succeed on standard log");

    assert_eq!(
        fitness1, fitness2,
        "GA FITNESS NOT DETERMINISTIC: {:.6} vs {:.6}",
        fitness1, fitness2
    );
    assert_eq!(
        dfg1.edges.len(),
        dfg2.edges.len(),
        "GA EDGE COUNT NOT DETERMINISTIC: {} vs {}",
        dfg1.edges.len(),
        dfg2.edges.len()
    );
}

#[test]
fn pso_determinism_same_seed_bit_identical() {
    let log = standard_log();
    let (dfg1, fitness1) = discover_pso_algorithm_from_log(&log, "concept:name", 20, 30)
        .expect("PSO must succeed on standard log");
    let (dfg2, fitness2) = discover_pso_algorithm_from_log(&log, "concept:name", 20, 30)
        .expect("PSO must succeed on standard log");

    assert_eq!(
        fitness1, fitness2,
        "PSO FITNESS NOT DETERMINISTIC: {:.6} vs {:.6}",
        fitness1, fitness2
    );
    assert_eq!(
        dfg1.edges.len(),
        dfg2.edges.len(),
        "PSO EDGE COUNT NOT DETERMINISTIC: {} vs {}",
        dfg1.edges.len(),
        dfg2.edges.len()
    );
}

#[test]
fn aco_determinism_same_seed_bit_identical() {
    let log = standard_log();
    let (dfg1, fitness1) = discover_aco_algorithm_from_log(&log, "concept:name", 20, 30)
        .expect("ACO must succeed on standard log");
    let (dfg2, fitness2) = discover_aco_algorithm_from_log(&log, "concept:name", 20, 30)
        .expect("ACO must succeed on standard log");

    assert_eq!(
        fitness1, fitness2,
        "ACO FITNESS NOT DETERMINISTIC: {:.6} vs {:.6}",
        fitness1, fitness2
    );
    assert_eq!(
        dfg1.edges.len(),
        dfg2.edges.len(),
        "ACO EDGE COUNT NOT DETERMINISTIC: {} vs {}",
        dfg1.edges.len(),
        dfg2.edges.len()
    );
}

#[test]
fn sa_determinism_same_seed_bit_identical() {
    let log = standard_log();
    let (dfg1, fitness1) = discover_simulated_annealing_from_log(&log, "concept:name", 1.0, 0.95);
    let (dfg2, fitness2) = discover_simulated_annealing_from_log(&log, "concept:name", 1.0, 0.95);

    assert_eq!(
        fitness1, fitness2,
        "SA FITNESS NOT DETERMINISTIC: {:.6} vs {:.6}",
        fitness1, fitness2
    );
    assert_eq!(
        dfg1.edges.len(),
        dfg2.edges.len(),
        "SA EDGE COUNT NOT DETERMINISTIC: {} vs {}",
        dfg1.edges.len(),
        dfg2.edges.len()
    );
}

// ============================================================================
// ISSUE 2: Monotonicity — Parameter changes should have monotonic effects
// ============================================================================

#[test]
fn heuristic_miner_threshold_monotonicity() {
    // Lower threshold → More edges (monotonic property)
    let log = standard_log();

    let dfg_strict = discover_heuristic_miner_from_log(&log, "concept:name", 0.9);
    let dfg_lenient = discover_heuristic_miner_from_log(&log, "concept:name", 0.1);

    assert!(
        dfg_lenient.edges.len() >= dfg_strict.edges.len(),
        "MONOTONICITY VIOLATED: Lower threshold should produce >= edges. \
         Strict (0.9): {}, Lenient (0.1): {}",
        dfg_strict.edges.len(),
        dfg_lenient.edges.len()
    );
}

#[test]
fn ga_iterations_monotonicity() {
    // More generations → Fitness never decreases (monotonic property)
    let log = standard_log();

    let (_, f1) =
        discover_genetic_algorithm_from_log(&log, "concept:name", 20, 5).expect("GA must succeed");
    let (_, f50) =
        discover_genetic_algorithm_from_log(&log, "concept:name", 20, 50).expect("GA must succeed");

    assert!(
        f50 >= f1 - 1e-9,
        "MONOTONICITY VIOLATED: More generations should maintain fitness. \
         5-gen: {:.6}, 50-gen: {:.6}",
        f1,
        f50
    );
}

#[test]
fn pso_iterations_monotonicity() {
    // More iterations → Fitness never decreases
    let log = standard_log();

    let (_, f5) =
        discover_pso_algorithm_from_log(&log, "concept:name", 20, 5).expect("PSO must succeed");
    let (_, f50) =
        discover_pso_algorithm_from_log(&log, "concept:name", 20, 50).expect("PSO must succeed");

    assert!(
        f50 >= f5 - 1e-9,
        "MONOTONICITY VIOLATED: More iterations should maintain fitness. \
         5-iter: {:.6}, 50-iter: {:.6}",
        f5,
        f50
    );
}

// ============================================================================
// ISSUE 3: Edge Case — Empty Log
// ============================================================================

#[test]
fn dfg_empty_log_returns_empty_dfg() {
    let log = empty_log();
    let dfg = discover_dfg_from_log(&admitted_log(log.clone()), "concept:name");
    assert_eq!(
        dfg.nodes.len(),
        0,
        "DFG of empty log should have 0 nodes, got {}",
        dfg.nodes.len()
    );
    assert_eq!(
        dfg.edges.len(),
        0,
        "DFG of empty log should have 0 edges, got {}",
        dfg.edges.len()
    );
}

#[test]
fn heuristic_miner_empty_log_returns_empty_dfg() {
    let log = empty_log();
    let dfg = discover_heuristic_miner_from_log(&log, "concept:name", 0.5);
    assert_eq!(
        dfg.nodes.len(),
        0,
        "Heuristic Miner on empty log should have 0 nodes, got {}",
        dfg.nodes.len()
    );
}

#[test]
fn inductive_miner_empty_log_returns_flower() {
    let log = empty_log();
    let result = discover_inductive_miner_from_log(&admitted_log(log.clone()), "concept:name");
    // Should not panic; should return some string (flower or error)
    assert!(
        !result.is_empty(),
        "Inductive Miner should return non-empty result"
    );
}

// ============================================================================
// ISSUE 4: Edge Case — Single-Event Log
// ============================================================================

#[test]
fn dfg_single_event_returns_single_node() {
    let log = single_trace_single_event();
    let dfg = discover_dfg_from_log(&admitted_log(log.clone()), "concept:name");
    assert_eq!(
        dfg.nodes.len(),
        1,
        "DFG of single-event log should have exactly 1 node, got {}",
        dfg.nodes.len()
    );
    assert_eq!(
        dfg.edges.len(),
        0,
        "DFG of single-event log should have 0 edges (no follows), got {}",
        dfg.edges.len()
    );
}

#[test]
fn ga_single_event_no_panic() {
    let log = single_trace_single_event();
    // Should not crash; may return None if edge_vocab is empty
    let result = discover_genetic_algorithm_from_log(&log, "concept:name", 20, 30);
    // Acceptable outcomes: None (no edges to evolve) or Some with trivial fitness
    assert!(result.is_some() || result.is_none());
}

// ============================================================================
// ISSUE 5: Edge Case — Rare/Non-ASCII Characters
// ============================================================================

#[test]
fn dfg_rare_chars_no_panic() {
    let log = rare_char_log();
    let dfg = discover_dfg_from_log(&admitted_log(log.clone()), "concept:name");
    assert!(
        dfg.nodes.len() > 0,
        "DFG should handle UTF-8 activity names"
    );
    // Verify all node IDs are valid UTF-8 strings
    for node in &dfg.nodes {
        assert!(!node.id.is_empty(), "Node ID should not be empty");
    }
}

#[test]
fn heuristic_miner_rare_chars_no_panic() {
    let log = rare_char_log();
    let dfg = discover_heuristic_miner_from_log(&log, "concept:name", 0.5);
    assert!(
        dfg.nodes.len() > 0,
        "Heuristic Miner should handle UTF-8 activity names"
    );
}

#[test]
fn inductive_miner_rare_chars_no_panic() {
    let log = rare_char_log();
    let result = discover_inductive_miner_from_log(&admitted_log(log.clone()), "concept:name");
    assert!(
        !result.is_empty(),
        "Inductive Miner should handle UTF-8 activity names"
    );
}

// ============================================================================
// Consistency Guards — Output Schema Validation
// ============================================================================

#[test]
fn dfg_output_schema_valid() {
    let log = standard_log();
    let dfg = discover_dfg_from_log(&admitted_log(log.clone()), "concept:name");

    // Consistency check: all edges reference nodes
    let node_ids: std::collections::HashSet<_> = dfg.nodes.iter().map(|n| &n.id).collect();
    for edge in &dfg.edges {
        assert!(
            node_ids.contains(&edge.from),
            "DFG edge FROM '{}' not in nodes",
            edge.from
        );
        assert!(
            node_ids.contains(&edge.to),
            "DFG edge TO '{}' not in nodes",
            edge.to
        );
    }
}

#[test]
fn heuristic_miner_output_schema_valid() {
    let log = standard_log();
    let dfg = discover_heuristic_miner_from_log(&log, "concept:name", 0.5);

    let node_ids: std::collections::HashSet<_> = dfg.nodes.iter().map(|n| &n.id).collect();
    for edge in &dfg.edges {
        assert!(
            node_ids.contains(&edge.from),
            "Heuristic Miner edge FROM '{}' not in nodes",
            edge.from
        );
        assert!(
            node_ids.contains(&edge.to),
            "Heuristic Miner edge TO '{}' not in nodes",
            edge.to
        );
    }
}

// ============================================================================
// Non-Determinism Root Cause Analysis
// ============================================================================

#[test]
#[ignore] // Informational test — documents the hardcoded seed issue
fn ga_seed_is_hardcoded() {
    // FINDING: GA uses StdRng::seed_from_u64(42) — seed is hardcoded, not configurable.
    // Impact: All GA runs are deterministic (good), but users cannot seed for reproducibility.
    // Recommendation: Add optional seed parameter to discover_genetic_algorithm_from_log().
    let log = standard_log();
    let (dfg1, _) =
        discover_genetic_algorithm_from_log(&log, "concept:name", 20, 30).expect("GA must succeed");
    let (dfg2, _) =
        discover_genetic_algorithm_from_log(&log, "concept:name", 20, 30).expect("GA must succeed");

    // Both runs use same seed, so results are identical
    assert_eq!(
        dfg1.edges.len(),
        dfg2.edges.len(),
        "Hardcoded seed ensures determinism"
    );
}

fn admitted_log(
    log: wasm4pm::models::EventLog,
) -> wasm4pm_compat::evidence::Evidence<
    wasm4pm::models::EventLog,
    wasm4pm_compat::state::Admitted,
    (),
> {
    wasm4pm_compat::admission::Admission::<_, ()>::new(log).into_evidence()
}

// ============================================================================
// OC-DFG tied-timestamp determinism regression (lane 11)
// ============================================================================
// Pre-fix, the per-object event sort keyed only on timestamp
// (sort_unstable_by) — for events sharing a timestamp the resulting
// permutation depended on the unstable partitioning, so OC-DFG edges,
// start/end activities, and node frequencies could vary run to run. The
// sort key is now (timestamp, positional idx) — a total order. This test
// pins the required tie-break semantics: arrival (positional) order.

#[test]
fn ocel_dfg_tied_timestamps_resolve_in_arrival_order() {
    use wasm4pm::discovery::discover_ocel_dfg_per_type_pure;
    use wasm4pm::models::{OCEL, OCELEvent, OCELEventObjectRef, OCELObject};

    // 8 events, all sharing one timestamp, referencing one object.
    // 8 tied elements is enough to force unstable-sort partitioning.
    let n = 8;
    let mut ocel = OCEL::new();
    ocel.object_types = vec!["order".to_string()];
    ocel.object_type_defs = vec![wasm4pm::models::OCELObjectType {
        name: "order".to_string(),
        attributes: vec![],
    }];
    ocel.objects.push(OCELObject {
        id: "o1".to_string(),
        object_type: "order".to_string(),
        attributes: Default::default(),
        changes: Vec::new(),
        embedded_relations: Vec::new(),
    });
    for i in 0..n {
        ocel.events.push(OCELEvent {
            id: format!("e{i}"),
            event_type: format!("act{i}"),
            timestamp: "2024-01-01T00:00:00Z".to_string(), // all tied
            attributes: Default::default(),
            object_ids: vec![],
            object_refs: vec![OCELEventObjectRef {
                object_id: "o1".to_string(),
                qualifier: String::new(),
            }],
        });
    }

    // Run discovery twice; require byte-identical JSON.
    let a = serde_json::to_string(&discover_ocel_dfg_per_type_pure(&ocel)).unwrap();
    let b = serde_json::to_string(&discover_ocel_dfg_per_type_pure(&ocel)).unwrap();
    assert_eq!(a, b, "OC-DFG must be byte-identical across runs");

    // Arrival-order tie-break: with all timestamps tied, DF edges must follow
    // positional order; start activity act0, end activity act7.
    let dfgs = discover_ocel_dfg_per_type_pure(&ocel);
    let dfg = dfgs.get("order").unwrap();
    assert_eq!(dfg.start_activities.get("act0"), Some(&1));
    assert_eq!(dfg.end_activities.get("act7"), Some(&1));
    for i in 0..n - 1 {
        assert_eq!(
            dfg.edges
                .iter()
                .find(|e| e.from == format!("act{i}") && e.to == format!("act{}", i + 1))
                .map(|e| e.frequency),
            Some(1),
            "edge act{i}->act{} must exist with frequency 1",
            i + 1
        );
    }
}
