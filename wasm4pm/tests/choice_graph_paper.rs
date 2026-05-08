//! Integration tests for spec-compliant Choice Graph (Definition 1, paper
//! arXiv:2505.07052 — Kourani, Park, van der Aalst, "Unlocking
//! Non-Block-Structured Decisions: Inductive Mining with Choice Graphs").
//!
//! These tests are end-to-end: build a `wasm4pm_types::ChoiceGraph`, add it
//! to a `PowlArena`, project to a Petri net via the existing POWL→PN
//! conversion, then replay traces and assert fitness behaviour.

use wasm4pm::powl::conformance::token_replay::replay_trace;
use wasm4pm::powl::conversion::to_petri_net;
use wasm4pm::powl_arena::PowlArena;
use wasm4pm::powl_event_log::{Event, Trace};
use wasm4pm::powl_parser::parse_powl_model_string;
use wasm4pm_types::{ChoiceGraph, ChoiceGraphError, ChoiceGraphNode};

use std::collections::HashMap;

fn trace_of(case: &str, acts: &[&str]) -> Trace {
    Trace {
        case_id: case.to_string(),
        events: acts
            .iter()
            .map(|a| Event {
                name: (*a).to_string(),
                timestamp: None,
                lifecycle: None,
                attributes: HashMap::new(),
            })
            .collect(),
    }
}

fn replay_fitness(arena: &PowlArena, root: u32, trace: &Trace) -> f64 {
    let res = to_petri_net::apply(arena, root);
    let r = replay_trace(&res.net, &res.initial_marking, &res.final_marking, trace);
    r.fitness
}

// ─── Test 1: Paper Fig 1 — Retail Order Acceptance ────────────────────────────
//
// The figure depicts a non-block-structured choice over ordering decisions.
// We build:
//   Start ─► CheckOrder ─► {Production, Schedule, Cancel}
// where Production || Schedule must both fire (any order) before End,
// while Cancel reaches End directly. Encoded as a CG:
//
//   n0 = Start
//   n1 = CheckOrder
//   n2 = Production
//   n3 = Schedule
//   n4 = Cancel
//   n5 = End
//
//   edges: Start→CheckOrder, CheckOrder→Production, CheckOrder→Schedule,
//          Production→Schedule, Schedule→Production,  -- swappable order
//          Production→End, Schedule→End,
//          CheckOrder→Cancel, Cancel→End
//
// To keep the graph acyclic we model "any order of {Production,Schedule}" as
// a CheckOrder→{P,S} fan-out with each individually flowing to End. This is
// the linguistic shape Definition 1 captures: each Start→End path enumerates
// one variant.
#[test]
fn paper_figure1_retail_order_acceptance() {
    use ChoiceGraphNode::*;
    let nodes = vec![
        Start,
        Activity("CheckOrder".into()),
        Activity("Production".into()),
        Activity("Schedule".into()),
        Activity("Cancel".into()),
        End,
    ];
    let edges = vec![
        (0, 1), // Start → CheckOrder
        (1, 2), // CheckOrder → Production
        (1, 3), // CheckOrder → Schedule
        (1, 4), // CheckOrder → Cancel
        (2, 5), // Production → End
        (3, 5), // Schedule → End
        (4, 5), // Cancel → End
    ];
    let cg = ChoiceGraph::new(nodes, edges).expect("paper fig1 should validate");

    let mut arena = PowlArena::new();
    let root = arena.add_choice_graph(cg);

    // Each variant is a single-activity Start→End path. Replay perfect-fit.
    for (label, acts) in &[
        ("p", vec!["CheckOrder", "Production"]),
        ("s", vec!["CheckOrder", "Schedule"]),
        ("c", vec!["CheckOrder", "Cancel"]),
    ] {
        let t = trace_of(label, acts);
        let f = replay_fitness(&arena, root, &t);
        assert!(
            f >= 0.999,
            "trace {:?} should perfectly fit, got fitness {}",
            acts,
            f
        );
    }
}

// ─── Test 2: Invalid combination yields lower fitness ────────────────────────
#[test]
fn paper_figure1_invalid_trace_yields_lower_fitness() {
    use ChoiceGraphNode::*;
    let nodes = vec![
        Start,
        Activity("CheckOrder".into()),
        Activity("Production".into()),
        Activity("Schedule".into()),
        Activity("Cancel".into()),
        End,
    ];
    let edges = vec![
        (0, 1),
        (1, 2),
        (1, 3),
        (1, 4),
        (2, 5),
        (3, 5),
        (4, 5),
    ];
    let cg = ChoiceGraph::new(nodes, edges).unwrap();

    let mut arena = PowlArena::new();
    let root = arena.add_choice_graph(cg);

    // CheckOrder + Schedule + Cancel mixes mutually-exclusive branches.
    let t = trace_of("bad", &["CheckOrder", "Schedule", "Cancel"]);
    let f = replay_fitness(&arena, root, &t);
    assert!(
        f < 1.0,
        "mixed-branch trace should not be perfect, got fitness {}",
        f
    );
}

