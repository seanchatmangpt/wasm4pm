/**
 * bootstrap.ts
 * Bootstrap logic for engine initialization
 * Loads WASM, initializes kernel, validates readiness
 */

import { EngineError } from '@pictl/contracts';
import { WasmLoader, WasmModule } from './wasm-loader.js';

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
export async function bootstrapEngine(
  kernel: BootstrapKernel,
  wasmLoader: WasmLoader
): Promise<BootstrapResult> {
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
export function createBootstrapError(err: unknown): EngineError {
  return {
    code: 'BOOTSTRAP_FAILED',
    message: err instanceof Error ? err.message : String(err),
    severity: 'fatal',
    recoverable: true,
    suggestion: 'Check WASM module and kernel configuration and try again',
  };
}
