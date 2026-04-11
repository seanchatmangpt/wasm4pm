//! DFG-based POWL discovery.
//!
//! Discovery from pre-computed Directly Follows Graph (DFG).
//! Supports 4 variants: tree, maximal, dynamic_clustering, decision_graph_cyclic.

use super::{CutFilter, DiscoveryConfig};
use crate::models::EventLog;
use crate::powl_arena::PowlArena;
use std::collections::{HashMap, HashSet};

/// Discover POWL from pre-computed DFG
pub fn discover_from_dfg(
    log: &EventLog,
    config: &DiscoveryConfig,
    arena: &mut PowlArena,
) -> Result<u32, String> {
    let dfg_edges = log.get_directly_follows(&config.activity_key);

    if dfg_edges.is_empty() {
        // No edges, check if we have activities
        let activities = log.get_activities(&config.activity_key);
        if activities.is_empty() {
            return super::base_case::handle_empty_log(arena);
        }
        if activities.len() == 1 {
            return super::base_case::handle_single_activity(arena, &activities[0]);
        }
    }

    // Group activities by DFG connectivity for cut detection
    let traces = build_traces_from_dfg(&dfg_edges, log, &config.activity_key);

    let cut_filter = CutFilter::for_variant(config.variant);
    super::inductive_miner(&traces, arena, config, &cut_filter)
}

/// Build traces from DFG by following edges
fn build_traces_from_dfg(
    dfg_edges: &[(String, String, usize)],
    log: &EventLog,
    activity_key: &str,
) -> Vec<Vec<String>> {
    use std::collections::{HashMap, HashSet};

    // Build adjacency map from DFG
    let mut adjacency: HashMap<&str, Vec<&str>> = HashMap::new();
    let mut all_activities: HashSet<&str> = HashSet::new();

    for (src, tgt, _count) in dfg_edges {
        adjacency
            .entry(src.as_str())
            .or_default()
            .push(tgt.as_str());
        all_activities.insert(src.as_str());
        all_activities.insert(tgt.as_str());
    }

    // If DFG is empty, fall back to log traces
    if adjacency.is_empty() {
        return super::group_traces_by_activity_sequence(log, activity_key);
    }

    // Build traces by following DFG edges from each start activity
    let mut traces = Vec::new();

    // Find start activities (no incoming edges)
    let mut has_incoming: HashSet<&str> = HashSet::new();
    for (_src, tgt, _count) in dfg_edges {
        has_incoming.insert(tgt.as_str());
    }

    let start_activities: Vec<&str> = all_activities
        .iter()
        .filter(|act| !has_incoming.contains(*act))
        .cloned()
        .collect();

    // For each start activity, build a trace by following edges
    for start in &start_activities {
        let mut trace = Vec::new();
        let mut visited: HashSet<&str> = HashSet::new();
        build_trace_recursive(start, &adjacency, &mut trace, &mut visited);
        if !trace.is_empty() {
            traces.push(trace);
        }
    }

    // If no traces found, fall back to log traces
    if traces.is_empty() {
        super::group_traces_by_activity_sequence(log, activity_key)
    } else {
        traces
    }
}

/// Recursively build a trace by following DFG edges
fn build_trace_recursive<'a>(
    current: &'a str,
    adjacency: &HashMap<&'a str, Vec<&'a str>>,
    trace: &mut Vec<String>,
    visited: &mut HashSet<&'a str>,
) {
    if visited.contains(current) {
        return; // Avoid cycles
    }

    trace.push(current.to_string());
    visited.insert(current);

    if let Some(nexts) = adjacency.get(current) {
        for next in nexts {
            build_trace_recursive(next, adjacency, trace, visited);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::Attributes;

    #[test]
    fn test_discover_from_dfg_empty() {
        // Test with empty log
        let log = EventLog {
            attributes: Attributes::new(),
            traces: vec![],
        };

        let mut arena = PowlArena::new();
        let config = DiscoveryConfig::default();

        let result = discover_from_dfg(&log, &config, &mut arena);
        // Should return empty log base case (silent transition)
        assert!(result.is_ok());
    }

    #[test]
    fn test_build_traces_from_empty_dfg() {
        // Test with empty DFG
        let dfg_edges = vec![];
        let log = EventLog {
            attributes: Attributes::new(),
            traces: vec![],
        };

        let traces = build_traces_from_dfg(&dfg_edges, &log, "concept:name");
        assert_eq!(traces.len(), 0);
    }
}
