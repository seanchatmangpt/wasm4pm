# Explanation: Watch Mode Reconnection

**Time to read**: 10 minutes  
**Level**: Advanced  

## The Problem

Streaming in watch mode can be interrupted:

```
Network glitch → Connection lost → Process exits
Events arrive during downtime → Data loss?
Resume → From where?
```

## The Solution: Checkpoints

wasm4pm saves **checkpoint state** after each batch:

```
Checkpoint 1: Events 0-100 processed
  saved to: .checkpoints/checkpoint-001.json
  
Checkpoint 2: Events 101-200 processed
  saved to: .checkpoints/checkpoint-002.json
  
[Network interruption]

Resume: Load checkpoint-002
  Continue from event 201
  No reprocessing of 0-200
  No data loss
```

## How Reconnection Works

### Before Interruption

```json
{
  "checkpoint_id": "checkpoint-015",
  "timestamp": "2026-04-05T12:30:00Z",
  "offset": 2847,
  "events_processed": 150,
  "model": { /* ... */ },
  "hash": "blake3:7c9f1a..."
}
```

### Detect Interruption

```bash
# Watch mode detects file change stopped
[WATCH] ✗ File change detection lost (timeout)
[WATCH] Attempting reconnection...
```

### Resume from Checkpoint

```bash
[WATCH] Resuming from checkpoint-015
[WATCH] Last processed offset: 2847
[WATCH] Checking for new events...
[WATCH] ✓ Found 45 new events
[INFO] Processing batch: events 2848-2892
[PROGRESS] 0%
[PROGRESS] 100%
[INFO] Checkpoint saved: checkpoint-016
[WATCH] ▶ Watching for changes...
```

## Offset Semantics

Checkpoints record **byte offset** in file:

```
File: events.log

Byte 0-100: Event records 1-10
Byte 101-200: Event records 11-20  ← Checkpoint: offset=200

Next batch starts at byte 201
(Skips 0-200, no reprocessing)
```

## Loss Detection

If data is lost during interruption:

```
Checkpoint at offset 2847
Resume, try to read offset 2848
← File truncated or corrupted

Detection:
  [WATCH] Error: Cannot continue from checkpoint
  [WATCH] Offset 2847 not found in file
  [WATCH] Possible data loss
  
Recovery:
  # Manually reset if sure no data loss
  rm .checkpoints/checkpoint-015.json
  # Or restart from scratch
  rm -rf .checkpoints/
```

## Idempotency Guarantee

**Idempotent**: Running twice = same result

```
Run 1:
  Process events 0-100
  Output: Model A

Run 2:
  Process same events 0-100
  Output: Model A (identical)

Guarantee:
  Re-running doesn't double-count events
```

## Configuration

```toml
[source]
type = "stream"
path = "events.log"
watch = true
checkpoint_dir = "/var/cache/wasm4pm"
checkpoint_interval = 100        # Checkpoint every 100 events
checkpoint_timeout_sec = 300     # Save if no activity for 5min
max_checkpoint_size_mb = 100     # Don't exceed 100MB
keep_checkpoints = 30            # Keep last 30
```

## Checkpoint Cleanup

Old checkpoints are automatically pruned:

```bash
# Keep only last 10 checkpoints
[WATCH] Checkpoint cleanup: removing 5 old checkpoints
[WATCH] Kept: checkpoint-020 ... checkpoint-029
```

Manual cleanup:

```bash
# Remove all checkpoints (starts fresh)
rm -rf .checkpoints/

# Keep last 5
ls -t .checkpoints/ | tail -n +6 | xargs rm
```

## Monitoring Reconnections

Check reconnection stats:

```bash
curl http://localhost:3001/metrics | grep reconnect
```

Metrics:

```
wasm4pm_watch_reconnections_total 3
wasm4pm_checkpoint_saves_total 45
wasm4pm_checkpoint_load_failures_total 0
```

## Best Practices

1. **Monitor checkpoints**:
   ```bash
   watch -n 5 'ls -lh .checkpoints/ | tail -5'
   ```

2. **Alert on reconnection**:
   ```bash
   curl .../metrics | grep reconnections | alert_if_high
   ```

3. **Backup checkpoints**:
   ```bash
   cp -r .checkpoints/ backup/
   ```

4. **Test recovery**:
   ```bash
   # Kill watch mode
   pkill -f "pmctl watch"
   
   # Restart immediately
   pmctl watch --config config.toml
   # Should resume from checkpoint, not restart
   ```

## Edge Cases

### Network Stall (vs Disconnect)

```
If no events arrive for 5 minutes:
  [WATCH] Heartbeat timeout
  [WATCH] Reconnecting...

If network is truly dead:
  [WATCH] Connection lost
  [WATCH] Will resume when back online
```

### Duplicate Handling

If same event processed twice (rare):

```
Checkpoint guarantees prevent this
But if external system sends duplicates:
  
[WATCH] Event e123 already processed
[WATCH] Skipping (seen at checkpoint-015)
```

## See Also

- [Tutorial: Watch Mode](../tutorials/watch-mode.md)
- [Tutorial: Real-Time Monitoring](../tutorials/realtime-monitoring.md)
- [Explanation: Streaming](./streaming.md)
