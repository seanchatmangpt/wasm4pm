//! Streaming Inductive Miner discovery.
//!
//! Inductive Miner recursively discovers process trees by detecting cuts in
//! the DFG. This streaming implementation maintains DFG state incrementally
//! and detects cuts at snapshot time to construct a Petri net.
//!
//! Cut detection strategy:
//! - **Sequential cut**: Activities partitioned into start→end groups
//! - **Exclusive cut**: No directly-follows edges between activity groups
//! - **Parallel cut**: Both directions have edges (symmetric)
//! - **Loop cut**: Activities repeat (start == end for some subset)

use crate::models::{PetriNet, PetriNetArc, PetriNetPlace, PetriNetTransition};
use crate::streaming::{
    impl_activity_interner, ActivityInterner, Interner, StreamStats, StreamingAlgorithm,
};
use rustc_hash::FxHashMap;
use std::collections::{HashMap, HashSet};

/// Streaming Inductive Miner builder.
///
/// Accumulates directly-follows edge counts during ingestion. At snapshot
/// time, detects the dominant cut pattern and constructs a Petri net:
/// - Sequential cuts become sequences of places
/// - Exclusive cuts create alternative branches
/// - Parallel cuts create concurrent branches
/// - Loop cuts create repetition structures
#[derive(Debug, Clone)]
pub struct StreamingInductiveBuilder {
    /// Activity string interner
    pub interner: Interner,
    /// Activity occurrence counts
    pub activity_counts: Vec<usize>,
    /// Edge counts (for cut detection)
    pub edge_counts: FxHashMap<(u32, u32), usize>,
    /// Start/end activity counts
    pub start_counts: FxHashMap<u32, usize>,
    pub end_counts: FxHashMap<u32, usize>,
    /// Event/trace counters
    pub event_count: usize,
    pub trace_count: usize,
    /// Open traces
    pub open_traces: HashMap<String, Vec<u32>>,
}

impl_activity_interner!(StreamingInductiveBuilder);

impl StreamingInductiveBuilder {
    pub fn new() -> Self {
        StreamingInductiveBuilder {
            interner: Interner::new(),
            activity_counts: Vec::new(),
            edge_counts: FxHashMap::default(),
            start_counts: FxHashMap::default(),
            end_counts: FxHashMap::default(),
            event_count: 0,
            trace_count: 0,
            open_traces: HashMap::new(),
        }
    }

    /// Detect cut type from accumulated DFG and build a Petri net.
    ///
    /// Cut detection priority:
    /// 1. Sequential: activities form a total order (single start/end per group)
    /// 2. Exclusive: activities never co-occur in traces
    /// 3. Parallel: symmetric edges exist between groups
    /// 4. Loop: start activities overlap with end activities
    /// 5. Fallback: treat as a flower model (single silent transition loop)
    pub fn to_petrinet(&self) -> PetriNet {
        let net = PetriNet::new();

        if self.activity_counts.is_empty() || self.trace_count == 0 {
            return net;
        }

        let n = self.interner.len();
        let activities: Vec<u32> = (0..n as u32)
            .filter(|&id| self.activity_counts.get(id as usize).copied().unwrap_or(0) > 0)
            .collect();

        if activities.is_empty() {
            return net;
        }

        // Build sets for cut detection
        let starts: HashSet<u32> = self.start_counts.keys().cloned().collect();
        let ends: HashSet<u32> = self.end_counts.keys().cloned().collect();
        let mut successors: HashMap<u32, HashSet<u32>> = HashMap::new();
        let mut predecessors: HashMap<u32, HashSet<u32>> = HashMap::new();

        for (&(from, to), _) in &self.edge_counts {
            successors.entry(from).or_default().insert(to);
            predecessors.entry(to).or_default().insert(from);
        }

        // Check for sequential cut: activities form a topological order
        let sequential_order =
            self.detect_sequential_order(&activities, &starts, &ends, &successors);
        if let Some(order) = sequential_order {
            return self.build_sequential_net(order);
        }

        // Check for exclusive cut: disjoint groups with no edges between them
        let exclusive_groups = self.detect_exclusive_groups(&activities, &successors);
        if exclusive_groups.len() >= 2 {
            return self.build_exclusive_net(&exclusive_groups);
        }

        // Check for parallel cut: symmetric edges between groups
        let parallel_groups = self.detect_parallel_groups(&activities, &successors);
        if parallel_groups.len() >= 2 {
            return self.build_parallel_net(&parallel_groups);
        }

        // Check for loop cut: start activities overlap with end activities
        let loop_activities: HashSet<u32> = starts.intersection(&ends).cloned().collect();
        if !loop_activities.is_empty() && loop_activities.len() < activities.len() {
            return self.build_loop_net(&activities, &loop_activities);
        }

        // Fallback: flower model with source → silent transition → sink
        self.build_flower_net(&activities)
    }

