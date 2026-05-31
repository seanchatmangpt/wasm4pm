/**
 * multi-algorithm.ts
 * Multi-algorithm planning for @wasm4pm/planner.
 *
 * planMultiAlgorithm(config, candidates) generates one ExecutionPlan per
 * candidate algorithm and returns a MultiAlgorithmPlan that surfaces:
 * - All individual plans (indexed by algorithm ID)
 * - A ranked selection recommendation with selection criteria
 * - Per-algorithm quality and speed tradeoff metadata
 *
 * Oracle: Rank-2 domain contract — selection criteria derive from Van der
 * Aalst quality/speed taxonomy embedded in the kernel registry.
 */

import type { Config, ExecutionPlan } from './planner.js';
import { plan } from './planner.js';

// Registry speed/quality tiers embedded here to avoid circular dependency
// (multi-algorithm.ts → kernel registry would create a circular dep chain).
// Kept in sync with packages/kernel/src/registry.ts.
const REGISTRY_SPEED_TIER: Record<string, number> = {
  dfg: 5,
  process_skeleton: 3,
  simd_streaming_dfg: 2,
  heuristic_miner: 25,
  alpha_plus_plus: 20,
  inductive_miner: 30,
  hill_climbing: 40,
  declare: 35,
  simulated_annealing: 55,
  a_star: 60,
  aco: 65,
  pso: 70,
  genetic_algorithm: 75,
  optimized_dfg: 70,
  ilp: 80,
};

// Speed tier range for normalisation (from registry: 2 = simd_streaming_dfg, 80 = ilp)
const SPEED_TIER_MIN = 1;
const SPEED_TIER_MAX = 80;

// ─── Public types ─────────────────────────────────────────────────────────────

/**
 * A single algorithm entry inside a MultiAlgorithmPlan.
 */
export interface AlgorithmPlanEntry {
  /** Algorithm identifier */
  algorithm: string;

  /** The full ExecutionPlan for this algorithm */
  plan: ExecutionPlan;

  /** Estimated wall-clock duration for this plan in ms */
  estimated_duration_ms: number;

  /** Estimated peak memory for this plan in MB */
  estimated_memory_mb: number;

  /** Quality prediction fitness estimate [0, 1] */
  fitness_estimate: number;

  /** Confidence of the fitness estimate */
  confidence: 'high' | 'medium' | 'low';
}

/**
 * The result of planMultiAlgorithm().
 * Contains one plan per candidate algorithm plus a ranked selection.
 */
export interface MultiAlgorithmPlan {
  /** Plans indexed by algorithm ID, in the order of the `candidates` input */
  plans: AlgorithmPlanEntry[];

  /**
   * Recommended algorithm from the set based on balanced speed/quality criteria.
   * Uses the profile's quality floor to determine the tradeoff.
   */
  recommended: string;

  /**
   * Human-readable explanation of why the recommended algorithm was selected.
   */
  selection_criteria: string;

