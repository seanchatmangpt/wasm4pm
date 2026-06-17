/**
 * Real Jaeger OTLP collector integration test.
 *
 * Skipped unless OTEL_TESTCONTAINERS=1 is set (Jaeger auto-started by vitest globalSetup).
 * Verifies that spans emitted by OtelTracer actually reach a live Jaeger collector.
 */

import { describe, test } from 'vitest';
import { createTracer } from '../otel.js';

const SKIP = !process.env.OTEL_TESTCONTAINERS;

describe('OtelTracer — real Jaeger collector', () => {
  test.skipIf(SKIP)('emits spans to real Jaeger', async () => {
    // @ts-ignore
    const { createJaegerClient, wrapJaegerExpect } = await import('@un-test/otel');
    const endpoint = process.env.WASM4PM_OTEL_ENDPOINT ?? 'http://localhost:4318';

    const config = {
      enabled: true,
      exporter: 'otlp_http' as const,
      endpoint,
      required: true,
    };

    const tracer = createTracer(config, {
      service_name: '@wasm4pm/observability',
      status: 'ok',
    });

    // Emit first span
    const span1 = tracer.startSpan('otel.real-collector.ping');
    span1.end();

    // Emit second span
    const span2 = tracer.startSpan('otel.real-collector.verify');
    span2.end();

    // Flush all queued spans to the collector
    await (tracer as import('../otel.js').OtelTracer).flush();

    // Allow Jaeger time to ingest
    await new Promise((resolve) => setTimeout(resolve, 800));

    const jaeger = createJaegerClient();
    const traces = await jaeger.getTraces('@wasm4pm/observability', { lookbackMs: 10_000 });

    wrapJaegerExpect(traces)
      .expectSpanExists('otel.real-collector.ping')
      .expectSpanExists('otel.real-collector.verify')
      .expectAllWellFormed();
  });
});
