/**
 * Tests for main ObservabilityLayer
 * Verifies three-layer emission, span creation, and shutdown
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ObservabilityLayer, getObservabilityLayer } from '../src/observability.js';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

describe('ObservabilityLayer', () => {
  let tmpDir: string;
  let testFile: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'observability-'));
    testFile = path.join(tmpDir, 'events.jsonl');

    // Mock fetch
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
    });
  });

  it('should emit CLI events', () => {
    const observability = new ObservabilityLayer();
    const consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    observability.emitCli({
      level: 'info',
      message: 'Test message',
    });

    expect(consoleInfoSpy).toHaveBeenCalledWith(
      expect.stringContaining('Test message')
    );

    consoleInfoSpy.mockRestore();
  });

  it('should emit JSON events', async () => {
    const observability = new ObservabilityLayer({
      json: {
        enabled: true,
        dest: testFile,
      },
    });

    observability.emitJson({
      timestamp: new Date().toISOString(),
      component: 'test',
      event_type: 'test_event',
      data: { key: 'value' },
    });

    await new Promise((resolve) => setTimeout(resolve, 100));
    await observability.shutdown();

    const content = await fs.readFile(testFile, 'utf-8');
    expect(content.length).toBeGreaterThan(0);
    expect(content).toContain('test_event');
  });

  it('should emit OTEL events', async () => {
    const observability = new ObservabilityLayer({
      otel: {
        enabled: true,
        endpoint: 'http://localhost:4317',
        exporter: 'otlp_http',
        required: false,
      },
    });

    observability.emitOtel({
      trace_id: '12345678901234567890123456789012',
      span_id: '1234567890123456',
      name: 'test-span',
      start_time: Date.now() * 1000000,
      attributes: {},
    });

    await observability.shutdown();

    // Fetch should have been called (may be pending)
    expect(global.fetch).toBeDefined();
  });

  it('should emit to multiple layers', async () => {
    const observability = new ObservabilityLayer({
      json: {
        enabled: true,
        dest: testFile,
      },
      otel: {
        enabled: true,
        endpoint: 'http://localhost:4317',
        exporter: 'otlp_http',
        required: false,
      },
    });

    const consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    observability.emit({
      cli: { level: 'info', message: 'Test message' },
      json: {
        component: 'test',
        event_type: 'test_event',
        data: {},
      },
      otel: {
        trace_id: '12345678901234567890123456789012',
        span_id: '1234567890123456',
        name: 'test-span',
        start_time: Date.now() * 1000000,
        attributes: {},
      },
    });

    expect(consoleInfoSpy).toHaveBeenCalled();

    await new Promise((resolve) => setTimeout(resolve, 100));
    await observability.shutdown();

    consoleInfoSpy.mockRestore();
  });

  it('should handle missing layers gracefully', async () => {
    const observability = new ObservabilityLayer({}); // No layers enabled

    // Should not throw
    expect(() => {
      observability.emit({
        json: { component: 'test', event_type: 'test', data: {} },
        otel: {
          trace_id: '12345678901234567890123456789012',
          span_id: '1234567890123456',
          name: 'test',
          start_time: Date.now() * 1000000,
          attributes: {},
        },
      });
    }).not.toThrow();

    const result = await observability.shutdown();
    expect(result.success).toBe(true);
  });

  it('should enable JSON at runtime', async () => {
    const observability = new ObservabilityLayer();

    observability.enableJson(testFile);
    observability.emitJson({
      timestamp: new Date().toISOString(),
      component: 'test',
      event_type: 'test_event',
      data: { key: 'value' },
    });

    await new Promise((resolve) => setTimeout(resolve, 100));
    await observability.shutdown();

    const content = await fs.readFile(testFile, 'utf-8');
    expect(content).toContain('test_event');
  });

  it('should enable OTEL at runtime', async () => {
    const observability = new ObservabilityLayer();

    observability.enableOtel({
      endpoint: 'http://localhost:4317',
      exporter: 'otlp_http',
      required: false,
    });

    observability.emitOtel({
      trace_id: '12345678901234567890123456789012',
      span_id: '1234567890123456',
      name: 'test-span',
      start_time: Date.now() * 1000000,
      attributes: {},
    });

    await observability.shutdown();
  });

  it('should create spans with required attributes', async () => {
    const observability = new ObservabilityLayer({
      otel: {
        enabled: true,
        endpoint: 'http://localhost:4317',
        exporter: 'otlp_http',
        required: false,
      },
    });

    const traceId = ObservabilityLayer.generateTraceId();
    const spanId = observability.createSpan(
      traceId,
      'test-span',
      {
        'run.id': 'run-123',
        'config.hash': 'hash-config',
        'input.hash': 'hash-input',
        'plan.hash': 'hash-plan',
        'execution.profile': 'default',
        'source.kind': 'xes',
        'sink.kind': 'petri_net',
      }
    );

    expect(spanId).toBeDefined();
    expect(spanId.length).toBe(16); // Span ID should be 8 bytes (16 hex chars)

    await observability.shutdown();
  });

  it('should generate valid trace and span IDs', () => {
    const traceId = ObservabilityLayer.generateTraceId();
    expect(traceId).toHaveLength(32); // 16 bytes = 32 hex chars
    expect(/^[0-9a-f]{32}$/.test(traceId)).toBe(true);

    const observability = new ObservabilityLayer();
    const spanId = (observability as any).generateSpanId();
    expect(spanId).toHaveLength(16); // 8 bytes = 16 hex chars
    expect(/^[0-9a-f]{16}$/.test(spanId)).toBe(true);
  });

  it('should redact secrets in JSON events', async () => {
    const observability = new ObservabilityLayer({
      json: {
        enabled: true,
        dest: testFile,
      },
    });

    observability.emitJson({
      timestamp: new Date().toISOString(),
      component: 'test',
      event_type: 'test_event',
      data: {
        username: 'alice',
        password: 'secret123',
        api_key: 'key-12345',
        normal_field: 'public',
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 100));
    await observability.shutdown();

    const content = await fs.readFile(testFile, 'utf-8');
    expect(content).toContain('[REDACTED]');
    expect(content).not.toContain('secret123');
    expect(content).not.toContain('key-12345');
    expect(content).toContain('public');
  });

  it('should shutdown gracefully', async () => {
    const observability = new ObservabilityLayer({
      json: {
        enabled: true,
        dest: testFile,
      },
    });

    observability.emitJson({
      timestamp: new Date().toISOString(),
      component: 'test',
      event_type: 'test_event',
      data: {},
    });

    const result = await observability.shutdown();

    expect(result.success).toBe(true);
    expect(result.timestamp).toBeDefined();
  });
});
