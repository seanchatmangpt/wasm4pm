//! Streaming Noise-Filtered DFG discovery.
//!
//! A lightweight streaming algorithm that produces a DFG by filtering out
//! low-frequency edges as noise. Edges are ranked by occurrence count
//! relative to the maximum frequency, and those below a configurable
//! threshold are pruned.
//!
//! This is the 80/20 algorithm for streaming process mining:
//! - O(E log E) at snapshot time (single sort)
//! - O(E) memory (edge counts only — no trace storage)
//! - Bounded memory regardless of stream length
//! - Fast approximate discovery for noisy real-world logs
//!
//! # When to Use
//!
//! - Production streaming pipelines with millions of events
//! - Noisy logs (incomplete traces, logging errors, rare outliers)
//! - Memory-constrained environments (WASM, edge devices)
//! - Real-time dashboards where "good enough" beats "perfect"

use crate::models::{DFGNode, DirectlyFollowsGraph, DirectlyFollowsRelation};
use crate::streaming::{
    impl_activity_interner, ActivityInterner, Interner, StreamStats, StreamingAlgorithm,
};
use rustc_hash::FxHashMap;
use std::collections::HashMap;

/// Default noise threshold — edges with relative frequency below this are pruned.
const DEFAULT_NOISE_THRESHOLD: f64 = 0.2;

/// Streaming Noise-Filtered DFG builder.
///
/// Accumulates DFG edge counts during ingestion. At snapshot time:
/// 1. Computes edge frequency distribution (count / max_count)
/// 2. Filters edges below noise threshold
/// 3. Returns DFG with only the high-frequency edges
#[derive(Debug, Clone)]
pub struct StreamingNoiseFilteredDfgBuilder {
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
    /// Open traces
    pub open_traces: HashMap<String, Vec<u32>>,
    /// Noise threshold for edge pruning
    noise_threshold: f64,
}

impl_activity_interner!(StreamingNoiseFilteredDfgBuilder);

impl StreamingNoiseFilteredDfgBuilder {
    pub fn new() -> Self {
        StreamingNoiseFilteredDfgBuilder {
            interner: Interner::new(),
            activity_counts: Vec::new(),
            edge_counts: FxHashMap::default(),
            start_counts: FxHashMap::default(),
            end_counts: FxHashMap::default(),
            event_count: 0,
            trace_count: 0,
            open_traces: HashMap::new(),
            noise_threshold: DEFAULT_NOISE_THRESHOLD,
        }
    }

    /// Set the noise threshold for edge pruning (default: 0.2).
    ///
    /// Edges with relative frequency (count / max_count) below this threshold
    /// are removed as noise. Higher values = more aggressive pruning.
    pub fn with_noise_threshold(mut self, threshold: f64) -> Self {
        self.noise_threshold = threshold.clamp(0.0, 1.0);
        self
    }

