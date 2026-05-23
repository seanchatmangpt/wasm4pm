/**
 * Mapping of algorithm registry IDs to their WASM export function names.
 * Used for startup probing to identify unavailable algorithms in different WASM builds.
 *
 * ALIASED ENTRIES — algorithms whose WASM export name differs from their registry ID.
 * These entries produce real output but under a different algorithm's implementation.
 * A missing or `undefined` value means the algorithm is not yet exported to JS.
 *
 * Alias map (registry ID → actual WASM function):
 *   streaming_log → discover_dfg   (no dedicated streaming WASM export; uses DFG fallback)
 *   optimized_dfg → discover_dfg   (optimized path not separately exported; uses DFG)
 *
 * Practitioners: if you call `kernel.run('streaming_log', ...)` you will receive DFG
 * output, not a streaming-specific result.  Use `simd_streaming_dfg` for the SIMD
 * streaming path.  This alias exists to prevent a hard crash, not to imply equivalence.
 */
export const WASM_FUNCTION_NAMES: Record<string, string | undefined> = {
  dfg: 'discover_dfg',
  process_skeleton: 'extract_process_skeleton',
  alpha_plus_plus: 'discover_alpha_plus_plus',
  heuristic_miner: 'discover_heuristic_miner',
  inductive_miner: 'discover_inductive_miner',
  genetic_algorithm: 'discover_genetic_algorithm',
  pso: 'discover_pso_algorithm',
  a_star: 'discover_astar',
  hill_climbing: 'discover_hill_climbing',
  ilp: 'discover_ilp_petri_net',
  aco: 'discover_ant_colony',
  simulated_annealing: 'discover_simulated_annealing',
  declare: 'discover_declare',
  optimized_dfg: 'discover_dfg',
  simd_streaming_dfg: 'discover_dfg_simd',
  hierarchical_dfg: 'discover_dfg_hierarchical',
  smart_engine: 'smart_engine_run',
  transition_system: 'discover_transition_system_from_handle',
  log_to_trie: 'discover_prefix_tree',
  causal_graph: 'discover_causal_alpha',
  performance_spectrum: 'discover_performance_spectrum_wasm',
  batches: 'discover_batches_wasm',
  correlation_miner: 'discover_correlation',
  generalization: 'generalization',
  petri_net_reduction: 'reduce_petri_net',
  etconformance_precision: 'wasm_compute_precision',
  alignments: 'compute_optimal_alignments',
  complexity_metrics: 'measure_complexity',
  pnml_import: 'from_pnml_wasm',
  bpmn_import: 'read_bpmn',
  powl_to_process_tree: 'powl_to_process_tree',
  yawl_export: 'powl_to_yawl_string',
  playout: 'play_out_dfg',
  monte_carlo_simulation: 'monte_carlo_simulation',
  ml_classify: 'discover_ml_classify',
  ml_cluster: 'discover_ml_cluster',
  ml_forecast: 'discover_ml_forecast',
  ml_anomaly: 'discover_ml_anomaly',
  ml_regress: 'discover_ml_regress',
  ml_pca: 'discover_ml_pca',
  autoinstinct_neurosis: 'autoinstinct_neurosis',
  autoinstinct_semantics: 'autoinstinct_semantics',
  autoinstinct_vision: 'autoinstinct_vision',
  autoinstinct_learning: 'autoinstinct_learning',
  streaming_log: 'discover_dfg', // fallback
  hierarchical_dfg: 'discover_dfg_hierarchical',
  handover_network: 'discover_handover_network',
  working_together_network: 'discover_working_together_network',
  ocel_dfg: 'discover_ocel_dfg',
  ocel_dfg_per_type: 'discover_ocel_dfg_per_type',
  ocel_petri_net: 'discover_oc_petri_net',
  ocel_ocla: 'discover_ocla_wasm',
  ocel_oc_declare: 'discover_oc_declare_wasm',
  ocel_encode: 'encode_ocel_as_text',
  predict_next_activity: 'predict_next_activity',
  predict_remaining_time: 'predict_case_duration',
  predict_outcome: 'predict_next_k',
  detect_drift: 'detect_drift',
  compute_ewma: 'compute_ewma',
  analyze_variant_complexity: 'analyze_variant_complexity',
  compute_activity_transition_matrix: 'compute_activity_transition_matrix',
  analyze_process_speedup: 'analyze_process_speedup',
  compute_trace_similarity_matrix: 'compute_trace_similarity_matrix',
  automl_classify: 'discover_automl_classify',
  automl_forecast: 'discover_automl_forecast',
  agentic_pipeline: 'run_agentic_pipeline',
};

/**
 * Levenshtein distance between two strings.
 * Used for "did you mean" suggestions in error messages.
 */
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
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1, // delete
        dp[i][j - 1] + 1, // insert
        dp[i - 1][j - 1] + cost // replace
      );
    }
  }
  return dp[an][bn];
}

/**
 * Find the closest match to a name in a list of candidates.
 * Returns the best match if distance <= maxDistance, otherwise null.
 */
export function findClosestMatch(
  name: string,
  candidates: string[],
  maxDistance = 3
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
