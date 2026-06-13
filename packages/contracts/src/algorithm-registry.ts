// Algorithm contracts — generated from wasm4pm pi ontology. Regenerate with: ggen sync

import type { AlgorithmId } from './algorithm-ids';
import { ALGORITHM_IDS, ALGORITHM_CLI_ALIASES } from './algorithm-ids';

export { ALGORITHM_IDS };

/**
 * Maps algorithm registry ID to WASM export function name.
 * Generated from pi:wasmExport in ggen/ontology/algorithms.ttl.
 */
export const WASM_FUNCTION_NAMES: Record<AlgorithmId, string> = {
  "agentic_pipeline": "run_agentic_pipeline",
  "alignments": "compute_alignments",
  "complexity_metrics": "compute_complexity_metrics",
  "etconformance_precision": "compute_align_etconformance_precision",
  "generalization": "generalization",
  "a_star": "discover_a_star",
  "aco": "discover_aco",
  "alpha_plus_plus": "discover_alpha_plus_plus",
  "declare": "discover_declare",
  "dfg": "discover_dfg",
  "genetic_algorithm": "discover_genetic_algorithm",
  "heuristic_miner": "discover_heuristic_miner",
  "hierarchical_dfg": "discover_hierarchical_dfg",
  "hill_climbing": "discover_hill_climbing",
  "ilp": "discover_ilp_petri_net",
  "inductive_miner": "discover_inductive_miner",
  "log_to_trie": "discover_log_to_trie",
  "optimized_dfg": "discover_dfg",
  "process_skeleton": "discover_process_skeleton",
  "pso": "discover_pso",
  "simd_streaming_dfg": "discover_dfg_simd",
  "simulated_annealing": "discover_simulated_annealing",
  "smart_engine": "discover_smart_engine",
  "streaming_log": "discover_dfg",
  "transition_system": "discover_transition_system",
  "analyze_process_speedup": "analyze_process_speedup",
  "analyze_variant_complexity": "analyze_variant_complexity",
  "batches": "analyze_batches",
  "causal_graph": "compute_causal_graph",
  "compute_activity_transition_matrix": "compute_activity_transition_matrix",
  "compute_trace_similarity_matrix": "compute_trace_similarity_matrix",
  "correlation_miner": "compute_correlation_miner",
  "handover_network": "compute_handover_network",
  "performance_spectrum": "compute_performance_spectrum",
  "working_together_network": "compute_working_together_network",
  "bpmn_import": "read_bpmn",
  "pnml_import": "from_pnml_wasm",
  "powl_to_process_tree": "convert_powl_to_process_tree",
  "yawl_export": "export_yawl",
  "automl_classify": "automl_classify",
  "automl_forecast": "automl_forecast",
  "ml_anomaly": "ml_anomaly",
  "ml_classify": "ml_classify",
  "ml_cluster": "ml_cluster",
  "ml_forecast": "ml_forecast",
  "ml_pca": "ml_pca",
  "ml_regress": "ml_regress",
  "ocel_dfg": "discover_ocel_dfg",
  "ocel_dfg_per_type": "discover_ocel_dfg_per_type",
  "ocel_encode": "encode_ocel",
  "ocel_oc_declare": "discover_ocel_oc_declare",
  "ocel_ocla": "discover_ocel_ocla",
  "ocel_petri_net": "discover_ocel_petri_net",
  "compute_ewma": "compute_ewma",
  "detect_drift": "detect_drift",
  "predict_next_activity": "predict_next_activity",
  "predict_outcome": "predict_outcome",
  "predict_remaining_time": "predict_case_duration",
  "monte_carlo_simulation": "monte_carlo_simulation",
  "playout": "petri_net_playout",
};

/**
 * Maps algorithm registry ID to process model output type.
 * Generated from pi:outputType in ggen/ontology/algorithms.ttl.
 */
export const ALGORITHM_OUTPUT_TYPES: Record<AlgorithmId, string> = {
  "agentic_pipeline": "model",
  "alignments": "analytics",
  "complexity_metrics": "analytics",
  "etconformance_precision": "analytics",
  "generalization": "analytics",
  "a_star": "petrinet",
  "aco": "petrinet",
  "alpha_plus_plus": "petrinet",
  "declare": "declare",
  "dfg": "dfg",
  "genetic_algorithm": "petrinet",
  "heuristic_miner": "petrinet",
  "hierarchical_dfg": "dfg",
  "hill_climbing": "petrinet",
  "ilp": "petrinet",
  "inductive_miner": "tree",
  "log_to_trie": "tree",
  "optimized_dfg": "dfg",
  "process_skeleton": "dfg",
  "pso": "petrinet",
  "simd_streaming_dfg": "dfg",
  "simulated_annealing": "petrinet",
  "smart_engine": "model",
  "streaming_log": "dfg",
  "transition_system": "model",
  "analyze_process_speedup": "analytics",
  "analyze_variant_complexity": "analytics",
  "batches": "analytics",
  "causal_graph": "analytics",
  "compute_activity_transition_matrix": "analytics",
  "compute_trace_similarity_matrix": "analytics",
  "correlation_miner": "analytics",
  "handover_network": "analytics",
  "performance_spectrum": "analytics",
  "working_together_network": "analytics",
  "bpmn_import": "tree",
  "pnml_import": "petrinet",
  "powl_to_process_tree": "tree",
  "yawl_export": "model",
  "automl_classify": "ml_result",
  "automl_forecast": "ml_result",
  "ml_anomaly": "ml_result",
  "ml_classify": "ml_result",
  "ml_cluster": "ml_result",
  "ml_forecast": "ml_result",
  "ml_pca": "ml_result",
  "ml_regress": "ml_result",
  "ocel_dfg": "dfg",
  "ocel_dfg_per_type": "dfg",
  "ocel_encode": "ml_result",
  "ocel_oc_declare": "declare",
  "ocel_ocla": "analytics",
  "ocel_petri_net": "petrinet",
  "compute_ewma": "analytics",
  "detect_drift": "analytics",
  "predict_next_activity": "ml_result",
  "predict_outcome": "ml_result",
  "predict_remaining_time": "ml_result",
  "monte_carlo_simulation": "analytics",
  "playout": "analytics",
};

