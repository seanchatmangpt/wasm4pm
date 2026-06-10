/**
 * @wasm4pm/engine
 * Engine lifecycle and state machine for wasm4pm
 * Provides state management, error handling, and execution orchestration
 */

// Re-export types from @wasm4pm/contracts

// Engine lifecycle and state machine
/**
 * Engine — Orchestrates WASM kernel, planning, and execution with fault tolerance.
 * @description Manages state machine transitions, bootstrap, planning, runs, watch mode, and recovery.
 * @example const engine = await createFullEngine(wasm); await engine.bootstrap(); const plan = await engine.plan(config);
 */
export { Engine, createSimpleEngine, createFullEngine } from './engine.js';
export type {
  Kernel,
  Planner,
  Executor,
  EngineHealthStatus,
  DiagnosticLevel,
  DiagnosticResult,
  EngineMetrics,
  KernelRunResult,
} from './engine.js';

// State definitions and metadata
export type { StateMetadata } from './state.js';
export {
  STATE_METADATA,
  ALL_STATES,
  isOperationalState,
  isTerminalState,
  isProcessingState,
} from './state.js';

// Transition rules and validation
export {
  VALID_TRANSITIONS,
  canTransition,
  getValidTransitions,
  TransitionValidator,
} from './transitions.js';

// Lifecycle management (StateMachine)
/**
 * StateMachine — Low-level state transitions (uninitialized → ready → running → watching / failed / degraded).
 * @description Enforces VALID_TRANSITIONS; provides transition history and MTTR calculation for fault recovery.
 * @example sm.transition('bootstrapping'); const history = sm.getTransitionHistory();
 */
export { StateMachine } from './lifecycle.js';
export type { LifecycleEvent } from './lifecycle.js';

// Status tracking
export { StatusTracker, formatError, formatStatus } from './status.js';

// Plan execution
/**
 * executePlan — Runs an ExecutionPlan DAG with topological sorting and step dispatch.
 * @description Executes source → algorithm → sink nodes; streams results, handles errors, emits OTEL spans.
 * @example const result = await executePlan(plan, { kernel, context });
 */
export {
  executePlan,
  topologicalSortPlan,
  validatePlan,
  createStepDispatcher,
} from './execution.js';
export type { ExecutionContext, StepDispatcher, StepHandler, StepResult } from './execution.js';

// Bootstrap
/**
 * bootstrapEngine — Initializes WASM kernel, validates binary, checks backend availability.
 * @description Loads wasm4pm binary, tests algorithm registry, transitions engine to 'ready' state.
 * @example const engine = await bootstrapEngine(config);
 */
export { bootstrapEngine, createBootstrapError } from './bootstrap.js';
export type { BootstrapKernel, BootstrapResult } from './bootstrap.js';

// Watch mode (heartbeat + checkpointing)
export { WatchSession, heartbeatToStatusUpdate } from './watch.js';
export type { WatchConfig, HeartbeatEvent } from './watch.js';

// Checkpointing
export { CheckpointManager } from './checkpointing.js';
export type { Checkpoint } from './checkpointing.js';

// Checkpoint persistence (Phase 1)
export {
  MemoryCheckpointStore,
  FileCheckpointStore,
  type ICheckpointStore,
  type CheckpointMetadata,
  type RunFilter,
} from './checkpoint-store.js';
export {
  CrashDetector,
  AutonomicRecovery,
  type ProcessLock,
  type CrashDetectionResult,
} from './crash-detector.js';

// Signal handling and crash recovery (Phase 1.5)
export { SignalHandler, type SignalHandlerConfig } from './signals.js';

// Autonomous recovery orchestration (Phase 2 — Cycle 40)
/**
 * AutonomousRecoveryOrchestrator — Continuous monitoring, crash detection, and recovery execution
 * @description Monitors engine health, detects crashes via lock files, makes recovery decisions (Rank-1/2/3 oracles)
 * @description Executes recovery with MTTR <1s guarantee per critical-constraints.md
 * @example const orchest = new AutonomousRecoveryOrchestrator(engine, detector, store, manager, runId);
 *          orchest.start(); // begin monitoring loop
 */
export { AutonomousRecoveryOrchestrator } from './autonomous-recovery-loop.js';
export type {
  HealthCheckResult,
  RecoveryDecision,
  RecoveryExecutionResult,
} from './autonomous-recovery-loop.js';

// Checkpoint garbage collection and lock cleanup (Phase 3 — Cycle 42)
/**
 * CheckpointGarbageCollector — Automated disk space management for checkpoints and lock files
 * @description Implements automated cleanup of old checkpoints (>7 days), stale lock files (>24h), and storage quota management
 * @description Emits OTEL spans for observability; triggers aggressive cleanup if storage >2GB
 * @example const gc = new CheckpointGarbageCollector(store, lockDir); await gc.triggerGarbageCollection();
 */
export { CheckpointGarbageCollector } from './checkpoint-gc.js';
export type {
  CheckpointStorageStats,
  GarbageCollectionStats,
  LockCleanupStats,
} from './checkpoint-gc.js';

// WASM loader
/**
 * WasmLoader — Singleton WASM binary management with soft/hard reset and health checks.
 * @description Loads, caches, and validates wasm4pm.wasm; supports local dev and production targets.
 * @example const loader = getWasmLoader(); const wasm = await loader.get();
 */
export { WasmLoader, createWasmLoader, getWasmLoader } from './wasm-loader.js';
export type { WasmModule, WasmLoaderConfig, WasmLoaderStatus } from './wasm-loader.js';

// Re-export error codes and classified load error for tests and consumers
export { WasmErrorCode, WasmLoadError } from './wasm-loader.js';

// Federation and execution modes (Section 5)
export {
  FederationController,
  FederationCircuitBreaker,
  initializeFederationStack,
  planFederationIntegration,
} from './federation.js';
export type { BackendState, CircuitBreakerState, DecisionTraceEntry } from './federation.js';

// NullBackend sentinel
export { NullBackend } from './null-backend.js';

// Autonomic system enhancements (new in Iteration 16)
export { computeObjectiveScores, makeAutonomicDecision, validatePreferences } from './autonomic-decision.js';
export type {
  MultiObjectiveScores,
  DecisionPreferences,
  AutonomicDecision,
} from './autonomic-decision.js';

export { ProtectionManager, DegradationLevel } from './protection-layer.js';
export type {
  AlgorithmCircuitBreaker,
  ProtectionDecision,
} from './protection-layer.js';

export {
  recommendAlgorithm,
  recommendProfile,
  optimize,
} from './optimization-engine.js';
export type {
  AlgorithmCharacteristics,
  LogCharacteristics,
  AlgorithmRecommendation,
  ProfileRecommendation,
  OptimizationResult,
  DeploymentProfile,
} from './optimization-engine.js';
