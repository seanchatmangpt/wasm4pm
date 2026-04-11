# Engine State Machine Deep Dive

**Last Updated:** April 2026  
**Audience:** System architects, engine maintainers, advanced users  
**Status:** Production-ready

## Overview

The pictl Engine is a state machine with 8 distinct states and 12 valid transitions. This document explains the complete lifecycle, what happens during each transition, error recovery behaviors, concurrency handling, and real-world scenarios.

**Core Philosophy:** The engine is either ready to do work, actively working, or has encountered a condition (degraded/failed) that requires intervention. All state changes are explicit, traceable, and verifiable.

---

## State Definitions

### The 8 States

```
┌──────────────────────────────────────────────────────────────┐
│                    Engine State Diagram                       │
└──────────────────────────────────────────────────────────────┘

                  ┌─────────────────────────┐
                  │   uninitialized         │
                  │ (Created, not started)  │
                  └────────────┬────────────┘
                               │ bootstrap()
                               ▼
                  ┌─────────────────────────┐
                  │   bootstrapping         │
                  │ (Loading WASM, init k)  │
                  └────────┬──────────┬─────┘
                           │          │
                       success       error
                           │          │
                   ┌───────▼──┐  ┌────▼──┐
                   │   ready  │  │ failed │
                   └──┬──┬────┘  └────┬───┘
                      │  │           │
        plan()    run()  watch()     │
        or                │          │
      analysis()    (streaming)     │
                      ▼             │
                   ┌────────┐       │
                   │planning │      │
                   └────┬───┘       │
                        │ success   │
                        ▼           │
                   ┌────────┐       │
                   │ running│───────┼──► degraded ─┐
                   └──┬─────┘       │              │
                      │ streaming   │              │
                      ▼             │              │
                   ┌────────┐       │              │
                   │watching│───────┼──────────────┤
                   └──┬─────┘       │              │
                      │ done        │              │
                      ▼             │              │
                   ┌────────┐       │              │
              ┌────┤  ready │◄──────┼──────────────┘
              │    └────────┘       │
              │                     │
              └─────────────────────┘
                  recovery flow
```

### 1. `uninitialized`
**Lifecycle:** Engine created, constructor called, nothing started  
**Operational:** No  
**Terminal:** No  
**Processing:** No  

**What it means:**
- `new Engine(...)` was called
- No WASM module loaded
- No kernel initialized
- Cannot accept work

**Valid transitions:**
- → `bootstrapping` (via `bootstrap()`)
- All other transitions invalid

**Real code path (from `packages/engine/src/state.ts`):**
```typescript
export const STATE_METADATA: Record<EngineState, StateMetadata> = {
  uninitialized: {
    name: 'uninitialized',
    description: 'Engine created but not yet bootstrapped',
    operational: false,
    terminal: false,
    processing: false,
  },
  // ...
};
```

### 2. `bootstrapping`
**Lifecycle:** WASM loading, kernel initialization in progress  
**Operational:** No  
**Terminal:** No  
**Processing:** Yes  

**What it means:**
- `bootstrap()` method called
- WASM module being fetched/compiled
- Kernel being initialized (async)
- Cannot accept new work, but bootstrap is "work"

**Duration:** 100–500 ms typical (depends on WASM size, system load)

**Valid transitions:**
- → `ready` (bootstrap succeeded)
- → `failed` (bootstrap failed with fatal error or timeout)

**Real code path (from `packages/engine/src/engine.ts` lines 148–280):**
```typescript
async bootstrap(timeoutMs: number = 30000): Promise<void> {
  if (!this.traceId) {
    this.traceId = Instrumentation.generateTraceId();
  }

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

    // Emit state change event
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
          this.traceId!,
          timeoutError.code,
          timeoutError.message,
          this.requiredOtelAttrs,
          { severity: timeoutError.severity, context: timeoutError.context }
        );
        this.observability.emitOtelSafe(errorEvent.otelEvent);
        this.observability.emitJsonSafe(errorEvent.jsonEvent);
      }

      // Transition to degraded state on timeout
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
```

