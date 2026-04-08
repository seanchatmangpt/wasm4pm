# Engine Implementation Guide

## Overview

This document describes the implementation of the wasm4pm engine lifecycle and state machine per PRD §12.

## Project Structure

```
packages/
├── types/                    # Shared type definitions
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       └── index.ts         # Core types (EngineState, ExecutionPlan, etc.)
│
└── engine/                   # Engine lifecycle and state machine
    ├── package.json
    ├── tsconfig.json
    ├── vitest.config.ts
    ├── README.md
    ├── IMPLEMENTATION.md     # This file
    └── src/
        ├── index.ts         # Public exports
        ├── engine.ts        # Main Engine class
        ├── lifecycle.ts     # StateMachine and TransitionValidator
        ├── status.ts        # StatusTracker and formatting
        └── engine.test.ts   # Comprehensive test suite
```

## Module Breakdown

### 1. types/src/index.ts

Defines shared types used across the monorepo:

- `ExecutionPlan`: Blueprint for execution with ordered steps
- `ExecutionReceipt`: Audit trail of completed execution
- `EngineState`: 8-state lifecycle enum
- `EngineStatus`: Current status snapshot
- `StatusUpdate`: Streaming status during execution
- `ErrorInfo`: Structured error with recovery context
- `PlanStep`: Individual step in a plan

### 2. engine/src/lifecycle.ts

Implements the state machine with validation:

**StateMachine**:
- Enforces valid transitions between states
- Maintains transition history with timestamps
- Emits LifecycleEvent for each transition
- Tracks state age and entry time
- Subscribers can listen to state changes

**TransitionValidator**:
- Validates transitions with recovery context
- Suggests recovery paths based on error severity
- Prevents fatal errors from transitioning to ready

**State Transition Graph**:
```
uninitialized → bootstrapping → {ready, failed}
                                  ↓
                            {planning, degraded}
                              ↓
                           ready (loop)
                              ↓
                       {running, watching}
                              ↓
                          ready
degraded → bootstrapping (recovery) → ready
failed (terminal) ← fatal errors from any state
```

### 3. engine/src/status.ts

Implements progress and error tracking:

**StatusTracker**:
- Tracks progress as a percentage (0-100)
- Collects errors (max 100) for debugging
- Calculates time estimates (elapsed + remaining)
- Generates ExecutionReceipt for audit trail
- Resets for new executions

**Formatting Functions**:
- `formatError()`: Human-readable error messages
- `formatStatus()`: Multi-line status summary

**Progress Calculation**:
- Linear estimation: `remaining = (elapsed / progress) * (100 - progress)`
- Updated on each step completion
- Returns 0 if no steps, 100 if complete

### 4. engine/src/engine.ts

Main Engine class implementing the lifecycle:

**Core Interface**:
- `state(): EngineState` - Current state
- `status(): EngineStatus` - Complete snapshot
- `bootstrap(): Promise<void>` - Load kernel
- `plan(config): Promise<ExecutionPlan>` - Generate plan
- `run(plan): Promise<ExecutionReceipt>` - Execute plan
- `watch(plan): AsyncIterable<StatusUpdate>` - Stream execution
- `degrade(error): Promise<void>` - Transition to degraded
- `recover(): Promise<void>` - Recover from degraded
- `shutdown(): Promise<void>` - Graceful shutdown

**Lifecycle Rules**:
1. `bootstrap()`: Must be called first. Transitions through bootstrapping to ready.
2. `plan()`: Only works from ready state. Returns to ready after planning.
3. `run()`: Only works from ready state. Executes plan and returns to ready.
4. `watch()`: Only works from ready state. Streams updates, returns to ready.
5. `degrade()`: Transitions to degraded for recoverable errors.
6. `recover()`: Recovers from degraded by reinitializing kernel.
7. `shutdown()`: Final operation, transitions to failed (terminal).

**Error Handling**:
- Errors are caught, wrapped in ErrorInfo, and added to status
- TransitionValidator suggests recovery path (ready, degraded, or failed)
- Non-fatal errors don't throw; fatal errors do
- All errors include code, severity, and recovery suggestions

**Dependency Injection**:
- `Kernel`: WASM runtime initialization
- `Planner`: Configuration → ExecutionPlan
- `Executor`: ExecutionPlan → ExecutionReceipt + StatusUpdates

## Transition Rules

### Valid Transitions from Each State

