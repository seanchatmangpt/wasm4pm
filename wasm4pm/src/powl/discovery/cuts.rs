//! Cut detection for inductive miner.
//!
//! Implements the four main cut types:
//!   - Concurrency cut (partial order)
//!   - Sequence cut
//!   - Loop cut
//!   - XOR cut

use crate::powl::discovery::DiscoveryConfig;
use crate::powl_arena::{Operator, PowlArena};
use std::collections::HashMap;

/// Detect concurrency cut (partial order)
///
/// A concurrency cut exists when there are multiple activities that can happen in parallel.
/// This creates a StrictPartialOrder node with ordering edges.
pub fn detect_concurrency_cut(
    traces: &[Vec<String>],
    arena: &mut PowlArena,
    _config: &DiscoveryConfig,
) -> Result<u32, String> {
    // Check if there are multiple activities that can be executed concurrently
    // This is true when we have traces with different orderings of the same activities

    let unique_activities: std::collections::HashSet<&str> = traces
        .iter()
        .flat_map(|trace| trace.iter().map(|s| s.as_str()))
        .collect();

    if unique_activities.len() < 2 {
        return Err("Not enough activities for concurrency cut".to_string());
    }

    // Check for concurrent execution: if we have traces with different orderings
    // then we have true concurrency
    let orderings: std::collections::HashSet<Vec<&str>> = traces
        .iter()
        .map(|trace| trace.iter().map(|s| s.as_str()).collect())
        .collect();

    if orderings.len() < 2 {
        return Err("Only one ordering found, not concurrent".to_string());
    }

    // Build partial order from all orderings
    let activity_set: Vec<String> = unique_activities
        .into_iter()
        .map(|s| s.to_string())
        .collect();
    let _n = activity_set.len();
    let mut activity_to_idx: HashMap<String, usize> = HashMap::new();
    for (i, act) in activity_set.iter().enumerate() {
        activity_to_idx.insert(act.clone(), i);
    }

    // Create children for each activity
    let mut child_indices: Vec<u32> = Vec::new();
    for activity in &activity_set {
        let child_idx = arena.add_transition(Some(activity.clone()));
        child_indices.push(child_idx);
    }

    // Create partial order with edges from orderings
    let spo_idx = arena.add_strict_partial_order(child_indices.clone());

    // Add ordering edges from each trace
    for trace in traces {
        for i in 0..trace.len().saturating_sub(1) {
            let src = &trace[i];
            let tgt = &trace[i + 1];

            if let (Some(&src_idx), Some(&tgt_idx)) =
                (activity_to_idx.get(src), activity_to_idx.get(tgt))
            {
                arena.add_order_edge(spo_idx, src_idx, tgt_idx);
            }
        }
    }

    Ok(spo_idx)
}

/// Detect sequence cut
///
/// A sequence cut exists when all activities happen in the same sequential order.
pub fn detect_sequence_cut(
    traces: &[Vec<String>],
    arena: &mut PowlArena,
    _config: &DiscoveryConfig,
) -> Result<u32, String> {
    if traces.is_empty() {
        return Err("No traces for sequence cut".to_string());
    }

    // Get the unique sequence of activities (all traces must have same sequence)
    let first_sequence = &traces[0];

    // Verify all traces have the same sequence
    for trace in &traces[1..] {
        if trace != first_sequence {
            return Err("Traces have different sequences, not sequential".to_string());
        }
    }

    // Build sequence as StrictPartialOrder with total order
    let mut child_indices: Vec<u32> = Vec::new();
    for activity in first_sequence {
        let child_idx = arena.add_transition(Some(activity.clone()));
        child_indices.push(child_idx);
    }

    // Create partial order with total order (each activity connects to next)
    let spo_idx = arena.add_strict_partial_order(child_indices.clone());

    // Add sequential edges: activity[i] -> activity[i+1]
    for i in 0..child_indices.len().saturating_sub(1) {
        arena.add_order_edge(spo_idx, i, i + 1);
    }

    Ok(spo_idx)
}

