export { checkParity, checkParityBatch } from './parity.js';
export type { ParityResult, PlannerLike } from './parity.js';

export { checkDeterminism, stableReceiptHash, receiptsMatch } from './determinism.js';
export type { DeterminismResult } from './determinism.js';

export {
  createCliTestEnv,
  runCli,
  assertExitCode,
  assertJsonOutput,
  assertErrorCode,
  writeTestConfig,
  readReceipt,
  EXIT_CODES,
} from './cli.js';
export type { CliResult, CliTestEnv, ExitCodeName } from './cli.js';

export { OtelCapture, createOtelCapture } from './otel-capture.js';
export type {
  CapturedOtelSpan,
  CapturedJsonEvent,
  CapturedCliEvent,
  OtelCaptureStats,
} from './otel-capture.js';

export { OcelHarvester } from './ocel-harvester.js';
export type { OcelObject, OcelEvent, OcelEventLog } from './ocel-harvester.js';

export { AlgorithmDiscovery, ALGORITHM_PROFILES } from './algorithm-discovery.js';
export type { AlgorithmResult, DiscoveryResults } from './algorithm-discovery.js';

export { ConformanceChecker } from './conformance-checker.js';
export type {
  ConformanceResult,
  ConformanceViolation,
  DiscoveredModel,
} from './conformance-checker.js';

export { SoundnessVerifier } from './soundness-verifier.js';
export type { SoundnessResult } from './soundness-verifier.js';

export { ReceiptValidator, createReceiptValidator } from './receipt-validator.js';
export type { ReceiptValidationError, ReceiptValidationResult } from './receipt-validator.js';

export { SwarmCoordinationHarness, createSwarmCoordinationHarness } from './swarm-coordinator.js';
export type {
  ConsensusVerificationResult,
  DivergenceReport,
  ConvergenceTimingResult,
  FailureIsolationResult,
} from './swarm-coordinator.js';
