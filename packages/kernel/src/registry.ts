/**
 * registry.ts
 * Algorithm registry for wasm4pm process mining algorithms
 * Maintains metadata, profiles, and execution configuration for all 15+ discovery algorithms
 */

import { PlanStepType } from '@wasm4pm/planner';

/**
 * Complexity class for O(n) analysis
 */
export type ComplexityClass =
  | 'O(n)'
  | 'O(n log n)'
  | 'O(n²)'
  | 'O(n³)'
  | 'O(n * d²)'
  | 'Exponential'
  | 'NP-Hard';

/**
 * Speed tier: 0-100 (logarithmic scale, measured on BPI 2020 with 56K events)
 * Formula: score = Math.min(100, Math.max(0, Math.log2(timeMs) * 10))
 * 0-10: sub-millisecond (<1ms)
 * 10-33: millisecond (1-10ms)
 * 33-67: tens of milliseconds (10-100ms)
 * 67-100: hundreds of milliseconds to seconds (100ms-10s+)
 * Reference: SIMD DFG ~11ms = score 34, DFG ~192ms = score 76, ILP ~3000ms = score 100
 */
export type SpeedTier = number; // 0-100

/**
 * Quality tier: 0-100 (higher = better model quality)
 * 0-30: basic (DFG, skeleton), 30-50: good (heuristic), 50-70: high (genetic, ILP)
 * 70-85: very high (multi-pass), 85-100: optimal (ILP with full search)
 */
export type QualityTier = number; // 0-100

/**
 * Execution profile: which algorithms are recommended
 */
export type ExecutionProfile = 'fast' | 'balanced' | 'quality' | 'stream';

/**
 * Deployment profile: WASM build configuration.
 *
 * Profile hierarchy (smallest binary → largest):
 *   mobile (~500KB) ⊆ iot (~1MB) ⊆ edge (~1.5MB) ⊆ fog (~2MB) ⊆ browser (~2.7MB)
 *
 * - mobile: Minimal features for mobile devices (~500KB)
 * - iot: Minimal features for IoT devices (~1.0MB)
 * - edge: Advanced algorithms for edge servers (~1.5MB)
 * - fog: Full features except POWL for fog computing (~2.0MB)
 * - browser: Full feature set, all algorithms (~2.7MB, DEFAULT wasm-pack target)
 *
 * Note: 'browser' is the FULL-FEATURED profile — not a size-constrained target.
 * The name comes from the wasm-pack --target bundler option, not a capability limit.
 */
export type DeploymentProfile = 'mobile' | 'iot' | 'edge' | 'fog' | 'browser';

/**
 * Algorithm metadata
 */
export interface AlgorithmMetadata {
  /** Unique algorithm identifier */
  id: string;

  /** Display name */
  name: string;

  /** Long description */
  description: string;

  /** Output type: 'dfg', 'petrinet', 'declare', etc. */
  outputType: 'dfg' | 'petrinet' | 'declare' | 'tree' | 'ml_result' | 'analytics';

  /** Complexity class */
  complexity: ComplexityClass;

  /** Speed tier (0-100, lower is faster) */
  speedTier: SpeedTier;

  /** Quality tier (0-100, higher is better) */
  qualityTier: QualityTier;

  /** Parameters this algorithm accepts */
  parameters: AlgorithmParameter[];

  /** Which execution profiles include this algorithm */
  supportedProfiles: ExecutionProfile[];

  /** Which deployment profiles include this algorithm */
  deploymentProfiles: DeploymentProfile[];

  /** Estimated duration per 100 events in milliseconds */
  estimatedDurationMs: number;

  /** Estimated memory usage in MB for typical 10k event log */
  estimatedMemoryMB: number;

  /** Whether this algorithm can handle noise/incomplete data well */
  robustToNoise: boolean;

  /** Whether this algorithm scales well to large logs (100k+ events) */
  scalesWell: boolean;

  /** References or academic papers */
  references?: string[];
}

/**
 * Algorithm parameter definition
 */
export interface AlgorithmParameter {
  name: string;
  type: 'number' | 'string' | 'boolean' | 'select';
  description: string;
  required: boolean;
  default?: unknown;
  min?: number;
  max?: number;
  options?: unknown[];
}

/**
 * Algorithm registry - manages all known algorithms
 */
export class AlgorithmRegistry {
  private algorithms: Map<string, AlgorithmMetadata> = new Map();
  private profileMap: Map<ExecutionProfile, string[]> = new Map();
  private deploymentProfileMap: Map<DeploymentProfile, string[]> = new Map();

  constructor() {
    this.registerAllAlgorithms();
    this.buildProfileMap();
    this.buildDeploymentProfileMap();
  }