/// Detect loop cut
///
/// A loop cut exists when we can find a do part (first activity) and a redo part (rest of activities).
pub fn detect_loop_cut(
    traces: &[Vec<String>],
    arena: &mut PowlArena,
    _config: &DiscoveryConfig,
) -> Result<u32, String> {
    if traces.is_empty() {
        return Err("No traces for loop cut".to_string());
    }

    // Simplified loop detection: if first activity appears multiple times in a trace,
    // it might be a loop
    // For proper loop detection, we need to find a do part and redo part
    // This is complex; for now, use a simplified heuristic

    // Check if first activity appears again later in any trace
    for trace in traces {
        if trace.len() < 2 {
            continue;
        }

        let first_activity = &trace[0];
        if trace[1..].contains(first_activity) {
            // Potential loop: first activity repeats
            // Create do part (first activity) and redo part (rest)
            let do_idx = arena.add_transition(Some(first_activity.clone()));
            let mut redo_indices: Vec<u32> = Vec::new();

            // Add remaining activities as redo part
            for activity in &trace[1..] {
                let idx = arena.add_transition(Some(activity.clone()));
                redo_indices.push(idx);
            }

            // Create LOOP operator
            let loop_idx = arena.add_operator(Operator::Loop, vec![do_idx, redo_indices[0]]);
            return Ok(loop_idx);
        }
    }

    Err("No loop pattern detected".to_string())
}

/// Detect XOR cut
///
/// An XOR cut exists when we have alternative paths (mutually exclusive activities).
pub fn detect_xor_cut(
    traces: &[Vec<String>],
    arena: &mut PowlArena,
    _config: &DiscoveryConfig,
) -> Result<u32, String> {
    if traces.is_empty() {
        return Err("No traces for XOR cut".to_string());
    }

    // XOR cut: each trace represents an exclusive branch
    // Build XOR operator with children for each unique trace

    if traces.len() < 2 {
        return Err("Only one trace, not an XOR".to_string());
    }

    // Check that traces are actually different (alternative paths)
    // If all traces are identical, it's a sequence, not XOR
    let first_trace = &traces[0];
    let all_same = traces[1..].iter().all(|t| t == first_trace);
    if all_same {
        return Err("All traces are identical, not XOR alternatives".to_string());
    }

    // Each trace becomes a child of the XOR
    let mut child_indices: Vec<u32> = Vec::new();

    for trace in traces {
        // Each trace is a sequence of activities
        let mut trace_children: Vec<u32> = Vec::new();
        for activity in trace {
            let idx = arena.add_transition(Some(activity.clone()));
            trace_children.push(idx);
        }

        // If trace has multiple activities, need to compose them
        let trace_root = if trace_children.len() == 1 {
            trace_children[0]
        } else {
            // Create sequence for the trace
            let spo_idx = arena.add_strict_partial_order(trace_children.clone());
            // Add sequential edges
            for i in 0..trace_children.len().saturating_sub(1) {
                arena.add_order_edge(spo_idx, i, i + 1);
            }
            spo_idx
        };

        child_indices.push(trace_root);
    }

    // Create XOR operator
    let xor_idx = arena.add_operator(Operator::Xor, child_indices);
    Ok(xor_idx)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_concurrency_cut_with_parallel_activities() {
        let traces = vec![
            vec!["A".to_string(), "B".to_string()],
            vec!["B".to_string(), "A".to_string()],
        ];

        let mut arena = PowlArena::new();
        let config = DiscoveryConfig::default();

        let result = detect_concurrency_cut(&traces, &mut arena, &config);
        assert!(result.is_ok());
    }

    #[test]
    fn test_sequence_cut_with_sequential_activities() {
        let traces = vec![
            vec!["A".to_string(), "B".to_string(), "C".to_string()],
            vec!["A".to_string(), "B".to_string(), "C".to_string()],
        ];

        let mut arena = PowlArena::new();
        let config = DiscoveryConfig::default();

        let result = detect_sequence_cut(&traces, &mut arena, &config);
        assert!(result.is_ok());
    }

    #[test]
    fn test_xor_cut_with_alternative_traces() {
        let traces = vec![vec!["A".to_string()], vec!["B".to_string()]];

        let mut arena = PowlArena::new();
        let config = DiscoveryConfig::default();

        let result = detect_xor_cut(&traces, &mut arena, &config);
        assert!(result.is_ok());
    }

    #[test]
    fn test_xor_cut_with_sequential_traces() {
        let traces = vec![
            vec!["A".to_string(), "B".to_string()],
            vec!["A".to_string(), "B".to_string()],
        ];

        let mut arena = PowlArena::new();
        let config = DiscoveryConfig::default();

        // Both traces are identical - should detect as sequence, not XOR
        let result = detect_xor_cut(&traces, &mut arena, &config);
        assert!(result.is_err()); // Should fail XOR detection
    }
}
