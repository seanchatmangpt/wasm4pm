/**
 * Shared types for wasm4pm testing harnesses
 */

export interface OtelSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  startTimeUnixNano: number;
  endTimeUnixNano: number;
  kind: 0 | 1 | 2 | 3 | 4; // UNSPECIFIED | INTERNAL | SERVER | CLIENT | PRODUCER
  status: {
    code: 0 | 1 | 2; // UNSET | OK | ERROR
    message?: string;
  };
  attributes?: Record<string, unknown>;
}

export interface OtelResource {
  attributes: Record<string, unknown>;
}

export interface OtelInstrumentationScope {
  name: string;
  version?: string;
}
