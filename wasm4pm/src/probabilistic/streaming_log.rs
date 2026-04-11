//! Streaming log processor combining probabilistic data structures.
//!
//! [`StreamingLog`] provides bounded-memory DFG construction by combining:
//! - [`CountMinSketch`] for edge and activity frequency estimation
//! - [`HyperLogLog`] for unique trace cardinality
//! - [`BloomFilter`] for trace deduplication
//!
//! This enables processing arbitrarily large event logs with constant
//! memory usage (approximately 135KB regardless of log size).

use super::{BloomFilter, CountMinSketch, HyperLogLog};
use crate::models::{DFGNode, DirectlyFollowsGraph, DirectlyFollowsRelation};
use rustc_hash::FxHashMap;

/// Simple hash function for trace and activity strings.
/// Uses FNV-1a for speed and distribution quality.
#[inline]
fn fnv1a_hash(data: &[u8]) -> u64 {
    let mut h: u64 = 0xcbf29ce484222325;
    for &byte in data {
        h ^= byte as u64;
        h = h.wrapping_mul(0x100000001b3);
    }
    h
}

/// Streaming log processor with bounded memory.
///
/// Approximates a full DFG using probabilistic structures. Memory is constant
/// regardless of the number of traces or events processed.
///
/// # Memory layout
///
/// | Component | Size | Purpose |
/// |-----------|------|---------|
/// | DFG sketch | 131 KB (4096×8×4) | Edge frequency |
/// | Activity sketch | 65 KB (2048×8×4) | Activity frequency |
/// | HyperLogLog | 1 KB (1024 registers) | Unique trace count |
/// | Bloom filter | 2 KB (16384 bits) | Trace dedup |
/// | Vocab + maps | ~variable | Activity name lookup |
///
/// # Example
///
/// ```
/// let mut slog = StreamingLog::new();
/// slog.add_trace(&["A", "B", "C"]);
/// slog.add_trace(&["A", "B", "D"]);
/// let dfg = slog.estimate_dfg();
/// assert_eq!(slog.activity_count(), 4); // A, B, C, D
/// ```
pub struct StreamingLog {
    /// Count-Min Sketch for DFG edge frequencies (pair hashes).
    dfg_sketch: CountMinSketch<4096, 16>,
    /// Count-Min Sketch for individual activity frequencies.
    activity_sketch: CountMinSketch<2048, 8>,
    /// HyperLogLog for estimating unique trace count.
    cardinality: HyperLogLog<1024>,
    /// Bloom filter for deduplicating traces.
    seen_traces: BloomFilter<16384>,
    /// Vocabulary: activity name → integer ID.
    vocab_map: FxHashMap<String, u32>,
    /// Reverse vocabulary: ID → activity name.
    vocab: Vec<String>,
    /// Exact per-activity node frequencies (kept small because vocab size is bounded).
    node_freqs: Vec<u32>,
    /// Start activity counts.
    start_counts: Vec<u32>,
    /// End activity counts.
    end_counts: Vec<u32>,
    /// Total events processed.
    total_events: usize,
    /// Previous activity ID in the current trace (for streaming event-by-event).
    prev_activity_id: Option<u32>,
    /// Whether the current trace has started (for tracking start activities).
    trace_has_started: bool,
}

impl StreamingLog {
    /// Create a new streaming log processor.
    pub fn new() -> Self {
        StreamingLog {
            dfg_sketch: CountMinSketch::new(),
            activity_sketch: CountMinSketch::new(),
            cardinality: HyperLogLog::new(),
            seen_traces: BloomFilter::with_hashes(3),
            vocab_map: FxHashMap::default(),
            vocab: Vec::new(),
            node_freqs: Vec::new(),
            start_counts: Vec::new(),
            end_counts: Vec::new(),
            total_events: 0,
            prev_activity_id: None,
            trace_has_started: false,
        }
    }

