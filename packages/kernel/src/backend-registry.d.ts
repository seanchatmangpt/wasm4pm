/**
 * backend-registry.ts
 *
 * BackendRegistry implementation with 7-rule selection algorithm.
 *
 * Spec reference: Section 3.4 and 3.5
 */
import type { MiningBackend, BackendCapabilities, BudgetEnvelope } from './mining-backend.js';
/**
 * BackendRegistry interface.
 * Spec reference: Section 3.4
 */
export interface BackendRegistry {
    /**
     * Register a new backend.
     * Throws if backend does not implement all required interface methods.
     */
    register(backend: MiningBackend): void;
    /**
     * Unregister a backend by ID.
     */
    unregister(id: string): void;
    /**
     * Select a backend for a given algorithm and budget.
     * Applies the 7-rule selection algorithm (Section 3.5).
     * Throws if no suitable backend is found.
     */
    select(algorithmId: string, budget: BudgetEnvelope): MiningBackend;
    /**
     * List all registered backends with health status.
     */
    list(): ReadonlyArray<{
        id: string;
        healthy: boolean;
        capabilities: BackendCapabilities;
    }>;
    /**
     * Health check all registered backends.
     * Each backend receives a 500ms timeout.
     * Returns array with health status and latency for each backend.
     */
    healthCheckAll(): Promise<ReadonlyArray<{
        id: string;
        healthy: boolean;
        latency_ms: number;
    }>>;
}
/**
 * Default implementation of BackendRegistry.
 *
 * Stores backends in a Map<string, MiningBackend>.
 * Applies 7-rule selection algorithm on select().
 * Tracks concurrent invocations per backend.
 */
export declare class DefaultBackendRegistry implements BackendRegistry {
    private backends;
    private concurrencyCounters;
    /**
     * Register a backend.
     * Validates that all 5 interface methods are present.
     */
    register(backend: MiningBackend): void;
    /**
     * Unregister a backend by ID.
     */
    unregister(id: string): void;
    /**
     * Select a backend using the 7-rule selection algorithm (Section 3.5).
     *
     * Rules are applied in priority order; first matching rule wins.
     * Rule 7 (RL tiebreaker) is not implemented here — that happens in
     * FederationController.dispatch(). This returns the first remaining candidate.
     *
     * @throws Error if no suitable backend is found
     */
    select(algorithmId: string, budget: BudgetEnvelope): MiningBackend;
    /**
     * List all registered backends with their health and capabilities.
     */
    list(): ReadonlyArray<{
        id: string;
        healthy: boolean;
        capabilities: BackendCapabilities;
    }>;
    /**
     * Health check all registered backends.
     * Each backend gets a 500ms timeout per spec (Section 3.6, invariant 3).
     * Returns array with health status and latency for each backend.
     */
    healthCheckAll(): Promise<ReadonlyArray<{
        id: string;
        healthy: boolean;
        latency_ms: number;
    }>>;
    /**
     * Increment concurrency counter for a backend.
     * Called by backends when they start processing.
     *
     * INTERNAL: Not part of BackendRegistry interface.
     */
    incrementConcurrency(backendId: string): void;
    /**
     * Decrement concurrency counter for a backend.
     * Called by backends when they finish processing.
     *
     * INTERNAL: Not part of BackendRegistry interface.
     */
    decrementConcurrency(backendId: string): void;
    /**
     * Get current concurrency count for a backend.
     *
     * INTERNAL: Used for debugging and testing.
     */
    getConcurrency(backendId: string): number;
}
//# sourceMappingURL=backend-registry.d.ts.map