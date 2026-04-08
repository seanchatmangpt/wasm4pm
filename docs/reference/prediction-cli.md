# Reference: Prediction CLI (`pmctl predict`)

**Version**: 26.4.6
**Source**: `apps/pmctl/src/commands/predict.ts`

## Overview

`pmctl predict` runs predictive process mining tasks on an XES event log. It supports six task types covering the four prediction perspectives defined by van der Aalst: next activity, remaining time, outcome, and concept drift. Two additional utility tasks provide feature extraction and resource estimation.

All results are auto-saved to `.wasm4pm/results/<timestamp>-<task>.json` unless `--no-save` is passed.

## Command Signature

```
pmctl predict <TASK> --input <LOG> [OPTIONS]
```

## Global Prediction Options

| Flag | Alias | Type | Default | Description |
|------|-------|------|---------|-------------|
| `TASK` | | positional | **required** | Prediction task type |
| `--input <path>` | `-i` | string | **required** | Path to XES event log |
| `--activity-key <key>` | | string | from config or `concept:name` | XES activity attribute key |
| `--prefix <activities>` | | string | | Comma-separated activity prefix |
| `--top-k <n>` | | string | `3` | Number of top predictions to return |
| `--ngram-order <n>` | | string | from config or `2` | N-gram order (2-5) |
| `--drift-window <n>` | | string | from config or `10` | Window size for drift detection |
| `--config <path>` | | string | | Path to config file |
| `--no-save` | | boolean | | Do not persist result |
| `--format <fmt>` | | `human\|json` | `human` | Output format |
| `--verbose` | `-v` | boolean | | Enable verbose output |
| `--quiet` | `-q` | boolean | | Suppress non-error output |

### Parameter Precedence

CLI flags take priority over config file values, which take priority over hardcoded defaults:

```
CLI flag  >  config file [prediction.*]  >  hardcoded default
```

---

## Task: `next-activity`

Predict the most likely next activity given an observed prefix, using an n-gram language model.

### Task-Specific Options

| Flag | Default | Description |
|------|---------|-------------|
| `--prefix <activities>` | | Comma-separated prefix (e.g., `"Register,Check,Approve"`) |
| `--top-k <n>` | `3` | Number of top-ranked predictions to return |
| `--ngram-order <n>` | `2` | N-gram context size (2-5) |

### WASM Functions Called

1. `build_ngram_predictor(logHandle, activityKey, ngramOrder)` -- builds the model
2. `predict_next_activity(predictorHandle, JSON.stringify(prefix))` -- scores candidates

### Human Output Format

```
  Rank  Activity                   Probability
  ────  ─────────────────────────  ───────────
     1  Approve                    45.2%
     2  Reject                     28.1%
     3  Request Info               18.6%
```

### JSON Output Format

```json
{
  "status": "success",
  "message": "Prediction complete: next-activity",
  "task": "next-activity",
  "input": "process.xes",
  "activityKey": "concept:name",
  "predictions": [
    { "activity": "Approve", "probability": 0.452 },
    { "activity": "Reject", "probability": 0.281 },
    { "activity": "Request Info", "probability": 0.186 }
  ]
}
```

### Examples

```bash
pmctl predict next-activity -i process.xes --prefix "Register,Check"
pmctl predict next-activity -i process.xes --prefix "A,B" --ngram-order 3 --top-k 5
pmctl predict next-activity -i process.xes --prefix "Submit,Review,Decision" --format json
```

---

## Task: `remaining-time`

Estimate the remaining time to complete a running case using a bucket-based duration model.

### Task-Specific Options

| Flag | Default | Description |
|------|---------|-------------|
| `--prefix <activities>` | | Comma-separated prefix of activities completed so far |

If no `--prefix` is provided, the model is built but no prediction is returned. The output indicates that a prefix is required.

### WASM Functions Called

1. `build_remaining_time_model(logHandle, activityKey, "time:timestamp")` -- builds the model
2. `predict_case_duration(modelHandle, JSON.stringify(prefix))` -- estimates remaining time

