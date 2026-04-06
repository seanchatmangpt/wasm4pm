/**
 * @wasm4pm/engine
 * Engine lifecycle and state machine for wasm4pm
 * Provides state management, error handling, and execution orchestration
 */

// Re-export types from @wasm4pm/types
export type {
  EngineState,
  EngineStatus,
  ExecutionPlan,
  ExecutionReceipt,
  ErrorInfo,
  StatusUpdate,
  PlanStep,
} from '@wasm4pm/types';

// Engine lifecycle and state machine
export { Engine, createSimpleEngine, createFullEngine } from './engine.js';
export type { Kernel, Planner, Executor } from './engine.js';

// State definitions and metadata
export {
  STATE_METADATA,
  ALL_STATES,
  isOperationalState,
  isTerminalState,
  isProcessingState,
} from './state.js';
export type { StateMetadata } from './state.js';

// Transition rules and validation
export {
  VALID_TRANSITIONS,
  canTransition,
  getValidTransitions,
  TransitionValidator,
} from './transitions.js';

// Lifecycle management (StateMachine)
export { StateMachine } from './lifecycle.js';
export type { LifecycleEvent } from './lifecycle.js';

// Status tracking
export { StatusTracker, formatError, formatStatus } from './status.js';

// Plan execution
export {
  executePlan,
  topologicalSortPlan,
  validatePlan,
  createStepDispatcher,
} from './execution.js';
export type {
  ExecutionContext,
  StepDispatcher,
  StepHandler,
  StepResult,
} from './execution.js';

// Bootstrap
export { bootstrapEngine, createBootstrapError } from './bootstrap.js';
export type { BootstrapKernel, BootstrapResult } from './bootstrap.js';

// Watch mode (heartbeat + checkpointing)
export { WatchSession, heartbeatToStatusUpdate } from './watch.js';
export type { WatchConfig, HeartbeatEvent } from './watch.js';

// Checkpointing
export { CheckpointManager } from './checkpointing.js';
export type { Checkpoint } from './checkpointing.js';

// WASM loader
export {
  WasmLoader,
  createWasmLoader,
  getWasmLoader,
  WasmErrorCode,
} from './wasm-loader.js';
export type {
  WasmModule,
  WasmLoaderConfig,
  WasmLoaderStatus,
} from './wasm-loader.js';
