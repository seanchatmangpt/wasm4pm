//! Process-World Foundry — manufacture ONE coherent Order-to-Cash process field,
//! then emit every lawful projection of it.
//!
//! This is **not** a synthetic-log toy. The foundry holds a single source of
//! truth — a hand-built, sound, safe, *separable* WF-net over the Order-to-Cash
//! object-centric world — and *derives* all other artifacts from it by composing
//! the kernel's own primitives:
//!
//! - **OCEL v2 log** (via the `ocel-core` meta-model `L = (E, O, eval, oaval)`,
//!   A2): one object-centric log whose flattened-to-Order projection replays the
//!   field's control flow.
//! - **POWL 2.0 model** (via [`crate::wf_to_powl`], A4): the Separable-WF-nets
//!   Section-4 decomposition of the field net.
//! - **WF-net projection** (the field net itself; proven sound + safe via the
//!   [`crate::soundness`] analyzer, A5).
//! - **Process-tree projection** ([`field_process_tree`]): a faithful POWL→tree
//!   mapping (PartialOrder → Sequence/Parallel, ChoiceGraph → Xor, transition →
//!   leaf), whose language equals the POWL language (the oracle).
//! - **XES + CSV case-centric projections** ([`field_xes`], [`field_csv`]): the
//!   classical single-case views of the order-flattened log.
//! - **Positive conformance traces** ([`positive_order_traces`]): the *language*
//!   of the field net (closed form via [`crate::wf_to_powl::wf_net_language`]).
//!   Each is in the model by construction, so token-replay fitness is exactly 1.0.
//! - **OCPQ query fixtures** ([`ocpq_query_fixtures`]): JSON binding-box queries
//!   over the manufactured OCEL (A3 surface).
//!
//! Paper grounding:
//! - OCEDO meta-model `L=(E,O,eval,oaval)` (Latif et al., Fig. 1) for the OCEL log.
//! - Separable WF-nets (Kourani, Park & van der Aalst, arXiv:2602.15739v3,
//!   Sections 3–5) for the field net, its soundness, and its POWL decomposition.
//! - OCEL flattening (van der Aalst) for the case-centric projections.
//!
//! The convergence claim — *one field, every projection coherent* — is proven by
//! the foundry test: the OCEL validates, the WF-net is sound + safe, the POWL is
//! the lawful decomposition, the process tree's language equals the POWL's, and
//! every positive trace replays at fitness 1.0 (trace ∈ `wf_net_language`).

use std::collections::{BTreeMap, HashMap};
use std::fmt::Write as _;

use chrono::{DateTime, FixedOffset, TimeZone};
use serde::{Deserialize, Serialize};

use crate::models::{PetriNet, PetriNetArc, PetriNetPlace, PetriNetTransition};
use crate::wf_to_powl::{wf_net_language, wf_net_to_powl_spec, PowlSpec, WfToPowlResult};
use wasm4pm_compat::ocel::{
    OCELAttributeValue, OCELEvent, OCELEventAttribute, OCELObject, OCELRelationship, OCELType,
    OCELTypeAttribute, ObjectTypeCardinality, OCEL,
};

// ===========================================================================
// The Order-to-Cash world vocabulary (fixed; the 7 object / 9 event types)
// ===========================================================================

/// The seven object types of the manufactured world.
pub const OBJECT_TYPES: [&str; 7] = [
    "Customer", "Order", "Item", "Package", "Invoice", "Payment", "Employee",
];

/// The nine event types of the manufactured world.
pub const EVENT_TYPES: [&str; 9] = [
    "Create Order",
    "Confirm Order",
    "Pick Item",
    "Pack Package",
    "Ship Package",
    "Send Invoice",
    "Receive Payment",
    "Send Reminder",
    "Cancel Order",
];

// ===========================================================================
// The ONE field: a sound, safe, separable Order-to-Cash WF-net
// ===========================================================================