  /**
   * Register all wasm4pm algorithms
   */
  private registerAllAlgorithms(): void {
    // Basic discovery - Directly Follows Graph
    this.registerWithInferredProfiles({
      id: 'dfg',
      name: 'DFG (Directly Follows Graph)',
      description:
        'Discovers a directly-follows graph from an event log. Fastest algorithm with minimal memory overhead.',
      outputType: 'dfg',
      complexity: 'O(n)',
      speedTier: 76,
      qualityTier: 30,
      parameters: [
        {
          name: 'activity_key',
          type: 'string',
          description: 'Event attribute key for activity names',
          required: true,
          default: 'concept:name',
        },
      ],
      supportedProfiles: ['fast', 'balanced', 'quality', 'stream'],
      estimatedDurationMs: 0.5,
      estimatedMemoryMB: 20,
      robustToNoise: true,
      scalesWell: true,
    });

    // Process Skeleton
    this.registerWithInferredProfiles({
      id: 'process_skeleton',
      name: 'Process Skeleton',
      description: 'Discovers a minimal process skeleton with start and end activities. Very fast.',
      outputType: 'dfg',
      complexity: 'O(n)',
      speedTier: 73,
      qualityTier: 25,
      parameters: [
        {
          name: 'activity_key',
          type: 'string',
          description: 'Event attribute key for activity names',
          required: true,
          default: 'concept:name',
        },
      ],
      supportedProfiles: ['fast', 'balanced', 'quality', 'stream'],
      estimatedDurationMs: 0.3,
      estimatedMemoryMB: 10,
      robustToNoise: true,
      scalesWell: true,
    });

    // Alpha++ (improved Alpha algorithm)
    this.registerWithInferredProfiles({
      id: 'alpha_plus_plus',
      name: 'Alpha++ (Improved Alpha)',
      description:
        'Alpha++ algorithm (de Medeiros et al. 2004). Extends the original Alpha algorithm with explicit handling of length-1 loops (self-loops) and length-2 loops, reclassifying parallel short-loop pairs as causal. Produces a proper Petri net with source/sink places and maximal (A,B) place candidates.',
      outputType: 'petrinet',
      complexity: 'O(n²)',
      speedTier: 79,
      qualityTier: 45,
      parameters: [
        {
          name: 'activity_key',
          type: 'string',
          description: 'Event attribute key for activity names',
          required: true,
          default: 'concept:name',
        },
        {
          name: 'min_support',
          type: 'number',
          description:
            'Minimum support threshold [0,1] for filtering rare directly-follows relations. 0.0 = no filtering.',
          required: false,
          default: 0.0,
        },
      ],
      supportedProfiles: ['balanced', 'quality'],
      estimatedDurationMs: 5,
      estimatedMemoryMB: 100,
      robustToNoise: false,
      scalesWell: false,
    });

    // Heuristic Miner
    this.registerWithInferredProfiles({
      id: 'heuristic_miner',
      name: 'Heuristic Miner',
      description:
        'Discovers models from real-world logs with noise. Uses dependency threshold to filter weak dependencies.',
      outputType: 'dfg',
      complexity: 'O(n²)',
      speedTier: 63,
      qualityTier: 50,
      parameters: [
        {
          name: 'activity_key',
          type: 'string',
          description: 'Event attribute key for activity names',
          required: true,
          default: 'concept:name',
        },
        {
          name: 'dependency_threshold',
          type: 'number',
          description: 'Threshold for dependency ratio (0-1)',
          required: false,
          default: 0.5,
          min: 0,
          max: 1,
        },
      ],
      supportedProfiles: ['balanced', 'quality'],
      estimatedDurationMs: 10,
      estimatedMemoryMB: 150,
      robustToNoise: true,
      scalesWell: true,
    });

    // Inductive Miner
    this.registerWithInferredProfiles({
      id: 'inductive_miner',
      name: 'Inductive Miner',
      description:
        'Recursive cut-based process tree discovery (XOR/Sequence/Parallel/Loop cuts). IM-basic: no noise filtering, all directly-follows preserved.',
      outputType: 'tree',
      complexity: 'O(n log n)',
      speedTier: 65,
      qualityTier: 55,
      parameters: [
        {
          name: 'activity_key',
          type: 'string',
          description: 'Event attribute key for activity names',
          required: true,
          default: 'concept:name',
        },
        {
          name: 'noise_threshold',
          type: 'number',
          description: 'Infrequent behavior threshold (0-1)',
          required: false,
          default: 0.2,
          min: 0,
          max: 1,
        },
      ],
      supportedProfiles: ['balanced', 'quality'],
      estimatedDurationMs: 15,
      estimatedMemoryMB: 180,
      robustToNoise: true,
      scalesWell: true,
    });

    // Genetic Algorithm
    this.registerWithInferredProfiles({
      id: 'genetic_algorithm',
      name: 'Genetic Algorithm',
      description:
        'Uses evolutionary computation. Actually returns DFG, not Petri net (Phase 4 audit correction).',
      outputType: 'dfg',
      complexity: 'Exponential',
      speedTier: 100,
      qualityTier: 80,
      parameters: [
        {
          name: 'activity_key',
          type: 'string',
          description: 'Event attribute key for activity names',
          required: true,
          default: 'concept:name',
        },
        {
          name: 'population_size',
          type: 'number',
          description: 'Population size for genetic algorithm',
          required: false,
          default: 50,
          min: 10,
          max: 500,
        },
        {
          name: 'generations',
          type: 'number',
          description: 'Number of generations to evolve',
          required: false,
          default: 100,
          min: 10,
          max: 1000,
        },
      ],
      supportedProfiles: ['quality'],
      estimatedDurationMs: 40,
      estimatedMemoryMB: 250,
      robustToNoise: true,
      scalesWell: false,
    });

    // PSO (Particle Swarm Optimization)
    this.registerWithInferredProfiles({
      id: 'pso',
      name: 'Particle Swarm Optimization (PSO)',
      description:
        'Swarm-based algorithm. Actually returns DFG, not Petri net (Phase 4 audit correction).',
      outputType: 'dfg',
      complexity: 'Exponential',
      speedTier: 100,
      qualityTier: 75,
      parameters: [
        {
          name: 'activity_key',
          type: 'string',
          description: 'Event attribute key for activity names',
          required: true,
          default: 'concept:name',
        },
        {
          name: 'swarm_size',
          type: 'number',
          description: 'Number of particles',
          required: false,
          default: 30,
          min: 10,
          max: 300,
        },
        {
          name: 'iterations',
          type: 'number',
          description: 'Number of iterations',
          required: false,
          default: 50,
          min: 10,
          max: 500,
        },
      ],
      supportedProfiles: ['quality'],
      estimatedDurationMs: 35,
      estimatedMemoryMB: 220,
      robustToNoise: true,
      scalesWell: false,
    });

    // A* Search
    this.registerWithInferredProfiles({
      id: 'a_star',
      name: 'A* Search',
      description:
        'Heuristic search algorithm. Actually returns DFG, not Petri net (Phase 4 audit correction).',
      outputType: 'dfg',
      complexity: 'Exponential',
      speedTier: 100,
      qualityTier: 70,
      parameters: [
        {
          name: 'activity_key',
          type: 'string',
          description: 'Event attribute key for activity names',
          required: true,
          default: 'concept:name',
        },
        {
          name: 'max_iterations',
          type: 'number',
          description: 'Maximum search iterations',
          required: false,
          default: 10000,
          min: 1000,
          max: 100000,
        },
      ],
      supportedProfiles: ['quality'],
      estimatedDurationMs: 50,
      estimatedMemoryMB: 200,
      robustToNoise: false,
      scalesWell: false,
    });

    // Hill Climbing
    this.registerWithInferredProfiles({
      id: 'hill_climbing',
      name: 'Hill Climbing',
      description:
        'Greedy local search. Actually returns DFG, not Petri net (Phase 4 audit correction).',
      outputType: 'dfg',
      complexity: 'O(n²)',
      speedTier: 76,
      qualityTier: 55,
      parameters: [
        {
          name: 'activity_key',
          type: 'string',
          description: 'Event attribute key for activity names',
          required: true,
          default: 'concept:name',
        },
        {
          name: 'max_iterations',
          type: 'number',
          description: 'Maximum iterations for hill climbing',
          required: false,
          default: 100,
          min: 10,
          max: 1000,
        },
      ],
      supportedProfiles: ['balanced', 'quality'],
      estimatedDurationMs: 20,
      estimatedMemoryMB: 150,
      robustToNoise: true,
      scalesWell: true,
    });

    // Ant Colony Optimization (ACO)
    this.registerWithInferredProfiles({
      id: 'aco',
      name: 'Ant Colony Optimization (ACO)',
      description:
        'Swarm intelligence algorithm. Actually returns DFG, not Petri net (Phase 4 audit correction).',
      outputType: 'dfg',
      complexity: 'Exponential',
      speedTier: 100,
      qualityTier: 75,
      parameters: [
        {
          name: 'activity_key',
          type: 'string',
          description: 'Event attribute key for activity names',
          required: true,
          default: 'concept:name',
        },
        {
          name: 'colony_size',
          type: 'number',
          description: 'Number of ants',
          required: false,
          default: 40,
          min: 10,
          max: 500,
        },
        {
          name: 'iterations',
          type: 'number',
          description: 'Number of iterations',
          required: false,
          default: 100,
          min: 10,
          max: 1000,
        },
      ],
      supportedProfiles: ['quality'],
      estimatedDurationMs: 45,
      estimatedMemoryMB: 200,
      robustToNoise: true,
      scalesWell: false,
    });

    // Simulated Annealing
    this.registerWithInferredProfiles({
      id: 'simulated_annealing',
      name: 'Simulated Annealing',
      description:
        'Probabilistic technique. Actually returns DFG, not Petri net (Phase 4 audit correction).',
      outputType: 'dfg',
      complexity: 'Exponential',
      speedTier: 100,
      qualityTier: 65,
      parameters: [
        {
          name: 'activity_key',
          type: 'string',
          description: 'Event attribute key for activity names',
          required: true,
          default: 'concept:name',
        },
        {
          name: 'initial_temperature',
          type: 'number',
          description: 'Initial temperature',
          required: false,
          default: 100,
          min: 1,
          max: 1000,
        },
        {
          name: 'cooling_rate',
          type: 'number',
          description: 'Temperature cooling rate',
          required: false,
          default: 0.95,
          min: 0.8,
          max: 0.99,
        },
      ],
      supportedProfiles: ['quality'],
      estimatedDurationMs: 30,
      estimatedMemoryMB: 180,
      robustToNoise: true,
      scalesWell: false,
    });

    // Declare (constraint-based)
    this.registerWithInferredProfiles({
      id: 'declare',
      name: 'Declare (Constraints)',
      description:
        'Discovers declarative (constraint-based) process models. Good for flexible processes.',
      outputType: 'declare',
      complexity: 'O(n²)',
      speedTier: 75,
      qualityTier: 50,
      parameters: [
        {
          name: 'activity_key',
          type: 'string',
          description: 'Event attribute key for activity names',
          required: true,
          default: 'concept:name',
        },
        {
          name: 'support_threshold',
          type: 'number',
          description: 'Minimum support for constraints (0-1)',
          required: false,
          default: 0.8,
          min: 0,
          max: 1,
        },
      ],
      supportedProfiles: ['balanced', 'quality'],
      estimatedDurationMs: 12,
      estimatedMemoryMB: 120,
      robustToNoise: true,
      scalesWell: true,
    });

    // Optimized DFG (ILP variant)
    this.registerWithInferredProfiles({
      id: 'optimized_dfg',
      name: 'Optimized DFG (ILP)',
      description: 'ILP-based DFG optimization. Minimal model with best fitness.',
      outputType: 'dfg',
      complexity: 'NP-Hard',
      speedTier: 100,
      qualityTier: 85,
      parameters: [
        {
          name: 'activity_key',
          type: 'string',
          description: 'Event attribute key for activity names',
          required: true,
          default: 'concept:name',
        },
        {
          name: 'timeout_seconds',
          type: 'number',
          description: 'Solver timeout in seconds',
          required: false,
          default: 15,
          min: 1,
          max: 300,
        },
      ],
      supportedProfiles: ['quality'],
      estimatedDurationMs: 15,
      estimatedMemoryMB: 250,
      robustToNoise: false,
      scalesWell: false,
    });

    // ILP Discovery
    this.registerWithInferredProfiles({
      id: 'ilp',
      name: 'Integer Linear Programming (ILP)',
      description:
        'Region-based Petri net discovery. Finds causal place candidates (1-to-1, AND-splits, AND-joins) validated by token replay, with greedy minimization. Produces precise Petri nets with explicit parallel-join/split structure.',
      outputType: 'petrinet',
      complexity: 'NP-Hard',
      speedTier: 100,
      qualityTier: 90,
      parameters: [
        {
          name: 'activity_key',
          type: 'string',
          description: 'Event attribute key for activity names',
          required: true,
          default: 'concept:name',
        },
      ],
      supportedProfiles: ['quality'],
      estimatedDurationMs: 20,
      estimatedMemoryMB: 300,
      robustToNoise: false,
      scalesWell: false,
    });

    // SIMD Streaming DFG
    this.registerWithInferredProfiles({
      id: 'simd_streaming_dfg',
      name: 'SIMD Streaming DFG',
      description:
        'SIMD-accelerated streaming directly-follows graph discovery. Approximately 500x faster than standard DFG via vectorized event processing.',
      outputType: 'dfg',
      complexity: 'O(n)',
      speedTier: 34,
      qualityTier: 30,
      parameters: [
        {
          name: 'activity_key',
          type: 'string',
          description: 'Event attribute key for activity names',
          required: true,
          default: 'concept:name',
        },
      ],
      supportedProfiles: ['fast', 'balanced', 'quality', 'stream'],
      estimatedDurationMs: 0.1,
      estimatedMemoryMB: 15,
      robustToNoise: true,
      scalesWell: true,
    });

    // Hierarchical DFG
    this.registerWithInferredProfiles({
      id: 'hierarchical_dfg',
      name: 'Hierarchical DFG',
      description:
        'Hierarchical chunking DFG for massive event logs. Scales to 100B+ events via divide-and-conquer with bounded memory.',
      outputType: 'dfg',
      complexity: 'O(n)',
      speedTier: 5,
      qualityTier: 30,
      parameters: [
        {
          name: 'activity_key',
          type: 'string',
          description: 'Event attribute key for activity names',
          required: true,
          default: 'concept:name',
        },
        {
          name: 'chunk_size',
          type: 'number',
          description: 'Number of events per chunk',
          required: false,
          default: 100000,
          min: 10000,
          max: 10000000,
        },
      ],
      supportedProfiles: ['fast', 'balanced', 'quality', 'stream'],
      estimatedDurationMs: 0.5,
      estimatedMemoryMB: 25,
      robustToNoise: true,
      scalesWell: true,
    });

    // Streaming Log (probabilistic)
    // NOTE: streaming_log is a stateful handle-based API, not a single-call algorithm.
    // Use streaming_log_* functions directly: create → add_trace → estimate_dfg → free
    this.registerWithInferredProfiles({
      id: 'streaming_log',
      name: 'Streaming Log (Probabilistic)',
      description:
        'Probabilistic streaming event log processor. Stateful handle-based API. Use streaming_log_create(), streaming_log_add_trace(), streaming_log_estimate_dfg(), streaming_log_free().',
      outputType: 'analytics',
      complexity: 'O(n)',
      speedTier: 10,
      qualityTier: 25,
      parameters: [
        {
          name: 'activity_key',
          type: 'string',
          description: 'Event attribute key for activity names',
          required: true,
          default: 'concept:name',
        },
        {
          name: 'error_rate',
          type: 'number',
          description: 'Acceptable error rate for probabilistic structures (0-1)',
          required: false,
          default: 0.01,
          min: 0.001,
          max: 0.1,
        },
      ],
      supportedProfiles: ['fast', 'balanced', 'stream'],
      estimatedDurationMs: 0.2,
      estimatedMemoryMB: 1,
      robustToNoise: true,
      scalesWell: true,
    });

    // Smart Engine (caching + early termination)
    this.registerWithInferredProfiles({
      id: 'smart_engine',
      name: 'Smart Engine',
      description:
        'Smart execution engine with adaptive algorithm selection, result caching, and early termination. Output type varies based on log characteristics.',
      outputType: 'dfg',
      complexity: 'O(n)',
      speedTier: 3,
      qualityTier: 45,
      parameters: [
        {
          name: 'activity_key',
          type: 'string',
          description: 'Event attribute key for activity names',
          required: true,
          default: 'concept:name',
        },
        {
          name: 'cache_enabled',
          type: 'boolean',
          description: 'Enable result caching',
          required: false,
          default: true,
        },
        {
          name: 'early_termination',
          type: 'boolean',
          description: 'Enable early termination when convergence detected',
          required: false,
          default: true,
        },
      ],
      supportedProfiles: ['fast', 'balanced', 'quality', 'stream'],
      estimatedDurationMs: 0.3,
      estimatedMemoryMB: 30,
      robustToNoise: true,
      scalesWell: true,
    });

    // ── ML Analysis ──────────────────────────────────────────
    // Note: these algorithms are backed by the @wasm4pm/ml TypeScript package,
    // not direct WASM exports. The WASM binary also exposes discover_ml_classify,
    // discover_ml_forecast, discover_ml_regress, discover_ml_pca, but the canonical
    // path is through @wasm4pm/ml (which uses wasm.extract_case_features + native TS).
    // The Phase 4 audit incorrectly removed these; they are re-added here.

    this.registerWithInferredProfiles({
      id: 'ml_classify',
      name: 'ML Trace Classification',
      description:
        'Classify traces by outcome using k-NN, logistic regression, decision tree, or naive Bayes.',
      outputType: 'ml_result',
      complexity: 'O(n²)',
      speedTier: 30,
      qualityTier: 55,
      parameters: [
        {
          name: 'activity_key',
          type: 'string',
          description: 'Activity key',
          required: true,
          default: 'concept:name',
        },
        {
          name: 'method',
          type: 'select',
          description: 'Classification method',
          required: false,
          default: 'knn',
          options: ['knn', 'logistic_regression', 'decision_tree', 'naive_bayes'],
        },
        {
          name: 'k',
          type: 'number',
          description: 'k-NN neighbours',
          required: false,
          default: 5,
          min: 1,
          max: 50,
        },
        {
          name: 'target_key',
          type: 'string',
          description: 'Target categorical column (e.g. outcome)',
          required: false,
          default: 'outcome',
        },
      ],
      supportedProfiles: ['balanced', 'quality'],
      estimatedDurationMs: 20,
      estimatedMemoryMB: 50,
      robustToNoise: true,
      scalesWell: true,
    });

    this.registerWithInferredProfiles({
      id: 'ml_cluster',
      name: 'ML Trace Clustering',
      description: 'Cluster traces by similarity using k-means or DBSCAN.',
      outputType: 'ml_result',
      complexity: 'O(n²)',
      speedTier: 35,
      qualityTier: 55,
      parameters: [
        {
          name: 'activity_key',
          type: 'string',
          description: 'Activity key',
          required: true,
          default: 'concept:name',
        },
        {
          name: 'method',
          type: 'select',
          description: 'Clustering method',
          required: false,
          default: 'kmeans',
          options: ['kmeans', 'dbscan'],
        },
        {
          name: 'k',
          type: 'number',
          description: 'Number of clusters',
          required: false,
          default: 3,
          min: 2,
          max: 20,
        },
        {
          name: 'eps',
          type: 'number',
          description: 'DBSCAN epsilon',
          required: false,
          default: 1.0,
          min: 0.01,
          max: 100,
        },
      ],
      supportedProfiles: ['balanced', 'quality'],
      estimatedDurationMs: 20,
      estimatedMemoryMB: 60,
      robustToNoise: true,
      scalesWell: true,
    });

    this.registerWithInferredProfiles({
      id: 'ml_forecast',
      name: 'ML Throughput Forecasting',
      description:
        'Forecast future process throughput using linear trend, autocorrelation seasonality, and optional exponential overlay.',
      outputType: 'ml_result',
      complexity: 'O(n)',
      speedTier: 25,
      qualityTier: 50,
      parameters: [
        {
          name: 'activity_key',
          type: 'string',
          description: 'Activity key',
          required: true,
          default: 'concept:name',
        },
        {
          name: 'forecast_periods',
          type: 'number',
          description: 'Number of future periods to forecast',
          required: false,
          default: 5,
          min: 1,
          max: 100,
        },
        {
          name: 'use_exponential',
          type: 'boolean',
          description: 'Also fit exponential model (y = a·e^bx)',
          required: false,
          default: false,
        },
      ],
      supportedProfiles: ['balanced', 'quality'],
      estimatedDurationMs: 10,
      estimatedMemoryMB: 20,
      robustToNoise: true,
      scalesWell: true,
    });

    this.registerWithInferredProfiles({
      id: 'ml_anomaly',
      name: 'ML Anomaly Detection',
      description:
        'Detect anomalous process windows using peak finding and seasonal decomposition on drift distances.',
      outputType: 'ml_result',
      complexity: 'O(n log n)',
      speedTier: 30,
      qualityTier: 55,
      parameters: [
        {
          name: 'activity_key',
          type: 'string',
          description: 'Activity key',
          required: true,
          default: 'concept:name',
        },
        {
          name: 'smoothing_method',
          type: 'select',
          description: 'Smoothing algorithm',
          required: false,
          default: 'sma',
          options: ['sma', 'ema'],
        },
      ],
      supportedProfiles: ['balanced', 'quality'],
      estimatedDurationMs: 15,
      estimatedMemoryMB: 30,
      robustToNoise: true,
      scalesWell: true,
    });

    this.registerWithInferredProfiles({
      id: 'ml_regress',
      name: 'ML Remaining Time Regression',
      description:
        'Predict remaining case cycle time using linear, polynomial, or exponential regression on trace features.',
      outputType: 'ml_result',
      complexity: 'O(n)',
      speedTier: 25,
      qualityTier: 50,
      parameters: [
        {
          name: 'activity_key',
          type: 'string',
          description: 'Activity key',
          required: true,
          default: 'concept:name',
        },
        {
          name: 'method',
          type: 'select',
          description: 'Regression method',
          required: false,
          default: 'linear_regression',
          options: ['linear_regression', 'polynomial_regression', 'exponential_regression'],
        },
        {
          name: 'target_key',
          type: 'string',
          description: 'Numeric target column (e.g. remaining_time)',
          required: false,
          default: 'remaining_time',
        },
      ],
      supportedProfiles: ['balanced', 'quality'],
      estimatedDurationMs: 15,
      estimatedMemoryMB: 30,
      robustToNoise: true,
      scalesWell: true,
    });

    this.registerWithInferredProfiles({
      id: 'ml_pca',
      name: 'ML PCA Feature Reduction',
      description:
        'Reduce trace feature dimensionality using Principal Component Analysis (Jacobi eigendecomposition).',
      outputType: 'ml_result',
      complexity: 'O(n³)',
      speedTier: 25,
      qualityTier: 55,
      parameters: [
        {
          name: 'activity_key',
          type: 'string',
          description: 'Activity key',
          required: true,
          default: 'concept:name',
        },
        {
          name: 'n_components',
          type: 'number',
          description: 'Number of principal components to keep',
          required: false,
          default: 2,
          min: 1,
          max: 20,
        },
        {
          name: 'normalize',
          type: 'boolean',
          description: 'Min-max normalise columns before PCA',
          required: false,
          default: true,
        },
      ],
      supportedProfiles: ['balanced', 'quality'],
      estimatedDurationMs: 20,
      estimatedMemoryMB: 40,
      robustToNoise: false,
      scalesWell: false,
    });

    // ─── Wave 1 Migration: Discovery algorithms ───────────────────────────

    this.registerWithInferredProfiles({
      id: 'transition_system',
      name: 'Transition System Discovery',
      description: 'Build a state machine from the event log using a sliding window approach.',
      outputType: 'dfg',
      complexity: 'O(n²)',
      speedTier: 70,
      qualityTier: 50,
      parameters: [
        {
          name: 'activity_key',
          type: 'string',
          description: 'Event attribute key for activity names',
          required: true,
          default: 'concept:name',
        },
        {
          name: 'window',
          type: 'number',
          description: 'Sliding window size',
          required: false,
          default: 1,
          min: 1,
          max: 10,
        },
        {
          name: 'direction',
          type: 'select',
          description: 'Window direction',
          required: false,
          default: 'forward',
          options: ['forward', 'backward'],
        },
      ],
      supportedProfiles: ['quality', 'stream'],
      estimatedDurationMs: 15,
      estimatedMemoryMB: 50,
      robustToNoise: true,
      scalesWell: true,
    });

    this.registerWithInferredProfiles({
      id: 'log_to_trie',
      name: 'Prefix Tree Discovery',
      description: 'Build a prefix tree (trie) from log variants.',
      outputType: 'dfg',
      complexity: 'O(n)',
      speedTier: 75,
      qualityTier: 50,
      parameters: [
        {
          name: 'activity_key',
          type: 'string',
          description: 'Event attribute key for activity names',
          required: true,
          default: 'concept:name',
        },
      ],
      supportedProfiles: ['balanced', 'quality', 'stream'],
      estimatedDurationMs: 10,
      estimatedMemoryMB: 30,
      robustToNoise: true,
      scalesWell: true,
    });

    this.registerWithInferredProfiles({
      id: 'causal_graph',
      name: 'Causal Graph Discovery',
      description: 'Discover causal dependencies using alpha or heuristic methods.',
      outputType: 'dfg',
      complexity: 'O(n²)',
      speedTier: 60,
      qualityTier: 55,
      parameters: [
        {
          name: 'activity_key',
          type: 'string',
          description: 'Event attribute key for activity names',
          required: true,
          default: 'concept:name',
        },
        {
          name: 'method',
          type: 'select',
          description: 'Discovery method',
          required: false,
          default: 'heuristic',
          options: ['alpha', 'heuristic'],
        },
        {
          name: 'dependency_threshold',
          type: 'number',
          description: 'Minimum dependency threshold (heuristic)',
          required: false,
          default: 0.5,
          min: 0,
          max: 1,
        },
      ],
      supportedProfiles: ['quality', 'stream'],
      estimatedDurationMs: 20,
      estimatedMemoryMB: 50,
      robustToNoise: false,
      scalesWell: true,
    });

    this.registerWithInferredProfiles({
      id: 'performance_spectrum',
      name: 'Performance Spectrum',
      description: 'Analyze duration statistics between activity pairs.',
      outputType: 'analytics',
      complexity: 'O(n²)',
      speedTier: 55,
      qualityTier: 60,
      parameters: [
        {
          name: 'activity_key',
          type: 'string',
          description: 'Activity attribute key',
          required: true,
          default: 'concept:name',
        },
        {
          name: 'timestamp_key',
          type: 'string',
          description: 'Timestamp attribute key',
          required: false,
          default: 'time:timestamp',
        },
      ],
      supportedProfiles: ['quality', 'stream'],
      estimatedDurationMs: 30,
      estimatedMemoryMB: 80,
      robustToNoise: false,
      scalesWell: false,
    });

    this.registerWithInferredProfiles({
      id: 'batches',
      name: 'Batch Detection',
      description: 'Detect batch patterns where cases share timestamps.',
      outputType: 'analytics',
      complexity: 'O(n²)',
      speedTier: 50,
      qualityTier: 55,
      parameters: [
        {
          name: 'activity_key',
          type: 'string',
          description: 'Activity attribute key',
          required: true,
          default: 'concept:name',
        },
        {
          name: 'timestamp_key',
          type: 'string',
          description: 'Timestamp attribute key',
          required: false,
          default: 'time:timestamp',
        },
        {
          name: 'batch_threshold',
          type: 'number',
          description: 'Maximum time difference within a batch (ms)',
          required: false,
          default: 86400000,
          min: 0,
        },
      ],
      supportedProfiles: ['quality', 'stream'],
      estimatedDurationMs: 35,
      estimatedMemoryMB: 60,
      robustToNoise: false,
      scalesWell: false,
    });

    this.registerWithInferredProfiles({
      id: 'correlation_miner',
      name: 'Correlation Miner',
      description: 'Discover DFG structure without case identifiers using timestamp correlation.',
      outputType: 'dfg',
      complexity: 'O(n²)',
      speedTier: 45,
      qualityTier: 60,
      parameters: [
        {
          name: 'timestamp_key',
          type: 'string',
          description: 'Timestamp attribute key',
          required: false,
          default: 'time:timestamp',
        },
        {
          name: 'activity_key',
          type: 'string',
          description: 'Activity attribute key',
          required: true,
          default: 'concept:name',
        },
        {
          name: 'max_gap',
          type: 'number',
          description: 'Maximum time gap between correlated events (ms)',
          required: false,
          default: 3600000,
          min: 0,
        },
      ],
      supportedProfiles: ['quality', 'stream'],
      estimatedDurationMs: 40,
      estimatedMemoryMB: 80,
      robustToNoise: false,
      scalesWell: false,
    });

    // ─── Wave 1 Migration: Conformance algorithms ──────────────────────────

    this.registerWithInferredProfiles({
      id: 'generalization',
      name: 'Generalization Metric',
      description: 'Measure how general a Petri net model is (avoids overfitting).',
      outputType: 'analytics',
      complexity: 'O(n²)',
      speedTier: 65,
      qualityTier: 65,
      parameters: [
        {
          name: 'petri_net_handle',
          type: 'string',
          description: 'Handle of the Petri net model',
          required: true,
        },
      ],
      supportedProfiles: ['quality'],
      estimatedDurationMs: 20,
      estimatedMemoryMB: 40,
      robustToNoise: true,
      scalesWell: true,
    });

    // petri_net_reduction: REMOVED — no #[wasm_bindgen] decorator (Phase 4 audit)

    this.registerWithInferredProfiles({
      id: 'etconformance_precision',
      name: 'ETConformance Precision',
      description: 'Measure precision via escaping-edge analysis.',
      outputType: 'analytics',
      complexity: 'O(n²)',
      speedTier: 55,
      qualityTier: 70,
      parameters: [
        {
          name: 'petri_net_handle',
          type: 'string',
          description: 'Handle of the Petri net model',
          required: true,
        },
      ],
      supportedProfiles: ['quality'],
      estimatedDurationMs: 25,
      estimatedMemoryMB: 50,
      robustToNoise: true,
      scalesWell: true,
    });

    this.registerWithInferredProfiles({
      id: 'alignments',
      name: 'A* Optimal Alignments',
      description: 'Compute optimal trace-to-model alignments using A* search.',
      outputType: 'analytics',
      complexity: 'NP-Hard',
      speedTier: 20,
      qualityTier: 90,
      parameters: [
        {
          name: 'sync_cost',
          type: 'number',
          description: 'Cost of synchronous move',
          required: false,
          default: 0,
          min: 0,
        },
        {
          name: 'log_move_cost',
          type: 'number',
          description: 'Cost of log move',
          required: false,
          default: 1,
          min: 0,
        },
        {
          name: 'model_move_cost',
          type: 'number',
          description: 'Cost of model move',
          required: false,
          default: 1,
          min: 0,
        },
      ],
      supportedProfiles: ['quality'],
      estimatedDurationMs: 200,
      estimatedMemoryMB: 200,
      robustToNoise: true,
      scalesWell: false,
    });

    // ─── Wave 1 Migration: Quality metrics ──────────────────────────────────

    this.registerWithInferredProfiles({
      id: 'complexity_metrics',
      name: 'POWL Complexity Metrics',
      description: 'Measure structural complexity of a POWL model.',
      outputType: 'analytics',
      complexity: 'O(n)',
      speedTier: 80,
      qualityTier: 60,
      parameters: [],
      supportedProfiles: ['balanced', 'quality', 'stream'],
      estimatedDurationMs: 5,
      estimatedMemoryMB: 20,
      robustToNoise: true,
      scalesWell: true,
    });

    // ─── Wave 1 Migration: Model conversion ────────────────────────────────

    this.registerWithInferredProfiles({
      id: 'pnml_import',
      name: 'PNML Import',
      description: 'Import a Petri net from PNML XML format.',
      outputType: 'petrinet',
      complexity: 'O(n²)',
      speedTier: 75,
      qualityTier: 80,
      parameters: [
        {
          name: 'pnml_xml',
          type: 'string',
          description: 'PNML XML string to import',
          required: true,
        },
      ],
      supportedProfiles: ['balanced', 'quality', 'stream'],
      estimatedDurationMs: 15,
      estimatedMemoryMB: 30,
      robustToNoise: true,
      scalesWell: true,
    });

    this.registerWithInferredProfiles({
      id: 'bpmn_import',
      name: 'BPMN Import',
      description: 'Import a BPMN 2.0 XML model and convert to POWL.',
      outputType: 'tree',
      complexity: 'O(n²)',
      speedTier: 70,
      qualityTier: 70,
      parameters: [
        {
          name: 'bpmn_xml',
          type: 'string',
          description: 'BPMN 2.0 XML string to import',
          required: true,
        },
      ],
      supportedProfiles: ['balanced', 'quality', 'stream'],
      estimatedDurationMs: 20,
      estimatedMemoryMB: 40,
      robustToNoise: true,
      scalesWell: true,
    });

    this.registerWithInferredProfiles({
      id: 'powl_to_process_tree',
      name: 'POWL to Process Tree',
      description: 'Convert a POWL model to a process tree representation.',
      outputType: 'tree',
      complexity: 'O(n)',
      speedTier: 75,
      qualityTier: 70,
      parameters: [],
      supportedProfiles: ['balanced', 'quality', 'stream'],
      estimatedDurationMs: 10,
      estimatedMemoryMB: 30,
      robustToNoise: true,
      scalesWell: true,
    });

    this.registerWithInferredProfiles({
      id: 'yawl_export',
      name: 'YAWL Export',
      description: 'Export a POWL model to YAWL v6 XML format.',
      outputType: 'tree',
      complexity: 'O(n)',
      speedTier: 75,
      qualityTier: 70,
      parameters: [],
      supportedProfiles: ['balanced', 'quality', 'stream'],
      estimatedDurationMs: 10,
      estimatedMemoryMB: 30,
      robustToNoise: true,
      scalesWell: true,
    });

    // ─── Wave 1 Migration: Simulation ──────────────────────────────────────

    this.registerWithInferredProfiles({
      id: 'playout',
      name: 'Process Tree Playout',
      description: 'Simulate event log generation from a process tree or DFG.',
      outputType: 'analytics',
      complexity: 'O(n²)',
      speedTier: 60,
      qualityTier: 50,
      parameters: [
        {
          name: 'num_traces',
          type: 'number',
          description: 'Number of traces to generate',
          required: false,
          default: 100,
          min: 1,
          max: 10000,
        },
        {
          name: 'max_trace_length',
          type: 'number',
          description: 'Maximum trace length',
          required: false,
          default: 100,
          min: 1,
          max: 1000,
        },
      ],
      supportedProfiles: ['balanced', 'quality', 'stream'],
      estimatedDurationMs: 50,
      estimatedMemoryMB: 60,
      robustToNoise: true,
      scalesWell: true,
    });

    // Monte Carlo Simulation
    this.registerWithInferredProfiles({
      id: 'monte_carlo_simulation',
      name: 'Monte Carlo Simulation',
      description:
        'Run Monte Carlo simulation with stochastic replay for probabilistic process analysis.',
      outputType: 'dfg',
      complexity: 'O(n²)',
      speedTier: 70,
      qualityTier: 60,
      parameters: [
        {
          name: 'model_handle',
          type: 'string',
          description: 'Handle to the event log or model to simulate',
          required: true,
        },
        {
          name: 'powl_handle',
          type: 'string',
          description: 'Handle to POWL model (optional, not used in current implementation)',
          required: false,
        },
        {
          name: 'root_id',
          type: 'string',
          description: 'Root ID for POWL model (optional, not used in current implementation)',
          required: false,
        },
        {
          name: 'num_cases',
          type: 'number',
          description: 'Number of simulation cases to generate',
          required: false,
          default: 1000,
          min: 100,
          max: 100000,
        },
        {
          name: 'inter_arrival_mean_ms',
          type: 'number',
          description: 'Mean inter-arrival time in milliseconds',
          required: false,
          default: 1000.0,
        },
        {
          name: 'simulation_time_ms',
          type: 'number',
          description: 'Total simulation time in milliseconds',
          required: false,
          default: 60000,
        },
        {
          name: 'random_seed',
          type: 'number',
          description: 'Random seed for reproducibility',
          required: false,
          default: 42,
        },
      ],
      supportedProfiles: ['quality'],
      estimatedDurationMs: 100,
      estimatedMemoryMB: 150,
      robustToNoise: true,
      scalesWell: false,
    });

    // ─── Social Network Mining (van der Aalst organisational perspective) ──
    // These two WASM exports (discover_handover_network, discover_working_together_network)
    // existed in Rust but were completely unreachable from TypeScript — dead exports.
    // The organisational perspective is a first-class van der Aalst dimension.

    this.registerWithInferredProfiles({
      id: 'handover_network',
      name: 'Handover-of-Work Network',
      description:
        'Mine organisational handover-of-work networks from event logs (van der Aalst social network mining). ' +
        'Produces a weighted graph where edge weight = number of direct handovers between resource pairs. ' +
        'WASM export: discover_handover_network(log_handle, resource_key).',
      outputType: 'analytics',
      complexity: 'O(n²)',
      speedTier: 40,
      qualityTier: 60,
      parameters: [
        {
          name: 'resource_key',
          type: 'string',
          description: 'Event attribute key for the resource/performer (e.g. "org:resource")',
          required: true,
          default: 'org:resource',
        },
      ],
      supportedProfiles: ['balanced', 'quality'],
      estimatedDurationMs: 15,
      estimatedMemoryMB: 40,
      robustToNoise: true,
      scalesWell: true,
      references: ['van der Aalst et al. (2005) Mining Social Networks from Event Logs'],
    });

    this.registerWithInferredProfiles({
      id: 'working_together_network',
      name: 'Working-Together Network',
      description:
        'Mine working-together social networks: edges represent resources that handled the same case. ' +
        'Complements handover-of-work by capturing collaboration rather than sequential handoff. ' +
        'WASM export: discover_working_together_network(log_handle, resource_key).',
      outputType: 'analytics',
      complexity: 'O(n²)',
      speedTier: 45,
      qualityTier: 60,
      parameters: [
        {
          name: 'resource_key',
          type: 'string',
          description: 'Event attribute key for the resource/performer (e.g. "org:resource")',
          required: true,
          default: 'org:resource',
        },
      ],
      supportedProfiles: ['balanced', 'quality'],
      estimatedDurationMs: 18,
      estimatedMemoryMB: 45,
      robustToNoise: true,
      scalesWell: true,
      references: ['van der Aalst et al. (2005) Mining Social Networks from Event Logs'],
    });

    // ─── OCEL (Object-Centric Event Log) algorithms ────────────────────────
    //
    // These algorithms operate on OCEL handles (loaded via load_ocel_from_json).
    // They are only available in WASM builds with feature-ocel (fog and browser profiles).
    // Input: an OCEL handle (NOT a conventional XES event log handle).

    this.registerWithInferredProfiles({
      id: 'ocel_dfg',
      name: 'OC-DFG (Aggregate)',
      description:
        'Discover an aggregate Object-Centric Directly-Follows Graph (OC-DFG) across all object types. ' +
        'Produces a single DFG where each node is an activity and edges reflect directly-follows relations ' +
        'observed across all object types in the OCEL. ' +
        'WASM export: discover_ocel_dfg(ocel_handle). Requires feature-ocel.',
      outputType: 'dfg',
      complexity: 'O(n)',
      speedTier: 5,
      qualityTier: 30,
      parameters: [],
      supportedProfiles: ['fast', 'balanced', 'quality'],
      estimatedDurationMs: 1,
      estimatedMemoryMB: 30,
      robustToNoise: true,
      scalesWell: true,
      references: ['van der Aalst (2019) Object-Centric Process Mining'],
    });

    this.registerWithInferredProfiles({
      id: 'ocel_dfg_per_type',
      name: 'OC-DFG Per Object Type',
      description:
        'Discover per-object-type Directly-Follows Graphs from an OCEL. Returns a map from ' +
        'object_type to DFG, allowing separate process views for each object type (e.g. Order, Item). ' +
        'This is the canonical OC-DFG projection for object-centric process mining. ' +
        'WASM export: discover_ocel_dfg_per_type(ocel_handle). Requires feature-ocel.',
      outputType: 'dfg',
      complexity: 'O(n)',
      speedTier: 8,
      qualityTier: 40,
      parameters: [],
      supportedProfiles: ['balanced', 'quality'],
      estimatedDurationMs: 2,
      estimatedMemoryMB: 40,
      robustToNoise: true,
      scalesWell: true,
      references: ['van der Aalst (2019) Object-Centric Process Mining'],
    });

    this.registerWithInferredProfiles({
      id: 'ocel_petri_net',
      name: 'OC-Petri Net Discovery',
      description:
        'Discover an Object-Centric Petri Net (OC-Petri net) from an OCEL. The OC-Petri net captures ' +
        'concurrency and synchronization between different object types. ' +
        'WASM export: discover_oc_petri_net(ocel_handle, algorithm). Requires feature-ocel.',
      outputType: 'petrinet',
      complexity: 'O(n²)',
      speedTier: 35,
      qualityTier: 65,
      parameters: [
        {
          name: 'algorithm',
          type: 'select',
          description: 'Discovery algorithm variant',
          required: false,
          default: 'inductive',
          options: ['inductive', 'alpha', 'heuristic'],
        },
      ],
      supportedProfiles: ['balanced', 'quality'],
      estimatedDurationMs: 20,
      estimatedMemoryMB: 80,
      robustToNoise: true,
      scalesWell: false,
      references: ['van der Aalst (2019) Object-Centric Process Mining'],
    });

    this.registerWithInferredProfiles({
      id: 'ocel_encode',
      name: 'OCEL Text Encoding',
      description:
        'Encode an OCEL as a compact human-readable text representation suitable for LLM context, ' +
        'process inspection, and diff display. ' +
        'WASM export: encode_ocel_as_text(ocel_handle). Requires feature-ocel.',
      outputType: 'analytics',
      complexity: 'O(n)',
      speedTier: 5,
      qualityTier: 20,
      parameters: [],
      supportedProfiles: ['fast', 'balanced', 'quality', 'stream'],
      estimatedDurationMs: 0.5,
      estimatedMemoryMB: 10,
      robustToNoise: true,
      scalesWell: true,
    });

    // Prediction APIs
    this.registerWithInferredProfiles({
      id: 'predict_next_activity',
      name: 'Next Activity Prediction',
      description:
        'Predict the most likely next activity in a process using n-gram (Markov chain) models. ' +
        'Build model with build_ngram_predictor(), predict with predict_next_activity(). ' +
        'Returns activity predictions with probabilities.',
      outputType: 'analytics',
      complexity: 'O(n)',
      speedTier: 15,
      qualityTier: 50,
      parameters: [
        {
          name: 'activity_key',
          type: 'string',
          description: 'Event attribute key for activity names',
          required: true,
          default: 'concept:name',
        },
        {
          name: 'n',
          type: 'number',
          description: 'N-gram order (context window size)',
          required: false,
          default: 2,
          min: 2,
          max: 5,
        },
      ],
      supportedProfiles: ['balanced', 'quality'],
      estimatedDurationMs: 5,
      estimatedMemoryMB: 30,
      robustToNoise: true,
      scalesWell: true,
    });

    this.registerWithInferredProfiles({
      id: 'predict_remaining_time',
      name: 'Remaining Time Prediction',
      description:
        'Predict remaining time to case completion using statistical bucket models and Weibull distribution. ' +
        'Build model with build_remaining_time_model(), predict with predict_case_duration(). ' +
        'Returns remaining milliseconds with confidence score.',
      outputType: 'analytics',
      complexity: 'O(n)',
      speedTier: 20,
      qualityTier: 55,
      parameters: [
        {
          name: 'activity_key',
          type: 'string',
          description: 'Event attribute key for activity names',
          required: true,
          default: 'concept:name',
        },
        {
          name: 'timestamp_key',
          type: 'string',
          description: 'Event attribute key for timestamps',
          required: true,
          default: 'time:timestamp',
        },
      ],
      supportedProfiles: ['balanced', 'quality'],
      estimatedDurationMs: 10,
      estimatedMemoryMB: 40,
      robustToNoise: true,
      scalesWell: true,
    });

    this.registerWithInferredProfiles({
      id: 'predict_outcome',
      name: 'Outcome Prediction',
      description:
        'Predict case outcome (success/anomaly) using anomaly scoring against DFG model and boundary coverage analysis. ' +
        'Build models with discover_dfg() and build_ngram_predictor(), score with score_anomaly() and compute_boundary_coverage(). ' +
        'Returns anomaly score and coverage metrics.',
      outputType: 'analytics',
      complexity: 'O(n²)',
      speedTier: 25,
      qualityTier: 55,
      parameters: [
        {
          name: 'activity_key',
          type: 'string',
          description: 'Event attribute key for activity names',
          required: true,
          default: 'concept:name',
        },
        {
          name: 'anomaly_threshold',
          type: 'number',
          description: 'Score threshold for anomaly detection (0-1)',
          required: false,
          default: 0.7,
          min: 0,
          max: 1,
        },
      ],
      supportedProfiles: ['balanced', 'quality'],
      estimatedDurationMs: 15,
      estimatedMemoryMB: 50,
      robustToNoise: true,
      scalesWell: true,
    });
  }

