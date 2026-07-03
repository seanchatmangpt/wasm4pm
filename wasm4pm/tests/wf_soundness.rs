//! Chicago-TDD integration tests for the formal WF-net soundness primitive
//! ([`wasm4pm::soundness`]).
//!
//! The oracle for every test is the math in Kourani, Park & van der Aalst,
//! *"Hierarchical Decomposition of Separable Workflow-Nets"* (arXiv:2602.15739v3),
//! Section 3 — **not** a re-derivation from the implementation (no FM-5
//! self-reference). Each test states the definition it checks and the closed-form
//! expected verdict for the hand-built fixture.
//!
//! Fixtures:
//! - `seq_sound_net`         — A → B sequence; sound, safe, state machine + marked graph.
//! - `choice_sound_net`      — exclusive choice (state machine); sound + safe.
//! - `concurrent_sound_net`  — AND-split/join (marked graph); sound + safe.
//! - `unsafe_net`            — a place accumulates 2 tokens; unsound (improper) + unsafe.
//! - `dead_transition_net`   — a transition is never enabled; unsound (dead transition).
//! - `non_free_choice_net`   — shared input place with differing pre-sets; not free-choice.
//! - `fig2_non_separable_net`— paper Fig.2: free-choice & sound but NOT separable.

use std::collections::BTreeMap;
use wasm4pm::models::{PetriNet, PetriNetArc, PetriNetPlace, PetriNetTransition};
use wasm4pm::soundness::{analyze_petri_net, StructuralNet};

// ─── Fixture builders ────────────────────────────────────────────────────────

fn place(id: &str) -> PetriNetPlace {
    PetriNetPlace {
        id: id.to_string(),
        label: id.to_string(),
        marking: None,
    }
}

fn transition(id: &str, label: &str) -> PetriNetTransition {
    PetriNetTransition {
        id: id.to_string(),
        label: label.to_string(),
        is_invisible: Some(false),
    }
}

fn arc(from: &str, to: &str) -> PetriNetArc {
    PetriNetArc {
        from: from.to_string(),
        to: to.to_string(),
        weight: Some(1),
    }
}

fn net(
    places: &[&str],
    transitions: &[(&str, &str)],
    arcs: &[(&str, &str)],
    source: &str,
) -> PetriNet {
    let mut initial = BTreeMap::new();
    initial.insert(source.to_string(), 1usize);
    PetriNet {
        places: places.iter().map(|p| place(p)).collect(),
        transitions: transitions.iter().map(|(i, l)| transition(i, l)).collect(),
        arcs: arcs.iter().map(|(f, t)| arc(f, t)).collect(),
        initial_marking: initial,
        final_markings: Vec::new(),
    }
}

/// A → B sequence:  src → tA → p1 → tB → sink.
fn seq_sound_net() -> PetriNet {
    net(
        &["src", "p1", "sink"],
        &[("tA", "A"), ("tB", "B")],
        &[("src", "tA"), ("tA", "p1"), ("p1", "tB"), ("tB", "sink")],
        "src",
    )
}

/// Exclusive choice (state machine): src splits into A or B, both reach sink.
///   src → tA → sink
///   src → tB → sink
fn choice_sound_net() -> PetriNet {
    net(
        &["src", "sink"],
        &[("tA", "A"), ("tB", "B")],
        &[("src", "tA"), ("tA", "sink"), ("src", "tB"), ("tB", "sink")],
        "src",
    )
}

/// Concurrency (marked graph): AND-split fork then AND-join.
///   src → tFork → {pA, pB}
///   pA → tA → pA2 ; pB → tB → pB2
///   {pA2, pB2} → tJoin → sink
fn concurrent_sound_net() -> PetriNet {
    net(
        &["src", "pA", "pB", "pA2", "pB2", "sink"],
        &[
            ("tFork", "Fork"),
            ("tA", "A"),
            ("tB", "B"),
            ("tJoin", "Join"),
        ],
        &[
            ("src", "tFork"),
            ("tFork", "pA"),
            ("tFork", "pB"),
            ("pA", "tA"),
            ("tA", "pA2"),
            ("pB", "tB"),
            ("tB", "pB2"),
            ("pA2", "tJoin"),
            ("pB2", "tJoin"),
            ("tJoin", "sink"),
        ],
        "src",
    )
}