### 3. `ready`
**Lifecycle:** Bootstrap complete, idle, waiting for work  
**Operational:** Yes  
**Terminal:** No  
**Processing:** No  

**What it means:**
- Engine is initialized and WASM is loaded
- Kernel is running
- Can accept planning/execution requests
- Can analyze or plan but not executing yet

**Valid transitions:**
- → `planning` (via `plan()`)
- → `degraded` (error occurred, engine still usable)
- → `failed` (fatal error)

**Typical flow:**
1. After `bootstrap()` succeeds
2. After `plan()` completes (return to ready after planning)
3. After `run()` completes (return to ready after execution)
4. After recovery from degraded state

### 4. `planning`
**Lifecycle:** Generating execution plan from configuration  
**Operational:** Yes  
**Terminal:** No  
**Processing:** Yes  

**What it means:**
- `plan()` method called
- Planner is analyzing config and building DAG
- Cannot accept other work while planning
- Quick operation (10–100 ms)

**Valid transitions:**
- → `ready` (plan succeeded, return to ready)
- → `running` (immediate execution, skip returning to ready)
- → `degraded` (planning failed but recoverable)
- → `failed` (planning failed fatally)

**Real code path (from `packages/engine/src/engine.ts` lines 290–444):**
```typescript
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
      this.traceId!,
      'ready',
      'planning',
      this.requiredOtelAttrs!,
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
          this.traceId!,
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

    // Calculate plan hash
    const planHash = Buffer.from(plan.planId + plan.totalSteps).toString('base64').substring(0, 32);
    this.requiredOtelAttrs!['plan.hash'] = planHash;

    // Return to ready state after planning
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
```

### 5. `running`
**Lifecycle:** Executing a plan to completion  
**Operational:** Yes  
**Terminal:** No  
**Processing:** Yes  

**What it means:**
- `run()` method called, plan being executed
- Executor is active, calling kernel, writing sinks
- Long operation (100 ms to several seconds)
- Cannot accept other work

**Valid transitions:**
- → `ready` (execution succeeded)
- → `watching` (transition to streaming mode)
- → `degraded` (execution partially failed but recoverable)
- → `failed` (execution failed fatally)

**Real code path (from `packages/engine/src/engine.ts` lines 454–536):**
```typescript
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
          this.traceId!,
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

    // ... (OTel emissions)

    return receipt;
  } catch (err) {
    // error handling...
  }
}
```

### 6. `watching`
**Lifecycle:** Streaming execution with checkpointing and heartbeat  
**Operational:** Yes  
**Terminal:** No  
**Processing:** Yes  

**What it means:**
- `watch()` method called, returning async iterable of updates
- Executor is active, emitting status updates (progress, state changes)
- Checkpointing enabled for resumption
- Heartbeat sent periodically to detect hanging tasks

**Valid transitions:**
- → `ready` (streaming completed)
- → `degraded` (transient error during streaming)
- → `failed` (fatal error during streaming)

**Real code path (from `packages/engine/src/watch.ts` and engine usage):**
```typescript
// watch() signature
async *watch(plan: ExecutionPlan): AsyncIterable<StatusUpdate> {
  // Emits StatusUpdate objects:
  // {
  //   timestamp: Date,
  //   state: EngineState,
  //   progress: 0..100,
  //   currentStep?: string,
  //   metadata?: Record<string, unknown>
  // }
}
```

### 7. `degraded`
**Lifecycle:** Operating with reduced capability, recoverable errors  
**Operational:** No (cannot accept new work)  
**Terminal:** No (recovery possible)  
**Processing:** No  

**What it means:**
- Non-fatal error occurred (timeout, transient failure)
- Engine still has valid WASM and kernel
- Cannot accept new work until recovered
- Can retry with adjusted parameters

**Valid transitions:**
- → `ready` (recovered, resume normal operation)
- → `bootstrapping` (full recovery via re-bootstrap)
- → `failed` (error persists, giving up)

