/**
 * backend-registry.ts
 *
 * BackendRegistry implementation with 7-rule selection algorithm.
 *
 * Spec reference: Section 3.4 and 3.5
 */
/**
 * Latency tier ordering for comparison.
 * Used in Rule 3 of the selection algorithm.
 */
const LATENCY_TIER_ORDER = {
    sub_ms: 0,
    low_ms: 1,
    high_ms: 2,
    seconds: 3,
    minutes: 4,
};
/**
 * Quality tier ordering for comparison.
 * Used in Rule 4 of the selection algorithm.
 */
const QUALITY_TIER_ORDER = {
    fast: 0,
    balanced: 1,
    quality: 2,
    research: 3,
};
/**
 * Default implementation of BackendRegistry.
 *
 * Stores backends in a Map<string, MiningBackend>.
 * Applies 7-rule selection algorithm on select().
 * Tracks concurrent invocations per backend.
 */
export class DefaultBackendRegistry {
    constructor() {
        this.backends = new Map();
        this.concurrencyCounters = new Map();
    }
    /**
     * Register a backend.
     * Validates that all 5 interface methods are present.
     */
    register(backend) {
        if (!backend || !backend.id) {
            throw new Error('Backend must have an id');
        }
        if (typeof backend.capabilities !== 'function' ||
            typeof backend.discover !== 'function' ||
            typeof backend.conformance !== 'function' ||
            typeof backend.analyze !== 'function' ||
            typeof backend.healthCheck !== 'function') {
            throw new Error(`Backend ${backend.id} must implement all 5 interface methods: ` +
                `capabilities(), discover(), conformance(), analyze(), healthCheck()`);
        }
        this.backends.set(backend.id, backend);
        this.concurrencyCounters.set(backend.id, 0);
    }
    /**
     * Unregister a backend by ID.
     */
    unregister(id) {
        this.backends.delete(id);
        this.concurrencyCounters.delete(id);
    }
    /**
     * Select a backend using the 7-rule selection algorithm (Section 3.5).
     *
     * Rules are applied in priority order; first matching rule wins.
     * Rule 7 (RL tiebreaker) is not implemented here — that happens in
     * FederationController.dispatch(). This returns the first remaining candidate.
     *
     * @throws Error if no suitable backend is found
     */
    select(algorithmId, budget) {
        let candidates = Array.from(this.backends.values());
        // Rule 1: Environment gate
        candidates = candidates.filter((backend) => {
            const caps = backend.capabilities();
            if (caps.environment.requiresPython && !budget.environment.pythonAvailable) {
                return false;
            }
            return true;
        });
        // Rule 2: Algorithm gate
        candidates = candidates.filter((backend) => {
            const caps = backend.capabilities();
            return caps.supportedAlgorithmIds.includes(algorithmId);
        });
        // Rule 3: Budget latency gate
        candidates = candidates.filter((backend) => {
            const caps = backend.capabilities();
            const backendLatencyOrder = LATENCY_TIER_ORDER[caps.latencyClass];
            const budgetLatencyOrder = LATENCY_TIER_ORDER[budget.latencyBudget];
            return backendLatencyOrder <= budgetLatencyOrder;
        });
        // Rule 4: Quality floor gate
        candidates = candidates.filter((backend) => {
            const caps = backend.capabilities();
            const backendQualityOrder = QUALITY_TIER_ORDER[caps.maxQualityTier];
            const qualityFloorOrder = QUALITY_TIER_ORDER[budget.qualityFloor];
            return backendQualityOrder >= qualityFloorOrder;
        });
        // Rule 5: Health gate
        // NOTE: Skipped here — FederationController handles health state.
        // This rule is about degraded/evicted state which is outside the scope of the registry.
        // Rule 6: Concurrency gate
        candidates = candidates.filter((backend) => {
            const caps = backend.capabilities();
            const concurrency = this.concurrencyCounters.get(backend.id) || 0;
            return concurrency < caps.maxConcurrentInvocations;
        });
        // Rule 7: RL tiebreaker
        // NOTE: Implemented by FederationController, not here.
        // This returns the first remaining candidate (or any if no rule matched).
        if (candidates.length === 0) {
            throw new Error(`No backend found for algorithmId=${algorithmId}. ` +
                `Candidates filtered out by rules 1-6.`);
        }
        // Return first candidate (Rule 7 tie-breaking happens in FederationController)
        return candidates[0];
    }
    /**
     * List all registered backends with their health and capabilities.
     */
    list() {
        return Array.from(this.backends.values()).map((backend) => ({
            id: backend.id,
            healthy: true, // Health state tracked by FederationController
            capabilities: backend.capabilities(),
        }));
    }
    /**
     * Health check all registered backends.
     * Each backend gets a 500ms timeout per spec (Section 3.6, invariant 3).
     * Returns array with health status and latency for each backend.
     */
    async healthCheckAll() {
        const HEALTH_CHECK_TIMEOUT_MS = 500;
        const results = await Promise.all(Array.from(this.backends.entries()).map(async ([id, backend]) => {
            try {
                const startMs = Date.now();
                // Race against timeout
                const result = await Promise.race([
                    backend.healthCheck(),
                    new Promise((resolve) => setTimeout(() => resolve({
                        healthy: false,
                        latency_ms: HEALTH_CHECK_TIMEOUT_MS,
                    }), HEALTH_CHECK_TIMEOUT_MS)),
                ]);
                const latency_ms = Date.now() - startMs;
                return {
                    id,
                    healthy: result.healthy,
                    latency_ms,
                };
            }
            catch (error) {
                return {
                    id,
                    healthy: false,
                    latency_ms: HEALTH_CHECK_TIMEOUT_MS,
                };
            }
        }));
        return results;
    }
    /**
     * Increment concurrency counter for a backend.
     * Called by backends when they start processing.
     *
     * INTERNAL: Not part of BackendRegistry interface.
     */
    incrementConcurrency(backendId) {
        const count = this.concurrencyCounters.get(backendId) || 0;
        this.concurrencyCounters.set(backendId, count + 1);
    }
    /**
     * Decrement concurrency counter for a backend.
     * Called by backends when they finish processing.
     *
     * INTERNAL: Not part of BackendRegistry interface.
     */
    decrementConcurrency(backendId) {
        const count = this.concurrencyCounters.get(backendId) || 0;
        this.concurrencyCounters.set(backendId, Math.max(0, count - 1));
    }
    /**
     * Get current concurrency count for a backend.
     *
     * INTERNAL: Used for debugging and testing.
     */
    getConcurrency(backendId) {
        return this.concurrencyCounters.get(backendId) || 0;
    }
}
//# sourceMappingURL=backend-registry.js.map