| From | To | Condition |
|------|----|----|
| uninitialized | bootstrapping | Always |
| bootstrapping | ready | Kernel ready |
| bootstrapping | failed | Kernel init failed |
| ready | planning | Planner available |
| ready | running | Executor available |
| ready | degraded | Non-fatal error |
| ready | failed | Fatal error |
| planning | ready | Plan generated |
| planning | degraded | Planning error |
| planning | failed | Fatal error |
| running | watching | Executor available |
| running | ready | Execution complete |
| running | degraded | Execution error |
| running | failed | Fatal error |
| watching | ready | Streaming complete |
| watching | degraded | Streaming error |
| watching | failed | Fatal error |
| degraded | bootstrapping | Recovery attempt |
| degraded | ready | Recovery success |
| degraded | failed | Recovery failed |
| failed | bootstrapping | Restart required |

## Error Handling Contract

### Requirements (Non-negotiable)

1. **No Throwing Unless Fatal**
   - Recoverable errors → degraded state
   - Fatal errors → failed state
   - Only throw() on fatal errors

2. **All Errors Wrapped**
   - ErrorInfo with code, message, severity
   - Include recovery suggestion
   - Include context object

3. **State Always Queryable**
   - status() always returns current snapshot
   - No waiting for async operations
   - Errors always available in status

4. **Graceful Degradation**
   - Try to stay operational
   - Degraded > failed when possible
   - Preserve recovery option

5. **Recovery Path**
   - degraded → bootstrapping → ready
   - failed requires shutdown + new engine
   - Context preserved across degradation

### Error Codes

| Code | Severity | Recoverable | Action |
|------|----------|-------------|--------|
| BOOTSTRAP_FAILED | fatal | true | → failed |
| PLANNING_FAILED | error | true | → degraded or ready |
| EXECUTION_FAILED | error | true | → degraded or ready |
| WATCH_FAILED | error | true | → degraded or ready |
| RECOVERY_FAILED | error | false | → failed |
| SHUTDOWN_FAILED | warning | false | log only |

## Testing Strategy

The test suite covers:

### State Management (6 tests)
- Initial state
- Status accuracy
- Ready/failed checks

### Bootstrap (4 tests)
- Normal bootstrap
- Kernel initialization failure
- Invalid bootstrap from non-initial state
- Error collection and recovery suggestions

### Planning (4 tests)
- Plan generation
- Missing planner error
- Planning failure
- Invalid planning from non-ready state

### Execution (4 tests)
- Plan execution with receipt
- Missing executor error
- Invalid execution from non-ready state
- Progress tracking

### Watched Execution (3 tests)
- Status update streaming
- Progress monotonicity
- Invalid watch from non-ready state

### Error Handling (2 tests)
- Error collection in status
- Recovery suggestions in errors

### Degradation (3 tests)
- Degrade transition
- Recovery from degraded
- Recovery failure handling

### Shutdown (3 tests)
- Graceful shutdown
- Kernel shutdown
- Shutdown error handling

### Transition History (3 tests)
- History recording
- Transition reasons
- Transition timestamps

### StateMachine (8 tests)
- Initial state
- Transition validation
- Valid transitions query
- Invalid transition errors
- Valid transitions
- Lifecycle events
- State age tracking

### StatusTracker (5 tests)
- Initial status
- Progress tracking
- Error collection
- Receipt generation
- Reset functionality

**Total: 48 comprehensive tests**

## Integration Examples

### Basic Usage

```typescript
import { createSimpleEngine } from '@wasm4pm/engine';
import { WasmKernel } from '@wasm4pm/kernel';

const kernel = new WasmKernel();
const engine = createSimpleEngine(kernel);

await engine.bootstrap();
console.log(engine.state()); // 'ready'
```

### Full Pipeline

```typescript
import { createFullEngine } from '@wasm4pm/engine';

const engine = createFullEngine(kernel, planner, executor);
await engine.bootstrap();

const plan = await engine.plan({ source: '...' });
const receipt = await engine.run(plan);

console.log(`Completed: ${receipt.durationMs}ms`);
console.log(`Errors: ${receipt.errors.length}`);
```

### Watched Execution

```typescript
for await (const update of engine.watch(plan)) {
  console.log(`[${update.state}] ${update.progress}%`);
  
  if (update.error) {
    console.error(`Error: ${update.error.message}`);
    console.error(`Recovery: ${update.error.suggestion}`);
  }
}
```

