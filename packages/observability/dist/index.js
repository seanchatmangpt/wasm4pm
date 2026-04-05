/**
 * @wasm4pm/observability
 *
 * Optional, non-blocking OpenTelemetry integration.
 * - Disabled by default (zero overhead via NoopTracer)
 * - Enabled: spans exported to OTLP endpoint
 * - Exporter unavailable: logs warning, continues (unless required=true)
 */
// Core factory
export { createTracer, OtelTracer } from './otel.js';
// Span definitions & lifecycle constants
export { LiveSpan, BootstrapSpans, PlanningSpans, RunningSpans, WatchingSpans, } from './spans.js';
// Required fields
export { REQUIRED_FIELD_NAMES, validateRequiredFields, createRequiredFields, } from './fields.js';
// Context propagation
export { generateTraceId, generateSpanId, parseTraceparent, createTraceparent, createRootContext, createChildContext, } from './context.js';
// No-op implementation
export { NoopTracer } from './noop.js';
// Observability layer
export { ObservabilityLayer, getObservabilityLayer } from './observability.js';
// Instrumentation utilities
export { Instrumentation } from './instrumentation.js';
// Observability wrapper and types
export { ObservabilityWrapper } from './observability-wrapper.js';
