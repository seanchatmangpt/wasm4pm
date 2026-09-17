<!-- wasm4pm-doc-status: active; reviewed: 2026-08-02; original: .claude/worktrees/wf_99470ccd-c7b-1/docs/how-to/configure_observability.md; source-sha256: abc5d7cfdfd6ccf54c8864053762fecbfec0cc958e774d78bbd37a7477f3150a; reason: tooling or agent control surface -->

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

## Example

`examples/observability-setup.ts` demonstrates a full OTEL setup: endpoint configuration, span verification, and OTLP export:

```bash
tsx examples/observability-setup.ts
```

For edge telemetry with Truex capture, see `examples/truex-capture-otlp.ts`.
