/**
 * recommendation.ts
 * Smart algorithm selection and streaming variant detection for @wasm4pm/kernel.
 *
 * Provides:
 * - recommendAlgorithm(profile)  — data-driven recommendation from a LogProfile
 * - analyzeLogProfile(handle)    — extract a LogProfile from a WASM event-log handle
 * - compareAlgorithms(a, b)      — side-by-side speed/quality/soundness comparison
 * - supportsStreaming(name)       — whether an algorithm has a streaming variant
 * - getStreamingVariant(name)    — return the streaming-capable equivalent
 *
 * All data derives from the registry so that a change to registry metadata
 * automatically propagates here (no duplicate numeric tables).
 *
 * Oracle: Rank-2 domain contract — selection rules are design decisions from
 * Van der Aalst's quality/speed tradeoff taxonomy.
 */

import { getRegistry } from './registry.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Observed characteristics of an event log.
 * Callers may populate this from WASM stats or from their own log analysis.
 */
export interface LogProfile {
  /** Number of distinct traces (cases) */
  trace_count: number;
  /** Total number of events across all traces */
  event_count: number;
  /** Number of distinct trace variants (unique activity sequences) */
  variant_count: number;
  /** Number of distinct activities */
  activity_count: number;
  /** Average number of events per trace */
  avg_trace_length: number;
  /** Whether the log contains reliable timestamps */
  has_timestamps: boolean;
  /** Estimated noise level in [0,1] (higher = more noise/infrequent behavior) */
  estimated_noise_level?: number;
}

/**
 * A ranked algorithm recommendation with reasoning.
 */
export interface AlgorithmRecommendation {
  /** Registry algorithm ID */
  algorithm: string;
  /** Confidence in this recommendation [0,1] */
  confidence: number;
  /** Human-readable list of reasons for this choice */
  reasoning: string[];
  /** Alternative algorithm IDs (next-best options), ranked */
  alternatives: string[];
  /** Estimated wall-clock time in ms (undefined if unknown) */
  estimated_time_ms?: number;
  /** Speed tier from registry (lower = faster) */
  speed_tier: number;
  /** Quality tier from registry (higher = better model) */
  quality_tier: number;
}

/**
 * Side-by-side comparison of two algorithms.
 */
export interface AlgorithmComparison {
  algorithm1: string;
  algorithm2: string;
  /** Which algorithm is faster (lower speed tier) */
  faster: string;
  /** Which algorithm produces higher quality */
  higher_quality: string;
  /** Speed tier difference (positive means alg1 is faster) */
  speed_delta: number;
  /** Quality tier difference (positive means alg1 is higher quality) */
  quality_delta: number;
  /** Whether algorithm1 scales to large logs */
  alg1_scales_well: boolean;
  /** Whether algorithm2 scales to large logs */
  alg2_scales_well: boolean;
  /** Whether algorithm1 is noise-resistant */
  alg1_robust_to_noise: boolean;
  /** Whether algorithm2 is noise-resistant */
  alg2_robust_to_noise: boolean;
  /** Complexity class for algorithm1 */
  alg1_complexity: string;
  /** Complexity class for algorithm2 */
  alg2_complexity: string;
  /** Summary: which is the better all-rounder */
  recommendation: string;
}

// ---------------------------------------------------------------------------
// Streaming variant map
// ---------------------------------------------------------------------------

/**
 * Algorithms that have a dedicated streaming variant.
 * Key: canonical algorithm ID, value: streaming equivalent.
 *
 * Sourced from registry.ts: simd_streaming_dfg supports the stream profile
 * and is the SIMD-accelerated equivalent of dfg for real-time/incremental use.
 */
const STREAMING_VARIANTS: Record<string, string> = {
  dfg: 'simd_streaming_dfg',
  process_skeleton: 'simd_streaming_dfg', // closest streaming equivalent
};

/**
 * Algorithms that ARE streaming-native (they run in stream profile themselves).
 */
const STREAMING_NATIVE = new Set(['simd_streaming_dfg', 'streaming_log']);