### Human Output Format (with prefix)

```
  Estimated remaining time:  2.3 hours
  Confidence:                67.2%
  Method:                    bucket
```

### Human Output Format (without prefix)

```
  Remaining-time model built. Use --prefix "Activity1,Activity2" to predict case duration.
```

### JSON Output Format

```json
{
  "status": "success",
  "message": "Prediction complete: remaining-time",
  "task": "remaining-time",
  "input": "process.xes",
  "activityKey": "concept:name",
  "prediction": {
    "remaining_ms": 8280000,
    "confidence": 0.672,
    "method": "bucket"
  }
}
```

### Examples

```bash
pmctl predict remaining-time -i process.xes --prefix "Register,Check,Review"
pmctl predict remaining-time -i process.xes --prefix "A,B,C" --format json
```

---

## Task: `outcome`

Score a trace prefix for anomaly against the reference DFG discovered from the log. Uses both DFG anomaly scoring and n-gram log-likelihood.

### Task-Specific Options

| Flag | Default | Description |
|------|---------|-------------|
| `--prefix <activities>` | | Comma-separated prefix to score |
| `--top-k <n>` | `3` | Number of top anomalous traces to show (when no prefix given) |

### Two Modes

**With `--prefix`**: Scores the given prefix as a potential anomaly. Returns a single anomaly score and log-likelihood.

**Without `--prefix`**: Scores all traces in the log for anomaly. Returns the top-k most anomalous traces.

### WASM Functions Called

1. `discover_dfg_handle(logHandle, activityKey)` -- builds reference DFG
2. `score_anomaly(dfgHandle, JSON.stringify(prefix))` -- scores prefix against DFG
3. `build_ngram_predictor(logHandle, activityKey, ngramOrder)` -- for log-likelihood
4. `score_trace_likelihood(ngramHandle, JSON.stringify(prefix))` -- n-gram score
5. `score_log_anomalies(logHandle, dfgHandle, activityKey)` -- scores all traces (no prefix mode)

### Human Output Format (with prefix)

```
  Anomaly score:    0.7832
  Is anomalous:     true
  Threshold:        0.5000
  Log-likelihood:   -3.2145
```

### Human Output Format (without prefix)

```
  Case ID              Score     Anomalous
  ───────────────────  ────────  ─────────
  case-1042            0.9123    yes
  case-0087            0.8456    yes
  case-2190            0.7234    yes
```

### JSON Output Format (with prefix)

```json
{
  "status": "success",
  "task": "outcome",
  "anomaly": {
    "score": 0.7832,
    "is_anomalous": true,
    "threshold": 0.5
  },
  "logLikelihood": -3.2145
}
```

### Examples

```bash
pmctl predict outcome -i process.xes --prefix "A,B,C"
pmctl predict outcome -i process.xes --prefix "Register,Skip,Close" --format json
pmctl predict outcome -i process.xes --top-k 10
```

---

## Task: `drift`

One-shot concept drift detection across the entire event log using Jaccard-window analysis.

### Task-Specific Options

| Flag | Default | Description |
|------|---------|-------------|
| `--drift-window <n>` | from config or `10` | Sliding window size in traces |

### WASM Functions Called

1. `detect_drift(logHandle, activityKey, driftWindow)` -- detects drift points

### Human Output Format

```
  Detected 3 drift point(s) (method: jaccard_window):
    Position 45  distance=0.4521  type=concept_drift
    Position 112  distance=0.3876  type=concept_drift
    Position 203  distance=0.5102  type=concept_drift
```

### JSON Output Format

```json
{
  "status": "success",
  "task": "drift",
  "driftResult": {
    "drifts_detected": 3,
    "drifts": [
      { "position": 45, "distance": 0.4521, "type": "concept_drift" },
      { "position": 112, "distance": 0.3876, "type": "concept_drift" },
      { "position": 203, "distance": 0.5102, "type": "concept_drift" }
    ],
    "method": "jaccard_window"
  }
}
```

