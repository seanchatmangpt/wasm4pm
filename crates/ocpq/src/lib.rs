//! # OCPQ — Object-Centric Process Querying & Constraints
//!
//! A faithful, paper-grounded implementation of the OCPQ runtime described in
//! *Küsters & van der Aalst, "OCPQ: Object-Centric Process Querying &
//! Constraints" (arXiv:2506.11541v1, 2025)*. The formal objects below are
//! implemented exactly as defined; the doc-comments cite the definition each
//! type/function realizes so the test oracles are the paper, not the code
//! (no FM-5 self-reference).
//!
//! Built on top of [`wasm4pm_compat::ocel::OCEL`] (the `L = (E, O, eval, oaval)` OCED of
//! agent A2), whose `e2o`, `o2o`, `event_set`, `object_set` and `time` surfaces
//! supply the relations the BASIC predicates quantify over.
//!
//! ## Formal map
//! - [`Binding`]                — Def. 3 (variable bindings `b = b1 ∪ b2`)
//! - [`Binding::refines`]        — Def. 4 (parent-child relation `⊑_L`)
//! - [`BasicPredicate`]          — Def. 5 (`BASIC_L`: E2O / O2O / TBE)
//! - [`BindingBox`]              — Def. 6 (`b_L = (Var, Pred)`) + [`BindingBox::output`] (`out_L`)
//! - [`BindingBox::refines`]     — Def. 7 (`a ⪯_L b`)
//! - [`QueryTree`]               — Def. 9 (`T = (V, F, r, l, box)`)
//! - [`ChildSet`]                — `CHILD SET_u^T (n_min, n_max)` (Sect. 4)
//! - [`Constraint`] / [`evaluate_constraint`] — `constr(v)` → satisfied / violated (Fig. 6)

use std::collections::{BTreeMap, HashMap, HashSet};

use serde::{Deserialize, Serialize};
use wasm4pm_compat::ocel::OCEL;

#[cfg(feature = "wasm")]
use wasm_bindgen::prelude::*;

// ---------------------------------------------------------------------------
// Variable types & the universe split (Def. 1, Def. 6 `Var`)
// ---------------------------------------------------------------------------

/// Whether a variable ranges over the universe of **events** (`U_evVar`) or
/// **objects** (`U_obVar`) — the disjoint variable universes of Def. 1.
#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
pub enum VarKind {
    /// Object variable (`v' ∈ U_obVar`), bound to an object of `O_L`.
    Object,
    /// Event variable (`v ∈ U_evVar`), bound to an event of `E_L`.
    Event,
}

/// A variable declaration in `Var` (Def. 6): a name, its kind, and the set of
/// event/object **types** the variable may bind to.
///
/// `Var ⊆ { ev ∪ ob | ev ∈ U_evVar ⇸ P(U_etype) ∧ ob ∈ U_obVar ⇸ P(U_otype) }`
/// — a partial function specifying *which* types each variable selects. An
/// empty `types` set means "any type of that kind".
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
pub struct VarDecl {
    /// Variable name (e.g. `"o1"`, `"e1"`).
    pub name: String,
    /// Whether this is an event or object variable.
    pub kind: VarKind,
    /// Permitted event-/object-types; empty = any of that kind.
    #[serde(default)]
    pub types: Vec<String>,
}

impl VarDecl {
    /// True iff this declaration admits the given concrete type name. An empty
    /// `types` list admits everything of the right kind (`Object` / `Event`).
    #[must_use]
    pub fn admits_type(&self, ty: &str) -> bool {
        self.types.is_empty() || self.types.iter().any(|t| t == ty)
    }
}

// ---------------------------------------------------------------------------
// Bindings (Def. 3, Def. 4)
// ---------------------------------------------------------------------------

/// A **variable binding** `b ∈ B_L` (Def. 3): a partial function from variable
/// names to concrete event/object **ids** of the OCED. Internally one map; the
/// `VarKind` of each name (from the box's `Var`) disambiguates events/objects,
/// exactly as the paper's `b = b1 ∪ b2` symmetric union of two disjoint-domain
/// partial functions.
#[derive(Serialize, Deserialize, Debug, Clone, Default, PartialEq, Eq, Hash)]
pub struct Binding {
    /// var-name → bound element id.
    pub map: BTreeMap<String, String>,
}

impl Binding {
    /// The empty binding `{}` — the smallest element of `B_L` w.r.t. `⊑_L`.
    #[must_use]
    pub fn empty() -> Self {
        Self::default()
    }

    /// Look up the id bound to `var`, if any (`b(var)`; `⊥` ⇒ `None`).
    #[must_use]
    pub fn get(&self, var: &str) -> Option<&str> {
        self.map.get(var).map(String::as_str)
    }

    /// Extend with a binding `var ↦ id`, returning the grown binding.
    #[must_use]
    pub fn with(mut self, var: &str, id: &str) -> Self {
        self.map.insert(var.to_string(), id.to_string());
        self
    }

    /// **Def. 4** — the parent-child relation `p ⊑_L c`: `p ⊑_L c` iff for every
    /// variable in `dom(p)`, `p(x) = c(x)`. I.e. `c` is a *child binding* of `p`
    /// (agrees on everything the parent fixes, possibly binding more). Here
    /// `self` is the parent `p` and `child` is `c`.
    #[must_use]
    pub fn refines(&self, child: &Binding) -> bool {
        self.map
            .iter()
            .all(|(k, v)| child.map.get(k).is_some_and(|cv| cv == v))
    }
}

