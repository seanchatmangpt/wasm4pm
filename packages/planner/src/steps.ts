/**
 * Execution plan steps for wasm4pm process mining pipeline
 */

/**
 * Type of execution step
 */
export enum PlanStepType {
  // Initialization and setup
  BOOTSTRAP = 'bootstrap',
  INIT_WASM = 'init_wasm',

  // Source loading
  LOAD_SOURCE = 'load_source',
  VALIDATE_SOURCE = 'validate_source',

  // Discovery algorithms
  DISCOVER_DFG = 'discover_dfg',
  DISCOVER_PROCESS_SKELETON = 'discover_process_skeleton',
  DISCOVER_ALPHA_PLUS_PLUS = 'discover_alpha_plus_plus',
  DISCOVER_HEURISTIC = 'discover_heuristic',
  DISCOVER_INDUCTIVE = 'discover_inductive',
  DISCOVER_HILL_CLIMBING = 'discover_hill_climbing',
  DISCOVER_DECLARE = 'discover_declare',
  DISCOVER_GENETIC = 'discover_genetic',
  DISCOVER_PSO = 'discover_pso',
  DISCOVER_A_STAR = 'discover_a_star',
  DISCOVER_ILP = 'discover_ilp',
  DISCOVER_ACO = 'discover_aco',
  DISCOVER_SIMULATED_ANNEALING = 'discover_simulated_annealing',
  DISCOVER_OPTIMIZED_DFG = 'discover_optimized_dfg',

  // POWL Discovery
  DISCOVER_POWL = 'discover_powl',
  DISCOVER_POWL_TREE = 'discover_powl_tree',
  DISCOVER_POWL_MAXIMAL = 'discover_powl_maximal',
  DISCOVER_POWL_DYNAMIC_CLUSTERING = 'discover_powl_dynamic_clustering',
  DISCOVER_POWL_DECISION_GRAPH_MAX = 'discover_powl_decision_graph_max',
  DISCOVER_POWL_DECISION_GRAPH_CLUSTERING = 'discover_powl_decision_graph_clustering',
  DISCOVER_POWL_DECISION_GRAPH_CYCLIC = 'discover_powl_decision_graph_cyclic',
  DISCOVER_POWL_DECISION_GRAPH_CYCLIC_STRICT = 'discover_powl_decision_graph_cyclic_strict',

  // Analysis
  ANALYZE_STATISTICS = 'analyze_statistics',
  ANALYZE_CONFORMANCE = 'analyze_conformance',
  ANALYZE_VARIANTS = 'analyze_variants',
  ANALYZE_PERFORMANCE = 'analyze_performance',
  ANALYZE_CLUSTERING = 'analyze_clustering',

  // ML Analysis
  ML_CLASSIFY = 'ml_classify',
  ML_CLUSTER = 'ml_cluster',
  ML_FORECAST = 'ml_forecast',
  ML_ANOMALY = 'ml_anomaly',
  ML_REGRESS = 'ml_regress',
  ML_PCA = 'ml_pca',

  // Utilities
  FILTER_LOG = 'filter_log',
  TRANSFORM_LOG = 'transform_log',

  // Output and cleanup
  GENERATE_REPORTS = 'generate_reports',
  WRITE_SINK = 'write_sink',
  CLEANUP = 'cleanup',
}

/**
 * Execution plan step
 */
export interface PlanStep {
  /** Unique identifier for this step */
  id: string;

  /** Type of step */
  type: PlanStepType;

  /** Human-readable description */
  description: string;

  /** Whether this step must complete before proceeding */
  required: boolean;

  /** Parameters for this step */
  parameters: Record<string, unknown>;

  /** IDs of steps that must complete before this one */
  dependsOn: string[];

  /** Whether this step can be parallelized with others */
  parallelizable: boolean;

  /** Estimated execution time in milliseconds */
  estimatedDurationMs?: number;

  /** Memory estimate in MB */
  estimatedMemoryMB?: number;
}

/**
 * Creates a bootstrap step
 */
export function createBootstrapStep(): PlanStep {
  return {
    id: 'bootstrap',
    type: PlanStepType.BOOTSTRAP,
    description: 'Initialize execution environment',
    required: true,
    parameters: {},
    dependsOn: [],
    parallelizable: false,
    estimatedDurationMs: 50,
    estimatedMemoryMB: 10,
  };
}

