/**
 * Tests: required fields are present on all exported spans.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { createTracer } from '../src/otel.js';
import {
  createRequiredFields,
  validateRequiredFields,
  REQUIRED_FIELD_NAMES,
} from '../src/fields.js';
import { BootstrapSpans, RunningSpans, WatchingSpans } from '../src/spans.js';

describe('Required fields', () => {
  const fullFields = createRequiredFields({
    'run.id': 'run-777',
    'config.hash': 'blake3-cfg',
    'input.hash': 'blake3-inp',
    'plan.hash': 'blake3-plan',
    'execution.profile': 'quality',
    'source.kind': 'parquet',
    'sink.kind': 'dfg',
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ---- validateRequiredFields ----

  it('validates all fields present', () => {
    const missing = validateRequiredFields(fullFields);
    expect(missing).toEqual([]);
  });

  it('reports missing fields', () => {
    const missing = validateRequiredFields({
      'run.id': 'ok',
      // everything else missing
    });
    expect(missing).toContain('config.hash');
    expect(missing).toContain('input.hash');
    expect(missing).toContain('plan.hash');
    expect(missing).toContain('execution.profile');
    expect(missing).toContain('source.kind');
    expect(missing).toContain('sink.kind');
    expect(missing).not.toContain('run.id');
  });

  it('reports empty-string fields as missing', () => {
    const fields = createRequiredFields({ 'run.id': '' });
    const missing = validateRequiredFields(fields);
    expect(missing).toContain('run.id');
  });

  it('createRequiredFields fills defaults for unset values', () => {
    const fields = createRequiredFields({});
    for (const name of REQUIRED_FIELD_NAMES) {
      expect(fields[name]).toBeDefined();
      expect(fields[name]).not.toBe('');
    }
  });

  // ---- Fields on exported spans ----

  it('all required fields appear on every exported span', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, statusText: 'OK' });
    vi.stubGlobal('fetch', fetchMock);

    const tracer = createTracer(
      {
        enabled: true,
        exporter: 'otlp_http',
        endpoint: 'http://localhost:4318',
        required: false,
        batch_size: 100,
        timeout_ms: 60_000,
      },
      fullFields
    );

    // Emit spans from different phases
    tracer.startSpan(BootstrapSpans.configLoad()).end();
    tracer.startSpan(RunningSpans.algorithmExec('heuristic')).end();
    tracer.startSpan(WatchingSpans.heartbeat()).end();

    await tracer.flush();
    await tracer.shutdown();

    expect(fetchMock).toHaveBeenCalled();
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const spans = body.resourceSpans[0].scopeSpans[0].spans;

    expect(spans.length).toBe(3);

    for (const span of spans) {
      const attrMap = new Map(
        span.attributes.map((a: { key: string; value: unknown }) => [a.key, a.value])
      );

      for (const fieldName of REQUIRED_FIELD_NAMES) {
        expect(attrMap.has(fieldName)).toBe(true);
        // Value should match what we set
        const val = attrMap.get(fieldName);
        expect(val).toBeDefined();
      }
    }
  });

  it('required fields values match the configured values', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, statusText: 'OK' });
    vi.stubGlobal('fetch', fetchMock);

    const tracer = createTracer(
      {
        enabled: true,
        exporter: 'otlp_http',
        endpoint: 'http://localhost:4318',
        required: false,
        batch_size: 100,
        timeout_ms: 60_000,
      },
      fullFields
    );

    tracer.startSpan('test.field_values').end();
    await tracer.flush();
    await tracer.shutdown();

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const span = body.resourceSpans[0].scopeSpans[0].spans[0];
    const attrMap = new Map(
      span.attributes.map((a: { key: string; value: Record<string, unknown> }) => [
        a.key,
        a.value.stringValue,
      ])
    );

    expect(attrMap.get('run.id')).toBe('run-777');
    expect(attrMap.get('config.hash')).toBe('blake3-cfg');
    expect(attrMap.get('input.hash')).toBe('blake3-inp');
    expect(attrMap.get('plan.hash')).toBe('blake3-plan');
    expect(attrMap.get('execution.profile')).toBe('quality');
    expect(attrMap.get('source.kind')).toBe('parquet');
    expect(attrMap.get('sink.kind')).toBe('dfg');
  });

  it('custom attributes are merged alongside required fields', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, statusText: 'OK' });
    vi.stubGlobal('fetch', fetchMock);

    const tracer = createTracer(
      {
        enabled: true,
        exporter: 'otlp_http',
        endpoint: 'http://localhost:4318',
        required: false,
        batch_size: 100,
        timeout_ms: 60_000,
      },
      fullFields
    );

    tracer.startSpan('test.custom', {
      attributes: { 'custom.key': 'custom_value', 'custom.count': 42 },
    }).end();

    await tracer.flush();
    await tracer.shutdown();

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const span = body.resourceSpans[0].scopeSpans[0].spans[0];
    const attrMap = new Map(
      span.attributes.map((a: { key: string; value: Record<string, unknown> }) => [a.key, a.value])
    );

    // Required fields still present
    expect(attrMap.has('run.id')).toBe(true);
    // Custom fields also present
    expect(attrMap.get('custom.key')).toEqual({ stringValue: 'custom_value' });
    expect(attrMap.get('custom.count')).toEqual({ intValue: '42' });
  });
});
