# How-To: Configure OTEL Observability

## Goal
Configure OpenTelemetry (OTEL) for autonomic monitoring and adversarial probe detection.

## Prerequisites
- A running Jaeger or OTLP-compatible collector.

## Steps
1. Set the exporter endpoint in your environment:
   ```bash
   export WASM4PM_OTEL_ENDPOINT=http://localhost:4317
   ```
2. Enable full span propagation in `wasm4pm.toml`:
   ```toml
   [observability]
   enabled = true
   level = "trace"
   ```
3. Run your mining job. The telemetry will automatically include adversarial gate metrics.
