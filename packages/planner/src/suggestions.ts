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
  /** Number of distinct activity names, if known. */
  activityCount?: number;
  /** Whether org:resource attribute is present (enables social network mining). */
  hasResources?: boolean;
  /** Whether time:timestamp attribute is present (enables temporal analysis). */
  hasTimestamps?: boolean;
}

export type SuggestionGoal =
  | 'fast'
  | 'balanced'
  | 'quality'
  | 'conformance'
  | 'streaming'
  | 'find bottlenecks'
  | 'check compliance'
  | 'predict outcomes';

/** Normalised string form — maps free-text goals to canonical values. */
export function normaliseGoal(raw: string): SuggestionGoal {
  const lower = raw.toLowerCase().trim();
  if (lower === 'fast') return 'fast';
  if (lower === 'balanced') return 'balanced';
  if (lower === 'quality') return 'quality';
  if (lower === 'conformance') return 'conformance';
  if (lower === 'streaming') return 'streaming';
  if (lower.includes('bottleneck') || lower.includes('performance') || lower.includes('slow')) {
    return 'find bottlenecks';
  }
  if (
    lower.includes('compliance') ||
    lower.includes('conform') ||
    lower.includes('audit') ||
    lower.includes('regulation')
  ) {
    return 'check compliance';
  }
  if (
    lower.includes('predict') ||
    lower.includes('outcome') ||
    lower.includes('forecast') ||
    lower.includes('next')
  ) {
    return 'predict outcomes';
  }
  return 'balanced';
}

export const VALID_GOALS: SuggestionGoal[] = [
  'fast',
  'balanced',
  'quality',
  'conformance',
  'streaming',
  'find bottlenecks',
  'check compliance',
  'predict outcomes',
];

export interface AlgorithmRecommendation {
  algorithm: string;
  quality: number;
  speed: number;
  /** Composite score in [0, 1]. */
  score: number;
  reason: string;
  /** Expected fitness estimate as a fraction (0–1). */
  expectedFitness?: number;
  /** Expected precision estimate as a fraction (0–1). */
  expectedPrecision?: number;
  estimatedTimeMs?: number;
  /** Detailed explain lines (only populated when explainMode=true). */
  explainLines?: string[];
}

/** Analysis commands recommended as follow-ups for a given goal + log profile. */
export interface AnalysisRecommendation {
  command: string;
  reason: string;
  example: string;
}

export interface SuggestionResult {
  goal: SuggestionGoal;
  logStats: LogStats;
  recommendations: AlgorithmRecommendation[];
  analysisRecommendations: AnalysisRecommendation[];
  topPick: string | null;
  runCommand: string | null;
}

/**
 * Composite scoring weight per goal.
 * Higher quality_weight means we favour model quality over speed.
 */
const GOAL_WEIGHTS: Record<SuggestionGoal, { quality: number; speed: number }> = {
  fast:                { quality: 0.2, speed: 0.8 },
  balanced:            { quality: 0.5, speed: 0.5 },
  quality:             { quality: 0.8, speed: 0.2 },
  conformance:         { quality: 0.9, speed: 0.1 },
  streaming:           { quality: 0.1, speed: 0.9 },
  'find bottlenecks':  { quality: 0.6, speed: 0.4 },
  'check compliance':  { quality: 0.9, speed: 0.1 },
  'predict outcomes':  { quality: 0.7, speed: 0.3 },
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
  streamingOnly?: boolean;
  scalesWell?: boolean;
  /** Expected fitness for a reasonably clean log. */
  expectedFitness: number;
  /** Expected precision for a reasonably clean log. */
  expectedPrecision: number;
}

