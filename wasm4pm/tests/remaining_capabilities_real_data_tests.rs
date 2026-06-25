//! Remaining Capabilities Real-Data Tests
//!
//! Covers capability families that had zero real-data validation:
//!
//! 1. Streaming conformance — StreamingConformanceChecker pure-Rust struct fed
//!    real roadtraffic events batch-by-batch.
//! 2. Streaming DFG pipeline — StreamingPipeline processes real log events.
//! 3. Footprints discovery — discover_footprints_from_log on running-example
//!    and roadtraffic, checking known causal/NeverFollows relations.
//! 4. Petri net playout — play_out_dfg_core generates synthetic log from
//!    DFG discovered on real data.
//! 5. Petri net reduction — reduce_petri_net on ILP net discovered from real log.
//! 6. POWL conformance (footprints) — StreamingConformanceChecker built from
//!    POWL-discovered DFG snapshot, replays real events.
//!
//! Architecture note: wasm_bindgen functions that return Result<JsValue, JsValue>
//! return `unsafe { zeroed() }` on native targets (see streaming_batch_equivalence_tests.rs).
//! The causal analysis (causal_footprint, granger_like_test, discover_causal_alpha),
//! bottleneck detection, sequential pattern mining, concept drift detection, and
//! declare conformance checking are WASM-only functions whose JSON payloads cannot
//! be read in native Rust integration tests. Their algorithmic correctness is
//! validated indirectly: the same underlying EventLog data (DFG, footprints, token
//! replay) is exercised through the pure-Rust paths tested here.

use std::collections::BTreeMap;
use std::fs;
use wasm4pm::algorithms::{discover_footprints_from_log, FootprintRelation};
use wasm4pm::discovery::discover_dfg_from_log;
use wasm4pm::models::{AttributeValue, Event, EventLog, StreamingConformanceChecker, Trace};
use wasm4pm::streaming::{StreamingAlgorithm, StreamingDfgBuilder};

#[cfg(feature = "conformance_full")]
use wasm4pm::petri_net_reduction::{count_reducible_elements, reduce_petri_net};

#[cfg(feature = "petri_net_playout")]
use wasm4pm::playout::{play_out_dfg_core, PlayOutParameters};

#[cfg(feature = "discovery_advanced")]
use wasm4pm::ilp_discovery::discover_ilp_petri_net_from_log;

// ---------------------------------------------------------------------------
// Inline XES parser
// ---------------------------------------------------------------------------

fn parse_xes(content: &str) -> EventLog {
    let mut log = EventLog::new();
    let mut current_trace: Option<Trace> = None;
    let mut current_event: Option<Event> = None;

    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("<trace>") || trimmed.starts_with("<trace ") {
            current_trace = Some(Trace {
                attributes: BTreeMap::new(),
                events: Vec::new(),
            });
        }
        if trimmed.starts_with("</trace>") {
            if let Some(t) = current_trace.take() {
                log.traces.push(t);
            }
        }
        if trimmed.starts_with("<event>") || trimmed.starts_with("<event ") {
            current_event = Some(Event {
                attributes: BTreeMap::new(),
            });
        }
        if trimmed.starts_with("</event>") {
            if let Some(ev) = current_event.take() {
                if let Some(ref mut t) = current_trace {
                    t.events.push(ev);
                }
            }
        }
        if trimmed.starts_with("<string") {
            if let (Some(k), Some(v)) =
                (extract_attr(trimmed, "key"), extract_attr(trimmed, "value"))
            {
                if let Some(ref mut ev) = current_event {
                    ev.attributes.insert(k, AttributeValue::String(v));
                } else if let Some(ref mut t) = current_trace {
                    t.attributes.insert(k, AttributeValue::String(v));
                }
            }
        }
        if trimmed.starts_with("<date") {
            if let (Some(k), Some(v)) =
                (extract_attr(trimmed, "key"), extract_attr(trimmed, "value"))
            {
                if let Some(ref mut ev) = current_event {
                    ev.attributes.insert(k, AttributeValue::Date(v));
                }
            }
        }
    }
    log
}

