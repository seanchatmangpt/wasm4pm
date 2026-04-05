/**
 * engine.ts
 * Main Engine class implementing the lifecycle and state machine
 * Orchestrates bootstrap, planning, execution, and monitoring
 */

import {
  EngineState,
  ExecutionPlan,
  ExecutionReceipt,
  EngineStatus,
  StatusUpdate,
  ErrorInfo,
} from '@wasm4pm/types';
import { StateMachine, TransitionValidator, LifecycleEvent } from './lifecycle';
import { StatusTracker, formatStatus } from './status';
import { WasmLoader, WasmLoaderConfig, WasmModule } from './wasm-loader';
import {
  ObservabilityWrapper,
  Instrumentation,
  RequiredOtelAttributes,
  ObservabilityConfig,
} from '@wasm4pm/observability';

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
export class Engine {
  private stateMachine: StateMachine;
  private statusTracker: StatusTracker;
  private kernel: Kernel;
  private planner?: Planner;
  private executor?: Executor;
  private currentRunId?: string;
  private transitionUnsubscribe?: () => void;
  private wasmLoader: WasmLoader;
  private wasmModule?: WasmModule;
  private observability: ObservabilityWrapper;
  private traceId?: string;
  private requiredOtelAttrs?: RequiredOtelAttributes;
  private observabilityErrors: Array<{ timestamp: Date; layer: string; message: string }> = [];

  /**
   * Creates a new Engine instance
   * @param kernel WASM kernel implementation
   * @param planner Optional planner for generating execution plans
   * @param executor Optional executor for running plans
   * @param wasmLoaderConfig Optional WASM loader configuration
   * @param observabilityConfig Optional observability configuration (OTEL, JSON logging)
   */
  constructor(
    kernel: Kernel,
    planner?: Planner,
    executor?: Executor,
    wasmLoaderConfig?: WasmLoaderConfig,
    observabilityConfig?: ObservabilityConfig
  ) {
    this.kernel = kernel;
    this.planner = planner;
    this.executor = executor;
    this.stateMachine = new StateMachine();
    this.statusTracker = new StatusTracker();
    this.wasmLoader = WasmLoader.getInstance(wasmLoaderConfig);
    this.observability = new ObservabilityWrapper(observabilityConfig);

    // Subscribe to lifecycle events for logging and observability
    this.transitionUnsubscribe = this.stateMachine.onTransition((event) => {
      this.onStateTransition(event);
    });
  }

  /**
   * Gets the current engine state
   */
  state(): EngineState {
    return this.stateMachine.getState();
  }

  /**
   * Gets the current engine status
   */
  status(): EngineStatus {
    this.statusTracker.setState(this.state());
    return this.statusTracker.getStatus();
  }

