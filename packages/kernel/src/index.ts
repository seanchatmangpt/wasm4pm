/**
 * @wasm4pm/kernel
 * Core kernel — versioned API facade over wasm4pm WASM algorithms
 *
 * Provides: Kernel class, algorithm registry, version checks, deterministic hashing,
 * Rust→TypeScript error propagation, and three-layer backend architecture.
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
export { KERNEL_VERSION, checkCompatibility } from './versioning.js';
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

// Three-layer architecture: Backend capability contract (Section 3)
export type {
  MiningBackend,
  BackendCapabilities,
  EventLogIR,
  ModelIR,
  ModelCapabilities,
  ConformanceResult,
  AnalysisTask,
  BudgetEnvelope,
  ProvenanceChain,
  ResultEnvelope,
  LatencyClass,
  AlgorithmFamily,
  ModelType,
  QualityTier as BackendQualityTier,
} from './mining-backend.js';

// Backend registry with 7-rule selection algorithm
export type { BackendRegistry } from './backend-registry.js';
export { DefaultBackendRegistry } from './backend-registry.js';

// Concrete backend implementations
export { WasmBackend } from './backends/wasm-backend.js';
export { MlBackend } from './backends/ml-backend.js';
export { Pm4wasmBackend } from './backends/pm4wasm-backend.js';
export { Pm4pyBackend } from './backends/pm4py-backend.js';

// Data model converters for pm4wasm integration
export {
  eventLogIrToWasmJson,
  wasmJsonToEventLogIr,
  isValidIso8601,
  validateLogTimestamps,
  hashEventLogIr,
} from './converters/eventlog-ir-converter.js';
export type { WasmEventLog } from './converters/eventlog-ir-converter.js';

export {
  inferStartActivities,
  inferEndActivities,
  modelIrToDfg,
  modelIrToPetriNet,
  modelIrToPowlModel,
  dfgToModelIr,
  petriNetToModelIr,
  powlModelToModelIr,
} from './converters/model-ir-converter.js';
export type {
  DirectlyFollowsGraph,
  PetriNet,
  PowlModel,
} from './converters/model-ir-converter.js';

// Prediction subsystem — orchestrates the 6 Van der Aalst perspectives.
export * as prediction from './prediction/index.js';
