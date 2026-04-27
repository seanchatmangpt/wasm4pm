/**
 * @pictl/observability
 * Unified observability, metrics, and telemetry for wasm4pm.
 */
// Core types and interfaces
export * from './types.js';
// OTEL Spans and Tracers
export * from './spans.js';
// Context management
export * from './context.js';
// Required fields for all spans
export * from './fields.js';
// OTEL exporter
export * from './otel-exporter.js';
// JSON logger/writer
export * from './json-writer.js';
// Secret redaction
export * from './secret-redaction.js';
// Instrumentation helpers
export * from './instrumentation.js';
// Observability wrapper (facade)
export * from './observability-wrapper.js';
export * from './observability.js';
// Global singleton access
import { ObservabilityWrapper } from './observability-wrapper.js';
let globalWrapper = null;
/**
 * Get the global observability wrapper instance.
 */
export function getObservability() {
    if (!globalWrapper) {
        globalWrapper = new ObservabilityWrapper();
    }
    return globalWrapper;
}
/**
 * Get the global tracer instance.
 */
export function getTracer() {
    return getObservability().getTracer();
}