  /**
   * Bootstraps the engine: loads WASM, initializes kernel
   * Transitions: uninitialized -> bootstrapping -> ready | failed
   * Emits observability events for bootstrap lifecycle
   */
  async bootstrap(): Promise<void> {
    // Initialize trace ID for this bootstrap operation
    if (!this.traceId) {
      this.traceId = Instrumentation.generateTraceId();
    }

    // Initialize required OTEL attributes (placeholder values for bootstrap)
    this.requiredOtelAttrs = this.requiredOtelAttrs || {
      'run.id': this.currentRunId || 'bootstrap',
      'config.hash': '',
      'input.hash': '',
      'plan.hash': '',
      'execution.profile': 'default',
      'source.kind': 'unknown',
      'sink.kind': 'unknown',
    };

    const bootstrapStart = Date.now();

    try {
      // Validate transition
      if (!this.stateMachine.canTransition('bootstrapping')) {
        throw new Error(
          `Cannot bootstrap from state: ${this.state()}. ` +
          `Valid transitions: ${this.stateMachine.getValidTransitions().join(', ')}`
        );
      }

      // Transition to bootstrapping
      this.stateMachine.transition('bootstrapping', 'Starting WASM and kernel initialization');
      this.statusTracker.setState('bootstrapping');

      // Emit state change event to bootstrapping
      const stateChangeStart = Instrumentation.createStateChangeEvent(
        this.traceId,
        'uninitialized',
        'bootstrapping',
        this.requiredOtelAttrs,
        { reason: 'Starting WASM and kernel initialization' }
      );
      this.observability.emitOtelSafe(stateChangeStart.otelEvent);

      // Initialize WASM module
      await this.wasmLoader.init();
      this.wasmModule = this.wasmLoader.get();

      // Initialize kernel
      await this.kernel.init();

      // Verify kernel is ready
      if (!this.kernel.isReady()) {
        throw new Error('Kernel initialization failed: kernel not ready');
      }

      // Transition to ready
      this.stateMachine.transition('ready', 'WASM and kernel initialized successfully');
      this.statusTracker.setState('ready');

      // Emit state change to ready
      const bootstrapDuration = Date.now() - bootstrapStart;
      const stateChangeReady = Instrumentation.createStateChangeEvent(
        this.traceId,
        'bootstrapping',
        'ready',
        this.requiredOtelAttrs,
        { reason: 'WASM and kernel initialized successfully' }
      );
      stateChangeReady.event.durationMs = bootstrapDuration;
      this.observability.emitOtelSafe(stateChangeReady.otelEvent);

      // Emit bootstrap metrics to JSON layer
      this.observability.emitJsonSafe({
        timestamp: new Date().toISOString(),
        component: 'engine',
        event_type: 'bootstrap_completed',
        run_id: this.requiredOtelAttrs['run.id'],
        data: {
          duration_ms: bootstrapDuration,
          trace_id: this.traceId,
        },
      });
    } catch (err) {
      const error: ErrorInfo = {
        code: 'BOOTSTRAP_FAILED',
        message: err instanceof Error ? err.message : String(err),
        severity: 'fatal',
        recoverable: true,
        suggestion: 'Check WASM module and kernel configuration and try again',
      };

      this.statusTracker.addError(error);

      // Emit error event
      if (this.requiredOtelAttrs) {
        const bootstrapDuration = Date.now() - bootstrapStart;
        const errorEvent = Instrumentation.createErrorEvent(
          this.traceId!,
          error.code,
          error.message,
          this.requiredOtelAttrs,
          { severity: error.severity, context: error.context }
        );
        this.observability.emitOtelSafe(errorEvent.otelEvent);
        this.observability.emitJsonSafe(errorEvent.jsonEvent);
      }

      this.stateMachine.transition('failed', `Bootstrap failed: ${error.message}`);
      this.statusTracker.setState('failed');

      throw err;
    }
  }

