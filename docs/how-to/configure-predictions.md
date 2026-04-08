# How-To: Configure Predictions in wasm4pm.toml

**Time required**: 10 minutes
**Difficulty**: Beginner

## Problem

You want to enable prediction capabilities in your wasm4pm configuration so that `pmctl predict` uses your preferred settings by default, without passing flags every time on the command line.

## Prediction Config Schema

The prediction section goes in your `wasm4pm.toml` (or `wasm4pm.json`) config file. Here is the full schema:

```toml
[prediction]
enabled = true                          # Enable or disable predictions (default: false)
activityKey = "concept:name"            # XES attribute for activity labels
ngramOrder = 3                          # N-gram order for sequence modeling (2-5, default: 2)
driftWindowSize = 50                    # Window size for drift detection (positive int, default: 10)
tasks = ["next_activity", "remaining_time", "drift"]  # Which prediction tasks to enable
```

### Field Reference

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | `false` | Master switch for prediction features |
| `activityKey` | string | `"concept:name"` | XES lifecycle attribute used as activity identifier |
| `ngramOrder` | integer (2--5) | `2` | Order of the Markov n-gram model for next-activity prediction |
| `driftWindowSize` | positive integer | `10` | Number of recent traces in the sliding window for drift detection |
| `tasks` | string array | `[]` | Which prediction tasks to enable |

### Valid Task IDs

| Task ID | Description |
|---------|-------------|
| `next_activity` | Predict the most likely next activity in a trace |
| `remaining_time` | Estimate remaining case duration |
| `outcome` | Predict case outcome (e.g., satisfied/rejected) |
| `drift` | Detect concept drift in the event stream |
| `features` | Extract predictive features from the event log |
| `resource` | Predict resource allocation |

## Step 1 -- Minimal: Enable Next-Activity Only

Start with the simplest useful configuration. Create or edit `wasm4pm.toml`:

```toml
[source]
kind = "file"
path = "orders.xes"

[prediction]
enabled = true
tasks = ["next_activity"]
```

Run a prediction -- it will pick up the config automatically:

```bash
pmctl predict next-activity
```

What you should see:

```
  Prediction: next-activity
  Algorithm:  dfg
  Log:        orders.xes (from config)

  Activity    Probability
  ─────────   ───────────
  Ship Order  ████████████ 0.42
  Pay Invoice ██████       0.31
  Review      ███          0.15
  Close       █            0.08
```

Note that you did not need to pass `-i orders.xes` because the source is defined in the config file.

## Step 2 -- Moderate: Next-Activity + Remaining-Time + Drift

Add more prediction tasks and tune the n-gram order for better next-activity accuracy:

```toml
[source]
kind = "file"
path = "orders.xes"

[prediction]
enabled = true
activityKey = "concept:name"
ngramOrder = 3
tasks = ["next_activity", "remaining_time", "drift"]
```

Run each prediction:

```bash
pmctl predict next-activity
pmctl predict remaining-time
pmctl predict drift
```

What you should see for remaining-time:

```
  Prediction: remaining-time
  Algorithm:  dfg
  Log:        orders.xes

  Percentile    Estimated Time (min)
  ──────────    ────────────────────
  P50           45
  P75           72
  P90           120
  P99           310
```

What you should see for drift:

```
  Prediction: drift
  Algorithm:  dfg
  Log:        orders.xes
  Window:     50 traces (from config)

  Drift Status: STABLE
  EWMA Score:   0.03
  Threshold:    0.15
```

## Step 3 -- Full: All 6 Tasks with Tuned Parameters

Enable every prediction task with tuned parameters:

```toml
[source]
kind = "file"
path = "orders.xes"

[algorithm]
name = "heuristic_miner"

[execution]
profile = "balanced"

[prediction]
enabled = true
activityKey = "concept:name"
ngramOrder = 4
driftWindowSize = 100
tasks = [
  "next_activity",
  "remaining_time",
  "outcome",
  "drift",
  "features",
  "resource"
]
```

Run a feature extraction to see what predictive attributes are available:

```bash
pmctl predict features
```

What you should see:

```
  Prediction: features
  Algorithm:  heuristic_miner
  Log:        orders.xes

  Extracted Features (14)
  ──────────────────────
  trace_length          avg: 5.2   min: 1   max: 23
  unique_activities     avg: 3.8   min: 1   max: 12
  cycle_count           avg: 0.4   min: 0   max: 5
  resource_variety      avg: 2.1   min: 1   max: 8
  ...

  14 features extracted and saved to .wasm4pm/results/
```

## JSON Equivalent

If you prefer JSON config (`wasm4pm.json`) instead of TOML:

```json
{
  "source": {
    "kind": "file",
    "path": "orders.xes"
  },
  "prediction": {
    "enabled": true,
    "activityKey": "concept:name",
    "ngramOrder": 3,
    "driftWindowSize": 50,
    "tasks": ["next_activity", "remaining_time", "drift"]
  }
}
```

## Config Precedence

wasm4pm uses a 5-layer precedence system. For the prediction section, values from higher layers override lower ones:

1. **CLI flags** (highest priority) -- e.g., `pmctl predict next-activity --ngram-order 5`
2. **Config file** -- `wasm4pm.toml` or `wasm4pm.json`
3. **Environment variables** -- e.g., `WASM4PM_PREDICTION_NGRAM_ORDER=5`
4. **Defaults** -- built-in defaults from the schema

Example: If your config file sets `ngramOrder = 3` but you run:

```bash
WASM4PM_PREDICTION_NGRAM_ORDER=4 pmctl predict next-activity --ngram-order 5
```

The effective value is `5` (CLI flag wins). If you omit the flag, the effective value is `4` (ENV wins over config). If you omit both, the effective value is `3` (config file).

## Validation

If you provide an invalid configuration, wasm4pm reports the errors at startup:

```toml
[prediction]
enabled = true
ngramOrder = 10        # Invalid: must be 2-5
driftWindowSize = -5   # Invalid: must be positive
tasks = ["unknown"]    # Invalid: not a recognized task ID
```

What you should see:

```
[ERROR] Config validation failed
[ERROR] prediction.ngramOrder: must be between 2 and 5 (got 10)
[ERROR] prediction.driftWindowSize: must be a positive integer (got -5)
[ERROR] prediction.tasks[0]: unrecognized task "unknown"
[ERROR] Valid tasks: drift, features, next_activity, outcome, remaining_time, resource
```

## Related

- [How-To: Browse and Inspect Previous Results](browse-results.md) -- inspecting saved prediction results
- [How-To: Benchmark Algorithms](benchmark-algorithms.md) -- choosing the algorithm for prediction
- [How-To: Debug Configuration Errors](debug-config.md) -- troubleshooting config validation failures
- [How-To: Use Environment Variables](environment-variables.md) -- ENV variable reference for all settings