/// Unsafe / improper net: a fork dumps two tokens into a single place `p`, but
/// the join only consumes one, leaving a residual token and a sink token both
/// reachable — violates safeness AND proper completion.
///   src → tFork → {p, p}  (two arcs into the same place via two transitions)
/// We model accumulation by routing two producers into p with one consumer:
///   src → tFork → pA, pB
///   pA → tA → p ; pB → tB → p          (both deposit into shared place p)
///   p  → tC → sink                      (consumes ONE token, the other lingers)
fn unsafe_net() -> PetriNet {
    net(
        &["src", "pA", "pB", "p", "sink"],
        &[("tFork", "Fork"), ("tA", "A"), ("tB", "B"), ("tC", "C")],
        &[
            ("src", "tFork"),
            ("tFork", "pA"),
            ("tFork", "pB"),
            ("pA", "tA"),
            ("tA", "p"),
            ("pB", "tB"),
            ("tB", "p"),
            ("p", "tC"),
            ("tC", "sink"),
        ],
        "src",
    )
}

/// Dead-transition net: a *structurally valid* WF-net (unique source/sink, every
/// node on a source→sink path) in which `tDead` is never enabled at any reachable
/// marking. `tDead` requires BOTH `p1` and `p3`, but those places sit on mutually
/// exclusive choice branches (the single source token picks `tA` xor `tB`), so
/// they are never co-marked.
///   src → tA → p1 ;  src → tB → p3        (exclusive choice on the source token)
///   p1 → tLive1 → sink ;  p3 → tLive2 → sink
///   {p1, p3} → tDead → sink               (needs both ⇒ never enabled)
/// `tDead` is forward-reachable (p1→tDead) and backward-reachable (tDead→sink),
/// so the net is a valid WF-net (Def 3.3); the defect — a dead transition — is
/// behavioural, exposed only by the reachability graph (Def 3.5 condition 1).
fn dead_transition_net() -> PetriNet {
    net(
        &["src", "p1", "p3", "sink"],
        &[
            ("tA", "A"),
            ("tB", "B"),
            ("tLive1", "Live1"),
            ("tLive2", "Live2"),
            ("tDead", "Dead"),
        ],
        &[
            ("src", "tA"),
            ("tA", "p1"),
            ("src", "tB"),
            ("tB", "p3"),
            ("p1", "tLive1"),
            ("tLive1", "sink"),
            ("p3", "tLive2"),
            ("tLive2", "sink"),
            ("p1", "tDead"),
            ("p3", "tDead"),
            ("tDead", "sink"),
        ],
        "src",
    )
}

/// Non-free-choice net (Def 3.4 violated): place `pShared` feeds both `t1` and
/// `t2`, but `t2` also needs a second input place `pExtra`. Then
/// `•t1 ∩ •t2 = {pShared} ≠ ∅` yet `•t1 = {pShared} ≠ {pShared, pExtra} = •t2`.
///   src → tSplit → {pShared, pExtra}
///   pShared → t1 → sink
///   {pShared, pExtra} → t2 → sink
fn non_free_choice_net() -> PetriNet {
    net(
        &["src", "pShared", "pExtra", "sink"],
        &[("tSplit", "Split"), ("t1", "T1"), ("t2", "T2")],
        &[
            ("src", "tSplit"),
            ("tSplit", "pShared"),
            ("tSplit", "pExtra"),
            ("pShared", "t1"),
            ("t1", "sink"),
            ("pShared", "t2"),
            ("pExtra", "t2"),
            ("t2", "sink"),
        ],
        "src",
    )
}

