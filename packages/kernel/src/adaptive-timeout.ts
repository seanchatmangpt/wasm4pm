/**
 * adaptive-timeout.ts
 *
 * Computes runtime-adaptive timeout values based on log complexity and algorithm characteristics.
 *
 * Design: Timeout is a function of three dimensions:
 *   1. Event count (log size) — scales linearly with events
 *   2. Complexity indicator (simple vs complex log structure)
 *   3. Algorithm type (fast: dfg/skeleton vs quality: genetic/ilp)
 *
 * Formula:
 *   timeout_ms = base
 *              + (eventCount / 10_000) * event_factor_ms
 *              + complexity_multiplier * base
 *              + algorithm_multiplier * base
 *
 * Bounds: [5000, 300000] (5–300 seconds)
 *
 * Oracle: Rank 2 (Domain contract) — timeout formula must align with Cycle 54
 * baseline measurements.
 */

export interface TimeoutFactors {
  /** Measured event count from the log */
  eventCount: number;

  /** Simple (1.0) or complex (2.0) log structure estimate */
  complexity: 'simple' | 'complex';

  /** Algorithm tier: 'fast', 'balanced', or 'quality' */
  algorithmTier: 'fast' | 'balanced' | 'quality';

  /** Specific algorithm name (used for overrides) */
  algorithmName?: string;
}

export interface TimeoutResult {
  /** Computed timeout in milliseconds */
  timeoutMs: number;

  /** Breakdown of timeout computation (for debugging/observability) */
  breakdown: {
    base_ms: number;
    event_factor_ms: number;
    complexity_multiplier: number;
    algorithm_multiplier: number;
  };
}

// ─── Timeout formula parameters ───────────────────────────────────────────────
//
// These constants define the timeout scaling behavior. They are empirically
// derived from Cycle 54 baseline measurements (performance_baseline.json).

const BASE_TIMEOUT_MS = 30_000; // 30 seconds — reasonable for most algorithms

// Event factor: 50ms per 10K events
// Example: 100K events → +500ms additional
const EVENT_FACTOR_MS_PER_10K = 50;

// Complexity multiplier: 1.5× for complex logs (high variance, many variants)
const COMPLEXITY_MULTIPLIER = {
  simple: 1.0,
  complex: 1.5,
};

// Algorithm multiplier: tier-based scaling
// Fast (dfg/skeleton): 0.8× (fast baseline)
// Balanced (heuristic/inductive): 1.0× (moderate overhead)
// Quality (genetic/ilp): 2.0× (significant overhead)
const ALGORITHM_MULTIPLIER = {
  fast: 0.8,
  balanced: 1.0,
  quality: 2.0,
};

// Per-algorithm overrides (name-based)
// These are consulted first; if a match exists, other factors are applied on top.
const ALGORITHM_OVERRIDES: Record<string, number> = {
  dfg: 0.7, // Fast algorithm, minimal overhead
  simd_streaming_dfg: 0.7,
  process_skeleton: 0.7,
  alpha_plus_plus: 0.9,
  heuristic_miner: 1.0,
  inductive_miner: 1.0,
  hill_climbing: 1.3,
  declare: 1.0,
  simulated_annealing: 1.5,
  a_star: 2.0,
  aco: 2.0,
  pso: 2.0,
  genetic_algorithm: 2.5,
  optimized_dfg: 1.0,
  ilp: 3.0,
};

// Bounds for all computed timeouts
const MIN_TIMEOUT_MS = 5_000; // 5 seconds
const MAX_TIMEOUT_MS = 300_000; // 5 minutes

/**
 * Compute an adaptive timeout value based on log complexity and algorithm characteristics.
 *
 * @param factors Input dimensions for timeout calculation
 * @returns Computed timeout in milliseconds and breakdown for observability
 *
 * Example:
 * ```ts
 * const result = computeTimeout({
 *   eventCount: 100_000,
 *   complexity: 'complex',
 *   algorithmTier: 'quality',
 *   algorithmName: 'genetic_algorithm'
 * });
 * console.log(`Timeout: ${result.timeoutMs}ms`); // ~180000 (3 minutes)
 * console.log(result.breakdown); // { base_ms, event_factor_ms, ... }
 * ```
 */
