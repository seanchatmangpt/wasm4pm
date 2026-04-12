/**
 * JSON writer for JSONL format event logging
 * Writes one JSON event per line for easy parsing and ingestion
 * Non-blocking: uses async I/O and never blocks execution
 */
import { promises as fs } from 'fs';
/**
 * Manages JSON event writing to file or stdout
 * All operations are async and non-blocking
 */
export class JsonWriter {
    constructor(config) {
        this.buffer = [];
        this.flushPromise = Promise.resolve();
        this.BUFFER_SIZE = 100;
        this.FLUSH_INTERVAL_MS = 1000;
        this.flushErrors = [];
        this.config = config;
        if (config.enabled && config.dest !== 'stdout') {
            this.initPromise = this.initializeFile();
        }
        this.startAutoFlush();
    }
    /**
     * Initialize file handle (async, non-blocking)
     */
    async initializeFile() {
        if (this.config.dest === 'stdout')
            return;
        try {
            this.fileHandle = await fs.open(this.config.dest, 'a');
        }
        catch (error) {
            // Non-blocking: log error but don't throw
            console.error(`[observability] Failed to initialize JSON writer: ${error}`);
        }
    }
    /**
     * Start auto-flush timer
     * Errors are logged and recorded; caller should monitor via getFlushErrors()
     */
    startAutoFlush() {
        this.flushTimer = setInterval(() => {
            this.flush().catch((error) => {
                const message = error instanceof Error ? error.message : String(error);
                console.warn(`[observability] Failed to auto-flush JSON events: ${message}`);
                this.recordFlushError(error);
            });
        }, this.FLUSH_INTERVAL_MS);
        // Allow process to exit even if timer is pending
        if (this.flushTimer.unref) {
            this.flushTimer.unref();
        }
    }
    /**
     * Emit a JSON event (non-blocking)
     * Returns immediately; writing happens asynchronously
     */
    emit(event) {
        if (!this.config.enabled)
            return;
        // Ensure timestamp
        if (!event.timestamp) {
            event.timestamp = new Date().toISOString();
        }
        this.buffer.push(event);
        // Flush if buffer is full
        if (this.buffer.length >= this.BUFFER_SIZE) {
            this.flush().catch((error) => {
                const message = error instanceof Error ? error.message : String(error);
                console.warn(`[observability] Failed to flush JSON buffer: ${message}`);
                this.recordFlushError(error);
            });
        }
    }
    /**
     * Flush buffered events to output
     */
    async flush() {
        if (this.buffer.length === 0)
            return;
        // Chain flushes to avoid concurrent writes
        this.flushPromise = this.flushPromise.then(() => this.doFlush());
        return this.flushPromise;
    }
    /**
     * Internal flush implementation
     * Throws on error so caller can handle; failed events are re-enqueued
     */
    async doFlush() {
        const events = this.buffer.splice(0, this.BUFFER_SIZE);
        if (events.length === 0)
            return;
        const lines = events.map((e) => JSON.stringify(e)).join('\n') + '\n';
        try {
            if (this.config.dest === 'stdout') {
                process.stdout.write(lines);
            }
            else {
                if (this.initPromise) {
                    await this.initPromise;
                }
                if (this.fileHandle) {
                    await this.fileHandle.write(lines);
                }
                else {
                    throw new Error('JSON writer file handle not initialized');
                }
            }
        }
        catch (error) {
            this.buffer.unshift(...events);
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`JSON flush failed: ${message}`);
        }
    }
    recordFlushError(error) {
        this.flushErrors.push({ timestamp: new Date(), error });
        if (this.flushErrors.length > 50)
            this.flushErrors.shift();
    }
    getFlushErrors() {
        return [...this.flushErrors];
    }
    /**
     * Redact secrets from event data
     * Removes sensitive fields like passwords, tokens, keys
     */
    static redactSecrets(data) {
        const sensitiveFields = [
            'password',
            'token',
            'api_key',
            'secret',
            'credentials',
            'auth',
            'apiSecret',
            'accessKey',
            'secretKey',
        ];
        const redacted = { ...data };
        for (const key of Object.keys(redacted)) {
            const lowerKey = key.toLowerCase();
            if (sensitiveFields.some((field) => lowerKey.includes(field))) {
                if (typeof redacted[key] === 'object' && redacted[key] !== null) {
                    redacted[key] = JsonWriter.redactSecrets(redacted[key]);
                }
                else {
                    redacted[key] = '[REDACTED]';
                }
            }
            else if (typeof redacted[key] === 'object' && redacted[key] !== null) {
                redacted[key] = JsonWriter.redactSecrets(redacted[key]);
            }
        }
        return redacted;
    }
    /**
     * Gracefully shutdown the writer
     * Flushes any remaining events; reports errors without breaking shutdown
     */
    async shutdown() {
        try {
            if (this.flushTimer) {
                clearInterval(this.flushTimer);
            }
            let lastError;
            while (this.buffer.length > 0) {
                try {
                    await this.flush();
                }
                catch (error) {
                    lastError = error instanceof Error ? error : new Error(String(error));
                    console.warn(`[observability] Flush error during shutdown: ${lastError.message}`);
                }
            }
            if (this.fileHandle) {
                try {
                    await this.fileHandle.close();
                }
                catch (closeError) {
                    lastError = closeError instanceof Error ? closeError : new Error(String(closeError));
                }
            }
            return {
                success: !lastError,
                error: lastError ? lastError.message : undefined,
                timestamp: new Date(),
            };
        }
        catch (error) {
            return {
                success: false,
                error: String(error),
                timestamp: new Date(),
            };
        }
    }
}