// ─── Test 3: Cyclic graph rejected ───────────────────────────────────────────
#[test]
fn cyclic_graph_rejected() {
    use ChoiceGraphNode::*;
    // Start → a → b → a is a cycle that also reaches End.
    let nodes = vec![
        Start,
        Activity("a".into()),
        Activity("b".into()),
        End,
    ];
    let edges = vec![
        (0, 1), // Start → a
        (1, 2), // a → b
        (2, 1), // b → a   (cycle)
        (2, 3), // b → End
    ];
    let err = ChoiceGraph::new(nodes, edges).expect_err("cycle must be rejected");
    assert_eq!(err, ChoiceGraphError::Cyclic);
}

// ─── Test 4: Disconnected node rejected ──────────────────────────────────────
#[test]
fn disconnected_node_rejected() {
    use ChoiceGraphNode::*;
    // n2 (Activity "orphan") is unreachable from Start.
    let nodes = vec![
        Start,
        Activity("a".into()),
        Activity("orphan".into()),
        End,
    ];
    let edges = vec![
        (0, 1), // Start → a
        (1, 3), // a → End
        (2, 3), // orphan → End  (orphan not reachable from Start)
    ];
    let err = ChoiceGraph::new(nodes, edges)
        .expect_err("orphan node must be rejected");
    assert_eq!(err, ChoiceGraphError::NodeNotOnStartEndPath);
}

// ─── Test 5: XOR vs 2-node CG language equivalence ───────────────────────────
//
// L(Powl8Op::Choice(a, b)) = {[a], [b]}. We build an L-equivalent CG
// (Start → {a, b} → End) and confirm that the SAME traces are accepted /
// rejected by both models. Token-replay fitness numbers may differ slightly
// (different silent-transition topology), so we compare *acceptance only*:
// a trace either has fitness ≥ 0.999 against both models or against neither.
#[test]
fn xor_lowered_to_two_node_choice_graph_language_match() {
    use wasm4pm::powl_arena::Operator;

    // CG model: Start → {a, b} → End.
    let mut arena_cg = PowlArena::new();
    let cg = ChoiceGraph::new(
        vec![
            ChoiceGraphNode::Start,
            ChoiceGraphNode::Activity("a".into()),
            ChoiceGraphNode::Activity("b".into()),
            ChoiceGraphNode::End,
        ],
        vec![(0, 1), (0, 2), (1, 3), (2, 3)],
    )
    .unwrap();
    let cg_root = arena_cg.add_choice_graph(cg);

    // XOR model: Operator::Xor over [a, b].
    let mut arena_xor = PowlArena::new();
    let a = arena_xor.add_transition(Some("a".into()));
    let b = arena_xor.add_transition(Some("b".into()));
    let xor_root = arena_xor.add_operator(Operator::Xor, vec![a, b]);

    // 30 (deterministic) traces drawn from {[a],[b],[a,b],[],[a,a]}.
    let menu: [&[&str]; 5] = [&["a"], &["b"], &["a", "b"], &[], &["a", "a"]];
    let mut total = 0;
    let mut agree = 0;
    for i in 0..30usize {
        let t = trace_of(&format!("c{}", i), menu[i % menu.len()]);
        let f_cg = replay_fitness(&arena_cg, cg_root, &t);
        let f_xor = replay_fitness(&arena_xor, xor_root, &t);
        let acc_cg = f_cg >= 0.999;
        let acc_xor = f_xor >= 0.999;
        total += 1;
        if acc_cg == acc_xor {
            agree += 1;
        }
    }
    assert_eq!(
        agree, total,
        "language equivalence: every trace must be accepted by both or neither"
    );
}

// ─── Test 6: Parser round-trip ───────────────────────────────────────────────
#[test]
fn parser_round_trip() {
    let s = "CG=(nodes={n0=Start, n1=Activity(a), n2=Activity(b), n3=End}, \
             edges={n0->n1, n0->n2, n1->n3, n2->n3})";
    let mut arena = PowlArena::new();
    let root = parse_powl_model_string(s, &mut arena).expect("CG parse");

    for acts in [vec!["a"], vec!["b"]] {
        let t = trace_of("c", &acts);
        let f = replay_fitness(&arena, root, &t);
        assert!(
            f >= 0.999,
            "parsed CG must perfectly accept {:?}, got {}",
            acts,
            f
        );
    }
}
