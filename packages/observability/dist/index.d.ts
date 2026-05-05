/**
 * @pictl/observability
 * Unified observability, metrics, and telemetry for wasm4pm.
 */
export * from './types.js';
export * from './spans.js';
export * from './context.js';
export * from './fields.js';
export * from './otel-exporter.js';
export * from './json-writer.js';
export * from './secret-redaction.js';
export * from './instrumentation.js';
export * from './observability-wrapper.js';
export * from './observability.js';
import { ObservabilityWrapper } from './observability-wrapper.js';
import { Tracer } from './spans.js';
/**
 * Get the global observability wrapper instance.
 */
export declare function getObservability(): ObservabilityWrapper;
/**
 * Get the global tracer instance.
 */
export declare function getTracer(): Tracer;
//# sourceMappingURL=index.d.ts.map