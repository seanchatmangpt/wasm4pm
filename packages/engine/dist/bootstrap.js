/**
 * bootstrap.ts
 * Bootstrap logic for engine initialization
 * Loads WASM, initializes kernel, validates readiness
 */
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
 * Creates a structured error for bootstrap failures
 */
export function createBootstrapError(err) {
    return {
        code: 'BOOTSTRAP_FAILED',
        message: err instanceof Error ? err.message : String(err),
        severity: 'fatal',
        recoverable: true,
        suggestion: 'Check WASM module and kernel configuration and try again',
    };
}
