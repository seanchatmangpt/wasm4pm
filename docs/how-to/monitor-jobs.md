# How-To: Monitor Long-Running Jobs

**Time required**: 10 minutes  
**Difficulty**: Intermediate  

## Check Status

Poll for progress:

```bash
curl http://localhost:3001/status/run-abc123
```

Response:

```json
{
  "run_id": "run-abc123",
  "status": "running",
  "progress_percent": 45,
  "elapsed_ms": 2340,
  "estimated_remaining_ms": 2800,
  "stage": "algorithm_execution"
}
```

## Watch Mode

Real-time updates via watch command:

```bash
pmctl watch --config config.toml --verbose
```

Shows live progress and checkpoints.

## WebSocket Streaming

Connect to live stream:

```bash
curl ws://localhost:3001/watch/run-abc123
```

Events:

```
{"type":"heartbeat","timestamp":"..."}
{"type":"progress","percent":50,"elapsed_ms":2340}
{"type":"checkpoint","id":"ckpt-001"}
{"type":"complete","receipt":{...}}
```

## Polling Loop

```bash
#!/bin/bash

run_id=$1
max_wait=300  # 5 minutes

elapsed=0
while [ $elapsed -lt $max_wait ]; do
  status=$(curl -s http://localhost:3001/status/$run_id)
  state=$(echo $status | jq -r '.status')
  progress=$(echo $status | jq -r '.progress_percent // 0')
  
  echo "[$progress%] $state"
  
  if [ "$state" = "completed" ]; then
    echo "Job complete!"
    break
  fi
  
  sleep 5
  elapsed=$((elapsed + 5))
done
```

## Set Timeout

Long-running jobs need timeout:

```toml
[discovery]
timeout_ms = 600000  # 10 minutes
```

Or via CLI:

```bash
pmctl run --config config.toml --timeout 600000
```

## Interrupt Job

Stop running job:

```bash
# Via HTTP
curl -X POST http://localhost:3001/stop/run-abc123

# Via CLI
pkill -f "pmctl run"
```

## Monitor Memory

Watch WASM memory usage:

```bash
watch -n 1 'curl -s http://localhost:3001/metrics | grep wasm_memory'
```

Output:

```
wasm4pm_memory_bytes 45678900
```

## Batch Processing

Monitor multiple jobs:

```bash
#!/bin/bash

# Submit jobs
for file in *.xes; do
  run_id=$(curl -s -X POST http://localhost:3001/run \
    -d "{\"source\": {\"path\": \"$file\"}}" | jq -r '.run_id')
  echo $run_id >> run_ids.txt
done

# Wait for all
while IFS= read -r run_id; do
  while true; do
    status=$(curl -s http://localhost:3001/status/$run_id | jq -r '.status')
    [ "$status" = "completed" ] && break
    sleep 1
  done
  echo "$run_id completed"
done < run_ids.txt
```

## See Also

- [Reference: HTTP API](../reference/http-api.md)
- [Tutorial: Service Mode](../tutorials/service-mode.md)