**Example scenario:**
```typescript
const engine = new Engine(kernel, planner, executor);
await engine.bootstrap(); // ready

try {
  const plan = await engine.plan(config);
  const receipt = await engine.run(plan);
} catch (err) {
  const status = engine.status();
  console.log(status.state); // 'degraded'
  console.log(status.errors[0]); // { code: 'EXECUTION_TIMEOUT', recoverable: true }

  // Recover by adjusting params and retrying
  const adjustedPlan = await engine.plan({ ...config, timeoutMs: 60000 });
  // engine state: degraded → planning → ready
  const receipt2 = await engine.run(adjustedPlan);
}
```

### 8. `failed`
**Lifecycle:** Terminal failure state, engine unrecoverable  
**Operational:** No  
**Terminal:** Yes  
**Processing:** No  

**What it means:**
- Fatal error occurred (WASM load failure, kernel crash)
- Engine cannot accept new work
- Must create a new Engine instance to recover
- All state is lost

**Valid transitions:**
- → `bootstrapping` (only recovery: full re-bootstrap)

**Example scenario:**
```typescript
const engine = new Engine(kernel, planner, executor);
try {
  await engine.bootstrap();
} catch (err) {
  const status = engine.status();
  console.log(status.state); // 'failed'
  console.log(status.errors[0].severity); // 'fatal'

  // No recovery possible via engine.plan() or engine.run()
  // Must create new engine
  const newEngine = new Engine(kernel, planner, executor);
  await newEngine.bootstrap();
}
```

---

## Transition Details

### Valid Transitions Table

From `packages/engine/src/transitions.ts`:

```typescript
export const VALID_TRANSITIONS: Record<EngineState, Set<EngineState>> = {
  uninitialized: new Set(['bootstrapping']),
  bootstrapping: new Set(['ready', 'failed']),
  ready: new Set(['planning', 'degraded', 'failed']),
  planning: new Set(['running', 'ready', 'degraded', 'failed']),
  running: new Set(['watching', 'ready', 'degraded', 'failed']),
  watching: new Set(['ready', 'degraded', 'failed']),
  degraded: new Set(['ready', 'bootstrapping', 'failed']),
  failed: new Set(['bootstrapping']),
};
```

### Transition: `uninitialized` → `bootstrapping`

**Trigger:** `await engine.bootstrap()`

**What happens:**
1. Validate engine is in `uninitialized` state
2. Emit OTel span: state_change(from='uninitialized', to='bootstrapping')
3. Load WASM module (via `WasmLoader`)
4. Initialize kernel (call `kernel.init()`)
5. Set timeout timer (default 30s)

**On success:**
1. Transition to `ready`
2. Emit OTel span: state_change(from='bootstrapping', to='ready')
3. Record WASM load time

**On failure:**
1. Timeout: transition to `degraded` (allow retry)
2. Fatal error: transition to `failed` (must create new engine)
3. Emit OTel error span

### Transition: `ready` → `planning`

**Trigger:** `const plan = await engine.plan(config)`

**What happens:**
1. Validate state is `ready`
2. Emit OTel span: state_change(from='ready', to='planning')
3. Call `planner.plan(config)` with timeout (default 10s)
4. Build DAG, validate no cycles
5. Calculate plan hash

**On success:**
1. Transition to `ready` (immediately return to ready)
2. Emit OTel span: plan_generated, state_change(from='planning', to='ready')
3. Return `ExecutionPlan`

**On failure:**
1. Call `TransitionValidator.suggestRecoveryState(state, errors)`
2. If recoverable (timeout, config error): transition to `degraded`, retry later
3. If fatal (no planner): transition to `failed`
4. Emit OTel error span

### Transition: `ready` → `running`

**Trigger:** `const receipt = await engine.run(plan)`

**What happens:**
1. Validate state is `ready`
2. Generate run ID (unique per execution)
3. Emit OTel span: state_change(from='ready', to='running')
4. Call `executor.run(plan)` with timeout (default 300s)
5. Executor processes each step in DAG order

