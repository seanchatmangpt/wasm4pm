/**
 * Tests for instrumentation module
 * Covers span creation, event generation, and trace context handling
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  Instrumentation,
  StateChangeEvent,
  PlanGeneratedEvent,
  AlgorithmEvent,
  IOEvent,
  ProgressEvent,
  ErrorEventData,
} from './instrumentation';
import { RequiredOtelAttributes } from './types';

describe('Instrumentation', () => {
  let traceId: string;
  let requiredAttrs: RequiredOtelAttributes;

  beforeEach(() => {
    traceId = Instrumentation.generateTraceId();
    requiredAttrs = {
      'run.id': 'test-run-123',
      'config.hash': 'abc123',
      'input.hash': 'def456',
      'plan.hash': 'ghi789',
      'execution.profile': 'test',
      'source.kind': 'test',
      'sink.kind': 'test',
    };
  });

  describe('Trace ID generation', () => {
    it('should generate valid W3C trace IDs', () => {
      const id = Instrumentation.generateTraceId();
      expect(id).toMatch(/^[a-f0-9]{32}$/);
      expect(id).toHaveLength(32);
    });

    it('should generate unique trace IDs', () => {
      const id1 = Instrumentation.generateTraceId();
      const id2 = Instrumentation.generateTraceId();
      expect(id1).not.toBe(id2);
    });
  });

  describe('Span ID generation', () => {
    it('should generate valid W3C span IDs', () => {
      const id = Instrumentation.generateSpanId();
      expect(id).toMatch(/^[a-f0-9]{16}$/);
      expect(id).toHaveLength(16);
    });

    it('should generate unique span IDs', () => {
      const id1 = Instrumentation.generateSpanId();
      const id2 = Instrumentation.generateSpanId();
      expect(id1).not.toBe(id2);
    });
  });

  describe('State change events', () => {
    it('should create state change event with required fields', () => {
      const { event, otelEvent } = Instrumentation.createStateChangeEvent(
        traceId,
        'ready',
        'planning',
        requiredAttrs
      );

      expect(event.type).toBe('StateChange');
      expect(event.traceId).toBe(traceId);
      expect(event.fromState).toBe('ready');
      expect(event.toState).toBe('planning');
      expect(event.runId).toBe(requiredAttrs['run.id']);

      expect(otelEvent.trace_id).toBe(traceId);
      expect(otelEvent.attributes['state.from']).toBe('ready');
      expect(otelEvent.attributes['state.to']).toBe('planning');
      expect(otelEvent.status?.code).toBe('OK');
    });

    it('should include parent span ID if provided', () => {
      const parentSpanId = Instrumentation.generateSpanId();
      const { otelEvent } = Instrumentation.createStateChangeEvent(
        traceId,
        'ready',
        'planning',
        requiredAttrs,
        { parentSpanId }
      );

      expect(otelEvent.parent_span_id).toBe(parentSpanId);
    });

    it('should include reason if provided', () => {
      const { event, otelEvent } = Instrumentation.createStateChangeEvent(
        traceId,
        'ready',
        'planning',
        requiredAttrs,
        { reason: 'User initiated planning' }
      );

      expect(event.reason).toBe('User initiated planning');
      expect(otelEvent.attributes['state.reason']).toBe('User initiated planning');
    });
  });

  describe('Plan generated events', () => {
    it('should create plan generated event with required fields', () => {
      const { event, otelEvent } = Instrumentation.createPlanGeneratedEvent(
        traceId,
        'plan-123',
        'hash-abc',
        5,
        requiredAttrs
      );

      expect(event.type).toBe('PlanGenerated');
      expect(event.planId).toBe('plan-123');
      expect(event.planHash).toBe('hash-abc');
      expect(event.steps).toBe(5);

      expect(otelEvent.attributes['plan.id']).toBe('plan-123');
      expect(otelEvent.attributes['plan.hash']).toBe('hash-abc');
      expect(otelEvent.attributes['plan.steps']).toBe(5);
    });

    it('should include estimated duration if provided', () => {
      const { event } = Instrumentation.createPlanGeneratedEvent(
        traceId,
        'plan-123',
        'hash-abc',
        5,
        requiredAttrs,
        { estimatedDurationMs: 1000 }
      );

      expect(event.estimatedDurationMs).toBe(1000);
    });
  });

  describe('Algorithm events', () => {
    it('should create algorithm started event', () => {
      const { event, otelEvent } = Instrumentation.createAlgorithmStartedEvent(
        traceId,
        'dijkstra',
        requiredAttrs
      );

      expect(event.type).toBe('AlgorithmStarted');
      expect(event.algorithmName).toBe('dijkstra');
      expect(otelEvent.name).toBe('algorithm.dijkstra');
      expect(otelEvent.attributes['algorithm.name']).toBe('dijkstra');
    });

    it('should create algorithm completed event', () => {
      const spanId = Instrumentation.generateSpanId();
      const otelEvent = Instrumentation.createAlgorithmCompletedEvent(
        traceId,
        spanId,
        'dijkstra',
        requiredAttrs,
        { status: 'OK', durationMs: 100 }
      );

      expect(otelEvent.span_id).toBe(spanId);
      expect(otelEvent.status?.code).toBe('OK');
      expect(otelEvent.attributes['algorithm.duration_ms']).toBe(100);
    });

    it('should handle algorithm error', () => {
      const spanId = Instrumentation.generateSpanId();
      const otelEvent = Instrumentation.createAlgorithmCompletedEvent(
        traceId,
        spanId,
        'dijkstra',
        requiredAttrs,
        {
          status: 'ERROR',
          errorCode: 'TIMEOUT',
          errorMessage: 'Algorithm timed out',
          durationMs: 5000,
        }
      );

      expect(otelEvent.status?.code).toBe('ERROR');
      expect(otelEvent.status?.message).toBe('Algorithm timed out');
      expect(otelEvent.attributes['algorithm.error_code']).toBe('TIMEOUT');
    });
  });

  describe('Source/Sink events', () => {
    it('should create source started event', () => {
      const { event, otelEvent } = Instrumentation.createSourceStartedEvent(
        traceId,
        'xes',
        requiredAttrs
      );

      expect(event.type).toBe('SourceStarted');
      expect(event.kind).toBe('xes');
      expect(otelEvent.kind).toBe('CLIENT');
      expect(otelEvent.attributes['source.kind']).toBe('xes');
    });

    it('should create source completed event', () => {
      const spanId = Instrumentation.generateSpanId();
      const otelEvent = Instrumentation.createSourceCompletedEvent(
        traceId,
        spanId,
        'xes',
        requiredAttrs,
        { recordCount: 1000, status: 'OK', durationMs: 250 }
      );

      expect(otelEvent.status?.code).toBe('OK');
      expect(otelEvent.attributes['source.record_count']).toBe(1000);
      expect(otelEvent.attributes['source.duration_ms']).toBe(250);
    });

    it('should create sink started event', () => {
      const { event, otelEvent } = Instrumentation.createSinkStartedEvent(
        traceId,
        'petri_net',
        requiredAttrs
      );

      expect(event.type).toBe('SinkStarted');
      expect(event.kind).toBe('petri_net');
      expect(otelEvent.kind).toBe('PRODUCER');
      expect(otelEvent.attributes['sink.kind']).toBe('petri_net');
    });

    it('should create sink completed event', () => {
      const spanId = Instrumentation.generateSpanId();
      const otelEvent = Instrumentation.createSinkCompletedEvent(
        traceId,
        spanId,
        'petri_net',
        requiredAttrs,
        { recordCount: 1, status: 'OK', durationMs: 50 }
      );

      expect(otelEvent.status?.code).toBe('OK');
      expect(otelEvent.attributes['sink.record_count']).toBe(1);
      expect(otelEvent.attributes['sink.duration_ms']).toBe(50);
    });
  });

  describe('Progress events', () => {
    it('should create progress event', () => {
      const { event, jsonEvent } = Instrumentation.createProgressEvent(
        traceId,
        50,
        requiredAttrs,
        { message: 'Processing step 2 of 4' }
      );

      expect(event.type).toBe('Progress');
      expect(event.progress).toBe(50);
      expect(event.message).toBe('Processing step 2 of 4');

      expect(jsonEvent.component).toBe('engine');
      expect(jsonEvent.event_type).toBe('progress');
      expect(jsonEvent.data.progress).toBe(50);
    });

    it('should handle 100% progress', () => {
      const { event } = Instrumentation.createProgressEvent(
        traceId,
        100,
        requiredAttrs
      );

      expect(event.progress).toBe(100);
    });
  });

  describe('Error events', () => {
    it('should create error event with required fields', () => {
      const { event, otelEvent, jsonEvent } = Instrumentation.createErrorEvent(
        traceId,
        'BOOTSTRAP_FAILED',
        'Kernel initialization failed',
        requiredAttrs
      );

      expect(event.type).toBe('Error');
      expect(event.errorCode).toBe('BOOTSTRAP_FAILED');
      expect(event.errorMessage).toBe('Kernel initialization failed');
      expect(event.severity).toBe('error');

      expect(otelEvent.status?.code).toBe('ERROR');
      expect(otelEvent.status?.message).toBe('Kernel initialization failed');
      expect(otelEvent.attributes['error.code']).toBe('BOOTSTRAP_FAILED');

      expect(jsonEvent.component).toBe('engine');
      expect(jsonEvent.event_type).toBe('error');
      expect(jsonEvent.data.error_code).toBe('BOOTSTRAP_FAILED');
    });

    it('should include severity level', () => {
      const { event } = Instrumentation.createErrorEvent(
        traceId,
        'CRITICAL_ERROR',
        'Fatal error occurred',
        requiredAttrs,
        { severity: 'fatal' }
      );

      expect(event.severity).toBe('fatal');
    });

    it('should include error context', () => {
      const context = { failedComponent: 'kernel', retries: 3 };
      const { event, otelEvent } = Instrumentation.createErrorEvent(
        traceId,
        'RETRY_EXHAUSTED',
        'All retries failed',
        requiredAttrs,
        { context }
      );

      expect(event.context).toEqual(context);
    });
  });

  describe('Trace context propagation', () => {
    it('should create W3C Trace Context header', () => {
      const traceId = '00000000000000000000000000000001';
      const spanId = '0000000000000001';
      const header = Instrumentation.createTraceContextHeader(traceId, spanId, true);

      expect(header).toBe('00-00000000000000000000000000000001-0000000000000001-01');
    });

    it('should extract trace context from header', () => {
      const header = '00-12345678901234567890123456789012-1234567890123456-01';
      const context = Instrumentation.extractTraceContext(header);

      expect(context.traceId).toBe('12345678901234567890123456789012');
      expect(context.spanId).toBe('1234567890123456');
      expect(context.traceFlags).toBe('01');
    });

    it('should handle invalid trace context headers', () => {
      const context = Instrumentation.extractTraceContext('invalid');
      expect(context.traceId).toBeUndefined();
      expect(context.spanId).toBeUndefined();
    });

    it('should handle missing trace context', () => {
      const context = Instrumentation.extractTraceContext();
      expect(Object.keys(context)).toHaveLength(0);
    });
  });

  describe('Required OTEL attributes', () => {
    it('should include all required attributes in events', () => {
      const { otelEvent } = Instrumentation.createStateChangeEvent(
        traceId,
        'ready',
        'planning',
        requiredAttrs
      );

      expect(otelEvent.attributes['run.id']).toBe(requiredAttrs['run.id']);
      expect(otelEvent.attributes['config.hash']).toBe(requiredAttrs['config.hash']);
      expect(otelEvent.attributes['input.hash']).toBe(requiredAttrs['input.hash']);
      expect(otelEvent.attributes['plan.hash']).toBe(requiredAttrs['plan.hash']);
      expect(otelEvent.attributes['execution.profile']).toBe(
        requiredAttrs['execution.profile']
      );
      expect(otelEvent.attributes['source.kind']).toBe(requiredAttrs['source.kind']);
      expect(otelEvent.attributes['sink.kind']).toBe(requiredAttrs['sink.kind']);
    });
  });

  describe('Event metadata', () => {
    it('should preserve span hierarchy with parent span IDs', () => {
      const parentSpanId = Instrumentation.generateSpanId();
      const { otelEvent } = Instrumentation.createAlgorithmStartedEvent(
        traceId,
        'test_algo',
        requiredAttrs,
        { parentSpanId }
      );

      expect(otelEvent.parent_span_id).toBe(parentSpanId);
    });

    it('should include span kind indicators', () => {
      const sourceEvent = Instrumentation.createSourceStartedEvent(
        traceId,
        'xes',
        requiredAttrs
      );
      const sinkEvent = Instrumentation.createSinkStartedEvent(
        traceId,
        'petri_net',
        requiredAttrs
      );

      expect(sourceEvent.otelEvent.kind).toBe('CLIENT');
      expect(sinkEvent.otelEvent.kind).toBe('PRODUCER');
    });
  });
});