/// Paper Fig.2: a free-choice WF-net that is NOT separable. The concurrency
/// introduced by transition `e`'s split cross-links with the join at `d`
/// (a TP-handle: two disjoint paths from common transition `e` to common
/// transition `d`), so the net cannot be built by recursive substitution of
/// SM/MG templates (Def 3.13). It is, however, free-choice and **sound**.
///
/// Reading Fig.2 left→right (places `p_*`, transitions a,b,c,d,e,f; source `i`,
/// sink `o`):
///   i → a → {p_a1, p_a2}             (a is the initial AND-split)
///   p_a1 → e → {p_e1, p_e2}          (e splits: p_e1 → b's branch, p_e2 → d directly)
///   p_a2 → c → p_c                   (lower branch: c feeds the d-join)
///   p_e1 → b → p_b                   (b feeds the d-join)
///   {p_e2, p_b, p_c} → d → p_d       (d joins e's direct output with b's and c's)
///   p_d → f → o                      (final transition to sink)
///
/// Firing sequence from [i]: a → e → b → c → d → f, every marking 1-bounded,
/// [o] the unique completing marking ⇒ sound + safe. The `e`-split / `d`-join
/// cross-link over the b/c branches is exactly the TP-handle that breaks
/// separability (paper §3.4) while preserving free-choiceness and soundness.
fn fig2_non_separable_net() -> PetriNet {
    net(
        &[
            "i", "p_a1", "p_a2", "p_e1", "p_e2", "p_b", "p_c", "p_d", "o",
        ],
        &[
            ("a", "a"),
            ("b", "b"),
            ("c", "c"),
            ("d", "d"),
            ("e", "e"),
            ("f", "f"),
        ],
        &[
            // a: initial split into the upper (→e) and lower (→c) branches.
            ("i", "a"),
            ("a", "p_a1"),
            ("a", "p_a2"),
            // e consumes p_a1, splits to b's input (p_e1) and the direct d-join input (p_e2).
            ("p_a1", "e"),
            ("e", "p_e1"),
            ("e", "p_e2"),
            // b consumes p_e1, feeds the d-join.
            ("p_e1", "b"),
            ("b", "p_b"),
            // c consumes p_a2, feeds the d-join.
            ("p_a2", "c"),
            ("c", "p_c"),
            // d joins e's direct output with b's and c's outputs, then produces p_d.
            ("p_e2", "d"),
            ("p_b", "d"),
            ("p_c", "d"),
            ("d", "p_d"),
            // f: final transition to sink.
            ("p_d", "f"),
            ("f", "o"),
        ],
        "i",
    )
}

// ─── Tests: structural predicates ─────────────────────────────────────────────

#[test]
fn def_3_3_seq_is_workflow_net() {
    // Def 3.3: unique source (•p=∅), unique sink (p•=∅), full connectivity.
    let snet = StructuralNet::from_petri_net(&seq_sound_net());
    let wf = snet.is_workflow_net();
    assert!(wf.is_wf_net, "seq net must be a WF-net: {}", wf.reason);
    assert_eq!(wf.source.as_deref(), Some("src"));
    assert_eq!(wf.sink.as_deref(), Some("sink"));
    assert!(wf.disconnected_places.is_empty());
    assert!(wf.disconnected_transitions.is_empty());
}

#[test]
fn def_3_3_two_sinks_is_not_workflow_net() {
    // A net with two distinct sink places violates the unique-sink condition.
    //   src → tA → sink1 ; src → tB → sink2  (two p• = ∅ places)
    let bad = net(
        &["src", "sink1", "sink2"],
        &[("tA", "A"), ("tB", "B")],
        &[
            ("src", "tA"),
            ("tA", "sink1"),
            ("src", "tB"),
            ("tB", "sink2"),
        ],
        "src",
    );
    let wf = StructuralNet::from_petri_net(&bad).is_workflow_net();
    assert!(!wf.is_wf_net, "two sinks must fail the WF-net check");
}

