# @pictl/engine

High-level engine lifecycle and state machine for pictl. Manages bootstrap, planning, execution, and error recovery with a well-defined state machine and comprehensive error handling.

## Features

- **State Machine**: 8-state lifecycle with validated transitions
- **Error Handling**: Structured error information with recovery suggestions
- **Progress Tracking**: Real-time execution progress and time estimation
- **Async Execution**: Full async/await support with streaming status updates
- **Graceful Degradation**: Transitions to degraded state on non-fatal errors
- **Transition History**: Complete audit trail of all state changes
- **Type-Safe**: Full TypeScript support with strict types

## Architecture

### State Machine

The engine has 8 distinct states with validated transitions:

```
┌─────────────────┐
│ uninitialized   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌─────────┐
│ bootstrapping   │────▶│ failed  │◀─┐
└────────┬────────┘     └─────────┘  │
         │                            │
         ▼                            │
┌─────────────────┐                  │
│     ready       │──────────────────┤
└─┬──────────┬───┬┘                  │
  │          │   │                   │
  ▼          ▼   ▼                   │
planning  running watching         degraded
  │          │   │                   │
  └──┬───────┴───┘                   │
     │                               │
     └──────────────────┬────────────┘
                        │
                        ▼
                   (terminal)
```

### Usage

#### Basic Bootstrap

```typescript
import { createSimpleEngine } from '@pictl/engine';

const engine = createSimpleEngine(kernel);
await engine.bootstrap();

const status = engine.status();
console.log(status.state); // 'ready'
```

#### Full Pipeline

```typescript
import { createFullEngine } from '@pictl/engine';

const engine = createFullEngine(kernel, planner, executor);
await engine.bootstrap();

const plan = await engine.plan(config);
const receipt = await engine.run(plan);

console.log(receipt.progress); // 100
```

#### Watched Execution

```typescript
const plan = await engine.plan(config);

for await (const update of engine.watch(plan)) {
  console.log(`Progress: ${update.progress}%`);
  console.log(`State: ${update.state}`);
  
  if (update.error) {
    console.error(`Error: ${update.error.message}`);
  }
}
```

#### Error Recovery

```typescript
try {
  await engine.plan(config);
} catch (err) {
  const status = engine.status();
  
  if (status.state === 'degraded') {
    console.log('Recovering...');
    await engine.recover();
  }
}
```

## API

### Engine

Main orchestration class for the lifecycle.

#### Methods

- `state(): EngineState` - Get current state
- `status(): EngineStatus` - Get complete status snapshot
- `bootstrap(): Promise<void>` - Initialize kernel
- `plan(config: unknown): Promise<ExecutionPlan>` - Generate execution plan
- `run(plan: ExecutionPlan): Promise<ExecutionReceipt>` - Execute plan
- `watch(plan: ExecutionPlan): AsyncIterable<StatusUpdate>` - Stream execution
- `degrade(error: ErrorInfo, reason?: string): Promise<void>` - Transition to degraded
- `recover(): Promise<void>` - Recover from degraded state
- `shutdown(): Promise<void>` - Graceful shutdown
- `isFailed(): boolean` - Check if terminal state
- `isReady(): boolean` - Check if operational
- `getTransitionHistory(): LifecycleEvent[]` - Audit trail

### StateMachine

Low-level state management with transition validation.

#### Methods

- `getState(): EngineState` - Current state
- `canTransition(targetState: EngineState): boolean` - Validate transition
- `transition(targetState: EngineState, reason?: string): LifecycleEvent` - Perform transition
- `onTransition(listener): () => void` - Subscribe to transitions
- `getValidTransitions(): EngineState[]` - Valid next states
- `isTerminal(): boolean` - Is in failed state
- `isOperational(): boolean` - Is in ready/watching state
- `isProcessing(): boolean` - Is in planning/running state

### StatusTracker

Tracks progress, errors, and timing.

#### Methods

