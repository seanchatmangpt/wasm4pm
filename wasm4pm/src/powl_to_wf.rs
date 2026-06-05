//! POWL 2.0 → WF-net / Petri net and POWL 2.0 → process tree (the *forward*
//! transformations) — closing audit gap **C1** and cyclic-choice-graph gap
//! **C6** of the finish-WIP reconciliation.
//!
//! [`crate::wf_to_powl`] implements the hard *inverse* (WF-net → POWL 2.0, the
//! Separable-WF-nets decomposition). This module implements the comparatively
//! direct *forward* synthesis, completing the `POWL ↔ WF-net` leg of the
//! primitive dependency DAG and providing the `POWL → process tree` projection
//! that the Process-World Foundry consumes.
//!
//! ## Grounding (oracle = the paper math, not the code — no FM-5)
//! Synthesis follows the POWL 2.0 semantics of Kourani, Park & van der Aalst,
//! *"Hierarchical Decomposition of Separable Workflow-Nets"* (arXiv:2602.15739v3),
//! Defs 3.6–3.9:
//! - a **partial order** `≺(ψ₁,…,ψₙ)` is realized as a **marked graph**: a single
//!   silent `init` AND-splits to all `≺`-minimal children; each non-minimal child
//!   is AND-joined from its cover-predecessors' completion places; a single silent
//!   `fin` AND-joins all `≺`-maximal children (Def 4.3 `order⁺`, run backwards).
//! - a **choice graph** `γ(ψ₁,…,ψₙ)` is realized as a **state machine**: one
//!   control place per node; entering a child consumes its control token, the
//!   child's completion place XOR-chooses one outgoing edge. **Cycles** (a back
//!   edge `j→i`) are realized as a structural loop in the net — this is C6.
//!
//! The **round-trip oracle** is closed-form and independent: for an acyclic
//! input, `wf_net_language(powl_to_wf_net(spec)) == powl_language(spec)` (Theorem
//! 1, §5). For cyclic choice graphs the WF-net language is infinite, so the
//! cyclic test instead asserts (a) `powl_language` enumerates loop traces and
//! (b) the synthesized net is a structurally valid WF-net containing the loop.
//!
//! ## Reachability (GAP-PMAX-005)
//! The pure functions [`powl_to_wf_net`] and [`powl_to_process_tree`] are the
//! Rust surface. The `#[wasm_bindgen]` export + `wpm` verb are wired in during
//! reconciliation (this file is intentionally not yet `mod`-declared, so it
//! cannot affect a concurrent build).

use crate::models::{PetriNet, PetriNetArc, PetriNetPlace, PetriNetTransition};
use crate::wf_to_powl::PowlSpec;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ===========================================================================
// Process-tree projection target (POWL 2.0 generalizes process trees, so the
// projection is partial: genuinely non-block-structured POWL is reported, not
// forced — the honest BLOCKED reason).
// ===========================================================================

/// A block-structured process tree, the target of [`powl_to_process_tree`].
/// `NonBlockStructured` is the lawful "this POWL has no equivalent process tree"
/// leaf — POWL 2.0 (partial orders + choice graphs incl. cycles) is strictly
/// more expressive than process trees, so the projection cannot always succeed.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "op", rename_all = "snake_case")]
pub enum ProcessTreeSpec {
    /// A leaf activity `a ∈ Σ`.
    Leaf { label: String },
    /// The silent leaf `τ`.
    Tau,
    /// `→(c₁,…,cₙ)`: sequential composition.
    Sequence { children: Vec<ProcessTreeSpec> },
    /// `×(c₁,…,cₙ)`: exclusive choice.
    Xor { children: Vec<ProcessTreeSpec> },
    /// `∧(c₁,…,cₙ)`: concurrent composition.
    Parallel { children: Vec<ProcessTreeSpec> },
    /// `↺(do, redo)`: structured loop (the `do`-part, then optionally `redo`
    /// followed by `do` again).
    Loop { children: Vec<ProcessTreeSpec> },
    /// POWL fragment with no block-structured tree equivalent (e.g. a genuine
    /// partial order that is neither total nor empty, or an unstructured choice
    /// graph). Carries the mathematical reason — this is a BLOCKED leaf, not a
    /// silent failure.
    NonBlockStructured { reason: String },
}

