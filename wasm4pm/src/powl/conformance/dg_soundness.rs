//! DecisionGraph structural soundness validation.
//!
//! Validates DecisionGraph models directly (no Petri net conversion needed):
//!   - Connectivity: all nodes reachable from start, can reach end
//!   - Acyclicity: no cycles in the order relation
//!   - Combined soundness report
//!
//! Ported from pm4py DecisionGraph.validate_connectivity(),
//! validate_acyclicity(), and get_soundness_report().

use crate::powl_arena::{PowlArena, PowlNode};
use serde::{Deserialize, Serialize};

/// Result of connectivity validation.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ConnectivityResult {
    pub connected: bool,
    /// Local indices of children unreachable from any start node.
    pub unreachable_nodes: Vec<usize>,
    /// Local indices of children that cannot reach any end node.
    pub nodes_cant_reach_end: Vec<usize>,
}

/// Result of acyclicity validation.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AcyclicityResult {
    pub acyclic: bool,
    /// Local indices of nodes involved in a cycle (empty if acyclic).
    pub cycle_nodes: Vec<usize>,
}

/// Combined soundness report for a DecisionGraph.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct DgSoundnessReport {
    pub sound: bool,
    pub connectivity: ConnectivityResult,
    pub acyclicity: AcyclicityResult,
    /// Whether start_nodes is non-empty.
    pub has_start_nodes: bool,
    /// Whether end_nodes is non-empty.
    pub has_end_nodes: bool,
}

/// DFS reachability check: can `src` reach `tgt` through the order relation?
fn can_reach(order: &crate::powl_arena::BinaryRelation, src: usize, tgt: usize) -> bool {
    if src == tgt {
        return true;
    }
    let mut visited = vec![false; order.n];
    let mut stack = Vec::new();
    stack.push(src);
    visited[src] = true;

    while let Some(current) = stack.pop() {
        for neighbor in order.get_postset(current) {
            if neighbor == tgt {
                return true;
            }
            if !visited[neighbor] {
                visited[neighbor] = true;
                stack.push(neighbor);
            }
        }
    }

    false
}

/// Validate connectivity of a DecisionGraph.
///
/// Checks that every child node is:
/// 1. Reachable from at least one start node
/// 2. Able to reach at least one end node
pub fn validate_connectivity(arena: &PowlArena, root: u32) -> ConnectivityResult {
    let dg = match arena.get(root) {
        Some(PowlNode::DecisionGraph(dg)) => dg,
        _ => {
            return ConnectivityResult {
                connected: false,
                unreachable_nodes: vec![],
                nodes_cant_reach_end: vec![],
            }
        }
    };

    let n = dg.children.len();
    let mut unreachable_nodes = Vec::new();
    let mut nodes_cant_reach_end = Vec::new();

    for child_local in 0..n {
        // Check reachable from any start node
        let reachable_from_start = dg
            .start_nodes
            .iter()
            .any(|&start| can_reach(&dg.order, start, child_local));

        if !reachable_from_start {
            unreachable_nodes.push(child_local);
        }

        // Check can reach any end node
        let can_reach_end = dg
            .end_nodes
            .iter()
            .any(|&end| can_reach(&dg.order, child_local, end));

        if !can_reach_end {
            nodes_cant_reach_end.push(child_local);
        }
    }

    let connected = unreachable_nodes.is_empty() && nodes_cant_reach_end.is_empty();

    ConnectivityResult {
        connected,
        unreachable_nodes,
        nodes_cant_reach_end,
    }
}

/// Validate acyclicity of a DecisionGraph.
///
/// Uses DFS with a gray/black coloring scheme:
/// - White (unvisited): not yet encountered
/// - Gray (in recursion stack): currently being explored
/// - Black (finished): fully explored
///
/// If a gray node is revisited, a cycle exists.
pub fn validate_acyclicity(arena: &PowlArena, root: u32) -> AcyclicityResult {
    let dg = match arena.get(root) {
        Some(PowlNode::DecisionGraph(dg)) => dg,
        _ => {
            return AcyclicityResult {
                acyclic: false,
                cycle_nodes: vec![],
            }
        }
    };

    let n = dg.children.len();
    // 0 = white (unvisited), 1 = gray (in stack), 2 = black (done)
    let mut color: Vec<u8> = vec![0; n];
    let mut cycle_nodes = Vec::new();

    // Iterative DFS with explicit stack tracking gray nodes
    for start in 0..n {
        if color[start] != 0 {
            continue;
        }

        // Each stack entry: (node, neighbor_iterator_start_index, is_first_visit)
        let mut dfs_stack: Vec<(usize, usize, bool)> = vec![(start, 0, true)];

        while let Some((node, neighbor_idx, first_visit)) = dfs_stack.pop() {
            if first_visit {
                // First time visiting this node
                if color[node] == 2 {
                    // Already finished via another path
                    continue;
                }
                if color[node] == 1 {
                    // Gray -- cycle detected
                    cycle_nodes.push(node);
                    continue;
                }
                color[node] = 1; // Mark gray
            }

            // Find next unvisited neighbor
            let neighbors = dg.order.get_postset(node);
            let mut found_next = false;

            for &neighbor in &neighbors[neighbor_idx..] {
                let abs_idx = neighbor_idx
                    + neighbors[neighbor_idx..]
                        .iter()
                        .position(|&x| x == neighbor)
                        .unwrap();
                if color[neighbor] == 1 {
                    // Back edge to gray node -- cycle
                    cycle_nodes.push(neighbor);
                    cycle_nodes.push(node);
                    continue;
                }
                if color[neighbor] == 0 {
                    // Push current node back with updated neighbor index
                    dfs_stack.push((node, abs_idx + 1, false));
                    // Push neighbor as new exploration
                    dfs_stack.push((neighbor, 0, true));
                    found_next = true;
                    break;
                }
            }

            if !found_next {
                // All neighbors explored -- mark black
                color[node] = 2;
            }
        }
    }

    // Deduplicate cycle nodes
    cycle_nodes.sort_unstable();
    cycle_nodes.dedup();

    AcyclicityResult {
        acyclic: cycle_nodes.is_empty(),
        cycle_nodes,
    }
}

