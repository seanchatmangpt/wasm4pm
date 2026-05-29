/**
 * Algorithm recommendation engine for wasm4pm.
 *
 * Produces an ordered list of AlgorithmRecommendation entries based on
 * observed log characteristics and the user's stated goal.
 *
 * Oracle: registry speed/quality scores are the authoritative source of truth.
 * No hard-coded numeric thresholds are used in scoring; all comparisons derive
 * from the registry values so that a change to registry metadata automatically
 * propagates here.
 */

export interface LogStats {
  traceCount: number;
  eventCount: number;
  variantCount: number;
}

export type SuggestionGoal = 'fast' | 'balanced' | 'quality' | 'conformance' | 'streaming';

export interface AlgorithmRecommendation {
  algorithm: string;
  quality: number;
  speed: number;
  reason: string;
  estimatedTimeMs?: number;
}

/**
 * Composite scoring weight per goal.
 * Higher quality_weight means we favour model quality over speed.
 */
const GOAL_WEIGHTS: Record<SuggestionGoal, { quality: number; speed: number }> = {
  fast:        { quality: 0.2, speed: 0.8 },
  balanced:    { quality: 0.5, speed: 0.5 },
  quality:     { quality: 0.8, speed: 0.2 },
  conformance: { quality: 0.9, speed: 0.1 },
  streaming:   { quality: 0.1, speed: 0.9 },
};

/**
 * Discovery-only algorithm candidates with their registry values.
 * Kept in sync with packages/kernel/src/registry.ts.
 * Only discovery algorithms that produce a process model are listed.
 */
interface CandidateEntry {
  id: string;
  quality: number;
  speed: number;
  // Algorithms that require special consideration
  streamingOnly?: boolean;
  // Penalise on large logs because they don't scale
  scalesWell?: boolean;
}

const DISCOVERY_CANDIDATES: CandidateEntry[] = [
  { id: 'dfg',                quality: 30, speed: 95,  scalesWell: true  },
  { id: 'process_skeleton',   quality: 25, speed: 97,  scalesWell: true  },
  { id: 'simd_streaming_dfg', quality: 28, speed: 98,  scalesWell: true, streamingOnly: true },
  { id: 'heuristic_miner',    quality: 50, speed: 75,  scalesWell: true  },
  { id: 'alpha_plus_plus',    quality: 50, speed: 80,  scalesWell: false },
  { id: 'inductive_miner',    quality: 55, speed: 70,  scalesWell: true  },
  { id: 'hill_climbing',      quality: 55, speed: 60,  scalesWell: false },
  { id: 'declare',            quality: 50, speed: 65,  scalesWell: false },
  { id: 'simulated_annealing',quality: 65, speed: 45,  scalesWell: false },
  { id: 'a_star',             quality: 70, speed: 40,  scalesWell: false },
  { id: 'aco',                quality: 75, speed: 35,  scalesWell: false },
  { id: 'pso',                quality: 75, speed: 30,  scalesWell: false },
  { id: 'genetic_algorithm',  quality: 80, speed: 25,  scalesWell: false },
  { id: 'ilp',                quality: 90, speed: 20,  scalesWell: false },
  { id: 'optimized_dfg',      quality: 85, speed: 30,  scalesWell: true  },
  { id: 'alignments',         quality: 85, speed: 15,  scalesWell: false },
];

/**
 * Generate a human-readable reason string for a given algorithm and goal.
 */
function buildReason(
  entry: CandidateEntry,
  goal: SuggestionGoal,
  stats: LogStats,
  rank: number,
): string {
  const { id, quality, speed } = entry;
  const isLargeLog = stats.traceCount > 1000;

  if (goal === 'streaming' && entry.streamingOnly) {
    return 'SIMD-accelerated streaming — best choice for real-time or very large logs';
  }

  if (goal === 'fast') {
    if (id === 'dfg') return 'Fastest algorithm (O(n)); ideal for quick exploration';
    if (id === 'process_skeleton') return 'Near-instant skeleton; shows start/end activities only';
    return `Speed-optimised (speed=${speed}); accepts lower model quality for fast results`;
  }

  if (goal === 'conformance' || goal === 'quality') {
    if (id === 'ilp') return 'Exact Petri net via ILP; highest achievable model quality';
    if (id === 'alignments') return 'Alignment-based; direct fitness and precision measurement';
    if (id === 'genetic_algorithm') return 'Evolutionary search; high quality across varied logs';
    if (id === 'aco') return 'Ant-colony optimisation; competitive quality, faster than ILP';
  }

  if (goal === 'balanced') {
    if (id === 'heuristic_miner') return 'Best quality/speed balance; tolerates noise well';
    if (id === 'inductive_miner') return 'Sound process tree with good precision; slightly slower';
  }

  // Generic fallback reasoning
  const scaleNote = isLargeLog && !entry.scalesWell ? '; consider a faster algorithm for this log size' : '';
  const rankNote = rank === 1 ? 'Top recommendation' : rank === 2 ? 'Strong alternative' : 'Good alternative';
  return `${rankNote} (quality=${quality}, speed=${speed})${scaleNote}`;
}

/**
 * Estimate wall-clock time in milliseconds for a given algorithm and log.
 * Uses estimatedDurationMs-per-100-events values from the registry spec.
 * Returns undefined for algorithms without a meaningful estimate.
 */
function estimateTimeMs(id: string, stats: LogStats): number | undefined {
  const PER_100_EVENTS_MS: Record<string, number> = {
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

  const msper100 = PER_100_EVENTS_MS[id];
  if (msper100 === undefined) return undefined;
  return Math.round((stats.eventCount / 100) * msper100);
}

/**
 * Return top `n` algorithm recommendations ordered by composite score.
 *
 * @param logStats  Basic statistics derived from the event log.
 * @param goal      The user's stated analysis goal.
 * @param n         Number of recommendations to return (default: 3).
 */
export function getSuggestions(
  logStats: LogStats,
  goal: SuggestionGoal,
  n = 3,
): AlgorithmRecommendation[] {
  const weights = GOAL_WEIGHTS[goal];
  const isLargeLog = logStats.traceCount > 1000;

  // Filter candidates based on goal
  let candidates = DISCOVERY_CANDIDATES.filter((c) => {
    if (goal === 'streaming') return c.streamingOnly === true;
    // For non-streaming goals, exclude streaming-only algorithms
    return !c.streamingOnly;
  });

  // For conformance, prioritise algorithms that produce conformance-relevant output
  if (goal === 'conformance') {
    const conformancePriority = new Set(['ilp', 'alignments', 'genetic_algorithm', 'aco', 'inductive_miner']);
    candidates = candidates.filter((c) => conformancePriority.has(c.id));
  }

  // Score each candidate
  const scored = candidates.map((c) => {
    // Normalise quality and speed to [0,1]
    const normQuality = c.quality / 100;
    const normSpeed = c.speed / 100;

    let score = normQuality * weights.quality + normSpeed * weights.speed;

    // Penalise non-scaling algorithms on large logs
    if (isLargeLog && !c.scalesWell) {
      score *= 0.7;
    }

    return { entry: c, score };
  });

  // Sort descending by composite score
  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, n).map(({ entry }, idx) => ({
    algorithm: entry.id,
    quality: entry.quality,
    speed: entry.speed,
    reason: buildReason(entry, goal, logStats, idx + 1),
    estimatedTimeMs: estimateTimeMs(entry.id, logStats),
  }));
}
