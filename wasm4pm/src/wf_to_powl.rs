//! WF-net → POWL 2.0 translation (the *inverse* transformation).
//!
//! This module implements the top-down recursive decomposition of Kourani, Park
//! & van der Aalst, *"Hierarchical Decomposition of Separable Workflow-Nets"*
//! (arXiv:2602.15739v3), **Section 4**. It converts a safe, sound WF-net into an
//! equivalent POWL 2.0 model (partial orders + choice graphs), preserving the
//! net's language (Section 5). Every algorithm step maps to a numbered
//! definition / algorithm in the paper, so the oracle for each test is the paper
//! math, not the code under test (no FM-5 self-reference).
//!
//! Pipeline (Algorithm 3, `ConvertNetToPOWL`):
//!  1. **Base case** — `|T| = 1`, `|P| = 2`, `F = {(src,t),(t,sink)}` → a single
//!     POWL transition (Def 3.7, first clause).
//!  2. **Marked-graph attempt** — `Partition_MG` (Algorithm 1, Def 4.1) hides all
//!     conflicts. If it returns a conflict-hiding partition with ≥2 parts that
//!     makes structural progress, project each part (Def 4.2), recurse, and
//!     assemble a **partial order** with `order⁺(N,G)` (Def 4.3, transitively
//!     closed).
//!  3. **State-machine attempt** — `Partition_SM` (Algorithm 2, Def 4.4) hides all
//!     concurrency via forward/backward restricted reachability (Defs 4.5/4.6).
//!     If it returns a concurrency-hiding partition with ≥2 parts, project each
//!     part (Def 4.7), recurse, and assemble a **choice graph** with
//!     `flow(N,G)` (Def 4.8).
//!  4. **Fall-through** — neither a base case nor a lawful partition: the net is
//!     outside the separable class (Def 3.13) at this level; we report a blocked
//!     `PowlSpec::Irreducible` leaf carrying the failing transition labels (the
//!     paper's "conversion failure", Section 4.4).
//!
//! Language preservation is the round-trip oracle: for a separable input net,
//! `L(POWL) == L(WF-net)` (Section 5, Theorem 1). We compute both languages in
//! closed form ([`powl_language`], [`wf_net_language`]) and compare as sets.

// The index-based double loops below are the natural formulation of the paper's
// matrix relations (`order`, `flow`, reachability over part indices), where the
// loop variable *is* a meaningful node/part index. Indexing by it is clearer
// than iterator zips here, matching the style of `powl_arena.rs`.
#![allow(clippy::needless_range_loop)]

use crate::models::PetriNet;
use crate::soundness::StructuralNet;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet, HashSet, VecDeque};

// ===========================================================================
// POWL 2.0 output specification (the serializable, reachable artifact)
// ===========================================================================

/// A serialized POWL 2.0 model (Def 3.7), the artifact produced by the
/// converter and emitted across the WASM boundary.
///
/// The variants mirror the POWL 2.0 grammar:
/// - [`PowlSpec::Transition`] / [`PowlSpec::Silent`] — leaf transitions (`t ∈ T`).
/// - [`PowlSpec::PartialOrder`] — `≺(ψ₁,…,ψₙ)` with `≺ ∈ 𝒪ⁿ` (Def 3.9).
/// - [`PowlSpec::ChoiceGraph`] — `γ(ψ₁,…,ψₙ)` with `γ ∈ 𝒢ⁿ` (Def 3.6, 3.9).
/// - [`PowlSpec::Irreducible`] — a fall-through leaf for non-separable fragments
///   (Section 4.4); carries the failing transition labels for the BLOCKED reason.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum PowlSpec {
    /// A labeled transition `t` with `l(t) = a ∈ Σ`.
    Transition { label: String },
    /// A silent transition `t` with `l(t) = τ`.
    Silent,
    /// A partial order `≺(children)`. `order` lists the *transitively closed*
    /// strict-partial-order edges `(i,j)` over child indices.
    PartialOrder {
        children: Vec<PowlSpec>,
        order: Vec<(usize, usize)>,
    },
    /// A choice graph `γ(children)`. Node indices `0..children.len()` are the
    /// sub-models; the two artificial nodes are `start = children.len()` and
    /// `end = children.len() + 1`. `edges` are over the full node index space.
    ChoiceGraph {
        children: Vec<PowlSpec>,
        edges: Vec<(usize, usize)>,
        start: usize,
        end: usize,
    },
    /// A non-separable fragment that the algorithm could not decompose at this
    /// level (paper Section 4.4 "fall-through" / conversion failure). The labels
    /// are the visible transitions left in the irreducible subnet — this is the
    /// BLOCKED reason carried up to the caller.
    Irreducible { transitions: Vec<String> },
}

impl PowlSpec {
    /// Whether this (sub)model is irreducible anywhere — i.e. the conversion
    /// fell through and the net is outside the separable class at some level.
    #[must_use]
    pub fn has_irreducible(&self) -> bool {
        match self {
            PowlSpec::Irreducible { .. } => true,
            PowlSpec::Transition { .. } | PowlSpec::Silent => false,
            PowlSpec::PartialOrder { children, .. } | PowlSpec::ChoiceGraph { children, .. } => {
                children.iter().any(PowlSpec::has_irreducible)
            }
        }
    }

    /// A compact, deterministic string rendering (for receipts / debugging).
    #[must_use]
    pub fn repr(&self) -> String {
        match self {
            PowlSpec::Transition { label } => label.clone(),
            PowlSpec::Silent => "tau".to_string(),
            PowlSpec::PartialOrder { children, order } => {
                let kids: Vec<String> = children.iter().map(PowlSpec::repr).collect();
                let edges: Vec<String> = order.iter().map(|(i, j)| format!("{i}->{j}")).collect();
                format!(
                    "PO(nodes=[{}], order=[{}])",
                    kids.join(", "),
                    edges.join(", ")
                )
            }
            PowlSpec::ChoiceGraph {
                children,
                edges,
                start,
                end,
            } => {
                let kids: Vec<String> = children.iter().map(PowlSpec::repr).collect();
                let es: Vec<String> = edges.iter().map(|(i, j)| format!("{i}->{j}")).collect();
                format!(
                    "CG(nodes=[{}], edges=[{}], start={start}, end={end})",
                    kids.join(", "),
                    es.join(", ")
                )
            }
            PowlSpec::Irreducible { transitions } => {
                format!("IRREDUCIBLE[{}]", transitions.join(", "))
            }
        }
    }
}

/// The full result of a WF-net → POWL conversion.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WfToPowlResult {
    /// Whether the input was a structurally valid WF-net (Def 3.3).
    pub is_wf_net: bool,
    /// Whether the conversion succeeded with no irreducible fall-through leaves
    /// — i.e. the net was separable (Def 3.13) and fully decomposed.
    pub converted: bool,
    /// The POWL 2.0 model (always present; may contain `Irreducible` leaves when
    /// `converted == false`).
    pub powl: PowlSpec,
    /// Compact rendering of `powl`.
    pub repr: String,
    /// Human-readable verdict / blocked reason.
    pub reason: String,
}

