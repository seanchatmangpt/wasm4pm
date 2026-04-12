/**
 * JSON writer for JSONL format event logging
 * Writes one JSON event per line for easy parsing and ingestion
 * Non-blocking: uses async I/O and never blocks execution
 */
import { JsonEvent, JsonConfig, ObservabilityResult } from './types.js';
/**
 * Manages JSON event writing to file or stdout
 * All operations are async and non-blocking
 */
export declare class JsonWriter {
    private config;
    private buffer;
    private fileHandle?;
    private flushPromise;
    private readonly BUFFER_SIZE;
    private readonly FLUSH_INTERVAL_MS;
    private flushTimer?;
    private initPromise;
    constructor(config: JsonConfig);
    /**
     * Initialize file handle (async, non-blocking)
     */
    private initializeFile;
    /**
     * Start auto-flush timer
     */
    private startAutoFlush;
    /**
     * Emit a JSON event (non-blocking)
     * Returns immediately; writing happens asynchronously
     */
    emit(event: JsonEvent): void;
    /**
     * Flush buffered events to output
     */
    private flush;
    /**
     * Internal flush implementation
     */
    private doFlush;
    /**
     * Redact secrets from event data
     * Removes sensitive fields like passwords, tokens, keys
     */
    static redactSecrets(data: Record<string, any>): Record<string, any>;
    /**
     * Gracefully shutdown the writer
     * Flushes any remaining events
     */
    shutdown(): Promise<ObservabilityResult>;
}
//# sourceMappingURL=json-writer.d.ts.map