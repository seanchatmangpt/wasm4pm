// @wasm4pm/testing — Testing utilities, fixtures, mocks, and harnesses

// Types
export type { OtelSpan, OtelResource, OtelInstrumentationScope } from './types.js';

// Fixtures
export * from './fixtures/index.js';

// Mocks
export * from './mocks/index.js';

// Harnesses
export * from './harness/index.js';

// Certification
export * from './certification.js';

// Process Mining Testing Utilities
export * from './validators/index.js';
export {
  verifySoundness,
  computeQualityMetrics,
  validateVerifierDFG,
  formatSoundnessResult,
  formatQualityMetrics,
  type PetriNet,
  type ProcessTreeNode,
  type VerifierDFG,
  type QualityMetrics,
} from './verifiers/index.js';
export {
  tokenReplayConformance,
  createTestPetriNet,
  createTestEventLog,
  getExpectedTestResult,
  expectCloseTo,
  assertTokenReplayResult,
  computeAlignment,
  formatTokenReplayResult,
  formatAlignment,
} from './conformance/token-replay.js';
export type {
  TokenReplayConfig,
  TokenReplayTrace,
  ConformanceDeviation,
  TokenReplayResult,
  PetriNetForReplay,
  Alignment,
  AlignmentConfig,
} from './conformance/token-replay.js';
export * from './utils/index.js';

// Performance Baseline Measurement
export {
  generateTestEventLogs,
  measureAlgorithm,
  formatMeasurement,
  generateSummaryTable,
  colorCodeLatency,
  getMemorySnapshot,
} from './perf-baseline.js';
export type { TestEventLog, MemorySnapshot, Measurement, BenchmarkResult } from './perf-baseline.js';
