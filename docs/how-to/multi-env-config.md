# How-To: Create Multi-Environment Configs

**Time required**: 15 minutes  
**Difficulty**: Intermediate  

## File Structure

```
config/
├── base.toml          # Shared settings
├── dev.toml           # Development overrides
├── staging.toml       # Staging overrides
└── prod.toml.example  # Production template
```

## Base Configuration

Create `config/base.toml`:

```toml
[discovery]
timeout_ms = 300000

[source]
format = "xes"

[sink]
format = "json"
overwrite = "skip"

[observability]
level = "info"
```

## Development

Create `config/dev.toml`:

```toml
include = "base.toml"

[discovery]
algorithm = "dfg"
profile = "fast"

[source]
path = "./data/sample-small.xes"

[sink]
directory = "./output/dev"

[observability]
level = "debug"

[observability.otel]
enabled = false
```

## Staging

Create `config/staging.toml`:

```toml
include = "base.toml"

[discovery]
algorithm = "heuristic"
profile = "balanced"

[source]
path = "/data/staging/events.xes"

[sink]
directory = "/output/staging"

[observability]
level = "info"

[observability.otel]
enabled = true
endpoint = "http://jaeger:4318"
```

## Production

Create `config/prod.toml.example`:

```toml
include = "base.toml"

[discovery]
algorithm = "genetic"
profile = "quality"

[source]
path = "${EVENT_LOG_PATH}"
watch = true

[sink]
directory = "${OUTPUT_DIR}"

[observability]
level = "warn"

[observability.otel]
enabled = true
endpoint = "${OTEL_ENDPOINT}"
headers = {
  "DD-API-KEY" = "${DD_API_KEY}"
}
```

## Usage

```bash
# Development
pmctl run --config config/dev.toml

# Staging
pmctl run --config config/staging.toml

# Production
pmctl run --config config/prod.toml
```

## Environment Detection

Create `run.sh`:

```bash
#!/bin/bash

ENV=${1:-dev}
CONFIG="config/$ENV.toml"

if [ ! -f "$CONFIG" ]; then
  echo "Config not found: $CONFIG"
  exit 1
fi

pmctl run --config "$CONFIG"
```

Usage:

```bash
./run.sh dev
./run.sh staging
./run.sh prod
```

## See Also

- [Tutorial: Custom Configs](../tutorials/custom-configs.md)
- [How-To: Version Control](./version-control.md)
