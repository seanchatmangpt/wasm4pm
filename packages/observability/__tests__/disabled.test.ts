/**
 * Tests: zero overhead when OTEL is disabled.
 * Verifies that the NoopTracer does no work, no allocations, no I/O.
 */

import { describe, it, expect, vi } from 'vitest';
import { createTracer } from '../src/otel.js';
import { NoopTracer } from '../src/noop.js';
import { createRequiredFields } from '../src/fields.js';
import { BootstrapSpans, RunningSpans } from '../src/spans.js';

describe('OTEL disabled (zero overhead)', () => {
  const fields = createRequiredFields({
    'run.id': 'run-1',
    'config.hash': 'c1',
    'input.hash': 'i1',
    'plan.hash': 'p1',
    'execution.profile': 'fast',
    'source.kind': 'xes',
    'sink.kind': 'json',
  });

  it('returns NoopTracer when config is undefined', () => {
    const tracer = createTracer(undefined, fields);
    expect(tracer).toBeInstanceOf(NoopTracer);
  });

  it('returns NoopTracer when enabled=false', () => {
    const tracer = createTracer(
      { enabled: false, exporter: 'otlp_http', endpoint: '', required: false },
      fields
    );
    expect(tracer).toBeInstanceOf(NoopTracer);
  });

  it('startSpan returns immediately with frozen noop span', () => {
    const tracer = new NoopTracer();
    const span = tracer.startSpan(BootstrapSpans.configLoad());

    expect(span.traceId).toBe('');
    expect(span.spanId).toBe('');
    expect(span.name).toBe('');
    expect(span.startTimeNs).toBe(0);

    // Calling methods is a no-op (no throw)
    span.end();
    span.addEvent('foo');
    span.setStatus('ERROR', 'test');
    span.setAttribute('key', 'val');
  });

  it('same noop span instance is reused (no allocations)', () => {
    const tracer = new NoopTracer();
    const a = tracer.startSpan('a');
    const b = tracer.startSpan('b');
    expect(a).toBe(b); // same frozen object
  });

  it('flush and shutdown are instant no-ops', async () => {
    const tracer = new NoopTracer();
    await tracer.flush();
    await tracer.shutdown();
  });

  it('does not call fetch or console when disabled', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response());
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const tracer = createTracer(undefined, fields);
    const span = tracer.startSpan(RunningSpans.runStart());
    span.end();

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('zero overhead under repeated calls', () => {
    const tracer = new NoopTracer();
    const start = performance.now();
    for (let i = 0; i < 10_000; i++) {
      const span = tracer.startSpan('test');
      span.setAttribute('i', i);
      span.end();
    }
    const elapsed = performance.now() - start;
    // 10k iterations should complete in under 50ms on any modern machine
    expect(elapsed).toBeLessThan(50);
  });
});