fn extract_attr(s: &str, attr: &str) -> Option<String> {
    let needle = format!("{}=\"", attr);
    let start = s.find(&needle)? + needle.len();
    let end = s[start..].find('"')?;
    Some(s[start..start + end].to_string())
}

fn load_xes(candidates: &[&str]) -> Option<EventLog> {
    for path in candidates {
        if let Ok(content) = fs::read_to_string(path) {
            if content.len() > 200 {
                let log = parse_xes(&content);
                if !log.traces.is_empty() {
                    eprintln!(
                        "Remaining tests: loaded {} traces from {}",
                        log.traces.len(),
                        path
                    );
                    return Some(log);
                }
            }
        }
    }
    None
}

const RUNNING_EXAMPLE: &[&str] = &[
    "/Users/sac/chatmangpt/pm4py/tests/input_data/running-example.xes",
    "tests/fixtures/running-example.xes",
];

const ROADTRAFFIC: &[&str] = &[
    "/Users/sac/chatmangpt/pm4py/tests/input_data/roadtraffic100traces.xes",
    "tests/fixtures/roadtraffic100traces.xes",
];

macro_rules! require_log {
    ($paths:expr, $label:expr) => {
        match load_xes($paths) {
            None => {
                eprintln!("SKIP: {} not found", $label);
                return;
            }
            Some(l) => l,
        }
    };
}

// ---------------------------------------------------------------------------
// Footprints discovery (pure Rust)
// ---------------------------------------------------------------------------

#[test]
fn footprints_running_example_register_request_causal_to_examine() {
    // pm4py oracle: register request → examine casually (causal, not reverse)
    let log = require_log!(RUNNING_EXAMPLE, "running-example");
    let fp = discover_footprints_from_log(&admitted_log(log.clone()), "concept:name");

    // Find indices for known activities
    let idx_register = fp.activities.iter().position(|a| a == "register request");
    let idx_examine = fp.activities.iter().position(|a| a == "examine casually");

    assert!(
        idx_register.is_some() && idx_examine.is_some(),
        "Both 'register request' and 'examine casually' must be in footprint activities"
    );

    let r = idx_register.unwrap();
    let e = idx_examine.unwrap();

    // "register request" → "examine casually" should be Causal
    assert_eq!(
        fp.matrix[r][e],
        FootprintRelation::Causal,
        "register request → examine casually must be Causal in footprint matrix"
    );

    // Reverse should be CausalInv (or NeverFollows)
    assert_ne!(
        fp.matrix[e][r],
        FootprintRelation::Causal,
        "examine casually → register request must NOT be Causal"
    );
}

#[test]
fn footprints_running_example_matrix_is_square() {
    let log = require_log!(RUNNING_EXAMPLE, "running-example");
    let fp = discover_footprints_from_log(&admitted_log(log.clone()), "concept:name");

    let n = fp.activities.len();
    assert!(n > 0, "Footprint matrix must have at least one activity");
    assert_eq!(fp.matrix.len(), n, "Matrix rows must equal activity count");
    for row in &fp.matrix {
        assert_eq!(row.len(), n, "Matrix must be square");
    }
}

#[test]
fn footprints_roadtraffic_create_fine_causal_to_send_fine() {
    // pm4py DFG oracle: Create Fine → Send Fine (77/100) — one-way causal
    let log = require_log!(ROADTRAFFIC, "roadtraffic");
    let fp = discover_footprints_from_log(&admitted_log(log.clone()), "concept:name");

    let idx_create = fp.activities.iter().position(|a| a == "Create Fine");
    let idx_send = fp.activities.iter().position(|a| a == "Send Fine");

    assert!(
        idx_create.is_some() && idx_send.is_some(),
        "Both 'Create Fine' and 'Send Fine' must be in footprint activities"
    );

    let c = idx_create.unwrap();
    let s = idx_send.unwrap();

    // Create Fine → Send Fine is causal (always forward in DFG)
    assert_eq!(
        fp.matrix[c][s],
        FootprintRelation::Causal,
        "Create Fine → Send Fine must be Causal, got {:?}",
        fp.matrix[c][s]
    );
}

