/**
 * Sink Adapter Contracts (PRD §20)
 *
 * Defines the interface contract for all sink adapters that persist
 * artifacts (receipts, models, reports, snapshots) from wasm4pm.
 */
import { Result } from './result.js';
/**
 * Artifact types that sinks must support
 */
export type ArtifactType = 'receipt' | 'model' | 'report' | 'explain_snapshot' | 'status_snapshot';
/**
 * Supported sink adapter kinds
 */
export type SinkAdapterKind = 'file' | 'http' | 'database' | 'mcp' | 'cloud' | 'custom';
/**
 * Atomicity guarantees offered by a sink
 */
export type AtomicityLevel = 'none' | 'event' | 'batch' | 'transaction';
/**
 * Behavior when artifact already exists at destination
 */
export type ExistsBehavior = 'skip' | 'overwrite' | 'append' | 'error';
/**
 * Failure handling semantics
 */
export type FailureMode = 'fail' | 'degrade' | 'ignore';
/**
 * Sink Adapter Contract
 *
 * All sink adapters MUST implement this interface to be registered
 * with the sink registry.
 */
export interface SinkAdapter {
    /**
     * Unique kind identifier for this adapter
     * Examples: "file", "http", "database", "mcp", "cloud"
     */
    readonly kind: SinkAdapterKind;
    /**
     * Semantic version of this adapter
     * Used to track compatibility and migrations
     */
    readonly version: string;
    /**
     * Declare which artifact types this sink can handle
     *
     * @returns Array of artifact types supported by this sink
     */
    supportedArtifacts(): ArtifactType[];
    /**
     * Check if this sink supports a specific artifact type
     *
     * @param type Artifact type to check
     * @returns true if supported, false otherwise
     */
    supportsArtifact(type: ArtifactType): boolean;
    /**
     * Atomicity guarantee level offered by this sink
     *
     * - 'none': No guarantees, write may be partial
     * - 'event': Each event write is atomic
     * - 'batch': Multiple events in a batch are atomic
     * - 'transaction': Full transaction semantics (all-or-nothing)
     */
    readonly atomicity: AtomicityLevel;
    /**
     * Behavior when artifact already exists at destination
     *
     * - 'skip': Do not write, return success
     * - 'overwrite': Replace existing artifact
     * - 'append': Append to existing artifact (if supported)
     * - 'error': Fail with error if artifact exists
     */
    readonly onExists: ExistsBehavior;
    /**
     * How this sink handles write failures
     *
     * - 'fail': Propagate error, halt processing
     * - 'degrade': Log warning and continue with reduced functionality
     * - 'ignore': Silently continue (use with caution)
     */
    readonly failureMode: FailureMode;
    /**
     * Validate sink configuration and permissions
     *
     * Called before attempting to write. Should verify:
     * - Configuration is valid and well-formed
     * - Destination is writable (permissions, space)
     * - Required dependencies are available
     * - Authentication credentials are valid (if needed)
     *
     * @returns Result indicating validation success/failure
     */
    validate(): Promise<Result<void>>;
    /**
     * Write an artifact to the sink
     *
     * Called to persist an artifact. Should:
     * - Validate artifact type is supported
     * - Respect atomicity guarantees
     * - Handle onExists behavior correctly
     * - Return artifact ID for tracking
     *
     * @param artifact Artifact object to write (format depends on type)
     * @param type Type of artifact being written
     * @returns Promise<Result<string>> artifact ID (for tracking) or error
     */
    write(artifact: unknown, type: ArtifactType): Promise<Result<string>>;
    /**
     * Close the sink and release resources
     *
     * Called when the sink is no longer needed. Should:
     * - Flush any buffered writes
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
 * Sink Registry
 *
 * Central registry for managing all registered sink adapters.
 * Used by the engine to discover and instantiate adapters based on kind.
 */
export declare class SinkRegistry {
    private adapters;
    /**
     * Register a sink adapter
     *
     * @param adapter Sink adapter to register
     * @throws Error if adapter kind is already registered (no overwriting)
     */
    register(adapter: SinkAdapter): void;
    /**
     * Get a registered sink adapter by kind
     *
     * @param kind Adapter kind to lookup
     * @returns Adapter if registered, null otherwise
     */
    get(kind: SinkAdapterKind | string): SinkAdapter | null;
    /**
     * Get all registered adapters
     *
     * @returns Array of all registered adapters
     */
    list(): SinkAdapter[];
    /**
     * Check if an adapter kind is registered
     *
     * @param kind Adapter kind to check
     * @returns true if registered, false otherwise
     */
    has(kind: SinkAdapterKind | string): boolean;
    /**
     * Get count of registered adapters
     *
     * @returns Number of registered adapters
     */
    count(): number;
    /**
     * Find adapters supporting a specific artifact type
     *
     * @param type Artifact type to search for
     * @returns Array of adapters that support this artifact type
     */
    findByArtifactType(type: ArtifactType): SinkAdapter[];
    /**
     * Clear all registered adapters
     * Used primarily for testing
     */
    clear(): void;
}
export declare const sinkRegistry: SinkRegistry;
/**
 * Helper function to check if a sink adapter supports a specific artifact type
 *
 * @param adapter Sink adapter to check
 * @param type Artifact type to check
 * @returns true if supported, false otherwise
 */
export declare function supportsArtifact(adapter: SinkAdapter, type: ArtifactType): boolean;
//# sourceMappingURL=sinks.d.ts.map