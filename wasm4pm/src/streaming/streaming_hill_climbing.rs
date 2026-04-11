//! Streaming Hill Climbing discovery.
//!
//! Hill Climbing is a local optimization algorithm that greedily improves
//! a model by iteratively removing the least-costly edge. Starting from the
//! full observed DFG, edges that don't appear exclusively in any trace are
//! pruned first (zero-cost removal), then the process stops when every
//! remaining edge is essential for at least one trace.
//!
//! This streaming implementation stores closed trace sequences so that the
//! `to_dfg()` snapshot can compute per-edge removal costs accurately.

use crate::models::{DFGNode, DirectlyFollowsGraph, DirectlyFollowsRelation};
use crate::streaming::{
    impl_activity_interner, ActivityInterner, Interner, StreamStats, StreamingAlgorithm,
};
use rustc_hash::{FxHashMap, FxHashSet};
use std::collections::HashMap;

/// Default noise threshold — edges below this relative frequency are excluded
/// from the candidate set entirely (pruning before hill climbing begins).
const DEFAULT_NOISE_THRESHOLD: f64 = 0.0;

/// Streaming Hill Climbing builder.
///
/// Accumulates DFG edge counts and closed trace sequences during ingestion.
/// At snapshot time, runs greedy edge pruning:
/// 1. Start with all observed edges above noise threshold
/// 2. Compute removal cost per edge (traces where it's the sole occurrence)
/// 3. Remove zero-cost edges (those not essential for any trace)
/// 4. Repeat until all remaining edges are essential
/// 5. Materialise DFG from the optimized edge set
#[derive(Debug, Clone)]
pub struct StreamingHillClimbingBuilder {
    /// Activity string interner
    pub interner: Interner,
    /// Activity occurrence counts
    pub activity_counts: Vec<usize>,
    /// Edge counts
    pub edge_counts: FxHashMap<(u32, u32), usize>,
    /// Start/end activity counts
    pub start_counts: FxHashMap<u32, usize>,
    pub end_counts: FxHashMap<u32, usize>,
    /// Event/trace counters
    pub event_count: usize,
    pub trace_count: usize,
    /// Open traces (being accumulated before close_trace)
    pub open_traces: HashMap<String, Vec<u32>>,
    /// Closed trace sequences for marginal-gain computation at snapshot time
    closed_traces: Vec<Vec<u32>>,
    /// Noise threshold — edges below this relative frequency are pruned
    noise_threshold: f64,
}

impl_activity_interner!(StreamingHillClimbingBuilder);

impl StreamingHillClimbingBuilder {
    pub fn new() -> Self {
        StreamingHillClimbingBuilder {
            interner: Interner::new(),
            activity_counts: Vec::new(),
            edge_counts: FxHashMap::default(),
            start_counts: FxHashMap::default(),
            end_counts: FxHashMap::default(),
            event_count: 0,
            trace_count: 0,
            open_traces: HashMap::new(),
            closed_traces: Vec::new(),
            noise_threshold: DEFAULT_NOISE_THRESHOLD,
        }
    }

    /// Set the noise threshold for pre-filtering (default: 0.0 = no filtering).
    ///
    /// Edges with relative frequency (count / max_count) below this threshold
    /// are excluded from the candidate set before hill climbing begins.
    /// Higher values = more aggressive pre-filtering (faster but may miss edges).
    pub fn with_noise_threshold(mut self, threshold: f64) -> Self {
        self.noise_threshold = threshold.clamp(0.0, 1.0);
        self
    }

