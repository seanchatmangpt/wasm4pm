/**
 * @wasm4pm/observability
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

// Streaming bridge: wasm4pm StreamingLog → mcpp LIVE correlation events
export * from './streaming-bridge.js';

// Observability wrapper (facade)
export * from './observability-wrapper.js';

export * from './observability.js';

// LIVE-10 relay bridge: cross-enterprise A2A relay span emitters
export * from './relay-bridge.js';

// LIVE-07 AtomVM bridge: detection and silent skip span emitters
export * from './atomvm-bridge.js';

// LIVE-15/LIVE-16 healthcare bridge: privacy compliance + MedWatch filing spans
export * from './healthcare-bridge.js';

// Algorithm feedback loop: capture quality metrics per algorithm per log size
export * from './feedback-loop.js';

// Root cause diagnosis: classify conformance failures into categories
export * from './root-cause.js';

// Conformance caching: lazy precision computation and result memoization
export * from './conformance-cache.js';

// Cache invalidation: smart parameter-aware cache invalidation
export * from './cache-invalidation.js';

// Algorithm ranking: multi-algorithm performance comparison
export * from './algorithm-ranking.js';

// Global singleton access
import { ObservabilityWrapper } from './observability-wrapper.js';
import { Tracer } from './spans.js';

let globalWrapper: ObservabilityWrapper | null = null;

/**
 * Get the global observability wrapper instance.
 */
export function getObservability(): ObservabilityWrapper {
  if (!globalWrapper) {
    globalWrapper = new ObservabilityWrapper();
  }
  return globalWrapper;
}

/**
 * Get the global tracer instance.
 */
export function getTracer(): Tracer {
  return getObservability().getTracer();
}
