# How-To: Configure OTEL for DataDog

**Time required**: 10 minutes  
**Difficulty**: Intermediate  

## Get DataDog API Key

1. Log in to [app.datadoghq.com](https://app.datadoghq.com)
2. Navigate: Organization Settings → API Keys
3. Create new key or copy existing
4. Note your **site** (us5, eu, etc.)

## Configuration

Create `config.toml`:

```toml
[observability]
level = "info"
format = "json"

[observability.otel]
enabled = true
exporter = "otlp_http"
endpoint = "https://api.datadoghq.com/v1/input"
timeout_ms = 10000

[observability.otel.headers]
"DD-API-KEY" = "$DD_API_KEY"
"DD-APPLICATION-KEY" = "$DD_APP_KEY"
```

## Environment Variables

```bash
export DD_SITE="datadoghq.com"        # or eu.datadoghq.com
export DD_API_KEY="your-api-key"
export DD_APP_KEY="your-app-key"
export DD_SERVICE="wasm4pm"
export DD_ENV="production"

pmctl run --config config.toml
```

## Docker Compose

```yaml
version: '3.8'

services:
  wasm4pm:
    image: wasm4pm:26.4.5
    environment:
      - DD_API_KEY=${DD_API_KEY}
      - DD_APP_KEY=${DD_APP_KEY}
      - DD_SITE=${DD_SITE:=datadoghq.com}
      - WASM4PM_OTEL_ENABLED=true
      - WASM4PM_OTEL_ENDPOINT=https://api.datadoghq.com/v1/input
    volumes:
      - ./config.toml:/config.toml:ro
```

Start:

```bash
DD_API_KEY=xxx DD_APP_KEY=yyy docker-compose up
```

## Kubernetes

Create secret:

```bash
kubectl create secret generic datadog-api \
  --from-literal=api-key=$DD_API_KEY \
  --from-literal=app-key=$DD_APP_KEY
```

Use in deployment:

```yaml
env:
- name: DD_API_KEY
  valueFrom:
    secretKeyRef:
      name: datadog-api
      key: api-key
- name: DD_APP_KEY
  valueFrom:
    secretKeyRef:
      name: datadog-api
      key: app-key
```

## View Traces in DataDog

1. Open DataDog APM
2. Search for service: `wasm4pm`
3. View traces with filters:
   - Service: `wasm4pm`
   - Operation: `run`, `discover`, etc.

## Custom Tags

Add metadata:

```toml
[observability.otel.tags]
environment = "production"
version = "26.4.5"
team = "data-platform"
```

## Metrics Dashboard

Create metric: `wasm4pm.execution_time`

Graph:

```
wasm4pm.execution_time{service:wasm4pm}
```

## Alerts

Create alert in DataDog:

```
avg(last_5m):avg:wasm4pm.execution_time{service:wasm4pm} > 5000
```

## See Also

- [Tutorial: Observability Setup](../tutorials/observability-setup.md)
- [Explanation: Observability Design](../explanation/observability-design.md)
