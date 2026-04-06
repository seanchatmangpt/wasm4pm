/**
 * Scenario: OTEL tracing — span capture and attribute validation
 *
 * Dev action simulated: "I added a new span to engine.bootstrap(). Does it
 * carry all required attributes? Does it fit correctly in the trace tree?
 * Is it fast enough to be non-blocking?"
 *
 * Strategy: call Instrumentation.create*Event() directly (same methods the
 * engine calls) and feed the result to OtelCapture. No real collector needed.
 *
 * Note: assertRequiredAttributes/assertValidTraces/assertNonBlocking return
 * string[] (violation messages), NOT void/throw.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { OtelCapture, createOtelCapture } from '@wasm4pm/testing';
import {
  Instrumentation,
  REQUIRED_FIELD_NAMES,
  createRequiredFields,
} from '@wasm4pm/observability';
import type { RequiredOtelAttributes } from '@wasm4pm/observability';

// Build RequiredOtelAttributes from known-safe fake values
// (no resolveConfig() needed — avoids filesystem dependency in this scenario)
function makeRequiredAttrs(runId = 'playground-run-001'): RequiredOtelAttributes {
  return {
    'run.id': runId,
    'config.hash': 'a'.repeat(64),
    'input.hash': 'b'.repeat(64),
    'plan.hash': 'c'.repeat(64),
    'execution.profile': 'fast',
    'source.kind': 'file',
    'sink.kind': 'stdout',
  };
}

// ── Capture and find spans ────────────────────────────────────────────────────

describe('otel tracing: capture bootstrap spans', () => {
  let capture: OtelCapture;
  const traceId = Instrumentation.generateTraceId();
  const requiredAttrs = makeRequiredAttrs();

  beforeEach(() => {
    capture = createOtelCapture();
  });

  it('generates a valid traceId (32 hex chars)', () => {
    expect(traceId).toMatch(/^[0-9a-f]{32}$/);
  });

  it('generates valid spanIds (16 hex chars)', () => {
    const spanId = Instrumentation.generateSpanId();
    expect(spanId).toMatch(/^[0-9a-f]{16}$/);
  });

  it('captureRaw captures a state_change span', () => {
    const { otelEvent } = Instrumentation.createStateChangeEvent(
      traceId, 'uninitialized', 'bootstrapping', requiredAttrs,
    );
    capture.captureRaw(otelEvent);
    expect(capture.stats().spanCount).toBe(1);

    const found = capture.findSpans(/state_change/);
    expect(found).toHaveLength(1);
    expect(found[0]!.attributes['state.from']).toBe('uninitialized');
    expect(found[0]!.attributes['state.to']).toBe('bootstrapping');
    console.info('[otel] captured span:', found[0]!.name, found[0]!.attributes);
  });

  it('captures a full bootstrap sequence (2 state changes)', () => {
    const { otelEvent: e1 } = Instrumentation.createStateChangeEvent(
      traceId, 'uninitialized', 'bootstrapping', requiredAttrs,
    );
    const { otelEvent: e2 } = Instrumentation.createStateChangeEvent(
      traceId, 'bootstrapping', 'ready', requiredAttrs,
    );
    capture.captureRaw(e1);
    capture.captureRaw(e2);

    expect(capture.stats().spanCount).toBe(2);
    expect(capture.findSpans(/state_change/)).toHaveLength(2);
    console.info('[otel] bootstrap sequence spans:', capture.stats());
  });

  it('findSpansByAttribute finds spans by required field value', () => {
    const { otelEvent } = Instrumentation.createStateChangeEvent(
      traceId, 'ready', 'planning', requiredAttrs,
    );
    capture.captureRaw(otelEvent);

    const found = capture.findSpansByAttribute('execution.profile', 'fast');
    expect(found.length).toBeGreaterThan(0);
    console.info('[otel] found by execution.profile=fast:', found.length, 'span(s)');
  });

  it('shows how to verify a new custom attribute', () => {
    const { otelEvent } = Instrumentation.createStateChangeEvent(
      traceId, 'bootstrapping', 'ready', requiredAttrs,
    );
    // Developer workflow: I added 'bootstrap.wasm_version' to my span
    otelEvent.attributes['bootstrap.wasm_version'] = '26.4.6';
    capture.captureRaw(otelEvent);

    const spansWithVersion = capture.findSpansByAttribute('bootstrap.wasm_version', '26.4.6');
    expect(spansWithVersion).toHaveLength(1);
    console.info('[otel] custom attribute verified on span:', spansWithVersion[0]!.name);
  });
});

// ── Required attributes ───────────────────────────────────────────────────────

describe('otel tracing: required attributes', () => {
  let capture: OtelCapture;
  const traceId = Instrumentation.generateTraceId();
  const requiredAttrs = makeRequiredAttrs('playground-run-002');

  beforeEach(() => {
    capture = createOtelCapture();
  });

  it('all REQUIRED_FIELD_NAMES present on well-formed spans', () => {
    const { otelEvent } = Instrumentation.createStateChangeEvent(
      traceId, 'uninitialized', 'bootstrapping', requiredAttrs,
    );
    capture.captureRaw(otelEvent);

    const errors = capture.assertRequiredAttributes([...REQUIRED_FIELD_NAMES]);
    expect(errors, `Attribute violations:\n${errors.join('\n')}`).toHaveLength(0);
    console.info('[otel] required attributes OK:', REQUIRED_FIELD_NAMES.join(', '));
  });

  it('assertRequiredAttributes catches a span missing run.id', () => {
    const brokenAttrs = { ...requiredAttrs };
    delete (brokenAttrs as Record<string, unknown>)['run.id'];

    const { otelEvent } = Instrumentation.createStateChangeEvent(
      traceId, 'uninitialized', 'bootstrapping', brokenAttrs as RequiredOtelAttributes,
    );
    capture.captureRaw(otelEvent);

    const errors = capture.assertRequiredAttributes([...REQUIRED_FIELD_NAMES]);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some(e => e.includes('run.id'))).toBe(true);
    console.info('[otel] expected violations:', errors);
    console.info('[otel] → This is what you see when a required attribute is missing from a span');
  });

  it('createRequiredFields validates the required fields shape', () => {
    const fields = createRequiredFields({
      'run.id': 'test-run',
      'config.hash': 'a'.repeat(64),
      'input.hash': 'b'.repeat(64),
      'plan.hash': 'c'.repeat(64),
      'execution.profile': 'balanced',
      'source.kind': 'file',
      'sink.kind': 'stdout',
    });
    expect(fields).toHaveProperty('run.id', 'test-run');
    expect(fields).toHaveProperty('execution.profile', 'balanced');
  });
});

// ── Trace tree integrity and timing ──────────────────────────────────────────

describe('otel tracing: trace tree and non-blocking timing', () => {
  it('spans form a valid parent-child tree', () => {
    const capture = createOtelCapture();
    const traceId = Instrumentation.generateTraceId();
    const rootSpanId = Instrumentation.generateSpanId();
    const nowNs = Date.now() * 1_000_000;
    const attrs = makeRequiredAttrs('playground-run-003');

    // Root span (no parentSpanId)
    capture.captureSpan({
      traceId, spanId: rootSpanId,
      name: 'bootstrap.root', kind: 'INTERNAL',
      startTime: nowNs, endTime: nowNs + 10_000_000,
      attributes: { ...attrs }, events: [],
    });

    // Child referencing root
    const childSpanId = Instrumentation.generateSpanId();
    capture.captureSpan({
      traceId, spanId: childSpanId, parentSpanId: rootSpanId,
      name: 'bootstrap.config_load', kind: 'INTERNAL',
      startTime: nowNs + 1_000_000, endTime: nowNs + 5_000_000,
      attributes: { ...attrs }, events: [],
    });

    const errors = capture.assertValidTraces();
    expect(errors, `Tree violations:\n${errors.join('\n')}`).toHaveLength(0);
    console.info('[otel] valid trace tree:', capture.stats());
  });

  it('assertValidTraces detects orphan spans', () => {
    const capture = createOtelCapture();
    const nowNs = Date.now() * 1_000_000;
    const attrs = makeRequiredAttrs();

    capture.captureSpan({
      traceId: Instrumentation.generateTraceId(),
      spanId: Instrumentation.generateSpanId(),
      parentSpanId: 'deadbeefdeadbeef', // unknown parent
      name: 'orphan.span', kind: 'INTERNAL',
      startTime: nowNs, endTime: nowNs + 2_000_000,
      attributes: { ...attrs }, events: [],
    });

    const errors = capture.assertValidTraces();
    expect(errors.length).toBeGreaterThan(0);
    console.info('[otel] expected orphan error:', errors[0]);
    console.info('[otel] → Fix: add the parent span to the capture before the child');
  });

  it('assertNonBlocking passes for fast spans (<1000ms)', () => {
    const capture = createOtelCapture();
    const traceId = Instrumentation.generateTraceId();
    const nowNs = Date.now() * 1_000_000;
    const attrs = makeRequiredAttrs();

    // 2ms span — well within limit
    const { otelEvent } = Instrumentation.createStateChangeEvent(traceId, 'uninitialized', 'bootstrapping', attrs);
    otelEvent.end_time = otelEvent.start_time + 2_000_000; // 2ms in ns
    capture.captureRaw(otelEvent);

    const errors = capture.assertNonBlocking(1000);
    expect(errors, `Timing violations:\n${errors.join('\n')}`).toHaveLength(0);
  });

  it('assertNonBlocking catches a span exceeding 1000ms', () => {
    const capture = createOtelCapture();
    const nowNs = Date.now() * 1_000_000;
    const attrs = makeRequiredAttrs();

    capture.captureSpan({
      traceId: Instrumentation.generateTraceId(),
      spanId: Instrumentation.generateSpanId(),
      name: 'slow.operation', kind: 'INTERNAL',
      startTime: nowNs,
      endTime: nowNs + 1_500_000_000, // 1500ms in ns
      attributes: { ...attrs }, events: [],
    });

    const errors = capture.assertNonBlocking(1000);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toMatch(/slow\.operation/);
    console.info('[otel] expected slow-span error:', errors[0]);
    console.info('[otel] → Fix: move the slow work off the span path or increase the limit');
  });
});
