# @wasm4pm/service

HTTP service layer for wasm4pm process mining engine with Express server, request queuing, and WebSocket streaming support.

## Features

- **Single-run constraint**: Only one execution at a time with FIFO queue (max 10 pending)
- **Request validation**: Zod-based validation for all endpoints
- **WebSocket streaming**: Real-time progress updates via `/watch/:run_id`
- **OpenAPI documentation**: Full OpenAPI 3.0.0 spec at `/api/docs`
- **CORS support**: Cross-origin requests enabled by default
- **Graceful shutdown**: Finish current run with 30s timeout
- **JSON logging**: Structured logs for all requests
- **Production-ready**: Containerized, configurable, fully tested

## Quick Start

### npm

```bash
npm install @wasm4pm/service
```

### Run service

```bash
# Default port 3001
npm start

# Custom port
PORT=8080 npm start

# With options
npm start -- --port 3001 --host 0.0.0.0 --queue-size 20
```

### Docker

```bash
# Build
docker build -t wasm4pm-service:latest .

# Run
docker run -p 3001:3001 wasm4pm-service:latest

# With environment variables
docker run -p 3001:3001 -e PORT=8080 wasm4pm-service:latest
```

## API Endpoints

### Health & Status

#### `GET /status`
Returns server health, uptime, and execution statistics.

**Response:**
```json
{
  "server": "healthy",
  "uptime_ms": 123456,
  "current_run": {
    "run_id": "run_2026-04-04T12-34-56-789Z_abc1",
    "status": "running",
    "progress": 45,
    "elapsed_ms": 5000
  },
  "queued": 2,
  "completed": 5,
  "failed": 0,
  "timestamp": "2026-04-04T12:34:56.789Z"
}
```

### Execution

#### `POST /run`
Submit a new process mining execution.

**Request:**
```json
{
  "config": "[section]\nkey = \"value\"",
  "input_file": "/path/to/log.xes",
  "profile": "production"
}
```

**Response (202 Accepted):**
```json
{
  "run_id": "run_2026-04-04T12-34-56-789Z_abc1",
  "status": "running",
  "started_at": "2026-04-04T12:34:56.789Z"
}
```

**Errors:**
- `400 Bad Request`: Invalid config or missing required field
- `503 Service Unavailable`: Queue is full (max 10 runs)

#### `GET /run/:run_id`
Get execution status and receipt.

**Response:**
```json
{
  "run_id": "run_2026-04-04T12-34-56-789Z_abc1",
  "status": "completed",
  "progress": 100,
  "started_at": "2026-04-04T12:34:56.789Z",
  "finished_at": "2026-04-04T12:35:56.789Z",
  "duration_ms": 60000,
  "receipt": {
    "runId": "run_2026-04-04T12-34-56-789Z_abc1",
    "planId": "plan_abc123",
    "state": "ready",
    "startedAt": "2026-04-04T12:34:56.789Z",
    "finishedAt": "2026-04-04T12:35:56.789Z",
    "durationMs": 60000,
    "progress": 100,
    "errors": []
  }
}
```

**Errors:**
- `404 Not Found`: Run does not exist

#### `DELETE /run/:run_id`
Cancel a queued execution.

**Response:**
```json
{
  "run_id": "run_2026-04-04T12-34-56-789Z_abc1",
  "status": "cancelled",
  "timestamp": "2026-04-04T12:34:56.789Z"
}
```

**Errors:**
- `404 Not Found`: Run does not exist
- `409 Conflict`: Cannot cancel (already running or completed)

### Streaming

#### `GET /watch/:run_id`
Stream execution progress events as JSONL (newline-delimited JSON).

**Supports:**
- WebSocket upgrade (when `Upgrade: websocket` header present)
- HTTP streaming (application/x-ndjson)

**Event format:**
```jsonl
{"event":"start","run_id":"run_..._abc1","timestamp":"2026-04-04T12:34:56.789Z","data":{"progress":0,"message":"Starting..."}}
{"event":"progress","run_id":"run_..._abc1","timestamp":"2026-04-04T12:34:57.789Z","data":{"progress":50,"message":"Processing..."}}
{"event":"complete","run_id":"run_..._abc1","timestamp":"2026-04-04T12:35:56.789Z","data":{"progress":100,"receipt":{...}}}
```

