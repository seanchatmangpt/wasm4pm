# Tutorial: Stream Processing with Watch Mode

**Time to complete**: 10 minutes  
**Level**: Beginner  
**Audience**: Users wanting real-time monitoring  

## What You'll Learn

- Start pmctl in watch mode for file monitoring
- Observe incremental processing as data arrives
- Understand checkpoint creation and recovery
- Monitor progress in real-time
- Resume processing after disconnection

## Prerequisites

- wasm4pm installed (see [Tutorial: Your First Process Model](./first-model.md))
- A sample configuration file
- Understanding of basic event logs

## Step 1: Create a Watch Configuration

Create `watch-config.toml`:

```toml
[discovery]
algorithm = "dfg"
profile = "fast"
timeout_ms = 300000        # 5 minutes for streaming

[source]
type = "stream"            # Live file monitoring
path = "events.log"
format = "jsonl"           # JSON Lines: one event per line
watch = true               # Enable file watching
checkpoint_dir = ".checkpoints"

[sink]
type = "file"
directory = "output"
format = "json"
overwrite = "overwrite"    # Refresh as new data arrives

[observability]
level = "info"
```

## Step 2: Create a Sample Event Stream

Create `events.log` with initial events:

```json
{"trace_id":"order-1","event":"submit","timestamp":"2026-04-05T08:00:00Z","activity":"Submit Order"}
{"trace_id":"order-1","event":"validate","timestamp":"2026-04-05T08:05:00Z","activity":"Validate"}
{"trace_id":"order-2","event":"submit","timestamp":"2026-04-05T08:10:00Z","activity":"Submit Order"}
```

## Step 3: Start Watch Mode

```bash
pmctl watch --config watch-config.toml --verbose
```

Output:

```
[INFO] Initializing WASM engine...
[INFO] Starting watch mode on events.log
[INFO] Checkpoint directory: .checkpoints/
[WATCH] Monitoring for changes to events.log
[INFO] Initial load: 3 events
[PROGRESS] 0%
[PROGRESS] 100%
[SUCCESS] Discovery completed in 12ms
[INFO] Checkpoint saved: .checkpoints/checkpoint-001.json
[WATCH] ▶ Waiting for file changes... (Press Ctrl+C to stop)
```

The process is now **watching** for changes. Leave this running.

## Step 4: Add Events in Real-Time

In another terminal, append more events:

```bash
# Add events to the stream
cat >> events.log << 'EOF'
{"trace_id":"order-1","event":"payment","timestamp":"2026-04-05T08:15:00Z","activity":"Process Payment"}
{"trace_id":"order-2","event":"validate","timestamp":"2026-04-05T08:20:00Z","activity":"Validate"}
EOF
```

In the watch terminal, you should see:

```
[WATCH] ✓ File change detected (4 new events)
[INFO] Processing incremental batch...
[PROGRESS] 0%
[PROGRESS] 100%
[SUCCESS] Incremental discovery in 8ms
[INFO] Checkpoint saved: .checkpoints/checkpoint-002.json
[WATCH] ▶ Waiting for file changes...
```

## Step 5: Monitor Progress Over Time

Add events in batches while watching:

```bash
# Terminal 2: Keep adding events
for i in {1..10}; do
  cat >> events.log << EOF
{"trace_id":"order-$((i+2))","event":"submit","timestamp":"2026-04-05T$(printf %02d $((8+i))):00:00Z","activity":"Submit Order"}
EOF
  sleep 2
done
```

Watch terminal shows continuous progress:

```
[WATCH] ✓ File change detected (1 new event)
[INFO] Processing incremental batch...
[PROGRESS] 0%
[PROGRESS] 100%
[SUCCESS] Incremental discovery in 6ms
[WATCH] ▶ Waiting for file changes...
[WATCH] ✓ File change detected (1 new event)
[INFO] Processing incremental batch...
[PROGRESS] 0%
[PROGRESS] 100%
[SUCCESS] Incremental discovery in 5ms
```

## Step 6: Understand Checkpoints

View saved checkpoints:

```bash
ls -la .checkpoints/
```

Output:

```
checkpoint-001.json
checkpoint-002.json
checkpoint-003.json
...
```

Examine a checkpoint:

```bash
cat .checkpoints/checkpoint-002.json
```

Structure:

```json
{
  "checkpoint_id": "ckpt-002",
  "timestamp": "2026-04-05T08:20:15Z",
  "events_processed": 5,
  "traces_processed": 2,
  "offset": 185,
  "model": {
    "nodes": ["Submit Order", "Validate", "Process Payment"],
    "edges": [...],
    "hash": "blake3:7c9f1a..."
  },
  "status": "success"
}
```

