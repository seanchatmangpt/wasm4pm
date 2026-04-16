/**
 * @pictl/planner - Execution plan generation for wasm4pm
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
export { plan, toContractsPlan, PlannerError } from './planner';
export { explain, explainBrief } from './explain';
// DAG utilities
export { topologicalSort, hasCycle, getDependencies, getDependents, validateDAG } from './dag';
// Step types and factories
export { PlanStepType, createBootstrapStep, createInitWasmStep, createLoadSourceStep, createValidateSourceStep, createAlgorithmStep, createAnalysisStep, createGenerateReportsStep, createSinkStep, createCleanupStep, } from './steps';
// Validation utilities
export { validatePlan, assertPlanValid, validateSourceSinkCompatibility } from './validation';
//# sourceMappingURL=index.js.map