impl ProcessTreeSpec {
    /// Whether the projection is fully block-structured (no `NonBlockStructured`
    /// leaf anywhere).
    #[must_use]
    pub fn is_block_structured(&self) -> bool {
        match self {
            ProcessTreeSpec::NonBlockStructured { .. } => false,
            ProcessTreeSpec::Leaf { .. } | ProcessTreeSpec::Tau => true,
            ProcessTreeSpec::Sequence { children }
            | ProcessTreeSpec::Xor { children }
            | ProcessTreeSpec::Parallel { children }
            | ProcessTreeSpec::Loop { children } => {
                children.iter().all(ProcessTreeSpec::is_block_structured)
            }
        }
    }
}

// ===========================================================================
// Net builder: unique-id allocator over places / transitions / arcs.
// ===========================================================================

struct NetBuilder {
    places: Vec<PetriNetPlace>,
    transitions: Vec<PetriNetTransition>,
    arcs: Vec<PetriNetArc>,
    counter: usize,
}

impl NetBuilder {
    fn new() -> Self {
        NetBuilder {
            places: Vec::new(),
            transitions: Vec::new(),
            arcs: Vec::new(),
            counter: 0,
        }
    }
    fn fresh(&mut self, prefix: &str) -> String {
        let id = format!("{prefix}_{}", self.counter);
        self.counter += 1;
        id
    }
    /// Add a fresh place; returns its id.
    fn place(&mut self, label: &str) -> String {
        let id = self.fresh("p");
        self.places.push(PetriNetPlace {
            id: id.clone(),
            label: label.to_string(),
            marking: None,
        });
        id
    }
    /// Add a fresh silent (τ) transition; returns its id.
    fn tau(&mut self) -> String {
        let id = self.fresh("tau");
        self.transitions.push(PetriNetTransition {
            id: id.clone(),
            label: "tau".to_string(),
            is_invisible: Some(true),
        });
        id
    }
    /// Add a fresh labeled (visible) transition; returns its id.
    fn labeled(&mut self, label: &str) -> String {
        let id = self.fresh("t");
        self.transitions.push(PetriNetTransition {
            id: id.clone(),
            label: label.to_string(),
            is_invisible: Some(false),
        });
        id
    }
    fn arc(&mut self, from: &str, to: &str) {
        self.arcs.push(PetriNetArc {
            from: from.to_string(),
            to: to.to_string(),
            weight: Some(1),
        });
    }
}

// ===========================================================================
// Recursive POWL → fragment synthesis. Returns (entry_place, exit_place).
// ===========================================================================

/// Build the sub-net for `spec` into `b`, returning its single entry and single
/// exit *place* ids. Every fragment is a SESE (single-entry/single-exit) block,
/// so fragments compose cleanly under partial orders and choice graphs.
fn build(b: &mut NetBuilder, spec: &PowlSpec) -> (String, String) {
    match spec {
        PowlSpec::Transition { label } => {
            let e = b.place("t_in");
            let x = b.place("t_out");
            let t = b.labeled(label);
            b.arc(&e, &t);
            b.arc(&t, &x);
            (e, x)
        }
        PowlSpec::Silent => {
            let e = b.place("s_in");
            let x = b.place("s_out");
            let t = b.tau();
            b.arc(&e, &t);
            b.arc(&t, &x);
            (e, x)
        }
        PowlSpec::Irreducible { .. } => {
            // No lawful decomposition: emit a silent SESE placeholder so the
            // function stays total. Callers detect irreducibility on the spec
            // itself (`PowlSpec::has_irreducible`) before relying on language.
            let e = b.place("irr_in");
            let x = b.place("irr_out");
            let t = b.tau();
            b.arc(&e, &t);
            b.arc(&t, &x);
            (e, x)
        }
        PowlSpec::PartialOrder { children, order } => build_partial_order(b, children, order),
        PowlSpec::ChoiceGraph {
            children,
            edges,
            start,
            end,
        } => build_choice_graph(b, children, edges, *start, *end),
    }
}