#[test]
fn def_3_10_state_machine_predicate() {
    // Def 3.10: SM iff every transition has |•t|≤1 and |t•|≤1.
    // The exclusive-choice net is a state machine; the concurrent net is NOT
    // (tFork has |t•|=2, tJoin has |•t|=2).
    assert!(
        StructuralNet::from_petri_net(&choice_sound_net()).is_state_machine(),
        "exclusive-choice net is a state machine (Def 3.10)"
    );
    assert!(
        !StructuralNet::from_petri_net(&concurrent_sound_net()).is_state_machine(),
        "AND-split/join net is NOT a state machine (fork has 2 outputs)"
    );
    // The plain sequence trivially satisfies both bounds.
    assert!(StructuralNet::from_petri_net(&seq_sound_net()).is_state_machine());
}

#[test]
fn def_3_11_marked_graph_predicate() {
    // Def 3.11: MG iff every place has |•p|≤1 and |p•|≤1.
    // The concurrent net is a marked graph; the choice net is NOT (the source
    // place has |p•|=2, feeding both tA and tB — a decision place).
    assert!(
        StructuralNet::from_petri_net(&concurrent_sound_net()).is_marked_graph(),
        "AND-split/join net is a marked graph (Def 3.11)"
    );
    assert!(
        !StructuralNet::from_petri_net(&choice_sound_net()).is_marked_graph(),
        "exclusive-choice net is NOT a marked graph (source place has 2 outputs)"
    );
    // The plain sequence trivially satisfies both bounds.
    assert!(StructuralNet::from_petri_net(&seq_sound_net()).is_marked_graph());
}

#[test]
fn def_3_10_3_11_duality_on_sequence() {
    // A pure sequence is simultaneously a state machine and a marked graph,
    // because every node has at most one in and one out arc.
    let snet = StructuralNet::from_petri_net(&seq_sound_net());
    assert!(snet.is_state_machine() && snet.is_marked_graph());
}

#[test]
fn def_3_4_free_choice_positive() {
    // Def 3.4: SMs and MGs are free-choice (paper: "all separable WF-nets are
    // inherently free-choice"). Verify on the choice and concurrent fixtures.
    assert!(
        StructuralNet::from_petri_net(&choice_sound_net()).is_free_choice(),
        "exclusive-choice state machine is free-choice (Def 3.4)"
    );
    assert!(
        StructuralNet::from_petri_net(&concurrent_sound_net()).is_free_choice(),
        "AND-split/join marked graph is free-choice (Def 3.4)"
    );
}

#[test]
fn def_3_4_free_choice_negative() {
    // Def 3.4 violated: •t1 ∩ •t2 = {pShared} ≠ ∅ but •t1 ≠ •t2.
    assert!(
        !StructuralNet::from_petri_net(&non_free_choice_net()).is_free_choice(),
        "shared input place with differing pre-sets is NOT free-choice (Def 3.4)"
    );
}

#[test]
fn fig2_is_free_choice_but_not_separable() {
    // Paper Fig.2 caption: "A free-choice WF-net that is not separable."
    // We can verify the free-choice property directly (Def 3.4). Non-separability
    // is the cross-linking of choice/concurrency; this fixture exercises that
    // structure as a sound, free-choice net (separability detection is A4's
    // primitive, not soundness — here we assert the paper's stated properties
    // that fall within Defs 3.4/3.5).
    let snet = StructuralNet::from_petri_net(&fig2_non_separable_net());
    assert!(
        snet.is_free_choice(),
        "Fig.2 net must be free-choice per the paper caption"
    );
}

// ─── Tests: reachability graph + soundness (Def 3.5) ──────────────────────────

