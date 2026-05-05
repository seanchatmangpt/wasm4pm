# @wasm4pm/observability

Non-blocking three-layer observability system with optional OpenTelemetry support.

## Architecture

Implements PRD §17-18 observability requirements with three distinct layers:

### Layer 1: CLI (Human-Readable)
- Console logging via `console.info()`, `console.warn()`, `console.error()`
- Formatted with timestamp and log level
- Immediate output for user feedback

### Layer 2: JSON (Machine-Readable)
- JSONL format (one event per line)
- Structured logging for log ingestion and analysis
- File output or stdout
- Non-blocking: buffered and asynchronously flushed

### Layer 3: OTEL (Distributed Tracing)
- W3C Trace Context (32-char trace IDs, 16-char span IDs)
- Optional OpenTelemetry HTTP exporter
- Batch export with configurable timeout (default: 5s) and queue size (default: 1000)
- Non-blocking: never blocks execution even on export failures

## Features

### Non-Blocking Behavior (PRD §18.5)
All operations are non-blocking and async-safe:
- `emit()` returns immediately
- Writes happen asynchronously in background
- OTEL export failures never break execution
- Event queue drops oldest on overflow (never blocks)

### Secret Redaction
Automatically redacts sensitive fields:
- `password`, `token`, `api_key`, `secret`, `credentials`
- Recursive detection in nested objects
- Redacted value: `[REDACTED]`

### Required OTEL Attributes (PRD §18.2-3)
All OTEL spans must include:
```typescript
{
  'run.id': string;                  // UUID
  'config.hash': string;             // BLAKE3 hash
  'input.hash': string;              // BLAKE3 hash
  'plan.hash': string;               // BLAKE3 hash
  'execution.profile': string;       // e.g., "default"
  'source.kind': string;             // e.g., "xes", "csv"
  'sink.kind': string;               // e.g., "petri_net", "dfg"
}
```

## API

### ObservabilityLayer

```typescript
class ObservabilityLayer {
  // Configuration
  constructor(config?: ObservabilityConfig)
  getConfig(): ObservabilityConfig

  // Enable layers at runtime
  enableJson(dest: string): void
  enableOtel(config: { endpoint: string; ... }): void

  // Emit events
  emitCli(event: CliEvent): void
  emitJson(event: JsonEvent): void
  emitOtel(event: OtelEvent): void
  emit(event: { cli?, json?, otel? }): void

  // Helpers
  createSpan(traceId, name, requiredAttrs, customAttrs?): string
  static generateTraceId(): string

  // Lifecycle
  async shutdown(): Promise<ObservabilityResult>
}
```

### Configuration

```typescript
interface ObservabilityConfig {
  json?: {
    enabled: boolean;
    dest: string; // file path or 'stdout'
    rotation?: { max_bytes?: number; max_files?: number }
  };
  otel?: {
    enabled: boolean;
    exporter: 'otlp_http' | 'otlp_grpc';
    endpoint: string; // e.g., "http://localhost:4317"
    required: boolean; // if false, errors don't fail execution
    timeout_ms?: number; // default: 5000
    max_queue_size?: number; // default: 1000
    batch_size?: number; // default: 100
  };
}
```

## Examples

### Basic Usage

```typescript
import { ObservabilityLayer } from '@wasm4pm/observability';

const obs = new ObservabilityLayer({
  json: { enabled: true, dest: './events.jsonl' },
  otel: {
    enabled: true,
    endpoint: 'http://localhost:4317',
    exporter: 'otlp_http',
    required: false, // Don't fail if OTEL is unavailable
  }
});

// Emit to all layers
obs.emit({
  cli: { level: 'info', message: 'Starting processing...' },
  json: {
    component: 'engine',
    event_type: 'execution_start',
    run_id: 'run-123',
    data: { total_traces: 1000 }
  },
  otel: {
    trace_id: '12345678901234567890123456789012',
    span_id: '1234567890123456',
    name: 'execute_process_mining',
    start_time: Date.now() * 1000000,
    attributes: {
      'run.id': 'run-123',
      'config.hash': 'abc123...',
      'input.hash': 'def456...',
      'plan.hash': 'ghi789...',
      'execution.profile': 'default',
      'source.kind': 'xes',
      'sink.kind': 'petri_net',
    }
  }
});

// Shutdown gracefully
await obs.shutdown();
```

### Single-Layer Usage

```typescript
// JSON only
const json = new ObservabilityLayer({
  json: { enabled: true, dest: 'stdout' }
});

json.emitJson({
  component: 'planner',
  event_type: 'plan_generated',
  data: { plan_size: 512 }
});
```

### Creating Spans

```typescript
const traceId = ObservabilityLayer.generateTraceId();

const spanId = obs.createSpan(
  traceId,
  'discover_model',
  {
    'run.id': 'run-123',
    'config.hash': 'abc123...',
    'input.hash': 'def456...',
    'plan.hash': 'ghi789...',
    'execution.profile': 'default',
    'source.kind': 'xes',
    'sink.kind': 'petri_net',
  },
  { custom_field: 'custom_value' }
);

// Return span ID for parent-child relationships
```

## Testing

Run tests with vitest:

```bash
npm test                # Run all tests
npm run test:ui         # Run with UI
npm run type-check      # Type check only
```

Tests cover:
- JSON event writing to file and stdout
- JSONL format validation
- Secret redaction (including nested objects)
- OTEL queue management and batch export
- Non-blocking behavior (emit returns immediately)
- OTEL failure handling (doesn't break execution)
- Timeout handling
- Queue overflow handling
- Multi-layer emission
- Graceful shutdown
- Required OTEL attributes

## Performance

### Benchmarks
- **emit()**: < 1µs (synchronous buffering)
- **JSON flush**: < 10ms for 100 events
- **OTEL batch export**: configurable timeout (default 5s)
- **Memory**: O(n) queue size, configurable max (default 1000 events)

### Configuration for High Throughput
```typescript
{
  json: { enabled: true, dest: '/dev/null' }, // Optimize away file I/O
  otel: {
    enabled: true,
    endpoint: 'http://localhost:4317',
    batch_size: 500, // Larger batches
    timeout_ms: 10000, // Longer timeouts
    max_queue_size: 5000 // Larger queue
  }
}
```

## Failure Modes

### JSON Writer
- File write failure → logs error, continues processing
- File not found → logs error, continues processing
- No layers enabled → emit becomes no-op

### OTEL Exporter
- Network error → logs error, never throws (unless required=true)
- Timeout → logs error, continues queuing
- Queue full → drops oldest event, warns to console
- Export failure → queues event for retry

### Combined
- All failures are logged to console
- Execution never stops unless explicitly required
- Shutdown waits for all pending events

## Integration with CI/CD

### Local Development
```bash
# Log to stdout for testing
export OBSERVABILITY_JSON_DEST=stdout
export OBSERVABILITY_OTEL_ENABLED=false
```

### Staging/Production
```bash
# Log to file for archival
export OBSERVABILITY_JSON_DEST=/var/log/wasm4pm/events.jsonl

# Send to OTEL collector
export OBSERVABILITY_OTEL_ENDPOINT=http://otel-collector:4317
export OBSERVABILITY_OTEL_REQUIRED=false
```

## Specification Compliance

- **PRD §17**: Three-layer observability ✅
- **PRD §18.1**: CLI + JSON + OTEL ✅
- **PRD §18.2-3**: Required OTEL attributes ✅
- **PRD §18.4**: JSONL format with redaction ✅
- **PRD §18.5**: Non-blocking, never breaks execution ✅
- **W3C Trace Context**: 32-char trace IDs, 16-char span IDs ✅

## License

MIT
