/**
 * @wasm4pm/engine
 * Engine lifecycle and state machine for wasm4pm
 * Provides state management, error handling, and execution orchestration
 */
/**
 * Engine — Orchestrates WASM kernel, planning, and execution with fault tolerance.
 * @description Manages state machine transitions, bootstrap, planning, runs, watch mode, and recovery.
 * @example const engine = await createFullEngine(wasm); await engine.bootstrap(); const plan = await engine.plan(config);
 */
export { Engine, createSimpleEngine, createFullEngine } from './engine.js';
export type { Kernel, Planner, Executor } from './engine.js';
export type { StateMetadata } from './state.js';
export { STATE_METADATA, ALL_STATES, isOperationalState, isTerminalState, isProcessingState, } from './state.js';
export { VALID_TRANSITIONS, canTransition, getValidTransitions, TransitionValidator, } from './transitions.js';
/**
 * StateMachine — Low-level state transitions (uninitialized → ready → running → watching / failed / degraded).
 * @description Enforces VALID_TRANSITIONS; provides transition history and MTTR calculation for fault recovery.
 * @example sm.transition('bootstrapping'); const history = sm.getTransitionHistory();
 */
export { StateMachine } from './lifecycle.js';
export type { LifecycleEvent } from './lifecycle.js';
export { StatusTracker, formatError, formatStatus } from './status.js';
/**
 * executePlan — Runs an ExecutionPlan DAG with topological sorting and step dispatch.
 * @description Executes source → algorithm → sink nodes; streams results, handles errors, emits OTEL spans.
 * @example const result = await executePlan(plan, { kernel, context });
 */
export { executePlan, topologicalSortPlan, validatePlan, createStepDispatcher, } from './execution.js';
export type { ExecutionContext, StepDispatcher, StepHandler, StepResult } from './execution.js';
/**
 * bootstrapEngine — Initializes WASM kernel, validates binary, checks backend availability.
 * @description Loads wasm4pm binary, tests algorithm registry, transitions engine to 'ready' state.
 * @example const engine = await bootstrapEngine(config);
 */
export { bootstrapEngine, createBootstrapError } from './bootstrap.js';
export type { BootstrapKernel, BootstrapResult } from './bootstrap.js';
export { WatchSession, heartbeatToStatusUpdate } from './watch.js';
export type { WatchConfig, HeartbeatEvent } from './watch.js';
export { CheckpointManager } from './checkpointing.js';
export type { Checkpoint } from './checkpointing.js';
export { MemoryCheckpointStore, FileCheckpointStore, SqliteCheckpointStore, type ICheckpointStore, type CheckpointMetadata, type RunFilter, } from './checkpoint-store.js';
export { CrashDetector, AutonomicRecovery, type ProcessLock, type CrashDetectionResult, } from './crash-detector.js';
export { SignalHandler, type SignalHandlerConfig } from './signals.js';
/**
 * AutonomousRecoveryOrchestrator — Continuous monitoring, crash detection, and recovery execution
 * @description Monitors engine health, detects crashes via lock files, makes recovery decisions (Rank-1/2/3 oracles)
 * @description Executes recovery with MTTR <1s guarantee per critical-constraints.md
 * @example const orchest = new AutonomousRecoveryOrchestrator(engine, detector, store, manager, runId);
 *          orchest.start(); // begin monitoring loop
 */
export { AutonomousRecoveryOrchestrator } from './autonomous-recovery-loop.js';
export type { HealthCheckResult, RecoveryDecision, RecoveryExecutionResult, } from './autonomous-recovery-loop.js';
/**
 * CheckpointGarbageCollector — Automated disk space management for checkpoints and lock files
 * @description Implements automated cleanup of old checkpoints (>7 days), stale lock files (>24h), and storage quota management
 * @description Emits OTEL spans for observability; triggers aggressive cleanup if storage >2GB
 * @example const gc = new CheckpointGarbageCollector(store, lockDir); await gc.triggerGarbageCollection();
 */
export { CheckpointGarbageCollector } from './checkpoint-gc.js';
export type { CheckpointStorageStats, GarbageCollectionStats, LockCleanupStats, } from './checkpoint-gc.js';
/**
 * WasmLoader — Singleton WASM binary management with soft/hard reset and health checks.
 * @description Loads, caches, and validates wasm4pm.wasm; supports local dev and production targets.
 * @example const loader = getWasmLoader(); const wasm = await loader.get();
 */
export { WasmLoader, createWasmLoader, getWasmLoader } from './wasm-loader.js';
export type { WasmModule, WasmLoaderConfig, WasmLoaderStatus } from './wasm-loader.js';
export { WasmErrorCode, WasmLoadError } from './wasm-loader.js';
export { FederationController, FederationCircuitBreaker, initializeFederationStack, planFederationIntegration, } from './federation.js';
export type { BackendState, CircuitBreakerState, DecisionTraceEntry } from './federation.js';
export { NullBackend } from './null-backend.js';
export { computeObjectiveScores, makeAutonomicDecision, validatePreferences } from './autonomic-decision.js';
export type { MultiObjectiveScores, DecisionPreferences, AutonomicDecision, } from './autonomic-decision.js';
export { ProtectionManager, DegradationLevel } from './protection-layer.js';
export type { AlgorithmCircuitBreaker, ProtectionDecision, } from './protection-layer.js';
export { recommendAlgorithm, recommendProfile, optimize, } from './optimization-engine.js';
export type { AlgorithmCharacteristics, LogCharacteristics, AlgorithmRecommendation, ProfileRecommendation, OptimizationResult, DeploymentProfile, } from './optimization-engine.js';
//# sourceMappingURL=index.d.ts.map