**On success:**
1. Transition to `ready`
2. Emit OTel span: state_change(from='running', to='ready')
3. Return `ExecutionReceipt` with progress=100

**On failure:**
1. Call `TransitionValidator.suggestRecoveryState(state, errors)`
2. If timeout and recoverable: transition to `degraded`
3. If fatal: transition to `failed`
4. Emit OTel error span

### Transition: `ready` → `watching`

**Trigger:** `for await (const update of engine.watch(plan))`

**What happens:**
1. Validate state is `ready`
2. Emit OTel span: state_change(from='ready', to='watching')
3. Create `WatchSession` with heartbeat and checkpoint config
4. Call `executor.watch(plan)`, iterate over updates
5. Emit OTel span per checkpoint (progress, step completion)

**On success:**
1. Transition to `ready` after async iteration completes
2. Emit OTel span: state_change(from='watching', to='ready')

**On failure:**
1. Error during iteration: transition to `degraded` or `failed`
2. Emit OTel error span

### Transition: Any Active State → `degraded`

**Trigger:** Recoverable error during bootstrap, planning, running, or watching

**What happens:**
1. Error occurs (timeout, transient failure)
2. Validate transition is allowed from current state
3. Emit OTel span: error(code, message, severity='error')
4. Add error to status tracker
5. Transition to `degraded`

**Recovery:**
1. Call `engine.plan(adjustedConfig)` with different parameters
2. Transition: degraded → planning → ready → running

### Transition: `degraded` → `bootstrapping`

**Trigger:** Manual full recovery attempt

**What happens:**
1. Validate state is `degraded`
2. Emit OTel span: state_change(from='degraded', to='bootstrapping')
3. Re-run bootstrap (reload WASM, re-init kernel)
4. Clear error accumulator

**On success:**
1. Transition to `ready`

**On failure:**
1. Transition to `failed` (second bootstrap failure is fatal)

### Transition: Any → `failed`

**Trigger:** Fatal error (WASM crash, kernel panic, bootstrap timeout)

**What happens:**
1. Error is classified as fatal (not recoverable)
2. Emit OTel span: error(code, message, severity='fatal')
3. Add error to status tracker
4. Transition to `failed`

**Recovery:**
1. Only transition: failed → bootstrapping
2. Must create new `Engine` instance or call `await engine.bootstrap()`
3. Clears all state (lost plans, runs, errors)

---

## Recovery Behavior

### Automatic Recovery (Timeout)

If a bootstrap exceeds 30 seconds, engine auto-transitions to `degraded`:

```typescript
// From packages/engine/src/engine.ts (lines 192–226)
const result = await Promise.race([
  bootstrapEngine(this.kernel, this.wasmLoader),
  new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`Bootstrap timeout after ${timeoutMs}ms`)), timeoutMs)
  )
]).catch(err => {
  // On timeout, transition to degraded
  this.stateMachine.transition('degraded', `Bootstrap failed: ${timeoutError.message}`);
  throw timeoutError;
});
```

User can then:
1. Retry with a longer timeout: `await engine.bootstrap(60000)`
2. Force full recovery: await engine's next bootstrap will transition `degraded → bootstrapping`

### Manual Recovery (Error Handler)

```typescript
const engine = new Engine(kernel, planner, executor);
await engine.bootstrap(); // ready

try {
  const plan = await engine.plan(config);
  const receipt = await engine.run(plan);
} catch (err) {
  const status = engine.status();
  
  if (status.errors.some(e => e.recoverable)) {
    // Suggestion provided by error handler
    console.log(status.errors[0].suggestion);
    // → "Check plan complexity and algorithm performance"
    
    // Adjust and retry
    const adjusted = { ...config, timeoutMs: 60000 };
    const plan2 = await engine.plan(adjusted);
    const receipt2 = await engine.run(plan2);
  } else {
    // Fatal error, must create new engine
    throw err;
  }
}
```

### TransitionValidator

From `packages/engine/src/transitions.ts`:

