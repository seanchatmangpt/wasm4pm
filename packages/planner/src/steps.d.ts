/**
 * Execution plan steps for wasm4pm process mining pipeline
 */
/**
 * Type of execution step
 */
export declare enum PlanStepType {
  BOOTSTRAP = 'bootstrap',
  INIT_WASM = 'init_wasm',
  LOAD_SOURCE = 'load_source',
  VALIDATE_SOURCE = 'validate_source',
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
  DISCOVER_TRANSITION_SYSTEM = 'discover_transition_system',
  DISCOVER_LOG_TO_TRIE = 'discover_log_to_trie',
  DISCOVER_CAUSAL_GRAPH = 'discover_causal_graph',
  DISCOVER_PERFORMANCE_SPECTRUM = 'discover_performance_spectrum',
  DISCOVER_BATCHES = 'discover_batches',
  DISCOVER_GENERALIZATION = 'discover_generalization',
  DISCOVER_ETCONFORMANCE_PRECISION = 'discover_etconformance_precision',
  DISCOVER_CORRELATION_MINER = 'discover_correlation_miner',
  DISCOVER_COMPLEXITY_METRICS = 'discover_complexity_metrics',
  DISCOVER_PETRI_NET_REDUCTION = 'discover_petri_net_reduction',
  DISCOVER_ALIGNMENT_FITNESS = 'discover_alignment_fitness',
  IMPORT_PNML = 'import_pnml',
  IMPORT_BPMN = 'import_bpmn',
  CONVERT_POWL_TO_PROCESS_TREE = 'convert_powl_to_process_tree',
  EXPORT_YAWL = 'export_yawl',
  SIMULATE_PLAYOUT = 'simulate_playout',
  SIMULATE_MONTE_CARLO = 'simulate_monte_carlo',
  DISCOVER_POWL = 'discover_powl',
  DISCOVER_POWL_TREE = 'discover_powl_tree',
  DISCOVER_POWL_MAXIMAL = 'discover_powl_maximal',
  DISCOVER_POWL_DYNAMIC_CLUSTERING = 'discover_powl_dynamic_clustering',
  DISCOVER_POWL_DECISION_GRAPH_MAX = 'discover_powl_decision_graph_max',
  DISCOVER_POWL_DECISION_GRAPH_CLUSTERING = 'discover_powl_decision_graph_clustering',
  DISCOVER_POWL_DECISION_GRAPH_CYCLIC = 'discover_powl_decision_graph_cyclic',
  DISCOVER_POWL_DECISION_GRAPH_CYCLIC_STRICT = 'discover_powl_decision_graph_cyclic_strict',
  ANALYZE_STATISTICS = 'analyze_statistics',
  ANALYZE_CONFORMANCE = 'analyze_conformance',
  ANALYZE_VARIANTS = 'analyze_variants',
  ANALYZE_PERFORMANCE = 'analyze_performance',
  ANALYZE_CLUSTERING = 'analyze_clustering',
  ML_CLASSIFY = 'ml_classify',
  ML_CLUSTER = 'ml_cluster',
  ML_FORECAST = 'ml_forecast',
  ML_ANOMALY = 'ml_anomaly',
  ML_REGRESS = 'ml_regress',
  ML_PCA = 'ml_pca',
  FILTER_LOG = 'filter_log',
  TRANSFORM_LOG = 'transform_log',
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
 * @internal
 */
export declare function createBootstrapStep(): PlanStep;
/**
 * Creates a WASM initialization step
 * @internal
 */
export declare function createInitWasmStep(): PlanStep;
/**
 * Creates a source loading step
 * @internal
 */
export declare function createLoadSourceStep(sourceFormat: string): PlanStep;
/**
 * Creates a source validation step
 * @internal
 */
export declare function createValidateSourceStep(): PlanStep;
/**
 * Creates an algorithm discovery step
 * @internal
 */
export declare function createAlgorithmStep(
  algorithmName: string,
  stepType: PlanStepType,
  parameters?: Record<string, unknown>,
  required?: boolean,
  dependsOn?: string[],
  parallelizable?: boolean
): PlanStep;
/**
 * Creates an analysis step
 * @internal
 */
export declare function createAnalysisStep(
  analysisName: string,
  stepType: PlanStepType,
  parameters?: Record<string, unknown>,
  dependsOn?: string[],
  parallelizable?: boolean
): PlanStep;
/**
 * Creates a report generation step
 * @internal
 */
export declare function createGenerateReportsStep(resultDependencies: string[]): PlanStep;
/**
 * Creates a sink write step
 * @internal
 */
export declare function createSinkStep(sinkFormat: string, resultDependencies: string[]): PlanStep;
/**
 * Creates a cleanup step
 * @internal
 */
export declare function createCleanupStep(allPreviousSteps: string[]): PlanStep;
//# sourceMappingURL=steps.d.ts.map
