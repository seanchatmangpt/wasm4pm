# OTEL Observability Integration - Phase 2

**Status:** ✅ Complete - Phase 2 Integration: OTEL observability wiring

## Overview

This document describes the Phase 2 observability integration for wasm4pm, providing comprehensive OTEL tracing, JSON logging, and secret redaction across the engine lifecycle.

## Architecture

### Three-Layer Observability Stack

1. **CLI Layer** - Human-readable console output
2. **JSON Layer** - Machine-readable JSONL for ingestion
3. **OTEL Layer** - Distributed tracing with W3C Trace Context

### Non-Blocking Design

All observability operations are non-blocking per PRD §18.5:
- Events queue asynchronously
- OTEL export happens in background
- JSON writes are buffered
- Observability failures never break execution

## Key Modules

### Instrumentation (`instrumentation.ts`)

Helper functions for creating OTEL spans and events:

```typescript
// Create state change event
const { event, otelEvent } = Instrumentation.createStateChangeEvent(
  traceId,
  'ready',
  'planning',
  requiredAttrs
);

// Create algorithm event
const { event, otelEvent } = Instrumentation.createAlgorithmStartedEvent(
  traceId,
  'dijkstra',
  requiredAttrs
);

// Create source/sink events
const { event, otelEvent } = Instrumentation.createSourceStartedEvent(
  traceId,
  'xes',
  requiredAttrs
);

// Generate trace IDs and span IDs
const traceId = Instrumentation.generateTraceId();
const spanId = Instrumentation.generateSpanId();

// W3C Trace Context
const header = Instrumentation.createTraceContextHeader(traceId, spanId, true);
```

### Secret Redaction (`secret-redaction.ts`)

Removes sensitive data before observability emission:

```typescript
// Redact object
const redacted = SecretRedaction.redactObject({
  password: 'secret',
  username: 'alice',
  api_key: 'key-123'
});
// Result: { password: '[REDACTED]', username: 'alice', api_key: '[REDACTED]' }

// Redact config
const redactedConfig = SecretRedaction.redactConfig(config);

// Redact environment variables
const redactedEnv = SecretRedaction.redactEnvironment(process.env);

// Detect sensitive fields
if (SecretRedaction.isSensitiveField('password')) {
  // Handle sensitive field
}

// Generate redaction report
const report = SecretRedaction.createRedactionReport(original, redacted);
console.log(report); // Shows what was redacted and why
```

### Observability Wrapper (`observability-wrapper.ts`)

Safe event emission with error handling:

```typescript
const wrapper = new ObservabilityWrapper(config);

// Safe emit operations (never throw)
const result = wrapper.emitCliSafe({ level: 'info', message: 'Test' });
const result = wrapper.emitJsonSafe({ ... });
const result = wrapper.emitOtelSafe({ ... });

// Multi-layer emit
const results = wrapper.emitSafe({
  cli: { level: 'info', message: 'Test' },
  json: { ... },
  otel: { ... }
});

// Safe execution wrapper
const { result, observabilityError } = await wrapper.executeWithObservability(
  async () => {
    // Your operation
    return 'success';
  },
  { operationName: 'my_operation' }
);

// Error tracking
const errors = wrapper.getErrors();
const stats = wrapper.getStats(); // { emitCount, errorCount, errorRate }

// Graceful shutdown
const result = await wrapper.shutdown();
```

## Engine Integration

### State Transition Events

Engine emits events on each state transition:

```
uninitialized → bootstrapping → ready → planning → ready → running → ready
                                                ↓
                                            watching
                                                ↓
                                            ready/degraded
```

Each transition emits:
- **StateChangeEvent** with duration, reason, source/target states
- **JSON event** with transition metadata
- **OTEL span** with W3C trace context

### Required OTEL Attributes

Per PRD §18.2-3, all OTEL events include:

