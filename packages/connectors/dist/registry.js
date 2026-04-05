/**
 * Source Registry
 * Central registry for managing source adapters
 * Re-exports SourceRegistry from contracts and provides helper functions
 */
import { SourceRegistry, sourceRegistry as contractRegistry } from '@wasm4pm/contracts';
import { FileSourceAdapter } from './file-source.js';
import { HttpSourceAdapter } from './http-source.js';
import { StreamSourceAdapter } from './stream-source.js';
/**
 * Extension of SourceRegistry with helper functions for registration
 */
export class ExtendedSourceRegistry extends SourceRegistry {
    /**
     * Register the built-in file adapter
     */
    registerFileAdapter(config) {
        const adapter = new FileSourceAdapter(config ?? { filePath: '' });
        this.register(adapter);
    }
    /**
     * Register the HTTP adapter
     */
    registerHttpAdapter(config) {
        const adapter = new HttpSourceAdapter(config ?? { url: '' });
        this.register(adapter);
    }
    /**
     * Register the stream (stdin) adapter
     */
    registerStreamAdapter(config) {
        const adapter = new StreamSourceAdapter(config ?? {});
        this.register(adapter);
    }
    /**
     * Auto-detect and register adapters based on available implementations
     */
    registerBuiltins() {
        this.registerFileAdapter();
        this.registerHttpAdapter();
        this.registerStreamAdapter();
    }
}
/**
 * Create extended registry instance
 */
export function createSourceRegistry() {
    const registry = new ExtendedSourceRegistry();
    registry.registerBuiltins();
    return registry;
}
/**
 * Export the contract registry as default singleton
 */
export { contractRegistry as sourceRegistry };
export { SourceRegistry } from '@wasm4pm/contracts';
//# sourceMappingURL=registry.js.map