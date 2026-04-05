/**
 * @wasm4pm/kernel
 * Core kernel — versioned API facade over wasm4pm WASM algorithms
 *
 * Provides: Kernel class, algorithm registry, version checks, deterministic hashing,
 * and Rust→TypeScript error propagation.
 */
export { Kernel } from './api.js';
export type { KernelResult, PartialResult, KernelStats, KernelWasmModule, } from './api.js';
export { AlgorithmRegistry, getRegistry, } from './registry.js';
export type { AlgorithmMetadata, AlgorithmParameter, ComplexityClass, ExecutionProfile, QualityTier, SpeedTier, } from './registry.js';
export { implementAlgorithmStep, listAlgorithms, validateAlgorithmParameters, } from './handlers.js';
export type { WasmModule, AlgorithmStepOutput, } from './handlers.js';
export { KERNEL_VERSION, MIN_WASM4PM_VERSION, checkCompatibility, assertCompatibility, parseSemVer, compareSemVer, satisfiesMinimum, isMajorCompatible, } from './versioning.js';
export type { SemVer, CompatibilityResult, } from './versioning.js';
export { hashOutput, hashRaw, hashAlgorithmResult, verifyOutputHash, canonicalize, } from './hashing.js';
export { KernelError, isKernelError, classifyRustError, toTypedError, wrapKernelCall, } from './errors.js';
export type { KernelErrorCode } from './errors.js';
//# sourceMappingURL=index.d.ts.map