/// Marked-graph realization of `≺(children)` (Def 3.8 / 4.3 run backwards).
fn build_partial_order(
    b: &mut NetBuilder,
    children: &[PowlSpec],
    order: &[(usize, usize)],
) -> (String, String) {
    let n = children.len();
    let subs: Vec<(String, String)> = children.iter().map(|c| build(b, c)).collect();

    // Transitively-closed order adjacency (the spec stores order⁺).
    let mut ord = vec![vec![false; n]; n];
    for &(i, j) in order {
        if i < n && j < n {
            ord[i][j] = true;
        }
    }
    let is_cover = |i: usize, j: usize| ord[i][j] && !(0..n).any(|k| ord[i][k] && ord[k][j]);
    let is_min = |i: usize| !(0..n).any(|j| ord[j][i]);
    let is_max = |i: usize| !(0..n).any(|j| ord[i][j]);

    let e = b.place("po_in");
    let x = b.place("po_out");
    let init = b.tau();
    b.arc(&e, &init);
    let fin = b.tau();
    b.arc(&fin, &x);

    // One completion place per cover edge (i → j): produced when i finishes,
    // consumed when j is allowed to begin (AND-join over all of j's preds).
    let mut pedge: HashMap<(usize, usize), String> = HashMap::new();
    for i in 0..n {
        for j in 0..n {
            if is_cover(i, j) {
                let pid = b.place("po_edge");
                pedge.insert((i, j), pid);
            }
        }
    }

    for i in 0..n {
        let (ei, xi) = (subs[i].0.clone(), subs[i].1.clone());
        // Entry: minimal children start at the AND-split `init`; others are
        // AND-joined from all cover-predecessor completion places.
        if is_min(i) {
            b.arc(&init, &ei);
        } else {
            let join = b.tau();
            for k in 0..n {
                if is_cover(k, i) {
                    b.arc(&pedge[&(k, i)], &join);
                }
            }
            b.arc(&join, &ei);
        }
        // Exit: maximal children drain into the AND-join `fin`; others fork
        // their completion token into a place for each cover-successor.
        if is_max(i) {
            b.arc(&xi, &fin);
        } else {
            let fork = b.tau();
            b.arc(&xi, &fork);
            for j in 0..n {
                if is_cover(i, j) {
                    b.arc(&fork, &pedge[&(i, j)]);
                }
            }
        }
    }

    (e, x)
}

/// State-machine realization of `γ(children)` (Def 3.6 / 4.8). Handles cycles
/// (C6): a back edge `j→i` simply adds a transition from j's completion to i's
/// control place, producing a structural loop.
fn build_choice_graph(
    b: &mut NetBuilder,
    children: &[PowlSpec],
    edges: &[(usize, usize)],
    start: usize,
    end: usize,
) -> (String, String) {
    let n = children.len();
    let subs: Vec<(String, String)> = children.iter().map(|c| build(b, c)).collect();

    // One control place per node index in the choice graph (children + start/end
    // + any other artificial index that appears).
    let max_node = edges
        .iter()
        .flat_map(|&(a, c)| [a, c])
        .max()
        .unwrap_or(end)
        .max(end)
        .max(start);
    let ctrl: Vec<String> = (0..=max_node).map(|_| b.place("ctrl")).collect();

    // Child nodes: control → enter → child-entry; child-exit → (per outgoing
    // edge) → next control place. Multiple outgoing edges = XOR choice.
    for i in 0..n {
        let (ei, xi) = (subs[i].0.clone(), subs[i].1.clone());
        let enter = b.tau();
        b.arc(&ctrl[i], &enter);
        b.arc(&enter, &ei);
        for &(a, c) in edges {
            if a == i {
                let tr = b.tau();
                b.arc(&xi, &tr);
                b.arc(&tr, &ctrl[c]);
            }
        }
    }
    // Artificial / non-child source nodes (e.g. `start`): control → control.
    for &(a, c) in edges {
        if a >= n {
            let tr = b.tau();
            b.arc(&ctrl[a], &tr);
            b.arc(&tr, &ctrl[c]);
        }
    }

    (ctrl[start].clone(), ctrl[end].clone())
}