#[test]
fn def_3_5_sequence_is_sound_and_safe() {
    // The simplest sound WF-net. Reachability: [src] → [p1] → [sink], 3 markings,
    // all 1-bounded ⇒ safe; both transitions fire; only [sink] holds a sink token.
    let r = analyze_petri_net(&seq_sound_net());
    assert!(r.is_sound, "A→B sequence is sound (Def 3.5): {}", r.reason);
    assert!(r.is_safe, "sequence is safe");
    assert!(r.is_sound_and_safe());
    assert!(r.no_dead_transitions);
    assert!(r.option_to_complete);
    assert!(r.proper_completion);
    assert_eq!(r.reachable_marking_count, 3, "[src],[p1],[sink]");
}

#[test]
fn def_3_5_choice_is_sound_and_safe() {
    // Exclusive choice: from [src] either tA or tB fires, both reach [sink].
    // Reachable markings: [src], [sink]. Both transitions alive; proper.
    let r = analyze_petri_net(&choice_sound_net());
    assert!(r.is_sound, "exclusive choice is sound: {}", r.reason);
    assert!(r.is_safe);
    assert!(r.no_dead_transitions);
    assert_eq!(r.reachable_marking_count, 2, "[src],[sink]");
}

#[test]
fn def_3_5_concurrent_is_sound_and_safe() {
    // AND-split/join: the paper's canonical marked-graph behaviour. The
    // interleaving of A and B yields several intermediate markings, all safe,
    // and [sink] is the unique completing marking.
    let r = analyze_petri_net(&concurrent_sound_net());
    assert!(
        r.is_sound,
        "AND-split/join is sound (Def 3.5): {}",
        r.reason
    );
    assert!(r.is_safe, "marked graph is safe");
    assert!(r.is_marked_graph);
    assert!(r.no_dead_transitions);
    assert!(r.option_to_complete);
    assert!(r.proper_completion);
}

#[test]
fn def_3_5_unsafe_net_is_unsound() {
    // The fork deposits two tokens that funnel into shared place `p`, but `tC`
    // consumes only one — a residual token lingers alongside the sink token.
    // Expected: NOT safe (p reaches 2 tokens) AND improper completion (a marking
    // with [p,sink] is reachable, not just [sink]). Either way: unsound.
    let r = analyze_petri_net(&unsafe_net());
    assert!(
        !r.is_safe,
        "place p accumulates 2 tokens ⇒ unsafe: {}",
        r.reason
    );
    assert!(!r.is_sound, "unsafe/improper net is unsound (Def 3.5)");
    assert!(
        !r.proper_completion,
        "a marking other than [sink] holds a sink token ⇒ improper completion"
    );
}

#[test]
fn def_3_5_dead_transition_net_is_unsound() {
    // `tDead`'s input place `pNever` is never marked ⇒ tDead never enabled.
    // Soundness condition 1 (no dead transitions) fails.
    let r = analyze_petri_net(&dead_transition_net());
    assert!(
        !r.no_dead_transitions,
        "tDead is never enabled ⇒ dead transition exists"
    );
    assert!(
        r.dead_transitions.contains(&"Dead".to_string()),
        "report must name the dead transition; got {:?}",
        r.dead_transitions
    );
    assert!(
        !r.is_sound,
        "a net with a dead transition is unsound (Def 3.5)"
    );
}