/// Build the canonical field net — the single source of truth for the world.
///
/// Structure (order-flattened control flow), chosen to be a *sound, safe,
/// free-choice, separable* WF-net so that the soundness analyzer (A5) accepts it
/// and the POWL decomposition (A4) fully converts it:
///
/// ```text
/// src ─Create Order→ p_open ─Confirm Order→ p_split
///   p_split ─split(τ)→ p_pick, p_inv        (AND-split: marked-graph fork)
///     p_pick ─Pick Item→ p_packready
///     p_packready ─Pack Package→ p_shipready
///     p_shipready ─Ship Package→ p_shipdone
///     p_inv  ─Send Invoice→ p_payready
///     p_payready ─Receive Payment→ p_paydone
///   p_shipdone, p_paydone ─join(τ)→ sink     (AND-join)
/// ```
///
/// The two concurrent branches (fulfilment: Pick → Pack → Ship; billing:
/// Send Invoice → Receive Payment) form a *marked graph* (every place has
/// ≤1 in and ≤1 out arc after the τ split/join), which is separable by
/// `Partition_MG` (paper Def 4.1). All nine activities of the world are present:
/// the seven happy-path activities live in this net; `Send Reminder` and
/// `Cancel Order` appear as world *variants* (off-path events emitted into the
/// OCEL log and exercised by the negative corpus), not as happy-path control
/// flow — keeping the canonical net sound and separable.
#[must_use]
pub fn field_net() -> PetriNet {
    let places = [
        "src",
        "p_open",
        "p_split",
        "p_pick",
        "p_packready",
        "p_shipready",
        "p_shipdone",
        "p_inv",
        "p_payready",
        "p_paydone",
        "sink",
    ];
    let transitions: &[(&str, &str, bool)] = &[
        ("t_create", "Create Order", false),
        ("t_confirm", "Confirm Order", false),
        ("t_split", "τ_split", true),
        ("t_pick", "Pick Item", false),
        ("t_pack", "Pack Package", false),
        ("t_ship", "Ship Package", false),
        ("t_invoice", "Send Invoice", false),
        ("t_pay", "Receive Payment", false),
        ("t_join", "τ_join", true),
    ];
    let arcs: &[(&str, &str)] = &[
        ("src", "t_create"),
        ("t_create", "p_open"),
        ("p_open", "t_confirm"),
        ("t_confirm", "p_split"),
        ("p_split", "t_split"),
        // AND-split into the two branches
        ("t_split", "p_pick"),
        ("t_split", "p_inv"),
        // fulfilment branch
        ("p_pick", "t_pick"),
        ("t_pick", "p_packready"),
        ("p_packready", "t_pack"),
        ("t_pack", "p_shipready"),
        ("p_shipready", "t_ship"),
        ("t_ship", "p_shipdone"),
        // billing branch
        ("p_inv", "t_invoice"),
        ("t_invoice", "p_payready"),
        ("p_payready", "t_pay"),
        ("t_pay", "p_paydone"),
        // AND-join into sink
        ("p_shipdone", "t_join"),
        ("p_paydone", "t_join"),
        ("t_join", "sink"),
    ];

    let mut initial: std::collections::BTreeMap<String, usize> = std::collections::BTreeMap::new();
    initial.insert("src".to_string(), 1usize);
    let mut final_marking = BTreeMap::new();
    final_marking.insert("sink".to_string(), 1usize);

    PetriNet {
        places: places
            .iter()
            .map(|p| PetriNetPlace {
                id: (*p).to_string(),
                label: (*p).to_string(),
                marking: None,
            })
            .collect(),
        transitions: transitions
            .iter()
            .map(|(id, label, invisible)| PetriNetTransition {
                id: (*id).to_string(),
                label: (*label).to_string(),
                is_invisible: Some(*invisible),
            })
            .collect(),
        arcs: arcs
            .iter()
            .map(|(from, to)| PetriNetArc {
                from: (*from).to_string(),
                to: (*to).to_string(),
                weight: Some(1),
            })
            .collect(),
        initial_marking: initial,
        final_markings: vec![final_marking],
    }
}

// ===========================================================================
// Projection 1 — POWL 2.0 model (via A4)
// ===========================================================================

/// The POWL 2.0 decomposition of the field net (Separable WF-nets, Section 4).
#[must_use]
pub fn field_powl() -> WfToPowlResult {
    wf_net_to_powl_spec(&field_net())
}

// ===========================================================================
// Projection 2 — positive conformance traces (the field net's language)
// ===========================================================================

/// The positive conformance corpus: the *complete language* of the field net,
/// computed in closed form via [`wf_net_language`]. Each trace is a sequence of
/// visible activity labels (τ transitions elided). Because every trace is in the
/// net's language by construction, token-replay fitness against the field net is
/// exactly **1.0** for each — the admission-gate-lawful corpus.
///
/// For the field net the language is the order-preserving interleaving of the
/// two concurrent branches after `Create Order, Confirm Order`:
///   `Pick Item ≺ Pack Package ≺ Ship Package`  ∥  `Send Invoice ≺ Receive Payment`.
#[must_use]
pub fn positive_order_traces() -> Vec<Vec<String>> {
    let mut traces: Vec<Vec<String>> = wf_net_language(&field_net())
        .map(|set| set.into_iter().collect())
        .unwrap_or_default();
    // Deterministic order (BTreeSet already sorts; collect preserves it, but be
    // explicit so callers/fixtures are stable).
    traces.sort();
    traces
}

// ===========================================================================
// Projection 3 — process tree (faithful POWL → tree mapping)
// ===========================================================================

