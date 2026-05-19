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
} from '@wasm4pm/contracts';
import { StateMachine, TransitionValidator, LifecycleEvent } from './lifecycle.js';
import { StatusTracker, formatStatus } from './status.js';
import { WasmLoader, WasmLoaderConfig, WasmModule } from './wasm-loader.js';
import { bootstrapEngine, createBootstrapError } from './bootstrap.js';
import { WatchSession, WatchConfig, HeartbeatEvent } from './watch.js';
import { Checkpoint } from './checkpointing.js';
import { SignalHandler, SignalHandlerConfig } from './signals.js';
import { FileCheckpointStore, ICheckpointStore } from './checkpoint-store.js';
import {
  ObservabilityWrapper,
  Instrumentation,
  RequiredOtelAttributes,
  ObservabilityConfig,
} from '@wasm4pm/observability';

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
  private signalHandler?: SignalHandler;
  private checkpointStore: ICheckpointStore;

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
    watchConfig?: WatchConfig,
    checkpointStore?: ICheckpointStore
  ) {
    this.kernel = kernel;
    this.planner = planner;
    this.executor = executor;
    this.watchConfig = watchConfig;
    this.checkpointStore = checkpointStore || new FileCheckpointStore();
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

  // ── Private helpers ──────────────────────────────────────────────────────────

  /** Record an error, emit OTEL + JSON events, and transition to recovery/fallback state. */
  private handleEngineError(
    err: unknown,
    code: string,
    suggestion: string,
    fallbackState: EngineState = 'failed'
  ): EngineError {
    const error: EngineError = {
      code,
      message: err instanceof Error ? err.message : String(err),
      severity: 'error',
      recoverable: fallbackState !== 'failed',
      suggestion,
    };
    this.statusTracker.addError(error);
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
    const recovered = TransitionValidator.suggestRecoveryState(this.state(), [error]);
    const target = (recovered && this.stateMachine.canTransition(recovered))
      ? recovered
      : (this.stateMachine.canTransition(fallbackState) ? fallbackState : null);
    if (target) {
      this.stateMachine.transition(target, `${code}: ${error.message}`);
    }
    this.statusTracker.setState(this.state());
    return error;
  }

  /** Wrap a promise in a hard timeout; throws the same error shape as the rest of the engine. */
  private withTimeout<T>(work: Promise<T>, timeoutMs: number, timeoutCode: string): Promise<T> {
    return Promise.race([
      work,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`${timeoutCode} after ${timeoutMs}ms`)), timeoutMs)
      ),
    ]);
  }

  // ── Lifecycle methods ────────────────────────────────────────────────────────

  /**
   * Bootstraps the engine: loads WASM, initializes kernel
   * Transitions: uninitialized -> bootstrapping -> ready | failed
   * Emits observability events for bootstrap lifecycle
   * Detects previous crashes and loads checkpoints if available
   * @param timeoutMs Timeout in milliseconds (default: 30000ms). Falls back to degraded state on timeout.
   */
  async bootstrap(timeoutMs: number = 30000): Promise<void> {
    // Initialize trace ID for this bootstrap operation
    if (!this.traceId) {
      this.traceId = Instrumentation.generateTraceId();
    }

    // Set up run ID if not already set
    if (!this.currentRunId) {
      this.currentRunId = this.generateRunId();
    }

    // Initialize signal handler and crash detection
    if (!this.signalHandler) {
      this.signalHandler = new SignalHandler(this, this.checkpointStore, {
        runId: this.currentRunId,
        enabled: true,
      });

      // Check for previous crash and attempt recovery
      const crashDetected = await this.signalHandler.initializeCrashDetection();
      if (crashDetected) {
        const recoveredCheckpoint = await this.signalHandler.loadRecoveryCheckpoint();
        if (recoveredCheckpoint) {
          this.statusTracker.setState(recoveredCheckpoint.state);
        }
      }
    }

    // Update required OTEL attributes with current run ID
    this.requiredOtelAttrs['run.id'] = this.currentRunId;

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
        ),
      ]).catch((err) => {
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
        level: 'info',
        component: 'engine',
        event_type: 'bootstrap_completed',
        run_id: this.requiredOtelAttrs['run.id'],
        data: {
          duration_ms: result.durationMs,
          trace_id: this.traceId,
        },
      });
    } catch (err) {
      this.handleEngineError(err, 'BOOTSTRAP_FAILED', 'Check WASM module availability and system resources', 'failed');
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
          setTimeout(
            () => reject(new Error(`Plan generation timeout after ${timeoutMs}ms`)),
            timeoutMs
          )
        ),
      ]).catch((err) => {
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
        const recoveryState = TransitionValidator.suggestRecoveryState(this.state(), [
          timeoutError,
        ]);
        if (recoveryState && this.stateMachine.canTransition(recoveryState)) {
          this.stateMachine.transition(recoveryState, `Planning timeout: ${timeoutError.message}`);
        }

        this.statusTracker.setState(this.state());

        throw timeoutError;
      });

      // Calculate plan hash (simple hash of plan ID + steps count)
      const planHash = Buffer.from(plan.planId + plan.totalSteps)
        .toString('base64')
        .substring(0, 32);
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
        level: 'info',
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
      this.handleEngineError(err, 'PLANNING_FAILED', 'Verify configuration is valid and try again', 'degraded');
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
        throw new Error(`Cannot run in state: ${this.state()}. Engine must be ready.`);
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
      const receipt = await this.withTimeout(
        this.executor.run(plan),
        timeoutMs,
        'EXECUTION_TIMEOUT'
      ).catch((err) => {
        this.statusTracker.finish();
        this.handleEngineError(err, 'EXECUTION_TIMEOUT', 'Check plan complexity and algorithm performance', 'degraded');
        throw err;
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
        level: 'info',
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
      this.handleEngineError(err, 'EXECUTION_FAILED', 'Review execution logs and try again', 'degraded');
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
        throw new Error(`Cannot watch in state: ${this.state()}. Engine must be ready.`);
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
            level: 'debug',
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
            level: 'info',
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
      if (this.watchSession?.isActive()) {
        this.watchSession.stop();
      }
      this.statusTracker.finish();
      const error = this.handleEngineError(err, 'WATCH_FAILED', 'Check executor and watch configuration', 'degraded');
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
   * Emits RecoveryStarted and RecoveryCompleted OTEL spans
   */
  async recover(options?: { timeout?: number }): Promise<void> {
    const timeoutMs = options?.timeout ?? 30000; // 30 second default
    const recoveryStart = Date.now();
    const previousState = this.state();

    try {
      if (this.state() !== 'degraded') {
        throw new Error(`Cannot recover from state: ${this.state()}`);
      }

      this.statusTracker.clearErrors();
      this.stateMachine.transition('bootstrapping', 'Starting recovery');
      this.statusTracker.setState('bootstrapping');

      // Emit dedicated RecoveryStarted span (not a generic state change)
      const recoveryStartedSpan = Instrumentation.createRecoveryStartedEvent(
        this.traceId,
        'soft',
        previousState,
        this.requiredOtelAttrs
      );
      this.observability.emitOtelSafe(recoveryStartedSpan.otelEvent);
      this.observability.emitJsonSafe({
        timestamp: new Date().toISOString(),
        level: 'info',
        component: 'engine',
        event_type: 'recovery_started',
        run_id: this.requiredOtelAttrs['run.id'],
        data: { recovery_type: 'soft', from_state: previousState, trace_id: this.traceId },
      });

      // Soft reset WASM loader to preserve compiled module
      this.wasmLoader.softReset();

      // Timeout-protected kernel init
      await Promise.race([
        this.kernel.init(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Recovery timeout after ${timeoutMs}ms`)), timeoutMs)
        ),
      ]);

      if (!this.kernel.isReady()) {
        throw new Error('Kernel not ready after recovery');
      }

      this.stateMachine.transition('ready', 'Recovery completed');
      this.statusTracker.setState('ready');

      // Record recovery duration for MTTR tracking
      const recoveryDuration = Date.now() - recoveryStart;
      this.stateMachine.recordRecovery(recoveryDuration);

      // Emit dedicated RecoveryCompleted span with duration and updated MTTR
      this.observability.emitOtelSafe(
        Instrumentation.createRecoveryCompletedEvent(
          this.traceId,
          recoveryStartedSpan.event.spanId,
          'soft',
          previousState,
          this.requiredOtelAttrs,
          { durationMs: recoveryDuration, mttrMs: this.stateMachine.getMTTR() }
        )
      );
      this.observability.emitJsonSafe({
        timestamp: new Date().toISOString(),
        level: 'info',
        component: 'engine',
        event_type: 'recovery_completed',
        run_id: this.requiredOtelAttrs['run.id'],
        data: {
          recovery_type: 'soft',
          from_state: previousState,
          duration_ms: recoveryDuration,
          mttr_ms: this.stateMachine.getMTTR(),
          trace_id: this.traceId,
        },
      });
    } catch (err) {
      const isTimeout = err instanceof Error && err.message.includes('timeout');
      this.handleEngineError(err, isTimeout ? 'RECOVERY_TIMEOUT' : 'RECOVERY_FAILED', 'Check WASM module and kernel state', 'failed');
      throw err;
    }
  }

  /**
   * Fast recovery from failed state - reuses existing WASM module
   * Only works if WASM module is still valid (not corrupted)
   * Falls back to full bootstrap if WASM is not initialized
   * Emits RecoveryStarted and RecoveryCompleted OTEL spans
   */
  async fastRecoverFromFailed(): Promise<void> {
    if (this.state() !== 'failed') {
      throw new Error(`Cannot fast recover from state: ${this.state()}`);
    }

    const recoveryStart = Date.now();
    const recoveryType = this.wasmLoader.isInitialized() ? 'fast' : 'full';

    // Emit RecoveryStarted span before attempting any state changes
    const recoveryStartedSpan = Instrumentation.createRecoveryStartedEvent(
      this.traceId,
      recoveryType,
      'failed',
      this.requiredOtelAttrs
    );
    this.observability.emitOtelSafe(recoveryStartedSpan.otelEvent);
    this.observability.emitJsonSafe({
      timestamp: new Date().toISOString(),
      level: 'info',
      component: 'engine',
      event_type: 'recovery_started',
      run_id: this.requiredOtelAttrs['run.id'],
      data: { recovery_type: recoveryType, from_state: 'failed', trace_id: this.traceId },
    });

    try {
      // Check if WASM module is still accessible
      if (!this.wasmLoader.isInitialized()) {
        // Fall back to full bootstrap (failed → bootstrapping → ready)
        await this.bootstrap();
        const recoveryDuration = Date.now() - recoveryStart;
        this.stateMachine.recordRecovery(recoveryDuration);
        this.observability.emitOtelSafe(
          Instrumentation.createRecoveryCompletedEvent(
            this.traceId,
            recoveryStartedSpan.event.spanId,
            'full',
            'failed',
            this.requiredOtelAttrs,
            { durationMs: recoveryDuration, mttrMs: this.stateMachine.getMTTR() }
          )
        );
        this.observability.emitJsonSafe({
          timestamp: new Date().toISOString(),
          level: 'info',
          component: 'engine',
          event_type: 'recovery_completed',
          run_id: this.requiredOtelAttrs['run.id'],
          data: {
            recovery_type: 'full',
            from_state: 'failed',
            duration_ms: recoveryDuration,
            mttr_ms: this.stateMachine.getMTTR(),
            trace_id: this.traceId,
          },
        });
        return;
      }

      // Fast path: soft reset and re-init kernel only (failed → ready directly)
      this.wasmLoader.softReset();
      await this.kernel.init();

      if (!this.kernel.isReady()) {
        throw new Error('Kernel not ready after fast recovery');
      }

      this.stateMachine.transition('ready', 'Fast recovery completed');
      this.statusTracker.setState('ready');

      // Record and emit
      const recoveryDuration = Date.now() - recoveryStart;
      this.stateMachine.recordRecovery(recoveryDuration);

      this.observability.emitOtelSafe(
        Instrumentation.createRecoveryCompletedEvent(
          this.traceId,
          recoveryStartedSpan.event.spanId,
          'fast',
          'failed',
          this.requiredOtelAttrs,
          { durationMs: recoveryDuration, mttrMs: this.stateMachine.getMTTR() }
        )
      );
      this.observability.emitJsonSafe({
        timestamp: new Date().toISOString(),
        level: 'info',
        component: 'engine',
        event_type: 'recovery_completed',
        run_id: this.requiredOtelAttrs['run.id'],
        data: {
          recovery_type: 'fast',
          from_state: 'failed',
          duration_ms: recoveryDuration,
          mttr_ms: this.stateMachine.getMTTR(),
          trace_id: this.traceId,
        },
      });
    } catch (err) {
      // Fast recovery failed — emit error span and fall back to full bootstrap
      const recoveryDuration = Date.now() - recoveryStart;
      this.observability.emitOtelSafe(
        Instrumentation.createRecoveryCompletedEvent(
          this.traceId,
          recoveryStartedSpan.event.spanId,
          recoveryType,
          'failed',
          this.requiredOtelAttrs,
          {
            durationMs: recoveryDuration,
            status: 'ERROR',
            errorMessage: err instanceof Error ? err.message : String(err),
          }
        )
      );
      // Final fallback: full bootstrap — may throw if bootstrap itself fails
      await this.bootstrap();
      const totalDuration = Date.now() - recoveryStart;
      this.stateMachine.recordRecovery(totalDuration);
    }
  }

  /**
   * Shuts down the engine
   * Transitions: any state -> failed (terminal)
   */
  async shutdown(): Promise<void> {
    try {
      // Save final checkpoint before shutdown
      if (this.signalHandler && this.currentRunId) {
        try {
          const currentState = this.state();
          const checkpointMgr = this.signalHandler.getCheckpointManager();
          const checkpoint = checkpointMgr.create(currentState, 1.0, {
            shutdownTime: new Date().toISOString(),
            type: 'graceful_shutdown',
          });

          await this.checkpointStore.save(checkpoint.id, checkpoint);

          // Emit shutdown checkpoint span
          const shutdownEvent = Instrumentation.createStateChangeEvent(
            this.traceId,
            currentState,
            'failed',
            this.requiredOtelAttrs,
            { reason: 'Graceful shutdown with checkpoint saved' }
          );
          this.observability.emitOtelSafe(shutdownEvent.otelEvent);

          // Clear lock file
          const crashDetector = this.signalHandler.getCrashDetector();
          crashDetector.clearLock();
        } catch (checkpointErr) {
          console.error('Error saving checkpoint during shutdown:', checkpointErr);
        }
      }

      await this.kernel.shutdown();

      // Transition to failed (terminal state)
      this.stateMachine.transition('failed', 'Engine shutdown');
      this.statusTracker.setState('failed');

      // Unsubscribe from lifecycle events
      if (this.transitionUnsubscribe) {
        this.transitionUnsubscribe();
      }

      // Deregister signal handlers
      if (this.signalHandler) {
        this.signalHandler.deregister();
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
   * Gets Mean Time To Recovery (MTTR) in milliseconds.
   *
   * Returns the mean of all recovery durations recorded via recordRecovery()
   * since this engine instance was created. Returns 0 if no recoveries have
   * been recorded.
   *
   * Per the critical constraint: MTTR must be < 1000ms.
   * Do NOT hardcode expected values — always measure via this method.
   */
  getMTTR(): number {
    return this.stateMachine.getMTTR();
  }

  /**
   * Gets the number of recovery operations performed since engine creation.
   */
  getRecoveryCount(): number {
    return this.stateMachine.getRecoveryCount();
  }

  /**
   * Save a checkpoint to persistent storage with current engine state and progress
   * @param progress Progress value from 0 (start) to 1 (complete)
   * @param metadata Optional metadata to store with checkpoint
   */
  async saveCheckpoint(
    progress: number = 0.5,
    metadata?: Record<string, unknown>
  ): Promise<Checkpoint | null> {
    if (!this.signalHandler) {
      console.warn('Signal handler not initialized; cannot save checkpoint');
      return null;
    }

    try {
      const currentState = this.state();
      const checkpointMgr = this.signalHandler.getCheckpointManager();

      const checkpoint = checkpointMgr.create(currentState, progress, {
        ...metadata,
        savedTime: new Date().toISOString(),
      });

      await this.checkpointStore.save(checkpoint.id, checkpoint);

      // Emit checkpoint save span
      const saveEvent = Instrumentation.createStateChangeEvent(
        this.traceId,
        currentState,
        currentState,
        this.requiredOtelAttrs,
        { reason: `Checkpoint saved at progress ${(progress * 100).toFixed(1)}%` }
      );
      this.observability.emitOtelSafe(saveEvent.otelEvent);

      return checkpoint;
    } catch (err) {
      console.error('Error saving checkpoint:', err);
      return null;
    }
  }

  /**
   * List all saved checkpoints for the current run
   */
  async getCheckpoints(): Promise<any[]> {
    try {
      if (!this.currentRunId) {
        return [];
      }

      const metadata = await this.checkpointStore.list({ runId: this.currentRunId });
      return metadata;
    } catch (err) {
      console.error('Error listing checkpoints:', err);
      return [];
    }
  }

  /**
   * Get the signal handler instance for direct access if needed
   */
  getSignalHandler(): SignalHandler | undefined {
    return this.signalHandler;
  }

  /**
   * Compute MTTR from transition history timestamps.
   *
   * Alternative to getMTTR() that derives MTTR by scanning getTransitionHistory()
   * for entries where toState is 'degraded' or 'failed' followed by a 'ready'
   * entry. Each such pair is measured as wall-clock elapsed.
   *
   * This is independent of recordRecovery() calls — it works even if a recovery
   * path forgot to call recordRecovery().
   */
  computeMTTRFromHistory(): number {
    const history = this.stateMachine.getTransitionHistory();
    const durations: number[] = [];
    let failureEntryTime: number | null = null;

    for (const event of history) {
      if (event.toState === 'degraded' || event.toState === 'failed') {
        failureEntryTime = event.timestamp.getTime();
      } else if (event.toState === 'ready' && failureEntryTime !== null) {
        durations.push(event.timestamp.getTime() - failureEntryTime);
        failureEntryTime = null;
      }
    }

    if (durations.length === 0) return 0;
    return durations.reduce((a, b) => a + b, 0) / durations.length;
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
      timestamp: result.timestamp || new Date(),
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
