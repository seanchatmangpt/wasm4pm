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
export { Engine, createSimpleEngine, createFullEngine } from './engine';
export type { Kernel, Planner, Executor } from './engine';

// State definitions and metadata
export {
  STATE_METADATA,
  ALL_STATES,
  isOperationalState,
  isTerminalState,
  isProcessingState,
} from './state';
export type { StateMetadata } from './state';

// Transition rules and validation
export {
  VALID_TRANSITIONS,
  canTransition,
  getValidTransitions,
  TransitionValidator,
} from './transitions';

// Lifecycle management (StateMachine)
export { StateMachine } from './lifecycle';
export type { LifecycleEvent } from './lifecycle';

// Status tracking
export { StatusTracker, formatError, formatStatus } from './status';

// Plan execution
export {
  executePlan,
  topologicalSortPlan,
  validatePlan,
  createStepDispatcher,
} from './execution';
export type {
  ExecutionContext,
  StepDispatcher,
  StepHandler,
  StepResult,
} from './execution';

// Bootstrap
export { bootstrapEngine, createBootstrapError } from './bootstrap';
export type { BootstrapKernel, BootstrapResult } from './bootstrap';

// Watch mode (heartbeat + checkpointing)
export { WatchSession, heartbeatToStatusUpdate } from './watch';
export type { WatchConfig, HeartbeatEvent } from './watch';

// Checkpointing
export { CheckpointManager } from './checkpointing';
export type { Checkpoint } from './checkpointing';

// WASM loader
export {
  WasmLoader,
  createWasmLoader,
  getWasmLoader,
  WasmErrorCode,
} from './wasm-loader';
export type {
  WasmModule,
  WasmLoaderConfig,
  WasmLoaderStatus,
} from './wasm-loader';