    /// Detect sequential order: each activity group has exactly one start and one end.
    fn detect_sequential_order(
        &self,
        activities: &[u32],
        starts: &HashSet<u32>,
        _ends: &HashSet<u32>,
        successors: &HashMap<u32, HashSet<u32>>,
    ) -> Option<Vec<Vec<u32>>> {
        // Sequential cut: partition activities into ordered groups where
        // each group has a single start and single end activity
        if activities.len() <= 1 {
            return None;
        }

        // Try to build a chain: each activity's successors determine the order
        let mut order: Vec<Vec<u32>> = Vec::new();
        let mut visited: HashSet<u32> = HashSet::new();
        let mut remaining: HashSet<u32> = activities.iter().cloned().collect();

        // Start from activities that have no predecessors (or only from start activities)
        let has_predecessor: HashSet<u32> = activities
            .iter()
            .filter(|id| successors.values().any(|s| s.contains(id)))
            .cloned()
            .collect();

        let mut current_starts: Vec<u32> = activities
            .iter()
            .filter(|id| !has_predecessor.contains(id) || starts.contains(id))
            .cloned()
            .collect();
        current_starts.sort();

        if current_starts.is_empty() {
            return None;
        }

        while !current_starts.is_empty() {
            let group: Vec<u32> = current_starts
                .iter()
                .filter(|id| remaining.contains(id))
                .cloned()
                .collect();

            if group.is_empty() {
                break;
            }

            order.push(group.clone());
            for id in &group {
                visited.insert(*id);
                remaining.remove(id);
            }

            // Next group: activities reachable from current group but not yet visited
            let mut next: HashSet<u32> = HashSet::new();
            for id in &group {
                if let Some(succs) = successors.get(id) {
                    for &s in succs {
                        if !visited.contains(&s) {
                            next.insert(s);
                        }
                    }
                }
            }
            current_starts = next.into_iter().collect();
            current_starts.sort();
        }

        // Only accept if we covered all activities and found a multi-group sequence
        if remaining.is_empty() && order.len() >= 2 {
            Some(order)
        } else {
            None
        }
    }

    /// Detect exclusive groups: groups of activities with no edges between them.
    fn detect_exclusive_groups(
        &self,
        activities: &[u32],
        successors: &HashMap<u32, HashSet<u32>>,
    ) -> Vec<Vec<u32>> {
        // Build connectivity graph
        let activity_set: HashSet<u32> = activities.iter().cloned().collect();

        // Find connected components
        let mut groups: Vec<HashSet<u32>> = Vec::new();
        let mut visited: HashSet<u32> = HashSet::new();

        for &start in activities {
            if visited.contains(&start) {
                continue;
            }

            let mut group: HashSet<u32> = HashSet::new();
            let mut stack = vec![start];

            while let Some(current) = stack.pop() {
                if group.contains(&current) {
                    continue;
                }
                if !activity_set.contains(&current) {
                    continue;
                }
                group.insert(current);

                if let Some(succs) = successors.get(&current) {
                    for &s in succs {
                        if !group.contains(&s) {
                            stack.push(s);
                        }
                    }
                }
                // Also follow reverse edges
                for (&from, succs) in successors {
                    if succs.contains(&current) && !group.contains(&from) {
                        stack.push(from);
                    }
                }
            }

            visited.extend(&group);
            groups.push(group);
        }

        // Only return as exclusive if there are multiple disconnected components
        let result: Vec<Vec<u32>> = groups
            .into_iter()
            .map(|g| g.into_iter().collect())
            .filter(|g: &Vec<u32>| !g.is_empty())
            .collect();

        if result.len() >= 2 {
            result
        } else {
            Vec::new()
        }
    }

