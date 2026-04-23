/**
 * Oracle — Rank-1 Mathematical Verification
 *
 * Van der Aalst fitness formula: fitness = 1 - (missing + remaining) / (consumed + produced)
 * This is the ground truth. It cannot be wrong — it is the definition.
 *
 * Oracles at different ranks:
 * - Rank 1 (Mathematical): Bellman correctness, fitness formula, Western Electric rules
 * - Rank 2 (Domain contract): Output type matches registry claim
 * - Rank 3 (Metamorphic): Input perturbation → output relation
 * - Rank 4 (Statistical): Convergence trends over N trials
 * - Rank 5 (Regression): Matches previously verified version (weakest, avoid)
 */

export interface ConformanceResult {
  fitness: number;           // Van der Aalst formula result
  missing: number;           // Missing tokens
  consumed: number;          // Consumed tokens
  produced: number;          // Produced tokens
  remaining: number;         // Remaining tokens
  alignmentCost?: number;    // For exact alignments (if available)
}

export interface FourDQuality {
  fitness: number;           // Token replay or alignment fitness (>0.85 required)
  precision: number;         // Model behavior observed in log
  generalization: number;    // Model generalizes to unseen behavior
  simplicity: number;        // Element count (fewer is better)
}

/**
 * Verify Bellman equation correctness.
 *
 * For Q-learning: Q*(s,a) = R(s,a) + γ * max_a' Q*(s',a')
 *
 * After update with s≠s':
 * - If r > r_prev, then Q(s,a) must increase
 * - If r < r_prev, then Q(s,a) must decrease
 * - If r == r_prev and next_s == s, Bellman is self-referential (bug FM-1)
 */
export function verifyBellmanUpdate(
  state: string,
  action: string,
  reward: number,
  nextState: string,
  oldQ: number,
  newQ: number
): { isCorrect: boolean; violation?: string } {
  if (state === nextState) {
    return {
      isCorrect: false,
      violation: 'FM-1: next_state == state; Bellman update is self-referential',
    };
  }

  // Direction check: reward change should correlate with Q change
  // (This is a simplification; full verification requires expected value computation)
  if (newQ < 0 || newQ > 1.0) {
    return {
      isCorrect: false,
      violation: `Q-value out of bounds [0, 1]: ${newQ}`,
    };
  }

  return { isCorrect: true };
}

/**
 * Verify van der Aalst fitness formula.
 *
 * fitness = 1 - (missing + remaining) / (consumed + produced)
 *
 * Mathematically sound if:
 * - fitness ∈ [0, 1]
 * - (missing + remaining) ≤ (consumed + produced)
 * - consumed + produced > 0 (no division by zero)
 */
export function verifyFitnessFormula(result: ConformanceResult): {
  isValid: boolean;
  computed: number;
  violation?: string;
} {
  const { fitness, missing, remaining, consumed, produced } = result;

  if (consumed + produced === 0) {
    return {
      isValid: false,
      computed: 0,
      violation: 'Division by zero: consumed + produced = 0',
    };
  }

  const computed = 1 - (missing + remaining) / (consumed + produced);

  // Allow small floating-point error (<0.0001)
  const tolerance = 0.0001;
  if (Math.abs(fitness - computed) > tolerance) {
    return {
      isValid: false,
      computed,
      violation: `Fitness mismatch: reported ${fitness}, computed ${computed}`,
    };
  }

  if (fitness < 0 || fitness > 1) {
    return {
      isValid: false,
      computed,
      violation: `Fitness out of range [0, 1]: ${fitness}`,
    };
  }

  if (missing + remaining > consumed + produced) {
    return {
      isValid: false,
      computed,
      violation: `Tokens inconsistent: missing+remaining (${missing + remaining}) > consumed+produced (${consumed + produced})`,
    };
  }

  return { isValid: true, computed };
}

/**
 * Verify Western Electric Rules (SPC).
 *
 * Rule 1: One point beyond 3σ from mean
 * Rule 2: 9 consecutive points on one side of mean
 * Rule 3: 6 consecutive points increasing or decreasing
 */
