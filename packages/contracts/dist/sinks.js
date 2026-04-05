/**
 * Sink Adapter Contracts (PRD §20)
 *
 * Defines the interface contract for all sink adapters that persist
 * artifacts (receipts, models, reports, snapshots) from wasm4pm.
 */
/**
 * Sink Registry
 *
 * Central registry for managing all registered sink adapters.
 * Used by the engine to discover and instantiate adapters based on kind.
 */
export class SinkRegistry {
    constructor() {
        this.adapters = new Map();
    }
    /**
     * Register a sink adapter
     *
     * @param adapter Sink adapter to register
     * @throws Error if adapter kind is already registered (no overwriting)
     */
    register(adapter) {
        if (this.adapters.has(adapter.kind)) {
            throw new Error(`Sink adapter kind '${adapter.kind}' is already registered. ` +
                `Adapter versions: existing=${this.adapters.get(adapter.kind)?.version}, ` +
                `new=${adapter.version}`);
        }
        this.adapters.set(adapter.kind, adapter);
    }
    /**
     * Get a registered sink adapter by kind
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
     * Find adapters supporting a specific artifact type
     *
     * @param type Artifact type to search for
     * @returns Array of adapters that support this artifact type
     */
    findByArtifactType(type) {
        return Array.from(this.adapters.values()).filter(adapter => adapter.supportedArtifacts().includes(type));
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
export const sinkRegistry = new SinkRegistry();
/**
 * Helper function to check if a sink adapter supports a specific artifact type
 *
 * @param adapter Sink adapter to check
 * @param type Artifact type to check
 * @returns true if supported, false otherwise
 */
export function supportsArtifact(adapter, type) {
    return adapter.supportedArtifacts().includes(type);
}
//# sourceMappingURL=sinks.js.map