  /**
   * Plans execution based on configuration
   * Transitions: ready -> planning -> ready | running | failed
   * Requires: bootstrap() must have been called first
   * Emits observability events for plan generation
   */
  async plan(config: unknown): Promise<ExecutionPlan> {
    const planStart = Date.now();

    try {
      // Validate state
      if (this.state() !== 'ready') {
        throw new Error(
          `Cannot plan in state: ${this.state()}. Engine must be ready. ` +
          `Call bootstrap() first if engine is uninitialized.`
        );
      }

      if (!this.planner) {
        throw new Error('No planner configured');
      }

      // Transition to planning
      this.stateMachine.transition('planning', 'Starting plan generation');
      this.statusTracker.setState('planning');

      // Emit state change to planning
      const stateChangePlanning = Instrumentation.createStateChangeEvent(
        this.traceId!,
        'ready',
        'planning',
        this.requiredOtelAttrs!,
        { reason: 'Starting plan generation' }
      );
      this.observability.emitOtelSafe(stateChangePlanning.otelEvent);

      // Generate execution plan
      const plan = await this.planner.plan(config);

      // Calculate plan hash (simple hash of plan ID + steps count)
      const planHash = Buffer.from(plan.planId + plan.totalSteps).toString('base64').substring(0, 32);
      this.requiredOtelAttrs!['plan.hash'] = planHash;

      // Return to ready state after planning (can then run or plan again)
      this.stateMachine.transition('ready', 'Plan generated successfully');
      this.statusTracker.setState('ready');
      this.statusTracker.setPlan(plan);

      // Emit plan generated event
      const planDuration = Date.now() - planStart;
      const planGenerated = Instrumentation.createPlanGeneratedEvent(
        this.traceId!,
        plan.planId,
        planHash,
        plan.totalSteps,
        this.requiredOtelAttrs!,
        { estimatedDurationMs: plan.estimatedDurationMs }
      );
      planGenerated.event.durationMs = planDuration;
      this.observability.emitOtelSafe(planGenerated.otelEvent);

      // Emit state change back to ready
      const stateChangeReady = Instrumentation.createStateChangeEvent(
        this.traceId!,
        'planning',
        'ready',
        this.requiredOtelAttrs!,
        { reason: 'Plan generated successfully' }
      );
      stateChangeReady.event.durationMs = planDuration;
      this.observability.emitOtelSafe(stateChangeReady.otelEvent);

      // Emit JSON event with plan metrics
      this.observability.emitJsonSafe({
        timestamp: new Date().toISOString(),
        component: 'engine',
        event_type: 'plan_generated',
        run_id: this.requiredOtelAttrs!['run.id'],
        data: {
          plan_id: plan.planId,
          plan_hash: planHash,
          steps: plan.totalSteps,
          estimated_duration_ms: plan.estimatedDurationMs || 0,
          duration_ms: planDuration,
          trace_id: this.traceId,
        },
      });

      return plan;
    } catch (err) {
      const error: ErrorInfo = {
        code: 'PLANNING_FAILED',
        message: err instanceof Error ? err.message : String(err),
        severity: 'error',
        recoverable: true,
        suggestion: 'Verify configuration is valid and try again',
      };

      this.statusTracker.addError(error);

      // Emit error event
      if (this.requiredOtelAttrs) {
        const errorEvent = Instrumentation.createErrorEvent(
          this.traceId!,
          error.code,
          error.message,
          this.requiredOtelAttrs,
          { severity: error.severity }
        );
        this.observability.emitOtelSafe(errorEvent.otelEvent);
        this.observability.emitJsonSafe(errorEvent.jsonEvent);
      }

      // Try to recover to ready or degrade
      const recoveryState = TransitionValidator.suggestRecoveryState(this.state(), [error]);
      if (recoveryState && this.stateMachine.canTransition(recoveryState)) {
        this.stateMachine.transition(recoveryState, `Recovered from planning error`);
      }

      this.statusTracker.setState(this.state());
      throw err;
    }
  }

  /**
   * Runs an execution plan
   * Transitions: ready -> running -> ready | watching | degraded | failed
   * Requires: bootstrap() and plan() must have been called first
   * Emits observability events for execution lifecycle
   */
  async run(plan: ExecutionPlan): Promise<ExecutionReceipt> {
    const runStart = Date.now();

    try {
      // Validate state
      if (this.state() !== 'ready') {
        throw new Error(
          `Cannot run in state: ${this.state()}. Engine must be ready.`
        );
      }

      if (!this.executor) {
        throw new Error('No executor configured');
      }

      // Generate run ID
      this.currentRunId = this.generateRunId();
      this.statusTracker.setRunId(this.currentRunId);
      this.statusTracker.setPlan(plan);
      this.statusTracker.start();

      // Update required OTEL attributes with run ID
      this.requiredOtelAttrs!['run.id'] = this.currentRunId;

      // Transition to running
      this.stateMachine.transition('running', `Starting execution: ${this.currentRunId}`);
      this.statusTracker.setState('running');

      // Emit state change to running
      const stateChangeRunning = Instrumentation.createStateChangeEvent(
        this.traceId!,
        'ready',
        'running',
        this.requiredOtelAttrs!,
        { reason: `Starting execution: ${this.currentRunId}` }
      );
      this.observability.emitOtelSafe(stateChangeRunning.otelEvent);

      // Execute the plan
      const receipt = await this.executor.run(plan);

      // Return to ready after execution
      this.statusTracker.finish();
      this.stateMachine.transition('ready', 'Execution completed successfully');
      this.statusTracker.setState('ready');

      // Emit state change back to ready
      const runDuration = Date.now() - runStart;
      const stateChangeReady = Instrumentation.createStateChangeEvent(
        this.traceId!,
        'running',
        'ready',
        this.requiredOtelAttrs!,
        { reason: 'Execution completed successfully' }
      );
      stateChangeReady.event.durationMs = runDuration;
      this.observability.emitOtelSafe(stateChangeReady.otelEvent);

      // Emit JSON event with execution metrics
      this.observability.emitJsonSafe({
        timestamp: new Date().toISOString(),
        component: 'engine',
        event_type: 'execution_completed',
        run_id: this.currentRunId,
        data: {
          run_id: this.currentRunId,
          plan_id: plan.planId,
          duration_ms: runDuration,
          progress: receipt.progress,
          error_count: receipt.errors.length,
          trace_id: this.traceId,
        },
      });

      return receipt;
    } catch (err) {
      this.statusTracker.finish();

      const error: ErrorInfo = {
        code: 'EXECUTION_FAILED',
        message: err instanceof Error ? err.message : String(err),
        severity: 'error',
        recoverable: true,
        suggestion: 'Review execution logs and try again',
      };

      this.statusTracker.addError(error);

      // Emit error event
      if (this.requiredOtelAttrs) {
        const runDuration = Date.now() - runStart;
        const errorEvent = Instrumentation.createErrorEvent(
          this.traceId!,
          error.code,
          error.message,
          this.requiredOtelAttrs,
          { severity: error.severity }
        );
        this.observability.emitOtelSafe(errorEvent.otelEvent);
        this.observability.emitJsonSafe(errorEvent.jsonEvent);
      }

      // Try to recover or degrade
      const recoveryState = TransitionValidator.suggestRecoveryState(this.state(), [error]);
      if (recoveryState && this.stateMachine.canTransition(recoveryState)) {
        this.stateMachine.transition(recoveryState, `Recovered from execution error`);
      } else {
        this.stateMachine.transition('failed', `Execution failed: ${error.message}`);
      }

      this.statusTracker.setState(this.state());

      throw err;
    }
  }

