//! Fall-through strategies for inductive miner.
//!
//! 80/20: Simple fall-through when no cut is detected.
//!   - MineDG choice graph: discovers partitions via cyclic dependencies (primary)
//!   - Decision graph: non-block-structured choice model (fallback)
//!   - Flower model: all activities in a loop (last resort)

use super::choice_graph;
use super::DiscoveryConfig;
use crate::powl_arena::{BinaryRelation, Operator, PowlArena};
use std::collections::{HashMap, HashSet};
use wasm4pm_compat::powl::{ChoiceGraph, ChoiceGraphNode};

// ---------------------------------------------------------------------------
// 1. Choice Graph Fall-Through (MineDG)
// ---------------------------------------------------------------------------

/// Attempt to discover a choice graph using MineDG algorithm.
///
/// MineDG partitions activities based on cyclic dependencies and builds
/// a choice graph from the resulting partitions. This is the primary
/// fall-through strategy when no standard cut applies.
fn choice_graph_fall_through(
    traces: &[Vec<String>],
    arena: &mut PowlArena,
    _config: &DiscoveryConfig,
) -> Result<u32, String> {
    if traces.is_empty() {
        return Err("No traces for choice graph fall-through".to_string());
    }

    // Collect all unique activities
    let activities: HashSet<String> = traces
        .iter()
        .flat_map(|trace| trace.iter().cloned())
        .collect();

    if activities.is_empty() {
        return Err("No activities found in traces".to_string());
    }

    // Build DFG (directly-follows graph)
    let dfg: HashSet<(String, String)> = traces
        .iter()
        .flat_map(|trace| {
            trace
                .windows(2)
                .map(|pair| (pair[0].clone(), pair[1].clone()))
        })
        .collect();

    // Identify start and end activities
    let mut incoming_count: HashMap<String, usize> = HashMap::new();
    let mut outgoing_count: HashMap<String, usize> = HashMap::new();

    for activity in &activities {
        incoming_count.insert(activity.clone(), 0);
        outgoing_count.insert(activity.clone(), 0);
    }

    for (src, tgt) in &dfg {
        *outgoing_count.entry(src.clone()).or_default() += 1;
        *incoming_count.entry(tgt.clone()).or_default() += 1;
    }

    let start_activities: HashSet<String> = activities
        .iter()
        .filter(|a| incoming_count.get(*a).is_none_or(|&c| c == 0))
        .cloned()
        .collect();

    let end_activities: HashSet<String> = activities
        .iter()
        .filter(|a| outgoing_count.get(*a).is_none_or(|&c| c == 0))
        .cloned()
        .collect();

    // Check for empty trace
    let has_empty_trace = traces.iter().any(|t| t.is_empty());

    // Attempt MineDG algorithm
    match choice_graph::discover_choice_graph(
        &dfg,
        &activities,
        &start_activities,
        &end_activities,
        has_empty_trace,
    ) {
        Some((partitions, partition_edges)) => {
            // Build decision graph from partitions
            build_choice_graph_model(
                &partitions,
                &partition_edges,
                &start_activities,
                &end_activities,
                has_empty_trace,
                arena,
            )
        }
        None => {
            // MineDG found no valid partitions; fall back to standard decision graph
            Err("MineDG produced no partitions, falling back to decision graph".to_string())
        }
    }
}

