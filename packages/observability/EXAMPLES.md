# Observability Examples

Complete working examples for the three-layer observability system.

## Basic Three-Layer Setup

```typescript
import { ObservabilityLayer } from '@wasm4pm/observability';

const observability = new ObservabilityLayer({
  json: {
    enabled: true,
    dest: './events.jsonl'
  },
  otel: {
    enabled: true,
    endpoint: 'http://localhost:4317',
    exporter: 'otlp_http',
    required: false // Don't fail if OTEL is unavailable
  }
});

// Use it...

// Shutdown when done
await observability.shutdown();
```

## Processing Pipeline with Observability

```typescript
import { ObservabilityLayer } from '@wasm4pm/observability';
import { v4 as uuidv4 } from 'uuid';

class ProcessMiningEngine {
  private obs: ObservabilityLayer;
  private traceId: string;

  constructor() {
    this.obs = new ObservabilityLayer({
      json: { enabled: true, dest: './execution.jsonl' },
      otel: {
        enabled: true,
        endpoint: 'http://localhost:4317',
        exporter: 'otlp_http',
        required: false
      }
    });

    this.traceId = ObservabilityLayer.generateTraceId();
  }

  async processLog(logPath: string, config: any, plan: any) {
    const runId = uuidv4();

    // CLI layer for user feedback
    this.obs.emitCli({
      level: 'info',
      message: `Starting process mining (run: ${runId})`
    });

    // JSON layer for structured logging
    this.obs.emitJson({
      timestamp: new Date().toISOString(),
      component: 'engine',
      event_type: 'execution_start',
      run_id: runId,
      data: { log_path: logPath, config_size: JSON.stringify(config).length }
    });

    // OTEL layer for distributed tracing
    const rootSpanId = this.obs.createSpan(
      this.traceId,
      'process_mining_execution',
      {
        'run.id': runId,
        'config.hash': this.hashConfig(config),
        'input.hash': this.hashLog(logPath),
        'plan.hash': this.hashPlan(plan),
        'execution.profile': 'production',
        'source.kind': 'xes',
        'sink.kind': 'petri_net'
      }
    );

    try {
      const result = await this.discover(logPath);
      
      this.obs.emit({
        cli: { level: 'info', message: 'Discovery completed' },
        json: {
          component: 'engine',
          event_type: 'discovery_complete',
          run_id: runId,
          data: { model_nodes: result.nodes, model_edges: result.edges }
        },
        otel: {
          trace_id: this.traceId,
          span_id: this.rootSpanId,
          name: 'discovery',
          start_time: Date.now() * 1000000,
          status: { code: 'OK' },
          attributes: { result_nodes: result.nodes }
        }
      });

      return result;
    } catch (error) {
      this.obs.emit({
        cli: { level: 'error', message: `Discovery failed: ${error}` },
        json: {
          component: 'engine',
          event_type: 'discovery_error',
          run_id: runId,
          data: { error: String(error), stack: (error as any).stack }
        }
      });

      throw error;
    } finally {
      await this.obs.shutdown();
    }
  }

  private async discover(logPath: string) {
    // Implementation
    return { nodes: 10, edges: 15 };
  }

  private hashConfig(config: any): string {
    // Implementation
    return 'hash-config';
  }

  private hashLog(logPath: string): string {
    // Implementation
    return 'hash-log';
  }

  private hashPlan(plan: any): string {
    // Implementation
    return 'hash-plan';
  }
}

// Usage
const engine = new ProcessMiningEngine();
await engine.processLog('input.xes', {}, {});
```

## Nested Spans with Parent-Child Relationships

