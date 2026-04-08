/**
 * Instrumentation utilities for distributed tracing
 * Provides helpers for creating spans, events, and correlating distributed requests
 * Per PRD §18.2-3: Required OTEL attributes and W3C Trace Context
 */
import { OtelEvent, RequiredOtelAttributes, JsonEvent } from './types.js';
/**
 * Event types emitted by the engine
 */
export type EventType = 'StateChange' | 'PlanGenerated' | 'AlgorithmStarted' | 'AlgorithmCompleted' | 'SourceStarted' | 'SourceCompleted' | 'SinkStarted' | 'SinkCompleted' | 'Progress' | 'Error' | 'MlModelTraining' | 'MlPredictionMade' | 'MlFeatureExtraction' | 'MlAnomalyDetected';
/**
 * State change event
 */
export interface StateChangeEvent {
    type: 'StateChange';
    traceId: string;
    spanId: string;
    runId: string;
    fromState: string;
    toState: string;
    reason?: string;
    durationMs: number;
    requiredAttrs: RequiredOtelAttributes;
}
/**
 * Plan generated event
 */
export interface PlanGeneratedEvent {
    type: 'PlanGenerated';
    traceId: string;
    spanId: string;
    parentSpanId?: string;
    runId: string;
    planId: string;
    planHash: string;
    steps: number;
    estimatedDurationMs?: number;
    durationMs: number;
    requiredAttrs: RequiredOtelAttributes;
}
/**
 * Algorithm event
 */
export interface AlgorithmEvent {
    type: 'AlgorithmStarted' | 'AlgorithmCompleted';
    traceId: string;
    spanId: string;
    parentSpanId?: string;
    runId: string;
    algorithmName: string;
    stepId?: string;
    durationMs?: number;
    status: 'OK' | 'ERROR' | 'UNSET';
    errorCode?: string;
    errorMessage?: string;
    requiredAttrs: RequiredOtelAttributes;
}
/**
 * Source/Sink event
 */
export interface IOEvent {
    type: 'SourceStarted' | 'SourceCompleted' | 'SinkStarted' | 'SinkCompleted';
    traceId: string;
    spanId: string;
    parentSpanId?: string;
    runId: string;
    operationType: 'source' | 'sink';
    kind: string;
    recordCount?: number;
    durationMs?: number;
    status: 'OK' | 'ERROR' | 'UNSET';
    errorCode?: string;
    errorMessage?: string;
    requiredAttrs: RequiredOtelAttributes;
}
/**
 * Progress event
 */
export interface ProgressEvent {
    type: 'Progress';
    traceId: string;
    spanId: string;
    parentSpanId?: string;
    runId: string;
    progress: number;
    message?: string;
    requiredAttrs: RequiredOtelAttributes;
}
/**
 * Error event
 */
export interface ErrorEventData {
    type: 'Error';
    traceId: string;
    spanId: string;
    parentSpanId?: string;
    runId: string;
    errorCode: string;
    errorMessage: string;
    severity: 'info' | 'warning' | 'error' | 'fatal';
    context?: Record<string, any>;
    requiredAttrs: RequiredOtelAttributes;
}
/**
 * ML analysis event
 */
export interface MlAnalysisEvent {
    type: 'MlModelTraining' | 'MlPredictionMade' | 'MlFeatureExtraction' | 'MlAnomalyDetected';
    traceId: string;
    spanId: string;
    parentSpanId?: string;
    runId: string;
    mlTask: string;
    method?: string;
    durationMs?: number;
    status: 'OK' | 'ERROR' | 'UNSET';
    mlAttributes?: {
        modelType?: string;
        confidence?: number;
        featureCount?: number;
        clusterCount?: number;
        anomalyCount?: number;
        rSquared?: number;
        explainedVariance?: number[];
    };
    requiredAttrs: RequiredOtelAttributes;
}
/**
 * Instrumentation helper for creating OTEL spans and events
 */
