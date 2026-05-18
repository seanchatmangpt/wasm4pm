/**
 * @wasm4pm/engine
 * Engine lifecycle and state machine for wasm4pm
 * Provides state management, error handling, and execution orchestration
 */
export type { EngineState, EngineStatus, ExecutionPlan, ExecutionReceipt, EngineError, StatusUpdate, PlanStep, } from '@wasm4pm/contracts';
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
//# sourceMappingURL=index.d.ts.map