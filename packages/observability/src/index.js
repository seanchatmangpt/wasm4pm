/**
 * @pictl/observability
 *
 * Optional, non-blocking OpenTelemetry integration.
 * - Disabled by default (zero overhead via NoopTracer)
 * - Enabled: spans exported to OTLP endpoint
 * - Exporter unavailable: logs warning, continues (unless required=true)
 */
// Core factory (exported for external use)
export { createTracer, OtelTracer } from './otel.js';
// Observability layer
export { ObservabilityLayer, getObservabilityLayer } from './observability.js';
// Instrumentation utilities
export { Instrumentation } from './instrumentation.js';
// Observability wrapper
export { ObservabilityWrapper } from './observability-wrapper.js';
// Internal-only exports (not re-exported)
// - Span, Tracer, SpanKind, etc. (used only internally)
// - RequiredFields, TraceContext, etc. (used only internally)
// - EventType, StateChangeEvent, etc. (used only internally)
// - NoopTracer (used only internally)
//# sourceMappingURL=index.js.map