/**
 * @wasm4pm/planner - Execution plan generation for wasm4pm
 *
 * Generates deterministic, reproducible execution plans from process mining configurations.
 *
 * Core API:
 * - plan(config) -> ExecutionPlan: Generate an execution plan from configuration
 * - explain(config) -> string: Generate human-readable plan explanation
 * - validatePlan(plan) -> string[]: Validate plan structure
 * - toContractsPlan(plan) -> Plan: Convert to contracts Plan schema
 *
 * Types:
 * - ExecutionPlan: Complete plan with steps, graph, and metadata
 * - PlanStep: Individual execution step with dependencies
 * - DAG: Directed acyclic graph of step dependencies
 * - Config: Process mining configuration
 * - PlannerError: Typed error with ErrorInfo from contracts
 *
 * Per PRD §11: explain() == run()
 * The same plan is used for both explanation and execution
 */
export { plan, toContractsPlan, PlannerError, type Config, type ExecutionPlan, type AlternativePlan, type QualityPrediction, } from './planner.js';
export { explain, explainBrief, explainStructured, type ExplainResult } from './explain.js';
export { ALGORITHM_HINTS, ALGORITHM_HINTS as ALGORITHM_PROFILES, type AlgorithmHints } from './explain.js';
export { planMultiAlgorithm, type MultiAlgorithmPlan, type AlgorithmPlanEntry } from './multi-algorithm.js';
/**
 * PlannerLike interface — satisfied by both the synchronous plan() function
 * and any async implementation.
 *
 * Per CLAUDE.md: '../planner/index.js's plan() is synchronous (no async), but
 * PlannerLike accepts either."
 *
 * Usage:
 *   import type { PlannerLike } from '../planner/index.js';
 *   function createEngine(planner: PlannerLike) { ... }
 *
 * The default export of this package (the synchronous `plan` function) satisfies
 * this interface. Async wrappers (e.g. in the engine) also satisfy it.
 */
export interface PlannerLike {
    plan(config: import('./planner.js').Config): import('./planner.js').ExecutionPlan | Promise<import('./planner.js').ExecutionPlan>;
}
export { topologicalSort, hasCycle, getDependencies, getDependents, validateDAG, type DAG, } from './dag.js';
export { type PlanStep, PlanStepType, createBootstrapStep, createInitWasmStep, createLoadSourceStep, createValidateSourceStep, createAlgorithmStep, createAnalysisStep, createGenerateReportsStep, createSinkStep, createCleanupStep, } from './steps.js';
export { validatePlan, assertPlanValid, validateSourceSinkCompatibility, type ValidationError, } from './validation.js';
export { getSuggestions, getAnalysisRecommendations, normaliseGoal, VALID_GOALS, type LogStats as SuggestionLogStats, type SuggestionGoal, type AlgorithmRecommendation, type AnalysisRecommendation, } from './suggestions.js';
export { selectEngineByPriority, selectAlgorithmByBudget, shouldPromoteJob, shouldDegradeAlgorithm, profileToExecutionMode, profileToLatencyBudget, profileToQualityFloor, type BackendId, type AlgorithmFamily, type AlgorithmId, } from './policy.js';
export { ALGO_BENCH_COSTS, estimateDurationMs, benchSpeedScore, benchSpeedTier, type AlgoBenchCost, } from './benchmark-costs.js';
export { readAlgoBehaviorCases, readRuntimeCases, mergeMetaCases, type MetaCase, } from './receipt-reader.js';
export { recommendAlgorithm as recommendAlgorithmMeta, type MetaRecommendation, } from './meta-learner.js';
export { checkCostModelDrift, type CostDriftSignal } from './cost-drift.js';
//# sourceMappingURL=index.d.ts.map