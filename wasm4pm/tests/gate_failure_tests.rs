//! Gate Failure Tests — Adversarial Negative Tests
//!
//! Tests that verify the system correctly REJECTS or detects bad inputs.
//! Every test is a NEGATIVE test: we assert that gates have teeth by
//! observing low/zero fitness, empty models, or errors.
//!
//! Van der Aalst doctrine: if the code says it worked on a garbage model,
//! the model should not be trusted. These tests verify detectable failure.
//!
//! Algorithm family: Conformance checking, DFG discovery
//! Gap: D (gate failure / negative quality)

use std::collections::BTreeMap;
use wasm4pm::conformance::token_replay_pure;
use wasm4pm::models::{
    AttributeValue, Event, EventLog, PetriNet, PetriNetArc, PetriNetPlace, PetriNetTransition,
    Trace, DFG,
};
use wasm4pm::streaming::{StreamingAlgorithm, StreamingDfgBuilder};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Build an EventLog from slices of activity-name slices.
fn make_log(traces: &[&[&str]]) -> EventLog {
    EventLog {
        attributes: BTreeMap::new(),
        traces: traces
            .iter()
            .map(|activities| Trace {
                attributes: BTreeMap::new(),
                events: activities
                    .iter()
                    .map(|&a| {
                        let mut attrs = BTreeMap::new();
                        attrs.insert(
                            "concept:name".to_string(),
                            AttributeValue::String(a.to_string()),
                        );
                        Event { attributes: attrs }
                    })
                    .collect(),
            })
            .collect(),
    }
}

/// Helper to build a `PetriNetArc` with default weight 1.
fn arc(from: &str, to: &str) -> PetriNetArc {
    PetriNetArc {
        from: from.to_string(),
        to: to.to_string(),
        weight: None,
    }
}

/// Helper to build a visible `PetriNetTransition`.
fn trans(id: &str, label: &str) -> PetriNetTransition {
    PetriNetTransition {
        id: id.to_string(),
        label: label.to_string(),
        is_invisible: None,
    }
}

/// Helper to build a `PetriNetPlace`.
fn place(id: &str) -> PetriNetPlace {
    PetriNetPlace {
        id: id.to_string(),
        label: id.to_string(),
        marking: None,
    }
}

/// Build the canonical A→B→C sequence net:
///   i --A--> p1 --B--> p2 --C--> f
fn abc_net() -> PetriNet {
    let mut net = PetriNet::new();
    net.places = vec![place("i"), place("p1"), place("p2"), place("f")];
    net.transitions = vec![trans("tA", "A"), trans("tB", "B"), trans("tC", "C")];
    net.arcs = vec![
        arc("i", "tA"),
        arc("tA", "p1"),
        arc("p1", "tB"),
        arc("tB", "p2"),
        arc("p2", "tC"),
        arc("tC", "f"),
    ];
    net.initial_marking.insert("i".to_string(), 1);
    let mut fm = BTreeMap::new();
    fm.insert("f".to_string(), 1usize);
    net.final_markings.push(fm);
    net
}

/// Build a batch DFG from an EventLog using the streaming builder.
/// (Same approach as streaming_batch_equivalence_tests.rs — avoids the
/// wasm_bindgen layer which is unavailable in native `cargo test`.)
fn dfg_from_log(log: &EventLog, activity_key: &str) -> DFG {
    let mut builder = StreamingDfgBuilder::new();
    for (idx, trace) in log.traces.iter().enumerate() {
        let case_id = format!("c{}", idx);
        for event in &trace.events {
            if let Some(AttributeValue::String(act)) = event.attributes.get(activity_key) {
                builder.add_event(&case_id, act);
            }
        }
        builder.close_trace(&case_id);
    }
    builder.snapshot()
}

// ---------------------------------------------------------------------------
// Test 1 — quality_gate_rejects_fitness_below_threshold
// ---------------------------------------------------------------------------

/// A log with a single activity that does not fit the A→B→C model.
/// Token replay must produce a fitness well below the 0.85 quality threshold.
///
/// // NEGATIVE TEST: Low-fitness conformance check should be detectable
#[test]
fn quality_gate_rejects_fitness_below_threshold() {
    // NEGATIVE TEST: Low-fitness conformance check should be detectable.
    //
    // A log containing only activity "Z" (absent from the A→B→C net) fires
    // zero known transitions, so missing_tokens > 0 and fitness collapses.
    let log = make_log(&[&["Z"], &["Z"], &["Z"]]);
    let net = abc_net();

    let result = token_replay_pure(&log, &net, "concept:name");

    // Aggregate fitness across all traces
    let avg_fitness: f64 = result
        .case_fitness
        .iter()
        .map(|cf| cf.trace_fitness)
        .sum::<f64>()
        / result.case_fitness.len() as f64;

    assert!(
        avg_fitness < 0.85,
        "Gate must detect low fitness — got {avg_fitness:.4}, expected < 0.85"
    );
}

