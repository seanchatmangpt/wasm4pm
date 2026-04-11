/**
 * Plan step type values shared across @pictl/planner and @pictl/testing.
 *
 * Extracted here to break the circular dependency: testing tests planner,
 * so testing cannot import from planner. Both can safely import from contracts.
 *
 * The 14 discover_* values correspond to KernelAlgorithm individuals in the ostar
 * ontology and are reflected in ALGORITHM_ID_TO_STEP_TYPE from @pictl/templates.
 * The remaining 13 lifecycle/analysis values are structural and not yet in the ontology.
 */
export const PLAN_STEP_TYPE_VALUES = [
    // Initialization and setup
    'bootstrap',
    'init_wasm',
    // Source loading
    'load_source',
    'validate_source',
    // Discovery algorithms (14 — derived from KernelAlgorithm ontology individuals)
    'discover_dfg',
    'discover_process_skeleton',
    'discover_alpha_plus_plus',
    'discover_heuristic',
    'discover_inductive',
    'discover_hill_climbing',
    'discover_declare',
    'discover_genetic',
    'discover_pso',
    'discover_a_star',
    'discover_ilp',
    'discover_aco',
    'discover_simulated_annealing',
    'discover_optimized_dfg',
    // Wave 1 Discovery
    'discover_transition_system',
    'discover_log_to_trie',
    'discover_causal_graph',
    'discover_performance_spectrum',
    'discover_batches',
    'discover_generalization',
    'discover_etconformance_precision',
    'discover_correlation_miner',
    'discover_complexity_metrics',
    'discover_petri_net_reduction',
    'discover_alignment_fitness',
    // Wave 1 Import/Export
    'import_pnml',
    'import_bpmn',
    'convert_powl_to_process_tree',
    'export_yawl',
    // Wave 1 Simulation
    'simulate_playout',
    'simulate_monte_carlo',
    // POWL Discovery
    'discover_powl',
    'discover_powl_tree',
    'discover_powl_maximal',
    'discover_powl_dynamic_clustering',
    'discover_powl_decision_graph_max',
    'discover_powl_decision_graph_clustering',
    'discover_powl_decision_graph_cyclic',
    'discover_powl_decision_graph_cyclic_strict',
    // Analysis
    'analyze_statistics',
    'analyze_conformance',
    'analyze_variants',
    'analyze_performance',
    'analyze_clustering',
    // ML Analysis
    'ml_classify',
    'ml_cluster',
    'ml_forecast',
    'ml_anomaly',
    'ml_regress',
    'ml_pca',
    // Utilities
    'filter_log',
    'transform_log',
    // Output and cleanup
    'generate_reports',
    'write_sink',
    'cleanup',
];
//# sourceMappingURL=steps.js.map