- `setState(state: EngineState): void` - Update state
- `setPlan(plan: ExecutionPlan): void` - Set execution plan
- `start(): void` - Mark start time
- `finish(): void` - Mark finish time
- `recordStepCompletion(stepId: string): void` - Track step progress
- `addError(error: ErrorInfo): void` - Collect error
- `getStatus(): EngineStatus` - Get status snapshot
- `getReceipt(): ExecutionReceipt` - Get final receipt
- `reset(): void` - Clear all state

### TransitionValidator

Validates transitions with error context.

#### Methods

- `validateTransition(from, to, errors?): { valid, suggestion? }` - Validate transition
- `suggestRecoveryState(state, errors?): EngineState | null` - Suggest recovery path

## Type Definitions

### EngineState

```typescript
type EngineState =
  | 'uninitialized'  // Initial state
  | 'bootstrapping'  // Loading kernel
  | 'ready'          // Ready to accept work
  | 'planning'       // Generating plan
  | 'running'        // Executing plan
  | 'watching'       // Streaming execution
  | 'degraded'       // Recoverable error state
  | 'failed';        // Terminal error state
```

### EngineStatus

```typescript
interface EngineStatus {
  state: EngineState;
  runId?: string;
  progress: number; // 0-100
  estimate?: {
    elapsed: number;    // ms
    remaining: number;  // ms
  };
  errors: ErrorInfo[];
  metadata?: Record<string, unknown>;
}
```

### ErrorInfo

```typescript
interface ErrorInfo {
  code: string;
  message: string;
  severity: 'info' | 'warning' | 'error' | 'fatal';
  context?: Record<string, unknown>;
  recoverable: boolean;
  suggestion?: string;
}
```

### StatusUpdate

```typescript
interface StatusUpdate {
  timestamp: Date;
  state: EngineState;
  progress: number;  // 0-100
  message?: string;
  error?: ErrorInfo;
}
```

## Testing

Run the test suite:

```bash
npm run test
```

Run with coverage:

```bash
npm run test -- --coverage
```

Run in watch mode:

```bash
npm run test -- --watch
```

## Error Handling Contract

The engine enforces a strict error handling contract:

1. **No Throwing Unless Fatal** - Non-fatal errors are collected and reported in status
2. **All Errors Wrapped** - Errors include code, severity, recovery suggestions
3. **State Always Queryable** - Status is always available, even in error states
4. **Graceful Degradation** - Engine transitions to degraded, not failed, for recoverable errors
5. **Recovery Path** - Degraded state can recover; failed state requires restart

## Integration Points

The engine depends on three interfaces:

### Kernel

Represents the WASM runtime initialization. Implement for custom initialization:

```typescript
interface Kernel {
  init(): Promise<void>;
  shutdown(): Promise<void>;
  isReady(): boolean;
}
```

### Planner

Generates execution plans from configuration:

```typescript
interface Planner {
  plan(config: unknown): Promise<ExecutionPlan>;
}
```

### Executor

Executes plans and provides results:

```typescript
interface Executor {
  run(plan: ExecutionPlan): Promise<ExecutionReceipt>;
  watch(plan: ExecutionPlan): AsyncIterable<StatusUpdate>;
}
```

## Performance

- **State transitions**: O(1) with validation
- **Status queries**: O(1) snapshots
- **Error collection**: O(1) amortized (capped at 100)
- **Progress calculation**: O(1) linear estimation

## Debugging

Enable debug logging:

```typescript
// Logs state transitions with duration
engine.bootstrap(); // [Engine] State transition: ...
```

Get audit trail:

```typescript
const history = engine.getTransitionHistory();
for (const event of history) {
  console.log(`${event.fromState} -> ${event.toState}: ${event.reason}`);
}
```

Get detailed status:

```typescript
const status = engine.status();
console.log(`State: ${status.state}`);
console.log(`Progress: ${status.progress}%`);
console.log(`Errors: ${status.errors.length}`);
for (const err of status.errors) {
  console.log(`- [${err.code}] ${err.message} (${err.severity})`);
}
```

## License

MIT