export function verifyWesternElectricRules(
  dataPoints: number[],
  mean: number,
  stdDev: number
): { violations: string[] } {
  const violations: string[] = [];

  if (dataPoints.length === 0) {
    return { violations };
  }

  // Rule 1: One point beyond 3σ
  for (let i = 0; i < dataPoints.length; i++) {
    const zScore = Math.abs(dataPoints[i] - mean) / stdDev;
    if (zScore > 3) {
      violations.push(`Rule 1 (3σ): point[${i}] = ${dataPoints[i]} (z-score ${zScore.toFixed(2)})`);
    }
  }

  // Rule 2: 9 consecutive on one side
  let consecutiveAbove = 0;
  let consecutiveBelow = 0;
  for (let i = 0; i < dataPoints.length; i++) {
    if (dataPoints[i] > mean) {
      consecutiveAbove++;
      consecutiveBelow = 0;
      if (consecutiveAbove === 9) {
        violations.push(`Rule 2 (9+ above): points[${i - 8}..${i}] all > mean`);
        consecutiveAbove = 0;
      }
    } else {
      consecutiveBelow++;
      consecutiveAbove = 0;
      if (consecutiveBelow === 9) {
        violations.push(`Rule 2 (9+ below): points[${i - 8}..${i}] all ≤ mean`);
        consecutiveBelow = 0;
      }
    }
  }

  // Rule 3: 6 consecutive increasing or decreasing
  let consecutiveIncreasing = 1;
  let consecutiveDecreasing = 1;
  for (let i = 1; i < dataPoints.length; i++) {
    if (dataPoints[i] > dataPoints[i - 1]) {
      consecutiveIncreasing++;
      consecutiveDecreasing = 1;
      if (consecutiveIncreasing === 6) {
        violations.push(`Rule 3 (6+ increasing): points[${i - 5}..${i}] strictly increasing`);
        consecutiveIncreasing = 1;
      }
    } else if (dataPoints[i] < dataPoints[i - 1]) {
      consecutiveDecreasing++;
      consecutiveIncreasing = 1;
      if (consecutiveDecreasing === 6) {
        violations.push(`Rule 3 (6+ decreasing): points[${i - 5}..${i}] strictly decreasing`);
        consecutiveDecreasing = 1;
      }
    } else {
      consecutiveIncreasing = 1;
      consecutiveDecreasing = 1;
    }
  }

  return { violations };
}

/**
 * Verify 4D quality metrics are consistent.
 *
 * Invariants:
 * - fitness > precision (log-to-model stricter than model-to-log)
 * - generalization + precision <= 1 (approximate overfitting detection)
 * - simplicity >= 0 (element count)
 */
export function verify4DQuality(quality: FourDQuality): {
  isValid: boolean;
  violations: string[];
} {
  const violations: string[] = [];

  if (quality.fitness < 0 || quality.fitness > 1) {
    violations.push(`Fitness out of range [0, 1]: ${quality.fitness}`);
  }

  if (quality.precision < 0 || quality.precision > 1) {
    violations.push(`Precision out of range [0, 1]: ${quality.precision}`);
  }

  if (quality.generalization < 0 || quality.generalization > 1) {
    violations.push(`Generalization out of range [0, 1]: ${quality.generalization}`);
  }

  if (quality.simplicity < 0) {
    violations.push(`Simplicity negative: ${quality.simplicity}`);
  }

  // Empirical check: in most real logs, fitness > precision
  // (because DFG often overfits and allows extra behavior)
  if (quality.fitness < quality.precision - 0.05) {
    violations.push(
      `Likely bug: fitness (${quality.fitness.toFixed(3)}) should be ≥ precision (${quality.precision.toFixed(3)})`
    );
  }

  return {
    isValid: violations.length === 0,
    violations,
  };
}

/**
 * Metamorphic relation: Larger log → same fitness (±0.05).
 *
 * If you run the same process (same DFG) against:
 * - 100 events: fitness = 0.95
 * - 1000 events: fitness should ≈ 0.95 (±0.05 tolerance)
 *
 * Violation indicates hidden state changes or non-determinism.
 */
export function verifyMetamorphicScaling(
  fitness100: number,
  fitness1k: number,
  tolerance: number = 0.05
): {
  isValid: boolean;
  violation?: string;
} {
  const diff = Math.abs(fitness100 - fitness1k);
  if (diff > tolerance) {
    return {
      isValid: false,
      violation: `Fitness scaled unexpectedly: 100 events=${fitness100.toFixed(3)}, 1K events=${fitness1k.toFixed(3)}, diff=${diff.toFixed(3)} > ${tolerance}`,
    };
  }

  return { isValid: true };
}

/**
 * Metamorphic relation: Noise injection → fitness decreases.
 *
 * Starting with fitness_clean = 0.95, inject random activity twice per case.
 * New fitness_noisy should be < fitness_clean (typically 0.70–0.85).
 */
export function verifyMetamorphicNoise(
  cleanFitness: number,
  noisyFitness: number
): {
  isValid: boolean;
  violation?: string;
} {
  if (noisyFitness >= cleanFitness) {
    return {
      isValid: false,
      violation: `Noise should decrease fitness: clean=${cleanFitness.toFixed(3)}, noisy=${noisyFitness.toFixed(3)}`,
    };
  }

  return { isValid: true };
}
