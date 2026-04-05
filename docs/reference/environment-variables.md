# Reference: Environment Variables

## Configuration

| Variable | Type | Default | Example |
|----------|------|---------|---------|
| WASM4PM_CONFIG_FILE | string | config.toml | /etc/wasm4pm/config.toml |
| WASM4PM_PROFILE | string | balanced | fast, quality |
| WASM4PM_LOG_LEVEL | string | info | debug, warn, error |
| WASM4PM_DEBUG | bool | false | true, false |

## Observability

| Variable | Type | Default |
|----------|------|---------|
| WASM4PM_OTEL_ENABLED | bool | false |
| WASM4PM_OTEL_ENDPOINT | string | http://localhost:4318 |
| WASM4PM_OTEL_EXPORTER | string | otlp_http |
| WASM4PM_OTEL_TIMEOUT_MS | number | 10000 |

## DataDog

| Variable | Type | Required |
|----------|------|----------|
| DD_API_KEY | string | Yes (for DataDog) |
| DD_APP_KEY | string | Yes (for DataDog) |
| DD_SITE | string | datadoghq.com |

## System

| Variable | Type | Default |
|----------|------|---------|
| WASM4PM_MAX_MEMORY_MB | number | 2048 |
| WASM4PM_CACHE_DIR | string | .cache |
| WASM4PM_TIMEOUT_MS | number | 300000 |

## Custom (Config Substitution)

Use in config.toml:

```toml
[source]
path = "${EVENT_LOG_PATH}"

[sink]
directory = "${OUTPUT_DIR}"

[observability.otel]
endpoint = "${OTEL_ENDPOINT}"
headers = {
  "DD-API-KEY" = "${DD_API_KEY}"
}
```

Then:

```bash
export EVENT_LOG_PATH="/mnt/data/events.xes"
export OUTPUT_DIR="/mnt/output"
export OTEL_ENDPOINT="https://api.datadoghq.com/v1/input"
export DD_API_KEY="sk-..."

pmctl run --config config.toml
```

## Precedence

1. Command-line flags (highest)
2. Environment variables
3. config.toml
4. Defaults (lowest)

## Setting Variables

### Bash

```bash
export WASM4PM_PROFILE=fast
pmctl run --config config.toml
```

### .env File

```bash
# .env
WASM4PM_PROFILE=fast
WASM4PM_DEBUG=true

# Load:
set -a
source .env
set +a
```

### Docker

```bash
docker run -e WASM4PM_PROFILE=fast \
  -e DD_API_KEY=sk-... \
  wasm4pm:26.4.5
```

### Kubernetes

```yaml
env:
- name: WASM4PM_PROFILE
  value: "fast"
- name: DD_API_KEY
  valueFrom:
    secretKeyRef:
      name: datadog-secrets
      key: api-key
```

## See Also

- [Reference: Config Schema](./config-schema.md)
- [How-To: Environment Variables](../how-to/environment-variables.md)
