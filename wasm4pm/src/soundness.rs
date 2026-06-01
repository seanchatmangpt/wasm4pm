//! Formal WF-net soundness and structural analysis.
//!
//! This module implements the formal Petri-net / workflow-net (WF-net) machinery
//! from Kourani, Park & van der Aalst, *"Hierarchical Decomposition of Separable
//! Workflow-Nets"* (arXiv:2602.15739v3), Section 3 *Preliminaries*. Every public
//! predicate maps to a numbered definition in that paper, so the oracle for each
//! test is the paper math, not a re-implementation of the code under test.
//!
//! Implemented:
//! - [`StructuralNet`] — a normalised structural view of [`PetriNet`] that
//!   classifies every arc endpoint as a place or a transition and exposes the
//!   pre-set `•x` and post-set `x•` (Def 3.1).
//! - [`StructuralNet::is_workflow_net`] — WF-net structure (Def 3.3): unique
//!   source, unique sink, every node on a source→sink path (connectivity).
//! - [`StructuralNet::is_free_choice`] — free-choiceness (Def 3.4).
//! - [`StructuralNet::is_state_machine`] — state-machine predicate (Def 3.10):
//!   `|•t| ≤ 1 ∧ |t•| ≤ 1` for every transition.
//! - [`StructuralNet::is_marked_graph`] — marked-graph predicate (Def 3.11):
//!   `|•p| ≤ 1 ∧ |p•| ≤ 1` for every place.
//! - [`StructuralNet::reachability_graph`] — bounded reachability-graph
//!   construction for safe nets (1-bounded markings); detects unsafe markings.
//! - [`StructuralNet::check_soundness`] — soundness (Def 3.5): no dead
//!   transitions, option to complete, proper completion.
//!
//! The reachability graph is the shared engine for soundness: we explore from
//! `[N_source]` (one token in the source place) and record, for every reachable
//! marking, the enabled transitions and whether the marking can still reach
//! `[N_sink]`. A net that is not safe (a place ever holds > 1 token) is reported
//! as unsafe — the paper restricts the translation algorithm to *safe* sound
//! WF-nets (Section 4), so an unsafe net is by definition outside the sound-and-safe
//! class even if the underlying reachable set were finite.

use crate::models::PetriNet;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap, HashSet, VecDeque};

/// A marking is a vector of token counts, one entry per place, indexed by the
/// place's position in [`StructuralNet::places`]. We use a `Vec<u32>` so a
/// marking is `Hash`/`Eq` and can key the reachability-graph visited set.
pub type Marking = Vec<u32>;

/// Hard bound on the number of distinct markings explored during reachability
/// analysis. For *safe* nets the reachable set is bounded by `2^|P|`, but for
/// pathological or unbounded nets we must still terminate; exceeding this limit
/// is reported via [`SoundnessReport::explored_truncated`].
pub const MAX_REACHABLE_MARKINGS: usize = 100_000;

/// Whether a node id refers to a place or a transition in the structural view.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum NodeKind {
    Place,
    Transition,
}

/// A normalised structural view of a [`PetriNet`].
///
/// [`PetriNet`] stores arcs as `(from, to)` string-id pairs without recording
/// whether each endpoint is a place or a transition. `StructuralNet` resolves
/// that once, building integer-indexed pre-/post-sets so the formal predicates
/// can be evaluated in `O(|F|)` rather than re-scanning the arc list repeatedly.
///
/// Indices: places are `0..places.len()`, transitions are `0..transitions.len()`.
#[derive(Debug, Clone)]
pub struct StructuralNet {
    /// Place ids, ordered; `places[i]` is the id of place index `i`.
    pub places: Vec<String>,
    /// Transition ids, ordered; `transitions[i]` is the id of transition index `i`.
    pub transitions: Vec<String>,
    /// Human-readable labels for transitions (activity names); index-aligned with `transitions`.
    pub transition_labels: Vec<String>,
    /// Whether each transition is silent/invisible; index-aligned with `transitions`.
    pub transition_invisible: Vec<bool>,
    /// `•t` for each transition index: the place indices feeding it.
    pub t_pre: Vec<Vec<usize>>,
    /// `t•` for each transition index: the place indices it produces into.
    pub t_post: Vec<Vec<usize>>,
    /// `•p` for each place index: the transition indices feeding it.
    pub p_pre: Vec<Vec<usize>>,
    /// `p•` for each place index: the transition indices it feeds.
    pub p_post: Vec<Vec<usize>>,
}

