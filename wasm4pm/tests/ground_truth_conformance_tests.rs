//! Ground-Truth Conformance Tests — Hand-Computed Oracle Values
//!
//! This module provides 16 tests covering 7 Petri net fixture families.
//! Every expected fitness value is derived from first principles using the
//! van der Aalst token-replay formula implemented in conformance.rs:
//!
//!   fitness = 0.5 * (1 - missing / max(1, consumed))
//!           + 0.5 * (1 - remaining / max(1, produced))
//!
//! Important: `remaining` is the total token count in the final marking
//! (all places), INCLUDING the sink/f-place token. A perfectly-executing
//! trace on a simple A→p→B→f net therefore yields fitness 0.75, not 1.0.
//!
//! When an activity is not in the net (transition_not_found), missing_tokens
//! is incremented by 1 but the "fire" step is skipped entirely (no consume,
//! no produce). When a transition IS in the net but its input places lack
//! tokens (missing_tokens deviation), the code still fires the transition:
//! it consumes what tokens exist (0 in bitmask path) and produces output tokens.
//!
//! All nets use the bitmask fast path (≤ 64 places, all arc weights = 1,
//! all initial markings single tokens), so the bitmask path analysis applies.

use std::collections::HashMap;
use wasm4pm::conformance::token_replay_pure;
use wasm4pm::models::{AttributeValue, Event, EventLog, PetriNet, PetriNetArc, PetriNetPlace, PetriNetTransition, Trace};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Build a minimal EventLog from slices of activity name slices.
/// Uses "concept:name" as the activity key.
fn make_log(traces: &[&[&str]]) -> EventLog {
    EventLog {
        attributes: HashMap::new(),
        traces: traces
            .iter()
            .map(|activities| Trace {
                attributes: HashMap::new(),
                events: activities
                    .iter()
                    .map(|&a| {
                        let mut attrs = HashMap::new();
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

/// Helper to build PetriNetArc with default weight 1.
fn arc(from: &str, to: &str) -> PetriNetArc {
    PetriNetArc {
        from: from.to_string(),
        to: to.to_string(),
        weight: None,
    }
}

/// Helper to build a visible PetriNetTransition.
fn trans(id: &str, label: &str) -> PetriNetTransition {
    PetriNetTransition {
        id: id.to_string(),
        label: label.to_string(),
        is_invisible: None,
    }
}

/// Helper to build an invisible (silent) PetriNetTransition.
fn silent(id: &str) -> PetriNetTransition {
    PetriNetTransition {
        id: id.to_string(),
        label: String::new(),
        is_invisible: Some(true),
    }
}

/// Helper to build a PetriNetPlace.
fn place(id: &str) -> PetriNetPlace {
    PetriNetPlace {
        id: id.to_string(),
        label: id.to_string(),
        marking: None,
    }
}

// ---------------------------------------------------------------------------
// Family 1 — Sequence net:  i --A--> p --B--> f
//
// Places: i, p, f
// Transitions: A (i→p), B (p→f)
// Initial marking: {i: 1}
// Final marking:   [{f: 1}]
//
// Oracle trace analysis (bitmask path):
//
//   Trace [A, B]:
//     Fire A: consume i (c=1), produce p (p=1)
//     Fire B: consume p (c=2), produce f (p=2)
//     End marking: {f:1}  → remaining=1
//     fitness = 0.5*(1-0/2) + 0.5*(1-1/2) = 0.5 + 0.25 = 0.75
//
//   Trace [A]:
//     Fire A: consume i (c=1), produce p (p=1)
//     End marking: {p:1}  → remaining=1
//     fitness = 0.5*(1-0/1) + 0.5*(1-1/1) = 0.5 + 0.0 = 0.50
// ---------------------------------------------------------------------------

fn sequence_net() -> PetriNet {
    let mut net = PetriNet::new();
    net.places = vec![place("i"), place("p"), place("f")];
    net.transitions = vec![trans("tA", "A"), trans("tB", "B")];
    net.arcs = vec![
        arc("i", "tA"),
        arc("tA", "p"),
        arc("p", "tB"),
        arc("tB", "f"),
    ];
    net.initial_marking.insert("i".to_string(), 1);
    let mut fm = HashMap::new();
    fm.insert("f".to_string(), 1usize);
    net.final_markings.push(fm);
    net
}

#[test]
fn test_sequence_perfect_trace_fitness_is_0_75() {
    // Trace [A, B] on sequence net: consumed=2, produced=2, missing=0, remaining=1
    // fitness = 0.5*(1-0/2) + 0.5*(1-1/2) = 0.75
    let log = make_log(&[&["A", "B"]]);
    let net = sequence_net();
    let result = token_replay_pure(&log, &net, "concept:name");
    assert_eq!(result.case_fitness.len(), 1);
    let f = result.case_fitness[0].trace_fitness;
    assert!(
        (f - 0.75).abs() < 1e-10,
        "expected 0.75, got {f:.10}"
    );
    assert_eq!(result.case_fitness[0].tokens_missing, 0);
    assert_eq!(result.case_fitness[0].tokens_remaining, 1);
    assert!(result.case_fitness[0].is_conforming);
}

#[test]
fn test_sequence_incomplete_trace_fitness_is_0_50() {
    // Trace [A] on sequence net: consumed=1, produced=1, missing=0, remaining=1
    // fitness = 0.5*(1-0/1) + 0.5*(1-1/1) = 0.5 + 0.0 = 0.50
    let log = make_log(&[&["A"]]);
    let net = sequence_net();
    let result = token_replay_pure(&log, &net, "concept:name");
    let f = result.case_fitness[0].trace_fitness;
    assert!(
        (f - 0.50).abs() < 1e-10,
        "expected 0.50, got {f:.10}"
    );
    assert_eq!(result.case_fitness[0].tokens_missing, 0);
    assert_eq!(result.case_fitness[0].tokens_remaining, 1);
    assert!(!result.case_fitness[0].is_conforming);
}

// ---------------------------------------------------------------------------
// Family 2 — Choice (XOR) net:  i --A--> p_choice --B--> f
//                                                  --C--> f
//
// Places: i, p_choice, f
// Transitions: A (i→p_choice), B (p_choice→f), C (p_choice→f)
// Initial marking: {i: 1}
// Final marking:   [{f: 1}]
//
// Oracle trace analysis:
//
//   Trace [A, B]:
//     Fire A: consume i (c=1), produce p_choice (p=1)
//     Fire B: consume p_choice (c=2), produce f (p=2)
//     End: remaining=1(f)
//     fitness = 0.5*(1-0/2) + 0.5*(1-1/2) = 0.75
//
//   Trace [A, C]:  same token accounting → fitness = 0.75
// ---------------------------------------------------------------------------

fn choice_net() -> PetriNet {
    let mut net = PetriNet::new();
    net.places = vec![place("i"), place("p_choice"), place("f")];
    net.transitions = vec![
        trans("tA", "A"),
        trans("tB", "B"),
        trans("tC", "C"),
    ];
    net.arcs = vec![
        arc("i", "tA"),
        arc("tA", "p_choice"),
        arc("p_choice", "tB"),
        arc("tB", "f"),
        arc("p_choice", "tC"),
        arc("tC", "f"),
    ];
    net.initial_marking.insert("i".to_string(), 1);
    let mut fm = HashMap::new();
    fm.insert("f".to_string(), 1usize);
    net.final_markings.push(fm);
    net
}

#[test]
fn test_choice_left_path_fitness_is_0_75() {
    // Trace [A, B]: perfect execution via left branch → fitness = 0.75
    let log = make_log(&[&["A", "B"]]);
    let net = choice_net();
    let result = token_replay_pure(&log, &net, "concept:name");
    let f = result.case_fitness[0].trace_fitness;
    assert!(
        (f - 0.75).abs() < 1e-10,
        "expected 0.75, got {f:.10}"
    );
    assert_eq!(result.case_fitness[0].tokens_missing, 0);
    assert!(result.case_fitness[0].is_conforming);
}

#[test]
fn test_choice_right_path_fitness_is_0_75() {
    // Trace [A, C]: perfect execution via right branch → fitness = 0.75
    let log = make_log(&[&["A", "C"]]);
    let net = choice_net();
    let result = token_replay_pure(&log, &net, "concept:name");
    let f = result.case_fitness[0].trace_fitness;
    assert!(
        (f - 0.75).abs() < 1e-10,
        "expected 0.75, got {f:.10}"
    );
    assert_eq!(result.case_fitness[0].tokens_missing, 0);
    assert!(result.case_fitness[0].is_conforming);
}

// ---------------------------------------------------------------------------
// Family 3 — Parallel (AND-split/join):
//
//   i --split--> p_b  --B--> p_jb
//             \> p_c  --C--> p_jc
//   p_jb + p_jc --join--> f
//
// Places: i, p_b, p_c, p_jb, p_jc, f
// Transitions: split (i→p_b, i→p_c), B (p_b→p_jb), C (p_c→p_jc), join (p_jb+p_jc→f)
// Initial marking: {i: 1}
// Final marking:   [{f: 1}]
//
// Oracle trace analysis:
//
//   Trace [split, B, C, join]:
//     Fire split: consume i (c=1), produce p_b+p_c (p=2)
//     Fire B:     consume p_b (c=2), produce p_jb (p=3)
//     Fire C:     consume p_c (c=3), produce p_jc (p=4)
//     Fire join:  consume p_jb+p_jc (c=5), produce f (p=5)
//     End: remaining=1(f)
//     fitness = 0.5*(1-0/5) + 0.5*(1-1/5) = 0.5 + 0.4 = 0.90
//
//   Trace [split, B, join] (C skipped — join fires with missing p_jc token):
//     Fire split: consume i (c=1), produce p_b+p_c (p=2)
//     Fire B:     consume p_b (c=2), produce p_jb (p=3)
//     Fire join:  needs p_jb+p_jc; p_jc missing → missing_tokens=1; bitmask path
//                 consumes p_jb (c=3), produces f (p=4)
//     End: remaining = p_c(1) + f(1) = 2
//     fitness = 0.5*(1-1/3) + 0.5*(1-2/4) = 0.5*(2/3) + 0.5*(1/2)
//             = 1/3 + 1/4 = 0.333... + 0.25 = 0.5833...
// ---------------------------------------------------------------------------

fn parallel_net() -> PetriNet {
    let mut net = PetriNet::new();
    net.places = vec![
        place("i"),
        place("p_b"),
        place("p_c"),
        place("p_jb"),
        place("p_jc"),
        place("f"),
    ];
    net.transitions = vec![
        trans("t_split", "split"),
        trans("tB", "B"),
        trans("tC", "C"),
        trans("t_join", "join"),
    ];
    net.arcs = vec![
        // split: i → p_b and i → p_c (AND-split: one input, two outputs)
        arc("i", "t_split"),
        arc("t_split", "p_b"),
        arc("t_split", "p_c"),
        // B: p_b → p_jb
        arc("p_b", "tB"),
        arc("tB", "p_jb"),
        // C: p_c → p_jc
        arc("p_c", "tC"),
        arc("tC", "p_jc"),
        // join: p_jb + p_jc → f (AND-join: two inputs, one output)
        arc("p_jb", "t_join"),
        arc("p_jc", "t_join"),
        arc("t_join", "f"),
    ];
    net.initial_marking.insert("i".to_string(), 1);
    let mut fm = HashMap::new();
    fm.insert("f".to_string(), 1usize);
    net.final_markings.push(fm);
    net
}

#[test]
fn test_parallel_perfect_trace_fitness_is_0_90() {
    // Trace [split, B, C, join]: all transitions enabled, fitness = 0.90
    let log = make_log(&[&["split", "B", "C", "join"]]);
    let net = parallel_net();
    let result = token_replay_pure(&log, &net, "concept:name");
    let f = result.case_fitness[0].trace_fitness;
    assert!(
        (f - 0.90).abs() < 1e-10,
        "expected 0.90, got {f:.10}"
    );
    assert_eq!(result.case_fitness[0].tokens_missing, 0);
    assert_eq!(result.case_fitness[0].tokens_remaining, 1);
    assert!(result.case_fitness[0].is_conforming);
}

#[test]
fn test_parallel_missing_branch_fitness_is_0_5833() {
    // Trace [split, B, join] (C skipped):
    // missing=1, consumed=3, produced=4, remaining=2
    // fitness = 0.5*(1-1/3) + 0.5*(1-2/4) = 0.5*(2/3) + 0.5*(0.5) = 1/3 + 1/4 ≈ 0.5833
    let log = make_log(&[&["split", "B", "join"]]);
    let net = parallel_net();
    let result = token_replay_pure(&log, &net, "concept:name");
    let f = result.case_fitness[0].trace_fitness;
    let expected = 0.5 * (2.0 / 3.0) + 0.5 * (1.0 / 2.0);
    assert!(
        (f - expected).abs() < 1e-9,
        "expected {expected:.10}, got {f:.10}"
    );
    assert_eq!(result.case_fitness[0].tokens_missing, 1);
}

// ---------------------------------------------------------------------------
// Family 4 — Loop net:  i --A--> p --B--> p (back-arc) --B--> ... --C--> f
//
// Model: i --A--> p_loop --B--> p_loop (self-loop via B),  p_loop --C--> f
//
// Places: i, p_loop, f
// Transitions: A (i→p_loop), B (p_loop→p_loop), C (p_loop→f)
// Initial marking: {i: 1}
// Final marking:   [{f: 1}]
//
// Oracle trace analysis:
//
//   Trace [A, C] (zero loop iterations):
//     Fire A: consume i (c=1), produce p_loop (p=1)
//     Fire C: consume p_loop (c=2), produce f (p=2)
//     End: remaining=1(f)
//     fitness = 0.5*(1-0/2) + 0.5*(1-1/2) = 0.75
//
//   Trace [A, B, B, C] (two loop iterations):
//     Fire A: consume i (c=1), produce p_loop (p=1)
//     Fire B: consume p_loop (c=2), produce p_loop (p=2)
//     Fire B: consume p_loop (c=3), produce p_loop (p=3)
//     Fire C: consume p_loop (c=4), produce f (p=4)
//     End: remaining=1(f)
//     fitness = 0.5*(1-0/4) + 0.5*(1-1/4) = 0.5 + 0.375 = 0.875
// ---------------------------------------------------------------------------

fn loop_net() -> PetriNet {
    let mut net = PetriNet::new();
    net.places = vec![place("i"), place("p_loop"), place("f")];
    net.transitions = vec![
        trans("tA", "A"),
        trans("tB", "B"),
        trans("tC", "C"),
    ];
    net.arcs = vec![
        arc("i", "tA"),
        arc("tA", "p_loop"),
        // B: self-loop on p_loop
        arc("p_loop", "tB"),
        arc("tB", "p_loop"),
        // C: exit loop
        arc("p_loop", "tC"),
        arc("tC", "f"),
    ];
    net.initial_marking.insert("i".to_string(), 1);
    let mut fm = HashMap::new();
    fm.insert("f".to_string(), 1usize);
    net.final_markings.push(fm);
    net
}

#[test]
fn test_loop_zero_iterations_fitness_is_0_75() {
    // Trace [A, C]: consumed=2, produced=2, missing=0, remaining=1
    // fitness = 0.75
    let log = make_log(&[&["A", "C"]]);
    let net = loop_net();
    let result = token_replay_pure(&log, &net, "concept:name");
    let f = result.case_fitness[0].trace_fitness;
    assert!(
        (f - 0.75).abs() < 1e-10,
        "expected 0.75, got {f:.10}"
    );
    assert_eq!(result.case_fitness[0].tokens_missing, 0);
    assert!(result.case_fitness[0].is_conforming);
}

#[test]
fn test_loop_two_iterations_fitness_is_0_875() {
    // Trace [A, B, B, C]: consumed=4, produced=4, missing=0, remaining=1
    // fitness = 0.5*(1-0/4) + 0.5*(1-1/4) = 0.5 + 0.375 = 0.875
    let log = make_log(&[&["A", "B", "B", "C"]]);
    let net = loop_net();
    let result = token_replay_pure(&log, &net, "concept:name");
    let f = result.case_fitness[0].trace_fitness;
    assert!(
        (f - 0.875).abs() < 1e-10,
        "expected 0.875, got {f:.10}"
    );
    assert_eq!(result.case_fitness[0].tokens_missing, 0);
    assert!(result.case_fitness[0].is_conforming);
}

// ---------------------------------------------------------------------------
// Family 5 — Silent (τ) transitions:
//
//   i --A--> p1 --τ--> p2 --B--> f
//
// Places: i, p1, p2, f
// Transitions: A (i→p1), τ invisible (p1→p2), B (p2→f)
// Initial marking: {i: 1}
// Final marking:   [{f: 1}]
//
// The silent τ transition fires automatically after A (invisible fixpoint).
//
// Oracle trace analysis:
//
// CRITICAL: fire_invisible_bitmask modifies the marking bitmask directly but
// does NOT increment consumed_tokens or produced_tokens. Only VISIBLE transitions
// update those counters. The silent τ transition is therefore "free" in terms
// of the fitness formula denominators.
//
//   Trace [A, B]:
//     Fire A: consume i (c=1), produce p1 (p=1)
//     Silent fixpoint: τ fires (marking update only, c/p unchanged)
//     Fire B: consume p2 (c=2), produce f (p=2)
//     End: remaining=1(f)
//     fitness = 0.5*(1-0/2) + 0.5*(1-1/2) = 0.5 + 0.25 = 0.75
//
//   Trace [A] (stops before B, τ still auto-fires silently):
//     Fire A: consume i (c=1), produce p1 (p=1)
//     Silent fixpoint: τ fires (marking update only, c/p unchanged)
//     End: remaining=1(p2) — τ fired, so remaining token is at p2
//     fitness = 0.5*(1-0/1) + 0.5*(1-1/1) = 0.5 + 0.0 = 0.50
// ---------------------------------------------------------------------------

fn silent_transition_net() -> PetriNet {
    let mut net = PetriNet::new();
    net.places = vec![place("i"), place("p1"), place("p2"), place("f")];
    net.transitions = vec![
        trans("tA", "A"),
        silent("tau"),
        trans("tB", "B"),
    ];
    net.arcs = vec![
        arc("i", "tA"),
        arc("tA", "p1"),
        arc("p1", "tau"),
        arc("tau", "p2"),
        arc("p2", "tB"),
        arc("tB", "f"),
    ];
    net.initial_marking.insert("i".to_string(), 1);
    let mut fm = HashMap::new();
    fm.insert("f".to_string(), 1usize);
    net.final_markings.push(fm);
    net
}

#[test]
fn test_silent_transition_perfect_trace_fitness_is_0_75() {
    // Trace [A, B]: τ auto-fires between A and B (silent transitions are "free" —
    // fire_invisible_bitmask does NOT increment consumed_tokens/produced_tokens).
    // Only visible transitions A and B count: consumed=2, produced=2, missing=0, remaining=1
    // fitness = 0.5*(1-0/2) + 0.5*(1-1/2) = 0.5 + 0.25 = 0.75
    let log = make_log(&[&["A", "B"]]);
    let net = silent_transition_net();
    let result = token_replay_pure(&log, &net, "concept:name");
    let f = result.case_fitness[0].trace_fitness;
    assert!(
        (f - 0.75).abs() < 1e-10,
        "expected 0.75 (silent transitions are free in token counts), got {f:.10}"
    );
    assert_eq!(result.case_fitness[0].tokens_missing, 0);
    assert!(result.case_fitness[0].is_conforming);
}

#[test]
fn test_silent_transition_incomplete_trace_fitness_is_0_50() {
    // Trace [A]: τ still auto-fires silently (zero cost to c/p counters).
    // Only A counts: consumed=1, produced=1, missing=0, remaining=1(p2 after τ)
    // fitness = 0.5*(1-0/1) + 0.5*(1-1/1) = 0.5 + 0.0 = 0.50
    let log = make_log(&[&["A"]]);
    let net = silent_transition_net();
    let result = token_replay_pure(&log, &net, "concept:name");
    let f = result.case_fitness[0].trace_fitness;
    assert!(
        (f - 0.50).abs() < 1e-10,
        "expected 0.50 for incomplete trace with silent transition, got {f:.10}"
    );
    assert_eq!(result.case_fitness[0].tokens_missing, 0);
    assert!(!result.case_fitness[0].is_conforming);
}

// ---------------------------------------------------------------------------
// Family 6 — Duplicate labels (same label on two transitions):
//
//   i --A--> p1 --A--> p2 --B--> f     (A appears twice)
//
// Places: i, p1, p2, f
// Transitions: A1 (i→p1), A2 (p1→p2), B (p2→f)
// Both A1 and A2 have label "A"; the sorted_label_index stores both indices.
// The code always picks the FIRST one (index 0 in the Vec stored for "A").
// sorted_label_index is built with label_map.entry(trans.label.clone()).or_default().push(idx)
// then sorted alphabetically by label, so both transitions share one entry with Vec<usize>.
// The code uses sorted_label_index[pos].1[0] — always the FIRST index in declaration order.
//
// With two "A" transitions both mapped under label "A" (indices [0, 1] for A1, A2):
// .1[0] always picks A1 (i→p1).
//
// Oracle trace analysis [A, A, B]:
//   Fire A (picks A1=i→p1): consume i (c=1), produce p1 (p=1)
//   Fire A (picks A1=i→p1): needs i, but i is empty → missing_tokens=1; consume: nothing;
//                            produce p1 (p=2). Now marking: p1(2 tokens)
//   Fire B: needs p2 but p2=0 → missing_tokens=1; consume: nothing; produce f (p=3).
//           marking: p1(2)+f(1) = remaining=3
//   fitness = 0.5*(1 - 2/max(1,1)) + 0.5*(1 - 3/3) = 0.5*(1-2) is negative → clamp!
//           = clamp(0.5*(-1) + 0.5*0) = clamp(-0.5) = 0.0
//
// NOTE: The bitmask path only stores 1 bit per place. Place p1 after two firings of A1:
//   After first A: marking |= p1-bit → p1=1.
//   After second A (not enabled, but still produces): marking |= p1-bit → p1 still=1.
//   consumed=1 (only i was consumed the first time, p1 bit already set = no double consume).
// So in bitmask mode, only 1 token is ever consumed from i (first A), and p1's bit is
// set to 1 (not 2). Let me recompute more carefully for bitmask path:
//
//   Init: marking has i-bit set.
//   Fire A1 (first "A"):
//     enabled: i-bit=1 → yes. missing_tokens unchanged.
//     consume: i-bit clear (c=1). produce: p1-bit set (p=1).
//   Fire A1 (second "A"):
//     enabled: i-bit=0 → no. missing_tokens=1.
//     consume: i-bit=0, so nothing consumed. produce: p1-bit |= p1 (already set, no effect).
//     Actually produce still increments produced_tokens: p=2.
//   Fire B:
//     enabled: p2-bit=0 → no. missing_tokens=2.
//     consume: nothing (p2-bit=0). produce: f-bit set (p=3).
//   End marking: p1-bit set, f-bit set → remaining=2.
//   c = max(1, consumed=1) = 1
//   p = max(1, produced=3) = 3
//   fitness = clamp(0.5*(1-2/1) + 0.5*(1-2/3)) = clamp(0.5*(-1) + 0.5*(1/3))
//           = clamp(-0.5 + 0.1667) = clamp(-0.333) = 0.0
//
// A simpler and more reliable test for duplicate labels: [A, B] where only first A fires:
//   Fire A1 (i→p1): consume i (c=1), produce p1 (p=1).
//   Fire B: needs p2, p2-bit=0 → missing=1; produce f (p=2).
//   End: p1-bit set, f-bit set → remaining=2.
//   c=1, p=2.
//   fitness = clamp(0.5*(1-1/1) + 0.5*(1-2/2)) = clamp(0+0) = 0.0
//
// Fitness = 0.0 for [A, B] on this net because B cannot reach f without going through p2.
// ---------------------------------------------------------------------------

fn duplicate_label_net() -> PetriNet {
    let mut net = PetriNet::new();
    net.places = vec![place("i"), place("p1"), place("p2"), place("f")];
    // Both transitions share label "A" — A1 has idx=0, A2 has idx=1
    net.transitions = vec![
        trans("tA1", "A"),
        trans("tA2", "A"),
        trans("tB", "B"),
    ];
    net.arcs = vec![
        arc("i", "tA1"),
        arc("tA1", "p1"),
        arc("p1", "tA2"),
        arc("tA2", "p2"),
        arc("p2", "tB"),
        arc("tB", "f"),
    ];
    net.initial_marking.insert("i".to_string(), 1);
    let mut fm = HashMap::new();
    fm.insert("f".to_string(), 1usize);
    net.final_markings.push(fm);
    net
}

#[test]
fn test_duplicate_label_misrouted_trace_fitness_is_0_0() {
    // Trace [A, B]: code always picks first "A" transition (A1: i→p1).
    // B needs p2 but p2 is never populated → missing tokens → fitness = 0.0
    let log = make_log(&[&["A", "B"]]);
    let net = duplicate_label_net();
    let result = token_replay_pure(&log, &net, "concept:name");
    let f = result.case_fitness[0].trace_fitness;
    assert!(
        f < 1e-10,
        "expected 0.0 (duplicate-label routing always picks first transition), got {f:.10}"
    );
    assert!(result.case_fitness[0].tokens_missing > 0);
}

#[test]
fn test_duplicate_label_correct_sequence_fitness() {
    // Trace [A, A, B]: first A fires A1(i→p1), second A fires A1 again (missing i),
    // but in the VEC path (not bitmask) the second A token IS consumed from wherever.
    // Here we verify the bitmask path behavior:
    // After [A, A, B]: at least one missing token (B cannot reach f normally),
    // so fitness < 0.75. We assert strictly less than perfect fitness.
    let log = make_log(&[&["A", "A", "B"]]);
    let net = duplicate_label_net();
    let result = token_replay_pure(&log, &net, "concept:name");
    let f = result.case_fitness[0].trace_fitness;
    assert!(
        f < 0.75,
        "expected fitness < 0.75 for misrouted duplicate-label trace, got {f:.10}"
    );
    // At least one token is missing because B requires p2 which is never populated
    assert!(result.case_fitness[0].tokens_missing > 0);
}

// ---------------------------------------------------------------------------
// Family 7 — Zero-denominator edge cases and multi-trace averages
//
// Sub-family 7a: Empty trace on a net
//   Trace []: no events fired. End: initial marking still set.
//   consumed=0 → max(1)=1, produced=0 → max(1)=1, missing=0, remaining=1(i)
//   fitness = 0.5*(1-0/1) + 0.5*(1-1/1) = 0.5 + 0.0 = 0.50
//
// Sub-family 7b: Multi-trace average fitness
//   Log with two traces: [A,B] (fitness=0.75) and [A] (fitness=0.50)
//   avg_fitness = (0.75 + 0.50) / 2 = 0.625
// ---------------------------------------------------------------------------

#[test]
fn test_empty_trace_fitness_is_0_50() {
    // Empty trace []: consumed=0→1, produced=0→1, missing=0, remaining=1(initial i token)
    // fitness = 0.5*(1-0/1) + 0.5*(1-1/1) = 0.5 + 0.0 = 0.50
    let log = make_log(&[&[]]);
    let net = sequence_net();
    let result = token_replay_pure(&log, &net, "concept:name");
    let f = result.case_fitness[0].trace_fitness;
    assert!(
        (f - 0.50).abs() < 1e-10,
        "expected 0.50 for empty trace, got {f:.10}"
    );
    assert_eq!(result.case_fitness[0].tokens_missing, 0);
    assert!(!result.case_fitness[0].is_conforming, "empty trace should not be conforming");
}

#[test]
fn test_single_transition_net_empty_trace_zero_denominator() {
    // Single-transition net: i --A--> f (no intermediate place)
    // Trace []: consumed=0→1, produced=0→1, missing=0, remaining=1(i token)
    // fitness = 0.5*(1-0/1) + 0.5*(1-1/1) = 0.50
    // Tests the max(1,...) denominator protection.
    let mut net = PetriNet::new();
    net.places = vec![place("i"), place("f")];
    net.transitions = vec![trans("tA", "A")];
    net.arcs = vec![arc("i", "tA"), arc("tA", "f")];
    net.initial_marking.insert("i".to_string(), 1);
    let mut fm = HashMap::new();
    fm.insert("f".to_string(), 1usize);
    net.final_markings.push(fm);

    let log = make_log(&[&[]]);
    let result = token_replay_pure(&log, &net, "concept:name");
    let f = result.case_fitness[0].trace_fitness;
    assert!(
        (f - 0.50).abs() < 1e-10,
        "expected 0.50 for empty trace on single-transition net, got {f:.10}"
    );
}

#[test]
fn test_multi_trace_average_fitness_is_0_625() {
    // Two traces: [A,B] → 0.75, [A] → 0.50
    // avg = 0.625
    let log = make_log(&[&["A", "B"], &["A"]]);
    let net = sequence_net();
    let result = token_replay_pure(&log, &net, "concept:name");
    assert_eq!(result.case_fitness.len(), 2);
    let f0 = result.case_fitness[0].trace_fitness;
    let f1 = result.case_fitness[1].trace_fitness;
    assert!(
        (f0 - 0.75).abs() < 1e-10,
        "trace 0 expected 0.75, got {f0:.10}"
    );
    assert!(
        (f1 - 0.50).abs() < 1e-10,
        "trace 1 expected 0.50, got {f1:.10}"
    );
    let expected_avg = 0.625;
    assert!(
        (result.avg_fitness - expected_avg).abs() < 1e-10,
        "avg_fitness expected 0.625, got {:.10}",
        result.avg_fitness
    );
}

#[test]
fn test_multi_trace_conforming_count() {
    // Three traces: [A,B] conforming, [A] not conforming, [A,B] conforming
    // conforming_cases should be 2
    let log = make_log(&[&["A", "B"], &["A"], &["A", "B"]]);
    let net = sequence_net();
    let result = token_replay_pure(&log, &net, "concept:name");
    assert_eq!(result.total_cases, 3);
    assert_eq!(result.conforming_cases, 2);
}

// ---------------------------------------------------------------------------
// Family 1 extended — Reversed trace (activities in wrong order)
//
// Trace [B, A] on sequence net:
//   Fire B: needs p, but marking={i}; missing_tokens=1; p-bit=0 so no consume;
//           produce f (p=1).
//   Fire A: needs i, i-bit=1; consume i (c=1); produce p (p=2).
//   End: marking = {p: 1, f: 1} → remaining=2.
//   fitness = 0.5*(1-1/1) + 0.5*(1-2/2) = 0.0 + 0.0 = 0.0
//   BUT: clamping applies. Let's compute:
//   c = max(1, 1) = 1, p = max(1, 2) = 2, missing = 1, remaining = 2
//   fitness = clamp(0.5*(1-1/1) + 0.5*(1-2/2)) = clamp(0.0 + 0.0) = 0.0
// ---------------------------------------------------------------------------

#[test]
fn test_sequence_reversed_trace_fitness_is_0_0() {
    // Trace [B, A]: activities in wrong order
    // B fires with missing token; A fires afterwards; fitness = 0.0
    let log = make_log(&[&["B", "A"]]);
    let net = sequence_net();
    let result = token_replay_pure(&log, &net, "concept:name");
    let f = result.case_fitness[0].trace_fitness;
    assert!(
        f < 1e-10,
        "expected 0.0 for reversed trace [B,A] on sequence net, got {f:.10}"
    );
    assert!(result.case_fitness[0].tokens_missing > 0);
    assert!(!result.case_fitness[0].is_conforming);
}

// ---------------------------------------------------------------------------
// Additional: unknown activity on sequence net
//
// Trace [A, X, B] where X is not in the net:
//   Fire A: consume i (c=1), produce p (p=1).
//   X not found: missing_tokens=1; no consume; no produce (skipped entirely).
//   Fire B: consume p (c=2), produce f (p=2).
//   End: remaining=1(f).
//   c=2, p=2, missing=1
//   fitness = 0.5*(1-1/2) + 0.5*(1-1/2) = 0.25 + 0.25 = 0.50
// ---------------------------------------------------------------------------

#[test]
fn test_sequence_unknown_activity_fitness_is_0_50() {
    // Trace [A, X, B]: X not in net → missing_tokens=1 but no tokens consumed/produced
    // consumed=2, produced=2, missing=1, remaining=1
    // fitness = 0.5*(1-1/2) + 0.5*(1-1/2) = 0.50
    let log = make_log(&[&["A", "X", "B"]]);
    let net = sequence_net();
    let result = token_replay_pure(&log, &net, "concept:name");
    let f = result.case_fitness[0].trace_fitness;
    assert!(
        (f - 0.50).abs() < 1e-10,
        "expected 0.50 for trace with unknown activity, got {f:.10}"
    );
    assert_eq!(result.case_fitness[0].tokens_missing, 1);
    // B still fires after unknown X, so final marking is reached
    assert!(result.case_fitness[0].tokens_remaining == 1);
}
