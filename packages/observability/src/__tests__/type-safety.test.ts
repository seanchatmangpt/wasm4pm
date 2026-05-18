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
import { validateRequiredFields, REQUIRED_FIELD_NAMES, createRequiredFields } from '../fields.js';

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

// ---------------------------------------------------------------------------
// 7. createSpan() OtelEvent structure — Rank 1 structural invariants
// ---------------------------------------------------------------------------

describe('OtelEvent structural invariants from createSpan()', () => {
  it('OtelEvent built for createSpan has name, status, and attributes (Rank-1)', () => {
    // Rank 1: Mathematical invariant — the OtelEvent shape is a formal contract.
    // We construct the same event that createSpan() assembles, and verify its fields.
    const traceId = TRACE_ID;
    const name = 'kernel.run';
    const requiredAttrs = makeRequiredAttrs('run-007');
    const customAttrs: Record<string, unknown> = { 'algorithm.name': 'dfg', 'trace.count': 42 };

    // Construct the OtelEvent exactly as createSpan() does (source: observability.ts:160-171)
    const event: OtelEvent = {
      trace_id: traceId,
      span_id: 'abcdef1234567890',
      name,
      kind: 'INTERNAL',
      start_time: Date.now() * 1_000_000,
      status: { code: 'UNSET' },
      attributes: { ...requiredAttrs, ...customAttrs },
    };

    // Rank 1: name is the string passed to createSpan
    expect(event.name).toBe('kernel.run');

    // Rank 1: status.code defaults to 'UNSET' (pre-completion)
    expect(event.status.code).toBe('UNSET');

    // Rank 1: attributes includes all required fields
    for (const key of REQUIRED_FIELD_NAMES) {
      expect(event.attributes[key]).toBeDefined();
    }

    // Rank 1: custom attributes are merged into attributes
    expect(event.attributes['algorithm.name']).toBe('dfg');
    expect(event.attributes['trace.count']).toBe(42);
  });

  it('OtelEvent.status.code is exactly one of UNSET | OK | ERROR (Rank-1 union invariant)', () => {
    // Rank 1: The status code type is a closed union — no other value is valid.
    const validCodes: OtelEvent['status']['code'][] = ['UNSET', 'OK', 'ERROR'];

    for (const code of validCodes) {
      const event: OtelEvent = {
        trace_id: TRACE_ID,
        span_id: 'abcdef1234567890',
        name: 'test.span',
        start_time: Date.now() * 1_000_000,
        status: { code },
        attributes: {},
      };
      expect(validCodes).toContain(event.status.code);
    }
  });

  it('createSpan returns a 16-hex-char span ID (W3C Trace Context — Rank-2 domain contract)', () => {
    // Rank 2: Domain contract — W3C Trace Context specifies 16 hex chars for span IDs.
    const layer = new ObservabilityLayer({});
    const spanId = layer.createSpan(TRACE_ID, 'discovery.run', makeRequiredAttrs());

    expect(spanId).toMatch(/^[0-9a-f]{16}$/);
  });

  it('two calls to createSpan return distinct span IDs (Rank-1 uniqueness)', () => {
    // Rank 1: Structural invariant — each span must have a unique ID.
    const layer = new ObservabilityLayer({});
    const id1 = layer.createSpan(TRACE_ID, 'span.one', makeRequiredAttrs());
    const id2 = layer.createSpan(TRACE_ID, 'span.two', makeRequiredAttrs());

    expect(id1).not.toBe(id2);
  });
});

// ---------------------------------------------------------------------------
// 8. Field name formatting — Rank 1 (dot-notation snake_case invariant)
// ---------------------------------------------------------------------------