**Errors:**
- `404 Not Found`: Run does not exist

### Analysis

#### `POST /explain`
Generate explanation of configuration without executing.

**Request:**
```json
{
  "config": "[section]\nkey = \"value\"",
  "mode": "brief"
}
```

**Response:**
```json
{
  "explanation": "Configuration analysis: ...",
  "mode": "brief",
  "config": "[section]\nkey = \"value\"",
  "timestamp": "2026-04-04T12:34:56.789Z"
}
```

**Modes:**
- `brief`: Concise explanation (default)
- `full`: Detailed analysis with all sections

**Errors:**
- `400 Bad Request`: Invalid configuration syntax

### Documentation

#### `GET /api/docs`
Returns OpenAPI 3.0.0 specification in JSON format.

**Response:** Complete OpenAPI schema including all endpoints, parameters, request/response schemas, and examples.

## Configuration

### Environment Variables

```bash
PORT=3001              # HTTP server port (default: 3001)
HOST=localhost         # HTTP server host (default: localhost)
LOG_FORMAT=json        # Log format: 'json' or 'text' (default: json)
```

### CLI Options

```bash
--port <number>        # HTTP server port
--host <address>       # HTTP server host
--queue-size <n>       # Max queued runs (default: 10)
--help                 # Show help message
--version              # Show version
```

### Programmatic Usage

```typescript
import { HttpServer, ServiceConfig } from '@wasm4pm/service';
import { Engine } from '@wasm4pm/engine';

const engine = new Engine(kernel, planner, executor);
await engine.bootstrap();

const config: ServiceConfig = {
  port: 3001,
  host: 'localhost',
  gracefulShutdownTimeoutMs: 30000,
  maxQueueSize: 10,
  enableCors: true,
  logFormat: 'json',
};

const server = new HttpServer(engine, config);
await server.start();
```

## Error Handling

All errors are returned as JSON with a standard format:

```json
{
  "error": "Human-readable error message",
  "code": "MACHINE_READABLE_CODE",
  "details": {
    "field": "Additional context if applicable"
  },
  "timestamp": "2026-04-04T12:34:56.789Z"
}
```

### Common Status Codes

- `200 OK`: Successful GET request
- `202 Accepted`: Run submitted and queued/running
- `400 Bad Request`: Invalid request or validation error
- `404 Not Found`: Resource does not exist
- `409 Conflict`: Invalid state transition (e.g., cancel running run)
- `503 Service Unavailable`: Server at capacity (queue full)
- `500 Internal Server Error`: Unexpected server error

## Execution Model

### Single-Run Constraint (v26.4.5)

Only one execution runs at a time to ensure resource stability:

1. **Submitted run**
   - If no run is executing: immediately transition to `running`
   - If run is executing: queue with status `queued` (max 10 in queue)

2. **Queued run**
   - Waits in FIFO queue
   - Can be cancelled via `DELETE /run/:run_id`
   - Will transition to `running` when current run completes

3. **Running run**
   - Cannot be cancelled (error 409)
   - Cannot be interrupted (no early termination in v26.4.5)
   - Streams progress via `/watch/:run_id`

4. **Completed run**
   - Transitions to next queued run
   - Receipt available via `GET /run/:run_id`
   - Moves to next queued run

### State Transitions

```
Queued → Running → Completed
  ↓
  Cancel → Cancelled
```

## Monitoring

### Metrics

Access `/status` endpoint for:
- Server health status
- Current execution progress and elapsed time
- Queue length
- Total completed/failed runs this session
- Server uptime

### Logging

All requests logged in JSON format:

```json
{
  "timestamp": "2026-04-04T12:34:56.789Z",
  "method": "POST",
  "path": "/run",
  "status": 202,
  "duration_ms": 45,
  "request_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

## Graceful Shutdown

The service handles graceful shutdown:

1. Stop accepting new requests
2. Allow current run to complete
3. Drain remaining queued runs (attempts within 30s timeout)
4. Close HTTP server
5. Shutdown engine and kernel

Send `SIGTERM` or `SIGINT` to trigger shutdown:

```bash
kill -TERM <pid>
# or Ctrl+C in terminal
```

## Examples

### JavaScript/Node.js

```javascript
// Submit a run
const response = await fetch('http://localhost:3001/run', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    config: '[algorithm]\ntype = "alpha"',
    input_file: '/path/to/log.xes',
  }),
});