### Error Recovery

```typescript
try {
  await engine.plan(config);
} catch (err) {
  const status = engine.status();
  
  if (status.state === 'degraded') {
    console.log('Attempting recovery...');
    await engine.recover();
    
    if (engine.isReady()) {
      console.log('Recovery successful');
    }
  }
}
```

## Performance Characteristics

| Operation | Complexity | Notes |
|-----------|-----------|-------|
| state() | O(1) | Direct field access |
| status() | O(n) | n = # of errors (max 100) |
| bootstrap() | O(kernel.init()) | Depends on kernel |
| plan() | O(planner.plan()) | Depends on planner |
| run() | O(executor.run()) | Depends on executor |
| watch() | O(executor.watch()) | Streaming, O(1) per update |
| Transition | O(1) | Validation only |
| History | O(n) | n = # of transitions |

## Debugging Tips

### Enable Debug Logging

```typescript
engine.bootstrap(); // Logs to console.debug
```

### Get Transition History

```typescript
const history = engine.getTransitionHistory();
for (const event of history) {
  console.log(`${event.timestamp.toISOString()}: ${event.fromState} → ${event.toState}`);
  if (event.reason) console.log(`  Reason: ${event.reason}`);
}
```

### Check Status Details

```typescript
const status = engine.status();
console.log(`Current: ${status.state}`);
console.log(`Progress: ${status.progress}%`);
console.log(`Errors: ${status.errors.length}`);

for (const err of status.errors) {
  console.log(`- [${err.code}] ${err.message}`);
  console.log(`  Severity: ${err.severity}`);
  console.log(`  Recoverable: ${err.recoverable}`);
  if (err.suggestion) {
    console.log(`  Suggestion: ${err.suggestion}`);
  }
}

if (status.estimate) {
  console.log(`Elapsed: ${status.estimate.elapsed}ms`);
  console.log(`ETA: ${status.estimate.remaining}ms`);
}
```

### Watch Transitions in Real-Time

```typescript
const history: LifecycleEvent[] = [];
const unsubscribe = engine.stateMachine.onTransition((event) => {
  history.push(event);
  console.log(`Transition: ${event.reason}`);
});

// ... operations ...

// Cleanup
unsubscribe();
```

## Design Decisions

### Why 8 States?

- `uninitialized`: Clear starting point
- `bootstrapping`: Explicit loading phase
- `ready`: Stable, operational state
- `planning`: Generation phase (important for UI)
- `running`: Active execution
- `watching`: Streaming execution
- `degraded`: Recoverable error state
- `failed`: Terminal state

This separates concerns and provides visibility into each phase.

### Why Separate Degraded and Failed?

- `degraded`: Recoverable via `recover()` → restart kernel
- `failed`: Terminal, requires new Engine instance
- Allows graceful error handling without restarting

### Why StatusUpdate Instead of Just EngineStatus?

- `StatusUpdate`: Streaming changes (incremental)
- `EngineStatus`: Full snapshot (queries)
- Streaming is more efficient for watching

### Why No Throwing on Non-Fatal Errors?

- Recoverable errors don't deserve exceptions
- Allows progress despite errors
- Errors available in status for inspection
- Keeps execution flow clean

### Why Separate Kernel, Planner, Executor?

- Single responsibility principle
- Engine doesn't know implementation details
- Easy to mock for testing
- Allows composition and reuse

## Future Extensions

Potential future features:

1. **Timeouts**: Per-state timeout handling
2. **Checkpoints**: Save/restore state for resumption
3. **Cancellation**: Cancel in-progress operations
4. **Metrics**: Built-in performance tracking
5. **Hooks**: Before/after transition callbacks
6. **Validation**: Pre-transition validation functions
7. **Persistence**: Serialize/deserialize state
8. **Monitoring**: Integration with observability tools

## References

- PRD §12: Engine Lifecycle and State Machine
- TypeScript 5.3+
- Vitest 1.1+ for testing
- ES2020+ target

## Contributing

When modifying the engine:

1. **Preserve State Contracts**: Don't change valid transitions
2. **Add Tests**: Every feature needs tests
3. **Update Docs**: Keep README and IMPLEMENTATION in sync
4. **Test Integration**: Verify with kernel/planner/executor
5. **Performance**: Profile before/after changes
6. **Backwards Compatibility**: Maintain existing interfaces

## License

MIT
