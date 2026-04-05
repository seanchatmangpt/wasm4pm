/**
 * Tests: non-blocking behaviour when the OTEL exporter is unavailable.
 * - required=false: warns and continues
 * - required=true: throws on flush
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createTracer, OtelTracer } from '../src/otel.js';
import { createRequiredFields } from '../src/fields.js';

describe('OTEL failure handling', () => {
  const fields = createRequiredFields({
    'run.id': 'run-fail',
    'config.hash': 'c',
    'input.hash': 'i',
    'plan.hash': 'p',
    'execution.profile': 'fast',
    'source.kind': 'xes',
    'sink.kind': 'json',
  });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logs warning and continues when required=false and fetch fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('ECONNREFUSED'))
    );
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const tracer = createTracer(
      {
        enabled: true,
        exporter: 'otlp_http',
        endpoint: 'http://localhost:9999',
        required: false,
        batch_size: 1,
        timeout_ms: 60_000,
      },
      fields
    );

    tracer.startSpan('test.nonblocking').end();

    // Give the non-blocking flush a tick
    await new Promise((r) => setTimeout(r, 100));
    await tracer.shutdown();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('OTEL export failed (non-blocking)')
    );

    warnSpy.mockRestore();
  });

  it('logs warning and continues when fetch returns non-OK status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 503, statusText: 'Service Unavailable' })
    );
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const tracer = createTracer(
      {
        enabled: true,
        exporter: 'otlp_http',
        endpoint: 'http://localhost:9999',
        required: false,
        batch_size: 1,
        timeout_ms: 60_000,
      },
      fields
    );

    tracer.startSpan('test.http503').end();
    await new Promise((r) => setTimeout(r, 100));
    await tracer.shutdown();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('OTEL export failed (non-blocking)')
    );
    warnSpy.mockRestore();
  });

  it('does NOT block execution when exporter is unavailable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(
        () => new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 500))
      )
    );
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const tracer = createTracer(
      {
        enabled: true,
        exporter: 'otlp_http',
        endpoint: 'http://localhost:9999',
        required: false,
        batch_size: 1,
        timeout_ms: 60_000,
      },
      fields
    );

    const start = performance.now();
    tracer.startSpan('test.nonblocking').end();
    const elapsed = performance.now() - start;

    // The span creation + end should return in <10ms even though fetch takes 500ms
    expect(elapsed).toBeLessThan(50);

    await tracer.shutdown();
  });

  it('throws on flush when required=true and fetch fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('ECONNREFUSED'))
    );

    const tracer = createTracer(
      {
        enabled: true,
        exporter: 'otlp_http',
        endpoint: 'http://localhost:9999',
        required: true,
        batch_size: 100,
        timeout_ms: 60_000,
      },
      fields
    ) as OtelTracer;

    tracer.startSpan('test.required').end();

    // When required=true, flush propagates the error
    await expect(tracer.flush()).rejects.toThrow('ECONNREFUSED');
    await tracer.shutdown();
  });

  it('drops oldest span when queue overflows', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200, statusText: 'OK' })
    );
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const tracer = createTracer(
      {
        enabled: true,
        exporter: 'otlp_http',
        endpoint: 'http://localhost:4318',
        required: false,
        max_queue_size: 3,
        batch_size: 100, // high so auto-flush by batch doesn't trigger
        timeout_ms: 60_000,
      },
      fields
    );

    // Queue 4 spans — 4th should drop the 1st
    tracer.startSpan('span-1').end();
    tracer.startSpan('span-2').end();
    tracer.startSpan('span-3').end();
    tracer.startSpan('span-4').end();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('queue full')
    );

    await tracer.shutdown();
    warnSpy.mockRestore();
  });
});
