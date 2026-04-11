//! POWL discovery from event logs using inductive miner algorithm.
//!
//! Port of `pm4py/algo/discovery/powl/inductive/` cut factory pattern.
//!
//! Each discovery variant uses a different `CutFilter` that controls which
//! cut types are attempted and in what order, mirroring pm4py's CutFactory:
//!
//!   - tree:                    XOR -> Sequence (no concurrency, no loop, no PO)
//!   - maximal:                 XOR -> Sequence -> Concurrency -> Loop -> MaximalPO
//!   - dynamic_clustering:      XOR -> Loop -> DynamicClusteringPO (no standard concurrency)
//!   - decision_graph_max:      XOR -> Sequence -> Concurrency -> Loop -> MaximalPO + DG fall-through
//!   - decision_graph_clustering: Sequence -> XOR -> Loop -> DynamicClusteringPO + DG fall-through
//!   - decision_graph_cyclic:   XOR -> Sequence -> Concurrency -> Loop + DG fall-through (default)
//!   - decision_graph_cyclic_strict: same as cyclic but with strict validation
//!   - brute_force:             XOR -> Sequence -> Concurrency -> Loop -> BruteForcePO

pub mod base_case;
pub mod cuts;
pub mod fall_through;
pub mod from_dfg;
pub mod from_partial_orders;
pub mod ocel;
pub mod variants;

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
    BruteForce,
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
            DiscoveryVariant::BruteForce => "brute_force",
        }
    }

    pub fn from_variant_str(s: &str) -> Option<Self> {
        match s {
            "decision_graph_cyclic" => Some(DiscoveryVariant::DecisionGraphCyclic),
            "decision_graph_cyclic_strict" => Some(DiscoveryVariant::DecisionGraphCyclicStrict),
            "decision_graph_max" => Some(DiscoveryVariant::DecisionGraphMax),
            "decision_graph_clustering" => Some(DiscoveryVariant::DecisionGraphClustering),
            "dynamic_clustering" => Some(DiscoveryVariant::DynamicClustering),
            "maximal" => Some(DiscoveryVariant::Maximal),
            "tree" => Some(DiscoveryVariant::Tree),
            "brute_force" => Some(DiscoveryVariant::BruteForce),
            _ => None,
        }
    }

    /// 80/20: Simple flag-based variant differentiation
    pub fn uses_decision_graph_directly(&self) -> bool {
        matches!(
            self,
            DiscoveryVariant::DecisionGraphCyclic
                | DiscoveryVariant::DecisionGraphCyclicStrict
                | DiscoveryVariant::DecisionGraphMax
                | DiscoveryVariant::DecisionGraphClustering
        )
    }

    pub fn allows_concurrency(&self) -> bool {
        !matches!(self, DiscoveryVariant::Tree)
    }

    pub fn allows_loops(&self) -> bool {
        !matches!(self, DiscoveryVariant::Tree | DiscoveryVariant::Maximal)
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct DiscoveryConfig {
    pub activity_key: String,
    pub variant: DiscoveryVariant,
    pub min_trace_count: usize,
    pub noise_threshold: f64,
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

/// Individual cut types that can be attempted by the inductive miner.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CutType {
    Concurrency,
    Sequence,
    Loop,
    Xor,
    MaximalPartialOrder,
    DynamicClusteringPartialOrder,
    BruteForcePartialOrder,
}

/// Controls which cut types the inductive miner attempts and in what order.
#[derive(Clone, Debug)]
pub struct CutFilter {
    pub cut_order: Vec<CutType>,
    pub decision_graph_fall_through: bool,
    pub strict_mode: bool,
}

impl CutFilter {
    pub fn for_variant(variant: DiscoveryVariant) -> Self {
        match variant {
            DiscoveryVariant::Tree => Self {
                cut_order: vec![CutType::Xor, CutType::Sequence],
                decision_graph_fall_through: false,
                strict_mode: false,
            },
            DiscoveryVariant::Maximal => Self {
                cut_order: vec![
                    CutType::Xor,
                    CutType::Sequence,
                    CutType::Concurrency,
                    CutType::Loop,
                    CutType::MaximalPartialOrder,
                ],
                decision_graph_fall_through: false,
                strict_mode: false,
            },
            DiscoveryVariant::DynamicClustering => Self {
                cut_order: vec![
                    CutType::Xor,
                    CutType::Loop,
                    CutType::DynamicClusteringPartialOrder,
                ],
                decision_graph_fall_through: false,
                strict_mode: false,
            },
            DiscoveryVariant::BruteForce => Self {
                cut_order: vec![
                    CutType::Xor,
                    CutType::Sequence,
                    CutType::Concurrency,
                    CutType::Loop,
                    CutType::BruteForcePartialOrder,
                ],
                decision_graph_fall_through: false,
                strict_mode: false,
            },
            DiscoveryVariant::DecisionGraphMax => Self {
                cut_order: vec![
                    CutType::Xor,
                    CutType::Sequence,
                    CutType::Concurrency,
                    CutType::Loop,
                    CutType::MaximalPartialOrder,
                ],
                decision_graph_fall_through: true,
                strict_mode: false,
            },
            DiscoveryVariant::DecisionGraphClustering => Self {
                cut_order: vec![
                    CutType::Sequence,
                    CutType::Xor,
                    CutType::Loop,
                    CutType::DynamicClusteringPartialOrder,
                ],
                decision_graph_fall_through: true,
                strict_mode: false,
            },
            DiscoveryVariant::DecisionGraphCyclic => Self {
                cut_order: vec![
                    CutType::Xor,
                    CutType::Sequence,
                    CutType::Concurrency,
                    CutType::Loop,
                ],
                decision_graph_fall_through: true,
                strict_mode: false,
            },
            DiscoveryVariant::DecisionGraphCyclicStrict => Self {
                cut_order: vec![
                    CutType::Xor,
                    CutType::Sequence,
                    CutType::Concurrency,
                    CutType::Loop,
                ],
                decision_graph_fall_through: true,
                strict_mode: true,
            },
        }
    }
}

pub fn discover_powl(log: &EventLog, config: &DiscoveryConfig) -> Result<(PowlArena, u32), String> {
    let mut arena = PowlArena::new();
    let root = if config.from_dfg {
        discover_from_dfg(log, config, &mut arena)?
    } else {
        discover_from_traces(log, config, &mut arena)?
    };
    Ok((arena, root))
}

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
    let traces = group_traces_by_activity_sequence(log, &config.activity_key);
    let cut_filter = CutFilter::for_variant(config.variant);
    inductive_miner(&traces, arena, config, &cut_filter)
}