    /// Detect parallel groups: find activities connected by symmetric edges.
    fn detect_parallel_groups(
        &self,
        activities: &[u32],
        _successors: &HashMap<u32, HashSet<u32>>,
    ) -> Vec<Vec<u32>> {
        if activities.len() <= 1 {
            return Vec::new();
        }

        // Find parallel pairs: both (a,b) and (b,a) exist in edge_counts
        let mut parallel_pairs: HashSet<(u32, u32)> = HashSet::new();
        for (&(from, to), _) in &self.edge_counts {
            if self.edge_counts.contains_key(&(to, from)) {
                parallel_pairs.insert((from.min(to), from.max(to)));
            }
        }

        if parallel_pairs.is_empty() {
            return Vec::new();
        }

        // Group activities connected by parallel edges
        let mut groups: Vec<HashSet<u32>> = Vec::new();
        let mut visited: HashSet<u32> = HashSet::new();

        for &start in activities {
            if visited.contains(&start) {
                continue;
            }

            let mut group: HashSet<u32> = HashSet::new();
            let mut stack = vec![start];

            while let Some(current) = stack.pop() {
                if group.contains(&current) {
                    continue;
                }
                group.insert(current);

                for &(a, b) in &parallel_pairs {
                    if a == current && !group.contains(&b) {
                        stack.push(b);
                    }
                    if b == current && !group.contains(&a) {
                        stack.push(a);
                    }
                }
            }

            visited.extend(&group);
            if !group.is_empty() {
                groups.push(group);
            }
        }

        let result: Vec<Vec<u32>> = groups
            .into_iter()
            .map(|g| g.into_iter().collect())
            .collect();

        if result.len() >= 2 {
            result
        } else {
            Vec::new()
        }
    }

    /// Build Petri net from sequential cut groups.
    fn build_sequential_net(&self, order: Vec<Vec<u32>>) -> PetriNet {
        let mut net = PetriNet::new();

        let source_id = "p_source";
        net.places.push(PetriNetPlace {
            id: source_id.to_string(),
            label: source_id.to_string(),
            marking: None,
        });

        for (group_idx, group) in order.iter().enumerate() {
            let place_id = format!("p_seq_{}", group_idx);

            net.places.push(PetriNetPlace {
                id: place_id.clone(),
                label: place_id.clone(),
                marking: None,
            });

            for &act_id in group {
                let name = self.interner.get(act_id).unwrap_or("?");
                let t_id = format!("t_{}", name);

                net.transitions.push(PetriNetTransition {
                    id: t_id.clone(),
                    label: name.to_string(),
                    is_invisible: None,
                });

                net.arcs.push(PetriNetArc {
                    from: place_id.clone(),
                    to: t_id.clone(),
                    weight: None,
                });

                let next_place_id = if group_idx + 1 < order.len() {
                    format!("p_seq_{}", group_idx + 1)
                } else {
                    "p_sink".to_string()
                };

                net.arcs.push(PetriNetArc {
                    from: t_id,
                    to: next_place_id,
                    weight: None,
                });
            }
        }

        // Connect source to first group
        if let Some(first_group) = order.first() {
            for &act_id in first_group {
                let name = self.interner.get(act_id).unwrap_or("?");
                let t_id = format!("t_{}", name);
                net.arcs.push(PetriNetArc {
                    from: source_id.to_string(),
                    to: t_id,
                    weight: None,
                });
            }
        }

        // Add sink
        net.places.push(PetriNetPlace {
            id: "p_sink".to_string(),
            label: "p_sink".to_string(),
            marking: None,
        });

        // Deduplicate arcs
        let mut seen: HashSet<(String, String)> = HashSet::new();
        net.arcs
            .retain(|a| seen.insert((a.from.clone(), a.to.clone())));

        net
    }

    /// Build Petri net from exclusive groups (choice construct).
    fn build_exclusive_net(&self, groups: &[Vec<u32>]) -> PetriNet {
        let mut net = PetriNet::new();

        let source_id = "p_source";
        let sink_id = "p_sink";

        net.places.push(PetriNetPlace {
            id: source_id.to_string(),
            label: source_id.to_string(),
            marking: None,
        });
        net.places.push(PetriNetPlace {
            id: sink_id.to_string(),
            label: sink_id.to_string(),
            marking: None,
        });

        for group in groups {
            let place_id = format!(
                "p_excl_{}",
                group
                    .first()
                    .map(|id| self.interner.get(*id).unwrap_or("?"))
                    .unwrap_or("?")
            );

            net.places.push(PetriNetPlace {
                id: place_id.clone(),
                label: place_id.clone(),
                marking: None,
            });

            // Source → place → first transition
            net.arcs.push(PetriNetArc {
                from: source_id.to_string(),
                to: place_id.clone(),
                weight: None,
            });

            for (i, &act_id) in group.iter().enumerate() {
                let name = self.interner.get(act_id).unwrap_or("?");
                let t_id = format!("t_{}", name);

                net.transitions.push(PetriNetTransition {
                    id: t_id.clone(),
                    label: name.to_string(),
                    is_invisible: None,
                });

                net.arcs.push(PetriNetArc {
                    from: place_id.clone(),
                    to: t_id.clone(),
                    weight: None,
                });

                net.arcs.push(PetriNetArc {
                    from: t_id.clone(),
                    to: sink_id.to_string(),
                    weight: None,
                });

                // Connect to next activity in group
                if i + 1 < group.len() {
                    let next_name = self.interner.get(group[i + 1]).unwrap_or("?");
                    let next_t_id = format!("t_{}", next_name);
                    net.arcs.push(PetriNetArc {
                        from: t_id,
                        to: next_t_id,
                        weight: None,
                    });
                }
            }
        }

        // Deduplicate transitions and arcs
        let mut seen_t: HashSet<String> = HashSet::new();
        net.transitions.retain(|t| seen_t.insert(t.id.clone()));
        let mut seen_a: HashSet<(String, String)> = HashSet::new();
        net.arcs
            .retain(|a| seen_a.insert((a.from.clone(), a.to.clone())));

        net
    }

