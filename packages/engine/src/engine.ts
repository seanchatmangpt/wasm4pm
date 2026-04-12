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
  EngineError,
} from '@pictl/contracts';
import { StateMachine, TransitionValidator, LifecycleEvent } from './lifecycle.js';
import { StatusTracker, formatStatus } from './status.js';
import { WasmLoader, WasmLoaderConfig, WasmModule } from './wasm-loader.js';
import { bootstrapEngine, createBootstrapError } from './bootstrap.js';
import { WatchSession, WatchConfig, HeartbeatEvent } from './watch.js';
import { Checkpoint } from './checkpointing.js';
import {
  ObservabilityWrapper,
  Instrumentation,
  RequiredOtelAttributes,
  ObservabilityConfig,
} from '@pictl/observability';

/**
 * Result returned from Kernel.run()
 */
export interface KernelRunResult {
  handle: string;
  algorithm: string;
  outputType: string;
  durationMs: number;
  params: Record<string, unknown>;
  hash: string;
}

/**
 * Kernel interface - abstract definition of WASM kernel
 * The engine calls kernel methods but doesn't depend on implementation details
 */
export interface Kernel {
  init(): Promise<void>;
  shutdown(): Promise<void>;
  isReady(): boolean;
  /** Run a discovery algorithm by registry ID. Optional — not all kernel implementations support it. */
  run?(
    algorithmName: string,
    eventLogHandle: string,
    params?: Record<string, unknown>
  ): Promise<KernelRunResult>;
  /** List all available algorithm IDs. Optional. */
  algorithms?(): Array<{ id: string; name: string; outputType: string }>;
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
  private watchSession?: WatchSession;
  private watchConfig?: WatchConfig;
  private observability: ObservabilityWrapper;
  private traceId: string;
  private requiredOtelAttrs: RequiredOtelAttributes;
  private observabilityErrors: Array<{ timestamp: Date; layer: string; message: string }> = [];