  /**
   * Watches execution progress with streaming status updates
   * Transitions: ready -> watching -> ready | degraded | failed
   * Emits StatusUpdate for each change
   */
  async *watch(plan: ExecutionPlan): AsyncIterable<StatusUpdate> {
    try {
      // Validate state
      if (this.state() !== 'ready') {
        throw new Error(
          `Cannot watch in state: ${this.state()}. Engine must be ready.`
        );
      }

      if (!this.executor) {
        throw new Error('No executor configured');
      }

      // Generate run ID
      this.currentRunId = this.generateRunId();
      this.statusTracker.setRunId(this.currentRunId);
      this.statusTracker.setPlan(plan);
      this.statusTracker.start();

      // Transition to watching
      this.stateMachine.transition('watching', `Starting watched execution: ${this.currentRunId}`);
      this.statusTracker.setState('watching');

      // Yield initial status
      yield this.createStatusUpdate();

      // Watch execution
      const updates = this.executor.watch(plan);
      for await (const update of updates) {
        // Update tracker with new state and progress
        this.statusTracker.setState(update.state);
        if (update.error) {
          this.statusTracker.addError(update.error);
        }

        // Yield the update
        yield update;

        // If execution ended, transition state
        if (update.state === 'ready' || update.state === 'failed') {
          this.statusTracker.finish();
          this.stateMachine.transition('ready', 'Watched execution completed');
          break;
        }
      }

      this.statusTracker.setState(this.state());
    } catch (err) {
      this.statusTracker.finish();

      const error: ErrorInfo = {
        code: 'WATCH_FAILED',
        message: err instanceof Error ? err.message : String(err),
        severity: 'error',
        recoverable: true,
      };

      this.statusTracker.addError(error);

      // Try to recover
      const recoveryState = TransitionValidator.suggestRecoveryState(this.state(), [error]);
      if (recoveryState && this.stateMachine.canTransition(recoveryState)) {
        this.stateMachine.transition(recoveryState, `Recovered from watch error`);
      } else {
        this.stateMachine.transition('failed', `Watch failed: ${error.message}`);
      }

      this.statusTracker.setState(this.state());

      // Yield error update before throwing
      yield this.createStatusUpdate(error);

      throw err;
    }
  }

  /**
   * Transitions engine to degraded state on non-fatal error
   * Allows recovery attempts
   */
  async degrade(error: ErrorInfo, reason?: string): Promise<void> {
    if (this.stateMachine.canTransition('degraded')) {
      this.statusTracker.addError(error);
      this.stateMachine.transition('degraded', reason || error.message);
      this.statusTracker.setState('degraded');
    }
  }

