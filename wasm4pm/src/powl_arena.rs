#![allow(deprecated)]
//! POWL (Partially Ordered Workflow Language) core data model.
//!
//! Mirrors the Python class hierarchy in `pm4py/objects/powl/obj.py`:
//!   POWL (abstract)
//!   ├── Transition          — labeled activity
//!   │   ├── SilentTransition — tau
//!   │   └── FrequentTransition — activity with [min,max] frequency
//!   ├── StrictPartialOrder  — partial order over children
//!   │   └── Sequence        — total order (convenience subtype)
//!   └── OperatorPOWL       — XOR choice or LOOP
//!
//! Instead of a recursive `Box<dyn POWL>` tree (problematic for wasm-bindgen),
//! nodes are stored in a flat `PowlArena` and referenced by u32 indices.

use crate::error::Wasm4pmError;

// ─── BinaryRelation ─────────────────────────────────────────────────────────

/// Bit-packed adjacency matrix for partial order relations.
///
/// Uses a flat `Vec<u64>` where row `i` is stored at
/// `words[i * row_words .. (i+1) * row_words]`.
/// This gives cache-friendly row-OR operations for the Warshall closure.
#[derive(Clone, Debug)]
pub struct BinaryRelation {
    pub n: usize,
    pub row_words: usize,
    /// Flat bit-matrix; bit j of words[i*row_words + j/64] represents edge i→j.
    pub words: Vec<u64>,
}

impl BinaryRelation {
    /// Create an n×n zero matrix.
    #[must_use]
    pub fn new(n: usize) -> Self {
        let row_words = if n == 0 { 0 } else { n.div_ceil(64) };
        BinaryRelation {
            n,
            row_words,
            words: vec![0u64; n * row_words],
        }
    }

    #[inline]
    fn word_idx(&self, i: usize, j: usize) -> (usize, u32) {
        let idx = i * self.row_words + j / 64;
        let bit = (j % 64) as u32;
        (idx, bit)
    }

    pub fn add_edge(&mut self, i: usize, j: usize) {
        debug_assert!(i < self.n && j < self.n, "edge index out of bounds");
        let (idx, bit) = self.word_idx(i, j);
        self.words[idx] |= 1u64 << bit;
    }

    pub fn remove_edge(&mut self, i: usize, j: usize) {
        debug_assert!(i < self.n && j < self.n, "edge index out of bounds");
        let (idx, bit) = self.word_idx(i, j);
        self.words[idx] &= !(1u64 << bit);
    }

    #[inline]
    pub fn is_edge(&self, i: usize, j: usize) -> bool {
        if i >= self.n || j >= self.n {
            return false;
        }
        let (idx, bit) = self.word_idx(i, j);
        (self.words[idx] >> bit) & 1 == 1
    }

    /// O(n) — check no self-loops.
    pub fn is_irreflexive(&self) -> bool {
        for i in 0..self.n {
            if self.is_edge(i, i) {
                return false;
            }
        }
        true
    }

    /// O(n³) — check transitivity: for all i,j,k: edge(i,j) ∧ edge(j,k) → edge(i,k).
    pub fn is_transitive(&self) -> bool {
        for i in 0..self.n {
            for j in 0..self.n {
                if !self.is_edge(i, j) {
                    continue;
                }
                for k in 0..self.n {
                    if self.is_edge(j, k) && !self.is_edge(i, k) {
                        return false;
                    }
                }
            }
        }
        true
    }

    pub fn is_strict_partial_order(&self) -> bool {
        self.is_irreflexive() && self.is_transitive()
    }

    /// Floyd-Warshall transitive closure, O(n³) with word-level OR operations.
    /// Modifies self in-place.
    pub fn add_transitive_edges(&mut self) {
        for k in 0..self.n {
            for i in 0..self.n {
                if self.is_edge(i, k) {
                    let row_i_start = i * self.row_words;
                    let row_k_start = k * self.row_words;
                    for w in 0..self.row_words {
                        self.words[row_i_start + w] |= self.words[row_k_start + w];
                    }
                }
            }
        }
    }

    /// O(n³) — return a new relation with redundant edges removed.
    pub fn get_transitive_reduction(&self) -> Self {
        debug_assert!(
            self.is_irreflexive(),
            "transitive reduction requires irreflexivity"
        );
        let mut res = self.clone();
        for i in 0..self.n {
            for j in 0..self.n {
                if !self.is_edge(i, j) {
                    continue;
                }
                for k in 0..self.n {
                    if i != j && j != k && self.is_edge(j, k) && res.is_edge(i, k) {
                        res.remove_edge(i, k);
                    }
                }
            }
        }
        res
    }

    /// O(n²) — nodes with no incoming edges (in-degree == 0).
    #[allow(clippy::needless_range_loop)]
    pub fn get_start_nodes(&self) -> Vec<usize> {
        let mut has_incoming = vec![false; self.n];
        for i in 0..self.n {
            for j in 0..self.n {
                if self.is_edge(i, j) {
                    has_incoming[j] = true;
                }
            }
        }
        (0..self.n).filter(|&j| !has_incoming[j]).collect()
    }