  /**
   * Algorithms ranked from best to worst based on the profile's priority
   * (fast profile: speed first; quality profile: quality first; balanced: composite score).
   */
  ranked: string[];
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** Weight for speed vs quality in composite score by profile.
 *
 * fast/stream:  speed-dominant (0.85+)
 * balanced:     equal weight (0.40)
 * quality:      quality-dominant (0.05) — almost exclusively quality-ranked
 */
const PROFILE_SPEED_WEIGHT: Record<string, number> = {
  fast: 0.85,
  stream: 0.90,
  balanced: 0.40,
  quality: 0.05,
};

/**
 * Composite score in [0, 1]: higher is a better pick for the given profile.
 *
 * Speed signal: normalised from registry speed tier (lower tier = faster = higher score).
 * Quality signal: normalised fitness_estimate from plan quality_prediction.
 *
 * Using the registry speed tier rather than raw plan duration gives a stable,
 * profile-independent speed signal that reflects the algorithm's inherent complexity.
 */
function compositeScore(
  entry: AlgorithmPlanEntry,
  speedWeight: number
): number {
  const speedTier = REGISTRY_SPEED_TIER[entry.algorithm] ?? 50;

  // Normalise speed: 1.0 = fastest (speedTier = SPEED_TIER_MIN), 0.0 = slowest
  const normSpeed = 1 - (speedTier - SPEED_TIER_MIN) / (SPEED_TIER_MAX - SPEED_TIER_MIN);

  // Normalise quality: fitness_estimate is already in [0, 1].
  const normQuality = Math.max(0, Math.min(1, entry.fitness_estimate));

  return speedWeight * normSpeed + (1 - speedWeight) * normQuality;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Generate execution plans for multiple candidate algorithms and return a
 * ranked MultiAlgorithmPlan.
 *
 * Each candidate algorithm is applied as an algorithm override (config.algorithm.name)
 * on top of the provided base config. The profile, source, sink, and all other
 * settings are inherited from the base config.
 *
 * @param baseConfig  Base configuration (profile, source, etc.)
 * @param candidates  List of algorithm IDs to plan for
 * @returns           MultiAlgorithmPlan with all plans + ranked recommendation
 * @throws            PlannerError if any individual plan fails to generate
 */
export function planMultiAlgorithm(
  baseConfig: Config,
  candidates: string[]
): MultiAlgorithmPlan {
  if (candidates.length === 0) {
    throw new Error('planMultiAlgorithm requires at least one candidate algorithm.');
  }

  const profile = baseConfig.execution.profile ?? 'balanced';
  const speedWeight = PROFILE_SPEED_WEIGHT[profile] ?? 0.50;

  // Generate one plan per candidate algorithm
  const entries: AlgorithmPlanEntry[] = candidates.map((algorithmId) => {
    const algorithmConfig: Config = {
      ...baseConfig,
      algorithm: {
        ...(baseConfig.algorithm ?? {}),
        name: algorithmId,
      },
    };

    const p = plan(algorithmConfig);

    return {
      algorithm: algorithmId,
      plan: p,
      estimated_duration_ms: p.estimated_duration_ms,
      estimated_memory_mb: p.estimated_memory_mb,
      fitness_estimate: p.quality_prediction.fitness_estimate,
      confidence: p.quality_prediction.confidence,
    };
  });

  // Rank entries by composite score (descending).
  // Score uses registry speed tier so ranking is stable and algorithm-intrinsic.
  const ranked = [...entries]
    .sort((a, b) => compositeScore(b, speedWeight) - compositeScore(a, speedWeight))
    .map((e) => e.algorithm);

  const recommended = ranked[0];
  const bestEntry = entries.find((e) => e.algorithm === recommended)!;

  // Build selection criteria string
  const criteria = _buildCriteria(recommended, bestEntry, profile, speedWeight, entries);

  return {
    plans: entries,
    recommended,
    selection_criteria: criteria,
    ranked,
  };
}

function _buildCriteria(
  recommended: string,
  entry: AlgorithmPlanEntry,
  profile: string,
  speedWeight: number,
  all: AlgorithmPlanEntry[]
): string {
  const priorityLabel =
    speedWeight >= 0.70 ? 'speed-first' :
    speedWeight <= 0.20 ? 'quality-first' :
    'balanced speed/quality';

  const fitnessNote = `estimated fitness ${(entry.fitness_estimate * 100).toFixed(0)}%`;
  const durationNote = entry.estimated_duration_ms < 1000
    ? `~${entry.estimated_duration_ms} ms`
    : `~${(entry.estimated_duration_ms / 1000).toFixed(1)} s`;

  const totalAlgos = all.length;
  return (
    `Selected "${recommended}" under ${priorityLabel} scoring for the "${profile}" profile. ` +
    `${fitnessNote}, estimated runtime ${durationNote}. ` +
    `Ranked best of ${totalAlgos} candidate algorithm${totalAlgos !== 1 ? 's' : ''}.`
  );
}
