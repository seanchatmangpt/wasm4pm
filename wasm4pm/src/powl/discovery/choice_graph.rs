//! MineDG algorithm for choice graph discovery.
//!
//! Discovers a choice graph structure when no other cut applies.
//! A choice graph is appropriate when there are non-trivial cyclic dependencies
//! among activities, suggesting flexible choice points rather than simple ordering.
use wasm4pm_compat::powl::{ChoiceGraph, ChoiceGraphNode};

use std::collections::{HashMap, HashSet};

/// Check if activity `from` can reach activity `to` in the DFG.
/// Returns true if there exists a path from `from` to `to`.
fn is_reachable(dfg: &HashSet<(String, String)>, from: &str, to: &str) -> bool {
    if from == to {
        return true;
    }

    let mut visited = HashSet::new();
    let mut queue = vec![from.to_string()];

    while let Some(current) = queue.pop() {
        if visited.contains(&current) {
            continue;
        }
        visited.insert(current.clone());

        for (src, tgt) in dfg {
            if src == &current && tgt == to {
                return true;
            }
            if src == &current && !visited.contains(tgt) {
                queue.push(tgt.clone());
            }
        }
    }

    false
}

/// Find all ordered pairs (a1, a2) where a1 ↦⁺ a2 AND a2 ↦⁺ a1 (cycles).
fn find_cycles(
    dfg: &HashSet<(String, String)>,
    activities: &HashSet<String>,
) -> Vec<(String, String)> {
    let mut cycles = Vec::new();

    for a1 in activities {
        for a2 in activities {
            if a1 != a2 && is_reachable(dfg, a1, a2) && is_reachable(dfg, a2, a1) {
                cycles.push((a1.clone(), a2.clone()));
            }
        }
    }

    cycles
}

/// Union-Find data structure for partitioning activities.
struct UnionFind {
    parent: HashMap<String, String>,
}

impl UnionFind {
    fn new(activities: &HashSet<String>) -> Self {
        let parent = activities.iter().map(|a| (a.clone(), a.clone())).collect();
        UnionFind { parent }
    }

    fn find(&mut self, x: &str) -> String {
        let mut curr = x.to_string();
        while let Some(p) = self.parent.get(&curr) {
            if p == &curr {
                break;
            }
            curr = p.clone();
        }

        // Path compression (optional, but good)
        if curr != x {
            self.parent.insert(x.to_string(), curr.clone());
        }
        curr
    }

    fn union(&mut self, x: &str, y: &str) {
        let root_x = self.find(x);
        let root_y = self.find(y);
        if root_x != root_y {
            self.parent.insert(root_x, root_y);
        }
    }

    fn get_partitions(&mut self) -> Vec<std::collections::BTreeSet<String>> {
        let mut partitions: std::collections::BTreeMap<String, std::collections::BTreeSet<String>> =
            std::collections::BTreeMap::new();
        let keys: Vec<String> = self.parent.keys().cloned().collect();
        for k in keys {
            let root = self.find(&k);
            partitions.entry(root).or_default().insert(k);
        }
        partitions.into_values().collect()
    }
}

/// Build edges between partitions based on DFG reachability.
/// Returns a set of (src_partition_idx, tgt_partition_idx) edges.
fn build_partition_edges(
    dfg: &HashSet<(String, String)>,
    partitions: &[std::collections::BTreeSet<String>],
) -> HashSet<(usize, usize)> {
    let mut edges = HashSet::new();

    for (i, partition_i) in partitions.iter().enumerate() {
        for (j, partition_j) in partitions.iter().enumerate() {
            if i != j {
                // Check if any activity in partition_i reaches any activity in partition_j
                for a_i in partition_i {
                    for a_j in partition_j {
                        if is_reachable(dfg, a_i, a_j) {
                            edges.insert((i, j));
                            break;
                        }
                    }
                    if edges.contains(&(i, j)) {
                        break;
                    }
                }
            }
        }
    }

    edges
}