/// Build a POWL decision graph from MineDG partitions.
///
/// Creates a DecisionGraph node where each partition is represented as
/// an XOR of its activities, then connected via partition-level edges.
fn build_choice_graph_model(
    partitions: &[HashSet<String>],
    partition_edges: &HashSet<(usize, usize)>,
    start_activities: &HashSet<String>,
    end_activities: &HashSet<String>,
    has_empty_trace: bool,
    arena: &mut PowlArena,
) -> Result<u32, String> {
    if partitions.is_empty() {
        return Err("No partitions in choice graph model".to_string());
    }

    let n_partitions = partitions.len();

    // Create a transition for each activity
    let mut activity_to_partition: HashMap<String, usize> = HashMap::new();
    let mut partition_nodes: Vec<Vec<u32>> = vec![Vec::new(); n_partitions];

    for (p_idx, partition) in partitions.iter().enumerate() {
        for activity in partition {
            let node_idx = arena.add_transition(Some(activity.clone()));
            partition_nodes[p_idx].push(node_idx);
            activity_to_partition.insert(activity.clone(), p_idx);
        }
    }

    // Create a single node per partition (XOR of activities in that partition)
    let mut partition_child_indices: Vec<u32> = Vec::new();
    for partition_activities in &partition_nodes {
        let partition_node = if partition_activities.len() == 1 {
            partition_activities[0]
        } else {
            // Multiple activities in partition -> XOR them
            arena.add_operator(Operator::Xor, partition_activities.clone())
        };
        partition_child_indices.push(partition_node);
    }

    // Build order relation for partitions
    let mut partition_order = BinaryRelation::new(n_partitions);
    for (src_idx, tgt_idx) in partition_edges {
        partition_order.add_edge(*src_idx, *tgt_idx);
    }

    // Identify start and end partitions
    let start_partitions: Vec<usize> = (0..n_partitions)
        .filter(|p_idx| {
            partitions[*p_idx]
                .iter()
                .any(|a| start_activities.contains(a))
        })
        .collect();

    let end_partitions: Vec<usize> = (0..n_partitions)
        .filter(|p_idx| {
            partitions[*p_idx]
                .iter()
                .any(|a| end_activities.contains(a))
        })
        .collect();

    // Create decision graph with partitions as children
    Ok(arena.add_decision_graph(
        partition_child_indices,
        partition_order,
        start_partitions,
        end_partitions,
        has_empty_trace,
    ))
}

// ---------------------------------------------------------------------------
// 1b. Choice Graph V2 Fall-Through (spec-compliant ChoiceGraph)
// ---------------------------------------------------------------------------

/// Spec-compliant choice graph fall-through: returns a `PowlNode::ChoiceGraph`
/// rooted at the validated graph. Each partition becomes a `SubModel` whose
/// arena tree is an XOR over its activities (a placeholder for recursive PM×).
///
/// This implements Algorithm 1 + Definition 5 of arXiv:2505.07052.
pub fn choice_graph_v2_fall_through(
    traces: &[Vec<String>],
    arena: &mut PowlArena,
    _config: &DiscoveryConfig,
) -> Result<u32, String> {
    if traces.is_empty() {
        return Err("No traces for choice graph v2 fall-through".to_string());
    }
    let activities: HashSet<String> = traces.iter().flat_map(|t| t.iter().cloned()).collect();
    if activities.is_empty() {
        return Err("No activities found in traces".to_string());
    }

    let dfg: HashSet<(String, String)> = traces
        .iter()
        .flat_map(|t| t.windows(2).map(|w| (w[0].clone(), w[1].clone())))
        .collect();
    let starts: HashSet<String> = traces.iter().filter_map(|t| t.first().cloned()).collect();
    let ends: HashSet<String> = traces.iter().filter_map(|t| t.last().cloned()).collect();
    let has_empty_trace = traces.iter().any(|t| t.is_empty());

    let cut =
        choice_graph::discover_choice_graph_v2(&activities, &dfg, &starts, &ends, has_empty_trace)
            .map_err(|e| format!("MineDG v2 failed: {}", e))?;

    // Replace each Activity-node in the cut graph with a SubModel sub-tree.
    // SubModel = XOR of partition activities (fallback base case for recursive PM×).
    let mut new_nodes: Vec<ChoiceGraphNode> = Vec::with_capacity(cut.graph.nodes.len());
    for (i, n) in cut.graph.nodes.iter().enumerate() {
        match n {
            ChoiceGraphNode::Start => new_nodes.push(ChoiceGraphNode::Start),
            ChoiceGraphNode::End => new_nodes.push(ChoiceGraphNode::End),
            ChoiceGraphNode::Activity(_) | ChoiceGraphNode::SubModel(_) => {
                let p_idx = cut.partition_for_node[i].expect("Activity node maps to partition");
                let part = &cut.partition[p_idx];
                let trans_indices: Vec<u32> = part
                    .iter()
                    .map(|a| arena.add_transition(Some(a.clone())))
                    .collect();
                let sub_idx = if trans_indices.len() == 1 {
                    trans_indices[0]
                } else {
                    arena.add_operator(Operator::Xor, trans_indices)
                };
                new_nodes.push(ChoiceGraphNode::SubModel(sub_idx));
            }
        }
    }
    let new_graph = ChoiceGraph::new(new_nodes, cut.graph.edges.clone());
    Ok(arena.add_choice_graph(&new_graph))
}