    /// O(n²) — nodes with no outgoing edges (out-degree == 0).
    #[allow(clippy::needless_range_loop)]
    pub fn get_end_nodes(&self) -> Vec<usize> {
        let mut has_outgoing = vec![false; self.n];
        for i in 0..self.n {
            for j in 0..self.n {
                if self.is_edge(i, j) {
                    has_outgoing[i] = true;
                }
            }
        }
        (0..self.n).filter(|&i| !has_outgoing[i]).collect()
    }

    /// Remove an edge while maintaining transitivity.
    pub fn remove_edge_without_violating_transitivity(&mut self, src: usize, tgt: usize) {
        self.remove_edge(src, tgt);
        let n = self.n;
        let mut changed = true;
        while changed {
            changed = false;
            for i in 0..n {
                for j in 0..n {
                    if i == j || !self.is_edge(i, j) {
                        continue;
                    }
                    for k in 0..n {
                        if j == k {
                            continue;
                        }
                        if self.is_edge(j, k) && !self.is_edge(i, k) {
                            self.remove_edge(j, k);
                            changed = true;
                        }
                    }
                }
            }
        }
    }

    /// Grow by one node; preserves all existing edges.
    pub fn add_node(&mut self) -> usize {
        let new_n = self.n + 1;
        let new_row_words = new_n.div_ceil(64);
        if new_row_words != self.row_words {
            let mut new_words = vec![0u64; new_n * new_row_words];
            for i in 0..self.n {
                for w in 0..self.row_words {
                    new_words[i * new_row_words + w] = self.words[i * self.row_words + w];
                }
            }
            self.row_words = new_row_words;
            self.words = new_words;
        } else {
            for _ in 0..new_row_words {
                self.words.push(0u64);
            }
        }
        self.n = new_n;
        self.n - 1
    }

    /// O(n) — returns indices of nodes with edges to `node` (incoming neighbors).
    pub fn get_preset(&self, node: usize) -> Vec<usize> {
        if node >= self.n {
            return Vec::new();
        }
        let mut preset = Vec::new();
        for i in 0..self.n {
            if self.is_edge(i, node) {
                preset.push(i);
            }
        }
        preset
    }

    /// O(n) — returns indices of nodes with edges from `node` (outgoing neighbors).
    pub fn get_postset(&self, node: usize) -> Vec<usize> {
        if node >= self.n {
            return Vec::new();
        }
        let mut postset = Vec::new();
        for j in 0..self.n {
            if self.is_edge(node, j) {
                postset.push(j);
            }
        }
        postset
    }

    /// Serialise as a list of (src, tgt) pairs.
    pub fn edge_list(&self) -> Vec<(usize, usize)> {
        let mut edges = Vec::new();
        for i in 0..self.n {
            for j in 0..self.n {
                if self.is_edge(i, j) {
                    edges.push((i, j));
                }
            }
        }
        edges
    }
}

// ─── Operator enum ───────────────────────────────────────────────────────────

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Operator {
    Xor,
    Loop,
    PartialOrder,
}

impl Operator {
    pub fn as_str(&self) -> &'static str {
        match self {
            Operator::Xor => "X",
            Operator::Loop => "*",
            Operator::PartialOrder => "PO",
        }
    }
}

// ─── Node variants ───────────────────────────────────────────────────────────

#[derive(Clone, Debug)]
pub struct TransitionNode {
    /// Activity label. None for silent (tau) transitions.
    pub label: Option<String>,
    /// Unique integer identifier.
    pub id: u32,
}

#[derive(Clone, Debug)]
pub struct FrequentTransitionNode {
    /// Displayed activity label (may include `\n[min,max]` suffix).
    pub label: String,
    /// Underlying activity name (without frequency annotation).
    pub activity: String,
    /// Minimum execution count (>= 0). Matches TaggedPOWL.min_freq from the reference.
    pub min_freq: i64,
    /// Maximum execution count. None = unbounded. Matches TaggedPOWL.max_freq.
    pub max_freq: Option<i64>,
    /// Derived: min_freq == 0. Kept for backward compat with callers.
    pub skippable: bool,
    /// Derived: max_freq.is_none(). Kept for backward compat with callers.
    pub selfloop: bool,
    pub id: u32,
}

impl FrequentTransitionNode {
    /// Reference: TaggedPOWL.is_skippable() → min_freq == 0
    #[inline]
    pub fn is_skippable(&self) -> bool {
        self.min_freq == 0
    }

    /// Reference: TaggedPOWL.is_repeatable() → max_freq is None or max_freq > 1
    #[inline]
    pub fn is_repeatable(&self) -> bool {
        self.max_freq.is_none() || self.max_freq.unwrap() > 1
    }

    /// Reference: TaggedPOWL.is_unbounded() → max_freq is None
    #[inline]
    pub fn is_unbounded(&self) -> bool {
        self.max_freq.is_none()
    }