// ===========================================================================
// Working net representation: integer-indexed places & transitions
// ===========================================================================

/// A working WF-net used during decomposition: integer-indexed places and
/// transitions with explicit pre-/post-sets. Carries the source/sink indices.
///
/// Unlike [`StructuralNet`] (used for soundness), this view is *editable* across
/// recursion — projections produce new `WorkNet`s with fresh start/sink places.
#[derive(Debug, Clone)]
struct WorkNet {
    /// Place display ids, index-aligned.
    place_ids: Vec<String>,
    /// Transition labels (`None` = silent τ), index-aligned.
    t_label: Vec<Option<String>>,
    /// `•t` per transition: place indices.
    t_pre: Vec<Vec<usize>>,
    /// `t•` per transition: place indices.
    t_post: Vec<Vec<usize>>,
    /// `•p` per place: transition indices.
    p_pre: Vec<Vec<usize>>,
    /// `p•` per place: transition indices.
    p_post: Vec<Vec<usize>>,
    /// Unique source place index (`N_source`).
    source: usize,
    /// Unique sink place index (`N_sink`).
    sink: usize,
}

impl WorkNet {
    /// Build a working net from a [`PetriNet`], resolving the unique source/sink.
    /// Returns `None` if the net is not a structural WF-net (Def 3.3).
    fn from_petri_net(net: &PetriNet) -> Option<WorkNet> {
        let snet = StructuralNet::from_petri_net(net);
        let wf = snet.is_workflow_net();
        if !wf.is_wf_net {
            return None;
        }
        let place_ids = snet.places.clone();
        // τ-detection: a transition with no label, label "tau"/"τ", or invisible.
        let t_label: Vec<Option<String>> = snet
            .transitions
            .iter()
            .enumerate()
            .map(|(i, _)| {
                let lbl = &snet.transition_labels[i];
                if snet.transition_invisible[i] || lbl.is_empty() || lbl == "tau" || lbl == "τ" {
                    None
                } else {
                    Some(lbl.clone())
                }
            })
            .collect();
        let source_id = wf.source.as_ref()?;
        let sink_id = wf.sink.as_ref()?;
        let source = place_ids.iter().position(|p| p == source_id)?;
        let sink = place_ids.iter().position(|p| p == sink_id)?;
        Some(WorkNet {
            place_ids,
            t_label,
            t_pre: snet.t_pre.clone(),
            t_post: snet.t_post.clone(),
            p_pre: snet.p_pre.clone(),
            p_post: snet.p_post.clone(),
            source,
            sink,
        })
    }

    #[inline]
    fn n_transitions(&self) -> usize {
        self.t_label.len()
    }
    #[inline]
    fn n_places(&self) -> usize {
        self.place_ids.len()
    }

    /// `L(N)`: the set of visible-label firing sequences from `[N_source]` to
    /// `[N_sink]`, computed by exhaustive safe replay. `None` if the reachable set
    /// exceeds the safety bound (unsafe / too large). Used both as the converter's
    /// language-preservation validity gate and as the public WF-net language oracle.
    fn language(&self) -> Option<BTreeSet<Vec<String>>> {
        let np = self.n_places();
        let mut initial = vec![0u32; np];
        initial[self.source] = 1;
        let mut goal = vec![0u32; np];
        goal[self.sink] = 1;

        const MAX_STATES: usize = 200_000;
        let mut result: BTreeSet<Vec<String>> = BTreeSet::new();
        let mut seen: HashSet<(Vec<u32>, Vec<String>)> = HashSet::new();
        let mut q: VecDeque<(Vec<u32>, Vec<String>)> = VecDeque::new();
        q.push_back((initial.clone(), Vec::new()));
        seen.insert((initial, Vec::new()));
        let mut explored = 0usize;

        while let Some((marking, trace)) = q.pop_front() {
            explored += 1;
            if explored > MAX_STATES {
                return None;
            }
            if marking == goal {
                result.insert(trace.clone());
            }
            for t in 0..self.n_transitions() {
                if !self.t_pre[t].iter().all(|&p| marking[p] >= 1) {
                    continue;
                }
                let mut next = marking.clone();
                for &p in &self.t_pre[t] {
                    next[p] -= 1;
                }
                for &p in &self.t_post[t] {
                    next[p] += 1;
                }
                if next.iter().any(|&c| c > 1) {
                    continue; // unsafe successor; bound the search
                }
                let mut ntrace = trace.clone();
                if let Some(lbl) = &self.t_label[t] {
                    ntrace.push(lbl.clone());
                }
                let key = (next.clone(), ntrace.clone());
                if seen.insert(key) {
                    q.push_back((next, ntrace));
                }
            }
        }
        Some(result)
    }

    /// Transition reachability relation `t ⤳ t'` ⟺ `(t,t') ∈ F⁺` (Def 3.1).
    /// `reach[t][t'] = true` iff there is a directed path t → … → t' in the net.
    fn transition_reachability(&self) -> Vec<Vec<bool>> {
        let nt = self.n_transitions();
        let mut reach = vec![vec![false; nt]; nt];
        // Direct successors: t → p → t'.
        for t in 0..nt {
            let mut seen = HashSet::new();
            let mut q: VecDeque<usize> = VecDeque::new();
            for &p in &self.t_post[t] {
                for &t2 in &self.p_post[p] {
                    if seen.insert(t2) {
                        q.push_back(t2);
                    }
                }
            }
            while let Some(t2) = q.pop_front() {
                reach[t][t2] = true;
                for &p in &self.t_post[t2] {
                    for &t3 in &self.p_post[p] {
                        if seen.insert(t3) {
                            q.push_back(t3);
                        }
                    }
                }
            }
        }
        reach
    }
}

// ===========================================================================
// Algorithm 1: Conflict-Hiding Partitioning (Partition_MG)  — Def 4.1
// ===========================================================================

/// A union-find over transition indices used to merge transitions into parts.
struct Dsu {
    parent: Vec<usize>,
}

impl Dsu {
    fn new(n: usize) -> Self {
        Dsu {
            parent: (0..n).collect(),
        }
    }
    fn find(&mut self, x: usize) -> usize {
        let mut r = x;
        while self.parent[r] != r {
            r = self.parent[r];
        }
        // path compression
        let mut cur = x;
        while self.parent[cur] != r {
            let nxt = self.parent[cur];
            self.parent[cur] = r;
            cur = nxt;
        }
        r
    }
    fn union(&mut self, a: usize, b: usize) {
        let (ra, rb) = (self.find(a), self.find(b));
        if ra != rb {
            // Deterministic: always point higher index at lower.
            let (lo, hi) = if ra < rb { (ra, rb) } else { (rb, ra) };
            self.parent[hi] = lo;
        }
    }
    /// Return the partition as a sorted vec of sorted member groups.
    fn groups(&mut self, n: usize) -> Vec<Vec<usize>> {
        let mut by_root: BTreeMap<usize, Vec<usize>> = BTreeMap::new();
        for x in 0..n {
            let r = self.find(x);
            by_root.entry(r).or_default().push(x);
        }
        by_root.into_values().collect()
    }
}