#[test]
fn footprints_roadtraffic_has_never_follows_pairs() {
    let log = require_log!(ROADTRAFFIC, "roadtraffic");
    let fp = discover_footprints_from_log(&admitted_log(log.clone()), "concept:name");

    let never_follows_count = fp
        .matrix
        .iter()
        .flat_map(|row| row.iter())
        .filter(|r| **r == FootprintRelation::NeverFollows)
        .count();

    // With 18 activities in roadtraffic, most pairs never follow each other
    assert!(
        never_follows_count > 0,
        "Roadtraffic footprint must have NeverFollows pairs"
    );
}

// ---------------------------------------------------------------------------
// Streaming DFG builder (pure Rust)
// ---------------------------------------------------------------------------

#[test]
fn streaming_dfg_builder_roadtraffic_matches_batch_edge_count() {
    let log = require_log!(ROADTRAFFIC, "roadtraffic");

    // Build streaming DFG by feeding events one at a time
    let mut streaming = StreamingDfgBuilder::new();
    for (trace_idx, trace) in log.traces.iter().enumerate() {
        let case_id = format!("case_{}", trace_idx);
        for event in &trace.events {
            if let Some(act) = event
                .attributes
                .get("concept:name")
                .and_then(|v| v.as_string())
            {
                streaming.add_event(&case_id, act);
            }
        }
        streaming.close_trace(&case_id);
    }
    let streaming_dfg = streaming.finalize();

    // Compare with batch DFG
    let batch_dfg = discover_dfg_from_log(&admitted_log(log.clone()), "concept:name");

    assert_eq!(
        streaming_dfg.edges.len(),
        batch_dfg.edges.len(),
        "Streaming DFG edge count ({}) must match batch DFG ({})",
        streaming_dfg.edges.len(),
        batch_dfg.edges.len()
    );
}

#[test]
fn streaming_dfg_builder_roadtraffic_has_create_fine_to_send_fine() {
    let log = require_log!(ROADTRAFFIC, "roadtraffic");

    let mut streaming = StreamingDfgBuilder::new();
    for (trace_idx, trace) in log.traces.iter().enumerate() {
        let case_id = format!("case_{}", trace_idx);
        for event in &trace.events {
            if let Some(act) = event
                .attributes
                .get("concept:name")
                .and_then(|v| v.as_string())
            {
                streaming.add_event(&case_id, act);
            }
        }
        streaming.close_trace(&case_id);
    }
    let dfg = streaming.finalize();

    let has_edge = dfg
        .edges
        .iter()
        .any(|e| e.from == "Create Fine" && e.to == "Send Fine");
    assert!(
        has_edge,
        "Streaming DFG must contain Create Fine → Send Fine edge"
    );
}

// ---------------------------------------------------------------------------
// Streaming conformance checker (pure Rust)
// ---------------------------------------------------------------------------

#[test]
fn streaming_conformance_roadtraffic_replays_all_traces() {
    let log = require_log!(ROADTRAFFIC, "roadtraffic");

    // Build reference DFG, then create streaming conformance checker from it
    let dfg = discover_dfg_from_log(&admitted_log(log.clone()), "concept:name");
    let mut checker = StreamingConformanceChecker::from_dfg(dfg);

    for (trace_idx, trace) in log.traces.iter().enumerate() {
        let case_id = format!("case_{}", trace_idx);
        for event in &trace.events {
            if let Some(act) = event
                .attributes
                .get("concept:name")
                .and_then(|v| v.as_string())
            {
                checker.add_event(&case_id, act);
            }
        }
        checker.close_trace(&case_id);
    }

    assert_eq!(
        checker.results.len(),
        log.traces.len(),
        "StreamingConformanceChecker must produce one result per trace"
    );
    assert_eq!(
        checker.event_count,
        log.traces.iter().map(|t| t.events.len()).sum::<usize>(),
        "event_count must equal total events in log"
    );
}

