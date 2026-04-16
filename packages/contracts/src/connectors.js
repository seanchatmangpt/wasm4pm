/**
 * Source Connector Contracts (PRD §19)
 *
 * Defines the interface contract for all source adapters that provide
 * event log data to wasm4pm from various sources (files, HTTP, streams, etc.)
 */
/**
 * Source Registry
 *
 * Central registry for managing all registered source adapters.
 * Used by the engine to discover and instantiate adapters based on kind.
 */
export class SourceRegistry {
    constructor() {
        this.adapters = new Map();
    }
    /**
     * Register a source adapter
     *
     * @param adapter Source adapter to register
     * @throws Error if adapter kind is already registered (no overwriting)
     */
    register(adapter) {
        if (this.adapters.has(adapter.kind)) {
            throw new Error(`Source adapter kind '${adapter.kind}' is already registered. ` +
                `Adapter versions: existing=${this.adapters.get(adapter.kind)?.version}, ` +
                `new=${adapter.version}`);
        }
        this.adapters.set(adapter.kind, adapter);
    }
    /**
     * Get a registered source adapter by kind
     *
     * @param kind Adapter kind to lookup
     * @returns Adapter if registered, null otherwise
     */
    get(kind) {
        return this.adapters.get(kind) ?? null;
    }
    /**
     * Get all registered adapters
     *
     * @returns Array of all registered adapters
     */
    list() {
        return Array.from(this.adapters.values());
    }
    /**
     * Check if an adapter kind is registered
     *
     * @param kind Adapter kind to check
     * @returns true if registered, false otherwise
     */
    has(kind) {
        return this.adapters.has(kind);
    }
    /**
     * Get count of registered adapters
     *
     * @returns Number of registered adapters
     */
    count() {
        return this.adapters.size;
    }
    /**
     * Clear all registered adapters
     * Used primarily for testing
     */
    clear() {
        this.adapters.clear();
    }
}
// Create a singleton instance for global use
export const sourceRegistry = new SourceRegistry();
//# sourceMappingURL=connectors.js.map