// ===========================================================================
// Public: POWL 2.0 → WF-net / Petri net  (C1, forward)
// ===========================================================================

/// Synthesize a safe, sound WF-net (Def 3.3) from a POWL 2.0 model. The result
/// has a unique source (initially marked) and a unique sink (the single final
/// marking), wrapping the recursively-built SESE fragment in fresh silent
/// init/exit transitions so the boundary places satisfy the WF-net shape.
///
/// Language preservation (acyclic input): the only added transitions are silent,
/// so `wf_net_language(result)` equals `powl_language(spec)` (Theorem 1, §5).
#[must_use]
pub fn powl_to_wf_net(spec: &PowlSpec) -> PetriNet {
    let mut b = NetBuilder::new();
    let (entry, exit) = build(&mut b, spec);

    // Wrap with a unique source/sink so `•source = ∅` and `sink• = ∅`.
    let source = b.place("SOURCE");
    let sink = b.place("SINK");
    let ti = b.tau();
    b.arc(&source, &ti);
    b.arc(&ti, &entry);
    let tf = b.tau();
    b.arc(&exit, &tf);
    b.arc(&tf, &sink);

    let mut initial_marking = HashMap::new();
    initial_marking.insert(source.clone(), 1usize);
    let mut final_mark = HashMap::new();
    final_mark.insert(sink.clone(), 1usize);

    PetriNet {
        places: b.places,
        transitions: b.transitions,
        arcs: b.arcs,
        initial_marking,
        final_markings: vec![final_mark],
    }
}

// ===========================================================================
// Public: POWL 2.0 → process tree  (C1, projection)
// ===========================================================================

/// Project a POWL 2.0 model onto a block-structured process tree where one
/// exists; otherwise return a `NonBlockStructured` leaf with the reason.
///
/// - `Transition`/`Silent` → `Leaf`/`Tau`.
/// - `PartialOrder` with **empty** order → `Parallel`; with a **total** order →
///   `Sequence` (topologically ordered); otherwise non-block-structured.
/// - `ChoiceGraph` that is a pure fan-out/fan-in → `Xor`; a 2-node do/redo loop
///   → `Loop`; otherwise non-block-structured.
#[must_use]
pub fn powl_to_process_tree(spec: &PowlSpec) -> ProcessTreeSpec {
    match spec {
        PowlSpec::Transition { label } => ProcessTreeSpec::Leaf {
            label: label.clone(),
        },
        PowlSpec::Silent => ProcessTreeSpec::Tau,
        PowlSpec::Irreducible { transitions } => ProcessTreeSpec::NonBlockStructured {
            reason: format!(
                "irreducible (non-separable) POWL fragment over [{}] has no process-tree form",
                transitions.join(", ")
            ),
        },
        PowlSpec::PartialOrder { children, order } => partial_order_to_tree(children, order),
        PowlSpec::ChoiceGraph {
            children,
            edges,
            start,
            end,
        } => choice_graph_to_tree(children, edges, *start, *end),
    }
}

fn partial_order_to_tree(children: &[PowlSpec], order: &[(usize, usize)]) -> ProcessTreeSpec {
    let n = children.len();
    let kids: Vec<ProcessTreeSpec> = children.iter().map(powl_to_process_tree).collect();
    if kids.iter().any(|k| !k.is_block_structured()) {
        return ProcessTreeSpec::NonBlockStructured {
            reason: "a child of the partial order is not block-structured".to_string(),
        };
    }
    // order⁺ has n(n-1)/2 edges iff it is a strict total order; 0 iff empty.
    let total_edges = n * n.saturating_sub(1) / 2;
    let mut ord = vec![vec![false; n]; n];
    for &(i, j) in order {
        if i < n && j < n {
            ord[i][j] = true;
        }
    }
    let count = (0..n).flat_map(|i| (0..n).map(move |j| (i, j))).filter(|&(i, j)| ord[i][j]).count();
    if count == 0 {
        ProcessTreeSpec::Parallel { children: kids }
    } else if count == total_edges {
        // Topologically order by in-degree (a total order gives 0,1,2,…).
        let mut idx: Vec<usize> = (0..n).collect();
        let indeg: Vec<usize> = (0..n).map(|j| (0..n).filter(|&i| ord[i][j]).count()).collect();
        idx.sort_by_key(|&j| indeg[j]);
        let ordered = idx.into_iter().map(|i| kids[i].clone()).collect();
        ProcessTreeSpec::Sequence { children: ordered }
    } else {
        ProcessTreeSpec::NonBlockStructured {
            reason: "genuine partial order (neither empty=parallel nor total=sequence); \
                     POWL 2.0 partial orders generalize process-tree concurrency"
                .to_string(),
        }
    }
}