impl StructuralNet {
    /// Build a structural view from a [`PetriNet`].
    ///
    /// An arc endpoint is classified as a place if its id matches a declared
    /// place, otherwise as a transition if it matches a declared transition.
    /// Arcs referencing unknown ids, or place→place / transition→transition arcs
    /// (which violate the bipartite property of Def 3.1) are dropped from the
    /// flow relation; [`StructuralNet::is_workflow_net`] / soundness will then
    /// reflect the resulting (possibly disconnected) structure rather than panic.
    #[must_use]
    pub fn from_petri_net(net: &PetriNet) -> Self {
        let places: Vec<String> = net.places.iter().map(|p| p.id.clone()).collect();
        let transitions: Vec<String> = net.transitions.iter().map(|t| t.id.clone()).collect();
        let transition_labels: Vec<String> =
            net.transitions.iter().map(|t| t.label.clone()).collect();
        let transition_invisible: Vec<bool> = net
            .transitions
            .iter()
            .map(|t| t.is_invisible.unwrap_or(false))
            .collect();

        let mut kind: HashMap<&str, (NodeKind, usize)> = HashMap::new();
        for (i, p) in places.iter().enumerate() {
            kind.insert(p.as_str(), (NodeKind::Place, i));
        }
        for (i, t) in transitions.iter().enumerate() {
            // A place id always wins to keep determinism if ids collide.
            kind.entry(t.as_str()).or_insert((NodeKind::Transition, i));
        }

        let mut t_pre = vec![Vec::new(); transitions.len()];
        let mut t_post = vec![Vec::new(); transitions.len()];
        let mut p_pre = vec![Vec::new(); places.len()];
        let mut p_post = vec![Vec::new(); places.len()];

        for arc in &net.arcs {
            let from = kind.get(arc.from.as_str()).copied();
            let to = kind.get(arc.to.as_str()).copied();
            match (from, to) {
                // place -> transition: place feeds transition (•t and p•).
                (Some((NodeKind::Place, pi)), Some((NodeKind::Transition, ti))) => {
                    push_unique(&mut t_pre[ti], pi);
                    push_unique(&mut p_post[pi], ti);
                }
                // transition -> place: transition produces into place (t• and •p).
                (Some((NodeKind::Transition, ti)), Some((NodeKind::Place, pi))) => {
                    push_unique(&mut t_post[ti], pi);
                    push_unique(&mut p_pre[pi], ti);
                }
                // Any other combination violates bipartiteness; ignore the arc.
                _ => {}
            }
        }

        StructuralNet {
            places,
            transitions,
            transition_labels,
            transition_invisible,
            t_pre,
            t_post,
            p_pre,
            p_post,
        }
    }

    /// Number of places.
    #[inline]
    #[must_use]
    pub fn place_count(&self) -> usize {
        self.places.len()
    }

    /// Number of transitions.
    #[inline]
    #[must_use]
    pub fn transition_count(&self) -> usize {
        self.transitions.len()
    }

    /// Free-choiceness, Def 3.4.
    ///
    /// `N` is free-choice iff for any two transitions `t1, t2`:
    /// `(•t1 ∩ •t2 ≠ ∅) ⇒ (•t1 = •t2)`.
    ///
    /// Equivalently, every place that feeds more than one transition feeds all
    /// of them with the *same* pre-set — i.e. a shared input place implies an
    /// identical input place set. We check the contrapositive pairwise on the
    /// pre-sets, which is exact for the definition.
    #[must_use]
    pub fn is_free_choice(&self) -> bool {
        let presets: Vec<HashSet<usize>> = self
            .t_pre
            .iter()
            .map(|v| v.iter().copied().collect())
            .collect();
        for i in 0..presets.len() {
            for j in (i + 1)..presets.len() {
                let shares = presets[i].intersection(&presets[j]).next().is_some();
                if shares && presets[i] != presets[j] {
                    return false;
                }
            }
        }
        true
    }

    /// State-machine predicate, Def 3.10.
    ///
    /// `N` is a state machine iff every transition `t` has `|•t| ≤ 1 ∧ |t•| ≤ 1`.
    #[must_use]
    pub fn is_state_machine(&self) -> bool {
        self.t_pre
            .iter()
            .zip(&self.t_post)
            .all(|(pre, post)| pre.len() <= 1 && post.len() <= 1)
    }