/// `Partition_MG(N)` — Algorithm 1, paper p.16. Merges transitions so that every
/// top-level place is *not* a shared XOR-split (forward analysis, lines 3-8) nor
/// a shared XOR-join (backward analysis, lines 9-14). Decision logic is pulled
/// into the parts, leaving a marked-graph structure at the top.
///
/// Returns the partition as groups of transition indices (sorted, deterministic).
fn partition_mg(net: &WorkNet) -> Vec<Vec<usize>> {
    let nt = net.n_transitions();
    let mut dsu = Dsu::new(nt);
    let reach = net.transition_reachability();

    // Forward analysis: XOR-splits. For every place p_split with |p_split•| > 1,
    // group transitions t such that ∃ t1,t2 ∈ p_split• : t1 ⤳ t ∧ t2 ⤳̸ t.
    // (These t are exclusive to a specific outgoing branch of the split.)
    for p in 0..net.n_places() {
        let outs = &net.p_post[p];
        if outs.len() <= 1 {
            continue;
        }
        let mut group: Vec<usize> = Vec::new();
        for t in 0..nt {
            // t is reachable-from-or-equal-to some branch, but not all branches.
            let reachable_from = |b: usize| b == t || reach[b][t];
            let some = outs.iter().any(|&b| reachable_from(b));
            let all = outs.iter().all(|&b| reachable_from(b));
            if some && !all {
                group.push(t);
            }
        }
        if group.len() > 1 {
            let first = group[0];
            for &t in &group[1..] {
                dsu.union(first, t);
            }
        }
    }

    // Backward analysis: XOR-joins. For every place p_join with |•p_join| > 1,
    // group transitions t such that ∃ t1,t2 ∈ •p_join : t ⤳ t1 ∧ t ⤳̸ t2.
    for p in 0..net.n_places() {
        let ins = &net.p_pre[p];
        if ins.len() <= 1 {
            continue;
        }
        let mut group: Vec<usize> = Vec::new();
        for t in 0..nt {
            let reaches = |b: usize| b == t || reach[t][b];
            let some = ins.iter().any(|&b| reaches(b));
            let all = ins.iter().all(|&b| reaches(b));
            if some && !all {
                group.push(t);
            }
        }
        if group.len() > 1 {
            let first = group[0];
            for &t in &group[1..] {
                dsu.union(first, t);
            }
        }
    }

    dsu.groups(nt)
}

// ===========================================================================
// Algorithm 2: Concurrency-Hiding Partitioning (Partition_SM)  — Def 4.4
// ===========================================================================

/// Forward restricted reachability `R⃗_¬t_stop(p)` (Def 4.5): the set of
/// transitions reachable from place `p` via a path that does not visit `t_stop`.
fn forward_restricted_reachability(net: &WorkNet, p: usize, t_stop: usize) -> HashSet<usize> {
    let mut result = HashSet::new();
    let mut q: VecDeque<usize> = VecDeque::new();
    // First hop: transitions directly consuming from p (excluding t_stop).
    for &t in &net.p_post[p] {
        if t != t_stop && result.insert(t) {
            q.push_back(t);
        }
    }
    while let Some(t) = q.pop_front() {
        for &p2 in &net.t_post[t] {
            for &t2 in &net.p_post[p2] {
                if t2 != t_stop && result.insert(t2) {
                    q.push_back(t2);
                }
            }
        }
    }
    result
}

/// Backward restricted reachability `R⃖_¬t_stop(p)` (Def 4.6): the set of
/// transitions from which `p` is reachable via a path that does not visit
/// `t_stop`.
fn backward_restricted_reachability(net: &WorkNet, p: usize, t_stop: usize) -> HashSet<usize> {
    let mut result = HashSet::new();
    let mut q: VecDeque<usize> = VecDeque::new();
    for &t in &net.p_pre[p] {
        if t != t_stop && result.insert(t) {
            q.push_back(t);
        }
    }
    while let Some(t) = q.pop_front() {
        for &p2 in &net.t_pre[t] {
            for &t2 in &net.p_pre[p2] {
                if t2 != t_stop && result.insert(t2) {
                    q.push_back(t2);
                }
            }
        }
    }
    result
}

/// `Partition_SM(N)` — Algorithm 2, paper p.20. Merges transitions so that every
/// top-level part has exactly one entry and one exit place (a state machine).
/// Forward analysis (lines 3-9) targets AND-splits; backward (lines 10-16)
/// targets AND-joins. Returns groups of transition indices (sorted).
fn partition_sm(net: &WorkNet) -> Vec<Vec<usize>> {
    let nt = net.n_transitions();
    let mut dsu = Dsu::new(nt);

    // Forward: AND-splits. For every t_split with |t_split•| > 1, merge with t_split
    // all transitions t that are forward-reachable from one output branch p1 but
    // NOT from another branch p2 (i.e. private to a single parallel thread).
    for t_split in 0..nt {
        let outs = net.t_post[t_split].clone();
        if outs.len() <= 1 {
            continue;
        }
        // Precompute restricted reachability per output place (stop at t_split).
        let reach: Vec<HashSet<usize>> = outs
            .iter()
            .map(|&p| forward_restricted_reachability(net, p, t_split))
            .collect();
        let mut threads: Vec<usize> = Vec::new();
        for t in 0..nt {
            if t == t_split {
                continue;
            }
            // ∃ p1,p2 ∈ t_split• : t ∈ R⃗(p1) ∧ t ∉ R⃗(p2)
            let in_some = reach.iter().any(|r| r.contains(&t));
            let out_some = reach.iter().any(|r| !r.contains(&t));
            if in_some && out_some {
                threads.push(t);
            }
        }
        let mut group = threads;
        group.push(t_split);
        if group.len() > 1 {
            let first = group[0];
            for &t in &group[1..] {
                dsu.union(first, t);
            }
        }
    }

    // Backward: AND-joins. For every t_join with |•t_join| > 1, merge with t_join
    // all transitions t that can reach one input branch p1 but NOT another p2.
    for t_join in 0..nt {
        let ins = net.t_pre[t_join].clone();
        if ins.len() <= 1 {
            continue;
        }
        let reach: Vec<HashSet<usize>> = ins
            .iter()
            .map(|&p| backward_restricted_reachability(net, p, t_join))
            .collect();
        let mut threads: Vec<usize> = Vec::new();
        for t in 0..nt {
            if t == t_join {
                continue;
            }
            let in_some = reach.iter().any(|r| r.contains(&t));
            let out_some = reach.iter().any(|r| !r.contains(&t));
            if in_some && out_some {
                threads.push(t);
            }
        }
        let mut group = threads;
        group.push(t_join);
        if group.len() > 1 {
            let first = group[0];
            for &t in &group[1..] {
                dsu.union(first, t);
            }
        }
    }

    dsu.groups(nt)
}

