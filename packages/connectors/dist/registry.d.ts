/**
 * Source Registry
 * Central registry for managing source adapters
 * Re-exports SourceRegistry from contracts and provides helper functions
 */
import { SourceRegistry, sourceRegistry as contractRegistry } from '@wasm4pm/contracts';
import { FileSourceConfig } from './file-source.js';
import { HttpSourceConfig } from './http-source.js';
import { StreamSourceConfig } from './stream-source.js';
/**
 * Extension of SourceRegistry with helper functions for registration
 */
export declare class ExtendedSourceRegistry extends SourceRegistry {
    /**
     * Register the built-in file adapter
     */
    registerFileAdapter(config?: FileSourceConfig): void;
    /**
     * Register the HTTP adapter
     */
    registerHttpAdapter(config?: HttpSourceConfig): void;
    /**
     * Register the stream (stdin) adapter
     */
    registerStreamAdapter(config?: StreamSourceConfig): void;
    /**
     * Auto-detect and register adapters based on available implementations
     */
    registerBuiltins(): void;
}
/**
 * Create extended registry instance
 */
export declare function createSourceRegistry(): ExtendedSourceRegistry;
/**
 * Export the contract registry as default singleton
 */
export { contractRegistry as sourceRegistry };
export { SourceRegistry } from '@wasm4pm/contracts';
export type { SourceAdapter, Capabilities, EventStream, RetryStrategy } from '@wasm4pm/contracts';
//# sourceMappingURL=registry.d.ts.map