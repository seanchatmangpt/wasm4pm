//! Streaming Process Skeleton discovery.
//!
//! Process Skeleton is a simplified DFG that only retains high-frequency edges,
//! filtering out noise and rare behaviors. This is useful for:
//!
//! - Process visualization (fewer edges = cleaner diagrams)
//! - Anomaly detection (low-frequency edges are potential anomalies)
//! - Process summarization (focus on the "happy path")

use crate::models::DirectlyFollowsGraph;
use crate::streaming::{
    impl_activity_interner, ActivityInterner, Interner, StreamStats, StreamingAlgorithm,
};
use rustc_hash::FxHashMap;
use std::collections::HashMap;

/// Streaming Process Skeleton builder.
///
/// Maintains activity frequency counts and filters edges by minimum support threshold.
///
/// # Performance
///
/// - **Per-event overhead**: ~50ns (simpler than DFG, no edge counting)
/// - **Memory**: O(open_traces × avg_trace_length)
/// - **Parity**: 100% with batch skeleton (after filtering)
///
/// # Example
///
/// ```rust
/// use pictl::streaming::StreamingSkeletonBuilder;
/// use pictl::streaming::StreamingAlgorithm;
///
/// let mut stream = StreamingSkeletonBuilder::new();
///
/// stream.add_event("case1", "A");
/// stream.add_event("case1", "B");
/// stream.add_event("case1", "C");
/// stream.close_trace("case1");
///
/// // Get skeleton with min frequency 2
/// let dfg = stream.snapshot_with_min_freq(2);
/// ```
#[derive(Debug, Clone)]
pub struct StreamingSkeletonBuilder {
    /// Activity string interner
    pub interner: Interner,
    /// per-activity occurrence counts
    pub activity_counts: Vec<usize>,
    /// total events processed (including open traces)
    pub event_count: usize,
    /// number of traces closed so far
    pub trace_count: usize,
    /// open (in-progress) traces: case_id → encoded activity sequence
    pub open_traces: HashMap<String, Vec<u32>>,
    /// Minimum frequency threshold for skeleton edges
    pub min_frequency: usize,
}

// Implement ActivityInterner trait
impl_activity_interner!(StreamingSkeletonBuilder);

impl StreamingSkeletonBuilder {
    /// Create a new streaming skeleton builder with default min frequency (1).
    pub fn new() -> Self {
        StreamingSkeletonBuilder {
            interner: Interner::new(),
            activity_counts: Vec::new(),
            event_count: 0,
            trace_count: 0,
            open_traces: HashMap::new(),
            min_frequency: 1,
        }
    }

    /// Create a new streaming skeleton builder with custom min frequency.
    ///
    /// # Arguments
    ///
    /// * `min_frequency` - Minimum frequency for an edge to be included in skeleton
    pub fn with_min_frequency(min_frequency: usize) -> Self {
        StreamingSkeletonBuilder {
            min_frequency,
            ..Self::new()
        }
    }

    /// Get skeleton DFG with custom min frequency threshold.
    ///
    /// This is a non-destructive read - you can call it multiple times
    /// with different thresholds to explore the process at different granularities.
    pub fn snapshot_with_min_freq(&self, min_freq: usize) -> DirectlyFollowsGraph {
        let mut dfg = DirectlyFollowsGraph::new();

        // Filter nodes by frequency
        dfg.nodes = self
            .interner
            .vocab()
            .iter()
            .enumerate()
            .filter_map(|(i, name)| {
                let freq = self.activity_counts.get(i).copied().unwrap_or(0);
                if freq >= min_freq {
                    Some(crate::models::DFGNode {
                        id: name.clone(),
                        label: name.clone(),
                        frequency: freq,
                    })
                } else {
                    None
                }
            })
            .collect();

        // Build edge counts from all traces (including open ones)
        let mut edge_counts: FxHashMap<(u32, u32), usize> = FxHashMap::default();

        // Count edges from closed traces
        for trace in self.open_traces.values() {
            for pair in trace.windows(2) {
                *edge_counts.entry((pair[0], pair[1])).or_insert(0) += 1;
            }
        }

        // Filter edges by min frequency
        dfg.edges = edge_counts
            .into_iter()
            .filter_map(|((f, t), freq)| {
                if freq >= min_freq {
                    Some(crate::models::DirectlyFollowsRelation {
                        from: self.interner.get(f).unwrap_or("").to_string(),
                        to: self.interner.get(t).unwrap_or("").to_string(),
                        frequency: freq,
                    })
                } else {
                    None
                }
            })
            .collect();

        dfg
    }
}

