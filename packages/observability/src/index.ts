/**
 * @wasm4pm/observability
 *
 * Optional, non-blocking OpenTelemetry integration.
 * - Disabled by default (zero overhead via NoopTracer)
 * - Enabled: spans exported to OTLP endpoint
 * - Exporter unavailable: logs warning, continues (unless required=true)
 */

// Core factory
export { createTracer, OtelTracer, type OtelConfig } from './otel.js';

// Span definitions & lifecycle constants
export {
  type Span,
  type Tracer,
  type SpanKind,
  type SpanStatus,
  type SpanStatusCode,
  type SpanEvent,
  LiveSpan,
  BootstrapSpans,
  PlanningSpans,
  RunningSpans,
  WatchingSpans,
} from './spans.js';

// Required fields
export {
  type RequiredFields,
  REQUIRED_FIELD_NAMES,
  validateRequiredFields,
  createRequiredFields,
} from './fields.js';

// Context propagation
export {
  type TraceContext,
  type SpanContext,
  generateTraceId,
  generateSpanId,
  parseTraceparent,
  createTraceparent,
  createRootContext,
  createChildContext,
} from './context.js';

// No-op implementation
export { NoopTracer } from './noop.js';

// Observability layer
export { ObservabilityLayer, getObservabilityLayer } from './observability.js';

// Instrumentation utilities
export { Instrumentation } from './instrumentation.js';
export type {
  EventType,
  StateChangeEvent,
  PlanGeneratedEvent,
  AlgorithmEvent,
  IOEvent,
  ProgressEvent,
  ErrorEventData,
} from './instrumentation.js';

// Observability wrapper and types
export { ObservabilityWrapper } from './observability-wrapper.js';
export type { SafeEmitResult } from './observability-wrapper.js';

export type {
  RequiredOtelAttributes,
  ObservabilityConfig,
  CliEvent,
  JsonEvent,
  OtelEvent,
  ObservabilityResult,
} from './types.js';