```typescript
export class TransitionValidator {
  static validateTransition(
    currentState: EngineState,
    targetState: EngineState,
    errors?: EngineError[]
  ): { valid: boolean; suggestion?: string } {
    if (!canTransition(currentState, targetState)) {
      return {
        valid: false,
        suggestion:
          `Cannot transition from ${currentState} to ${targetState}. ` +
          `Valid next states: ${getValidTransitions(currentState).join(', ')}`,
      };
    }

    // Additional validation for error states
    if (targetState === 'ready' && errors && errors.length > 0) {
      const hasFatalErrors = errors.some((e) => e.severity === 'fatal');
      if (hasFatalErrors) {
        return {
          valid: false,
          suggestion:
            'Cannot transition to ready state with fatal errors. Consider failed or degraded state.',
        };
      }
    }

    return { valid: true };
  }

  static suggestRecoveryState(
    currentState: EngineState,
    errors?: EngineError[]
  ): EngineState | null {
    if (!errors || errors.length === 0) {
      if (currentState !== 'ready') {
        return 'ready';
      }
      return null;
    }

    const hasFatalErrors = errors.some((e) => e.severity === 'fatal');
    const hasRecoverableErrors = errors.some((e) => e.recoverable);

    if (hasFatalErrors) {
      return 'failed';
    }

    if (hasRecoverableErrors) {
      if (canTransition(currentState, 'degraded')) {
        return 'degraded';
      }
    }

    if (canTransition(currentState, 'ready')) {
      return 'ready';
    }

    return null;
  }
}
```

---

## Error Handling by State

### Errors During `bootstrapping`

| Error | Recoverable? | Action |
|-------|-------------|--------|
| WASM fetch fails | No | Transition to `failed`, re-bootstrap with new engine |
| Kernel init throws | No | Transition to `failed`, check kernel compatibility |
| Bootstrap timeout (30s) | Yes | Transition to `degraded`, retry with longer timeout |
| OTel export fails | Yes | Transition to `degraded`, but engine still usable |

### Errors During `planning`

| Error | Recoverable? | Action |
|-------|-------------|--------|
| Config invalid | Yes | Transition to `degraded`, fix config and retry |
| Planning timeout (10s) | Yes | Transition to `degraded`, increase timeout or simplify plan |
| No planner configured | No | Transition to `failed`, need to reconfigure engine |
| DAG cycle detected | Yes | Transition to `degraded`, check step dependencies |

### Errors During `running`

| Error | Recoverable? | Action |
|-------|-------------|--------|
| Execution timeout (300s) | Yes | Transition to `degraded`, reduce step complexity |
| Step fails (non-fatal) | Yes | Transition to `degraded`, check step config |
| Algorithm crashes | No | Transition to `failed`, kernel may be corrupted |
| Sink write fails | Yes | Transition to `degraded`, check sink permissions |

### Errors During `watching`

| Error | Recoverable? | Action |
|-------|-------------|--------|
| Stream interrupted | Yes | Transition to `degraded`, restart watch |
| Checkpoint write fails | Yes | Transition to `degraded`, check checkpoint storage |
| Heartbeat timeout | Yes | Transition to `degraded`, check executor health |
| Handler throws | Yes | Transition to `degraded`, fix async handler |

---

## Concurrency and Thread Safety

### State Machine Locking

The `StateMachine` class uses synchronous transitions (no async state changes):

```typescript
// From packages/engine/src/lifecycle.ts (lines 33–124)
export class StateMachine {
  private currentState: EngineState = 'uninitialized';
  private listeners: Set<(event: LifecycleEvent) => void> = new Set();

  transition(targetState: EngineState, reason?: string): LifecycleEvent {
    // Synchronous: no race conditions
    if (!this.canTransition(targetState)) {
      throw new Error(`Invalid state transition: ...`);
    }

    const fromState = this.currentState;
    const event: LifecycleEvent = {
      timestamp: new Date(),
      fromState,
      toState: targetState,
      reason,
    };

    this.currentState = targetState;
    // ... update metadata ...

    // Emit listeners (async allowed here)
    this.listeners.forEach((listener) => {
      try {
        listener(event);
      } catch (err) {
        console.error('Error in lifecycle listener:', err);
      }
    });

    return event;
  }
}
```

