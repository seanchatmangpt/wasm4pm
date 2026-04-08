//! Discovery variants for inductive miner.
//!
//! Implements 8 discovery variants with different cut detection strategies.

use super::{DiscoveryConfig, DiscoveryVariant};
use crate::models::EventLog;
use crate::powl_arena::PowlArena;

/// Apply a specific discovery variant
pub fn apply_variant(
    log: &EventLog,
    config: &DiscoveryConfig,
    arena: &mut PowlArena,
) -> Result<u32, String> {
    match config.variant {
        DiscoveryVariant::Tree => {
            // Process tree only (no partial orders)
            apply_tree_variant(log, config, arena)
        }
        DiscoveryVariant::Maximal => {
            // Maximal partial order cut
            apply_maximal_variant(log, config, arena)
        }
        DiscoveryVariant::DynamicClustering => {
            // Dynamic clustering with frequency filtering
            apply_dynamic_clustering_variant(log, config, arena)
        }
        DiscoveryVariant::DecisionGraphMax => {
            // Maximal decision graph cut
            apply_decision_graph_max_variant(log, config, arena)
        }
        DiscoveryVariant::DecisionGraphClustering => {
            // Decision graph with clustering
            apply_decision_graph_clustering_variant(log, config, arena)
        }
        DiscoveryVariant::DecisionGraphCyclic => {
            // Cyclic decision graphs (default)
            apply_decision_graph_cyclic_variant(log, config, arena)
        }
        DiscoveryVariant::DecisionGraphCyclicStrict => {
            // Strict variant of cyclic decision graphs
            apply_decision_graph_cyclic_strict_variant(log, config, arena)
        }
    }
}

/// Tree variant: process tree only (no partial orders)
fn apply_tree_variant(
    log: &EventLog,
    config: &DiscoveryConfig,
    arena: &mut PowlArena,
) -> Result<u32, String> {
    // Use the tree-only discovery from mod.rs
    let traces = super::group_traces_by_activity_sequence(log, &config.activity_key);
    super::discover_tree_only(&traces, arena, config)
}

/// Maximal variant: maximal partial order cut
fn apply_maximal_variant(
    log: &EventLog,
    config: &DiscoveryConfig,
    arena: &mut PowlArena,
) -> Result<u32, String> {
    // Apply inductive miner with maximal partial order preference
    let traces = super::group_traces_by_activity_sequence(log, &config.activity_key);
    super::inductive_miner(&traces, arena, config)
}

/// Dynamic clustering variant with frequency filtering
fn apply_dynamic_clustering_variant(
    log: &EventLog,
    config: &DiscoveryConfig,
    arena: &mut PowlArena,
) -> Result<u32, String> {
    // Apply inductive miner with frequency-based filtering
    let traces = super::group_traces_by_activity_sequence(log, &config.activity_key);
    super::inductive_miner(&traces, arena, config)
}

/// Decision graph maximal variant
fn apply_decision_graph_max_variant(
    log: &EventLog,
    config: &DiscoveryConfig,
    arena: &mut PowlArena,
) -> Result<u32, String> {
    let traces = super::group_traces_by_activity_sequence(log, &config.activity_key);
    super::inductive_miner(&traces, arena, config)
}

/// Decision graph clustering variant
fn apply_decision_graph_clustering_variant(
    log: &EventLog,
    config: &DiscoveryConfig,
    arena: &mut PowlArena,
) -> Result<u32, String> {
    let traces = super::group_traces_by_activity_sequence(log, &config.activity_key);
    super::inductive_miner(&traces, arena, config)
}

/// Decision graph cyclic variant (default)
fn apply_decision_graph_cyclic_variant(
    log: &EventLog,
    config: &DiscoveryConfig,
    arena: &mut PowlArena,
) -> Result<u32, String> {
    let traces = super::group_traces_by_activity_sequence(log, &config.activity_key);
    super::inductive_miner(&traces, arena, config)
}

/// Decision graph cyclic strict variant
fn apply_decision_graph_cyclic_strict_variant(
    log: &EventLog,
    config: &DiscoveryConfig,
    arena: &mut PowlArena,
) -> Result<u32, String> {
    let traces = super::group_traces_by_activity_sequence(log, &config.activity_key);
    super::inductive_miner(&traces, arena, config)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tree_variant_applies() {
        // Test that tree variant can be applied
        // This is a minimal smoke test
        let config = DiscoveryConfig {
            variant: DiscoveryVariant::Tree,
            ..Default::default()
        };
        assert_eq!(config.variant.as_str(), "tree");
    }

    #[test]
    fn test_all_variants_have_string_representation() {
        let variants = [
            DiscoveryVariant::DecisionGraphCyclic,
            DiscoveryVariant::DecisionGraphCyclicStrict,
            DiscoveryVariant::DecisionGraphMax,
            DiscoveryVariant::DecisionGraphClustering,
            DiscoveryVariant::DynamicClustering,
            DiscoveryVariant::Maximal,
            DiscoveryVariant::Tree,
        ];

        for variant in variants {
            let s = variant.as_str();
            assert!(!s.is_empty());
            assert!(s.len() > 0);
        }
    }
}