    /// Build optimized DFG via greedy hill climbing.
    ///
    /// Algorithm: start with ALL observed edges, then iteratively REMOVE the
    /// edge whose removal causes the least fitness loss. An edge's removal
    /// cost is the number of traces that become "broken" (have at least one
    /// consecutive pair not in the remaining set).
    ///
    /// 1. Start with all observed edges (above noise threshold if set)
    /// 2. For each candidate edge, compute removal cost: how many traces
    ///    would lose their last copy of this edge
    /// 3. Remove the edge with the lowest cost (least fitness impact)
    /// 4. Repeat until all remaining edges are "essential" (removing any
    ///    would break at least one trace)
    /// 5. Materialise DFG from the optimized edge set
    pub fn to_dfg(&self) -> DirectlyFollowsGraph {
        if self.closed_traces.is_empty() {
            return DirectlyFollowsGraph::new();
        }

        // Pre-filter: build candidate set of edges above noise threshold
        let max_freq = self.edge_counts.values().copied().max().unwrap_or(1);
        let mut current_edges: FxHashSet<(u32, u32)> = if self.noise_threshold > 0.0 {
            self.edge_counts
                .iter()
                .filter(|&(_, &count)| count as f64 / max_freq as f64 >= self.noise_threshold)
                .map(|(&k, _)| k)
                .collect()
        } else {
            self.edge_counts.keys().copied().collect()
        };

        if current_edges.is_empty() {
            return DirectlyFollowsGraph::new();
        }

        // Greedy hill climbing: iteratively remove the least-costly edge
        // An edge's removal cost = number of traces where it appears
        // AND it's the only copy of that pair in the trace
        // (i.e., traces that would "break" if this edge were removed)
        let mut improved = true;

        while improved && current_edges.len() > 1 {
            improved = false;

            // For each edge, count how many traces have it as their ONLY occurrence
            // Removing such an edge would "break" that trace
            let mut removal_cost: FxHashMap<(u32, u32), usize> = FxHashMap::default();

            for trace in &self.closed_traces {
                if trace.len() < 2 {
                    continue;
                }

                // Count occurrences of each edge pair in this trace
                let mut pair_counts: FxHashMap<(u32, u32), usize> = FxHashMap::default();
                for i in 0..trace.len() - 1 {
                    let pair = (trace[i], trace[i + 1]);
                    if current_edges.contains(&pair) {
                        *pair_counts.entry(pair).or_insert(0) += 1;
                    }
                }

                // Edges that appear exactly once in this trace are "essential" for it
                for (&pair, &count) in &pair_counts {
                    if count == 1 {
                        *removal_cost.entry(pair).or_insert(0) += 1;
                    }
                }
            }

            // Find the edge with the lowest removal cost
            // If cost is 0, removing it breaks no traces — safe to remove
            if let Some((&worst_edge, _)) = removal_cost.iter().min_by_key(|(_, &v)| v) {
                if removal_cost[&worst_edge] == 0 {
                    // This edge appears in no trace exclusively — safe to prune
                    current_edges.remove(&worst_edge);
                    improved = true;
                }
                // If all edges have cost > 0, all are essential — stop
            }
        }

        // Materialise DFG from the optimized edge set
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

        dfg.edges = current_edges
            .iter()
            .filter_map(|&edge| {
                let freq = self.edge_counts.get(&edge)?;
                Some(DirectlyFollowsRelation {
                    from: self.interner.get(edge.0).unwrap_or("").to_string(),
                    to: self.interner.get(edge.1).unwrap_or("").to_string(),
                    frequency: *freq,
                })
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

impl StreamingAlgorithm for StreamingHillClimbingBuilder {
    type Model = DirectlyFollowsGraph;

    fn new() -> Self {
        Self::new()
    }

    fn add_event(&mut self, case_id: &str, activity: &str) {
        let id = self.intern(activity);
        self.open_traces
            .entry(case_id.to_owned())
            .or_default()
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
        }

        *self.start_counts.entry(events[0]).or_insert(0) += 1;
        if let Some(last) = events.last() {
            *self.end_counts.entry(*last).or_insert(0) += 1;
        }

        // Store trace sequence for hill climbing at snapshot time
        self.closed_traces.push(events);

        self.trace_count += 1;
        true
    }

    fn snapshot(&self) -> Self::Model {
        self.to_dfg()
    }

    fn stats(&self) -> StreamStats {
        let open_trace_events: usize = self.open_traces.values().map(|v| v.len()).sum();
        let closed_trace_events: usize = self.closed_traces.iter().map(|v| v.len()).sum();
        let memory_bytes = self.open_traces.capacity()
            * (std::mem::size_of::<String>() + std::mem::size_of::<Vec<u32>>())
            + open_trace_events * std::mem::size_of::<u32>()
            + self.closed_traces.capacity() * std::mem::size_of::<Vec<u32>>()
            + closed_trace_events * std::mem::size_of::<u32>()
            + self.activity_counts.capacity() * std::mem::size_of::<usize>()
            + self.edge_counts.capacity()
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

impl Default for StreamingHillClimbingBuilder {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hill_climbing_basic() {
        let mut stream = StreamingHillClimbingBuilder::new();

        stream.add_event("case1", "A");
        stream.add_event("case1", "B");
        stream.add_event("case1", "C");
        stream.close_trace("case1");

        let stats = stream.stats();
        assert_eq!(stats.event_count, 3);
        assert_eq!(stats.trace_count, 1);

        let dfg = stream.snapshot();
        // Hill climbing should add all edges (only 2 edges, each is the sole missing pair)
        assert!(dfg.edges.iter().any(|e| e.from == "A" && e.to == "B"));
        assert!(dfg.edges.iter().any(|e| e.from == "B" && e.to == "C"));
    }

    #[test]
    fn test_hill_climbing_noise_pruning() {
        let mut stream = StreamingHillClimbingBuilder::new().with_noise_threshold(0.3);

        // Strong pattern: A→B (5 times), A→C (1 time — noise)
        for i in 0..5 {
            stream.add_event(&format!("c{}", i), "A");
            stream.add_event(&format!("c{}", i), "B");
            stream.close_trace(&format!("c{}", i));
        }
        stream.add_event("c_noise", "A");
        stream.add_event("c_noise", "C");
        stream.close_trace("c_noise");

        let dfg = stream.snapshot();
        // A→C has freq=1 vs max=5, ratio=0.2 < 0.3 threshold → excluded from candidates
        let has_ab = dfg.edges.iter().any(|e| e.from == "A" && e.to == "B");
        let has_ac = dfg.edges.iter().any(|e| e.from == "A" && e.to == "C");
        assert!(has_ab, "should keep strong edge A→B");
        assert!(!has_ac, "should prune weak edge A→C with threshold 0.3");
    }

    #[test]
    fn test_hill_climbing_empty() {
        let stream = StreamingHillClimbingBuilder::new();
        let dfg = stream.snapshot();
        assert!(dfg.edges.is_empty());
        assert!(dfg.nodes.is_empty());
    }

    #[test]
    fn test_hill_climbing_no_pruning_with_low_threshold() {
        let mut stream = StreamingHillClimbingBuilder::new().with_noise_threshold(0.0);

        stream.add_event("c1", "A");
        stream.add_event("c1", "B");
        stream.close_trace("c1");

        let dfg = stream.snapshot();
        assert_eq!(
            dfg.edges.len(),
            1,
            "should keep all edges with zero threshold"
        );
    }

    #[test]
    fn test_hill_climbing_greedy_order() {
        // Two traces: A→B→C and A→D→E
        // Hill climbing should add all 4 edges since each is needed
        let mut stream = StreamingHillClimbingBuilder::new();

        stream.add_event("c1", "A");
        stream.add_event("c1", "B");
        stream.add_event("c1", "C");
        stream.close_trace("c1");

        stream.add_event("c2", "A");
        stream.add_event("c2", "D");
        stream.add_event("c2", "E");
        stream.close_trace("c2");

        let dfg = stream.snapshot();
        assert_eq!(
            dfg.edges.len(),
            4,
            "should discover all 4 edges across both traces"
        );
    }

    #[test]
    fn test_hill_climbing_matches_batch_behavior() {
        // Three identical traces: A→B→C
        // All edges should be present (each is the sole missing pair in turn)
        let mut stream = StreamingHillClimbingBuilder::new();

        for i in 0..3 {
            stream.add_event(&format!("c{}", i), "A");
            stream.add_event(&format!("c{}", i), "B");
            stream.add_event(&format!("c{}", i), "C");
            stream.close_trace(&format!("c{}", i));
        }

        let dfg = stream.snapshot();
        assert_eq!(dfg.edges.len(), 2, "should have exactly 2 edges");
        assert!(dfg.edges.iter().any(|e| e.from == "A" && e.to == "B"));
        assert!(dfg.edges.iter().any(|e| e.from == "B" && e.to == "C"));
    }
}