  /**
   * Register a single algorithm (with manual deployment profiles)
   */
  register(metadata: AlgorithmMetadata): void {
    this.algorithms.set(metadata.id, metadata);
  }

  /**
   * Register algorithm with auto-calculated deployment profiles
   */
  registerWithInferredProfiles(metadata: Omit<AlgorithmMetadata, 'deploymentProfiles'>): void {
    const deploymentProfiles = this.inferDeploymentProfiles(metadata.supportedProfiles);
    this.register({
      ...metadata,
      deploymentProfiles,
    });
  }

  /**
   * Infer deployment profiles from supported execution profiles.
   *
   * Profile hierarchy (smallest → largest binary):
   *   mobile (~500KB) ⊆ iot (~1MB) ⊆ edge (~1.5MB) ⊆ fog (~2MB) ⊆ browser (~2.7MB)
   *
   * - fast profile   → mobile, iot, browser       (basic DFG runs everywhere)
   * - balanced profile → edge, fog, browser        (heuristic/alpha require edge+)
   * - quality profile  → fog, browser              (genetic/ILP require fog+)
   * - stream profile   → mobile, iot, edge, fog, browser (streaming is universal)
   *
   * Result: 'browser' always has the superset — it is the full-featured build.
   */
  private inferDeploymentProfiles(profiles: ExecutionProfile[]): DeploymentProfile[] {
    const result = new Set<DeploymentProfile>();

    for (const profile of profiles) {
      switch (profile) {
        case 'fast':
          result.add('mobile');
          result.add('iot');
          result.add('browser');
          break;
        case 'balanced':
          result.add('edge');
          result.add('fog');
          result.add('browser');
          break;
        case 'quality':
          result.add('fog');
          result.add('browser');
          break;
        case 'stream':
          result.add('mobile');
          result.add('iot');
          result.add('edge');
          result.add('fog');
          result.add('browser');
          break;
      }
    }

    return Array.from(result);
  }