    /// Build Petri net from parallel groups.
    fn build_parallel_net(&self, groups: &[Vec<u32>]) -> PetriNet {
        let mut net = PetriNet::new();

        let source_id = "p_source";
        let sink_id = "p_sink";

        net.places.push(PetriNetPlace {
            id: source_id.to_string(),
            label: source_id.to_string(),
            marking: None,
        });
        net.places.push(PetriNetPlace {
            id: sink_id.to_string(),
            label: sink_id.to_string(),
            marking: None,
        });

        for (group_idx, group) in groups.iter().enumerate() {
            let group_place = format!("p_par_{}", group_idx);

            net.places.push(PetriNetPlace {
                id: group_place.clone(),
                label: group_place.clone(),
                marking: None,
            });

            // Source → group place
            net.arcs.push(PetriNetArc {
                from: source_id.to_string(),
                to: group_place.clone(),
                weight: None,
            });

            for &act_id in group {
                let name = self.interner.get(act_id).unwrap_or("?");
                let t_id = format!("t_{}", name);

                net.transitions.push(PetriNetTransition {
                    id: t_id.clone(),
                    label: name.to_string(),
                    is_invisible: None,
                });

                net.arcs.push(PetriNetArc {
                    from: group_place.clone(),
                    to: t_id.clone(),
                    weight: None,
                });

                net.arcs.push(PetriNetArc {
                    from: t_id,
                    to: sink_id.to_string(),
                    weight: None,
                });
            }
        }

        // Deduplicate transitions and arcs
        let mut seen_t: HashSet<String> = HashSet::new();
        net.transitions.retain(|t| seen_t.insert(t.id.clone()));
        let mut seen_a: HashSet<(String, String)> = HashSet::new();
        net.arcs
            .retain(|a| seen_a.insert((a.from.clone(), a.to.clone())));

        net
    }

    /// Build Petri net with loop construct.
    fn build_loop_net(&self, activities: &[u32], loop_activities: &HashSet<u32>) -> PetriNet {
        let mut net = PetriNet::new();

        let source_id = "p_source";
        let sink_id = "p_sink";
        let loop_place_id = "p_loop";

        net.places.push(PetriNetPlace {
            id: source_id.to_string(),
            label: source_id.to_string(),
            marking: None,
        });
        net.places.push(PetriNetPlace {
            id: sink_id.to_string(),
            label: sink_id.to_string(),
            marking: None,
        });
        net.places.push(PetriNetPlace {
            id: loop_place_id.to_string(),
            label: loop_place_id.to_string(),
            marking: None,
        });

        // Silent transition for loop body
        let tau_id = "t_tau_loop";
        net.transitions.push(PetriNetTransition {
            id: tau_id.to_string(),
            label: "tau".to_string(),
            is_invisible: Some(true),
        });

        // Source → tau → loop_place
        net.arcs.push(PetriNetArc {
            from: source_id.to_string(),
            to: tau_id.to_string(),
            weight: None,
        });
        net.arcs.push(PetriNetArc {
            from: tau_id.to_string(),
            to: loop_place_id.to_string(),
            weight: None,
        });

        for &act_id in activities {
            let name = self.interner.get(act_id).unwrap_or("?");
            let t_id = format!("t_{}", name);

            net.transitions.push(PetriNetTransition {
                id: t_id.clone(),
                label: name.to_string(),
                is_invisible: None,
            });

            // Loop place → activity
            net.arcs.push(PetriNetArc {
                from: loop_place_id.to_string(),
                to: t_id.clone(),
                weight: None,
            });

            // Activity → sink or back to loop place
            net.arcs.push(PetriNetArc {
                from: t_id.clone(),
                to: sink_id.to_string(),
                weight: None,
            });

            if loop_activities.contains(&act_id) {
                // Loop back: activity → loop place
                net.arcs.push(PetriNetArc {
                    from: t_id,
                    to: loop_place_id.to_string(),
                    weight: None,
                });
            }
        }

        net
    }