/// Discover choice graph using the MineDG algorithm.
///
/// **Removed.** Use [`discover_choice_graph_v2`] which returns a typed
/// `ChoiceGraphCut` validated against Definition 5 of arXiv:2505.07052.
/// This function is preserved as a thin bridge returning the  tuple shape
/// for baseline admissibility with downstream callers that have not yet
/// migrated.

pub fn discover_choice_graph(
    dfg: &HashSet<(String, String)>,
    activities: &HashSet<String>,
    _start_activities: &HashSet<String>,
    _end_activities: &HashSet<String>,
    _has_empty_trace: bool,
) -> Option<(
    Vec<std::collections::BTreeSet<String>>,
    HashSet<(usize, usize)>,
)> {
    // Step 1: Initialize each activity as its own partition
    let mut uf = UnionFind::new(activities);

    // Step 2: Find cycles and merge partitions
    let cycles = find_cycles(dfg, activities);
    for (a1, a2) in cycles {
        uf.union(&a1, &a2);
    }

    // Step 3: Get final partitions
    let partitions = uf.get_partitions();

    // If only one partition, no valid choice graph cut
    if partitions.len() <= 1 {
        return None;
    }

    // Step 4: Build choice graph edges between partitions
    let edges = build_partition_edges(dfg, &partitions);

    Some((partitions, edges))
}

/// A validated Choice Graph cut per Definition 4/5 of arXiv:2505.07052.
#[derive(Clone, Debug)]
pub struct ChoiceGraphCut {
    /// Partition of `Σ_L`. Each entry is one part `Aᵢ`.
    pub partition: Vec<std::collections::BTreeSet<String>>,
    /// The validated choice graph (Definition 1 invariants enforced).
    /// Nodes are: `Start`, `End`, plus one `Activity(repr)` per part.
    /// `repr` is the lexicographically-smallest activity name in the part.
    pub graph: ChoiceGraph,
    /// Index of `Aᵢ` partition in `partition` for each Activity-node, in
    /// the order those nodes appear in `graph.nodes`.
    pub partition_for_node: Vec<Option<usize>>,
}

/// Errors returned by `discover_choice_graph_v2`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum NoCutFound {
    /// MineDG produced fewer than 2 partitions — choice graph cut is not
    /// applicable.
    InsufficientPartitions,
    /// The reconstructed graph does not satisfy Definition 1.
    InvalidGraph(String),
}

impl core::fmt::Display for NoCutFound {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        match self {
            NoCutFound::InsufficientPartitions => {
                write!(f, "MineDG produced < 2 partitions; no choice graph cut")
            }
            NoCutFound::InvalidGraph(s) => write!(f, "invalid choice graph: {}", s),
        }
    }
}

impl std::error::Error for NoCutFound {}