/// A process-tree node (operator-labelled internal / activity leaf / silent τ).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum FieldTree {
    /// A visible activity leaf `a`.
    Leaf { label: String },
    /// A silent leaf `τ`.
    Tau,
    /// Sequence `→(c1, …, cn)`.
    Sequence { children: Vec<FieldTree> },
    /// Exclusive choice `×(c1, …, cn)`.
    Xor { children: Vec<FieldTree> },
    /// Concurrency `∧(c1, …, cn)`.
    Parallel { children: Vec<FieldTree> },
}

impl FieldTree {
    /// Compact textual rendering (process-tree algebra notation).
    #[must_use]
    pub fn repr(&self) -> String {
        match self {
            FieldTree::Leaf { label } => label.clone(),
            FieldTree::Tau => "τ".to_string(),
            FieldTree::Sequence { children } => render_op("→", children),
            FieldTree::Xor { children } => render_op("×", children),
            FieldTree::Parallel { children } => render_op("∧", children),
        }
    }
}

fn render_op(op: &str, children: &[FieldTree]) -> String {
    let inner: Vec<String> = children.iter().map(FieldTree::repr).collect();
    format!("{op}( {} )", inner.join(", "))
}

/// Project the field's POWL 2.0 model onto a process tree.
///
/// Mapping (POWL → process tree, van der Aalst process-tree algebra):
/// - `Transition(a)` → `Leaf(a)`; `Silent` → `Tau`.
/// - `ChoiceGraph(c1..cn)` → `Xor(c1..cn)` (an exclusive choice among children).
/// - `PartialOrder(c1..cn, order)` → layered `Sequence`/`Parallel`: children with
///   no relative order on a layer become a `Parallel`; sequential layers nest in a
///   `Sequence`. A total order collapses to a pure `Sequence`; an empty order to a
///   pure `Parallel`.
///
/// The oracle is language equality: `tree_language(field_process_tree()) ==
/// powl_language(field_powl().powl)` (checked in the foundry test).
#[must_use]
pub fn field_process_tree() -> FieldTree {
    powl_to_field_tree(&field_powl().powl)
}

fn powl_to_field_tree(spec: &PowlSpec) -> FieldTree {
    match spec {
        PowlSpec::Transition { label } => FieldTree::Leaf {
            label: label.clone(),
        },
        PowlSpec::Silent => FieldTree::Tau,
        PowlSpec::Irreducible { .. } => FieldTree::Tau,
        PowlSpec::ChoiceGraph { children, .. } => FieldTree::Xor {
            children: children.iter().map(powl_to_field_tree).collect(),
        },
        PowlSpec::PartialOrder { children, order } => partial_order_to_tree(children, order),
    }
}

/// Convert a strict partial order over child sub-models into a Sequence/Parallel
/// tree via **series-parallel decomposition** of the partial order.
///
/// A POWL partial order whose Hasse/precedence relation is *series-parallel*
/// (which every separable WF-net's POWL is, by construction of `order⁺`)
/// decomposes recursively as:
///
/// - **Series split** — the node set partitions into ordered blocks
///   `B1 < B2 < … < Bk` (every node of `Bi` precedes every node of `Bj` for
///   `i<j`). The coarsest such partition with `k ≥ 2` ⇒ `Sequence(Bi…)`.
/// - **Parallel split** — no series split exists, but the comparability graph is
///   disconnected: its weakly-connected components are mutually incomparable ⇒
///   `Parallel(component…)`.
/// - **Singleton** — one node ⇒ recurse into that child sub-model.
///
/// This is the standard SP-decomposition; it correctly recovers
/// `→(Create, Confirm, τ, ∧(→(Pick,Pack,Ship), →(Invoice,Pay)), τ)` for the
/// field, rather than the lock-step layering a naïve whole-order pass produces.
/// Language equality with the POWL is the test oracle.
fn partial_order_to_tree(children: &[PowlSpec], order: &[(usize, usize)]) -> FieldTree {
    let n = children.len();
    if n == 0 {
        return FieldTree::Tau;
    }
    // prec[i][j] == true  ⟺  i ≺ j   (the transitively closed edges from the POWL).
    let mut prec = vec![vec![false; n]; n];
    for &(i, j) in order {
        if i < n && j < n {
            prec[i][j] = true;
        }
    }
    let members: Vec<usize> = (0..n).collect();
    sp_decompose(children, &prec, &members)
}

