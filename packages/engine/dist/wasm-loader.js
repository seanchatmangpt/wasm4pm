/**
 * wasm-loader.ts
 * WASM module initialization and lifecycle management
 * Singleton pattern for efficient module reuse across multiple engine.run() calls
 * Handles panic hooks, memory validation, and runtime environment detection
 */
import { ObservabilityLayer } from '@pictl/observability';
/**
 * WASM initialization error codes
 */
export var WasmErrorCode;
(function (WasmErrorCode) {
    WasmErrorCode[WasmErrorCode["WASM_INIT_FAILED"] = 5] = "WASM_INIT_FAILED";
    WasmErrorCode[WasmErrorCode["WASM_MEMORY_EXCEEDED"] = 5] = "WASM_MEMORY_EXCEEDED";
    WasmErrorCode[WasmErrorCode["WASM_VERSION_MISMATCH"] = 5] = "WASM_VERSION_MISMATCH";
})(WasmErrorCode || (WasmErrorCode = {}));
/**
 * WasmLoader singleton
 * Lazy-loads WASM module on first use, reuses across multiple runs
 * Handles panic hooks, memory validation, and runtime detection
 */
export class WasmLoader {
    static instance;
    module;
    initialized = false;
    config;
    observability;
    panicHook;
    runtimeEnvironment;
    constructor(config = {}) {
        this.config = config;
        this.observability = config.observability || new ObservabilityLayer();
        this.runtimeEnvironment = this.detectRuntimeEnvironment();
    }
    /**
     * Get or create singleton instance
     */
    static getInstance(config) {
        if (!WasmLoader.instance) {
            WasmLoader.instance = new WasmLoader(config);
        }
        return WasmLoader.instance;
    }
    /**
     * Reset singleton (mainly for testing)
     */
    static reset() {
        WasmLoader.instance = undefined;
    }
    /**
     * Initialize WASM module
     * - Loads module from ../../wasm4pm/pkg/wasm4pm.js
     * - Sets up panic hook
     * - Validates memory
     * - Verifies version compatibility
     * Throws on failure with appropriate error code
     */
    async init() {
        if (this.initialized) {
            return; // Already initialized
        }
        try {
            this.observability.emitCli({
                level: 'info',
                message: 'Initializing WASM module',
            });
            // Load WASM module
            const module = await this.loadWasmModule();
            this.module = module;
            // Setup panic hook for readable error messages
            if (this.config.enablePanicHook !== false) {
                this.setupPanicHook(module);
            }
            // Validate memory
            this.validateMemory();
            // Verify module version if expected version is provided
            if (this.config.expectedVersion && module.version) {
                const actualVersion = module.version();
                if (actualVersion !== this.config.expectedVersion) {
                    throw new Error(`WASM module version mismatch: expected ${this.config.expectedVersion}, ` +
                        `got ${actualVersion}`);
                }
            }
            this.initialized = true;
            this.observability.emitCli({
                level: 'info',
                message: 'WASM module initialized successfully',
            });
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            this.observability.emitCli({
                level: 'error',
                message: `WASM initialization failed: ${message}`,
            });
            throw err;
        }
    }
    /**
     * Get initialized WASM module
     * Throws if module is not initialized (call init() first)
     */
    get() {
        if (!this.module || !this.initialized) {
            throw new Error('WASM module not initialized. Call init() before using the module.');
        }
        return this.module;
    }
    /**
     * Check if module is initialized
     */
    isInitialized() {
        return this.initialized;
    }
    /**
     * Get current WASM loader status
     */
    getStatus() {
        if (!this.module) {
            return {
                initialized: false,
                moduleVersion: undefined,
                expectedVersion: this.config.expectedVersion,
                memoryPages: 0,
                memoryUsagePercent: 0,
                runtimeEnvironment: this.runtimeEnvironment,
            };
        }
        const memory = this.module.memory;
        const memoryPages = memory.buffer.byteLength / (64 * 1024); // 64KB pages
        const memoryMaxPages = memory.maximum ?? undefined;
        const memoryUsagePercent = memoryMaxPages
            ? (memoryPages / memoryMaxPages) * 100
            : 0;
        return {
            initialized: this.initialized,
            moduleVersion: this.module.version?.(),
            expectedVersion: this.config.expectedVersion,
            memoryPages,
            memoryMaxPages,
            memoryUsagePercent,
            runtimeEnvironment: this.runtimeEnvironment,
        };
    }
    /**
     * Get memory usage statistics
     */
    getMemoryStats() {
        if (!this.module) {
            return {
                usedBytes: 0,
                totalBytes: 0,
                usagePercent: 0,
            };
        }
        const buffer = this.module.memory.buffer;
        const usedBytes = buffer.byteLength;
        const maxBytes = this.module.memory.maximum
            ? this.module.memory.maximum * (64 * 1024)
            : undefined;
        const totalBytes = usedBytes;
        const usagePercent = maxBytes ? (usedBytes / maxBytes) * 100 : 0;
        return {
            usedBytes,
            totalBytes,
            maxBytes,
            usagePercent,
        };
    }
    /**
     * Validate WASM memory is accessible and not corrupted
     * Throws if validation fails
     */
    validateMemory() {
        if (!this.module) {
            throw new Error('Module not loaded');
        }
        // wasm-pack bundler target does not expose .memory directly — skip if absent
        if (!this.module.memory) {
            return;
        }
        try {
            const buffer = this.module.memory.buffer;
            // Check memory is accessible
            if (!buffer || buffer.byteLength === 0) {
                throw new Error('WASM memory is inaccessible or empty');
            }
            // Create a view to verify memory is valid
            const view = new Uint8Array(buffer, 0, Math.min(1024, buffer.byteLength));
            const testValue = 42;
            // Try to write and read
            const originalValue = view[0];
            view[0] = testValue;
            if (view[0] !== testValue) {
                throw new Error('WASM memory write verification failed');
            }
            view[0] = originalValue;
            // Check memory usage
            const status = this.getStatus();
            const maxMemoryPercent = this.config.maxMemoryPercent ?? 80;
            if (status.memoryUsagePercent > 100) {
                throw new Error('WASM memory exceeded maximum allocation');
            }
            if (status.memoryUsagePercent > maxMemoryPercent) {
                this.observability.emitCli({
                    level: 'warn',
                    message: `WASM memory usage at ${status.memoryUsagePercent.toFixed(1)}% ` +
                        `(${status.memoryPages} pages)`,
                });
            }
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            throw new Error(`WASM memory validation failed: ${message}`);
        }
    }
    /**
     * Load WASM module from wasm4pm/pkg directory
     */
    async loadWasmModule() {
        // Dynamically import based on runtime environment
        let wasmModule;
        try {
            // Import from the built pictl WASM package
            let modulePath = this.config.modulePath;
            if (!modulePath) {
                // Compute workspace root from import.meta.url
                // In src: wasm-loader.ts at packages/engine/src/
                // In dist: wasm-loader.js at packages/engine/dist/
                // Both are 3 levels up from workspace root
                const currentUrl = new URL(import.meta.url);
                const currentPath = currentUrl.pathname;
                // Find 'packages/engine' and go up to workspace root
                const engineIndex = currentPath.lastIndexOf('packages/engine');
                if (engineIndex === -1) {
                    throw new Error('Cannot determine workspace root: "packages/engine" not found in path');
                }
                const workspaceRoot = currentPath.substring(0, engineIndex);
                modulePath = workspaceRoot + 'wasm4pm/pkg/pictl.js';
            }
            // Use dynamic import for flexibility
            wasmModule = await import(modulePath);
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            throw new Error(`Failed to load WASM module: ${message}`);
        }
        if (!wasmModule || typeof wasmModule.load_eventlog_from_xes !== 'function') {
            throw new Error('Invalid WASM module: missing required exports (load_eventlog_from_xes)');
        }
        return wasmModule;
    }
    /**
     * Setup Rust panic hook for readable error messages
     * Wraps wasm_bindgen's panic hook with custom handler
     * CRITICAL: Panic hook is mandatory for safety — must not be silently skipped
     */
    setupPanicHook(module) {
        // Panic hook setup is REQUIRED — missing hook is a critical safety violation
        const wasmBindgenPanicHook = module.set_panic_hook;
        if (typeof wasmBindgenPanicHook !== 'function') {
            throw new Error('WASM module missing set_panic_hook export. ' +
                'Panic hook is required for safe error handling. ' +
                'Check WASM module build and wasm-bindgen version.');
        }
        // Call wasm_bindgen's panic hook setup
        wasmBindgenPanicHook();
        // Additionally, setup a global panic handler for uncaught exceptions
        if (typeof globalThis.window === 'undefined') {
            // Node.js environment
            const originalWarning = console.error;
            this.panicHook = (message, stack) => {
                this.observability.emitCli({
                    level: 'error',
                    message: `WASM panic: ${message}`,
                });
                // Log to observability system
                this.emitJson({
                    timestamp: new Date().toISOString(),
                    component: 'wasm-loader',
                    event_type: 'wasm_panic',
                    data: {
                        message,
                        stack,
                        runtimeEnvironment: this.runtimeEnvironment,
                    },
                });
                originalWarning(`WASM Panic: ${message}\n${stack || ''}`);
            };
        }
        else {
            // Browser environment
            this.panicHook = (message, stack) => {
                this.observability.emitCli({
                    level: 'error',
                    message: `WASM panic: ${message}`,
                });
                this.emitJson({
                    timestamp: new Date().toISOString(),
                    component: 'wasm-loader',
                    event_type: 'wasm_panic',
                    data: {
                        message,
                        stack,
                        runtimeEnvironment: this.runtimeEnvironment,
                    },
                });
                // In browser, don't re-throw, just log
                console.error(`WASM Panic: ${message}`, stack);
            };
        }
    }
    /**
     * Detect runtime environment (browser, Node.js, WASI)
     */
    detectRuntimeEnvironment() {
        // Check for WASI environment
        if (typeof process !== 'undefined' && process.versions?.wasi) {
            return 'wasi';
        }
        // Check for Node.js
        if (typeof process !== 'undefined' && process.versions?.node) {
            return 'nodejs';
        }
        // Assume browser
        return 'browser';
    }
    /**
     * Get getrandom polyfill if needed
     * For WASM32 targets, getrandom may need a polyfill
     */
    getGetrandomPolyfill() {
        if (this.runtimeEnvironment === 'nodejs') {
            // Node.js has native crypto
            try {
                return require('crypto').randomBytes;
            }
            catch {
                return undefined;
            }
        }
        if (this.runtimeEnvironment === 'browser') {
            // Browser has crypto.getRandomValues
            return (buffer) => {
                if (crypto && crypto.getRandomValues) {
                    crypto.getRandomValues(buffer);
                    return buffer;
                }
                throw new Error('crypto.getRandomValues not available');
            };
        }
        return undefined;
    }
    /**
     * Emit JSON event via observability layer
     */
    emitJson(event) {
        if (this.observability.emitJson) {
            this.observability.emitJson(event);
        }
    }
}
/**
 * Factory function for creating WasmLoader instances
 */
export function createWasmLoader(config) {
    return WasmLoader.getInstance(config);
}
/**
 * Get the singleton WasmLoader instance
 */
export function getWasmLoader() {
    return WasmLoader.getInstance();
}