    /// Reference: TaggedPOWL.freq_range() → (min_freq, max_freq)
    #[inline]
    pub fn freq_range(&self) -> (i64, Option<i64>) {
        (self.min_freq, self.max_freq)
    }

    /// Shallow structural comparison matching TaggedPOWL.same_signature().
    pub fn same_signature(&self, other: &FrequentTransitionNode) -> bool {
        self.activity == other.activity
            && self.min_freq == other.min_freq
            && self.max_freq == other.max_freq
    }
}

#[derive(Clone, Debug)]
pub struct StrictPartialOrderNode {
    /// Indices into `PowlArena::nodes` for each child.
    pub children: Vec<u32>,
    /// Adjacency matrix over the *local* child indices (0..children.len()).
    pub order: BinaryRelation,
}

#[derive(Clone, Debug)]
pub struct OperatorPowlNode {
    pub operator: Operator,
    /// Indices into `PowlArena::nodes` for each child.
    pub children: Vec<u32>,
}

/// Non-block-structured choice model with artificial start/end sentinel nodes.
///
/// Models overlapping choices that cannot be expressed with XOR or LOOP.
/// Reference: Kourani, Park, van der Aalst. "Unlocking Non-Block-Structured
/// Decisions: Inductive Mining with Choice Graphs" (arXiv:2505.07052).
#[derive(Clone, Debug)]
pub struct DecisionGraphNode {
    /// Indices into `PowlArena::nodes` for each child.
    pub children: Vec<u32>,
    /// Adjacency matrix over the *local* child indices (0..children.len()).
    /// Includes two extra rows/columns for artificial start (index n) and end (index n+1).
    pub order: BinaryRelation,
    /// Local indices of children that are start nodes.
    pub start_nodes: Vec<usize>,
    /// Local indices of children that are end nodes.
    pub end_nodes: Vec<usize>,
    /// Whether an empty path (start → end directly) exists.
    pub empty_path: bool,
}

/// Spec-compliant Choice Graph (Definition 1, paper arXiv:2505.07052) node.
///
/// Stores a validated `wasm4pm_types::ChoiceGraph` plus arena indices for
/// each `ChoiceGraphNode::SubModel(_)` it contains. `Activity(label)` nodes
/// are normalized to `SubModel(arena.add_transition(Some(label)))` at
/// construction time so the projection has a uniform sub-model handle.
#[derive(Clone, Debug)]
pub struct ChoiceGraphPowlNode {
    /// The validated graph. All `ChoiceGraphNode::Activity(_)` entries have
    /// been normalized to `SubModel(arena_idx)` before being stored here.
    pub graph: wasm4pm_types::ChoiceGraph,
}

/// Discriminated union of all node kinds stored in the arena.
#[derive(Clone, Debug)]
pub enum PowlNode {
    Transition(TransitionNode),
    FrequentTransition(FrequentTransitionNode),
    StrictPartialOrder(StrictPartialOrderNode),
    OperatorPowl(OperatorPowlNode),
    /// Legacy non-block-structured choice. Internal use only; prefer `ChoiceGraph` for new code.
    DecisionGraph(DecisionGraphNode),
    /// Spec-compliant choice graph (paper arXiv:2505.07052, Definition 1).
    ChoiceGraph(ChoiceGraphPowlNode),
}

impl PowlNode {
    pub fn is_silent(&self) -> bool {
        matches!(self, PowlNode::Transition(t) if t.label.is_none())
    }

    pub fn label(&self) -> Option<&str> {
        match self {
            PowlNode::Transition(t) => t.label.as_deref(),
            PowlNode::FrequentTransition(t) => Some(&t.label),
            _ => None,
        }
    }
}

// ─── Arena ───────────────────────────────────────────────────────────────────

/// Flat storage for the entire POWL model tree.
///
/// The root of the model is tracked externally by `PowlModel`.
/// Individual nodes reference their children by arena index.
#[derive(Clone, Debug, Default)]
pub struct PowlArena {
    pub nodes: Vec<PowlNode>,
    next_transition_id: u32,
}

impl PowlArena {
    #[must_use]
    pub fn new() -> Self {
        PowlArena {
            nodes: Vec::new(),
            next_transition_id: 0,
        }
    }

    fn alloc_id(&mut self) -> u32 {
        let id = self.next_transition_id;
        self.next_transition_id += 1;
        id
    }

    /// Add a labeled transition; returns its arena index.
    pub fn add_transition(&mut self, label: Option<String>) -> u32 {
        let id = self.alloc_id();
        let idx = self.nodes.len() as u32;
        self.nodes
            .push(PowlNode::Transition(TransitionNode { label, id }));
        idx
    }

    /// Add a silent (tau) transition.
    pub fn add_silent_transition(&mut self) -> u32 {
        self.add_transition(None)
    }