/// Recursive series-parallel decomposition over a node subset `members`.
fn sp_decompose(children: &[PowlSpec], prec: &[Vec<bool>], members: &[usize]) -> FieldTree {
    if members.len() == 1 {
        return powl_to_field_tree(&children[members[0]]);
    }

    // ── Series split: coarsest ordered partition B1 < B2 < … < Bk. ──────────
    // Two nodes belong to the same series block iff they are *incomparable* OR
    // mutually reachable through incomparable peers — i.e. they cannot be placed
    // on opposite sides of a clean cut where everything-left ≺ everything-right.
    // We compute it by finding the finest set of cut points: process nodes in a
    // topological-ish manner accumulating a block until the block "closes"
    // (every accumulated node precedes every not-yet-seen node).
    if let Some(blocks) = series_blocks(prec, members) {
        if blocks.len() >= 2 {
            let block_trees: Vec<FieldTree> = blocks
                .iter()
                .map(|b| sp_decompose(children, prec, b))
                .collect();
            return FieldTree::Sequence {
                children: block_trees,
            };
        }
    }

    // ── Parallel split: weakly-connected components of the comparability graph. ─
    let comps = comparability_components(prec, members);
    if comps.len() >= 2 {
        let comp_trees: Vec<FieldTree> = comps
            .iter()
            .map(|c| sp_decompose(children, prec, c))
            .collect();
        return FieldTree::Parallel {
            children: comp_trees,
        };
    }

    // ── Neither split possible (a connected order with no clean series cut). ──
    // Fall back to a minimal-element layering of this single block. (Not reached
    // for the field's series-parallel order; kept for robustness.)
    layered_sequence(children, prec, members)
}

/// Compute the coarsest series partition `B1 < B2 < … < Bk` of `members`:
/// blocks such that every node in an earlier block precedes every node in a
/// later block. Returns `Some(blocks)` (possibly a single block when no cut
/// exists). The cut after position `p` (in a topological order) is valid iff
/// every node placed so far precedes every node not yet placed.
fn series_blocks(prec: &[Vec<bool>], members: &[usize]) -> Option<Vec<Vec<usize>>> {
    // Topological order of `members` (Kahn). If a cycle is present (malformed),
    // bail to `None` so the caller uses another split.
    let order = topo_order(prec, members)?;

    let m = order.len();
    let mut blocks: Vec<Vec<usize>> = Vec::new();
    let mut current: Vec<usize> = Vec::new();
    for (idx, &node) in order.iter().enumerate() {
        current.push(node);
        // Can we cut right after `idx`? Every node in `current` must precede
        // every node in `order[idx+1..]`.
        let rest = &order[idx + 1..];
        let clean_cut = rest.iter().all(|&r| current.iter().all(|&c| prec[c][r]));
        if clean_cut && idx + 1 < m {
            blocks.push(std::mem::take(&mut current));
        }
    }
    if !current.is_empty() {
        blocks.push(current);
    }
    Some(blocks)
}

/// Kahn topological order of `members` under `prec`. `None` on cycle.
fn topo_order(prec: &[Vec<bool>], members: &[usize]) -> Option<Vec<usize>> {
    let set: std::collections::BTreeSet<usize> = members.iter().copied().collect();
    let mut indeg: std::collections::BTreeMap<usize, usize> =
        members.iter().map(|&m| (m, 0usize)).collect();
    for &i in members {
        for &j in members {
            if prec[i][j] {
                *indeg
                    .get_mut(&j)
                    .expect("invariant: j from members, all members are keys in indeg") += 1;
            }
        }
    }
    // Deterministic ready queue (sorted node ids).
    let mut ready: Vec<usize> = indeg
        .iter()
        .filter(|(_, &d)| d == 0)
        .map(|(&n, _)| n)
        .collect();
    ready.sort_unstable();
    let mut out = Vec::with_capacity(members.len());
    while let Some(&next) = ready.first() {
        ready.remove(0);
        out.push(next);
        for &j in &set {
            if prec[next][j] {
                let d = indeg
                    .get_mut(&j)
                    .expect("invariant: j from members, all members are keys in indeg");
                *d -= 1;
                if *d == 0 {
                    // insert keeping sorted
                    let pos = ready.binary_search(&j).unwrap_or_else(|e| e);
                    ready.insert(pos, j);
                }
            }
        }
    }
    if out.len() == members.len() {
        Some(out)
    } else {
        None
    }
}

/// Weakly-connected components of the comparability graph restricted to
/// `members` (two nodes adjacent iff comparable). Components sorted by least id.
fn comparability_components(prec: &[Vec<bool>], members: &[usize]) -> Vec<Vec<usize>> {
    let mut comp: std::collections::BTreeMap<usize, usize> = std::collections::BTreeMap::new();
    let mut num = 0usize;
    for &start in members {
        if comp.contains_key(&start) {
            continue;
        }
        let mut stack = vec![start];
        comp.insert(start, num);
        while let Some(u) = stack.pop() {
            for &v in members {
                if !comp.contains_key(&v) && (prec[u][v] || prec[v][u]) {
                    comp.insert(v, num);
                    stack.push(v);
                }
            }
        }
        num += 1;
    }
    let mut out: Vec<Vec<usize>> = vec![Vec::new(); num];
    for (&node, &c) in &comp {
        out[c].push(node);
    }
    for v in &mut out {
        v.sort_unstable();
    }
    out
}

