/**
 * Plan step type values shared across @wasm4pm/planner and @wasm4pm/testing.
 *
 * Extracted here to break the circular dependency: testing tests planner,
 * so testing cannot import from planner. Both can safely import from contracts.
 *
 * The 14 discover_* values correspond to KernelAlgorithm individuals in the ostar
 * ontology and are reflected in ALGORITHM_ID_TO_STEP_TYPE from @wasm4pm/templates.
 * The remaining 13 lifecycle/analysis values are structural and not yet in the ontology.
 */
export declare const PLAN_STEP_TYPE_VALUES: readonly ["bootstrap", "init_wasm", "load_source", "validate_source", "discover_dfg", "discover_process_skeleton", "discover_alpha_plus_plus", "discover_heuristic", "discover_inductive", "discover_hill_climbing", "discover_declare", "discover_genetic", "discover_pso", "discover_a_star", "discover_ilp", "discover_aco", "discover_simulated_annealing", "discover_optimized_dfg", "analyze_statistics", "analyze_conformance", "analyze_variants", "analyze_performance", "analyze_clustering", "filter_log", "transform_log", "generate_reports", "write_sink", "cleanup"];
export type PlanStepTypeValue = typeof PLAN_STEP_TYPE_VALUES[number];
//# sourceMappingURL=steps.d.ts.map