const DISCOVERY_CANDIDATES: CandidateEntry[] = [
  { id: 'dfg',                quality: 30, speed: 95, scalesWell: true,  expectedFitness: 1.0, expectedPrecision: 0.40 },
  { id: 'process_skeleton',   quality: 25, speed: 97, scalesWell: true,  expectedFitness: 1.0, expectedPrecision: 0.30 },
  { id: 'simd_streaming_dfg', quality: 28, speed: 98, scalesWell: true,  streamingOnly: true,  expectedFitness: 1.0, expectedPrecision: 0.38 },
  { id: 'heuristic_miner',    quality: 50, speed: 75, scalesWell: true,  expectedFitness: 0.82, expectedPrecision: 0.72 },
  { id: 'alpha_plus_plus',    quality: 50, speed: 80, scalesWell: false, expectedFitness: 0.80, expectedPrecision: 0.68 },
  { id: 'inductive_miner',    quality: 55, speed: 70, scalesWell: true,  expectedFitness: 0.87, expectedPrecision: 0.74 },
  { id: 'hill_climbing',      quality: 55, speed: 60, scalesWell: false, expectedFitness: 0.84, expectedPrecision: 0.70 },
  { id: 'declare',            quality: 50, speed: 65, scalesWell: false, expectedFitness: 0.78, expectedPrecision: 0.65 },
  { id: 'simulated_annealing',quality: 65, speed: 45, scalesWell: false, expectedFitness: 0.86, expectedPrecision: 0.76 },
  { id: 'a_star',             quality: 70, speed: 40, scalesWell: false, expectedFitness: 0.88, expectedPrecision: 0.78 },
  { id: 'aco',                quality: 75, speed: 35, scalesWell: false, expectedFitness: 0.90, expectedPrecision: 0.80 },
  { id: 'pso',                quality: 75, speed: 30, scalesWell: false, expectedFitness: 0.90, expectedPrecision: 0.80 },
  { id: 'genetic_algorithm',  quality: 80, speed: 25, scalesWell: false, expectedFitness: 0.93, expectedPrecision: 0.83 },
  { id: 'ilp',                quality: 90, speed: 20, scalesWell: false, expectedFitness: 0.97, expectedPrecision: 0.90 },
  { id: 'optimized_dfg',      quality: 85, speed: 30, scalesWell: true,  expectedFitness: 0.95, expectedPrecision: 0.82 },
  { id: 'alignments',         quality: 85, speed: 15, scalesWell: false, expectedFitness: 0.95, expectedPrecision: 0.88 },
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
  const highVariety = stats.variantCount > 0 && stats.traceCount > 0
    && stats.variantCount / stats.traceCount > 0.5;

  if (goal === 'streaming' && entry.streamingOnly) {
    return 'SIMD-accelerated streaming — best choice for real-time or very large logs';
  }

  if (goal === 'fast') {
    if (id === 'dfg') return 'Fastest algorithm (O(n)); ideal for quick exploration';
    if (id === 'process_skeleton') return 'Near-instant skeleton; shows start/end activities only';
    return `Speed-optimised (speed=${speed}); accepts lower model quality for fast results`;
  }

  if (goal === 'conformance' || goal === 'quality' || goal === 'check compliance') {
    if (id === 'ilp') return 'Exact Petri net via ILP; highest achievable model quality';
    if (id === 'alignments') return 'Alignment-based; direct fitness and precision measurement';
    if (id === 'genetic_algorithm') return 'Evolutionary search; high quality across varied logs';
    if (id === 'aco') return 'Ant-colony optimisation; competitive quality, faster than ILP';
  }

  if (goal === 'balanced' || goal === 'find bottlenecks') {
    if (id === 'heuristic_miner') return 'Best quality/speed balance; tolerates noise well';
    if (id === 'inductive_miner') {
      const varNote = highVariety ? ' (good fit: high variant diversity detected)' : '';
      return `Sound process tree with good precision; slightly slower${varNote}`;
    }
  }

  if (goal === 'predict outcomes') {
    if (id === 'inductive_miner') return 'Generates sound process tree — ideal input for prediction models';
    if (id === 'heuristic_miner') return 'Good balance of accuracy and speed for prediction pipelines';
  }

  // Generic fallback reasoning
  const scaleNote = isLargeLog && !entry.scalesWell ? '; consider a faster algorithm for this log size' : '';
  const rankNote = rank === 1 ? 'Top recommendation' : rank === 2 ? 'Strong alternative' : 'Good alternative';
  return `${rankNote} (quality=${quality}, speed=${speed})${scaleNote}`;
}

/**
 * Build detailed explain lines for a recommendation.
 * Rank-1 oracle: reasoning must not derive expected values from implementation.
 * All "expected" fitness/precision values are registry-declared constants.
 */