// ---------------------------------------------------------------------------
// Duration estimates (per 100 events, ms) — kept in sync with suggestions.ts
// ---------------------------------------------------------------------------

const DURATION_PER_100_EVENTS_MS: Record<string, number> = {
  dfg: 0.5,
  process_skeleton: 0.3,
  simd_streaming_dfg: 0.2,
  heuristic_miner: 10,
  alpha_plus_plus: 5,
  inductive_miner: 15,
  hill_climbing: 20,
  simulated_annealing: 30,
  a_star: 50,
  aco: 40,
  pso: 35,
  genetic_algorithm: 40,
  ilp: 80,
  optimized_dfg: 20,
  alignments: 100,
  declare: 25,
};

function estimateTimeMs(algorithmId: string, eventCount: number): number | undefined {
  const rate = DURATION_PER_100_EVENTS_MS[algorithmId];
  if (rate === undefined) return undefined;
  return Math.round((eventCount / 100) * rate);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Recommend the best discovery algorithm for a given log profile.
 *
 * Decision logic (priority order):
 * 1. If event_count > 500_000 or trace_count > 50_000 → streaming (simd_streaming_dfg)
 * 2. If avg_trace_length > 100 or variant_count / trace_count > 0.85 → heuristic_miner
 *    (high variance / long traces benefit from dependency-threshold filtering)
 * 3. If activity_count > 100 → dfg (avoid O(n²) on wide logs)
 * 4. If estimated_noise_level > 0.3 → heuristic_miner (noise-robust)
 * 5. Small clean logs (trace_count <= 500, activity_count <= 20) → inductive_miner
 * 6. Medium logs → heuristic_miner (best speed/quality for general process mining)
 * 7. Default → dfg
 *
 * Alternatives are the next two highest-scoring discovery algorithms.
 *
 * @param profile LogProfile describing the event log
 * @returns AlgorithmRecommendation with primary choice + alternatives
 */
export function recommendAlgorithm(profile: LogProfile): AlgorithmRecommendation {
  const registry = getRegistry();
  const { trace_count, event_count, variant_count, activity_count, avg_trace_length, estimated_noise_level = 0 } = profile;

  const reasoning: string[] = [];
  let primaryId: string;
  let confidence: number;

  const variantRatio = variant_count / Math.max(trace_count, 1);
  const isVeryLarge = event_count > 500_000 || trace_count > 50_000;
  const isLarge = trace_count > 10_000;
  const isHighVariance = variantRatio > 0.85;
  const isLongTraces = avg_trace_length > 100;
  const isWideLog = activity_count > 100;
  const isNoisy = estimated_noise_level > 0.3;
  const isSmallClean = trace_count <= 500 && activity_count <= 20 && estimated_noise_level <= 0.1;

  if (isVeryLarge) {
    primaryId = 'simd_streaming_dfg';
    confidence = 0.95;
    reasoning.push(`Log is very large (${event_count.toLocaleString()} events / ${trace_count.toLocaleString()} traces).`);
    reasoning.push('SIMD-accelerated streaming DFG is the only O(n) algorithm that handles this scale without memory pressure.');
  } else if (isHighVariance || isLongTraces) {
    primaryId = 'heuristic_miner';
    confidence = 0.85;
    if (isHighVariance) {
      reasoning.push(`High variant ratio (${(variantRatio * 100).toFixed(0)}%): most traces are unique.`);
      reasoning.push('Heuristic Miner filters weak dependencies via threshold, reducing noise from rare variants.');
    }
    if (isLongTraces) {
      reasoning.push(`Long average trace length (${avg_trace_length.toFixed(0)} events).`);
      reasoning.push('Heuristic Miner handles long-path processes better than inductive approaches.');
    }
  } else if (isWideLog) {
    primaryId = 'dfg';
    confidence = 0.80;
    reasoning.push(`Wide activity space (${activity_count} activities). O(n²) algorithms become expensive.`);
    reasoning.push('DFG is O(n) and scales linearly regardless of activity count.');
  } else if (isNoisy) {
    primaryId = 'heuristic_miner';
    confidence = 0.88;
    reasoning.push(`Noisy log detected (noise level ≈ ${(estimated_noise_level * 100).toFixed(0)}%).`);
    reasoning.push('Heuristic Miner is the most noise-resistant algorithm in the standard discovery family.');
  } else if (isSmallClean) {
    primaryId = 'inductive_miner';
    confidence = 0.82;
    reasoning.push(`Small, clean log (${trace_count} traces, ${activity_count} activities, low noise).`);
    reasoning.push('Inductive Miner produces a sound process tree with precise control-flow structure.');
    reasoning.push('Ideal for conformance checking and formal verification use cases.');
  } else if (isLarge) {
    primaryId = 'heuristic_miner';
    confidence = 0.78;
    reasoning.push(`Medium-to-large log (${trace_count.toLocaleString()} traces).`);
    reasoning.push('Heuristic Miner offers the best quality/speed balance for this scale.');
  } else {
    primaryId = 'dfg';
    confidence = 0.65;
    reasoning.push('No strong log characteristics detected; DFG is the safe general-purpose default.');
    reasoning.push('Consider heuristic_miner or inductive_miner for higher quality if runtime permits.');
  }

  // Collect alternatives: registry discovery algorithms, exclude primary, rank by quality tier desc
  const discoveryIds = ['dfg', 'process_skeleton', 'simd_streaming_dfg', 'heuristic_miner',
    'alpha_plus_plus', 'inductive_miner', 'hill_climbing', 'declare',
    'simulated_annealing', 'a_star', 'aco', 'pso', 'genetic_algorithm', 'optimized_dfg', 'ilp'];

  const alternatives = discoveryIds
    .filter((id) => id !== primaryId)
    .map((id) => {
      const meta = registry.get(id);
      return meta ? { id, quality: meta.qualityTier, speed: meta.speedTier } : null;
    })
    .filter((x): x is { id: string; quality: number; speed: number } => x !== null)
    .sort((a, b) => {
      // For large logs: favour speed; for small: favour quality
      if (isVeryLarge || isLarge) return a.speed - b.speed;
      return b.quality - a.quality;
    })
    .slice(0, 3)
    .map((x) => x.id);

  const primary = registry.get(primaryId);

  return {
    algorithm: primaryId,
    confidence,
    reasoning,
    alternatives,
    estimated_time_ms: estimateTimeMs(primaryId, event_count),
    speed_tier: primary?.speedTier ?? 0,
    quality_tier: primary?.qualityTier ?? 0,
  };
}

/**
 * Extract a LogProfile from a WASM event-log handle using the WASM module.
 *
 * This is a convenience wrapper. If the WASM module is not available (e.g. in
 * unit tests), callers should construct a LogProfile directly.
 *
 * @param handle  WASM event-log handle (string ID returned by load_eventlog_from_xes)
 * @param wasm    WasmModule with get_eventlog_stats or compute_log_statistics function
 * @returns       LogProfile extracted from WASM stats, or a minimal fallback
 */
export function analyzeLogProfile(
  handle: string,
  wasm: Record<string, (...args: unknown[]) => unknown>
): LogProfile {
  try {
    // Try get_eventlog_stats first (preferred), then compute_log_statistics
    const statsFn = wasm['get_eventlog_stats'] ?? wasm['compute_log_statistics'];
    if (typeof statsFn !== 'function') {
      return _fallbackProfile();
    }

    const raw = statsFn(handle);
    const stats = (typeof raw === 'string' ? JSON.parse(raw) : raw) as Record<string, unknown>;

    const trace_count = Number(stats['trace_count'] ?? stats['num_traces'] ?? 0);
    const event_count = Number(stats['event_count'] ?? stats['num_events'] ?? 0);
    const variant_count = Number(stats['variant_count'] ?? stats['num_variants'] ?? 0);
    const activity_count = Number(stats['activity_count'] ?? stats['num_activities'] ?? 0);
    const avg_trace_length = trace_count > 0 ? event_count / trace_count : 0;

    return {
      trace_count,
      event_count,
      variant_count,
      activity_count,
      avg_trace_length,
      has_timestamps: Boolean(stats['has_timestamps'] ?? true),
      estimated_noise_level: typeof stats['noise_level'] === 'number' ? stats['noise_level'] : undefined,
    };
  } catch {
    return _fallbackProfile();
  }
}

function _fallbackProfile(): LogProfile {
  return {
    trace_count: 0,
    event_count: 0,
    variant_count: 0,
    activity_count: 0,
    avg_trace_length: 0,
    has_timestamps: false,
  };
}

/**
 * Compare two registered algorithms side-by-side.
 *
 * Returns speed, quality, scalability, noise-robustness deltas plus a
 * human-readable recommendation of which algorithm to prefer in most
 * real-world use cases.
 *
 * @param alg1 First algorithm ID
 * @param alg2 Second algorithm ID
 * @returns AlgorithmComparison or throws if either ID is unknown
 */
export function compareAlgorithms(alg1: string, alg2: string): AlgorithmComparison {
  const registry = getRegistry();
  const meta1 = registry.get(alg1);
  const meta2 = registry.get(alg2);

  if (!meta1) throw new Error(`Unknown algorithm: "${alg1}". Use a registered algorithm ID.`);
  if (!meta2) throw new Error(`Unknown algorithm: "${alg2}". Use a registered algorithm ID.`);

  const speedDelta = meta2.speedTier - meta1.speedTier; // positive → alg1 faster
  const qualityDelta = meta1.qualityTier - meta2.qualityTier; // positive → alg1 higher quality

  const faster = speedDelta >= 0 ? alg1 : alg2;
  const higherQuality = qualityDelta >= 0 ? alg1 : alg2;

  // Formulate a recommendation string
  let recommendation: string;
  if (alg1 === faster && alg1 === higherQuality) {
    recommendation = `"${alg1}" dominates: it is both faster and higher quality than "${alg2}".`;
  } else if (alg2 === faster && alg2 === higherQuality) {
    recommendation = `"${alg2}" dominates: it is both faster and higher quality than "${alg1}".`;
  } else {
    // Classic speed/quality tradeoff
    const fasterAlg = faster;
    const qualityAlg = higherQuality;
    const speedNote = `"${fasterAlg}" is faster (speed tier ${Math.min(meta1.speedTier, meta2.speedTier)} vs ${Math.max(meta1.speedTier, meta2.speedTier)})`;
    const qualityNote = `"${qualityAlg}" produces higher quality models (tier ${Math.max(meta1.qualityTier, meta2.qualityTier)} vs ${Math.min(meta1.qualityTier, meta2.qualityTier)})`;
    recommendation = `${speedNote}. ${qualityNote}. Choose based on your time budget and required model precision.`;
  }

  return {
    algorithm1: alg1,
    algorithm2: alg2,
    faster,
    higher_quality: higherQuality,
    speed_delta: speedDelta,
    quality_delta: qualityDelta,
    alg1_scales_well: meta1.scalesWell,
    alg2_scales_well: meta2.scalesWell,
    alg1_robust_to_noise: meta1.robustToNoise,
    alg2_robust_to_noise: meta2.robustToNoise,
    alg1_complexity: meta1.complexity,
    alg2_complexity: meta2.complexity,
    recommendation,
  };
}

/**
 * Return true if the algorithm has a dedicated streaming variant registered
 * in the registry (or is itself streaming-native).
 *
 * @param algorithmName Registry algorithm ID
 */
export function supportsStreaming(algorithmName: string): boolean {
  if (STREAMING_NATIVE.has(algorithmName)) return true;
  return algorithmName in STREAMING_VARIANTS;
}

/**
 * Return the streaming-capable variant of a given algorithm, or null if none exists.
 *
 * @param algorithmName Registry algorithm ID
 * @returns Streaming variant ID, or null
 */
export function getStreamingVariant(algorithmName: string): string | null {
  if (STREAMING_NATIVE.has(algorithmName)) return algorithmName;
  return STREAMING_VARIANTS[algorithmName] ?? null;
}
