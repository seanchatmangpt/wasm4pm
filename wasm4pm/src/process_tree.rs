//! Process tree with typed operator enum replacing the stringly-typed node_type field in wasm4pm ProcessTreeNode. Leaf nodes carry ActivityName. Tree structure is recursive via Box<ProcessTree>.
//! Paper grounding: Leemans, Fahland & van der Aalst 2013 'Discovering Block-Structured Process Models from Event Logs' §2: process tree T with operators {→ (sequence), × (exclusive choice), ∧ (parallel/and), ↺ (loop)}. Tau (silent) leaf is the invisible activity.

extern crate alloc;

use alloc::collections::BTreeMap;
use alloc::collections::BTreeSet;
use alloc::string::String;
use alloc::vec::Vec;
use core::fmt;
use core::ops::Deref;

#[cfg(feature = "serde")]
use serde::{Deserialize, Serialize};

// ─── ActivityName ────────────────────────────────────────────────────────────

/// Formal object from [Leemans2013]: observable activity label *a* ∈ Σ — the
/// alphabet of activity names over which a process tree is defined.
///
/// This is a zero-cost transparent newtype over [`String`].  `None` inside
/// [`ProcessTree::Leaf`] represents the silent activity τ (tau); `Some(name)`
/// represents an observable activity with this label.
///
/// # Invariant
/// The inner string is never empty when constructed through [`ActivityName::new`].
/// An empty label is semantically equivalent to τ and should be represented as
/// `ProcessTree::Leaf(None)` instead.
#[derive(Debug, Clone, PartialEq, Eq, Hash, PartialOrd, Ord)]
#[repr(transparent)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "serde", serde(transparent))]
pub struct ActivityName(String);

impl ActivityName {
    /// Construct an `ActivityName` from any string-like value.
    ///
    /// # Panics
    /// Does not panic; empty strings are accepted at construction but violate
    /// the semantic invariant described above.
    #[inline]
    #[must_use]
    pub fn new(s: impl Into<String>) -> Self {
        ActivityName(s.into())
    }

    /// Return a reference to the underlying string slice.
    #[inline]
    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }

    /// Consume the newtype and return the owned `String`.
    #[inline]
    #[must_use]
    pub fn into_inner(self) -> String {
        self.0
    }
}

impl Deref for ActivityName {
    type Target = String;

    #[inline]
    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl fmt::Display for ActivityName {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl From<String> for ActivityName {
    #[inline]
    fn from(s: String) -> Self {
        ActivityName(s)
    }
}

impl From<&str> for ActivityName {
    #[inline]
    fn from(s: &str) -> Self {
        ActivityName(s.into())
    }
}

// ─── ProcessTreeOperator ─────────────────────────────────────────────────────

/// Formal object from [Leemans2013]: ⊕ ∈ {→, ×, ∧, ↺, ∨} — control-flow
/// operator in a process tree node (Leemans et al. 2013 §2 Def 2.1).
///
/// `Or` is included for completeness from the IMf (Inductive Miner with
/// frequency filtering) variant.  Replaces the stringly-typed
/// `node_type: String` field in the  `wasm4pm ProcessTreeNode`.
///
/// # Copy semantics
/// This is a `Copy` enum — no heap allocation.  Replacing a `String` operator
/// tag with this type eliminates both the allocation and the match-on-string
/// anti-pattern throughout the codebase.
///
/// # Formal mapping
/// | Variant           | Symbol | Semantics                                      |
/// |-------------------|--------|------------------------------------------------|
/// | `Sequence`        | →      | Execute children left-to-right sequentially    |
/// | `ExclusiveChoice` | ×      | Execute exactly one child (XOR split/join)     |
/// | `Parallel`        | ∧      | Execute all children in any order (AND)        |
/// | `Loop`            | ↺      | First child is body; second child is redo      |
/// | `Or`              | ∨      | Execute one or more children (inclusive OR)    |
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "serde", serde(rename_all = "snake_case"))]
pub enum ProcessTreeOperator {
    /// → (sequence): children execute left-to-right in order.
    ///
    /// Leemans et al. 2013 §2: `→(T₁, …, Tₙ)` — sequential block.
    Sequence,

    /// × (exclusive choice / XOR): exactly one child executes.
    ///
    /// Leemans et al. 2013 §2: `×(T₁, …, Tₙ)` — XOR block.
    ExclusiveChoice,

