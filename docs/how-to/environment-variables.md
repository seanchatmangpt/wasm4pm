# How-To: Set Environment Variables

**Time required**: 5 minutes  
**Difficulty**: Beginner  

## Core Variables

```bash
export WASM4PM_CONFIG_FILE="config.toml"
export WASM4PM_PROFILE="balanced"
export WASM4PM_LOG_LEVEL="info"
export WASM4PM_DEBUG="false"
export WASM4PM_TIMEOUT_MS="300000"
```

## Observability

```bash
export WASM4PM_OTEL_ENABLED="true"
export WASM4PM_OTEL_ENDPOINT="http://localhost:4318"
export WASM4PM_OTEL_EXPORTER="otlp_http"
```

## Memory

```bash
export WASM4PM_MAX_MEMORY_MB="2048"
export WASM4PM_CACHE_DIR="/var/cache/wasm4pm"
```

## Configuration

```bash
# Use in config.toml with ${VAR}
export EVENT_LOG_PATH="/data/events.xes"
export OUTPUT_DIR="/output"
```

### config.toml

```toml
[source]
path = "${EVENT_LOG_PATH}"

[sink]
directory = "${OUTPUT_DIR}"
```

## Command Line

```bash
WASM4PM_PROFILE=fast pmctl run --config config.toml
```

## .env File

Create `.env`:

```
WASM4PM_LOG_LEVEL=info
WASM4PM_PROFILE=balanced
EVENT_LOG_PATH=/data/events.xes
OUTPUT_DIR=/output
```

Load:

```bash
set -a
source .env
set +a
pmctl run --config config.toml
```

## Precedence

1. Command-line flags (highest)
2. Environment variables
3. config.toml
4. Defaults (lowest)

## See Also

- [Reference: Environment Variables](../reference/environment-variables.md)
- [How-To: Version Control Config](./version-control.md)