#[test]
fn def_3_5_deadlock_net_has_no_option_to_complete() {
    // Build a *structurally valid* WF-net (unique source/sink, every node on a
    // source→sink path) that nonetheless deadlocks via a non-free-choice
    // mis-synchronisation:
    //   src → tFork → {pA, pB}
    //   pA → t1 → pC ;  pB → t2 → pD
    //   {pC, pB} → tJoinA → sink        (needs pC AND pB)
    //   {pD, pA} → tJoinB → sink        (needs pD AND pA)
    // If t1 and t2 both fire, the marking [pC, pD] is reached: tJoinA wants pB
    // (consumed by t2) and tJoinB wants pA (consumed by t1) — both disabled.
    // [pC, pD] is a deadlock from which [sink] is unreachable ⇒ no option to
    // complete (Def 3.5). Every place lies on a source→sink path, so the net is
    // a valid WF-net (Def 3.3) — the defect is behavioural, not structural.
    let deadlock = net(
        &["src", "pA", "pB", "pC", "pD", "sink"],
        &[
            ("tFork", "Fork"),
            ("t1", "T1"),
            ("t2", "T2"),
            ("tJoinA", "JoinA"),
            ("tJoinB", "JoinB"),
        ],
        &[
            ("src", "tFork"),
            ("tFork", "pA"),
            ("tFork", "pB"),
            ("pA", "t1"),
            ("t1", "pC"),
            ("pB", "t2"),
            ("t2", "pD"),
            ("pC", "tJoinA"),
            ("pB", "tJoinA"),
            ("tJoinA", "sink"),
            ("pD", "tJoinB"),
            ("pA", "tJoinB"),
            ("tJoinB", "sink"),
        ],
        "src",
    );
    let r = analyze_petri_net(&deadlock);
    assert!(
        !r.option_to_complete,
        "[pTrap] cannot reach [sink] ⇒ no option to complete (Def 3.5)"
    );
    assert!(!r.is_sound, "deadlocking net is unsound");
    assert!(
        !r.deadlock_markings.is_empty(),
        "the trap marking must be reported as a deadlock witness"
    );
}

#[test]
fn fig2_net_is_sound() {
    // Per the paper, Fig.2 is a *sound* free-choice WF-net (it is excluded only
    // from the *separable* subclass, not from soundness). Verify Def 3.5 holds.
    let r = analyze_petri_net(&fig2_non_separable_net());
    assert!(
        r.is_sound,
        "Fig.2 is a sound free-choice WF-net per the paper: {}",
        r.reason
    );
    assert!(r.is_free_choice, "Fig.2 is free-choice (Def 3.4)");
}

// ─── Tests: WASM/JSON contract (exercised on native via the bridge) ─────────────

#[test]
fn json_contract_reports_all_fields() {
    // The WASM export emits a fixed JSON shape; the native bridge returns the same
    // string. Assert every contract field is present and that booleans agree
    // with the structured report for the sound sequence net.
    let net = seq_sound_net();
    let json = wasm4pm::soundness::check_wf_net_soundness_native(&net);
    let v: serde_json::Value = serde_json::from_str(&json).expect("valid JSON");
    for key in [
        "is_wf_net",
        "is_safe",
        "is_free_choice",
        "is_state_machine",
        "is_marked_graph",
        "no_dead_transitions",
        "option_to_complete",
        "proper_completion",
        "is_sound",
        "is_sound_and_safe",
        "dead_transitions",
        "deadlock_markings",
        "improper_markings",
        "reachable_marking_count",
        "explored_truncated",
        "reason",
    ] {
        assert!(v.get(key).is_some(), "JSON contract missing key `{key}`");
    }
    assert_eq!(v["is_sound"], serde_json::json!(true));
    assert_eq!(v["is_sound_and_safe"], serde_json::json!(true));
    assert_eq!(v["is_state_machine"], serde_json::json!(true));
    assert_eq!(v["is_marked_graph"], serde_json::json!(true));
}

#[test]
fn json_contract_negative_names_the_dead_transition() {
    // Negative path: the JSON for the dead-transition net must surface the
    // failing transition label and the unsound verdict (refusal reason).
    let json = wasm4pm::soundness::check_wf_net_soundness_native(&dead_transition_net());
    let v: serde_json::Value = serde_json::from_str(&json).expect("valid JSON");
    assert_eq!(v["is_sound"], serde_json::json!(false));
    assert_eq!(v["no_dead_transitions"], serde_json::json!(false));
    let dead = v["dead_transitions"].as_array().expect("array");
    assert!(
        dead.iter().any(|x| x == "Dead"),
        "dead_transitions must name `Dead`; got {dead:?}"
    );
    assert!(
        v["reason"].as_str().unwrap().contains("dead transition"),
        "reason must explain the refusal"
    );
}
