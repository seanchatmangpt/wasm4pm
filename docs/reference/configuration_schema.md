<!-- wasm4pm-doc-status: active; reviewed: 2026-08-02; original: .claude/worktrees/wf_99470ccd-c7b-1/docs/reference/configuration_schema.md; source-sha256: d0fdea2a769f14524887c807880cc7b089867fea3b044678956e782e42dabb71; reason: tooling or agent control surface -->

# Reference: Configuration Schema

The `wasm4pm.toml` file (or `wasm4pm.json`) controls the global behavior of the engine.

## Core Blocks

### `[source]`
*   `kind` (string): `file`, `stream`, or `http`.
*   `path` (string): Local path for file sources.
*   `url` (string): URL for HTTP sources.

### `[algorithm]`
*   `name` (string): The ID of the algorithm to run (e.g., `heuristic_miner`, `dfg`).
*   `parameters` (object): Key-value pairs of algorithm-specific settings.

### `[execution]`
*   `profile` (string): Constraints profile (`fast`, `balanced`, `quality`, `stream`).
*   `timeout` (int): Execution timeout in seconds (must be > 0).

### `[observability]`
*   `logLevel` (string): `error`, `warn`, `info`, `debug`, `trace`.
*   `metricsEnabled` (bool): Enable throughput and performance metrics.
*   `otel` (object): OpenTelemetry configuration.
    *   `enabled` (bool): Enable OTEL tracing.
    *   `endpoint` (string): OTLP collector endpoint.

### `[prediction]`
*   `enabled` (bool): Enable predictive features.
*   `activityKey` (string): Attribute to use as activity identity.
*   `ngramOrder` (int): Context window for next-activity prediction (min: 2).
*   `driftWindowSize` (int): Number of traces per window for drift detection.

### `[output]`
*   `format` (string): `human` or `json`.
*   `destination` (string): `stdout` or `file`.
*   `colorize` (bool): Enable ANSI colors.
