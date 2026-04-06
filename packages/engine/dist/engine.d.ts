/**
 * engine.ts
 * Main Engine class implementing the lifecycle and state machine
 * Orchestrates bootstrap, planning, execution, and monitoring
 */
import { EngineState, ExecutionPlan, ExecutionReceipt, EngineStatus, StatusUpdate, ErrorInfo } from '@wasm4pm/types';
import { LifecycleEvent } from './lifecycle.js';
import { WasmLoaderConfig, WasmModule } from './wasm-loader.js';
import { WatchSession, WatchConfig } from './watch.js';
import { ObservabilityConfig } from '@wasm4pm/observability';
/**
 * Kernel interface - abstract definition of WASM kernel
 * The engine calls kernel methods but doesn't depend on implementation details
 */
export interface Kernel {
    init(): Promise<void>;
    shutdown(): Promise<void>;
    isReady(): boolean;
}
/**
 * Planner interface - generates execution plans
 */
export interface Planner {
    plan(config: unknown): Promise<ExecutionPlan>;
}
/**
 * Executor interface - runs execution plans
 */
export interface Executor {
    run(plan: ExecutionPlan): Promise<ExecutionReceipt>;
    watch(plan: ExecutionPlan): AsyncIterable<StatusUpdate>;
}
/**
 * Main Engine class orchestrating the complete lifecycle
 * Manages state transitions, error handling, and execution coordination
 * Integrated with observability for OTEL tracing per PRD §18
 */
export declare class Engine {
    private stateMachine;
    private statusTracker;
    private kernel;
    private planner?;
    private executor?;
    private currentRunId?;
    private transitionUnsubscribe?;
    private wasmLoader;
    private wasmModule?;
    private watchSession?;
    private watchConfig?;
    private observability;
    private traceId?;
    private requiredOtelAttrs?;
    private observabilityErrors;
    /**
     * Creates a new Engine instance
     * @param kernel WASM kernel implementation
     * @param planner Optional planner for generating execution plans
     * @param executor Optional executor for running plans
     * @param wasmLoaderConfig Optional WASM loader configuration
     * @param observabilityConfig Optional observability configuration (OTEL, JSON logging)
     * @param watchConfig Optional watch mode configuration (heartbeat, checkpointing)
     */
    constructor(kernel: Kernel, planner?: Planner, executor?: Executor, wasmLoaderConfig?: WasmLoaderConfig, observabilityConfig?: ObservabilityConfig, watchConfig?: WatchConfig);
    /**
     * Gets the current engine state
     */
    state(): EngineState;
    /**
     * Gets the current engine status
     */
    status(): EngineStatus;
    /**
     * Bootstraps the engine: loads WASM, initializes kernel
     * Transitions: uninitialized -> bootstrapping -> ready | failed
     * Emits observability events for bootstrap lifecycle
     */
    bootstrap(): Promise<void>;
    /**
     * Plans execution based on configuration
     * Transitions: ready -> planning -> ready | running | failed
     * Requires: bootstrap() must have been called first
     * Emits observability events for plan generation
     */
    plan(config: unknown): Promise<ExecutionPlan>;
    /**
     * Runs an execution plan
     * Transitions: ready -> running -> ready | watching | degraded | failed
     * Requires: bootstrap() and plan() must have been called first
     * Emits observability events for execution lifecycle
     */
    run(plan: ExecutionPlan): Promise<ExecutionReceipt>;
    /**
     * Watches execution progress with streaming status updates
     * Transitions: ready -> watching -> ready | degraded | failed
     * Includes heartbeat and checkpointing via WatchSession
     */
    watch(plan: ExecutionPlan): AsyncIterable<StatusUpdate>;
    /**
     * Gets the current watch session (if active)
     */
    getWatchSession(): WatchSession | undefined;
    /**
     * Transitions engine to degraded state on non-fatal error
     * Allows recovery attempts
     */
    degrade(error: ErrorInfo, reason?: string): Promise<void>;
    /**
     * Attempts recovery from degraded state
     * Transitions: degraded -> bootstrapping -> ready
     */
    recover(): Promise<void>;
    /**
     * Shuts down the engine
     * Transitions: any state -> failed (terminal)
     */
    shutdown(): Promise<void>;
    /**
     * Checks if engine is in a terminal/failed state
     */
    isFailed(): boolean;
    /**
     * Checks if engine is operational and ready
     */
    isReady(): boolean;
    /**
     * Gets transition history for debugging
     */
    getTransitionHistory(): LifecycleEvent[];
    /**
     * Gets the initialized WASM module
     * Throws if module is not initialized (bootstrap() must be called first)
     */
    getWasmModule(): WasmModule;
    /**
     * Gets WASM loader status including memory usage and version info
     */
    getWasmStatus(): import("./wasm-loader.js").WasmLoaderStatus;
    /**
     * Gets WASM memory statistics
     */
    getWasmMemoryStats(): {
        usedBytes: number;
        totalBytes: number;
        maxBytes?: number;
        usagePercent: number;
    };
    private generateRunId;
    private createStatusUpdate;
    private onStateTransition;
    /**
     * Get observability statistics from the observability wrapper
     */
    getObservabilityStats(): {
        emitCount: number;
        errorCount: number;
        errorRate: number;
    };
    /**
     * Get observability errors that have been recorded
     */
    getObservabilityErrors(): Array<{
        timestamp: Date;
        layer: string;
        message: string;
    }>;
    /**
     * Shutdown observability layer gracefully
     */
    shutdownObservability(): Promise<{
        success: boolean;
        error?: string;
        timestamp: Date;
    }>;
}
/**
 * Creates a simple engine with kernel only (for testing)
 */
export declare function createSimpleEngine(kernel: Kernel, wasmConfig?: WasmLoaderConfig, obsConfig?: ObservabilityConfig): Engine;
/**
 * Creates a fully configured engine with kernel, planner, and executor
 */
export declare function createFullEngine(kernel: Kernel, planner: Planner, executor: Executor, wasmConfig?: WasmLoaderConfig, obsConfig?: ObservabilityConfig, watchConfig?: WatchConfig): Engine;
//# sourceMappingURL=engine.d.ts.map