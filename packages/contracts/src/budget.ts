/**
 * Budget Envelope — Execution Constraints and Mode Selection
 *
 * Section 4.1 of the Three-Layer Architecture Specification.
 * Defines execution budgets: latency, memory, quality floor, and execution mode.
 * Immutable interface for budget-first dispatch policy.
 */

/**
 * Latency class tier ordering (ascending):
 * sub_ms < low_ms < high_ms < seconds < minutes
 */
export type LatencyClass = 'sub_ms' | 'low_ms' | 'high_ms' | 'seconds' | 'minutes';

/**
 * Quality tier ordering (ascending):
 * fast < balanced < quality < research
 */
export type QualityTier = 'fast' | 'balanced' | 'quality' | 'research';

/**
 * Execution mode determines dispatch pattern and async behavior.
 *
 * - online: <1s latency target, synchronous dispatch, WASM preferred
 * - near-online: 1s–10s latency target, synchronous with timeout, WASM preferred
 * - batch: 10s–300s latency target, async job queue, pm4py preferred
 * - research: unbounded latency, async job queue, pm4py first
 */
export type ExecutionMode = 'online' | 'near-online' | 'batch' | 'research';

/**
 * BudgetEnvelope defines all execution constraints for algorithm dispatch.
 * Immutable (readonly fields) to prevent accidental mutation during planning.
 *
 * Section 4.1 of the specification requires these 5 fields to be present
 * and used during backend selection (Section 3.5 seven-rule algorithm).
 *
 * Invariants:
 * - latencyBudget tier ordering is enforced: sub_ms < low_ms < high_ms < seconds < minutes
 * - qualityFloor tier ordering is enforced: fast < balanced < quality < research
 * - memoryBudget=0 means unlimited
 * - mode is deterministic (same config → same mode via profile mapping)
 */
export interface BudgetEnvelope {
  /**
   * Maximum acceptable latency tier.
   * Used by rule 3 (budget latency gate) in backend selection algorithm.
   * Excludes any backend where latencyClass > latencyBudget.
   */
  readonly latencyBudget: LatencyClass;

  /**
   * Maximum memory in bytes. 0 means no limit.
   * Used by degradation rule 1: if prior run exceeded this, demote to cheaper algorithm.
   */
  readonly memoryBudget: number;

  /**
   * Minimum quality tier expected from the result.
   * Used by rule 4 (quality floor gate) in backend selection algorithm.
   * Excludes any backend where maxQualityTier < qualityFloor.
   * Also used by promotion rule 2: if conformance score < qualityFloor, promote job.
   */
  readonly qualityFloor: QualityTier;

  /**
   * Environment capabilities and constraints.
   * Used by rules 1 (environment gate) and 3 (browser-safe enforcement).
   */
  readonly environment: {
    /**
     * True if running in a browser or edge context.
     * browserSafe=true forces WASM only (rule 3).
     */
    readonly browserSafe: boolean;

    /**
     * True if Python is available for pm4py invocation.
     * Used by rule 1 (environment gate).
     */
    readonly pythonAvailable: boolean;
  };

  /**
   * Execution mode determines dispatch pattern.
   * Derived from execution.profile at resolveConfig() time:
   *   fast → online
   *   balanced → online or near-online (by log size: >50K events → near-online)
   *   quality → near-online or batch (by algorithm: ilp/genetic → batch)
   *   stream → online (always)
   *
   * Used by rules 1 and 2 in the engine selection algorithm (Section 4.2).
   */
  readonly mode: ExecutionMode;
}

/**
 * LatencyClass tier ordering function.
 * Returns true if a <= b in the tier order.
 */
export function latencyTierLte(a: LatencyClass, b: LatencyClass): boolean {
  const tierOrder: Record<LatencyClass, number> = {
    sub_ms: 0,
    low_ms: 1,
    high_ms: 2,
    seconds: 3,
    minutes: 4,
  };
  return tierOrder[a] <= tierOrder[b];
}

/**
 * QualityTier ordering function.
 * Returns true if a <= b in the tier order.
 */
export function qualityTierLte(a: QualityTier, b: QualityTier): boolean {
  const tierOrder: Record<QualityTier, number> = {
    fast: 0,
    balanced: 1,
    quality: 2,
    research: 3,
  };
  return tierOrder[a] <= tierOrder[b];
}

/**
 * Validates that a LatencyClass is within a budget.
 * Used by rule 3 (budget latency gate).
 */
export function latencyExceedsBudget(actual: LatencyClass, budget: LatencyClass): boolean {
  return !latencyTierLte(actual, budget);
}

/**
 * Validates that a QualityTier can satisfy a floor.
 * Used by rule 4 (quality floor gate).
 */
export function qualityDeficientForFloor(maxQualityTier: QualityTier, floor: QualityTier): boolean {
  return !qualityTierLte(floor, maxQualityTier);
}

/**
 * Creates a BudgetEnvelope with sensible defaults.
 * Useful for testing and default construction.
 */
export function createDefaultBudgetEnvelope(): BudgetEnvelope {
  return {
    latencyBudget: 'high_ms',
    memoryBudget: 0,
    qualityFloor: 'balanced',
    environment: {
      browserSafe: false,
      pythonAvailable: false,
    },
    mode: 'online',
  };
}
