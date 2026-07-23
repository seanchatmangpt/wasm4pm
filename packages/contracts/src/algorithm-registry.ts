// Algorithm contracts — generated from wasm4pm pi ontology. Regenerate with: ggen sync

import type { AlgorithmId } from './algorithm-ids.js';
import { ALGORITHM_IDS, ALGORITHM_CLI_ALIASES } from './algorithm-ids.js';

export { ALGORITHM_IDS };

/**
 * Maps algorithm registry ID to WASM export function name.
 * Generated from pi:wasmExport in ggen/ontology/algorithms.ttl.
 */
export const WASM_FUNCTION_NAMES: Record<AlgorithmId, string> = {
  "agentic_pipeline": "run_agentic_pipeline",
  "alignments": "compute_optimal_alignments",
  "complexity_metrics": "measure_complexity",
  "etconformance_precision": "align_etconformance_precision",
  "generalization": "generalization",
  "a_star": "discover_astar",
  "aco": "discover_ant_colony",
  "alpha_plus_plus": "discover_alpha_plus_plus",
  "declare": "discover_declare",
  "dfg": "discover_dfg",
  "genetic_algorithm": "discover_genetic_algorithm",
  "heuristic_miner": "discover_heuristic_miner",
  "hierarchical_dfg": "discover_dfg_hierarchical",
  "hill_climbing": "discover_hill_climbing",
  "ilp": "discover_ilp_petri_net",
  "inductive_miner": "discover_inductive_miner",
  "log_to_trie": "discover_prefix_tree",
  "optimized_dfg": "discover_optimized_dfg",
  "process_skeleton": "extract_process_skeleton",
  "pso": "discover_pso_algorithm",
  "simd_streaming_dfg": "discover_dfg_simd",
  "simulated_annealing": "discover_simulated_annealing",
  "smart_engine": "smart_engine_run",
  "streaming_log": "discover_dfg",
  "transition_system": "discover_transition_system_from_handle",
  "analyze_process_speedup": "analyze_process_speedup",
  "analyze_variant_complexity": "analyze_variant_complexity",
  "batches": "discover_batches_wasm",
  "causal_graph": "discover_causal_heuristic",
  "compute_activity_transition_matrix": "compute_activity_transition_matrix",
  "compute_trace_similarity_matrix": "compute_trace_similarity_matrix",
  "correlation_miner": "discover_correlation",
  "handover_network": "discover_handover_network",
  "performance_spectrum": "discover_performance_spectrum_wasm",
  "working_together_network": "discover_working_together_network",
  "bpmn_import": "read_bpmn",
  "pnml_import": "from_pnml_wasm",
  "powl_to_process_tree": "powl_to_process_tree",
  "yawl_export": "powl_to_yawl_string",
  "automl_classify": "discover_automl_classify",
  "automl_forecast": "discover_automl_forecast",
  "ml_anomaly": "discover_ml_anomaly",
  "ml_classify": "discover_ml_classify",
  "ml_cluster": "discover_ml_cluster",
  "ml_forecast": "discover_ml_forecast",
  "ml_pca": "discover_ml_pca",
  "ml_regress": "discover_ml_regress",
  "ocel_dfg": "discover_ocel_dfg",
  "ocel_dfg_per_type": "discover_ocel_dfg_per_type",
  "ocel_encode": "encode_ocel_as_text",
  "ocel_oc_declare": "discover_oc_declare_wasm",
  "ocel_ocla": "discover_ocla_wasm",
  "ocel_petri_net": "discover_oc_petri_net",
  "compute_ewma": "compute_ewma",
  "detect_drift": "detect_drift",
  "predict_next_activity": "predict_next_activity",
  "predict_outcome": "predict_outcome_wasm",
  "predict_remaining_time": "predict_case_duration",
  "monte_carlo_simulation": "monte_carlo_simulation",
  "playout": "play_out_dfg",
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

export function levenshteinDistance(a: string, b: string): number {
  const an = a.length;
  const bn = b.length;
  if (an === 0) return bn;
  if (bn === 0) return an;
  const dp: number[][] = [];
  for (let i = 0; i <= an; i++) dp[i] = [i];
  for (let j = 0; j <= bn; j++) dp[0][j] = j;
  for (let i = 1; i <= an; i++) {
    for (let j = 1; j <= bn; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[an][bn];
}

export function findClosestMatch(
  name: string,
  candidates: string[],
  maxDistance = 3,
): string | null {
  let best: string | null = null;
  let bestDistance = maxDistance + 1;
  for (const candidate of candidates) {
    const distance = levenshteinDistance(name.toLowerCase(), candidate.toLowerCase());
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return bestDistance <= maxDistance ? best : null;
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