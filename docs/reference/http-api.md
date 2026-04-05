# Reference: HTTP API Endpoints

**Service**: wasm4pm-service  
**Base URL**: http://localhost:3001  
**Default Port**: 3001  

## Health Check

```
GET /health
```

Response:

```json
{
  "status": "healthy",
  "version": "26.4.5",
  "uptime_ms": 1234,
  "memory_mb": 128.4
}
```

## Submit Job

```
POST /run
Content-Type: application/json
```

Request:

```json
{
  "config": {
    "discovery": {"algorithm": "dfg"},
    "source": {"type": "file", "path": "data.xes"}
  }
}
```

Response:

```json
{
  "run_id": "run-abc123",
  "status": "queued"
}
```

## Check Status

```
GET /status/:run_id
```

Response:

```json
{
  "run_id": "run-abc123",
  "status": "running",
  "progress_percent": 45,
  "elapsed_ms": 2340
}
```

## Get Results

```
GET /result/:run_id
```

Response:

```json
{
  "run_id": "run-abc123",
  "receipt": {...},
  "model": {...},
  "artifacts": {...}
}
```

## Stream Results (WebSocket)

```
GET /watch/:run_id
Protocol: WebSocket
```

Events:

```json
{"type":"heartbeat","timestamp":"..."}
{"type":"progress","percent":50}
{"type":"complete","receipt":{...}}
```

## Metrics

```
GET /metrics
```

Prometheus format:

```
wasm4pm_model_nodes 23
wasm4pm_execution_time_ms 234
```

## List Runs

```
GET /runs
```

Query parameters:
- `status` - Filter by status
- `limit` - Result limit
- `offset` - Result offset

## Stop Job

```
POST /stop/:run_id
```

Response:

```json
{
  "run_id": "run-abc123",
  "status": "stopped"
}
```

## HTTP Status Codes

| Code | Meaning |
|------|---------|
| 200 | OK |
| 400 | Bad request |
| 404 | Not found |
| 503 | Service unavailable |
| 500 | Server error |

## See Also

- [Tutorial: Service Mode](../tutorials/service-mode.md)
- [How-To: Node.js Integration](../how-to/nodejs-integration.md)
