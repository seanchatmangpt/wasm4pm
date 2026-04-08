//! Streaming DECLARE discovery.
//!
//! DECLARE is a declarative process model that specifies constraints on
//! activity orderings. This streaming implementation maintains response
//! and precedence counts incrementally, then emits DECLARE constraints
//! at snapshot time based on configurable thresholds.

use crate::models::DeclareConstraint;
use crate::streaming::{StreamingAlgorithm, StreamStats, ActivityInterner, impl_activity_interner, Interner};
use rustc_hash::FxHashMap;
use std::collections::{HashMap, HashSet};

/// Default confidence threshold for emitting DECLARE constraints.
const DEFAULT_THRESHOLD: f64 = 0.6;

/// Streaming DECLARE builder.
///
/// Accumulates response and precedence counts during ingestion:
/// - **Response[a,b]**: fraction of traces where a appears and b appears after a
/// - **Precedence[a,b]**: fraction of traces where b appears and a appears before b
/// - **Succession[a,b]**: fraction of traces where a directly precedes b
/// - **Co-existence[a,b]**: fraction of traces where both a and b appear
///
/// At snapshot time, emits constraints where the metric exceeds the threshold.
#[derive(Debug, Clone)]
pub struct StreamingDeclareBuilder {
    /// Activity string interner
    pub interner: Interner,
    /// Activity occurrence counts
    pub activity_counts: Vec<usize>,
    /// Trace counters
    pub event_count: usize,
    pub trace_count: usize,
    /// Open traces
    pub open_traces: HashMap<String, Vec<u32>>,
    /// Response[a,b]: traces where a appears and b appears after a
    pub response_counts: FxHashMap<(u32, u32), usize>,
    /// Precedence[a,b]: traces where both a and b appear and a is before b
    pub precedence_counts: FxHashMap<(u32, u32), usize>,
    /// Co-existence[a,b]: traces where both a and b appear
    pub coexistence_counts: FxHashMap<(u32, u32), usize>,
    /// Per-trace activity sets for co-existence computation
    trace_activity_sets: Vec<HashSet<u32>>,
    /// Confidence threshold for constraint emission
    threshold: f64,
}

impl_activity_interner!(StreamingDeclareBuilder);

impl StreamingDeclareBuilder {
    pub fn new() -> Self {
        StreamingDeclareBuilder {
            interner: Interner::new(),
            activity_counts: Vec::new(),
            event_count: 0,
            trace_count: 0,
            open_traces: HashMap::new(),
            response_counts: FxHashMap::default(),
            precedence_counts: FxHashMap::default(),
            coexistence_counts: FxHashMap::default(),
            trace_activity_sets: Vec::new(),
            threshold: DEFAULT_THRESHOLD,
        }
    }

    /// Set the confidence threshold for constraint emission (default: 0.6).
    pub fn with_threshold(mut self, threshold: f64) -> Self {
        self.threshold = threshold.clamp(0.0, 1.0);
        self
    }

    /// Emit DECLARE constraints based on accumulated statistics.
    ///
    /// Returns constraints where the metric exceeds the threshold:
    /// - Response(a,b) if response_counts[a,b] / traces_where_a_appears > threshold
    /// - Precedence(a,b) if precedence_counts[a,b] / traces_where_both_appear > threshold
    /// - Co-existence(a,b) if coexistence_counts[a,b] / total_traces > threshold
    pub fn to_declare(&self) -> crate::models::DeclareModel {
        let mut model = crate::models::DeclareModel::new();

        if self.trace_count == 0 {
            return model;
        }

        // Count how many traces contain each activity
        let mut activity_trace_counts: Vec<usize> = vec![0; self.interner.len()];
        for trace_set in &self.trace_activity_sets {
            for &id in trace_set {
                if (id as usize) < activity_trace_counts.len() {
                    activity_trace_counts[id as usize] += 1;
                }
            }
        }

        // Emit Response constraints: response[a,b] = traces where a then b / traces with a
        for (&(a, b), &count) in &self.response_counts {
            let a_traces = activity_trace_counts.get(a as usize).copied().unwrap_or(0);
            if a_traces > 0 {
                let confidence = count as f64 / a_traces as f64;
                if confidence >= self.threshold {
                    let a_name = self.interner.get(a).unwrap_or("?").to_string();
                    let b_name = self.interner.get(b).unwrap_or("?").to_string();
                    model.constraints.push(DeclareConstraint {
                        template: format!("response({}, {})", a_name, b_name),
                        activities: vec![a_name, b_name],
                        support: confidence,
                        confidence,
                    });
                }
            }
        }

        // Emit Precedence constraints
        for (&(a, b), &count) in &self.precedence_counts {
            let coexist = self.coexistence_counts.get(&(a, b)).copied().unwrap_or(0);
            if coexist > 0 {
                let confidence = count as f64 / coexist as f64;
                if confidence >= self.threshold {
                    let a_name = self.interner.get(a).unwrap_or("?").to_string();
                    let b_name = self.interner.get(b).unwrap_or("?").to_string();
                    model.constraints.push(DeclareConstraint {
                        template: format!("precedence({}, {})", a_name, b_name),
                        activities: vec![a_name, b_name],
                        support: confidence,
                        confidence,
                    });
                }
            }
        }

        // Emit Co-existence constraints
        for (&(a, b), &count) in &self.coexistence_counts {
            let confidence = count as f64 / self.trace_count as f64;
            if confidence >= self.threshold {
                let a_name = self.interner.get(a).unwrap_or("?").to_string();
                let b_name = self.interner.get(b).unwrap_or("?").to_string();
                model.constraints.push(DeclareConstraint {
                    template: format!("coexistence({}, {})", a_name, b_name),
                    activities: vec![a_name, b_name],
                    support: confidence,
                    confidence,
                });
            }
        }

        model
    }
}

