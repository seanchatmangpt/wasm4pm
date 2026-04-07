/**
 * handlers.ts
 * Algorithm step handlers - execute algorithm steps from execution plans
 * Bridge between planner (algorithm name) and WASM module (function calls)
 */

import { PlanStepType, type PlanStep } from '@wasm4pm/planner';
import { getRegistry } from './registry';

/**
 * WASM module interface - defines all discoverable WASM functions
 * Maps to the actual wasm4pm Rust module compiled to JavaScript
 */
export interface WasmModule {
  // Basic discovery
  discover_dfg(eventlog_handle: string, activity_key: string): Promise<{ handle: string }>;

  discover_ocel_dfg(ocel_handle: string): Promise<{ handle: string }>;

  discover_ocel_dfg_per_type(ocel_handle: string): Promise<{ handle: string }>;

  // Alpha++ (improved Alpha algorithm)
  discover_alpha_plus_plus(eventlog_handle: string, activity_key: string): Promise<{ handle: string }>;

  // Heuristic Miner
  discover_heuristic_miner(
    eventlog_handle: string,
    activity_key: string,
    dependency_threshold: number
  ): Promise<{ handle: string }>;

  // Inductive Miner
  discover_inductive_miner(
    eventlog_handle: string,
    activity_key: string,
    noise_threshold: number
  ): Promise<{ handle: string }>;

  // Genetic Algorithm
  discover_genetic_algorithm(
    eventlog_handle: string,
    activity_key: string,
    population_size: number,
    generations: number
  ): Promise<{ handle: string }>;

  // PSO (Particle Swarm Optimization)
  discover_pso_algorithm(
    eventlog_handle: string,
    activity_key: string,
    swarm_size: number,
    iterations: number
  ): Promise<{ handle: string }>;

  // A* Search
  discover_astar(
    eventlog_handle: string,
    activity_key: string,
    max_iterations: number
  ): Promise<{ handle: string }>;

  // Hill Climbing
  discover_hill_climbing(
    eventlog_handle: string,
    activity_key: string,
    max_iterations: number
  ): Promise<{ handle: string }>;

  // ILP (Integer Linear Programming)
  discover_ilp_petri_net(
    eventlog_handle: string,
    activity_key: string,
    timeout_seconds: number
  ): Promise<{ handle: string }>;

  // Ant Colony Optimization
  discover_ant_colony(
    eventlog_handle: string,
    activity_key: string,
    colony_size: number,
    iterations: number
  ): Promise<{ handle: string }>;

  // Simulated Annealing
  discover_simulated_annealing(
    eventlog_handle: string,
    activity_key: string,
    initial_temperature: number,
    cooling_rate: number
  ): Promise<{ handle: string }>;

  // Declare (constraint-based)
  discover_declare(
    eventlog_handle: string,
    activity_key: string,
    support_threshold: number
  ): Promise<{ handle: string }>;

  // Optimized DFG (ILP variant)
  discover_optimized_dfg(
    eventlog_handle: string,
    activity_key: string,
    timeout_seconds: number
  ): Promise<{ handle: string }>;

  // POWL Discovery - 8 inductive miner variants
  discover_powl_from_log(
    log_json: string,
    variant: string
  ): Promise<{ root: number; node_count: number; repr: string; variant: string }>;

  discover_powl_from_log_config(
    log_json: string,
    activity_key: string,
    variant: string,
    min_trace_count: number,
    noise_threshold: number
  ): Promise<{
    root: number;
    node_count: number;
    repr: string;
    variant: string;
    config: {
      activity_key: string;
      min_trace_count: number;
      noise_threshold: number;
    };
  }>;
}

/**
 * Algorithm step execution output
 */
export interface AlgorithmStepOutput {
  /** Model handle returned by WASM function */
  modelHandle: string;

  /** Algorithm that was executed */
  algorithm: string;

  /** Output type produced */
  outputType: string;

  /** Execution time in milliseconds */
  executionTimeMs: number;

  /** Parameters used */
  parameters: Record<string, unknown>;

  /** Metadata about the result */
  metadata?: Record<string, unknown>;
}

/**
 * Map PlanStepType to algorithm ID
 */
