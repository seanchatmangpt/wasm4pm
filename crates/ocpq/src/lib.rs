//! # OCPQ — Object-Centric Process Querying & Constraints
//!
//! A faithful, paper-grounded implementation of the OCPQ runtime described in
//! *Küsters & van der Aalst, "OCPQ: Object-Centric Process Querying &
//! Constraints" (arXiv:2506.11541v1, 2025)*. The formal objects below are
//! implemented exactly as defined; the doc-comments cite the definition each
//! type/function realizes so the test oracles are the paper, not the code
//! (no FM-5 self-reference).
//!
//! Built on top of [`ocel_core::OCEL`] (the `L = (E, O, eval, oaval)` OCED of
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

use std::collections::BTreeMap;

use ocel_core::OCEL;
use serde::{Deserialize, Serialize};

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
#[derive(Serialize, Deserialize, Debug, Clone, Default, PartialEq, Eq)]
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

impl BasicPredicate {
    /// `b ⊨ p` — does binding `b` satisfy this BASIC predicate under `L`?
    ///
    /// If a referenced variable is unbound in `b`, the predicate is **not**
    /// satisfied (`⊥` cannot be in any relation), matching the paper note that
    /// `b_5 ⊭ s_1` when `b_5` does not assign `o2`.
    #[must_use]
    pub fn holds(&self, b: &Binding, log: &OCEL) -> bool {
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
                if !log.events.iter().any(|e| e.id == ev) {
                    return false;
                }
                if !log.objects.iter().any(|o| o.id == ob) {
                    return false;
                }
                // b(v') ∈ obj_L^q(b(v)):  the event's qualified object refs.
                log.e2o(ev)
                    .iter()
                    .any(|(oid, q)| *oid == ob && qual_matches(qualifier, q))
            }
            BasicPredicate::O2O {
                from,
                to,
                qualifier,
            } => {
                let (Some(src), Some(dst)) = (b.get(from), b.get(to)) else {
                    return false;
                };
                if !log.objects.iter().any(|o| o.id == src) {
                    return false;
                }
                if !log.objects.iter().any(|o| o.id == dst) {
                    return false;
                }
                log.o2o(src)
                    .iter()
                    .any(|(oid, q)| *oid == dst && qual_matches(qualifier, q))
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
                let (Some(t1), Some(t2)) = (event_time(log, e1), event_time(log, e2)) else {
                    return false;
                };
                let gap = t2.timestamp() - t1.timestamp();
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

/// `time_L(e)` — the timestamp of event `e` (by id), if it exists.
fn event_time(log: &OCEL, event_id: &str) -> Option<chrono::DateTime<chrono::FixedOffset>> {
    log.events.iter().find(|e| e.id == event_id).map(|e| e.time)
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
                VarKind::Event => log
                    .events
                    .iter()
                    .find(|e| e.id == id)
                    .is_some_and(|e| decl.admits_type(&e.event_type)),
                VarKind::Object => log
                    .objects
                    .iter()
                    .find(|o| o.id == id)
                    .is_some_and(|o| decl.admits_type(&o.object_type)),
            };
            if !ty_ok {
                return false;
            }
        }
        // b ⊨ Pred
        self.preds.iter().all(|p| p.holds(b, log))
    }

    /// `out_L(b_L)` — the **output set** of the box (Def. 6): every binding over
    /// `dom(Var)` that satisfies the box.
    ///
    /// Enumeration strategy: take the Cartesian product of each variable's
    /// type-admissible domain (events of the declared event-types, objects of
    /// the declared object-types), then filter by [`Self::satisfied_by`]. For
    /// the small object-centric logs OCPQ targets this is exact and complete;
    /// the recursive parallelizable refinement of the paper is an optimization
    /// over the same set.
    #[must_use]
    pub fn output(&self, log: &OCEL) -> Vec<Binding> {
        // Per-variable candidate id lists.
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

        let mut out = Vec::new();
        let mut current = Binding::empty();
        self.product(0, &domains, &mut current, log, &mut out);
        out
    }

    /// Recursive Cartesian-product enumerator over `domains[idx..]`, collecting
    /// bindings that pass [`Self::satisfied_by`].
    fn product(
        &self,
        idx: usize,
        domains: &[Vec<&str>],
        current: &mut Binding,
        log: &OCEL,
        out: &mut Vec<Binding>,
    ) {
        if idx == self.vars.len() {
            if self.satisfied_by(current, log) {
                out.push(current.clone());
            }
            return;
        }
        let name = self.vars[idx].name.clone();
        for &id in &domains[idx] {
            current.map.insert(name.clone(), id.to_string());
            self.product(idx + 1, domains, current, log, out);
        }
        current.map.remove(&name);
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

/// A predicate usable inside `constr(v)` (Fig. 6). `constr` may mix BASIC
/// predicates and CHILD SET predicates; a binding is **satisfied** iff *all*
/// of them hold, else **violated**.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(tag = "type")]
pub enum ConstraintPredicate {
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
    fn child_set_holds(&self, u: &Node, b: &Binding, cs: &ChildSet, log: &OCEL) -> bool {
        let Some(edge) = u.children.iter().find(|e| e.label == cs.edge) else {
            // Edge label not found ⇒ predicate ill-formed for this node ⇒ false.
            return false;
        };
        let Some(child) = self.node(&edge.child) else {
            return false;
        };
        let count = child
            .bbox
            .output(log)
            .iter()
            .filter(|x| b.refines(x))
            .count();
        let above = count >= cs.n_min;
        let below = cs.n_max.is_none_or(|m| count <= m);
        above && below
    }

    /// Evaluate one `constr` predicate against a parent binding `b` of node `u`.
    fn constr_pred_holds(
        &self,
        u: &Node,
        b: &Binding,
        p: &ConstraintPredicate,
        log: &OCEL,
    ) -> bool {
        match p {
            ConstraintPredicate::Basic(bp) => bp.holds(b, log),
            ConstraintPredicate::ChildSet(cs) => self.child_set_holds(u, b, cs, log),
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

/// Evaluate `constr` of an arbitrary node `node_id` (Fig. 6 generalized).
/// Returns `None` if the node id is unknown.
#[must_use]
pub fn evaluate_node_constraint(
    tree: &QueryTree,
    node_id: &str,
    log: &OCEL,
) -> Option<ConstraintResult> {
    let u = tree.node(node_id)?;
    let bindings = u.bbox.output(log);
    let mut satisfied = 0;
    let mut violated = 0;
    let mut verdicts = Vec::with_capacity(bindings.len());
    for b in &bindings {
        // satisfied ⇔ all constr predicates hold for this binding.
        let ok = u
            .constr
            .iter()
            .all(|p| tree.constr_pred_holds(u, b, p, log));
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