/**
 * Maps algorithm registry ID to functional category.
 * Generated from pi:category in ggen/ontology/algorithms.ttl.
 */
export const ALGORITHM_CATEGORIES: Record<AlgorithmId, string> = {
  "agentic_pipeline": "agentic",
  "alignments": "conformance",
  "complexity_metrics": "conformance",
  "etconformance_precision": "conformance",
  "generalization": "conformance",
  "a_star": "discovery",
  "aco": "discovery",
  "alpha_plus_plus": "discovery",
  "declare": "discovery",
  "dfg": "discovery",
  "genetic_algorithm": "discovery",
  "heuristic_miner": "discovery",
  "hierarchical_dfg": "discovery",
  "hill_climbing": "discovery",
  "ilp": "discovery",
  "inductive_miner": "discovery",
  "log_to_trie": "discovery",
  "optimized_dfg": "discovery",
  "process_skeleton": "discovery",
  "pso": "discovery",
  "simd_streaming_dfg": "discovery",
  "simulated_annealing": "discovery",
  "smart_engine": "discovery",
  "streaming_log": "discovery",
  "transition_system": "discovery",
  "analyze_process_speedup": "discovery_analytics",
  "analyze_variant_complexity": "discovery_analytics",
  "batches": "discovery_analytics",
  "causal_graph": "discovery_analytics",
  "compute_activity_transition_matrix": "discovery_analytics",
  "compute_trace_similarity_matrix": "discovery_analytics",
  "correlation_miner": "discovery_analytics",
  "handover_network": "discovery_analytics",
  "performance_spectrum": "discovery_analytics",
  "working_together_network": "discovery_analytics",
  "bpmn_import": "import_export",
  "pnml_import": "import_export",
  "powl_to_process_tree": "import_export",
  "yawl_export": "import_export",
  "automl_classify": "ml_analytics",
  "automl_forecast": "ml_analytics",
  "ml_anomaly": "ml_analytics",
  "ml_classify": "ml_analytics",
  "ml_cluster": "ml_analytics",
  "ml_forecast": "ml_analytics",
  "ml_pca": "ml_analytics",
  "ml_regress": "ml_analytics",
  "ocel_dfg": "object_centric",
  "ocel_dfg_per_type": "object_centric",
  "ocel_encode": "object_centric",
  "ocel_oc_declare": "object_centric",
  "ocel_ocla": "object_centric",
  "ocel_petri_net": "object_centric",
  "compute_ewma": "prediction",
  "detect_drift": "prediction",
  "predict_next_activity": "prediction",
  "predict_outcome": "prediction",
  "predict_remaining_time": "prediction",
  "monte_carlo_simulation": "simulation",
  "playout": "simulation",
};

function normalizeToken(value: string): string {
  return value.trim().toLowerCase().replace(/[+_]/g, '-');
}

/**
 * Resolve a user-provided algorithm name to a canonical registry ID.
 * Resolution order: exact match → CLI alias → normalized token match.
 */
// NOT YET ONTOLOGY-BACKED — extra positional args for WASM functions beyond (handle, activityKey).
// Source of truth for wasm-server.ts dispatch. To add new entries: verify Rust signature in wasm4pm/src/lib.rs.
export const ALGORITHM_DEFAULT_PARAMS: Partial<Record<AlgorithmId, readonly unknown[]>> = {
  // discover_alpha_plus_plus(handle, activity_key, min_support: f64)
  "alpha_plus_plus": [0.0],
  // discover_heuristic_miner(handle, activity_key, dependency_threshold: f64)
  "heuristic_miner": [0.5],
  // discover_genetic_algorithm(handle, activity_key, population_size: usize, generations: usize)
  "genetic_algorithm": [20, 20],
  // discover_pso_algorithm(handle, activity_key, swarm_size: usize, iterations: usize)
  "pso": [20, 20],
  // discover_aco_algorithm(handle, activity_key, ant_count: usize, iterations: usize)
  "aco": [20, 20],
  // discover_simulated_annealing(handle, activity_key, temperature: f64, cooling_rate: f64)
  "simulated_annealing": [1.0, 0.95],
};

export function resolveAlgorithmId(
  input: string,
  registryIds: readonly string[] = ALGORITHM_IDS
): AlgorithmId | undefined {
  const trimmed = input.trim();
  if (!trimmed) return undefined;
  if (registryIds.includes(trimmed)) return trimmed as AlgorithmId;
  const norm = normalizeToken(trimmed);
  for (const [alias, id] of Object.entries(ALGORITHM_CLI_ALIASES)) {
    if (!id) continue;
    if (normalizeToken(alias) === norm || normalizeToken(id) === norm) {
      if (registryIds.includes(id)) return id;
    }
  }
  return registryIds.find(id => normalizeToken(id) === norm) as AlgorithmId | undefined;
}