# API Reference - @wasm4pm/observability

Complete reference for the public API of the observability layer.

## Main Entry Point

### `ObservabilityLayer`

Central class for managing all three observability layers.

```typescript
class ObservabilityLayer {
  // Constructor
  constructor(config?: ObservabilityConfig)

  // Configuration
  getConfig(): ObservabilityConfig

  // Runtime layer control
  enableJson(dest: string): void
  enableOtel(config: {
    endpoint: string
    exporter?: 'otlp_http' | 'otlp_grpc'
    required?: boolean
  }): void

  // Layer 1: CLI emission
  emitCli(event: CliEvent): void

  // Layer 2: JSON emission
  emitJson(event: JsonEvent): void

  // Layer 3: OTEL emission
  emitOtel(event: OtelEvent): void

  // Unified emission (all layers)
  emit(event: {
    cli?: CliEvent
    json?: JsonEvent
    otel?: OtelEvent
  }): void

  // Helper: Create spans with required attributes
  createSpan(
    traceId: string,
    name: string,
    requiredAttrs: RequiredOtelAttributes,
    customAttrs?: Record<string, any>
  ): string

  // Helper: Generate W3C-compliant trace ID
  static generateTraceId(): string

  // Lifecycle: Gracefully shutdown
  async shutdown(): Promise<ObservabilityResult>
}
```

### `getObservabilityLayer(config?: ObservabilityConfig): ObservabilityLayer`

Singleton getter for default observability instance (optional convenience export).

## Supporting Classes

### `JsonWriter`

Manages JSON/JSONL event writing with buffering and flushing.

```typescript
class JsonWriter {
  // Constructor
  constructor(config: JsonConfig)

  // Emit event (non-blocking)
  emit(event: JsonEvent): void

  // Redact secrets from data
  static redactSecrets(data: Record<string, any>): Record<string, any>

  // Lifecycle: Gracefully shutdown
  async shutdown(): Promise<ObservabilityResult>
}
```

### `OtelExporter`

Manages OTEL event queuing and batch HTTP export.

```typescript
class OtelExporter {
  // Constructor
  constructor(config: OtelConfig)

  // Emit event (non-blocking, queued)
  emit(event: OtelEvent): void

  // Lifecycle: Gracefully shutdown
  async shutdown(): Promise<ObservabilityResult>
}
```

## Type Definitions

### `CliEvent`

Human-readable console log event.

```typescript
interface CliEvent {
  level: 'info' | 'warn' | 'error' | 'debug'
  message: string
  timestamp?: Date
}
```

### `JsonEvent`

Machine-readable structured log event (JSONL).

```typescript
interface JsonEvent {
  timestamp: string        // ISO 8601 (added if not provided)
  component: string        // e.g., 'engine', 'planner', 'connector'
  event_type: string       // e.g., 'execution_start', 'discovery_complete'
  run_id?: string          // UUID of execution run
  data: Record<string, any> // Arbitrary structured data
}
```

### `OtelEvent`

Distributed tracing span event (OpenTelemetry).

```typescript
interface OtelEvent {
  trace_id: string         // W3C Trace Context (32 hex chars)
  span_id: string          // W3C Trace Context (16 hex chars)
  parent_span_id?: string  // For child spans
  name: string             // Span name
  kind?: 'INTERNAL' | 'SERVER' | 'CLIENT' | 'PRODUCER' | 'CONSUMER'
  start_time: number       // Unix timestamp in nanoseconds
  end_time?: number        // Unix timestamp in nanoseconds
  status?: {
    code: 'UNSET' | 'OK' | 'ERROR'
    message?: string
  }
  attributes: Record<string, any> // OTEL attributes
  events?: Array<{
    name: string
    timestamp: number      // Unix timestamp in nanoseconds
    attributes?: Record<string, any>
  }>
}
```

### `ObservabilityConfig`

Main configuration object.

```typescript
interface ObservabilityConfig {
  json?: JsonConfig
  otel?: OtelConfig
}
```

### `JsonConfig`

JSON writer configuration.

```typescript
interface JsonConfig {
  enabled: boolean
  dest: string             // File path or 'stdout'
  rotation?: {
    max_bytes?: number     // Maximum file size before rotation
    max_files?: number     // Maximum number of rotated files to keep
  }
}
```

### `OtelConfig`

OTEL exporter configuration.

```typescript
interface OtelConfig {
  enabled: boolean
  exporter: 'otlp_http' | 'otlp_grpc'
  endpoint: string         // e.g., 'http://localhost:4317'
  required: boolean        // If false, OTEL errors don't fail execution
  timeout_ms?: number      // Default: 5000
  max_queue_size?: number  // Default: 1000
  batch_size?: number      // Default: 100
}
```

### `RequiredOtelAttributes`