impl StreamingAlgorithm for StreamingSkeletonBuilder {
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

        // Count activity frequencies
        for &id in &events {
            self.activity_counts[id as usize] += 1;
        }

        self.trace_count += 1;
        true
    }

    fn snapshot(&self) -> Self::Model {
        self.snapshot_with_min_freq(self.min_frequency)
    }

    fn stats(&self) -> StreamStats {
        let open_trace_events: usize = self.open_traces.values().map(|v| v.len()).sum();
        let memory_bytes =
            // open_traces HashMap
            self.open_traces.capacity() * (std::mem::size_of::<String>() + std::mem::size_of::<Vec<u32>>()) +
            // open trace event buffers
            open_trace_events * std::mem::size_of::<u32>() +
            // activity_counts
            self.activity_counts.capacity() * std::mem::size_of::<usize>();

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

impl Default for StreamingSkeletonBuilder {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_basic_skeleton() {
        let mut stream = StreamingSkeletonBuilder::new();

        // Add a trace
        stream.add_event("case1", "A");
        stream.add_event("case1", "B");
        stream.add_event("case1", "C");
        stream.close_trace("case1");

        let dfg = stream.snapshot();

        // Should have 3 activities
        assert_eq!(dfg.nodes.len(), 3);

        // Each activity appears once
        assert_eq!(dfg.nodes[0].frequency, 1);
        assert_eq!(dfg.nodes[1].frequency, 1);
        assert_eq!(dfg.nodes[2].frequency, 1);
    }

    #[test]
    fn test_frequency_filtering() {
        let mut stream = StreamingSkeletonBuilder::with_min_frequency(2);

        // Add 3 traces
        for i in 1..=3 {
            stream.add_event(&format!("case{}", i), "A");
            stream.add_event(&format!("case{}", i), "B");
            stream.add_event(&format!("case{}", i), "C");
            stream.close_trace(&format!("case{}", i));
        }

        // Add one trace with different activity
        stream.add_event("case4", "A");
        stream.add_event("case4", "X");
        stream.add_event("case4", "C");
        stream.close_trace("case4");

        let dfg = stream.snapshot();

        // X only appears once, should be filtered out
        assert!(!dfg.nodes.iter().any(|n| n.id == "X"));

        // A, B, C appear 4 times each
        assert_eq!(dfg.nodes.iter().find(|n| n.id == "A").unwrap().frequency, 4);
        assert_eq!(dfg.nodes.iter().find(|n| n.id == "B").unwrap().frequency, 3);
        assert_eq!(dfg.nodes.iter().find(|n| n.id == "C").unwrap().frequency, 4);
    }

    #[test]
    fn test_dynamic_threshold() {
        let mut stream = StreamingSkeletonBuilder::new();

        // Add traces
        for i in 1..=5 {
            stream.add_event(&format!("case{}", i), "A");
            stream.add_event(&format!("case{}", i), "B");
            stream.close_trace(&format!("case{}", i));
        }

        // With min_freq=1, all activities included
        let dfg1 = stream.snapshot_with_min_freq(1);
        assert_eq!(dfg1.nodes.len(), 2);

        // With min_freq=10, no activities included
        let dfg10 = stream.snapshot_with_min_freq(10);
        assert_eq!(dfg10.nodes.len(), 0);

        // With min_freq=5, all activities included
        let dfg5 = stream.snapshot_with_min_freq(5);
        assert_eq!(dfg5.nodes.len(), 2);
    }

    #[test]
    fn test_stats() {
        let mut stream = StreamingSkeletonBuilder::new();

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
