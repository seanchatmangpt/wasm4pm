/**
 * Source Connector Contracts (PRD §19)
 *
 * Defines the interface contract for all source adapters that provide
 * event log data to wasm4pm from various sources (files, HTTP, streams, etc.)
 */
import { Result } from './result.js';
/**
 * Supported source adapter kinds
 */
export type SourceAdapterKind = 'file' | 'http' | 'stream' | 'mcp' | 'database' | 'custom';
/**
 * Retry backoff strategy
 */
export type RetryBackoffStrategy = 'exponential' | 'linear' | 'fixed';
/**
 * Authentication type for source adapters
 */
export type AuthType = 'none' | 'basic' | 'bearer' | 'oauth2';
/**
 * Authentication configuration for source adapters
 */
export interface AuthConfig {
    type: AuthType;
    validate(): Promise<Result<void>>;
}
/**
 * Capability declaration for a source adapter
 */
export interface Capabilities {
    streaming: boolean;
    checkpoint: boolean;
    filtering: boolean;
}
/**
 * Retry strategy configuration
 */
export interface RetryStrategy {
    maxAttempts: number;
    backoff: RetryBackoffStrategy;
    initialDelayMs: number;
}
/**
 * Event stream interface returned by connector.open()
 */
export interface EventStream {
    next(): Promise<Result<{
        events: unknown[];
        hasMore: boolean;
    }>>;
    checkpoint(): Promise<Result<string>>;
    seek(position: string): Promise<Result<void>>;
    close(): Promise<void>;
}
/**
 * Source Adapter Contract
 *
 * All source adapters MUST implement this interface to be registered
 * with the source registry.
 */
export interface SourceAdapter {
    /**
     * Unique kind identifier for this adapter
     * Examples: "file", "http", "stream", "mcp", "database"
     */
    readonly kind: SourceAdapterKind;
    /**
     * Semantic version of this adapter
     * Used to track compatibility and migrations
     */
    readonly version: string;
    /**
     * Optional authentication configuration
     * If not provided, assumes "none" (unauthenticated access)
     */
    readonly auth?: AuthConfig;
    /**
     * Declare capabilities of this adapter
     *
     * @returns Capability flags indicating supported features
     */
    capabilities(): Capabilities;
    /**
     * Generate a deterministic fingerprint for a source
     *
     * Used to detect whether the same source has been previously processed
     * (idempotency). Fingerprints MUST be:
     * - Deterministic: same input -> same fingerprint
     * - Unique: different sources -> different fingerprints
     * - Based on content/identity, not timestamps
     *
     * Implementation MUST use BLAKE3 hashing for consistency.
     *
     * @param source Source configuration object (format depends on adapter)
     * @returns Promise<string> 64-character BLAKE3 hash in hex format
     */
    fingerprint(source: unknown): Promise<string>;
    /**
     * Optional retry strategy for connection failures
     * If not provided, assumes no retries (single attempt)
     */
    readonly retry?: RetryStrategy;
    /**
     * Validate adapter configuration and permissions
     *
     * Called before attempting to open a stream. Should verify:
     * - Configuration is valid and well-formed
     * - Authentication credentials are present (if required)
     * - Source is accessible (permission checks, network connectivity)
     * - Required dependencies are available
     *
     * @returns Result indicating validation success/failure
     */
    validate(): Promise<Result<void>>;
    /**
     * Open a connection to the source and return an event stream
     *
     * Called after validate() succeeds. Should:
     * - Establish connection to source
     * - Return EventStream for reading events
     * - Handle retries according to retry strategy
     *
     * Precondition: validate() must have been called and succeeded
     *
     * @returns Result containing an EventStream or error
     */
    open(): Promise<Result<EventStream>>;
    /**
     * Close the adapter and release resources
     *
     * Called when the adapter is no longer needed. Should:
     * - Close any open connections
     * - Release file handles
     * - Clean up temporary resources
     * - Be safe to call multiple times
     *
     * @returns Promise that resolves when cleanup is complete
     */
    close(): Promise<void>;
}
/**
 * Source Registry
 *
 * Central registry for managing all registered source adapters.
 * Used by the engine to discover and instantiate adapters based on kind.
 */
export declare class SourceRegistry {
    private adapters;
    /**
     * Register a source adapter
     *
     * @param adapter Source adapter to register
     * @throws Error if adapter kind is already registered (no overwriting)
     */
    register(adapter: SourceAdapter): void;
    /**
     * Get a registered source adapter by kind
     *
     * @param kind Adapter kind to lookup
     * @returns Adapter if registered, null otherwise
     */
    get(kind: SourceAdapterKind | string): SourceAdapter | null;
    /**
     * Get all registered adapters
     *
     * @returns Array of all registered adapters
     */
    list(): SourceAdapter[];
    /**
     * Check if an adapter kind is registered
     *
     * @param kind Adapter kind to check
     * @returns true if registered, false otherwise
     */
    has(kind: SourceAdapterKind | string): boolean;
    /**
     * Get count of registered adapters
     *
     * @returns Number of registered adapters
     */
    count(): number;
    /**
     * Clear all registered adapters
     * Used primarily for testing
     */
    clear(): void;
}
export declare const sourceRegistry: SourceRegistry;
//# sourceMappingURL=connectors.d.ts.map