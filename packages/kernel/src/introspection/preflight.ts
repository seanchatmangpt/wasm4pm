/**
 * introspection/preflight.ts
 *
 * WASM readiness pre-flight checks.
 * Validates the kernel registry and version before expensive operations.
 */

import { getRegistry } from '../registry.js';
import { KERNEL_VERSION } from '../versioning.js';

/** Result of the WASM readiness pre-flight check */
export interface WasmReadinessResult {
  ready: boolean;
  version: string;
  availableAlgorithms: string[];
  warnings: string[];
}

/**
 * Validate that the kernel registry is populated and the version is parseable.
 * Does not require a live WASM module — checks TypeScript-layer readiness.
 *
 * @example
 * ```typescript
 * const check = await validateWasmReadiness();
 * if (!check.ready) {
 *   console.error('Kernel not ready:', check.warnings);
 * }
 * ```
 */
export async function validateWasmReadiness(): Promise<WasmReadinessResult> {
  const warnings: string[] = [];
  const registry = getRegistry();
  const algorithms = registry.list();
  const ids = algorithms.map((m) => m.id);

  if (ids.length === 0) {
    warnings.push('Algorithm registry is empty — WASM build may be missing or incomplete');
  }

  const versionPattern = /^\d+\.\d+\.\d+/;
  if (!versionPattern.test(KERNEL_VERSION)) {
    warnings.push(
      `Kernel version "${KERNEL_VERSION}" does not match expected CalVer pattern (YEAR.MONTH.DAY)`
    );
  }

  if (KERNEL_VERSION === '0.0.0') {
    warnings.push('Kernel version is 0.0.0 — package.json may not have been loaded correctly');
  }

  const ready = warnings.length === 0;

  return {
    ready,
    version: KERNEL_VERSION,
    availableAlgorithms: ids,
    warnings,
  };
}
