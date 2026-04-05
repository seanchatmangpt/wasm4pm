/**
 * Observability wrapper for safe event emission
 * Ensures observability errors never break execution
 * Per PRD §18.5: "Telemetry must never break execution unless explicitly required"
 */
import { ObservabilityLayer } from './observability.js';
import { CliEvent, JsonEvent, OtelEvent, ObservabilityConfig, ObservabilityResult } from './types.js';
/**
 * Result of a safe emit operation
 */
export interface SafeEmitResult {
    success: boolean;
    error?: {
        layer: 'cli' | 'json' | 'otel';
        message: string;
    };
}
/**
 * Observability wrapper that ensures non-blocking behavior
 * Catches and logs errors without breaking execution
 */
export declare class ObservabilityWrapper {
    private layer;
    private errors;
    private emitCount;
    private errorCount;
    constructor(config?: ObservabilityConfig);
    /**
     * Safe CLI emit - never throws
     */
    emitCliSafe(event: CliEvent): SafeEmitResult;
    /**
     * Safe JSON emit - never throws
     */
    emitJsonSafe(event: JsonEvent): SafeEmitResult;
    /**
     * Safe OTEL emit - never throws
     */
    emitOtelSafe(event: OtelEvent): SafeEmitResult;
    /**
     * Safe multi-layer emit
     */
    emitSafe(event: {
        cli?: CliEvent;
        json?: JsonEvent;
        otel?: OtelEvent;
    }): SafeEmitResult[];
    /**
     * Execute a callback with observability error handling
     * Returns callback result; observability errors don't break execution
     */
    executeWithObservability<T>(callback: () => Promise<T>, context?: {
        operationName?: string;
        traceId?: string;
    }): Promise<{
        result: T;
        observabilityError?: string;
    }>;
    /**
     * Wrap a synchronous function with error handling
     */
    wrapSync<T>(callback: () => T, context?: {
        operationName?: string;
    }): {
        result?: T;
        error?: string;
    };
    /**
     * Record an observability error
     */
    private recordError;
    /**
     * Get observability errors that occurred
     */
    getErrors(): Array<{
        timestamp: Date;
        layer: string;
        message: string;
    }>;
    /**
     * Get observability statistics
     */
    getStats(): {
        emitCount: number;
        errorCount: number;
        errorRate: number;
    };
    /**
     * Clear error history
     */
    clearErrors(): void;
    /**
     * Graceful shutdown
     */
    shutdown(): Promise<ObservabilityResult>;
    /**
     * Get underlying observability layer
     */
    getLayer(): ObservabilityLayer;
}
//# sourceMappingURL=observability-wrapper.d.ts.map