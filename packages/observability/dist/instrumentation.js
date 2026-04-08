/**
 * Instrumentation utilities for distributed tracing
 * Provides helpers for creating spans, events, and correlating distributed requests
 * Per PRD §18.2-3: Required OTEL attributes and W3C Trace Context
 */
/**
 * Instrumentation helper for creating OTEL spans and events
 */
export class Instrumentation {
    /**
     * Create a state change event with OTEL span
     */
    static createStateChangeEvent(traceId, fromState, toState, requiredAttrs, options) {
        const spanId = this.generateSpanId();
        const now = Date.now() * 1000000; // nanoseconds
        const event = {
            type: 'StateChange',
            traceId,
            spanId,
            runId: requiredAttrs['run.id'],
            fromState,
            toState,
            reason: options?.reason,
            durationMs: 0,
            requiredAttrs,
        };
        const otelEvent = {
            trace_id: traceId,
            span_id: spanId,
            parent_span_id: options?.parentSpanId,
            name: `engine.state_change`,
            kind: 'INTERNAL',
            start_time: now,
            status: { code: 'OK' },
            attributes: {
                ...requiredAttrs,
                'state.from': fromState,
                'state.to': toState,
                'state.reason': options?.reason || 'unspecified',
            },
        };
        return { event, otelEvent };
    }
    /**
     * Create a plan generated event with OTEL span
     */
    static createPlanGeneratedEvent(traceId, planId, planHash, steps, requiredAttrs, options) {
        const spanId = this.generateSpanId();
        const now = Date.now() * 1000000;
        const event = {
            type: 'PlanGenerated',
            traceId,
            spanId,
            parentSpanId: options?.parentSpanId,
            runId: requiredAttrs['run.id'],
            planId,
            planHash,
            steps,
            estimatedDurationMs: options?.estimatedDurationMs,
            durationMs: 0,
            requiredAttrs,
        };
        const otelEvent = {
            trace_id: traceId,
            span_id: spanId,
            parent_span_id: options?.parentSpanId,
            name: `engine.plan_generated`,
            kind: 'INTERNAL',
            start_time: now,
            status: { code: 'OK' },
            attributes: {
                ...requiredAttrs,
                'plan.id': planId,
                'plan.hash': planHash,
                'plan.steps': steps,
                'plan.estimated_duration_ms': options?.estimatedDurationMs || 0,
            },
        };
        return { event, otelEvent };
    }
    /**
     * Create algorithm started event
     */
    static createAlgorithmStartedEvent(traceId, algorithmName, requiredAttrs, options) {
        const spanId = this.generateSpanId();
        const now = Date.now() * 1000000;
        const event = {
            type: 'AlgorithmStarted',
            traceId,
            spanId,
            parentSpanId: options?.parentSpanId,
            runId: requiredAttrs['run.id'],
            algorithmName,
            stepId: options?.stepId,
            status: 'UNSET',
            requiredAttrs,
        };
        const otelEvent = {
            trace_id: traceId,
            span_id: spanId,
            parent_span_id: options?.parentSpanId,
            name: `algorithm.${algorithmName}`,
            kind: 'INTERNAL',
            start_time: now,
            status: { code: 'UNSET' },
            attributes: {
                ...requiredAttrs,
                'algorithm.name': algorithmName,
                'algorithm.step_id': options?.stepId || 'unspecified',
            },
        };
        return { event, otelEvent };
    }
    /**
     * Create algorithm completed event
     */
    static createAlgorithmCompletedEvent(traceId, spanId, algorithmName, requiredAttrs, options) {
        const now = Date.now() * 1000000;
        const status = options?.status || 'OK';
        return {
            trace_id: traceId,
            span_id: spanId,
            name: `algorithm.${algorithmName}`,
            kind: 'INTERNAL',
            start_time: now - (options?.durationMs || 0) * 1000000,
            end_time: now,
            status: {
                code: status,
                message: options?.errorMessage,
            },
            attributes: {
                ...requiredAttrs,
                'algorithm.name': algorithmName,
                'algorithm.step_id': options?.stepId || 'unspecified',
                'algorithm.duration_ms': options?.durationMs || 0,
                'algorithm.error_code': options?.errorCode || '',
            },
        };
    }
    /**
     * Create source started event
     */
    static createSourceStartedEvent(traceId, sourceKind, requiredAttrs, options) {
        const spanId = this.generateSpanId();
        const now = Date.now() * 1000000;
        const event = {
            type: 'SourceStarted',
            traceId,
            spanId,
            parentSpanId: options?.parentSpanId,
            runId: requiredAttrs['run.id'],
            operationType: 'source',
            kind: sourceKind,
            status: 'UNSET',
            requiredAttrs,
        };
        const otelEvent = {
            trace_id: traceId,
            span_id: spanId,
            parent_span_id: options?.parentSpanId,
            name: `source.${sourceKind}`,
            kind: 'CLIENT',
            start_time: now,
            status: { code: 'UNSET' },
            attributes: {
                ...requiredAttrs,
                'source.kind': sourceKind,
            },
        };
        return { event, otelEvent };
    }
    /**
     * Create source completed event
     */
    static createSourceCompletedEvent(traceId, spanId, sourceKind, requiredAttrs, options) {
        const now = Date.now() * 1000000;
        const status = options?.status || 'OK';
        return {
            trace_id: traceId,
            span_id: spanId,
            name: `source.${sourceKind}`,
            kind: 'CLIENT',
            start_time: now - (options?.durationMs || 0) * 1000000,
            end_time: now,
            status: { code: status, message: options?.errorMessage },
            attributes: {
                ...requiredAttrs,
                'source.kind': sourceKind,
                'source.record_count': options?.recordCount || 0,
                'source.duration_ms': options?.durationMs || 0,
            },
        };
    }
    /**
     * Create sink started event
     */
    static createSinkStartedEvent(traceId, sinkKind, requiredAttrs, options) {
        const spanId = this.generateSpanId();
        const now = Date.now() * 1000000;
        const event = {
            type: 'SinkStarted',
            traceId,
            spanId,
            parentSpanId: options?.parentSpanId,
            runId: requiredAttrs['run.id'],
            operationType: 'sink',
            kind: sinkKind,
            status: 'UNSET',
            requiredAttrs,
        };
        const otelEvent = {
            trace_id: traceId,
            span_id: spanId,
            parent_span_id: options?.parentSpanId,
            name: `sink.${sinkKind}`,
            kind: 'PRODUCER',
            start_time: now,
            status: { code: 'UNSET' },
            attributes: {
                ...requiredAttrs,
                'sink.kind': sinkKind,
            },
        };
        return { event, otelEvent };
    }
    /**
     * Create sink completed event
     */
    static createSinkCompletedEvent(traceId, spanId, sinkKind, requiredAttrs, options) {
        const now = Date.now() * 1000000;
        const status = options?.status || 'OK';
        return {
            trace_id: traceId,
            span_id: spanId,
            name: `sink.${sinkKind}`,
            kind: 'PRODUCER',
            start_time: now - (options?.durationMs || 0) * 1000000,
            end_time: now,
            status: { code: status, message: options?.errorMessage },
            attributes: {
                ...requiredAttrs,
                'sink.kind': sinkKind,
                'sink.record_count': options?.recordCount || 0,
                'sink.duration_ms': options?.durationMs || 0,
            },
        };
    }
    /**
     * Create progress event
     */
    static createProgressEvent(traceId, progress, requiredAttrs, options) {
        const spanId = this.generateSpanId();
        const event = {
            type: 'Progress',
            traceId,
            spanId,
            parentSpanId: options?.parentSpanId,
            runId: requiredAttrs['run.id'],
            progress,
            message: options?.message,
            requiredAttrs,
        };
        const jsonEvent = {
            timestamp: new Date().toISOString(),
            component: 'engine',
            event_type: 'progress',
            run_id: requiredAttrs['run.id'],
            data: {
                progress,
                message: options?.message || '',
                trace_id: traceId,
            },
        };
        return { event, jsonEvent };
    }
    /**
     * Create error event
     */
    static createErrorEvent(traceId, errorCode, errorMessage, requiredAttrs, options) {
        const spanId = this.generateSpanId();
        const now = Date.now() * 1000000;
        const severity = options?.severity || 'error';
        const event = {
            type: 'Error',
            traceId,
            spanId,
            parentSpanId: options?.parentSpanId,
            runId: requiredAttrs['run.id'],
            errorCode,
            errorMessage,
            severity,
            context: options?.context,
            requiredAttrs,
        };
        const otelEvent = {
            trace_id: traceId,
            span_id: spanId,
            parent_span_id: options?.parentSpanId,
            name: `error.${errorCode}`,
            kind: 'INTERNAL',
            start_time: now,
            end_time: now,
            status: { code: 'ERROR', message: errorMessage },
            attributes: {
                ...requiredAttrs,
                'error.code': errorCode,
                'error.message': errorMessage,
                'error.severity': severity,
            },
            events: [
                {
                    name: 'exception',
                    timestamp: now,
                    attributes: {
                        'exception.type': errorCode,
                        'exception.message': errorMessage,
                    },
                },
            ],
        };
        const jsonEvent = {
            timestamp: new Date().toISOString(),
            component: 'engine',
            event_type: 'error',
            run_id: requiredAttrs['run.id'],
            data: {
                error_code: errorCode,
                error_message: errorMessage,
                severity,
                context: options?.context || {},
                trace_id: traceId,
            },
        };
        return { event, otelEvent, jsonEvent };
    }
    /**
     * Create ML analysis started event with OTEL span
     */
    static createMlAnalysisStartedEvent(traceId, mlTask, method, requiredAttrs, options) {
        const spanId = this.generateSpanId();
        const now = Date.now() * 1000000;
        const event = {
            type: 'MlModelTraining',
            traceId,
            spanId,
            parentSpanId: options?.parentSpanId,
            runId: requiredAttrs['run.id'],
            mlTask,
            method,
            status: 'UNSET',
            requiredAttrs,
        };
        const otelEvent = {
            trace_id: traceId,
            span_id: spanId,
            parent_span_id: options?.parentSpanId,
            name: `ml.${mlTask}`,
            kind: 'INTERNAL',
            start_time: now,
            status: { code: 'UNSET' },
            attributes: {
                ...requiredAttrs,
                'ml.task': mlTask,
                'ml.method': method,
            },
        };
        return { event, otelEvent };
    }
    /**
     * Create ML analysis completed event
     */
    static createMlAnalysisCompletedEvent(traceId, spanId, mlTask, method, requiredAttrs, options) {
        const now = Date.now() * 1000000;
        const status = options?.status || 'OK';
        return {
            trace_id: traceId,
            span_id: spanId,
            name: `ml.${mlTask}`,
            kind: 'INTERNAL',
            start_time: now - (options?.durationMs || 0) * 1000000,
            end_time: now,
            status: { code: status },
            attributes: {
                ...requiredAttrs,
                'ml.task': mlTask,
                'ml.method': method,
                'ml.duration_ms': options?.durationMs || 0,
                ...(options?.mlAttributes?.confidence !== undefined && {
                    'ml.confidence': options.mlAttributes.confidence,
                }),
                ...(options?.mlAttributes?.featureCount !== undefined && {
                    'ml.feature_count': options.mlAttributes.featureCount,
                }),
                ...(options?.mlAttributes?.clusterCount !== undefined && {
                    'ml.cluster_count': options.mlAttributes.clusterCount,
                }),
                ...(options?.mlAttributes?.anomalyCount !== undefined && {
                    'ml.anomaly_count': options.mlAttributes.anomalyCount,
                }),
                ...(options?.mlAttributes?.rSquared !== undefined && {
                    'ml.r_squared': options.mlAttributes.rSquared,
                }),
            },
        };
    }
    /**
     * Generate a W3C-compliant span ID (16 hex chars)
     */
    static generateSpanId() {
        return Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
    }
    /**
     * Generate a W3C-compliant trace ID (32 hex chars)
     */
    static generateTraceId() {
        return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
    }
    /**
     * Extract trace ID from W3C Trace Context header
     * Format: traceparent: 00-{trace-id}-{span-id}-{trace-flags}
     */
    static extractTraceContext(traceparentHeader) {
        if (!traceparentHeader) {
            return {};
        }
        const parts = traceparentHeader.split('-');
        if (parts.length !== 4) {
            return {};
        }
        const [version, traceId, spanId, traceFlags] = parts;
        if (version !== '00') {
            return {};
        }
        return { traceId, spanId, traceFlags };
    }
    /**
     * Create W3C Trace Context header
     */
    static createTraceContextHeader(traceId, spanId, traceSampled = true) {
        const traceFlags = traceSampled ? '01' : '00';
        return `00-${traceId}-${spanId}-${traceFlags}`;
    }
}