Required attributes for all OTEL spans per PRD §18.2-3.

```typescript
interface RequiredOtelAttributes {
  'run.id': string              // UUID of execution
  'config.hash': string         // BLAKE3 hash of config
  'input.hash': string          // BLAKE3 hash of input
  'plan.hash': string           // BLAKE3 hash of plan
  'execution.profile': string   // e.g., 'default', 'benchmark'
  'source.kind': string         // e.g., 'xes', 'csv', 'parquet'
  'sink.kind': string           // e.g., 'petri_net', 'dfg', 'json'
}
```

### `ObservabilityResult`

Result of an observability operation.

```typescript
interface ObservabilityResult {
  success: boolean
  error?: string           // Error message if failed
  timestamp: Date          // When operation completed
}
```

## Export Map

The package exports the following from `@wasm4pm/observability`:

```typescript
// Main classes
export { ObservabilityLayer, getObservabilityLayer }
export { JsonWriter }
export { OtelExporter }

// All types
export type {
  CliEvent,
  JsonEvent,
  OtelEvent,
  OtelConfig,
  JsonConfig,
  ObservabilityConfig,
  RequiredOtelAttributes,
  ObservabilityResult,
}
```

## Usage Patterns

### Minimal Setup

```typescript
import { ObservabilityLayer } from '@wasm4pm/observability'

const obs = new ObservabilityLayer()
obs.emitCli({ level: 'info', message: 'Hello' })
```

### Full Configuration

```typescript
import { ObservabilityLayer } from '@wasm4pm/observability'

const obs = new ObservabilityLayer({
  json: {
    enabled: true,
    dest: './events.jsonl'
  },
  otel: {
    enabled: true,
    endpoint: 'http://localhost:4317',
    exporter: 'otlp_http',
    required: false,
    timeout_ms: 5000,
    max_queue_size: 1000,
    batch_size: 100
  }
})

await obs.shutdown()
```

### Three-Layer Emission

```typescript
obs.emit({
  cli: { level: 'info', message: 'Processing...' },
  json: {
    component: 'engine',
    event_type: 'processing_start',
    data: { total: 100 }
  },
  otel: {
    trace_id: 'abc123...',
    span_id: 'def456...',
    name: 'process_mining',
    start_time: Date.now() * 1000000,
    attributes: { /* required attrs */ }
  }
})
```

### Singleton Pattern

```typescript
import { getObservabilityLayer } from '@wasm4pm/observability'

// First call creates instance
const obs = getObservabilityLayer()

// Subsequent calls return same instance
const obs2 = getObservabilityLayer()
console.assert(obs === obs2)
```

## Non-Blocking Guarantees

All methods that might do I/O are guaranteed non-blocking:

| Method | Returns | Guarantees |
|--------|---------|-----------|
| `emit*()` | void | Returns immediately, < 1µs |
| `enable*()` | void | Non-blocking async initialization |
| `shutdown()` | Promise | Async but non-blocking, completes in reasonable time |

## Error Handling

The observability layer is designed to never break execution:

```typescript
// This never throws, even if OTEL is down
obs.emitOtel({ /* ... */ })

// JSON write failures are logged but ignored
obs.emitJson({ /* ... */ })

// Shutdown collects all errors but returns success if some succeed
const result = await obs.shutdown()
if (!result.success) {
  console.error('Some operations failed:', result.error)
}
```

## Performance

### Synchronous Operations

- `emitCli()`: ~10µs (console output)
- `emitJson()`: ~5µs (buffer append)
- `emitOtel()`: ~1µs (queue append)
- `emit()`: < 100µs (all three layers)

### Asynchronous Operations

- JSON flush: ~10ms per 100 events
- OTEL batch export: configurable timeout (default 5s)
- Full shutdown: blocking wait for all pending

### Memory

- JSON buffer: ~100KB max (100 events × ~1KB each)
- OTEL queue: ~1MB max (1000 events × ~1KB each)
- Total: ~1.1MB max with defaults

## Thread Safety

The observability layer is safe for:
- Multi-threaded Node.js environments
- Web workers
- Async/await code

It is NOT thread-safe for (due to single-threaded WASM):
- Raw WebAssembly code
- Rust code with concurrent access

## Backward Compatibility

Version 26.4.5 and beyond:
- ✅ Safe: Adding new optional configuration fields
- ✅ Safe: Adding new event types or attributes
- ⚠️ Breaking: Removing public methods
- ⚠️ Breaking: Changing type signatures

## See Also

- [README.md](./README.md) - User guide with features and examples
- [EXAMPLES.md](./EXAMPLES.md) - Complete code examples for common use cases
- [IMPLEMENTATION.md](./IMPLEMENTATION.md) - Implementation details and compliance checklist