// ---------------------------------------------------------------------------
// BASIC predicates (Def. 5)
// ---------------------------------------------------------------------------

/// `BASIC_L ⊆ P_L` — the three basic binding predicates of Def. 5.
///
/// A qualifier of `None` denotes the paper's `*` (any qualifier).
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(tag = "kind")]
pub enum BasicPredicate {
    /// **Event-to-Object** `E2O(v, v', q)`:
    /// `b ⊨ E2O(v,v',q) ⇔ b(v) ∈ E_L ∧ b(v') ∈ O_L ∧ b(v') ∈ obj_L^q(b(v))`.
    /// `v` is an event variable, `v'` an object variable.
    E2O {
        /// Event variable name.
        event: String,
        /// Object variable name.
        object: String,
        /// Qualifier `q`; `None` ⇒ `*` (any qualifier).
        #[serde(default)]
        qualifier: Option<String>,
    },
    /// **Object-to-Object** `O2O(v, v', q)`:
    /// `b ⊨ O2O(v,v',q) ⇔ b(v) ∈ O_L ∧ b(v') ∈ O_L ∧ b(v') ∈ obj_L^q(b(v))`.
    /// Both `v` and `v'` are object variables; `obj_L^q(o)` are `o`'s qualified
    /// O2O references.
    O2O {
        /// Source object variable.
        from: String,
        /// Target object variable.
        to: String,
        /// Qualifier `q`; `None` ⇒ `*`.
        #[serde(default)]
        qualifier: Option<String>,
    },
    /// **Time Between Events** `TBE(v, v', tmin, tmax)`:
    /// `b ⊨ TBE(v,v',tmin,tmax) ⇔ b(v) ∈ E_L ∧ b(v') ∈ E_L ∧
    /// tmin ≤ time_L(b(v')) − time_L(b(v)) ≤ tmax`.
    /// `tmin`/`tmax` are durations in **seconds**.
    Tbe {
        /// First event variable (`v`).
        from: String,
        /// Second event variable (`v'`).
        to: String,
        /// Minimum gap `time(v') - time(v)` in seconds (inclusive).
        tmin_secs: i64,
        /// Maximum gap in seconds (inclusive).
        tmax_secs: i64,
    },
}

/// Per-evaluation **id index** over the OCED: id membership sets, event times,
/// and qualified reference lists keyed by source id. Built once per
/// [`evaluate_constraint`] call (and once per [`BindingBox::output`]
/// enumeration) so predicate membership checks are hash lookups instead of
/// linear scans over `E_L ∪ O_L`.
pub(crate) struct IdIndex<'a> {
    /// Event ids (`E_L`).
    event_ids: HashSet<&'a str>,
    /// Object ids (`O_L`).
    object_ids: HashSet<&'a str>,
    /// Event id → timestamp seconds.
    event_time: HashMap<&'a str, i64>,
    /// Event id → its qualified object refs (`(object_id, qualifier)`).
    e2o: HashMap<&'a str, Vec<(&'a str, &'a str)>>,
    /// Object id → the `(event_id, qualifier)` pairs of events referencing
    /// it — the inverse E2O index, for object-side propagation.
    e2o_inv: HashMap<&'a str, Vec<(&'a str, &'a str)>>,
    /// Object id → its qualified O2O refs (`(object_id, qualifier)`).
    o2o: HashMap<&'a str, Vec<(&'a str, &'a str)>>,
    /// Event id → event type name.
    event_type: HashMap<&'a str, &'a str>,
    /// Object id → object type name.
    object_type: HashMap<&'a str, &'a str>,
}

impl<'a> IdIndex<'a> {
    /// Index the log once: `O(|E| + |O| + |e2o| + |o2o|)`.
    pub(crate) fn new(log: &'a OCEL) -> Self {
        let mut event_ids = HashSet::with_capacity(log.events.len());
        let mut event_time = HashMap::with_capacity(log.events.len());
        let mut e2o: HashMap<&'a str, Vec<(&'a str, &'a str)>> =
            HashMap::with_capacity(log.events.len());
        let mut e2o_inv: HashMap<&'a str, Vec<(&'a str, &'a str)>> =
            HashMap::with_capacity(log.objects.len());
        let mut event_type: HashMap<&'a str, &'a str> = HashMap::with_capacity(log.events.len());
        for e in &log.events {
            event_ids.insert(e.id.as_str());
            event_time.insert(e.id.as_str(), e.time.timestamp());
            event_type.insert(e.id.as_str(), e.event_type.as_str());
            let refs = e
                .relationships
                .iter()
                .map(|r| (r.object_id.as_str(), r.qualifier.as_str()))
                .collect();
            e2o.insert(e.id.as_str(), refs);
            for r in &e.relationships {
                e2o_inv
                    .entry(r.object_id.as_str())
                    .or_default()
                    .push((e.id.as_str(), r.qualifier.as_str()));
            }
        }
        let mut object_ids = HashSet::with_capacity(log.objects.len());
        let mut o2o: HashMap<&'a str, Vec<(&'a str, &'a str)>> =
            HashMap::with_capacity(log.objects.len());
        let mut object_type: HashMap<&'a str, &'a str> = HashMap::with_capacity(log.objects.len());
        for o in &log.objects {
            object_ids.insert(o.id.as_str());
            object_type.insert(o.id.as_str(), o.object_type.as_str());
            let refs = o
                .relationships
                .iter()
                .map(|r| (r.object_id.as_str(), r.qualifier.as_str()))
                .collect();
            o2o.insert(o.id.as_str(), refs);
        }
        Self {
            event_ids,
            object_ids,
            event_time,
            e2o,
            e2o_inv,
            o2o,
            event_type,
            object_type,
        }
    }
}

