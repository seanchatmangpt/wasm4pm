/**
 * wasm-loader.ts
 * WASM module initialization and lifecycle management
 * Singleton pattern for efficient module reuse across multiple engine.run() calls
 * Handles panic hooks, memory validation, and runtime environment detection
 */
import { ObservabilityLayer } from '@wasm4pm/observability';
/**
 * Runtime environment detection
 */
type RuntimeEnvironment = 'browser' | 'nodejs' | 'wasi';
/**
 * Minimal structural type for WebAssembly.Memory (avoids requiring the DOM lib).
 * Captures the two fields we actually access in this module.
 */
export interface WasmMemory {
    /** Backing ArrayBuffer for the WASM linear memory. */
    buffer: ArrayBuffer;
    /** Maximum number of 64 KiB pages (undefined when no maximum was declared). */
    maximum?: number;
}
/**
 * WASM module type - minimal interface covering common operations
 * The index signature uses `unknown` to preserve type safety; callers that
 * access arbitrary WASM exports cast the module to a narrower type (e.g.
 * `Record<string, (...args: unknown[]) => unknown>`) after `loader.get()`.
 */
export interface WasmModule {
    /** WebAssembly linear memory — may be absent for bundler targets */
    memory: WasmMemory;
    version?: () => string;
    init?: () => void;
    [key: string]: unknown;
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
 * Classified WASM load failure — carries a machine-readable cause code and the
 * resolved module path so callers (and the bootstrap timeout handler) can emit
 * specific, actionable error messages rather than generic "BOOTSTRAP_FAILED".
 */
export declare class WasmLoadError extends Error {
    readonly loadCause: 'FILE_NOT_FOUND' | 'CORRUPT_BINARY' | 'MISSING_EXPORTS' | 'LOAD_FAILED';
    readonly modulePath: string | undefined;
    constructor(loadCause: 'FILE_NOT_FOUND' | 'CORRUPT_BINARY' | 'MISSING_EXPORTS' | 'LOAD_FAILED', message: string, modulePath?: string);
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
     * Destroys entire singleton - next init() will reload WASM from scratch
     */
    static reset(): void;
    /**
     * Soft reset - clears initialized flag but keeps compiled WASM module
     * Allows fast recovery without re-importing and re-compiling WASM
     * Use this for recovery when WASM module is still valid
     */
    softReset(): void;
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
     * Load WASM module from wasm4pm/pkg directory.
     * Validates that the module exports required discovery functions.
     * Throws WasmLoadError with a classified cause for actionable diagnostics.
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
     * Emit JSON event via observability layer.
     * Accepts a JsonEvent; the runtime guard protects against subclasses that
     * may not implement emitJson.
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