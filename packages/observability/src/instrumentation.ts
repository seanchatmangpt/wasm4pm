/**
 * Instrumentation utilities for distributed tracing
 * Provides helpers for creating spans, events, and correlating distributed requests
 * Per PRD §18.2-3: Required OTEL attributes and W3C Trace Context
 */

import { OtelEvent, RequiredOtelAttributes, JsonEvent } from './types.js';

/**
 * Event types emitted by the engine
 */
export type EventType =
  | 'StateChange'
  | 'PlanGenerated'
  | 'AlgorithmStarted'
  | 'AlgorithmCompleted'
  | 'SourceStarted'
  | 'SourceCompleted'
  | 'SinkStarted'
  | 'SinkCompleted'
  | 'Progress'
  | 'Error';

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
  progress: number; // 0-100
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
 * Instrumentation helper for creating OTEL spans and events
 */
export class Instrumentation {
  /**
   * Create a state change event with OTEL span
   */
  static createStateChangeEvent(
    traceId: string,
    fromState: string,
    toState: string,
    requiredAttrs: RequiredOtelAttributes,
    options?: { reason?: string; parentSpanId?: string }
  ): { event: StateChangeEvent; otelEvent: OtelEvent } {
    const spanId = this.generateSpanId();
    const now = Date.now() * 1000000; // nanoseconds

    const event: StateChangeEvent = {
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

    const otelEvent: OtelEvent = {
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
  static createPlanGeneratedEvent(
    traceId: string,
    planId: string,
    planHash: string,
    steps: number,
    requiredAttrs: RequiredOtelAttributes,
    options?: { estimatedDurationMs?: number; parentSpanId?: string }
  ): { event: PlanGeneratedEvent; otelEvent: OtelEvent } {
    const spanId = this.generateSpanId();
    const now = Date.now() * 1000000;

    const event: PlanGeneratedEvent = {
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

    const otelEvent: OtelEvent = {
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
  static createAlgorithmStartedEvent(
    traceId: string,
    algorithmName: string,
    requiredAttrs: RequiredOtelAttributes,
    options?: { stepId?: string; parentSpanId?: string }
  ): { event: AlgorithmEvent; otelEvent: OtelEvent } {
    const spanId = this.generateSpanId();
    const now = Date.now() * 1000000;

    const event: AlgorithmEvent = {
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

    const otelEvent: OtelEvent = {
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
  static createAlgorithmCompletedEvent(
    traceId: string,
    spanId: string,
    algorithmName: string,
    requiredAttrs: RequiredOtelAttributes,
    options?: {
      status?: 'OK' | 'ERROR';
      errorCode?: string;
      errorMessage?: string;
      durationMs?: number;
      stepId?: string;
    }
  ): OtelEvent {
    const now = Date.now() * 1000000;

    const status = options?.status || 'OK';

    return {
      trace_id: traceId,
      span_id: spanId,
      name: `algorithm.${algorithmName}`,
      kind: 'INTERNAL',
      start_time: now - ((options?.durationMs || 0) * 1000000),
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
  static createSourceStartedEvent(
    traceId: string,
    sourceKind: string,
    requiredAttrs: RequiredOtelAttributes,
    options?: { parentSpanId?: string }
  ): { event: IOEvent; otelEvent: OtelEvent } {
    const spanId = this.generateSpanId();
    const now = Date.now() * 1000000;

    const event: IOEvent = {
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

    const otelEvent: OtelEvent = {
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
  static createSourceCompletedEvent(
    traceId: string,
    spanId: string,
    sourceKind: string,
    requiredAttrs: RequiredOtelAttributes,
    options?: { recordCount?: number; status?: 'OK' | 'ERROR'; errorMessage?: string; durationMs?: number }
  ): OtelEvent {
    const now = Date.now() * 1000000;
    const status = options?.status || 'OK';

    return {
      trace_id: traceId,
      span_id: spanId,
      name: `source.${sourceKind}`,
      kind: 'CLIENT',
      start_time: now - ((options?.durationMs || 0) * 1000000),
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
  static createSinkStartedEvent(
    traceId: string,
    sinkKind: string,
    requiredAttrs: RequiredOtelAttributes,
    options?: { parentSpanId?: string }
  ): { event: IOEvent; otelEvent: OtelEvent } {
    const spanId = this.generateSpanId();
    const now = Date.now() * 1000000;

    const event: IOEvent = {
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

    const otelEvent: OtelEvent = {
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
  static createSinkCompletedEvent(
    traceId: string,
    spanId: string,
    sinkKind: string,
    requiredAttrs: RequiredOtelAttributes,
    options?: { recordCount?: number; status?: 'OK' | 'ERROR'; errorMessage?: string; durationMs?: number }
  ): OtelEvent {
    const now = Date.now() * 1000000;
    const status = options?.status || 'OK';

    return {
      trace_id: traceId,
      span_id: spanId,
      name: `sink.${sinkKind}`,
      kind: 'PRODUCER',
      start_time: now - ((options?.durationMs || 0) * 1000000),
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
  static createProgressEvent(
    traceId: string,
    progress: number,
    requiredAttrs: RequiredOtelAttributes,
    options?: { message?: string; parentSpanId?: string }
  ): { event: ProgressEvent; jsonEvent: JsonEvent } {
    const spanId = this.generateSpanId();

    const event: ProgressEvent = {
      type: 'Progress',
      traceId,
      spanId,
      parentSpanId: options?.parentSpanId,
      runId: requiredAttrs['run.id'],
      progress,
      message: options?.message,
      requiredAttrs,
    };

    const jsonEvent: JsonEvent = {
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
  static createErrorEvent(
    traceId: string,
    errorCode: string,
    errorMessage: string,
    requiredAttrs: RequiredOtelAttributes,
    options?: { severity?: 'info' | 'warning' | 'error' | 'fatal'; context?: Record<string, any>; parentSpanId?: string }
  ): { event: ErrorEventData; otelEvent: OtelEvent; jsonEvent: JsonEvent } {
    const spanId = this.generateSpanId();
    const now = Date.now() * 1000000;
    const severity = options?.severity || 'error';

    const event: ErrorEventData = {
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

    const otelEvent: OtelEvent = {
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

    const jsonEvent: JsonEvent = {
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
   * Generate a W3C-compliant span ID (16 hex chars)
   */
  static generateSpanId(): string {
    return Array.from({ length: 8 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  }

  /**
   * Generate a W3C-compliant trace ID (32 hex chars)
   */
  static generateTraceId(): string {
    return Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  }

  /**
   * Extract trace ID from W3C Trace Context header
   * Format: traceparent: 00-{trace-id}-{span-id}-{trace-flags}
   */
  static extractTraceContext(
    traceparentHeader?: string
  ): { traceId?: string; spanId?: string; traceFlags?: string } {
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
  static createTraceContextHeader(
    traceId: string,
    spanId: string,
    traceSampled: boolean = true
  ): string {
    const traceFlags = traceSampled ? '01' : '00';
    return `00-${traceId}-${spanId}-${traceFlags}`;
  }
}
