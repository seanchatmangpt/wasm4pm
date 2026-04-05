/**
 * @wasm4pm/engine
 * Engine lifecycle and state machine for wasm4pm
 * Provides state management, error handling, and execution orchestration
 */
export type { EngineState, EngineStatus, ExecutionPlan, ExecutionReceipt, ErrorInfo, StatusUpdate, PlanStep, } from '@wasm4pm/types';
export { Engine, createSimpleEngine, createFullEngine } from './engine';
export type { Kernel, Planner, Executor } from './engine';
export { STATE_METADATA, ALL_STATES, isOperationalState, isTerminalState, isProcessingState, } from './state';
export type { StateMetadata } from './state';
export { VALID_TRANSITIONS, canTransition, getValidTransitions, TransitionValidator, } from './transitions';
export { StateMachine } from './lifecycle';
export type { LifecycleEvent } from './lifecycle';
export { StatusTracker, formatError, formatStatus } from './status';
export { executePlan, topologicalSortPlan, validatePlan, createStepDispatcher, } from './execution';
export type { ExecutionContext, StepDispatcher, StepHandler, StepResult, } from './execution';
export { bootstrapEngine, createBootstrapError } from './bootstrap';
export type { BootstrapKernel, BootstrapResult } from './bootstrap';
export { WatchSession, heartbeatToStatusUpdate } from './watch';
export type { WatchConfig, HeartbeatEvent } from './watch';
export { CheckpointManager } from './checkpointing';
export type { Checkpoint } from './checkpointing';
export { WasmLoader, createWasmLoader, getWasmLoader, WasmErrorCode, } from './wasm-loader';
export type { WasmModule, WasmLoaderConfig, WasmLoaderStatus, } from './wasm-loader';
//# sourceMappingURL=index.d.ts.map