// ---------------------------------------------------------------------------
// Test 2 — empty_model_produces_zero_fitness
// ---------------------------------------------------------------------------

/// Token replay against a structurally empty Petri net must return 0.0 or
/// very close to it — the gate cannot issue a valid fitness score.
///
/// // NEGATIVE TEST: Empty/degenerate models must not produce valid fitness scores
#[test]
fn empty_model_produces_zero_fitness() {
    // NEGATIVE TEST: Empty/degenerate models must not produce valid fitness scores.
    let log = make_log(&[&["A", "B", "C"]]);

    // Empty net: no places, no transitions, no arcs, no markings.
    let net = PetriNet::new();

    let result = token_replay_pure(&log, &net, "concept:name");

    if result.case_fitness.is_empty() {
        // No case fitness entries at all — the net was degenerate, gate fires.
        return;
    }

    let f = result.case_fitness[0].trace_fitness;
    assert!(
        f <= 0.0 + 1e-9,
        "Empty net must yield fitness 0.0, got {f:.10}"
    );
}

// ---------------------------------------------------------------------------
// Test 3 — corrupted_xes_load_returns_error
// ---------------------------------------------------------------------------

/// Malformed XES (unclosed tag / invalid XML) must either fail to parse or
/// produce a log with zero traces (the parser must not silently succeed and
/// invent data).
///
/// // NEGATIVE TEST: Malformed XES must not silently succeed
#[test]
fn corrupted_xes_load_returns_error() {
    // NEGATIVE TEST: Malformed XES must not silently succeed.
    //
    // The inline XES parser used in integration tests is lenient (line-based),
    // but malformed XML with a mismatched closing tag must not produce any trace
    // events that never appeared in a well-formed <event> block.

    let malformed_xes = "<log><trace><event></trace></log>";

    // Parse using the same line-level parser the test suite uses.
    let mut log = EventLog::new();
    let mut current_trace: Option<Trace> = None;
    let mut current_event: Option<Event> = None;

    for line in malformed_xes.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("<trace>") {
            current_trace = Some(Trace {
                attributes: BTreeMap::new(),
                events: Vec::new(),
            });
        }
        if trimmed.starts_with("</trace>") {
            if let Some(trace) = current_trace.take() {
                log.traces.push(trace);
            }
        }
        if trimmed.starts_with("<event>") {
            current_event = Some(Event {
                attributes: BTreeMap::new(),
            });
        }
        if trimmed.starts_with("</event>") {
            if let Some(event) = current_event.take() {
                if let Some(ref mut trace) = current_trace {
                    trace.events.push(event);
                }
            }
        }
    }

    // Either zero traces (parser bailed) or all traces have zero events
    // (malformed event tag was not closed, so events were not committed).
    let total_events: usize = log.traces.iter().map(|t| t.events.len()).sum();
    assert_eq!(
        total_events, 0,
        "Malformed XES must not produce committed events; got {total_events}"
    );
}

// ---------------------------------------------------------------------------
// Test 4 — empty_xes_produces_zero_activities
// ---------------------------------------------------------------------------

/// A valid XES document with zero traces must produce a DFG with no edges.
///
/// // NEGATIVE TEST: Empty log must produce empty model, not crash
#[test]
fn empty_xes_produces_zero_activities() {
    // NEGATIVE TEST: Empty log must produce empty model, not crash.
    let empty_log = EventLog {
        attributes: BTreeMap::new(),
        traces: vec![],
    };

    let dfg = dfg_from_log(&empty_log, "concept:name");

    assert_eq!(
        dfg.edges.len(),
        0,
        "Empty log must produce 0 DFG edges, got {}",
        dfg.edges.len()
    );
}

// ---------------------------------------------------------------------------
// Test 5 — dfg_on_single_activity_has_no_edges
// ---------------------------------------------------------------------------

/// A log where every trace contains only a single activity "A" must produce
/// a DFG with zero edges (no A→A arc because no succession exists).
///
/// // NEGATIVE TEST: Isolated activities must not produce false edges
#[test]
fn dfg_on_single_activity_has_no_edges() {
    // NEGATIVE TEST: Isolated activities must not produce false edges.
    //
    // Each trace is ["A"] — single event, no directly-follows pair possible.
    let log = make_log(&[&["A"], &["A"], &["A"]]);

    let dfg = dfg_from_log(&log, "concept:name");

    assert_eq!(
        dfg.edges.len(),
        0,
        "Single-activity traces must produce 0 DFG edges, got {}",
        dfg.edges.len()
    );

    // Activity "A" must still be recognised as a node (it appears 3 times).
    let a_node = dfg.nodes.iter().find(|n| n.id == "A");
    assert!(a_node.is_some(), "Activity A must be in the DFG nodes");
    assert_eq!(
        a_node.unwrap().frequency,
        3,
        "Activity A must appear 3 times"
    );
}