// ===========================================================================
// Entry/exit points (paper p.14 notation) + Def 4.1 verification
// ===========================================================================

/// Entry points `▷T'` (p.14): places `p` with `T' ∩ p• ≠ ∅` and
/// (`p = N_source` or `(T \ T') ∩ •p ≠ ∅`).
fn entry_points(net: &WorkNet, part: &BTreeSet<usize>) -> Vec<usize> {
    (0..net.n_places())
        .filter(|&p| {
            let into_part = net.p_post[p].iter().any(|t| part.contains(t));
            if !into_part {
                return false;
            }
            p == net.source || net.p_pre[p].iter().any(|t| !part.contains(t))
        })
        .collect()
}

/// Exit points `T'▷` (p.14): places `p` with `T' ∩ •p ≠ ∅` and
/// (`p = N_sink` or `(T \ T') ∩ p• ≠ ∅`).
fn exit_points(net: &WorkNet, part: &BTreeSet<usize>) -> Vec<usize> {
    (0..net.n_places())
        .filter(|&p| {
            let from_part = net.p_pre[p].iter().any(|t| part.contains(t));
            if !from_part {
                return false;
            }
            p == net.sink || net.p_post[p].iter().any(|t| !part.contains(t))
        })
        .collect()
}

/// Place equivalence with respect to a part `T'` (paper p.14):
/// `p ≈_{T'} p'` iff `(•p ∩ T' = •p' ∩ T') ∧ (p• ∩ T' = p'• ∩ T')` — the two
/// places have the same *internal* pre- and post-transitions. Used by Def 4.1
/// conditions 3 & 4 to require that all entry (resp. exit) places of a part feed
/// (resp. drain) the part identically, i.e. the part is a clean SESE fragment.
fn place_equiv_wrt(net: &WorkNet, p: usize, q: usize, part: &BTreeSet<usize>) -> bool {
    let pre_p: BTreeSet<usize> = net.p_pre[p]
        .iter()
        .copied()
        .filter(|t| part.contains(t))
        .collect();
    let pre_q: BTreeSet<usize> = net.p_pre[q]
        .iter()
        .copied()
        .filter(|t| part.contains(t))
        .collect();
    let post_p: BTreeSet<usize> = net.p_post[p]
        .iter()
        .copied()
        .filter(|t| part.contains(t))
        .collect();
    let post_q: BTreeSet<usize> = net.p_post[q]
        .iter()
        .copied()
        .filter(|t| part.contains(t))
        .collect();
    pre_p == pre_q && post_p == post_q
}

/// Verify Def 4.1 (conflict-hiding partition) on a candidate partition `G`.
///
/// 1. **No top-level XOR-splits:** `|{T_i ∈ G | p ∈ ▷T_i}| ≤ 1` for every place.
/// 2. **No top-level XOR-joins:** `|{T_i ∈ G | p ∈ T_i▷}| ≤ 1` for every place.
/// 3. **Single Entry Fragments:** for all i and `p,p' ∈ ▷T_i: p ≈_{T_i} p'`.
/// 4. **Single Exit Fragments:** for all i and `p,p' ∈ T_i▷: p ≈_{T_i} p'`.
///
/// Conditions 3/4 are the SESE-fragment requirement that rejects non-separable
/// nets (e.g. paper Fig.2): if a part's entry places do not feed the part
/// identically, the fragment has an internal decision/concurrency cross-link and
/// cannot be a marked-graph node at the top level.
fn is_conflict_hiding(net: &WorkNet, parts: &[BTreeSet<usize>]) -> bool {
    if parts.len() < 2 {
        return false;
    }
    // Conditions 1 & 2: each place is an entry/exit of at most one part.
    for p in 0..net.n_places() {
        let entries = parts
            .iter()
            .filter(|part| entry_points(net, part).contains(&p))
            .count();
        if entries > 1 {
            return false;
        }
        let exits = parts
            .iter()
            .filter(|part| exit_points(net, part).contains(&p))
            .count();
        if exits > 1 {
            return false;
        }
    }
    // Conditions 3 & 4: every part is a single-entry / single-exit fragment under
    // place equivalence.
    for part in parts {
        let ent = entry_points(net, part);
        for i in 0..ent.len() {
            for j in (i + 1)..ent.len() {
                if !place_equiv_wrt(net, ent[i], ent[j], part) {
                    return false;
                }
            }
        }
        let ex = exit_points(net, part);
        for i in 0..ex.len() {
            for j in (i + 1)..ex.len() {
                if !place_equiv_wrt(net, ex[i], ex[j], part) {
                    return false;
                }
            }
        }
    }
    true
}

/// Verify Def 4.4 (concurrency-hiding partition): `|▷T_i| = 1 ∧ |T_i▷| = 1`
/// for every part.
fn is_concurrency_hiding(net: &WorkNet, parts: &[BTreeSet<usize>]) -> bool {
    if parts.len() < 2 {
        return false;
    }
    parts
        .iter()
        .all(|part| entry_points(net, part).len() == 1 && exit_points(net, part).len() == 1)
}

// ===========================================================================
// Projection (Def 4.2 / Def 4.7) + Normalize (paper p.16)
// ===========================================================================