/// The engine-wide evaluation context threaded through constraint evaluation:
/// the per-call [`IdIndex`], the memoized child-node outputs
/// (child node id → `out_L(box(child))`, computed once per call instead of
/// once per parent binding), and the projection count index that turns
/// CHILD SET counting into hash lookups (see [`EvalContext::child_count`]).
pub(crate) struct EvalContext<'a> {
    /// The query tree under evaluation (for resolving CHILD SET edges).
    pub(crate) tree: &'a QueryTree,
    /// The OCED under evaluation.
    pub(crate) log: &'a OCEL,
    /// Per-call id index for membership checks.
    pub(crate) index: IdIndex<'a>,
    /// Memoized `out_L(box(node))` per node id.
    child_outputs: HashMap<String, Vec<Binding>>,
    /// `(child node id, parent var names)` → projection → count of child
    /// bindings projecting to it.
    count_index: HashMap<(String, Vec<String>), HashMap<Binding, usize>>,
}

impl<'a> EvalContext<'a> {
    pub(crate) fn new(tree: &'a QueryTree, log: &'a OCEL) -> Self {
        Self {
            tree,
            index: IdIndex::new(log),
            log,
            child_outputs: HashMap::new(),
            count_index: HashMap::new(),
        }
    }

    /// `out_L(box(node_id))`, computed once per evaluation call and memoized.
    fn child_output(&mut self, node_id: &str) -> Option<&[Binding]> {
        if !self.child_outputs.contains_key(node_id) {
            let log: &'a OCEL = self.log; // `&'a OCEL` is `Copy` — compute before mutating.
            if let Some(node) = self.tree.node(node_id) {
                let out = node.bbox.output_indexed(log, &self.index);
                self.child_outputs.insert(node_id.to_string(), out);
            }
        }
        self.child_outputs.get(node_id).map(Vec::as_slice)
    }

    /// Count of child bindings `x ∈ out_L(box(child))` with `b ⊑_L x`, via a
    /// projection count index: the index maps each child binding restricted to
    /// the parent's variable domain to the number of child bindings sharing
    /// that restriction, so `b ⊑ x` counting is one hash lookup per parent
    /// binding (linear in output size, not `|out(parent)|·|out(child)|`).
    fn child_count(&mut self, child_id: &str, parent_vars: &[&str], b: &Binding) -> usize {
        let key = (
            child_id.to_string(),
            parent_vars.iter().map(|s| (*s).to_string()).collect::<Vec<_>>(),
        );
        if !self.count_index.contains_key(&key) {
            let mut proj: HashMap<Binding, usize> = HashMap::new();
            let outs: Vec<Binding> = self.child_output(child_id).unwrap_or_default().to_vec();
            for x in outs {
                let restricted: Binding = Binding {
                    map: x
                        .map
                        .iter()
                        .filter(|(k, _)| parent_vars.contains(&k.as_str()))
                        .map(|(k, v)| (k.clone(), v.clone()))
                        .collect(),
                };
                *proj.entry(restricted).or_insert(0) += 1;
            }
            self.count_index.insert(key.clone(), proj);
        }
        self.count_index[&key]
            .get(b)
            .copied()
            .unwrap_or(0)
    }
}

impl BasicPredicate {
    /// `b ⊨ p` — does binding `b` satisfy this BASIC predicate under `L`?
    ///
    /// If a referenced variable is unbound in `b`, the predicate is **not**
    /// satisfied (`⊥` cannot be in any relation), matching the paper note that
    /// `b_5 ⊭ s_1` when `b_5` does not assign `o2`.
    #[must_use]
    pub fn holds(&self, b: &Binding, log: &OCEL) -> bool {
        self.holds_indexed(b, &IdIndex::new(log))
    }

    /// Same satisfaction relation, evaluated against a prebuilt [`IdIndex`]
    /// (membership via hash lookups, not linear scans).
    pub(crate) fn holds_indexed(&self, b: &Binding, ix: &IdIndex<'_>) -> bool {
        match self {
            BasicPredicate::E2O {
                event,
                object,
                qualifier,
            } => {
                let (Some(ev), Some(ob)) = (b.get(event), b.get(object)) else {
                    return false;
                };
                // b(v) ∈ E_L  ∧  b(v') ∈ O_L
                if !ix.event_ids.contains(ev) || !ix.object_ids.contains(ob) {
                    return false;
                }
                // b(v') ∈ obj_L^q(b(v)):  the event's qualified object refs.
                ix.e2o.get(ev).is_some_and(|refs| {
                    refs.iter()
                        .any(|(oid, q)| *oid == ob && qual_matches(qualifier, q))
                })
            }
            BasicPredicate::O2O {
                from,
                to,
                qualifier,
            } => {
                let (Some(src), Some(dst)) = (b.get(from), b.get(to)) else {
                    return false;
                };
                if !ix.object_ids.contains(src) || !ix.object_ids.contains(dst) {
                    return false;
                }
                ix.o2o.get(src).is_some_and(|refs| {
                    refs.iter()
                        .any(|(oid, q)| *oid == dst && qual_matches(qualifier, q))
                })
            }
            BasicPredicate::Tbe {
                from,
                to,
                tmin_secs,
                tmax_secs,
            } => {
                let (Some(e1), Some(e2)) = (b.get(from), b.get(to)) else {
                    return false;
                };
                let (Some(t1), Some(t2)) = (ix.event_time.get(e1), ix.event_time.get(e2)) else {
                    return false;
                };
                let gap = t2 - t1;
                gap >= *tmin_secs && gap <= *tmax_secs
            }
        }
    }
}

/// `q = * ∨ q = q'` — qualifier match where `None` plays the role of `*`.
fn qual_matches(want: &Option<String>, have: &str) -> bool {
    match want {
        None => true,
        Some(w) => w == have,
    }
}

// ---------------------------------------------------------------------------
// Binding box (Def. 6) + output set (out_L) + refinement (Def. 7)
// ---------------------------------------------------------------------------

/// A **binding box** `b_L = (Var, Pred)` (Def. 6): the simple-query primitive.
///
/// `Pred ⊆ P_L` is, in `BASIC_L`, a set of [`BasicPredicate`]s. Evaluating the
/// box yields its output set `out_L(b_L) = { b ∈ B_L | b ⊨ b_L }` (Def. 6):
/// all bindings that bind exactly `dom(Var)` to elements of the right type and
/// satisfy every predicate.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct BindingBox {
    /// `Var` — the variable declarations (names, kinds, permitted types).
    #[serde(default)]
    pub vars: Vec<VarDecl>,
    /// `Pred` — the BASIC predicates filtering the bindings.
    #[serde(default)]
    pub preds: Vec<BasicPredicate>,
}

impl BindingBox {
    /// **Def. 6** — `b ⊨ b_L`: `b` satisfies `Pred`, `dom(b) = dom(Var)`, and
    /// every variable is bound to an element of `E_L ∪ O_L` whose type is in
    /// `Var(v)`. Assumes `b`'s domain already equals `dom(Var)` (the enumerator
    /// guarantees this); type+predicate checks are re-validated here so the
    /// satisfaction relation is total and self-contained.
    #[must_use]
    pub fn satisfied_by(&self, b: &Binding, log: &OCEL) -> bool {
        let ix = IdIndex::new(log);
        self.satisfied_by_indexed(b, log, &ix)
    }

    /// [`Self::satisfied_by`] against a prebuilt [`IdIndex`] — the hot path
    /// used by enumeration and constraint evaluation (no per-candidate scans).
    pub(crate) fn satisfied_by_indexed(&self, b: &Binding, _log: &OCEL, ix: &IdIndex<'_>) -> bool {
        // dom(b) = dom(Var)
        if b.map.len() != self.vars.len() {
            return false;
        }
        for decl in &self.vars {
            let Some(id) = b.get(&decl.name) else {
                return false;
            };
            // b(v) ∈ E_L ∪ O_L  ∧  type_L(b(v)) ∈ Var(v)
            let ty_ok = match decl.kind {
                VarKind::Event => ix
                    .event_type
                    .get(id)
                    .is_some_and(|t| decl.admits_type(t)),
                VarKind::Object => ix
                    .object_type
                    .get(id)
                    .is_some_and(|t| decl.admits_type(t)),
            };
            if !ty_ok {
                return false;
            }
        }
        // b ⊨ Pred
        self.preds.iter().all(|p| p.holds_indexed(b, ix))
    }

    /// `out_L(b_L)` — the **output set** of the box (Def. 6): every binding over
    /// `dom(Var)` that satisfies the box.
    ///
    /// Enumeration strategy: a backtracking join with forward propagation
    /// rather than a blind Cartesian product. Each E2O predicate
    /// `E2O(e, o, q)` is a *choice-link*: once `e` is bound, `o`'s candidate
    /// set is narrowed to exactly `e`'s qualified refs (intersected with the
    /// declared types). Variables are bound in an order that binds linked
    /// event variables first, so for connected boxes (the OCPQ norm: every
    /// object var is E2O-linked to some event var) enumeration cost is
    /// proportional to the size of the output set plus the indexed refs, not
    /// the full cross product. The exact and complete semantics are
    /// unchanged: the result is still every binding satisfying the box.
    #[must_use]
    pub fn output(&self, log: &OCEL) -> Vec<Binding> {
        let ix = IdIndex::new(log);
        self.output_indexed(log, &ix)
    }

    /// [`Self::output`] against a prebuilt [`IdIndex`] (shared across the
    /// whole constraint evaluation — one index per `evaluate_constraint` call).
    pub(crate) fn output_indexed(&self, log: &OCEL, ix: &IdIndex<'_>) -> Vec<Binding> {
        // Per-variable candidate id lists (type-admissible domains).
        let domains: Vec<Vec<&str>> = self
            .vars
            .iter()
            .map(|decl| match decl.kind {
                VarKind::Event => log
                    .events
                    .iter()
                    .filter(|e| decl.admits_type(&e.event_type))
                    .map(|e| e.id.as_str())
                    .collect(),
                VarKind::Object => log
                    .objects
                    .iter()
                    .filter(|o| decl.admits_type(&o.object_type))
                    .map(|o| o.id.as_str())
                    .collect(),
            })
            .collect();

        let order = self.join_order(&domains);
        // Reorder the domain lists to match the join order: level `idx` of the
        // enumeration binds variable `order[idx]` and draws from
        // `ordered_domains[idx]`.
        let ordered_domains: Vec<Vec<&str>> =
            order.iter().map(|&i| domains[i].clone()).collect();
        let mut out = Vec::new();
        let mut current = Binding::empty();
        let active: Vec<(usize, Vec<&str>)> = Vec::new();
        self.product(0, &ordered_domains, &order, &active, &mut current, log, ix, &mut out);
        out
    }

    /// Variable binding order for the join: event-side-of-E2O variables first
    /// (binding them enables forward propagation to their object partners),
    /// then remaining variables by ascending domain size. Stable, so ties
    /// keep declaration order.
    fn join_order(&self, domains: &[Vec<&str>]) -> Vec<usize> {
        let n = self.vars.len();
        // E2O adjacency: name → partner names (both directions).
        let mut links: HashMap<&str, Vec<&str>> = HashMap::new();
        for p in &self.preds {
            if let BasicPredicate::E2O { event, object, .. } = p {
                links
                    .entry(event.as_str())
                    .or_default()
                    .push(object.as_str());
                links
                    .entry(object.as_str())
                    .or_default()
                    .push(event.as_str());
            }
        }
        let event_side = |i: usize| {
            self.preds.iter().any(|p| {
                matches!(p, BasicPredicate::E2O { event, .. } if *event == self.vars[i].name)
            })
        };
        let mut order: Vec<usize> = Vec::with_capacity(n);
        let mut placed = vec![false; n];
        while order.len() < n {
            // 1. an unbound E2O partner of the most recently placed var;
            let mut next: Option<usize> = None;
            if let Some(&last) = order.last() {
                if let Some(partners) = links.get(self.vars[last].name.as_str()) {
                    next = (0..n)
                        .find(|&j| !placed[j] && partners.contains(&self.vars[j].name.as_str()));
                }
            }
            // 2. otherwise an event-side var (propagation source),
            if next.is_none() {
                next = (0..n).find(|&j| !placed[j] && event_side(j));
            }
            // 3. otherwise the smallest unbound domain (stable).
            if next.is_none() {
                next = (0..n)
                    .filter(|&j| !placed[j])
                    .min_by_key(|&j| (domains[j].len(), j));
            }
            let j = next.unwrap_or(0);
            placed[j] = true;
            order.push(j);
        }
        order
    }

    /// Recursive join enumerator over the ordered base domains with E2O
    /// forward propagation. `active` carries the propagations emitted by
    /// already-bound event variables as `(future level, allowed ids)` pairs;
    /// each level's effective candidate set is its base domain intersected
    /// with every active propagation targeting it.
    #[allow(clippy::too_many_arguments)]
    fn product(
        &self,
        idx: usize,
        domains: &[Vec<&str>],
        order: &[usize],
        active: &[(usize, Vec<&str>)],
        current: &mut Binding,
        log: &OCEL,
        ix: &IdIndex<'_>,
        out: &mut Vec<Binding>,
    ) {
        if idx == self.vars.len() {
            if self.satisfied_by_indexed(current, log, ix) {
                out.push(current.clone());
            }
            return;
        }
        let var_idx = order[idx];
        let name = self.vars[var_idx].name.clone();

        // Effective candidates: base domain ∩ all active propagations
        // targeting this level. Sorted + deduped (an event may reference the
        // same object under several qualifiers — the join emits it once).
        let mut effective: Vec<&str> = domains[idx]
            .iter()
            .copied()
            .filter(|id| {
                active
                    .iter()
                    .filter(|(lvl, _)| *lvl == idx)
                    .all(|(_, allowed)| allowed.contains(id))
            })
            .collect();
        effective.sort_unstable();
        effective.dedup();

        // This level's propagation spec: for each E2O(e, o, q) pred touching
        // this var — forward (this var is the event side, target `o` unbound)
        // or inverse (this var is the object side, source `e` unbound) —
        // `(future level, qualifier, target var decl, direction)`. The
        // allowed-id list is computed per candidate, since it depends on the
        // concrete element bound at this level.
        let mut prop_spec: Vec<(usize, &Option<String>, &VarDecl, bool)> = Vec::new();
        for p in &self.preds {
            if let BasicPredicate::E2O {
                event,
                object,
                qualifier,
            } = p
            {
                let (this_side, other_var, kind_check) = if self.vars[var_idx].kind
                    == VarKind::Event
                {
                    (event == &name, object, VarKind::Object)
                } else {
                    (object == &name, event, VarKind::Event)
                };
                if !this_side {
                    continue;
                }
                let Some(off) = order[idx + 1..]
                    .iter()
                    .position(|&j| self.vars[j].name == *other_var)
                else {
                    continue; // partner already bound (leaf check covers it)
                };
                let lvl = idx + 1 + off;
                debug_assert_eq!(self.vars[order[lvl]].kind, kind_check);
                let inverse = self.vars[var_idx].kind == VarKind::Object;
                prop_spec.push((lvl, qualifier, &self.vars[order[lvl]], inverse));
            }
        }

        for &id in &effective {
            current.map.insert(name.clone(), id.to_string());
            let mut merged: Vec<(usize, Vec<&str>)> = active.to_vec();
            for (lvl, qualifier, decl, inverse) in &prop_spec {
                let refs = if *inverse {
                    ix.e2o_inv.get(id)
                } else {
                    ix.e2o.get(id)
                };
                let Some(refs) = refs else {
                    continue;
                };
                let allowed: Vec<&str> = refs
                    .iter()
                    .filter(|(rid, q)| {
                        qual_matches(qualifier, q)
                            && ix
                                .event_type
                                .get(*rid)
                                .or_else(|| ix.object_type.get(*rid))
                                .is_some_and(|t| decl.admits_type(t))
                    })
                    .map(|(rid, _)| *rid)
                    .collect();
                merged.push((*lvl, allowed));
            }
            self.product(idx + 1, domains, order, &merged, current, log, ix, out);
            current.map.remove(&name);
        }
    }

    /// **Def. 7** — `self ⪯_L other`: `self` refines `other` (is at least as
    /// strict, over a possibly smaller set of variables) iff
    /// `Var(self) ⊆ Var(other) ∧ Pred(self) ⊆ Pred(other)`.
    #[must_use]
    pub fn refines(&self, other: &BindingBox) -> bool {
        let vars_sub = self.vars.iter().all(|v| other.vars.iter().any(|w| w == v));
        let preds_sub = self
            .preds
            .iter()
            .all(|p| other.preds.iter().any(|q| q == p));
        vars_sub && preds_sub
    }

    /// **Def. 8** — `b_L|_X`: the filter-restriction of the box to a predicate
    /// subset `X`. Here `X` = "the BASIC predicates" (we drop nothing else,
    /// since this box type only carries BASIC predicates), so this is the box
    /// itself. Provided for completeness of the formal surface (`box|_BASIC_L`
    /// is what `⪯_L` compares in a query tree, Def. 9).
    #[must_use]
    pub fn restrict_to_basic(&self) -> BindingBox {
        self.clone()
    }
}

// ---------------------------------------------------------------------------
// CHILD SET predicate (Sect. 4)  +  query-tree node constraints (Fig. 6)
// ---------------------------------------------------------------------------

/// `CHILD SET_u^T (A, n_min, n_max)` — a child-cardinality predicate (Sect. 4).
///
/// Fulfilled for a binding `b` of node `u` when the set of child bindings of
/// `b` in the child node reached via edge-label `edge`,
/// `S = { x ∈ B_L | x ⊨ box(child) ∧ b ⊑_L x }`, has size in `[n_min, n_max]`.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct ChildSet {
    /// Edge label `A` identifying the child node (matches [`Edge::label`]).
    pub edge: String,
    /// `n_min` — minimum number of refining child bindings (inclusive).
    pub n_min: usize,
    /// `n_max` — maximum (inclusive). `None` ⇒ `∞` (the paper's `n_max ∈ ℕ_0`
    /// with an unbounded option, written `*`).
    #[serde(default)]
    pub n_max: Option<usize>,
}

/// A predicate usable inside `constr(v)` (Fig. 6), extended to a full
/// **predicate algebra**: `constr` may mix BASIC predicates, CHILD SET
/// predicates, and the Boolean connectives AND (`All`), OR (`Any`), NOT
/// (`Not`) — the connectives recurse over this same type, so arbitrarily
/// nested composites like `all:[P, any:[Q, not: R]]` are legal.
///
/// # Semantics (per binding `b` of the node's domain)
/// - `All(ps)`  ⇔ every `p ∈ ps` holds (`[]` ⇒ vacuously true);
/// - `Any(ps)`  ⇔ some `p ∈ ps` holds (`[]` ⇒ false), evaluated with
///   short-circuiting per-binding `any()`, which is set-equivalent to the
///   union of the children's satisfied sets since the domain is fixed;
/// - `Not(p)`   ⇔ `p` does **not** hold for `b`. *Closed-world over
///   bindings*: `¬P` holds for `b` iff `b` is in the node's domain
///   (guaranteed — `constr` is only evaluated over `out_L(box(v))`) and
///   `P(b)` is false. There is no open-world third value: an unbound
///   variable makes a BASIC predicate false, hence `¬P` true.
///
/// # Serde shapes (additive, all untagged)
/// `{"all":[...]}`, `{"any":[...]}`, `{"not": ...}` are new; the previous
/// shapes are unchanged and still parse — a bare BASIC predicate
/// (`{"kind": "E2O", ...}`) and a CHILD SET object
/// (`{"edge": "A", "n_min": .., "n_max": ..}`); the older
/// `{"type": "Basic"|"ChildSet", ...}` tagged forms also still parse, the
/// tag simply being ignored as an unknown field.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(untagged)]
pub enum ConstraintPredicate {
    /// AND over child predicates — `constr` holds iff **all** hold.
    All {
        /// The conjuncts.
        all: Vec<ConstraintPredicate>,
    },
    /// OR over child predicates — `constr` holds iff **some** holds.
    Any {
        /// The disjuncts.
        any: Vec<ConstraintPredicate>,
    },
    /// Negation — `constr` holds iff the child does not (closed-world over
    /// bindings; see the type-level docs).
    Not {
        /// The negated predicate.
        not: Box<ConstraintPredicate>,
    },
    /// A BASIC predicate (E2O / O2O / TBE) used as a constraint.
    Basic(BasicPredicate),
    /// A CHILD SET cardinality constraint.
    ChildSet(ChildSet),
}

// ---------------------------------------------------------------------------
// Query tree (Def. 9) + constraints
// ---------------------------------------------------------------------------

/// An edge `(parent, child)` of the query tree, carrying its unique label
/// (`l: F → U_setName`, Def. 9, injective) and the target node id.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct Edge {
    /// Unique edge label `A`/`B`/… (the `l` of Def. 9; used by CHILD SET).
    pub label: String,
    /// Target (child) node id.
    pub child: String,
}

