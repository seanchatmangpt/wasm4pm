/**
 * Budget Envelope — Execution Constraints and Mode Selection
 *
 * Section 4.1 of the Three-Layer Architecture Specification.
 * Defines execution budgets: latency, memory, quality floor, and execution mode.
 * Immutable interface for budget-first dispatch policy.
 */
/**
 * LatencyClass tier ordering function.
 * Returns true if a <= b in the tier order.
 */
export function latencyTierLte(a, b) {
    const tierOrder = {
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
export function qualityTierLte(a, b) {
    const tierOrder = {
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
export function latencyExceedsBudget(actual, budget) {
    return !latencyTierLte(actual, budget);
}
/**
 * Validates that a QualityTier can satisfy a floor.
 * Used by rule 4 (quality floor gate).
 */
export function qualityDeficientForFloor(maxQualityTier, floor) {
    return !qualityTierLte(floor, maxQualityTier);
}
/**
 * Creates a BudgetEnvelope with sensible defaults.
 * Useful for testing and default construction.
 */
export function createDefaultBudgetEnvelope() {
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
//# sourceMappingURL=budget.js.map