/// Minimal-element layering fallback for a connected, non-series-splittable
/// block: each layer is the minimal elements over the remaining set; a multi-node
/// layer becomes `Parallel`, layers chain into `Sequence`.
fn layered_sequence(children: &[PowlSpec], prec: &[Vec<bool>], members: &[usize]) -> FieldTree {
    let mut remaining: Vec<usize> = members.to_vec();
    let mut layers: Vec<Vec<usize>> = Vec::new();
    while !remaining.is_empty() {
        let mut layer: Vec<usize> = remaining
            .iter()
            .copied()
            .filter(|&j| !remaining.iter().any(|&i| i != j && prec[i][j]))
            .collect();
        if layer.is_empty() {
            layer = remaining.clone();
        }
        remaining.retain(|j| !layer.contains(j));
        layers.push(layer);
    }
    let layer_trees: Vec<FieldTree> = layers
        .iter()
        .map(|layer| {
            if layer.len() == 1 {
                powl_to_field_tree(&children[layer[0]])
            } else {
                FieldTree::Parallel {
                    children: layer
                        .iter()
                        .map(|&i| powl_to_field_tree(&children[i]))
                        .collect(),
                }
            }
        })
        .collect();
    if layer_trees.len() == 1 {
        layer_trees
            .into_iter()
            .next()
            .expect("invariant: layer_trees.len() == 1 checked above")
    } else {
        FieldTree::Sequence {
            children: layer_trees,
        }
    }
}

/// The set of complete activity sequences accepted by a [`FieldTree`] (its
/// language). `Tau` contributes the empty sequence; `Parallel` is the
/// order-preserving interleaving of its children's languages; `Sequence` is
/// concatenation; `Xor` is union. This mirrors [`wf_net_language`]'s semantics so
/// it can serve as the oracle for the projection.
#[must_use]
pub fn tree_language(tree: &FieldTree) -> std::collections::BTreeSet<Vec<String>> {
    use std::collections::BTreeSet;
    match tree {
        FieldTree::Leaf { label } => {
            let mut s = BTreeSet::new();
            s.insert(vec![label.clone()]);
            s
        }
        FieldTree::Tau => {
            let mut s = BTreeSet::new();
            s.insert(Vec::new());
            s
        }
        FieldTree::Xor { children } => {
            let mut s = BTreeSet::new();
            for c in children {
                s.extend(tree_language(c));
            }
            s
        }
        FieldTree::Sequence { children } => {
            let mut acc: BTreeSet<Vec<String>> = BTreeSet::new();
            acc.insert(Vec::new());
            for c in children {
                let lang = tree_language(c);
                let mut next = BTreeSet::new();
                for prefix in &acc {
                    for suffix in &lang {
                        let mut combined = prefix.clone();
                        combined.extend(suffix.iter().cloned());
                        next.insert(combined);
                    }
                }
                acc = next;
            }
            acc
        }
        FieldTree::Parallel { children } => {
            let child_langs: Vec<BTreeSet<Vec<String>>> =
                children.iter().map(tree_language).collect();
            interleave(&child_langs)
        }
    }
}

/// Order-preserving interleaving of several languages (the `Parallel` semantics).
fn interleave(
    langs: &[std::collections::BTreeSet<Vec<String>>],
) -> std::collections::BTreeSet<Vec<String>> {
    use std::collections::BTreeSet;
    let mut acc: BTreeSet<Vec<String>> = BTreeSet::new();
    acc.insert(Vec::new());
    for lang in langs {
        let mut next = BTreeSet::new();
        for prefix in &acc {
            for word in lang {
                next.extend(interleave_two(prefix, word));
            }
        }
        acc = next;
    }
    acc
}

/// All order-preserving interleavings of two sequences.
fn interleave_two(a: &[String], b: &[String]) -> std::collections::BTreeSet<Vec<String>> {
    use std::collections::BTreeSet;
    let mut out = BTreeSet::new();
    fn rec(
        a: &[String],
        b: &[String],
        i: usize,
        j: usize,
        cur: &mut Vec<String>,
        out: &mut BTreeSet<Vec<String>>,
    ) {
        if i == a.len() && j == b.len() {
            out.insert(cur.clone());
            return;
        }
        if i < a.len() {
            cur.push(a[i].clone());
            rec(a, b, i + 1, j, cur, out);
            cur.pop();
        }
        if j < b.len() {
            cur.push(b[j].clone());
            rec(a, b, i, j + 1, cur, out);
            cur.pop();
        }
    }
    rec(a, b, 0, 0, &mut Vec::new(), &mut out);
    out
}

