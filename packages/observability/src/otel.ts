/**
 * OTEL setup — creates a real or no-op tracer based on config.
 * When disabled the no-op tracer is returned so callers pay zero overhead.
 * When enabled but the exporter is unavailable, warnings are logged and
 * execution continues unless `required` is true.
 */

import { NoopTracer } from './noop.js';
import { LiveSpan, type Span, type Tracer, type SpanKind } from './spans.js';
import { RequiredFields } from './fields.js';
import { SpanContext, generateSpanId } from './context.js';

// ---- Configuration ----

export interface OtelConfig {
  /** Master switch. Default: false. */
  enabled: boolean;
  /** OTLP exporter transport. */
  exporter: 'otlp_http' | 'otlp_grpc';
  /** Collector endpoint URL. */
  endpoint: string;
  /** If true, export failures throw instead of warning. Default: false. */
  required: boolean;
  /** HTTP timeout in ms. Default: 5000. */
  timeout_ms?: number;
  /** Max queued spans before dropping oldest. Default: 1000. */
  max_queue_size?: number;
  /** Spans per export batch. Default: 100. */
  batch_size?: number;
}

// ---- OtelTracer (real implementation) ----

export class OtelTracer implements Tracer {
  private readonly config: OtelConfig;
  private readonly requiredFields: RequiredFields;
  private queue: LiveSpan[] = [];
  private flushTimer?: ReturnType<typeof setInterval>;
  private flushChain: Promise<void> = Promise.resolve();
  private shuttingDown = false;

  constructor(config: OtelConfig, requiredFields: RequiredFields) {
    this.config = config;
    this.requiredFields = requiredFields;
    this.startAutoFlush();
  }

  startSpan(
    name: string,
    options?: {
      kind?: SpanKind;
      parent?: SpanContext;
      attributes?: Record<string, unknown>;
    }
  ): Span {
    const ctx: SpanContext = options?.parent
      ? { traceId: options.parent.traceId, spanId: generateSpanId(), parentSpanId: options.parent.spanId, requiredFields: this.requiredFields }
      : { traceId: '', spanId: generateSpanId(), requiredFields: this.requiredFields };

    // If no parent, the span IS the root — needs its own traceId
    if (!options?.parent) {
      (ctx as { traceId: string }).traceId = generateSpanId() + generateSpanId(); // 32 hex
    }

    return new LiveSpan(
      ctx,
      name,
      options?.kind ?? 'INTERNAL',
      this.requiredFields,
      options?.attributes ?? {},
      (span) => this.enqueue(span)
    );
  }

  private enqueue(span: LiveSpan): void {
    const max = this.config.max_queue_size ?? 1000;
    if (this.queue.length >= max) {
      this.queue.shift();
      console.warn(`[observability] OTEL queue full (${max}), dropping oldest span`);
    }
    this.queue.push(span);

    const batch = this.config.batch_size ?? 100;
    if (this.queue.length >= batch && !this.shuttingDown) {
      this.flush().catch((e) =>
        console.error(`[observability] OTEL export error: ${e}`)
      );
    }
  }

  private startAutoFlush(): void {
    const interval = this.config.timeout_ms ?? 5000;
    this.flushTimer = setInterval(() => {
      this.flush().catch((e) =>
        console.error(`[observability] OTEL flush error: ${e}`)
      );
    }, interval);
    if (this.flushTimer.unref) this.flushTimer.unref();
  }

  async flush(): Promise<void> {
    if (this.queue.length === 0) return;
    this.flushChain = this.flushChain.then(() => this.doFlush());
    return this.flushChain;
  }

  private async doFlush(): Promise<void> {
    const batch = this.queue.splice(0, this.config.batch_size ?? 100);
    if (batch.length === 0) return;

    const payload = {
      resourceSpans: [
        {
          resource: { attributes: [] },
          scopeSpans: [
            {
              scope: { name: '@wasm4pm/observability', version: '26.4.5' },
              spans: batch.map((s) => ({
                traceId: s.traceId,
                spanId: s.spanId,
                parentSpanId: s.parentSpanId,
                name: s.name,
                kind: s.kind,
                startTimeUnixNano: String(s.startTimeNs),
                endTimeUnixNano: String(s.endTimeNs ?? Date.now() * 1_000_000),
                status: s.status ?? { code: 'UNSET' },
                attributes: encodeAttributes(s.attributes),
                events: s.events?.map((ev) => ({
                  timeUnixNano: String(ev.timestampNs),
                  name: ev.name,
                  attributes: encodeAttributes(ev.attributes ?? {}),
                })),
              })),
            },
          ],
        },
      ],
    };

    try {
      await this.sendPayload(payload);
    } catch (err) {
      if (this.config.required) {
        throw err; // Propagate when required=true
      }
      console.warn(`[observability] OTEL export failed (non-blocking): ${err}`);
    }
  }

  private async sendPayload(payload: unknown): Promise<void> {
    const url = this.config.endpoint.replace(/\/$/, '') + '/v1/traces';
    const timeout = this.config.timeout_ms ?? 5000;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new Error(`OTEL export HTTP ${res.status}: ${res.statusText}`);
      }
    } finally {
      clearTimeout(timer);
    }
  }

  async shutdown(): Promise<void> {
    this.shuttingDown = true;
    if (this.flushTimer) clearInterval(this.flushTimer);
    while (this.queue.length > 0) {
      await this.doFlush();
    }
  }
}

// ---- Factory ----

/**
 * Create a Tracer based on config.
 * - Config missing or disabled -> NoopTracer (zero overhead)
 * - Enabled -> OtelTracer
 */
export function createTracer(
  config: OtelConfig | undefined,
  requiredFields: RequiredFields
): Tracer {
  if (!config || !config.enabled) {
    return new NoopTracer();
  }
  return new OtelTracer(config, requiredFields);
}

// ---- Helpers ----

function encodeAttributes(
  attrs: Record<string, unknown>
): Array<{ key: string; value: Record<string, unknown> }> {
  return Object.entries(attrs).map(([key, value]) => ({
    key,
    value: encodeValue(value),
  }));
}

function encodeValue(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { boolValue: value };
  if (typeof value === 'number') {
    return Number.isInteger(value)
      ? { intValue: String(value) }
      : { doubleValue: value };
  }
  return { stringValue: JSON.stringify(value) };
}
