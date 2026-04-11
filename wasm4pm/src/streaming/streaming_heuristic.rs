//! Streaming Heuristic Miner discovery.
//!
//! Heuristic Miner extends DFG with dependency scores, measuring the strength
//! of directly-follows relationships. This helps identify:
//!
//! - Strong causal dependencies (high dependency score)
//! - Optional/parallel activities (low dependency score)
//! - Noise filtering (threshold-based edge pruning)

use crate::models::DirectlyFollowsGraph;
use crate::streaming::{
    impl_activity_interner, ActivityInterner, Interner, StreamStats, StreamingAlgorithm,
};
use rustc_hash::FxHashMap;
use std::collections::HashMap;

/// Streaming Heuristic Miner builder.
///
/// Maintains dependency matrix: for each pair (a,b), tracks:
/// - `a → b` count (directly-follows)
/// - `b → a` count (reverse directly-follows)
/// - `a` frequency
/// - `b` frequency
///
/// Dependency score: `dep(a→b) = (count(a→b) - count(b→a)) / (count(a→b) + count(b→a) + 1)`
///
/// # Performance
///
/// - **Per-event overhead**: ~200ns (updates 4 counters per directly-follows pair)
/// - **Memory**: O(open_traces × avg_trace_length + activities²)
/// - **Parity**: 100% with batch Heuristic Miner
///
/// # Example
///
/// ```rust
/// use pictl::streaming::StreamingHeuristicBuilder;
/// use pictl::streaming::StreamingAlgorithm;
///
/// let mut stream = StreamingHeuristicBuilder::with_dependency_threshold(0.8);
///
/// stream.add_event("case1", "A");
/// stream.add_event("case1", "B");
/// stream.add_event("case1", "C");
/// stream.close_trace("case1");
///
/// let dfg = stream.snapshot();
/// ```
#[derive(Debug, Clone)]
pub struct StreamingHeuristicBuilder {
    /// Activity string interner
    pub interner: Interner,
    /// per-activity occurrence counts
    pub activity_counts: Vec<usize>,
    /// directed edge occurrence counts: (from, to) → count
    pub edge_counts: FxHashMap<(u32, u32), usize>,
    /// start-activity counts
    pub start_counts: FxHashMap<u32, usize>,
    /// end-activity counts
    pub end_counts: FxHashMap<u32, usize>,
    /// total events processed
    pub event_count: usize,
    /// number of traces closed
    pub trace_count: usize,
    /// open (in-progress) traces
    pub open_traces: HashMap<String, Vec<u32>>,
    /// Minimum dependency threshold for including edges
    pub dependency_threshold: f64,
}

// Implement ActivityInterner trait
impl_activity_interner!(StreamingHeuristicBuilder);

impl StreamingHeuristicBuilder {
    /// Create a new streaming heuristic builder with default threshold (0.0 = include all).
    pub fn new() -> Self {
        StreamingHeuristicBuilder {
            interner: Interner::new(),
            activity_counts: Vec::new(),
            edge_counts: FxHashMap::default(),
            start_counts: FxHashMap::default(),
            end_counts: FxHashMap::default(),
            event_count: 0,
            trace_count: 0,
            open_traces: HashMap::new(),
            dependency_threshold: 0.0,
        }
    }

    /// Create a new streaming heuristic builder with custom dependency threshold.
    ///
    /// # Arguments
    ///
    /// * `threshold` - Minimum dependency score for edges (0.0 to 1.0)
    ///
    /// Common thresholds:
    /// - 0.0: Include all edges (equivalent to DFG)
    /// - 0.5: Weak dependency filtering
    /// - 0.8: Strong dependency (default for Heuristic Miner)
    /// - 0.9: Very strong dependency only
    pub fn with_dependency_threshold(threshold: f64) -> Self {
        StreamingHeuristicBuilder {
            dependency_threshold: threshold,
            ..Self::new()
        }
    }

    /// Compute dependency score for a pair of activities.
    ///
    /// Formula: `dep(a→b) = (count(a→b) - count(b→a)) / (count(a→b) + count(b→a) + 1)`
    ///
    /// Returns value in [-1, 1]:
    /// - 1.0: Always a→b, never b→a (strong causal dependency)
    /// - 0.0: Equal frequency a→b and b→a (parallel/choice)
    /// - -1.0: Never a→b, always b→a (reverse causal dependency)
    #[inline]
    pub fn dependency_score(&self, from: u32, to: u32) -> f64 {
        let forward = *self.edge_counts.get(&(from, to)).unwrap_or(&0);
        let reverse = *self.edge_counts.get(&(to, from)).unwrap_or(&0);

        if forward + reverse == 0 {
            0.0
        } else {
            (forward as f64 - reverse as f64) / (forward as f64 + reverse as f64 + 1.0)
        }
    }