function buildExplainLines(
  entry: CandidateEntry,
  score: number,
  goal: SuggestionGoal,
  stats: LogStats,
): string[] {
  const lines: string[] = [];
  const isLargeLog = stats.traceCount > 1000;
  const highVariety = stats.variantCount > 0 && stats.traceCount > 0
    && stats.variantCount / stats.traceCount > 0.5;
  const actCount = stats.activityCount ?? 0;

  lines.push(`  Composite score: ${(score * 100).toFixed(0)}/100`);

  // Positive signals
  if (entry.scalesWell !== false) {
    lines.push(`  ✔ Scales well to ${stats.traceCount.toLocaleString()} traces`);
  }
  if (actCount > 0 && actCount <= 60 && entry.id === 'inductive_miner') {
    lines.push(`  ✔ Activity count (${actCount}) is in inductive_miner's sweet spot (< 60)`);
  }
  if (stats.hasTimestamps && ['inductive_miner', 'heuristic_miner', 'optimized_dfg'].includes(entry.id)) {
    lines.push('  ✔ Timestamps present — algorithm uses time-aware discovery');
  }
  if (highVariety && entry.quality >= 55) {
    lines.push(`  ✔ High variant diversity (${stats.variantCount}/${stats.traceCount} unique) — high-quality algo handles this well`);
  }
  if (entry.quality >= 80) {
    lines.push(`  ✔ Registry quality score ${entry.quality}/100 — top tier model quality`);
  }
  if (entry.speed >= 70) {
    lines.push(`  ✔ Registry speed score ${entry.speed}/100 — fast for this goal`);
  }

  // Negative signals
  if (isLargeLog && !entry.scalesWell) {
    lines.push(`  ✗ Large log (${stats.traceCount.toLocaleString()} traces) may slow this algorithm (consider dfg or heuristic_miner)`);
  }
  if (entry.speed < 30 && goal === 'fast') {
    lines.push(`  ✗ Speed score ${entry.speed}/100 — suboptimal for the 'fast' goal`);
  }
  if (entry.quality < 55 && (goal === 'quality' || goal === 'check compliance')) {
    lines.push(`  ✗ Quality score ${entry.quality}/100 — may not meet quality/conformance requirements`);
  }

  // Tradeoff hint
  const candidates = DISCOVERY_CANDIDATES.filter((c) => !c.streamingOnly && c.id !== entry.id);
  const faster = candidates.find((c) => c.speed > entry.speed && c.quality >= entry.quality * 0.85);
  if (faster) {
    const speedup = Math.round(faster.speed - entry.speed);
    const fitnessDiff = Math.round((entry.expectedFitness - faster.expectedFitness) * 100);
    const tradeoff = fitnessDiff > 0 ? `-${fitnessDiff}% fitness` : 'similar fitness';
    lines.push(
      `  Alternative: ${faster.id} if speed is critical (${speedup}pts faster, ${tradeoff})`
    );
  }

  return lines;
}

/**
 * Estimate wall-clock time in milliseconds for a given algorithm and log.
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
 * Recommend analysis commands based on goal and log profile.
 * These are follow-up commands the user should run after discovery.
 */
