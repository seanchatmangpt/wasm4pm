/**
 * Event Factory Tests - Coverage for Recovery, Drift, and Conformance Events
 *
 * Tests the event creation factories for:
 * - RecoveryStartedEvent / RecoveryCompletedEvent
 * - DriftDetectedEvent (via createDriftCheckStartedEvent/Completed)
 * - ConformanceCheckEvent (via createConformanceCheckStartedEvent/Completed)
 * - Plus basic event factory tests for attributes and timestamps
 */

import { describe, it, expect } from 'vitest';
import { Instrumentation } from '../instrumentation.js';
import type { RequiredOtelAttributes } from '../types.js';

// ---------------------------------------------------------------------------
// Shared test fixture
// ---------------------------------------------------------------------------

function makeRequiredAttrs(): RequiredOtelAttributes {
  return {
    'run.id': 'test-run-12345',
    'config.hash': 'aabbccdd0011223344aabbccdd0011223344aabbccdd00112233aabbccdd0011',
    'input.hash': 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
    'plan.hash': '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    'execution.profile': 'balanced',
    'source.kind': 'xes',
    'sink.kind': 'dfg',
  };
}

const TRACE_ID = 'aabbccddeeff00112233445566778899';

// ---------------------------------------------------------------------------
// TASK 2A: Recovery Event Factory Tests
// ---------------------------------------------------------------------------

