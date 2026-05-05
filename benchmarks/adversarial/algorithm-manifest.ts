/**
 * Algorithm Manifest — Ground Truth
 *
 * Maps 41 registered algorithm IDs to their WASM implementations
 * Built from cross-referencing @wasm4pm/contracts registry with actual #[wasm_bindgen] exports
 *
 * Source truth: wasm4pm/src/*.rs files with #[wasm_bindgen] decorators
 */

export type OutputType = 'dfg' | 'petrinet' | 'declare' | 'tree' | 'analytics' | 'ocel' | 'powl';

export interface AlgorithmMetadata {
  id: string;                          // Registry ID (e.g., 'dfg')
  wasmFn: string;                      // Actual WASM function name
  outputType: OutputType;              // What kind of model it produces
  fitnessCapable: boolean;             // Can it be token-replayed?
  expectedLatencyBudgetMs: number;     // Max time for 500K events
  description: string;
  tier?: 0 | 1 | 2 | 3;               // Classification (set during audit)
}

export const ALGORITHM_MANIFEST: AlgorithmMetadata[] = [
  // ==================== DISCOVERY (15) ====================

  {
    id: 'dfg',
    wasmFn: 'discover_dfg',
    outputType: 'dfg',
    fitnessCapable: false,
    expectedLatencyBudgetMs: 5000,
    description: 'Directly-Follows Graph — observation-based, highest fitness'
  },

  {
    id: 'process_skeleton',
    wasmFn: 'extract_process_skeleton',
    outputType: 'dfg',
    fitnessCapable: false,
    expectedLatencyBudgetMs: 5000,
    description: 'Simplified skeleton structure from DFG'
  },

  {
    id: 'alpha_plus_plus',
    wasmFn: 'discover_alpha_plus_plus',
    outputType: 'petrinet',
    fitnessCapable: true,
    expectedLatencyBudgetMs: 5000,
    description: 'Alpha algorithm with enhancements, produces Petri net'
  },

  {
    id: 'heuristic_miner',
    wasmFn: 'discover_heuristic_miner',
    outputType: 'dfg',
    fitnessCapable: false,
    expectedLatencyBudgetMs: 5000,
    description: 'Heuristic-based discovery, filters noise'
  },

  {
    id: 'inductive_miner',
    wasmFn: 'discover_inductive_miner',
    outputType: 'tree',
    fitnessCapable: false,
    expectedLatencyBudgetMs: 5000,
    description: 'Inductive Miner: recursive divide-and-conquer via XOR/sequence/parallel cuts'
  },

  {
    id: 'hill_climbing',
    wasmFn: 'discover_hill_climbing',
    outputType: 'dfg',  // Actually DFG, not petrinet
    fitnessCapable: false,
    expectedLatencyBudgetMs: 5000,
    description: 'Iterative improvement via greedy edge selection'
  },

  {
    id: 'declare',
    wasmFn: 'discover_declare',
    outputType: 'declare',
    fitnessCapable: false,
    expectedLatencyBudgetMs: 5000,
    description: 'Constraint-based discovery'
  },

  {
    id: 'simulated_annealing',
    wasmFn: 'discover_simulated_annealing',
    outputType: 'dfg',  // Actually DFG, not petrinet
    fitnessCapable: false,
    expectedLatencyBudgetMs: 10000,
    description: 'Simulated annealing optimization'
  },

  {
    id: 'a_star',
    wasmFn: 'discover_astar',
    outputType: 'dfg',  // Actually DFG, not petrinet
    fitnessCapable: false,
    expectedLatencyBudgetMs: 10000,
    description: 'A* heuristic search'
  },

  {
    id: 'aco',
    wasmFn: 'discover_aco_algorithm',
    outputType: 'dfg',  // Actually DFG, not petrinet
    fitnessCapable: false,
    expectedLatencyBudgetMs: 30000,
    description: 'Ant Colony Optimization (correct implementation, discover_ant_colony is deprecated)'
  },

  {
    id: 'pso',
    wasmFn: 'discover_pso_algorithm',
    outputType: 'dfg',  // Actually DFG, not petrinet
    fitnessCapable: false,
    expectedLatencyBudgetMs: 30000,
    description: 'Particle Swarm Optimization'
  },

  {
    id: 'genetic_algorithm',
    wasmFn: 'discover_genetic_algorithm',
    outputType: 'dfg',  // Actually DFG, not petrinet
    fitnessCapable: false,
    expectedLatencyBudgetMs: 30000,
    description: 'Evolutionary algorithm, high quality'
  },

  {
    id: 'optimized_dfg',
    wasmFn: 'discover_optimized_dfg',
    outputType: 'dfg',
    fitnessCapable: false,
    expectedLatencyBudgetMs: 5000,
    description: 'Enhanced DFG with optimizations'
  },

  {
    id: 'ilp',
    wasmFn: 'discover_ilp_petri_net',
    outputType: 'petrinet',
    fitnessCapable: true,
    expectedLatencyBudgetMs: 60000,
    description: 'Frequency-aware Petri net discovery via directly-follows with implicit place construction'
  },

  {
    id: 'simd_streaming_dfg',
    wasmFn: 'discover_dfg_simd',
    outputType: 'dfg',
    fitnessCapable: false,
    expectedLatencyBudgetMs: 5000,
    description: 'SIMD-accelerated streaming DFG'
  },

  // ==================== ML ALGORITHMS (6) ====================

  {
    id: 'ml_classify',
    wasmFn: 'discover_ml_classify',
    outputType: 'analytics',
    fitnessCapable: false,
    expectedLatencyBudgetMs: 5000,
    description: 'k-NN classifier on trace features (short/medium/long)'
  },

  {
    id: 'ml_cluster',
    wasmFn: 'cluster_traces',
    outputType: 'analytics',
    fitnessCapable: false,
    expectedLatencyBudgetMs: 5000,
    description: 'K-means clustering'
  },

  {
    id: 'ml_forecast',
    wasmFn: 'discover_ml_forecast',
    outputType: 'analytics',
    fitnessCapable: false,
    expectedLatencyBudgetMs: 5000,
    description: 'Time-series forecasting with sliding windows'
  },

  {
    id: 'ml_anomaly',
    wasmFn: 'score_log_anomalies',
    outputType: 'analytics',
    fitnessCapable: false,
    expectedLatencyBudgetMs: 5000,
    description: 'Anomaly detection via EMA'
  },

  {
    id: 'ml_regress',
    wasmFn: 'discover_ml_regress',
    outputType: 'analytics',
    fitnessCapable: false,
    expectedLatencyBudgetMs: 5000,
    description: 'Linear regression on trace length vs duration'
  },

  {
    id: 'ml_pca',
    wasmFn: 'discover_ml_pca',
    outputType: 'analytics',
    fitnessCapable: false,
    expectedLatencyBudgetMs: 5000,
    description: '2-component PCA on trace features'
  },

  // ==================== ANALYSIS & UTILITIES (20) ====================

  {
    id: 'transition_system',
    wasmFn: 'discover_transition_system_from_handle',
    outputType: 'dfg',
    fitnessCapable: false,
    expectedLatencyBudgetMs: 5000,
    description: 'Transition system extraction'
  },

  {
    id: 'log_to_trie',
    wasmFn: 'discover_prefix_tree',
    outputType: 'tree',
    fitnessCapable: false,
    expectedLatencyBudgetMs: 5000,
    description: 'Prefix tree (trie) structure'
  },

  {
    id: 'causal_graph',
    wasmFn: 'discover_causal_alpha',
    outputType: 'dfg',
    fitnessCapable: false,
    expectedLatencyBudgetMs: 5000,
    description: 'Causal dependency graph'
  },

  {
    id: 'performance_spectrum',
    wasmFn: 'discover_performance_spectrum_wasm',
    outputType: 'analytics',
    fitnessCapable: false,
    expectedLatencyBudgetMs: 5000,
    description: 'Performance bottleneck detection'
  },

  {
    id: 'batches',
    wasmFn: 'discover_batches_wasm',
    outputType: 'analytics',
    fitnessCapable: false,
    expectedLatencyBudgetMs: 5000,
    description: 'Batch activity detection'
  },

  {
    id: 'correlation_miner',
    wasmFn: 'discover_correlation',
    outputType: 'dfg',
    fitnessCapable: false,
    expectedLatencyBudgetMs: 5000,
    description: 'Correlation analysis'
  },

  {
    id: 'generalization',
    wasmFn: 'generalization',
    outputType: 'analytics',
    fitnessCapable: false,
    expectedLatencyBudgetMs: 5000,
    description: 'Generalization metric (avoid overfitting)'
  },

  {
    id: 'petri_net_reduction',
    wasmFn: 'wasm_reduce_petri_net',
    outputType: 'petrinet',
    fitnessCapable: false,
    expectedLatencyBudgetMs: 5000,
    description: 'Reduce Petri net via structural simplification rules'
  },

  {
    id: 'etconformance_precision',
    wasmFn: 'wasm_compute_precision',
    outputType: 'analytics',
    fitnessCapable: false,
    expectedLatencyBudgetMs: 5000,
    description: 'Precision via ETConformance'
  },

  {
    id: 'alignments',
    wasmFn: 'compute_optimal_alignments',
    outputType: 'analytics',
    fitnessCapable: false,
    expectedLatencyBudgetMs: 5000,
    description: 'Optimal trace alignment'
  },

  {
    id: 'complexity_metrics',
    wasmFn: 'measure_complexity',
    outputType: 'analytics',
    fitnessCapable: false,
    expectedLatencyBudgetMs: 5000,
    description: 'Model complexity measurement'
  },

  {
    id: 'pnml_import',
    wasmFn: 'from_pnml_wasm',
    outputType: 'petrinet',
    fitnessCapable: false,
    expectedLatencyBudgetMs: 5000,
    description: 'PNML file import'
  },

  {
    id: 'bpmn_import',
    wasmFn: 'read_bpmn',
    outputType: 'tree',
    fitnessCapable: false,
    expectedLatencyBudgetMs: 5000,
    description: 'BPMN file import'
  },

  {
    id: 'powl_to_process_tree',
    wasmFn: 'powl_to_process_tree',
    outputType: 'tree',
    fitnessCapable: false,
    expectedLatencyBudgetMs: 5000,
    description: 'POWL to process tree conversion'
  },

  {
    id: 'yawl_export',
    wasmFn: 'NOT_EXPORTED',
    outputType: 'tree',
    fitnessCapable: false,
    expectedLatencyBudgetMs: 5000,
    description: 'POWL to YAWL v6 XML export — function takes internal types (PowlArena), not WASM-compatible'
  },

  {
    id: 'playout',
    wasmFn: 'play_out_dfg',
    outputType: 'analytics',
    fitnessCapable: false,
    expectedLatencyBudgetMs: 5000,
    description: 'Process model simulation/playout'
  },

  {
    id: 'monte_carlo_simulation',
    wasmFn: 'monte_carlo_simulation',
    outputType: 'analytics',
    fitnessCapable: false,
    expectedLatencyBudgetMs: 5000,
    description: 'Monte Carlo process simulation'
  },

  {
    id: 'smart_engine',
    wasmFn: 'smart_engine_run',
    outputType: 'dfg',
    fitnessCapable: false,
    expectedLatencyBudgetMs: 30000,
    description: 'Intelligent algorithm selection via RL'
  },

  {
    id: 'hierarchical_dfg',
    wasmFn: 'discover_dfg_hierarchical',
    outputType: 'dfg',
    fitnessCapable: false,
    expectedLatencyBudgetMs: 5000,
    description: 'Hierarchical DFG abstraction'
  }
];

/**
 * Quick lookup by ID
 */
export function getAlgorithm(id: string): AlgorithmMetadata | undefined {
  return ALGORITHM_MANIFEST.find(a => a.id === id);
}

/**
 * Filter fitness-capable algorithms (Petri nets only)
 */
export function getFitnessCapableAlgorithms(): AlgorithmMetadata[] {
  return ALGORITHM_MANIFEST.filter(a => a.fitnessCapable && a.wasmFn !== 'NOT_EXPORTED');
}

/**
 * Filter algorithms that are exported (skipping MISSING/NOT_EXPORTED)
 */
export function getExportedAlgorithms(): AlgorithmMetadata[] {
  return ALGORITHM_MANIFEST.filter(a => !a.wasmFn.includes('NOT_EXPORTED'));
}

/**
 * Summary statistics
 */
export function getManifestStats() {
  const total = ALGORITHM_MANIFEST.length;
  const exported = getExportedAlgorithms().length;
  const missing = total - exported;
  const fitnessCapable = getFitnessCapableAlgorithms().length;

  return { total, exported, missing, fitnessCapable };
}
