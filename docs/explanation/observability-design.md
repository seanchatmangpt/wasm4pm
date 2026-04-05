# Explanation: The Observability Architecture

**Time to read**: 15 minutes  
**Level**: Advanced  

## 3-Layer Model

wasm4pm has three independent observability layers:

```
Layer 1: CLI Output (human-readable)
  [INFO] Loading config...
  [PROGRESS] 45%
  [SUCCESS] Done in 234ms
           ↓
Layer 2: JSON Logs (machine-parseable)
  {"timestamp":"...","level":"INFO","message":"..."}
           ↓
Layer 3: OTEL Telemetry (distributed tracing)
  Spans, metrics, logs sent to observability backend
```

Each layer is **completely independent**. Failure in Layer 3 doesn't affect Layers 1-2.

## Layer 1: CLI Output

Human-friendly, colored output:

```bash
$ pmctl run --config config.toml --verbose

[INFO] Loading configuration...
[DEBUG] Schema validation...
[PROGRESS] 0%
[PROGRESS] 50%
[PROGRESS] 100%
[SUCCESS] Completed in 234ms
[INFO] Results saved to output/
```

Controlled by:

```toml
[observability]
level = "info"     # debug|info|warn|error
format = "human"   # human|json
```

## Layer 2: JSON Logs

Machine-parseable structured logs:

```json
{
  "timestamp": "2026-04-05T12:30:00Z",
  "level": "INFO",
  "message": "Loading configuration",
  "file": "main.rs:42",
  "trace_id": "7a8f9c2d1e4b5a6f",
  "span_id": "abc123def456"
}
```

Enabled with:

```toml
[observability]
format = "json"
```

Usage:

```bash
pmctl run --config config.toml 2>&1 | jq 'select(.level == "ERROR")'
```

## Layer 3: OTEL Telemetry

Distributed tracing for observability platforms (Jaeger, DataDog, etc.):

```toml
[observability.otel]
enabled = true
exporter = "otlp_http"
endpoint = "http://localhost:4318"
```

Produces spans:

```
load_config [0.5ms]
├── parse_toml [0.2ms]
├── validate_schema [0.3ms]
load_eventlog [45.2ms]
├── parse_xes [22.1ms]
├── validate_events [8.3ms]
├── build_indices [14.8ms]
algorithm [234.8ms]
write_sink [3.1ms]
```

## Non-Blocking Guarantee

**Critical**: Observability must never break execution.

If OTEL exporter fails:

```
✓ Execution completes successfully
✓ CLI output still shown
✓ JSON logs still written
✗ OTEL spans not sent (but failure is logged)
```

Implementation:

```rust
// OTEL export happens asynchronously
async_spawn(|| {
  match export_to_otel() {
    Ok(_) => {},
    Err(e) => {
      log_error("OTEL export failed: {}", e);
      // But don't interrupt execution
    }
  }
});
```

## Secret Redaction

Sensitive data is automatically redacted:

```toml
[observability.redaction]
enabled = true
patterns = ["api_key", "password", "secret", "token"]
```

Before:
```
Authorization: Bearer sk-1234567890abcdef
DD-API-KEY: sk-secret123
```

After:
```
Authorization: Bearer [REDACTED]
DD-API-KEY: [REDACTED]
```

## Trace Context Propagation

Using W3C trace context standard:

```
Parent Service → wasm4pm → Child Service
     ↓
  trace_id: 7a8f9c2d1e4b5a6f (passes through)
  parent_id: abc123 (current span)
  span_id: xyz789 (new span)
```

Enables end-to-end tracing across services.

## Performance Impact

Observability overhead is minimal:

| Layer | Overhead |
|-------|----------|
| Layer 1 (CLI) | <1% |
| Layer 2 (JSON logs) | 1-2% |
| Layer 3 (OTEL) | 1-2% (if enabled) |
| **Total** | **<5%** |

Trade-off: More detail = slightly slower execution.

## Configuration

Full observability config:

```toml
[observability]
level = "info"      # debug|info|warn|error
format = "json"     # human|json
otel_enabled = true

[observability.otel]
exporter = "otlp_http"
endpoint = "http://localhost:4318"
timeout_ms = 10000
batch_size = 100
flush_interval_ms = 5000

[observability.redaction]
enabled = true
redact_urls = true
redact_headers = true
patterns = ["api_key", "password", "token"]

[observability.alerts]
enabled = true

[[observability.alerts.rules]]
name = "algorithm_timeout"
condition = "execution_time > timeout"
action = "webhook"
webhook_url = "http://alerts.company.com/alert"
```

## Sampling

For high-volume systems, sample traces:

```toml
[observability.otel]
sampling_rate = 0.1  # Sample 10% of traces
```

## See Also

- [Tutorial: Observability Setup](../tutorials/observability-setup.md)
- [How-To: OTEL for DataDog](../how-to/otel-datadog.md)
- [Reference: Environment Variables](../reference/environment-variables.md)
