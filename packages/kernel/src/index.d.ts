/**
 * @wasm4pm/kernel
 * Core kernel — versioned API facade over wasm4pm WASM algorithms
 *
 * Provides: Kernel class, algorithm registry, version checks, deterministic hashing,
 * Rust→TypeScript error propagation, and three-layer backend architecture.
 */
export { Kernel } from './api.js';
export type { KernelResult, PartialResult, KernelStats, KernelWasmModule } from './api.js';
export { AlgorithmRegistry, getRegistry } from './registry.js';
export type { AlgorithmMetadata, AlgorithmParameter, ComplexityClass, ExecutionProfile, QualityTier, SpeedTier, } from './registry.js';
export { implementAlgorithmStep, listAlgorithms, validateAlgorithmParameters } from './handlers.js';
export type { WasmModule, AlgorithmStepOutput } from './handlers.js';
export { KERNEL_VERSION, checkCompatibility } from './versioning.js';
export type { SemVer, CompatibilityResult } from './versioning.js';
export { hashOutput, hashRaw, hashAlgorithmResult, verifyOutputHash, canonicalize, } from './hashing.js';
export { KernelError, isKernelError, classifyRustError, toTypedError, wrapKernelCall, } from './errors.js';
export type { KernelErrorCode } from './errors.js';
export { buildKernelStepHandlers } from './step-dispatcher.js';
export type { MiningBackend, BackendCapabilities, EventLogIR, ModelIR, ModelCapabilities, ConformanceResult, AnalysisTask, BudgetEnvelope, ProvenanceChain, ResultEnvelope, LatencyClass, AlgorithmFamily, ModelType, QualityTier as BackendQualityTier, } from './mining-backend.js';
export type { BackendRegistry } from './backend-registry.js';
export { DefaultBackendRegistry } from './backend-registry.js';
export { WasmBackend } from './backends/wasm-backend.js';
export { MlBackend } from './backends/ml-backend.js';
export { Pm4wasmBackend } from './backends/pm4wasm-backend.js';
export { Pm4pyBackend } from './backends/pm4py-backend.js';
export { eventLogIrToWasmJson, wasmJsonToEventLogIr, isValidIso8601, validateLogTimestamps, hashEventLogIr, } from './converters/eventlog-ir-converter.js';
export type { WasmEventLog } from './converters/eventlog-ir-converter.js';
export { inferStartActivities, inferEndActivities, modelIrToDfg, modelIrToPetriNet, modelIrToPowlModel, dfgToModelIr, petriNetToModelIr, powlModelToModelIr, } from './converters/model-ir-converter.js';
export type { DirectlyFollowsGraph, PetriNet, PowlModel, } from './converters/model-ir-converter.js';
//# sourceMappingURL=index.d.ts.map