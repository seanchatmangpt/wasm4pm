//! POWL discovery from event logs using inductive miner algorithm.
//!
//! Port of `pm4py/objects/powl/discovery/total_order_based/algorithm.py`
//! and `pm4py/objects/powl/discovery/total_order_based/cuts/`.
//!
//! Discovery variants:
//!   - tree: Base inductive miner (process tree only, no partial orders)
//!   - maximal: Maximal partial order cut
//!   - dynamic_clustering: Dynamic clustering with frequency filtering
//!   - decision_graph_max: Maximal decision graph cut
//!   - decision_graph_clustering: Decision graph with clustering
//!   - decision_graph_cyclic: Cyclic decision graphs (default)
//!   - decision_graph_cyclic_strict: Strict variant

pub mod base_case;
pub mod cuts;
pub mod fall_through;
pub mod variants;
pub mod from_dfg;
pub mod from_partial_orders;
pub mod ocel;

use crate::models::EventLog;
use crate::powl_arena::PowlArena;
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Default, Serialize, Deserialize)]
pub enum DiscoveryVariant {
    #[default]
    DecisionGraphCyclic,
    DecisionGraphCyclicStrict,
    DecisionGraphMax,
    DecisionGraphClustering,
    DynamicClustering,
    Maximal,
    Tree,
}

impl DiscoveryVariant {
    pub fn as_str(&self) -> &'static str {
        match self {
            DiscoveryVariant::DecisionGraphCyclic => "decision_graph_cyclic",
            DiscoveryVariant::DecisionGraphCyclicStrict => "decision_graph_cyclic_strict",
            DiscoveryVariant::DecisionGraphMax => "decision_graph_max",
            DiscoveryVariant::DecisionGraphClustering => "decision_graph_clustering",
            DiscoveryVariant::DynamicClustering => "dynamic_clustering",
            DiscoveryVariant::Maximal => "maximal",
            DiscoveryVariant::Tree => "tree",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "decision_graph_cyclic" => Some(DiscoveryVariant::DecisionGraphCyclic),
            "decision_graph_cyclic_strict" => Some(DiscoveryVariant::DecisionGraphCyclicStrict),
            "decision_graph_max" => Some(DiscoveryVariant::DecisionGraphMax),
            "decision_graph_clustering" => Some(DiscoveryVariant::DecisionGraphClustering),
            "dynamic_clustering" => Some(DiscoveryVariant::DynamicClustering),
            "maximal" => Some(DiscoveryVariant::Maximal),
            "tree" => Some(DiscoveryVariant::Tree),
            _ => None,
        }
    }
}

/// Discovery configuration
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct DiscoveryConfig {
    /// Activity key to use in the event log
    pub activity_key: String,
    /// Discovery variant
    pub variant: DiscoveryVariant,
    /// Minimum number of traces for a cut to be considered (default: 1)
    pub min_trace_count: usize,
    /// Noise threshold for fall-through (default: 0.0)
    pub noise_threshold: f64,
    /// Use DFG-based discovery (default: false, uses total order)
    pub from_dfg: bool,
}

impl Default for DiscoveryConfig {
    fn default() -> Self {
        Self {
            activity_key: "concept:name".to_string(),
            variant: DiscoveryVariant::default(),
            min_trace_count: 1,
            noise_threshold: 0.0,
            from_dfg: false,
        }
    }
}

/// Discover a POWL model from an event log
pub fn discover_powl(
    log: &EventLog,
    config: &DiscoveryConfig,
) -> Result<(PowlArena, u32), String> {
    let mut arena = PowlArena::new();

    let root = if config.from_dfg {
        // DFG-based discovery (simpler, faster)
        discover_from_dfg(log, config, &mut arena)?
    } else {
        // Total-order based discovery (full inductive miner)
        discover_from_traces(log, config, &mut arena)?
    };

    Ok((arena, root))
}

/// Discover POWL from trace-based (total order) representation
fn discover_from_traces(
    log: &EventLog,
    config: &DiscoveryConfig,
    arena: &mut PowlArena,
) -> Result<u32, String> {
    let activities = log.get_activities(&config.activity_key);
    if activities.is_empty() {
        return base_case::handle_empty_log(arena);
    }

    if activities.len() == 1 {
        return base_case::handle_single_activity(arena, &activities[0]);
    }

    // Group traces by activity sequence for cut detection
    let traces = group_traces_by_activity_sequence(log, &config.activity_key);

    match config.variant {
        DiscoveryVariant::Tree => {
            // Process tree only (no partial orders)
            discover_tree_only(&traces, arena, &config)
        }
        _ => {
            // Inductive miner with partial orders
            inductive_miner(&traces, arena, &config)
        }
    }
}

