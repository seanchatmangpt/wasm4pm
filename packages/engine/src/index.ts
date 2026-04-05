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

// Lifecycle management
export { StateMachine, TransitionValidator } from './lifecycle';
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
};