fn discover_from_dfg(
    log: &EventLog,
    config: &DiscoveryConfig,
    arena: &mut PowlArena,
) -> Result<u32, String> {
    let _dfg_edges = log.get_directly_follows(&config.activity_key);
    discover_from_traces(log, config, arena)
}

/// Inductive miner with CutFilter-based cut detection.
///
/// Following pm4py's CutFactory pattern, attempts cut types in the order
/// specified by the CutFilter, with decision graph or flower model fall-through.
pub(crate) fn inductive_miner(
    traces: &[Vec<String>],
    arena: &mut PowlArena,
    config: &DiscoveryConfig,
    cut_filter: &CutFilter,
) -> Result<u32, String> {
    for cut_type in &cut_filter.cut_order {
        let result = match cut_type {
            CutType::Concurrency => cuts::detect_concurrency_cut(traces, arena, config),
            CutType::Sequence => cuts::detect_sequence_cut(traces, arena, config),
            CutType::Loop => cuts::detect_loop_cut(traces, arena, config),
            CutType::Xor => cuts::detect_xor_cut(traces, arena, config),
            CutType::MaximalPartialOrder => {
                cuts::detect_maximal_partial_order_cut(traces, arena, config)
            }
            CutType::DynamicClusteringPartialOrder => {
                cuts::detect_dynamic_clustering_cut(traces, arena, config)
            }
            CutType::BruteForcePartialOrder => {
                cuts::detect_brute_force_partial_order_cut(traces, arena, config)
            }
        };
        if result.is_ok() {
            return result;
        }
    }

    // Fall-through: decision graph or flower model based on variant
    if cut_filter.decision_graph_fall_through {
        fall_through::decision_graph_fall_through(traces, arena, config)
    } else {
        fall_through::flower_model_fall_through(traces, arena, config)
    }
}

pub(crate) fn group_traces_by_activity_sequence(
    log: &EventLog,
    activity_key: &str,
) -> Vec<Vec<String>> {
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
    unique_traces.into_keys().collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_variant_serialization_roundtrip() {
        // Happy path: all 8 variants serialize/deserialize correctly
        let variants = [
            DiscoveryVariant::DecisionGraphCyclic,
            DiscoveryVariant::DecisionGraphCyclicStrict,
            DiscoveryVariant::DecisionGraphMax,
            DiscoveryVariant::DecisionGraphClustering,
            DiscoveryVariant::DynamicClustering,
            DiscoveryVariant::Maximal,
            DiscoveryVariant::Tree,
            DiscoveryVariant::BruteForce,
        ];
        for variant in variants {
            let s = variant.as_str();
            assert_eq!(DiscoveryVariant::from_variant_str(s), Some(variant));
        }
        // Edge case: invalid string returns None
        assert_eq!(DiscoveryVariant::from_variant_str("invalid"), None);
    }

    #[test]
    fn test_cut_filter_variant_configurations() {
        // Verify each variant has correct CutFilter configuration
        assert!(!CutFilter::for_variant(DiscoveryVariant::Tree)
            .cut_order
            .contains(&CutType::Concurrency)); // Tree: no concurrency
        assert!(CutFilter::for_variant(DiscoveryVariant::Maximal)
            .cut_order
            .contains(&CutType::MaximalPartialOrder)); // Maximal: has PO
        assert!(CutFilter::for_variant(DiscoveryVariant::BruteForce)
            .cut_order
            .contains(&CutType::BruteForcePartialOrder)); // BruteForce: has PO
        assert!(
            CutFilter::for_variant(DiscoveryVariant::DecisionGraphCyclic)
                .decision_graph_fall_through
        ); // DG: has fall-through
        assert!(CutFilter::for_variant(DiscoveryVariant::DecisionGraphCyclicStrict).strict_mode);
        // DGStrict: strict mode
    }

    #[test]
    fn test_variants_produce_different_configurations() {
        // Verify variants produce different CutFilter configurations
        let cf_tree = CutFilter::for_variant(DiscoveryVariant::Tree);
        let cf_max = CutFilter::for_variant(DiscoveryVariant::Maximal);
        let cf_dg = CutFilter::for_variant(DiscoveryVariant::DecisionGraphCyclic);
        assert_ne!(cf_tree.cut_order, cf_max.cut_order);
        assert_ne!(cf_tree.cut_order, cf_dg.cut_order);
        assert_ne!(cf_max.cut_order, cf_dg.cut_order);
    }
}