    /// ∧ (parallel / AND): all children execute in any interleaving.
    ///
    /// Leemans et al. 2013 §2: `∧(T₁, …, Tₙ)` — AND block.
    Parallel,

    /// ↺ (loop): the first child is the loop body; the second child is the
    /// redo branch executed between iterations.
    ///
    /// Leemans et al. 2013 §2: `↺(T_do, T_redo)` — loop block.
    Loop,

    /// ∨ (inclusive OR): one or more children execute (IMf variant).
    ///
    /// Not in the original Leemans et al. 2013 paper but present in the
    /// frequency-based IMf extension; included for full operator coverage.
    Or,
}

impl ProcessTreeOperator {
    /// Return the canonical symbolic notation for this operator.
    #[must_use]
    pub fn symbol(self) -> &'static str {
        match self {
            ProcessTreeOperator::Sequence => "→",
            ProcessTreeOperator::ExclusiveChoice => "×",
            ProcessTreeOperator::Parallel => "∧",
            ProcessTreeOperator::Loop => "↺",
            ProcessTreeOperator::Or => "∨",
        }
    }

    /// Return the short ASCII tag used in textual process tree representations.
    ///
    /// These tags follow pm4py / ProM convention:
    /// `"->"`, `"X"`, `"+"`, `"*"`, `"O"`.
    #[must_use]
    pub fn ascii_tag(self) -> &'static str {
        match self {
            ProcessTreeOperator::Sequence => "->",
            ProcessTreeOperator::ExclusiveChoice => "X",
            ProcessTreeOperator::Parallel => "+",
            ProcessTreeOperator::Loop => "*",
            ProcessTreeOperator::Or => "O",
        }
    }

    /// Try to parse an ASCII tag (case-insensitive) back to an operator.
    ///
    /// Recognises: `"->"`, `"SEQ"`, `"SEQUENCE"` → `Sequence`;
    /// `"X"`, `"XOR"`, `"EXCLUSIVE_CHOICE"` → `ExclusiveChoice`;
    /// `"+"`, `"AND"`, `"PARALLEL"` → `Parallel`;
    /// `"*"`, `"LOOP"` → `Loop`;
    /// `"O"`, `"OR"` → `Or`.
    ///
    /// Returns `None` for unrecognised tags.
    #[must_use]
    pub fn from_tag(tag: &str) -> Option<Self> {
        match tag.to_uppercase().as_str() {
            "->" | "SEQ" | "SEQUENCE" => Some(ProcessTreeOperator::Sequence),
            "X" | "XOR" | "EXCLUSIVE_CHOICE" => Some(ProcessTreeOperator::ExclusiveChoice),
            "+" | "AND" | "PARALLEL" => Some(ProcessTreeOperator::Parallel),
            "*" | "LOOP" => Some(ProcessTreeOperator::Loop),
            "O" | "OR" => Some(ProcessTreeOperator::Or),
            _ => None,
        }
    }

    /// Returns `true` when this operator is a binary operator in the strict
    /// sense (i.e. exactly two children, as with `Loop`).
    #[must_use]
    pub fn is_binary(self) -> bool {
        matches!(self, ProcessTreeOperator::Loop)
    }
}

impl fmt::Display for ProcessTreeOperator {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.symbol())
    }
}

// ─── ProcessTree ─────────────────────────────────────────────────────────────

