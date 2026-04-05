/**
 * FileSourceAdapter - Read event logs from disk
 * Supports XES, JSON, and OCEL formats
 *
 * Implements idempotency via BLAKE3 fingerprinting and retry logic
 * with exponential backoff for transient errors.
 */
import { SourceAdapter, Capabilities, EventStream, Result, SourceAdapterKind, RetryStrategy } from '@wasm4pm/contracts';
/**
 * Configuration for FileSourceAdapter
 */
export interface FileSourceConfig {
    filePath: string;
    format?: 'xes' | 'json' | 'ocel' | 'auto';
}
/**
 * FileSourceAdapter - Reads event logs from local filesystem
 *
 * Supports:
 * - XES format (XML)
 * - JSON format (line-delimited or array)
 * - OCEL format (Object-Centric Event Logs)
 *
 * Features:
 * - BLAKE3 fingerprinting for idempotency
 * - Automatic format detection
 * - Retry logic with exponential backoff
 * - Streaming support with checkpoints
 */
export declare class FileSourceAdapter implements SourceAdapter {
    readonly kind: SourceAdapterKind;
    readonly version = "1.0.0";
    readonly retry: RetryStrategy;
    private config;
    private stream?;
    constructor(config: FileSourceConfig);
    /**
     * Declare adapter capabilities
     */
    capabilities(): Capabilities;
    /**
     * Validate file exists, is readable, and has valid format
     */
    validate(): Promise<Result<void>>;
    /**
     * Generate SHA256 fingerprint for the file
     * Used to detect if this source has been previously processed (idempotency)
     * Note: Using SHA256 via crypto module as blake3 has import issues in test environments
     */
    fingerprint(source: unknown): Promise<string>;
    /**
     * Open file stream with retry logic
     */
    open(): Promise<Result<EventStream>>;
    /**
     * Close stream and cleanup
     */
    close(): Promise<void>;
    /**
     * Detect file format from content header
     */
    private detectFormat;
    /**
     * Determine if an error is transient (retryable)
     */
    private isTransientError;
}
//# sourceMappingURL=file-source.d.ts.map