```typescript
import { ObservabilityLayer } from '@wasm4pm/observability';

class DiscoveryPipeline {
  private obs: ObservabilityLayer;
  private traceId: string;

  constructor() {
    this.obs = new ObservabilityLayer({
      json: { enabled: true, dest: 'stdout' },
      otel: {
        enabled: true,
        endpoint: 'http://localhost:4317',
        exporter: 'otlp_http'
      }
    });

    this.traceId = ObservabilityLayer.generateTraceId();
  }

  async run() {
    // Root span
    const rootSpan = this.obs.createSpan(
      this.traceId,
      'discovery_pipeline',
      {
        'run.id': 'run-123',
        'config.hash': 'cfg-abc',
        'input.hash': 'inp-def',
        'plan.hash': 'pln-ghi',
        'execution.profile': 'default',
        'source.kind': 'xes',
        'sink.kind': 'petri_net'
      }
    );

    // Child span 1: Load log
    this.obs.emitOtel({
      trace_id: this.traceId,
      span_id: this.generateSpanId(),
      parent_span_id: rootSpan,
      name: 'load_event_log',
      start_time: Date.now() * 1000000,
      status: { code: 'OK' },
      attributes: { log_size: 1000, traces: 100 }
    });

    const log = await this.loadLog();

    // Child span 2: Run algorithm
    this.obs.emitOtel({
      trace_id: this.traceId,
      span_id: this.generateSpanId(),
      parent_span_id: rootSpan,
      name: 'discover_model',
      start_time: Date.now() * 1000000,
      status: { code: 'OK' },
      attributes: {
        algorithm: 'heuristics_miner',
        model_nodes: 15,
        model_edges: 20
      }
    });

    const model = await this.discoverModel(log);

    // Child span 3: Conformance check
    this.obs.emitOtel({
      trace_id: this.traceId,
      span_id: this.generateSpanId(),
      parent_span_id: rootSpan,
      name: 'conformance_check',
      start_time: Date.now() * 1000000,
      status: { code: 'OK' },
      attributes: {
        fitness: 0.95,
        precision: 0.92,
        generalization: 0.88
      }
    });

    await this.checkConformance(log, model);

    await this.obs.shutdown();
  }

  private async loadLog() { return {}; }
  private async discoverModel(log: any) { return {}; }
  private async checkConformance(log: any, model: any) {}
  private generateSpanId(): string {
    return Array.from({ length: 8 }, () =>
      Math.floor(Math.random() * 16).toString(16)
    ).join('');
  }
}

const pipeline = new DiscoveryPipeline();
await pipeline.run();
```

## Single-Layer Usage

### JSON Only (for testing/CI)

```typescript
import { ObservabilityLayer } from '@wasm4pm/observability';

const obs = new ObservabilityLayer({
  json: { enabled: true, dest: 'stdout' }
});

obs.emitJson({
  component: 'test',
  event_type: 'test_complete',
  data: { passed: 100, failed: 0 }
});

await obs.shutdown();
```

Output:
```json
{"timestamp":"2026-04-04T12:00:00.000Z","component":"test","event_type":"test_complete","data":{"passed":100,"failed":0}}
```

### OTEL Only (for production)

```typescript
import { ObservabilityLayer } from '@wasm4pm/observability';

const obs = new ObservabilityLayer({
  otel: {
    enabled: true,
    endpoint: 'http://otel-collector:4317',
    exporter: 'otlp_http',
    required: true // Fail if OTEL is unavailable
  }
});

obs.emitOtel({
  trace_id: '12345678901234567890123456789012',
  span_id: '1234567890123456',
  name: 'api_request',
  start_time: Date.now() * 1000000,
  attributes: { method: 'POST', status: 200 }
});

await obs.shutdown();
```

### CLI Only (for simple logging)

```typescript
import { ObservabilityLayer } from '@wasm4pm/observability';

const obs = new ObservabilityLayer();

obs.emitCli({
  level: 'info',
  message: 'Application started'
});

obs.emitCli({
  level: 'warn',
  message: 'Memory usage high'
});

obs.emitCli({
  level: 'error',
  message: 'Failed to connect to database'
});
```

Output:
```
[INFO ] 2026-04-04T12:00:00.000Z Application started
[WARN ] 2026-04-04T12:00:01.000Z Memory usage high
[ERROR] 2026-04-04T12:00:02.000Z Failed to connect to database
```

## Handling Secrets

```typescript
import { ObservabilityLayer } from '@wasm4pm/observability';

const obs = new ObservabilityLayer({
  json: { enabled: true, dest: './events.jsonl' }
});

// These fields are automatically redacted
obs.emitJson({
  component: 'connector',
  event_type: 'database_connect',
  data: {
    host: 'localhost',
    port: 5432,
    username: 'admin',
    password: 'super-secret-password', // Will be [REDACTED]
    api_key: 'sk-12345678', // Will be [REDACTED]
    token: 'bearer-token-xyz', // Will be [REDACTED]
    normal_field: 'public-value' // Unchanged
  }
});

await obs.shutdown();
```