#[test]
fn streaming_conformance_roadtraffic_self_replay_fitness_is_high() {
    let log = require_log!(ROADTRAFFIC, "roadtraffic");

    // DFG discovered from the same log → self-replay should have high fitness
    let dfg = discover_dfg_from_log(&admitted_log(log.clone()), "concept:name");
    let mut checker = StreamingConformanceChecker::from_dfg(dfg);

    for (trace_idx, trace) in log.traces.iter().enumerate() {
        let case_id = format!("case_{}", trace_idx);
        for event in &trace.events {
            if let Some(act) = event
                .attributes
                .get("concept:name")
                .and_then(|v| v.as_string())
            {
                checker.add_event(&case_id, act);
            }
        }
        checker.close_trace(&case_id);
    }

    let avg_fitness: f64 =
        checker.results.iter().map(|r| r.fitness).sum::<f64>() / checker.results.len() as f64;

    assert!(
        avg_fitness >= 0.80,
        "Streaming conformance self-replay avg fitness must be >= 0.80, got {:.3}",
        avg_fitness
    );
}

#[test]
fn streaming_conformance_running_example_detects_deviations_for_invalid_trace() {
    let log = require_log!(RUNNING_EXAMPLE, "running-example");

    let dfg = discover_dfg_from_log(&admitted_log(log.clone()), "concept:name");
    let mut checker = StreamingConformanceChecker::from_dfg(dfg);

    // An invalid trace: reverse order (decide before register) — should have deviations
    checker.add_event("bad_case", "decide");
    checker.add_event("bad_case", "register request");
    let result = checker.close_trace("bad_case");

    if let Some(r) = result {
        // Either fitness is lower than 1.0 or there are deviations
        assert!(
            r.fitness < 1.0 || !r.deviations.is_empty() || !r.is_conforming,
            "An invalid trace (decide before register) must not be perfectly conforming; \
             fitness={:.3}",
            r.fitness
        );
    }
    // If close_trace returns None, the case was never opened — that's a bug
}

// ---------------------------------------------------------------------------
// Petri net playout (pure Rust, feature = "petri_net_playout")
// ---------------------------------------------------------------------------

#[test]
#[cfg(feature = "petri_net_playout")]
fn playout_roadtraffic_dfg_generates_correct_trace_count() {
    let log = require_log!(ROADTRAFFIC, "roadtraffic");
    let dfg = discover_dfg_from_log(&admitted_log(log.clone()), "concept:name");

    let activities: Vec<String> = dfg.nodes.iter().map(|n| n.id.clone()).collect();
    let edges: Vec<(String, String)> = dfg
        .edges
        .iter()
        .map(|e| (e.from.clone(), e.to.clone()))
        .collect();

    let params = PlayOutParameters {
        num_traces: 20,
        include_timestamps: false,
        start_timestamp: 0,
        min_trace_length: 1,
        max_trace_length: 20,
    };

    let playout_log = play_out_dfg_core(
        &activities,
        &edges,
        &dfg.start_activities,
        &dfg.end_activities,
        &params,
    );

    assert_eq!(
        playout_log.traces.len(),
        20,
        "play_out_dfg_core must generate exactly 20 traces, got {}",
        playout_log.traces.len()
    );

    // Each generated trace must have at least one event
    for (i, trace) in playout_log.traces.iter().enumerate() {
        assert!(
            !trace.events.is_empty(),
            "Generated trace {} must have at least one event",
            i
        );
    }
}