## Step 7: Test Reconnection

Stop watch mode:

```bash
# Press Ctrl+C in the watch terminal
# Output: [INFO] Watch mode stopped. 12 checkpoints saved.
```

Add more events to the file:

```bash
cat >> events.log << 'EOF'
{"trace_id":"order-15","event":"submit","timestamp":"2026-04-05T09:00:00Z","activity":"Submit Order"}
{"trace_id":"order-16","event":"submit","timestamp":"2026-04-05T09:05:00Z","activity":"Submit Order"}
EOF
```

Restart watch mode:

```bash
pmctl watch --config watch-config.toml --verbose
```

Output:

```
[INFO] Initializing WASM engine...
[INFO] Resuming from checkpoint: checkpoint-012.json
[INFO] Last processed offset: 2847
[INFO] New events since checkpoint: 2
[PROGRESS] 0%
[PROGRESS] 100%
[SUCCESS] Incremental discovery in 7ms
[INFO] Checkpoint saved: .checkpoints/checkpoint-013.json
[WATCH] ▶ Waiting for file changes...
```

Notice:
- ✅ Resumed from checkpoint (no reprocessing)
- ✅ Only 2 new events processed
- ✅ Full model updated incrementally

## Step 8: View Evolving Model

Check how the model changes over time:

```bash
# Compare model at checkpoint 1 vs current
diff \
  <(jq '.model' output/model.checkpoint-001.json 2>/dev/null || echo "{}") \
  <(jq '.model' output/model.json)
```

You can see:
- Activity count growing
- New edges appearing
- Model stabilizing

## Step 9: Monitor with Status Endpoint

In another terminal (if service running):

```bash
curl http://localhost:3001/status
```

Response:

```json
{
  "state": "watching",
  "total_events": 27,
  "total_traces": 12,
  "checkpoints": 13,
  "last_update": "2026-04-05T09:15:22Z",
  "model": {
    "nodes": 8,
    "edges": 12,
    "type": "dfg"
  }
}
```

## Understanding Watch Mode

### When to Use Watch Mode

| Scenario | Recommendation |
|----------|-----------------|
| Live event streams | ✅ Use watch mode |
| Static files | ❌ Use normal `pmctl run` |
| Real-time dashboards | ✅ Use watch mode |
| Batch processing | ❌ Use normal `pmctl run` |
| Continuous monitoring | ✅ Use watch mode |

### Checkpoint Semantics

Checkpoints ensure:

1. **No data loss** — If interrupted, resume from last checkpoint
2. **No reprocessing** — Previously processed events skipped
3. **Reproducibility** — Same input → same checkpoint
4. **Auditability** — Full history of model evolution

### Configuration for Watch

```toml
[source]
type = "stream"
path = "events.log"
watch = true               # Monitor file changes
checkpoint_dir = ".checkpoints"
checkpoint_interval = 30   # Create checkpoint every 30 events
max_checkpoint_size_mb = 100
```

## Next Steps

1. **Deploy as service**: [Tutorial: Running as a Service](./service-mode.md)
2. **Real-time monitoring**: [Tutorial: Real-Time Process Monitoring](./realtime-monitoring.md)
3. **Reference**: [CLI Commands](../reference/cli-commands.md)

## Troubleshooting

### Checkpoint Corruption

```bash
# Delete corrupted checkpoint
rm .checkpoints/checkpoint-XXX.json

# Watch mode will restart from previous valid checkpoint
```

### Too Many Checkpoints

```bash
# Clean up old checkpoints
find .checkpoints -name "checkpoint-*.json" -mtime +7 -delete
```

### File Permission Issues

```bash
# Ensure read/write permissions
chmod 644 events.log
chmod 755 .checkpoints/
```

## Summary

You've learned:
- ✅ Started watch mode for live monitoring
- ✅ Added events incrementally
- ✅ Observed real-time discovery updates
- ✅ Used checkpoints for recovery
- ✅ Resumed after disconnection
- ✅ Verified idempotency (no reprocessing)

**Total files created**: 13 checkpoints  
**Model evolution tracked**: Full history  

---

## Related Documentation

- **[Tutorial: Running as a Service](./service-mode.md)** — Next level: HTTP API
- **[Tutorial: Real-Time Monitoring](./realtime-monitoring.md)** — Building dashboards
- **[Explanation: Streaming vs Batch](../explanation/streaming.md)** — Design rationale
- **[Reference: CLI Commands](../reference/cli-commands.md)** — Full watch command syntax