/**
 * Creates a WASM initialization step
 */
export function createInitWasmStep(): PlanStep {
  return {
    id: 'init_wasm',
    type: PlanStepType.INIT_WASM,
    description: 'Initialize WASM module',
    required: true,
    parameters: {},
    dependsOn: ['bootstrap'],
    parallelizable: false,
    estimatedDurationMs: 100,
    estimatedMemoryMB: 50,
  };
}

/**
 * Creates a source loading step
 */
export function createLoadSourceStep(sourceFormat: string): PlanStep {
  return {
    id: 'load_source',
    type: PlanStepType.LOAD_SOURCE,
    description: `Load source data from ${sourceFormat}`,
    required: true,
    parameters: { format: sourceFormat },
    dependsOn: ['init_wasm'],
    parallelizable: false,
    estimatedDurationMs: 200,
    estimatedMemoryMB: 100,
  };
}

/**
 * Creates a source validation step
 */
export function createValidateSourceStep(): PlanStep {
  return {
    id: 'validate_source',
    type: PlanStepType.VALIDATE_SOURCE,
    description: 'Validate source data integrity',
    required: true,
    parameters: {},
    dependsOn: ['load_source'],
    parallelizable: false,
    estimatedDurationMs: 100,
    estimatedMemoryMB: 0,
  };
}

/**
 * Creates an algorithm discovery step
 */
export function createAlgorithmStep(
  algorithmName: string,
  stepType: PlanStepType,
  parameters: Record<string, unknown> = {},
  required: boolean = true,
  dependsOn: string[] = ['validate_source'],
  parallelizable: boolean = true
): PlanStep {
  const id = `discover_${algorithmName.toLowerCase().replace(/\s+/g, '_')}`;

  return {
    id,
    type: stepType,
    description: `Run ${algorithmName} discovery algorithm`,
    required,
    parameters,
    dependsOn,
    parallelizable,
    estimatedDurationMs: 500,
    estimatedMemoryMB: 200,
  };
}

/**
 * Creates an analysis step
 */
export function createAnalysisStep(
  analysisName: string,
  stepType: PlanStepType,
  parameters: Record<string, unknown> = {},
  dependsOn: string[] = ['validate_source'],
  parallelizable: boolean = true
): PlanStep {
  const id = `analyze_${analysisName.toLowerCase().replace(/\s+/g, '_')}`;

  return {
    id,
    type: stepType,
    description: `Perform ${analysisName} analysis`,
    required: false,
    parameters,
    dependsOn,
    parallelizable,
    estimatedDurationMs: 300,
    estimatedMemoryMB: 100,
  };
}

/**
 * Creates a report generation step
 */
export function createGenerateReportsStep(
  resultDependencies: string[]
): PlanStep {
  return {
    id: 'generate_reports',
    type: PlanStepType.GENERATE_REPORTS,
    description: 'Generate visual reports and documentation',
    required: false,
    parameters: {
      formats: ['html', 'mermaid', 'd3'],
    },
    dependsOn: resultDependencies,
    parallelizable: false,
    estimatedDurationMs: 300,
    estimatedMemoryMB: 150,
  };
}

/**
 * Creates a sink write step
 */
export function createSinkStep(sinkFormat: string, resultDependencies: string[]): PlanStep {
  return {
    id: 'write_sink',
    type: PlanStepType.WRITE_SINK,
    description: `Write results to ${sinkFormat} sink`,
    required: false,
    parameters: { format: sinkFormat },
    dependsOn: resultDependencies,
    parallelizable: false,
    estimatedDurationMs: 200,
    estimatedMemoryMB: 50,
  };
}

/**
 * Creates a cleanup step
 */
export function createCleanupStep(allPreviousSteps: string[]): PlanStep {
  return {
    id: 'cleanup',
    type: PlanStepType.CLEANUP,
    description: 'Clean up resources and free memory',
    required: false,
    parameters: {},
    dependsOn: allPreviousSteps,
    parallelizable: false,
    estimatedDurationMs: 50,
    estimatedMemoryMB: 0,
  };
}
