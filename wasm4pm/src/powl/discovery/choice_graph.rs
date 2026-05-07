//! MineDG algorithm for choice graph discovery.
//!
//! Discovers a choice graph structure when no other cut applies.
//! A choice graph is appropriate when there are non-trivial cyclic dependencies
//! among activities, suggesting flexible choice points rather than simple ordering.

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

    fn get_partitions(&mut self) -> Vec<HashSet<String>> {
        let mut partitions: HashMap<String, HashSet<String>> = HashMap::new();
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
    partitions: &[HashSet<String>],
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
pub fn discover_choice_graph(
    dfg: &HashSet<(String, String)>,
    activities: &HashSet<String>,
    _start_activities: &HashSet<String>,
    _end_activities: &HashSet<String>,
    _has_empty_trace: bool,
) -> Option<(Vec<HashSet<String>>, HashSet<(usize, usize)>)> {
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