/// Produce a combined soundness report for a DecisionGraph.
///
/// Checks:
/// 1. start_nodes and end_nodes are non-empty
/// 2. Connectivity (all nodes reachable from start, can reach end)
/// 3. Acyclicity (no cycles)
pub fn get_soundness_report(arena: &PowlArena, root: u32) -> DgSoundnessReport {
    let dg = match arena.get(root) {
        Some(PowlNode::DecisionGraph(dg)) => dg,
        _ => {
            return DgSoundnessReport {
                sound: false,
                connectivity: ConnectivityResult {
                    connected: false,
                    unreachable_nodes: vec![],
                    nodes_cant_reach_end: vec![],
                },
                acyclicity: AcyclicityResult {
                    acyclic: false,
                    cycle_nodes: vec![],
                },
                has_start_nodes: false,
                has_end_nodes: false,
            }
        }
    };

    let has_start_nodes = !dg.start_nodes.is_empty();
    let has_end_nodes = !dg.end_nodes.is_empty();
    let connectivity = validate_connectivity(arena, root);
    let acyclicity = validate_acyclicity(arena, root);

    let sound = has_start_nodes && has_end_nodes && connectivity.connected && acyclicity.acyclic;

    DgSoundnessReport {
        sound,
        connectivity,
        acyclicity,
        has_start_nodes,
        has_end_nodes,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::powl_arena::{BinaryRelation, PowlArena};

    /// Helper: build a simple connected DG with given children, order, starts, ends.
    fn build_dg(
        children_labels: &[&str],
        edges: &[(usize, usize)],
        start_nodes: &[usize],
        end_nodes: &[usize],
        empty_path: bool,
    ) -> (PowlArena, u32) {
        let mut arena = PowlArena::new();
        let child_indices: Vec<u32> = children_labels
            .iter()
            .map(|&label| arena.add_transition(Some(label.to_string())))
            .collect();

        let n = child_indices.len();
        let mut order = BinaryRelation::new(n);
        for &(src, tgt) in edges {
            order.add_edge(src, tgt);
        }

        let dg = arena.add_decision_graph(
            child_indices,
            order,
            start_nodes.to_vec(),
            end_nodes.to_vec(),
            empty_path,
        );
        (arena, dg)
    }

    #[test]
    fn test_connectivity_validation() {
        // Happy path: fully connected diamond graph
        let (arena, dg) = build_dg(
            &["A", "B", "C", "D"],
            &[(0, 1), (0, 2), (1, 3), (2, 3)],
            &[0],
            &[3],
            false,
        );
        let result = validate_connectivity(&arena, dg);
        assert!(result.connected);

        // Edge case: isolated node is unreachable
        let (arena, dg) = build_dg(&["A", "B", "C"], &[(0, 1)], &[0], &[1], false);
        let result = validate_connectivity(&arena, dg);
        assert!(!result.connected);
        assert!(result.unreachable_nodes.contains(&2));
    }

    #[test]
    fn test_acyclicity_validation() {
        // Happy path: sequential chain is acyclic
        let (arena, dg) = build_dg(&["A", "B", "C"], &[(0, 1), (1, 2)], &[0], &[2], false);
        let result = validate_acyclicity(&arena, dg);
        assert!(result.acyclic);

        // Edge case: self-loop and cycle detection
        let (arena, dg) = build_dg(&["A", "B"], &[(0, 0)], &[0], &[1], false);
        let result = validate_acyclicity(&arena, dg);
        assert!(!result.acyclic);

        let (arena, dg) = build_dg(
            &["A", "B", "C"],
            &[(0, 1), (1, 2), (2, 0)],
            &[0],
            &[2],
            false,
        );
        let result = validate_acyclicity(&arena, dg);
        assert!(!result.acyclic);
    }

    #[test]
    fn test_soundness_report() {
        // Happy path: sound diamond graph
        let (arena, dg) = build_dg(
            &["A", "B", "C", "D"],
            &[(0, 1), (0, 2), (1, 3), (2, 3)],
            &[0],
            &[3],
            false,
        );
        let report = get_soundness_report(&arena, dg);
        assert!(report.sound);
        assert!(report.has_start_nodes && report.has_end_nodes);

        // Edge cases: unsound due to cycle, unreachable, empty starts/ends
        let (arena, dg) = build_dg(
            &["A", "B", "C"],
            &[(0, 1), (1, 2), (2, 0)],
            &[0],
            &[2],
            false,
        );
        let report = get_soundness_report(&arena, dg);
        assert!(!report.sound);

        let (arena, dg) = build_dg(&["A", "B", "C"], &[(0, 1)], &[], &[1], false);
        let report = get_soundness_report(&arena, dg);
        assert!(!report.sound);
    }
}