    /// Build noise-filtered DFG.
    ///
    /// Algorithm:
    /// 1. Find the maximum edge frequency
    /// 2. Keep only edges where count/max_count >= noise_threshold
    /// 3. Materialise DFG from the filtered edge set
    pub fn to_dfg(&self) -> DirectlyFollowsGraph {
        if self.edge_counts.is_empty() {
            return DirectlyFollowsGraph::new();
        }

        let total_possible = self.event_count.saturating_sub(self.trace_count);
        if total_possible == 0 {
            return DirectlyFollowsGraph::new();
        }

        // Filter: keep only edges above noise threshold
        let max_freq = self.edge_counts.values().copied().max().unwrap_or(1);
        let filtered_edges: Vec<((u32, u32), usize)> = self
            .edge_counts
            .iter()
            .filter(|&(_, &count)| count as f64 / max_freq as f64 >= self.noise_threshold)
            .map(|(&k, &v)| (k, v))
            .collect();

        // Build DFG from filtered edges
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

        dfg.edges = filtered_edges
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

impl StreamingAlgorithm for StreamingNoiseFilteredDfgBuilder {
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

impl Default for StreamingNoiseFilteredDfgBuilder {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_noise_filtered_basic() {
        let mut stream = StreamingNoiseFilteredDfgBuilder::new();

        stream.add_event("case1", "A");
        stream.add_event("case1", "B");
        stream.add_event("case1", "C");
        stream.close_trace("case1");

        let stats = stream.stats();
        assert_eq!(stats.event_count, 3);
        assert_eq!(stats.trace_count, 1);
    }

    #[test]
    fn test_noise_filtered_pruning() {
        let mut stream = StreamingNoiseFilteredDfgBuilder::new().with_noise_threshold(0.3);

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
        // A→C (freq=1 vs max=5, ratio=0.2) should be pruned
        let has_ab = dfg.edges.iter().any(|e| e.from == "A" && e.to == "B");
        let has_ac = dfg.edges.iter().any(|e| e.from == "A" && e.to == "C");
        assert!(has_ab, "should keep strong edge A→B");
        assert!(!has_ac, "should prune weak edge A→C with threshold 0.3");
    }

    #[test]
    fn test_noise_filtered_empty() {
        let stream = StreamingNoiseFilteredDfgBuilder::new();
        let dfg = stream.snapshot();
        assert!(dfg.edges.is_empty());
        assert!(dfg.nodes.is_empty());
    }

    #[test]
    fn test_noise_filtered_zero_threshold() {
        let mut stream = StreamingNoiseFilteredDfgBuilder::new().with_noise_threshold(0.0);

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
    fn test_noise_filtered_preserves_rare_variant() {
        // Noise filter REMOVES rare variants — that's its job
        let mut stream = StreamingNoiseFilteredDfgBuilder::new().with_noise_threshold(0.5);

        // 10 traces: A→B→C, 1 trace: A→X→C
        for i in 0..10 {
            stream.add_event(&format!("c{}", i), "A");
            stream.add_event(&format!("c{}", i), "B");
            stream.add_event(&format!("c{}", i), "C");
            stream.close_trace(&format!("c{}", i));
        }
        stream.add_event("c_rare", "A");
        stream.add_event("c_rare", "X");
        stream.add_event("c_rare", "C");
        stream.close_trace("c_rare");

        let dfg = stream.snapshot();
        // A→X has freq=1, max=10, ratio=0.1 < 0.5 → pruned
        let has_ax = dfg.edges.iter().any(|e| e.from == "A" && e.to == "X");
        let has_xc = dfg.edges.iter().any(|e| e.from == "X" && e.to == "C");
        assert!(!has_ax, "should prune rare edge A→X");
        assert!(!has_xc, "should prune rare edge X→C");
        // Common edges should remain
        assert!(dfg.edges.iter().any(|e| e.from == "A" && e.to == "B"));
        assert!(dfg.edges.iter().any(|e| e.from == "B" && e.to == "C"));
    }

    #[test]
    fn test_noise_filtered_aggressive_pruning() {
        let mut stream = StreamingNoiseFilteredDfgBuilder::new().with_noise_threshold(0.9);

        // 3 edges with frequencies 10, 5, 1
        for _ in 0..10 {
            stream.add_event("c1", "A");
            stream.add_event("c1", "B");
            stream.close_trace("c1");
        }
        for _ in 0..5 {
            stream.add_event("c2", "B");
            stream.add_event("c2", "C");
            stream.close_trace("c2");
        }
        stream.add_event("c3", "C");
        stream.add_event("c3", "D");
        stream.close_trace("c3");

        let dfg = stream.snapshot();
        // max=10, threshold=0.9 → only edges with freq >= 9 kept
        // A→B (freq=10, ratio=1.0) → kept
        // B→C (freq=5, ratio=0.5) → pruned
        // C→D (freq=1, ratio=0.1) → pruned
        assert_eq!(dfg.edges.len(), 1);
        assert!(dfg.edges.iter().any(|e| e.from == "A" && e.to == "B"));
    }
}