const { run_id, status } = await response.json();
console.log(`Run ${run_id} is ${status}`);

// Poll for completion
let completed = false;
while (!completed) {
  const status = await fetch(`http://localhost:3001/run/${run_id}`);
  const { status: runStatus, receipt } = await status.json();
  
  if (runStatus === 'completed') {
    console.log('Execution complete!', receipt);
    completed = true;
  } else {
    await new Promise(r => setTimeout(r, 1000));
  }
}
```

### Streaming with EventSource

```javascript
// Watch execution progress
const eventSource = new EventSource(`http://localhost:3001/watch/${run_id}`);

eventSource.onmessage = (event) => {
  const watchEvent = JSON.parse(event.data);
  console.log(`Progress: ${watchEvent.data.progress}%`);
  
  if (watchEvent.event === 'complete') {
    eventSource.close();
    console.log('Execution complete!', watchEvent.data.receipt);
  }
};

eventSource.onerror = () => {
  eventSource.close();
};
```

### cURL

```bash
# Submit run
curl -X POST http://localhost:3001/run \
  -H "Content-Type: application/json" \
  -d '{"config":"[section]\nkey=\"value\""}' \
  | jq .

# Get status
curl http://localhost:3001/status | jq .

# Get run status
curl http://localhost:3001/run/run_2026_abc123 | jq .

# Explain config
curl -X POST http://localhost:3001/explain \
  -H "Content-Type: application/json" \
  -d '{"config":"[algorithm]\ntype=\"alpha\"","mode":"full"}' \
  | jq .

# Get API documentation
curl http://localhost:3001/api/docs | jq .
```

## Testing

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# Coverage
npm run test:coverage
```

Test coverage includes:
- Request validation and error handling
- Single-run constraint enforcement
- FIFO queue management
- Status tracking
- WebSocket streaming
- OpenAPI schema completeness
- Graceful shutdown
- Middleware (CORS, logging, request IDs)

## Development

### Build

```bash
npm run build
```

### Type checking

```bash
npm run lint
```

### Format

```bash
npm run format
```

## Architecture

### Request Flow

```
HTTP Request
    ↓
Request ID & CORS Middleware
    ↓
Validation Middleware
    ↓
Route Handler
    ↓
Engine/Executor Call
    ↓
Response Serialization
    ↓
HTTP Response
```

### Queue Management

```
New Request
    ↓
Is queue full? → YES → 503 Service Unavailable
    ↓ NO
Is a run executing? → YES → Queue (FIFO)
    ↓ NO
Start execution
```

### Execution Lifecycle

```
Running
  ↓
Progress Updates (via watchers)
  ↓
Completion/Failure
  ↓
Store Receipt
  ↓
Start Next Queued Run
```

## Performance

### Benchmarks (simulated execution)

- Status check: < 10ms
- Run submission: < 50ms
- Explain generation: < 100ms
- Queue throughput: 100+ runs/minute (with 100ms execution each)

### Resource Usage

- Memory: ~50MB base + execution overhead
- CPU: Low when idle, scales with execution complexity
- Network: ~1KB per status request, varies with progress events

## Deployment

### Docker Compose

```yaml
version: '3.8'
services:
  wasm4pm-service:
    build: .
    ports:
      - "3001:3001"
    environment:
      PORT: 3001
      HOST: 0.0.0.0
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3001/status"]
      interval: 30s
      timeout: 10s
      retries: 3
```

### Kubernetes

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: wasm4pm-service
spec:
  replicas: 1  # Single-run constraint: only 1 instance
  template:
    spec:
      containers:
      - name: service
        image: wasm4pm-service:latest
        ports:
        - containerPort: 3001
        env:
        - name: PORT
          value: "3001"
        - name: HOST
          value: "0.0.0.0"
        livenessProbe:
          httpGet:
            path: /status
            port: 3001
          initialDelaySeconds: 10
          periodSeconds: 30
```

## License

MIT OR Apache-2.0

## Contributing

See [CONTRIBUTING.md](../../CONTRIBUTING.md) in the root repository.