  /**
   * Get algorithm by ID
   */
  get(algorithmId: string): AlgorithmMetadata | undefined {
    return this.algorithms.get(algorithmId);
  }

  /**
   * List all algorithms
   */
  list(): AlgorithmMetadata[] {
    return Array.from(this.algorithms.values());
  }

  /**
   * Get algorithms for a profile
   */
  getForProfile(profile: ExecutionProfile): AlgorithmMetadata[] {
    const ids = this.profileMap.get(profile) || [];
    return ids.map((id) => this.algorithms.get(id)!).filter((a) => a !== undefined);
  }

  /**
   * Build profile map from algorithm registrations
   */
  private buildProfileMap(): void {
    const profileMap = new Map<ExecutionProfile, Set<string>>();
    const profiles: ExecutionProfile[] = ['fast', 'balanced', 'quality', 'stream'];

    for (const profile of profiles) {
      profileMap.set(profile, new Set());
    }

    for (const [id, metadata] of this.algorithms) {
      for (const profile of metadata.supportedProfiles) {
        const set = profileMap.get(profile);
        if (set) {
          set.add(id);
        }
      }
    }

    // Convert sets to arrays
    for (const [profile, set] of profileMap) {
      this.profileMap.set(profile, Array.from(set));
    }
  }

  /**
   * Get algorithms for a deployment profile
   */
  getForDeploymentProfile(profile: DeploymentProfile): AlgorithmMetadata[] {
    const ids = this.deploymentProfileMap.get(profile) || [];
    return ids.map((id) => this.algorithms.get(id)!).filter((a) => a !== undefined);
  }