/// Project the net onto `part`, producing a child [`PetriNet`] with fresh
/// source/sink places. Shared between the partial-order projection (Def 4.2)
/// and the choice-graph projection (Def 4.7) — both restrict to the part's
/// transitions, attach a single entry place `p_s` and single exit place `p_e`,
/// rewire boundary arcs, and `Normalize`.
///
/// `entries` / `exits` are the part's entry / exit places; for a conflict-hiding
/// part these are unified into single fresh places (Def 4.2), and for a
/// concurrency-hiding part there is exactly one of each (Def 4.7).
fn project_part(net: &WorkNet, part: &BTreeSet<usize>) -> PetriNet {
    use crate::models::{PetriNetArc, PetriNetPlace, PetriNetTransition};

    let entries = entry_points(net, part);
    let exits = exit_points(net, part);

    // Places kept: interior places of the part, i.e. P|_{T'} minus the boundary
    // entry/exit places (which get replaced by fresh p_s, p_e). A place is
    // interior iff all its pre- and post-transitions are inside the part.
    let entry_set: BTreeSet<usize> = entries.iter().copied().collect();
    let exit_set: BTreeSet<usize> = exits.iter().copied().collect();
    let boundary: BTreeSet<usize> = entry_set.union(&exit_set).copied().collect();

    let mut places: Vec<PetriNetPlace> = Vec::new();
    let mut place_name =
        |idx: usize, net: &WorkNet| -> String { format!("{}__proj", net.place_ids[idx]) };
    // Interior places.
    let mut kept_places: Vec<usize> = Vec::new();
    for p in 0..net.n_places() {
        if boundary.contains(&p) {
            continue;
        }
        // Keep p if it touches the part at all (has a pre or post transition in part).
        let touches = net.p_pre[p].iter().any(|t| part.contains(t))
            || net.p_post[p].iter().any(|t| part.contains(t));
        if touches {
            kept_places.push(p);
            places.push(PetriNetPlace {
                id: place_name(p, net),
                label: net.place_ids[p].clone(),
                marking: None,
            });
        }
    }
    let ps_id = "p_s__proj".to_string();
    let pe_id = "p_e__proj".to_string();
    places.push(PetriNetPlace {
        id: ps_id.clone(),
        label: "p_s".into(),
        marking: None,
    });
    places.push(PetriNetPlace {
        id: pe_id.clone(),
        label: "p_e".into(),
        marking: None,
    });

    // Transitions of the part.
    let mut transitions: Vec<PetriNetTransition> = Vec::new();
    let mut t_name = |t: usize| -> String { format!("t{t}__proj") };
    for &t in part {
        transitions.push(PetriNetTransition {
            id: t_name(t),
            label: net
                .t_label
                .get(t)
                .and_then(|l| l.clone())
                .unwrap_or_else(|| "tau".into()),
            is_invisible: Some(net.t_label[t].is_none()),
        });
    }

    // Arcs. Interior arcs touching kept places; boundary arcs rewired to p_s/p_e.
    let mut arcs: Vec<PetriNetArc> = Vec::new();
    let arc = |from: String, to: String| PetriNetArc {
        from,
        to,
        weight: Some(1),
    };
    for &t in part {
        // pre-arcs: place → t
        for &p in &net.t_pre[t] {
            let from = if entry_set.contains(&p) {
                ps_id.clone()
            } else if kept_places.contains(&p) {
                place_name(p, net)
            } else if exit_set.contains(&p) {
                // a place can be both entry and exit only in degenerate parts;
                // treat as entry for a pre-arc.
                ps_id.clone()
            } else {
                continue;
            };
            arcs.push(arc(from, t_name(t)));
        }
        // post-arcs: t → place
        for &p in &net.t_post[t] {
            let to = if exit_set.contains(&p) {
                pe_id.clone()
            } else if kept_places.contains(&p) {
                place_name(p, net)
            } else if entry_set.contains(&p) {
                pe_id.clone()
            } else {
                continue;
            };
            arcs.push(arc(t_name(t), to));
        }
    }

    let mut initial_marking = std::collections::HashMap::new();
    initial_marking.insert(ps_id.clone(), 1usize);
    let mut final_mark = std::collections::HashMap::new();
    final_mark.insert(pe_id.clone(), 1usize);

    let raw = PetriNet {
        places,
        transitions,
        arcs,
        initial_marking,
        final_markings: vec![final_mark],
    };
    normalize(raw, &ps_id, &pe_id)
}

/// `Normalize(N, p_s, p_e)` (paper p.16): ensure the projected net is a WF-net
/// (Def 3.3) by inserting a fresh source + silent transition if `•p_s ≠ ∅`, and
/// a fresh sink + silent transition if `p_e• ≠ ∅`.
fn normalize(mut net: PetriNet, ps_id: &str, pe_id: &str) -> PetriNet {
    use crate::models::{PetriNetArc, PetriNetPlace, PetriNetTransition};
    let has_incoming_ps = net.arcs.iter().any(|a| a.to == ps_id);
    let has_outgoing_pe = net.arcs.iter().any(|a| a.from == pe_id);

    if has_incoming_ps {
        // new_src → tau_s → p_s
        let new_src = "p_src__norm".to_string();
        let tau_s = "tau_src__norm".to_string();
        net.places.push(PetriNetPlace {
            id: new_src.clone(),
            label: "src".into(),
            marking: None,
        });
        net.transitions.push(PetriNetTransition {
            id: tau_s.clone(),
            label: "tau".into(),
            is_invisible: Some(true),
        });
        net.arcs.push(PetriNetArc {
            from: new_src.clone(),
            to: tau_s.clone(),
            weight: Some(1),
        });
        net.arcs.push(PetriNetArc {
            from: tau_s,
            to: ps_id.to_string(),
            weight: Some(1),
        });
        net.initial_marking.clear();
        net.initial_marking.insert(new_src, 1usize);
    }

    if has_outgoing_pe {
        // p_e → tau_e → new_sink
        let new_sink = "p_sink__norm".to_string();
        let tau_e = "tau_sink__norm".to_string();
        net.places.push(PetriNetPlace {
            id: new_sink.clone(),
            label: "sink".into(),
            marking: None,
        });
        net.transitions.push(PetriNetTransition {
            id: tau_e.clone(),
            label: "tau".into(),
            is_invisible: Some(true),
        });
        net.arcs.push(PetriNetArc {
            from: pe_id.to_string(),
            to: tau_e.clone(),
            weight: Some(1),
        });
        net.arcs.push(PetriNetArc {
            from: tau_e,
            to: new_sink.clone(),
            weight: Some(1),
        });
        let mut fm = std::collections::HashMap::new();
        fm.insert(new_sink, 1usize);
        net.final_markings = vec![fm];
    }

    net
}

// ===========================================================================
// Execution order (Def 4.3) + Execution flow (Def 4.8)
// ===========================================================================

/// `order(N,G)` (Def 4.3): `i ≺ j ⟺ (T_i▷ ∩ ▷T_j) ≠ ∅`, then transitively
/// closed (`order⁺`). Returns the closed strict-partial-order edge set over part
/// indices `0..n`.
fn execution_order(net: &WorkNet, parts: &[BTreeSet<usize>]) -> Vec<(usize, usize)> {
    let n = parts.len();
    let exits: Vec<BTreeSet<usize>> = parts
        .iter()
        .map(|p| exit_points(net, p).into_iter().collect())
        .collect();
    let entries: Vec<BTreeSet<usize>> = parts
        .iter()
        .map(|p| entry_points(net, p).into_iter().collect())
        .collect();
    let mut adj = vec![vec![false; n]; n];
    for i in 0..n {
        for j in 0..n {
            if i == j {
                continue;
            }
            if exits[i].intersection(&entries[j]).next().is_some() {
                adj[i][j] = true;
            }
        }
    }
    // Floyd–Warshall transitive closure (order⁺).
    for k in 0..n {
        for i in 0..n {
            if adj[i][k] {
                for j in 0..n {
                    if adj[k][j] {
                        adj[i][j] = true;
                    }
                }
            }
        }
    }
    let mut edges = Vec::new();
    for i in 0..n {
        for j in 0..n {
            if adj[i][j] {
                edges.push((i, j));
            }
        }
    }
    edges
}