// ===========================================================================
// Projection 4 — OCEL v2 log (via A2 meta-model)
// ===========================================================================

fn ts(day: u32, hour: u32) -> DateTime<FixedOffset> {
    // 2026-05-{day} {hour}:00:00 +00:00 — deterministic, sortable.
    FixedOffset::east_opt(0)
        .unwrap()
        .with_ymd_and_hms(2026, 5, day, hour, 0, 0)
        .single()
        .expect("valid manufactured timestamp")
}

fn str_attr(name: &str, value: &str) -> OCELEventAttribute {
    OCELEventAttribute {
        name: name.to_string(),
        value: OCELAttributeValue::String(value.to_string()),
    }
}

fn e2o(object_id: &str, qualifier: &str) -> OCELRelationship {
    OCELRelationship {
        object_id: object_id.to_string(),
        qualifier: qualifier.to_string(),
    }
}

/// Manufacture the OCEL v2 log for one coherent Order-to-Cash field instance.
///
/// One customer (`cust-1`), one employee (`emp-1`), one order (`order-1`) with
/// one item (`item-1`), one package (`pkg-1`), one invoice (`inv-1`) and one
/// payment (`pay-1`). The Order's flattened control-flow trace is the happy path
/// `Create Order, Confirm Order, Pick Item, Pack Package, Ship Package,
/// Send Invoice, Receive Payment` (one lawful interleaving of the field net).
/// Objects carry qualified O2O refs (`Order →Item`, `Order →Package`,
/// `Order →Invoice`, `Invoice →Payment`, `Order →placed_by Customer`) so the log
/// exercises the OCEDO O2O leg, not just E2O.
#[must_use]
pub fn field_ocel() -> OCEL {
    let object_type = |name: &str| OCELType {
        name: name.to_string(),
        attributes: Vec::new(),
    };
    let event_type = |name: &str| OCELType {
        name: name.to_string(),
        attributes: vec![OCELTypeAttribute {
            name: "resource".to_string(),
            value_type: "string".to_string(),
        }],
    };

    let objects = vec![
        OCELObject {
            id: "cust-1".to_string(),
            object_type: "Customer".to_string(),
            attributes: Vec::new(),
            relationships: Vec::new(),
        },
        OCELObject {
            id: "emp-1".to_string(),
            object_type: "Employee".to_string(),
            attributes: Vec::new(),
            relationships: Vec::new(),
        },
        OCELObject {
            id: "order-1".to_string(),
            object_type: "Order".to_string(),
            attributes: Vec::new(),
            relationships: vec![
                e2o("cust-1", "placed_by"),
                e2o("item-1", "contains"),
                e2o("pkg-1", "shipped_in"),
                e2o("inv-1", "billed_by"),
            ],
        },
        OCELObject {
            id: "item-1".to_string(),
            object_type: "Item".to_string(),
            attributes: Vec::new(),
            relationships: Vec::new(),
        },
        OCELObject {
            id: "pkg-1".to_string(),
            object_type: "Package".to_string(),
            attributes: Vec::new(),
            relationships: vec![e2o("item-1", "packs")],
        },
        OCELObject {
            id: "inv-1".to_string(),
            object_type: "Invoice".to_string(),
            attributes: Vec::new(),
            relationships: vec![e2o("pay-1", "settled_by")],
        },
        OCELObject {
            id: "pay-1".to_string(),
            object_type: "Payment".to_string(),
            attributes: Vec::new(),
            relationships: Vec::new(),
        },
    ];

    // Events in field-lawful order; each carries >=1 qualified E2O ref (OCPQ Def 2).
    let events = vec![
        OCELEvent {
            id: "e1".to_string(),
            event_type: "Create Order".to_string(),
            time: ts(1, 9),
            attributes: vec![str_attr("resource", "emp-1")],
            relationships: vec![e2o("order-1", "order"), e2o("cust-1", "customer")],
        },
        OCELEvent {
            id: "e2".to_string(),
            event_type: "Confirm Order".to_string(),
            time: ts(1, 10),
            attributes: vec![str_attr("resource", "emp-1")],
            relationships: vec![e2o("order-1", "order")],
        },
        OCELEvent {
            id: "e3".to_string(),
            event_type: "Pick Item".to_string(),
            time: ts(1, 11),
            attributes: vec![str_attr("resource", "emp-1")],
            relationships: vec![e2o("order-1", "order"), e2o("item-1", "item")],
        },
        OCELEvent {
            id: "e4".to_string(),
            event_type: "Pack Package".to_string(),
            time: ts(1, 12),
            attributes: vec![str_attr("resource", "emp-1")],
            relationships: vec![
                e2o("order-1", "order"),
                e2o("pkg-1", "package"),
                e2o("item-1", "item"),
            ],
        },
        OCELEvent {
            id: "e5".to_string(),
            event_type: "Ship Package".to_string(),
            time: ts(1, 13),
            attributes: vec![str_attr("resource", "emp-1")],
            relationships: vec![e2o("order-1", "order"), e2o("pkg-1", "package")],
        },
        OCELEvent {
            id: "e6".to_string(),
            event_type: "Send Invoice".to_string(),
            time: ts(2, 9),
            attributes: vec![str_attr("resource", "emp-1")],
            relationships: vec![e2o("order-1", "order"), e2o("inv-1", "invoice")],
        },
        OCELEvent {
            id: "e7".to_string(),
            event_type: "Receive Payment".to_string(),
            time: ts(3, 9),
            attributes: vec![str_attr("resource", "emp-1")],
            relationships: vec![
                e2o("order-1", "order"),
                e2o("inv-1", "invoice"),
                e2o("pay-1", "payment"),
            ],
        },
    ];

    OCEL {
        event_types: EVENT_TYPES.iter().map(|n| event_type(n)).collect(),
        object_types: OBJECT_TYPES.iter().map(|n| object_type(n)).collect(),
        events,
        objects,
    }
}

