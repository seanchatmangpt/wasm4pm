# Reference: Configuration Schema

**Format**: TOML or JSON  
**Validation**: Zod schema  
**Version**: 26.4.5  

## Complete Schema (TOML)

```toml
# Discovery configuration
[discovery]
algorithm = "dfg"                # dfg, alpha, heuristic, inductive, genetic, ilp
profile = "balanced"             # fast, balanced, quality, stream
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
| profile | string | No | balanced | fast, balanced, quality, stream, research |
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

### observability

| Field | Type | Required | Default |
|-------|------|----------|---------|
| level | string | No | info |
| format | string | No | json |

## Validation Rules

- `algorithm`: Must be valid algorithm name
- `profile`: Must be one of 5 profiles
- `timeout_ms`: Must be >= 1000
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
- [How-To: Debug Config](../how-to/debug-config.md)
- [Explanation: Config Resolution](../explanation/config-resolution.md)