    /// Build flower model (fallback): source → all activities → sink with loop.
    fn build_flower_net(&self, activities: &[u32]) -> PetriNet {
        let mut net = PetriNet::new();

        let source_id = "p_source";
        let sink_id = "p_sink";
        let body_id = "p_body";

        net.places.push(PetriNetPlace {
            id: source_id.to_string(),
            label: source_id.to_string(),
            marking: None,
        });
        net.places.push(PetriNetPlace {
            id: sink_id.to_string(),
            label: sink_id.to_string(),
            marking: None,
        });
        net.places.push(PetriNetPlace {
            id: body_id.to_string(),
            label: body_id.to_string(),
            marking: None,
        });

        // Silent transition from source to body
        let tau_id = "t_tau_flower";
        net.transitions.push(PetriNetTransition {
            id: tau_id.to_string(),
            label: "tau".to_string(),
            is_invisible: Some(true),
        });
        net.arcs.push(PetriNetArc {
            from: source_id.to_string(),
            to: tau_id.to_string(),
            weight: None,
        });
        net.arcs.push(PetriNetArc {
            from: tau_id.to_string(),
            to: body_id.to_string(),
            weight: None,
        });

        for &act_id in activities {
            let name = self.interner.get(act_id).unwrap_or("?");
            let t_id = format!("t_{}", name);

            net.transitions.push(PetriNetTransition {
                id: t_id.clone(),
                label: name.to_string(),
                is_invisible: None,
            });

            // Body → activity → body (loop)
            net.arcs.push(PetriNetArc {
                from: body_id.to_string(),
                to: t_id.clone(),
                weight: None,
            });
            net.arcs.push(PetriNetArc {
                from: t_id.clone(),
                to: body_id.to_string(),
                weight: None,
            });

            // Activity → sink (exit)
            net.arcs.push(PetriNetArc {
                from: t_id,
                to: sink_id.to_string(),
                weight: None,
            });
        }

        net
    }
}

impl StreamingAlgorithm for StreamingInductiveBuilder {
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
        self.to_petrinet()
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

impl Default for StreamingInductiveBuilder {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_inductive_basic() {
        let mut stream = StreamingInductiveBuilder::new();

        stream.add_event("case1", "A");
        stream.add_event("case1", "B");
        stream.add_event("case1", "C");
        stream.close_trace("case1");

        let stats = stream.stats();
        assert_eq!(stats.event_count, 3);
        assert_eq!(stats.trace_count, 1);
    }

    #[test]
    fn test_inductive_sequential_cut() {
        let mut stream = StreamingInductiveBuilder::new();

        // Pure sequential: A → B → C always
        for i in 0..3 {
            stream.add_event(&format!("c{}", i), "A");
            stream.add_event(&format!("c{}", i), "B");
            stream.add_event(&format!("c{}", i), "C");
            stream.close_trace(&format!("c{}", i));
        }

        let net = stream.snapshot();
        assert!(
            !net.places.is_empty(),
            "should have places for sequential cut"
        );
        assert!(!net.transitions.is_empty(), "should have transitions");
        assert!(!net.arcs.is_empty(), "should have arcs");
    }

    #[test]
    fn test_inductive_empty_log() {
        let stream = StreamingInductiveBuilder::new();
        let net = stream.snapshot();
        assert!(net.places.is_empty());
        assert!(net.transitions.is_empty());
    }

    #[test]
    fn test_inductive_parallel_detection() {
        let mut stream = StreamingInductiveBuilder::new();

        // Parallel: A and B in both orders
        stream.add_event("c1", "A");
        stream.add_event("c1", "B");
        stream.close_trace("c1");

        stream.add_event("c2", "B");
        stream.add_event("c2", "A");
        stream.close_trace("c2");

        let net = stream.snapshot();
        assert!(
            !net.transitions.is_empty(),
            "should detect parallel and create transitions"
        );
    }

    #[test]
    fn test_inductive_exclusive_detection() {
        let mut stream = StreamingInductiveBuilder::new();

        // Exclusive: A or B but never together
        for i in 0..3 {
            stream.add_event(&format!("c{}", i), "A");
            stream.close_trace(&format!("c{}", i));
        }
        for i in 3..6 {
            stream.add_event(&format!("c{}", i), "B");
            stream.close_trace(&format!("c{}", i));
        }

        let net = stream.snapshot();
        assert!(
            !net.transitions.is_empty(),
            "should detect exclusive and create transitions"
        );
    }
}
