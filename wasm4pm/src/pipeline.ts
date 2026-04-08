/**
 * pipeline.ts
 * Pipeline resolver: translates config to executable steps
 * Maps StepType enums to WASM function names and orders execution dependencies
 */

import {
  PictlConfig,
  StepType,
  ExecutionProfile,
  resolveProfile,
  PipelineStep as ConfigPipelineStep,
} from './config.js';
import { PictlError, ErrorCode, ErrorRecovery } from './errors.js';

/**
 * Represents a single executable step in the pipeline with WASM binding details
 */
export interface ExecutableStep {
  stepId: string; // Unique step identifier from config
  type: StepType; // Step type enum
  wasmFunction: string; // Name of WASM function to call
  params: Record<string, unknown>; // Parameters to pass to WASM function
  dependencies: string[]; // Step IDs that must complete first
  timeout?: number; // Optional timeout in ms
  retryable: boolean; // Whether step can be retried on failure
  required: boolean; // Whether this step is required
}

/**
 * Maps StepType to WASM function names
 * Each step type has a corresponding WASM function that implements it
 */
const STEP_TYPE_TO_WASM: Record<StepType, string> = {
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
 * PipelineResolver translates PictlConfig to executable pipeline steps
 * Handles profile-based default resolution and custom pipeline compilation
 */
export class PipelineResolver {
  private stepTypeToWasm: Record<StepType, string>;

  constructor() {
    this.stepTypeToWasm = { ...STEP_TYPE_TO_WASM };
  }

  /**
   * Resolves a configuration to an ordered list of executable pipeline steps
   * If custom pipeline is provided, uses it; otherwise resolves from execution profile
   *
   * @param config - The pipeline configuration
   * @returns Ordered array of executable pipeline steps
   * @throws PictlError if configuration is invalid or WASM bindings are missing
   */
  resolve(config: PictlConfig): ExecutableStep[] {
    // Get the pipeline to execute: either custom or profile-based
    let configSteps: ConfigPipelineStep[];

    if (config.pipeline && config.pipeline.length > 0) {
      // Custom pipeline provided
      configSteps = config.pipeline;
    } else {
      // Resolve pipeline from execution profile
      configSteps = resolveProfile(config.execution.profile);
    }

    // Transform config steps to executable steps with WASM bindings
    const executableSteps: ExecutableStep[] = [];

    for (const configStep of configSteps) {
      const wasmFunction = this.stepTypeToWasm[configStep.type];

      if (!wasmFunction) {
        throw new PictlError(
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

      const executableStep: ExecutableStep = {
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
   * @throws PictlError if dependencies are invalid
   */
  private validateDependencies(steps: ExecutableStep[]): void {
    const stepIds = new Set(steps.map((s) => s.stepId));

    for (const step of steps) {
      for (const dep of step.dependencies) {
        if (!stepIds.has(dep)) {
          throw new PictlError(
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
  getAvailableStepTypes(): StepType[] {
    return Object.keys(this.stepTypeToWasm) as StepType[];
  }

  /**
   * Gets the WASM function name for a given step type
   */
  getWasmFunction(stepType: StepType): string | undefined {
    return this.stepTypeToWasm[stepType];
  }
}

/**
 * Topologically sorts pipeline steps based on dependencies
 * Ensures steps execute in correct order without circular dependencies
 *
 * @param steps - Array of executable steps
 * @returns Dependency-ordered array of steps
 * @throws PictlError if circular dependencies are detected
 */
export function topologicalSort(steps: ExecutableStep[]): ExecutableStep[] {
  const stepMap = new Map(steps.map((s) => [s.stepId, s]));
  const visited = new Set<string>();
  const sorted: ExecutableStep[] = [];
  const recursionStack = new Set<string>();

  function visit(stepId: string) {
    if (visited.has(stepId)) {
      return;
    }

    if (recursionStack.has(stepId)) {
      throw new PictlError(
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
export function getTransitiveDependencies(stepId: string, steps: ExecutableStep[]): Set<string> {
  const stepMap = new Map(steps.map((s) => [s.stepId, s]));
  const dependencies = new Set<string>();

  function collectDeps(id: string) {
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
