//! Discovery variants for inductive miner.
//!
//! Each variant delegates to `inductive_miner()` in `mod.rs` with a
//! variant-specific `CutFilter`. The cut filter controls which cut types
//! are attempted and in what order, following the pm4py CutFactory pattern.

use super::{CutFilter, DiscoveryConfig};
use crate::models::EventLog;
use crate::powl_arena::PowlArena;

pub fn apply_variant(
    log: &EventLog,
    config: &DiscoveryConfig,
    arena: &mut PowlArena,
) -> Result<u32, String> {
    let traces = super::group_traces_by_activity_sequence(log, &config.activity_key);
    let cut_filter = CutFilter::for_variant(config.variant);
    super::inductive_miner(&traces, arena, config, &cut_filter)
}

#[cfg(test)]
mod tests {
    use super::super::DiscoveryVariant;
    use super::*;

    #[test]
    fn test_tree_variant_applies() {
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
            DiscoveryVariant::BruteForce,
        ];

        for variant in variants {
            let s = variant.as_str();
            assert!(!s.is_empty());
            assert!(DiscoveryVariant::from_variant_str(s) == Some(variant));
        }
    }

    #[test]
    fn test_brute_force_variant_has_string_representation() {
        assert_eq!(DiscoveryVariant::BruteForce.as_str(), "brute_force");
        assert_eq!(
            DiscoveryVariant::from_variant_str("brute_force"),
            Some(DiscoveryVariant::BruteForce)
        );
    }
}