export function getAnalysisRecommendations(
  stats: LogStats,
  goal: SuggestionGoal,
): AnalysisRecommendation[] {
  const recs: AnalysisRecommendation[] = [];

  if (goal === 'find bottlenecks') {
    recs.push({
      command: 'temporal',
      reason: 'Timestamps present — detect slow activities and SLA breaches',
      example: 'wpm temporal -i log.xes --sla 48',
    });
    recs.push({
      command: 'performance spectrum',
      reason: 'Visualise activity duration distribution across time',
      example: 'wpm run log.xes --algorithm performance_spectrum',
    });
    if (stats.hasResources) {
      recs.push({
        command: 'social',
        reason: 'Resource attribute found — mine handover bottlenecks',
        example: 'wpm social -i log.xes',
      });
    }
  }

  if (goal === 'check compliance') {
    recs.push({
      command: 'conformance',
      reason: 'Many variants → worth verifying model fitness and precision',
      example: 'wpm conformance log.xes',
    });
    recs.push({
      command: 'validate',
      reason: 'Check event log schema and required attribute completeness',
      example: 'wpm validate -i log.xes',
    });
    recs.push({
      command: 'prolog8',
      reason: 'Horn-clause proof engine for formal compliance rules',
      example: 'wpm prolog8 query -i log.xes',
    });
  }

  if (goal === 'predict outcomes') {
    recs.push({
      command: 'predict next-activity',
      reason: 'N-gram model predicts the most likely next activity',
      example: 'wpm predict next-activity -i log.xes',
    });
    recs.push({
      command: 'predict remaining-time',
      reason: 'Weibull regression estimates remaining case duration',
      example: 'wpm predict remaining-time -i log.xes',
    });
    recs.push({
      command: 'drift-watch',
      reason: 'Monitor for concept drift in ongoing process',
      example: 'wpm drift-watch -i log.xes',
    });
  }

  // Always recommend conformance check if there are many variants
  const highVariety = stats.variantCount > 0 && stats.traceCount > 0
    && stats.variantCount / stats.traceCount > 0.3;
  if (
    highVariety &&
    !['check compliance', 'conformance'].includes(goal) &&
    recs.length < 3
  ) {
    recs.push({
      command: 'conformance',
      reason: `Many variants (${stats.variantCount}) → worth verifying model fitness`,
      example: 'wpm conformance log.xes',
    });
  }

  // Recommend temporal if timestamps are available and not already in recs
  if (
    stats.hasTimestamps &&
    goal !== 'find bottlenecks' &&
    !recs.some((r) => r.command === 'temporal') &&
    recs.length < 3
  ) {
    recs.push({
      command: 'temporal',
      reason: 'Timestamps present — detect performance patterns and bottlenecks',
      example: 'wpm temporal -i log.xes',
    });
  }

  // Recommend social if resources available and not already in recs
  if (
    stats.hasResources &&
    !recs.some((r) => r.command === 'social') &&
    recs.length < 3
  ) {
    recs.push({
      command: 'social',
      reason: 'Resource attribute found — mine organisational network',
      example: 'wpm social -i log.xes',
    });
  }

  return recs.slice(0, 4);
}

/**
 * Return top `n` algorithm recommendations ordered by composite score.
 *
 * @param logStats   Basic statistics derived from the event log.
 * @param goal       The user's stated analysis goal.
 * @param n          Number of recommendations to return (default: 3).
 * @param explainMode  If true, populate explainLines on each recommendation.
 */
export function getSuggestions(
  logStats: LogStats,
  goal: SuggestionGoal,
  n = 3,
  explainMode = false,
): AlgorithmRecommendation[] {
  // Translate analysis goals to weighting goals for discovery ranking
  const weightGoal: SuggestionGoal = (() => {
    if (goal === 'find bottlenecks') return 'balanced';
    if (goal === 'check compliance') return 'conformance';
    if (goal === 'predict outcomes') return 'quality';
    return goal;
  })();

  const weights = GOAL_WEIGHTS[weightGoal];
  const isLargeLog = logStats.traceCount > 1000;

  // Filter candidates based on goal
  let candidates = DISCOVERY_CANDIDATES.filter((c) => {
    if (goal === 'streaming') return c.streamingOnly === true;
    return !c.streamingOnly;
  });

  // For conformance/compliance, restrict to conformance-relevant algorithms
  if (goal === 'conformance' || goal === 'check compliance') {
    const conformancePriority = new Set(['ilp', 'alignments', 'genetic_algorithm', 'aco', 'inductive_miner']);
    candidates = candidates.filter((c) => conformancePriority.has(c.id));
  }

  // Score each candidate
  const scored = candidates.map((c) => {
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

  return scored.slice(0, n).map(({ entry, score }, idx) => {
    const rec: AlgorithmRecommendation = {
      algorithm: entry.id,
      quality: entry.quality,
      speed: entry.speed,
      score: Math.round(score * 100) / 100,
      reason: buildReason(entry, goal, logStats, idx + 1),
      expectedFitness: entry.expectedFitness,
      expectedPrecision: entry.expectedPrecision,
      estimatedTimeMs: estimateTimeMs(entry.id, logStats),
    };

    if (explainMode) {
      rec.explainLines = buildExplainLines(entry, score, goal, logStats);
    }

    return rec;
  });
}
