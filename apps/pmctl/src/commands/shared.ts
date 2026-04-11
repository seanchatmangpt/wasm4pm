/**
 * Shared utilities for CLI commands that depend on the WASM engine.
 */

import { WasmLoader } from '@pictl/engine';
import { EXIT_CODES } from '../exit-codes.js';

/**
 * Create a quiet observability layer that suppresses CLI logs (for JSON mode)
 * This is a minimal implementation that satisfies the WasmLoaderConfig interface.
 */
function createQuietObservabilityLayer(): any {
  return {
    emitCli: () => {
      // No-op: suppress CLI logs
    },
    enableJson: () => {
      // No-op
    },
    enableOtel: () => {
      // No-op
    },
    // Add other ObservabilityLayer methods that might be called
    emitJson: () => {
      // No-op
    },
    emitOtel: () => {
      // No-op
    },
  };
}

/**
 * Check if the WASM engine is available and initialized.
 * Returns true if WASM is ready, false otherwise.
 * Pass quiet=true to suppress observability logs (recommended for JSON output).
 */
export async function isWasmAvailable(quiet: boolean = false): Promise<boolean> {
  try {
    const observability = quiet ? createQuietObservabilityLayer() : undefined;
    const loader = WasmLoader.getInstance({ observability });
    await loader.init();
    return loader.isInitialized();
  } catch {
    return false;
  }
}

/**
 * Handle the case where WASM is not available.
 * Emits a structured JSON error for --format json, or a human-readable message.
 * Always exits the process.
 */
export function handleWasmUnavailable(format: 'human' | 'json'): never {
  if (format === 'json') {
    const response = JSON.stringify({
      status: 'error',
      error: 'WASM_UNAVAILABLE',
      message: 'Process mining features require the WASM module',
      suggestion: 'Run "pictl doctor" to diagnose setup issues',
    });
    process.stdout.write(response + '\n');
  } else {
    console.error('WASM module not available. Run "pictl doctor" for diagnostics.');
  }
  process.exit(EXIT_CODES.system_error);
}