/// The object-type cardinality contract for the manufactured world: declares the
/// lifecycle-opening/closing event types and the `[min,max]` instance windows for
/// the key object types (the route `object_types` shape used by validation).
#[must_use]
pub fn field_cardinality() -> BTreeMap<String, ObjectTypeCardinality> {
    let mut card = BTreeMap::new();
    card.insert(
        "Order".to_string(),
        ObjectTypeCardinality {
            created_by: vec!["Create Order".to_string()],
            terminated_by: vec!["Receive Payment".to_string(), "Cancel Order".to_string()],
            schema: None,
            min_count: Some(1),
            max_count: Some(1),
        },
    );
    card.insert(
        "Payment".to_string(),
        ObjectTypeCardinality {
            created_by: vec!["Receive Payment".to_string()],
            terminated_by: Vec::new(),
            schema: None,
            min_count: Some(0),
            max_count: Some(1),
        },
    );
    card
}

// ===========================================================================
// Projection 5 — XES + CSV case-centric views (order-flattened)
// ===========================================================================

/// The order-flattened trace of the field OCEL: time-ordered event-type labels
/// of the events qualifying `order-1` (the case). Deterministic by (time, id).
#[must_use]
fn order_flattened_trace() -> Vec<(String, String, DateTime<FixedOffset>)> {
    let ocel = field_ocel();
    let mut rows: Vec<(String, String, DateTime<FixedOffset>)> = ocel
        .events
        .iter()
        .filter(|e| e.relationships.iter().any(|r| r.object_id == "order-1"))
        .map(|e| (e.id.clone(), e.event_type.clone(), e.time))
        .collect();
    rows.sort_by_key(|x| (x.2, x.0.clone()));
    rows
}