/// Formal object from [Leemans2013]: T — process tree defined recursively.
///
/// * `Leaf(None)` represents the silent leaf τ (tau) — the invisible activity.
/// * `Leaf(Some(a))` represents an observable leaf activity *a ∈ Σ*.
/// * `Operator { op, children }` represents `op(T₁, …, Tₙ)` — an operator
///   node with one or more sub-trees (Leemans et al. 2013 §2 Def 2.1).
///
/// # Recursive structure
/// Indirection for the recursive case is handled by `Vec<ProcessTree>` (the
/// `Vec` heap-allocates its contents, so no explicit `Box<ProcessTree>` wrapper
/// is required).  This follows the requirement that "Box is implicit in
/// `Vec<ProcessTree>` children".
///
/// # Replaces
/// The  `ProcessTreeNode { node_type: String, children: Vec<ProcessTreeNode> }`
/// and the stringly-typed matching on `"SEQ"`, `"XOR"`, `"AND"`, `"OR"`,
/// `"LOOP"` throughout the codebase.
///
/// # Formal semantics (Leemans et al. 2013 §2)
/// | Tree            | Language L(T)                                |
/// |-----------------|----------------------------------------------|
/// | `Leaf(τ)`       | { ε }  (only the empty trace)                |
/// | `Leaf(a)`       | { ⟨a⟩ }                                      |
/// | `→(T₁,…,Tₙ)`  | L(T₁) · … · L(Tₙ)  (concatenation)          |
/// | `×(T₁,…,Tₙ)`  | L(T₁) ∪ … ∪ L(Tₙ)  (union)                  |
/// | `∧(T₁,…,Tₙ)`  | shuffle(L(T₁), …, L(Tₙ))                    |
/// | `↺(T_do,T_re)` | L(T_do) · (L(T_re) · L(T_do))*              |
#[derive(Debug, Clone, PartialEq)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
#[cfg_attr(feature = "serde", serde(tag = "kind", rename_all = "snake_case"))]
pub enum ProcessTree {
    /// A leaf node.
    ///
    /// `None` → silent activity τ (invisible to the observer).
    /// `Some(name)` → observable activity with the given label.
    Leaf(Option<ActivityName>),

    /// An operator node with one or more sub-trees.
    ///
    /// The `Vec<ProcessTree>` provides implicit heap indirection (no
    /// `Box` wrapper required).
    Operator {
        /// The control-flow operator governing how children execute.
        op: ProcessTreeOperator,
        /// Ordered list of child sub-trees.  Must be non-empty.
        children: Vec<ProcessTree>,
    },
}

impl ProcessTree {
    // ── Constructors ──────────────────────────────────────────────────────

    /// Construct a silent leaf (τ).
    #[inline]
    #[must_use]
    pub fn tau() -> Self {
        ProcessTree::Leaf(None)
    }

    /// Construct an observable activity leaf.
    #[inline]
    #[must_use]
    pub fn activity(name: impl Into<ActivityName>) -> Self {
        ProcessTree::Leaf(Some(name.into()))
    }

    /// Construct a sequence node `→(children)`.
    ///
    /// # Panics
    /// Panics in debug builds if `children` is empty.
    #[inline]
    #[must_use]
    pub fn sequence(children: Vec<ProcessTree>) -> Self {
        debug_assert!(
            !children.is_empty(),
            "Sequence must have at least one child"
        );
        ProcessTree::Operator {
            op: ProcessTreeOperator::Sequence,
            children,
        }
    }

    /// Construct an exclusive-choice node `×(children)`.
    ///
    /// # Panics
    /// Panics in debug builds if `children` is empty.
    #[inline]
    #[must_use]
    pub fn xor(children: Vec<ProcessTree>) -> Self {
        debug_assert!(
            !children.is_empty(),
            "ExclusiveChoice must have at least one child"
        );
        ProcessTree::Operator {
            op: ProcessTreeOperator::ExclusiveChoice,
            children,
        }
    }

    /// Construct a parallel node `∧(children)`.
    ///
    /// # Panics
    /// Panics in debug builds if `children` is empty.
    #[inline]
    #[must_use]
    pub fn parallel(children: Vec<ProcessTree>) -> Self {
        debug_assert!(
            !children.is_empty(),
            "Parallel must have at least one child"
        );
        ProcessTree::Operator {
            op: ProcessTreeOperator::Parallel,
            children,
        }
    }

    /// Construct a loop node `↺(body, redo)`.
    ///
    /// Per Leemans et al. 2013 §2, a loop has exactly two children:
    /// the loop body (`do` branch) and the redo branch.
    #[inline]
    #[must_use]
    pub fn loop_node(body: ProcessTree, redo: ProcessTree) -> Self {
        ProcessTree::Operator {
            op: ProcessTreeOperator::Loop,
            children: vec![body, redo],
        }
    }

    /// Construct an inclusive-or node `∨(children)` (IMf extension).
    ///
    /// # Panics
    /// Panics in debug builds if `children` is empty.
    #[inline]
    #[must_use]
    pub fn or(children: Vec<ProcessTree>) -> Self {
        debug_assert!(!children.is_empty(), "Or must have at least one child");
        ProcessTree::Operator {
            op: ProcessTreeOperator::Or,
            children,
        }
    }

    // ── Predicates ───────────────────────────────────────────────────────

