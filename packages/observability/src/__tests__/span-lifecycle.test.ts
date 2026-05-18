/**
 * OTEL Span Lifecycle Tests — exhaustive oracle-ranked test suite
 *
 * Oracle ranks used throughout:
 *   Rank 1 — Mathematical: properties that hold for ANY correct implementation,
 *             derived from formal specifications (W3C Trace Context, OTEL spec).
 *   Rank 2 — Domain contract: design-decided properties that represent
 *             the system's advertised behaviour.
 *   Rank 3 — Metamorphic relation: controlled input perturbations produce
 *             predictable output relationships (no absolute values needed).
 *
 * Rules:
 *   - NO mocking of init.js or any WASM module
 *   - All expected values derived from specifications, not from the implementation
 */

import { describe, it, expect } from 'vitest';
import { Instrumentation } from '../instrumentation.js';
import type { RequiredOtelAttributes } from '../types.js';

// ---------------------------------------------------------------------------
// Shared test fixture
// ---------------------------------------------------------------------------

function makeRequiredAttrs(overrides: Partial<RequiredOtelAttributes> = {}): RequiredOtelAttributes {
  return {
    'run.id': 'run-00000000-0000-0000-0000-000000000001',
    'config.hash': 'aabbcc0011223344aabbcc0011223344aabbcc0011223344aabbcc0011223344',
    'input.hash': 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
    'plan.hash': '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    'execution.profile': 'balanced',
    'source.kind': 'xes',
    'sink.kind': 'dfg',
    ...overrides,
  };
}

const FIXED_TRACE_ID = 'aabbccddeeff00112233445566778899';
const FIXED_SPAN_ID = 'aabbccddeeff0011';

// ---------------------------------------------------------------------------
// Section 1 — W3C TraceContext format (Rank 1 — Mathematical)
//
// The W3C Trace Context Level 1 spec defines:
//   - trace-id: 32 lowercase hex characters, non-zero
//   - span-id: 16 lowercase hex characters, non-zero
//   - traceparent header: "00-<trace-id>-<parent-id>-<flags>"
//   - flags: "01" when sampled, "00" when not sampled
//
// These are purely structural invariants — they must hold regardless of
// the random source used. Violating them would break any conforming OTEL
// receiver.
// ---------------------------------------------------------------------------

describe('Rank 1 — W3C TraceContext: generateSpanId() format invariants', () => {
  it('returns a string of exactly 16 characters', () => {
    const id = Instrumentation.generateSpanId();
    expect(id).toHaveLength(16);
  });

  it('returns only lowercase hexadecimal characters [0-9a-f]', () => {
    const id = Instrumentation.generateSpanId();
    expect(id).toMatch(/^[0-9a-f]{16}$/);
  });

  it('never returns the all-zeros span ID (invalid per W3C spec)', () => {
    // Run 50 times — probability of all zeros is (1/16)^16 ≈ 2.3e-19
    const ids = Array.from({ length: 50 }, () => Instrumentation.generateSpanId());
    expect(ids.every((id) => id !== '0000000000000000')).toBe(true);
  });

  it('result is lowercase — no uppercase hex digits', () => {
    for (let i = 0; i < 20; i++) {
      const id = Instrumentation.generateSpanId();
      expect(id).toBe(id.toLowerCase());
    }
  });
});

describe('Rank 1 — W3C TraceContext: generateTraceId() format invariants', () => {
  it('returns a string of exactly 32 characters', () => {
    const id = Instrumentation.generateTraceId();
    expect(id).toHaveLength(32);
  });

  it('returns only lowercase hexadecimal characters [0-9a-f]', () => {
    const id = Instrumentation.generateTraceId();
    expect(id).toMatch(/^[0-9a-f]{32}$/);
  });

  it('never returns the all-zeros trace ID (invalid per W3C spec)', () => {
    // Run 50 times — probability of all zeros is (1/16)^32 ≈ 5.4e-39
    const ids = Array.from({ length: 50 }, () => Instrumentation.generateTraceId());
    expect(ids.every((id) => id !== '0'.repeat(32))).toBe(true);
  });

  it('result is lowercase — no uppercase hex digits', () => {
    for (let i = 0; i < 20; i++) {
      const id = Instrumentation.generateTraceId();
      expect(id).toBe(id.toLowerCase());
    }
  });
});

