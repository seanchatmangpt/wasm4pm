/**
 * Autonomous Decision Making with Multi-Objective Scoring
 * Implements weighted preference framework for health, quality, and performance objectives
 */

/**
 * Multi-dimensional objective scores (0-1 range)
 */
export interface MultiObjectiveScores {
  health: number;       // System health (0=failed, 1=normal)
  quality: number;      // Process model quality (fitness/precision blend)
  performance: number;  // Execution speed and throughput (0=slowest, 1=fastest)
}

/**
 * Decision preferences for weighting objectives
 */
export interface DecisionPreferences {
  healthWeight: number;       // 0-1, sum with other weights = 1.0
  qualityWeight: number;
  performanceWeight: number;
}

/**
 * Decision result with confidence and rationale
 */
export interface AutonomicDecision {
  primaryObjective: keyof MultiObjectiveScores;
  confidence: number;                    // 0-1: consensus across objectives
  scores: MultiObjectiveScores;
  preferenceWeights: DecisionPreferences;
  compositeScore: number;                // Weighted average
  rationale: string;
}

/**
 * Default preferences: balanced across all three
 */
export const DEFAULT_PREFERENCES: DecisionPreferences = {
  healthWeight: 0.34,
  qualityWeight: 0.33,
  performanceWeight: 0.33,
};

/**
 * Compute multi-objective scores from perception layer outputs
 * @param healthState 0-4 (normal to failed)
 * @param fitnessMeasure 0-1 token replay fitness
 * @param precisionMeasure 0-1 model precision
 * @param cycleTimeMs duration of autonomic cycle
 * @returns Multi-objective scores
 */
export function computeObjectiveScores(
  healthState: number,
  fitnessMeasure: number,
  precisionMeasure: number,
  cycleTimeMs: number,
): MultiObjectiveScores {
  // Health score: inverse of health state (4=failed→0, 0=normal→1)
  const healthScore = 1.0 - Math.min(1.0, healthState / 4.0);

  // Quality score: blend of fitness (60%) and precision (40%)
  const qualityScore = fitnessMeasure * 0.6 + precisionMeasure * 0.4;

  // Performance score: faster cycles score higher
  // Assume target cycle time of 50ms; score = 1.0 if <= 50ms, degrades proportionally
  const targetCycleTimeMs = 50;
  const performanceScore = Math.max(0.1, Math.min(1.0, targetCycleTimeMs / cycleTimeMs));

  return {
    health: Math.max(0, Math.min(1, healthScore)),
    quality: Math.max(0, Math.min(1, qualityScore)),
    performance: Math.max(0, Math.min(1, performanceScore)),
  };
}

/**
 * Make an autonomous decision with multi-objective scoring
 * @param scores Computed objective scores
 * @param preferences User-configured weights (defaults to balanced)
 * @returns Decision with confidence and rationale
 */
export function makeAutonomicDecision(
  scores: MultiObjectiveScores,
  preferences: Partial<DecisionPreferences> = {},
): AutonomicDecision {
  const prefs = {
    ...DEFAULT_PREFERENCES,
    ...preferences,
  };

  // Normalize weights to sum to 1.0
  const totalWeight = prefs.healthWeight + prefs.qualityWeight + prefs.performanceWeight;
  const normalizedPrefs: DecisionPreferences = {
    healthWeight: prefs.healthWeight / totalWeight,
    qualityWeight: prefs.qualityWeight / totalWeight,
    performanceWeight: prefs.performanceWeight / totalWeight,
  };

  // Composite score: weighted average
  const compositeScore =
    scores.health * normalizedPrefs.healthWeight +
    scores.quality * normalizedPrefs.qualityWeight +
    scores.performance * normalizedPrefs.performanceWeight;

  // Confidence: measure of agreement across objectives
  // If all scores are similar (low variance), confidence is high
  const allScores = [scores.health, scores.quality, scores.performance];
  const mean = allScores.reduce((a, b) => a + b) / allScores.length;
  const variance =
    allScores.reduce((sum, x) => sum + (x - mean) ** 2, 0) / allScores.length;
  const stdDev = Math.sqrt(variance);
  // Low stdDev → high confidence; map [0, 0.5] → [1.0, 0.2]
  const confidence = Math.max(0.2, 1.0 - stdDev);

  // Determine primary objective (highest weighted score)
  const primaryObjective = (['health', 'quality', 'performance'] as const).reduce(
    (best, obj) => {
      const objWeight = normalizedPrefs[`${obj}Weight` as keyof DecisionPreferences];
      const bestWeight =
        normalizedPrefs[`${best}Weight` as keyof DecisionPreferences];
      return scores[obj] * objWeight > scores[best] * bestWeight ? obj : best;
    },
    'health' as keyof MultiObjectiveScores,
  );

  // Build rationale
  const objectiveSummary = [
    `health=${scores.health.toFixed(2)}`,
    `quality=${scores.quality.toFixed(2)}`,
    `performance=${scores.performance.toFixed(2)}`,
  ].join(', ');

  const rationale =
    `composite_score=${compositeScore.toFixed(2)}, ` +
    `confidence=${confidence.toFixed(2)}, ` +
    `objectives=[${objectiveSummary}], ` +
    `primary=${primaryObjective}`;

  return {
    primaryObjective,
    confidence,
    scores,
    preferenceWeights: normalizedPrefs,
    compositeScore,
    rationale,
  };
}

/**
 * Validate decision preferences
 * @param prefs Preferences to validate
 * @throws Error if any weight is invalid
 */
export function validatePreferences(prefs: Partial<DecisionPreferences>): void {
  const keys = ['healthWeight', 'qualityWeight', 'performanceWeight'] as const;
  for (const key of keys) {
    const val = prefs[key];
    if (val !== undefined) {
      if (typeof val !== 'number' || val < 0 || val > 1) {
        throw new Error(
          `Invalid preference ${key}: must be a number in [0, 1], got ${val}`,
        );
      }
    }
  }
}
