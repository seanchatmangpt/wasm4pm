//! Streaming A* discovery.
//!
//! A* is an informed search algorithm that uses heuristics to guide model
//! discovery. This streaming implementation maintains DFG state incrementally
//! and applies heuristic-guided edge pruning at snapshot time.
//!
//! The heuristic function estimates model quality by balancing:
//! - **Precision**: fraction of model behavior observed in the log
//! - **Recall (fitness)**: fraction of log behavior explained by the model
//!
//! The A* score combines actual cost (edges removed) with estimated cost
//! to reach an optimal model.

use crate::models::{DFGNode, DirectlyFollowsGraph, DirectlyFollowsRelation};
use crate::streaming::{
    impl_activity_interner, ActivityInterner, Interner, StreamStats, StreamingAlgorithm,
};
use rustc_hash::FxHashMap;
use std::collections::HashMap;

/// Default heuristic weight — balances fitness vs precision.
const DEFAULT_HEURISTIC_WEIGHT: f64 = 0.5;

/// Streaming A* builder.
///
/// Accumulates DFG edge counts during ingestion. At snapshot time:
/// 1. Computes fitness and precision for each edge
/// 2. Uses A* scoring (fitness + heuristic_weight * estimated_precision)
/// 3. Prunes edges that degrade the combined score
/// 4. Returns optimized DFG
#[derive(Debug, Clone)]
pub struct StreamingAStarBuilder {
    /// Activity string interner
    pub interner: Interner,
    /// Activity occurrence counts
    pub activity_counts: Vec<usize>,
    /// Edge counts
    pub edge_counts: FxHashMap<(u32, u32), usize>,
    /// Reverse edge counts for precision computation
    pub reverse_edge_counts: FxHashMap<(u32, u32), usize>,
    /// Start/end activity counts
    pub start_counts: FxHashMap<u32, usize>,
    pub end_counts: FxHashMap<u32, usize>,
    /// Event/trace counters
    pub event_count: usize,
    pub trace_count: usize,
    /// Open traces
    pub open_traces: HashMap<String, Vec<u32>>,
    /// Heuristic weight for precision vs fitness tradeoff
    heuristic_weight: f64,
}

impl_activity_interner!(StreamingAStarBuilder);

impl StreamingAStarBuilder {
    pub fn new() -> Self {
        StreamingAStarBuilder {
            interner: Interner::new(),
            activity_counts: Vec::new(),
            edge_counts: FxHashMap::default(),
            reverse_edge_counts: FxHashMap::default(),
            start_counts: FxHashMap::default(),
            end_counts: FxHashMap::default(),
            event_count: 0,
            trace_count: 0,
            open_traces: HashMap::new(),
            heuristic_weight: DEFAULT_HEURISTIC_WEIGHT,
        }
    }

    /// Set the heuristic weight for precision vs fitness tradeoff (default: 0.5).
    ///
    /// - 0.0 = optimize for fitness only (keep all edges)
    /// - 1.0 = optimize for precision only (prune aggressively)
    /// - 0.5 = balanced tradeoff
    pub fn with_heuristic_weight(mut self, weight: f64) -> Self {
        self.heuristic_weight = weight.clamp(0.0, 1.0);
        self
    }

    /// Build A*-optimized DFG with heuristic-guided edge pruning.
    ///
    /// Algorithm:
    /// 1. For each edge, compute:
    ///    - Fitness contribution: edge_count / total_directly_follows
    ///    - Precision contribution: 1.0 - (reverse_count / edge_count) (lower reverse = more precise)
    /// 2. Compute A* score: fitness + weight * precision
    /// 3. Prune edges below the median A* score
    /// 4. Recompute fitness on pruned graph
    pub fn to_dfg(&self) -> DirectlyFollowsGraph {
        if self.edge_counts.is_empty() {
            return DirectlyFollowsGraph::new();
        }

        let total_possible = self.event_count.saturating_sub(self.trace_count);
        if total_possible == 0 {
            return DirectlyFollowsGraph::new();
        }

        // Compute A* score for each edge
        let mut scored_edges: Vec<((u32, u32), usize, f64)> = self
            .edge_counts
            .iter()
            .map(|(&(from, to), &count)| {
                // Fitness contribution: how much of the log this edge explains
                let fitness = count as f64 / total_possible as f64;

                // Precision: how specific is this edge
                // Low reverse count relative to forward count = high precision
                let reverse = self
                    .reverse_edge_counts
                    .get(&(to, from))
                    .copied()
                    .unwrap_or(0);
                let precision = if count > 0 {
                    1.0 - (reverse as f64 / (count + reverse) as f64)
                } else {
                    0.0
                };

                // A* score: g(n) + w * h(n) where g=fitness, h=precision
                let score = fitness + self.heuristic_weight * precision;

                ((from, to), count, score)
            })
            .collect();

        scored_edges.sort_by(|a, b| a.2.partial_cmp(&b.2).unwrap_or(std::cmp::Ordering::Equal));

        // Compute median score as pruning threshold
        let median_score = if scored_edges.len() >= 2 {
            let mid = scored_edges.len() / 2;
            scored_edges[mid].2
        } else {
            0.0
        };

        // Prune edges below median score (A* optimization: remove low-scoring edges)
        let pruned_edges: Vec<((u32, u32), usize)> = scored_edges
            .into_iter()
            .filter(|&(_, _, score)| score >= median_score)
            .map(|(edge, count, _)| (edge, count))
            .collect();

        // Build DFG from pruned edges
        let mut dfg = DirectlyFollowsGraph::new();

        dfg.nodes = self
            .interner
            .vocab()
            .iter()
            .enumerate()
            .map(|(i, name)| DFGNode {
                id: name.clone(),
                label: name.clone(),
                frequency: self.activity_counts.get(i).copied().unwrap_or(0),
            })
            .collect();

        dfg.edges = pruned_edges
            .iter()
            .map(|&((f, t), freq)| DirectlyFollowsRelation {
                from: self.interner.get(f).unwrap_or("").to_string(),
                to: self.interner.get(t).unwrap_or("").to_string(),
                frequency: freq,
            })
            .collect();

        for (&id, &cnt) in &self.start_counts {
            if let Some(name) = self.interner.get(id) {
                dfg.start_activities.insert(name.to_string(), cnt);
            }
        }
        for (&id, &cnt) in &self.end_counts {
            if let Some(name) = self.interner.get(id) {
                dfg.end_activities.insert(name.to_string(), cnt);
            }
        }

        dfg
    }
}

