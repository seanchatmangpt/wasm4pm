/**
 * bootstrap.ts
 * Bootstrap logic for engine initialization
 * Loads WASM, initializes kernel, validates readiness
 */

import { EngineError } from '@wasm4pm/contracts';
import { WasmLoader, WasmModule, WasmLoadError } from './wasm-loader.js';

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
 * Bootstraps the engine by loading WASM and initializing the kernel.
 *
 * Failure semantics: if kernel.init() fails or the kernel does not become
 * ready, the WASM loader is rolled back via softReset() so a subsequent
 * recovery does not observe a "half-initialized" engine where WASM looks
 * ready but kernel state is broken. This guarantees bootstrap is atomic
 * from the engine's perspective.
 *
 * @throws Error if WASM loading or kernel initialization fails
 */
export async function bootstrapEngine(
  kernel: BootstrapKernel,
  wasmLoader: WasmLoader
): Promise<BootstrapResult> {
  const startTime = Date.now();

  // Stage 1: WASM module — failure here is a clean abort (loader not flipped to initialized)
  await wasmLoader.init();
  const wasmModule = wasmLoader.get();

  // Stage 2: Kernel — if this fails after WASM came up, we must roll back so
  // wasmLoader.isInitialized() does not return true for a broken engine.
  try {
    await kernel.init();
    if (!kernel.isReady()) {
      throw new Error('Kernel initialization failed: kernel not ready');
    }
  } catch (err) {
    // Roll back the WASM loader so the engine can re-bootstrap cleanly.
    // softReset() preserves the compiled module (cheap re-init) but clears
    // the initialized flag, matching the semantic that bootstrap did not
    // succeed end-to-end.
    try {
      wasmLoader.softReset();
    } catch {
      // Swallow softReset failures: the original kernel error is the
      // load-bearing diagnostic. We do not want to mask it.
    }
    throw err;
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
export function createBootstrapError(err: unknown): EngineError {
  if (err instanceof WasmLoadError) {
    const codeMap: Record<WasmLoadError['loadCause'], string> = {
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