    /// Returns `true` if this is a leaf node (silent or observable).
    #[inline]
    #[must_use]
    pub fn is_leaf(&self) -> bool {
        matches!(self, ProcessTree::Leaf(_))
    }

    /// Returns `true` if this is the silent leaf τ.
    #[inline]
    #[must_use]
    pub fn is_tau(&self) -> bool {
        matches!(self, ProcessTree::Leaf(None))
    }

    /// Returns `true` if this is an observable activity leaf.
    #[inline]
    #[must_use]
    pub fn is_activity(&self) -> bool {
        matches!(self, ProcessTree::Leaf(Some(_)))
    }

    /// Returns `true` if this is an operator node.
    #[inline]
    #[must_use]
    pub fn is_operator(&self) -> bool {
        matches!(self, ProcessTree::Operator { .. })
    }

    // ── Accessors ────────────────────────────────────────────────────────

    /// Return the activity name if this is an observable leaf, otherwise `None`.
    #[inline]
    #[must_use]
    pub fn activity_name(&self) -> Option<&ActivityName> {
        match self {
            ProcessTree::Leaf(Some(name)) => Some(name),
            _ => None,
        }
    }

    /// Return the operator if this is an operator node, otherwise `None`.
    #[inline]
    #[must_use]
    pub fn operator(&self) -> Option<ProcessTreeOperator> {
        match self {
            ProcessTree::Operator { op, .. } => Some(*op),
            _ => None,
        }
    }

    /// Return a reference to the children slice if this is an operator node.
    ///
    /// Returns an empty slice for leaf nodes.
    #[inline]
    #[must_use]
    pub fn children(&self) -> &[ProcessTree] {
        match self {
            ProcessTree::Operator { children, .. } => children,
            ProcessTree::Leaf(_) => &[],
        }
    }

    /// Return the number of direct children (0 for leaves).
    #[inline]
    #[must_use]
    pub fn arity(&self) -> usize {
        self.children().len()
    }

    // ── Structural metrics ────────────────────────────────────────────────

    /// Return the depth of the tree (0 for a leaf, 1 + max child depth for
    /// an operator node).
    ///
    /// Corresponds to the height metric used in simplicity calculations.
    #[must_use]
    pub fn depth(&self) -> usize {
        match self {
            ProcessTree::Leaf(_) => 0,
            ProcessTree::Operator { children, .. } => {
                1 + children.iter().map(ProcessTree::depth).max().unwrap_or(0)
            }
        }
    }

    /// Count the total number of nodes (leaves + operator nodes) in the tree.
    #[must_use]
    pub fn node_count(&self) -> usize {
        match self {
            ProcessTree::Leaf(_) => 1,
            ProcessTree::Operator { children, .. } => {
                1 + children.iter().map(ProcessTree::node_count).sum::<usize>()
            }
        }
    }

    /// Collect all distinct observable activity names reachable from this node
    /// into a [`BTreeSet`] for deterministic ordering.
    #[must_use]
    pub fn activity_set(&self) -> BTreeSet<ActivityName> {
        let mut set = BTreeSet::new();
        self.collect_activities(&mut set);
        set
    }

    fn collect_activities(&self, acc: &mut BTreeSet<ActivityName>) {
        match self {
            ProcessTree::Leaf(Some(name)) => {
                acc.insert(name.clone());
            }
            ProcessTree::Leaf(None) => {}
            ProcessTree::Operator { children, .. } => {
                for child in children {
                    child.collect_activities(acc);
                }
            }
        }
    }

    /// Build a frequency map of activity names to the number of times they
    /// appear as leaves in the tree.  Returns a [`BTreeMap`] for determinism.
    #[must_use]
    pub fn activity_frequency_map(&self) -> BTreeMap<ActivityName, usize> {
        let mut map = BTreeMap::new();
        self.collect_activity_frequencies(&mut map);
        map
    }

    fn collect_activity_frequencies(&self, acc: &mut BTreeMap<ActivityName, usize>) {
        match self {
            ProcessTree::Leaf(Some(name)) => {
                *acc.entry(name.clone()).or_insert(0) += 1;
            }
            ProcessTree::Leaf(None) => {}
            ProcessTree::Operator { children, .. } => {
                for child in children {
                    child.collect_activity_frequencies(acc);
                }
            }
        }
    }

    // ── Textual representation ────────────────────────────────────────────

