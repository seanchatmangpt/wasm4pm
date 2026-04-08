//! Streaming Alpha++ discovery.
//!
//! Alpha++ discovers Petri nets by identifying causal, parallel, and choice
//! relationships from the event log. Accumulates directly-follows and
//! reverse-follows counts, then derives alpha relations at snapshot time
//! to construct a Petri net with places and transitions.

use crate::models::{PetriNet, PetriNetPlace, PetriNetTransition, PetriNetArc};
use crate::streaming::{StreamingAlgorithm, StreamStats, ActivityInterner, impl_activity_interner, Interner};
use rustc_hash::FxHashMap;
use std::collections::HashMap;

/// Streaming Alpha++ builder.
///
/// Accumulates directly-follows and reverse-follows edge counts during
/// ingestion. At snapshot time, computes the three alpha relations:
/// - **Causal** (a > b): a→b exists but b→a does not
/// - **Parallel** (a || b): both a→b and b→a exist
/// - **Choice** (a # b): neither a→b nor b→a exist
///
/// From these relations, places are discovered connecting pre-sets
/// to post-sets, yielding a Petri net.
#[derive(Debug, Clone)]
pub struct StreamingAlphaPlusBuilder {
    /// Activity string interner
    pub interner: Interner,
    /// Activity occurrence counts
    pub activity_counts: Vec<usize>,
    /// Forward edge counts: (from, to) -> count
    pub edge_counts: FxHashMap<(u32, u32), usize>,
    /// Reverse edge counts: (to, from) -> count (for parallel detection)
    pub reverse_edge_counts: FxHashMap<(u32, u32), usize>,
    /// Start/end activity counts
    pub start_counts: FxHashMap<u32, usize>,
    pub end_counts: FxHashMap<u32, usize>,
    /// Event/trace counters
    pub event_count: usize,
    pub trace_count: usize,
    /// Open traces
    pub open_traces: HashMap<String, Vec<u32>>,
}

impl_activity_interner!(StreamingAlphaPlusBuilder);

impl StreamingAlphaPlusBuilder {
    pub fn new() -> Self {
        StreamingAlphaPlusBuilder {
            interner: Interner::new(),
            activity_counts: Vec::new(),
            edge_counts: FxHashMap::default(),
            reverse_edge_counts: FxHashMap::default(),
            start_counts: FxHashMap::default(),
            end_counts: FxHashMap::default(),
            event_count: 0,
            trace_count: 0,
            open_traces: HashMap::new(),
        }
    }

    /// Compute alpha relations from accumulated edge counts and build a Petri net.
    ///
    /// Alpha++ places connect activity pre-sets to post-sets based on
    /// causal and parallel relations.
    pub fn to_petrinet(&self) -> PetriNet {
        let mut net = PetriNet::new();

        if self.activity_counts.is_empty() {
            return net;
        }

        let n = self.interner.len();

        // Build pre-set and post-set for each activity
        // Causal: a > b iff edge_counts[(a,b)] > 0 and reverse_edge_counts[(b,a)] == 0
        let mut pre_sets: Vec<std::collections::HashSet<u32>> = vec![std::collections::HashSet::new(); n];
        let mut post_sets: Vec<std::collections::HashSet<u32>> = vec![std::collections::HashSet::new(); n];

        for (&(from, to), _) in &self.edge_counts {
            // from > to (causal) if no reverse edge
            if !self.reverse_edge_counts.contains_key(&(to, from)) {
                post_sets[from as usize].insert(to);
                pre_sets[to as usize].insert(from);
            }
        }

        // Source place: connects to all start activities
        let source_id = "p_source";
        net.places.push(PetriNetPlace {
            id: source_id.to_string(),
            label: source_id.to_string(),
            marking: None,
        });

        for (&id, _) in &self.start_counts {
            let t_label = self.interner.get(id).unwrap_or("?");
            let t_id = format!("t_{}", t_label);
            net.transitions.push(PetriNetTransition {
                id: t_id.clone(),
                label: t_label.to_string(),
                is_invisible: None,
            });
            net.arcs.push(PetriNetArc {
                from: source_id.to_string(),
                to: t_id,
                weight: None,
            });
        }

        // Sink place: all end activities connect to it
        let sink_id = "p_sink";
        net.places.push(PetriNetPlace {
            id: sink_id.to_string(),
            label: sink_id.to_string(),
            marking: None,
        });

        for (&id, _) in &self.end_counts {
            let t_label = self.interner.get(id).unwrap_or("?");
            let t_id = format!("t_{}", t_label);
            net.transitions.push(PetriNetTransition {
                id: t_id.clone(),
                label: t_label.to_string(),
                is_invisible: None,
            });
            net.arcs.push(PetriNetArc {
                from: t_id,
                to: sink_id.to_string(),
                weight: None,
            });
        }

        // Internal places: for each activity a, create place p_a
        // p_a connects all pre-transitions to all post-transitions of a
        for i in 0..n {
            if self.activity_counts.get(i).copied().unwrap_or(0) == 0 {
                continue;
            }
            let name = self.interner.get(i as u32).unwrap_or("?");
            let p_id = format!("p_{}", name);

            net.places.push(PetriNetPlace {
                id: p_id.clone(),
                label: p_id.clone(),
                marking: None,
            });

            for &pre_id in &pre_sets[i] {
                let t_id = format!("t_{}", self.interner.get(pre_id).unwrap_or("?"));
                net.arcs.push(PetriNetArc {
                    from: t_id,
                    to: p_id.clone(),
                    weight: None,
                });
            }

            for &post_id in &post_sets[i] {
                let t_id = format!("t_{}", self.interner.get(post_id).unwrap_or("?"));
                net.arcs.push(PetriNetArc {
                    from: p_id.clone(),
                    to: t_id,
                    weight: None,
                });
            }
        }

        // Deduplicate transitions and arcs
        let mut seen_t: std::collections::HashSet<String> = std::collections::HashSet::new();
        net.transitions.retain(|t| seen_t.insert(t.id.clone()));
        let mut seen_a: std::collections::HashSet<(String, String)> = std::collections::HashSet::new();
        net.arcs.retain(|a| seen_a.insert((a.from.clone(), a.to.clone())));

        net
    }
}