```typescript
interface RequiredOtelAttributes {
  'run.id': string;        // Execution run ID
  'config.hash': string;   // Configuration hash
  'input.hash': string;    // Input data hash
  'plan.hash': string;     // Execution plan hash
  'execution.profile': string; // fast|balanced|quality|stream
  'source.kind': string;   // xes|csv|parquet|...
  'sink.kind': string;     // petri_net|dfg|json|...
}
```

### Event Types

#### State Change
Emitted on each state transition:
```typescript
{
  type: 'StateChange',
  traceId: string,
  spanId: string,
  fromState: string,
  toState: string,
  durationMs: number,
  reason?: string
}
```

#### Plan Generated
Emitted after plan generation:
```typescript
{
  type: 'PlanGenerated',
  planId: string,
  planHash: string,
  steps: number,
  estimatedDurationMs?: number,
  durationMs: number
}
```

#### Algorithm Events
Emitted around algorithm execution:
```typescript
{
  type: 'AlgorithmStarted',
  algorithmName: string,
  stepId?: string
}

{
  type: 'AlgorithmCompleted',
  algorithmName: string,
  durationMs: number,
  status: 'OK' | 'ERROR',
  errorCode?: string
}
```

#### Source/Sink Events
Emitted around I/O operations:
```typescript
{
  type: 'SourceStarted',
  kind: string // xes, csv, etc
}

{
  type: 'SourceCompleted',
  kind: string,
  recordCount: number,
  durationMs: number,
  status: 'OK' | 'ERROR'
}
```

#### Progress Events
Emitted at 10% intervals or every 5 seconds:
```typescript
{
  type: 'Progress',
  progress: number, // 0-100
  message?: string
}
```

#### Error Events
Emitted on errors:
```typescript
{
  type: 'Error',
  errorCode: string,
  errorMessage: string,
  severity: 'info' | 'warning' | 'error' | 'fatal',
  context?: Record<string, any>
}
```

## Configuration

### Enable OTEL Export

```typescript
const engine = new Engine(kernel, planner, executor, wasmConfig, {
  otel: {
    enabled: true,
    exporter: 'otlp_http',
    endpoint: 'http://localhost:4317',
    required: false,
    timeout_ms: 5000,
    batch_size: 100
  },
  json: {
    enabled: true,
    dest: 'stdout' // or '/path/to/file'
  }
});
```

### OTEL Export Endpoint

Uses standard OTLP protocol:
- **HTTP**: `POST /v1/traces`
- **gRPC**: `:4317` (uses HTTP endpoint as fallback)

### Trace Context Propagation

W3C Trace Context header format:
```
traceparent: 00-{trace-id}-{span-id}-{trace-flags}
```

## Usage Examples

### Basic Integration

```typescript
import { Engine } from '@wasm4pm/engine';
import { Instrumentation } from '@wasm4pm/observability';

// Create engine with observability enabled
const engine = new Engine(kernel, planner, executor, wasmConfig, {
  otel: { enabled: true, endpoint: 'http://localhost:4317' },
  json: { enabled: true, dest: 'stdout' }
});

// Bootstrap (emits state change events)
await engine.bootstrap();

// Plan (emits plan generated event)
const plan = await engine.plan(config);

// Run (emits execution events)
const receipt = await engine.run(plan);

// Check observability stats
console.log(engine.getObservabilityStats());
// { emitCount: 25, errorCount: 0, errorRate: 0 }

// Check errors
const errors = engine.getObservabilityErrors();

// Shutdown
await engine.shutdownObservability();
```

### Custom Event Emission

```typescript
import { ObservabilityWrapper, Instrumentation } from '@wasm4pm/observability';

const observability = new ObservabilityWrapper(config);

// Create custom algorithm event
const { event, otelEvent } = Instrumentation.createAlgorithmStartedEvent(
  traceId,
  'custom_algorithm',
  requiredAttrs
);

// Emit safely
const result = observability.emitOtelSafe(otelEvent);

if (!result.success) {
  console.warn('OTEL emit failed:', result.error);
}
```

