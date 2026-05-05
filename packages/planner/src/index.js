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
export { plan, toContractsPlan, PlannerError } from './planner.js';
export { explain, explainBrief } from './explain.js';
// DAG utilities
export { topologicalSort, hasCycle, getDependencies, getDependents, validateDAG } from './dag.js';
// Step types and factories
export { PlanStepType, createBootstrapStep, createInitWasmStep, createLoadSourceStep, createValidateSourceStep, createAlgorithmStep, createAnalysisStep, createGenerateReportsStep, createSinkStep, createCleanupStep, } from './steps.js';
// Validation utilities
export { validatePlan, assertPlanValid, validateSourceSinkCompatibility } from './validation.js';
// Policy and budget enforcement (Section 4 — Planner Policy and Budget Enforcement)
export { selectEngineByPriority, selectAlgorithmByBudget, shouldPromoteJob, shouldDegradeAlgorithm, profileToExecutionMode, profileToLatencyBudget, profileToQualityFloor, } from './policy.js';
//# sourceMappingURL=index.js.map