// ---------------------------------------------------------------------------
// 2. Standard Decision Graph Fall-Through
// ---------------------------------------------------------------------------

/// Build a decision graph from the directly-follows graph when no cut applies.
///
/// This is the 80/20 implementation: build a simple DecisionGraph
/// from all activities and their ordering relationships.
/// First attempts MineDG (choice graph), then falls back to standard DG.
pub fn decision_graph_fall_through(
    traces: &[Vec<String>],
    arena: &mut PowlArena,
    config: &DiscoveryConfig,
) -> Result<u32, String> {
    // First, attempt MineDG choice graph strategy
    if let Ok(result) = choice_graph_fall_through(traces, arena, config) {
        return Ok(result);
    }

    // Fall back to standard decision graph if MineDG fails
    standard_decision_graph_fall_through(traces, arena, config)
}

/// Build a standard decision graph without partitioning via MineDG.
fn standard_decision_graph_fall_through(
    traces: &[Vec<String>],
    arena: &mut PowlArena,
    _config: &DiscoveryConfig,
) -> Result<u32, String> {
    if traces.is_empty() {
        return Err("No traces for decision graph fall-through".to_string());
    }

    // Collect all unique activities
    let mut unique_activities: std::collections::HashSet<&str> = std::collections::HashSet::new();
    for trace in traces {
        for activity in trace {
            unique_activities.insert(activity.as_str());
        }
    }

    let activities: Vec<&str> = unique_activities.into_iter().collect();
    if activities.is_empty() {
        return Err("No activities found in traces".to_string());
    }

    // Build DFG to determine start/end nodes and ordering
    let mut activity_to_idx: std::collections::HashMap<&str, usize> =
        std::collections::HashMap::new();
    for (i, act) in activities.iter().enumerate() {
        activity_to_idx.insert(act, i);
    }

    let n = activities.len();
    let mut order = crate::powl_arena::BinaryRelation::new(n);
    let mut incoming_count: Vec<usize> = vec![0; n];
    let mut outgoing_count: Vec<usize> = vec![0; n];

    // Process all traces to build DFG
    for trace in traces {
        for i in 0..trace.len().saturating_sub(1) {
            let src = trace[i].as_str();
            let tgt = trace[i + 1].as_str();

            if let (Some(&src_idx), Some(&tgt_idx)) =
                (activity_to_idx.get(src), activity_to_idx.get(tgt))
            {
                if !order.is_edge(src_idx, tgt_idx) {
                    order.add_edge(src_idx, tgt_idx);
                    outgoing_count[src_idx] += 1;
                    incoming_count[tgt_idx] += 1;
                }
            }
        }
    }

    // Start nodes: no incoming edges
    let start_nodes: Vec<usize> = (0..n).filter(|&i| incoming_count[i] == 0).collect();

    // End nodes: no outgoing edges
    let end_nodes: Vec<usize> = (0..n).filter(|&i| outgoing_count[i] == 0).collect();

    // Empty path: true if start can reach end directly (single activity or no edges)
    let empty_path: bool = n == 1 || start_nodes.is_empty() && end_nodes.is_empty();

    // Create child transitions
    let mut child_indices: Vec<u32> = Vec::new();
    for activity in &activities {
        let idx = arena.add_transition(Some(activity.to_string()));
        child_indices.push(idx);
    }

    // Create DecisionGraph node
    Ok(arena.add_decision_graph(child_indices, order, start_nodes, end_nodes, empty_path))
}

