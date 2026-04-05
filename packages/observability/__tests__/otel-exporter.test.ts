/**
 * Tests for OTEL exporter
 * Verifies queue management, batching, timeout handling, and non-blocking behavior
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OtelExporter } from '../src/otel-exporter.js';
import { OtelEvent } from '../src/types.js';

describe('OtelExporter', () => {
  let fetchSpy: any;

  beforeEach(() => {
    // Mock fetch
    fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
    });
    global.fetch = fetchSpy;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should not throw when disabled', async () => {
    const exporter = new OtelExporter({
      enabled: false,
      endpoint: 'http://localhost:4317',
      exporter: 'otlp_http',
      required: false,
    });

    expect(() => {
      exporter.emit({
        trace_id: '12345678901234567890123456789012',
        span_id: '1234567890123456',
        name: 'test-span',
        start_time: Date.now() * 1000000,
        attributes: {},
      });
    }).not.toThrow();

    await exporter.shutdown();
  });

  it('should queue OTEL events', async () => {
    const exporter = new OtelExporter({
      enabled: true,
      endpoint: 'http://localhost:4317',
      exporter: 'otlp_http',
      required: false,
    });

    const event: OtelEvent = {
      trace_id: '12345678901234567890123456789012',
      span_id: '1234567890123456',
      name: 'test-span',
      start_time: Date.now() * 1000000,
      attributes: { component: 'test' },
    };

    // Should not throw
    expect(() => {
      exporter.emit(event);
    }).not.toThrow();

    await exporter.shutdown();
  });

  it('should not block on emit', async () => {
    const exporter = new OtelExporter({
      enabled: true,
      endpoint: 'http://localhost:4317',
      exporter: 'otlp_http',
      required: false,
      timeout_ms: 5000,
    });

    const startTime = Date.now();

    const event: OtelEvent = {
      trace_id: '12345678901234567890123456789012',
      span_id: '1234567890123456',
      name: 'test-span',
      start_time: Date.now() * 1000000,
      attributes: {},
    };

    exporter.emit(event);

    const endTime = Date.now();
    const duration = endTime - startTime;

    // Emit should complete in < 10ms (definitely non-blocking)
    expect(duration).toBeLessThan(10);

    await exporter.shutdown();
  });

  it('should drop oldest events when queue is full', async () => {
    const exporter = new OtelExporter({
      enabled: true,
      endpoint: 'http://localhost:4317',
      exporter: 'otlp_http',
      required: false,
      max_queue_size: 3,
    });

    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Emit 5 events (queue size is 3)
    for (let i = 0; i < 5; i++) {
      exporter.emit({
        trace_id: '12345678901234567890123456789012',
        span_id: `123456789012345${i}`,
        name: `span-${i}`,
        start_time: Date.now() * 1000000,
        attributes: { index: i },
      });
    }

    // Should have warned about dropping events
    expect(consoleWarnSpy).toHaveBeenCalled();

    await exporter.shutdown();
    consoleWarnSpy.mockRestore();
  });

  it('should not fail execution on export error (required=false)', async () => {
    fetchSpy.mockRejectedValue(new Error('Network error'));

    const exporter = new OtelExporter({
      enabled: true,
      endpoint: 'http://localhost:4317',
      exporter: 'otlp_http',
      required: false,
      timeout_ms: 100,
    });

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    exporter.emit({
      trace_id: '12345678901234567890123456789012',
      span_id: '1234567890123456',
      name: 'test-span',
      start_time: Date.now() * 1000000,
      attributes: {},
    });

    // Trigger flush
    await (exporter as any).flush();

    // Should log error but not throw
    expect(consoleErrorSpy).toHaveBeenCalled();

    const result = await exporter.shutdown();
    expect(result).toBeDefined();

    consoleErrorSpy.mockRestore();
  });

  it('should export with required attributes', async () => {
    const exporter = new OtelExporter({
      enabled: true,
      endpoint: 'http://localhost:4317',
      exporter: 'otlp_http',
      required: false,
    });

    const event: OtelEvent = {
      trace_id: '12345678901234567890123456789012',
      span_id: '1234567890123456',
      name: 'test-span',
      start_time: Date.now() * 1000000,
      attributes: {
        'run.id': 'run-123',
        'config.hash': 'hash-config',
        'input.hash': 'hash-input',
        'plan.hash': 'hash-plan',
        'execution.profile': 'default',
        'source.kind': 'xes',
        'sink.kind': 'petri_net',
      },
    };

    exporter.emit(event);
    await (exporter as any).flush();
    await exporter.shutdown();

    // Verify fetch was called
    expect(fetchSpy).toHaveBeenCalled();
  });

  it('should auto-flush on interval', async () => {
    const exporter = new OtelExporter({
      enabled: true,
      endpoint: 'http://localhost:4317',
      exporter: 'otlp_http',
      required: false,
      timeout_ms: 100,
    });

    exporter.emit({
      trace_id: '12345678901234567890123456789012',
      span_id: '1234567890123456',
      name: 'test-span',
      start_time: Date.now() * 1000000,
      attributes: {},
    });

    // Wait for auto-flush
    await new Promise((resolve) => setTimeout(resolve, 150));

    // At least one fetch should have been made
    expect(fetchSpy).toHaveBeenCalled();

    await exporter.shutdown();
  });

  it('should handle timeout on export', async () => {
    // Create a fetch that never resolves
    fetchSpy.mockImplementation(
      () => new Promise(() => {}) // Never resolves
    );

    const exporter = new OtelExporter({
      enabled: true,
      endpoint: 'http://localhost:4317',
      exporter: 'otlp_http',
      required: false,
      timeout_ms: 100,
    });

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    exporter.emit({
      trace_id: '12345678901234567890123456789012',
      span_id: '1234567890123456',
      name: 'test-span',
      start_time: Date.now() * 1000000,
      attributes: {},
    });

    // Trigger flush (should timeout)
    await (exporter as any).flush();

    // Should log error but not throw
    expect(consoleErrorSpy).toHaveBeenCalled();

    const result = await exporter.shutdown();
    expect(result).toBeDefined();

    consoleErrorSpy.mockRestore();
  });
});