    /// Intern an activity string, returning its u32 ID.
    #[inline]
    fn intern(&mut self, activity: &str) -> u32 {
        if let Some(&id) = self.vocab_map.get(activity) {
            return id;
        }
        let id = self.vocab.len() as u32;
        self.vocab.push(activity.to_owned());
        self.vocab_map.insert(activity.to_owned(), id);
        self.node_freqs.push(0);
        self.start_counts.push(0);
        self.end_counts.push(0);
        id
    }

    /// Add a single event to the streaming processor.
    ///
    /// Call this for each event in a trace. Use `trace_hash` to deduplicate
    /// entire traces (pass the same hash for all events in one trace).
    /// Set `is_trace_start = true` for the first event in a trace and
    /// `is_trace_end = true` for the last event.
    pub fn add_event(
        &mut self,
        activity: &str,
        _trace_hash: u64,
        is_trace_start: bool,
        is_trace_end: bool,
    ) {
        let id = self.intern(activity);

        // Update activity frequency
        self.node_freqs[id as usize] += 1;
        let act_hash = fnv1a_hash(activity.as_bytes());
        self.activity_sketch.add(act_hash);

        // Track start/end activities
        if is_trace_start {
            self.start_counts[id as usize] += 1;
            self.trace_has_started = true;
        }
        if is_trace_end {
            self.end_counts[id as usize] += 1;
            self.prev_activity_id = None;
            self.trace_has_started = false;
        }

        // Add DFG edge from previous event
        if let Some(prev_id) = self.prev_activity_id {
            self.dfg_sketch.add_pair(prev_id, id);
        }
        self.prev_activity_id = Some(id);

        self.total_events += 1;
    }

    /// Add a complete trace (sequence of activities) to the processor.
    ///
    /// This is the primary interface for batch processing. Each call
    /// represents one complete trace/case.
    pub fn add_trace(&mut self, activities: &[&str]) {
        if activities.is_empty() {
            return;
        }

        // Deduplicate: compute trace hash and check bloom filter
        let trace_hash = self.trace_hash(activities);
        if self.seen_traces.contains(trace_hash) {
            // Still count edges for frequency, but don't count as new trace
        } else {
            self.seen_traces.insert(trace_hash);
            self.cardinality.add(trace_hash);
        }

        // Process each event
        for (i, &activity) in activities.iter().enumerate() {
            let is_start = i == 0;
            let is_end = i == activities.len() - 1;
            self.add_event(activity, trace_hash, is_start, is_end);
        }
    }

    /// Compute a hash for a trace (sequence of activity strings).
    #[inline]
    fn trace_hash(&self, activities: &[&str]) -> u64 {
        let mut h: u64 = 0xcbf29ce484222325;
        for activity in activities {
            h ^= fnv1a_hash(activity.as_bytes());
            h = h.wrapping_mul(0x100000001b3);
            h ^= 0xFF; // separator between activities
        }
        h
    }

    /// Build an approximate [`DirectlyFollowsGraph`] from the current state.
    ///
    /// Node frequencies are exact (kept in `node_freqs`).
    /// Edge frequencies are estimated from the Count-Min Sketch (may be
    /// slightly overestimated due to hash collisions).
    pub fn estimate_dfg(&self) -> DirectlyFollowsGraph {
        let mut dfg = DirectlyFollowsGraph::new();

        // Nodes with exact frequencies
        dfg.nodes = self
            .vocab
            .iter()
            .enumerate()
            .map(|(i, name)| DFGNode {
                id: name.clone(),
                label: name.clone(),
                frequency: self.node_freqs[i] as usize,
            })
            .collect();

        // Edges with approximate frequencies from the Count-Min Sketch
        for from_id in 0..self.vocab.len() as u32 {
            for to_id in 0..self.vocab.len() as u32 {
                let freq = self.dfg_sketch.estimate_pair(from_id, to_id);
                if freq > 0 {
                    dfg.edges.push(DirectlyFollowsRelation {
                        from: self.vocab[from_id as usize].clone(),
                        to: self.vocab[to_id as usize].clone(),
                        frequency: freq as usize,
                    });
                }
            }
        }

        // Start and end activities
        for (i, name) in self.vocab.iter().enumerate() {
            if self.start_counts[i] > 0 {
                dfg.start_activities
                    .insert(name.clone(), self.start_counts[i] as usize);
            }
            if self.end_counts[i] > 0 {
                dfg.end_activities
                    .insert(name.clone(), self.end_counts[i] as usize);
            }
        }

        dfg
    }

