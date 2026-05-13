//! OTEL span typings for the cognition facade.
//!
//! Mirrors the minimal subset of the OTLP span shape used by callers and tests.
//! No emit logic — only data definitions.

export type SpanStatusCode = 'OK' | 'ERROR' | 'UNSET';
export type SpanKind = 'INTERNAL' | 'CLIENT' | 'SERVER' | 'PRODUCER' | 'CONSUMER';

export interface SpanStatus {
  code: SpanStatusCode;
  message?: string;
}

export interface OtelSpan {
  trace_id: string;
  span_id: string;
  name: string;
  kind: SpanKind;
  start_time: number;
  end_time: number;
  status: SpanStatus;
  attributes: Record<string, string | number | boolean>;
}

export type SpanSink = (span: OtelSpan) => void;