function stepTypeToAlgorithmId(stepType: PlanStepType): string {
  const mapping: Record<PlanStepType, string> = {
    [PlanStepType.DISCOVER_DFG]: 'dfg',
    [PlanStepType.DISCOVER_PROCESS_SKELETON]: 'process_skeleton',
    [PlanStepType.DISCOVER_ALPHA_PLUS_PLUS]: 'alpha_plus_plus',
    [PlanStepType.DISCOVER_HEURISTIC]: 'heuristic_miner',
    [PlanStepType.DISCOVER_INDUCTIVE]: 'inductive_miner',
    [PlanStepType.DISCOVER_HILL_CLIMBING]: 'hill_climbing',
    [PlanStepType.DISCOVER_DECLARE]: 'declare',
    [PlanStepType.DISCOVER_GENETIC]: 'genetic_algorithm',
    [PlanStepType.DISCOVER_PSO]: 'pso',
    [PlanStepType.DISCOVER_A_STAR]: 'a_star',
    [PlanStepType.DISCOVER_ILP]: 'ilp',
    [PlanStepType.DISCOVER_ACO]: 'aco',
    [PlanStepType.DISCOVER_SIMULATED_ANNEALING]: 'simulated_annealing',
    [PlanStepType.DISCOVER_OPTIMIZED_DFG]: 'optimized_dfg',
    // POWL Discovery
    [PlanStepType.DISCOVER_POWL]: 'powl',
    [PlanStepType.DISCOVER_POWL_TREE]: 'powl_tree',
    [PlanStepType.DISCOVER_POWL_MAXIMAL]: 'powl_maximal',
    [PlanStepType.DISCOVER_POWL_DYNAMIC_CLUSTERING]: 'powl_dynamic_clustering',
    [PlanStepType.DISCOVER_POWL_DECISION_GRAPH_MAX]: 'powl_decision_graph_max',
    [PlanStepType.DISCOVER_POWL_DECISION_GRAPH_CLUSTERING]: 'powl_decision_graph_clustering',
    [PlanStepType.DISCOVER_POWL_DECISION_GRAPH_CYCLIC]: 'powl_decision_graph_cyclic',
    [PlanStepType.DISCOVER_POWL_DECISION_GRAPH_CYCLIC_STRICT]: 'powl_decision_graph_cyclic_strict',
    // Map these to non-discovery types (won't be found)
    [PlanStepType.BOOTSTRAP]: 'unknown',
    [PlanStepType.INIT_WASM]: 'unknown',
    [PlanStepType.LOAD_SOURCE]: 'unknown',
    [PlanStepType.VALIDATE_SOURCE]: 'unknown',
    [PlanStepType.ANALYZE_STATISTICS]: 'unknown',
    [PlanStepType.ANALYZE_CONFORMANCE]: 'unknown',
    [PlanStepType.ANALYZE_VARIANTS]: 'unknown',
    [PlanStepType.ANALYZE_PERFORMANCE]: 'unknown',
    [PlanStepType.ANALYZE_CLUSTERING]: 'unknown',
    [PlanStepType.FILTER_LOG]: 'unknown',
    [PlanStepType.TRANSFORM_LOG]: 'unknown',
    [PlanStepType.GENERATE_REPORTS]: 'unknown',
    [PlanStepType.WRITE_SINK]: 'unknown',
    [PlanStepType.CLEANUP]: 'unknown',
    // ML Analysis
    [PlanStepType.ML_CLASSIFY]: 'ml_classify',
    [PlanStepType.ML_CLUSTER]: 'ml_cluster',
    [PlanStepType.ML_FORECAST]: 'ml_forecast',
    [PlanStepType.ML_ANOMALY]: 'ml_anomaly',
    [PlanStepType.ML_REGRESS]: 'ml_regress',
    [PlanStepType.ML_PCA]: 'ml_pca',
  };

  return mapping[stepType] || 'unknown';
}

/**
 * Execute an algorithm step from an execution plan
 * Loads the WASM module, validates algorithm, and calls appropriate WASM function
 *
 * @param step Execution plan step (must be a discovery step)
 * @param wasmModule Initialized WASM module
 * @param eventLogHandle Handle to the loaded event log
 * @returns AlgorithmStepOutput with model handle and metadata
 * @throws Error if algorithm not found, WASM call fails, or validation fails
 */