    /// Marked-graph predicate, Def 3.11.
    ///
    /// `N` is a marked graph iff every place `p` has `|•p| ≤ 1 ∧ |p•| ≤ 1`.
    #[must_use]
    pub fn is_marked_graph(&self) -> bool {
        self.p_pre
            .iter()
            .zip(&self.p_post)
            .all(|(pre, post)| pre.len() <= 1 && post.len() <= 1)
    }

    /// Identify the unique source place index, Def 3.3:
    /// `{N_source} = {p ∈ P | •p = ∅}`. Returns `Err` if there is not exactly one.
    fn unique_source(&self) -> Result<usize, Vec<usize>> {
        let sources: Vec<usize> = (0..self.places.len())
            .filter(|&i| self.p_pre[i].is_empty())
            .collect();
        if sources.len() == 1 {
            Ok(sources[0])
        } else {
            Err(sources)
        }
    }

    /// Identify the unique sink place index, Def 3.3:
    /// `{N_sink} = {p ∈ P | p• = ∅}`. Returns `Err` if there is not exactly one.
    fn unique_sink(&self) -> Result<usize, Vec<usize>> {
        let sinks: Vec<usize> = (0..self.places.len())
            .filter(|&i| self.p_post[i].is_empty())
            .collect();
        if sinks.len() == 1 {
            Ok(sinks[0])
        } else {
            Err(sinks)
        }
    }

    /// WF-net structure check, Def 3.3.
    ///
    /// Verifies: (i) a unique source place `•p = ∅`, (ii) a unique sink place
    /// `p• = ∅`, and (iii) connectivity — every place and transition lies on a
    /// directed path from the source to the sink. Connectivity is checked by a
    /// forward reachability flood from the source and a backward flood from the
    /// sink over the bipartite flow relation; a node is "on a source→sink path"
    /// iff it is both forward-reachable from source and backward-reachable from sink.
    #[must_use]
    pub fn is_workflow_net(&self) -> WfNetCheck {
        let source = self.unique_source();
        let sink = self.unique_sink();

        let (source_idx, sink_idx) = match (source, sink) {
            (Ok(s), Ok(k)) => (s, k),
            (s, k) => {
                return WfNetCheck {
                    is_wf_net: false,
                    source: s.ok().map(|i| self.places[i].clone()),
                    sink: k.ok().map(|i| self.places[i].clone()),
                    disconnected_places: Vec::new(),
                    disconnected_transitions: Vec::new(),
                    reason: "WF-net requires exactly one source place (•p=∅) and one sink place (p•=∅)"
                        .to_string(),
                };
            }
        };

        // Forward flood from source place over the bipartite graph.
        let (fwd_p, fwd_t) = self.forward_reachable(source_idx);
        // Backward flood from sink place.
        let (bwd_p, bwd_t) = self.backward_reachable(sink_idx);

        let mut disconnected_places = Vec::new();
        for i in 0..self.places.len() {
            if !(fwd_p.contains(&i) && bwd_p.contains(&i)) {
                disconnected_places.push(self.places[i].clone());
            }
        }
        let mut disconnected_transitions = Vec::new();
        for i in 0..self.transitions.len() {
            if !(fwd_t.contains(&i) && bwd_t.contains(&i)) {
                disconnected_transitions.push(self.transitions[i].clone());
            }
        }

        let connected = disconnected_places.is_empty() && disconnected_transitions.is_empty();
        WfNetCheck {
            is_wf_net: connected,
            source: Some(self.places[source_idx].clone()),
            sink: Some(self.places[sink_idx].clone()),
            disconnected_places,
            disconnected_transitions,
            reason: if connected {
                "valid WF-net: unique source, unique sink, fully connected".to_string()
            } else {
                "some nodes are not on a source→sink path (connectivity, Def 3.3)".to_string()
            },
        }
    }

    /// Forward reachability flood from a starting place over the flow relation.
    /// Returns the sets of reachable place indices and transition indices.
    fn forward_reachable(&self, start_place: usize) -> (HashSet<usize>, HashSet<usize>) {
        let mut places = HashSet::new();
        let mut transitions = HashSet::new();
        let mut queue: VecDeque<(NodeKind, usize)> = VecDeque::new();
        places.insert(start_place);
        queue.push_back((NodeKind::Place, start_place));
        while let Some((kind, idx)) = queue.pop_front() {
            match kind {
                NodeKind::Place => {
                    for &t in &self.p_post[idx] {
                        if transitions.insert(t) {
                            queue.push_back((NodeKind::Transition, t));
                        }
                    }
                }
                NodeKind::Transition => {
                    for &p in &self.t_post[idx] {
                        if places.insert(p) {
                            queue.push_back((NodeKind::Place, p));
                        }
                    }
                }
            }
        }
        (places, transitions)
    }

