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
import { CliEvent, JsonEvent, OtelEvent, ObservabilityConfig, RequiredOtelAttributes, ObservabilityResult } from './types.js';
/**
 * Central observability layer managing all three logging outputs
 * All methods are non-blocking; they return immediately or return Promises that resolve asynchronously
 */
export declare class ObservabilityLayer {
    private jsonWriter?;
    private otelExporter?;
    private config;
    constructor(config?: ObservabilityConfig);
    /**
     * Enable JSON logging (non-blocking)
     */
    enableJson(dest: string): void;
    /**
     * Enable OTEL export (non-blocking)
     */
    enableOtel(config: {
        endpoint: string;
        exporter?: 'otlp_http' | 'otlp_grpc';
        required?: boolean;
    }): void;
    /**
     * Emit a CLI event (Layer 1 - human-readable)
     * Prints to console immediately
     */
    emitCli(event: CliEvent): void;
    /**
     * Emit a JSON event (Layer 2 - machine-readable)
     * Non-blocking; buffers event for async write
     */
    emitJson(event: JsonEvent): void;
    /**
     * Emit an OTEL event (Layer 3 - distributed tracing)
     * Non-blocking; queues event for async export
     */
    emitOtel(event: OtelEvent): void;
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
    emit(event: {
        cli?: CliEvent;
        json?: JsonEvent;
        otel?: OtelEvent;
    }): void;
    /**
     * Helper: Create a span with required OTEL attributes per PRD §18.2-3
     * Returns the span ID for parent-child relationships
     */
    createSpan(traceId: string, name: string, requiredAttrs: RequiredOtelAttributes, customAttrs?: Record<string, any>): string;
    /**
     * Helper: Generate a W3C-compliant trace ID (32 hex chars)
     */
    static generateTraceId(): string;
    /**
     * Helper: Generate a W3C-compliant span ID (16 hex chars)
     */
    private generateSpanId;
    /**
     * Get the current observability configuration
     */
    getConfig(): ObservabilityConfig;
    /**
     * Gracefully shutdown observability layer
     * Flushes all pending events
     * Should be called before process exit
     */
    shutdown(): Promise<ObservabilityResult>;
}
/**
 * Get or create the default observability instance
 */
export declare function getObservabilityLayer(config?: ObservabilityConfig): ObservabilityLayer;
//# sourceMappingURL=observability.d.ts.map