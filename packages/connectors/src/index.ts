/**
 * @wasm4pm/connectors
 *
 * Source adapters for reading event logs from various sources.
 * Includes built-in file, HTTP, and stream adapters with an extensible registry.
 */

// Adapters
export { FileSourceAdapter } from './file-source.js';
export type { FileSourceConfig } from './file-source.js';

export { HttpSourceAdapter } from './http-source.js';
export type { HttpSourceConfig } from './http-source.js';

export { StreamSourceAdapter } from './stream-source.js';
export type { StreamSourceConfig } from './stream-source.js';

// Registry
export { createSourceRegistry, ExtendedSourceRegistry } from './registry.js';
export { sourceRegistry, SourceRegistry } from './registry.js';
export type { SourceAdapter, Capabilities, EventStream, RetryStrategy } from './registry.js';

// JSON Schemas
export {
  FileSourceConfigSchema,
  HttpSourceConfigSchema,
  StreamSourceConfigSchema,
  SourceConfigSchema,
} from './schemas.js';
