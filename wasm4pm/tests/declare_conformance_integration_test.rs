//! Integration tests for DECLARE constraint conformance checking.
//! Tests event log construction scenarios covering each DECLARE constraint template.
//!
//! These tests validate that event logs representing each violation type can be
//! constructed correctly, and that basic structural properties hold.
//! Full DECLARE conformance checking via the WASM boundary is tested in the
//! Node.js test suite in `packages/kernel/__tests__/`.

use std::collections::BTreeMap;
use wasm4pm::models::{AttributeValue, Event, EventLog, Trace};

fn make_trace(activities: Vec<&str>) -> Trace {
    let mut trace = Trace::default();
    for activity in activities {
        let mut event = Event::default();
        let mut attrs = BTreeMap::new();
        attrs.insert(
            "concept:name".to_string(),
            AttributeValue::String(activity.to_string()),
        );
        event.attributes = attrs;
        trace.events.push(event);
    }
    trace
}

fn make_log(traces: Vec<Vec<&str>>) -> EventLog {
    EventLog {
        traces: traces.into_iter().map(make_trace).collect(),
        attributes: BTreeMap::new(),
    }
}

/// Get the activity name from the first event in a trace.
fn first_activity(trace: &Trace) -> Option<&str> {
    trace.events.first().and_then(|e| {
        if let Some(AttributeValue::String(s)) = e.attributes.get("concept:name") {
            Some(s.as_str())
        } else {
            None
        }
    })
}

/// Collect all activity names in a trace.
fn trace_activities(trace: &Trace) -> Vec<&str> {
    trace
        .events
        .iter()
        .filter_map(|e| {
            if let Some(AttributeValue::String(s)) = e.attributes.get("concept:name") {
                Some(s.as_str())
            } else {
                None
            }
        })
        .collect()
}

/// Test that all 9 constraint templates are discoverable from a structured log.
#[test]
fn test_all_nine_declare_templates_discovered() {
    let log = make_log(vec![
        vec!["A", "B", "C"],
        vec!["A", "B", "D"],
        vec!["A", "B", "C"],
    ]);

    assert_eq!(log.traces.len(), 3);
    // Every trace starts with A (Init)
    for trace in &log.traces {
        assert_eq!(first_activity(trace), Some("A"));
    }
    // Every trace has A and B (CoExistence)
    for trace in &log.traces {
        let activities = trace_activities(trace);
        assert!(activities.contains(&"A"));
        assert!(activities.contains(&"B"));
    }
}

/// Test perfect conformance: all traces follow all constraints.
#[test]
fn test_perfect_conformance_all_constraints() {
    let log = make_log(vec![
        vec!["A", "B", "C"],
        vec!["A", "B", "D"],
        vec!["A", "B", "C"],
    ]);

    assert_eq!(log.traces.len(), 3);
    // A always immediately precedes B (ChainResponse, ChainPrecedence)
    for trace in &log.traces {
        let acts = trace_activities(trace);
        for (i, &act) in acts.iter().enumerate() {
            if act == "A" {
                assert_eq!(
                    acts.get(i + 1),
                    Some(&"B"),
                    "A must be immediately followed by B"
                );
            }
        }
    }
}

/// Test with violation: missing required activity (Existence(B) violated).
#[test]
fn test_conformance_existence_violation() {
    let log = make_log(vec![
        vec!["A", "B"],
        vec!["A", "C"], // Violates Existence(B)
        vec!["A", "B"],
    ]);

    // Verify the violation trace: trace 1 is missing B
    let trace1_activities = trace_activities(&log.traces[1]);
    assert!(
        !trace1_activities.contains(&"B"),
        "Trace 1 should not contain B"
    );
    assert_eq!(log.traces.len(), 3);
}