/// A node of the query tree: its binding box, its child edges, and the optional
/// constraint predicates `constr(v)` (Fig. 6). When `constr` is present, the
/// node is a *constraint* node and each of its output bindings is classified
/// satisfied / violated.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct Node {
    /// Node id (element of `V`).
    pub id: String,
    /// `box(v)` — the binding box at this node.
    #[serde(rename = "box")]
    pub bbox: BindingBox,
    /// Child edges `(v, child)` with labels (subset of `F`).
    #[serde(default)]
    pub children: Vec<Edge>,
    /// `constr(v) ⊆ P_L` — the violation criteria (Fig. 6). Empty/absent ⇒ the
    /// node is a plain query node (no satisfied/violated split).
    #[serde(default)]
    pub constr: Vec<ConstraintPredicate>,
}

/// A **query tree** `T = (V, F, r, l, box)` (Def. 9) — the core OCPQ object —
/// optionally carrying `constr` per node to form a constraint (Fig. 6).
///
/// Tree invariant (Def. 9): `r` is the unique root; every node is reached by
/// exactly one path from `r`; edge labels are injective. The constructor
/// stores nodes by id and the root id; children are referenced via [`Edge`].
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct QueryTree {
    /// Root node id `r`.
    pub root: String,
    /// `V` — all nodes by id.
    pub nodes: Vec<Node>,
}

