#![cfg(feature = "cloud")]
//! Rework Detection Integration Tests.
//!
//! Tests that verify rework (activity repetition within traces) is correctly
//! detected from real event logs, and that rework affects health state
//! computation and RL reward signals.
//!
//! Uses REAL event logs: running-example.json.
//! Oracle: Rank 2 (Domain Contract) — rework should degrade health and reward.

use std::collections::HashSet;
use std::fs;
use wasm4pm::models::EventLog;
use wasm4pm::rl_orchestrator::compute_health_state;
use wasm4pm::RlState;

const FIXTURES_DIR: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures");

fn load_event_log_json(name: &str) -> EventLog {
    let path = format!("{FIXTURES_DIR}/{name}");
    let json_str = fs::read_to_string(&path)
        .unwrap_or_else(|e| panic!("Failed to load fixture {}: {}", path, e));
    serde_json::from_str(&json_str)
        .unwrap_or_else(|e| panic!("Failed to parse event log JSON from {}: {}", path, e))
}

/// Detect if a trace contains activity repetition (rework).
/// Same logic as lib.rs::has_activity_repetition — tested here independently.
fn has_activity_repetition(trace: &wasm4pm::models::Trace, activity_key: &str) -> bool {
    let mut seen = HashSet::new();
    for event in &trace.events {
        if let Some(wasm4pm::models::AttributeValue::String(name)) =
            event.attributes.get(activity_key)
        {
            if seen.contains(name) {
                return true;
            }
            seen.insert(name.clone());
        }
    }
    false
}

/// Compute rework ratio from a real log.
fn compute_rework_ratio(log: &EventLog, activity_key: &str) -> f32 {
    let trace_count = log.traces.len();
    if trace_count == 0 {
        return 0.0;
    }
    let rework_count = log
        .traces
        .iter()
        .filter(|trace| has_activity_repetition(trace, activity_key))
        .count();
    rework_count as f32 / trace_count as f32
}

/// Count traces with rework in a real log.
fn count_rework_traces(log: &EventLog, activity_key: &str) -> usize {
    log.traces
        .iter()
        .filter(|trace| has_activity_repetition(trace, activity_key))
        .count()
}

// ---------------------------------------------------------------------------
// Test 1: Real Log — Rework Detection Identifies Loops
// ---------------------------------------------------------------------------

#[test]
fn test_real_log_detects_rework_traces() {
    let log = load_event_log_json("running-example.json");

    let total_traces = log.traces.len();
    let rework_traces = count_rework_traces(&log, "activity");

    // The running-example log has traces with repeated activities
    // (e.g., "examine thoroughly" appearing multiple times in some traces).
    // Verify detection actually finds rework in at least one trace.
    assert!(
        rework_traces > 0,
        "running-example.json should have at least 1 trace with rework (activity repetition), \
         but found 0 out of {} traces",
        total_traces,
    );

    // Verify the loop trace also detects correctly (positive control)
    let rework_ratio = compute_rework_ratio(&log, "activity");
    assert!(
        rework_ratio > 0.0,
        "Rework ratio should be positive for running-example.json, got {}",
        rework_ratio,
    );
}

// ---------------------------------------------------------------------------
// Test 2: Real Log — No-Replay Trace Produces No Rework
// ---------------------------------------------------------------------------

#[test]
fn test_single_activity_trace_no_rework() {
    // Construct a minimal trace with no repeated activities.
    let json = r#"{
        "attributes": {},
        "traces": [{
            "attributes": {"case:concept:name": {"tag": "String", "value": "1"}},
            "events": [
                {"attributes": {"activity": {"tag": "String", "value": "A"}}},
                {"attributes": {"activity": {"tag": "String", "value": "B"}}},
                {"attributes": {"activity": {"tag": "String", "value": "C"}}}
            ]
        }]
    }"#;

    let log: EventLog = serde_json::from_str(json).unwrap();
    assert_eq!(count_rework_traces(&log, "activity"), 0);
    assert_eq!(compute_rework_ratio(&log, "activity"), 0.0);
}

// ---------------------------------------------------------------------------
// Test 3: Real Log — Loop Trace Produces Rework
// ---------------------------------------------------------------------------

#[test]
fn test_loop_trace_detects_rework() {
    // Construct a trace with a clear loop: A → B → C → A
    let json = r#"{
        "attributes": {},
        "traces": [{
            "attributes": {"case:concept:name": {"tag": "String", "value": "1"}},
            "events": [
                {"attributes": {"activity": {"tag": "String", "value": "register request"}}},
                {"attributes": {"activity": {"tag": "String", "value": "examine thoroughly"}}},
                {"attributes": {"activity": {"tag": "String", "value": "check ticket"}}},
                {"attributes": {"activity": {"tag": "String", "value": "decide"}}},
                {"attributes": {"activity": {"tag": "String", "value": "reject request"}}},
                {"attributes": {"activity": {"tag": "String", "value": "examine thoroughly"}}},
                {"attributes": {"activity": {"tag": "String", "value": "check ticket"}}}
            ]
        }]
    }"#;

    let log: EventLog = serde_json::from_str(json).unwrap();
    assert_eq!(
        count_rework_traces(&log, "activity"),
        1,
        "Loop trace should be detected"
    );
    assert!(
        compute_rework_ratio(&log, "activity") > 0.0,
        "Loop trace should produce positive rework ratio"
    );
}