  /**
   * Creates a new Engine instance
   * @param kernel WASM kernel implementation
   * @param planner Optional planner for generating execution plans
   * @param executor Optional executor for running plans
   * @param wasmLoaderConfig Optional WASM loader configuration
   * @param observabilityConfig Optional observability configuration (OTEL, JSON logging)
   * @param watchConfig Optional watch mode configuration (heartbeat, checkpointing)
   */
  constructor(
    kernel: Kernel,
    planner?: Planner,
    executor?: Executor,
    wasmLoaderConfig?: WasmLoaderConfig,
    observabilityConfig?: ObservabilityConfig,
    watchConfig?: WatchConfig
  ) {
    this.kernel = kernel;
    this.planner = planner;
    this.executor = executor;
    this.watchConfig = watchConfig;
    this.stateMachine = new StateMachine();
    this.statusTracker = new StatusTracker();
    this.wasmLoader = WasmLoader.getInstance(wasmLoaderConfig);
    this.observability = new ObservabilityWrapper(observabilityConfig);
    this.traceId = '';
    this.requiredOtelAttrs = {
      'run.id': 'bootstrap',
      'config.hash': '',
      'input.hash': '',
      'plan.hash': '',
      'execution.profile': 'default',
      'source.kind': 'unknown',
      'sink.kind': 'unknown',
    };

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
   * @param timeoutMs Timeout in milliseconds (default: 30000ms). Falls back to degraded state on timeout.
   */
  async bootstrap(timeoutMs: number = 30000): Promise<void> {
    // Initialize trace ID for this bootstrap operation
    if (!this.traceId) {
      this.traceId = Instrumentation.generateTraceId();
    }

    // Update required OTEL attributes with current run ID
    this.requiredOtelAttrs['run.id'] = this.currentRunId || 'bootstrap';

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
      const fromState = this.state();
      this.stateMachine.transition('bootstrapping', 'Starting WASM and kernel initialization');
      this.statusTracker.setState('bootstrapping');

      // Emit state change event to bootstrapping
      const stateChangeStart = Instrumentation.createStateChangeEvent(
        this.traceId,
        fromState,
        'bootstrapping',
        this.requiredOtelAttrs,
        { reason: 'Starting WASM and kernel initialization' }
      );
      this.observability.emitOtelSafe(stateChangeStart.otelEvent);

      // Delegate to bootstrap module with timeout
      const result = await Promise.race([
        bootstrapEngine(this.kernel, this.wasmLoader),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Bootstrap timeout after ${timeoutMs}ms`)), timeoutMs)
        )
      ]).catch(err => {
        // On timeout or error, transition to degraded state
        const timeoutError: EngineError = {
          code: 'BOOTSTRAP_TIMEOUT',
          message: err instanceof Error ? err.message : String(err),
          severity: 'error',
          recoverable: true,
          suggestion: 'Check WASM module availability and system resources',
        };

        this.statusTracker.addError(timeoutError);

        // Emit error event
        if (this.requiredOtelAttrs) {
          const errorEvent = Instrumentation.createErrorEvent(
            this.traceId,
            timeoutError.code,
            timeoutError.message,
            this.requiredOtelAttrs,
            { severity: timeoutError.severity, context: timeoutError.context }
          );
          this.observability.emitOtelSafe(errorEvent.otelEvent);
          this.observability.emitJsonSafe(errorEvent.jsonEvent);
        }

        // Transition to degraded state
        this.stateMachine.transition('degraded', `Bootstrap failed: ${timeoutError.message}`);
        this.statusTracker.setState('degraded');

        throw timeoutError;
      });

      this.wasmModule = result.wasmModule;

      // Transition to ready
      this.stateMachine.transition('ready', 'WASM and kernel initialized successfully');
      this.statusTracker.setState('ready');

      // Emit state change to ready
      const stateChangeReady = Instrumentation.createStateChangeEvent(
        this.traceId,
        'bootstrapping',
        'ready',
        this.requiredOtelAttrs,
        { reason: 'WASM and kernel initialized successfully' }
      );
      stateChangeReady.event.durationMs = result.durationMs;
      this.observability.emitOtelSafe(stateChangeReady.otelEvent);

      // Emit bootstrap metrics to JSON layer
      this.observability.emitJsonSafe({
        timestamp: new Date().toISOString(),
        component: 'engine',
        event_type: 'bootstrap_completed',
        run_id: this.requiredOtelAttrs['run.id'],
        data: {
          duration_ms: result.durationMs,
          trace_id: this.traceId,
        },
      });
    } catch (err) {
      const error = createBootstrapError(err);

      this.statusTracker.addError(error);

      // Emit error event
      if (this.requiredOtelAttrs) {
        const errorEvent = Instrumentation.createErrorEvent(
          this.traceId,
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
   * @param config Configuration object
   * @param timeoutMs Timeout in milliseconds (default: 10000ms). Falls back to degraded state on timeout.
   */
  async plan(config: unknown, timeoutMs: number = 10000): Promise<ExecutionPlan> {
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
        this.traceId,
        'ready',
        'planning',
        this.requiredOtelAttrs,
        { reason: 'Starting plan generation' }
      );
      this.observability.emitOtelSafe(stateChangePlanning.otelEvent);

      // Generate execution plan with timeout
      const plan = await Promise.race([
        this.planner.plan(config),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Plan generation timeout after ${timeoutMs}ms`)), timeoutMs)
        )
      ]).catch(err => {
        const timeoutError: EngineError = {
          code: 'PLANNING_TIMEOUT',
          message: err instanceof Error ? err.message : String(err),
          severity: 'error',
          recoverable: true,
          suggestion: 'Check configuration complexity and system resources',
        };

        this.statusTracker.addError(timeoutError);

        // Emit error event
        if (this.requiredOtelAttrs) {
          const errorEvent = Instrumentation.createErrorEvent(
            this.traceId,
            timeoutError.code,
            timeoutError.message,
            this.requiredOtelAttrs,
            { severity: timeoutError.severity }
          );
          this.observability.emitOtelSafe(errorEvent.otelEvent);
          this.observability.emitJsonSafe(errorEvent.jsonEvent);
        }

        // Try to recover to degraded state
        const recoveryState = TransitionValidator.suggestRecoveryState(this.state(), [timeoutError]);
        if (recoveryState && this.stateMachine.canTransition(recoveryState)) {
          this.stateMachine.transition(recoveryState, `Planning timeout: ${timeoutError.message}`);
        }

        this.statusTracker.setState(this.state());

        throw timeoutError;
      });

      // Calculate plan hash (simple hash of plan ID + steps count)
      const planHash = Buffer.from(plan.planId + plan.totalSteps).toString('base64').substring(0, 32);
      this.requiredOtelAttrs['plan.hash'] = planHash;

      // Return to ready state after planning (can then run or plan again)
      this.stateMachine.transition('ready', 'Plan generated successfully');
      this.statusTracker.setState('ready');
      this.statusTracker.setPlan(plan);

      // Emit plan generated event
      const planDuration = Date.now() - planStart;
      const planGenerated = Instrumentation.createPlanGeneratedEvent(
        this.traceId,
        plan.planId,
        planHash,
        plan.totalSteps,
        this.requiredOtelAttrs,
        { estimatedDurationMs: plan.estimatedDurationMs }
      );
      planGenerated.event.durationMs = planDuration;
      this.observability.emitOtelSafe(planGenerated.otelEvent);

      // Emit state change back to ready
      const stateChangeReady = Instrumentation.createStateChangeEvent(
        this.traceId,
        'planning',
        'ready',
        this.requiredOtelAttrs,
        { reason: 'Plan generated successfully' }
      );
      stateChangeReady.event.durationMs = planDuration;
      this.observability.emitOtelSafe(stateChangeReady.otelEvent);

      // Emit JSON event with plan metrics
      this.observability.emitJsonSafe({
        timestamp: new Date().toISOString(),
        component: 'engine',
        event_type: 'plan_generated',
        run_id: this.requiredOtelAttrs['run.id'],
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
      const error: EngineError = {
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
          this.traceId,
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
   * @param plan Execution plan to run
   * @param timeoutMs Timeout in milliseconds (default: 300000ms / 5 minutes). Falls back to degraded state on timeout.
   */
  async run(plan: ExecutionPlan, timeoutMs: number = 300000): Promise<ExecutionReceipt> {
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
      this.requiredOtelAttrs['run.id'] = this.currentRunId;

      // Transition to running
      this.stateMachine.transition('running', `Starting execution: ${this.currentRunId}`);
      this.statusTracker.setState('running');

      // Emit state change to running
      const stateChangeRunning = Instrumentation.createStateChangeEvent(
        this.traceId,
        'ready',
        'running',
        this.requiredOtelAttrs,
        { reason: `Starting execution: ${this.currentRunId}` }
      );
      this.observability.emitOtelSafe(stateChangeRunning.otelEvent);

      // Execute the plan with timeout
      const receipt = await Promise.race([
        this.executor.run(plan),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Execution timeout after ${timeoutMs}ms`)), timeoutMs)
        )
      ]).catch(err => {
        this.statusTracker.finish();

        const timeoutError: EngineError = {
          code: 'EXECUTION_TIMEOUT',
          message: err instanceof Error ? err.message : String(err),
          severity: 'error',
          recoverable: true,
          suggestion: 'Check plan complexity and algorithm performance',
        };

        this.statusTracker.addError(timeoutError);

        // Emit error event
        if (this.requiredOtelAttrs) {
          const runDuration = Date.now() - runStart;
          const errorEvent = Instrumentation.createErrorEvent(
            this.traceId,
            timeoutError.code,
            timeoutError.message,
            this.requiredOtelAttrs,
            { severity: timeoutError.severity }
          );
          this.observability.emitOtelSafe(errorEvent.otelEvent);
          this.observability.emitJsonSafe(errorEvent.jsonEvent);
        }

        // Try to recover or degrade
        const recoveryState = TransitionValidator.suggestRecoveryState(this.state(), [timeoutError]);
        if (recoveryState && this.stateMachine.canTransition(recoveryState)) {
          this.stateMachine.transition(recoveryState, `Execution timeout: ${timeoutError.message}`);
        } else {
          this.stateMachine.transition('failed', `Execution timeout: ${timeoutError.message}`);
        }

        this.statusTracker.setState(this.state());

        throw timeoutError;
      });

      // Return to ready after execution
      this.statusTracker.finish();
      this.stateMachine.transition('ready', 'Execution completed successfully');
      this.statusTracker.setState('ready');

      // Emit state change back to ready
      const runDuration = Date.now() - runStart;
      const stateChangeReady = Instrumentation.createStateChangeEvent(
        this.traceId,
        'running',
        'ready',
        this.requiredOtelAttrs,
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

      const error: EngineError = {
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
          this.traceId,
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
      } else if (this.state() !== 'failed') {
        this.stateMachine.transition('failed', `Execution failed: ${error.message}`);
      }

      this.statusTracker.setState(this.state());

      throw err;
    }
  }

  /**
   * Watches execution progress with streaming status updates
   * Transitions: ready -> watching -> ready | degraded | failed
   * Includes heartbeat and checkpointing via WatchSession
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

      // Create and start watch session with heartbeat + checkpointing
      this.watchSession = new WatchSession(this.currentRunId, plan, this.watchConfig);
      this.watchSession.start(
        (heartbeat: HeartbeatEvent) => {
          this.observability.emitJsonSafe({
            timestamp: heartbeat.timestamp.toISOString(),
            component: 'engine',
            event_type: 'heartbeat',
            run_id: this.currentRunId,
            data: {
              sequence: heartbeat.sequenceNumber,
              state: heartbeat.state,
              progress: heartbeat.progress,
              uptime_ms: heartbeat.uptimeMs,
            },
          });
        },
        (checkpoint: Checkpoint) => {
          this.observability.emitJsonSafe({
            timestamp: checkpoint.timestamp.toISOString(),
            component: 'engine',
            event_type: 'checkpoint',
            run_id: this.currentRunId,
            data: {
              checkpoint_id: checkpoint.id,
              sequence: checkpoint.sequenceNumber,
              state: checkpoint.state,
              progress: checkpoint.progress,
            },
          });
        }
      );

      // Yield initial status
      yield this.createStatusUpdate();

      // Watch execution
      const updates = this.executor.watch(plan);
      for await (const update of updates) {
        // Update tracker and watch session
        this.statusTracker.setState(update.state);
        this.watchSession.updateState(update.state, update.progress);

        if (update.error) {
          this.statusTracker.addError(update.error);
        }

        // Check watch session health
        if (!this.watchSession.isHealthy()) {
          const degradeError: EngineError = {
            code: 'HEARTBEAT_FAILURE',
            message: `Missed ${this.watchSession.getMissedHeartbeats()} consecutive heartbeats`,
            severity: 'warning',
            recoverable: true,
          };
          this.statusTracker.addError(degradeError);
          yield this.createStatusUpdate(degradeError);
        }

        // Yield the update
        yield update;

        // If execution ended, transition state
        if (update.state === 'ready' || update.state === 'failed') {
          this.statusTracker.finish();
          this.watchSession.stop();
          this.stateMachine.transition('ready', 'Watched execution completed');
          break;
        }
      }

      // Clean up watch session
      if (this.watchSession.isActive()) {
        this.watchSession.stop();
      }

      this.statusTracker.setState(this.state());
    } catch (err) {
      // Stop watch session on error
      if (this.watchSession?.isActive()) {
        this.watchSession.stop();
      }

      this.statusTracker.finish();

      const error: EngineError = {
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
      } else if (this.state() !== 'failed') {
        this.stateMachine.transition('failed', `Watch failed: ${error.message}`);
      }

      this.statusTracker.setState(this.state());

      // Yield error update before throwing
      yield this.createStatusUpdate(error);

      throw err;
    }
  }

  /**
   * Gets the current watch session (if active)
   */
  getWatchSession(): WatchSession | undefined {
    return this.watchSession;
  }

  /**
   * Transitions engine to degraded state on non-fatal error
   * Allows recovery attempts
   */
  async degrade(error: EngineError, reason?: string): Promise<void> {
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
      const error: EngineError = {
        code: 'RECOVERY_FAILED',
        message: err instanceof Error ? err.message : String(err),
        severity: 'error',
        recoverable: false,
      };

      this.statusTracker.addError(error);
      if (this.state() !== 'failed') {
        this.stateMachine.transition('failed', 'Recovery failed');
      }
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
      const error: EngineError = {
        code: 'SHUTDOWN_FAILED',
        message: err instanceof Error ? err.message : String(err),
        severity: 'warning',
        recoverable: false,
      };

      this.statusTracker.addError(error);

      // Still transition to failed even on shutdown error
      try {
        this.stateMachine.transition('failed', 'Engine shutdown with error');
        this.statusTracker.setState('failed');
      } catch {
        // Already in terminal state
      }

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

  private createStatusUpdate(error?: EngineError): StatusUpdate {
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

  /**
   * Get observability statistics from the observability wrapper
   */
  getObservabilityStats(): { emitCount: number; errorCount: number; errorRate: number } {
    return this.observability.getStats();
  }

  /**
   * Get observability errors that have been recorded
   */
  getObservabilityErrors(): Array<{ timestamp: Date; layer: string; message: string }> {
    return this.observability.getErrors();
  }

  /**
   * Shutdown observability layer gracefully
   */
  async shutdownObservability(): Promise<{ success: boolean; error?: string; timestamp: Date }> {
    const result = await this.observability.shutdown();
    if (!result.success && result.error) {
      console.warn(`[Engine] Observability shutdown error: ${result.error}`);
    }
    return {
      success: result.success,
      error: result.error,
      timestamp: result.timestamp || new Date()
    };
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
  obsConfig?: ObservabilityConfig,
  watchConfig?: WatchConfig
): Engine {
  return new Engine(kernel, planner, executor, wasmConfig, obsConfig, watchConfig);
}
