/**
 * @wasm4pm/kernel
 * Core kernel — versioned API facade over wasm4pm WASM algorithms
 *
 * Provides: Kernel class, algorithm registry, version checks, deterministic hashing,
 * and Rust→TypeScript error propagation.
 */

// Kernel API facade
export { Kernel } from './api.js';
export type { KernelResult, PartialResult, KernelStats, KernelWasmModule } from './api.js';

// Registry exports
export { AlgorithmRegistry, getRegistry } from './registry.js';
export type {
  AlgorithmMetadata,
  AlgorithmParameter,
  ComplexityClass,
  ExecutionProfile,
  QualityTier,
  SpeedTier,
} from './registry.js';

// Handler exports
export { implementAlgorithmStep, listAlgorithms, validateAlgorithmParameters } from './handlers.js';
export type { WasmModule, AlgorithmStepOutput } from './handlers.js';

// Versioning exports
export {
  KERNEL_VERSION,
  MIN_WASM4PM_VERSION,
  checkCompatibility,
  assertCompatibility,
  parseSemVer,
  compareSemVer,
  satisfiesMinimum,
  isMajorCompatible,
} from './versioning.js';
export type { SemVer, CompatibilityResult } from './versioning.js';

// Hashing exports
export {
  hashOutput,
  hashRaw,
  hashAlgorithmResult,
  verifyOutputHash,
  canonicalize,
} from './hashing.js';

// Error exports
export {
  KernelError,
  isKernelError,
  classifyRustError,
  toTypedError,
  wrapKernelCall,
} from './errors.js';
export type { KernelErrorCode } from './errors.js';

// Step dispatcher bridge
export { buildKernelStepHandlers } from './step-dispatcher.js';
