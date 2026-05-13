//! OTEL bootstrap for the wpm CLI.
//!
//! When `WASM4PM_OTEL_ENABLED=true`, wires the process-global span sink to a
//! real `OtelExporter` from `@wasm4pm/observability` (non-blocking queue,
//! drop-oldest, OTLP HTTP). When disabled or unavailable, installs a noop sink.
//!
//! The exporter is intentionally instantiated even when the endpoint is
//! unreachable: drops are warned-and-continued, never thrown, per
//! observability §18.5 ("Telemetry must never break execution").

import type { OtelSpan, SpanSink } from '@wasm4pm/cognition';
import { setGlobalSpanSink, resetGlobalSpanSink } from './sink.js';
import { setOtelHandle } from './exit.js';

export interface OtelHandle {
  sink: SpanSink;
  shutdown: () => Promise<void>;
}

const NOOP_HANDLE: OtelHandle = {
  sink: (_span: OtelSpan): void => {
    /* noop */
  },
  shutdown: async (): Promise<void> => {
    /* noop */
  },
};

/** Translate a cognition `OtelSpan` to the observability `OtelEvent` shape. */
function spanToEvent(span: OtelSpan): {
  trace_id: string;
  span_id: string;
  name: string;
  kind: 'INTERNAL' | 'SERVER' | 'CLIENT' | 'PRODUCER' | 'CONSUMER';
  start_time: number;
  end_time: number;
  status: { code: 'UNSET' | 'OK' | 'ERROR'; message?: string };
  attributes: Record<string, string | number | boolean>;
} {
  return {
    trace_id: span.trace_id,
    span_id: span.span_id,
    name: span.name,
    kind: span.kind,
    start_time: span.start_time,
    end_time: span.end_time,
    status: span.status,
    attributes: span.attributes,
  };
}

export async function initOtel(): Promise<OtelHandle> {
  const enabled = process.env.WASM4PM_OTEL_ENABLED === 'true';
  if (!enabled) {
    setGlobalSpanSink(NOOP_HANDLE.sink);
    setOtelHandle(NOOP_HANDLE);
    return NOOP_HANDLE;
  }

  // Lazy-load the exporter so `--help` and noop paths never pay the cost.
  let exporter: { emit: (e: ReturnType<typeof spanToEvent>) => void; shutdown: () => Promise<unknown> } | undefined;
  try {
    const obs = await import('@wasm4pm/observability');
    const OtelExporter = (obs as { OtelExporter?: new (cfg: unknown) => typeof exporter }).OtelExporter as
      | (new (cfg: unknown) => NonNullable<typeof exporter>)
      | undefined;
    if (!OtelExporter) {
      process.stderr.write(
        '[wpm/otel] WASM4PM_OTEL_ENABLED=true but @wasm4pm/observability has no OtelExporter; falling back to noop sink\n',
      );
      setGlobalSpanSink(NOOP_HANDLE.sink);
      setOtelHandle(NOOP_HANDLE);
      return NOOP_HANDLE;
    }
    const endpoint = process.env.WASM4PM_OTEL_ENDPOINT ?? 'http://localhost:4318';
    exporter = new OtelExporter({
      enabled: true,
      exporter: 'otlp_http',
      endpoint,
      required: false,
      timeout_ms: 5000,
      max_queue_size: 1000,
      batch_size: 100,
    });
  } catch (e) {
    process.stderr.write(
      `[wpm/otel] WASM4PM_OTEL_ENABLED=true but exporter init failed (${e instanceof Error ? e.message : String(e)}); falling back to noop sink\n`,
    );
    setGlobalSpanSink(NOOP_HANDLE.sink);
    setOtelHandle(NOOP_HANDLE);
    return NOOP_HANDLE;
  }

  const sink: SpanSink = (span: OtelSpan): void => {
    try {
      exporter!.emit(spanToEvent(span));
    } catch {
      /* never block on OTEL */
    }
  };
  setGlobalSpanSink(sink);

  const handle: OtelHandle = {
    sink,
    shutdown: async (): Promise<void> => {
      try {
        await exporter!.shutdown();
      } catch {
        /* swallow on shutdown */
      } finally {
        resetGlobalSpanSink();
      }
    },
  };
  setOtelHandle(handle);
  return handle;
}