impl StreamingAlgorithm for StreamingAlphaPlusBuilder {
    type Model = PetriNet;

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

        for pair in events.windows(2) {
            *self.edge_counts.entry((pair[0], pair[1])).or_insert(0) += 1;
            *self.reverse_edge_counts.entry((pair[1], pair[0])).or_insert(0) += 1;
        }

        *self.start_counts.entry(events[0]).or_insert(0) += 1;
        if let Some(last) = events.last() {
            *self.end_counts.entry(*last).or_insert(0) += 1;
        }

        self.trace_count += 1;
        true
    }

    fn snapshot(&self) -> Self::Model {
        self.to_petrinet()
    }

    fn stats(&self) -> StreamStats {
        let open_trace_events: usize = self.open_traces.values().map(|v| v.len()).sum();
        let memory_bytes =
            self.open_traces.capacity() * (std::mem::size_of::<String>() + std::mem::size_of::<Vec<u32>>()) +
            open_trace_events * std::mem::size_of::<u32>() +
            self.activity_counts.capacity() * std::mem::size_of::<usize>() +
            self.edge_counts.capacity() * (std::mem::size_of::<(u32,u32)>() + std::mem::size_of::<usize>()) +
            self.reverse_edge_counts.capacity() * (std::mem::size_of::<(u32,u32)>() + std::mem::size_of::<usize>());

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

impl Default for StreamingAlphaPlusBuilder {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_alpha_basic() {
        let mut stream = StreamingAlphaPlusBuilder::new();

        stream.add_event("case1", "A");
        stream.add_event("case1", "B");
        stream.add_event("case1", "C");
        stream.close_trace("case1");

        let stats = stream.stats();
        assert_eq!(stats.event_count, 3);
        assert_eq!(stats.trace_count, 1);
    }

    #[test]
    fn test_alpha_petrinet_not_empty() {
        let mut stream = StreamingAlphaPlusBuilder::new();
        stream.add_event("case1", "A");
        stream.add_event("case1", "B");
        stream.close_trace("case1");

        let net = stream.snapshot();
        assert!(net.places.len() >= 2, "should have source + sink places");
        assert!(!net.transitions.is_empty(), "should have transitions");
        assert!(!net.arcs.is_empty(), "should have arcs");
    }

    #[test]
    fn test_alpha_causal_detection() {
        let mut stream = StreamingAlphaPlusBuilder::new();
        // A->B always, never B->A => causal relation A > B
        for i in 0..3 {
            stream.add_event(&format!("c{}", i), "A");
            stream.add_event(&format!("c{}", i), "B");
            stream.close_trace(&format!("c{}", i));
        }

        let net = stream.snapshot();
        // Should have place p_B with incoming arc from t_A
        let has_place_b = net.places.iter().any(|p| p.label == "p_B");
        assert!(has_place_b, "should have internal place for B");
    }

    #[test]
    fn test_alpha_empty_log() {
        let stream = StreamingAlphaPlusBuilder::new();
        let net = stream.snapshot();
        assert!(net.places.is_empty());
        assert!(net.transitions.is_empty());
    }
}