export async function implementAlgorithmStep(
  step: PlanStep,
  wasmModule: WasmModule,
  eventLogHandle: string
): Promise<AlgorithmStepOutput> {
  const startTime = Date.now();

  // Extract algorithm type from step type
  const algorithmId = stepTypeToAlgorithmId(step.type as PlanStepType);

  // Look up algorithm metadata
  const registry = getRegistry();
  const metadata = registry.get(algorithmId);

  if (!metadata) {
    throw new Error(
      `Algorithm not found in registry: ${algorithmId} (step type: ${step.type}). ` +
        `Available algorithms: ${registry.list().map((a) => a.id).join(', ')}`
    );
  }

  // Extract parameters from step
  const params = step.parameters || {};
  const activityKey = (params.activity_key as string) || 'concept:name';

  // Validate required parameters
  for (const paramDef of metadata.parameters) {
    if (paramDef.required && !(paramDef.name in params)) {
      throw new Error(
        `Missing required parameter "${paramDef.name}" for algorithm "${metadata.name}". ` +
          `Expected type: ${paramDef.type}`
      );
    }
  }

  // Execute the appropriate WASM function
  let modelHandle: string;

  try {
    switch (algorithmId) {
      case 'dfg': {
        const result = await wasmModule.discover_dfg(eventLogHandle, activityKey);
        modelHandle = result.handle;
        break;
      }

      case 'process_skeleton': {
        // Process skeleton is actually DFG with minimal parameters
        const result = await wasmModule.discover_dfg(eventLogHandle, activityKey);
        modelHandle = result.handle;
        break;
      }

      case 'alpha_plus_plus': {
        const result = await wasmModule.discover_alpha_plus_plus(eventLogHandle, activityKey);
        modelHandle = result.handle;
        break;
      }

      case 'heuristic_miner': {
        const depThreshold = (params.dependency_threshold as number) || 0.5;
        const result = await wasmModule.discover_heuristic_miner(
          eventLogHandle,
          activityKey,
          depThreshold
        );
        modelHandle = result.handle;
        break;
      }

      case 'inductive_miner': {
        const noiseThreshold = (params.noise_threshold as number) || 0.2;
        const result = await wasmModule.discover_inductive_miner(
          eventLogHandle,
          activityKey,
          noiseThreshold
        );
        modelHandle = result.handle;
        break;
      }

      case 'genetic_algorithm': {
        const popSize = (params.population_size as number) || 50;
        const generations = (params.generations as number) || 100;
        const result = await wasmModule.discover_genetic_algorithm(
          eventLogHandle,
          activityKey,
          popSize,
          generations
        );
        modelHandle = result.handle;
        break;
      }

      case 'pso': {
        const swarmSize = (params.swarm_size as number) || 30;
        const iterations = (params.iterations as number) || 50;
        const result = await wasmModule.discover_pso_algorithm(
          eventLogHandle,
          activityKey,
          swarmSize,
          iterations
        );
        modelHandle = result.handle;
        break;
      }

      case 'a_star': {
        const maxIterations = (params.max_iterations as number) || 10000;
        const result = await wasmModule.discover_astar(
          eventLogHandle,
          activityKey,
          maxIterations
        );
        modelHandle = result.handle;
        break;
      }

      case 'hill_climbing': {
        const maxIterations = (params.max_iterations as number) || 100;
        const result = await wasmModule.discover_hill_climbing(
          eventLogHandle,
          activityKey,
          maxIterations
        );
        modelHandle = result.handle;
        break;
      }

      case 'ilp': {
        const timeout = (params.timeout_seconds as number) || 30;
        const result = await wasmModule.discover_ilp_petri_net(
          eventLogHandle,
          activityKey,
          timeout
        );
        modelHandle = result.handle;
        break;
      }

      case 'aco': {
        const colonySize = (params.colony_size as number) || 40;
        const iterations = (params.iterations as number) || 100;
        const result = await wasmModule.discover_ant_colony(
          eventLogHandle,
          activityKey,
          colonySize,
          iterations
        );
        modelHandle = result.handle;
        break;
      }

      case 'simulated_annealing': {
        const initialTemp = (params.initial_temperature as number) || 100;
        const coolingRate = (params.cooling_rate as number) || 0.95;
        const result = await wasmModule.discover_simulated_annealing(
          eventLogHandle,
          activityKey,
          initialTemp,
          coolingRate
        );
        modelHandle = result.handle;
        break;
      }

      case 'declare': {
        const supportThreshold = (params.support_threshold as number) || 0.8;
        const result = await wasmModule.discover_declare(
          eventLogHandle,
          activityKey,
          supportThreshold
        );
        modelHandle = result.handle;
        break;
      }

      case 'optimized_dfg': {
        const timeout = (params.timeout_seconds as number) || 15;
        const result = await wasmModule.discover_optimized_dfg(
          eventLogHandle,
          activityKey,
          timeout
        );
        modelHandle = result.handle;
        break;
      }

      // POWL Discovery variants
      case 'powl':
      case 'powl_tree':
      case 'powl_maximal':
      case 'powl_dynamic_clustering':
      case 'powl_decision_graph_max':
      case 'powl_decision_graph_clustering':
      case 'powl_decision_graph_cyclic':
      case 'powl_decision_graph_cyclic_strict': {
        // POWL discovery requires log JSON instead of handle
        // We need to get the log JSON from the event log handle first
        // For now, we'll use the basic discover_powl_from_log function
        const variant = (params.variant as string) || 'decision_graph_cyclic';

        // Get log JSON from WASM module (need to serialize the event log)
        // For now, we'll need to handle this differently since POWL functions take JSON
        const logJson = params.log_json as string;

        if (!logJson) {
          throw new Error(
            `POWL discovery requires log_json parameter. ` +
            `Use Kernel.run_powl() instead of Kernel.run() for POWL discovery.`
          );
        }

        const powlResult = await wasmModule.discover_powl_from_log(logJson, variant);

        // Store the POWL result as a handle
        // POWL results include: root, node_count, repr, variant
        modelHandle = JSON.stringify(powlResult);
        break;
      }

      default:
        throw new Error(
          `Unsupported algorithm: ${algorithmId}. ` +
            `Available: ${registry.list().map((a) => a.id).join(', ')}`
        );
    }

    // Validate output
    if (!modelHandle || typeof modelHandle !== 'string') {
      throw new Error(
        `Invalid model handle returned by WASM function. Expected string, got: ${typeof modelHandle}`
      );
    }

    const executionTimeMs = Date.now() - startTime;

    return {
      modelHandle,
      algorithm: metadata.id,
      outputType: metadata.outputType,
      executionTimeMs,
      parameters: {
        activity_key: activityKey,
        ...Object.fromEntries(
          Object.entries(params).filter(([key]) => key !== 'activity_key')
        ),
      },
      metadata: {
        algorithmName: metadata.name,
        complexity: metadata.complexity,
        speedTier: metadata.speedTier,
        qualityTier: metadata.qualityTier,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Provide helpful error messages
    if (errorMessage.includes('not found')) {
      throw new Error(
        `WASM function for algorithm "${algorithmId}" not found. ` +
          `Check that WASM module is properly initialized and contains this function.`
      );
    }

    if (errorMessage.includes('not an EventLog')) {
      throw new Error(
        `Invalid event log handle: "${eventLogHandle}". ` +
          `Make sure an event log was loaded before running discovery algorithms.`
      );
    }

    throw new Error(
      `Failed to execute algorithm "${algorithmId}" (${metadata.name}): ${errorMessage}`
    );
  }
}

/**
 * Get the list of all registered algorithms
 */
export function listAlgorithms(): Array<{
  id: string;
  name: string;
  outputType: string;
  complexity: string;
}> {
  const registry = getRegistry();
  return registry.list().map((algo) => ({
    id: algo.id,
    name: algo.name,
    outputType: algo.outputType,
    complexity: algo.complexity,
  }));
}

/**
 * Validate algorithm parameters
 */
export function validateAlgorithmParameters(
  algorithmId: string,
  parameters: Record<string, unknown>
): { valid: boolean; errors: string[] } {
  const registry = getRegistry();
  const metadata = registry.get(algorithmId);

  if (!metadata) {
    return {
      valid: false,
      errors: [`Algorithm not found: ${algorithmId}`],
    };
  }

  const errors: string[] = [];

  for (const paramDef of metadata.parameters) {
    const paramValue = parameters[paramDef.name];

    // Check required
    if (paramDef.required && paramValue === undefined) {
      errors.push(`Missing required parameter: ${paramDef.name}`);
      continue;
    }

    // Check type
    if (paramValue !== undefined && typeof paramValue !== paramDef.type) {
      errors.push(
        `Parameter "${paramDef.name}" has wrong type. ` +
          `Expected ${paramDef.type}, got ${typeof paramValue}`
      );
      continue;
    }

    // Check number range
    if (paramDef.type === 'number' && typeof paramValue === 'number') {
      if (paramDef.min !== undefined && paramValue < paramDef.min) {
        errors.push(`Parameter "${paramDef.name}" is below minimum: ${paramDef.min}`);
      }
      if (paramDef.max !== undefined && paramValue > paramDef.max) {
        errors.push(`Parameter "${paramDef.name}" is above maximum: ${paramDef.max}`);
      }
    }

    // Check options
    if (paramDef.type === 'select' && paramDef.options) {
      if (paramValue !== undefined && !paramDef.options.includes(paramValue)) {
        errors.push(
          `Parameter "${paramDef.name}" has invalid value. ` +
            `Must be one of: ${paramDef.options.join(', ')}`
        );
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