  /**
   * Get algorithms that handle the given input format.
   *
   * 'ocel' returns all algorithms whose IDs start with 'ocel_' — these require
   * an OCEL handle (loaded via load_ocel_from_json) rather than a flat XES handle.
   * They are only available in fog and browser deployment profiles (feature-ocel).
   *
   * 'xes' returns all algorithms that operate on conventional XES event log handles.
   *
   * This method is the canonical way for the CLI and planner to filter algorithms
   * by input format, enabling the PM lifecycle loop to guide practitioners to the
   * right algorithm for their log type.
   */
  getForInputFormat(inputFormat: 'ocel' | 'xes'): AlgorithmMetadata[] {
    return Array.from(this.algorithms.values()).filter((a) => {
      if (inputFormat === 'ocel') {
        return a.id.startsWith('ocel_');
      }
      // xes: everything that is NOT an OCEL-specific algorithm
      return !a.id.startsWith('ocel_');
    });
  }

  /**
   * Build deployment profile map from algorithm registrations
   */
  private buildDeploymentProfileMap(): void {
    const profileMap = new Map<DeploymentProfile, Set<string>>();
    const profiles: DeploymentProfile[] = ['mobile', 'iot', 'edge', 'fog', 'browser'];

    for (const profile of profiles) {
      profileMap.set(profile, new Set());
    }

    for (const [id, metadata] of this.algorithms) {
      for (const profile of metadata.deploymentProfiles) {
        const set = profileMap.get(profile);
        if (set) {
          set.add(id);
        }
      }
    }

    // Convert sets to arrays
    for (const [profile, set] of profileMap) {
      this.deploymentProfileMap.set(profile, Array.from(set));
    }
  }

