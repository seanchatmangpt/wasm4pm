# Explanation: Engine State Machine

**Time to read**: 10 minutes  
**Level**: Advanced  

## The 8 States

Every execution traverses these states:

```
1. INITIALIZED      New engine created
   ↓
2. CONFIG_LOADED    Config parsed & validated
   ↓
3. PLAN_GENERATED   Execution plan created
   ↓
4. EXECUTING        Algorithm running
   ↓
5. COMPUTING        Post-processing
   ↓
6. OUTPUT_WRITING   Writing results
   ↓
7. COMPLETED        Success (terminal)
   or
   FAILED           Error (terminal)
```

## State Transitions

### INITIALIZED → CONFIG_LOADED

```
Transition condition: Config file exists & readable
Action: Parse & validate config schema
On failure: → FAILED (CONFIG_ERROR)
```

### CONFIG_LOADED → PLAN_GENERATED

```
Transition condition: Config valid
Action: Create execution DAG
On failure: → FAILED (CONFIG_INCOMPATIBLE)
```

### PLAN_GENERATED → EXECUTING

```
Transition condition: Plan valid
Action: Load event log, start algorithm
On failure: → FAILED (SOURCE_ERROR or ALGORITHM_FAILED)
```

### EXECUTING → COMPUTING

```
Transition condition: Algorithm completed or timeout
Action: Compute metrics, generate model
On failure: → FAILED (EXECUTION_ERROR)
```

### COMPUTING → OUTPUT_WRITING

```
Transition condition: Metrics ready
Action: Write model, receipt, reports
On failure: → FAILED (PARTIAL_SUCCESS)
```

### OUTPUT_WRITING → COMPLETED

```
Transition condition: All sinks successful
Action: Generate receipt, mark done
On failure: → FAILED (if critical sinks fail)
```

## State Diagram

```
       ┌─────────────────────────────┐
       │   INITIALIZED               │
       │  (new engine)               │
       └──────────┬──────────────────┘
                  │
                  ▼
       ┌─────────────────────────────┐
       │   CONFIG_LOADED             │
       │  (config valid)             │
       └──────────┬──────────────────┘
                  │
                  ▼
       ┌─────────────────────────────┐
       │   PLAN_GENERATED            │
       │  (execution plan created)   │
       └──────────┬──────────────────┘
                  │
                  ▼
       ┌─────────────────────────────┐
       │   EXECUTING                 │
       │  (algorithm running)        │
       └──────────┬──────────────────┘
                  │
                  ▼
       ┌─────────────────────────────┐
       │   COMPUTING                 │
       │  (post-processing)          │
       └──────────┬──────────────────┘
                  │
                  ▼
       ┌─────────────────────────────┐
       │   OUTPUT_WRITING            │
       │  (writing results)          │
       └──┬──────────────────────┬───┘
          │                      │
          │ Success              │ Failure
          ▼                      ▼
     ┌─────────────┐      ┌──────────────┐
     │  COMPLETED  │      │   FAILED     │
     │ (terminal)  │      │  (terminal)  │
     └─────────────┘      └──────────────┘
```

## State Properties

| State | Can transition to next | Can fail | Can recover |
|-------|------------------------|----------|-------------|
| INITIALIZED | Yes | No | — |
| CONFIG_LOADED | Yes | Yes | Retry config |
| PLAN_GENERATED | Yes | Yes | Replan |
| EXECUTING | Yes | Yes | Retry algorithm |
| COMPUTING | Yes | Yes | Recompute |
| OUTPUT_WRITING | Yes | Yes | Retry write |
| COMPLETED | No | No | Done ✓ |
| FAILED | No | No | Investigate |

## Failed State is Terminal

Once in FAILED state, no recovery:

```
FAILED is terminal:
  - Cannot transition to any other state
  - Execution stops
  - Manual intervention required
  - Operator must fix the problem and retry
```

Example:

```
→ EXECUTING (algorithm timeout)
  → FAILED (ALGORITHM_TIMEOUT)
  [STUCK]
  
Recovery requires:
  1. Increase timeout in config
  2. Run again
  3. New execution (new INITIALIZED)
```

## Checkpoint State

Streaming maintains checkpoint state:

```
EXECUTING (at event 1000)
  [Checkpoint 1: state snapshot]
  
EXECUTING (at event 2000)
  [Checkpoint 2: state snapshot]
  
[Interrupted]

Resume:
  Load Checkpoint 2
  → EXECUTING (continue from event 2001)
  → COMPUTING
  → OUTPUT_WRITING
  → COMPLETED
```

## Monitoring State

Query current state:

```bash
curl http://localhost:3001/status/run-abc123
```

Response:

```json
{
  "run_id": "run-abc123",
  "state": "EXECUTING",
  "progress_percent": 45,
  "elapsed_ms": 2340,
  "current_checkpoint": 5
}
```

## Tracing States

Debug state transitions:

```bash
WASM4PM_TRACE=1 pmctl run --config config.toml
```

Output:

```
[TRACE] State: INITIALIZED
[TRACE] State → CONFIG_LOADED (config valid)
[TRACE] State → PLAN_GENERATED (plan created)
[TRACE] State → EXECUTING (algorithm started)
[TRACE] Progress: 25%
[TRACE] Progress: 50%
[TRACE] Progress: 100%
[TRACE] State → COMPUTING (post-processing)
[TRACE] State → OUTPUT_WRITING (writing results)
[TRACE] State → COMPLETED
```

## See Also

- [Explanation: Execution Substrate](./execution-substrate.md)
- [Reference: Error Codes](../reference/error-codes.md)
