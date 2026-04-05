# Tutorial: Setting Up Observability

**Time to complete**: 20 minutes  
**Level**: Intermediate  
**Audience**: DevOps engineers and operators  

## What You'll Learn

- Configure OpenTelemetry (OTEL) for wasm4pm
- Connect to Jaeger for trace visualization
- Set up DataDog integration
- Read trace trees and understand performance
- Configure log redaction for secrets

## Prerequisites

- Docker (for Jaeger)
- wasm4pm service running
- Basic understanding of observability

## Step 1: Start Jaeger Locally

```bash
docker run -d \
  --name jaeger \
  -p 16686:16686 \
  -p 4317:4317 \
  -p 4318:4318 \
  jaegertracing/all-in-one:latest

echo "Jaeger UI: http://localhost:16686"
```

## Step 2: Configure OTEL

Create `config-with-otel.toml`:

```toml
[discovery]
algorithm = "heuristic"
profile = "balanced"

[source]
type = "file"
path = "sample.xes"

[observability]
level = "info"
format = "json"

[observability.otel]
enabled = true
exporter = "otlp_http"
endpoint = "http://localhost:4318"
timeout_ms = 10000
batch_size = 100

[observability.redaction]
enabled = true
patterns = ["api_key", "password", "secret", "token"]
```

## Step 3: Run with Observability

```bash
pmctl run --config config-with-otel.toml --verbose
```

Output includes trace context:

```
[INFO] Initializing WASM engine...
[TRACE] trace_id=7a8f9c2d1e4b5a6f parent_id=0 span_id=1
[INFO] Loading event log from sample.xes
[TRACE] trace_id=7a8f9c2d1e4b5a6f parent_id=1 span_id=2
[PROGRESS] 0%
[TRACE] trace_id=7a8f9c2d1e4b5a6f parent_id=2 span_id=3 duration_ms=45
[PROGRESS] 100%
[SUCCESS] Discovery completed
[TRACE] Batch exported to http://localhost:4318 (12 spans)
```

## Step 4: Visualize in Jaeger

Open Jaeger UI: http://localhost:16686

1. Select service: `wasm4pm`
2. View traces from the last hour
3. Click on a trace to see details:
   - Timeline of operations
   - Span duration breakdown
   - Error information

Example trace:

```
wasm4pm [7.3s]
├── load_config [0.5ms]
├── load_eventlog [45.2ms]
│   ├── parse_xes [22.1ms]
│   ├── validate_schema [8.3ms]
│   └── build_trace_map [14.8ms]
├── algorithm [234.8ms]
│   ├── dfg_discovery [198.3ms]
│   └── output_generation [36.5ms]
└── write_sink [3.1ms]
```

## Step 5: DataDog Integration

For DataDog, update config:

```toml
[observability.otel]
enabled = true
exporter = "otlp_http"
endpoint = "https://api.datadoghq.com/v1/input"
headers = {
  "DD-API-KEY" = "$DD_API_KEY",
  "DD-APPLICATION-KEY" = "$DD_APP_KEY"
}
```

Set environment variables:

```bash
export DD_API_KEY="your-api-key"
export DD_APP_KEY="your-app-key"
export DD_SITE="datadoghq.com"  # or eu.datadoghq.com

pmctl run --config config-with-otel.toml
```

## Step 6: View JSON Logs

Enable JSON logging for log aggregation:

```toml
[observability]
level = "debug"
format = "json"
```

Output:

```json
{"timestamp":"2026-04-05T12:30:00Z","level":"INFO","message":"Loading event log","file":"main.rs:42","trace_id":"7a8f9c2d1e4b5a6f"}
{"timestamp":"2026-04-05T12:30:00Z","level":"DEBUG","message":"Parsed 1234 events","file":"xes.rs:128","trace_id":"7a8f9c2d1e4b5a6f","events_count":1234}
```

## Step 7: Configure Redaction

Protect sensitive data:

```toml
[observability.redaction]
enabled = true
redact_urls = true
redact_headers = true
redact_bodies = false
patterns = [
  "api.?key",
  "password",
  "secret",
  "token",
  "auth",
  "bearer"
]
```

Before redaction:
```
Authorization: Bearer sk-1234567890abcdef
```

After redaction:
```
Authorization: Bearer [REDACTED]
```

## Step 8: Enable Tracing by Algorithm

Add per-algorithm tracing:

```toml
[observability.algorithms]
dfg = true
heuristic = true
genetic = true
ilp = true
trace_level = "detailed"
```

## Step 9: Export Traces

Export traces for analysis:

```bash
# Export recent traces
curl -s http://localhost:16686/api/traces?service=wasm4pm&limit=100 | jq . > traces.json

# Query specific service
curl -s http://localhost:16686/api/traces?service=wasm4pm&tags='span.kind:internal' | jq '.data[].spans[]'
```

## Step 10: Set Performance Thresholds

Alert on slow operations:

```toml
[observability.alerts]
enabled = true

[[observability.alerts.rules]]
name = "slow_algorithm"
condition = "algorithm_duration > 5000"
action = "log_warning"

[[observability.alerts.rules]]
name = "high_memory"
condition = "wasm_memory_mb > 1000"
action = "log_error"
```

## Understanding the 3-Layer Observability Model

**Layer 1: CLI Output**
```bash
[INFO] Loading event log...
[PROGRESS] 45%
[SUCCESS] Completed in 234ms
```

**Layer 2: JSON Logs**
```json
{"level":"INFO","timestamp":"...","trace_id":"...","message":"..."}
```

**Layer 3: OTEL Telemetry**
```
Spans, metrics, traces sent to observability backend
```

Each layer is independent — failure in Layer 3 doesn't affect Layers 1-2.

## Performance Tracing Example

Identify bottlenecks:

```bash
# Run with detailed tracing
WASM4PM_TRACE_LEVEL=detailed pmctl run --config config.toml > traces.log 2>&1

# Analyze durations
grep "duration_ms" traces.log | sort -t= -k2 -rn | head -10
```

Output:

```
[TRACE] parse_xes duration_ms=2341
[TRACE] algorithm duration_ms=234
[TRACE] validate_schema duration_ms=85
```

Shows parsing took longest (2.3s).

## Troubleshooting

### OTEL Exporter Failing

```bash
# Check endpoint
curl -v http://localhost:4318

# Verify Jaeger running
docker ps | grep jaeger

# Check Jaeger is listening on 4318
netstat -an | grep 4318
```

### Secret Leakage

Verify redaction working:

```bash
# View logs with redaction
pmctl run --config config-with-otel.toml 2>&1 | grep -i "api_key\|password\|token"

# Should see [REDACTED] instead of actual values
```

### High Memory Usage

```toml
[observability.performance]
batch_size = 50          # Reduce batch size
flush_interval_ms = 5000 # Flush more frequently
```

## Best Practices

1. **Always enable redaction** in production
2. **Use structured JSON logs** for log aggregation
3. **Sample traces** for high-volume systems
4. **Monitor observability overhead** (should be <5%)
5. **Test alerting rules** before going live

## Next Steps

1. **Production deployment**: [How-To: Docker Deployment](../how-to/docker-deploy.md)
2. **DataDog setup**: [How-To: Configure OTEL for DataDog](../how-to/otel-datadog.md)
3. **Understanding design**: [Explanation: Observability Design](../explanation/observability-design.md)

---

## Related Documentation

- **[How-To: OTEL for DataDog](../how-to/otel-datadog.md)** — DataDog configuration
- **[Explanation: Observability Design](../explanation/observability-design.md)** — Deep dive
- **[Reference: Environment Variables](../reference/environment-variables.md)** — OTEL env vars