**Key property:** State transitions are atomic—no interleaving with other operations.

### Preventing Concurrent Operations

The engine does NOT allow concurrent `bootstrap()`, `plan()`, `run()`, `watch()`:

```typescript
// Conceptually (not in code, enforced by state):
async bootstrap() {
  if (this.state() === 'bootstrapping') {
    throw new Error('Bootstrap already in progress');
  }
  // bootstrap cannot run twice simultaneously
}

async plan(config) {
  if (this.state() === 'planning') {
    throw new Error('Planning already in progress');
  }
  // plan cannot run twice simultaneously
}

async run(plan) {
  if (this.state() === 'running') {
    throw new Error('Execution already in progress');
  }
  // run cannot run twice simultaneously
}
```

**Enforcement:** State machine. If `state() !== 'ready'`, `plan()` throws.

### Safe Concurrency: Multiple Engines

For parallel work, use multiple engine instances:

```typescript
const engine1 = new Engine(kernel1, planner, executor);
const engine2 = new Engine(kernel2, planner, executor);
const engine3 = new Engine(kernel3, planner, executor);

await Promise.all([
  engine1.bootstrap(),
  engine2.bootstrap(),
  engine3.bootstrap(),
]); // All three bootstrap in parallel, no race conditions

const plans = await Promise.all([
  engine1.plan(config1),
  engine2.plan(config2),
  engine3.plan(config3),
]); // All three plan in parallel

const receipts = await Promise.all([
  engine1.run(plans[0]),
  engine2.run(plans[1]),
  engine3.run(plans[2]),
]); // All three execute in parallel
```

---

## Real-World Scenarios

### Scenario 1: HTTP API Server

**Goal:** Bootstrap once at startup, handle multiple discovery requests.

**Flow:**
```typescript
import { Engine } from '@pictl/engine';
import express from 'express';

const app = express();
const engine = new Engine(kernel, planner, executor);

// Startup
app.listen(3000, async () => {
  await engine.bootstrap(); // uninitialized → bootstrapping → ready
  console.log('Server ready');
});

// Per-request handler
app.post('/discover', async (req, res) => {
  try {
    const config = req.body;
    const plan = await engine.plan(config); // ready → planning → ready
    const receipt = await engine.run(plan); // ready → running → ready
    res.json(receipt);
  } catch (err) {
    const status = engine.status();
    res.status(500).json({ error: err.message, state: status.state });
  }
});
```

**State diagram:**
```
uninitialized
      ↓ (startup)
   ready ← ready ← ready ← ready ... (each request)
      ↓     ↓      ↓      ↓
   planning planning planning
      ↓     ↓      ↓
   running running running
      ↓     ↓      ↓
    ready  ready   ready
```

### Scenario 2: Batch Processing with Recovery

**Goal:** Process 100 event logs, retry on timeout, skip on fatal error.

**Flow:**
```typescript
const engine = new Engine(kernel, planner, executor);
await engine.bootstrap(); // uninitialized → bootstrapping → ready

const logs = Array.from({ length: 100 }, (_, i) => ({ id: i, path: `log_${i}.csv` }));

for (const log of logs) {
  try {
    const config = { sources: [{ kind: 'csv', path: log.path }], algorithm: { id: 'discover-inductive' } };
    const plan = await engine.plan(config);
    const receipt = await engine.run(plan);
    console.log(`✓ ${log.id}: ${receipt.runId}`);
  } catch (err) {
    const status = engine.status();
    
    if (status.errors[0]?.recoverable && status.state === 'degraded') {
      // Retry with longer timeout
      console.log(`⚠ ${log.id}: Recoverable error, retrying...`);
      const adjustedConfig = { ...config, timeoutMs: 60000 };
      const plan = await engine.plan(adjustedConfig);
      const receipt = await engine.run(plan);
      console.log(`✓ ${log.id}: ${receipt.runId} (retry)`);
    } else {
      // Fatal error, skip
      console.log(`✗ ${log.id}: Fatal error, skipping`);
    }
  }
}
```