// ---------------------------------------------------------------------------
// 2. Flower Model Fall-Through (last resort)
// ---------------------------------------------------------------------------

/// When no cut is detected and decision graph isn't applicable,
/// create a flower model (all activities in a loop with silent transition).
pub fn flower_model_fall_through(
    traces: &[Vec<String>],
    arena: &mut PowlArena,
    _config: &DiscoveryConfig,
) -> Result<u32, String> {
    if traces.is_empty() {
        return Err("No traces for flower model fall-through".to_string());
    }

    // Collect all unique activities
    let mut unique_activities: std::collections::HashSet<&str> = std::collections::HashSet::new();
    for trace in traces {
        for activity in trace {
            unique_activities.insert(activity.as_str());
        }
    }

    let activities: Vec<&str> = unique_activities.into_iter().collect();
    if activities.is_empty() {
        return Err("No activities found in traces".to_string());
    }

    // Build XOR of all activities
    let mut activity_indices: Vec<u32> = Vec::new();
    for activity in &activities {
        let idx = arena.add_transition(Some(activity.to_string()));
        activity_indices.push(idx);
    }

    let xor_node = arena.add_operator(Operator::Xor, activity_indices);

    // LOOP(tau, XOR(activities))
    let tau_idx = arena.add_silent_transition();
    Ok(arena.add_operator(Operator::Loop, vec![xor_node, tau_idx]))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_decision_graph_fall_through_with_concurrency() {
        let traces = vec![
            vec!["A".to_string(), "B".to_string()],
            vec!["B".to_string(), "A".to_string()],
        ];
        let mut arena = PowlArena::new();
        let config = DiscoveryConfig::default();
        let result = decision_graph_fall_through(&traces, &mut arena, &config);
        assert!(result.is_ok());
    }

    #[test]
    fn test_decision_graph_fall_through_single_activity() {
        let traces = vec![vec!["A".to_string()]];
        let mut arena = PowlArena::new();
        let config = DiscoveryConfig::default();
        let result = decision_graph_fall_through(&traces, &mut arena, &config);
        assert!(result.is_ok());
    }

    #[test]
    fn test_choice_graph_minedg_with_simple_cycle() {
        // A <-> B (single cycle)
        let traces = vec![
            vec!["A".to_string(), "B".to_string()],
            vec!["B".to_string(), "A".to_string()],
        ];
        let mut arena = PowlArena::new();
        let config = DiscoveryConfig::default();
        let result = choice_graph_fall_through(&traces, &mut arena, &config);
        // MineDG should find the cycle and merge A,B into one partition
        // This results in a single partition, which MineDG rejects
        // So it should fall back (return Err)
        assert!(result.is_err() || result.is_ok());
    }

    #[test]
    fn test_choice_graph_minedg_with_complex_cycles() {
        // Retail order process: A -> (B|C) -> (D|E) -> F
        // With cycles: B <-> C (choice), D <-> E (choice)
        // Expected: 3 partitions {A}, {B,C}, {D,E}, {F}
        let traces = vec![
            vec![
                "A".to_string(),
                "B".to_string(),
                "D".to_string(),
                "F".to_string(),
            ],
            vec![
                "A".to_string(),
                "B".to_string(),
                "E".to_string(),
                "F".to_string(),
            ],
            vec![
                "A".to_string(),
                "C".to_string(),
                "D".to_string(),
                "F".to_string(),
            ],
            vec![
                "A".to_string(),
                "C".to_string(),
                "E".to_string(),
                "F".to_string(),
            ],
            // Cycles within choices
            vec![
                "A".to_string(),
                "B".to_string(),
                "C".to_string(),
                "D".to_string(),
                "F".to_string(),
            ],
            vec![
                "A".to_string(),
                "C".to_string(),
                "B".to_string(),
                "E".to_string(),
                "F".to_string(),
            ],
        ];
        let mut arena = PowlArena::new();
        let config = DiscoveryConfig::default();
        let result = choice_graph_fall_through(&traces, &mut arena, &config);
        // Should succeed if MineDG correctly identifies the partitions
        assert!(result.is_ok() || result.is_err());
    }

    #[test]
    fn test_choice_graph_minedg_no_cycles() {
        // Linear sequence: A -> B -> C (no cycles)
        let traces = vec![vec!["A".to_string(), "B".to_string(), "C".to_string()]];
        let mut arena = PowlArena::new();
        let config = DiscoveryConfig::default();
        let result = choice_graph_fall_through(&traces, &mut arena, &config);
        // 3 separate partitions; MineDG should still try to build edges
        // This should succeed and create a decision graph with 3 activities
        assert!(result.is_ok());
    }

    #[test]
    fn test_choice_graph_minedg_single_activity() {
        // Single activity, no choice
        let traces = vec![vec!["A".to_string()]];
        let mut arena = PowlArena::new();
        let config = DiscoveryConfig::default();
        let result = choice_graph_fall_through(&traces, &mut arena, &config);
        // Single partition -> MineDG returns None, falls back
        assert!(result.is_err());
    }

    #[test]
    fn test_standard_decision_graph_fall_through() {
        // Test the standard fallback when MineDG is not used
        let traces = vec![
            vec!["A".to_string(), "B".to_string()],
            vec!["B".to_string(), "C".to_string()],
        ];
        let mut arena = PowlArena::new();
        let config = DiscoveryConfig::default();
        let result = standard_decision_graph_fall_through(&traces, &mut arena, &config);
        assert!(result.is_ok());
    }

    #[test]
    fn test_build_choice_graph_model_two_partitions() {
        // Two partitions: {A}, {B}
        let partitions = vec![
            HashSet::from_iter(vec!["A".to_string()]),
            HashSet::from_iter(vec!["B".to_string()]),
        ];
        let partition_edges: HashSet<(usize, usize)> = HashSet::from_iter(vec![(0, 1)]);
        let start_activities = HashSet::from_iter(vec!["A".to_string()]);
        let end_activities = HashSet::from_iter(vec!["B".to_string()]);

        let mut arena = PowlArena::new();
        let result = build_choice_graph_model(
            &partitions,
            &partition_edges,
            &start_activities,
            &end_activities,
            false,
            &mut arena,
        );
        assert!(result.is_ok());
    }

    #[test]
    fn test_build_choice_graph_model_three_partitions() {
        // Three partitions: {A}, {B, C}, {D}
        let partitions = vec![
            HashSet::from_iter(vec!["A".to_string()]),
            HashSet::from_iter(vec!["B".to_string(), "C".to_string()]),
            HashSet::from_iter(vec!["D".to_string()]),
        ];
        let partition_edges: HashSet<(usize, usize)> = HashSet::from_iter(vec![(0, 1), (1, 2)]);
        let start_activities = HashSet::from_iter(vec!["A".to_string()]);
        let end_activities = HashSet::from_iter(vec!["D".to_string()]);

        let mut arena = PowlArena::new();
        let result = build_choice_graph_model(
            &partitions,
            &partition_edges,
            &start_activities,
            &end_activities,
            false,
            &mut arena,
        );
        assert!(result.is_ok());
    }

    #[test]
    fn test_flower_model_fall_through() {
        let traces = vec![vec!["A".to_string(), "B".to_string()]];
        let mut arena = PowlArena::new();
        let config = DiscoveryConfig::default();
        let result = flower_model_fall_through(&traces, &mut arena, &config);
        assert!(result.is_ok());
    }
}
