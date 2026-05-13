/**
 * @wasm4pm/lifecycle — public API
 *
 * Complete RDF-driven lifecycle engine tying wasm4pm algorithms to unrdf's
 * RDF substrate. Generated lifecycle constants are defined in schema/domain.ttl
 * and precipitated via `ggen sync` (Rust) + this package (ESM/JS).
 */

export { LifecycleEngine } from './engine.mjs';
export { LifecycleMiner } from './mining.mjs';
export { XesEventLog, toXesEvent, fromJaegerSpans } from './xes.mjs';

// ─── Generated-from-RDF constants (ESM mirror of Rust generated types) ────────

/** Lifecycle stages in declared order. Mirrors Rust `LifecycleStage` enum. */
export const STAGES = Object.freeze({
  Spec:     { order: 1, spanName: 'lifecycle.spec',     xesActivity: 'Spec' },
  Generate: { order: 2, spanName: 'lifecycle.generate', xesActivity: 'Generate' },
  Test:     { order: 3, spanName: 'lifecycle.test',     xesActivity: 'Test' },
  Deploy:   { order: 4, spanName: 'lifecycle.deploy',   xesActivity: 'Deploy' },
  Monitor:  { order: 5, spanName: 'lifecycle.monitor',  xesActivity: 'Monitor' },
  Improve:  { order: 6, spanName: 'lifecycle.improve',  xesActivity: 'Improve' },
});

/** Valid stage transitions. Mirrors Rust `TRANSITIONS` constant. */
export const TRANSITIONS = Object.freeze([
  { label: 'Spec → Generate',   from: 'Spec',     to: 'Generate', guard: 'ontology_validates' },
  { label: 'Generate → Test',   from: 'Generate', to: 'Test',     guard: 'artifacts_emitted' },
  { label: 'Test → Deploy',     from: 'Test',     to: 'Deploy',   guard: 'all_tests_pass' },
  { label: 'Test → Spec',       from: 'Test',     to: 'Spec',     guard: 'tests_fail_rework_needed' },
  { label: 'Deploy → Monitor',  from: 'Deploy',   to: 'Monitor',  guard: 'artifacts_published' },
  { label: 'Monitor → Improve', from: 'Monitor',  to: 'Improve',  guard: 'event_log_populated' },
  { label: 'Improve → Spec',    from: 'Improve',  to: 'Spec',     guard: 'improvements_identified' },
]);

/** wasm4pm algorithm assignments per stage. Mirrors Rust `ALGORITHM_ASSIGNMENTS`. */
export const ALGORITHM_ASSIGNMENTS = Object.freeze([
  { stage: 'Monitor',  algorithmId: 'dfg_discovery',          algorithmLabel: 'Directly-Follows Graph Discovery', purpose: 'Build DFG from OTel-derived XES event log' },
  { stage: 'Improve',  algorithmId: 'alpha_miner',            algorithmLabel: 'Alpha Miner',                      purpose: 'Discover Petri net; compare against intended lifecycle' },
  { stage: 'Improve',  algorithmId: 'inductive_miner',        algorithmLabel: 'Inductive Miner',                  purpose: 'Produce sound process tree capturing loops and choices' },
  { stage: 'Improve',  algorithmId: 'token_replay_conformance', algorithmLabel: 'Token-Replay Conformance',       purpose: 'Score observed log against declared lifecycle model' },
  { stage: 'Improve',  algorithmId: 'drift_detection',        algorithmLabel: 'Concept Drift Detection',          purpose: 'Detect if lifecycle behaviour has shifted across sprints' },
  { stage: 'Test',     algorithmId: 'variant_analysis',       algorithmLabel: 'Variant Analysis',                 purpose: 'Count distinct test execution paths; flag variant explosion' },
]);

/** Returns true if `from → to` is a declared transition. */
export function isValidTransition(from, to) {
  return TRANSITIONS.some(t => t.from === from && t.to === to);
}

/** Returns all declared successor stages for a given stage name. */
export function successors(stage) {
  return TRANSITIONS.filter(t => t.from === stage).map(t => t.to);
}

/** Returns algorithm IDs assigned to a given stage. */
export function algorithmIdsForStage(stage) {
  return ALGORITHM_ASSIGNMENTS.filter(a => a.stage === stage).map(a => a.algorithmId);
}