    /// Backward reachability flood from a sink place over the reversed flow relation.
    fn backward_reachable(&self, start_place: usize) -> (HashSet<usize>, HashSet<usize>) {
        let mut places = HashSet::new();
        let mut transitions = HashSet::new();
        let mut queue: VecDeque<(NodeKind, usize)> = VecDeque::new();
        places.insert(start_place);
        queue.push_back((NodeKind::Place, start_place));
        while let Some((kind, idx)) = queue.pop_front() {
            match kind {
                NodeKind::Place => {
                    for &t in &self.p_pre[idx] {
                        if transitions.insert(t) {
                            queue.push_back((NodeKind::Transition, t));
                        }
                    }
                }
                NodeKind::Transition => {
                    for &p in &self.t_pre[idx] {
                        if places.insert(p) {
                            queue.push_back((NodeKind::Place, p));
                        }
                    }
                }
            }
        }
        (places, transitions)
    }

    /// Whether transition `t` is enabled at `marking` (Section 3.2): every place
    /// in `•t` holds at least one token.
    #[inline]
    fn enabled(&self, t: usize, marking: &Marking) -> bool {
        self.t_pre[t].iter().all(|&p| marking[p] >= 1)
    }

    /// Fire enabled transition `t` at `marking`: consume one token from each
    /// `•t` place, produce one in each `t•` place. Returns the successor marking.
    #[inline]
    fn fire(&self, t: usize, marking: &Marking) -> Marking {
        let mut next = marking.clone();
        for &p in &self.t_pre[t] {
            next[p] -= 1;
        }
        for &p in &self.t_post[t] {
            next[p] += 1;
        }
        next
    }

    /// The initial WF-net marking `[N_source]`: one token in the source place,
    /// zero elsewhere. Returns `None` if there is no unique source place.
    #[must_use]
    pub fn initial_marking(&self) -> Option<Marking> {
        let source = self.unique_source().ok()?;
        let mut m = vec![0u32; self.places.len()];
        m[source] = 1;
        Some(m)
    }

    /// The accepting WF-net marking `[N_sink]`: one token in the sink place,
    /// zero elsewhere. Returns `None` if there is no unique sink place.
    #[must_use]
    pub fn final_marking(&self) -> Option<Marking> {
        let sink = self.unique_sink().ok()?;
        let mut m = vec![0u32; self.places.len()];
        m[sink] = 1;
        Some(m)
    }

    /// Build the reachability graph from `[N_source]`.
    ///
    /// Returns a [`ReachabilityGraph`] recording every reachable marking, its
    /// successor markings (per fired transition), whether any marking is unsafe
    /// (a place held > 1 token), and whether exploration was truncated by the
    /// `MAX_REACHABLE_MARKINGS` bound. Used as the engine for soundness.
    #[must_use]
    pub fn reachability_graph(&self) -> ReachabilityGraph {
        let Some(initial) = self.initial_marking() else {
            return ReachabilityGraph {
                markings: Vec::new(),
                index: HashMap::new(),
                edges: Vec::new(),
                unsafe_marking: None,
                truncated: false,
                initial: None,
            };
        };

        let mut markings: Vec<Marking> = vec![initial.clone()];
        let mut index: HashMap<Marking, usize> = HashMap::new();
        index.insert(initial.clone(), 0);
        let mut edges: Vec<Vec<(usize, usize)>> = vec![Vec::new()]; // (transition, target_state)
        let mut queue: VecDeque<usize> = VecDeque::new();
        queue.push_back(0);

        let mut unsafe_marking: Option<Marking> = None;
        let mut truncated = false;

        while let Some(state) = queue.pop_front() {
            let current = markings[state].clone();
            for t in 0..self.transition_count() {
                if !self.enabled(t, &current) {
                    continue;
                }
                let next = self.fire(t, &current);
                // Safety check (Section 3.2): a safe net never exceeds 1 token/place.
                if unsafe_marking.is_none() && next.iter().any(|&c| c > 1) {
                    unsafe_marking = Some(next.clone());
                }
                let target = if let Some(&idx) = index.get(&next) {
                    idx
                } else {
                    if markings.len() >= MAX_REACHABLE_MARKINGS {
                        truncated = true;
                        continue;
                    }
                    let idx = markings.len();
                    index.insert(next.clone(), idx);
                    markings.push(next);
                    edges.push(Vec::new());
                    queue.push_back(idx);
                    idx
                };
                edges[state].push((t, target));
            }
        }

        ReachabilityGraph {
            markings,
            index,
            edges,
            unsafe_marking,
            truncated,
            initial: Some(initial),
        }
    }