fn choice_graph_to_tree(
    children: &[PowlSpec],
    edges: &[(usize, usize)],
    start: usize,
    end: usize,
) -> ProcessTreeSpec {
    let n = children.len();
    let kids: Vec<ProcessTreeSpec> = children.iter().map(powl_to_process_tree).collect();
    if kids.iter().any(|k| !k.is_block_structured()) {
        return ProcessTreeSpec::NonBlockStructured {
            reason: "a child of the choice graph is not block-structured".to_string(),
        };
    }
    let eset: std::collections::BTreeSet<(usize, usize)> = edges.iter().copied().collect();

    // Pure XOR: start→i and i→end for every child, no inter-child edges.
    let pure_xor = eset.len() == 2 * n
        && (0..n).all(|i| eset.contains(&(start, i)) && eset.contains(&(i, end)))
        && !eset.iter().any(|&(a, c)| a < n && c < n);
    if pure_xor {
        return ProcessTreeSpec::Xor { children: kids };
    }

    // Do/redo loop: 2 children, start→0, 0→end, 0→1, 1→0.
    if n == 2
        && eset.contains(&(start, 0))
        && eset.contains(&(0, end))
        && eset.contains(&(0, 1))
        && eset.contains(&(1, 0))
        && eset.len() == 4
    {
        return ProcessTreeSpec::Loop {
            children: kids, // [do = child0, redo = child1]
        };
    }

    ProcessTreeSpec::NonBlockStructured {
        reason: "choice graph is neither a pure exclusive choice nor a do/redo loop; \
                 POWL 2.0 choice graphs generalize process-tree choice/loop"
            .to_string(),
    }
}