impl QueryTree {
    /// Borrow a node by id.
    #[must_use]
    pub fn node(&self, id: &str) -> Option<&Node> {
        self.nodes.iter().find(|n| n.id == id)
    }

    /// `CHILD SET` evaluation for a single parent binding `b` of node `u`:
    /// counts child bindings `x ∈ out_L(box(child)) with b ⊑_L x`, then tests
    /// membership of that count in `[n_min, n_max]`.
    ///
    /// Both `out_L(box(child))` and the counting itself are memoized in
    /// `ctx`: the child's output set is computed once per evaluation call
    /// (not once per parent binding), and the count is served from a
    /// projection index keyed by the parent binding — linear in output size
    /// overall instead of `|out(parent)|·|out(child)|·(|E|+|O|)`.
    fn child_set_holds(
        &self,
        u: &Node,
        b: &Binding,
        cs: &ChildSet,
        ctx: &mut EvalContext<'_>,
    ) -> bool {
        let Some(edge) = u.children.iter().find(|e| e.label == cs.edge) else {
            // Edge label not found ⇒ predicate ill-formed for this node ⇒ false.
            return false;
        };
        if self.node(&edge.child).is_none() {
            // Child node missing ⇒ ill-formed ⇒ false (n_min = 0 must not
            // accidentally succeed over a dangling edge).
            return false;
        }
        let parent_vars: Vec<&str> = b.map.keys().map(String::as_str).collect();
        let count = ctx.child_count(&edge.child, &parent_vars, b);
        let above = count >= cs.n_min;
        let below = cs.n_max.is_none_or(|m| count <= m);
        above && below
    }

