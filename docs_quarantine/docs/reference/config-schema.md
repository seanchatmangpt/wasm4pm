# Reference: Configuration Schema

**Format**: TOML or JSON
**Validation**: Zod schema
**Version**: 26.4.7

## Complete Schema (TOML)

```toml
# Discovery configuration
[discovery]
algorithm = "dfg"                # dfg, alpha, heuristic, inductive, genetic, ilp
profile = "balanced"             # fast, balanced, quality, stream, ml
timeout_ms = 300000
params = {}

# Event log source
[source]
type = "file"                    # file, http, stream, inline
path = "events.xes"
format = "xes"                   # xes, json, jsonl, ocel
watch = false
checkpoint_dir = ".checkpoints"

# Output sink
[sink]
type = "file"                    # file, http, s3, custom
directory = "output"
format = "json"                  # json, pnml, bpmn, mermaid
formats = ["json", "pnml"]
overwrite = "skip"               # skip, overwrite, error

# ML analysis
[ml]
enabled = false                  # Enable ML post-discovery analysis
tasks = ["classify", "cluster"]  # Tasks to run
method = "knn"                   # ML method (knn, kmeans, etc.)
k = 5                            # Neighbors / clusters
target_key = "outcome"           # Classification target
forecast_periods = 5             # Forecast horizon
n_components = 2                 # PCA components
eps = 1.0                        # DBSCAN epsilon

# Observability
[observability]
level = "info"                   # debug, info, warn, error
format = "json"                  # human, json
otel_enabled = true

[observability.otel]
enabled = true
exporter = "otlp_http"
endpoint = "http://localhost:4318"
timeout_ms = 10000

[observability.redaction]
enabled = true
patterns = ["api_key", "password"]
```

## Field Reference

### discovery

| Field | Type | Required | Default | Values |
|-------|------|----------|---------|--------|
| algorithm | string | No | dfg | See [Algorithm Matrix](./algorithms.md) |
| profile | string | No | balanced | fast, balanced, quality, stream, ml, research |
| timeout_ms | number | No | 300000 | 1000-3600000 |

### source

| Field | Type | Required | Default |
|-------|------|----------|---------|
| type | string | Yes | — |
| path | string | No (inline) | — |
| format | string | Yes | — |
| watch | boolean | No | false |

### sink

| Field | Type | Required | Default |
|-------|------|----------|---------|
| type | string | Yes | — |
| directory | string | Yes | — |
| format | string | Yes | — |
| overwrite | string | No | skip |

### ml

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| enabled | boolean | No | false | Enable ML analysis |
| tasks | string[] | No | [] | classify, cluster, forecast, anomaly, regress, pca |
| method | string | No | — | knn, kmeans, linear_regression, etc. |
| k | number | No | — | Neighbors (classify) or clusters (cluster) |
| target_key | string | No | "outcome" | Classification target attribute |
| forecast_periods | number | No | 5 | Number of periods to forecast |
| n_components | number | No | 2 | PCA components |
| eps | number | No | 1.0 | DBSCAN epsilon for anomaly detection |

### observability

| Field | Type | Required | Default |
|-------|------|----------|---------|
| level | string | No | info |
| format | string | No | json |

## Validation Rules

- `algorithm`: Must be valid algorithm name (14 discovery + 6 ML)
- `profile`: Must be one of 6 profiles (fast, balanced, quality, stream, ml, research)
- `timeout_ms`: Must be >= 1000
- `ml.tasks`: Each task must be one of: classify, cluster, forecast, anomaly, regress, pca
- `source.path`: Must exist (if type=file)
- `source.format`: Must match file extension
- `sink.directory`: Must be writable

## Example Configs

### Minimal

```toml
[source]
type = "file"
path = "events.xes"

[sink]
type = "file"
directory = "output"
```

### Discovery + ML Analysis

```toml
[source]
type = "file"
path = "events.xes"
format = "xes"

[discovery]
algorithm = "heuristic"
profile = "balanced"

[ml]
enabled = true
tasks = ["classify", "cluster"]
method = "knn"
k = 5

[sink]
type = "file"
directory = "output"
```

### Complete

```toml
[discovery]
algorithm = "genetic"
profile = "quality"
timeout_ms = 600000

[source]
type = "stream"
path = "/data/events.jsonl"
format = "jsonl"
watch = true
checkpoint_dir = "/var/cache/wasm4pm"

[ml]
enabled = true
tasks = ["classify", "cluster", "forecast", "anomaly", "regress", "pca"]

[sink]
type = "file"
directory = "/output"
formats = ["json", "pnml", "html"]
overwrite = "overwrite"

[observability]
level = "debug"
format = "json"

[observability.otel]
enabled = true
endpoint = "http://jaeger:4318"
```

## See Also

- [Reference: Algorithm Parameters](./algorithm-parameters.md)
- [Reference: Prediction Config](./prediction-config.md)
- [How-To: Debug Config](../how-to/debug-config.md)
- [Explanation: Config Resolution](../explanation/config-resolution.md)