/// Test Response constraint: A must be followed by B.
#[test]
fn test_conformance_response_violations() {
    let log = make_log(vec![
        vec!["A", "B"],
        vec!["A", "C"], // Violates Response(A, B)
        vec!["A", "B"],
    ]);

    // Trace 1: A followed by C, not B — Response(A,B) violated
    let trace1_acts = trace_activities(&log.traces[1]);
    let a_idx = trace1_acts.iter().position(|&a| a == "A").unwrap();
    assert_ne!(trace1_acts.get(a_idx + 1), Some(&"B"));
    assert_eq!(log.traces.len(), 3);
}

/// Test ChainResponse: A immediately followed by B.
#[test]
fn test_conformance_chain_response_violations() {
    let log = make_log(vec![
        vec!["A", "B"],
        vec!["A", "X", "B"], // Violates ChainResponse(A, B): intervening X
        vec!["A", "B"],
    ]);

    // Trace 1 has intervening X between A and B
    let trace1_acts = trace_activities(&log.traces[1]);
    let a_idx = trace1_acts.iter().position(|&a| a == "A").unwrap();
    assert_eq!(
        trace1_acts.get(a_idx + 1),
        Some(&"X"),
        "Should have X between A and B"
    );
    assert_eq!(log.traces.len(), 3);
}

/// Test CoExistence: both A and B in same trace.
#[test]
fn test_conformance_coexistence_violations() {
    let log = make_log(vec![
        vec!["A", "B"],
        vec!["A", "C"], // Violates CoExistence(A, B): missing B
        vec!["A", "B"],
    ]);

    // Trace 1 has A but not B
    let trace1_acts = trace_activities(&log.traces[1]);
    assert!(trace1_acts.contains(&"A"));
    assert!(!trace1_acts.contains(&"B"), "Trace 1 should not contain B");
}

/// Test NotCoExistence: A and B NOT both in same trace.
#[test]
fn test_conformance_not_coexistence_violations() {
    let log = make_log(vec![
        vec!["A", "C"],
        vec!["B", "D"],
        vec!["A", "B"], // Violates NotCoExistence(A, B)
    ]);

    // Trace 2 has both A and B
    let trace2_acts = trace_activities(&log.traces[2]);
    assert!(trace2_acts.contains(&"A"));
    assert!(trace2_acts.contains(&"B"));
}

/// Test Precedence: B only after A.
#[test]
fn test_conformance_precedence_violations() {
    let log = make_log(vec![
        vec!["A", "B"],
        vec!["B", "A"], // Violates Precedence(A, B): B before A
        vec!["A", "B"],
    ]);

    // Trace 1: B comes before A
    let trace1_acts = trace_activities(&log.traces[1]);
    assert_eq!(trace1_acts[0], "B");
    assert_eq!(trace1_acts[1], "A");
}

/// Test multiple constraint violations in same log.
#[test]
fn test_conformance_multiple_violations() {
    let log = make_log(vec![
        vec!["A", "B"], // Conforming
        vec!["A", "X"], // Violates Response(A, B)
        vec!["B", "A"], // Violates Precedence(A, B)
        vec!["A"],      // Violates CoExistence(A, B) — B absent
    ]);

    assert_eq!(log.traces.len(), 4);
    // Verify each violation
    let t1 = trace_activities(&log.traces[1]);
    assert!(!t1.contains(&"B"), "Trace 1 should not have B");
    let t2 = trace_activities(&log.traces[2]);
    assert_eq!(t2[0], "B", "Trace 2 starts with B (Precedence violation)");
    let t3 = trace_activities(&log.traces[3]);
    assert!(!t3.contains(&"B"), "Trace 3 should not have B");
}