/// Discover POWL from pre-computed DFG
fn discover_from_dfg(
    log: &EventLog,
    config: &DiscoveryConfig,
    arena: &mut PowlArena,
) -> Result<u32, String> {
    // Build DFG and apply inductive miner on DFG groups
    let _dfg_edges = log.get_directly_follows(&config.activity_key);

    // Group activities by their directly-follows relationships
    // For now, fall back to trace-based discovery
    discover_from_traces(log, config, arena)
}

/// Main inductive miner algorithm with cut detection
fn inductive_miner(
    traces: &[Vec<String>],
    arena: &mut PowlArena,
    config: &DiscoveryConfig,
) -> Result<u32, String> {
    // Try cuts in order: concurrency → sequence → loop → xor
    // Apply fall-throughs if no cut found

    // Check for concurrency cut (partial order)
    if let Ok(root) = cuts::detect_concurrency_cut(traces, arena, config) {
        return Ok(root);
    }

    // Check for sequence cut
    if let Ok(root) = cuts::detect_sequence_cut(traces, arena, config) {
        return Ok(root);
    }

    // Check for loop cut
    if let Ok(root) = cuts::detect_loop_cut(traces, arena, config) {
        return Ok(root);
    }

    // Check for XOR cut
    if let Ok(root) = cuts::detect_xor_cut(traces, arena, config) {
        return Ok(root);
    }

    // Fall through to decision graph or flower model
    match config.variant {
        DiscoveryVariant::DecisionGraphCyclic
        | DiscoveryVariant::DecisionGraphCyclicStrict
        | DiscoveryVariant::DecisionGraphMax
        | DiscoveryVariant::DecisionGraphClustering => {
            fall_through::decision_graph_fall_through(traces, arena, config)
        }
        _ => {
            fall_through::flower_model_fall_through(traces, arena, config)
        }
    }
}

/// Discover process tree without partial orders
fn discover_tree_only(
    traces: &[Vec<String>],
    arena: &mut PowlArena,
    config: &DiscoveryConfig,
) -> Result<u32, String> {
    // Simplified inductive miner that only produces process trees
    // (no StrictPartialOrder nodes)

    // Check for XOR cut
    if let Ok(root) = cuts::detect_xor_cut(traces, arena, config) {
        return Ok(root);
    }

    // Check for sequence cut
    if let Ok(root) = cuts::detect_sequence_cut(traces, arena, config) {
        return Ok(root);
    }

    // Check for loop cut
    if let Ok(root) = cuts::detect_loop_cut(traces, arena, config) {
        return Ok(root);
    }

    // Fall through to flower model
    fall_through::flower_model_fall_through(traces, arena, config)
}

/// Group traces by their activity sequence for cut detection
fn group_traces_by_activity_sequence(
    log: &EventLog,
    activity_key: &str,
) -> Vec<Vec<String>> {
    // For each trace, get the sequence of activities
    let mut unique_traces = std::collections::HashMap::new();

    for trace in &log.traces {
        let activities: Vec<String> = trace
            .events
            .iter()
            .filter_map(|event| event.attributes.get(activity_key))
            .filter_map(|v| v.as_string())
            .map(|s| s.to_string())
            .collect();

        let count = unique_traces.entry(activities.clone()).or_insert(0);
        *count += 1;
    }

    // Return traces with their frequency
    unique_traces
        .into_iter()
        .map(|(trace, _count)| trace)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_discovery_variant_from_str() {
        assert_eq!(
            DiscoveryVariant::from_str("decision_graph_cyclic"),
            Some(DiscoveryVariant::DecisionGraphCyclic)
        );
        assert_eq!(
            DiscoveryVariant::from_str("tree"),
            Some(DiscoveryVariant::Tree)
        );
        assert_eq!(DiscoveryVariant::from_str("invalid"), None);
    }

    #[test]
    fn test_discovery_variant_roundtrip() {
        for variant in [
            DiscoveryVariant::DecisionGraphCyclic,
            DiscoveryVariant::DecisionGraphCyclicStrict,
            DiscoveryVariant::DecisionGraphMax,
            DiscoveryVariant::DecisionGraphClustering,
            DiscoveryVariant::DynamicClustering,
            DiscoveryVariant::Maximal,
            DiscoveryVariant::Tree,
        ] {
            assert_eq!(
                DiscoveryVariant::from_str(variant.as_str()),
                Some(variant)
            );
        }
    }
}
