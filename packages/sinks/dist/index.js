/**
 * @wasm4pm/sinks
 *
 * Output sinks for writing models, reports, and receipts.
 * Includes built-in file, stdout, and HTTP sinks with an extensible registry.
 */
// Adapters
export { FileLogSinkAdapter } from './file-log-sink.js';
export { StdoutSinkAdapter } from './stdout-sink.js';
export { HttpSinkAdapter } from './http-sink.js';
export { isReceiptArtifact, isModelArtifact, isReportArtifact } from './artifacts.js';
// Registry
export { createSinkRegistry, ExtendedSinkRegistry } from './registry.js';
export { sinkRegistry, SinkRegistry } from './registry.js';
// JSON Schemas
export { FileLogSinkConfigSchema, StdoutSinkConfigSchema, HttpSinkConfigSchema, SinkConfigSchema, } from './schemas.js';
//# sourceMappingURL=index.js.map