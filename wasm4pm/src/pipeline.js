/**
 * pipeline.ts
 * Pipeline resolver: translates config to executable steps
 * Maps StepType enums to WASM function names and orders execution dependencies
 */
import { StepType, resolveProfile } from './config.js';
import { Wasm4pmError, ErrorCode, ErrorRecovery } from './errors.js';
/**
 * Maps StepType to WASM function names
 * Each step type has a corresponding WASM function that implements it
 */
const STEP_TYPE_TO_WASM = {
  // Discovery algorithms
  [StepType.DFG]: 'discover_dfg',
  [StepType.ALPHA_PLUS_PLUS]: 'discover_alpha_plus_plus',
  [StepType.HEURISTIC_MINER]: 'discover_heuristic_miner',
  [StepType.INDUCTIVE_MINER]: 'discover_inductive_miner',
  [StepType.GENETIC]: 'discover_genetic',
  [StepType.PSO]: 'discover_pso',
  [StepType.A_STAR]: 'discover_astar',
  [StepType.ILP]: 'discover_ilp',
  [StepType.ACO]: 'discover_ant_colony',
  [StepType.SIMULATED_ANNEALING]: 'discover_simulated_annealing',
  // Analysis
  [StepType.STATISTICS]: 'analyze_statistics',
  [StepType.CONFORMANCE]: 'check_conformance',
  [StepType.VARIANTS]: 'analyze_variants',
  [StepType.PERFORMANCE]: 'analyze_performance',
  [StepType.CLUSTERING]: 'analyze_clustering',
  // Utilities
  [StepType.FILTER]: 'filter_log',
  [StepType.TRANSFORM]: 'transform_log',
  [StepType.VALIDATE]: 'validate_log',
};
/**
 * PipelineResolver translates Wasm4pmConfig to executable pipeline steps
 * Handles profile-based default resolution and custom pipeline compilation
 */
export class PipelineResolver {
  constructor() {
    this.stepTypeToWasm = { ...STEP_TYPE_TO_WASM };
  }
  /**
   * Resolves a configuration to an ordered list of executable pipeline steps
   * If custom pipeline is provided, uses it; otherwise resolves from execution profile
   *
   * @param config - The pipeline configuration
   * @returns Ordered array of executable pipeline steps
   * @throws Wasm4pmError if configuration is invalid or WASM bindings are missing
   */
  resolve(config) {
    // Get the pipeline to execute: either custom or profile-based
    let configSteps;
    if (config.pipeline && config.pipeline.length > 0) {
      // Custom pipeline provided
      configSteps = config.pipeline;
    } else {
      // Resolve pipeline from execution profile
      configSteps = resolveProfile(config.execution.profile);
    }
    // Transform config steps to executable steps with WASM bindings
    const executableSteps = [];
    for (const configStep of configSteps) {
      const wasmFunction = this.stepTypeToWasm[configStep.type];
      if (!wasmFunction) {
        throw new Wasm4pmError(
          `No WASM binding for step type: ${configStep.type}`,
          ErrorCode.CONFIG_INVALID,
          {
            nextAction: ErrorRecovery.CONTACT_SUPPORT,
            context: {
              stepType: configStep.type,
              availableTypes: Object.keys(this.stepTypeToWasm),
            },
          }
        );
      }
      const executableStep = {
        stepId: configStep.id,
        type: configStep.type,
        wasmFunction,
        params: configStep.parameters || {},
        dependencies: configStep.dependsOn || [],
        timeout: config.execution.timeoutMs,
        retryable: !configStep.required, // Required steps don't retry
        required: configStep.required,
      };
      executableSteps.push(executableStep);
    }
    // Validate that dependencies are satisfied
    this.validateDependencies(executableSteps);
    // Return topologically sorted steps
    return topologicalSort(executableSteps);
  }
  /**
   * Validates that all dependencies between steps exist and don't form cycles
   *
   * @param steps - Array of steps to validate
   * @throws Wasm4pmError if dependencies are invalid
   */
  validateDependencies(steps) {
    const stepIds = new Set(steps.map((s) => s.stepId));
    for (const step of steps) {
      for (const dep of step.dependencies) {
        if (!stepIds.has(dep)) {
          throw new Wasm4pmError(
            `Step "${step.stepId}" depends on non-existent step "${dep}"`,
            ErrorCode.CONFIG_INVALID,
            {
              nextAction: ErrorRecovery.RECONFIGURE,
              context: {
                step: step.stepId,
                missingDependency: dep,
                availableSteps: Array.from(stepIds),
              },
            }
          );
        }
      }
    }
  }
  /**
   * Returns available step types
   */
  getAvailableStepTypes() {
    return Object.keys(this.stepTypeToWasm);
  }
  /**
   * Gets the WASM function name for a given step type
   */
  getWasmFunction(stepType) {
    return this.stepTypeToWasm[stepType];
  }
}
/**
 * Topologically sorts pipeline steps based on dependencies
 * Ensures steps execute in correct order without circular dependencies
 *
 * @param steps - Array of executable steps
 * @returns Dependency-ordered array of steps
 * @throws Wasm4pmError if circular dependencies are detected
 */
export function topologicalSort(steps) {
  const stepMap = new Map(steps.map((s) => [s.stepId, s]));
  const visited = new Set();
  const sorted = [];
  const recursionStack = new Set();
  function visit(stepId) {
    if (visited.has(stepId)) {
      return;
    }
    if (recursionStack.has(stepId)) {
      throw new Wasm4pmError(
        `Circular dependency detected in pipeline: ${stepId}`,
        ErrorCode.EXECUTION_FAILED,
        {
          nextAction: ErrorRecovery.RECONFIGURE,
          context: { step: stepId },
        }
      );
    }
    recursionStack.add(stepId);
    const step = stepMap.get(stepId);
    if (step) {
      for (const dep of step.dependencies) {
        visit(dep);
      }
    }
    recursionStack.delete(stepId);
    visited.add(stepId);
    if (step) {
      sorted.push(step);
    }
  }
  for (const step of steps) {
    visit(step.stepId);
  }
  return sorted;
}
/**
 * Extracts all transitive dependencies for a given step
 * Useful for understanding the full execution context
 *
 * @param stepId - The step ID to analyze
 * @param steps - All available steps
 * @returns Set of all steps that must complete before this step
 */
export function getTransitiveDependencies(stepId, steps) {
  const stepMap = new Map(steps.map((s) => [s.stepId, s]));
  const dependencies = new Set();
  function collectDeps(id) {
    const step = stepMap.get(id);
    if (!step) return;
    for (const dep of step.dependencies) {
      if (!dependencies.has(dep)) {
        dependencies.add(dep);
        collectDeps(dep);
      }
    }
  }
  collectDeps(stepId);
  return dependencies;
}
//# sourceMappingURL=pipeline.js.map