    /// Add a FrequentTransition node.
    ///
    /// Stores the exact `min_freq`/`max_freq` integers per the TaggedPOWL reference
    /// (`vendors/POWL/powl/objects/tagged_powl/base.py`). The boolean helpers
    /// `skippable` and `selfloop` are derived from these values for backward compat.
    pub fn add_frequent_transition(
        &mut self,
        activity: String,
        min_freq: i64,
        max_freq: Option<i64>,
    ) -> u32 {
        let id = self.alloc_id();
        let idx = self.nodes.len() as u32;
        let skippable = min_freq == 0;
        let selfloop = max_freq.is_none();
        let max_str = max_freq.map_or_else(|| "-".to_string(), |v| v.to_string());
        let label = if skippable || selfloop {
            format!("{}\n[{},{}]", activity, min_freq, max_str)
        } else {
            activity.clone()
        };
        self.nodes
            .push(PowlNode::FrequentTransition(FrequentTransitionNode {
                label,
                activity,
                min_freq,
                max_freq,
                skippable,
                selfloop,
                id,
            }));
        idx
    }

    /// Add a StrictPartialOrder node. `children` are arena indices.
    pub fn add_strict_partial_order(&mut self, children: Vec<u32>) -> u32 {
        let n = children.len();
        let idx = self.nodes.len() as u32;
        self.nodes
            .push(PowlNode::StrictPartialOrder(StrictPartialOrderNode {
                children,
                order: BinaryRelation::new(n),
            }));
        idx
    }

    /// Add a Sequence (total order over children).
    pub fn add_sequence(&mut self, children: Vec<u32>) -> u32 {
        let n = children.len();
        let idx = self.nodes.len() as u32;
        let mut order = BinaryRelation::new(n);
        for i in 0..n {
            for j in (i + 1)..n {
                order.add_edge(i, j);
            }
        }
        self.nodes
            .push(PowlNode::StrictPartialOrder(StrictPartialOrderNode {
                children,
                order,
            }));
        idx
    }

    /// Add an OperatorPOWL node (XOR or LOOP).
    pub fn add_operator(&mut self, operator: Operator, children: Vec<u32>) -> u32 {
        let idx = self.nodes.len() as u32;
        self.nodes.push(PowlNode::OperatorPowl(OperatorPowlNode {
            operator,
            children,
        }));
        idx
    }

    /// Add a DecisionGraph node.
    ///
    /// `order` must be a `BinaryRelation` of size `children.len() + 2`
    /// where the last two rows/columns represent the artificial start and end nodes.
    /// `start_nodes` and `end_nodes` are local child indices (0..children.len()).
    pub fn add_decision_graph(
        &mut self,
        children: Vec<u32>,
        order: BinaryRelation,
        start_nodes: Vec<usize>,
        end_nodes: Vec<usize>,
        empty_path: bool,
    ) -> u32 {
        let idx = self.nodes.len() as u32;
        self.nodes.push(PowlNode::DecisionGraph(DecisionGraphNode {
            children,
            order,
            start_nodes,
            end_nodes,
            empty_path,
        }));
        idx
    }

    /// Add a spec-compliant ChoiceGraph node (Definition 1, arXiv:2505.07052).
    ///
    /// `Activity(label)` nodes in the input graph are normalized to
    /// `SubModel(arena_idx_of_silent_or_labeled_transition)` before storage so
    /// every node references a sub-model in the arena.
    ///
    /// Returns the arena index of the new ChoiceGraph node.
    pub fn add_choice_graph(
        &mut self,
        graph: &wasm4pm_types::ChoiceGraph,
    ) -> u32 {
        // Normalize Activity(_) → SubModel(arena_idx_of_transition).
        let mut normalized_nodes = Vec::with_capacity(graph.nodes.len());
        for n in &graph.nodes {
            match n {
                wasm4pm_types::ChoiceGraphNode::Activity(lbl) => {
                    let t_idx = self.add_transition(Some(lbl.clone()));
                    normalized_nodes
                        .push(wasm4pm_types::ChoiceGraphNode::SubModel(t_idx));
                }
                other => normalized_nodes.push(other.clone()),
            }
        }
        let normalized = wasm4pm_types::ChoiceGraph {
            nodes: normalized_nodes,
            edges: graph.edges.clone(),
            start_idx: graph.start_idx,
            end_idx: graph.end_idx,
        };
        let idx = self.nodes.len() as u32;
        #[allow(deprecated)]
        self.nodes
            .push(PowlNode::ChoiceGraph(ChoiceGraphPowlNode { graph: normalized }));
        idx
    }

    /// Add an edge inside a StrictPartialOrder.
    pub fn add_order_edge(
        &mut self,
        spo_idx: u32,
        child_src: usize,
        child_tgt: usize,
    ) -> Result<(), String> {
        if let Some(PowlNode::StrictPartialOrder(spo)) = self.nodes.get_mut(spo_idx as usize) {
            spo.order.add_edge(child_src, child_tgt);
            Ok(())
        } else {
            Err(format!("node {} is not a StrictPartialOrder", spo_idx))
        }
    }

    /// Compute transitive closure on the order relation of a SPO node.
    pub fn close_order_transitively(&mut self, spo_idx: u32) {
        if let Some(PowlNode::StrictPartialOrder(spo)) = self.nodes.get_mut(spo_idx as usize) {
            spo.order.add_transitive_edges();
        }
    }