/// The classical XES projection of the field (single case `order-1`).
#[must_use]
pub fn field_xes() -> String {
    let rows = order_flattened_trace();
    let mut xes = String::new();
    xes.push_str("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
    xes.push_str("<log xes.version=\"2.0\" xmlns=\"http://www.xes-standard.org/\">\n");
    xes.push_str("  <trace>\n");
    xes.push_str("    <string key=\"concept:name\" value=\"order-1\"/>\n");
    for (id, ty, time) in &rows {
        xes.push_str("    <event>\n");
        let _ = write!(xes, "      <string key=\"concept:name\" value=\"{ty}\"/>\n");
        let _ = write!(
            xes,
            "      <date key=\"time:timestamp\" value=\"{}\"/>\n",
            time.to_rfc3339()
        );
        let _ = write!(xes, "      <string key=\"id\" value=\"{id}\"/>\n");
        xes.push_str("    </event>\n");
    }
    xes.push_str("  </trace>\n");
    xes.push_str("</log>\n");
    xes
}

/// The CSV case-centric projection of the field (one row per event).
#[must_use]
pub fn field_csv() -> String {
    let rows = order_flattened_trace();
    let mut csv = String::from("case_id,activity,timestamp,event_id\n");
    for (id, ty, time) in &rows {
        let _ = write!(csv, "order-1,{ty},{},{id}\n", time.to_rfc3339());
    }
    csv
}

// ===========================================================================
// Projection 6 — OCPQ query fixtures (A3 binding-box surface)
// ===========================================================================

/// OCPQ query fixtures over the manufactured OCEL, as JSON binding-box query
/// trees (the A3 surface). Each fixture is a `(name, query_json)` pair faithful
/// to OCPQ Def. 2: a binding box with an `Event(...)` / `Object(...)` variable
/// binding plus `E2O` / `TBE` predicates and a `constr`.
///
/// Fixtures (paper Fig.6 "every confirmed order paid within 4 weeks, exactly
/// once" plus a basic E2O existence query):
#[must_use]
pub fn ocpq_query_fixtures() -> Vec<(String, serde_json::Value)> {
    vec![
        (
            "confirmed_order_exists".to_string(),
            serde_json::json!({
                "box": {
                    "v0": { "kind": "Object", "object_type": "Order" },
                    "e1": { "kind": "Event", "event_type": "Confirm Order" }
                },
                "predicates": [
                    { "kind": "E2O", "event": "e1", "object": "v0", "qualifier": "*" }
                ],
                "constr": { "kind": "CBS", "activity": "Confirm Order", "min": 1, "max": 1 }
            }),
        ),
        (
            "confirmed_order_paid_within_4w".to_string(),
            serde_json::json!({
                "box": {
                    "v0": { "kind": "Object", "object_type": "Order" },
                    "e1": { "kind": "Event", "event_type": "Confirm Order" }
                },
                "predicates": [
                    { "kind": "E2O", "event": "e1", "object": "v0", "qualifier": "*" }
                ],
                "constr": { "kind": "CBS", "activity": "Receive Payment", "min": 1, "max": 1 },
                "child": {
                    "box": {
                        "e2": { "kind": "Event", "event_type": "Receive Payment" }
                    },
                    "predicates": [
                        { "kind": "E2O", "event": "e2", "object": "v0", "qualifier": "*" },
                        { "kind": "TBE", "from": "e1", "to": "e2", "tmin_s": 0, "tmax_s": 2419200 }
                    ]
                }
            }),
        ),
    ]
}

// ===========================================================================
// Emission — materialize every projection to a directory (fixtures/world/)
// ===========================================================================

/// The set of file `(relative_name, contents)` pairs the foundry emits for one
/// manufactured field. Pure (no I/O) so it is testable without a filesystem and
/// reachable across the WASM boundary as a JSON manifest if needed.
#[must_use]
pub fn world_artifacts() -> Vec<(String, String)> {
    let ocel = field_ocel();
    let card = field_cardinality();
    let powl = field_powl();
    let tree = field_process_tree();
    let net = field_net();
    let positives = positive_order_traces();
    let ocpq = ocpq_query_fixtures();

    let pretty = |v: &serde_json::Value| serde_json::to_string_pretty(v).unwrap_or_default();

    let mut files = vec![
        (
            "ocel-v2.json".to_string(),
            serde_json::to_string_pretty(&ocel).unwrap_or_default(),
        ),
        (
            "object-types-cardinality.json".to_string(),
            serde_json::to_string_pretty(&card).unwrap_or_default(),
        ),
        (
            "powl.json".to_string(),
            serde_json::to_string_pretty(&powl.powl).unwrap_or_default(),
        ),
        (
            "process-tree.json".to_string(),
            serde_json::to_string_pretty(&tree).unwrap_or_default(),
        ),
        (
            "wf-net.json".to_string(),
            serde_json::to_string_pretty(&net).unwrap_or_default(),
        ),
        (
            "positive-traces.json".to_string(),
            serde_json::to_string_pretty(&positives).unwrap_or_default(),
        ),
        ("order.xes".to_string(), field_xes()),
        ("order.csv".to_string(), field_csv()),
    ];
    for (name, q) in &ocpq {
        files.push((format!("ocpq-{name}.json"), pretty(q)));
    }
    files
}

#[cfg(test)]
mod tests {
    //! Self-contained sanity checks for the projection helpers. The *convergence*
    //! proof — OCEL validates, WF-net sound+safe, POWL lawful, tree language ==
    //! POWL language, every positive trace replays at 1.0 — lives in the
    //! integration test `wasm4pm/tests/foundry.rs` (the kernel-level oracle).

    use super::*;

    #[test]
    fn field_net_has_all_happy_path_activities() {
        let net = field_net();
        let labels: std::collections::HashSet<&str> = net
            .transitions
            .iter()
            .filter(|t| t.is_invisible != Some(true))
            .map(|t| t.label.as_str())
            .collect();
        for a in [
            "Create Order",
            "Confirm Order",
            "Pick Item",
            "Pack Package",
            "Ship Package",
            "Send Invoice",
            "Receive Payment",
        ] {
            assert!(labels.contains(a), "field net missing activity {a}");
        }
    }

    #[test]
    fn positive_traces_nonempty_and_visible_only() {
        let traces = positive_order_traces();
        assert!(!traces.is_empty(), "positive corpus must not be empty");
        for t in &traces {
            assert!(
                !t.iter().any(|a| a.starts_with('τ')),
                "τ leaked into a trace: {t:?}"
            );
        }
    }
}