    /// Full soundness analysis, Def 3.5 (plus safeness from Section 3.2).
    ///
    /// A WF-net `N` is **sound** iff:
    /// 1. **No dead transitions:** every `t ∈ T` is enabled at some marking
    ///    reachable from `[N_source]`.
    /// 2. **Option to complete:** from every marking reachable from `[N_source]`,
    ///    `[N_sink]` is reachable.
    /// 3. **Proper completion:** `[N_sink]` is the *only* reachable marking with
    ///    a token in the sink place.
    ///
    /// This routine first verifies the WF-net structure (Def 3.3); a net that is
    /// not a WF-net cannot be sound. It then builds the reachability graph and
    /// evaluates all three conditions plus safeness.
    #[must_use]
    pub fn check_soundness(&self) -> SoundnessReport {
        let wf = self.is_workflow_net();
        let free_choice = self.is_free_choice();
        let state_machine = self.is_state_machine();
        let marked_graph = self.is_marked_graph();

        if !wf.is_wf_net {
            return SoundnessReport {
                is_wf_net: false,
                is_safe: false,
                is_free_choice: free_choice,
                is_state_machine: state_machine,
                is_marked_graph: marked_graph,
                no_dead_transitions: false,
                option_to_complete: false,
                proper_completion: false,
                is_sound: false,
                dead_transitions: self.transition_labels.clone(),
                deadlock_markings: Vec::new(),
                improper_markings: Vec::new(),
                reachable_marking_count: 0,
                explored_truncated: false,
                reason: format!("not a WF-net: {}", wf.reason),
            };
        }

        let sink = self.unique_sink().expect("WF-net has unique sink");
        let rg = self.reachability_graph();
        let is_safe = rg.unsafe_marking.is_none() && !rg.truncated;

        // --- Condition 1: no dead transitions ---------------------------------
        // A transition is "alive" iff it is enabled at some reachable marking.
        let mut alive = vec![false; self.transition_count()];
        for m in &rg.markings {
            for t in 0..self.transition_count() {
                if !alive[t] && self.enabled(t, m) {
                    alive[t] = true;
                }
            }
        }
        let dead_transitions: Vec<String> = alive
            .iter()
            .enumerate()
            .filter(|(_, &a)| !a)
            .map(|(t, _)| self.transition_labels[t].clone())
            .collect();
        let no_dead_transitions = dead_transitions.is_empty();

        // --- Condition 2: option to complete ----------------------------------
        // From every reachable marking, [N_sink] is reachable. Compute the set of
        // markings that can reach the final marking via reverse BFS over RG edges,
        // then report any reachable marking NOT in that set as a deadlock witness.
        let final_marking = self.final_marking().expect("WF-net has unique sink");
        let final_state = rg.index.get(&final_marking).copied();
        let mut can_complete = vec![false; rg.markings.len()];
        if let Some(fs) = final_state {
            // Build reverse adjacency.
            let mut rev: Vec<Vec<usize>> = vec![Vec::new(); rg.markings.len()];
            for (src, outs) in rg.edges.iter().enumerate() {
                for &(_, tgt) in outs {
                    rev[tgt].push(src);
                }
            }
            let mut queue = VecDeque::new();
            can_complete[fs] = true;
            queue.push_back(fs);
            while let Some(s) = queue.pop_front() {
                for &pred in &rev[s] {
                    if !can_complete[pred] {
                        can_complete[pred] = true;
                        queue.push_back(pred);
                    }
                }
            }
        }
        let deadlock_markings: Vec<Marking> = can_complete
            .iter()
            .enumerate()
            .filter(|(_, &c)| !c)
            .map(|(s, _)| rg.markings[s].clone())
            .collect();
        let option_to_complete = final_state.is_some() && deadlock_markings.is_empty();

        // --- Condition 3: proper completion -----------------------------------
        // [N_sink] is the ONLY reachable marking with a token in the sink place.
        // I.e. no reachable marking other than exactly [N_sink] holds a sink token.
        let improper_markings: Vec<Marking> = rg
            .markings
            .iter()
            .filter(|m| m[sink] >= 1 && **m != final_marking)
            .cloned()
            .collect();
        let proper_completion = improper_markings.is_empty();

        let is_sound = no_dead_transitions && option_to_complete && proper_completion;

        let reason = if is_sound && is_safe {
            "sound and safe WF-net (Def 3.5 + safeness)".to_string()
        } else if is_sound && !is_safe {
            "sound but not safe (a place can hold >1 token); outside the safe class of Section 4"
                .to_string()
        } else {
            let mut parts = Vec::new();
            if !no_dead_transitions {
                parts.push(format!("dead transitions: {dead_transitions:?}"));
            }
            if !option_to_complete {
                parts.push(format!(
                    "no option to complete: {} deadlock marking(s)",
                    deadlock_markings.len()
                ));
            }
            if !proper_completion {
                parts.push(format!(
                    "improper completion: {} marking(s) hold a sink token besides [N_sink]",
                    improper_markings.len()
                ));
            }
            if !is_safe {
                parts.push("unsafe (place holds >1 token)".to_string());
            }
            format!("unsound: {}", parts.join("; "))
        };

        SoundnessReport {
            is_wf_net: true,
            is_safe,
            is_free_choice: free_choice,
            is_state_machine: state_machine,
            is_marked_graph: marked_graph,
            no_dead_transitions,
            option_to_complete,
            proper_completion,
            is_sound,
            dead_transitions,
            deadlock_markings,
            improper_markings,
            reachable_marking_count: rg.markings.len(),
            explored_truncated: rg.truncated,
            reason,
        }
    }
}

