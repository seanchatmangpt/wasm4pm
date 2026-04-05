/**
 * Main observability layer coordinating all logging outputs
 * Implements three-layer architecture:
 * 1. CLI (human-readable console)
 * 2. JSON (machine-readable JSONL)
 * 3. OTEL (distributed tracing)
 *
 * All operations are non-blocking and async-safe
 * PRD §18.5: "Telemetry must never break execution unless explicitly required"
 */
import { JsonWriter } from './json-writer.js';
import { OtelExporter } from './otel-exporter.js';
/**
 * Central observability layer managing all three logging outputs
 * All methods are non-blocking; they return immediately or return Promises that resolve asynchronously
 */
export class ObservabilityLayer {
    constructor(config = {}) {
        this.config = config;
        // Initialize JSON writer
        if (config.json?.enabled) {
            this.jsonWriter = new JsonWriter(config.json);
        }
        // Initialize OTEL exporter
        if (config.otel?.enabled) {
            this.otelExporter = new OtelExporter(config.otel);
        }
    }
    /**
     * Enable JSON logging (non-blocking)
     */
    enableJson(dest) {
        if (this.jsonWriter) {
            // Already enabled
            return;
        }
        this.jsonWriter = new JsonWriter({
            enabled: true,
            dest,
        });
    }
    /**
     * Enable OTEL export (non-blocking)
     */
    enableOtel(config) {
        if (this.otelExporter) {
            // Already enabled
            return;
        }
        this.otelExporter = new OtelExporter({
            enabled: true,
            endpoint: config.endpoint,
            exporter: config.exporter ?? 'otlp_http',
            required: config.required ?? false,
        });
    }
    /**
     * Emit a CLI event (Layer 1 - human-readable)
     * Prints to console immediately
     */
    emitCli(event) {
        const timestamp = event.timestamp ?? new Date();
        const level = event.level.toUpperCase().padEnd(5);
        switch (event.level) {
            case 'error':
                console.error(`[${level}] ${timestamp.toISOString()} ${event.message}`);
                break;
            case 'warn':
                console.warn(`[${level}] ${timestamp.toISOString()} ${event.message}`);
                break;
            case 'info':
                console.info(`[${level}] ${timestamp.toISOString()} ${event.message}`);
                break;
            case 'debug':
                console.debug(`[${level}] ${timestamp.toISOString()} ${event.message}`);
                break;
        }
    }
    /**
     * Emit a JSON event (Layer 2 - machine-readable)
     * Non-blocking; buffers event for async write
     */
    emitJson(event) {
        if (!this.jsonWriter) {
            return; // JSON writer not enabled
        }
        // Redact secrets from data
        const redactedData = JsonWriter.redactSecrets(event.data);
        const redactedEvent = { ...event, data: redactedData };
        // Non-blocking: emit to writer's buffer
        this.jsonWriter.emit(redactedEvent);
    }
    /**
     * Emit an OTEL event (Layer 3 - distributed tracing)
     * Non-blocking; queues event for async export
     */
    emitOtel(event) {
        if (!this.otelExporter) {
            return; // OTEL exporter not enabled
        }
        // Non-blocking: emit to exporter's queue
        this.otelExporter.emit(event);
    }
    /**
     * Emit an event to all configured layers
     * This is the main entry point for logging
     *
     * Usage:
     *   observability.emit({
     *     cli: { level: 'info', message: 'Processing trace...' },
     *     json: { component: 'engine', event_type: 'trace_start', ... },
     *     otel: { trace_id: '...', span_id: '...', ... }
     *   })
     */
    emit(event) {
        // All non-blocking; emit to each layer that's configured
        if (event.cli) {
            this.emitCli(event.cli);
        }
        if (event.json) {
            this.emitJson(event.json);
        }
        if (event.otel) {
            this.emitOtel(event.otel);
        }
    }
    /**
     * Helper: Create a span with required OTEL attributes per PRD §18.2-3
     * Returns the span ID for parent-child relationships
     */
    createSpan(traceId, name, requiredAttrs, customAttrs) {
        const spanId = this.generateSpanId();
        const event = {
            trace_id: traceId,
            span_id: spanId,
            name,
            kind: 'INTERNAL',
            start_time: Date.now() * 1000000, // Convert to nanoseconds
            status: { code: 'UNSET' },
            attributes: {
                ...requiredAttrs,
                ...customAttrs,
            },
        };
        this.emitOtel(event);
        return spanId;
    }
    /**
     * Helper: Generate a W3C-compliant trace ID (32 hex chars)
     */
    static generateTraceId() {
        return Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
    }
    /**
     * Helper: Generate a W3C-compliant span ID (16 hex chars)
     */
    generateSpanId() {
        return Array.from({ length: 8 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
    }
    /**
     * Get the current observability configuration
     */
    getConfig() {
        return this.config;
    }
    /**
     * Gracefully shutdown observability layer
     * Flushes all pending events
     * Should be called before process exit
     */
    async shutdown() {
        const results = [];
        if (this.jsonWriter) {
            results.push(await this.jsonWriter.shutdown());
        }
        if (this.otelExporter) {
            results.push(await this.otelExporter.shutdown());
        }
        const hasErrors = results.some((r) => !r.success);
        return {
            success: !hasErrors,
            error: hasErrors
                ? results.filter((r) => !r.success).map((r) => r.error).join('; ')
                : undefined,
            timestamp: new Date(),
        };
    }
}
/**
 * Singleton instance (optional convenience export)
 * Applications can use this or create their own instance
 */
let defaultInstance = null;
/**
 * Get or create the default observability instance
 */
export function getObservabilityLayer(config) {
    if (!defaultInstance) {
        defaultInstance = new ObservabilityLayer(config);
    }
    return defaultInstance;
}
