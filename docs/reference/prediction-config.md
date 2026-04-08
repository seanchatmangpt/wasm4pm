# Reference: Prediction Configuration

**Version**: 26.4.6
**Source**: `packages/config/src/schema.ts`

## Overview

The prediction configuration section (`prediction`) in `wasm4pm.toml` or `wasm4pm.json` controls default values for predictive process mining tasks. These defaults are used by `pmctl predict` when CLI flags are not provided.

The schema is defined by `predictionConfigSchema` in `packages/config/src/schema.ts`.

## Schema

```typescript
predictionConfigSchema = z.object({
  enabled: z.boolean().default(false),
  activityKey: z.string().default('concept:name'),
  ngramOrder: z.number().int().min(2).max(5).default(2),
  driftWindowSize: z.number().int().positive().default(10),
  tasks: z.array(z.enum(PREDICTION_TASKS)).default([]),
})
```

### Field Reference

| Field | Type | Default | Constraints | Description |
|-------|------|---------|-------------|-------------|
| `enabled` | boolean | `false` | | Master switch for prediction subsystem |
| `activityKey` | string | `"concept:name"` | | XES attribute used as activity identifier |
| `ngramOrder` | integer | `2` | min: 2, max: 5 | Context window size for n-gram models |
| `driftWindowSize` | integer | `10` | positive | Number of traces per sliding window for drift detection |
| `tasks` | string[] | `[]` | enum values (see below) | Prediction tasks to enable by default |

### Task ID Enum

The `tasks` array accepts these values (underscore form, used in config):

| Config Task ID | CLI Slug | Description |
|----------------|----------|-------------|
| `next_activity` | `next-activity` | N-gram next-activity prediction |
| `remaining_time` | `remaining-time` | Bucket-based remaining time estimation |
| `outcome` | `outcome` | DFG anomaly scoring for outcome prediction |
| `drift` | `drift` | Jaccard-window drift detection |
| `features` | `features` | ML feature extraction |
| `resource` | `resource` | M/M/1 queue delay estimation |

Note the difference between config form (underscores: `next_activity`) and CLI form (hyphens: `next-activity`).

## TOML Configuration

```toml
# wasm4pm.toml

[prediction]
enabled = true
activityKey = "concept:name"
ngramOrder = 3
driftWindowSize = 20
tasks = ["next_activity", "remaining_time", "drift"]
```

### TOML Field Types

| Field | TOML Type | Example |
|-------|-----------|---------|
| `enabled` | boolean | `true` |
| `activityKey` | string | `"concept:name"` |
| `ngramOrder` | integer | `3` |
| `driftWindowSize` | integer | `20` |
| `tasks` | array of strings | `["next_activity", "drift"]` |

## JSON Configuration

```json
{
  "prediction": {
    "enabled": true,
    "activityKey": "concept:name",
    "ngramOrder": 3,
    "driftWindowSize": 20,
    "tasks": ["next_activity", "remaining_time", "drift"]
  }
}
```

### JSON Field Types

| Field | JSON Type | Example |
|-------|-----------|---------|
| `enabled` | boolean | `true` |
| `activityKey` | string | `"concept:name"` |
| `ngramOrder` | number (integer) | `3` |
| `driftWindowSize` | number (integer) | `20` |
| `tasks` | array of strings | `["next_activity", "drift"]` |

## Precedence

Parameters resolve in this order (highest to lowest priority):

```
CLI flag  >  config file [prediction.*]  >  ENV variable  >  hardcoded default
```

### Resolution Examples

| CLI Flag | Config Value | ENV Variable | Hardcoded Default | Resolved Value |
|----------|-------------|--------------|-------------------|----------------|
| `--ngram-order 4` | `ngramOrder = 2` | -- | 2 | **4** (CLI wins) |
| (not set) | `ngramOrder = 3` | -- | 2 | **3** (config wins) |
| (not set) | (not set) | -- | 2 | **2** (hardcoded) |
| `--activity-key "lifecycle:transition"` | `activityKey = "concept:name"` | -- | `"concept:name"` | **`"lifecycle:transition"`** (CLI wins) |

### CLI Flag to Config Field Mapping

| CLI Flag | Config Field | Description |
|----------|-------------|-------------|
| `--activity-key <key>` | `prediction.activityKey` | Activity attribute key |
| `--ngram-order <n>` | `prediction.ngramOrder` | N-gram context size |
| `--drift-window <n>` | `prediction.driftWindowSize` | Drift window size |

## Environment Variables

| Variable | Maps To | Status |
|----------|---------|--------|
| `WASM4PM_PREDICTION_TASKS` | `prediction.tasks` | Planned -- not yet implemented |

The `WASM4PM_PREDICTION_TASKS` environment variable is planned but not currently implemented. When available, it will accept a comma-separated list of task IDs (e.g., `next_activity,drift,features`).

Existing environment variables that indirectly affect prediction:

| Variable | Maps To | Description |
|----------|---------|-------------|
| `WASM4PM_LOG_LEVEL` | `observability.logLevel` | Controls prediction debug output verbosity |
| `WASM4PM_OTEL_ENABLED` | `observability.otel.enabled` | Enables OTEL spans for prediction operations |

## Validation

The prediction config is validated by Zod at config load time. Validation errors produce descriptive messages:

```
Configuration validation failed:
  prediction.ngramOrder: Number must be greater than or equal to 2
  prediction.tasks.0: Invalid enum value. Expected 'drift' | 'features' | 'next_activity' | 'outcome' | 'remaining_time' | 'resource'
```

### Validation Rules

| Field | Rule |
|-------|------|
| `ngramOrder` | Must be an integer in range [2, 5] |
| `driftWindowSize` | Must be a positive integer (> 0) |
| `tasks[*]` | Must be one of the valid task ID enum values |

## Full Config File Example

### TOML

```toml
version = "26.4.6"

[source]
kind = "file"
path = "data/process.xes"

[sink]
kind = "stdout"

[algorithm]
name = "heuristic_miner"
parameters = {}

[execution]
profile = "balanced"

[output]
format = "human"
pretty = true
colorize = true

[prediction]
enabled = true
activityKey = "concept:name"
ngramOrder = 3
driftWindowSize = 20
tasks = ["next_activity", "remaining_time", "outcome", "drift", "features"]

[observability]
logLevel = "info"
```

### JSON

```json
{
  "version": "26.4.6",
  "source": { "kind": "file", "path": "data/process.xes" },
  "sink": { "kind": "stdout" },
  "algorithm": { "name": "heuristic_miner", "parameters": {} },
  "execution": { "profile": "balanced" },
  "output": { "format": "human", "pretty": true, "colorize": true },
  "prediction": {
    "enabled": true,
    "activityKey": "concept:name",
    "ngramOrder": 3,
    "driftWindowSize": 20,
    "tasks": ["next_activity", "remaining_time", "outcome", "drift", "features"]
  },
  "observability": { "logLevel": "info" }
}
```

## See Also

- [Prediction CLI Reference](./prediction-cli.md) -- `pmctl predict` task documentation
- [Config Schema Reference](./config-schema.md) -- full configuration schema
- [CLI Commands Reference](./cli-commands.md) -- all pmctl commands