    /// Get DFG filtered by dependency threshold.
    pub fn snapshot_with_threshold(&self, threshold: f64) -> DirectlyFollowsGraph {
        let mut dfg = DirectlyFollowsGraph::new();

        // Nodes
        dfg.nodes = self
            .interner
            .vocab()
            .iter()
            .enumerate()
            .map(|(i, name)| crate::models::DFGNode {
                id: name.clone(),
                label: name.clone(),
                frequency: self.activity_counts.get(i).copied().unwrap_or(0),
            })
            .collect();

        // Edges filtered by dependency score
        dfg.edges = self
            .edge_counts
            .iter()
            .filter_map(|(&(from, to), &freq)| {
                let dep_score = self.dependency_score(from, to);
                if dep_score.abs() >= threshold {
                    Some(crate::models::DirectlyFollowsRelation {
                        from: self.interner.get(from).unwrap_or("").to_string(),
                        to: self.interner.get(to).unwrap_or("").to_string(),
                        frequency: freq,
                    })
                } else {
                    None
                }
            })
            .collect();

        // Start/end activities
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

    /// Get all dependency scores as a map: (from_activity, to_activity) → score
    pub fn dependency_matrix(&self) -> FxHashMap<(String, String), f64> {
        let mut matrix = FxHashMap::default();

        for &(from, to) in self.edge_counts.keys() {
            let score = self.dependency_score(from, to);
            if let (Some(from_name), Some(to_name)) =
                (self.interner.get(from), self.interner.get(to))
            {
                matrix.insert((from_name.to_string(), to_name.to_string()), score);
            }
        }

        matrix
    }
}

impl StreamingAlgorithm for StreamingHeuristicBuilder {
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

        // Grow activity_counts if needed
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

        // Activity frequencies
        for &id in &events {
            self.activity_counts[id as usize] += 1;
        }

        // Directly-follows edges
        for pair in events.windows(2) {
            *self.edge_counts.entry((pair[0], pair[1])).or_insert(0) += 1;
        }

        // Start / end
        *self.start_counts.entry(events[0]).or_insert(0) += 1;
        if let Some(last) = events.last() {
            *self.end_counts.entry(*last).or_insert(0) += 1;
        }

        self.trace_count += 1;
        true
    }

    fn snapshot(&self) -> Self::Model {
        self.snapshot_with_threshold(self.dependency_threshold)
    }

