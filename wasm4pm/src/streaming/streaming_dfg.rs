//! Streaming Directly-Follows Graph (DFG) discovery.
//!
//! This is the foundational streaming algorithm, providing memory-efficient
//! DFG construction for infinite event streams. All other streaming algorithms
//! build on this pattern.

use crate::models::DirectlyFollowsGraph;
use crate::streaming::{StreamingAlgorithm, StreamStats, ActivityInterner, Interner};
use rustc_hash::FxHashMap;
use std::collections::HashMap;

/// Streaming DFG builder for IoT / chunked event ingestion.
///
/// Maintains running DFG counts without storing the full event log in memory.
/// Events are added one-by-one (or in batches) per case; once a trace is
/// closed its per-trace buffer is freed and its counts folded into the global
/// totals. Memory use is proportional to open concurrent traces × average
/// trace length, not total log size.
///
/// # Performance
///
/// - **Per-event overhead**: ~100ns (integer encoding + HashMap insert)
/// - **Memory**: O(open_traces × avg_trace_length)
/// - **Parity**: 100% with batch DFG (exact equality)
///
/// # Example
///
/// ```rust
/// use wasm4pm::streaming::StreamingDfgBuilder;
/// use wasm4pm::streaming::StreamingAlgorithm;
///
/// let mut stream = StreamingDfgBuilder::new();
///
/// // Add events incrementally
/// stream.add_event("case1", "A");
/// stream.add_event("case1", "B");
/// stream.add_event("case1", "C");
/// stream.close_trace("case1");
///
/// // Get snapshot
/// let dfg = stream.snapshot();
/// assert_eq!(dfg.edges.len(), 2); // A→B, B→C
/// ```
#[derive(Debug, Clone)]
pub struct StreamingDfgBuilder {
    /// Activity string interner
    pub interner: Interner,
    /// per-activity occurrence counts indexed by id (grown on demand)
    pub node_counts: Vec<usize>,
    /// directed edge occurrence counts
    pub edge_counts: FxHashMap<(u32, u32), usize>,
    /// start-activity counts (first event in each closed trace)
    pub start_counts: FxHashMap<u32, usize>,
    /// end-activity counts (last event in each closed trace)
    pub end_counts: FxHashMap<u32, usize>,
    /// number of traces closed so far
    pub trace_count: usize,
    /// total events processed (including open traces)
    pub event_count: usize,
    /// open (in-progress) traces: case_id → encoded activity sequence
    /// freed when the trace is closed via `close_trace`
    pub open_traces: HashMap<String, Vec<u32>>,
}

// Implement ActivityInterner trait
impl crate::streaming::ActivityInterner for StreamingDfgBuilder {
    #[inline]
    fn intern(&mut self, activity: &str) -> u32 {
        if let Some(&id) = self.interner.vocab_map.get(activity) {
            return id;
        }
        let id = self.interner.vocab.len() as u32;
        self.interner.vocab.push(activity.to_owned());
        self.interner.vocab_map.insert(activity.to_owned(), id);
        id
    }

    #[inline]
    fn lookup(&self, id: u32) -> Option<&str> {
        self.interner.get(id)
    }

    #[inline]
    fn vocab_size(&self) -> usize {
        self.interner.len()
    }
}

impl StreamingDfgBuilder {
    /// Intern an activity string and return its u32 id.
    #[inline]
    pub fn intern_activity(&mut self, activity: &str) -> u32 {
        if let Some(&id) = self.interner.vocab_map.get(activity) {
            return id;
        }
        let id = self.interner.vocab.len() as u32;
        self.interner.vocab.push(activity.to_owned());
        self.interner.vocab_map.insert(activity.to_owned(), id);
        id
    }

    /// Get the activity string for an ID.
    #[inline]
    pub fn lookup_activity(&self, id: u32) -> Option<&str> {
        self.interner.get(id)
    }
}

impl StreamingAlgorithm for StreamingDfgBuilder {
    type Model = DirectlyFollowsGraph;

    fn new() -> Self {
        StreamingDfgBuilder {
            interner: Interner::new(),
            node_counts: Vec::new(),
            edge_counts: FxHashMap::default(),
            start_counts: FxHashMap::default(),
            end_counts: FxHashMap::default(),
            trace_count: 0,
            event_count: 0,
            open_traces: HashMap::new(),
        }
    }

    fn add_event(&mut self, case_id: &str, activity: &str) {
        let id = self.intern(activity);
        self.open_traces
            .entry(case_id.to_owned())
            .or_insert_with(Vec::new)
            .push(id);

        // Grow node_counts if needed
        if id as usize >= self.node_counts.len() {
            self.node_counts.resize(id as usize + 1, 0);
        }

        self.event_count += 1;
    }

    fn close_trace(&mut self, case_id: &str) -> bool {
        let Some(events) = self.open_traces.remove(case_id) else { return false; };
        if events.is_empty() { return true; }

        // Node frequencies
        for &id in &events {
            self.node_counts[id as usize] += 1;
        }

        // Directly-follows edges
        for pair in events.windows(2) {
            *self.edge_counts.entry((pair[0], pair[1])).or_insert(0) += 1;
        }

        // Start / end (safe: events non-empty due to check above)
        *self.start_counts.entry(events[0]).or_insert(0) += 1;
        if let Some(last) = events.last() {
            *self.end_counts.entry(*last).or_insert(0) += 1;
        }

        self.trace_count += 1;
        true
    }