describe('Rank 1 — W3C TraceContext: createTraceContextHeader() format', () => {
  it('produces exactly the pattern "00-<32hex>-<16hex>-01" when sampled', () => {
    const header = Instrumentation.createTraceContextHeader(FIXED_TRACE_ID, FIXED_SPAN_ID, true);
    expect(header).toBe(`00-${FIXED_TRACE_ID}-${FIXED_SPAN_ID}-01`);
  });

  it('produces "00-<32hex>-<16hex>-00" when not sampled', () => {
    const header = Instrumentation.createTraceContextHeader(FIXED_TRACE_ID, FIXED_SPAN_ID, false);
    expect(header).toBe(`00-${FIXED_TRACE_ID}-${FIXED_SPAN_ID}-00`);
  });

  it('defaults to sampled (traceFlags=01) when third arg is omitted', () => {
    const header = Instrumentation.createTraceContextHeader(FIXED_TRACE_ID, FIXED_SPAN_ID);
    expect(header.endsWith('-01')).toBe(true);
  });

  it('header has exactly 4 dash-separated segments', () => {
    const header = Instrumentation.createTraceContextHeader(FIXED_TRACE_ID, FIXED_SPAN_ID);
    expect(header.split('-').length).toBe(4);
  });

  it('version field is always "00"', () => {
    const header = Instrumentation.createTraceContextHeader(FIXED_TRACE_ID, FIXED_SPAN_ID);
    expect(header.startsWith('00-')).toBe(true);
  });
});