/// Append `x` to `v` only if not already present (keeps pre-/post-sets free of
/// duplicate arcs, which is what the set notation `•x`, `x•` requires).
#[inline]
fn push_unique(v: &mut Vec<usize>, x: usize) {
    if !v.contains(&x) {
        v.push(x);
    }
}

/// Result of the WF-net structural check (Def 3.3).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WfNetCheck {
    /// Whether the net satisfies all three WF-net conditions.
    pub is_wf_net: bool,
    /// Id of the unique source place, if exactly one exists.
    pub source: Option<String>,
    /// Id of the unique sink place, if exactly one exists.
    pub sink: Option<String>,
    /// Places not on any source→sink path.
    pub disconnected_places: Vec<String>,
    /// Transitions not on any source→sink path.
    pub disconnected_transitions: Vec<String>,
    /// Human-readable explanation.
    pub reason: String,
}

/// The reachability graph of a (safe) net explored from `[N_source]`.
#[derive(Debug, Clone)]
pub struct ReachabilityGraph {
    /// All distinct reachable markings; index 0 is the initial marking.
    pub markings: Vec<Marking>,
    /// Lookup from a marking to its index in `markings`.
    pub index: HashMap<Marking, usize>,
    /// `edges[s]` = `(transition_index, target_state_index)` pairs out of state `s`.
    pub edges: Vec<Vec<(usize, usize)>>,
    /// The first marking found that holds > 1 token in some place, if any.
    pub unsafe_marking: Option<Marking>,
    /// Whether exploration hit the `MAX_REACHABLE_MARKINGS` bound.
    pub truncated: bool,
    /// The initial marking `[N_source]`, if the net had a unique source.
    pub initial: Option<Marking>,
}

/// Full soundness report (Def 3.5 + structural predicates).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SoundnessReport {
    /// Net is a structural WF-net (Def 3.3).
    pub is_wf_net: bool,
    /// Net is safe: no reachable marking holds > 1 token in any place.
    pub is_safe: bool,
    /// Net is free-choice (Def 3.4).
    pub is_free_choice: bool,
    /// Net is a state machine (Def 3.10).
    pub is_state_machine: bool,
    /// Net is a marked graph (Def 3.11).
    pub is_marked_graph: bool,
    /// Soundness condition 1: no dead transitions.
    pub no_dead_transitions: bool,
    /// Soundness condition 2: option to complete.
    pub option_to_complete: bool,
    /// Soundness condition 3: proper completion.
    pub proper_completion: bool,
    /// Net is sound (all three conditions hold).
    pub is_sound: bool,
    /// Labels of transitions that are never enabled at any reachable marking.
    pub dead_transitions: Vec<String>,
    /// Reachable markings from which `[N_sink]` is unreachable (deadlocks / livelocks).
    pub deadlock_markings: Vec<Marking>,
    /// Reachable markings (other than `[N_sink]`) holding a token in the sink place.
    pub improper_markings: Vec<Marking>,
    /// Number of distinct reachable markings explored.
    pub reachable_marking_count: usize,
    /// Whether exploration was truncated (suggests an unbounded / very large net).
    pub explored_truncated: bool,
    /// Human-readable verdict.
    pub reason: String,
}

