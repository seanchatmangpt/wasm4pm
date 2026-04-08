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
export { plan, toContractsPlan, PlannerError, type Config, type ExecutionPlan } from './planner';
export { explain, explainBrief } from './explain';

// DAG utilities
export { topologicalSort, hasCycle, getDependencies, getDependents, validateDAG, type DAG } from './dag';

// Step types and factories
export {
  type PlanStep,
  PlanStepType,
  createBootstrapStep,
  createInitWasmStep,
  createLoadSourceStep,
  createValidateSourceStep,
  createAlgorithmStep,
  createAnalysisStep,
  createGenerateReportsStep,
  createSinkStep,
  createCleanupStep,
} from './steps';

// Validation utilities
export { validatePlan, assertPlanValid, validateSourceSinkCompatibility, type ValidationError } from './validation';