    /// Produce a compact human-readable string using the standard pm4py
    /// process tree notation, e.g. `→( ×( A, B ), C )`.
    #[must_use]
    pub fn to_repr(&self) -> String {
        match self {
            ProcessTree::Leaf(None) => "tau".into(),
            ProcessTree::Leaf(Some(name)) => name.as_str().into(),
            ProcessTree::Operator { op, children } => {
                let inner: Vec<String> = children.iter().map(ProcessTree::to_repr).collect();
                alloc::format!("{}( {} )", op.ascii_tag(), inner.join(", "))
            }
        }
    }
}

impl fmt::Display for ProcessTree {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.to_repr())
    }
}

// ───  compatibility bridge ───────────────────────────────────────────────

///  stringly-typed node kind kept for baseline admissibility with code
/// that still uses the old `ProcessTreeNode` API.
///
/// New code should prefer [`ProcessTree`] and [`ProcessTreeOperator`] directly.
#[derive(Debug, Clone)]
pub enum NodeKind {
    /// An operator node identified by a string tag (`"SEQ"`, `"XOR"`, etc.).
    Operator(String),
    /// A leaf node carrying a named activity.
    Activity(String),
    /// The silent activity τ.
    Silent,
}

///  process tree node kept for baseline admissibility.
///
/// Prefer [`ProcessTree`] for new code.  This type uses a stringly-typed
/// [`NodeKind`] internally; the typed counterpart is [`ProcessTree`].
#[derive(Debug, Clone)]
pub struct ProcessTreeNode {
    /// The kind of this node.
    pub kind: NodeKind,
    /// Direct child nodes.
    pub children: Vec<ProcessTreeNode>,
}

impl ProcessTreeNode {
    /// Construct an operator node with the given tag (e.g. `"SEQ"`).
    #[must_use]
    pub fn operator(op: impl Into<String>) -> Self {
        ProcessTreeNode {
            kind: NodeKind::Operator(op.into()),
            children: Vec::new(),
        }
    }

    /// Construct an observable activity leaf.
    #[must_use]
    pub fn activity(label: impl Into<String>) -> Self {
        ProcessTreeNode {
            kind: NodeKind::Activity(label.into()),
            children: Vec::new(),
        }
    }

    /// Construct a silent leaf (τ).
    #[must_use]
    pub fn silent() -> Self {
        ProcessTreeNode {
            kind: NodeKind::Silent,
            children: Vec::new(),
        }
    }

    /// Append a child and return `self` (builder pattern).
    #[must_use]
    pub fn add_child(mut self, child: ProcessTreeNode) -> Self {
        self.children.push(child);
        self
    }

    /// Convert this  node into a typed [`ProcessTree`].
    ///
    /// Unknown operator tags are mapped to [`ProcessTreeOperator::Sequence`]
    /// as a safe default.
    #[must_use]
    pub fn into_typed(self) -> ProcessTree {
        match self.kind {
            NodeKind::Silent => ProcessTree::tau(),
            NodeKind::Activity(label) => ProcessTree::activity(ActivityName::new(label)),
            NodeKind::Operator(tag) => {
                let op =
                    ProcessTreeOperator::from_tag(&tag).unwrap_or(ProcessTreeOperator::Sequence);
                let children: Vec<ProcessTree> =
                    self.children.into_iter().map(|c| c.into_typed()).collect();
                ProcessTree::Operator { op, children }
            }
        }
    }
}

// ─── WASM-bindgen exports ─────────────────────────────────────────────────────
// (kept for compatibility — no new wasm_bindgen on the typed API)

use crate::models::EventLog;
use serde_json::json;
use wasm_bindgen::prelude::*;

/// Recursively convert a  `ProcessTreeNode` to a JSON `serde_json::Value`.
#[allow(dead_code)]
fn node_to_json(node: &ProcessTreeNode) -> serde_json::Value {
    let children: Vec<serde_json::Value> = node.children.iter().map(node_to_json).collect();
    match &node.kind {
        NodeKind::Operator(op) => json!({
            "type": "operator",
            "operator": op,
            "children": children,
        }),
        NodeKind::Activity(label) => json!({
            "type": "activity",
            "label": label,
        }),
        NodeKind::Silent => json!({
            "type": "silent",
        }),
    }
}

