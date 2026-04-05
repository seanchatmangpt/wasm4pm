/**
 * Sink Registry
 * Central registry for managing sink adapters
 * Re-exports SinkRegistry from contracts and provides helper functions
 */
import { SinkRegistry, sinkRegistry as contractRegistry } from '@wasm4pm/contracts';
import { FileLogSinkConfig } from './file-log-sink.js';
import { StdoutSinkConfig } from './stdout-sink.js';
import { HttpSinkConfig } from './http-sink.js';
/**
 * Extension of SinkRegistry with helper functions for registration
 */
export declare class ExtendedSinkRegistry extends SinkRegistry {
    /**
     * Register the built-in file sink adapter
     */
    registerFileAdapter(config?: Partial<FileLogSinkConfig>): void;
    /**
     * Register the stdout sink adapter
     *
     * Note: Registers as 'custom' kind since the SinkAdapterKind union
     * does not include 'stdout' — the contract allows 'custom' for this.
     */
    registerStdoutAdapter(config?: Partial<StdoutSinkConfig>): void;
    /**
     * Register the HTTP sink adapter
     */
    registerHttpAdapter(config?: HttpSinkConfig): void;
    /**
     * Auto-detect and register adapters based on available implementations
     */
    registerBuiltins(config?: Partial<FileLogSinkConfig>): void;
}
/**
 * Create extended registry instance
 */
export declare function createSinkRegistry(config?: Partial<FileLogSinkConfig>): ExtendedSinkRegistry;
/**
 * Export the contract registry as default singleton
 */
export { contractRegistry as sinkRegistry };
export { SinkRegistry } from '@wasm4pm/contracts';
export type { SinkAdapter, ArtifactType, AtomicityLevel, ExistsBehavior, FailureMode, } from '@wasm4pm/contracts';
//# sourceMappingURL=registry.d.ts.map