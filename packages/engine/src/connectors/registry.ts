/**
 * Source Registry
 * Central registry for managing source adapters
 * Re-exports SourceRegistry from contracts and provides helper functions
 */

import { SourceRegistry, sourceRegistry as contractRegistry } from '@pictl/contracts';
import { FileSourceAdapter, FileSourceConfig } from './file-source.js';
import { HttpSourceAdapter, HttpSourceConfig } from './http-source.js';
import { StreamSourceAdapter, StreamSourceConfig } from './stream-source.js';
import { WebSocketSourceAdapter, WebSocketSourceConfig } from './ws-source.js';

/**
 * Extension of SourceRegistry with helper functions for registration
 */
export class ExtendedSourceRegistry extends SourceRegistry {
  /**
   * Register the built-in file adapter
   */
  registerFileAdapter(config?: FileSourceConfig): void {
    const adapter = new FileSourceAdapter(config ?? { filePath: '' });
    this.register(adapter);
  }

  /**
   * Register the HTTP adapter
   */
  registerHttpAdapter(config?: HttpSourceConfig): void {
    const adapter = new HttpSourceAdapter(config ?? { url: '' });
    this.register(adapter);
  }

  /**
   * Register the stream (stdin) adapter
   */
  registerStreamAdapter(config?: StreamSourceConfig): void {
    const adapter = new StreamSourceAdapter(config ?? {});
    this.register(adapter);
  }

  /**
   * Auto-detect and register adapters based on available implementations
   */
  registerBuiltins(): void {
    this.registerFileAdapter();
    this.registerHttpAdapter();
    this.registerStreamAdapter();
    this.registerWebSocketAdapter();
  }

  /**
   * Register the WebSocket adapter
   */
  registerWebSocketAdapter(config?: WebSocketSourceConfig): void {
    const adapter = new WebSocketSourceAdapter(config ?? { url: '' });
    this.register(adapter);
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
export { contractRegistry as sourceRegistry };
export { SourceRegistry } from '@pictl/contracts';
export type { SourceAdapter, Capabilities, EventStream, RetryStrategy } from '@pictl/contracts';