    pub fn len(&self) -> usize {
        self.nodes.len()
    }

    pub fn is_empty(&self) -> bool {
        self.nodes.is_empty()
    }

    pub fn get(&self, idx: u32) -> Option<&PowlNode> {
        self.nodes.get(idx as usize)
    }

    pub fn get_mut(&mut self, idx: u32) -> Option<&mut PowlNode> {
        self.nodes.get_mut(idx as usize)
    }

    /// Recursively validate that all StrictPartialOrder nodes have
    /// Validate that all SPO nodes have irreflexive ordering relations.
    /// Checks transitivity on the transitive closure (user-specified edges
    /// may not be transitively closed, which is fine — the closure is).
    pub fn validate_partial_orders(&self, root: u32) -> Result<(), Wasm4pmError> {
        match self.nodes.get(root as usize) {
            Some(PowlNode::StrictPartialOrder(spo)) => {
                if !spo.order.is_irreflexive() {
                    return Err(Wasm4pmError::Validation(format!(
                        "node {}: partial order is not irreflexive",
                        root
                    )));
                }
                // Check transitivity on the closure, not raw edges
                let closure = crate::powl::transitive::transitive_closure(&spo.order);
                if !closure.is_transitive() {
                    return Err(Wasm4pmError::Validation(format!(
                        "node {}: partial order is not transitive",
                        root
                    )));
                }
                for &child in &spo.children {
                    self.validate_partial_orders(child)?;
                }
            }
            Some(PowlNode::OperatorPowl(op)) => {
                for &child in &op.children {
                    self.validate_partial_orders(child)?;
                }
            }
            Some(PowlNode::DecisionGraph(dg)) => {
                for &child in &dg.children {
                    self.validate_partial_orders(child)?;
                }
            }
            Some(PowlNode::ChoiceGraph(cg)) => {
                for n in &cg.graph.nodes {
                    if let wasm4pm_types::ChoiceGraphNode::SubModel(idx) = n {
                        self.validate_partial_orders(*idx)?;
                    }
                }
            }
            _ => {}
        }
        Ok(())
    }

    /// Produce the same string as the Python `__repr__` / `to_string()`.
    pub fn to_repr(&self, idx: u32) -> String {
        match self.nodes.get(idx as usize) {
            None => String::from("<invalid>"),
            Some(PowlNode::Transition(t)) => match &t.label {
                None => "tau".to_string(),
                Some(l) => l.clone(),
            },
            Some(PowlNode::FrequentTransition(t)) => t.label.clone(),
            Some(PowlNode::StrictPartialOrder(spo)) => {
                let nodes_str: Vec<String> =
                    spo.children.iter().map(|&c| self.to_repr(c)).collect();
                let mut edges_str: Vec<String> = Vec::new();
                let n = spo.children.len();
                for i in 0..n {
                    for j in 0..n {
                        if spo.order.is_edge(i, j) {
                            let src_label = self.node_label_or_id(spo.children[i]);
                            let tgt_label = self.node_label_or_id(spo.children[j]);
                            edges_str.push(format!("{}-->{}", src_label, tgt_label));
                        }
                    }
                }
                format!(
                    "PO=(nodes={{{}}}, order={{{}}})",
                    nodes_str.join(", "),
                    edges_str.join(", ")
                )
            }
            Some(PowlNode::OperatorPowl(op)) => {
                let children_str: Vec<String> =
                    op.children.iter().map(|&c| self.to_repr(c)).collect();
                format!("{} ( {} )", op.operator.as_str(), children_str.join(", "))
            }
            Some(PowlNode::DecisionGraph(dg)) => {
                let children_str: Vec<String> =
                    dg.children.iter().map(|&c| self.to_repr(c)).collect();
                let mut edges_str: Vec<String> = Vec::new();
                let n = dg.children.len();
                for i in 0..n {
                    for j in 0..n {
                        if dg.order.is_edge(i, j) {
                            let src_label = self.node_label_or_id(dg.children[i]);
                            let tgt_label = self.node_label_or_id(dg.children[j]);
                            edges_str.push(format!("{}-->{}", src_label, tgt_label));
                        }
                    }
                }
                format!(
                    "DG=(nodes={{{}}}, order={{{}}}, starts=[{}], ends=[{}], empty={})",
                    children_str.join(", "),
                    edges_str.join(", "),
                    dg.start_nodes
                        .iter()
                        .map(|&i| self.node_label_or_id(dg.children[i]))
                        .collect::<Vec<_>>()
                        .join(", "),
                    dg.end_nodes
                        .iter()
                        .map(|&i| self.node_label_or_id(dg.children[i]))
                        .collect::<Vec<_>>()
                        .join(", "),
                    dg.empty_path,
                )
            }
            Some(PowlNode::ChoiceGraph(cg)) => {
                let mut node_strs: Vec<String> = Vec::new();
                for n in &cg.graph.nodes {
                    match n {
                        wasm4pm_types::ChoiceGraphNode::Start => node_strs.push("Start".into()),
                        wasm4pm_types::ChoiceGraphNode::End => node_strs.push("End".into()),
                        wasm4pm_types::ChoiceGraphNode::Activity(l) => node_strs.push(l.clone()),
                        wasm4pm_types::ChoiceGraphNode::SubModel(i) => {
                            node_strs.push(self.to_repr(*i))
                        }
                    }
                }
                let edges_str: Vec<String> = cg
                    .graph
                    .edges
                    .iter()
                    .map(|&(a, b)| {
                        format!(
                            "{}->{}",
                            cg_node_label(&cg.graph.nodes, a, self),
                            cg_node_label(&cg.graph.nodes, b, self)
                        )
                    })
                    .collect();
                format!(
                    "CG=(nodes={{{}}}, edges={{{}}})",
                    node_strs.join(", "),
                    edges_str.join(", ")
                )
            }
        }
    }

