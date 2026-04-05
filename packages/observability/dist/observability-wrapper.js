/**
 * Observability wrapper for safe event emission
 * Ensures observability errors never break execution
 * Per PRD §18.5: "Telemetry must never break execution unless explicitly required"
 */
import { ObservabilityLayer } from './observability.js';
import { SecretRedaction } from './secret-redaction.js';
/**
 * Observability wrapper that ensures non-blocking behavior
 * Catches and logs errors without breaking execution
 */
export class ObservabilityWrapper {
    constructor(config = {}) {
        this.errors = [];
        this.emitCount = 0;
        this.errorCount = 0;
        this.layer = new ObservabilityLayer(config);
    }
    /**
     * Safe CLI emit - never throws
     */
    emitCliSafe(event) {
        try {
            this.layer.emitCli(event);
            this.emitCount++;
            return { success: true };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.recordError('cli', message);
            return {
                success: false,
                error: { layer: 'cli', message },
            };
        }
    }
    /**
     * Safe JSON emit - never throws
     */
    emitJsonSafe(event) {
        try {
            const redactedEvent = {
                ...event,
                data: SecretRedaction.redactObject(event.data),
            };
            this.layer.emitJson(redactedEvent);
            this.emitCount++;
            return { success: true };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.recordError('json', message);
            return {
                success: false,
                error: { layer: 'json', message },
            };
        }
    }
    /**
     * Safe OTEL emit - never throws
     */
    emitOtelSafe(event) {
        try {
            const redactedEvent = {
                ...event,
                attributes: SecretRedaction.redactObject(event.attributes),
            };
            this.layer.emitOtel(redactedEvent);
            this.emitCount++;
            return { success: true };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.recordError('otel', message);
            return {
                success: false,
                error: { layer: 'otel', message },
            };
        }
    }
    /**
     * Safe multi-layer emit
     */
    emitSafe(event) {
        const results = [];
        if (event.cli) {
            results.push(this.emitCliSafe(event.cli));
        }
        if (event.json) {
            results.push(this.emitJsonSafe(event.json));
        }
        if (event.otel) {
            results.push(this.emitOtelSafe(event.otel));
        }
        return results;
    }
    /**
     * Execute a callback with observability error handling
     * Returns callback result; observability errors don't break execution
     */
    async executeWithObservability(callback, context) {
        try {
            const result = await callback();
            return { result };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.recordError('execution', message);
            return {
                result: undefined,
                observabilityError: `Failed during ${context?.operationName || 'operation'}: ${message}`,
            };
        }
    }
    /**
     * Wrap a synchronous function with error handling
     */
    wrapSync(callback, context) {
        try {
            const result = callback();
            return { result };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.recordError('sync', message);
            return {
                error: `Failed during ${context?.operationName || 'operation'}: ${message}`,
            };
        }
    }
    /**
     * Record an observability error
     */
    recordError(layer, message) {
        this.errorCount++;
        this.errors.push({
            timestamp: new Date(),
            layer,
            message,
        });
        // Keep only last 100 errors to avoid memory bloat
        if (this.errors.length > 100) {
            this.errors.shift();
        }
        // Log to console but don't break execution
        console.debug(`[observability-wrapper] Error in ${layer} layer: ${message}`);
    }
    /**
     * Get observability errors that occurred
     */
    getErrors() {
        return [...this.errors];
    }
    /**
     * Get observability statistics
     */
    getStats() {
        return {
            emitCount: this.emitCount,
            errorCount: this.errorCount,
            errorRate: this.emitCount > 0 ? this.errorCount / this.emitCount : 0,
        };
    }
    /**
     * Clear error history
     */
    clearErrors() {
        this.errors = [];
    }
    /**
     * Graceful shutdown
     */
    async shutdown() {
        try {
            return await this.layer.shutdown();
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return {
                success: false,
                error: `Shutdown failed: ${message}`,
                timestamp: new Date(),
            };
        }
    }
    /**
     * Get underlying observability layer
     */
    getLayer() {
        return this.layer;
    }
}