describe('Rank 1 — W3C TraceContext: extractTraceContext() round-trip', () => {
  it('round-trips traceId through create → extract', () => {
    const traceId = Instrumentation.generateTraceId();
    const spanId = Instrumentation.generateSpanId();
    const header = Instrumentation.createTraceContextHeader(traceId, spanId);
    const parsed = Instrumentation.extractTraceContext(header);
    expect(parsed.traceId).toBe(traceId);
  });

  it('round-trips spanId through create → extract', () => {
    const traceId = Instrumentation.generateTraceId();
    const spanId = Instrumentation.generateSpanId();
    const header = Instrumentation.createTraceContextHeader(traceId, spanId);
    const parsed = Instrumentation.extractTraceContext(header);
    expect(parsed.spanId).toBe(spanId);
  });

  it('extractTraceContext returns traceFlags "01" for sampled header', () => {
    const header = Instrumentation.createTraceContextHeader(FIXED_TRACE_ID, FIXED_SPAN_ID, true);
    const parsed = Instrumentation.extractTraceContext(header);
    expect(parsed.traceFlags).toBe('01');
  });

  it('extractTraceContext returns traceFlags "00" for not-sampled header', () => {
    const header = Instrumentation.createTraceContextHeader(FIXED_TRACE_ID, FIXED_SPAN_ID, false);
    const parsed = Instrumentation.extractTraceContext(header);
    expect(parsed.traceFlags).toBe('00');
  });

  it('extractTraceContext returns empty object for undefined input', () => {
    const result = Instrumentation.extractTraceContext(undefined);
    expect(result).toEqual({});
  });

  it('extractTraceContext returns empty object for malformed header', () => {
    const result = Instrumentation.extractTraceContext('not-a-valid-header');
    expect(result).toEqual({});
  });

  it('extractTraceContext returns empty object when version != "00"', () => {
    const result = Instrumentation.extractTraceContext(`01-${FIXED_TRACE_ID}-${FIXED_SPAN_ID}-01`);
    expect(result).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// Section 2 — Span timing invariants (Rank 1 — Mathematical)
//
// These derive from the OTEL SDK specification:
//   - start_time MUST be expressed in nanoseconds since Unix epoch
//   - end_time MUST be >= start_time
//   - durationMs option MUST set end_time - start_time = durationMs * 1_000_000
//
// These are physical measurement invariants: time does not run backwards,
// and a declared duration must be reflected in the timestamps.
// ---------------------------------------------------------------------------

describe('Rank 1 — Timing invariants: times are in nanoseconds', () => {
  it('createAlgorithmStartedEvent start_time is greater than Date.now() * 1e6 minus 60 seconds', () => {
    const attrs = makeRequiredAttrs();
    const result = Instrumentation.createAlgorithmStartedEvent(FIXED_TRACE_ID, 'dfg', attrs);
    const oneMinuteAgoNs = (Date.now() - 60_000) * 1_000_000;
    expect(result.otelEvent.start_time).toBeGreaterThan(oneMinuteAgoNs);
  });

  it('createAlgorithmStartedEvent start_time is not in the future (within 1 second tolerance)', () => {
    const attrs = makeRequiredAttrs();
    const result = Instrumentation.createAlgorithmStartedEvent(FIXED_TRACE_ID, 'dfg', attrs);
    const oneSecondFromNowNs = (Date.now() + 1_000) * 1_000_000;
    expect(result.otelEvent.start_time).toBeLessThanOrEqual(oneSecondFromNowNs);
  });

  it('createAlgorithmCompletedEvent: end_time >= start_time', () => {
    const attrs = makeRequiredAttrs();
    const event = Instrumentation.createAlgorithmCompletedEvent(
      FIXED_TRACE_ID,
      FIXED_SPAN_ID,
      'dfg',
      attrs,
      { durationMs: 50 }
    );
    expect(event.end_time).toBeDefined();
    expect(event.end_time!).toBeGreaterThanOrEqual(event.start_time);
  });

  it('createAlgorithmCompletedEvent: durationMs=100 sets end-start within 1000 ns of 100 * 1_000_000', () => {
    // Note: Date.now() * 1_000_000 uses IEEE 754 doubles at ~1.7e18 — above 2^53 (≈9e15).
    // At that magnitude, floating-point precision is ~256 ULP. The subtraction
    // end_time - start_time is therefore approximate; tolerance of 1000 ns covers it.
    const attrs = makeRequiredAttrs();
    const event = Instrumentation.createAlgorithmCompletedEvent(
      FIXED_TRACE_ID,
      FIXED_SPAN_ID,
      'dfg',
      attrs,
      { durationMs: 100 }
    );
    expect(event.end_time).toBeDefined();
    const durationNs = event.end_time! - event.start_time;
    expect(Math.abs(durationNs - 100 * 1_000_000)).toBeLessThanOrEqual(1024);
  });

  it('createAlgorithmCompletedEvent: durationMs=0 gives end_time approximately equal to start_time', () => {
    const attrs = makeRequiredAttrs();
    const event = Instrumentation.createAlgorithmCompletedEvent(
      FIXED_TRACE_ID,
      FIXED_SPAN_ID,
      'dfg',
      attrs,
      { durationMs: 0 }
    );
    expect(event.end_time).toBeDefined();
    expect(Math.abs(event.end_time! - event.start_time)).toBeLessThanOrEqual(1024);
  });

  it('createSourceCompletedEvent: end_time >= start_time', () => {
    const attrs = makeRequiredAttrs();
    const event = Instrumentation.createSourceCompletedEvent(
      FIXED_TRACE_ID,
      FIXED_SPAN_ID,
      'file',
      attrs,
      { durationMs: 25 }
    );
    expect(event.end_time!).toBeGreaterThanOrEqual(event.start_time);
  });

  it('createSourceCompletedEvent: durationMs=250 gives gap within 1000 ns of 250 * 1_000_000', () => {
    // IEEE 754 precision caveat — see durationMs=100 test above.
    const attrs = makeRequiredAttrs();
    const event = Instrumentation.createSourceCompletedEvent(
      FIXED_TRACE_ID,
      FIXED_SPAN_ID,
      'file',
      attrs,
      { durationMs: 250 }
    );
    const gapNs = event.end_time! - event.start_time;
    expect(Math.abs(gapNs - 250 * 1_000_000)).toBeLessThanOrEqual(1024);
  });

  it('createRlPolicyUpdateEvent: end_time >= start_time', () => {
    const attrs = makeRequiredAttrs();
    const result = Instrumentation.createRlPolicyUpdateEvent(
      FIXED_TRACE_ID,
      { agentType: 'QLearning', agentId: 'q1', reward: 1.0, tdError: 0.1, qBefore: 0.5, qAfter: 0.6, durationMs: 10 },
      attrs
    );
    expect(result.otelEvent.end_time!).toBeGreaterThanOrEqual(result.otelEvent.start_time);
  });

  it('createConformanceCheckCompletedEvent: end_time >= start_time', () => {
    const attrs = makeRequiredAttrs();
    const event = Instrumentation.createConformanceCheckCompletedEvent(
      FIXED_TRACE_ID, FIXED_SPAN_ID, 'token_replay', attrs, { durationMs: 15 }
    );
    expect(event.end_time!).toBeGreaterThanOrEqual(event.start_time);
  });

  it('createDriftCheckCompletedEvent: end_time >= start_time', () => {
    const attrs = makeRequiredAttrs();
    const event = Instrumentation.createDriftCheckCompletedEvent(
      FIXED_TRACE_ID, FIXED_SPAN_ID, 'ewma', attrs, { durationMs: 5 }
    );
    expect(event.end_time!).toBeGreaterThanOrEqual(event.start_time);
  });
});

// ---------------------------------------------------------------------------
// Section 3 — Status field completeness (Rank 2 — Domain contract)
//
// Every OTEL event must have a `status` with a `code` property. This is
// the advertised contract of the Instrumentation class and a requirement of
// the OTEL spec. The code values are constrained to 'OK', 'ERROR', 'UNSET'.
// ---------------------------------------------------------------------------

describe('Rank 2 — Status field: every event carries a status.code', () => {
  const attrs = makeRequiredAttrs();

  it('createAlgorithmStartedEvent has status.code === "UNSET" (not yet complete)', () => {
    const result = Instrumentation.createAlgorithmStartedEvent(FIXED_TRACE_ID, 'dfg', attrs);
    expect(result.otelEvent.status.code).toBe('UNSET');
  });

  it('createAlgorithmCompletedEvent with no status option defaults to "OK"', () => {
    const event = Instrumentation.createAlgorithmCompletedEvent(
      FIXED_TRACE_ID,
      FIXED_SPAN_ID,
      'dfg',
      attrs
    );
    expect(event.status.code).toBe('OK');
  });

  it('createAlgorithmCompletedEvent with status="ERROR" carries code "ERROR"', () => {
    const event = Instrumentation.createAlgorithmCompletedEvent(
      FIXED_TRACE_ID,
      FIXED_SPAN_ID,
      'dfg',
      attrs,
      { status: 'ERROR', errorMessage: 'WASM panic' }
    );
    expect(event.status.code).toBe('ERROR');
  });

  it('createAlgorithmCompletedEvent error carries errorMessage in status.message', () => {
    const event = Instrumentation.createAlgorithmCompletedEvent(
      FIXED_TRACE_ID,
      FIXED_SPAN_ID,
      'dfg',
      attrs,
      { status: 'ERROR', errorMessage: 'WASM panic' }
    );
    expect(event.status.message).toBe('WASM panic');
  });

  it('createStateChangeEvent has status.code === "OK"', () => {
    const result = Instrumentation.createStateChangeEvent(FIXED_TRACE_ID, 'ready', 'running', attrs);
    expect(result.otelEvent.status.code).toBe('OK');
  });

  it('createErrorEvent carries status.code === "ERROR"', () => {
    const result = Instrumentation.createErrorEvent(FIXED_TRACE_ID, 'E500', 'Internal error', attrs);
    expect(result.otelEvent.status.code).toBe('ERROR');
  });

  it('createErrorEvent carries errorMessage in status.message', () => {
    const result = Instrumentation.createErrorEvent(FIXED_TRACE_ID, 'E500', 'Internal error', attrs);
    expect(result.otelEvent.status.message).toBe('Internal error');
  });

  it('createSourceStartedEvent has status.code === "UNSET"', () => {
    const result = Instrumentation.createSourceStartedEvent(FIXED_TRACE_ID, 'file', attrs);
    expect(result.otelEvent.status.code).toBe('UNSET');
  });

  it('createSourceCompletedEvent defaults to status.code === "OK"', () => {
    const event = Instrumentation.createSourceCompletedEvent(FIXED_TRACE_ID, FIXED_SPAN_ID, 'file', attrs);
    expect(event.status.code).toBe('OK');
  });

  it('createSinkStartedEvent has status.code === "UNSET"', () => {
    const result = Instrumentation.createSinkStartedEvent(FIXED_TRACE_ID, 'stdout', attrs);
    expect(result.otelEvent.status.code).toBe('UNSET');
  });

  it('createSinkCompletedEvent defaults to status.code === "OK"', () => {
    const event = Instrumentation.createSinkCompletedEvent(FIXED_TRACE_ID, FIXED_SPAN_ID, 'stdout', attrs);
    expect(event.status.code).toBe('OK');
  });

  it('createRlAgentDecisionEvent has status.code === "OK"', () => {
    const result = Instrumentation.createRlAgentDecisionEvent(
      FIXED_TRACE_ID,
      { agentType: 'QLearning', agentId: 'q1', actionSelected: 0, stateHealthLevel: 1, stateCircuitState: 'Closed' },
      attrs
    );
    expect(result.otelEvent.status.code).toBe('OK');
  });

  it('createDriftCheckStartedEvent has status.code === "UNSET"', () => {
    const result = Instrumentation.createDriftCheckStartedEvent(FIXED_TRACE_ID, 'ewma', attrs);
    expect(result.otelEvent.status.code).toBe('UNSET');
  });

  it('createDriftCheckCompletedEvent defaults to status.code === "OK"', () => {
    const event = Instrumentation.createDriftCheckCompletedEvent(
      FIXED_TRACE_ID, FIXED_SPAN_ID, 'ewma', attrs
    );
    expect(event.status.code).toBe('OK');
  });

  it('createConformanceCheckStartedEvent has status.code === "UNSET"', () => {
    const result = Instrumentation.createConformanceCheckStartedEvent(FIXED_TRACE_ID, 'token_replay', attrs);
    expect(result.otelEvent.status.code).toBe('UNSET');
  });

  it('createConformanceCheckCompletedEvent defaults to status.code === "OK"', () => {
    const event = Instrumentation.createConformanceCheckCompletedEvent(
      FIXED_TRACE_ID, FIXED_SPAN_ID, 'token_replay', attrs
    );
    expect(event.status.code).toBe('OK');
  });

  it('createPredictionTaskCompletedEvent with status ERROR carries code ERROR', () => {
    const event = Instrumentation.createPredictionTaskCompletedEvent(
      FIXED_TRACE_ID, FIXED_SPAN_ID, 'next_activity', attrs,
      { status: 'ERROR', errorMessage: 'model not loaded' }
    );
    expect(event.status.code).toBe('ERROR');
  });
});

// ---------------------------------------------------------------------------
// Section 4 — Parent-child span nesting (Rank 2 — Domain contract)
//
// OTEL parent-child span rules (specification-derived):
//   - A child span's parent_span_id MUST equal the parent's span_id
//   - Both parent and child MUST share the same trace_id
//   - Root spans have no parent_span_id (undefined is canonical)
// ---------------------------------------------------------------------------

describe('Rank 2 — Parent-child span nesting: parentSpanId propagation', () => {
  const attrs = makeRequiredAttrs();
  const parentSpanId = 'deadbeef01234567';

  it('createAlgorithmStartedEvent propagates parentSpanId to otelEvent.parent_span_id', () => {
    const result = Instrumentation.createAlgorithmStartedEvent(
      FIXED_TRACE_ID, 'dfg', attrs, { parentSpanId }
    );
    expect(result.otelEvent.parent_span_id).toBe(parentSpanId);
  });

  it('createAlgorithmStartedEvent propagates parentSpanId to event.parentSpanId', () => {
    const result = Instrumentation.createAlgorithmStartedEvent(
      FIXED_TRACE_ID, 'dfg', attrs, { parentSpanId }
    );
    expect(result.event.parentSpanId).toBe(parentSpanId);
  });

  it('createAlgorithmStartedEvent without parentSpanId has undefined parent_span_id (root span)', () => {
    const result = Instrumentation.createAlgorithmStartedEvent(FIXED_TRACE_ID, 'dfg', attrs);
    expect(result.otelEvent.parent_span_id).toBeUndefined();
  });

  it('createStateChangeEvent with parentSpanId propagates to otelEvent', () => {
    const result = Instrumentation.createStateChangeEvent(
      FIXED_TRACE_ID, 'ready', 'running', attrs, { parentSpanId }
    );
    expect(result.otelEvent.parent_span_id).toBe(parentSpanId);
  });

  it('createStateChangeEvent without parentSpanId has undefined parent_span_id', () => {
    const result = Instrumentation.createStateChangeEvent(FIXED_TRACE_ID, 'ready', 'running', attrs);
    expect(result.otelEvent.parent_span_id).toBeUndefined();
  });

  it('child event shares the same trace_id as parent', () => {
    const childResult = Instrumentation.createAlgorithmStartedEvent(
      FIXED_TRACE_ID, 'dfg', attrs, { parentSpanId }
    );
    expect(childResult.otelEvent.trace_id).toBe(FIXED_TRACE_ID);
  });

  it('createPredictionTaskStartedEvent propagates parentSpanId', () => {
    const result = Instrumentation.createPredictionTaskStartedEvent(
      FIXED_TRACE_ID, 'next_activity', attrs, { parentSpanId }
    );
    expect(result.otelEvent.parent_span_id).toBe(parentSpanId);
  });

  it('createDriftCheckStartedEvent propagates parentSpanId', () => {
    const result = Instrumentation.createDriftCheckStartedEvent(
      FIXED_TRACE_ID, 'ewma', attrs, { parentSpanId }
    );
    expect(result.otelEvent.parent_span_id).toBe(parentSpanId);
  });

  it('createConformanceCheckStartedEvent propagates parentSpanId', () => {
    const result = Instrumentation.createConformanceCheckStartedEvent(
      FIXED_TRACE_ID, 'token_replay', attrs, { parentSpanId }
    );
    expect(result.otelEvent.parent_span_id).toBe(parentSpanId);
  });

  it('createMlAnalysisStartedEvent propagates parentSpanId', () => {
    const result = Instrumentation.createMlAnalysisStartedEvent(
      FIXED_TRACE_ID, 'cluster', 'kmeans', attrs, { parentSpanId }
    );
    expect(result.otelEvent.parent_span_id).toBe(parentSpanId);
  });

  it('createRlAgentDecisionEvent propagates parentSpanId', () => {
    const result = Instrumentation.createRlAgentDecisionEvent(
      FIXED_TRACE_ID,
      { agentType: 'QLearning', agentId: 'q1', actionSelected: 0, stateHealthLevel: 1, stateCircuitState: 'Closed' },
      attrs,
      { parentSpanId }
    );
    expect(result.otelEvent.parent_span_id).toBe(parentSpanId);
  });

  it('createErrorEvent propagates parentSpanId', () => {
    const result = Instrumentation.createErrorEvent(
      FIXED_TRACE_ID, 'E500', 'fail', attrs, { parentSpanId }
    );
    expect(result.otelEvent.parent_span_id).toBe(parentSpanId);
  });

  it('createErrorEvent without parentSpanId has undefined parent_span_id', () => {
    const result = Instrumentation.createErrorEvent(FIXED_TRACE_ID, 'E500', 'fail', attrs);
    expect(result.otelEvent.parent_span_id).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Section 5 — Span ID uniqueness (Rank 3 — Metamorphic)
//
// Metamorphic property: repeated calls to the generator must not produce
// collisions at practical scale. The probability of collision with a uniform
// 64-bit random source across 100 draws is ~2.7e-16 — negligible. Any
// collision observed in 100 draws is evidence of a broken random source.
// ---------------------------------------------------------------------------

describe('Rank 3 — Metamorphic: span/trace ID uniqueness across N calls', () => {
  it('100 calls to generateSpanId() produce 100 unique values', () => {
    const ids = new Set(Array.from({ length: 100 }, () => Instrumentation.generateSpanId()));
    expect(ids.size).toBe(100);
  });

  it('100 calls to generateTraceId() produce 100 unique values', () => {
    const ids = new Set(Array.from({ length: 100 }, () => Instrumentation.generateTraceId()));
    expect(ids.size).toBe(100);
  });

  it('generateSpanId() and generateTraceId() do not return the same string', () => {
    // The lengths differ (16 vs 32), so they cannot match — this tests the format contract.
    const spanId = Instrumentation.generateSpanId();
    const traceId = Instrumentation.generateTraceId();
    expect(spanId).not.toBe(traceId);
  });

  it('consecutive span IDs in createAlgorithmStartedEvent calls are distinct', () => {
    const attrs = makeRequiredAttrs();
    const r1 = Instrumentation.createAlgorithmStartedEvent(FIXED_TRACE_ID, 'dfg', attrs);
    const r2 = Instrumentation.createAlgorithmStartedEvent(FIXED_TRACE_ID, 'dfg', attrs);
    expect(r1.otelEvent.span_id).not.toBe(r2.otelEvent.span_id);
  });
});

// ---------------------------------------------------------------------------
// Section 6 — Required OTEL attributes (Rank 2 — Domain contract)
//
// Per PRD §18.2-3, every span MUST include `service.name` and all
// RequiredOtelAttributes. Failure to include them breaks OTEL receivers
// that rely on these fields for routing, filtering, and alerting.
// ---------------------------------------------------------------------------

describe('Rank 2 — Required attributes: service.name on every event', () => {
  const attrs = makeRequiredAttrs();

  it('createAlgorithmStartedEvent includes service.name === "wasm4pm"', () => {
    const result = Instrumentation.createAlgorithmStartedEvent(FIXED_TRACE_ID, 'dfg', attrs);
    expect(result.otelEvent.attributes['service.name']).toBe('wasm4pm');
  });

  it('createAlgorithmCompletedEvent includes service.name === "wasm4pm"', () => {
    const event = Instrumentation.createAlgorithmCompletedEvent(
      FIXED_TRACE_ID, FIXED_SPAN_ID, 'dfg', attrs
    );
    expect(event.attributes['service.name']).toBe('wasm4pm');
  });

  it('createStateChangeEvent includes service.name === "wasm4pm"', () => {
    const result = Instrumentation.createStateChangeEvent(FIXED_TRACE_ID, 'ready', 'running', attrs);
    expect(result.otelEvent.attributes['service.name']).toBe('wasm4pm');
  });

  it('createErrorEvent includes service.name === "wasm4pm"', () => {
    const result = Instrumentation.createErrorEvent(FIXED_TRACE_ID, 'E500', 'fail', attrs);
    expect(result.otelEvent.attributes['service.name']).toBe('wasm4pm');
  });

  it('createAlgorithmStartedEvent carries run.id in attributes', () => {
    const result = Instrumentation.createAlgorithmStartedEvent(FIXED_TRACE_ID, 'dfg', attrs);
    expect(result.otelEvent.attributes['run.id']).toBe(attrs['run.id']);
  });

  it('createAlgorithmStartedEvent carries algorithm.name in attributes', () => {
    const result = Instrumentation.createAlgorithmStartedEvent(FIXED_TRACE_ID, 'inductive_miner', attrs);
    expect(result.otelEvent.attributes['algorithm.name']).toBe('inductive_miner');
  });

  it('createAlgorithmStartedEvent trace_id matches the supplied traceId', () => {
    const result = Instrumentation.createAlgorithmStartedEvent(FIXED_TRACE_ID, 'dfg', attrs);
    expect(result.otelEvent.trace_id).toBe(FIXED_TRACE_ID);
  });
});

// ---------------------------------------------------------------------------
// Section 7 — Span name format (Rank 2 — Domain contract)
//
// Span names follow the documented "phase.operation" convention. Using wrong
// names breaks dashboard queries, alerting rules, and sampler configs.
// ---------------------------------------------------------------------------

describe('Rank 2 — Span names follow documented naming convention', () => {
  const attrs = makeRequiredAttrs();

  it('createAlgorithmStartedEvent span name is "algorithm.<algorithmName>"', () => {
    const result = Instrumentation.createAlgorithmStartedEvent(FIXED_TRACE_ID, 'dfg', attrs);
    expect(result.otelEvent.name).toBe('algorithm.dfg');
  });

  it('createStateChangeEvent span name is "engine.state_change"', () => {
    const result = Instrumentation.createStateChangeEvent(FIXED_TRACE_ID, 'ready', 'running', attrs);
    expect(result.otelEvent.name).toBe('engine.state_change');
  });

  it('createPlanGeneratedEvent span name is "engine.plan_generated"', () => {
    const result = Instrumentation.createPlanGeneratedEvent(
      FIXED_TRACE_ID, 'plan-1', 'abc123', 3, attrs
    );
    expect(result.otelEvent.name).toBe('engine.plan_generated');
  });

  it('createSourceStartedEvent span name is "source.<kind>"', () => {
    const result = Instrumentation.createSourceStartedEvent(FIXED_TRACE_ID, 'xes', attrs);
    expect(result.otelEvent.name).toBe('source.xes');
  });

  it('createSinkStartedEvent span name is "sink.<kind>"', () => {
    const result = Instrumentation.createSinkStartedEvent(FIXED_TRACE_ID, 'stdout', attrs);
    expect(result.otelEvent.name).toBe('sink.stdout');
  });

  it('createPredictionTaskStartedEvent normalises hyphens to underscores in span name', () => {
    const result = Instrumentation.createPredictionTaskStartedEvent(
      FIXED_TRACE_ID, 'next-activity', attrs
    );
    expect(result.otelEvent.name).toBe('prediction.next_activity');
  });

  it('createDriftCheckStartedEvent span name is "drift.check"', () => {
    const result = Instrumentation.createDriftCheckStartedEvent(FIXED_TRACE_ID, 'ewma', attrs);
    expect(result.otelEvent.name).toBe('drift.check');
  });

  it('createConformanceCheckStartedEvent span name is "conformance.check"', () => {
    const result = Instrumentation.createConformanceCheckStartedEvent(
      FIXED_TRACE_ID, 'token_replay', attrs
    );
    expect(result.otelEvent.name).toBe('conformance.check');
  });

  it('createRlAgentDecisionEvent span name is "rl.agent.decision"', () => {
    const result = Instrumentation.createRlAgentDecisionEvent(
      FIXED_TRACE_ID,
      { agentType: 'SARSA', agentId: 's1', actionSelected: 1, stateHealthLevel: 0, stateCircuitState: 'Closed' },
      attrs
    );
    expect(result.otelEvent.name).toBe('rl.agent.decision');
  });

  it('createRlPolicyUpdateEvent span name is "rl.policy.update"', () => {
    const result = Instrumentation.createRlPolicyUpdateEvent(
      FIXED_TRACE_ID,
      { agentType: 'QLearning', agentId: 'q1', reward: 0.5, tdError: 0.01, qBefore: 0.4, qAfter: 0.41 },
      attrs
    );
    expect(result.otelEvent.name).toBe('rl.policy.update');
  });

  it('createRlAgentSwitchEvent span name is "rl.agent.switch"', () => {
    const result = Instrumentation.createRlAgentSwitchEvent(
      FIXED_TRACE_ID, 'QLearning', 'SARSA', attrs
    );
    expect(result.otelEvent.name).toBe('rl.agent.switch');
  });

  it('createMlAnalysisStartedEvent span name is "ml.<task>"', () => {
    const result = Instrumentation.createMlAnalysisStartedEvent(
      FIXED_TRACE_ID, 'cluster', 'kmeans', attrs
    );
    expect(result.otelEvent.name).toBe('ml.cluster');
  });

  it('createErrorEvent span name follows "error.<code>" pattern', () => {
    const result = Instrumentation.createErrorEvent(FIXED_TRACE_ID, 'E_WASM_FAIL', 'fail', attrs);
    expect(result.otelEvent.name).toBe('error.E_WASM_FAIL');
  });

  it('createPredictionTaskCompletedEvent normalises hyphens in span name', () => {
    const event = Instrumentation.createPredictionTaskCompletedEvent(
      FIXED_TRACE_ID, FIXED_SPAN_ID, 'remaining-time', attrs
    );
    expect(event.name).toBe('prediction.remaining_time');
  });

  it('createDriftCheckCompletedEvent span name is "drift.check"', () => {
    const event = Instrumentation.createDriftCheckCompletedEvent(
      FIXED_TRACE_ID, FIXED_SPAN_ID, 'ewma', attrs
    );
    expect(event.name).toBe('drift.check');
  });

  it('createConformanceCheckCompletedEvent span name is "conformance.check"', () => {
    const event = Instrumentation.createConformanceCheckCompletedEvent(
      FIXED_TRACE_ID, FIXED_SPAN_ID, 'alignments', attrs
    );
    expect(event.name).toBe('conformance.check');
  });
});