    pub(crate) fn node_label_or_id(&self, idx: u32) -> String {
        match self.nodes.get(idx as usize) {
            Some(PowlNode::Transition(t)) => match &t.label {
                None => format!("id_{}", idx),
                Some(l) => l.clone(),
            },
            Some(PowlNode::FrequentTransition(t)) => t.label.clone(),
            _ => format!("id_{}", idx),
        }
    }

    /// Deep-copy the subtree rooted at `idx` into a new arena.
    pub fn copy_subtree(&self, idx: u32) -> Result<(PowlArena, u32), Wasm4pmError> {
        let mut new_arena = PowlArena::new();
        let new_root = self.copy_node_into(&mut new_arena, idx).map_err(Wasm4pmError::Validation)?;
        Ok((new_arena, new_root))
    }

    fn copy_node_into(&self, dest: &mut PowlArena, idx: u32) -> Result<u32, String> {
        match self.nodes.get(idx as usize) {
            None => Err(format!("invalid arena index {}", idx)),
            Some(PowlNode::Transition(t)) => Ok(dest.add_transition(t.label.clone())),
            Some(PowlNode::FrequentTransition(t)) => {
                Ok(dest.add_frequent_transition(t.activity.clone(), t.min_freq, t.max_freq))
            }
            Some(PowlNode::StrictPartialOrder(spo)) => {
                let new_children: Vec<u32> = spo
                    .children
                    .iter()
                    .map(|&c| self.copy_node_into(dest, c))
                    .collect::<Result<Vec<_>, _>>()?;
                let spo_idx = dest.add_strict_partial_order(new_children);
                let n = spo.children.len();
                if let Some(PowlNode::StrictPartialOrder(new_spo)) =
                    dest.nodes.get_mut(spo_idx as usize)
                {
                    for i in 0..n {
                        for j in 0..n {
                            if spo.order.is_edge(i, j) {
                                new_spo.order.add_edge(i, j);
                            }
                        }
                    }
                }
                Ok(spo_idx)
            }
            Some(PowlNode::OperatorPowl(op)) => {
                let operator = op.operator;
                let new_children: Vec<u32> = op
                    .children
                    .iter()
                    .map(|&c| self.copy_node_into(dest, c))
                    .collect::<Result<Vec<_>, _>>()?;
                Ok(dest.add_operator(operator, new_children))
            }
            Some(PowlNode::DecisionGraph(dg)) => {
                let new_children: Vec<u32> = dg
                    .children
                    .iter()
                    .map(|&c| self.copy_node_into(dest, c))
                    .collect::<Result<Vec<_>, _>>()?;

                Ok(dest.add_decision_graph(
                    new_children,
                    dg.order.clone(),
                    dg.start_nodes.clone(),
                    dg.end_nodes.clone(),
                    dg.empty_path,
                ))
            }
            Some(PowlNode::ChoiceGraph(cg)) => {
                // Recursively copy any SubModel sub-trees, preserving Start/End markers.
                let mut new_nodes = Vec::with_capacity(cg.graph.nodes.len());
                for n in &cg.graph.nodes {
                    match n {
                        wasm4pm_types::ChoiceGraphNode::Start => {
                            new_nodes.push(wasm4pm_types::ChoiceGraphNode::Start)
                        }
                        wasm4pm_types::ChoiceGraphNode::End => {
                            new_nodes.push(wasm4pm_types::ChoiceGraphNode::End)
                        }
                        wasm4pm_types::ChoiceGraphNode::Activity(l) => new_nodes
                            .push(wasm4pm_types::ChoiceGraphNode::Activity(l.clone())),
                        wasm4pm_types::ChoiceGraphNode::SubModel(child) => {
                            let new_child = self.copy_node_into(dest, *child)?;
                            new_nodes.push(wasm4pm_types::ChoiceGraphNode::SubModel(new_child));
                        }
                    }
                }
                let new_graph = wasm4pm_types::ChoiceGraph {
                    nodes: new_nodes,
                    edges: cg.graph.edges.clone(),
                    start_idx: cg.graph.start_idx,
                    end_idx: cg.graph.end_idx,
                };
                // Add directly without re-normalizing (already normalized).
                let idx = dest.nodes.len() as u32;
                dest.nodes.push(PowlNode::ChoiceGraph(ChoiceGraphPowlNode {
                    graph: new_graph,
                }));
                Ok(idx)
            }
        }
    }
}

