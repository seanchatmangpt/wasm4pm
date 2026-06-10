/**
 * Source Connector Contracts (PRD §19)
 *
 * Defines the interface contract for all source adapters that provide
 * event log data to wasm4pm from various sources (files, HTTP, streams, etc.)
 */

import { z } from 'zod';
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

// ============================================================================
// Zod Schemas
// ============================================================================

export const AuthConfigSchema = z.object({
  type: z.enum(['none', 'basic', 'bearer', 'oauth2']),
});

export const CapabilitiesSchema = z.object({
  streaming: z.boolean(),
  checkpoint: z.boolean(),
  filtering: z.boolean(),
});

export const RetryStrategySchema = z.object({
  maxAttempts: z.number().int().nonnegative(),
  backoff: z.enum(['exponential', 'linear', 'fixed']),
  initialDelayMs: z.number().nonnegative(),
});

export const EventStreamSchema = z.object({});

export const SourceAdapterSchema = z.object({
  kind: z.enum(['file', 'http', 'stream', 'mcp', 'database', 'custom']),
  version: z.string(),
  auth: AuthConfigSchema.optional(),
  retry: RetryStrategySchema.optional(),
});

// ============================================================================
// Types derived from schemas (data fields only)
// Note: method signatures are declared separately via interface augmentation below
// ============================================================================

export type AuthConfigData = z.infer<typeof AuthConfigSchema>;
export type CapabilitiesData = z.infer<typeof CapabilitiesSchema>;
export type RetryStrategyData = z.infer<typeof RetryStrategySchema>;
export type SourceAdapterData = z.infer<typeof SourceAdapterSchema>;

/**
 * Authentication configuration for source adapters
 */
export type AuthConfig = AuthConfigData & {
  validate(): Promise<Result<void>>;
};

/**
 * Capability declaration for a source adapter
 */
export type Capabilities = z.infer<typeof CapabilitiesSchema>;

/**
 * Retry strategy configuration
 */
export type RetryStrategy = z.infer<typeof RetryStrategySchema>;

/**
 * Event stream interface returned by connector.open()
 */
export type EventStream = {
  // Read next batch of events
  next(): Promise<Result<{ events: unknown[]; hasMore: boolean }>>;

  // Get current position/checkpoint
  checkpoint(): Promise<Result<string>>;

  // Seek to checkpoint position
  seek(position: string): Promise<Result<void>>;

  // Close stream and cleanup resources
  close(): Promise<void>;
};

/**
 * Source Adapter Contract
 *
 * All source adapters MUST implement this interface to be registered
 * with the source registry.
 */
export type SourceAdapter = SourceAdapterData & {
  // ============================================================================
  // Capability Declaration
  // ============================================================================

  /**
   * Declare capabilities of this adapter
   *
   * @returns Capability flags indicating supported features
   */
  capabilities(): Capabilities;

  // ============================================================================
  // Idempotency & Fingerprinting
  // ============================================================================

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

  // ============================================================================
  // Lifecycle & Validation
  // ============================================================================

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
};

/**
 * Source Registry
 *
 * Central registry for managing all registered source adapters.
 * Used by the engine to discover and instantiate adapters based on kind.
 */
export class SourceRegistry {
  private adapters = new Map<SourceAdapterKind, SourceAdapter>();

  /**
   * Register a source adapter
   *
   * @param adapter Source adapter to register
   * @throws Error if adapter kind is already registered (no overwriting)
   */
  register(adapter: SourceAdapter): void {
    if (this.adapters.has(adapter.kind)) {
      throw new Error(
        `Source adapter kind '${adapter.kind}' is already registered. ` +
          `Adapter versions: existing=${this.adapters.get(adapter.kind)?.version}, ` +
          `new=${adapter.version}`
      );
    }
    this.adapters.set(adapter.kind, adapter);
  }

  /**
   * Get a registered source adapter by kind
   *
   * @param kind Adapter kind to lookup
   * @returns Adapter if registered, null otherwise
   */
  get(kind: SourceAdapterKind | string): SourceAdapter | null {
    return this.adapters.get(kind as SourceAdapterKind) ?? null;
  }

  /**
   * Get all registered adapters
   *
   * @returns Array of all registered adapters
   */
  list(): SourceAdapter[] {
    return Array.from(this.adapters.values());
  }

  /**
   * Check if an adapter kind is registered
   *
   * @param kind Adapter kind to check
   * @returns true if registered, false otherwise
   */
  has(kind: SourceAdapterKind | string): boolean {
    return this.adapters.has(kind as SourceAdapterKind);
  }

  /**
   * Get count of registered adapters
   *
   * @returns Number of registered adapters
   */
  count(): number {
    return this.adapters.size;
  }

  /**
   * Clear all registered adapters
   * Used primarily for testing
   */
  clear(): void {
    this.adapters.clear();
  }
}

// Create a singleton instance for global use
export const sourceRegistry = new SourceRegistry();
