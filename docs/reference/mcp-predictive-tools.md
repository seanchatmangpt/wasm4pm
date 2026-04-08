# Reference: MCP Predictive Tools

**Version**: 0.5.4
**Source**: `wasm4pm/src/mcp_server.ts`
**Transport**: Stdio (Model Context Protocol)

## Overview

The wasm4pm MCP server exposes five predictive process mining tools for use by Claude and other MCP clients. These tools accept XES event log content as strings and return structured results with an `interpretation` field designed for LLM consumption.

All WASM handles are allocated and freed within the same tool execution tick. No memory leaks accumulate across calls.

## Tool Summary

| Tool | Purpose | Required Inputs |
|------|---------|----------------|
| `predict_next_activity` | Predict top-k likely next activities | `xes_content`, `prefix` |
| `predict_case_duration` | Predict remaining time for a running case | `xes_content`, `prefix` |
| `score_trace_anomaly` | Score a trace for anomaly against the log | `xes_content`, `trace` |
| `detect_concept_drift` | Detect concept drift with EWMA smoothing | `xes_content` |
| `extract_case_features` | Extract ML-ready feature vectors | `xes_content` |

---

## predict_next_activity

Given an activity prefix, predict the top-k most likely next activities with probabilities. Builds an n-gram model from the log on-the-fly.

### Input Schema

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `xes_content` | string | yes | | XES event log content used to train the predictor |
| `prefix` | string[] | yes | | Sequence of activity names seen so far (e.g., `["Register", "Check"]`) |
| `k` | number | no | `5` | Number of top candidates to return |
| `n` | number | no | `2` | N-gram context size (how many preceding activities to consider) |

### Output

```json
{
  "predictions": [
    { "activity": "Approve", "probability": 0.452 },
    { "activity": "Reject", "probability": 0.281 },
    { "activity": "Request Info", "probability": 0.186 }
  ],
  "interpretation": "After Register→Check, the most likely next activity is \"Approve\" (probability: 45.2%). 3 candidates ranked by 2-gram model trained from the log.",
  "prefix": ["Register", "Check"],
  "n_gram_order": 2
}
```

### WASM Functions

1. `load_eventlog_from_xes(xes_content)` -- parse XES
2. `build_ngram_predictor(logHandle, "concept:name", n)` -- build model
3. `predict_next_k(predictorHandle, prefixJson, k)` -- score candidates
4. `delete_object(predictorHandle)` -- free predictor
5. `delete_object(logHandle)` -- free log

### Usage Notes

- If the prefix does not appear in the training log, `predictions` will be empty and `interpretation` will indicate no prediction available.
- The `n` parameter controls context window: `n=2` uses the last 2 activities, `n=5` uses the last 5.

---

## predict_case_duration

Predict the remaining time (ms) for a running case given its activity prefix. Builds a bucket-based remaining-time model from the log.

### Input Schema

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `xes_content` | string | yes | | XES event log content (completed cases used as training data) |
| `prefix` | string[] | yes | | Activity names executed so far in the running case |

### Output

```json
{
  "remaining_ms": 8280000,
  "remaining_hours": 2.30,
  "interpretation": "Based on cases with a similar prefix (Register→Check→Review), the expected remaining time is approximately 2.3 hours.",
  "prefix": ["Register", "Check", "Review"]
}
```

### WASM Functions

1. `load_eventlog_from_xes(xes_content)` -- parse XES
2. `build_remaining_time_model(logHandle, "concept:name", "time:timestamp")` -- build model
3. `predict_case_duration(modelHandle, prefixJson)` -- estimate duration
4. `delete_object(modelHandle)` -- free model
5. `delete_object(logHandle)` -- free log

### Usage Notes

- Requires the log to contain `time:timestamp` attributes for duration estimation.
- If the prefix has no matches in completed cases, `remaining_ms` will be 0 and `interpretation` will indicate no estimate available.

---

## score_trace_anomaly

Score a trace (sequence of activity names) for anomaly against the reference DFG discovered from the log. Returns a normalized 0-1 score and an `is_anomalous` flag.

### Input Schema

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `xes_content` | string | yes | | XES event log content used as the reference ("normal" process) |
| `trace` | string[] | yes | | The trace to evaluate (e.g., `["Register", "Skip Approval", "Close"]`) |

### Output

```json
{
  "score": 0.7832,
  "is_anomalous": true,
  "interpretation": "This trace is anomalous (score 0.783 > 0.5). One or more transitions (Register→Skip Approval→Close) are rare or absent in the reference process model. Consider reviewing this case for deviations.",
  "trace": ["Register", "Skip Approval", "Close"]
}
```

### WASM Functions