  /**
   * Suggest best algorithm for a profile and log size
   */
  suggestForProfile(profile: ExecutionProfile, logSize: number): AlgorithmMetadata | undefined {
    const algorithms = this.getForProfile(profile);

    if (algorithms.length === 0) {
      return undefined;
    }

    // For very small logs, prefer speed
    // For medium logs, balance speed and quality
    // For large logs, prefer algorithms that scale well
    const isLargeLog = logSize > 100000;

    let candidates = algorithms;

    if (isLargeLog) {
      candidates = candidates.filter((a) => a.scalesWell);
    }

    if (candidates.length === 0) {
      candidates = algorithms;
    }

    // Sort by: quality tier (desc) and speed tier (asc)
    candidates.sort((a, b) => {
      if (b.qualityTier !== a.qualityTier) {
        return b.qualityTier - a.qualityTier; // higher quality first
      }
      return a.speedTier - b.speedTier; // lower speed (faster) first
    });

    return candidates[0];
  }

  /**
   * Recommend the best discovery algorithm for a given log size and execution profile.
   *
   * Implements the Van der Aalst quality/speed tradeoff:
   *   - fast   → dfg always (linear time, suits any log size)
   *   - quality → genetic_algorithm when feasible, heuristic_miner as speed guard for large logs
   *   - balanced → size-aware heuristic: inductive for small/simple logs, heuristic for medium,
   *               dfg when the log is too large to afford O(n²) algorithms
   *
   * Returns a registered algorithm ID that callers can pass directly to `run()`.
   */
  getBestAlgorithmForLogSize(logSize: {
    traces: number;
    activities: number;
    profile: 'fast' | 'balanced' | 'quality';
  }): string {
    const { traces, activities, profile } = logSize;

    // Quality profile: use best available, but guard against extreme log sizes
    if (profile === 'quality') {
      if (traces > 10_000) return 'heuristic_miner'; // speed guard — genetic too slow
      return 'genetic_algorithm'; // best quality when feasible
    }

    // Fast profile: always dfg — linear time, fits any log size
    if (profile === 'fast') return 'dfg';

    // Balanced: heuristic tradeoff — dfg at scale, inductive for small clean logs, heuristic otherwise
    if (traces > 50_000 || activities > 200) return 'dfg';
    if (traces > 10_000) return 'heuristic_miner';
    if (activities < 20 && traces < 5_000) return 'inductive_miner';
    return 'heuristic_miner';
  }
}

/**
 * Create a singleton registry instance
 */
let registryInstance: AlgorithmRegistry | null = null;

/**
 * Get or create the global algorithm registry
 */
export function getRegistry(): AlgorithmRegistry {
  if (!registryInstance) {
    registryInstance = new AlgorithmRegistry();
  }
  return registryInstance;
}