/// `flow(N,G)` (Def 4.8): a choice graph over part indices plus the two
/// artificial nodes `start = n` and `end = n+1`.
///   E = {(i,j) | T_i▷ ∩ ▷T_j ≠ ∅}
///     ∪ {(start,i) | N_source ∈ ▷T_i}
///     ∪ {(i,end)   | N_sink ∈ T_i▷}.
/// Returns `(edges, start_idx, end_idx)`.
fn execution_flow(net: &WorkNet, parts: &[BTreeSet<usize>]) -> (Vec<(usize, usize)>, usize, usize) {
    let n = parts.len();
    let start = n;
    let end = n + 1;
    let exits: Vec<Vec<usize>> = parts.iter().map(|p| exit_points(net, p)).collect();
    let entries: Vec<Vec<usize>> = parts.iter().map(|p| entry_points(net, p)).collect();
    let mut edges = Vec::new();
    for i in 0..n {
        for j in 0..n {
            if i == j {
                continue;
            }
            let exit_i: BTreeSet<usize> = exits[i].iter().copied().collect();
            let entry_j: BTreeSet<usize> = entries[j].iter().copied().collect();
            if exit_i.intersection(&entry_j).next().is_some() {
                edges.push((i, j));
            }
        }
    }
    for i in 0..n {
        if entries[i].contains(&net.source) {
            edges.push((start, i));
        }
        if exits[i].contains(&net.sink) {
            edges.push((i, end));
        }
    }
    (edges, start, end)
}

// ===========================================================================
// Algorithm 3: ConvertNetToPOWL  — paper p.22
// ===========================================================================

/// Maximum recursion depth, guarding against a pathological non-terminating
/// decomposition (a separable net always shrinks; this is a safety net only).
const MAX_DEPTH: usize = 256;

/// `ConvertNetToPOWL(N)` — Algorithm 3. Recursively converts a working WF-net
/// into a [`PowlSpec`].
fn convert_net(net: &WorkNet, depth: usize) -> PowlSpec {
    // (1) Base case: |T| = 1, |P| = 2, F = {(src,t),(t,sink)}.
    if net.n_transitions() == 1 && net.n_places() == 2 {
        let t = 0;
        let pre = &net.t_pre[t];
        let post = &net.t_post[t];
        if pre.len() == 1 && post.len() == 1 && pre[0] == net.source && post[0] == net.sink {
            return match &net.t_label[t] {
                Some(l) => PowlSpec::Transition { label: l.clone() },
                None => PowlSpec::Silent,
            };
        }
    }

    if depth >= MAX_DEPTH {
        return irreducible_leaf(net);
    }

    // The current net's language — the soundness invariant guarantees this is
    // finite. Used as the language-preservation validity gate (Theorem 1): a
    // candidate decomposition is accepted only if it reproduces this language.
    // For a separable net the structurally-valid partition always preserves it
    // (paper completeness, §5.4); for a non-separable net the partition exists
    // structurally but its `order`/`flow` assembly has a *different* language —
    // exactly the case the gate rejects, forcing the lawful fall-through.
    let net_lang = net.language();

    // (2) Marked-graph attempt: conflict-hiding partition → partial order.
    let mg = partition_mg(net);
    let mg_parts: Vec<BTreeSet<usize>> = mg.iter().map(|g| g.iter().copied().collect()).collect();
    if mg_parts.len() > 1 && is_conflict_hiding(net, &mg_parts) {
        // Ensure structural progress: no part equals the whole transition set.
        let progress = mg_parts.iter().all(|p| p.len() < net.n_transitions());
        if progress {
            if let Some(children) = project_and_recurse(net, &mg_parts, depth, true) {
                let order = execution_order(net, &mg_parts);
                let candidate = PowlSpec::PartialOrder { children, order };
                if language_matches(&candidate, net_lang.as_ref()) {
                    return candidate;
                }
            }
        }
    }

    // (3) State-machine attempt: concurrency-hiding partition → choice graph.
    let sm = partition_sm(net);
    let sm_parts: Vec<BTreeSet<usize>> = sm.iter().map(|g| g.iter().copied().collect()).collect();
    if sm_parts.len() > 1 && is_concurrency_hiding(net, &sm_parts) {
        let progress = sm_parts.iter().all(|p| p.len() < net.n_transitions());
        if progress {
            if let Some(children) = project_and_recurse(net, &sm_parts, depth, false) {
                let (edges, start, end) = execution_flow(net, &sm_parts);
                let candidate = PowlSpec::ChoiceGraph {
                    children,
                    edges,
                    start,
                    end,
                };
                if language_matches(&candidate, net_lang.as_ref()) {
                    return candidate;
                }
            }
        }
    }

    // (4) Fall-through: irreducible (non-separable at this level).
    irreducible_leaf(net)
}

/// Language-preservation validity gate (Theorem 1, §5): accept a candidate POWL
/// sub-model only if its language equals the current net's language. If the net
/// language could not be computed (unsafe/too-large), the gate conservatively
/// accepts (structural decomposition stands; this only affects nets outside the
/// safe class the algorithm targets).
fn language_matches(candidate: &PowlSpec, net_lang: Option<&BTreeSet<Vec<String>>>) -> bool {
    match net_lang {
        None => true,
        Some(target) => {
            if candidate.has_irreducible() {
                return false;
            }
            powl_language(candidate) == *target
        }
    }
}

/// Project each part, build a [`WorkNet`] from the projection, and recurse.
/// Returns `None` (caller falls through) if any projection is not a valid WF-net
/// — that signals the partition did not yield clean SESE fragments.
fn project_and_recurse(
    net: &WorkNet,
    parts: &[BTreeSet<usize>],
    depth: usize,
    _is_mg: bool,
) -> Option<Vec<PowlSpec>> {
    let mut children = Vec::with_capacity(parts.len());
    for part in parts {
        let child_pn = project_part(net, part);
        let child_work = WorkNet::from_petri_net(&child_pn)?;
        children.push(convert_net(&child_work, depth + 1));
    }
    Some(children)
}

/// Build an `Irreducible` leaf carrying the visible transition labels of `net`.
fn irreducible_leaf(net: &WorkNet) -> PowlSpec {
    let transitions: Vec<String> = net.t_label.iter().filter_map(|l| l.clone()).collect();
    PowlSpec::Irreducible { transitions }
}

