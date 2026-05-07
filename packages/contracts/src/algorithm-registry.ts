/**
 * Mapping of algorithm registry IDs to their WASM export function names.
 * Used for startup probing to identify unavailable algorithms in different WASM builds.
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
  transition_system: 'discover_transition_system',
  log_to_trie: 'discover_prefix_tree',
  causal_graph: 'discover_causal_graph',
  performance_spectrum: 'discover_performance_spectrum',
  batches: 'discover_batches',
  correlation_miner: 'discover_correlation',
  generalization: 'generalization',
  petri_net_reduction: 'reduce_petri_net',
  etconformance_precision: 'wasm_compute_precision',
  alignments: 'compute_optimal_alignments',
  complexity_metrics: 'measure_complexity',
  pnml_import: 'from_pnml_wasm',
  bpmn_import: 'read_bpmn',
  powl_to_process_tree: 'powl_to_process_tree',
  yawl_export: undefined, // powl_to_yawl_string has no #[wasm_bindgen] export
  playout: 'play_out_process_tree',
  monte_carlo_simulation: 'monte_carlo_simulation',
  ml_classify: undefined, // TypeScript-only
  ml_cluster: undefined, // TypeScript-only
  ml_forecast: undefined, // TypeScript-only
  ml_anomaly: undefined, // TypeScript-only
  ml_regress: undefined, // TypeScript-only
  ml_pca: undefined, // TypeScript-only
  streaming_log: 'discover_dfg', // fallback
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