1. `load_eventlog_from_xes(xes_content)` -- parse XES
2. `discover_dfg_handle(logHandle, "concept:name")` -- build reference DFG
3. `score_trace_anomaly(dfgHandle, traceJson)` -- compute anomaly score
4. `delete_object(dfgHandle)` -- free DFG
5. `delete_object(logHandle)` -- free log

### Anomaly Threshold

The `is_anomalous` flag is set to `true` when `score > 0.5`. This threshold is hardcoded in the MCP server implementation.

### Usage Notes

- The score is normalized to [0, 1] where 0 = perfectly normal and 1 = maximally anomalous.
- Transitions that are rare or absent in the reference model contribute to higher scores.

---

## detect_concept_drift

Detect concept drift in a process log using windowed Jaccard distance and EWMA smoothing. Returns drift points, trend direction, and an interpretation.

### Input Schema

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `xes_content` | string | yes | | XES event log content to analyze for drift |
| `window_size` | number | no | `50` | Number of traces per sliding window |
| `alpha` | number | no | `0.3` | EWMA smoothing factor in (0, 1]. Higher = more weight on recent windows. |
| `activity_key` | string | no | `"concept:name"` | XES activity attribute key |

### Output

```json
{
  "drifts_detected": 3,
  "drift_points": [
    { "position": 45, "distance": 0.4521, "type": "concept_drift" },
    { "position": 112, "distance": 0.3876, "type": "concept_drift" },
    { "position": 203, "distance": 0.5102, "type": "concept_drift" }
  ],
  "trend": "rising",
  "ewma": 0.4231,
  "interpretation": "Concept drift detected -- 3 drift point(s) found and the EWMA trend is rising (0.423). The process is actively changing. Investigate the most recent drift points for root cause.",
  "window_size": 50,
  "alpha": 0.3
}
```

### Trend Values

| Trend | Meaning |
|-------|---------|
| `rising` | Drift is increasing -- the process is actively changing |
| `falling` | Drift is decreasing -- the process is stabilizing |
| `stable` | Drift has plateaued -- historical change that has leveled off |

### WASM Functions

1. `load_eventlog_from_xes(xes_content)` -- parse XES
2. `detect_drift(logHandle, activityKey, windowSize)` -- find drift points
3. `compute_ewma(distancesJson, alpha)` -- smooth drift distances
4. `delete_object(logHandle)` -- free log

### Usage Notes

- The `alpha` parameter controls EWMA reactivity: `alpha=0.3` (default) is moderate, `alpha=0.1` is smooth, `alpha=0.9` is very reactive.
- If no drift is detected, `drifts_detected` is 0, `drift_points` is empty, and `interpretation` confirms stability.

---

## extract_case_features

Extract ML-ready feature vectors from an event log for predictive process mining. Returns feature vectors keyed by case ID.

### Input Schema

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `xes_content` | string | yes | | XES event log content |
| `features` | string[] | no | `["trace_length", "activity_counts", "rework_count"]` | Features to extract (see table below) |
| `target` | string | no | `"outcome"` | Target variable for supervised learning |

### Available Features

| Feature | Description |
|---------|-------------|
| `trace_length` | Number of events in the trace |
| `elapsed_time` | Total duration from first to last event |
| `activity_counts` | Frequency count per activity |
| `rework_count` | Number of repeated activities |
| `unique_activities` | Number of distinct activities in the trace |
| `avg_inter_event_time` | Average time between consecutive events |

### Target Variables

| Target | Description |
|--------|-------------|
| `"outcome"` | Case outcome classification (default) |
| `"remaining_time"` | Remaining time regression |
| `"next_activity"` | Next activity classification |

### Output

The output is the direct result of `extract_case_features`, which returns feature vectors keyed by case ID. The exact shape depends on the features requested.

### WASM Functions

1. `load_eventlog_from_xes(xes_content)` -- parse XES
2. `extract_case_features(logHandle, "concept:name", "time:timestamp", configJson)` -- extract features
3. `delete_object(logHandle)` -- free log

### Usage Notes

- The `configJson` parameter is constructed internally as `JSON.stringify({ features, target })`.
- This tool is designed to produce training data for external ML models.

---

## Memory Management

All five predictive tools follow the same memory management pattern:

```typescript
const logHandle = wasm.load_eventlog_from_xes(xes_content);
try {
  // ... use intermediate handles ...
  const modelHandle = wasm.build_ngram_predictor(logHandle, ...);
  try {
    // ... compute result ...
  } finally {
    wasm.delete_object(modelHandle);
  }
} finally {
  wasm.delete_object(logHandle);
}
```

Handles are freed in nested `try/finally` blocks. Even if the computation throws, cleanup runs. No handles leak across tool invocations.

## See Also

- [Prediction CLI Reference](./prediction-cli.md) -- `pmctl predict` task documentation
- [Prediction Config Reference](./prediction-config.md) -- prediction configuration schema
- [CLI Commands Reference](./cli-commands.md) -- all pmctl commands