    /// Evaluate one `constr` predicate against a parent binding `b` of node
    /// `u` — the recursion realizing the predicate algebra (AND / OR / NOT
    /// over BASIC and CHILD SET leaves).
    fn constr_pred_holds(
        &self,
        u: &Node,
        b: &Binding,
        p: &ConstraintPredicate,
        ctx: &mut EvalContext<'_>,
    ) -> bool {
        match p {
            ConstraintPredicate::All { all } => all
                .iter()
                .all(|q| self.constr_pred_holds(u, b, q, ctx)),
            ConstraintPredicate::Any { any } => any
                .iter()
                .any(|q| self.constr_pred_holds(u, b, q, ctx)),
            ConstraintPredicate::Not { not } => !self.constr_pred_holds(u, b, not, ctx),
            ConstraintPredicate::Basic(bp) => bp.holds_indexed(b, &ctx.index),
            ConstraintPredicate::ChildSet(cs) => self.child_set_holds(u, b, cs, ctx),
        }
    }
}

// ---------------------------------------------------------------------------
// Constraint evaluation result (Fig. 6: satisfied / violated counts)
// ---------------------------------------------------------------------------

/// Per-binding classification: the binding's variable values and whether the
/// node's `constr(v)` held (`✓`) or not (`✗`).
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct BindingVerdict {
    /// The binding (var → id).
    pub binding: BTreeMap<String, String>,
    /// `true` = satisfied (`✓`), `false` = violated (`✗`).
    pub satisfied: bool,
}

