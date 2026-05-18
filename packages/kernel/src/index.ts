/**
 * @wasm4pm/kernel
 * Core kernel — versioned API facade over wasm4pm WASM algorithms
 *
 * Provides: Kernel class, algorithm registry, version checks, deterministic hashing,
 * Rust→TypeScript error propagation, and three-layer backend architecture.
 */

// Kernel API facade
/**
 * Kernel — Core process mining backend abstraction.
 * @description Executes discovery, conformance, and analysis algorithms via WASM with multi-backend support.
 * @example const kernel = new Kernel(registry); await kernel.run('dfg', logHandle, { activityKey: 'concept:name' });
 */
export { Kernel, parseWasmOutput } from './api.js';

/**
 * parseWasmOutput — Safe JSON deserialization from WASM algorithm results.
 * @description Parses algorithm output, handles string/object variance, returns typed result.
 * @example const parsed = parseWasmOutput<DfgResult>(wasmStringOutput);
 */
export type { KernelResult, PartialResult, KernelStats, KernelWasmModule } from './api.js';

// Registry exports
/**
 * getRegistry — Get the singleton algorithm registry with 38 Van der Aalst registered algorithms.
 * @description Singleton accessor; use to enumerate algorithms, check metadata, query by profile.
 * @example const registry = getRegistry(); const dfg = registry.get('dfg');
 */
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
/**
 * hashOutput — BLAKE3 hashing for deterministic result verification.
 * @description Cryptographic hash (hex-64) of algorithm output; used in receipt chains and proof gates.
 * @example const hash = hashOutput(algorithmResult);
 */
export {
  hashOutput,
  hashRaw,
  hashAlgorithmResult,
  verifyOutputHash,
  canonicalize,
} from './hashing.js';

// Error exports
/**
 * KernelError — Typed error from WASM backend with error codes (200s-700s severity bands).
 * @description Discriminated union mapping Rust panics and return codes to TypeScript Error types.
 * @example if (isKernelError(err)) { console.log(err.code); } // e.g., 'CONFIG_ERROR'
 */
export {
  KernelError,
  isKernelError,
  classifyRustError,
  toTypedError,
  wrapKernelCall,
} from './errors.js';
export type { KernelErrorCode } from './errors.js';

// Validation exports
export { ValidationError } from './validation.js';
export type { ViolationReport } from './validation.js';

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
export type { DirectlyFollowsGraph, PetriNet, PowlModel } from './converters/model-ir-converter.js';

// Machine-specific timing thresholds (use instead of hardcoded ms values in tests)
export { machineThreshold, medianMs } from './machine-thresholds.js';
export type { CalibrationResult } from './machine-thresholds.js';

// Prediction subsystem — orchestrates the 6 Van der Aalst perspectives.
export * as prediction from './prediction/index.js';

// Introspection APIs — discovery, diagnostics, validation, and quick-start helpers
export * as introspection from './introspection/index.js';

// Enterprise KPI computation
export { computeCaseKpis, summarizeKpis } from './kpi.js';
export type { CaseKpi, LogKpiSummary } from './kpi.js';

// POWL discovery variant bridge — maps wasm4pm variants to mcpp algorithm selection
export {
  DiscoveryVariant,
  VARIANT_COST_ORDER,
  variantToMcppAlgorithmId,
  nextVariant,
  variantMetadata,
  parseDiscoveryVariant,
} from './discovery-variant-bridge.js';
export type { VariantMetadata } from './discovery-variant-bridge.js';

// Manifest bridge — auto-generate mcpp PartManifest entries from the kernel registry
export type {
  McppContext,
  RouteBinding,
  HostFit,
  RefusalProfile,
  Fixture,
  WasmBinding,
  PartManifest,
  ManifestBridgeGaps,
  GapOverrideMap,
  ManifestBundle,
} from './manifest-bridge.js';
export {
  DEFAULT_MCPP_CONTEXT,
  algorithmToPartManifest,
  generateAllManifests,
  computeManifestHash,
} from './manifest-bridge.js';