/// Convert a process tree JSON into a simplified flat representation
/// (for JS consumption — the full tree as a JSON string).
///
/// Input JSON follows the same schema as `node_to_json` output.
/// Validates the structure and returns it back as a pretty-printed JSON string.
///
/// ```javascript
/// const treeJson = JSON.stringify({
///   type: "operator", operator: "SEQ",
///   children: [
///     { type: "activity", label: "A" },
///     { type: "activity", label: "B" }
///   ]
/// });
/// const result = pm.validate_process_tree(treeJson);
/// ```
#[wasm_bindgen]
pub fn validate_process_tree(tree_json: &str) -> Result<JsValue, JsValue> {
    let v: serde_json::Value = serde_json::from_str(tree_json)
        .map_err(|e| crate::error::js_val(&format!("Invalid JSON: {}", e)))?;

    fn validate(node: &serde_json::Value, depth: usize) -> Result<serde_json::Value, String> {
        if depth > 50 {
            return Err("Tree depth exceeds maximum (50)".to_string());
        }
        let node_type = node["type"].as_str().ok_or("Node missing 'type' field")?;
        match node_type {
            "operator" => {
                let op = node["operator"]
                    .as_str()
                    .ok_or("Operator node missing 'operator' field")?;
                if ProcessTreeOperator::from_tag(op).is_none() {
                    return Err(alloc::format!(
                        "Unknown operator '{}'. Must be ->/SEQ, X/XOR, +/AND, */LOOP, or O/OR",
                        op
                    ));
                }
                let children = node["children"]
                    .as_array()
                    .ok_or("Operator node missing 'children' array")?;
                if children.is_empty() {
                    return Err(alloc::format!(
                        "Operator '{}' must have at least one child",
                        op
                    ));
                }
                let validated_children: Result<Vec<serde_json::Value>, String> =
                    children.iter().map(|c| validate(c, depth + 1)).collect();
                Ok(json!({
                    "type": "operator",
                    "operator": op,
                    "children": validated_children?,
                }))
            }
            "activity" => {
                let label = node["label"]
                    .as_str()
                    .ok_or("Activity node missing 'label' field")?;
                Ok(json!({"type": "activity", "label": label}))
            }
            "silent" => Ok(json!({"type": "silent"})),
            other => Err(alloc::format!(
                "Unknown node type '{}'. Must be operator, activity, or silent",
                other
            )),
        }
    }

    let validated = validate(&v, 0).map_err(|e| crate::error::js_val(&e))?;
    let out =
        serde_json::to_string(&validated).map_err(|e| crate::error::js_val(&e.to_string()))?;
    Ok(crate::error::js_val(&out))
}

