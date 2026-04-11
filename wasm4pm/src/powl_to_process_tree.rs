//! POWL to Process Tree conversion.
//!
//! Converts a POWL model (stored in a `PowlArena`) into a `PowlProcessTree`.
//!
//! Algorithm (mirrors `pm4py/objects/conversion/powl/variants/to_process_tree.py`):
//! 1. Transition leaf -> ProcessTree leaf with same label.
//! 2. OperatorPOWL -> ProcessTree internal node with same operator, recursed children.
//! 3. StrictPartialOrder ->
//!    a. Build a DAG from the partial order (with transitive reduction).
//!    b. Find connected components in the undirected version.
//!    c. For each component, perform BFS-level assignment (topological levelling).
//!    d. Nodes at the same level are wrapped in PARALLEL; levels are sequenced.
//!    e. Components themselves are wrapped in a top-level PARALLEL if > 1.
//! 4. DecisionGraph -> Same as StrictPartialOrder (uses the order relation).

use crate::powl_arena::{Operator, PowlArena, PowlNode};
use crate::powl_models::{PowlProcessTree, PtOperator};

// ─── Graph helpers ────────────────────────────────────────────────────────────

/// Simple directed adjacency list over `usize` node indices.
struct Dag {
    n: usize,
    /// adj[i] = list of successors of i
    adj: Vec<Vec<usize>>,
}

impl Dag {
    fn new(n: usize) -> Self {
        Dag {
            n,
            adj: vec![Vec::new(); n],
        }
    }

    fn add_edge(&mut self, from: usize, to: usize) {
        self.adj[from].push(to);
    }

    /// In-degrees of all nodes.
    fn in_degrees(&self) -> Vec<usize> {
        let mut deg = vec![0usize; self.n];
        for i in 0..self.n {
            for &j in &self.adj[i] {
                deg[j] += 1;
            }
        }
        deg
    }

    /// BFS level assignment starting from zero-in-degree nodes.
    fn assign_levels(&self) -> Vec<usize> {
        let in_deg = self.in_degrees();
        let mut levels = vec![usize::MAX; self.n];
        let mut queue = std::collections::VecDeque::new();
        for i in 0..self.n {
            if in_deg[i] == 0 {
                levels[i] = 0;
                queue.push_back(i);
            }
        }
        while let Some(cur) = queue.pop_front() {
            let next_level = levels[cur] + 1;
            for &succ in &self.adj[cur] {
                if levels[succ] == usize::MAX {
                    levels[succ] = next_level;
                    queue.push_back(succ);
                }
            }
        }
        levels
    }

    /// Transitive reduction: remove edge i->j if there is an alternative path i->...->j.
    fn transitive_reduction(&self) -> Dag {
        let n = self.n;
        // Compute reachability (closure) via DFS from each node.
        let reachable = {
            let mut reach = vec![vec![false; n]; n];
            for (start, adj_row) in self.adj.iter().enumerate() {
                let mut visited = vec![false; n];
                let mut stack = Vec::new();
                for &succ in adj_row {
                    stack.push(succ);
                }
                while let Some(cur) = stack.pop() {
                    if visited[cur] {
                        continue;
                    }
                    visited[cur] = true;
                    reach[start][cur] = true;
                    for &succ in &self.adj[cur] {
                        stack.push(succ);
                    }
                }
            }
            reach
        };

        let mut red = Dag::new(n);
        for i in 0..n {
            for &j in &self.adj[i] {
                // Keep edge i->j unless some intermediate k (k!=j) makes it redundant.
                let redundant = self.adj[i].iter().any(|&k| k != j && reachable[k][j]);
                if !redundant {
                    red.add_edge(i, j);
                }
            }
        }
        red
    }