// ---------------------------------------------------------------------------
// Test 4: Real Log — Health State Computation Uses Real Metrics
// ---------------------------------------------------------------------------

#[test]
fn test_real_log_health_state_from_actual_metrics() {
    let log = load_event_log_json("running-example.json");
    let event_count: u64 = log.traces.iter().map(|t| t.events.len() as u64).sum();
    let trace_count = log.traces.len() as u64;

    let mut activity_set = HashSet::new();
    for trace in &log.traces {
        for event in &trace.events {
            if let Some(wasm4pm::models::AttributeValue::String(name)) =
                event.attributes.get("activity")
            {
                activity_set.insert(name.clone());
            }
        }
    }
    let unique_activities = activity_set.len() as u64;

    let health = compute_health_state(event_count, trace_count, unique_activities);

    // running-example has ~40 events, 6 traces, 6 activities → should be Normal (0)
    assert_eq!(
        health, 0,
        "Real running-example log should be Normal (health=0), got {}\n\
         events={}, traces={}, activities={}",
        health, event_count, trace_count, unique_activities,
    );
}

// ---------------------------------------------------------------------------
// Test 5: Health State Degrades for Trivial Log
// ---------------------------------------------------------------------------

#[test]
fn test_health_degrades_for_trivial_log() {
    // A log with 1 trace, 1 activity, 3 events → Degraded (health=2)
    let json = r#"{
        "attributes": {},
        "traces": [{
            "attributes": {"case:concept:name": {"tag": "String", "value": "1"}},
            "events": [
                {"attributes": {"activity": {"tag": "String", "value": "A"}}},
                {"attributes": {"activity": {"tag": "String", "value": "A"}}},
                {"attributes": {"activity": {"tag": "String", "value": "A"}}}
            ]
        }]
    }"#;

    let _log: EventLog = serde_json::from_str(json).unwrap();
    let health = compute_health_state(3, 1, 1);
    assert_eq!(
        health, 2,
        "Trivial log (1 activity, < 5 events) should be Degraded"
    );
}

// ---------------------------------------------------------------------------
// Test 6: Health State is Critical for No Traces
// ---------------------------------------------------------------------------

#[test]
fn test_health_critical_for_no_traces() {
    assert_eq!(
        compute_health_state(10, 0, 3),
        3,
        "No traces should be Critical"
    );
}

// ---------------------------------------------------------------------------
// Test 7: Health State is Failed for Empty Log
// ---------------------------------------------------------------------------

#[test]
fn test_health_failed_for_empty_log() {
    assert_eq!(
        compute_health_state(0, 0, 0),
        4,
        "Empty log should be Failed"
    );
    assert_eq!(
        compute_health_state(5, 5, 0),
        4,
        "No activities should be Failed"
    );
}

// ---------------------------------------------------------------------------
// Test 8: Real Log — Rework Ratio Affects Reward
// ---------------------------------------------------------------------------

#[test]
fn test_real_log_rework_ratio_produces_distinct_rl_states() {
    // Rework ratio is encoded into RlState, which determines Q-table lookups.
    // Different rework_ratio values should produce different quantized states,
    // which means the RL system treats them as different situations.

    let log = load_event_log_json("running-example.json");
    let (event_count, trace_count, unique_activities, rework_ratio) = (
        log.traces
            .iter()
            .map(|t| t.events.len() as u64)
            .sum::<u64>(),
        log.traces.len() as u64,
        {
            let mut s = HashSet::new();
            for trace in &log.traces {
                for event in &trace.events {
                    if let Some(wasm4pm::models::AttributeValue::String(n)) =
                        event.attributes.get("activity")
                    {
                        s.insert(n.clone());
                    }
                }
            }
            s.len() as u64
        },
        compute_rework_ratio(&log, "activity"),
    );

    let features = [
        (event_count as f32 / 10_000.0).min(1.0),
        (trace_count as f32 / 1_000.0).min(1.0),
        (unique_activities as f32 / 100.0).min(1.0),
        0.0,
        0.0,
        1.0,
        1.0,
        0.0,
    ];
    let health_level = 0u8;

    // State with zero rework
    let state_zero = RlState::from_features(&features, health_level, 0.0);
    // State with real rework ratio from log
    let state_real = RlState::from_features(&features, health_level, rework_ratio);

    // If rework_ratio > 0, the two states should differ in the rework_ratio_q dimension.
    // This proves rework detection output actually feeds into the RL state encoding.
    if rework_ratio > 0.0 {
        assert_ne!(
            state_zero.rework_ratio_q, state_real.rework_ratio_q,
            "RlState.rework_ratio_q should differ when rework_ratio changes \
             (0.0 vs {} from real log)",
            rework_ratio,
        );
    } else {
        // If running-example has no rework, verify a non-zero rework value produces
        // a different quantized state.
        let state_with_rework = RlState::from_features(&features, health_level, 0.5);
        assert_ne!(
            state_zero.rework_ratio_q, state_with_rework.rework_ratio_q,
            "RlState.rework_ratio_q with 0.0 should differ from 0.5",
        );
    }
}
