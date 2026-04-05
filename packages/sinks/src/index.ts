/**
 * @wasm4pm/sinks
 *
 * Output sinks for writing models, reports, and receipts.
 * Includes built-in file sink and registry for extensibility.
 */

export { FileLogSinkAdapter } from './file-log-sink.js';
export type { FileLogSinkConfig, Receipt } from './file-log-sink.js';

export { createSinkRegistry, ExtendedSinkRegistry } from './registry.js';
export { sinkRegistry, SinkRegistry } from './registry.js';
export type { SinkAdapter, ArtifactType, AtomicityLevel, ExistsBehavior, FailureMode } from './registry.js';
