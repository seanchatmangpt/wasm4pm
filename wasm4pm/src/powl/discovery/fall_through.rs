//! Fall-through strategies for inductive miner.
//!
//! When no cut is detected, apply a fall-through strategy:
//!   - Decision graph fall-through: Build a decision graph from DFG
//!   - Flower model fall-through: All activities in a loop

use super::DiscoveryConfig;
use crate::powl_arena::{Operator, PowlArena};

/// Decision graph fall-through
///
/// When no cut is detected, build a DecisionGraph from the DFG.
/// This preserves non-block-structured choices that XOR/sequence can't capture.
pub fn decision_graph_fall_through(
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
    // Note: start_nodes and end_nodes are local indices (0..n)
    Ok(arena.add_decision_graph(child_indices, order, start_nodes, end_nodes, empty_path))
}

/// Flower model fall-through
///
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

    // Create a flower model: LOOP with do=tau, redo=XOR(all activities)
    let tau_idx = arena.add_silent_transition();

    // Create XOR of all activities
    let mut activity_children: Vec<u32> = Vec::new();
    for activity in &activities {
        let idx = arena.add_transition(Some(activity.to_string()));
        activity_children.push(idx);
    }

    // If only one activity, no need for XOR
    let redo_idx = if activity_children.len() == 1 {
        activity_children[0]
    } else {
        arena.add_operator(Operator::Xor, activity_children)
    };

    // Create LOOP operator: do=tau, redo=XOR(activities)
    Ok(arena.add_operator(Operator::Loop, vec![tau_idx, redo_idx]))
}

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
    fn test_flower_model_fall_through() {
        let traces = vec![
            vec!["A".to_string(), "B".to_string()],
            vec!["B".to_string(), "C".to_string()],
            vec!["C".to_string(), "A".to_string()],
        ];

        let mut arena = PowlArena::new();
        let config = DiscoveryConfig::default();

        let result = flower_model_fall_through(&traces, &mut arena, &config);
        assert!(result.is_ok());

        // Verify LOOP operator was created
        let root_idx = result.unwrap();
        if let Some(crate::powl_arena::PowlNode::OperatorPowl(op)) = arena.get(root_idx) {
            assert_eq!(op.operator, crate::powl_arena::Operator::Loop);
        } else {
            panic!("Expected OperatorPowl with Loop");
        }
    }
}