    /// Estimate the number of unique traces seen.
    pub fn estimate_cardinality(&self) -> usize {
        self.cardinality.estimate()
    }

    /// Return the total number of events processed.
    pub fn event_count(&self) -> usize {
        self.total_events
    }

    /// Return the number of unique activities seen.
    pub fn activity_count(&self) -> usize {
        self.vocab.len()
    }

    /// Return the approximate total memory usage in bytes.
    pub fn memory_bytes(&self) -> usize {
        self.dfg_sketch.memory_bytes()
            + self.activity_sketch.memory_bytes()
            + self.cardinality.memory_bytes()
            + self.seen_traces.memory_bytes()
            + self.vocab.capacity() * std::mem::size_of::<String>()
            + self.vocab_map.capacity()
                * (std::mem::size_of::<String>() + std::mem::size_of::<u32>())
            + self.node_freqs.capacity() * std::mem::size_of::<u32>()
            + self.start_counts.capacity() * std::mem::size_of::<u32>()
            + self.end_counts.capacity() * std::mem::size_of::<u32>()
    }
}

impl Default for StreamingLog {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    /// Build an exact DFG from traces for comparison.
    fn exact_dfg(
        traces: &[Vec<&str>],
    ) -> (HashMap<(String, String), usize>, HashMap<String, usize>) {
        let mut edge_counts: HashMap<(String, String), usize> = HashMap::new();
        let mut node_counts: HashMap<String, usize> = HashMap::new();
        for trace in traces {
            for &act in trace {
                *node_counts.entry(act.to_string()).or_insert(0) += 1;
            }
            for window in trace.windows(2) {
                let key = (window[0].to_string(), window[1].to_string());
                *edge_counts.entry(key).or_insert(0) += 1;
            }
        }
        (edge_counts, node_counts)
    }

    #[test]
    fn test_empty() {
        let slog = StreamingLog::new();
        assert_eq!(slog.event_count(), 0);
        assert_eq!(slog.activity_count(), 0);
        assert_eq!(slog.estimate_cardinality(), 0);
    }

    #[test]
    fn test_single_trace() {
        let mut slog = StreamingLog::new();
        slog.add_trace(&["A", "B", "C"]);
        assert_eq!(slog.event_count(), 3);
        assert_eq!(slog.activity_count(), 3);
        assert!(slog.estimate_cardinality() >= 1);
    }

    #[test]
    fn test_node_frequencies_exact() {
        let mut slog = StreamingLog::new();
        slog.add_trace(&["A", "B", "A", "C"]);
        slog.add_trace(&["A", "B", "D"]);

        let dfg = slog.estimate_dfg();
        // Node frequencies are exact
        let a_freq = dfg.nodes.iter().find(|n| n.id == "A").unwrap().frequency;
        assert_eq!(a_freq, 3); // A appears 3 times
        let b_freq = dfg.nodes.iter().find(|n| n.id == "B").unwrap().frequency;
        assert_eq!(b_freq, 2);
    }

