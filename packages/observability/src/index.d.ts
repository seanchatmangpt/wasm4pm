/**
 * @wasm4pm/observability
 *
 * Optional, non-blocking OpenTelemetry integration.
 * - Disabled by default (zero overhead via NoopTracer)
 * - Enabled: spans exported to OTLP endpoint
 * - Exporter unavailable: logs warning, continues (unless required=true)
 */
export { createTracer, OtelTracer, type OtelConfig } from './otel.js';
export { ObservabilityLayer, getObservabilityLayer } from './observability.js';
export { Instrumentation } from './instrumentation.js';
export { ObservabilityWrapper } from './observability-wrapper.js';
export type { RequiredOtelAttributes, ObservabilityConfig } from './types.js';
//# sourceMappingURL=index.d.ts.map
