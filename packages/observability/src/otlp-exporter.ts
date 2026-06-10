/**
 * OTLP span exporter for production observability.
 * Activated when WASM4PM_OTEL_ENABLED=1 and WASM4PM_OTEL_ENDPOINT is set.
 * Uses native fetch (Node 18+) — no additional dependencies required.
 */

import type { Span } from './spans.js';

export interface OtlpExporterConfig {
  endpoint: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  batchSize?: number;
  flushIntervalMs?: number;
}

function spansToOtlpPayload(spans: Span[]): unknown {
  return {
    resourceSpans: [{
      resource: {
        attributes: [
          { key: 'service.name', value: { stringValue: 'wasm4pm' } },
        ]
      },
      scopeSpans: [{
        scope: { name: 'wasm4pm', version: '1.0.0' },
        spans: spans.map(span => ({
          traceId: span.traceId,
          spanId: span.spanId,
          name: span.name,
          kind: 1,
          startTimeUnixNano: String(span.startTimeNs),
          endTimeUnixNano: String(span.endTimeNs ?? Date.now() * 1_000_000),
          status: {
            code: span.status?.code === 'ERROR' ? 2 : 1,
            message: span.status?.message ?? '',
          },
          attributes: Object.entries(span.attributes ?? {}).map(([key, value]) => ({
            key,
            value: typeof value === 'number'
              ? { doubleValue: value }
              : typeof value === 'boolean'
              ? { boolValue: value }
              : { stringValue: String(value ?? '') },
          })),
        })),
      }],
    }],
  };
}

export function createOtlpExporter(config: OtlpExporterConfig) {
  const {
    endpoint,
    headers = {},
    timeoutMs = 5000,
    batchSize = 512,
    flushIntervalMs = 5000,
  } = config;

  const traceEndpoint = endpoint.replace(/\/$/, '') + '/v1/traces';
  let buffer: Span[] = [];
  let flushTimer: ReturnType<typeof setInterval> | null = null;
  let shutdownSignal = false;

  async function sendBatch(batch: Span[]): Promise<void> {
    if (batch.length === 0) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      await fetch(traceEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(spansToOtlpPayload(batch)),
        signal: controller.signal,
      });
    } catch {
      // Never block the application on telemetry errors
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    export(spans: Span[]): Promise<void> {
      if (shutdownSignal) return Promise.resolve();
      buffer.push(...spans);
      if (flushTimer === null) {
        flushTimer = setInterval(async () => {
          if (buffer.length > 0) {
            const batch = buffer.splice(0, batchSize);
            await sendBatch(batch);
          }
        }, flushIntervalMs);
        const t = flushTimer as unknown as NodeJS.Timeout;
        if (t && typeof t === 'object' && 'unref' in t) (t as NodeJS.Timeout).unref();
      }
      if (buffer.length >= batchSize) {
        return sendBatch(buffer.splice(0, batchSize));
      }
      return Promise.resolve();
    },

    async flush(): Promise<void> {
      if (flushTimer !== null) { clearInterval(flushTimer); flushTimer = null; }
      while (buffer.length > 0) await sendBatch(buffer.splice(0, batchSize));
    },

    async shutdown(): Promise<void> {
      shutdownSignal = true;
      await this.flush();
    },
  };
}

export function createOtlpExporterFromEnv() {
  if (process.env.WASM4PM_OTEL_ENABLED !== '1') return null;
  const endpoint = process.env.WASM4PM_OTEL_ENDPOINT;
  if (!endpoint) return null;
  const headers: Record<string, string> = {};
  if (process.env.WASM4PM_OTEL_HEADER_AUTHORIZATION) {
    headers['Authorization'] = process.env.WASM4PM_OTEL_HEADER_AUTHORIZATION;
  }
  return createOtlpExporter({ endpoint, headers });
}
