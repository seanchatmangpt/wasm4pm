/**
 * Execution plan steps for wasm4pm process mining pipeline
 */
/**
 * Type of execution step
 */
export var PlanStepType;
(function (PlanStepType) {
    // Initialization and setup
    PlanStepType["BOOTSTRAP"] = "bootstrap";
    PlanStepType["INIT_WASM"] = "init_wasm";
    // Source loading
    PlanStepType["LOAD_SOURCE"] = "load_source";
    PlanStepType["VALIDATE_SOURCE"] = "validate_source";
    // Discovery algorithms
    PlanStepType["DISCOVER_DFG"] = "discover_dfg";
    PlanStepType["DISCOVER_PROCESS_SKELETON"] = "discover_process_skeleton";
    PlanStepType["DISCOVER_ALPHA_PLUS_PLUS"] = "discover_alpha_plus_plus";
    PlanStepType["DISCOVER_HEURISTIC"] = "discover_heuristic";
    PlanStepType["DISCOVER_INDUCTIVE"] = "discover_inductive";
    PlanStepType["DISCOVER_HILL_CLIMBING"] = "discover_hill_climbing";
    PlanStepType["DISCOVER_DECLARE"] = "discover_declare";
    PlanStepType["DISCOVER_GENETIC"] = "discover_genetic";
    PlanStepType["DISCOVER_PSO"] = "discover_pso";
    PlanStepType["DISCOVER_A_STAR"] = "discover_a_star";
    PlanStepType["DISCOVER_ILP"] = "discover_ilp";
    PlanStepType["DISCOVER_ACO"] = "discover_aco";
    PlanStepType["DISCOVER_SIMULATED_ANNEALING"] = "discover_simulated_annealing";
    PlanStepType["DISCOVER_OPTIMIZED_DFG"] = "discover_optimized_dfg";
    PlanStepType["DISCOVER_SIMD_STREAMING_DFG"] = "discover_simd_streaming_dfg";
    // Wave 1 Discovery
    PlanStepType["DISCOVER_TRANSITION_SYSTEM"] = "discover_transition_system";
    PlanStepType["DISCOVER_LOG_TO_TRIE"] = "discover_log_to_trie";
    PlanStepType["DISCOVER_CAUSAL_GRAPH"] = "discover_causal_graph";
    PlanStepType["DISCOVER_PERFORMANCE_SPECTRUM"] = "discover_performance_spectrum";
    PlanStepType["DISCOVER_BATCHES"] = "discover_batches";
    PlanStepType["DISCOVER_GENERALIZATION"] = "discover_generalization";
    PlanStepType["DISCOVER_ETCONFORMANCE_PRECISION"] = "discover_etconformance_precision";
    PlanStepType["DISCOVER_CORRELATION_MINER"] = "discover_correlation_miner";
    PlanStepType["DISCOVER_COMPLEXITY_METRICS"] = "discover_complexity_metrics";
    PlanStepType["DISCOVER_PETRI_NET_REDUCTION"] = "discover_petri_net_reduction";
    PlanStepType["DISCOVER_ALIGNMENT_FITNESS"] = "discover_alignment_fitness";
    // Wave 1 Import/Export
    PlanStepType["IMPORT_PNML"] = "import_pnml";
    PlanStepType["IMPORT_BPMN"] = "import_bpmn";
    PlanStepType["CONVERT_POWL_TO_PROCESS_TREE"] = "convert_powl_to_process_tree";
    PlanStepType["EXPORT_YAWL"] = "export_yawl";
    // Wave 1 Simulation
    PlanStepType["SIMULATE_PLAYOUT"] = "simulate_playout";
    PlanStepType["SIMULATE_MONTE_CARLO"] = "simulate_monte_carlo";
    // POWL Discovery
    PlanStepType["DISCOVER_POWL"] = "discover_powl";
    PlanStepType["DISCOVER_POWL_TREE"] = "discover_powl_tree";
    PlanStepType["DISCOVER_POWL_MAXIMAL"] = "discover_powl_maximal";
    PlanStepType["DISCOVER_POWL_DYNAMIC_CLUSTERING"] = "discover_powl_dynamic_clustering";
    PlanStepType["DISCOVER_POWL_DECISION_GRAPH_MAX"] = "discover_powl_decision_graph_max";
    PlanStepType["DISCOVER_POWL_DECISION_GRAPH_CLUSTERING"] = "discover_powl_decision_graph_clustering";
    PlanStepType["DISCOVER_POWL_DECISION_GRAPH_CYCLIC"] = "discover_powl_decision_graph_cyclic";
    PlanStepType["DISCOVER_POWL_DECISION_GRAPH_CYCLIC_STRICT"] = "discover_powl_decision_graph_cyclic_strict";
    // Analysis
    PlanStepType["ANALYZE_STATISTICS"] = "analyze_statistics";
    PlanStepType["ANALYZE_CONFORMANCE"] = "analyze_conformance";
    PlanStepType["ANALYZE_VARIANTS"] = "analyze_variants";
    PlanStepType["ANALYZE_PERFORMANCE"] = "analyze_performance";
    PlanStepType["ANALYZE_CLUSTERING"] = "analyze_clustering";
    // ML Analysis
    PlanStepType["ML_CLASSIFY"] = "ml_classify";
    PlanStepType["ML_CLUSTER"] = "ml_cluster";
    PlanStepType["ML_FORECAST"] = "ml_forecast";
    PlanStepType["ML_ANOMALY"] = "ml_anomaly";
    PlanStepType["ML_REGRESS"] = "ml_regress";
    PlanStepType["ML_PCA"] = "ml_pca";
    // Utilities
    PlanStepType["FILTER_LOG"] = "filter_log";
    PlanStepType["TRANSFORM_LOG"] = "transform_log";
    // Output and cleanup
    PlanStepType["GENERATE_REPORTS"] = "generate_reports";
    PlanStepType["WRITE_SINK"] = "write_sink";
    PlanStepType["CLEANUP"] = "cleanup";
})(PlanStepType || (PlanStepType = {}));
/**
 * Creates a bootstrap step
 * @internal
 */
export function createBootstrapStep() {
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
 * @internal
 */
export function createInitWasmStep() {
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
 * @internal
 */
export function createLoadSourceStep(sourceFormat) {
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
 * @internal
 */
export function createValidateSourceStep() {
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
 * @internal
 */
export function createAlgorithmStep(algorithmName, stepType, parameters = {}, required = true, dependsOn = ['validate_source'], parallelizable = true) {
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
 * @internal
 */
export function createAnalysisStep(analysisName, stepType, parameters = {}, dependsOn = ['validate_source'], parallelizable = true) {
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
 * @internal
 */
export function createGenerateReportsStep(resultDependencies) {
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
 * @internal
 */
export function createSinkStep(sinkFormat, resultDependencies) {
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
 * @internal
 */
export function createCleanupStep(allPreviousSteps) {
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
//# sourceMappingURL=steps.js.map