// ===========================================================================
// Chicago-TDD tests — oracle is the POWL/Petri math (paper), not the code.
// (Run during reconciliation, once this module is `mod`-declared.)
// ===========================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use crate::soundness::{analyze_petri_net, StructuralNet};
    use crate::wf_to_powl::{powl_language, wf_net_language};

    fn tr(l: &str) -> PowlSpec {
        PowlSpec::Transition { label: l.into() }
    }
    fn lang(seqs: &[&[&str]]) -> std::collections::BTreeSet<Vec<String>> {
        seqs.iter()
            .map(|s| s.iter().map(|x| x.to_string()).collect())
            .collect()
    }

    #[test]
    fn roundtrip_single_transition() {
        let spec = tr("A");
        let net = powl_to_wf_net(&spec);
        assert_eq!(wf_net_language(&net), Some(powl_language(&spec)));
        assert_eq!(wf_net_language(&net), Some(lang(&[&["A"]])));
    }

    #[test]
    fn roundtrip_sequence() {
        // ≺ = {(0,1)} ⇒ A then B.
        let spec = PowlSpec::PartialOrder {
            children: vec![tr("A"), tr("B")],
            order: vec![(0, 1)],
        };
        let net = powl_to_wf_net(&spec);
        assert!(StructuralNet::from_petri_net(&net).is_workflow_net().is_wf_net);
        assert_eq!(wf_net_language(&net), Some(powl_language(&spec)));
        assert_eq!(wf_net_language(&net), Some(lang(&[&["A", "B"]])));
    }

    #[test]
    fn roundtrip_parallel() {
        // empty order ⇒ A ∥ B ⇒ {AB, BA}.
        let spec = PowlSpec::PartialOrder {
            children: vec![tr("A"), tr("B")],
            order: vec![],
        };
        let net = powl_to_wf_net(&spec);
        assert!(StructuralNet::from_petri_net(&net).is_workflow_net().is_wf_net);
        assert_eq!(wf_net_language(&net), Some(powl_language(&spec)));
        assert_eq!(wf_net_language(&net), Some(lang(&[&["A", "B"], &["B", "A"]])));
    }

    #[test]
    fn roundtrip_xor_choice_graph() {
        // start=2, end=3; start→{0,1}, {0,1}→end ⇒ A ⊕ B ⇒ {A, B}.
        let spec = PowlSpec::ChoiceGraph {
            children: vec![tr("A"), tr("B")],
            edges: vec![(2, 0), (2, 1), (0, 3), (1, 3)],
            start: 2,
            end: 3,
        };
        let net = powl_to_wf_net(&spec);
        assert!(StructuralNet::from_petri_net(&net).is_workflow_net().is_wf_net);
        assert_eq!(wf_net_language(&net), Some(powl_language(&spec)));
        assert_eq!(wf_net_language(&net), Some(lang(&[&["A"], &["B"]])));
    }

    #[test]
    fn cyclic_choice_graph_c6() {
        // start=2, end=3; start→0, 0→end, 0→1 (redo), 1→0 (back edge = LOOP).
        let spec = PowlSpec::ChoiceGraph {
            children: vec![tr("A"), tr("B")],
            edges: vec![(2, 0), (0, 3), (0, 1), (1, 0)],
            start: 2,
            end: 3,
        };
        // (a) POWL language enumerates loop unrollings (bounded): A and A·B·A.
        let pl = powl_language(&spec);
        assert!(pl.contains(&vec!["A".to_string()]), "no-loop trace present");
        assert!(
            pl.contains(&vec!["A".to_string(), "B".to_string(), "A".to_string()]),
            "one-loop trace A·B·A present"
        );
        // (b) forward synthesis yields a structurally valid WF-net with a cycle.
        let net = powl_to_wf_net(&spec);
        assert!(
            StructuralNet::from_petri_net(&net).is_workflow_net().is_wf_net,
            "cyclic choice graph synthesizes a valid WF-net"
        );
    }

    #[test]
    fn process_tree_projection_cases() {
        // total order ⇒ Sequence
        assert!(matches!(
            powl_to_process_tree(&PowlSpec::PartialOrder {
                children: vec![tr("A"), tr("B")],
                order: vec![(0, 1)]
            }),
            ProcessTreeSpec::Sequence { .. }
        ));
        // empty order ⇒ Parallel
        assert!(matches!(
            powl_to_process_tree(&PowlSpec::PartialOrder {
                children: vec![tr("A"), tr("B")],
                order: vec![]
            }),
            ProcessTreeSpec::Parallel { .. }
        ));
        // pure fan-out/fan-in choice graph ⇒ Xor
        assert!(matches!(
            powl_to_process_tree(&PowlSpec::ChoiceGraph {
                children: vec![tr("A"), tr("B")],
                edges: vec![(2, 0), (2, 1), (0, 3), (1, 3)],
                start: 2,
                end: 3
            }),
            ProcessTreeSpec::Xor { .. }
        ));
        // genuine (non-total, non-empty) partial order ⇒ NonBlockStructured
        assert!(matches!(
            powl_to_process_tree(&PowlSpec::PartialOrder {
                children: vec![tr("A"), tr("B"), tr("C")],
                order: vec![(0, 1), (0, 2)]
            }),
            ProcessTreeSpec::NonBlockStructured { .. }
        ));
    }

    // -----------------------------------------------------------------------
    // Strengthening invariants (reconciliation hardening — oracle is the paper
    // math + crate::soundness, not powl_to_wf's own code).
    // -----------------------------------------------------------------------

    /// Invariant (Def 3.3 + Def 3.5): the *acyclic* forward synthesis must yield
    /// a net that is not merely a structural WF-net but **safe and sound** — the
    /// exact class the paper's translation targets ("safe and sound WF-nets",
    /// §4). This is the strong structural oracle the round-trip language check
    /// cannot see (a net could preserve language yet be unsafe / have dead τ's).
    #[test]
    fn forward_synthesis_is_sound_and_safe() {
        // Sequence A→B.
        let seq = PowlSpec::PartialOrder {
            children: vec![tr("A"), tr("B")],
            order: vec![(0, 1)],
        };
        // Parallel A∥B.
        let par = PowlSpec::PartialOrder {
            children: vec![tr("A"), tr("B")],
            order: vec![],
        };
        // XOR A⊕B.
        let xor = PowlSpec::ChoiceGraph {
            children: vec![tr("A"), tr("B")],
            edges: vec![(2, 0), (2, 1), (0, 3), (1, 3)],
            start: 2,
            end: 3,
        };
        for spec in [seq, par, xor] {
            let net = powl_to_wf_net(&spec);
            let report = analyze_petri_net(&net);
            assert!(
                report.is_sound_and_safe(),
                "acyclic forward synthesis of {} must be safe+sound; report: {}",
                spec.repr(),
                report.reason
            );
            // And language-preserving (Theorem 1).
            assert_eq!(wf_net_language(&net), Some(powl_language(&spec)));
        }
    }

    /// Invariant: a 3-element **total** order A≺B≺C realizes as the sequence
    /// `{A·B·C}` and projects to a `Sequence` tree. order⁺ over a total chain is
    /// transitively closed: (0,1),(0,2),(1,2).
    #[test]
    fn three_element_total_order() {
        let spec = PowlSpec::PartialOrder {
            children: vec![tr("A"), tr("B"), tr("C")],
            order: vec![(0, 1), (0, 2), (1, 2)],
        };
        let net = powl_to_wf_net(&spec);
        assert!(StructuralNet::from_petri_net(&net).is_workflow_net().is_wf_net);
        assert_eq!(wf_net_language(&net), Some(powl_language(&spec)));
        assert_eq!(wf_net_language(&net), Some(lang(&[&["A", "B", "C"]])));
        assert!(matches!(
            powl_to_process_tree(&spec),
            ProcessTreeSpec::Sequence { children } if children.len() == 3
        ));
    }

    /// Invariant: a 3-element **empty** order A∥B∥C realizes all 3! = 6
    /// interleavings and projects to a `Parallel` tree.
    #[test]
    fn three_element_parallel() {
        let spec = PowlSpec::PartialOrder {
            children: vec![tr("A"), tr("B"), tr("C")],
            order: vec![],
        };
        let net = powl_to_wf_net(&spec);
        assert_eq!(wf_net_language(&net), Some(powl_language(&spec)));
        let l = wf_net_language(&net).expect("net language defined");
        assert_eq!(l.len(), 6, "3 concurrent activities ⇒ 3! interleavings");
        assert_eq!(
            l,
            lang(&[
                &["A", "B", "C"],
                &["A", "C", "B"],
                &["B", "A", "C"],
                &["B", "C", "A"],
                &["C", "A", "B"],
                &["C", "B", "A"],
            ])
        );
        assert!(matches!(
            powl_to_process_tree(&spec),
            ProcessTreeSpec::Parallel { children } if children.len() == 3
        ));
    }

    /// Invariant: a 3-element **genuine** partial order (A≺B, A≺C; B,C
    /// unordered) is neither total nor empty, so its tree projection is the
    /// honest `NonBlockStructured` leaf carrying the mathematical reason — POWL
    /// 2.0 partial orders generalize process-tree concurrency (NOT a forced
    /// tree). The forward net is still a valid, language-preserving WF-net.
    #[test]
    fn three_element_genuine_partial_order() {
        let spec = PowlSpec::PartialOrder {
            children: vec![tr("A"), tr("B"), tr("C")],
            order: vec![(0, 1), (0, 2)],
        };
        // Net side: still a structurally valid, language-preserving WF-net
        // ({A·B·C, A·C·B}).
        let net = powl_to_wf_net(&spec);
        assert!(StructuralNet::from_petri_net(&net).is_workflow_net().is_wf_net);
        assert_eq!(wf_net_language(&net), Some(powl_language(&spec)));
        assert_eq!(
            wf_net_language(&net),
            Some(lang(&[&["A", "B", "C"], &["A", "C", "B"]]))
        );
        // Tree side: NonBlockStructured with a non-empty mathematical reason.
        match powl_to_process_tree(&spec) {
            ProcessTreeSpec::NonBlockStructured { reason } => {
                assert!(
                    reason.contains("partial order"),
                    "reason must name the partial-order generalization, got: {reason}"
                );
            }
            other => unreachable!("genuine partial order must NOT force a tree; got {other:?}"),
        }
    }

    /// Invariant (C6 + tree projection): a do/redo choice graph
    /// (start→0, 0→end, 0→1, 1→0) projects to a `↺(do, redo)` `Loop` tree with
    /// the children in [do, redo] order. The POWL language enumerates the
    /// bounded loop unrollings, proving the loop is real (not a flattened choice).
    #[test]
    fn do_redo_loop_to_loop_tree() {
        let spec = PowlSpec::ChoiceGraph {
            children: vec![tr("A"), tr("B")],
            edges: vec![(2, 0), (0, 3), (0, 1), (1, 0)],
            start: 2,
            end: 3,
        };
        match powl_to_process_tree(&spec) {
            ProcessTreeSpec::Loop { children } => {
                assert_eq!(children.len(), 2, "loop = (do, redo)");
                assert_eq!(
                    children[0],
                    ProcessTreeSpec::Leaf { label: "A".into() },
                    "do-part is child 0 (A)"
                );
                assert_eq!(
                    children[1],
                    ProcessTreeSpec::Leaf { label: "B".into() },
                    "redo-part is child 1 (B)"
                );
            }
            other => unreachable!("do/redo choice graph must project to Loop; got {other:?}"),
        }
        // Loop semantics show in the POWL language: A (no redo) and A·B·A (one redo).
        let pl = powl_language(&spec);
        assert!(pl.contains(&vec!["A".to_string()]));
        assert!(pl.contains(&vec!["A".to_string(), "B".to_string(), "A".to_string()]));
    }

    /// NEGATIVE / refusal invariant: an **irreducible** (non-separable) POWL
    /// fragment has no block-structured tree form, so the projection must REFUSE
    /// with `NonBlockStructured` and the irreducible transition labels in the
    /// reason — the honest BLOCKED leaf, never a fabricated tree. This is the
    /// projection's anti-FAKE-LIVE refusal path.
    #[test]
    fn irreducible_powl_refuses_tree_projection() {
        let spec = PowlSpec::Irreducible {
            transitions: vec!["X".into(), "Y".into()],
        };
        match powl_to_process_tree(&spec) {
            ProcessTreeSpec::NonBlockStructured { reason } => {
                assert!(reason.contains("irreducible"), "reason names irreducibility: {reason}");
                assert!(reason.contains('X') && reason.contains('Y'), "reason carries the labels: {reason}");
            }
            other => unreachable!("irreducible POWL must refuse, got {other:?}"),
        }
        assert!(
            !powl_to_process_tree(&spec).is_block_structured(),
            "irreducible projection is not block-structured"
        );
        // The spec is detectably irreducible at the source level (callers gate on
        // this before trusting any synthesized language).
        assert!(spec.has_irreducible());
    }

    /// Invariant: irreducibility propagates through nesting — a partial order
    /// containing an irreducible child cannot be projected to a tree (the child's
    /// non-block-structure poisons the parent), proving the projection does not
    /// silently drop unconvertible sub-models.
    #[test]
    fn nested_irreducible_poisons_partial_order_tree() {
        let spec = PowlSpec::PartialOrder {
            children: vec![
                tr("A"),
                PowlSpec::Irreducible {
                    transitions: vec!["Z".into()],
                },
            ],
            order: vec![(0, 1)],
        };
        assert!(spec.has_irreducible());
        assert!(matches!(
            powl_to_process_tree(&spec),
            ProcessTreeSpec::NonBlockStructured { .. }
        ));
    }
}