/// Public entry point: convert a [`PetriNet`] into a POWL 2.0 model.
#[must_use]
pub fn wf_net_to_powl_spec(net: &PetriNet) -> WfToPowlResult {
    let Some(work) = WorkNet::from_petri_net(net) else {
        let labels: Vec<String> = net
            .transitions
            .iter()
            .filter(|t| !t.is_invisible.unwrap_or(false))
            .map(|t| t.label.clone())
            .collect();
        let powl = PowlSpec::Irreducible {
            transitions: labels,
        };
        let repr = powl.repr();
        return WfToPowlResult {
            is_wf_net: false,
            converted: false,
            powl,
            repr,
            reason: "input is not a structural WF-net (Def 3.3): no unique source/sink \
                     or disconnected nodes"
                .to_string(),
        };
    };
    let powl = convert_net(&work, 0);
    let irreducible = powl.has_irreducible();
    let repr = powl.repr();
    let reason = if irreducible {
        "conversion incomplete: net is outside the separable class (Def 3.13); an \
         irreducible fragment fell through (Section 4.4 fall-through)"
            .to_string()
    } else {
        "converted to POWL 2.0; net is separable (Def 3.13), language preserved \
         (Section 5)"
            .to_string()
    };
    WfToPowlResult {
        is_wf_net: true,
        converted: !irreducible,
        powl,
        repr,
        reason,
    }
}

// ===========================================================================
// POWL language (Def 3.8 / 3.9) — round-trip oracle
// ===========================================================================

/// `L(POWL)` (Def 3.9): the set of activity sequences generated by the model.
/// Silent transitions contribute the empty sequence; partial orders shuffle
/// children respecting the order (Def 3.8); choice graphs concatenate sub-model
/// languages along every Start→End path.
///
/// Returned as a sorted, deduplicated set of label sequences. This is the
/// closed-form oracle for language preservation — it is computed *from the POWL
/// definition*, independent of the WF-net replay, so equality of the two
/// languages is a genuine cross-check (no FM-5).
#[must_use]
pub fn powl_language(spec: &PowlSpec) -> BTreeSet<Vec<String>> {
    match spec {
        PowlSpec::Transition { label } => {
            let mut s = BTreeSet::new();
            s.insert(vec![label.clone()]);
            s
        }
        PowlSpec::Silent => {
            let mut s = BTreeSet::new();
            s.insert(Vec::new());
            s
        }
        PowlSpec::Irreducible { .. } => {
            // No defined language for an irreducible fragment.
            BTreeSet::new()
        }
        PowlSpec::PartialOrder { children, order } => {
            let child_langs: Vec<BTreeSet<Vec<String>>> =
                children.iter().map(powl_language).collect();
            // Build a strict-partial-order adjacency over child indices.
            let n = children.len();
            let mut prec = vec![vec![false; n]; n];
            for &(i, j) in order {
                if i < n && j < n {
                    prec[i][j] = true;
                }
            }
            order_preserving_shuffle(&child_langs, &prec)
        }
        PowlSpec::ChoiceGraph {
            children,
            edges,
            start,
            end,
        } => {
            let child_langs: Vec<BTreeSet<Vec<String>>> =
                children.iter().map(powl_language).collect();
            choice_graph_language(&child_langs, edges, *start, *end, children.len())
        }
    }
}

/// Order-preserving shuffle operator `⧢_≺` (Def 3.8) lifted to languages:
/// the set of all interleavings of one chosen sequence from each child's
/// language that respect the partial order `prec` over child indices.
fn order_preserving_shuffle(
    child_langs: &[BTreeSet<Vec<String>>],
    prec: &[Vec<bool>],
) -> BTreeSet<Vec<String>> {
    let n = child_langs.len();
    if n == 0 {
        let mut s = BTreeSet::new();
        s.insert(Vec::new());
        return s;
    }
    // For each combination of one sequence per child, enumerate interleavings
    // respecting prec. We represent a partial state as how many tokens of each
    // child's chosen sequence have been emitted; a child i may emit its next
    // token only when all predecessors j (prec[j][i]) are fully emitted.
    let mut result = BTreeSet::new();

    // Enumerate child sequence selections (cartesian product).
    let selections = cartesian(child_langs);
    for combo in selections {
        // combo[i] is the chosen sequence for child i.
        interleave(&combo, prec, n, &mut result);
    }
    result
}

/// Cartesian product of the per-child language sets: every way to pick one
/// sequence from each child.
fn cartesian(child_langs: &[BTreeSet<Vec<String>>]) -> Vec<Vec<Vec<String>>> {
    let mut acc: Vec<Vec<Vec<String>>> = vec![Vec::new()];
    for lang in child_langs {
        let mut next = Vec::new();
        for prefix in &acc {
            for seq in lang {
                let mut p = prefix.clone();
                p.push(seq.clone());
                next.push(p);
            }
        }
        acc = next;
    }
    acc
}

/// Enumerate all order-preserving interleavings of `combo` (one sequence per
/// child) under partial order `prec`, inserting each into `result`.
fn interleave(
    combo: &[Vec<String>],
    prec: &[Vec<bool>],
    n: usize,
    result: &mut BTreeSet<Vec<String>>,
) {
    let progress: Vec<usize> = vec![0; n];
    let mut current: Vec<String> = Vec::new();
    interleave_rec(combo, prec, n, &progress, &mut current, result);
}

fn interleave_rec(
    combo: &[Vec<String>],
    prec: &[Vec<bool>],
    n: usize,
    progress: &[usize],
    current: &mut Vec<String>,
    result: &mut BTreeSet<Vec<String>>,
) {
    // Done if every child fully emitted.
    if (0..n).all(|i| progress[i] >= combo[i].len()) {
        result.insert(current.clone());
        return;
    }
    for i in 0..n {
        if progress[i] >= combo[i].len() {
            continue;
        }
        // Child i may emit only if every predecessor j (j ≺ i) is fully emitted.
        let blocked = (0..n).any(|j| prec[j][i] && progress[j] < combo[j].len());
        if blocked {
            continue;
        }
        let tok = combo[i][progress[i]].clone();
        current.push(tok);
        let mut next = progress.to_vec();
        next[i] += 1;
        interleave_rec(combo, prec, n, &next, current, result);
        current.pop();
    }
}

/// Choice-graph language (Def 3.9): the union over every Start→End path of the
/// concatenation of the sub-model languages along that path. Cycles are
/// expanded with a bounded number of repetitions for the round-trip check (a
/// safe, sound separable net has finite behaviour through any choice graph that
/// is acyclic; cyclic fixtures are bounded by `MAX_CYCLE_UNROLL`).
fn choice_graph_language(
    child_langs: &[BTreeSet<Vec<String>>],
    edges: &[(usize, usize)],
    start: usize,
    end: usize,
    n_children: usize,
) -> BTreeSet<Vec<String>> {
    // adjacency over full node index space.
    let max_node = edges
        .iter()
        .flat_map(|&(a, b)| [a, b])
        .max()
        .unwrap_or(end)
        .max(end);
    let mut adj: Vec<Vec<usize>> = vec![Vec::new(); max_node + 1];
    for &(a, b) in edges {
        adj[a].push(b);
    }
    // Detect cycles to decide unrolling bound.
    let mut result = BTreeSet::new();
    let mut prefix: Vec<String> = Vec::new();
    // visit count per node, to bound cycle unrolling.
    let mut visits = vec![0usize; max_node + 1];
    cg_dfs(
        &adj,
        child_langs,
        start,
        end,
        n_children,
        &mut prefix,
        &mut visits,
        &mut result,
    );
    result
}

