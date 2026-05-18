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
export { STATE_METADATA, ALL_STATES, isOperationalState, isTerminalState, isProcessingState, } from './state.js';
// Transition rules and validation
export { VALID_TRANSITIONS, canTransition, getValidTransitions, TransitionValidator, } from './transitions.js';
// Lifecycle management (StateMachine)
/**
 * StateMachine — Low-level state transitions (uninitialized → ready → running → watching / failed / degraded).
 * @description Enforces VALID_TRANSITIONS; provides transition history and MTTR calculation for fault recovery.
 * @example sm.transition('bootstrapping'); const history = sm.getTransitionHistory();
 */
export { StateMachine } from './lifecycle.js';
// Status tracking
export { StatusTracker, formatError, formatStatus } from './status.js';
// Plan execution
/**
 * executePlan — Runs an ExecutionPlan DAG with topological sorting and step dispatch.
 * @description Executes source → algorithm → sink nodes; streams results, handles errors, emits OTEL spans.
 * @example const result = await executePlan(plan, { kernel, context });
 */
export { executePlan, topologicalSortPlan, validatePlan, createStepDispatcher, } from './execution.js';
// Bootstrap
/**
 * bootstrapEngine — Initializes WASM kernel, validates binary, checks backend availability.
 * @description Loads wasm4pm binary, tests algorithm registry, transitions engine to 'ready' state.
 * @example const engine = await bootstrapEngine(config);
 */
export { bootstrapEngine, createBootstrapError } from './bootstrap.js';
// Watch mode (heartbeat + checkpointing)
export { WatchSession, heartbeatToStatusUpdate } from './watch.js';
// Checkpointing
export { CheckpointManager } from './checkpointing.js';
// WASM loader
/**
 * WasmLoader — Singleton WASM binary management with soft/hard reset and health checks.
 * @description Loads, caches, and validates wasm4pm.wasm; supports local dev and production targets.
 * @example const loader = getWasmLoader(); const wasm = await loader.get();
 */
export { WasmLoader, createWasmLoader, getWasmLoader } from './wasm-loader.js';
// Re-export error codes and classified load error for tests and consumers
export { WasmErrorCode, WasmLoadError } from './wasm-loader.js';
// Federation and execution modes (Section 5)
export { FederationController, FederationCircuitBreaker, initializeFederationStack, planFederationIntegration, } from './federation.js';
// NullBackend sentinel
export { NullBackend } from './null-backend.js';
