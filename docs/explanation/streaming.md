# Explanation: Streaming vs Batch Processing

**Time to read**: 10 minutes  
**Level**: Intermediate  

## Batch Processing

Traditional approach:

```
Collect all events → Run algorithm once → Output model

Time: All events collected, then one analysis
Memory: Store all events in memory
Updates: Single output
```

Use case:
- Historical analysis
- One-time reports
- Static event logs

## Streaming (Incremental) Processing

wasm4pm alternative:

```
Event 1 arrives → Update model
Event 2 arrives → Update model
Event 3 arrives → Update model
...

Time: Real-time, incremental
Memory: Bounded (constant)
Updates: Continuous
```

Use case:
- Live monitoring
- 24/7 systems
- Detecting drift
- Real-time alerts

## Comparison

| Aspect | Batch | Stream |
|--------|-------|--------|
| **Latency** | Minutes/hours | Milliseconds |
| **Memory** | O(n) events | O(a) activities |
| **Complete view** | Yes | Growing |
| **Resume** | Restart | From checkpoint |
| **Total time** | Single run | Continuous |

## Checkpoint Semantics

Streaming uses checkpoints to resume:

```
Checkpoint 1: Events 1-100, Model A
  ↓ [Interrupt]
  ↓
Checkpoint 2: Events 101-200, Model B (updated)
  ↓ [Resume from checkpoint 2]
  ↓
Checkpoint 3: Events 201-300, Model C (continues)
```

Key property: **No reprocessing**

## Configuration

### Batch (Default)

```toml
[source]
type = "file"
path = "events.xes"
watch = false  # One-time
```

### Stream

```toml
[source]
type = "stream"
path = "events.log"
watch = true  # Continuous
checkpoint_dir = "/var/cache/wasm4pm"
checkpoint_interval = 100  # Every 100 events
```

## Trade-Offs

### Batch

**Pros**:
- ✓ Simple (run once)
- ✓ Complete view (all events seen)
- ✓ Better model quality

**Cons**:
- ✗ High latency
- ✗ High memory
- ✗ Can't handle 24/7 streams

### Stream

**Pros**:
- ✓ Low latency
- ✓ Low memory
- ✓ Detects drift/anomalies

**Cons**:
- ✗ Model evolves (not stable)
- ✗ Checkpoint overhead
- ✗ More complex

## When to Use

**Batch**: 
- Analyzing historical data
- Reports and dashboards
- One-time analysis

**Stream**:
- Real-time monitoring
- Detecting process changes
- 24/7 systems
- Alert triggering

## Hybrid Approach

Combine both:

```bash
# Monthly batch analysis for reporting
pmctl run --config batch-config.toml

# Daily streaming for monitoring
pmctl watch --config stream-config.toml --profile fast
```

## See Also

- [Tutorial: Watch Mode](../tutorials/watch-mode.md)
- [Tutorial: Real-Time Monitoring](../tutorials/realtime-monitoring.md)
- [Explanation: Profiles](./profiles.md)
