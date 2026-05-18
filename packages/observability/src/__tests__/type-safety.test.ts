/**
 * Type-safety tests for narrowed types in @wasm4pm/observability.
 *
 * These tests verify that fields previously typed as `Record<string, any>`
 * now accept only `Record<string, unknown>`, and that runtime narrowing
 * of those `unknown` values is correct.
 *
 * Oracle hierarchy:
 *   Rank 1 — Mathematical: structural invariants (never undefined where required)
 *   Rank 2 — Domain contract: OTEL PRD §18.2-3 field presence rules
 *   Rank 3 — Metamorphic: type narrowing produces correct runtime values
 */

import { describe, it, expect } from 'vitest';
import type { JsonEvent, OtelEvent } from '../types.js';
import { Instrumentation } from '../instrumentation.js';
import { ObservabilityLayer } from '../observability.js';
import { ObservabilityWrapper } from '../observability-wrapper.js';
import type { RequiredOtelAttributes } from '../types.js';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

function makeRequiredAttrs(runId = 'test-run-001'): RequiredOtelAttributes {
  return {
    'run.id': runId,
    'config.hash': 'aabbcc0011223344aabbcc0011223344aabbcc0011223344aabbcc0011223344',
    'input.hash': 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
    'plan.hash': '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    'execution.profile': 'balanced',
    'source.kind': 'xes',
    'sink.kind': 'dfg',
  };
}

const TRACE_ID = 'aabbccddeeff00112233445566778899';

// ---------------------------------------------------------------------------
// 1. JsonEvent.data is Record<string, unknown>
// ---------------------------------------------------------------------------

