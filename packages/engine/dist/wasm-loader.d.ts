/**
 * wasm-loader.ts
 * WASM module initialization and lifecycle management
 * Singleton pattern for efficient module reuse across multiple engine.run() calls
 * Handles panic hooks, memory validation, and runtime environment detection
 */
import { ObservabilityLayer } from '@pictl/observability';
/**
 * Runtime environment detection
 */
type RuntimeEnvironment = 'browser' | 'nodejs' | 'wasi';
/**
 * WASM module type - minimal interface covering common operations
 */
export interface WasmModule {
    memory: any;
    version?: () => string;
    init?: () => void;
    [key: string]: any;
}
/**
 * WASM initialization error codes
 */
export declare enum WasmErrorCode {
    WASM_INIT_FAILED = 5,
    WASM_MEMORY_EXCEEDED = 5,
    WASM_VERSION_MISMATCH = 5
}
/**
 * WASM initialization status
 */
export interface WasmLoaderStatus {
    initialized: boolean;
    moduleVersion?: string;
    expectedVersion?: string;
    memoryPages: number;
    memoryMaxPages?: number;
    memoryUsagePercent: number;
    runtimeEnvironment: RuntimeEnvironment;
}
/**
 * Configuration for WASM loader
 */
export interface WasmLoaderConfig {
    modulePath?: string;
    expectedVersion?: string;
    maxMemoryPercent?: number;
    enablePanicHook?: boolean;
    observability?: ObservabilityLayer;
}
/**
 * WasmLoader singleton
 * Lazy-loads WASM module on first use, reuses across multiple runs
 * Handles panic hooks, memory validation, and runtime detection
 */
export declare class WasmLoader {
    private static instance?;
    private module?;
    private initialized;
    private config;
    private observability;
    private panicHook?;
    private runtimeEnvironment;
    private constructor();
    /**
     * Get or create singleton instance
     */
    static getInstance(config?: WasmLoaderConfig): WasmLoader;
    /**
     * Reset singleton (mainly for testing)
     */
    static reset(): void;
    /**
     * Initialize WASM module
     * - Loads module from ../../wasm4pm/pkg/wasm4pm.js
     * - Sets up panic hook
     * - Validates memory
     * - Verifies version compatibility
     * Throws on failure with appropriate error code
     */
    init(): Promise<void>;
    /**
     * Get initialized WASM module
     * Throws if module is not initialized (call init() first)
     */
    get(): WasmModule;
    /**
     * Check if module is initialized
     */
    isInitialized(): boolean;
    /**
     * Get current WASM loader status
     */
    getStatus(): WasmLoaderStatus;
    /**
     * Get memory usage statistics
     */
    getMemoryStats(): {
        usedBytes: number;
        totalBytes: number;
        maxBytes?: number;
        usagePercent: number;
    };
    /**
     * Validate WASM memory is accessible and not corrupted
     * Throws if validation fails
     */
    private validateMemory;
    /**
     * Load WASM module from wasm4pm/pkg directory
     */
    private loadWasmModule;
    /**
     * Setup Rust panic hook for readable error messages
     * Wraps wasm_bindgen's panic hook with custom handler
     * Note: set_panic_hook is optional if not exported by WASM module
     */
    private setupPanicHook;
    /**
     * Detect runtime environment (browser, Node.js, WASI)
     */
    private detectRuntimeEnvironment;
    /**
     * Get getrandom polyfill if needed
     * For WASM32 targets, getrandom may need a polyfill
     */
    private getGetrandomPolyfill;
    /**
     * Emit JSON event via observability layer
     */
    private emitJson;
}
/**
 * Factory function for creating WasmLoader instances
 */
export declare function createWasmLoader(config?: WasmLoaderConfig): WasmLoader;
/**
 * Get the singleton WasmLoader instance
 */
export declare function getWasmLoader(): WasmLoader;
export {};
//# sourceMappingURL=wasm-loader.d.ts.map