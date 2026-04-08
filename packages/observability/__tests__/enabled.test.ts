/**
 * Tests: spans are captured and exported when OTEL is enabled.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createTracer, OtelTracer } from '../src/otel.js';
import { createRequiredFields } from '../src/fields.js';
import {
  BootstrapSpans,
  PlanningSpans,
  RunningSpans,
  WatchingSpans,
} from '../src/spans.js';
import { createRootContext, createChildContext } from '../src/context.js';

describe('OTEL enabled (spans captured)', () => {
  const fields = createRequiredFields({
    'run.id': 'run-42',
    'config.hash': 'cfghash',
    'input.hash': 'inhash',
    'plan.hash': 'plhash',
    'execution.profile': 'balanced',
    'source.kind': 'csv',
    'sink.kind': 'petri_net',
  });

  const otelConfig = {
    enabled: true,
    exporter: 'otlp_http' as const,
    endpoint: 'http://localhost:4318',
    required: false,
    batch_size: 50,
    timeout_ms: 60_000, // long interval so auto-flush doesn't fire during tests
  };

  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, statusText: 'OK' });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns OtelTracer when enabled', () => {
    const tracer = createTracer(otelConfig, fields);
    expect(tracer).toBeInstanceOf(OtelTracer);
    // Cleanup
    (tracer as OtelTracer).shutdown();
  });

  it('captures bootstrap spans', async () => {
    const tracer = createTracer(otelConfig, fields);

    const span = tracer.startSpan(BootstrapSpans.configLoad());
    span.addEvent('file_read', { path: 'pictl.toml' });
    span.end();

    const span2 = tracer.startSpan(BootstrapSpans.configValidation());
    span2.setStatus('OK');
    span2.end();

    await tracer.flush();
    await tracer.shutdown();

    expect(fetchMock).toHaveBeenCalled();
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const spans = body.resourceSpans[0].scopeSpans[0].spans;
    expect(spans.length).toBe(2);
    expect(spans[0].name).toBe('bootstrap.config_load');
    expect(spans[1].name).toBe('bootstrap.config_validation');
  });

  it('captures planning spans', async () => {
    const tracer = createTracer(otelConfig, fields);

    const s1 = tracer.startSpan(PlanningSpans.configResolution());
    s1.end();
    const s2 = tracer.startSpan(PlanningSpans.planGeneration());
    s2.end();

    await tracer.flush();
    await tracer.shutdown();

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const names = body.resourceSpans[0].scopeSpans[0].spans.map(
      (s: { name: string }) => s.name
    );
    expect(names).toContain('planning.config_resolution');
    expect(names).toContain('planning.plan_generation');
  });

  it('captures running spans with algorithm name', async () => {
    const tracer = createTracer(otelConfig, fields);

    const run = tracer.startSpan(RunningSpans.runStart());
    const src = tracer.startSpan(RunningSpans.sourceRead());
    src.end();
    const alg = tracer.startSpan(RunningSpans.algorithmExec('alpha_plus'));
    alg.setAttribute('algorithm.iterations', 42);
    alg.end();
    const sink = tracer.startSpan(RunningSpans.sinkWrite());
    sink.end();
    run.end();
    tracer.startSpan(RunningSpans.runEnd()).end();

    await tracer.flush();
    await tracer.shutdown();

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const names = body.resourceSpans[0].scopeSpans[0].spans.map(
      (s: { name: string }) => s.name
    );
    expect(names).toContain('running.run_start');
    expect(names).toContain('running.source_read');
    expect(names).toContain('running.algorithm.alpha_plus');
    expect(names).toContain('running.sink_write');
    expect(names).toContain('running.run_end');
  });

  it('captures watching spans', async () => {
    const tracer = createTracer(otelConfig, fields);

    tracer.startSpan(WatchingSpans.heartbeat()).end();
    tracer.startSpan(WatchingSpans.reconnect()).end();
    tracer.startSpan(WatchingSpans.checkpointSave()).end();
    tracer.startSpan(WatchingSpans.checkpointLoad()).end();

    await tracer.flush();
    await tracer.shutdown();

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const names = body.resourceSpans[0].scopeSpans[0].spans.map(
      (s: { name: string }) => s.name
    );
    expect(names).toContain('watching.heartbeat');
    expect(names).toContain('watching.reconnect');
    expect(names).toContain('watching.checkpoint_save');
    expect(names).toContain('watching.checkpoint_load');
  });

  it('records span status and events', async () => {
    const tracer = createTracer(otelConfig, fields);

    const span = tracer.startSpan('test.operation');
    span.addEvent('step_1', { detail: 'started' });
    span.setStatus('ERROR', 'something broke');
    span.end();

    await tracer.flush();
    await tracer.shutdown();

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const exported = body.resourceSpans[0].scopeSpans[0].spans[0];
    expect(exported.status.code).toBe('ERROR');
    expect(exported.status.message).toBe('something broke');
    expect(exported.events).toHaveLength(1);
    expect(exported.events[0].name).toBe('step_1');
  });

  it('supports parent-child span relationships via context', async () => {
    const tracer = createTracer(otelConfig, fields);
    const root = createRootContext(fields);

    const parent = tracer.startSpan('parent', { parent: root });
    // Pass the parent span directly as context so child's parentSpanId = parent.spanId
    const child = tracer.startSpan('child', {
      parent: { traceId: parent.traceId, spanId: parent.spanId, requiredFields: fields },
    });
    child.end();
    parent.end();

    await tracer.flush();
    await tracer.shutdown();

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const spans = body.resourceSpans[0].scopeSpans[0].spans;
    const childSpan = spans.find((s: { name: string }) => s.name === 'child');
    expect(childSpan.parentSpanId).toBe(parent.spanId);
    // Child and parent share the same traceId
    expect(childSpan.traceId).toBe(parent.traceId);
  });

  it('batches spans and sends to endpoint', async () => {
    const smallBatch = { ...otelConfig, batch_size: 3 };
    const tracer = createTracer(smallBatch, fields);

    // Emit 3 spans to trigger batch
    tracer.startSpan('a').end();
    tracer.startSpan('b').end();
    tracer.startSpan('c').end();

    // Give the non-blocking flush a tick
    await new Promise((r) => setTimeout(r, 50));
    await tracer.shutdown();

    expect(fetchMock).toHaveBeenCalled();
    const url = fetchMock.mock.calls[0][0];
    expect(url).toBe('http://localhost:4318/v1/traces');
  });
});
