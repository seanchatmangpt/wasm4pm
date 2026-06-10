//! Deterministic BTreeMap digraph combinator.

use std::collections::{BTreeMap, BTreeSet};

/// A deterministic directed graph using BTreeMap.
#[derive(Debug, Clone)]
pub struct Digraph {
    /// Adjacency list: node -> set of successors
    pub edges: BTreeMap<String, BTreeSet<String>>,
}

impl Default for Digraph {
    fn default() -> Self {
        Self::new()
    }
}

impl Digraph {
    /// Creates a new empty digraph.
    pub fn new() -> Self {
        Self {
            edges: BTreeMap::new(),
        }
    }

    /// Adds a directed edge from `u` to `v`.
    pub fn add_edge(&mut self, u: &str, v: &str) {
        self.edges.entry(u.to_string()).or_default().insert(v.to_string());
        // Ensure v exists in the graph even if it has no outgoing edges
        self.edges.entry(v.to_string()).or_default();
    }

    /// Performs a deterministic topological sort.
    /// Returns `Err` if a cycle is detected.
    pub fn topo_sort(&self) -> Result<Vec<String>, String> {
        let mut in_degree: BTreeMap<String, usize> = BTreeMap::new();
        for node in self.edges.keys() {
            in_degree.insert(node.clone(), 0);
        }
        for neighbors in self.edges.values() {
            for v in neighbors {
                *in_degree.entry(v.clone()).or_insert(0) += 1;
            }
        }

        // BTreeSet for deterministic (lexicographic) tie-breaking
        let mut queue: BTreeSet<String> = BTreeSet::new();
        for (node, &deg) in &in_degree {
            if deg == 0 {
                queue.insert(node.clone());
            }
        }

        let mut sorted = Vec::new();
        while let Some(u) = queue.pop_first() {
            sorted.push(u.clone());
            if let Some(neighbors) = self.edges.get(&u) {
                for v in neighbors {
                    if let Some(deg) = in_degree.get_mut(v) {
                        *deg -= 1;
                        if *deg == 0 {
                            queue.insert(v.clone());
                        }
                    }
                }
            }
        }

        if sorted.len() != self.edges.len() {
            return Err("Cycle detected in digraph".to_string());
        }

        Ok(sorted)
    }

    /// Computes the reachability from a set of starting nodes.
    /// Returns the set of all nodes reachable, including the start nodes.
    pub fn reachability(&self, starts: &[String]) -> BTreeSet<String> {
        let mut visited = BTreeSet::new();
        let mut queue = BTreeSet::new();
        
        for s in starts {
            if self.edges.contains_key(s) {
                queue.insert(s.clone());
                visited.insert(s.clone());
            }
        }

        while let Some(u) = queue.pop_first() {
            if let Some(neighbors) = self.edges.get(&u) {
                for v in neighbors {
                    if !visited.contains(v) {
                        visited.insert(v.clone());
                        queue.insert(v.clone());
                    }
                }
            }
        }

        visited
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_topo_sort_deterministic() {
        let mut g = Digraph::new();
        g.add_edge("A", "B");
        g.add_edge("A", "C");
        let sorted = g.topo_sort().unwrap();
        assert_eq!(sorted, vec!["A", "B", "C"]);
    }

    #[test]
    fn test_topo_sort_cycle() {
        let mut g = Digraph::new();
        g.add_edge("A", "B");
        g.add_edge("B", "C");
        g.add_edge("C", "A");
        assert!(g.topo_sort().is_err());
    }

    #[test]
    fn test_reachability() {
        let mut g = Digraph::new();
        g.add_edge("A", "B");
        g.add_edge("B", "C");
        g.add_edge("D", "E");
        let reachable = g.reachability(&["A".to_string()]);
        assert!(reachable.contains("A"));
        assert!(reachable.contains("B"));
        assert!(reachable.contains("C"));
        assert!(!reachable.contains("D"));
        assert!(!reachable.contains("E"));
    }
}
