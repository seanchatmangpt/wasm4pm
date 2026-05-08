// GENERATED — DO NOT EDIT — source: schema/domain.ttl
// Run `ggen sync` in lifecycle/ to regenerate.

use crate::stages::LifecycleStage;

/// Maps a wasm4pm algorithm to the lifecycle stage where it is applied.
#[derive(Debug, Clone)]
pub struct AlgorithmAssignment {
    pub stage: LifecycleStage,
    /// Stable algorithm ID matching the wasm4pm kernel registry.
    pub algorithm_id: &'static str,
    pub algorithm_label: &'static str,
    /// Why this algorithm is applied at this stage.
    pub purpose: &'static str,
}

/// All algorithm-to-stage assignments declared in the RDF ontology.
pub const ALGORITHM_ASSIGNMENTS: &[AlgorithmAssignment] = &[

    AlgorithmAssignment {
        stage:           LifecycleStage::Improve,
        algorithm_id:    "alpha_miner",
        algorithm_label: "Alpha Miner",
        purpose:         "Discover Petri net from event log; compare against intended lifecycle Petri net.",
    },

    AlgorithmAssignment {
        stage:           LifecycleStage::Improve,
        algorithm_id:    "drift_detection",
        algorithm_label: "Concept Drift Detection",
        purpose:         "Detect if lifecycle behaviour has shifted across sprints/releases.",
    },

    AlgorithmAssignment {
        stage:           LifecycleStage::Improve,
        algorithm_id:    "inductive_miner",
        algorithm_label: "Inductive Miner",
        purpose:         "Produce sound process tree capturing loops, choices, and parallelism.",
    },

    AlgorithmAssignment {
        stage:           LifecycleStage::Improve,
        algorithm_id:    "token_replay_conformance",
        algorithm_label: "Token-Replay Conformance",
        purpose:         "Score observed event log against the declared lifecycle model; surface deviating cases.",
    },

    AlgorithmAssignment {
        stage:           LifecycleStage::Monitor,
        algorithm_id:    "dfg_discovery",
        algorithm_label: "Directly-Follows Graph Discovery",
        purpose:         "Build DFG from OTel-derived XES event log to visualise actual stage flow.",
    },

    AlgorithmAssignment {
        stage:           LifecycleStage::Test,
        algorithm_id:    "variant_analysis",
        algorithm_label: "Variant Analysis",
        purpose:         "Count distinct test execution paths; flag variant explosion as a process smell.",
    },

];

/// Returns all algorithm assignments for the given lifecycle stage.
pub fn algorithms_for_stage(stage: LifecycleStage) -> Vec<&'static AlgorithmAssignment> {
    ALGORITHM_ASSIGNMENTS
        .iter()
        .filter(|a| a.stage == stage)
        .collect()
}

/// Returns algorithm IDs (for kernel dispatch) for the given stage.
pub fn algorithm_ids_for_stage(stage: LifecycleStage) -> Vec<&'static str> {
    ALGORITHM_ASSIGNMENTS
        .iter()
        .filter(|a| a.stage == stage)
        .map(|a| a.algorithm_id)
        .collect()
}