### Examples

```bash
pmctl predict drift -i process.xes
pmctl predict drift -i process.xes --drift-window 20
pmctl predict drift -i process.xes --drift-window 50 --format json
```

---

## Task: `features`

Extract ML-ready features from the event log, specifically transition probabilities. Optionally extract prefix features for case-level predictions.

### Task-Specific Options

| Flag | Default | Description |
|------|---------|-------------|
| `--prefix <activities>` | | Comma-separated prefix for additional prefix feature extraction |

### WASM Functions Called

1. `build_transition_probabilities(logHandle, activityKey)` -- extracts transition matrix
2. `extract_prefix_features_wasm(JSON.stringify(prefix))` -- prefix features (if prefix given)

### Human Output Format

```
  Transition probabilities: 12 edge(s)
    {"from":"A","to":"B","probability":0.45}
    {"from":"A","to":"C","probability":0.30}
    {"from":"B","to":"D","probability":0.82}
    {"from":"B","to":"E","probability":0.18}
    {"from":"C","to":"D","probability":0.55}
    ... (7 more)

  Prefix features: {"length":3,"unique_count":3,"entropy":1.52}
```

### JSON Output Format

```json
{
  "status": "success",
  "task": "features",
  "transitions": [
    { "from": "A", "to": "B", "probability": 0.45 },
    { "from": "A", "to": "C", "probability": 0.30 }
  ],
  "prefixFeatures": {
    "length": 3,
    "unique_count": 3,
    "entropy": 1.52
  }
}
```

### Examples

```bash
pmctl predict features -i process.xes
pmctl predict features -i process.xes --prefix "A,B,C"
pmctl predict features -i process.xes --format json
```

---

## Task: `resource`

Estimate resource queue delay using an M/M/1 queueing model. Shows queue statistics alongside the event log's transition structure.

### Task-Specific Options

None beyond the global options.

### Implementation Notes

The resource task uses fixed demonstration arrival and service rates (arrival=0.7, service=1.0). It also extracts the log's transition probability matrix for structural context.

### WASM Functions Called

1. `estimate_queue_delay(arrivalRate, serviceRate)` -- M/M/1 queue model
2. `build_transition_probabilities(logHandle, activityKey)` -- transition structure

### Human Output Format

```
  M/M/1 Queue Model Estimate:
    Wait time:    2.33s
    Utilization:  70.0%
    Stable:       true
  Transitions in model: 12
```

### JSON Output Format

```json
{
  "status": "success",
  "task": "resource",
  "queueStats": {
    "wait_time": 2.33,
    "utilization": 0.7,
    "is_stable": true
  },
  "transitionCount": 12
}
```

### Examples

```bash
pmctl predict resource -i process.xes
pmctl predict resource -i process.xes --format json
```

---

## Auto-Save Behavior

All prediction results are saved to `.wasm4pm/results/` with the naming convention:

```
.wasm4pm/results/<YYYYMMDD>T<HHmmss>-<task>.json
```

Examples:
- `.wasm4pm/results/20260406T143012-next-activity.json`
- `.wasm4pm/results/20260406T143522-drift.json`
- `.wasm4pm/results/20260406T144001-outcome.json`

Use `--no-save` to skip auto-saving.

## Config File Equivalent

Prediction parameters can be set in the `[prediction]` section of `wasm4pm.toml` or the `prediction` key in `wasm4pm.json`. See [Prediction Config Reference](./prediction-config.md) for the full schema.

## Exit Codes

| Code | Constant | Condition |
|------|----------|-----------|
| 0 | `success` | Prediction completed successfully |
| 2 | `source_error` | Unknown task, input file not found |
| 3 | `execution_error` | WASM execution failure |

## See Also

- [CLI Commands Reference](./cli-commands.md) -- all pmctl commands
- [Prediction Config Reference](./prediction-config.md) -- configuration schema for prediction
- [MCP Predictive Tools Reference](./mcp-predictive-tools.md) -- MCP server equivalents