describe('Event Factory - Recovery Events', () => {
  it('createRecoveryStartedEvent() returns event and otelEvent objects', () => {
    const attrs = makeRequiredAttrs();
    const result = Instrumentation.createRecoveryStartedEvent(
      TRACE_ID,
      'soft',
      'degraded',
      attrs
    );

    expect(result).toHaveProperty('event');
    expect(result).toHaveProperty('otelEvent');
  });

  it('createRecoveryStartedEvent() event has correct required attributes', () => {
    const attrs = makeRequiredAttrs();
    const { event } = Instrumentation.createRecoveryStartedEvent(
      TRACE_ID,
      'fast',
      'failed',
      attrs
    );

    expect(event.type).toBe('RecoveryStarted');
    expect(event.traceId).toBe(TRACE_ID);
    expect(event.spanId).toBeTruthy();
    expect(typeof event.spanId).toBe('string');
    expect(event.spanId.length).toBe(16); // W3C span ID is 16 hex chars
    expect(event.runId).toBe('test-run-12345');
    expect(event.recoveryType).toBe('fast');
    expect(event.fromState).toBe('failed');
    expect(event.status).toBe('UNSET');
    expect(event.requiredAttrs).toEqual(attrs);
  });

  it('createRecoveryStartedEvent() otelEvent has correct span name', () => {
    const attrs = makeRequiredAttrs();
    const { otelEvent } = Instrumentation.createRecoveryStartedEvent(
      TRACE_ID,
      'full',
      'degraded',
      attrs
    );

    expect(otelEvent.name).toBe('engine.recovery_started');
    expect(otelEvent.kind).toBe('INTERNAL');
  });

  it('createRecoveryStartedEvent() otelEvent includes recovery type attribute', () => {
    const attrs = makeRequiredAttrs();
    const { otelEvent } = Instrumentation.createRecoveryStartedEvent(
      TRACE_ID,
      'soft',
      'degraded',
      attrs
    );

    expect(otelEvent.attributes['recovery.type']).toBe('soft');
    expect(otelEvent.attributes['recovery.from_state']).toBe('degraded');
  });

  it('createRecoveryStartedEvent() otelEvent includes service.name', () => {
    const attrs = makeRequiredAttrs();
    const { otelEvent } = Instrumentation.createRecoveryStartedEvent(
      TRACE_ID,
      'fast',
      'failed',
      attrs
    );

    expect(otelEvent.attributes['service.name']).toBe('wasm4pm');
  });

  it('createRecoveryCompletedEvent() returns an OtelEvent object', () => {
    const attrs = makeRequiredAttrs();
    const spanId = Instrumentation.generateSpanId();
    const result = Instrumentation.createRecoveryCompletedEvent(
      TRACE_ID,
      spanId,
      'soft',
      'degraded',
      attrs,
      { durationMs: 150, mttrMs: 120 }
    );

    expect(result).toHaveProperty('name');
    expect(result).toHaveProperty('trace_id');
    expect(result).toHaveProperty('span_id');
  });

  it('createRecoveryCompletedEvent() span name is correct', () => {
    const attrs = makeRequiredAttrs();
    const spanId = Instrumentation.generateSpanId();
    const result = Instrumentation.createRecoveryCompletedEvent(
      TRACE_ID,
      spanId,
      'fast',
      'failed',
      attrs
    );

    expect(result.name).toBe('engine.recovery_completed');
  });

  it('createRecoveryCompletedEvent() includes duration metrics', () => {
    const attrs = makeRequiredAttrs();
    const spanId = Instrumentation.generateSpanId();
    const result = Instrumentation.createRecoveryCompletedEvent(
      TRACE_ID,
      spanId,
      'full',
      'degraded',
      attrs,
      { durationMs: 250, mttrMs: 180 }
    );

    expect(result.attributes['recovery.duration_ms']).toBe(250);
    expect(result.attributes['recovery.mttr_ms']).toBe(180);
  });

  it('createRecoveryCompletedEvent() start_time is before end_time', () => {
    const attrs = makeRequiredAttrs();
    const spanId = Instrumentation.generateSpanId();
    const result = Instrumentation.createRecoveryCompletedEvent(
      TRACE_ID,
      spanId,
      'soft',
      'degraded',
      attrs,
      { durationMs: 100 }
    );

    expect(result.start_time).toBeDefined();
    expect(result.end_time).toBeDefined();
    expect(result.start_time! < result.end_time!).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TASK 2B: Drift Event Factory Tests
// ---------------------------------------------------------------------------

describe('Event Factory - Drift Detection Events', () => {
  it('createDriftCheckStartedEvent() returns event and otelEvent objects', () => {
    const attrs = makeRequiredAttrs();
    const result = Instrumentation.createDriftCheckStartedEvent(
      TRACE_ID,
      'ewma',
      attrs,
      { windowSize: 100, threshold: 0.3 }
    );

    expect(result).toHaveProperty('event');
    expect(result).toHaveProperty('otelEvent');
  });

  it('createDriftCheckStartedEvent() event has correct drift attributes', () => {
    const attrs = makeRequiredAttrs();
    const { event } = Instrumentation.createDriftCheckStartedEvent(
      TRACE_ID,
      'ewma',
      attrs,
      { windowSize: 100, threshold: 0.3 }
    );

    expect(event.type).toBe('DriftCheckStarted');
    expect(event.driftMethod).toBe('ewma');
    expect(event.windowSize).toBe(100);
    expect(event.threshold).toBe(0.3);
    expect(event.status).toBe('UNSET');
  });

  it('createDriftCheckStartedEvent() otelEvent has correct span name', () => {
    const attrs = makeRequiredAttrs();
    const { otelEvent } = Instrumentation.createDriftCheckStartedEvent(
      TRACE_ID,
      'jaccard',
      attrs
    );

    expect(otelEvent.name).toBe('drift.check');
  });

  it('createDriftCheckStartedEvent() otelEvent includes drift method', () => {
    const attrs = makeRequiredAttrs();
    const { otelEvent } = Instrumentation.createDriftCheckStartedEvent(
      TRACE_ID,
      'ks_test',
      attrs
    );

    expect(otelEvent.attributes['drift.method']).toBe('ks_test');
  });

  it('createDriftCheckCompletedEvent() includes drift score and detected flag', () => {
    const attrs = makeRequiredAttrs();
    const spanId = Instrumentation.generateSpanId();
    const result = Instrumentation.createDriftCheckCompletedEvent(
      TRACE_ID,
      spanId,
      'ewma',
      attrs,
      { driftScore: 0.65, driftDetected: true, durationMs: 200 }
    );

    expect(result.attributes['drift.score']).toBe(0.65);
    expect(result.attributes['drift.detected']).toBe(true);
    expect(result.attributes['drift.duration_ms']).toBe(200);
  });

  it('createDriftCheckCompletedEvent() handles zero drift score', () => {
    const attrs = makeRequiredAttrs();
    const spanId = Instrumentation.generateSpanId();
    const result = Instrumentation.createDriftCheckCompletedEvent(
      TRACE_ID,
      spanId,
      'jaccard',
      attrs,
      { driftScore: 0.0, driftDetected: false }
    );

    expect(result.attributes['drift.score']).toBe(0.0);
    expect(result.attributes['drift.detected']).toBe(false);
  });

  it('createDriftCheckCompletedEvent() span name is correct', () => {
    const attrs = makeRequiredAttrs();
    const spanId = Instrumentation.generateSpanId();
    const result = Instrumentation.createDriftCheckCompletedEvent(
      TRACE_ID,
      spanId,
      'ewma',
      attrs
    );

    expect(result.name).toBe('drift.check');
  });

  it('createDriftCheckCompletedEvent() defaults to OK status', () => {
    const attrs = makeRequiredAttrs();
    const spanId = Instrumentation.generateSpanId();
    const result = Instrumentation.createDriftCheckCompletedEvent(
      TRACE_ID,
      spanId,
      'ewma',
      attrs
    );

    expect(result.status.code).toBe('OK');
  });

  it('createDriftCheckCompletedEvent() can set ERROR status', () => {
    const attrs = makeRequiredAttrs();
    const spanId = Instrumentation.generateSpanId();
    const result = Instrumentation.createDriftCheckCompletedEvent(
      TRACE_ID,
      spanId,
      'ewma',
      attrs,
      { status: 'ERROR' }
    );

    expect(result.status.code).toBe('ERROR');
  });
});

// ---------------------------------------------------------------------------
// TASK 2C: Conformance Event Factory Tests
// ---------------------------------------------------------------------------

describe('Event Factory - Conformance Check Events', () => {
  it('createConformanceCheckStartedEvent() returns event and otelEvent objects', () => {
    const attrs = makeRequiredAttrs();
    const result = Instrumentation.createConformanceCheckStartedEvent(
      TRACE_ID,
      'token_replay',
      attrs,
      { modelKind: 'petrinet', traceCount: 500 }
    );

    expect(result).toHaveProperty('event');
    expect(result).toHaveProperty('otelEvent');
  });

  it('createConformanceCheckStartedEvent() event has correct attributes', () => {
    const attrs = makeRequiredAttrs();
    const { event } = Instrumentation.createConformanceCheckStartedEvent(
      TRACE_ID,
      'alignments',
      attrs,
      { modelKind: 'dfg', traceCount: 1000 }
    );

    expect(event.type).toBe('ConformanceCheckStarted');
    expect(event.conformanceMethod).toBe('alignments');
    expect(event.modelKind).toBe('dfg');
    expect(event.traceCount).toBe(1000);
    expect(event.status).toBe('UNSET');
  });

  it('createConformanceCheckStartedEvent() otelEvent has correct span name', () => {
    const attrs = makeRequiredAttrs();
    const { otelEvent } = Instrumentation.createConformanceCheckStartedEvent(
      TRACE_ID,
      'token_replay',
      attrs
    );

    expect(otelEvent.name).toBe('conformance.check');
  });

  it('createConformanceCheckStartedEvent() otelEvent includes conformance method', () => {
    const attrs = makeRequiredAttrs();
    const { otelEvent } = Instrumentation.createConformanceCheckStartedEvent(
      TRACE_ID,
      'alignments',
      attrs
    );

    expect(otelEvent.attributes['conformance.method']).toBe('alignments');
  });

  it('createConformanceCheckCompletedEvent() includes quality metrics', () => {
    const attrs = makeRequiredAttrs();
    const spanId = Instrumentation.generateSpanId();
    const result = Instrumentation.createConformanceCheckCompletedEvent(
      TRACE_ID,
      spanId,
      'token_replay',
      attrs,
      {
        fitness: 0.92,
        precision: 0.85,
        generalization: 0.88,
        simplicity: 12,
        durationMs: 500,
      }
    );

    expect(result.attributes['conformance.fitness']).toBe(0.92);
    expect(result.attributes['conformance.precision']).toBe(0.85);
    expect(result.attributes['conformance.generalization']).toBe(0.88);
    expect(result.attributes['conformance.simplicity']).toBe(12);
    expect(result.attributes['conformance.duration_ms']).toBe(500);
  });

  it('createConformanceCheckCompletedEvent() handles edge case metrics', () => {
    const attrs = makeRequiredAttrs();
    const spanId = Instrumentation.generateSpanId();
    const result = Instrumentation.createConformanceCheckCompletedEvent(
      TRACE_ID,
      spanId,
      'alignments',
      attrs,
      {
        fitness: 1.0,
        precision: 0.0,
        generalization: 0.5,
        simplicity: 0,
      }
    );

    expect(result.attributes['conformance.fitness']).toBe(1.0);
    expect(result.attributes['conformance.precision']).toBe(0.0);
    expect(result.attributes['conformance.simplicity']).toBe(0);
  });

  it('createConformanceCheckCompletedEvent() can report errors', () => {
    const attrs = makeRequiredAttrs();
    const spanId = Instrumentation.generateSpanId();
    const result = Instrumentation.createConformanceCheckCompletedEvent(
      TRACE_ID,
      spanId,
      'token_replay',
      attrs,
      {
        status: 'ERROR',
        errorCode: 'INVALID_MODEL',
        errorMessage: 'Model has invalid structure',
      }
    );

    expect(result.status.code).toBe('ERROR');
    expect(result.status.message).toBe('Model has invalid structure');
    expect(result.attributes['error.code']).toBe('INVALID_MODEL');
  });

  it('createConformanceCheckCompletedEvent() span name is correct', () => {
    const attrs = makeRequiredAttrs();
    const spanId = Instrumentation.generateSpanId();
    const result = Instrumentation.createConformanceCheckCompletedEvent(
      TRACE_ID,
      spanId,
      'token_replay',
      attrs
    );

    expect(result.name).toBe('conformance.check');
  });

  it('createConformanceCheckCompletedEvent() defaults to OK status', () => {
    const attrs = makeRequiredAttrs();
    const spanId = Instrumentation.generateSpanId();
    const result = Instrumentation.createConformanceCheckCompletedEvent(
      TRACE_ID,
      spanId,
      'token_replay',
      attrs
    );

    expect(result.status.code).toBe('OK');
  });
});

// ---------------------------------------------------------------------------
// TASK 2D: General Event Factory Timestamp and Attribute Tests
// ---------------------------------------------------------------------------

describe('Event Factory - Timestamp and Service Name Contracts', () => {
  it('all created events include service.name = "wasm4pm"', () => {
    const attrs = makeRequiredAttrs();

    const recovery = Instrumentation.createRecoveryStartedEvent(
      TRACE_ID,
      'soft',
      'degraded',
      attrs
    );
    expect(recovery.otelEvent.attributes['service.name']).toBe('wasm4pm');

    const drift = Instrumentation.createDriftCheckStartedEvent(
      TRACE_ID,
      'ewma',
      attrs
    );
    expect(drift.otelEvent.attributes['service.name']).toBe('wasm4pm');

    const conformance = Instrumentation.createConformanceCheckStartedEvent(
      TRACE_ID,
      'token_replay',
      attrs
    );
    expect(conformance.otelEvent.attributes['service.name']).toBe('wasm4pm');
  });

  it('all otelEvent timestamps are in nanoseconds (1e9+ value)', () => {
    const attrs = makeRequiredAttrs();
    const spanId = Instrumentation.generateSpanId();

    const recovery = Instrumentation.createRecoveryStartedEvent(
      TRACE_ID,
      'fast',
      'failed',
      attrs
    );
    expect(recovery.otelEvent.start_time).toBeGreaterThan(1e17); // nanoseconds timestamp

    const drift = Instrumentation.createDriftCheckCompletedEvent(
      TRACE_ID,
      spanId,
      'ewma',
      attrs
    );
    expect(drift.start_time).toBeGreaterThan(1e17);
    expect(drift.end_time).toBeGreaterThan(1e17);

    const conformance = Instrumentation.createConformanceCheckCompletedEvent(
      TRACE_ID,
      spanId,
      'token_replay',
      attrs
    );
    expect(conformance.start_time).toBeGreaterThan(1e17);
  });

  it('parent span ID is optional and preserved when provided', () => {
    const attrs = makeRequiredAttrs();
    const parentId = 'parent0011223344556677';

    const recovery = Instrumentation.createRecoveryStartedEvent(
      TRACE_ID,
      'soft',
      'degraded',
      attrs,
      { parentSpanId: parentId }
    );
    expect(recovery.otelEvent.parent_span_id).toBe(parentId);

    const drift = Instrumentation.createDriftCheckStartedEvent(
      TRACE_ID,
      'ewma',
      attrs,
      { parentSpanId: parentId }
    );
    expect(drift.otelEvent.parent_span_id).toBe(parentId);

    const conformance = Instrumentation.createConformanceCheckStartedEvent(
      TRACE_ID,
      'token_replay',
      attrs,
      { parentSpanId: parentId }
    );
    expect(conformance.otelEvent.parent_span_id).toBe(parentId);
  });

  it('required attributes are always included in otelEvent attributes', () => {
    const attrs = makeRequiredAttrs();

    const recovery = Instrumentation.createRecoveryStartedEvent(
      TRACE_ID,
      'soft',
      'degraded',
      attrs
    );
    expect(recovery.otelEvent.attributes['run.id']).toBe(attrs['run.id']);
    expect(recovery.otelEvent.attributes['execution.profile']).toBe(attrs['execution.profile']);

    const conformance = Instrumentation.createConformanceCheckStartedEvent(
      TRACE_ID,
      'token_replay',
      attrs
    );
    expect(conformance.otelEvent.attributes['run.id']).toBe(attrs['run.id']);
    expect(conformance.otelEvent.attributes['config.hash']).toBe(attrs['config.hash']);
  });
});

// ---------------------------------------------------------------------------
// TASK 2E: Span ID / Trace ID Generation Tests
// ---------------------------------------------------------------------------

describe('Event Factory - ID Generation', () => {
  it('generateSpanId() returns 16-character hex strings', () => {
    for (let i = 0; i < 5; i++) {
      const spanId = Instrumentation.generateSpanId();
      expect(spanId).toMatch(/^[0-9a-f]{16}$/);
      expect(spanId.length).toBe(16);
    }
  });

  it('generateTraceId() returns 32-character hex strings', () => {
    for (let i = 0; i < 5; i++) {
      const traceId = Instrumentation.generateTraceId();
      expect(traceId).toMatch(/^[0-9a-f]{32}$/);
      expect(traceId.length).toBe(32);
    }
  });

  it('generated span IDs are unique across multiple calls', () => {
    const spanIds = new Set();
    for (let i = 0; i < 10; i++) {
      spanIds.add(Instrumentation.generateSpanId());
    }
    expect(spanIds.size).toBe(10);
  });

  it('generated trace IDs are unique across multiple calls', () => {
    const traceIds = new Set();
    for (let i = 0; i < 10; i++) {
      traceIds.add(Instrumentation.generateTraceId());
    }
    expect(traceIds.size).toBe(10);
  });
});