**State transitions:**
```
ready → planning → ready → running → [ready | degraded] → [ready | planning | failed]
```

### Scenario 3: Streaming Execution with Monitoring

**Goal:** Long-running discovery, show progress, detect hangs.

**Flow:**
```typescript
const engine = new Engine(kernel, planner, executor, undefined, obsConfig, {
  heartbeatIntervalMs: 5000,
  checkpointIntervalMs: 10000,
});
await engine.bootstrap();

const config = { sources: [{ kind: 'parquet', path: 'huge_log.parquet' }], algorithm: { id: 'discover-heuristics', maxDepth: 10 } };
const plan = await engine.plan(config);

console.log('Starting watched execution...');
for await (const update of engine.watch(plan)) {
  console.log(`${update.progress}% - ${update.state}`);
  // { progress: 0, state: 'watching' }
  // { progress: 25, state: 'watching' }
  // { progress: 50, state: 'watching' }
  // { progress: 75, state: 'watching' }
  // { progress: 100, state: 'ready' }
}

console.log('Watched execution complete');
```

**State transitions:**
```
ready → watching → [ready | degraded | failed]
```

---

## Debugging State Machine Issues

### Inspect State and History

```typescript
const engine = new Engine(kernel, planner, executor);
await engine.bootstrap();

const status = engine.status();
console.log('Current state:', status.state); // 'ready'
console.log('Progress:', status.progress); // 0
console.log('Errors:', status.errors); // []
console.log('Uptime:', status.uptime); // ms since bootstrap

const stateMachine = engine.getStateMachine(); // access internal SM
const history = stateMachine.getTransitionHistory();
history.forEach(event => {
  console.log(`${event.timestamp.toISOString()}: ${event.fromState} → ${event.toState} (${event.reason})`);
});
```

### Trace OTel Spans

Configure observability to export to Jaeger:

```typescript
const obsConfig = {
  otel: {
    enabled: true,
    exporter: 'jaeger',
    exporterUrl: 'http://localhost:14268/api/traces',
  },
};

const engine = new Engine(kernel, planner, executor, undefined, obsConfig);
await engine.bootstrap();

// OTel spans emitted:
// span(name='state_change', attributes={from: 'uninitialized', to: 'bootstrapping'})
// span(name='wasm_load', attributes={duration_ms: 150})
// span(name='state_change', attributes={from: 'bootstrapping', to: 'ready'})
```

Visit `http://localhost:16686` (Jaeger UI) to inspect spans.

### Add Lifecycle Listeners

```typescript
const engine = new Engine(kernel, planner, executor);
const stateMachine = engine.getStateMachine();

stateMachine.onTransition((event) => {
  console.log(`LIFECYCLE: ${event.fromState} → ${event.toState} at ${event.timestamp.toISOString()}`);
  if (event.reason) {
    console.log(`  Reason: ${event.reason}`);
  }
});

await engine.bootstrap();
// LIFECYCLE: uninitialized → bootstrapping at 2026-04-10T12:00:00.000Z
//   Reason: Starting WASM and kernel initialization
// LIFECYCLE: bootstrapping → ready at 2026-04-10T12:00:00.150Z
//   Reason: WASM and kernel initialized successfully
```

---

## Summary

The pictl Engine state machine provides:

1. **Clear states:** 8 distinct states, well-defined semantics
2. **Safe transitions:** 12 valid transitions, all others rejected
3. **Error recovery:** Automatic degradation + manual recovery paths
4. **Observability:** OTel spans for every state change and error
5. **Concurrency safety:** Synchronous state changes, no race conditions
6. **Debugging:** Transition history, status snapshots, lifecycle listeners

Use the state machine to reason about engine health: if `state() === 'ready'`, the engine is ready for work. If `state() === 'degraded'`, there was a recoverable error. If `state() === 'failed'`, create a new engine.
