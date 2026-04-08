# Package Implementation History

Historical record of package implementations across the pictl monorepo.

## @pictl/config

Configuration management with Zod validation, multi-source loading, and BLAKE3 hashing.

- Zod-based schema validation with remediation hints for all config sections
- Multi-source loading: CLI > TOML > JSON > ENV (`WASM4PM_*`) > defaults
- BLAKE3 deterministic hashing: `hashConfig()`, `fingerprintConfig()`, section hashing, config diffing
- Provenance tracking on every config value (source, path, timestamp)
- 150+ test cases across loading, validation, hashing, and integration

Full archive: [docs/archive/packages/config/IMPLEMENTATION.md](archive/packages/config/IMPLEMENTATION.md)

## @pictl/contracts

Type-safe contracts, receipts, error system, hashing, algorithm registry, and prediction tasks.

- `Receipt` interface with BLAKE3-hashed fields, UUID v4 run IDs, ISO 8601 timestamps
- Fluent `ReceiptBuilder` with method chaining, auto-generated UUIDs, validation on `build()`
- Tampering detection via `verifyReceiptHashes()` and `detectTampering()`
- Error codes: 200s=config, 300s=source, 400s=algorithm, 500s=wasm, 600s=sink, 700s=otel
- `Result<T>` discriminated union: `ok(value)` | `err(string)` | `error(ErrorInfo)`
- 130+ test cases including integration tests and tampering scenarios

Full archive: [docs/archive/packages/contracts/IMPLEMENTATION.md](archive/packages/contracts/IMPLEMENTATION.md)

## @pictl/engine

Engine lifecycle state machine with 8 states and graceful degradation/recovery.

- 8-state lifecycle: uninitialized → bootstrapping → ready ↔ planning → running → watching / degraded / failed
- `StateMachine` enforcing valid transitions with timestamped history and event emission
- `StatusTracker` with progress percentage (0-100), error collection (max 100), time estimates
- Dependency injection for Kernel, Planner, and Executor; streaming via `watch()` returning `AsyncIterable<StatusUpdate>`
- Non-fatal errors transition to `degraded` (recoverable); only fatal errors throw
- 48 comprehensive tests covering all states, transitions, and recovery paths

Full archive: [docs/archive/packages/engine/IMPLEMENTATION.md](archive/packages/engine/IMPLEMENTATION.md)

## @pictl/observability

Three-layer observability: CLI output, JSONL machine output, OTEL spans.

- Layer 1: CLI/human-readable (console), Layer 2: JSONL (file/stdout), Layer 3: OTEL/OTLP (HTTP)
- Non-blocking `emit()` with buffered writes (JSON: 100 events) and queued exports (OTEL: 1000 events)
- Automatic recursive secret redaction for password, token, api_key, secret, credentials keys
- Required OTEL attributes: `run.id`, `config.hash`, `input.hash`, `plan.hash`, `execution.profile`
- OTEL failures never break execution; events dropped on queue overflow
- 25+ tests covering non-blocking behavior, secret redaction, and queue overflow

Full archive: [docs/archive/packages/observability/IMPLEMENTATION.md](archive/packages/observability/IMPLEMENTATION.md)

## @pictl/planner

Execution plan generation with DAG validation and algorithm selection.

- `plan(config)` → `ExecutionPlan` with ordered steps, dependency DAG, BLAKE3 hashes
- 24 step types via factory functions (bootstrap, WASM init, source, validate, algorithm, analysis, sinks, cleanup)
- DAG utilities: DFS cycle detection, Kahn's topological sort, transitive closures
- `explain(config)` principle: "explain() == run()" — both use identical `plan()` function
- 5 execution profiles: fast, balanced, quality, stream, research
- 130 tests across plan generation, DAG operations, and validation

Full archive: [docs/archive/packages/planner/IMPLEMENTATION.md](archive/packages/planner/IMPLEMENTATION.md)
