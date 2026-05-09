//! Process-global OTEL span sink for the wpm CLI.
//!
//! Commands call `getGlobalSpanSink()(span)` (via `withSpan`) to deliver spans.
//! The sink defaults to a no-op so unwired tests and `--help` paths never throw.
//! `initOtel()` (in init.ts) installs the real sink at CLI bootstrap when
//! `WASM4PM_OTEL_ENABLED=true`.
//!
//! Tests inject capture sinks via `setGlobalSpanSink((span) => captured.push(span))`.

import type { OtelSpan, SpanSink } from '@wasm4pm/cognition';

let globalSink: SpanSink = (_span: OtelSpan): void => {
  /* no-op default */
};

export function setGlobalSpanSink(sink: SpanSink): void {
  globalSink = sink;
}

export function getGlobalSpanSink(): SpanSink {
  return globalSink;
}

export function resetGlobalSpanSink(): void {
  globalSink = (_span: OtelSpan): void => {
    /* no-op default */
  };
}
