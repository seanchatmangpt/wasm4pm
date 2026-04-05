/**
 * @wasm4pm/connectors
 *
 * Source adapters for reading event logs from various sources.
 * Includes built-in file adapter and registry for extensibility.
 */

export { FileSourceAdapter } from './file-source.js';
export type { FileSourceConfig } from './file-source.js';

export { createSourceRegistry, ExtendedSourceRegistry } from './registry.js';
export { sourceRegistry, SourceRegistry } from './registry.js';
export type { SourceAdapter, Capabilities, EventStream, RetryStrategy } from './registry.js';