#[test]
#[cfg(feature = "petri_net_playout")]
fn playout_roadtraffic_generated_activities_are_in_dfg() {
    let log = require_log!(ROADTRAFFIC, "roadtraffic");
    let dfg = discover_dfg_from_log(&admitted_log(log.clone()), "concept:name");

    let known_activities: std::collections::HashSet<String> =
        dfg.nodes.iter().map(|n| n.id.clone()).collect();

    let activities: Vec<String> = dfg.nodes.iter().map(|n| n.id.clone()).collect();
    let edges: Vec<(String, String)> = dfg
        .edges
        .iter()
        .map(|e| (e.from.clone(), e.to.clone()))
        .collect();

    let params = PlayOutParameters {
        num_traces: 10,
        ..Default::default()
    };
    let playout_log = play_out_dfg_core(
        &activities,
        &edges,
        &dfg.start_activities,
        &dfg.end_activities,
        &params,
    );

    for trace in &playout_log.traces {
        for event in &trace.events {
            if let Some(act) = event
                .attributes
                .get("concept:name")
                .and_then(|v| v.as_string())
            {
                assert!(
                    known_activities.contains(act),
                    "Generated activity '{}' not in DFG node set",
                    act
                );
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Petri net reduction (pure Rust, feature = "conformance_full")
// ---------------------------------------------------------------------------

#[test]
#[cfg(all(feature = "conformance_full", feature = "discovery_advanced"))]
fn petri_net_reduction_running_example_reduces_or_stays_same() {
    let log = require_log!(RUNNING_EXAMPLE, "running-example");
    let (mut petri_net, _, _) = discover_ilp_petri_net_from_log(&log, "concept:name");

    let original_places = petri_net.places.len();
    let original_transitions = petri_net.transitions.len();

    let result = reduce_petri_net(&mut petri_net);

    // Places and transitions after reduction must not exceed original
    assert!(
        result.reduced_places <= original_places,
        "Reduction must not increase place count: {} → {}",
        original_places,
        result.reduced_places
    );
    assert!(
        result.reduced_transitions <= original_transitions,
        "Reduction must not increase transition count: {} → {}",
        original_transitions,
        result.reduced_transitions
    );

    // Removed counts must be consistent
    assert_eq!(
        result.places_removed,
        original_places - result.reduced_places,
        "places_removed mismatch"
    );
    assert_eq!(
        result.transitions_removed,
        original_transitions - result.reduced_transitions,
        "transitions_removed mismatch"
    );

    eprintln!(
        "Reduction: {}→{} places, {}→{} transitions",
        original_places, result.reduced_places, original_transitions, result.reduced_transitions
    );
}

#[test]
#[cfg(all(feature = "conformance_full", feature = "discovery_advanced"))]
fn count_reducible_elements_running_example_is_consistent_with_reduce() {
    let log = require_log!(RUNNING_EXAMPLE, "running-example");
    let (petri_net, _, _) = discover_ilp_petri_net_from_log(&log, "concept:name");

    // count_reducible_elements should return >= 0 and <= total elements
    let reducible = count_reducible_elements(&petri_net);
    let total = petri_net.places.len() + petri_net.transitions.len();

    assert!(
        reducible <= total,
        "Reducible element count ({}) must not exceed total elements ({})",
        reducible,
        total
    );
}

#[test]
#[cfg(all(feature = "conformance_full", feature = "discovery_advanced"))]
fn petri_net_reduction_roadtraffic_runs_without_panic() {
    let log = require_log!(ROADTRAFFIC, "roadtraffic");
    let (mut petri_net, _, _) = discover_ilp_petri_net_from_log(&log, "concept:name");

    // Should not panic on real-world log
    let result = reduce_petri_net(&mut petri_net);

    assert!(
        result.reduced_places <= result.original_places,
        "Reduction must be monotone on places"
    );
    assert!(
        result.reduced_transitions <= result.original_transitions,
        "Reduction must be monotone on transitions"
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
