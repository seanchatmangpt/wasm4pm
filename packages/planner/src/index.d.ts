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
export { plan, toContractsPlan, PlannerError, type Config, type ExecutionPlan } from './planner.js';
export { explain, explainBrief } from './explain.js';
export { topologicalSort, hasCycle, getDependencies, getDependents, validateDAG, type DAG } from './dag.js';
export { type PlanStep, PlanStepType, createBootstrapStep, createInitWasmStep, createLoadSourceStep, createValidateSourceStep, createAlgorithmStep, createAnalysisStep, createGenerateReportsStep, createSinkStep, createCleanupStep, } from './steps.js';
export { validatePlan, assertPlanValid, validateSourceSinkCompatibility, type ValidationError } from './validation.js';
export { selectEngineByPriority, selectAlgorithmByBudget, shouldPromoteJob, shouldDegradeAlgorithm, profileToExecutionMode, profileToLatencyBudget, profileToQualityFloor, type BackendId, type AlgorithmFamily, type AlgorithmId, } from './policy.js';
//# sourceMappingURL=index.d.ts.map