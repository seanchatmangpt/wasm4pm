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
     */
    startAutoFlush() {
        this.flushTimer = setInterval(() => {
            this.flush().catch((error) => {
                // Non-blocking: log error but don't throw
                console.error(`[observability] Failed to auto-flush JSON events: ${error}`);
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
            // Non-blocking: fire and forget
            this.flush().catch((error) => {
                console.error(`[observability] Failed to flush JSON buffer: ${error}`);
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
                // Wait for file handle initialization if still pending
                if (this.initPromise) {
                    await this.initPromise;
                }
                if (this.fileHandle) {
                    await this.fileHandle.write(lines);
                }
            }
        }
        catch (error) {
            // Non-blocking: log error but don't throw
            console.error(`[observability] Failed to write JSON events: ${error}`);
        }
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
     * Flushes any remaining events
     */
    async shutdown() {
        try {
            // Stop auto-flush timer
            if (this.flushTimer) {
                clearInterval(this.flushTimer);
            }
            // Flush remaining events
            while (this.buffer.length > 0) {
                await this.flush();
            }
            // Close file handle
            if (this.fileHandle) {
                await this.fileHandle.close();
            }
            return {
                success: true,
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