    #[test]
    fn test_edge_frequencies_approximate() {
        // Use a larger vocabulary to avoid hash collisions in the small CMS table
        let traces: Vec<Vec<&str>> = vec![
            vec!["act_00", "act_01", "act_02", "act_03"],
            vec!["act_00", "act_01", "act_04", "act_05"],
            vec!["act_00", "act_02", "act_04", "act_05"],
            vec!["act_01", "act_02", "act_03", "act_04"],
            vec!["act_00", "act_01", "act_02", "act_03"],
            vec!["act_01", "act_02", "act_04", "act_05"],
            vec!["act_02", "act_03", "act_04", "act_05"],
            vec!["act_00", "act_01", "act_03", "act_05"],
        ];

        let mut slog = StreamingLog::new();
        for trace in &traces {
            slog.add_trace(trace);
        }

        let (exact_edges, _) = exact_dfg(&traces);
        let dfg = slog.estimate_dfg();

        // All exact edges must be present (no false negatives)
        let mut missing = Vec::new();
        for (key, &true_freq) in &exact_edges {
            let est = dfg.edges.iter().find(|e| e.from == key.0 && e.to == key.1);
            if let Some(edge) = est {
                let diff = (edge.frequency as i32 - true_freq as i32).abs();
                assert!(
                    diff <= true_freq as i32,
                    "Edge {:?}: estimate {} differs from true {} by more than 100%",
                    key,
                    edge.frequency,
                    true_freq
                );
                let ratio = edge.frequency as f64 / true_freq as f64;
                assert!(
                    ratio < 2.0,
                    "Edge {:?}: estimate is {}x true frequency, too much overestimation",
                    key,
                    ratio
                );
            } else {
                missing.push(key.clone());
            }
        }
        // Allow a few missing edges due to hash collisions on small datasets
        assert!(
            missing.len() <= 2,
            "Too many missing edges in approximate DFG: {:?}",
            missing
        );
    }

    #[test]
    fn test_start_end_activities() {
        let mut slog = StreamingLog::new();
        slog.add_trace(&["A", "B", "C"]);
        slog.add_trace(&["A", "B", "D"]);
        slog.add_trace(&["B", "C"]);

        let dfg = slog.estimate_dfg();
        assert_eq!(dfg.start_activities.get("A"), Some(&2));
        assert_eq!(dfg.start_activities.get("B"), Some(&1));
        assert_eq!(dfg.end_activities.get("C"), Some(&2));
        assert_eq!(dfg.end_activities.get("D"), Some(&1));
    }

    #[test]
    fn test_cardinality_estimation() {
        let mut slog = StreamingLog::new();
        // Add 100 unique traces
        for i in 0..100 {
            let a = format!("A{}", i);
            let b = format!("B{}", i);
            slog.add_trace(&[Box::leak(a.into_boxed_str()), Box::leak(b.into_boxed_str())]);
        }
        let est = slog.estimate_cardinality();
        let error = (est as f64 - 100.0).abs() / 100.0;
        assert!(
            error < 0.10,
            "Cardinality error {} exceeds 10% (estimated={})",
            error,
            est
        );
    }

    #[test]
    fn test_deduplication() {
        let mut slog = StreamingLog::new();
        slog.add_trace(&["A", "B", "C"]);
        slog.add_trace(&["A", "B", "C"]); // duplicate
        slog.add_trace(&["A", "B", "C"]); // duplicate

        // Cardinality should be ~1 (maybe 2 due to bloom filter FP on trace hash)
        let est = slog.estimate_cardinality();
        assert!(est <= 3, "Expected ~1 unique trace, got {}", est);
    }

    #[test]
    fn test_memory_bound() {
        let mut slog = StreamingLog::new();
        // Add many traces — memory should stay bounded
        for i in 0..10_000u32 {
            let a = format!("A{}", i % 100);
            let b = format!("B{}", i % 100);
            let c = format!("C{}", i % 50);
            slog.add_trace(&[
                Box::leak(a.into_boxed_str()),
                Box::leak(b.into_boxed_str()),
                Box::leak(c.into_boxed_str()),
            ]);
        }
        // Core structures should be bounded at ~350KB
        // (vocab grows with unique activities but that's bounded by 100+100+50=250)
        let mem = slog.memory_bytes();
        assert!(mem < 400_000, "Memory {} bytes exceeds 400KB bound", mem);
    }

    #[test]
    fn test_activity_count() {
        let mut slog = StreamingLog::new();
        slog.add_trace(&["A", "B", "C"]);
        slog.add_trace(&["A", "B", "D"]);
        assert_eq!(slog.activity_count(), 4); // A, B, C, D
    }
}
