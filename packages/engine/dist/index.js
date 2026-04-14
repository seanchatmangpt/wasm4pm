/**
 * @pictl/engine
 * Engine lifecycle and state machine for wasm4pm
 * Provides state management, error handling, and execution orchestration
 */
// Engine lifecycle and state machine
export { Engine, createSimpleEngine, createFullEngine } from './engine.js';
// Transition rules and validation
export { VALID_TRANSITIONS, canTransition, getValidTransitions, TransitionValidator, } from './transitions.js';
// Lifecycle management (StateMachine)
export { StateMachine } from './lifecycle.js';
// Status tracking
export { StatusTracker, formatError, formatStatus } from './status.js';
// Plan execution
export { executePlan, topologicalSortPlan, validatePlan, createStepDispatcher, } from './execution.js';
// Bootstrap
export { bootstrapEngine, createBootstrapError } from './bootstrap.js';
// Watch mode (heartbeat + checkpointing)
export { WatchSession, heartbeatToStatusUpdate } from './watch.js';
// Checkpointing
export { CheckpointManager } from './checkpointing.js';
// WASM loader
export { WasmLoader, createWasmLoader, getWasmLoader } from './wasm-loader.js';
// Re-export error code for tests
export { WasmErrorCode } from './wasm-loader.js';