fn cg_node_label(
    nodes: &[wasm4pm_types::ChoiceGraphNode],
    i: usize,
    arena: &PowlArena,
) -> String {
    match nodes.get(i) {
        Some(wasm4pm_types::ChoiceGraphNode::Start) => "Start".to_string(),
        Some(wasm4pm_types::ChoiceGraphNode::End) => "End".to_string(),
        Some(wasm4pm_types::ChoiceGraphNode::Activity(l)) => l.clone(),
        Some(wasm4pm_types::ChoiceGraphNode::SubModel(idx)) => {
            arena.node_label_or_id(*idx)
        }
        None => format!("n{}", i),
    }
}

// ─── tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_is_strict_partial_order() {
        let r = BinaryRelation::new(0);
        assert!(r.is_strict_partial_order());
    }

    #[test]
    fn single_node_no_edges() {
        let r = BinaryRelation::new(1);
        assert!(r.is_irreflexive());
        assert!(r.is_transitive());
        assert_eq!(r.get_start_nodes(), vec![0]);
        assert_eq!(r.get_end_nodes(), vec![0]);
    }

    #[test]
    fn add_remove_edge() {
        let mut r = BinaryRelation::new(3);
        r.add_edge(0, 1);
        assert!(r.is_edge(0, 1));
        assert!(!r.is_edge(1, 0));
        r.remove_edge(0, 1);
        assert!(!r.is_edge(0, 1));
    }

    #[test]
    fn is_irreflexive_detects_self_loop() {
        let mut r = BinaryRelation::new(3);
        r.add_edge(1, 1);
        assert!(!r.is_irreflexive());
    }

    #[test]
    fn transitivity_check() {
        let mut r = BinaryRelation::new(3);
        r.add_edge(0, 1);
        r.add_edge(1, 2);
        assert!(!r.is_transitive());
        r.add_edge(0, 2);
        assert!(r.is_transitive());
    }

    #[test]
    fn transitive_closure() {
        let mut r = BinaryRelation::new(3);
        r.add_edge(0, 1);
        r.add_edge(1, 2);
        r.add_transitive_edges();
        assert!(r.is_edge(0, 2));
        assert!(r.is_transitive());
    }

    #[test]
    fn transitive_reduction() {
        let mut r = BinaryRelation::new(3);
        r.add_edge(0, 1);
        r.add_edge(1, 2);
        r.add_edge(0, 2); // redundant
        let red = r.get_transitive_reduction();
        assert!(red.is_edge(0, 1));
        assert!(red.is_edge(1, 2));
        assert!(!red.is_edge(0, 2));
    }

    #[test]
    fn start_end_nodes() {
        let mut r = BinaryRelation::new(3);
        r.add_edge(0, 1);
        r.add_edge(1, 2);
        assert_eq!(r.get_start_nodes(), vec![0]);
        assert_eq!(r.get_end_nodes(), vec![2]);
    }

    #[test]
    fn add_node_preserves_edges() {
        let mut r = BinaryRelation::new(2);
        r.add_edge(0, 1);
        let new_id = r.add_node();
        assert_eq!(new_id, 2);
        assert!(r.is_edge(0, 1));
        assert!(!r.is_edge(0, 2));
    }

    #[test]
    fn large_matrix_bit_packing() {
        let mut r = BinaryRelation::new(65);
        r.add_edge(0, 64);
        r.add_edge(64, 32);
        r.add_transitive_edges();
        assert!(r.is_edge(0, 32));
    }

    #[test]
    fn build_simple_sequence() {
        let mut arena = PowlArena::new();
        let a = arena.add_transition(Some("A".into()));
        let b = arena.add_transition(Some("B".into()));
        let seq = arena.add_sequence(vec![a, b]);
        assert_eq!(arena.to_repr(seq), "PO=(nodes={A, B}, order={A-->B})");
    }

    #[test]
    fn build_xor() {
        let mut arena = PowlArena::new();
        let a = arena.add_transition(Some("A".into()));
        let tau = arena.add_silent_transition();
        let xor = arena.add_operator(Operator::Xor, vec![a, tau]);
        assert_eq!(arena.to_repr(xor), "X ( A, tau )");
    }

    #[test]
    fn validate_valid_po() {
        let mut arena = PowlArena::new();
        let a = arena.add_transition(Some("A".into()));
        let b = arena.add_transition(Some("B".into()));
        let c = arena.add_transition(Some("C".into()));
        let po = arena.add_strict_partial_order(vec![a, b, c]);
        arena.add_order_edge(po, 0, 1).ok();
        arena.add_order_edge(po, 1, 2).ok();
        arena.add_order_edge(po, 0, 2).ok();
        assert!(arena.validate_partial_orders(po).is_ok());
    }

    #[test]
    fn validate_missing_transitive_edge_passes_via_closure() {
        // A→B, B→C without explicit A→C is valid — closure adds A→C
        let mut arena = PowlArena::new();
        let a = arena.add_transition(Some("A".into()));
        let b = arena.add_transition(Some("B".into()));
        let c = arena.add_transition(Some("C".into()));
        let po = arena.add_strict_partial_order(vec![a, b, c]);
        arena.add_order_edge(po, 0, 1).ok();
        arena.add_order_edge(po, 1, 2).ok();
        assert!(arena.validate_partial_orders(po).is_ok());
    }

    #[test]
    fn copy_subtree_is_independent() {
        let mut arena = PowlArena::new();
        let a = arena.add_transition(Some("A".into()));
        let b = arena.add_transition(Some("B".into()));
        let seq = arena.add_sequence(vec![a, b]);
        let (new_arena, new_root) = arena.copy_subtree(seq).expect("copy_subtree failed");
        assert_eq!(new_arena.to_repr(new_root), arena.to_repr(seq));
    }

    #[test]
    fn preset_postset_basic() {
        let mut r = BinaryRelation::new(3);
        r.add_edge(0, 1);
        r.add_edge(0, 2);
        r.add_edge(1, 2);
        assert_eq!(r.get_preset(0), vec![] as Vec<usize>);
        assert_eq!(r.get_postset(0), vec![1, 2]);
        assert_eq!(r.get_preset(1), vec![0]);
        assert_eq!(r.get_postset(1), vec![2]);
        assert_eq!(r.get_preset(2), vec![0, 1]);
        assert_eq!(r.get_postset(2), vec![] as Vec<usize>);
    }

    #[test]
    fn preset_postset_empty_relation() {
        let r = BinaryRelation::new(2);
        assert_eq!(r.get_preset(0), vec![] as Vec<usize>);
        assert_eq!(r.get_postset(0), vec![] as Vec<usize>);
        assert_eq!(r.get_preset(1), vec![] as Vec<usize>);
        assert_eq!(r.get_postset(1), vec![] as Vec<usize>);
    }

    #[test]
    fn preset_postset_out_of_bounds() {
        let r = BinaryRelation::new(2);
        assert_eq!(r.get_preset(5), vec![] as Vec<usize>);
        assert_eq!(r.get_postset(5), vec![] as Vec<usize>);
    }

    #[test]
    fn decision_graph_creation_and_repr() {
        let mut arena = PowlArena::new();
        let a = arena.add_transition(Some("A".into()));
        let b = arena.add_transition(Some("B".into()));
        // Order: 2 real children + 2 sentinel (start, end)
        let mut order = BinaryRelation::new(4);
        // start(2) → A(0), start(2) → B(1), B(1) → end(3)
        order.add_edge(2, 0);
        order.add_edge(2, 1);
        order.add_edge(1, 3);
        let dg = arena.add_decision_graph(
            vec![a, b],
            order,
            vec![0], // A is start node
            vec![1], // B is end node
            false,
        );
        let repr = arena.to_repr(dg);
        assert!(repr.starts_with("DG="));
        assert!(repr.contains("A"));
        assert!(repr.contains("B"));
        assert!(repr.contains("starts=[A]"));
        assert!(repr.contains("ends=[B]"));
        assert!(repr.contains("empty=false"));
    }

    #[test]
    fn decision_graph_empty_path() {
        let mut arena = PowlArena::new();
        let a = arena.add_transition(Some("A".into()));
        let mut order = BinaryRelation::new(3); // 1 child + start + end
        order.add_edge(1, 0); // start → A
        order.add_edge(0, 2); // A → end
        order.add_edge(1, 2); // start → end (empty path)
        let dg = arena.add_decision_graph(vec![a], order, vec![0], vec![0], true);
        let repr = arena.to_repr(dg);
        assert!(repr.contains("empty=true"));
    }

    #[test]
    fn decision_graph_copy_subtree() {
        let mut arena = PowlArena::new();
        let a = arena.add_transition(Some("A".into()));
        let b = arena.add_transition(Some("B".into()));
        let mut order = BinaryRelation::new(4);
        order.add_edge(2, 0);
        order.add_edge(2, 1);
        order.add_edge(1, 3);
        let dg = arena.add_decision_graph(vec![a, b], order, vec![0], vec![1], false);
        let (new_arena, new_root) = arena.copy_subtree(dg).expect("copy_subtree failed");
        assert_eq!(new_arena.to_repr(new_root), arena.to_repr(dg));
    }

    #[test]
    fn decision_graph_validate() {
        let mut arena = PowlArena::new();
        let a = arena.add_transition(Some("A".into()));
        let b = arena.add_transition(Some("B".into()));
        let mut order = BinaryRelation::new(4);
        order.add_edge(2, 0);
        order.add_edge(2, 1);
        order.add_edge(1, 3);
        let dg = arena.add_decision_graph(vec![a, b], order, vec![0], vec![1], false);
        assert!(arena.validate_partial_orders(dg).is_ok());
    }
}
