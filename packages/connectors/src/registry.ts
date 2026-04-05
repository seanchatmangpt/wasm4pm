/**
 * Source Registry
 * Central registry for managing source adapters
 * Re-exports SourceRegistry from contracts and provides helper functions
 */

import { SourceRegistry, sourceRegistry as contractRegistry } from '@wasm4pm/contracts';
import { FileSourceAdapter, FileSourceConfig } from './file-source.js';

/**
 * Extension of SourceRegistry with helper functions for registration
 */
export class ExtendedSourceRegistry extends SourceRegistry {
  /**
   * Register the built-in file adapter
   */
  registerFileAdapter(): void {
    const config: FileSourceConfig = { filePath: '' };
    const adapter = new FileSourceAdapter(config);
    this.register(adapter);
  }

  /**
   * Auto-detect and register adapters based on available implementations
   */
  registerBuiltins(): void {
    this.registerFileAdapter();
  }
}

/**
 * Create extended registry instance
 */
export function createSourceRegistry(): ExtendedSourceRegistry {
  const registry = new ExtendedSourceRegistry();
  registry.registerBuiltins();
  return registry;
}

/**
 * Export the contract registry as default singleton
 */
export { sourceRegistry };
export { SourceRegistry } from '@wasm4pm/contracts';
export type { SourceAdapter, Capabilities, EventStream, RetryStrategy } from '@wasm4pm/contracts';
