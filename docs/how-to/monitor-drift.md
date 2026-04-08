# How-To: Monitor Process Drift in Real-Time

**Time required**: 10 minutes
**Difficulty**: Intermediate

## Problem

You need to detect when a process changes behavior in real-time -- for example, a production system where the event log grows over time and you want an alert when the process starts deviating from its established pattern. `pmctl drift-watch` polls an XES file, computes structural distance between sliding windows, and applies EWMA smoothing to surface drift as it happens.

---

## 1. Start a basic drift monitor

```bash
pmctl drift-watch --input production.xes
```

What you should see:

```
[drift-watch] Streaming EWMA drift monitor started
  file=production.xes  activity-key=concept:name  window=50  interval=5000ms  alpha=0.3  threshold=0.3
  Press Ctrl+C to stop.

[14:32:01] drift=0.0000 (-> stable) | 0 drift points detected | window=50
[14:32:06] drift=0.0000 (-> stable) | 0 drift points detected | window=50
[14:32:11] drift=0.1234 (-> stable) | 1 drift points detected | window=50
[14:32:16] drift=0.1856 (↑ rising) | 2 drift points detected | window=50
  ⚠  ALERT -- 1 new drift point at position 120, distance=0.2471
[14:32:21] drift=0.3401 (↑ rising) | 4 drift points detected | window=50
  ⚠  ALERT -- 2 new drift points at position 180, distance=0.5123
```

Press `Ctrl+C` to stop the monitor.

---

## 2. Understand the output

Each line shows the current state:

| Field | Meaning |
|-------|---------|
| `drift=0.3401` | Current EWMA-smoothed drift value (Jaccard distance) |
| `(↑ rising)` | Trend indicator: rising, falling, or stable |
| `0 drift points detected` | Cumulative count of drift points found |
| `window=50` | Sliding window size in traces |

When a new drift point is detected, an `ALERT` line appears with the position in the log and the raw Jaccard distance at that point.

### Trend arrows

| Arrow | Color | Meaning |
|-------|-------|---------|
| `↑ rising` | Red | Drift is increasing -- the process is changing |
| `↓ falling` | Green | Drift is decreasing -- the process is stabilizing |
| `→ stable` | Cyan | Drift is holding steady |

---

## 3. Tune the parameters

### Faster polling (every 2 seconds)

```bash
pmctl drift-watch -i live.xes --interval 2000
```

### More responsive smoothing (higher alpha)

A higher alpha gives more weight to recent observations, making the monitor react faster to sudden changes:

```bash
pmctl drift-watch -i live.xes --alpha 0.5
```

With `alpha=0.5`, the EWMA responds more quickly to new drift points. With the default `alpha=0.3`, it is smoother and less noisy.

### Lower alert threshold

Trigger alerts on smaller drift values:

```bash
pmctl drift-watch -i live.xes --threshold 0.2
```

### Smaller sliding window

A smaller window detects localized changes; a larger window captures gradual drift:

```bash
pmctl drift-watch -i live.xes --window 30
```

### All parameters together

```bash
pmctl drift-watch -i live.xes --interval 2000 --window 30 --alpha 0.5 --threshold 0.2
```

---

## 4. Get JSON output for integration

```bash
pmctl drift-watch -i stream.xes --json
```

What you should see:

```json
{"timestamp":"2026-04-06T14:32:11.000Z","ewma":0.1234,"trend":"stable","drifts_detected":1,"window_size":50,"new_drift_points":1,"distances":[0.0,0.0,0.1234]}
{"timestamp":"2026-04-06T14:32:16.000Z","ewma":0.1856,"trend":"rising","drifts_detected":2,"window_size":50,"new_drift_points":1,"distances":[0.0,0.0,0.1234,0.2471]}
{"timestamp":"2026-04-06T14:32:21.000Z","ewma":0.3401,"trend":"rising","drifts_detected":4,"window_size":50,"new_drift_points":2,"distances":[0.0,0.0,0.1234,0.2471,0.5123,0.4891]}
```

Each line is a valid JSON object, one per poll interval. Pipe into a monitoring tool:

```bash
pmctl drift-watch -i stream.xes --json | while read -r line; do
  ewma=$(echo "$line" | jq -r '.ewma')
  if (( $(echo "$ewma > 0.3" | bc -l) )); then
    echo "DRIFT ALERT: ewma=$ewma" | send-alert
  fi
done
```

---

## 5. Parameter reference

| Flag | Default | Description |
|------|---------|-------------|
| `--input` / `-i` | (required) | Path to the XES event log file to monitor |
| `--interval` / `-n` | `5000` | Poll interval in milliseconds. How often the file is checked for changes. |
| `--window` / `-w` | `50` | Sliding window size in traces. Each window is compared against the previous one. |
| `--alpha` | `0.3` | EWMA smoothing factor, in the range (0, 1]. Higher values make the monitor more responsive to recent changes. |
| `--threshold` | `0.3` | Jaccard distance above which drift triggers an ALERT line in the output. |
| `--activity-key` / `-a` | `concept:name` | XES attribute used as the activity identifier. |
| `--json` | (off) | Emit newline-delimited JSON instead of human-readable output. |

---

## 6. How it works internally

1. **Poll** -- Every `--interval` milliseconds, check if the XES file has been modified (by comparing `mtime`).
2. **Parse** -- If changed, reload the entire log and parse it via the WASM engine.
3. **Detect drift** -- Call `detect_drift(handle, activity_key, window_size)` which computes Jaccard distance between consecutive sliding windows of traces.
4. **Smooth** -- Feed the raw distances into EWMA via `compute_ewma(distances, alpha)` to produce a smoothed trend line.
5. **Alert** -- If the smoothed value exceeds `--threshold`, or new drift points are detected, print an ALERT line.

The file is only re-parsed when its modification timestamp changes, so idle periods consume negligible resources.

---

## See Also

- [How-To: Compare Two Event Logs](./compare-process-models.md) -- one-time structural comparison via `pmctl diff`
- [How-To: Predictive Mining](./predictive-mining.md) -- batch drift detection via `pmctl predict drift`
- [How-To: Monitor Jobs](./monitor-jobs.md) -- monitoring discovery job execution