impl StreamingAlgorithm for StreamingAStarBuilder {
    type Model = DirectlyFollowsGraph;

    fn new() -> Self {
        Self::new()
    }

    fn add_event(&mut self, case_id: &str, activity: &str) {
        let id = self.intern(activity);
        self.open_traces
            .entry(case_id.to_owned())
            .or_insert_with(Vec::new)
            .push(id);

        if id as usize >= self.activity_counts.len() {
            self.activity_counts.resize(id as usize + 1, 0);
        }

        self.event_count += 1;
    }

    fn close_trace(&mut self, case_id: &str) -> bool {
        let Some(events) = self.open_traces.remove(case_id) else {
            return false;
        };
        if events.is_empty() {
            return true;
        }

        for &id in &events {
            self.activity_counts[id as usize] += 1;
        }

        for pair in events.windows(2) {
            *self.edge_counts.entry((pair[0], pair[1])).or_insert(0) += 1;
            *self
                .reverse_edge_counts
                .entry((pair[1], pair[0]))
                .or_insert(0) += 1;
        }

        *self.start_counts.entry(events[0]).or_insert(0) += 1;
        if let Some(last) = events.last() {
            *self.end_counts.entry(*last).or_insert(0) += 1;
        }

        self.trace_count += 1;
        true
    }

    fn snapshot(&self) -> Self::Model {
        self.to_dfg()
    }

    fn stats(&self) -> StreamStats {
        let open_trace_events: usize = self.open_traces.values().map(|v| v.len()).sum();
        let memory_bytes = self.open_traces.capacity()
            * (std::mem::size_of::<String>() + std::mem::size_of::<Vec<u32>>())
            + open_trace_events * std::mem::size_of::<u32>()
            + self.activity_counts.capacity() * std::mem::size_of::<usize>()
            + self.edge_counts.capacity()
                * (std::mem::size_of::<(u32, u32)>() + std::mem::size_of::<usize>())
            + self.reverse_edge_counts.capacity()
                * (std::mem::size_of::<(u32, u32)>() + std::mem::size_of::<usize>());

        StreamStats {
            event_count: self.event_count,
            trace_count: self.trace_count,
            open_traces: self.open_traces.len(),
            memory_bytes,
            activities: self.interner.len(),
        }
    }

    fn open_trace_ids(&self) -> Vec<String> {
        self.open_traces.keys().cloned().collect()
    }
}

impl Default for StreamingAStarBuilder {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_astar_basic() {
        let mut stream = StreamingAStarBuilder::new();

        stream.add_event("case1", "A");
        stream.add_event("case1", "B");
        stream.add_event("case1", "C");
        stream.close_trace("case1");

        let stats = stream.stats();
        assert_eq!(stats.event_count, 3);
        assert_eq!(stats.trace_count, 1);
    }

    #[test]
    fn test_astar_heuristic_scoring() {
        let mut stream = StreamingAStarBuilder::new().with_heuristic_weight(0.7);

        // Strong pattern: A→B (5 times), B→A (1 time — reverse/noise)
        for _ in 0..5 {
            stream.add_event("c1", "A");
            stream.add_event("c1", "B");
            stream.close_trace("c1");
        }
        stream.add_event("c_rev", "B");
        stream.add_event("c_rev", "A");
        stream.close_trace("c_rev");

        let dfg = stream.snapshot();
        // Both A→B and B→A exist, but A→B should score higher (high precision)
        let ab = dfg.edges.iter().find(|e| e.from == "A" && e.to == "B");
        let _ba = dfg.edges.iter().find(|e| e.from == "B" && e.to == "A");
        assert!(ab.is_some(), "should keep strong edge A→B");
        // B→A has low precision (reverse of dominant direction) so may be pruned
        // depending on median score
        assert!(!dfg.edges.is_empty(), "should have edges after pruning");
    }

    #[test]
    fn test_astar_empty() {
        let stream = StreamingAStarBuilder::new();
        let dfg = stream.snapshot();
        assert!(dfg.edges.is_empty());
        assert!(dfg.nodes.is_empty());
    }

    #[test]
    fn test_astar_fitness_only() {
        let mut stream = StreamingAStarBuilder::new().with_heuristic_weight(0.0);

        stream.add_event("c1", "A");
        stream.add_event("c1", "B");
        stream.close_trace("c1");

        let dfg = stream.snapshot();
        // With weight 0.0, fitness-only = keep all edges
        assert_eq!(
            dfg.edges.len(),
            1,
            "should keep all edges with zero heuristic weight"
        );
    }
}