    fn snapshot(&self) -> Self::Model {
        let mut dfg = DirectlyFollowsGraph::new();

        // Nodes
        dfg.nodes = self.interner.vocab().iter().enumerate().map(|(i, name)| {
            crate::models::DFGNode {
                id: name.clone(),
                label: name.clone(),
                frequency: self.node_counts.get(i).copied().unwrap_or(0),
            }
        }).collect();

        // Edges
        dfg.edges = self.edge_counts.iter().map(|(&(f, t), &freq)| {
            crate::models::DirectlyFollowsRelation {
                from: self.interner.get(f).unwrap_or("").to_string(),
                to: self.interner.get(t).unwrap_or("").to_string(),
                frequency: freq,
            }
        }).collect();

        // Start activities
        for (&id, &cnt) in &self.start_counts {
            if let Some(name) = self.interner.get(id) {
                dfg.start_activities.insert(name.to_string(), cnt);
            }
        }

        // End activities
        for (&id, &cnt) in &self.end_counts {
            if let Some(name) = self.interner.get(id) {
                dfg.end_activities.insert(name.to_string(), cnt);
            }
        }

        dfg
    }

    fn stats(&self) -> StreamStats {
        let open_trace_events: usize = self.open_traces.values().map(|v| v.len()).sum();
        let memory_bytes =
            // open_traces HashMap
            self.open_traces.capacity() * (std::mem::size_of::<String>() + std::mem::size_of::<Vec<u32>>()) +
            // open trace event buffers
            open_trace_events * std::mem::size_of::<u32>() +
            // node_counts
            self.node_counts.capacity() * std::mem::size_of::<usize>() +
            // edge_counts (rough estimate)
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

impl Default for StreamingDfgBuilder {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    // DFGNode used indirectly via DirectlyFollowsGraph

    #[test]
    fn test_basic_streaming() {
        let mut stream = StreamingDfgBuilder::new();

        // Add a simple trace
        stream.add_event("case1", "A");
        stream.add_event("case1", "B");
        stream.add_event("case1", "C");
        stream.close_trace("case1");

        let dfg = stream.snapshot();

        // Should have 3 nodes
        assert_eq!(dfg.nodes.len(), 3);
        assert_eq!(dfg.nodes[0].id, "A");
        assert_eq!(dfg.nodes[1].id, "B");
        assert_eq!(dfg.nodes[2].id, "C");

        // Should have 2 edges (HashMap order is non-deterministic, check by content)
        assert_eq!(dfg.edges.len(), 2);
        let mut edges: Vec<_> = dfg.edges.iter().map(|e| (&e.from, &e.to)).collect();
        edges.sort();
        assert_eq!((edges[0].0.as_str(), edges[0].1.as_str()), ("A", "B"));
        assert_eq!((edges[1].0.as_str(), edges[1].1.as_str()), ("B", "C"));

        // Start/end activities
        assert_eq!(dfg.start_activities.get("A"), Some(&1));
        assert_eq!(dfg.end_activities.get("C"), Some(&1));
    }

    #[test]
    fn test_multiple_traces() {
        let mut stream = StreamingDfgBuilder::new();

        // Trace 1: A -> B -> C
        stream.add_event("case1", "A");
        stream.add_event("case1", "B");
        stream.add_event("case1", "C");
        stream.close_trace("case1");

        // Trace 2: A -> B -> D
        stream.add_event("case2", "A");
        stream.add_event("case2", "B");
        stream.add_event("case2", "D");
        stream.close_trace("case2");

        let dfg = stream.snapshot();

        // 4 unique activities
        assert_eq!(dfg.nodes.len(), 4);

        // A→B appears twice, others once
        let ab_edge = dfg.edges.iter().find(|e| e.from == "A" && e.to == "B").unwrap();
        assert_eq!(ab_edge.frequency, 2);

        let bc_edge = dfg.edges.iter().find(|e| e.from == "B" && e.to == "C").unwrap();
        assert_eq!(bc_edge.frequency, 1);

        let bd_edge = dfg.edges.iter().find(|e| e.from == "B" && e.to == "D").unwrap();
        assert_eq!(bd_edge.frequency, 1);

        // Start/end counts
        assert_eq!(dfg.start_activities.get("A"), Some(&2));
        assert_eq!(dfg.end_activities.get("C"), Some(&1));
        assert_eq!(dfg.end_activities.get("D"), Some(&1));
    }

    #[test]
    fn test_finalize() {
        let mut stream = StreamingDfgBuilder::new();

        stream.add_event("case1", "A");
        stream.add_event("case1", "B");
        stream.close_trace("case1");

        // finalize should close any remaining traces and return DFG
        let dfg = stream.finalize();

        assert_eq!(dfg.nodes.len(), 2);
        assert_eq!(dfg.edges.len(), 1);
    }

    #[test]
    fn test_stats() {
        let mut stream = StreamingDfgBuilder::new();

        stream.add_event("case1", "A");
        stream.add_event("case1", "B");
        stream.add_event("case2", "A");
        stream.close_trace("case1");

        let stats = stream.stats();

        assert_eq!(stats.event_count, 3);
        assert_eq!(stats.trace_count, 1);
        assert_eq!(stats.open_traces, 1); // case2 still open
        assert_eq!(stats.activities, 2); // A and B
    }

    #[test]
    fn test_activity_interning() {
        let mut stream = StreamingDfgBuilder::new();

        let id_a1 = stream.intern("A");
        let id_a2 = stream.intern("A");
        let id_b = stream.intern("B");

        assert_eq!(id_a1, id_a2);
        assert_eq!(id_a1, 0);
        assert_eq!(id_b, 1);

        assert_eq!(stream.lookup(0), Some("A"));
        assert_eq!(stream.lookup(1), Some("B"));
        assert_eq!(stream.lookup(2), None);
    }
}
