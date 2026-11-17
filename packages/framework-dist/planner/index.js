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
// Core planning API
export { plan, toContractsPlan, PlannerError, } from './planner.js';
export { explain, explainBrief, explainStructured } from './explain.js';
// Discovery-algorithm search space (speed/quality tiers, complexity, scaling, noise robustness).
// Exported as ALGORITHM_PROFILES for AutoPM scoring (alias of the internal ALGORITHM_HINTS table).
export { ALGORITHM_HINTS, ALGORITHM_HINTS as ALGORITHM_PROFILES } from './explain.js';
// Multi-algorithm planning
export { planMultiAlgorithm } from './multi-algorithm.js';
// DAG utilities
export { topologicalSort, hasCycle, getDependencies, getDependents, validateDAG, } from './dag.js';
// Step types and factories
export { PlanStepType, createBootstrapStep, createInitWasmStep, createLoadSourceStep, createValidateSourceStep, createAlgorithmStep, createAnalysisStep, createGenerateReportsStep, createSinkStep, createCleanupStep, } from './steps.js';
// Validation utilities
export { validatePlan, assertPlanValid, validateSourceSinkCompatibility, } from './validation.js';
// Algorithm recommendation (suggest goal → ranked algorithm list)
export { getSuggestions, getAnalysisRecommendations, normaliseGoal, VALID_GOALS, } from './suggestions.js';
// Policy and budget enforcement (Section 4 — Planner Policy and Budget Enforcement)
export { selectEngineByPriority, selectAlgorithmByBudget, shouldPromoteJob, shouldDegradeAlgorithm, profileToExecutionMode, profileToLatencyBudget, profileToQualityFloor, } from './policy.js';
// AutoML layers (bench-calibrated cost model, receipt-corpus meta-learning, drift)
export { ALGO_BENCH_COSTS, estimateDurationMs, benchSpeedScore, benchSpeedTier, } from './benchmark-costs.js';
export { readAlgoBehaviorCases, readRuntimeCases, mergeMetaCases, } from './receipt-reader.js';
// Aliased: kernel exports a heuristic recommendAlgorithm(LogProfile)
export { recommendAlgorithm as recommendAlgorithmMeta, } from './meta-learner.js';
export { checkCostModelDrift } from './cost-drift.js';
//# sourceMappingURL=index.js.map