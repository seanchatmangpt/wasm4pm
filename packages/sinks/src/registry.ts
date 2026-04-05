/**
 * Sink Registry
 * Central registry for managing sink adapters
 * Re-exports SinkRegistry from contracts and provides helper functions
 */

import { SinkRegistry, sinkRegistry as contractRegistry } from '@wasm4pm/contracts';
import { FileLogSinkAdapter, FileLogSinkConfig } from './file-log-sink.js';

/**
 * Extension of SinkRegistry with helper functions for registration
 */
export class ExtendedSinkRegistry extends SinkRegistry {
  /**
   * Register the built-in file sink adapter
   */
  registerFileAdapter(config?: Partial<FileLogSinkConfig>): void {
    const defaultConfig: FileLogSinkConfig = {
      directory: './output',
      onExists: 'skip',
      failureMode: 'fail',
      ...config,
    };
    const adapter = new FileLogSinkAdapter(defaultConfig);
    this.register(adapter);
  }

  /**
   * Auto-detect and register adapters based on available implementations
   */
  registerBuiltins(config?: Partial<FileLogSinkConfig>): void {
    this.registerFileAdapter(config);
  }
}

/**
 * Create extended registry instance
 */
export function createSinkRegistry(config?: Partial<FileLogSinkConfig>): ExtendedSinkRegistry {
  const registry = new ExtendedSinkRegistry();
  registry.registerBuiltins(config);
  return registry;
}

/**
 * Export the contract registry as default singleton
 */
export { sinkRegistry };
export { SinkRegistry } from '@wasm4pm/contracts';
export type {
  SinkAdapter,
  ArtifactType,
  AtomicityLevel,
  ExistsBehavior,
  FailureMode,
} from '@wasm4pm/contracts';
