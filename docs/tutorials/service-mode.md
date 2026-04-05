# Tutorial: Running wasm4pm as a Service

**Time to complete**: 15 minutes  
**Level**: Intermediate  
**Audience**: Developers integrating into applications  

## What You'll Learn

- Start the HTTP service (`wasm4pm-service`)
- Make API calls to execute discovery
- Monitor execution with status polling
- Stream results via WebSocket
- Integrate into your application

## Prerequisites

- wasm4pm installed (v26.4.5+)
- cURL or Postman for testing
- Understanding of HTTP/JSON
- Node.js or Python environment

## Step 1: Start the Service

```bash
wasm4pm-service --port 3001 --verbose
```

Output:

```
[INFO] Starting wasm4pm HTTP service
[INFO] Version: 26.4.5
[INFO] Listening on http://localhost:3001
[INFO] CORS enabled for: http://localhost:*
[INFO] Max concurrent runs: 10
[INFO] Memory limit: 2GB
[INFO] ✓ Service ready
```

The service is now ready to accept requests.

## Step 2: Health Check

In another terminal, verify the service:

```bash
curl http://localhost:3001/health
```

Response:

```json
{
  "status": "healthy",
  "version": "26.4.5",
  "uptime_ms": 2314,
  "memory_mb": 128.4,
  "concurrent_runs": 0,
  "max_concurrent": 10
}
```

## Step 3: Submit a Discovery Job

Create a configuration inline:

```bash
curl -X POST http://localhost:3001/run \
  -H "Content-Type: application/json" \
  -d '{
    "config": {
      "discovery": {
        "algorithm": "dfg",
        "profile": "fast"
      },
      "source": {
        "type": "inline",
        "data": "<?xml version=\"1.0\"?><log><trace><event><string key=\"concept:name\" value=\"Start\"/><date key=\"time:timestamp\" value=\"2026-01-01T08:00:00Z\"/></event><event><string key=\"concept:name\" value=\"End\"/><date key=\"time:timestamp\" value=\"2026-01-01T08:05:00Z\"/></event></trace></log>"
      }
    }
  }'
```

Response:

```json
{
  "run_id": "run-26c8f1a2-3d4a",
  "status": "queued",
  "submitted_at": "2026-04-05T12:30:00Z",
  "estimated_wait_ms": 100
}
```

Save the `run_id` for the next step.

## Step 4: Poll for Status

Check progress of your job:

```bash
curl http://localhost:3001/status/run-26c8f1a2-3d4a
```

Response while running:

```json
{
  "run_id": "run-26c8f1a2-3d4a",
  "status": "running",
  "progress_percent": 45,
  "elapsed_ms": 234,
  "estimated_remaining_ms": 200,
  "stage": "algorithm_execution"
}
```

Response after completion:

```json
{
  "run_id": "run-26c8f1a2-3d4a",
  "status": "completed",
  "progress_percent": 100,
  "elapsed_ms": 432,
  "completed_at": "2026-04-05T12:30:00Z",
  "receipt": {
    "run_id": "run-26c8f1a2-3d4a",
    "status": "success",
    "algorithm": "dfg",
    "execution_time_ms": 432,
    "model": {
      "nodes": 2,
      "edges": 1,
      "type": "dfg"
    }
  }
}
```

## Step 5: Get Full Results

Retrieve the complete discovery output:

```bash
curl http://localhost:3001/result/run-26c8f1a2-3d4a
```

Response:

```json
{
  "run_id": "run-26c8f1a2-3d4a",
  "receipt": { /* receipt object */ },
  "model": {
    "nodes": [
      { "id": "Start", "label": "Start", "frequency": 1 },
      { "id": "End", "label": "End", "frequency": 1 }
    ],
    "edges": [
      { "source": "Start", "target": "End", "frequency": 1 }
    ]
  },
  "artifacts": {
    "dfg_json": "{ /* model */ }",
    "report_html": "<!-- HTML report -->"
  }
}
```

## Step 6: Stream Results with WebSocket

Connect via WebSocket to stream updates:

```bash
wscat -c ws://localhost:3001/watch/run-26c8f1a2-3d4a
```

Or with Python:

```python
import websocket
import json

def on_message(ws, message):
    event = json.loads(message)
    print(f"Event: {event['type']}")
    print(f"Data: {event.get('data', {})}")

ws = websocket.WebSocketApp(
    "ws://localhost:3001/watch/run-26c8f1a2-3d4a",
    on_message=on_message
)
ws.run_forever()
```

Events you'll receive:

```json
{"type":"heartbeat","timestamp":"2026-04-05T12:30:00Z"}
{"type":"progress","percent":25,"elapsed_ms":100}
{"type":"progress","percent":50,"elapsed_ms":200}
{"type":"progress","percent":100,"elapsed_ms":430}
{"type":"checkpoint","id":"ckpt-001","offset":850}
{"type":"complete","receipt":{/* ... */}}
```

## Step 7: Upload File-Based Events

For larger inputs, upload the file:

```bash
# Create a sample XES file
cat > sample.xes << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<log xes.version="1.0">
  <trace>
    <string key="concept:name" value="case-1"/>
    <event>
      <string key="concept:name" value="A"/>
      <date key="time:timestamp" value="2026-01-01T08:00:00Z"/>
    </event>
    <event>
      <string key="concept:name" value="B"/>
      <date key="time:timestamp" value="2026-01-01T09:00:00Z"/>
    </event>
  </trace>
</log>
EOF

# Upload and run
curl -X POST http://localhost:3001/run \
  -F "file=@sample.xes" \
  -F "config={
    \"discovery\": {
      \"algorithm\": \"heuristic\",
      \"profile\": \"balanced\"
    }
  }"
```

## Step 8: Integrate into Node.js

Create a client wrapper (`pm-client.js`):

```javascript
const http = require('http');

class ProcessMinerClient {
  constructor(baseUrl = 'http://localhost:3001') {
    this.baseUrl = baseUrl;
  }

  async run(config) {
    const response = await this.post('/run', { config });
    return response.run_id;
  }

  async status(runId) {
    return this.get(`/status/${runId}`);
  }

  async result(runId) {
    return this.get(`/result/${runId}`);
  }

  async waitForCompletion(runId, maxWaitMs = 60000) {
    const startTime = Date.now();
    while (Date.now() - startTime < maxWaitMs) {
      const status = await this.status(runId);
      if (status.status === 'completed') {
        return await this.result(runId);
      }
      await new Promise(r => setTimeout(r, 500));
    }
    throw new Error(`Timeout waiting for run ${runId}`);
  }

  async post(path, body) {
    return this.request('POST', path, body);
  }

  async get(path) {
    return this.request('GET', path);
  }

  request(method, path, body) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'localhost',
        port: 3001,
        path,
        method,
        headers: { 'Content-Type': 'application/json' }
      };

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      });

      req.on('error', reject);
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  }
}

module.exports = ProcessMinerClient;
```

Usage:

```javascript
const PM = require('./pm-client');
const pm = new PM('http://localhost:3001');

(async () => {
  // Run discovery
  const runId = await pm.run({
    discovery: { algorithm: 'dfg', profile: 'fast' },
    source: { type: 'file', path: 'sample.xes' }
  });

  console.log(`Job submitted: ${runId}`);

  // Wait for completion
  const result = await pm.waitForCompletion(runId);

  console.log(`Model has ${result.model.nodes.length} nodes`);
  console.log(`Model has ${result.model.edges.length} edges`);
})();
```

## Step 9: Advanced: Batch Processing

Submit multiple jobs and collect results:

```bash
for trace_id in {1..5}; do
  curl -X POST http://localhost:3001/run \
    -H "Content-Type: application/json" \
    -d "{
      \"config\": {
        \"discovery\": { \"algorithm\": \"dfg\" },
        \"source\": { \"type\": \"file\", \"path\": \"trace-$trace_id.xes\" }
      }
    }" | jq -r '.run_id'
done > run_ids.txt

# Later, collect results
while read run_id; do
  curl http://localhost:3001/result/$run_id | jq '.model' > "result-$run_id.json"
done < run_ids.txt
```

## Service Configuration

Create `service-config.toml`:

```toml
[service]
port = 3001
bind_address = "127.0.0.1"
cors_origin = "*"
max_concurrent_runs = 10
request_timeout_ms = 300000
memory_limit_mb = 2048

[logging]
level = "info"
format = "json"

[observability]
otel_enabled = true
otel_endpoint = "http://localhost:4318"

[rate_limiting]
enabled = true
requests_per_minute = 100
burst_size = 10
```

Start with config:

```bash
wasm4pm-service --config service-config.toml
```

## API Reference Summary

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health` | GET | Service health check |
| `/run` | POST | Submit discovery job |
| `/status/:run_id` | GET | Check job progress |
| `/result/:run_id` | GET | Retrieve completed results |
| `/watch/:run_id` | WS | Stream live updates |
| `/metrics` | GET | Prometheus metrics |
| `/explain` | POST | Get execution plan |

## Next Steps

1. **Observability**: [Tutorial: Setting Up Observability](./observability-setup.md)
2. **Real-time**: [Tutorial: Real-Time Monitoring](./realtime-monitoring.md)
3. **Reference**: [HTTP API](../reference/http-api.md)
4. **Docker**: [How-To: Docker Deployment](../how-to/docker-deploy.md)

## Troubleshooting

### Port Already in Use

```bash
# Find and kill existing process
lsof -i :3001 | grep -v COMMAND | awk '{print $2}' | xargs kill -9

# Or use different port
wasm4pm-service --port 3002
```

### CORS Errors

```bash
# Modify CORS settings
wasm4pm-service --cors-origin "http://myapp.local"
```

### Memory Issues

```bash
# Increase memory limit
wasm4pm-service --memory-limit 4096
```

## Summary

You've learned:
- ✅ Started the HTTP service
- ✅ Submitted discovery jobs via REST
- ✅ Polled for progress
- ✅ Streamed results via WebSocket
- ✅ Integrated into Node.js
- ✅ Processed batches

**Service ready for production**

---

## Related Documentation

- **[How-To: Docker Deployment](../how-to/docker-deploy.md)** — Deploy service in containers
- **[Reference: HTTP API](../reference/http-api.md)** — Complete API reference
- **[Explanation: Execution Substrate](../explanation/execution-substrate.md)** — Architecture details