  /**
   * Attempts recovery from degraded state
   * Transitions: degraded -> bootstrapping -> ready
   */
  async recover(): Promise<void> {
    try {
      if (this.state() !== 'degraded') {
        throw new Error(`Cannot recover from state: ${this.state()}`);
      }

      this.statusTracker.clearErrors();
      this.stateMachine.transition('bootstrapping', 'Starting recovery');
      this.statusTracker.setState('bootstrapping');

      await this.kernel.init();

      if (!this.kernel.isReady()) {
        throw new Error('Kernel not ready after recovery');
      }

      this.stateMachine.transition('ready', 'Recovery completed');
      this.statusTracker.setState('ready');
    } catch (err) {
      const error: ErrorInfo = {
        code: 'RECOVERY_FAILED',
        message: err instanceof Error ? err.message : String(err),
        severity: 'error',
        recoverable: false,
      };

      this.statusTracker.addError(error);
      this.stateMachine.transition('failed', 'Recovery failed');
      this.statusTracker.setState('failed');

      throw err;
    }
  }

  /**
   * Shuts down the engine
   * Transitions: any state -> failed (terminal)
   */
  async shutdown(): Promise<void> {
    try {
      await this.kernel.shutdown();

      // Transition to failed (terminal state)
      this.stateMachine.transition('failed', 'Engine shutdown');
      this.statusTracker.setState('failed');

      // Unsubscribe from lifecycle events
      if (this.transitionUnsubscribe) {
        this.transitionUnsubscribe();
      }
    } catch (err) {
      const error: ErrorInfo = {
        code: 'SHUTDOWN_FAILED',
        message: err instanceof Error ? err.message : String(err),
        severity: 'warning',
        recoverable: false,
      };

      this.statusTracker.addError(error);
      console.error('Error during shutdown:', error);
    }
  }

  /**
   * Checks if engine is in a terminal/failed state
   */
  isFailed(): boolean {
    return this.stateMachine.isTerminal();
  }

  /**
   * Checks if engine is operational and ready
   */
  isReady(): boolean {
    return this.stateMachine.isOperational();
  }

  /**
   * Gets transition history for debugging
   */
  getTransitionHistory(): LifecycleEvent[] {
    return this.stateMachine.getTransitionHistory();
  }

  /**
   * Gets the initialized WASM module
   * Throws if module is not initialized (bootstrap() must be called first)
   */
  getWasmModule(): WasmModule {
    return this.wasmLoader.get();
  }

  /**
   * Gets WASM loader status including memory usage and version info
   */
  getWasmStatus() {
    return this.wasmLoader.getStatus();
  }

  /**
   * Gets WASM memory statistics
   */
  getWasmMemoryStats() {
    return this.wasmLoader.getMemoryStats();
  }

  // Private helpers

  private generateRunId(): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const random = Math.random().toString(36).substring(2, 6);
    return `run_${timestamp}_${random}`;
  }

  private createStatusUpdate(error?: ErrorInfo): StatusUpdate {
    const status = this.status();
    return {
      timestamp: new Date(),
      state: status.state,
      progress: status.progress,
      message: formatStatus(status),
      error,
    };
  }

  private onStateTransition(event: LifecycleEvent): void {
    // Log state transitions for debugging
    const duration = event.timestamp.getTime() - this.stateMachine.getStateEnteredAt().getTime();
    console.debug(
      `[Engine] State transition: ${event.fromState} -> ${event.toState} (${duration}ms)`,
      event.reason ? `- ${event.reason}` : ''
    );
  }
}

/**
 * Creates a simple engine with kernel only (for testing)
 */
export function createSimpleEngine(
  kernel: Kernel,
  wasmConfig?: WasmLoaderConfig,
  obsConfig?: ObservabilityConfig
): Engine {
  return new Engine(kernel, undefined, undefined, wasmConfig, obsConfig);
}

/**
 * Creates a fully configured engine with kernel, planner, and executor
 */
export function createFullEngine(
  kernel: Kernel,
  planner: Planner,
  executor: Executor,
  wasmConfig?: WasmLoaderConfig,
  obsConfig?: ObservabilityConfig
): Engine {
  return new Engine(kernel, planner, executor, wasmConfig, obsConfig);
}