impl SoundnessReport {
    /// Convenience: a sound *and* safe net, the class the paper's translation
    /// targets (Section 4: "safe and sound WF-nets").
    #[must_use]
    pub fn is_sound_and_safe(&self) -> bool {
        self.is_sound && self.is_safe
    }
}

/// Analyse a [`PetriNet`] for soundness and structural class. Pure-Rust entry
/// point usable from integration tests on native targets.
#[must_use]
pub fn analyze_petri_net(net: &PetriNet) -> SoundnessReport {
    StructuralNet::from_petri_net(net).check_soundness()
}

// ---------------------------------------------------------------------------
// WASM-reachable surface
// ---------------------------------------------------------------------------

#[cfg(target_arch = "wasm32")]
use wasm_bindgen::prelude::*;

/// Build a deterministic JSON summary of the soundness + structural analysis of
/// a Petri net handle. Shared by the WASM export and the native test path so the
/// JSON contract is exercised on both targets.
fn soundness_json(net: &PetriNet) -> serde_json::Value {
    let report = analyze_petri_net(net);
    let labels = |markings: &[Marking]| -> Vec<BTreeMap<String, u32>> {
        let snet = StructuralNet::from_petri_net(net);
        markings
            .iter()
            .map(|m| {
                snet.places
                    .iter()
                    .zip(m.iter())
                    .filter(|(_, &c)| c > 0)
                    .map(|(p, &c)| (p.clone(), c))
                    .collect()
            })
            .collect()
    };
    serde_json::json!({
        "is_wf_net": report.is_wf_net,
        "is_safe": report.is_safe,
        "is_free_choice": report.is_free_choice,
        "is_state_machine": report.is_state_machine,
        "is_marked_graph": report.is_marked_graph,
        "no_dead_transitions": report.no_dead_transitions,
        "option_to_complete": report.option_to_complete,
        "proper_completion": report.proper_completion,
        "is_sound": report.is_sound,
        "is_sound_and_safe": report.is_sound_and_safe(),
        "dead_transitions": report.dead_transitions,
        "deadlock_markings": labels(&report.deadlock_markings),
        "improper_markings": labels(&report.improper_markings),
        "reachable_marking_count": report.reachable_marking_count,
        "explored_truncated": report.explored_truncated,
        "reason": report.reason,
    })
}

/// Native-target test shim: returns the soundness JSON string for a [`PetriNet`].
/// Mirrors exactly what the WASM export emits, so the JSON contract is tested
/// under `cargo test` even though `#[wasm_bindgen]` functions cannot be called natively.
#[cfg(not(target_arch = "wasm32"))]
#[must_use]
pub fn check_wf_net_soundness_native(net: &PetriNet) -> String {
    soundness_json(net).to_string()
}

/// WASM export: analyse a stored Petri net handle for soundness (Def 3.5),
/// safeness, free-choice (Def 3.4), state-machine (Def 3.10) and marked-graph
/// (Def 3.11) structure. Returns the JSON summary as a `JsValue` string.
#[cfg(target_arch = "wasm32")]
#[wasm_bindgen]
pub fn check_wf_net_soundness(petri_net_handle: &str) -> Result<JsValue, JsValue> {
    use crate::state::{get_or_init_state, StoredObject};
    use crate::utilities::to_js_str;

    let net = get_or_init_state().with_object(petri_net_handle, |obj| match obj {
        Some(StoredObject::PetriNet(pn)) => Ok(pn.clone()),
        Some(_) => Err(crate::error::js_val("Handle is not a PetriNet")),
        None => Err(crate::error::js_val("PetriNet not found")),
    })?;

    to_js_str(&soundness_json(&net))
}