/// The result of evaluating a [`QueryTree`] constraint over an OCED (Fig. 6):
/// the output bindings of the constrained (root, here) node with their
/// satisfied/violated verdicts, plus aggregate counts.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct ConstraintResult {
    /// Id of the node whose `constr` was evaluated.
    pub node: String,
    /// Number of output bindings that satisfied `constr(v)`.
    pub satisfied: usize,
    /// Number that violated it.
    pub violated: usize,
    /// Per-binding verdicts (the right-hand `Satisfied` column of Fig. 6).
    pub verdicts: Vec<BindingVerdict>,
}

/// Evaluate the `constr(v)` of the **root** node of `tree` over `log`
/// (Fig. 6 demonstration: a single-constraint query tree). For each output
/// binding of `box(root)`, the binding is *satisfied* iff every predicate in
/// `constr(root)` holds, else *violated*.
///
/// (Constraints on non-root nodes can be evaluated by re-rooting; the public
/// [`evaluate_node_constraint`] generalizes this to any node id.)
#[must_use]
pub fn evaluate_constraint(tree: &QueryTree, log: &OCEL) -> ConstraintResult {
    evaluate_node_constraint(tree, &tree.root.clone(), log).unwrap_or_else(|| ConstraintResult {
        node: tree.root.clone(),
        satisfied: 0,
        violated: 0,
        verdicts: Vec::new(),
    })
}

