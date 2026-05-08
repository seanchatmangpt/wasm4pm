// GENERATED — DO NOT EDIT — source: schema/domain.ttl
// Run `ggen sync` in lifecycle/ to regenerate.

/** wasm4pm algorithm assignments per lifecycle stage. Mirrors Rust `ALGORITHM_ASSIGNMENTS`. */
export const ALGORITHM_ASSIGNMENTS = Object.freeze([

  { stage: 'Improve', algorithmId: 'alpha_miner', algorithmLabel: 'Alpha Miner', purpose: 'Discover Petri net from event log; compare against intended lifecycle Petri net.' },

  { stage: 'Improve', algorithmId: 'drift_detection', algorithmLabel: 'Concept Drift Detection', purpose: 'Detect if lifecycle behaviour has shifted across sprints/releases.' },

  { stage: 'Improve', algorithmId: 'inductive_miner', algorithmLabel: 'Inductive Miner', purpose: 'Produce sound process tree capturing loops, choices, and parallelism.' },

  { stage: 'Improve', algorithmId: 'token_replay_conformance', algorithmLabel: 'Token-Replay Conformance', purpose: 'Score observed event log against the declared lifecycle model; surface deviating cases.' },

  { stage: 'Monitor', algorithmId: 'dfg_discovery', algorithmLabel: 'Directly-Follows Graph Discovery', purpose: 'Build DFG from OTel-derived XES event log to visualise actual stage flow.' },

  { stage: 'Test', algorithmId: 'variant_analysis', algorithmLabel: 'Variant Analysis', purpose: 'Count distinct test execution paths; flag variant explosion as a process smell.' },

]);

/** Returns algorithm IDs assigned to a given stage. */
export function algorithmIdsForStage(stage) {
  return ALGORITHM_ASSIGNMENTS.filter(a => a.stage === stage).map(a => a.algorithmId);
}
