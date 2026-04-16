/**
 * @pictl/connectors
 *
 * Source adapters for reading event logs from various sources.
 * Includes built-in file, HTTP, stream, and WebSocket adapters with an extensible registry.
 */
// Adapters
export { FileSourceAdapter } from './file-source.js';
export { HttpSourceAdapter } from './http-source.js';
export { StreamSourceAdapter } from './stream-source.js';
export { WebSocketSourceAdapter } from './ws-source.js';
// Registry
export { createSourceRegistry, ExtendedSourceRegistry } from './registry.js';
export { sourceRegistry, SourceRegistry } from './registry.js';
// JSON Schemas
export { FileSourceConfigSchema, HttpSourceConfigSchema, StreamSourceConfigSchema, SourceConfigSchema, } from './schemas.js';
//# sourceMappingURL=index.js.map