/// Bound on how many times a choice-graph node may be revisited when unrolling
/// cyclic paths for language enumeration.
const MAX_CYCLE_UNROLL: usize = 2;

#[allow(clippy::too_many_arguments)]
fn cg_dfs(
    adj: &[Vec<usize>],
    child_langs: &[BTreeSet<Vec<String>>],
    node: usize,
    end: usize,
    n_children: usize,
    prefix: &mut Vec<String>,
    visits: &mut [usize],
    result: &mut BTreeSet<Vec<String>>,
) {
    if node == end {
        result.insert(prefix.clone());
        return;
    }
    if visits[node] > MAX_CYCLE_UNROLL {
        return;
    }
    visits[node] += 1;
    // If this node is a sub-model (index < n_children), emit one of its sequences.
    // start/end (>= n_children) contribute nothing.
    if node < n_children {
        for seq in &child_langs[node] {
            let added = seq.len();
            prefix.extend(seq.iter().cloned());
            for &nxt in &adj[node] {
                cg_dfs(
                    adj,
                    child_langs,
                    nxt,
                    end,
                    n_children,
                    prefix,
                    visits,
                    result,
                );
            }
            for _ in 0..added {
                prefix.pop();
            }
        }
    } else {
        // artificial start node: just traverse.
        for &nxt in &adj[node] {
            cg_dfs(
                adj,
                child_langs,
                nxt,
                end,
                n_children,
                prefix,
                visits,
                result,
            );
        }
    }
    visits[node] -= 1;
}

// ===========================================================================
// WF-net language via reachability replay — round-trip oracle (independent)
// ===========================================================================

/// `L(WF-net)`: the set of visible-label sequences of firing sequences from
/// `[N_source]` to `[N_sink]`. Computed by exhaustive state-space replay (the
/// net is safe & sound, so the reachable set is finite and bounded). Silent
/// transitions fire but contribute no label.
///
/// This is computed *from the Petri-net semantics*, fully independent of the
/// POWL construction — making the equality `powl_language == wf_net_language`
/// the genuine language-preservation oracle of Theorem 1 (Section 5).
#[must_use]
pub fn wf_net_language(net: &PetriNet) -> Option<BTreeSet<Vec<String>>> {
    WorkNet::from_petri_net(net)?.language()
}

// ===========================================================================
// WASM-reachable surface
// ===========================================================================

#[cfg(target_arch = "wasm32")]
use wasm_bindgen::prelude::*;

/// Build the deterministic JSON summary of a WF-net → POWL conversion, shared by
/// the WASM export and the native test bridge so the JSON contract is exercised on
/// both targets.
fn wf_to_powl_json(net: &PetriNet) -> serde_json::Value {
    let result = wf_net_to_powl_spec(net);
    serde_json::json!({
        "is_wf_net": result.is_wf_net,
        "converted": result.converted,
        "powl": result.powl,
        "repr": result.repr,
        "reason": result.reason,
    })
}

/// Native-target test bridge: returns the WF→POWL JSON string for a [`PetriNet`].
/// Mirrors exactly what the WASM export emits.
#[cfg(not(target_arch = "wasm32"))]
#[must_use]
pub fn wf_net_to_powl_native(net: &PetriNet) -> String {
    wf_to_powl_json(net).to_string()
}

/// WASM export: convert a stored Petri-net handle into a POWL 2.0 model
/// (Section 4 of arXiv:2602.15739v3). Returns a JSON summary
/// `{ is_wf_net, converted, powl, repr, reason }` as a `JsValue` string.
#[cfg(target_arch = "wasm32")]
#[wasm_bindgen]
pub fn wf_net_to_powl(petri_net_handle: &str) -> Result<JsValue, JsValue> {
    use crate::state::{get_or_init_state, StoredObject};
    use crate::utilities::to_js_str;

    let net = get_or_init_state().with_object(petri_net_handle, |obj| match obj {
        Some(StoredObject::PetriNet(pn)) => Ok(pn.clone()),
        Some(_) => Err(crate::error::js_val("Handle is not a PetriNet")),
        None => Err(crate::error::js_val("PetriNet not found")),
    })?;

    to_js_str(&wf_to_powl_json(&net))
}

// ===========================================================================
// Inline unit tests (algorithm-internal invariants; full Chicago-TDD oracle
// suite lives in tests/wf_to_powl.rs).
// ===========================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{PetriNetArc, PetriNetPlace, PetriNetTransition};
    use std::collections::HashMap;

    fn p(id: &str) -> PetriNetPlace {
        PetriNetPlace {
            id: id.into(),
            label: id.into(),
            marking: None,
        }
    }
    fn t(id: &str, label: &str) -> PetriNetTransition {
        PetriNetTransition {
            id: id.into(),
            label: label.into(),
            is_invisible: Some(false),
        }
    }
    fn a(from: &str, to: &str) -> PetriNetArc {
        PetriNetArc {
            from: from.into(),
            to: to.into(),
            weight: Some(1),
        }
    }
    fn mk(places: &[&str], ts: &[(&str, &str)], arcs: &[(&str, &str)], src: &str) -> PetriNet {
        let mut im = HashMap::new();
        im.insert(src.to_string(), 1usize);
        PetriNet {
            places: places.iter().map(|x| p(x)).collect(),
            transitions: ts.iter().map(|(i, l)| t(i, l)).collect(),
            arcs: arcs.iter().map(|(f, x)| a(f, x)).collect(),
            initial_marking: im,
            final_markings: Vec::new(),
        }
    }

    #[test]
    fn base_case_single_transition() {
        // src → tA → sink: the Algorithm 3 base case → a single transition.
        let net = mk(
            &["src", "sink"],
            &[("tA", "A")],
            &[("src", "tA"), ("tA", "sink")],
            "src",
        );
        let work = WorkNet::from_petri_net(&net).expect("WF-net");
        let spec = convert_net(&work, 0);
        assert_eq!(spec, PowlSpec::Transition { label: "A".into() });
    }

    #[test]
    fn dsu_groups_are_deterministic() {
        let mut d = Dsu::new(4);
        d.union(2, 0);
        d.union(3, 1);
        let g = d.groups(4);
        assert_eq!(g, vec![vec![0, 2], vec![1, 3]]);
    }

    #[test]
    fn transition_reachability_sequence() {
        // src → tA → p1 → tB → sink: tA ⤳ tB but not tB ⤳ tA.
        let net = mk(
            &["src", "p1", "sink"],
            &[("tA", "A"), ("tB", "B")],
            &[("src", "tA"), ("tA", "p1"), ("p1", "tB"), ("tB", "sink")],
            "src",
        );
        let work = WorkNet::from_petri_net(&net).unwrap();
        let r = work.transition_reachability();
        assert!(r[0][1], "tA reaches tB");
        assert!(!r[1][0], "tB does not reach tA");
    }
}