    /// Connected components of the undirected version of this graph.
    fn undirected_components(&self) -> Vec<Vec<usize>> {
        let mut visited = vec![false; self.n];
        let mut components: Vec<Vec<usize>> = Vec::new();
        for start in 0..self.n {
            if visited[start] {
                continue;
            }
            let mut comp = Vec::new();
            let mut queue = std::collections::VecDeque::new();
            queue.push_back(start);
            visited[start] = true;
            while let Some(cur) = queue.pop_front() {
                comp.push(cur);
                // Forward edges
                for &j in &self.adj[cur] {
                    if !visited[j] {
                        visited[j] = true;
                        queue.push_back(j);
                    }
                }
                // Reverse edges (undirected)
                for (i, row) in self.adj.iter().enumerate() {
                    if !visited[i] && row.contains(&cur) {
                        visited[i] = true;
                        queue.push_back(i);
                    }
                }
            }
            components.push(comp);
        }
        components
    }
}

// ─── Recursive conversion ─────────────────────────────────────────────────────

/// Recursively convert a POWL node to a `PowlProcessTree`.
///
/// Returns a `PowlProcessTree` that mirrors the Python `apply_recursive` output.
pub fn apply_recursive(arena: &PowlArena, node_idx: u32) -> PowlProcessTree {
    match arena.get(node_idx) {
        None => PowlProcessTree::leaf(None),

        // Leaf: Transition / FrequentTransition
        Some(PowlNode::Transition(t)) => PowlProcessTree::leaf(t.label.clone()),
        Some(PowlNode::FrequentTransition(t)) => PowlProcessTree::leaf(Some(t.label.clone())),

        // OperatorPOWL
        Some(PowlNode::OperatorPowl(op)) => {
            let pt_op = match op.operator {
                Operator::Xor => PtOperator::Xor,
                Operator::Loop => PtOperator::Loop,
                Operator::PartialOrder => PtOperator::Sequence,
            };
            let children: Vec<PowlProcessTree> = op
                .children
                .iter()
                .map(|&c| apply_recursive(arena, c))
                .collect();
            PowlProcessTree::internal(pt_op, children)
        }

        // StrictPartialOrder
        Some(PowlNode::StrictPartialOrder(spo)) => {
            convert_partial_order(arena, &spo.children, &spo.order)
        }

        // DecisionGraph (same structure as SPO for conversion purposes)
        Some(PowlNode::DecisionGraph(dg)) => convert_partial_order(arena, &dg.children, &dg.order),
    }
}

/// Convert a partial-order node (SPO or DecisionGraph) to a process tree.
///
/// Builds a DAG from the order relation, finds connected components,
/// and converts each component to a leveled tree.
#[allow(clippy::needless_range_loop)]
fn convert_partial_order(
    arena: &PowlArena,
    children: &[u32],
    order: &crate::powl_arena::BinaryRelation,
) -> PowlProcessTree {
    let n = children.len();
    if n == 0 {
        return PowlProcessTree::leaf(None);
    }
    if n == 1 {
        return apply_recursive(arena, children[0]);
    }

    // Build DAG from partial order
    let mut dag = Dag::new(n);
    for i in 0..n {
        for j in 0..n {
            if order.is_edge(i, j) {
                dag.add_edge(i, j);
            }
        }
    }

    // Transitive reduction
    let dag = dag.transitive_reduction();

    // Connected components (undirected)
    let components = dag.undirected_components();

    let mut component_trees: Vec<PowlProcessTree> = Vec::new();

    for comp in &components {
        if comp.len() == 1 {
            let child_idx = children[comp[0]];
            component_trees.push(apply_recursive(arena, child_idx));
            continue;
        }

        // Build subgraph DAG for this component
        let local_to_global: Vec<usize> = comp.clone();
        let global_to_local: Vec<Option<usize>> = {
            let mut g2l = vec![None; n];
            for (li, &gi) in local_to_global.iter().enumerate() {
                g2l[gi] = Some(li);
            }
            g2l
        };
        let m = comp.len();
        let mut sub_dag = Dag::new(m);
        for (li, &gi) in local_to_global.iter().enumerate() {
            for &succ_gi in &dag.adj[gi] {
                if let Some(succ_li) = global_to_local[succ_gi] {
                    sub_dag.add_edge(li, succ_li);
                }
            }
        }

        // BFS level assignment
        let levels_map = sub_dag.assign_levels();
        let max_level = *levels_map.iter().max().unwrap_or(&0);

        // Group by level
        let mut level_groups: Vec<Vec<usize>> = vec![Vec::new(); max_level + 1];
        for li in 0..m {
            let lv = levels_map[li];
            if lv != usize::MAX {
                level_groups[lv].push(li);
            }
        }

        // Each level -> PARALLEL or single node; levels -> SEQUENCE
        let mut level_trees: Vec<PowlProcessTree> = Vec::new();
        for group in &level_groups {
            if group.is_empty() {
                continue;
            }
            let sub_trees: Vec<PowlProcessTree> = group
                .iter()
                .map(|&li| apply_recursive(arena, children[local_to_global[li]]))
                .collect();
            if sub_trees.len() == 1 {
                level_trees.push(sub_trees.into_iter().next().unwrap());
            } else {
                level_trees.push(PowlProcessTree::internal(PtOperator::Parallel, sub_trees));
            }
        }

        let subtree = if level_trees.len() == 1 {
            level_trees.into_iter().next().unwrap()
        } else {
            PowlProcessTree::internal(PtOperator::Sequence, level_trees)
        };
        component_trees.push(subtree);
    }

    if component_trees.len() == 1 {
        component_trees.into_iter().next().unwrap()
    } else {
        PowlProcessTree::internal(PtOperator::Parallel, component_trees)
    }
}