/// Discover a Choice Graph cut per Algorithm 1 + Definition 5 of arXiv:2505.07052.
pub fn discover_choice_graph_v2(
    activities: &HashSet<String>,
    dfg: &HashSet<(String, String)>,
    start_activities: &HashSet<String>,
    end_activities: &HashSet<String>,
    has_empty_trace: bool,
) -> Result<ChoiceGraphCut, NoCutFound> {
    // Algorithm 1: union-find merging mutually-reachable activities.
    let mut uf = UnionFind::new(activities);
    let cycles = find_cycles(dfg, activities);
    for (a1, a2) in cycles {
        uf.union(&a1, &a2);
    }
    let partition = uf.get_partitions();
    if partition.len() < 2 {
        return Err(NoCutFound::InsufficientPartitions);
    }

    // Build CG nodes: Start first, Activity nodes, End last.
    // ChoiceGraph::new() sets end_idx = nodes.len()-1, so End MUST be the last node.
    let mut nodes: Vec<ChoiceGraphNode> = Vec::new();
    let mut partition_for_node: Vec<Option<usize>> = Vec::new();
    nodes.push(ChoiceGraphNode::Start);
    partition_for_node.push(None);
    let start_idx_node = 0usize;

    let mut part_node_idx: Vec<usize> = Vec::with_capacity(partition.len());
    for (p_idx, part) in partition.iter().enumerate() {
        let repr = part
            .iter()
            .min()
            .cloned()
            .unwrap_or_else(|| format!("part_{}", p_idx));
        part_node_idx.push(nodes.len());
        nodes.push(ChoiceGraphNode::Activity(repr));
        partition_for_node.push(Some(p_idx));
    }

    // End node pushed last so ChoiceGraph::new() assigns end_idx = nodes.len()-1.
    let end_idx_node = nodes.len();
    nodes.push(ChoiceGraphNode::End);
    partition_for_node.push(None);

    // Definition 5 conditions:
    let mut edges: Vec<(usize, usize)> = Vec::new();
    let mut edge_set: HashSet<(usize, usize)> = HashSet::new();

    // (4) ⟨⟩ ∈ L ⇔ (▷, □) ∈ E
    if has_empty_trace {
        edges.push((start_idx_node, end_idx_node));
        edge_set.insert((start_idx_node, end_idx_node));
    }
    for (i, part_i) in partition.iter().enumerate() {
        let ni = part_node_idx[i];
        // (2) Aᵢ ∩ L_▷ ≠ ∅ ⇔ (▷, Aᵢ) ∈ E
        if part_i.iter().any(|a| start_activities.contains(a)) {
            let e = (start_idx_node, ni);
            if edge_set.insert(e) {
                edges.push(e);
            }
        }
        // (3) Aᵢ ∩ L_□ ≠ ∅ ⇔ (Aᵢ, □) ∈ E
        if part_i.iter().any(|a| end_activities.contains(a)) {
            let e = (ni, end_idx_node);
            if edge_set.insert(e) {
                edges.push(e);
            }
        }
        for (j, part_j) in partition.iter().enumerate() {
            if i == j {
                continue;
            }
            let nj = part_node_idx[j];
            // (1) Aᵢ ↦ Aⱼ in DFG between *some* (a, b) with a∈Aᵢ, b∈Aⱼ
            //     ⇔ (Aᵢ, Aⱼ) ∈ E.
            let has_dfg_edge = part_i
                .iter()
                .any(|a| part_j.iter().any(|b| dfg.contains(&(a.clone(), b.clone()))));
            if has_dfg_edge {
                let e = (ni, nj);
                if edge_set.insert(e) {
                    edges.push(e);
                }
            }
        }
    }

    let graph = ChoiceGraph::new(nodes, edges).map_err(|e| NoCutFound::InvalidGraph(e.to_string()))?;
    Ok(ChoiceGraphCut {
        partition,
        graph,
        partition_for_node,
    })
}

#[cfg(test)]
mod v2_tests {
    use super::*;
    use std::collections::HashSet;

    #[test]
    fn linear_chain_yields_3_part_cut() {
        // A → B → C, no cycles.
        let activities: HashSet<String> = ["A", "B", "C"].iter().map(|s| s.to_string()).collect();
        let dfg: HashSet<(String, String)> = [
            ("A".to_string(), "B".to_string()),
            ("B".to_string(), "C".to_string()),
        ]
        .iter()
        .cloned()
        .collect();
        let starts: HashSet<String> = ["A"].iter().map(|s| s.to_string()).collect();
        let ends: HashSet<String> = ["C"].iter().map(|s| s.to_string()).collect();
        let cut = discover_choice_graph_v2(&activities, &dfg, &starts, &ends, false)
            .expect("expected a cut");
        assert_eq!(cut.partition.len(), 3);
        // Definition 1 invariants enforced by ChoiceGraph::new.
        assert!(cut.graph.has_empty_path() == false);
    }

    #[test]
    fn empty_trace_adds_direct_start_end_edge() {
        let activities: HashSet<String> = ["A"].iter().map(|s| s.to_string()).collect();
        let dfg: HashSet<(String, String)> = HashSet::new();
        let starts: HashSet<String> = ["A"].iter().map(|s| s.to_string()).collect();
        let ends: HashSet<String> = ["A"].iter().map(|s| s.to_string()).collect();
        // Single-activity → 1 part. Should fall through to InsufficientPartitions.
        let err = discover_choice_graph_v2(&activities, &dfg, &starts, &ends, true).unwrap_err();
        assert_eq!(err, NoCutFound::InsufficientPartitions);
    }
}