impl StreamingAlgorithm for StreamingDeclareBuilder {
    type Model = crate::models::DeclareModel;

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
        let Some(events) = self.open_traces.remove(case_id) else { return false; };
        if events.is_empty() { return true; }

        for &id in &events {
            self.activity_counts[id as usize] += 1;
        }

        // Build activity set for this trace
        let activity_set: HashSet<u32> = events.iter().copied().collect();

        // Update constraint counters for each ordered pair
        for i in 0..events.len() {
            for j in (i + 1)..events.len() {
                let a = events[i];
                let b = events[j];
                // Response[a,b]: a appears before b in this trace
                *self.response_counts.entry((a, b)).or_insert(0) += 1;
                // Precedence[a,b]: a before b (subset of response)
                *self.precedence_counts.entry((a, b)).or_insert(0) += 1;
                // Co-existence[a,b] and Co-existence[b,a]
                *self.coexistence_counts.entry((a, b)).or_insert(0) += 1;
            }
        }

        self.trace_activity_sets.push(activity_set);
        self.trace_count += 1;
        true
    }

    fn snapshot(&self) -> Self::Model {
        self.to_declare()
    }

    fn stats(&self) -> StreamStats {
        let open_trace_events: usize = self.open_traces.values().map(|v| v.len()).sum();
        let memory_bytes =
            self.open_traces.capacity() * (std::mem::size_of::<String>() + std::mem::size_of::<Vec<u32>>()) +
            open_trace_events * std::mem::size_of::<u32>() +
            self.activity_counts.capacity() * std::mem::size_of::<usize>() +
            self.response_counts.capacity() * (std::mem::size_of::<(u32,u32)>() + std::mem::size_of::<usize>()) +
            self.precedence_counts.capacity() * (std::mem::size_of::<(u32,u32)>() + std::mem::size_of::<usize>()) +
            self.coexistence_counts.capacity() * (std::mem::size_of::<(u32,u32)>() + std::mem::size_of::<usize>()) +
            self.trace_activity_sets.capacity() * std::mem::size_of::<HashSet<u32>>();

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

impl Default for StreamingDeclareBuilder {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_declare_basic() {
        let mut stream = StreamingDeclareBuilder::new();

        stream.add_event("case1", "A");
        stream.add_event("case1", "B");
        stream.add_event("case1", "C");
        stream.close_trace("case1");

        let stats = stream.stats();
        assert_eq!(stats.event_count, 3);
        assert_eq!(stats.trace_count, 1);
    }

    #[test]
    fn test_declare_emits_constraints() {
        let mut stream = StreamingDeclareBuilder::new().with_threshold(0.5);

        // A always before B
        for i in 0..5 {
            stream.add_event(&format!("c{}", i), "A");
            stream.add_event(&format!("c{}", i), "B");
            stream.close_trace(&format!("c{}", i));
        }

        let model = stream.snapshot();
        assert!(!model.constraints.is_empty());

        // Should have at least a response(A, B) constraint
        let has_response = model.constraints.iter().any(|c| c.template.starts_with("response"));
        assert!(has_response, "Should emit response constraint for A always before B");
    }

    #[test]
    fn test_declare_empty() {
        let stream = StreamingDeclareBuilder::new();
        let model = stream.snapshot();
        assert!(model.constraints.is_empty());
    }
}
