/**
 * Sink Registry
 * Central registry for managing sink adapters
 * Re-exports SinkRegistry from contracts and provides helper functions
 */
import { SinkRegistry, sinkRegistry as contractRegistry } from '@wasm4pm/contracts';
import { FileLogSinkAdapter } from './file-log-sink.js';
import { StdoutSinkAdapter } from './stdout-sink.js';
import { HttpSinkAdapter } from './http-sink.js';
/**
 * Extension of SinkRegistry with helper functions for registration
 */
export class ExtendedSinkRegistry extends SinkRegistry {
    /**
     * Register the built-in file sink adapter
     */
    registerFileAdapter(config) {
        const defaultConfig = {
            directory: './output',
            onExists: 'skip',
            failureMode: 'fail',
            ...config,
        };
        const adapter = new FileLogSinkAdapter(defaultConfig);
        this.register(adapter);
    }
    /**
     * Register the stdout sink adapter
     *
     * Note: Registers as 'custom' kind since the SinkAdapterKind union
     * does not include 'stdout' — the contract allows 'custom' for this.
     */
    registerStdoutAdapter(config) {
        const adapter = new StdoutSinkAdapter(config);
        this.register(adapter);
    }
    /**
     * Register the HTTP sink adapter
     */
    registerHttpAdapter(config) {
        const adapter = new HttpSinkAdapter(config ?? { url: '' });
        this.register(adapter);
    }
    /**
     * Auto-detect and register adapters based on available implementations
     */
    registerBuiltins(config) {
        this.registerFileAdapter(config);
        this.registerStdoutAdapter();
        this.registerHttpAdapter();
    }
}
/**
 * Create extended registry instance
 */
export function createSinkRegistry(config) {
    const registry = new ExtendedSinkRegistry();
    registry.registerBuiltins(config);
    return registry;
}
/**
 * Export the contract registry as default singleton
 */
export { contractRegistry as sinkRegistry };
export { SinkRegistry } from '@wasm4pm/contracts';
//# sourceMappingURL=registry.js.map