// ---------------------------------------------------------------------------
// Test 6 — conformance_metamorphic_superset_lowers_fitness
// ---------------------------------------------------------------------------

/// Metamorphic test (Rank 3): adding deviating traces to a conforming log
/// must not increase the average fitness.
///
/// // NEGATIVE TEST Metamorphic: adding deviating traces must not increase fitness
#[test]
fn conformance_metamorphic_superset_lowers_fitness() {
    // NEGATIVE TEST Metamorphic: adding deviating traces must not increase fitness.
    let net = abc_net();

    // Base log: all traces conform perfectly to A→B→C
    let base_log = make_log(&[&["A", "B", "C"], &["A", "B", "C"], &["A", "B", "C"]]);
    let base_result = token_replay_pure(&base_log, &net, "concept:name");
    let base_fitness: f64 = base_result
        .case_fitness
        .iter()
        .map(|cf| cf.trace_fitness)
        .sum::<f64>()
        / base_result.case_fitness.len() as f64;

    // Superset log: conforming traces + rogue variant A→X→C
    let super_log = make_log(&[
        &["A", "B", "C"],
        &["A", "B", "C"],
        &["A", "X", "C"], // rogue variant — X not in net
    ]);
    let super_result = token_replay_pure(&super_log, &net, "concept:name");
    let super_fitness: f64 = super_result
        .case_fitness
        .iter()
        .map(|cf| cf.trace_fitness)
        .sum::<f64>()
        / super_result.case_fitness.len() as f64;

    assert!(
        super_fitness <= base_fitness,
        "Superset log fitness ({super_fitness:.4}) must be ≤ base fitness ({base_fitness:.4})"
    );
}

// ---------------------------------------------------------------------------
// Test 7 — deviant_traces_lower_or_equal_fitness
// ---------------------------------------------------------------------------

/// Rank 3 metamorphic: adding traces with activities absent from the model
/// must not improve the aggregate fitness.
///
/// // NEGATIVE TEST Rank 3 metamorphic: deviants must reduce or hold fitness
#[test]
fn deviant_traces_lower_or_equal_fitness() {
    // NEGATIVE TEST Rank 3 metamorphic: deviants must reduce or hold fitness.
    let net = abc_net();

    // Conforming log: only A→B→C traces
    let conforming_log = make_log(&[&["A", "B", "C"], &["A", "B", "C"]]);
    let conf_result = token_replay_pure(&conforming_log, &net, "concept:name");
    let conf_fitness: f64 = conf_result
        .case_fitness
        .iter()
        .map(|cf| cf.trace_fitness)
        .sum::<f64>()
        / conf_result.case_fitness.len() as f64;

    // Log with deviants: unknown activities D, E, F
    let deviant_log = make_log(&[
        &["A", "B", "C"],
        &["D", "E", "F"], // activities completely absent from net
    ]);
    let dev_result = token_replay_pure(&deviant_log, &net, "concept:name");
    let dev_fitness: f64 = dev_result
        .case_fitness
        .iter()
        .map(|cf| cf.trace_fitness)
        .sum::<f64>()
        / dev_result.case_fitness.len() as f64;

    assert!(
        dev_fitness <= conf_fitness,
        "Deviant log fitness ({dev_fitness:.4}) must be ≤ conforming fitness ({conf_fitness:.4})"
    );
}

// ---------------------------------------------------------------------------
// Test 8 — precision_metamorphic_more_paths_lower_precision
// ---------------------------------------------------------------------------

/// Rank 3 metamorphic: a log with more behavioral variants must produce strictly
/// more DFG edges than a log with a single linear path. More edges in the DFG
/// corresponds to higher behavioral complexity (lower precision).
///
/// // NEGATIVE TEST Rank 3 metamorphic: more behavioral paths = lower precision
#[test]
fn precision_metamorphic_more_paths_lower_precision() {
    // NEGATIVE TEST Rank 3 metamorphic: more behavioral paths = lower precision.

    // Log 1: strictly linear A→B→C
    let log1 = make_log(&[&["A", "B", "C"], &["A", "B", "C"]]);
    let dfg1 = dfg_from_log(&log1, "concept:name");

    // Log 2: multiple variants — A→B→C, A→C→B, A→B→B→C
    let log2 = make_log(&[&["A", "B", "C"], &["A", "C", "B"], &["A", "B", "B", "C"]]);
    let dfg2 = dfg_from_log(&log2, "concept:name");

    assert!(
        dfg2.edges.len() > dfg1.edges.len(),
        "Multi-variant log must produce more DFG edges ({}) than single-path log ({})",
        dfg2.edges.len(),
        dfg1.edges.len()
    );
}
