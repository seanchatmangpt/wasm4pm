/**
 * @wasm4pm/engine
 * Engine lifecycle and state machine for wasm4pm
 * Provides state management, error handling, and execution orchestration
 */
// Engine lifecycle and state machine
export { Engine, createSimpleEngine, createFullEngine } from './engine';
// State definitions and metadata
export { STATE_METADATA, ALL_STATES, isOperationalState, isTerminalState, isProcessingState, } from './state';
// Transition rules and validation
export { VALID_TRANSITIONS, canTransition, getValidTransitions, TransitionValidator, } from './transitions';
// Lifecycle management (StateMachine)
export { StateMachine } from './lifecycle';
// Status tracking
export { StatusTracker, formatError, formatStatus } from './status';
// Plan execution
export { executePlan, topologicalSortPlan, validatePlan, createStepDispatcher, } from './execution';
// Bootstrap
export { bootstrapEngine, createBootstrapError } from './bootstrap';
// Watch mode (heartbeat + checkpointing)
export { WatchSession, heartbeatToStatusUpdate } from './watch';
// Checkpointing
export { CheckpointManager } from './checkpointing';
// WASM loader
export { WasmLoader, createWasmLoader, getWasmLoader, WasmErrorCode, } from './wasm-loader';