export function computeTimeout(factors: TimeoutFactors): TimeoutResult {
  const { eventCount, complexity, algorithmTier, algorithmName } = factors;

  // ─── Step 1: Determine algorithm multiplier ─────────────────────────────────
  //
  // Check for algorithm-specific override first; fall back to tier-based multiplier.
  let algorithmMultiplier = algorithmTier && ALGORITHM_MULTIPLIER[algorithmTier];
  if (algorithmName && algorithmName in ALGORITHM_OVERRIDES) {
    algorithmMultiplier = ALGORITHM_OVERRIDES[algorithmName];
  }

  // ─── Step 2: Compute base timeout ──────────────────────────────────────────
  //
  // Formula: base + event_scaling + complexity + algorithm
  const complexityMultiplier = COMPLEXITY_MULTIPLIER[complexity] ?? 1.0;
  const eventFactorMs = (eventCount / 10_000) * EVENT_FACTOR_MS_PER_10K;

  // Combine factors: base + event scaling + (complexity * base) + (algorithm * base)
  // Rationale: complexity and algorithm are multipliers on the base, not absolute additions.
  // This prevents excessive timeout inflation for large logs with complex algorithms.
  const baseWithComplexity = BASE_TIMEOUT_MS * complexityMultiplier;
  const baseWithAlgorithm = BASE_TIMEOUT_MS * algorithmMultiplier;

  // Total timeout = base + event scaling + (complexity contribution) + (algorithm contribution)
  const computedTimeoutMs = baseWithComplexity + eventFactorMs + baseWithAlgorithm;

  // ─── Step 3: Clamp to bounds ──────────────────────────────────────────────
  const timeoutMs = Math.max(MIN_TIMEOUT_MS, Math.min(MAX_TIMEOUT_MS, computedTimeoutMs));

  return {
    timeoutMs,
    breakdown: {
      base_ms: BASE_TIMEOUT_MS,
      event_factor_ms: Math.round(eventFactorMs),
      complexity_multiplier: complexityMultiplier,
      algorithm_multiplier: algorithmMultiplier,
    },
  };
}

/**
 * Classify event log complexity based on simple heuristics.
 *
 * Simple logs: Few distinct activities, low trace variance
 * Complex logs: Many activities, high trace variance, many variants
 *
 * @param eventCount Total events in the log
 * @param distinctActivities Number of unique activity names
 * @param numTraces Number of distinct traces (cases)
 * @returns 'simple' or 'complex'
 *
 * Heuristic thresholds:
 *   - Distinct activities > 150 → complex
 *   - Variance ratio (traces / activities) > 10 → complex
 *   - Event density (events / traces) > 100 → complex
 */
export function classifyComplexity(
  eventCount: number,
  distinctActivities: number,
  numTraces: number
): 'simple' | 'complex' {
  // Avoid division by zero
  if (numTraces === 0 || distinctActivities === 0) {
    return 'simple';
  }

  // Heuristic 1: High activity cardinality
  if (distinctActivities > 150) {
    return 'complex';
  }

  // Heuristic 2: High trace variance (many variants per activity)
  const varianceRatio = numTraces / distinctActivities;
  if (varianceRatio > 10) {
    return 'complex';
  }

  // Heuristic 3: High event density per trace
  const eventDensity = eventCount / numTraces;
  if (eventDensity > 100) {
    return 'complex';
  }

  return 'simple';
}

/**
 * Detect algorithm tier from algorithm name using regex patterns.
 *
 * @param algorithmName The algorithm ID (e.g., 'genetic_algorithm', 'dfg', 'ilp')
 * @returns 'fast', 'balanced', or 'quality'
 */
export function detectAlgorithmTier(
  algorithmName: string
): 'fast' | 'balanced' | 'quality' {
  const name = algorithmName.toLowerCase();

  // Fast algorithms
  if (/dfg|skeleton|simd/.test(name)) {
    return 'fast';
  }

  // Quality algorithms
  if (/genetic|ilp|simulated_annealing|a_star|aco|pso/.test(name)) {
    return 'quality';
  }

  // Default to balanced (heuristic, inductive, alpha, etc.)
  return 'balanced';
}