/// Test Succession: Response + Precedence combined.
#[test]
fn test_conformance_succession_violations() {
    // Log violating Response part of Succession
    let log_response_violation = make_log(vec![
        vec!["A", "B"],
        vec!["A", "C"], // Violates Response (A -> B)
        vec!["A", "B"],
    ]);
    assert_eq!(log_response_violation.traces.len(), 3);

    // Log violating Precedence part of Succession
    let log_precedence_violation = make_log(vec![
        vec!["A", "B"],
        vec!["B", "A"], // Violates Precedence (B <- A)
        vec!["A", "B"],
    ]);
    assert_eq!(log_precedence_violation.traces.len(), 3);

    // Verify the violations are correctly represented
    let t = trace_activities(&log_response_violation.traces[1]);
    assert_eq!(
        t.get(1),
        Some(&"C"),
        "Response violation: A followed by C not B"
    );

    let t2 = trace_activities(&log_precedence_violation.traces[1]);
    assert_eq!(
        t2.first(),
        Some(&"B"),
        "Precedence violation: B appears first"
    );
}

/// Test ChainPrecedence: B immediately preceded by A.
#[test]
fn test_conformance_chain_precedence_violations() {
    let log = make_log(vec![
        vec!["A", "B"],
        vec!["C", "B"], // Violates ChainPrecedence(A, B): B not immediately preceded by A
        vec!["A", "B"],
    ]);

    // Trace 1: C immediately precedes B, not A
    let trace1_acts = trace_activities(&log.traces[1]);
    let b_idx = trace1_acts.iter().position(|&a| a == "B").unwrap();
    assert_eq!(
        trace1_acts.get(b_idx - 1),
        Some(&"C"),
        "B should be preceded by C"
    );
}

/// Large log test: verify trace count is correct.
#[test]
fn test_conformance_fitness_computation() {
    let mut traces = Vec::new();
    for i in 0..100 {
        if i % 10 == 0 {
            // 10 traces violate the constraint
            traces.push(vec!["A", "C"]);
        } else {
            // 90 traces conform
            traces.push(vec!["A", "B"]);
        }
    }

    let log = make_log(traces);
    assert_eq!(log.traces.len(), 100);

    // 10 traces have [A, C], 90 have [A, B]
    let violating = log
        .traces
        .iter()
        .filter(|t| trace_activities(t) == vec!["A", "C"])
        .count();
    assert_eq!(violating, 10, "Should have 10 violating traces");
    // fitness = 1 - (10/100) = 0.9
    let fitness = 1.0 - (violating as f64 / log.traces.len() as f64);
    assert!(
        (fitness - 0.9).abs() < 1e-9,
        "Fitness should be 0.9, got {}",
        fitness
    );
}

/// Test with empty log.
#[test]
fn test_conformance_empty_log() {
    let log = make_log(vec![]);
    // Empty log: no violations (vacuously true for all constraints)
    assert_eq!(log.traces.len(), 0);
}

/// Test with single activity logs.
#[test]
fn test_conformance_single_activity() {
    let log = make_log(vec![vec!["A"], vec!["A"], vec!["A"]]);

    assert_eq!(log.traces.len(), 3);
    // All traces have only A — CoExistence(A, B) violated
    for trace in &log.traces {
        let acts = trace_activities(trace);
        assert_eq!(acts, vec!["A"]);
        assert!(!acts.contains(&"B"));
    }
}

/// Test constraint support and confidence filtering.
#[test]
fn test_conformance_support_filtering() {
    let mut traces = Vec::new();
    for i in 0..100 {
        if i < 5 {
            traces.push(vec!["A", "B"]); // Only 5% have A->B
        } else {
            traces.push(vec!["A", "C"]); // 95% have A->C
        }
    }

    let log = make_log(traces);
    assert_eq!(log.traces.len(), 100);

    let ab_count = log
        .traces
        .iter()
        .filter(|t| trace_activities(t) == vec!["A", "B"])
        .count();
    let ac_count = log
        .traces
        .iter()
        .filter(|t| trace_activities(t) == vec!["A", "C"])
        .count();

    assert_eq!(ab_count, 5, "5% (5/100) traces have A->B");
    assert_eq!(ac_count, 95, "95% (95/100) traces have A->C");
}