/// Pure-Rust process tree discovery without wasm-bindgen. Used by integration tests.
#[must_use]
pub fn discover_simple_process_tree_from_log(log: &EventLog, activity_key: &str) -> String {
    let mut freq: std::collections::HashMap<String, usize> = std::collections::HashMap::new();

    for trace in &log.traces {
        let acts: Vec<String> = trace
            .events
            .iter()
            .filter_map(|e| {
                e.attributes
                    .get(activity_key)
                    .and_then(|v| v.as_string())
                    .map(str::to_owned)
            })
            .collect();
        for a in &acts {
            *freq.entry(a.clone()).or_insert(0) += 1;
        }
    }

    let mut sorted_acts: Vec<(String, usize)> = freq.into_iter().collect();
    sorted_acts.sort_unstable_by_key(|b| std::cmp::Reverse(b.1));

    let children: Vec<serde_json::Value> = sorted_acts
        .iter()
        .map(|(label, _)| json!({"type": "activity", "label": label}))
        .collect();

    let tree = if children.len() == 1 {
        children
            .into_iter()
            .next()
            .expect("children.len() == 1 guarantees one element")
    } else {
        json!({
            "type": "operator",
            "operator": "SEQ",
            "children": children,
        })
    };

    serde_json::to_string(&tree)
        .unwrap_or_else(|_| r#"{"type":"operator","operator":"SEQ","children":[]}"#.to_string())
}

/// Discover a simple process tree from an event log using frequency-based heuristics.
///
/// Returns a JSON string representing the process tree.
#[wasm_bindgen]
pub fn discover_simple_process_tree(
    log_handle: &str,
    activity_key: &str,
) -> Result<JsValue, JsValue> {
    use crate::state::{get_or_init_state, StoredObject};

    let log = get_or_init_state().with_object(log_handle, |obj| match obj {
        Some(StoredObject::EventLog(log)) => Ok(log.clone()),
        Some(_) => Err(crate::error::js_val("Handle is not an EventLog")),
        None => Err(crate::error::js_val("EventLog handle not found")),
    })?;
    Ok(crate::error::js_val(
        &discover_simple_process_tree_from_log(&log, activity_key),
    ))
}

// ─── Unit tests ───────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    // ActivityName tests

    #[test]
    fn activity_name_deref_and_display() {
        let a = ActivityName::new("Register");
        assert_eq!(a.as_str(), "Register");
        assert_eq!(a.to_string(), "Register");
        assert_eq!(&*a, "Register");
    }

    #[test]
    fn activity_name_from_str() {
        let a: ActivityName = "Approve".into();
        assert_eq!(a.as_str(), "Approve");
    }

    #[test]
    fn activity_name_into_inner() {
        let a = ActivityName::new("Ship");
        assert_eq!(a.into_inner(), "Ship".to_string());
    }

    #[test]
    fn activity_name_ord() {
        let mut names = vec![
            ActivityName::new("C"),
            ActivityName::new("A"),
            ActivityName::new("B"),
        ];
        names.sort();
        assert_eq!(
            names.iter().map(|n| n.as_str()).collect::<Vec<_>>(),
            vec!["A", "B", "C"]
        );
    }

    // ProcessTreeOperator tests

    #[test]
    fn operator_symbol_round_trip() {
        for op in [
            ProcessTreeOperator::Sequence,
            ProcessTreeOperator::ExclusiveChoice,
            ProcessTreeOperator::Parallel,
            ProcessTreeOperator::Loop,
            ProcessTreeOperator::Or,
        ] {
            let tag = op.ascii_tag();
            assert_eq!(ProcessTreeOperator::from_tag(tag), Some(op));
        }
    }

    #[test]
    fn operator_from_tag_case_insensitive() {
        assert_eq!(
            ProcessTreeOperator::from_tag("seq"),
            Some(ProcessTreeOperator::Sequence)
        );
        assert_eq!(
            ProcessTreeOperator::from_tag("SEQUENCE"),
            Some(ProcessTreeOperator::Sequence)
        );
        assert_eq!(
            ProcessTreeOperator::from_tag("loop"),
            Some(ProcessTreeOperator::Loop)
        );
    }

    #[test]
    fn operator_from_tag_unknown() {
        assert_eq!(ProcessTreeOperator::from_tag("UNKNOWN"), None);
        assert_eq!(ProcessTreeOperator::from_tag(""), None);
    }

    #[test]
    fn operator_is_binary() {
        assert!(ProcessTreeOperator::Loop.is_binary());
        assert!(!ProcessTreeOperator::Sequence.is_binary());
        assert!(!ProcessTreeOperator::Parallel.is_binary());
    }

    #[test]
    fn operator_display() {
        assert_eq!(ProcessTreeOperator::Sequence.to_string(), "→");
        assert_eq!(ProcessTreeOperator::ExclusiveChoice.to_string(), "×");
        assert_eq!(ProcessTreeOperator::Parallel.to_string(), "∧");
        assert_eq!(ProcessTreeOperator::Loop.to_string(), "↺");
        assert_eq!(ProcessTreeOperator::Or.to_string(), "∨");
    }

    // ProcessTree construction tests

    #[test]
    fn tau_leaf() {
        let t = ProcessTree::tau();
        assert!(t.is_tau());
        assert!(t.is_leaf());
        assert!(!t.is_operator());
        assert_eq!(t.depth(), 0);
        assert_eq!(t.node_count(), 1);
        assert_eq!(t.to_repr(), "tau");
    }

    #[test]
    fn activity_leaf() {
        let t = ProcessTree::activity("Register");
        assert!(t.is_activity());
        assert!(!t.is_tau());
        assert_eq!(t.activity_name().map(|n| n.as_str()), Some("Register"));
        assert_eq!(t.to_repr(), "Register");
    }

    #[test]
    fn sequence_tree_repr() {
        let t = ProcessTree::sequence(vec![ProcessTree::activity("A"), ProcessTree::activity("B")]);
        assert_eq!(t.operator(), Some(ProcessTreeOperator::Sequence));
        assert_eq!(t.arity(), 2);
        assert_eq!(t.depth(), 1);
        assert_eq!(t.node_count(), 3);
        assert_eq!(t.to_repr(), "->( A, B )");
    }

    #[test]
    fn loop_tree() {
        let body = ProcessTree::activity("Work");
        let redo = ProcessTree::tau();
        let t = ProcessTree::loop_node(body, redo);
        assert_eq!(t.operator(), Some(ProcessTreeOperator::Loop));
        assert_eq!(t.arity(), 2);
        assert_eq!(t.to_repr(), "*( Work, tau )");
    }

    #[test]
    fn nested_tree_depth() {
        // →( ×(A, B), ∧(C, D) )
        let t = ProcessTree::sequence(vec![
            ProcessTree::xor(vec![ProcessTree::activity("A"), ProcessTree::activity("B")]),
            ProcessTree::parallel(vec![ProcessTree::activity("C"), ProcessTree::activity("D")]),
        ]);
        assert_eq!(t.depth(), 2);
        assert_eq!(t.node_count(), 7); // root + 2 ops + 4 leaves
    }

    #[test]
    fn activity_set_dedup() {
        // Activities appearing multiple times should be de-duplicated.
        let t = ProcessTree::sequence(vec![
            ProcessTree::activity("A"),
            ProcessTree::activity("B"),
            ProcessTree::activity("A"),
        ]);
        let set = t.activity_set();
        let mut expected = BTreeSet::new();
        expected.insert(ActivityName::new("A"));
        expected.insert(ActivityName::new("B"));
        assert_eq!(set, expected);
    }

    #[test]
    fn activity_frequency_map() {
        let t = ProcessTree::sequence(vec![
            ProcessTree::activity("A"),
            ProcessTree::loop_node(ProcessTree::activity("A"), ProcessTree::tau()),
        ]);
        let freq = t.activity_frequency_map();
        assert_eq!(freq.get(&ActivityName::new("A")), Some(&2));
    }

    #[test]
    fn children_of_leaf_is_empty() {
        let t = ProcessTree::tau();
        assert_eq!(t.children(), &[] as &[ProcessTree]);
    }

    //  compatibility tests

    #[test]
    fn process_tree_node_into_typed_sequence() {
        let node = ProcessTreeNode::operator("SEQ")
            .add_child(ProcessTreeNode::activity("A"))
            .add_child(ProcessTreeNode::activity("B"));
        let typed = node.into_typed();
        assert_eq!(typed.operator(), Some(ProcessTreeOperator::Sequence));
        assert_eq!(typed.arity(), 2);
    }

    #[test]
    fn process_tree_node_into_typed_silent() {
        let node = ProcessTreeNode::silent();
        let typed = node.into_typed();
        assert!(typed.is_tau());
    }

    #[test]
    fn process_tree_node_into_typed_unknown_tag_defaults_to_sequence() {
        let node =
            ProcessTreeNode::operator("UNKNOWN_OP").add_child(ProcessTreeNode::activity("X"));
        let typed = node.into_typed();
        assert_eq!(typed.operator(), Some(ProcessTreeOperator::Sequence));
    }

    // Serde round-trip (only when feature is active — in test builds serde
    // is always available via the workspace dep, so we test unconditionally).
    #[test]
    #[cfg(feature = "serde")]
    fn serde_round_trip_operator() {
        let op = ProcessTreeOperator::Loop;
        let json = serde_json::to_string(&op).unwrap();
        let back: ProcessTreeOperator = serde_json::from_str(&json).unwrap();
        assert_eq!(op, back);
    }

    #[test]
    #[cfg(feature = "serde")]
    fn serde_round_trip_tree() {
        let t = ProcessTree::sequence(vec![
            ProcessTree::tau(),
            ProcessTree::activity("Register"),
            ProcessTree::xor(vec![
                ProcessTree::activity("Approve"),
                ProcessTree::activity("Reject"),
            ]),
        ]);
        let json = serde_json::to_string(&t).unwrap();
        let back: ProcessTree = serde_json::from_str(&json).unwrap();
        assert_eq!(t, back);
    }

    #[test]
    #[cfg(feature = "serde")]
    fn serde_round_trip_activity_name() {
        let a = ActivityName::new("Pay");
        let json = serde_json::to_string(&a).unwrap();
        let back: ActivityName = serde_json::from_str(&json).unwrap();
        assert_eq!(a, back);
    }
}