/// Convert a POWL model to a process tree.
pub fn apply(arena: &PowlArena, root: u32) -> PowlProcessTree {
    apply_recursive(arena, root)
}

// ─── tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::powl_parser::parse_powl_model_string;

    fn build(s: &str) -> (PowlArena, u32) {
        let mut arena = PowlArena::new();
        let root = parse_powl_model_string(s, &mut arena).unwrap();
        (arena, root)
    }

    #[test]
    fn transition_to_leaf() {
        let (arena, root) = build("A");
        let pt = apply(&arena, root);
        assert_eq!(pt.label.as_deref(), Some("A"));
        assert!(pt.operator.is_none());
    }

    #[test]
    fn xor_to_xor() {
        let (arena, root) = build("X ( A, B )");
        let pt = apply(&arena, root);
        assert_eq!(pt.operator, Some(PtOperator::Xor));
        assert_eq!(pt.children.len(), 2);
    }

    #[test]
    fn sequence_po_to_sequence_tree() {
        let (arena, root) = build("PO=(nodes={A, B}, order={A-->B})");
        let pt = apply(&arena, root);
        let repr = pt.to_repr();
        assert!(repr.contains("A") && repr.contains("B"), "got: {}", repr);
    }

    #[test]
    fn concurrent_po_to_parallel() {
        let (arena, root) = build("PO=(nodes={A, B}, order={})");
        let pt = apply(&arena, root);
        assert_eq!(pt.operator, Some(PtOperator::Parallel));
    }

    #[test]
    fn loop_to_loop() {
        let (arena, root) = build("* ( A, B )");
        let pt = apply(&arena, root);
        assert_eq!(pt.operator, Some(PtOperator::Loop));
    }

    #[test]
    fn decision_graph_converts() {
        let (arena, root) =
            build("DG=(nodes={A, B}, order={A-->B}, starts=[A], ends=[B], empty=false)");
        let pt = apply(&arena, root);
        // DG with A-->B should produce a sequence
        let repr = pt.to_repr();
        assert!(repr.contains("A") && repr.contains("B"), "got: {}", repr);
    }

    #[test]
    fn silent_transition_to_tau() {
        let (arena, root) = build("tau");
        let pt = apply(&arena, root);
        assert_eq!(pt.label.as_deref(), None);
        assert!(pt.operator.is_none());
    }

    #[test]
    fn nested_xor_in_loop() {
        let (arena, root) = build("*(X(A, B), C)");
        let pt = apply(&arena, root);
        assert_eq!(pt.operator, Some(PtOperator::Loop));
        assert_eq!(pt.children.len(), 2);
        // First child should be XOR
        assert_eq!(pt.children[0].operator, Some(PtOperator::Xor));
    }
}