export declare class Instrumentation {
    /**
     * Create a state change event with OTEL span
     */
    static createStateChangeEvent(traceId: string, fromState: string, toState: string, requiredAttrs: RequiredOtelAttributes, options?: {
        reason?: string;
        parentSpanId?: string;
    }): {
        event: StateChangeEvent;
        otelEvent: OtelEvent;
    };
    /**
     * Create a plan generated event with OTEL span
     */
    static createPlanGeneratedEvent(traceId: string, planId: string, planHash: string, steps: number, requiredAttrs: RequiredOtelAttributes, options?: {
        estimatedDurationMs?: number;
        parentSpanId?: string;
    }): {
        event: PlanGeneratedEvent;
        otelEvent: OtelEvent;
    };
    /**
     * Create algorithm started event
     */
    static createAlgorithmStartedEvent(traceId: string, algorithmName: string, requiredAttrs: RequiredOtelAttributes, options?: {
        stepId?: string;
        parentSpanId?: string;
    }): {
        event: AlgorithmEvent;
        otelEvent: OtelEvent;
    };
    /**
     * Create algorithm completed event
     */
    static createAlgorithmCompletedEvent(traceId: string, spanId: string, algorithmName: string, requiredAttrs: RequiredOtelAttributes, options?: {
        status?: 'OK' | 'ERROR';
        errorCode?: string;
        errorMessage?: string;
        durationMs?: number;
        stepId?: string;
    }): OtelEvent;
    /**
     * Create source started event
     */
    static createSourceStartedEvent(traceId: string, sourceKind: string, requiredAttrs: RequiredOtelAttributes, options?: {
        parentSpanId?: string;
    }): {
        event: IOEvent;
        otelEvent: OtelEvent;
    };
    /**
     * Create source completed event
     */
    static createSourceCompletedEvent(traceId: string, spanId: string, sourceKind: string, requiredAttrs: RequiredOtelAttributes, options?: {
        recordCount?: number;
        status?: 'OK' | 'ERROR';
        errorMessage?: string;
        durationMs?: number;
    }): OtelEvent;
    /**
     * Create sink started event
     */
    static createSinkStartedEvent(traceId: string, sinkKind: string, requiredAttrs: RequiredOtelAttributes, options?: {
        parentSpanId?: string;
    }): {
        event: IOEvent;
        otelEvent: OtelEvent;
    };
    /**
     * Create sink completed event
     */
    static createSinkCompletedEvent(traceId: string, spanId: string, sinkKind: string, requiredAttrs: RequiredOtelAttributes, options?: {
        recordCount?: number;
        status?: 'OK' | 'ERROR';
        errorMessage?: string;
        durationMs?: number;
    }): OtelEvent;
    /**
     * Create progress event
     */
    static createProgressEvent(traceId: string, progress: number, requiredAttrs: RequiredOtelAttributes, options?: {
        message?: string;
        parentSpanId?: string;
    }): {
        event: ProgressEvent;
        jsonEvent: JsonEvent;
    };
    /**
     * Create error event
     */
    static createErrorEvent(traceId: string, errorCode: string, errorMessage: string, requiredAttrs: RequiredOtelAttributes, options?: {
        severity?: 'info' | 'warning' | 'error' | 'fatal';
        context?: Record<string, any>;
        parentSpanId?: string;
    }): {
        event: ErrorEventData;
        otelEvent: OtelEvent;
        jsonEvent: JsonEvent;
    };
    /**
     * Create ML analysis started event with OTEL span
     */
    static createMlAnalysisStartedEvent(traceId: string, mlTask: string, method: string, requiredAttrs: RequiredOtelAttributes, options?: {
        parentSpanId?: string;
    }): {
        event: MlAnalysisEvent;
        otelEvent: OtelEvent;
    };
    /**
     * Create ML analysis completed event
     */
    static createMlAnalysisCompletedEvent(traceId: string, spanId: string, mlTask: string, method: string, requiredAttrs: RequiredOtelAttributes, options?: {
        status?: 'OK' | 'ERROR';
        durationMs?: number;
        mlAttributes?: MlAnalysisEvent['mlAttributes'];
    }): OtelEvent;
    /**
     * Generate a W3C-compliant span ID (16 hex chars)
     */
    static generateSpanId(): string;
    /**
     * Generate a W3C-compliant trace ID (32 hex chars)
     */
    static generateTraceId(): string;
    /**
     * Extract trace ID from W3C Trace Context header
     * Format: traceparent: 00-{trace-id}-{span-id}-{trace-flags}
     */
    static extractTraceContext(traceparentHeader?: string): {
        traceId?: string;
        spanId?: string;
        traceFlags?: string;
    };
    /**
     * Create W3C Trace Context header
     */
    static createTraceContextHeader(traceId: string, spanId: string, traceSampled?: boolean): string;
}
//# sourceMappingURL=instrumentation.d.ts.map