Output in events.jsonl:
```json
{"timestamp":"...","component":"connector","event_type":"database_connect","data":{"host":"localhost","port":5432,"username":"admin","password":"[REDACTED]","api_key":"[REDACTED]","token":"[REDACTED]","normal_field":"public-value"}}
```

## Dynamic Configuration

```typescript
import { ObservabilityLayer } from '@wasm4pm/observability';

// Start with minimal config
const obs = new ObservabilityLayer();

// Enable JSON later (e.g., based on environment)
if (process.env.DEBUG) {
  obs.enableJson('./debug.jsonl');
}

// Enable OTEL conditionally
if (process.env.OTEL_ENDPOINT) {
  obs.enableOtel({
    endpoint: process.env.OTEL_ENDPOINT,
    exporter: 'otlp_http',
    required: process.env.OTEL_REQUIRED === 'true'
  });
}

// Use normally
obs.emitCli({ level: 'info', message: 'Ready' });

await obs.shutdown();
```

## Testing with Observability

```typescript
import { test, expect } from 'vitest';
import { ObservabilityLayer } from '@wasm4pm/observability';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

test('should log algorithm execution', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'obs-'));
  const logFile = path.join(tmpDir, 'test.jsonl');

  const obs = new ObservabilityLayer({
    json: { enabled: true, dest: logFile }
  });

  // Run algorithm
  obs.emitJson({
    component: 'test_algo',
    event_type: 'algorithm_start',
    data: { algorithm: 'dfg' }
  });

  // Simulate work
  await new Promise(resolve => setTimeout(resolve, 100));

  obs.emitJson({
    component: 'test_algo',
    event_type: 'algorithm_complete',
    data: { duration_ms: 100 }
  });

  await obs.shutdown();

  // Verify events were logged
  const content = await fs.readFile(logFile, 'utf-8');
  const lines = content.trim().split('\n');

  expect(lines.length).toBeGreaterThanOrEqual(2);

  const events = lines.map(l => JSON.parse(l));
  expect(events[0].event_type).toBe('algorithm_start');
  expect(events[1].event_type).toBe('algorithm_complete');

  // Cleanup
  await fs.rm(tmpDir, { recursive: true });
});
```

## Integration with Express

```typescript
import express from 'express';
import { ObservabilityLayer } from '@wasm4pm/observability';

const app = express();
const obs = new ObservabilityLayer({
  json: { enabled: true, dest: './api.jsonl' },
  otel: {
    enabled: true,
    endpoint: 'http://localhost:4317',
    exporter: 'otlp_http',
    required: false
  }
});

// Middleware for request logging
app.use((req, res, next) => {
  const traceId = req.get('X-Trace-ID') || ObservabilityLayer.generateTraceId();
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;

    obs.emit({
      cli: {
        level: 'info',
        message: `${req.method} ${req.path} ${res.statusCode} ${duration}ms`
      },
      json: {
        component: 'api',
        event_type: 'http_request',
        data: {
          method: req.method,
          path: req.path,
          status: res.statusCode,
          duration_ms: duration
        }
      },
      otel: {
        trace_id: traceId,
        span_id: Math.random().toString(16).substring(2),
        name: `${req.method} ${req.path}`,
        start_time: start * 1000000,
        end_time: (start + duration) * 1000000,
        attributes: {
          'http.method': req.method,
          'http.path': req.path,
          'http.status_code': res.statusCode
        }
      }
    });
  });

  next();
});

app.get('/api/discover', (req, res) => {
  obs.emitCli({ level: 'info', message: 'Processing discovery request' });
  res.json({ status: 'ok' });
});

process.on('SIGTERM', async () => {
  await obs.shutdown();
  process.exit(0);
});

app.listen(3000);
```

## Error Handling with Observability

```typescript
import { ObservabilityLayer } from '@wasm4pm/observability';

const obs = new ObservabilityLayer({
  json: { enabled: true, dest: './errors.jsonl' }
});

try {
  // ... some operation
  throw new Error('Database connection failed');
} catch (error) {
  obs.emit({
    cli: {
      level: 'error',
      message: `Error: ${error}`
    },
    json: {
      component: 'database',
      event_type: 'error',
      data: {
        error_type: (error as any).constructor.name,
        error_message: String(error),
        stack_trace: (error as any).stack
      }
    }
  });
}

await obs.shutdown();
```

These examples demonstrate the flexibility and completeness of the observability system for various use cases.