describe('JsonEvent.data type narrowing', () => {
  it('accepts a Record<string, unknown> payload with mixed value types', () => {
    // Rank 1: structural invariant — object with heterogeneous unknown values
    const data: Record<string, unknown> = {
      count: 42,
      label: 'discovery',
      nested: { fitness: 0.95 },
      flag: true,
      nothing: null,
    };

    const event: JsonEvent = {
      timestamp: new Date().toISOString(),
      level: 'info',
      component: 'engine',
      event_type: 'execution_start',
      run_id: 'run-001',
      data,
    };

    expect(event.data['count']).toBe(42);
    expect(event.data['label']).toBe('discovery');
    expect(event.data['flag']).toBe(true);
  });

  it('type-narrows a string value from data correctly at runtime', () => {
    // Rank 3: metamorphic — narrowing unknown -> string is safe when the value is a string
    const data: Record<string, unknown> = { algorithm: 'dfg', version: 3 };
    const algo = data['algorithm'];

    // Narrowing pattern: unknown requires an explicit type guard before use
    expect(typeof algo).toBe('string');
    if (typeof algo === 'string') {
      expect(algo.toUpperCase()).toBe('DFG');
    }
  });

  it('type-narrows a number value from data correctly at runtime', () => {
    const data: Record<string, unknown> = { fitness: 0.87, precision: 0.72 };
    const fitness = data['fitness'];

    expect(typeof fitness).toBe('number');
    if (typeof fitness === 'number') {
      expect(fitness).toBeGreaterThan(0.85);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. OtelEvent.attributes is Record<string, unknown>
// ---------------------------------------------------------------------------

describe('OtelEvent.attributes type narrowing', () => {
  it('accepts a Record<string, unknown> attribute map', () => {
    // Rank 2: domain contract — OTEL attributes must include service.name
    const attrs: Record<string, unknown> = {
      'service.name': 'wasm4pm',
      'run.id': 'run-001',
      'algorithm': 'dfg',
      'trace.count': 150,
    };

    const event: OtelEvent = {
      trace_id: TRACE_ID,
      span_id: 'abcd1234abcd1234',
      name: 'kernel.run',
      start_time: Date.now() * 1_000_000,
      status: { code: 'OK' },
      attributes: attrs,
    };

    expect(event.attributes['service.name']).toBe('wasm4pm');
    expect(event.attributes['trace.count']).toBe(150);
  });

  it('accepts OtelEvent.events[].attributes as Record<string, unknown>', () => {
    // Rank 1: structural — event timeline attributes follow same unknown pattern
    const spanEvents: OtelEvent['events'] = [
      {
        name: 'checkpoint',
        timestamp: Date.now() * 1_000_000,
        attributes: { checkpoint_id: 'cp-42', elapsed_ms: 300 },
      },
    ];

    expect(spanEvents).toHaveLength(1);
    const attrs = spanEvents![0].attributes!;
    expect(attrs['checkpoint_id']).toBe('cp-42');

    // Rank 3: narrowing the number value
    const elapsed = attrs['elapsed_ms'];
    if (typeof elapsed === 'number') {
      expect(elapsed).toBe(300);
    } else {
      throw new Error('elapsed_ms should be a number');
    }
  });

  it('emits an OTEL event through ObservabilityLayer with unknown attributes', () => {
    // Rank 2: domain contract — layer accepts the typed event without error
    const layer = new ObservabilityLayer({});
    const attrs: Record<string, unknown> = {
      'service.name': 'wasm4pm',
      'run.id': 'run-002',
    };

    expect(() => {
      layer.emitOtel({
        trace_id: TRACE_ID,
        span_id: 'deadbeef12345678',
        name: 'test.span',
        start_time: Date.now() * 1_000_000,
        status: { code: 'OK' },
        attributes: attrs,
      });
    }).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// 3. ErrorEventData.context is Record<string, unknown>
// ---------------------------------------------------------------------------

describe('ErrorEventData.context type narrowing', () => {
  it('accepts a Record<string, unknown> context object in createErrorEvent', () => {
    // Rank 2: domain contract — error events carry structured context
    const context: Record<string, unknown> = {
      algorithm: 'ilp',
      trace_count: 500,
      threshold: 0.8,
      recoverable: true,
    };

    const { event } = Instrumentation.createErrorEvent(
      TRACE_ID,
      'ALGORITHM_FAILED',
      'ILP optimization failed',
      makeRequiredAttrs(),
      { context, severity: 'error' }
    );

    expect(event.context).toBe(context);
    expect(event.context?.['algorithm']).toBe('ilp');
  });

  it('narrows context values correctly from ErrorEventData', () => {
    // Rank 3: metamorphic — unknown context values require narrowing before use
    const context: Record<string, unknown> = {
      error_code: 42,
      message: 'timeout',
    };

    const { event } = Instrumentation.createErrorEvent(
      TRACE_ID,
      'WASM_INIT_FAILED',
      'WASM module timed out',
      makeRequiredAttrs(),
      { context }
    );

    const code = event.context?.['error_code'];
    expect(typeof code).toBe('number');
    if (typeof code === 'number') {
      expect(code).toBe(42);
    }

    const msg = event.context?.['message'];
    expect(typeof msg).toBe('string');
    if (typeof msg === 'string') {
      expect(msg).toBe('timeout');
    }
  });

  it('accepts undefined context (context is optional)', () => {
    // Rank 1: structural — optional context must not be required
    const { event } = Instrumentation.createErrorEvent(
      TRACE_ID,
      'CONFIG_MISSING',
      'No config found',
      makeRequiredAttrs()
    );

    expect(event.context).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 4. ObservabilityLayer.createSpan accepts Record<string, unknown> customAttrs
// ---------------------------------------------------------------------------

describe('ObservabilityLayer.createSpan customAttrs narrowing', () => {
  it('accepts Record<string, unknown> as custom attributes', () => {
    // Rank 2: domain contract — custom attrs are merged with required OTEL fields
    const layer = new ObservabilityLayer({});
    const customAttrs: Record<string, unknown> = {
      'algorithm.name': 'dfg',
      'algorithm.speed_score': 5,
      'algorithm.quality_score': 30,
    };

    const spanId = layer.createSpan(TRACE_ID, 'discovery.run', makeRequiredAttrs(), customAttrs);

    expect(typeof spanId).toBe('string');
    expect(spanId.length).toBeGreaterThan(0);
  });

  it('works without custom attributes (optional parameter)', () => {
    // Rank 1: structural — customAttrs optional must not be required at runtime
    const layer = new ObservabilityLayer({});
    const spanId = layer.createSpan(TRACE_ID, 'conformance.check', makeRequiredAttrs());

    expect(typeof spanId).toBe('string');
    expect(spanId.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 5. OtelEvent.status fallback (no more `as any` on span.status)
// ---------------------------------------------------------------------------

describe('OtelEvent.status type narrowing in emitOtelSafe', () => {
  it('emits with a well-formed status object (code OK)', () => {
    // Rank 2: domain contract — status field must be the structured form, not cast as any
    const wrapper = new ObservabilityWrapper({});
    // Simulate what the tracer callback emits: `status: span.status ?? { code: 'UNSET' as const }`
    const result = wrapper.emitOtelSafe({
      trace_id: TRACE_ID,
      span_id: 'abcd1234abcd1234',
      name: 'kernel.run',
      start_time: Date.now() * 1_000_000,
      end_time: Date.now() * 1_000_000 + 5_000_000,
      status: { code: 'OK' },
      attributes: { 'service.name': 'wasm4pm', 'run.id': 'run-005' },
    });

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('emits with UNSET fallback status (simulating undefined span.status)', () => {
    // Rank 3: metamorphic — `span.status ?? { code: 'UNSET' as const }` produces a valid OtelEvent
    const wrapper = new ObservabilityWrapper({});
    // This is what the callback emits when `span.status` is undefined
    const fallbackStatus: OtelEvent['status'] = { code: 'UNSET' };
    const result = wrapper.emitOtelSafe({
      trace_id: TRACE_ID,
      span_id: 'deadbeef00000000',
      name: 'conformance.check',
      start_time: Date.now() * 1_000_000,
      status: fallbackStatus,
      attributes: { 'service.name': 'wasm4pm' },
    });

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
    const stats = wrapper.getStats();
    expect(stats.errorCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 6. Safe emit handles Record<string, unknown> data without type coercion
// ---------------------------------------------------------------------------

describe('ObservabilityWrapper.emitJsonSafe with typed data', () => {
  it('accepts and emits a JsonEvent with Record<string, unknown> data', () => {
    const wrapper = new ObservabilityWrapper({});
    const data: Record<string, unknown> = {
      traces: 42,
      algorithm: 'dfg',
      fitness: 0.95,
    };

    const result = wrapper.emitJsonSafe({
      timestamp: new Date().toISOString(),
      level: 'info',
      component: 'engine',
      event_type: 'algorithm_completed',
      run_id: 'run-003',
      data,
    });

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
  });
});