### Secret Redaction

```typescript
import { SecretRedaction } from '@wasm4pm/observability';

const config = {
  database: {
    host: 'localhost',
    password: 'secret-db-pass',
    api_key: 'key-123'
  }
};

// Redact before logging
const redacted = SecretRedaction.redactConfig(config);
console.log(JSON.stringify(redacted));
// { database: { host: 'localhost', password: '[REDACTED]', api_key: '[REDACTED]' } }

// Get redaction report
const report = SecretRedaction.createRedactionReport(config, redacted);
console.log(report);
// [
//   { path: 'database.password', reason: 'Sensitive field name' },
//   { path: 'database.api_key', reason: 'Sensitive field name' }
// ]
```

## Performance Characteristics

### Overhead

- **Typical emit overhead**: < 1ms per event
- **OTEL batch export**: Non-blocking, async
- **JSON buffering**: Batched writes, configurable size
- **Secret redaction**: Recursive, capped at depth 10

### Memory

- **Event queue**: Max 1000 events (configurable)
- **Error history**: Max 100 errors
- **Trace context**: Minimal (two IDs + metadata)

### Scalability

- Handles 1000+ events/second
- OTEL batch export every 5 seconds (configurable)
- JSON writes every 1 second (configurable)
- Non-blocking, won't stall execution

## Error Handling

### Design Principles

1. **Never break execution** - Observability errors are logged but don't break execution
2. **Fire and forget** - Events queue asynchronously
3. **Graceful degradation** - If JSON fails, OTEL continues; if OTEL fails, execution continues
4. **Error tracking** - Observability errors are recorded for debugging

### Error Scenarios

```typescript
// OTEL export fails → logged but execution continues
// JSON write fails → logged but execution continues
// Both fail → execution succeeds, errors recorded

const errors = engine.getObservabilityErrors();
errors.forEach(err => {
  console.log(`${err.layer} error at ${err.timestamp}: ${err.message}`);
});
```

## Testing

### Unit Tests

- `instrumentation.test.ts` - Span creation, event generation, trace context
- `secret-redaction.test.ts` - Field detection, path detection, content patterns
- `observability-wrapper.test.ts` - Safe emit, error handling, statistics

### Integration Tests

- `engine-observability.test.ts` - Full engine lifecycle with observability
  - Bootstrap events
  - Plan generation events
  - Execution events
  - Error events
  - Watch mode progress events

### Coverage

- All required OTEL attributes
- State transition tracking
- Error emission
- Progress tracking
- Secret redaction
- Non-blocking behavior
- Performance < 5ms overhead

## Troubleshooting

### Events not appearing in OTEL backend

1. Check endpoint configuration: `http://localhost:4317`
2. Verify OTEL collector is running
3. Check network connectivity
4. Enable JSON logging to verify events are being generated
5. Review engine observability stats: `engine.getObservabilityStats()`

### High memory usage

1. Check error history: `engine.getObservabilityErrors()`
2. Monitor event queue size
3. Reduce batch size if needed
4. Check for circular references in data

### Secret redaction not working

1. Check field naming - uses case-insensitive patterns
2. Review redaction report: `SecretRedaction.createRedactionReport()`
3. Add custom patterns if needed
4. Test with `SecretRedaction.isSensitiveField()`

## Future Enhancements

1. **Sampling** - Only emit N% of events to reduce overhead
2. **Metrics** - Duration histograms, error rates per operation
3. **Baggage** - Propagate request metadata across spans
4. **Custom exporters** - Support for Jaeger, Datadog, etc.
5. **Span links** - Correlation across distributed traces

## References

- [OpenTelemetry Specification](https://opentelemetry.io/docs/)
- [W3C Trace Context](https://w3c.github.io/trace-context/)
- [OTLP Protocol](https://github.com/open-telemetry/opentelemetry-proto)
- PRD §18 - Observability Requirements
