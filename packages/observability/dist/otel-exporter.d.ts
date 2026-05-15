/**
 * OpenTelemetry event exporter with non-blocking queue and batch export
 * Events are queued and exported in batches to OTLP HTTP endpoint
 * Never blocks execution; errors are logged but don't fail execution
 * PRD §18.5: "Telemetry must never break execution unless explicitly required"
 */
import { OtelEvent, OtelConfig, ObservabilityResult } from './types.js';
/**
 * Batched OTEL event exporter
 * Manages queue, batching, timeouts, and HTTP export
 * All operations are non-blocking and async
 */
export declare class OtelExporter {
    private config;
    private queue;
    private flushTimer?;
    private flushPromise;
    private isShuttingDown;
    private flushErrors;
    private droppedCount;
    getDropCount(): number;
    resetDropCount(): void;
    constructor(config: OtelConfig);
    private recordFlushError;
    getFlushErrors(): Array<{
        timestamp: Date;
        error: any;
    }>;
    /**
     * Start automatic flush timer
     */
    private startAutoFlush;
    /**
     * Emit an OTEL event (non-blocking)
     * Returns immediately; queuing happens synchronously, export happens asynchronously
     */
    emit(event: OtelEvent): void;
    /**
     * Flush queued events to OTEL HTTP endpoint
     */
    private flush;
    /**
     * Internal flush implementation
     * When required=true, throws error so it propagates; when false, logs and continues
     */
    private doFlush;
    /**
     * Export events to OTEL HTTP endpoint
     * This is the actual HTTP export logic
     */
    private exportEvents;
    /**
     * Send payload to OTEL endpoint via HTTP POST
     */
    private sendToEndpoint;
    /**
     * Get the correct OTEL export URL based on exporter type
     */
    private getExportUrl;
    /**
     * Encode attributes for OTEL format
     * OTEL uses typed attributes
     */
    private encodeAttributes;
    /**
     * Encode a single attribute value
     */
    private encodeValue;
    /**
     * Gracefully shutdown exporter
     * Flushes any remaining events
     * Throws if required=true and flush errors occurred
     */
    shutdown(): Promise<ObservabilityResult>;
}
//# sourceMappingURL=otel-exporter.d.ts.map