//! Deterministic directed graph over `BTreeMap`, for Bayesian DAGs, DL
//! subsumption hierarchies, and SME structure mapping.
//!
//! Rank-1 properties proven below: Kahn topological order respects every
//! edge; cycle detection is exact; reachability is the transitive closure of
//! the edge relation; iteration order is lexicographic (bit-stable output).

use std::collections::{BTreeMap, BTreeSet, VecDeque};

/// A deterministic digraph with `String` node labels.
///
/// All node and edge iteration is in lexicographic order, so every derived
/// quantity (topo sort, reachable set) is bit-stable across runs.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct DiGraph {
    adj: BTreeMap<String, BTreeSet<String>>,
}

impl DiGraph {
    /// Create an empty graph.
    pub fn new() -> Self {
        Self::default()
    }

    /// Add a node (no-op if present).
    pub fn add_node(&mut self, n: &str) {
        self.adj.entry(n.to_string()).or_default();
    }

    /// Add a directed edge `from -> to`, inserting both endpoints.
    pub fn add_edge(&mut self, from: &str, to: &str) {
        self.adj
            .entry(from.to_string())
            .or_default()
            .insert(to.to_string());
        self.adj.entry(to.to_string()).or_default();
    }

    /// All nodes in lexicographic order.
    pub fn nodes(&self) -> Vec<&str> {
        self.adj.keys().map(String::as_str).collect()
    }

    /// Direct successors of `n` in lexicographic order (empty if unknown node).
    pub fn successors(&self, n: &str) -> Vec<&str> {
        self.adj
            .get(n)
            .map(|s| s.iter().map(|x| x.as_str()).collect())
            .unwrap_or_default()
    }

    /// Number of edges.
    pub fn edge_count(&self) -> usize {
        self.adj.values().map(|s| s.len()).sum()
    }

    /// Kahn topological sort with lexicographic tie-breaking.
    ///
    /// Returns `Err` naming one node on a cycle if the graph is cyclic.
    pub fn topo_sort(&self) -> Result<Vec<String>, String> {
        let mut indegree: BTreeMap<&str, usize> =
            self.adj.keys().map(|k| (k.as_str(), 0)).collect();
        for tos in self.adj.values() {
            for t in tos {
                *indegree.get_mut(t.as_str()).expect("endpoint inserted") += 1;
            }
        }
        // BTreeSet as a priority queue → lexicographically least ready node first.
        let mut ready: BTreeSet<&str> = indegree
            .iter()
            .filter(|(_, &d)| d == 0)
            .map(|(&n, _)| n)
            .collect();
        let mut order = Vec::with_capacity(self.adj.len());
        while let Some(&n) = ready.iter().next() {
            ready.remove(n);
            order.push(n.to_string());
            for t in &self.adj[n] {
                let d = indegree.get_mut(t.as_str()).expect("endpoint inserted");
                *d -= 1;
                if *d == 0 {
                    ready.insert(t.as_str());
                }
            }
        }
        if order.len() == self.adj.len() {
            Ok(order)
        } else {
            let on_cycle = indegree
                .iter()
                .find(|(_, &d)| d > 0)
                .map(|(&n, _)| n.to_string())
                .unwrap_or_default();
            Err(format!("graph contains a cycle through '{}'", on_cycle))
        }
    }

    /// All nodes reachable from `start` (excluding `start` unless on a cycle
    /// back to itself), via BFS in lexicographic frontier order.
    pub fn reachable(&self, start: &str) -> BTreeSet<String> {
        let mut seen: BTreeSet<String> = BTreeSet::new();
        let mut queue: VecDeque<&str> = VecDeque::new();
        queue.push_back(start);
        while let Some(n) = queue.pop_front() {
            if let Some(tos) = self.adj.get(n) {
                for t in tos {
                    if seen.insert(t.clone()) {
                        queue.push_back(t.as_str());
                    }
                }
            }
        }
        seen
    }

    /// True iff a directed path `from ->* to` exists (length >= 1).
    pub fn has_path(&self, from: &str, to: &str) -> bool {
        self.reachable(from).contains(to)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn diamond() -> DiGraph {
        let mut g = DiGraph::new();
        g.add_edge("a", "b");
        g.add_edge("a", "c");
        g.add_edge("b", "d");
        g.add_edge("c", "d");
        g
    }

    #[test]
    fn topo_respects_every_edge() {
        let g = diamond();
        let order = g.topo_sort().expect("acyclic");
        let pos: BTreeMap<&str, usize> = order
            .iter()
            .enumerate()
            .map(|(i, n)| (n.as_str(), i))
            .collect();
        for n in g.nodes() {
            for s in g.successors(n) {
                assert!(pos[n] < pos[s], "edge {}->{} violated", n, s);
            }
        }
        assert_eq!(order.len(), 4);
    }

    #[test]
    fn topo_is_deterministic_and_lex_least() {
        let g = diamond();
        let o1 = g.topo_sort().unwrap();
        let o2 = diamond().topo_sort().unwrap();
        assert_eq!(o1, o2);
        // Kahn with lex tie-break on the diamond: a, then b before c, then d.
        assert_eq!(o1, vec!["a", "b", "c", "d"]);
    }

    #[test]
    fn cycle_is_detected() {
        let mut g = diamond();
        g.add_edge("d", "a");
        let err = g.topo_sort().unwrap_err();
        assert!(err.contains("cycle"));
    }

    #[test]
    fn reachability_is_transitive_closure() {
        let g = diamond();
        let r = g.reachable("a");
        assert_eq!(
            r.iter().map(String::as_str).collect::<Vec<_>>(),
            vec!["b", "c", "d"]
        );
        assert!(g.has_path("a", "d"));
        assert!(!g.has_path("d", "a"));
        assert!(g.reachable("d").is_empty());
    }

    #[test]
    fn self_loop_reaches_itself() {
        let mut g = DiGraph::new();
        g.add_edge("x", "x");
        assert!(g.has_path("x", "x"));
        assert!(g.topo_sort().is_err());
    }
}