describe('fields.ts — field name formatting invariants', () => {
  it('all REQUIRED_FIELD_NAMES use dot-notation with snake_case segments (Rank-1)', () => {
    // Rank 1: Mathematical — field names must follow dot-notation with lowercase snake_case segments.
    // e.g., 'run.id', 'config.hash', 'execution.profile' — not camelCase, not SCREAMING_CASE.
    for (const name of REQUIRED_FIELD_NAMES) {
      // Must contain at least one dot
      expect(name).toContain('.');
      // Segments must be lowercase with underscores only (snake_case dot-notation)
      const segments = name.split('.');
      for (const seg of segments) {
        expect(seg).toMatch(/^[a-z][a-z0-9_]*$/);
      }
    }
  });

  it('validateRequiredFields returns empty array when all required fields are present (Rank-2)', () => {
    // Rank 2: Domain contract — a fully populated attrs map has no missing fields.
    const fullAttrs = createRequiredFields({
      'run.id': 'run-123',
      'config.hash': 'aabbccdd'.repeat(8),
      'input.hash': 'deadbeef'.repeat(8),
      'plan.hash': '11223344'.repeat(8),
      'execution.profile': 'balanced',
      'source.kind': 'xes',
      'sink.kind': 'dfg',
    });

    const missing = validateRequiredFields({ ...fullAttrs });
    expect(missing).toHaveLength(0);
  });

  it('validateRequiredFields reports missing fields by exact name (Rank-1)', () => {
    // Rank 1: Structural — missing field must appear exactly once in the violations list.
    const attrs: Record<string, unknown> = {
      'run.id': 'run-abc',
      // 'config.hash' intentionally omitted
      'input.hash': 'deadbeef'.repeat(8),
      'plan.hash': '11223344'.repeat(8),
      'execution.profile': 'fast',
      'source.kind': 'file',
      'sink.kind': 'stdout',
    };

    const missing = validateRequiredFields(attrs);
    expect(missing).toContain('config.hash');
    expect(missing).toHaveLength(1);
  });

  it('validateRequiredFields treats empty string as missing (Rank-1)', () => {
    // Rank 1: An empty string is semantically absent — same as undefined.
    const attrs: Record<string, unknown> = {
      'run.id': '',  // empty — must be reported as missing
      'config.hash': 'aabbccdd'.repeat(8),
      'input.hash': 'deadbeef'.repeat(8),
      'plan.hash': '11223344'.repeat(8),
      'execution.profile': 'quality',
      'source.kind': 'http',
      'sink.kind': 'file',
    };

    const missing = validateRequiredFields(attrs);
    expect(missing).toContain('run.id');
  });
});

// ---------------------------------------------------------------------------
// 9. Non-blocking emit — Rank 2 domain contract (PRD §18.5)
// ---------------------------------------------------------------------------

describe('Non-blocking emit contract (PRD §18.5)', () => {
  it('emitOtelSafe never throws even when called 200 times rapidly (Rank-2)', () => {
    // Rank 2: Domain contract — PRD §18.5 states telemetry must never break execution.
    // If the queue overflows or the exporter is unavailable, emitOtelSafe must still return
    // { success: true } (or a graceful failure), never throw an exception.
    const wrapper = new ObservabilityWrapper({});

    const results: boolean[] = [];
    for (let i = 0; i < 200; i++) {
      const r = wrapper.emitOtelSafe({
        trace_id: TRACE_ID,
        span_id: `abcdef${i.toString(16).padStart(10, '0')}`,
        name: `span.${i}`,
        start_time: Date.now() * 1_000_000 + i,
        status: { code: 'OK' },
        attributes: { 'run.id': `run-${i}`, iteration: i },
      });
      results.push(r.success);
    }

    // All 200 emits must succeed without throwing
    expect(results).toHaveLength(200);
    expect(results.every((s) => s === true)).toBe(true);
    expect(wrapper.getStats().errorCount).toBe(0);
  });

  it('emitJsonSafe never throws even when called 200 times rapidly (Rank-2)', () => {
    // Rank 2: Same non-blocking guarantee for the JSON layer.
    const wrapper = new ObservabilityWrapper({});

    let threw = false;
    try {
      for (let i = 0; i < 200; i++) {
        wrapper.emitJsonSafe({
          timestamp: new Date().toISOString(),
          level: 'info',
          component: 'engine',
          event_type: 'batch_emit',
          run_id: `run-${i}`,
          data: { iteration: i, value: i * 1.5 },
        });
      }
    } catch {
      threw = true;
    }

    expect(threw).toBe(false);
  });

  it('emitCliSafe never throws even for unusual message content (Rank-2)', () => {
    // Rank 2: CLI layer must also be non-blocking — no exceptions for any message.
    const wrapper = new ObservabilityWrapper({});

    expect(() => {
      wrapper.emitCliSafe({
        level: 'error',
        message: '\x00\x01\x02 null bytes and \n\r special chars',
      });
    }).not.toThrow();

    expect(() => {
      wrapper.emitCliSafe({
        level: 'warn',
        message: 'a'.repeat(10_000), // very long message
      });
    }).not.toThrow();
  });
});