/// Evaluate `constr` of an arbitrary node `node_id` (Fig. 6 generalized,
/// including the AND/OR/NOT algebra of [`ConstraintPredicate`]).
/// Returns `None` if the node id is unknown.
///
/// One [`EvalContext`] (id index + child-output memoization + CHILD SET
/// projection count index) is built per call and threaded through the whole
/// evaluation, so each child node's `out_L(box(child))` is enumerated at most
/// once and membership/count checks are hash lookups.
#[must_use]
pub fn evaluate_node_constraint(
    tree: &QueryTree,
    node_id: &str,
    log: &OCEL,
) -> Option<ConstraintResult> {
    let u = tree.node(node_id)?;
    let mut ctx = EvalContext::new(tree, log);
    let bindings = u.bbox.output_indexed(log, &ctx.index);
    let mut satisfied = 0;
    let mut violated = 0;
    let mut verdicts = Vec::with_capacity(bindings.len());
    for b in &bindings {
        // satisfied ⇔ all constr predicates hold for this binding.
        let ok = u
            .constr
            .iter()
            .all(|p| tree.constr_pred_holds(u, b, p, &mut ctx));
        if ok {
            satisfied += 1;
        } else {
            violated += 1;
        }
        verdicts.push(BindingVerdict {
            binding: b.map.clone(),
            satisfied: ok,
        });
    }
    Some(ConstraintResult {
        node: node_id.to_string(),
        satisfied,
        violated,
        verdicts,
    })
}

/// Evaluate the plain query at `box(node_id)` (no constraint): the raw output
/// set `out_L(box(node_id))` as bindings. Returns `None` for unknown nodes.
#[must_use]
pub fn evaluate_query(tree: &QueryTree, node_id: &str, log: &OCEL) -> Option<Vec<Binding>> {
    let u = tree.node(node_id)?;
    Some(u.bbox.output(log))
}

// ---------------------------------------------------------------------------
// JSON / WASM surface
// ---------------------------------------------------------------------------

/// Pure-Rust JSON entry point (also reused by the WASM export): parse a query
/// tree and an OCEL from JSON strings, evaluate the root constraint, and return
/// the [`ConstraintResult`] as a JSON string.
///
/// Errors (parse failures) are returned as `Err(String)`.
pub fn ocpq_eval_json(query_json: &str, ocel_json: &str) -> Result<String, String> {
    let tree: QueryTree =
        serde_json::from_str(query_json).map_err(|e| format!("query parse error: {e}"))?;
    let log: OCEL =
        serde_json::from_str(ocel_json).map_err(|e| format!("ocel parse error: {e}"))?;
    let result = evaluate_constraint(&tree, &log);
    serde_json::to_string(&result).map_err(|e| format!("serialize error: {e}"))
}

/// `#[wasm_bindgen]` reachable entry point: `ocpq_eval(query_json, ocel_json)`
/// → result JSON. Mirrors [`ocpq_eval_json`] but surfaces errors as a JS-side
/// `Err` string (the CLI / kernel call this).
#[cfg(feature = "wasm")]
#[wasm_bindgen]
pub fn ocpq_eval(query_json: &str, ocel_json: &str) -> Result<String, String> {
    ocpq_eval_json(query_json, ocel_json)
}
