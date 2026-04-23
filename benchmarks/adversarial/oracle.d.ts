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
    fitness: number;
    missing: number;
    consumed: number;
    produced: number;
    remaining: number;
    alignmentCost?: number;
}
export interface FourDQuality {
    fitness: number;
    precision: number;
    generalization: number;
    simplicity: number;
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
export declare function verifyBellmanUpdate(state: string, action: string, reward: number, nextState: string, oldQ: number, newQ: number): {
    isCorrect: boolean;
    violation?: string;
};
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
export declare function verifyFitnessFormula(result: ConformanceResult): {
    isValid: boolean;
    computed: number;
    violation?: string;
};
/**
 * Verify Western Electric Rules (SPC).
 *
 * Rule 1: One point beyond 3σ from mean
 * Rule 2: 9 consecutive points on one side of mean
 * Rule 3: 6 consecutive points increasing or decreasing
 */
export declare function verifyWesternElectricRules(dataPoints: number[], mean: number, stdDev: number): {
    violations: string[];
};
/**
 * Verify 4D quality metrics are consistent.
 *
 * Invariants:
 * - fitness > precision (log-to-model stricter than model-to-log)
 * - generalization + precision <= 1 (approximate overfitting detection)
 * - simplicity >= 0 (element count)
 */
export declare function verify4DQuality(quality: FourDQuality): {
    isValid: boolean;
    violations: string[];
};
/**
 * Metamorphic relation: Larger log → same fitness (±0.05).
 *
 * If you run the same process (same DFG) against:
 * - 100 events: fitness = 0.95
 * - 1000 events: fitness should ≈ 0.95 (±0.05 tolerance)
 *
 * Violation indicates hidden state changes or non-determinism.
 */
export declare function verifyMetamorphicScaling(fitness100: number, fitness1k: number, tolerance?: number): {
    isValid: boolean;
    violation?: string;
};
/**
 * Metamorphic relation: Noise injection → fitness decreases.
 *
 * Starting with fitness_clean = 0.95, inject random activity twice per case.
 * New fitness_noisy should be < fitness_clean (typically 0.70–0.85).
 */
export declare function verifyMetamorphicNoise(cleanFitness: number, noisyFitness: number): {
    isValid: boolean;
    violation?: string;
};
//# sourceMappingURL=oracle.d.ts.map