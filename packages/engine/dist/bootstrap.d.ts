/**
 * bootstrap.ts
 * Bootstrap logic for engine initialization
 * Loads WASM, initializes kernel, validates readiness
 */
import { ErrorInfo } from '@wasm4pm/types';
import { WasmLoader, WasmModule } from './wasm-loader';
/**
 * Kernel interface for bootstrap (subset of full Kernel)
 */
export interface BootstrapKernel {
    init(): Promise<void>;
    isReady(): boolean;
}
/**
 * Result of a bootstrap operation
 */
export interface BootstrapResult {
    wasmModule: WasmModule;
    durationMs: number;
}
/**
 * Bootstraps the engine by loading WASM and initializing the kernel
 * @throws Error if WASM loading or kernel initialization fails
 */
export declare function bootstrapEngine(kernel: BootstrapKernel, wasmLoader: WasmLoader): Promise<BootstrapResult>;
/**
 * Creates a structured error for bootstrap failures
 */
export declare function createBootstrapError(err: unknown): ErrorInfo;
//# sourceMappingURL=bootstrap.d.ts.map