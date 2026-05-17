/**
 * bootstrap.ts
 * Bootstrap logic for engine initialization
 * Loads WASM, initializes kernel, validates readiness
 */
import { WasmLoadError } from './wasm-loader.js';
/**
 * Bootstraps the engine by loading WASM and initializing the kernel
 * @throws Error if WASM loading or kernel initialization fails
 */
export async function bootstrapEngine(kernel, wasmLoader) {
    const startTime = Date.now();
    // Initialize WASM module
    await wasmLoader.init();
    const wasmModule = wasmLoader.get();
    // Initialize kernel
    await kernel.init();
    // Verify kernel is ready
    if (!kernel.isReady()) {
        throw new Error('Kernel initialization failed: kernel not ready');
    }
    return {
        wasmModule,
        durationMs: Date.now() - startTime,
    };
}
/**
 * Creates a structured error for bootstrap failures.
 * When the underlying cause is a WasmLoadError, the code and suggestion are
 * derived from the classified cause so callers see actionable diagnostics
 * rather than the generic "BOOTSTRAP_FAILED / check WASM availability" pair.
 */
export function createBootstrapError(err) {
    if (err instanceof WasmLoadError) {
        const codeMap = {
            FILE_NOT_FOUND: 'WASM_FILE_NOT_FOUND',
            CORRUPT_BINARY: 'WASM_CORRUPT_BINARY',
            MISSING_EXPORTS: 'WASM_MISSING_EXPORTS',
            LOAD_FAILED: 'WASM_LOAD_FAILED',
        };
        return {
            code: codeMap[err.loadCause],
            message: err.message,
            severity: 'fatal',
            recoverable: err.loadCause !== 'CORRUPT_BINARY',
            suggestion: err.message,
        };
    }
    return {
        code: 'BOOTSTRAP_FAILED',
        message: err instanceof Error ? err.message : String(err),
        severity: 'fatal',
        recoverable: true,
        suggestion: 'Check WASM module and kernel configuration and try again',
    };
}