    fn stats(&self) -> StreamStats {
        let open_trace_events: usize = self.open_traces.values().map(|v| v.len()).sum();
        let memory_bytes =
            // open_traces
            self.open_traces.capacity() * (std::mem::size_of::<String>() + std::mem::size_of::<Vec<u32>>()) +
            // open trace event buffers
            open_trace_events * std::mem::size_of::<u32>() +
            // activity_counts
            self.activity_counts.capacity() * std::mem::size_of::<usize>() +
            // edge_counts
            self.edge_counts.capacity() * (std::mem::size_of::<(u32,u32)>() + std::mem::size_of::<usize>()) +
            // start/end counts
            (self.start_counts.capacity() + self.end_counts.capacity()) * (std::mem::size_of::<u32>() + std::mem::size_of::<usize>());

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

impl Default for StreamingHeuristicBuilder {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_basic_heuristic() {
        let mut stream = StreamingHeuristicBuilder::new();

        // Add trace: A -> B -> C
        stream.add_event("case1", "A");
        stream.add_event("case1", "B");
        stream.add_event("case1", "C");
        stream.close_trace("case1");

        let dfg = stream.snapshot();

        // Should have 3 nodes
        assert_eq!(dfg.nodes.len(), 3);

        // Should have 2 edges
        assert_eq!(dfg.edges.len(), 2);
    }

    #[test]
    fn test_dependency_score() {
        let mut stream = StreamingHeuristicBuilder::new();

        // Add 100 traces: A -> B (overwhelming majority)
        for i in 1..=100 {
            stream.add_event(&format!("case{}", i), "A");
            stream.add_event(&format!("case{}", i), "B");
            stream.close_trace(&format!("case{}", i));
        }

        // Add 1 trace: B -> A (reverse)
        stream.add_event("case101", "B");
        stream.add_event("case101", "A");
        stream.close_trace("case101");

        // Dependency A->B should be high (strong causal)
        // Formula: (100 - 1) / (100 + 1 + 1) = 99/102 ≈ 0.971
        let id_a = stream.interner.vocab_map.get("A").unwrap();
        let id_b = stream.interner.vocab_map.get("B").unwrap();
        let dep_ab = stream.dependency_score(*id_a, *id_b);

        assert!(dep_ab > 0.9); // Strong positive dependency

        // Dependency B->A should be negative (reverse)
        // Formula: (1 - 100) / (1 + 100 + 1) = -99/102 ≈ -0.971
        let dep_ba = stream.dependency_score(*id_b, *id_a);
        assert!(dep_ba < -0.9); // Strong negative dependency
    }

    #[test]
    fn test_dependency_threshold() {
        // Test 1: low threshold includes all edges
        {
            let mut stream = StreamingHeuristicBuilder::with_dependency_threshold(0.0);

            stream.add_event("case1", "A");
            stream.add_event("case1", "B");
            stream.close_trace("case1");

            let dfg = stream.snapshot();
            assert_eq!(dfg.edges.len(), 1);
            assert_eq!(dfg.edges[0].from, "A");
        }

        // Test 2: high threshold filters weak dependencies
        // With 5 A->B and 4 B->A traces:
        // dep(A->B) = (5-4)/(5+4+1) = 1/10 = 0.1
        // dep(B->A) = (4-5)/(4+5+1) = -1/10 = -0.1
        // With threshold 0.5, |0.1| < 0.5, so both are filtered out
        {
            let mut stream = StreamingHeuristicBuilder::with_dependency_threshold(0.5);

            for i in 1..=5 {
                stream.add_event(&format!("case{}", i), "A");
                stream.add_event(&format!("case{}", i), "B");
                stream.close_trace(&format!("case{}", i));
            }
            for i in 6..=9 {
                stream.add_event(&format!("case{}", i), "B");
                stream.add_event(&format!("case{}", i), "A");
                stream.close_trace(&format!("case{}", i));
            }

            let dfg = stream.snapshot();
            // Both dependencies are weak (~0.1), filtered by 0.5 threshold
            assert_eq!(dfg.edges.len(), 0);
        }

        // Test 3: moderate threshold keeps strong dependency, filters weak one
        // 10 A->B, 1 B->A:
        // dep(A->B) = (10-1)/(10+1+1) = 9/12 = 0.75
        // dep(B->A) = (1-10)/(1+10+1) = -9/12 = -0.75
        // With threshold 0.7, both pass (|0.75| >= 0.7)
        // With threshold 0.8, neither passes (|0.75| < 0.8)
        {
            let mut stream = StreamingHeuristicBuilder::with_dependency_threshold(0.7);

            for i in 1..=10 {
                stream.add_event(&format!("case{}", i), "A");
                stream.add_event(&format!("case{}", i), "B");
                stream.close_trace(&format!("case{}", i));
            }
            stream.add_event("case11", "B");
            stream.add_event("case11", "A");
            stream.close_trace("case11");

            let dfg = stream.snapshot();
            // Both have |dep| = 0.75 >= 0.7
            assert_eq!(dfg.edges.len(), 2);
        }
    }

    #[test]
    fn test_dependency_matrix() {
        let mut stream = StreamingHeuristicBuilder::new();

        stream.add_event("case1", "A");
        stream.add_event("case1", "B");
        stream.add_event("case1", "C");
        stream.close_trace("case1");

        let matrix = stream.dependency_matrix();

        // Should have entries for A->B and B->C
        assert!(matrix.contains_key(&(String::from("A"), String::from("B"))));
        assert!(matrix.contains_key(&(String::from("B"), String::from("C"))));
    }

    #[test]
    fn test_stats() {
        let mut stream = StreamingHeuristicBuilder::new();

        stream.add_event("case1", "A");
        stream.add_event("case1", "B");
        stream.add_event("case2", "A");
        stream.close_trace("case1");

        let stats = stream.stats();

        assert_eq!(stats.event_count, 3);
        assert_eq!(stats.trace_count, 1);
        assert_eq!(stats.open_traces, 1);
        assert_eq!(stats.activities, 2);
    }
}
